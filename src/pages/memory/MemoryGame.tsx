import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CindersGlyph } from "../../components/CindersGlyph";
import { getActiveSaveSlot } from "../../lib/saveSlots";
import { recordMinigameClear } from "../../lib/achievements";
import {
  filterArcadeTasks,
  loadRunnerSettings,
  saveRunnerSettings,
  stimVibeMode,
  type RunnerSettings,
} from "../../lib/runnerSettings";
import {
  buildMemoryDeck,
  memoryGridFor,
  type MemoryCard,
  type MemoryPairAsset,
} from "../../lib/memoryDeck";
import {
  MEMORY_PEEK_MS,
  MEMORY_REWARD_PREVIEW_MS,
  calcMemoryReward,
  getMemoryDifficulty,
  matchRewardFor,
  streakMult,
  type MemoryDifficultyId,
  type MemoryRewardResult,
} from "../../lib/memoryReward";
import { loadPuzzleTasks, pickRandomTask, type PuzzleTask } from "../../lib/puzzleTasks";
import { PuzzleTaskRunner } from "../puzzle/PuzzleTaskRunner";
import {
  loadMemoryAssets,
  revokeMemoryAssets,
  type MemorySource,
} from "./memoryAssets";
import { MemoryBoard } from "./MemoryBoard";
import { MemorySourcePicker } from "./MemorySourcePicker";
import { MemoryTrophy, type TrophyReward } from "./MemoryTrophy";

/**
 * Memory pairs (Пары на память): flip two cards a turn, match pictures from
 * the favorites pool. Consecutive matches grow a streak multiplier; misses
 * cost cinders and break the streak; cursed pairs 🔥 run a shared-library
 * task on match; a peek reveals the board for a cinders cost.
 */

interface Props {
  onReward: (cinders: number) => void;
  onExit: () => void;
}

type Phase = "setup" | "loading" | "play" | "result";

/** Time the pair stays visible before a match locks in / a mismatch flips back. */
const MATCH_LOCK_MS = 550;
const MISS_FLIPBACK_MS = 900;
/** Pause between the last cursed task resolving and the result screen. */
const FINISH_DELAY_MS = 700;

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.max(0, sec) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MemoryGame({ onReward, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [difficultyId, setDifficultyId] = useState<MemoryDifficultyId>("medium");
  const [feel, setFeel] = useState(loadRunnerSettings);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timerOn, setTimerOn] = useState(false);
  const difficulty = useMemo(
    () => getMemoryDifficulty(difficultyId),
    [difficultyId],
  );

  const [assets, setAssets] = useState<MemoryPairAsset[]>([]);
  const [deck, setDeck] = useState<MemoryCard[]>([]);
  const [flipped, setFlipped] = useState<string[]>([]);
  const [missKeys, setMissKeys] = useState<string[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [peekActive, setPeekActive] = useState(false);

  const [streak, setStreak] = useState(0);
  const [matchScore, setMatchScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [peeks, setPeeks] = useState(0);
  const [taskOverlay, setTaskOverlay] = useState<PuzzleTask | null>(null);
  const [reward, setReward] = useState<TrophyReward | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [loadProgress, setLoadProgress] = useState("");
  const [result, setResult] = useState<MemoryRewardResult | null>(null);

  const claimedRef = useRef(false);
  const assetsRef = useRef<MemoryPairAsset[]>([]);
  const startMsRef = useRef<number | null>(null);
  const matchScoreRef = useRef(0);
  const peeksRef = useRef(0);
  const rewardRef = useRef(0); // Σ cursed task rewardBonus
  const penaltyRef = useRef(0); // Σ cursed task failPenalty
  const missRef = useRef(0);
  const deckByIdRef = useRef(new Map<string, MemoryPairAsset>());
  const timersRef = useRef<number[]>([]);

  const tasks = useMemo(
    () => filterArcadeTasks(loadPuzzleTasks(), feel),
    [feel],
  );
  const pairsTotal = assets.length;

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  // timer tick while playing (starts on the first flip or peek)
  useEffect(() => {
    if (phase !== "play" || !timerOn || startMsRef.current == null) return;
    const id = window.setInterval(() => {
      if (startMsRef.current != null)
        setElapsed(Math.floor((Date.now() - startMsRef.current) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [phase, timerOn]);

  // teardown: object URLs + pending timers
  useEffect(
    () => () => {
      clearTimers();
      revokeMemoryAssets(assetsRef.current);
    },
    [clearTimers],
  );

  const startRound = useCallback(
    (source: MemorySource) => {
      clearTimers();
      revokeMemoryAssets(assetsRef.current);
      assetsRef.current = [];
      setAssets([]);
      setResult(null);
      setFlipped([]);
      setMissKeys([]);
      setMatchedPairs([]);
      setStreak(0);
      setMatchScore(0);
      setMisses(0);
      setPeeks(0);
      setTaskOverlay(null);
      setReward(null);
      setBusy(false);
      setPeekActive(false);
      setLoadError(null);
      setTimerOn(false);
      startMsRef.current = null;
      missRef.current = 0;
      matchScoreRef.current = 0;
      peeksRef.current = 0;
      rewardRef.current = 0;
      penaltyRef.current = 0;
      setElapsed(0);
      setPhase("loading");
      setLoadProgress("Готовлю колоду…");
      void loadMemoryAssets(source, difficulty.pairs, (loaded, target) => {
        setLoadProgress(`Открываю картинки ${loaded}/${target}…`);
      }).then(({ assets: loaded, skipped }) => {
        if (loaded.length < 2) {
          const asked =
            source.kind === "files" ? source.files.length : source.ids.length;
          setLoadError(
            skipped > 0
              ? `Не открыл ${asked - loaded.length} из ${asked}. Нужно хотя бы две картинки.`
              : "Нужно хотя бы две картинки.",
          );
          setLoadProgress("");
          setPhase("setup");
          return;
        }
        assetsRef.current = loaded;
        setAssets(loaded);
        deckByIdRef.current = new Map(loaded.map((a) => [a.id, a]));
        setDeck(buildMemoryDeck(loaded, difficulty.cursedPairs));
        claimedRef.current = false;
        setPhase("play");
      });
    },
    [clearTimers, difficulty],
  );

  /** Reshuffle the same assets into a fresh round. */
  const restart = useCallback(() => {
    clearTimers();
    setResult(null);
    setFlipped([]);
    setMissKeys([]);
    setMatchedPairs([]);
    setStreak(0);
    setMatchScore(0);
    setMisses(0);
    missRef.current = 0;
    matchScoreRef.current = 0;
    setPeeks(0);
    peeksRef.current = 0;
    setTaskOverlay(null);
    setReward(null);
    setBusy(false);
    setPeekActive(false);
    startMsRef.current = null;
    rewardRef.current = 0;
    penaltyRef.current = 0;
    setElapsed(0);
    setTimerOn(false);
    setDeck(buildMemoryDeck(assetsRef.current, difficulty.cursedPairs));
    claimedRef.current = false;
    setPhase("play");
  }, [clearTimers, difficulty]);

  // Reads refs (not state) so a delayed call never settles with stale numbers.
  const finish = useCallback(() => {
    const elapsedSec = startMsRef.current
      ? Math.floor((Date.now() - startMsRef.current) / 1000)
      : 0;
    setResult(
      calcMemoryReward({
        difficulty,
        elapsedSec,
        matchScore: matchScoreRef.current,
        mismatches: missRef.current,
        peeks: peeksRef.current,
        taskReward: rewardRef.current,
        taskPenalty: penaltyRef.current,
      }),
    );
    recordMinigameClear("memory");
    claimedRef.current = false;
    setPhase("result");
  }, [difficulty]);

  const maybeFinish = useCallback(
    (matchedAfter: number) => {
      if (matchedAfter >= pairsTotal) later(finish, FINISH_DELAY_MS);
    },
    [pairsTotal, finish, later],
  );

  const onFlip = useCallback(
    (card: MemoryCard) => {
      if (busy || peekActive || taskOverlay) return;
      if (startMsRef.current == null) {
        startMsRef.current = Date.now();
        setTimerOn(true);
      }
      if (flipped.length === 0) {
        setFlipped([card.key]);
        return;
      }
      if (flipped.length >= 2) return;
      const first = deck.find((c) => c.key === flipped[0]);
      if (!first) {
        setFlipped([card.key]);
        return;
      }
      setFlipped([first.key, card.key]);
      setBusy(true);

      if (first.pairId === card.pairId) {
        later(() => {
          const nextStreak = streak + 1;
          const gained = matchRewardFor(difficulty, nextStreak);
          matchScoreRef.current += gained;
          setMatchScore(matchScoreRef.current);
          setStreak(nextStreak);
          setMatchedPairs((prev) => [...prev, card.pairId]);
          setFlipped([]);
          setBusy(false);
          // reward rail: show the matched picture for a while, then settle
          setReward({ pairId: card.pairId, gained, mult: streakMult(nextStreak) });
          later(
            () => setReward((r) => (r?.pairId === card.pairId ? null : r)),
            MEMORY_REWARD_PREVIEW_MS,
          );
          if (card.cursed) {
            const task = pickRandomTask(tasks);
            if (task) later(() => setTaskOverlay(task), 250);
            else maybeFinish(matchedPairs.length + 1);
          } else {
            maybeFinish(matchedPairs.length + 1);
          }
        }, MATCH_LOCK_MS);
      } else {
        setMissKeys([first.key, card.key]);
        setStreak(0);
        later(() => {
          setFlipped([]);
          setMissKeys([]);
          setBusy(false);
          missRef.current += 1;
          setMisses(missRef.current);
        }, MISS_FLIPBACK_MS);
      }
    },
    [
      busy,
      peekActive,
      taskOverlay,
      flipped,
      deck,
      streak,
      difficulty,
      tasks,
      matchedPairs.length,
      maybeFinish,
      later,
    ],
  );

  const onCursedResolved = useCallback(
    (success: boolean) => {
      const task = taskOverlay;
      setTaskOverlay(null);
      if (!task) return;
      if (success) rewardRef.current += task.rewardBonus;
      else penaltyRef.current += task.failPenalty;
      // the board may already be complete — the task was the last obstacle
      if (matchedPairs.length >= pairsTotal) later(finish, FINISH_DELAY_MS);
    },
    [taskOverlay, matchedPairs.length, pairsTotal, finish, later],
  );

  const peek = useCallback(() => {
    if (busy || taskOverlay || flipped.length > 0 || peekActive) return;
    if (startMsRef.current == null) {
      startMsRef.current = Date.now();
      setTimerOn(true);
    }
    peeksRef.current += 1;
    setPeeks(peeksRef.current);
    setPeekActive(true);
    later(() => setPeekActive(false), MEMORY_PEEK_MS);
  }, [busy, taskOverlay, flipped.length, peekActive, later]);

  // ----- render phases -----
  if (phase === "setup") {
    return (
      <MemorySourcePicker
        difficultyId={difficultyId}
        onDifficulty={setDifficultyId}
        onStart={startRound}
        onBack={onExit}
        feel={feel}
        onFeel={(next: RunnerSettings) => {
          setFeel(next);
          saveRunnerSettings(next);
        }}
        loadError={loadError}
      />
    );
  }

  if (phase === "loading") {
    return (
      <div className="memory-loading">
        <div className="memory-loading__card">
          <span className="memory-loading__ember" aria-hidden>🎴</span>
          <p>{loadProgress || "Перемешиваю колоду…"}</p>
        </div>
      </div>
    );
  }

  if (phase === "result" && result) {
    const rows: Array<[string, string, string]> = [
      ["База", `+${result.base}`, ""],
      ["Пары (с сериями)", `+${result.matchScore}`, "memory-result__plus"],
      ["Бонус за скорость", result.speedBonus > 0 ? `+${result.speedBonus}` : "—", result.speedBonus > 0 ? "memory-result__plus" : ""],
      ["Без единого промаха", result.perfectBonus > 0 ? `+${result.perfectBonus}` : "—", result.perfectBonus > 0 ? "memory-result__plus" : ""],
      ["Задания проклятых пар", result.taskReward > 0 ? `+${result.taskReward}` : "—", result.taskReward > 0 ? "memory-result__plus" : ""],
      ["Промахи", result.missPenalty > 0 ? `−${result.missPenalty}` : "—", result.missPenalty > 0 ? "memory-result__minus" : ""],
      ["Подглядывания", result.peekPenalty > 0 ? `−${result.peekPenalty}` : "—", result.peekPenalty > 0 ? "memory-result__minus" : ""],
      ["Штрафы заданий", result.taskPenalty > 0 ? `−${result.taskPenalty}` : "—", result.taskPenalty > 0 ? "memory-result__minus" : ""],
    ];
    return (
      <div className="memory-result" role="dialog">
        <div className="memory-result__card">
          <div className="memory-result__headline">
            <CindersGlyph className="memory-result__glyph" />
            <h2>Все пары найдены!</h2>
          </div>
          <p className="muted">
            {fmtTime(elapsed)} · {difficulty.labelRu} · {pairsTotal} пар · промахов {misses}
          </p>
          <ul className="memory-result__breakdown">
            {rows.map(([label, value, cls]) => (
              <li key={label}>
                <span>{label}</span>
                <span className={cls}>{value}</span>
              </li>
            ))}
            <li className="memory-result__total">
              <span>Итого</span>
              <span className="memory-result__total-num">
                <CindersGlyph className="memory-result__total-glyph" />
                {result.total}
              </span>
            </li>
          </ul>
          <div className="memory-result__actions">
            <button
              type="button"
              className="puzzle-config__start"
              onClick={() => {
                if (!claimedRef.current) {
                  claimedRef.current = true;
                  onReward(result.total);
                }
                onExit();
              }}
            >
              <CindersGlyph className="memory-result__btn-glyph" />
              Забрать {result.total}
            </button>
            <button
              type="button"
              className="puzzle-btn"
              onClick={() => {
                if (!claimedRef.current) {
                  claimedRef.current = true;
                  onReward(result.total);
                }
                restart();
              }}
            >
              Ещё раз
            </button>
            <button
              type="button"
              className="puzzle-btn"
              onClick={() => {
                if (!claimedRef.current) {
                  claimedRef.current = true;
                  onReward(result.total);
                }
                setPhase("setup");
              }}
            >
              Другие картинки
            </button>
          </div>
        </div>
      </div>
    );
  }

  // phase === "play"
  const grid = memoryGridFor(deck.length);
  const earned =
    matchScore + rewardRef.current - misses * difficulty.missPenalty - peeks * difficulty.peekPenalty;
  return (
    <div className="memory-play">
      <div className="memory-hud">
        <button
          type="button"
          className="puzzle-hud__btn puzzle-hud__btn--back"
          onClick={onExit}
          title="Выйти из игры"
        >
          ←
        </button>
        <div className="memory-hud__title">
          <span>Пары на память</span>
          <span className="puzzle-hud__crumb">
            {difficulty.labelRu} · {matchedPairs.length}/{pairsTotal} пар
          </span>
        </div>
        <div
          className={`memory-hud__streak ${streak >= 2 ? "is-hot" : ""}`}
          title="Серия подряд найденных пар"
        >
          🔥 ×{streakMult(streak).toFixed(2).replace(/\.?0+$/, "")}
        </div>
        <div className="puzzle-hud__timer" aria-live="polite">
          {fmtTime(elapsed)}
        </div>
        <div className="memory-hud__earned" title="Текущие Угольки (без базы и бонусов)">
          <CindersGlyph className="memory-hud__earned-glyph" />
          {earned >= 0 ? `+${earned}` : earned}
        </div>
        <div className="puzzle-hud__actions">
          <button
            type="button"
            className="puzzle-hud__btn"
            disabled={busy || peekActive || flipped.length > 0}
            onClick={peek}
            title={`Показать все карты на ${MEMORY_PEEK_MS / 1000} с — стоит ${difficulty.peekPenalty} Угольков`}
          >
            Подглядеть −{difficulty.peekPenalty}
          </button>
        </div>
      </div>

      <div className="memory-main">
        <div className="memory-stage">
          <MemoryBoard
            cards={deck}
            assetsById={deckByIdRef.current}
            cols={grid.cols}
            rows={grid.rows}
            flippedKeys={new Set(flipped)}
            matchedPairs={new Set(matchedPairs)}
            missKeys={new Set(missKeys)}
            peekActive={peekActive}
            locked={busy || peekActive || taskOverlay !== null}
            onFlip={onFlip}
          />
        </div>
        <MemoryTrophy
          reward={reward}
          matchedIds={matchedPairs}
          assetsById={deckByIdRef.current}
          pairsTotal={pairsTotal}
        />
      </div>

      {taskOverlay ? (
        <PuzzleTaskRunner
          mode="task"
          task={taskOverlay}
          vibeMode={stimVibeMode(feel)}
          allowCancel={getActiveSaveSlot() === "sandbox"}
          onComplete={onCursedResolved}
        />
      ) : null}
    </div>
  );
}
