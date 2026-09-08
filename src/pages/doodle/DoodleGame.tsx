import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  calcDoodleReward,
  DOODLE_DIFFICULTIES,
  fallPunishSec,
  getDoodleDifficulty,
  loadDoodleBest,
  saveDoodleBestIfBetter,
  type DoodleDifficultyId,
  type DoodleRewardResult,
} from "../../lib/doodleReward";
import {
  loadPuzzleTasks,
  PUZZLE_TASK_KIND_LABELS,
  puzzleTaskSpec,
  type PuzzleTask,
} from "../../lib/puzzleTasks";
import {
  getFavoriteRecord,
  listFavoriteMetadata,
  type FavoriteMetadata,
} from "../../lib/mediaFavorites";
import { setDeviceVibeLevel, stopDevice } from "../../lib/device/deviceClient";
import { PuzzleTaskRunner } from "../puzzle/PuzzleTaskRunner";
import { CindersGlyph } from "../../components/CindersGlyph";
import { MinigameStimToggles } from "../../components/MinigameStimToggles";
import { MinigameMistressFace } from "../../components/MinigameMistressFace";
import { recordMinigameClear } from "../../lib/achievements";
import { DoodleTrack, DOODLE_SPRING_MULT, type DoodleOutcome } from "./DoodleTrack";
import { getActiveSaveSlot } from "../../lib/saveSlots";
import {
  filterArcadeTasks,
  loadRunnerSettings,
  saveRunnerSettings,
  stimVibeMode,
} from "../../lib/runnerSettings";

/**
 * Minigames → Doodle jump: shell around the DoodleTrack canvas.
 *
 * Phases: intro (rules + difficulty) → play (canvas + task/pause overlays +
 * milestone trophies) → result (reward breakdown, puzzle-style claim flow).
 *
 * Heat economy: hearth platforms bank the climbed meters at the current heat
 * multiplier; falling with hot heat burns 75% of it and fires a device
 * stimulus pulse (fallPunishSec). Task platforms show a briefing first — the
 * timer only starts on "Начать задание" — and after resolving the world stays
 * frozen for a short result pause. Failed task = cinder penalty + fog
 * (in-canvas) + a short stimulus pulse. Milestone trophies: every crossed
 * 100 m flashes a favorite image as a reward.
 */

interface Props {
  onReward: (cinders: number) => void;
  onExit: () => void;
}

type Phase = "intro" | "play" | "result";

interface TrophyImg {
  url: string;
  label: string;
  meters: number;
}

const TROPHY_POOL_SIZE = 6;
const TROPHY_SHOW_SEC = 4000;
/** Device stimulus pulse length for a failed task platform. */
const PUNISH_VIBE_SEC = 6;
/** Pause with the task result before the world un-freezes. */
const TASK_AFTER_MS = 1400;

type TaskGateStage =
  | "brief" // read the task, timer not started yet
  | "run" // PuzzleTaskRunner is live
  | "after"; // outcome flash, world still frozen

const DIFF_ICONS: Record<DoodleDifficultyId, string> = {
  warmup: "🪶",
  climb: "🌙",
  storm: "🌩️",
};

const DIFF_NOTES: Record<DoodleDifficultyId, string> = {
  warmup: "Плотные платформы, редкие сюрпризы — спокойно набить руку.",
  climb: "Разгон: платформы реже, хрупких и живых больше.",
  storm: "Смертельный набор высоты — жадность или падение.",
};

const DEATH_TEXT: Record<"fall" | "frost", string> = {
  fall: "Уголёк остыл и упал в темноту.",
  frost: "Холодный сгусток погасил уголёка.",
};

/** Only still images can be trophies; drop videos/gifs. */
function isImageMeta(m: FavoriteMetadata): boolean {
  if (m.kind) return m.kind === "image";
  if (m.mime) return m.mime.startsWith("image/");
  return true;
}

export function DoodleGame({ onReward, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [diffId, setDiffId] = useState<DoodleDifficultyId>("climb");
  const [feel, setFeel] = useState(loadRunnerSettings);
  const [runSeq, setRunSeq] = useState(0);
  const [outcome, setOutcome] = useState<DoodleOutcome | null>(null);
  const [result, setResult] = useState<DoodleRewardResult | null>(null);
  const [taskGate, setTaskGate] = useState<{
    task: PuzzleTask;
    resolve: (ok: boolean) => void;
    seq: number;
    stage: TaskGateStage;
    success?: boolean;
  } | null>(null);
  const [paused, setPaused] = useState(false);
  const [best, setBest] = useState(() => loadDoodleBest());

  /** Preloaded favorite images for task pics + milestone trophies. */
  const claimedRef = useRef(false);
  const trophyPoolRef = useRef<TrophyImg[]>([]);
  /** Bumped on every preload start so a stale in-flight load self-cancels. */
  const trophyGenRef = useRef(0);
  const [trophy, setTrophy] = useState<TrophyImg | null>(null);
  /** Bumped when the pool finishes loading (intro hint + fallbacks). */
  const [trophyCount, setTrophyCount] = useState(-1);
  /** Sequential id per task overlay, drives the "inspiration" pick. */
  const taskSeqRef = useRef(0);
  const punishTimerRef = useRef<number | null>(null);
  const taskAfterRef = useRef<number | null>(null);
  /** Stimulus seconds owed for falling with hot heat (result screen note). */
  const [fallSec, setFallSec] = useState(0);

  const difficulty = useMemo(() => getDoodleDifficulty(diffId), [diffId]);
  // Task platforms use the shared task library; puzzle-only kinds make no
  // sense mid-jump.
  const tasks = useMemo(
    () => filterArcadeTasks(loadPuzzleTasks(), feel),
    [feel],
  );

  const taskGateRef = useRef(taskGate);
  taskGateRef.current = taskGate;

  // revoke trophy object URLs + stop any pending punishment pulse
  useEffect(() => {
    const pool = trophyPoolRef.current;
    return () => {
      for (const t of pool) URL.revokeObjectURL(t.url);
      if (taskAfterRef.current != null) window.clearTimeout(taskAfterRef.current);
      if (punishTimerRef.current != null) {
        window.clearTimeout(punishTimerRef.current);
        // never leave the device running after unmount
        void stopDevice();
      }
    };
  }, []);

  /** Load a fresh random trophy pool for the next run (fire and forget). */
  const preloadTrophies = useCallback(async () => {
    const gen = ++trophyGenRef.current;
    for (const t of trophyPoolRef.current) URL.revokeObjectURL(t.url);
    trophyPoolRef.current = [];
    setTrophy(null);
    try {
      const meta = (await listFavoriteMetadata()).filter(isImageMeta);
      for (let i = meta.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [meta[i], meta[j]] = [meta[j], meta[i]];
      }
      for (const m of meta.slice(0, TROPHY_POOL_SIZE)) {
        if (gen !== trophyGenRef.current) return;
        const rec = await getFavoriteRecord(m.id);
        if (!rec) continue;
        const url = URL.createObjectURL(rec.blob);
        // decode now so overlays never wait on the image
        await new Promise<void>((res) => {
          const im = new Image();
          im.onload = () => res();
          im.onerror = () => res();
          im.src = url;
        });
        if (gen !== trophyGenRef.current) {
          URL.revokeObjectURL(url);
          return;
        }
        trophyPoolRef.current.push({ url, label: rec.fileName || "Избранное", meters: 0 });
      }
    } catch {
      // no favorites db / empty library — trophies just stay disabled
    }
    if (gen === trophyGenRef.current) setTrophyCount(trophyPoolRef.current.length);
  }, []);

  const startRun = useCallback(() => {
    if (taskAfterRef.current != null) {
      window.clearTimeout(taskAfterRef.current);
      taskAfterRef.current = null;
    }
    setOutcome(null);
    setResult(null);
    setTaskGate(null);
    setPaused(false);
    setTrophy(null);
    setFallSec(0);
    setRunSeq((s) => s + 1);
    setPhase("play");
    void preloadTrophies();
  }, [preloadTrophies]);

  const handleTaskGate = useCallback(
    (task: PuzzleTask) =>
      new Promise<boolean>((resolve) => {
        setTaskGate({ task, resolve, seq: ++taskSeqRef.current, stage: "brief" });
      }),
    [],
  );

  /** Timer starts only here — the player confirmed they read the briefing. */
  const beginTaskGate = useCallback(() => {
    setTaskGate((g) => (g ? { ...g, stage: "run" } : g));
  }, []);

  /** Device punishment pulse (if one is connected): level 0..5 for `sec`. */
  const punishPulse = useCallback((level: number, sec: number) => {
    if (!feel.lovenseVibe) return;
    if (level <= 0 || sec <= 0) return;
    if (punishTimerRef.current != null) window.clearTimeout(punishTimerRef.current);
    void setDeviceVibeLevel(level);
    punishTimerRef.current = window.setTimeout(() => {
      punishTimerRef.current = null;
      void stopDevice();
    }, sec * 1000);
  }, [feel.lovenseVibe]);

  const finishTaskGate = useCallback(
    (success: boolean) => {
      const cur = taskGateRef.current;
      if (!cur) return;
      if (!success) punishPulse(difficulty.punishVibe, PUNISH_VIBE_SEC);
      setTaskGate({ ...cur, stage: "after", success });
      // short result pause before the world un-freezes
      taskAfterRef.current = window.setTimeout(() => {
        taskAfterRef.current = null;
        cur.resolve(success);
        setTaskGate(null);
      }, TASK_AFTER_MS);
    },
    [difficulty, punishPulse],
  );

  /** Every crossed 100 m mark flashes a favorite image as a reward. */
  const handleMilestone = useCallback((meters: number) => {
    const pool = trophyPoolRef.current;
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setTrophy({ ...pick, meters });
  }, []);

  // auto-hide the milestone trophy
  useEffect(() => {
    if (!trophy) return;
    const id = window.setTimeout(() => setTrophy(null), TROPHY_SHOW_SEC);
    return () => window.clearTimeout(id);
  }, [trophy]);

  /** Random favorite image shown beside the task overlay. Derived from the
   *  preloaded pool; trophyCount is a dep so the pick appears even when the
   *  pool finishes loading after the overlay opened. */
  const taskPic = useMemo(() => {
    if (!taskGate) return null;
    const pool = trophyPoolRef.current;
    if (pool.length === 0) return null;
    return pool[taskGate.seq % pool.length];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskGate, trophyCount]);

  const handleOutcome = useCallback(
    (o: DoodleOutcome) => {
      const res = calcDoodleReward({
        difficulty,
        bankedMeters: o.bankedMeters,
        burnedMeters: o.burnedMeters,
        taskReward: o.taskReward,
        stompReward: o.stompReward,
        taskPenalty: o.taskPenalty,
      });
      // falling with hot heat = stimulus punishment that scales with heat
      const fsec = fallPunishSec(o.heat);
      if (fsec > 0) punishPulse(difficulty.punishVibe, fsec);
      setOutcome(o);
      setResult(res);
      setFallSec(fsec);
      setBest(saveDoodleBestIfBetter(diffId, { height: o.heightM, total: res.total }));
      recordMinigameClear("doodle");
      claimedRef.current = false;
      setPhase("result");
    },
    [difficulty, diffId, punishPulse],
  );

  // Escape toggles the pause menu (unless a task platform is up).
  useEffect(() => {
    if (phase !== "play") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (taskGateRef.current) return;
      setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  // ----- intro -----
  if (phase === "intro") {
    const curBest = best[diffId];
    return (
      <div className="doodle-intro">
        <div className="doodle-intro__card">
          <button
            type="button"
            className="puzzle-hud__btn puzzle-hud__btn--back doodle-intro__back"
            onClick={onExit}
            title="Назад к мини-играм"
          >
            ←
          </button>

          <header className="doodle-intro__hero">
            <div className="doodle-intro__hero-icon" aria-hidden>🦘</div>
            <div>
              <div className="doodle-intro__title-row">
                <MinigameMistressFace size="sm" />
                <h2>Прыжки уголька</h2>
              </div>
              <p className="muted doodle-intro__lead">
                Уголёк скачет сам — ты выбираешь, куда лететь. Поднимайся по
                платформам, копи жар и обналичивай его на золотых очагах. Упал
                в темноту — забег окончен, а неостывший жар сгорает.
              </p>
            </div>
          </header>

          <div className="doodle-intro__rules">
            <div className="doodle-rule">
              <div className="doodle-rule__chips">
                <span className="doodle-chip doodle-chip--good">←→</span>
              </div>
              <p>
                Веди уголёка: ←→ / A D или тяни пальцем. Края экрана заворачивают
                — иногда проще уйти «за бок».
              </p>
            </div>
            <div className="doodle-rule">
              <div className="doodle-rule__chips">
                <span className="doodle-chip doodle-chip--spring">×{DOODLE_SPRING_MULT}</span>
              </div>
              <p>
                Пружина подбрасывает почти вдвое выше
                {trophyCount === 0
                  ? " — лайкай картинки на сессиях, и за каждые 100 метров выплывет трофей."
                  : " — а каждые 100 метров приносят трофей из избранного."}
              </p>
            </div>
            <div className="doodle-rule">
              <div className="doodle-rule__chips">
                <span className="doodle-chip doodle-chip--spring">×2</span>
                <span className="doodle-chip doodle-chip--spring">🏺</span>
              </div>
              <p>
                Жар растёт с высотой без обналичивания (до <strong>×2</strong>) и
                умножает заработанное. Золотой очаг фиксирует жар в Угольки.
                Упал горячим: <strong>75% жара сгорает</strong>, стимул бьёт до 12 с.
              </p>
            </div>
            <div className="doodle-rule">
              <div className="doodle-rule__chips">
                <span className="doodle-chip doodle-chip--move">‹ ›</span>
                <span className="doodle-chip doodle-chip--bad">1✕</span>
              </div>
              <p>
                Медные платформы ускользают из стороны в сторону, а хрупкие
                крошатся после одного прыжка — возвращаться нельзя.
              </p>
            </div>
            <div className="doodle-rule">
              <div className="doodle-rule__chips">
                <span className="doodle-chip doodle-chip--ice">🧊</span>
                <span className="doodle-chip doodle-chip--ice">👁</span>
              </div>
              <p>
                Лёд скользит: после ледяной платформы уголёк несёт боком. Теневые
                платформы мигают — пока тусклые, сквозь них проваливаешься.
              </p>
            </div>
            <div className="doodle-rule">
              <div className="doodle-rule__chips">
                <span className="doodle-chip doodle-chip--frost">❄</span>
              </div>
              <p>
                Холодные сгустки гасят уголёка при касании — но прыжок{" "}
                <strong>сверху</strong> раскалывает их на Угольки. С высотой их
                всё больше.
              </p>
            </div>
            <div className="doodle-rule">
              <div className="doodle-rule__chips">
                <span className="doodle-chip doodle-chip--task">🔥</span>
              </div>
              <p>
                Огненная платформа сначала показывает брифинг — таймер стартует
                по кнопке. Тело и стимул начинаются на огне: на Разминке он редкий
                и поздний, на Подъёме — раньше. Успех —{" "}
                <strong>Угольки и рывок вверх</strong>, провал —{" "}
                <strong>штраф, туман на {difficulty.fogSec} с и удар стимула</strong>.
              </p>
            </div>
          </div>

          <div className="doodle-intro__diffs" role="radiogroup" aria-label="Сложность">
            {DOODLE_DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={diffId === d.id}
                className={`doodle-diff ${diffId === d.id ? "is-active" : ""}`}
                onClick={() => setDiffId(d.id)}
              >
                <span className="doodle-diff__icon" aria-hidden>
                  {DIFF_ICONS[d.id]}
                </span>
                <strong>{d.labelRu}</strong>
                <span className="muted doodle-diff__note">{DIFF_NOTES[d.id]}</span>
                <span className="muted doodle-diff__meta">
                  база {d.base} · бонус ×{d.heightMult}
                </span>
                {best[d.id] ? (
                  <span className="doodle-diff__best">
                    <CindersGlyph className="doodle-diff__best-glyph" />
                    рекорд {best[d.id]!.height} м · {best[d.id]!.total}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <MinigameStimToggles
            settings={feel}
            onChange={(next) => {
              setFeel(next);
              saveRunnerSettings(next);
            }}
          />

          <div className="doodle-intro__footer">
            <button type="button" className="puzzle-config__start" onClick={startRun}>
              ▶ Начать подъём
            </button>
            <p className="muted doodle-intro__hint">
              Управление: тяни мышью/пальцем или ←→ / A D.{" "}
              {trophyCount === 0
                ? "Лайкай картинки на сессиях — они будут выплывать за каждые 100 м."
                : "За каждые 100 метров выплывает трофей из избранного."}
            </p>
            {curBest ? (
              <p className="muted doodle-intro__bestline">
                Лучший подъём на «{difficulty.labelRu}»: {curBest.height} м за{" "}
                {curBest.total} <CindersGlyph className="doodle-inline-glyph" />
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // ----- result -----
  if (phase === "result" && outcome && result) {
    return (
      <div className="puzzle-result" role="dialog">
        <div className="puzzle-result__card">
          <div className="puzzle-result__headline">
            <CindersGlyph className="puzzle-result__headline-glyph" />
            <h2>Уголёк взлетел на {outcome.heightM} м</h2>
          </div>

          <div className="doodle-result__stats">
            <span className="doodle-stat">{difficulty.labelRu}</span>
            <span className="doodle-stat">⬆ {outcome.heightM} м</span>
            <span className="doodle-stat doodle-stat--good">🏺 {outcome.hearths}</span>
            <span className="doodle-stat doodle-stat--good">🧷 {outcome.springs}</span>
            <span className="doodle-stat doodle-stat--good">❄ {outcome.stomps}</span>
            <span className="doodle-stat doodle-stat--good">🔥 ✓ {outcome.tasksGood}</span>
            <span className="doodle-stat doodle-stat--bad">🔥 ✗ {outcome.tasksBad}</span>
          </div>

          <p className="doodle-result__cause">
            {DEATH_TEXT[outcome.deathCause]}
            {fallSec > 0
              ? feel.lovenseVibe
                ? ` Расплата за потерянный жар: стимул ${fallSec} с.`
                : ` Расплата за потерянный жар: стимул руками ${fallSec} с.`
              : ""}
          </p>

          <ul className="puzzle-result__breakdown">
            <li>
              <span>База за сложность</span>
              <span className="puzzle-result__num">{result.base}</span>
            </li>
            <li>
              <span>Бонус за жар (высота)</span>
              <span
                className={`puzzle-result__num ${result.heightBonus > 0 ? "puzzle-result__num--plus" : ""}`}
              >
                {result.heightBonus > 0 ? `+${result.heightBonus}` : "—"}
              </span>
            </li>
            <li>
              <span>Задания огня</span>
              <span
                className={`puzzle-result__num ${result.taskReward > 0 ? "puzzle-result__num--plus" : ""}`}
              >
                {result.taskReward > 0 ? `+${result.taskReward}` : "—"}
              </span>
            </li>
            <li>
              <span>Расколотые сгустки</span>
              <span
                className={`puzzle-result__num ${result.stompReward > 0 ? "puzzle-result__num--plus" : ""}`}
              >
                {result.stompReward > 0 ? `+${result.stompReward}` : "—"}
              </span>
            </li>
            <li>
              <span>Штрафы</span>
              <span
                className={`puzzle-result__num ${result.taskPenalty > 0 ? "puzzle-result__num--minus" : ""}`}
              >
                {result.taskPenalty > 0 ? `−${result.taskPenalty}` : "—"}
              </span>
            </li>
            <li className="puzzle-result__total">
              <span>Итого</span>
              <span className="puzzle-result__total-num">
                <CindersGlyph className="puzzle-result__total-glyph" />
                {result.total}
              </span>
            </li>
          </ul>
          <p className="muted doodle-result__crowd">
            Жар-метры: обналичено на очагах {outcome.bankedMeters} · сгорело при
            падении {outcome.burnedMeters} (спасено 25%). Жадность до следующего
            очага — выше множитель, но и расплата больнее.
          </p>
          <div className="puzzle-result__actions">
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
              <CindersGlyph className="puzzle-result__btn-glyph" />
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
                startRun();
              }}
            >
              Новый подъём
            </button>
            <button
              type="button"
              className="puzzle-btn"
              onClick={() => {
                if (!claimedRef.current) {
                  claimedRef.current = true;
                  onReward(result.total);
                }
                setPhase("intro");
              }}
            >
              ← В меню
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----- play -----
  return (
    <div className="doodle-play">
      <div className="puzzle-hud">
        <button
          type="button"
          className="puzzle-hud__btn puzzle-hud__btn--back"
          onClick={onExit}
          title="Выйти из подъёма"
        >
          ←
        </button>
        <div className="puzzle-hud__title">
          <span>Прыжки</span>
          <span className="puzzle-hud__crumb">
            {DIFF_ICONS[diffId]} {difficulty.labelRu}
          </span>
        </div>
        <div className="puzzle-hud__actions">
          <button
            type="button"
            className={`puzzle-hud__btn ${paused ? "is-active" : ""}`}
            onClick={() => setPaused((p) => !p)}
            title="Пауза (Esc)"
          >
            {paused ? "Продолжить" : "Пауза"}
          </button>
        </div>
      </div>

      <DoodleTrack
        key={runSeq}
        difficulty={difficulty}
        tasks={tasks}
        paused={paused || taskGate !== null}
        bestHeightM={best[diffId]?.height}
        onTaskGate={handleTaskGate}
        onMilestone={handleMilestone}
        onOutcome={handleOutcome}
      />

      {trophy ? (
        <figure className="doodle-trophy doodle-trophy--slide" key={trophy.url + trophy.meters}>
          <img src={trophy.url} alt={trophy.label} draggable={false} />
          <figcaption>
            <span className="doodle-trophy__badge">🏆</span> {trophy.meters} м —{" "}
            {trophy.label}
          </figcaption>
        </figure>
      ) : null}

      {taskGate ? (
        <div className="doodle-taskview">
          {taskPic && taskGate.stage !== "after" ? (
            <figure className="doodle-taskpic" key={taskGate.seq}>
              <img src={taskPic.url} alt={taskPic.label} draggable={false} />
              <figcaption>Смотри на неё, пока выполняешь задание</figcaption>
            </figure>
          ) : null}

          {taskGate.stage === "brief" ? (
            <div className="puzzle-task" role="dialog" aria-modal="true">
              <div className="puzzle-task__card">
                <div className="puzzle-task__kicker">
                  Огненная платформа · {PUZZLE_TASK_KIND_LABELS[taskGate.task.kind]}
                </div>
                <h3 className="puzzle-task__title">{taskGate.task.titleRu}</h3>
                <p className="puzzle-task__text">{taskGate.task.instructionRu}</p>
                <p className="muted doodle-taskgate__spec">
                  {puzzleTaskSpec(taskGate.task)}
                </p>
                <div className="puzzle-task__reward">
                  <span className="puzzle-task__plus">
                    +{taskGate.task.rewardBonus}
                  </span>
                  <span className="puzzle-task__minus">
                    −{taskGate.task.failPenalty}
                  </span>
                </div>
                <div className="puzzle-task__actions">
                  <button type="button" className="primary" onClick={beginTaskGate}>
                    Начать задание ▶
                  </button>
                </div>
                <p className="muted doodle-taskgate__note">
                  Таймер стартует только после кнопки — сначала прочитай.
                </p>
              </div>
            </div>
          ) : taskGate.stage === "after" ? (
            <div
              className={`puzzle-task doodle-taskgate doodle-taskgate--${taskGate.success ? "ok" : "fail"}`}
              role="dialog"
              aria-modal="true"
            >
              <div className="puzzle-task__card">
                <div className="puzzle-task__kicker">
                  {taskGate.success ? "Задание выполнено" : "Задание провалено"}
                </div>
                <h3 className="puzzle-task__title">
                  {taskGate.success
                    ? `+${taskGate.task.rewardBonus} Угольков`
                    : `−${taskGate.task.failPenalty} Угольков`}
                </h3>
                <p className="puzzle-task__text">
                  {taskGate.success
                    ? "Рывок вверх — полетели дальше."
                    : `Туман на ${difficulty.fogSec} с и удар стимула. Соберись.`}
                </p>
              </div>
            </div>
          ) : (
            <PuzzleTaskRunner
              mode="task"
              task={taskGate.task}
              allowCancel={getActiveSaveSlot() === "sandbox"}
              vibeMode={stimVibeMode(feel)}
              onComplete={finishTaskGate}
            />
          )}
        </div>
      ) : null}

      {paused && !taskGate ? (
        <div className="puzzle-task" role="dialog" aria-modal="true">
          <div className="puzzle-task__card">
            <div className="puzzle-task__kicker">Подъём на паузе</div>
            <h3 className="puzzle-task__title">Зависание</h3>
            <p className="puzzle-task__text">
              Уголёк висит в воздухе. Огонь не платит за простой.
            </p>
            <div className="puzzle-task__actions">
              <button type="button" className="primary" onClick={() => setPaused(false)}>
                Прыгать дальше
              </button>
              <button type="button" className="ghost" onClick={onExit}>
                Бросить подъём
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
