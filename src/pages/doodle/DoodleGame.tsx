import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  calcDoodleReward,
  DOODLE_DIFFICULTIES,
  getDoodleDifficulty,
  loadDoodleBest,
  saveDoodleBestIfBetter,
  type DoodleDifficultyId,
  type DoodleRewardResult,
} from "../../lib/doodleReward";
import { loadPuzzleTasks, type PuzzleTask } from "../../lib/puzzleTasks";
import {
  getFavoriteRecord,
  listFavoriteMetadata,
  type FavoriteMetadata,
} from "../../lib/mediaFavorites";
import { setDeviceVibeLevel, stopDevice } from "../../lib/device/deviceClient";
import { PuzzleTaskRunner } from "../puzzle/PuzzleTaskRunner";
import { CindersGlyph } from "../../components/CindersGlyph";
import { DoodleTrack, type DoodleOutcome } from "./DoodleTrack";
import { getActiveSaveSlot } from "../../lib/saveSlots";

/**
 * Minigames → Doodle jump: shell around the DoodleTrack canvas.
 *
 * Phases: intro (rules + difficulty) → play (canvas + task/pause overlays +
 * milestone trophies) → result (reward breakdown, puzzle-style claim flow).
 *
 * Punishments on a failed task platform: cinder penalty + fog (in-canvas) and
 * a short device stimulus pulse. Milestone trophies: every crossed 100 m
 * flashes a favorite image as a reward.
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

/** Only still images can be trophies; drop videos/gifs. */
function isImageMeta(m: FavoriteMetadata): boolean {
  if (m.kind) return m.kind === "image";
  if (m.mime) return m.mime.startsWith("image/");
  return true;
}

export function DoodleGame({ onReward, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [diffId, setDiffId] = useState<DoodleDifficultyId>("climb");
  const [runSeq, setRunSeq] = useState(0);
  const [outcome, setOutcome] = useState<DoodleOutcome | null>(null);
  const [result, setResult] = useState<DoodleRewardResult | null>(null);
  const [taskGate, setTaskGate] = useState<{
    task: PuzzleTask;
    resolve: (ok: boolean) => void;
    seq: number;
  } | null>(null);
  const [paused, setPaused] = useState(false);
  const [best, setBest] = useState(() => loadDoodleBest());

  /** Preloaded favorite images for task pics + milestone trophies. */
  const trophyPoolRef = useRef<TrophyImg[]>([]);
  /** Bumped on every preload start so a stale in-flight load self-cancels. */
  const trophyGenRef = useRef(0);
  const [trophy, setTrophy] = useState<TrophyImg | null>(null);
  /** Bumped when the pool finishes loading (intro hint + fallbacks). */
  const [trophyCount, setTrophyCount] = useState(-1);
  /** Sequential id per task overlay, drives the "inspiration" pick. */
  const taskSeqRef = useRef(0);
  const punishTimerRef = useRef<number | null>(null);

  const difficulty = useMemo(() => getDoodleDifficulty(diffId), [diffId]);
  // Task platforms use the shared task library; puzzle-only kinds make no
  // sense mid-jump.
  const tasks = useMemo(
    () =>
      loadPuzzleTasks().filter(
        (t) => t.kind !== "per_touch" && t.kind !== "ghost_hint",
      ),
    [],
  );

  const taskGateRef = useRef(taskGate);
  taskGateRef.current = taskGate;

  // revoke trophy object URLs + stop any pending punishment pulse
  useEffect(() => {
    const pool = trophyPoolRef.current;
    return () => {
      for (const t of pool) URL.revokeObjectURL(t.url);
      if (punishTimerRef.current != null) window.clearTimeout(punishTimerRef.current);
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
    setOutcome(null);
    setResult(null);
    setTaskGate(null);
    setPaused(false);
    setTrophy(null);
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

  /** Failed task = punishment pulse on the device (if one is connected). */
  const punishPulse = useCallback((level: number) => {
    if (level <= 0) return;
    if (punishTimerRef.current != null) window.clearTimeout(punishTimerRef.current);
    void setDeviceVibeLevel(level);
    punishTimerRef.current = window.setTimeout(() => {
      punishTimerRef.current = null;
      void stopDevice();
    }, PUNISH_VIBE_SEC * 1000);
  }, []);

  const finishTaskGate = useCallback(
    (success: boolean) => {
      const cur = taskGateRef.current;
      taskGateRef.current = null;
      setTaskGate(null);
      if (!success) punishPulse(getDoodleDifficulty(diffId).punishVibe);
      cur?.resolve(success);
    },
    [diffId, punishPulse],
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
        heightM: o.heightM,
        taskReward: o.taskReward,
        taskPenalty: o.taskPenalty,
      });
      setOutcome(o);
      setResult(res);
      setBest(saveDoodleBestIfBetter(diffId, { height: o.heightM, total: res.total }));
      setPhase("result");
    },
    [difficulty, diffId],
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
              <h2>Прыжки уголька</h2>
              <p className="muted doodle-intro__lead">
                Уголёк скачет сам — ты выбираешь, куда лететь. Поднимайся по
                платформам, жми пружины и выполняй задания огня. Упал в темноту —
                забег окончен, а награда считается от максимальной высоты.
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
                <span className="doodle-chip doodle-chip--spring">×3</span>
              </div>
              <p>
                Пружина подбрасывает втрое выше — а каждые 100 метров приносят
                трофей из твоего избранного.
              </p>
            </div>
            <div className="doodle-rule">
              <div className="doodle-rule__chips">
                <span className="doodle-chip doodle-chip--move">‹ ›</span>
                <span className="doodle-chip doodle-chip--bad">1✕</span>
              </div>
              <p>
                Золотые платформы ускользают из стороны в сторону, а хрупкие
                крошатся после одного прыжка — возвращаться нельзя.
              </p>
            </div>
            <div className="doodle-rule">
              <div className="doodle-rule__chips">
                <span className="doodle-chip doodle-chip--task">🔥</span>
              </div>
              <p>
                Огненная платформа ставит прыжок на паузу и даёт задание: успех —{" "}
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
            <span className="doodle-stat">👣 {outcome.bounces}</span>
            <span className="doodle-stat doodle-stat--good">🧷 {outcome.springs}</span>
            <span className="doodle-stat doodle-stat--good">🔥 ✓ {outcome.tasksGood}</span>
            <span className="doodle-stat doodle-stat--bad">🔥 ✗ {outcome.tasksBad}</span>
          </div>

          <p className="doodle-result__cause">Уголёк остыл и упал в темноту.</p>

          <ul className="puzzle-result__breakdown">
            <li>
              <span>База за сложность</span>
              <span className="puzzle-result__num">{result.base}</span>
            </li>
            <li>
              <span>Бонус за высоту</span>
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
            Награда растёт как корень из высоты: первые метры дороже всего, но
            только большой подъём приносит большие Угольки.
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
              Новый подъём
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
          <p className="muted doodle-result__note">
            Незабранная награда сгорает при новом подъёме или выходе в меню.
          </p>
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
          {taskPic ? (
            <figure className="doodle-taskpic" key={taskGate.seq}>
              <img src={taskPic.url} alt={taskPic.label} draggable={false} />
              <figcaption>Смотри на неё, пока выполняешь задание</figcaption>
            </figure>
          ) : null}
          <PuzzleTaskRunner
            mode="task"
            task={taskGate.task}
            allowCancel={getActiveSaveSlot() === "sandbox"}
            onComplete={finishTaskGate}
          />
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
