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
  filterTasksForRunner,
  loadRunnerSettings,
  saveRunnerSettings,
  type RunnerSettings,
} from "../../lib/runnerSettings";
import {
  runnerStimCancel,
  runnerStimPulse,
  runnerStimYield,
  type RunnerStimEvent,
} from "../../lib/runnerStim";
import {
  getFavoriteRecord,
  listFavoriteMetadata,
  type FavoriteMetadata,
} from "../../lib/mediaFavorites";
import { PuzzleTaskRunner } from "../puzzle/PuzzleTaskRunner";
import { CindersGlyph } from "../../components/CindersGlyph";
import { UiCheck } from "../../components/UiCheck";
import {
  buildTrack,
  RunnerTrack,
  type RunnerGameEvent,
  type RunnerOutcome,
  type RunnerTrackData,
} from "./RunnerTrack";
import {
  drawRunnerRule,
  ruleHonored,
  ruleStatusLabel,
  type RunnerLive,
  type RunnerRule,
} from "../../lib/runnerRules";
import {
  pickMistressLine,
  runnerMistressName,
  type MistressLineEvent,
} from "./runnerMistress";
import { WAGER_OPTIONS, wagerVerdict } from "../../lib/runnerWager";
import {
  applyStage,
  loadRunnerProgress,
  RUNNER_STAGE_MAX,
  stageOf,
  unlockNextStage,
} from "../../lib/runnerProgress";
import {
  applyRunnerRun,
  loadAchievements,
  saveAchievements,
} from "../../lib/achievements";
import { getActiveSaveSlot } from "../../lib/saveSlots";

/**
 * Minigames → Runner: gate-runner shell around the RunnerTrack canvas.
 *
 * Phases: intro (rules + difficulty + mistress rule for the next run) →
 * play (canvas + task/pause overlays + boss trophy + mistress toasts) →
 * result (reward breakdown + rule verdict + trophy, puzzle-style claim flow).
 *
 * The track and the mistress rule are drawn together as one "run plan", so
 * the rule shown on the intro is always completable on the track you run.
 * Favorite images double as boss trophies, preloaded when the run starts.
 */

interface Props {
  onReward: (cinders: number) => void;
  /** Deduct the wager from the wallet at run start. */
  onSpend?: (cinders: number) => void;
  walletBalance?: number;
  onExit: () => void;
}

type Phase = "intro" | "play" | "result";

interface TrophyImg {
  url: string;
  label: string;
}

/** Track + mistress rule calibrated against that exact track. */
interface RunPlan {
  track: RunnerTrackData;
  rule: RunnerRule;
}

const TROPHY_POOL_SIZE = 6;

/** gameplay events that also fire a device stimulus pulse */
const STIM_EVENTS: ReadonlySet<RunnerGameEvent> = new Set([
  "redGate",
  "fightWin",
  "bossWin",
  "death",
] as const);

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

export function RunnerGame({ onReward, onSpend, walletBalance, onExit }: Props) {
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

  /** Live rule progress from the track (throttled there ~0.4s). */
  const [live, setLive] = useState<RunnerLive | null>(null);
  /** Rule verdict filled at the outcome for the result screen. */
  const [ruleVerdict, setRuleVerdict] = useState<{ honored: boolean; line: string } | null>(
    null,
  );
  /** Mistress toast: {seq, name, text}, auto-hides. */
  const [quip, setQuip] = useState<{ seq: number; name: string; text: string } | null>(
    null,
  );
  const quipSeqRef = useRef(0);
  const quipTimerRef = useRef<number | null>(null);
  const lastFightQuipRef = useRef(0);
  const showQuip = useCallback((event: MistressLineEvent) => {
    if (quipTimerRef.current) window.clearTimeout(quipTimerRef.current);
    const seq = ++quipSeqRef.current;
    setQuip({ seq, name: runnerMistressName(), text: pickMistressLine(event) });
    quipTimerRef.current = window.setTimeout(() => {
      // a newer quip may have replaced this one already
      setQuip((cur) => (cur && cur.seq === seq ? null : cur));
    }, 3000);
  }, []);
  useEffect(() => {
    return () => {
      if (quipTimerRef.current) window.clearTimeout(quipTimerRef.current);
    };
  }, []);

  const difficulty = useMemo(() => getRunnerDifficulty(diffId), [diffId]);
  // Stage ladder: beating the boss unlocks the next stage of this difficulty.
  const [progress, setProgress] = useState(() => loadRunnerProgress());
  const stage = stageOf(progress, diffId);
  const effDifficulty = useMemo(() => applyStage(difficulty, stage), [difficulty, stage]);
  /** Committed wager for the current run (deducted at start). */
  const [stake, setStake] = useState(0);
  const stakeRef = useRef(0);
  stakeRef.current = stake;
  /** Wager verdict filled at the outcome for the result screen. */
  const [wager, setWager] = useState<ReturnType<typeof wagerVerdict> | null>(null);
  /** New stage number to announce on the result screen (null = none). */
  const [stageUnlocked, setStageUnlocked] = useState<number | null>(null);
  // Vibration channels (Ловенс / вручную), persisted between runs.
  const [feel, setFeel] = useState<RunnerSettings>(() => loadRunnerSettings());
  const feelRef = useRef(feel);
  feelRef.current = feel;
  const setFeelKey = useCallback(
    <K extends keyof RunnerSettings>(key: K, value: RunnerSettings[K]) => {
      setFeel((prev) => {
        const next = { ...prev, [key]: value };
        saveRunnerSettings(next);
        return next;
      });
    },
    [],
  );
  // Fire gates use the shared task library; puzzle-only kinds make no sense
  // here, and vibration tasks drop out when both channels are off.
  const tasks = useMemo(
    () =>
      filterTasksForRunner(
        loadPuzzleTasks().filter(
          (t) => t.kind !== "per_touch" && t.kind !== "ghost_hint",
        ),
        feel,
      ),
    [feel],
  );
  /** Fire-gate vibe tasks drive the device, or fall back to by-hand
   *  instructions when only the manual channel is enabled. */
  const vibeMode = feel.lovenseVibe ? "device" : "manual";

  /** Track + mistress rule for the upcoming run (kept in sync so the intro
   *  preview and the actual run always use the same plan). */
  const makePlan = useCallback((): RunPlan => {
    const track = buildTrack(effDifficulty, tasks);
    const rule = drawRunnerRule(
      { fireRows: track.fireRows, typCrowd: track.typCrowd },
      effDifficulty,
    );
    return { track, rule };
  }, [effDifficulty, tasks]);
  const planRef = useRef<RunPlan | null>(null);
  const [plan, setPlan] = useState<RunPlan | null>(null);
  const rollPlan = useCallback(() => {
    const next = makePlan();
    planRef.current = next;
    setPlan(next);
  }, [makePlan]);
  // re-roll whenever difficulty or the task pool (vibration settings) changes
  useEffect(() => {
    rollPlan();
  }, [rollPlan]);

  const taskGateRef = useRef(taskGate);
  taskGateRef.current = taskGate;

  // revoke any outstanding trophy object URLs on unmount; stop any stimulus
  // pulse the run left in flight
  useEffect(() => {
    const pool = trophyPoolRef.current;
    return () => {
      runnerStimCancel();
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

  const startRun = useCallback(
    (fresh = false) => {
      if (fresh || !planRef.current) {
        const next = makePlan();
        planRef.current = next;
        setPlan(next);
      }
      // commit the wager: deducted now, doubled back only on a survived run
      const wanted = feelRef.current.wager;
      const affordable = wanted > 0 && (walletBalance ?? 0) >= wanted && onSpend;
      if (affordable) {
        onSpend!(wanted);
        setStake(wanted);
      } else {
        setStake(0);
      }
      setStageUnlocked(null);
      setOutcome(null);
      setResult(null);
      setTaskGate(null);
      setPaused(false);
      setBossTrophy(null);
      setLive(null);
      setRunSeq((s) => s + 1);
      setPhase("play");
      void preloadTrophies();
    },
    [makePlan, preloadTrophies, onSpend, walletBalance],
  );

  // announce the run with a mistress line once the canvas is up
  useEffect(() => {
    if (phase !== "play") return;
    const t = window.setTimeout(() => showQuip("runStart"), 650);
    return () => window.clearTimeout(t);
  }, [phase, runSeq, showQuip]);

  const handleTaskGate = useCallback(
    (task: PuzzleTask) =>
      new Promise<boolean>((resolve) => {
        // the task overlay owns stimulation while it is up — drop our pulse
        // without stopping the device so a vibe task can take over cleanly
        runnerStimYield();
        showQuip("fireGate");
        setTaskGate({ task, resolve, seq: ++taskSeqRef.current });
      }),
    [showQuip],
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

  /** Unified gameplay-event bus: device pulses (Lovense channel only, the
   *  pulse helper itself backs off when a session owns the toy) + mistress
   *  toasts with throttling for the chatty events. */
  const handleGameEvent = useCallback(
    (event: RunnerGameEvent) => {
      if (STIM_EVENTS.has(event) && feelRef.current.lovenseVibe) {
        runnerStimPulse(event as RunnerStimEvent);
      }
      const now = Date.now();
      switch (event) {
        case "death":
        case "bossWin":
        case "finish":
          showQuip(event);
          break;
        case "fightWin":
          if (now - lastFightQuipRef.current > 8000 && Math.random() < 0.35) {
            lastFightQuipRef.current = now;
            showQuip("fightWin");
          }
          break;
        case "taskFail":
          if (now - lastFightQuipRef.current > 8000 && Math.random() < 0.3) {
            lastFightQuipRef.current = now;
            showQuip("taskFail");
          }
          break;
        default:
          break;
      }
    },
    [showQuip],
  );

  const handleLive = useCallback((next: RunnerLive) => setLive(next), []);

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
      runnerStimCancel();
      const curPlan = planRef.current;
      const honored = curPlan
        ? ruleHonored(
            curPlan.rule,
            {
              survived: o.survived,
              finalCrowd: o.finalCrowd,
              redHits: o.redHits,
              fireSeen: o.fireSeen,
              fireDone: o.fireDone,
            },
            curPlan.track.fireRows,
          )
        : false;
      const ruleBonus = honored ? curPlan!.rule.bonus : 0;
      const res = calcRunnerReward({
        difficulty: effDifficulty,
        finalCrowd: o.finalCrowd,
        survived: o.survived,
        taskReward: o.taskReward,
        taskPenalty: o.taskPenalty,
        ruleBonus,
      });
      setOutcome(o);
      setResult(res);
      setRuleVerdict({ honored, line: pickMistressLine(honored ? "ruleDone" : "ruleFail") });
      setWager(wagerVerdict(stakeRef.current, o.survived));
      // lifetime mini-game counters
      try {
        saveAchievements(
          applyRunnerRun(loadAchievements(), {
            survived: o.survived,
            bossDefeated: o.bossDefeated,
            clean: o.survived && o.redHits === 0,
            crowd: o.finalCrowd,
          }),
        );
      } catch {
        // achievements storage unavailable — the run still pays out
      }
      // stage ladder advance
      if (o.survived) {
        const { advanced, stage: newStage, progress: next } = unlockNextStage(diffId);
        if (advanced) {
          setStageUnlocked(newStage);
          setProgress(next);
        }
      }
      setBest(
        saveRunnerBestIfBetter(diffId, { crowd: o.finalCrowd, total: res.total }),
      );
      setPhase("result");
    },
    [effDifficulty, diffId],
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

          <div className="runner-intro__feel">
            <span className="runner-intro__feel-title">Ощущения</span>
            <UiCheck
              checked={feel.lovenseVibe}
              onChange={(v) => setFeelKey("lovenseVibe", v)}
            >
              <span className="runner-intro__feel-text">
                <strong>С вибратором Lovense</strong>
                <span className="muted">
                  игра сама включает мотор: импульсы на красных вратах,
                  схватках и боссе; задания со стимулом крутят устройство
                </span>
              </span>
            </UiCheck>
            <UiCheck
              checked={feel.manualVibe}
              onChange={(v) => setFeelKey("manualVibe", v)}
            >
              <span className="runner-intro__feel-text">
                <strong>С ручной вибрацией</strong>
                <span className="muted">
                  задания со стимулом можно делать руками по инструкции —
                  работает без Lovense. Выключи — и вибрационных заданий не
                  будет вовсе
                </span>
              </span>
            </UiCheck>
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
                <span
                  className="runner-diff__stage"
                  title={`Этап ${stageOf(progress, d.id)} из ${RUNNER_STAGE_MAX} — открывается победой над боссом`}
                >
                  {Array.from({ length: RUNNER_STAGE_MAX }, (_, i) => (
                    <i
                      key={i}
                      className={`runner-diff__pip ${i < stageOf(progress, d.id) ? "is-on" : ""}`}
                    />
                  ))}
                  <span className="muted">этап {stageOf(progress, d.id)}/{RUNNER_STAGE_MAX}</span>
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

          <div className="runner-intro__wager">
            <span className="runner-intro__feel-title">Ставка на забег</span>
            <div className="runner-wager__opts">
              {WAGER_OPTIONS.map((n) => {
                const disabled = n > 0 && (walletBalance ?? 0) < n;
                return (
                  <button
                    key={n}
                    type="button"
                    className={`runner-wager__opt ${feel.wager === n ? "is-active" : ""}`}
                    disabled={disabled}
                    onClick={() => setFeelKey("wager", n)}
                  >
                    {n === 0 ? "Без ставки" : n}
                  </button>
                );
              })}
            </div>
            <span className="muted runner-wager__note">
              Ставка списывается на старте. Довёл толпу до финиша — вернётся
              вдвое, сгорела — сгорела. Баланс: {walletBalance ?? 0}{" "}
              <CindersGlyph className="runner-inline-glyph" />
            </span>
          </div>

          {plan ? (
            <div className="runner-intro__rule">
              <span className="runner-intro__rule-kicker">
                {runnerMistressName()} ставит правило на забег
              </span>
              <div className="runner-intro__rule-row">
                <strong>{plan.rule.labelRu}</strong>
                <span className="runner-intro__rule-bonus">
                  <CindersGlyph className="runner-inline-glyph" />+
                  {plan.rule.bonus}
                </span>
              </div>
              <span className="muted runner-intro__rule-hint">{plan.rule.hintRu}</span>
            </div>
          ) : null}

          <div className="runner-intro__footer">
            <button type="button" className="puzzle-config__start" onClick={() => startRun()}>
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

          {stageUnlocked != null ? (
            <div className="runner-result__stage">
              🏁 Открыт <strong>этап {stageUnlocked}/{RUNNER_STAGE_MAX}</strong> на
              «{difficulty.labelRu}» — трасса длиннее, награда жирнее.
            </div>
          ) : null}

          {wager && wager.stake > 0 ? (
            <div className={`runner-result__wager ${wager.won ? "is-ok" : "is-fail"}`}>
              {wager.won
                ? `Ставка ${wager.stake} сыграла — вернётся ×2 (+${wager.payout})`
                : `Ставка ${wager.stake} сгорела вместе с толпой`}
            </div>
          ) : null}

          {ruleVerdict && plan ? (
            <div
              className={`runner-result__rule ${ruleVerdict.honored ? "is-ok" : "is-fail"}`}
            >
              <span className="runner-result__rule-state">
                {ruleVerdict.honored ? "✓" : "✗"}
              </span>
              <span>
                Правило госпожи: <strong>{plan.rule.labelRu}</strong>
              </span>
              <span className="runner-result__rule-line">«{ruleVerdict.line}»</span>
            </div>
          ) : null}

          <ul className="puzzle-result__breakdown">
            <li>
              <span>База за сложность</span>
              <span className="puzzle-result__num">{result.base}</span>
            </li>
            {result.ruleBonus > 0 ? (
              <li>
                <span>Правило госпожи</span>
                <span className="puzzle-result__num puzzle-result__num--plus">
                  +{result.ruleBonus}
                </span>
              </li>
            ) : null}
            {wager && wager.won ? (
              <li>
                <span>Ставка ×2</span>
                <span className="puzzle-result__num puzzle-result__num--plus">
                  +{wager.payout}
                </span>
              </li>
            ) : null}
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
                const payout = wager?.payout ?? 0;
                onReward(result.total + payout);
                onExit();
              }}
            >
              <CindersGlyph className="puzzle-result__btn-glyph" />
              Забрать {result.total + (wager?.payout ?? 0)}
            </button>
            <button type="button" className="puzzle-btn" onClick={() => startRun(true)}>
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
  const ruleStatus =
    plan && live ? ruleStatusLabel(plan.rule, live, plan.track.fireRows) : null;
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
            {stage > 1 ? ` · этап ${stage}/${RUNNER_STAGE_MAX}` : ""}
          </span>
        </div>
        {plan ? (
          <span
            className={`runner-rulechip ${ruleStatus ? `is-${ruleStatus.state}` : ""}`}
            title={plan.rule.hintRu}
          >
            <span className="runner-rulechip__label" title={plan.rule.labelRu}>
              {plan.rule.labelRu}
            </span>
            {ruleStatus ? (
              <span className="runner-rulechip__state">{ruleStatus.text}</span>
            ) : null}
          </span>
        ) : null}
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

      {plan ? (
        <>
          <RunnerTrack
            key={runSeq}
            track={plan.track}
            paused={paused || taskGate !== null}
            onTaskGate={handleTaskGate}
            onBossDefeated={handleBossDefeated}
            onGameEvent={handleGameEvent}
            onLive={handleLive}
            onOutcome={handleOutcome}
          />

          {/* rule banner — plays once per run, then hides itself via CSS */}
          <div className="runner-rulebanner" key={`rb-${runSeq}`} aria-hidden>
            <span className="runner-rulebanner__kicker">
              {runnerMistressName()} ставит правило
            </span>
            <strong>{plan.rule.labelRu}</strong>
            <span className="runner-rulebanner__bonus">
              <CindersGlyph className="runner-inline-glyph" />+{plan.rule.bonus}
            </span>
          </div>

          {quip ? (
            <div className="runner-quip" key={quip.seq} role="status">
              <span className="runner-quip__name">{quip.name}</span>
              <span className="runner-quip__text">«{quip.text}»</span>
            </div>
          ) : null}
        </>
      ) : null}

      {bossTrophy ? (
        <figure className="runner-trophy runner-trophy--slide" key={runSeq}>
          <img src={bossTrophy.url} alt={bossTrophy.label} draggable={false} />
          <figcaption>
            <span className="runner-trophy__badge">🏆</span> Трофей за босса
          </figcaption>
        </figure>
      ) : null}

      {taskGate ? (
        <div className="runner-taskview">
          {taskPic ? (
            <figure className="runner-taskpic" key={taskGate.seq}>
              <img src={taskPic.url} alt={taskPic.label} draggable={false} />
              <figcaption>Смотри на неё, пока выполняешь задание</figcaption>
            </figure>
          ) : null}
          <PuzzleTaskRunner
            mode="task"
            task={taskGate.task}
            vibeMode={vibeMode}
            allowCancel={getActiveSaveSlot() === "sandbox"}
            onComplete={finishTaskGate}
          />
        </div>
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
