import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  calcRunnerReward,
  getRunnerDifficulty,
  loadRunnerBest,
  RUNNER_DIFFICULTIES,
  saveRunnerBestIfBetter,
  type RunnerDifficultyId,
  type RunnerRewardResult,
} from "../../lib/runnerReward";
import { loadPuzzleTasks, type PuzzleTask } from "../../lib/puzzleTasks";
import {
  getFavoriteRecord,
  listFavoriteMetadata,
  type FavoriteMetadata,
} from "../../lib/mediaFavorites";
import { PuzzleTaskRunner } from "../puzzle/PuzzleTaskRunner";
import { CindersGlyph } from "../../components/CindersGlyph";
import { RunnerTrack, type RunnerOutcome } from "./RunnerTrack";

/**
 * Minigames → Runner: gate-runner shell around the RunnerTrack canvas.
 *
 * Phases: intro (rules + difficulty) → play (canvas + task/pause overlays +
 * boss trophy) → result (reward breakdown + trophy, puzzle-style claim flow).
 *
 * Favorite images double as boss trophies: a small pool is preloaded when the
 * run starts, so the slide-in card at the boss fight shows instantly.
 */

interface Props {
  onReward: (cinders: number) => void;
  onExit: () => void;
}

type Phase = "intro" | "play" | "result";

interface TrophyImg {
  url: string;
  label: string;
}

const TROPHY_POOL_SIZE = 6;

const DEATH_TEXT: Record<NonNullable<RunnerOutcome["deathCause"]>, string> = {
  gates: "Красные врата сожгли толпу дотла.",
  fight: "Встречная волна оказалась сильнее.",
  boss: "Босс оказался сильнее твоей толпы.",
};

const DIFF_ICONS: Record<RunnerDifficultyId, string> = {
  warmup: "🌱",
  run: "⚡",
  marathon: "🔥",
};

const DIFF_NOTES: Record<RunnerDifficultyId, string> = {
  warmup: "Короткая трасса, слабые волны — спокойно набить руку.",
  run: "Сбалансированный вызов: волны кусаются, босс проверяет толпу.",
  marathon: "Длинная дистанция, злые врата и самый жадный босс.",
};

/** Only still images can be trophies; drop videos/gifs. */
function isImageMeta(m: FavoriteMetadata): boolean {
  if (m.kind) return m.kind === "image";
  if (m.mime) return m.mime.startsWith("image/");
  return true;
}

export function RunnerGame({ onReward, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [diffId, setDiffId] = useState<RunnerDifficultyId>("run");
  const [runSeq, setRunSeq] = useState(0);
  const [outcome, setOutcome] = useState<RunnerOutcome | null>(null);
  const [result, setResult] = useState<RunnerRewardResult | null>(null);
  const [taskGate, setTaskGate] = useState<{
    task: PuzzleTask;
    resolve: (ok: boolean) => void;
    seq: number;
  } | null>(null);
  const [paused, setPaused] = useState(false);
  const [best, setBest] = useState(() => loadRunnerBest());

  /** Preloaded boss-trophy images for the current run. */
  const trophyPoolRef = useRef<TrophyImg[]>([]);
  /** Bumped on every preload start so a stale in-flight load self-cancels. */
  const trophyGenRef = useRef(0);
  const [bossTrophy, setBossTrophy] = useState<TrophyImg | null>(null);
  /** Bumped when the pool finishes loading (intro hint + fallbacks). */
  const [trophyCount, setTrophyCount] = useState(-1);
  /** Sequential id per fire-gate overlay, drives the "inspiration" pick. */
  const taskSeqRef = useRef(0);

  const difficulty = useMemo(() => getRunnerDifficulty(diffId), [diffId]);
  // Fire gates use the shared task library; puzzle-only kinds make no sense here.
  const tasks = useMemo(
    () =>
      loadPuzzleTasks().filter(
        (t) => t.kind !== "per_touch" && t.kind !== "ghost_hint",
      ),
    [],
  );

  const taskGateRef = useRef(taskGate);
  taskGateRef.current = taskGate;

  // revoke any outstanding trophy object URLs on unmount
  useEffect(() => {
    const pool = trophyPoolRef.current;
    return () => {
      for (const t of pool) URL.revokeObjectURL(t.url);
    };
  }, []);

  /** Load a fresh random trophy pool for the next run (fire and forget). */
  const preloadTrophies = useCallback(async () => {
    const gen = ++trophyGenRef.current;
    for (const t of trophyPoolRef.current) URL.revokeObjectURL(t.url);
    trophyPoolRef.current = [];
    setBossTrophy(null);
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
        // decode now so the slide-in never waits on the image
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
        trophyPoolRef.current.push({ url, label: rec.fileName || "Избранное" });
      }
    } catch {
      // no favorites db / empty library — trophies just stay disabled
    }
    if (gen === trophyGenRef.current) setTrophyCount(trophyPoolRef.current.length);
  }, []);

  const startRun = useCallback(() => {
    setOutcome(null);
    setResult(null);
    setTaskGate(null);
    setPaused(false);
    setBossTrophy(null);
    setRunSeq((s) => s + 1);
    setPhase("play");
    void preloadTrophies();
  }, [preloadTrophies]);

  const handleTaskGate = useCallback(
    (task: PuzzleTask) =>
      new Promise<boolean>((resolve) => {
        setTaskGate({ task, resolve, seq: ++taskSeqRef.current });
      }),
    [],
  );

  const finishTaskGate = useCallback((success: boolean) => {
    const cur = taskGateRef.current;
    taskGateRef.current = null;
    setTaskGate(null);
    cur?.resolve(success);
  }, []);

  const handleBossDefeated = useCallback(() => {
    const pool = trophyPoolRef.current;
    if (pool.length === 0) return;
    setBossTrophy(pool[Math.floor(Math.random() * pool.length)]);
  }, []);

  /** Random favorite image shown beside the fire-gate task overlay. Derived
   *  from the preloaded pool; trophyCount is a dep so the pick appears even
   *  when the pool finishes loading after the overlay opened. */
  const taskPic = useMemo(() => {
    if (!taskGate) return null;
    const pool = trophyPoolRef.current;
    if (pool.length === 0) return null;
    return pool[taskGate.seq % pool.length];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskGate, trophyCount]);

  const handleOutcome = useCallback(
    (o: RunnerOutcome) => {
      const res = calcRunnerReward({
        difficulty,
        finalCrowd: o.finalCrowd,
        survived: o.survived,
        taskReward: o.taskReward,
        taskPenalty: o.taskPenalty,
      });
      setOutcome(o);
      setResult(res);
      setBest(
        saveRunnerBestIfBetter(diffId, { crowd: o.finalCrowd, total: res.total }),
      );
      setPhase("result");
    },
    [difficulty, diffId],
  );

  // Escape toggles the pause menu (unless a fire-gate task is up).
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
      <div className="runner-intro">
        <div className="runner-intro__card">
          <button
            type="button"
            className="puzzle-hud__btn puzzle-hud__btn--back runner-intro__back"
            onClick={onExit}
            title="Назад к мини-играм"
          >
            ←
          </button>

          <header className="runner-intro__hero">
            <div className="runner-intro__hero-icon" aria-hidden>🏃</div>
            <div>
              <h2>Пробег толпы</h2>
              <p className="muted runner-intro__lead">
                Толпа бежит сама — ты выбираешь путь. Проведи её через лучшие
                ворота, раздуй огнём заданий и сомни встречные толпы. У финиша
                ждёт босс, а за его победу — трофей из твоего избранного.
              </p>
            </div>
          </header>

          <div className="runner-intro__rules">
            <div className="runner-rule">
              <div className="runner-rule__chips">
                <span className="runner-chip runner-chip--good">+12</span>
                <span className="runner-chip runner-chip--good">×2</span>
              </div>
              <p>Зелёные и золотые врата растят толпу. Выбирай жаднее.</p>
            </div>
            <div className="runner-rule">
              <div className="runner-rule__chips">
                <span className="runner-chip runner-chip--bad">−10</span>
                <span className="runner-chip runner-chip--bad">÷2</span>
              </div>
              <p>Красные врата режут толпу — наказание за невнимательность.</p>
            </div>
            <div className="runner-rule">
              <div className="runner-rule__chips">
                <span className="runner-chip runner-chip--task">🔥</span>
              </div>
              <p>
                Огненные врата ставят забег на паузу и дают задание: успех —{" "}
                <strong>+35% толпы и Угольки</strong>, провал —{" "}
                <strong>−25% толпы и штраф</strong>.
              </p>
            </div>
            <div className="runner-rule">
              <div className="runner-rule__chips">
                <span className="runner-chip runner-chip--enemy">☠</span>
              </div>
              <p>
                Встречные толпы неизбежны: у кого больше — тот и стоит. Проиграл
                схватку — забег сгорел, награда урезана.
              </p>
            </div>
          </div>

          <div className="runner-intro__diffs" role="radiogroup" aria-label="Сложность">
            {RUNNER_DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={diffId === d.id}
                className={`runner-diff ${diffId === d.id ? "is-active" : ""}`}
                onClick={() => setDiffId(d.id)}
              >
                <span className="runner-diff__icon" aria-hidden>
                  {DIFF_ICONS[d.id]}
                </span>
                <strong>{d.labelRu}</strong>
                <span className="muted runner-diff__note">{DIFF_NOTES[d.id]}</span>
                <span className="runner-diff__meta muted">
                  база {d.base} · бонус ×{d.crowdMult}
                </span>
                {best[d.id] ? (
                  <span className="runner-diff__best">
                    <CindersGlyph className="runner-diff__best-glyph" />
                    рекорд {best[d.id]!.total} · толпа {best[d.id]!.crowd}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="runner-intro__footer">
            <button type="button" className="puzzle-config__start" onClick={startRun}>
              ▶ Начать забег
            </button>
            <p className="muted runner-intro__hint">
              Управление: тяни мышью/пальцем по дороге или ←→ / A D.{" "}
              {trophyCount === 0
                ? "Лайкай картинки на сессиях — босс будет дарить их как трофеи."
                : "За победу над боссом выплывает трофей из избранного."}
            </p>
            {curBest ? (
              <p className="muted runner-intro__bestline">
                Лучший забег на «{difficulty.labelRu}»: {curBest.total}{" "}
                <CindersGlyph className="runner-inline-glyph" /> за толпу {curBest.crowd}
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
            <h2>{outcome.survived ? "Толпа прорвалась!" : "Толпа пала…"}</h2>
          </div>

          <div className="runner-result__stats">
            <span className="runner-stat">{difficulty.labelRu}</span>
            <span className="runner-stat">{Math.round(outcome.trackPct * 100)}% пути</span>
            <span className="runner-stat">⚔ {outcome.fightsWon}</span>
            <span className="runner-stat runner-stat--good">▲ {outcome.gatesGood}</span>
            <span className="runner-stat runner-stat--bad">▼ {outcome.gatesBad}</span>
          </div>

          {!outcome.survived && outcome.deathCause ? (
            <p className="runner-result__cause">{DEATH_TEXT[outcome.deathCause]}</p>
          ) : null}

          {outcome.bossDefeated ? (
            bossTrophy ? (
              <figure className="runner-trophy runner-trophy--result">
                <img src={bossTrophy.url} alt={bossTrophy.label} draggable={false} />
                <figcaption>🏆 Трофей за босса — {bossTrophy.label}</figcaption>
              </figure>
            ) : (
              <p className="muted runner-result__crowd">
                🏆 Босс повержен! Добавь картинок в избранное — он будет делиться
                трофеями.
              </p>
            )
          ) : null}

          <ul className="puzzle-result__breakdown">
            <li>
              <span>База за сложность</span>
              <span className="puzzle-result__num">{result.base}</span>
            </li>
            <li>
              <span>{outcome.survived ? "Бонус за толпу" : "Обгоревший бонус за толпу"}</span>
              <span
                className={`puzzle-result__num ${result.crowdBonus > 0 ? "puzzle-result__num--plus" : ""}`}
              >
                {result.crowdBonus > 0 ? `+${result.crowdBonus}` : "—"}
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
          <p className="muted runner-result__crowd">
            {outcome.survived
              ? `До финиша дошли ${outcome.finalCrowd} бегунов.`
              : "Сгоревший забег оставляет лишь 40% бонуса за толпу — береги людей."}
          </p>
          <div className="puzzle-result__actions">
            <button
              type="button"
              className="puzzle-config__start"
              onClick={() => {
                onReward(result.total);
                onExit();
              }}
            >
              <CindersGlyph className="puzzle-result__btn-glyph" />
              Забрать {result.total}
            </button>
            <button type="button" className="puzzle-btn" onClick={startRun}>
              Новый забег
            </button>
            <button
              type="button"
              className="puzzle-btn"
              onClick={() => setPhase("intro")}
              title="Вернуться к выбору сложности (незабранная награда сгорит)"
            >
              ← В меню
            </button>
          </div>
          <p className="muted runner-result__note">
            Незабранная награда сгорает при новом забеге или выходе в меню.
          </p>
        </div>
      </div>
    );
  }

  // ----- play -----
  return (
    <div className="runner-play">
      <div className="puzzle-hud">
        <button
          type="button"
          className="puzzle-hud__btn puzzle-hud__btn--back"
          onClick={onExit}
          title="Выйти из забега"
        >
          ←
        </button>
        <div className="puzzle-hud__title">
          <span>Пробег</span>
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

      <RunnerTrack
        key={runSeq}
        difficulty={difficulty}
        tasks={tasks}
        paused={paused || taskGate !== null}
        onTaskGate={handleTaskGate}
        onBossDefeated={handleBossDefeated}
        onOutcome={handleOutcome}
      />

      {bossTrophy ? (
        <figure className="runner-trophy runner-trophy--slide" key={runSeq}>
          <img src={bossTrophy.url} alt={bossTrophy.label} draggable={false} />
          <figcaption>
            <span className="runner-trophy__badge">🏆</span> Трофей за босса
          </figcaption>
        </figure>
      ) : null}

      {taskGate ? (
        <>
          {taskPic ? (
            <figure className="runner-taskpic" key={taskGate.seq}>
              <img src={taskPic.url} alt={taskPic.label} draggable={false} />
              <figcaption>Смотри на неё, пока выполняешь задание</figcaption>
            </figure>
          ) : null}
          <PuzzleTaskRunner
            mode="task"
            task={taskGate.task}
            onComplete={finishTaskGate}
          />
        </>
      ) : null}

      {paused && !taskGate ? (
        <div className="puzzle-task" role="dialog" aria-modal="true">
          <div className="puzzle-task__card">
            <div className="puzzle-task__kicker">Забег на паузе</div>
            <h3 className="puzzle-task__title">Передышка</h3>
            <p className="puzzle-task__text">
              Толпа стоит и ждёт. Огонь не заплатит за простой.
            </p>
            <div className="puzzle-task__actions">
              <button type="button" className="primary" onClick={() => setPaused(false)}>
                Бежать дальше
              </button>
              <button type="button" className="ghost" onClick={onExit}>
                Бросить забег
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
