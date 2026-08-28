import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CindersGlyph } from "../../components/CindersGlyph";
import { getActiveSaveSlot } from "../../lib/saveSlots";
import {
  FARM_INSPECTION_WARN_MS,
  calcFarmReward,
  farmComboMult,
  getFarmDifficulty,
  type FarmDifficultyId,
  type FarmRewardResult,
} from "../../lib/farmReward";
import { loadPuzzleTasks, pickRandomTask, type PuzzleTask } from "../../lib/puzzleTasks";
import { PuzzleTaskRunner } from "../puzzle/PuzzleTaskRunner";
import {
  FARM_CROPS,
  clearPlot,
  createFarmField,
  farmCropById,
  farmDirtCount,
  farmPlotProgress,
  farmRipeUrgency,
  farmWeedsLeft,
  harvestPlot,
  plantCrop,
  stepFarmField,
  waterPlot,
  type FarmField,
} from "./farmField";
import { FarmPlot } from "./FarmPlot";
import { FarmSetup } from "./FarmSetup";
import { CropArt } from "./FarmArt";

/**
 * Naughty farm (Пошлая ферма): a Farm-Frenzy-style timed round. Plant cheeky
 * crops, water the needy ones, harvest before they sulk; Mistress inspections
 * reward a clean field and punish neglect with a shared-library task.
 */

interface Props {
  onReward: (cinders: number) => void;
  onExit: () => void;
}

type Phase = "setup" | "play" | "result";

const TICK_MS = 150;
/** How long a clean / caught inspection banner stays after it resolves. */
const BANNER_MS = 2600;
const POP_MS = 900;

interface Banner {
  id: number;
  kind: "warn" | "clean" | "dirty" | "punished-ok" | "punished-fail";
  text: string;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.max(0, sec) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function FarmGame({ onReward, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [difficultyId, setDifficultyId] = useState<FarmDifficultyId>("medium");
  const difficulty = useMemo(() => getFarmDifficulty(difficultyId), [difficultyId]);

  const [selectedCropId, setSelectedCropId] = useState(FARM_CROPS[0].id);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [taskOverlay, setTaskOverlay] = useState<PuzzleTask | null>(null);
  const [result, setResult] = useState<FarmRewardResult | null>(null);
  const [remainingSec, setRemainingSec] = useState(difficulty.roundSec);
  const [pops, setPops] = useState<Record<number, { id: number; text: string } | undefined>>({});
  const [, setRenderTick] = useState(0);

  const fieldRef = useRef<FarmField | null>(null);
  const remainingMsRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const nextInspectionRef = useRef(0);
  const warnShownForRef = useRef(-1);
  const cleanInspectionsRef = useRef(0);
  const punishedInspectionsRef = useRef(0);
  const taskRewardRef = useRef(0);
  const taskPenaltyRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const bannerIdRef = useRef(0);
  const popIdRef = useRef(0);

  const tasks = useMemo(
    () => loadPuzzleTasks().filter((t) => t.kind !== "per_touch" && t.kind !== "ghost_hint"),
    [],
  );

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const showBanner = useCallback(
    (kind: Banner["kind"], text: string, autoHide = true) => {
      bannerIdRef.current += 1;
      const b = { id: bannerIdRef.current, kind, text };
      setBanner(b);
      if (autoHide) later(() => setBanner((cur) => (cur?.id === b.id ? null : cur)), BANNER_MS);
    },
    [later],
  );

  const addPop = useCallback(
    (idx: number, text: string) => {
      popIdRef.current += 1;
      const pop = { id: popIdRef.current, text };
      setPops((prev) => ({ ...prev, [idx]: pop }));
      later(() => {
        setPops((prev) => (prev[idx]?.id === pop.id ? { ...prev, [idx]: undefined } : prev));
      }, POP_MS);
    },
    [later],
  );

  const startRound = useCallback(() => {
    clearTimers();
    fieldRef.current = createFarmField(difficulty.cols * difficulty.rows);
    remainingMsRef.current = difficulty.roundSec * 1000;
    lastTickRef.current = null;
    nextInspectionRef.current = 0;
    warnShownForRef.current = -1;
    cleanInspectionsRef.current = 0;
    punishedInspectionsRef.current = 0;
    taskRewardRef.current = 0;
    taskPenaltyRef.current = 0;
    setBanner(null);
    setTaskOverlay(null);
    setResult(null);
    setPops({});
    setRemainingSec(difficulty.roundSec);
    setPhase("play");
  }, [clearTimers, difficulty]);

  const finish = useCallback(() => {
    const f = fieldRef.current;
    if (!f) return;
    setResult(
      calcFarmReward({
        difficulty,
        harvestScore: f.harvestScore,
        cleanInspections: cleanInspectionsRef.current,
        totalInspections: cleanInspectionsRef.current + punishedInspectionsRef.current,
        wilts: f.wilts,
        weedsLeft: farmWeedsLeft(f),
        taskReward: taskRewardRef.current,
        taskPenalty: taskPenaltyRef.current,
      }),
    );
    setPhase("result");
  }, [difficulty]);

  /** One inspection: praise the clean, punish the messy with a task. */
  const runInspection = useCallback(() => {
    const f = fieldRef.current;
    if (!f) return;
    const dirt = farmDirtCount(f);
    if (dirt === 0) {
      cleanInspectionsRef.current += 1;
      showBanner("clean", "👠 Хозяйка обходу довольна: грядки вылизаны. Бонус!");
      return;
    }
    punishedInspectionsRef.current += 1;
    const task = pickRandomTask(tasks);
    if (!task) {
      // No task library available: a flat fine keeps neglect unprofitable.
      taskPenaltyRef.current += dirt * difficulty.wiltPenalty;
      showBanner("dirty", `👠 Бардак (${dirt})! Заданий нет — Хозяйка просто злится.`);
      return;
    }
    setBanner(null);
    setTaskOverlay(task);
  }, [tasks, difficulty.wiltPenalty, showBanner]);

  const onTaskResolved = useCallback(
    (success: boolean) => {
      const task = taskOverlay;
      setTaskOverlay(null);
      if (!task) return;
      if (success) {
        taskRewardRef.current += task.rewardBonus;
        showBanner("punished-ok", `👠 Отработал: +${task.rewardBonus}. «Смотри, умеешь же…»`);
      } else {
        taskPenaltyRef.current += task.failPenalty;
        showBanner("punished-fail", `👠 Провалил: −${task.failPenalty}. «Запомни этот урок.»`);
      }
    },
    [taskOverlay, showBanner],
  );

  // ---- main tick ----
  useEffect(() => {
    if (phase !== "play") return;
    const id = window.setInterval(() => {
      const f = fieldRef.current;
      if (!f || taskOverlay) {
        lastTickRef.current = null;
        return;
      }
      const now = performance.now();
      if (lastTickRef.current == null) lastTickRef.current = now;
      const dt = Math.min(1000, now - lastTickRef.current);
      lastTickRef.current = now;

      remainingMsRef.current -= dt;
      const elapsedMs = difficulty.roundSec * 1000 - remainingMsRef.current;

      stepFarmField(f, dt, {
        thirstPerSec: difficulty.thirstPerMin / 60,
        weedPerSec: difficulty.weedPerMin / 60,
      });

      // inspections: warn window → run at the scheduled moment
      const k = nextInspectionRef.current;
      if (k < difficulty.inspections.length) {
        const atMs = difficulty.inspections[k] * difficulty.roundSec * 1000;
        if (elapsedMs >= atMs) {
          nextInspectionRef.current += 1;
          warnShownForRef.current = -1;
          runInspection();
        } else if (elapsedMs >= atMs - FARM_INSPECTION_WARN_MS && warnShownForRef.current !== k) {
          warnShownForRef.current = k;
          showBanner("warn", "👠 Хозяйка идёт с проверкой! Прибери грядки…", false);
        }
      }

      setRemainingSec(Math.ceil(remainingMsRef.current / 1000));
      setRenderTick((n) => n + 1);

      if (remainingMsRef.current <= 0) {
        setBanner(null);
        finish();
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [phase, taskOverlay, difficulty, runInspection, finish, showBanner]);

  const onPlotClick = useCallback(
    (idx: number) => {
      const f = fieldRef.current;
      if (!f || phase !== "play" || taskOverlay) return;
      const plot = f.plots[idx];
      switch (plot.kind) {
        case "weed":
        case "wilted":
          if (clearPlot(f, idx)) addPop(idx, plot.kind === "weed" ? "🌿" : "🥀");
          break;
        case "growing":
          if (plot.thirsty && waterPlot(f, idx)) addPop(idx, "💧");
          break;
        case "ripe":
          {
            const gained = harvestPlot(f, idx);
            if (gained != null) addPop(idx, `+${gained}`);
          }
          break;
        case "empty":
          plantCrop(f, idx, selectedCropId);
          break;
      }
      setRenderTick((n) => n + 1);
    },
    [phase, taskOverlay, selectedCropId, addPop],
  );

  // ----- render phases -----
  if (phase === "setup") {
    return (
      <FarmSetup
        difficultyId={difficultyId}
        onDifficulty={setDifficultyId}
        onStart={startRound}
        onBack={onExit}
      />
    );
  }

  if (phase === "result" && result) {
    const f = fieldRef.current;
    const rows: Array<[string, string, string]> = [
      ["База за раунд", `+${result.base}`, ""],
      ["Урожай (с комбо)", `+${result.harvestScore}`, "farm-result__plus"],
      [
        "Чистые проверки Хозяйки",
        result.inspectionBonus > 0 ? `+${result.inspectionBonus}` : "—",
        result.inspectionBonus > 0 ? "farm-result__plus" : "",
      ],
      ["Отработанные наказания", result.taskReward > 0 ? `+${result.taskReward}` : "—", result.taskReward > 0 ? "farm-result__plus" : ""],
      ["Увядшее", result.wiltPenalty > 0 ? `−${result.wiltPenalty}` : "—", result.wiltPenalty > 0 ? "farm-result__minus" : ""],
      ["Сорняки к концу", result.weedPenalty > 0 ? `−${result.weedPenalty}` : "—", result.weedPenalty > 0 ? "farm-result__minus" : ""],
      ["Проваленные задания", result.taskPenalty > 0 ? `−${result.taskPenalty}` : "—", result.taskPenalty > 0 ? "farm-result__minus" : ""],
    ];
    return (
      <div className="farm-result" role="dialog">
        <div className="farm-result__card">
          <div className="farm-result__headline">
            <span className="farm-result__glyph" aria-hidden>👠</span>
            <h2>Урожай сдан!</h2>
          </div>
          <p className="muted">
            {difficulty.labelRu} · собрано {f?.harvested ?? 0} · завяло {f?.wilts ?? 0} ·
            полито {f?.watered ?? 0}
          </p>
          <ul className="farm-result__breakdown">
            {rows.map(([label, value, cls]) => (
              <li key={label}>
                <span>{label}</span>
                <span className={cls}>{value}</span>
              </li>
            ))}
            <li className="farm-result__total">
              <span>Итого</span>
              <span className="farm-result__total-num">
                <CindersGlyph className="farm-result__total-glyph" />
                {result.total}
              </span>
            </li>
          </ul>
          <div className="farm-result__actions">
            <button
              type="button"
              className="puzzle-config__start"
              onClick={() => {
                onReward(result.total);
                onExit();
              }}
            >
              <CindersGlyph className="farm-result__btn-glyph" />
              Забрать {result.total}
            </button>
            <button type="button" className="puzzle-btn" onClick={startRound}>
              Ещё раз
            </button>
            <button type="button" className="puzzle-btn" onClick={() => setPhase("setup")}>
              Сложность
            </button>
          </div>
        </div>
      </div>
    );
  }

  // phase === "play"
  const f = fieldRef.current;
  const field = f ?? createFarmField(difficulty.cols * difficulty.rows);
  if (!f) fieldRef.current = field;
  const combo = field.combo;
  const earned =
    field.harvestScore +
    taskRewardRef.current +
    cleanInspectionsRef.current * difficulty.inspectionBonus -
    field.wilts * difficulty.wiltPenalty -
    taskPenaltyRef.current;
  const elapsedMs = difficulty.roundSec * 1000 - Math.max(0, remainingMsRef.current);
  const nextInspectionAt =
    difficulty.inspections
      .slice(nextInspectionRef.current)
      .map((frac) => frac * difficulty.roundSec * 1000)
      .find((atMs) => atMs > elapsedMs) ?? null;

  return (
    <div className="farm-play">
      <div className="farm-hud">
        <button
          type="button"
          className="puzzle-hud__btn puzzle-hud__btn--back"
          onClick={onExit}
          title="Выйти из игры"
        >
          ←
        </button>
        <div className="farm-hud__title">
          <span>Пошлая ферма</span>
          <span className="puzzle-hud__crumb">
            {difficulty.labelRu} · {difficulty.cols}×{difficulty.rows}
          </span>
        </div>
        <div
          className={`farm-hud__combo ${combo >= 2 ? "is-hot" : ""}`}
          title="Серия сборов подряд"
        >
          🧺 ×{farmComboMult(combo).toFixed(2).replace(/\.?0+$/, "")}
        </div>
        {nextInspectionAt != null ? (
          <div
            className={`farm-hud__inspection ${
              nextInspectionAt - elapsedMs <= FARM_INSPECTION_WARN_MS ? "is-near" : ""
            }`}
            title="До следующей проверки Хозяйки"
          >
            👠 {fmtTime(Math.ceil((nextInspectionAt - elapsedMs) / 1000))}
          </div>
        ) : null}
        <div className="puzzle-hud__timer" aria-live="polite">
          {fmtTime(remainingSec)}
        </div>
        <div className="farm-hud__earned" title="Текущие Угольки (без базы)">
          <CindersGlyph className="farm-hud__earned-glyph" />
          {earned >= 0 ? `+${earned}` : earned}
        </div>
      </div>

      <div className="farm-stage">
        <div
          className="farm-grid"
          style={{ "--cols": difficulty.cols } as CSSProperties}
        >
          {field.plots.map((plot, idx) => (
            <FarmPlot
              key={idx}
              plot={plot}
              progress={farmPlotProgress(plot)}
              urgency={farmRipeUrgency(plot)}
              pop={pops[idx] ?? null}
              disabled={taskOverlay != null}
              onClick={() => onPlotClick(idx)}
            />
          ))}
        </div>
      </div>

      <div className="farm-tray" role="toolbar" aria-label="Семена">
        {FARM_CROPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`farm-tray__seed${c.id === selectedCropId ? " is-selected" : ""}`}
            onClick={() => setSelectedCropId(c.id)}
            title={c.jokeRu}
          >
            <CropArt id={c.id} className="farm-tray__art" />
            <span className="farm-tray__name">{c.nameRu}</span>
            <span className="farm-tray__meta muted">
              {Math.round(c.growMs / 1000)}с · +{c.value}
            </span>
          </button>
        ))}
        <div className="farm-tray__hint muted">
          {farmCropById(selectedCropId).jokeRu}
        </div>
      </div>

      {banner ? (
        <div key={banner.id} className={`farm-banner farm-banner--${banner.kind}`} role="status">
          {banner.text}
        </div>
      ) : null}

      {taskOverlay ? (
        <PuzzleTaskRunner
          mode="task"
          task={taskOverlay}
          allowCancel={getActiveSaveSlot() === "sandbox"}
          onComplete={onTaskResolved}
        />
      ) : null}
    </div>
  );
}
