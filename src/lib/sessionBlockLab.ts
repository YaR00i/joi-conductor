import { functions, getFunction, getPattern, patterns } from "./catalog";
import { nextHitAfter } from "./beatSchedule";
import { BEAT_LEAD_IN_MS } from "./beatTiming";
import { getVibeProfile, vibeProfiles } from "./vibeProfiles";
import type {
  Block,
  BlockGoal,
  BreathMode,
  SessionMode,
  SessionState,
} from "./types";

export type LabGoalKind = BlockGoal | "vibe";

export type LabDraft = {
  goal: LabGoalKind;
  functionId: string;
  patternId: string;
  bpm: number;
  durationSec: number;
  breathMode: BreathMode;
  vibeProfileId: string;
};

export const LAB_GOAL_OPTIONS: Array<{
  id: LabGoalKind;
  nameRu: string;
}> = [
  { id: "stroke", nameRu: "Дрочка" },
  { id: "edge", nameRu: "Эдж" },
  { id: "hold", nameRu: "Удержание" },
  { id: "breath", nameRu: "Дыхание" },
  { id: "rest", nameRu: "Отдых" },
  { id: "ladder", nameRu: "Лестница" },
  { id: "countdown", nameRu: "Отсчёт" },
  { id: "vibe", nameRu: "Вайб" },
];

export const LAB_BREATH_OPTIONS: Array<{
  id: BreathMode;
  nameRu: string;
}> = [
  { id: "stroke_timer", nameRu: "Ход по таймеру" },
  { id: "stroke_count", nameRu: "Счёт ходов" },
  { id: "stroke_beats", nameRu: "Ход по битам" },
  { id: "edge_race", nameRu: "Гонка к эджу" },
  { id: "hold_edge", nameRu: "Удержание грани" },
  { id: "still", nameRu: "Без хода" },
];

export const MAX_LAB_QUEUE = 12;

let labBlockSeq = 0;

export function defaultLabDraft(): LabDraft {
  const fn =
    functions.find((f) => f.enabled && f.id === "stroke_left") ??
    functions.find((f) => f.enabled && f.drive !== "vibe") ??
    functions[0];
  const pat =
    patterns.find((p) => p.enabled && p.id === "meter_straight") ??
    patterns.find((p) => p.enabled) ??
    patterns[0];
  const vibe =
    vibeProfiles.find((p) => p.id === "vibe_soft_waves") ?? vibeProfiles[0];
  return {
    goal: "stroke",
    functionId: fn?.id ?? "stroke_left",
    patternId: pat?.id ?? "meter_straight",
    bpm: 80,
    durationSec: 20,
    breathMode: "stroke_timer",
    vibeProfileId: vibe?.id ?? "vibe_soft_waves",
  };
}

function labGoalToBlockGoal(kind: LabGoalKind): BlockGoal {
  if (kind === "vibe") return "stroke";
  return kind;
}

export function isLabBlockId(id: string): boolean {
  return id.startsWith("lab-");
}

export function isLabPracticeState(
  state: Pick<SessionState, "labPractice"> | null | undefined,
): boolean {
  return Boolean(state?.labPractice);
}

/** Flag or a queue built by the lab (`lab-*` ids). Used so Stop stays silent. */
export function isLabPracticeRun(
  state:
    | Pick<SessionState, "labPractice" | "queue">
    | null
    | undefined,
): boolean {
  if (!state) return false;
  if (state.labPractice) return true;
  return Boolean(state.queue?.some((b) => isLabBlockId(b.id)));
}

export function canAppendToLiveLab(
  state:
    | Pick<SessionState, "status" | "labPractice" | "queue">
    | null
    | undefined,
  addCount = 1,
): boolean {
  if (!state || addCount < 1) return false;
  if (!isLabPracticeRun(state)) return false;
  if (state.status !== "running" && state.status !== "paused") return false;
  return state.queue.length + addCount <= MAX_LAB_QUEUE;
}

/** Roulette plan minus finale — those are not lab practice blocks. */
export function labPlanSourceBlocks(queue: Block[]): Block[] {
  return queue.filter((b) => b.goal !== "finale");
}

/** Compose list, else the live lab queue on «Заново», else the form draft. */
export function labBlocksToStart(
  queued: Block[],
  liveQueue: Block[] | undefined,
  draft: Block,
): Block[] {
  if (queued.length > 0) return queued;
  if (liveQueue && liveQueue.length > 0) return liveQueue;
  return [draft];
}

export function clonePlanBlockForLab(
  block: Block,
  mode: SessionMode = block.mode,
): Block {
  return {
    ...block,
    id: `lab-${block.goal}-${Date.now()}-${++labBlockSeq}`,
    mode,
    modifiers: [...block.modifiers],
  };
}

export function labSourceBlockCaptionRu(block: Block): string {
  const kind: LabGoalKind = block.drive === "vibe" ? "vibe" : block.goal;
  const goal =
    LAB_GOAL_OPTIONS.find((g) => g.id === kind)?.nameRu ?? block.goal;
  const fn = getFunction(block.functionId)?.nameRu ?? block.functionId;
  return `${goal} · ${fn} · ${block.durationSec} с`;
}

export function canForceLabQuest(opts: {
  status: SessionState["status"] | undefined;
  inPreflight: boolean;
  promptGate: boolean;
  pendingQuest: boolean;
  activeQuest: boolean;
}): boolean {
  if (opts.status !== "running") return false;
  if (opts.inPreflight || opts.promptGate) return false;
  if (opts.pendingQuest || opts.activeQuest) return false;
  return true;
}

export function labQuestTriggerTitleRu(opts: {
  status: SessionState["status"] | undefined;
  inPreflight: boolean;
  promptGate: boolean;
  pendingQuest: boolean;
  activeQuest: boolean;
  hasOffer: boolean;
}): string {
  if (opts.status !== "running") return "Сначала запусти блок";
  if (opts.inPreflight) return "Дождись старта";
  if (opts.promptGate) return "Сначала ответь госпоже";
  if (opts.activeQuest) return "Сначала закрой текущее задание";
  if (opts.pendingQuest) return "Задание уже вставлено в очередь";
  if (opts.hasOffer) return "Заменить текущее предложение";
  return "Показать выбранное задание";
}

export function labQueueCountRu(n: number): string {
  const abs = Math.abs(n) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return `${n} блоков`;
  if (d === 1) return `${n} блок`;
  if (d >= 2 && d <= 4) return `${n} блока`;
  return `${n} блоков`;
}

export function labBlockCaptionRu(block: Block): string {
  const kind: LabGoalKind = block.drive === "vibe" ? "vibe" : block.goal;
  const goal =
    LAB_GOAL_OPTIONS.find((g) => g.id === kind)?.nameRu ?? block.goal;
  return `${goal} · ${block.durationSec} с`;
}

export function buildLabBlock(
  draft: LabDraft,
  mode: SessionMode = "stroke",
): Block {
  const vibe = draft.goal === "vibe";
  const goal = labGoalToBlockGoal(draft.goal);
  const durationSec = Math.max(
    4,
    Math.min(180, Math.round(draft.durationSec)),
  );
  const bpm = Math.max(20, Math.min(240, Math.round(draft.bpm)));
  const functionId = vibe
    ? (getFunction(draft.functionId)?.drive === "vibe"
        ? draft.functionId
        : (functions.find((f) => f.enabled && f.drive === "vibe")?.id ??
          "hands_off_vibe"))
    : goal === "rest"
      ? "rest_hands_off"
      : draft.functionId;
  const patternId =
    getPattern(draft.patternId)?.id ?? "meter_straight";
  const block: Block = {
    id: `lab-${goal}-${Date.now()}-${++labBlockSeq}`,
    durationSec,
    functionId,
    patternId,
    bpm: vibe || goal === "rest" ? (vibe ? bpm : 40) : bpm,
    mode,
    modifiers: [],
    goal,
    drive: vibe ? "vibe" : "beat",
  };
  if (vibe) {
    const profile =
      getVibeProfile(draft.vibeProfileId) ?? getVibeProfile("vibe_soft_waves");
    block.vibeProfileId = profile?.id ?? draft.vibeProfileId;
  }
  if (goal === "hold") {
    block.holdSec = durationSec;
    block.holdGraceSec = 20;
  }
  if (goal === "breath") {
    block.breathMode = draft.breathMode;
    block.breathPrepSec = 3;
    if (
      draft.breathMode === "stroke_count" ||
      draft.breathMode === "stroke_beats"
    ) {
      block.breathTargetCount = 8;
    }
  }
  return block;
}

export type BeatSilenceCode =
  | "rest"
  | "vibe"
  | "prompt"
  | "missing_pattern"
  | "breath_prep"
  | "breath_still"
  | "finale"
  | "preflight";

const SILENCE_RU: Record<BeatSilenceCode, string> = {
  rest: "Отдых — тишина осознанная",
  vibe: "Вайб — метроном выключен",
  prompt: "Вопрос госпожи — метроном на паузе",
  missing_pattern: "Нет паттерна — блок не завёл дорожку",
  breath_prep: "Подготовка дыхания — ещё не ход",
  breath_still: "Дыхание без хода / удержание грани",
  finale: "Финал — без дорожки",
  preflight: "Ещё не старт",
};

export function diagnoseBeatSilence(opts: {
  block: Block | undefined;
  pattern: { id: string } | undefined;
  promptGate: boolean;
  breathPhase: SessionState["breathPhase"];
  inPreflight: boolean;
}): { code: BeatSilenceCode; labelRu: string } | null {
  if (opts.inPreflight) {
    return { code: "preflight", labelRu: SILENCE_RU.preflight };
  }
  if (opts.promptGate) {
    return { code: "prompt", labelRu: SILENCE_RU.prompt };
  }
  const block = opts.block;
  if (!block) return null;
  if (block.goal === "rest") {
    return { code: "rest", labelRu: SILENCE_RU.rest };
  }
  if (block.goal === "finale") {
    return { code: "finale", labelRu: SILENCE_RU.finale };
  }
  if (block.drive === "vibe") {
    return { code: "vibe", labelRu: SILENCE_RU.vibe };
  }
  if (!opts.pattern) {
    return { code: "missing_pattern", labelRu: SILENCE_RU.missing_pattern };
  }
  if (block.goal === "breath") {
    if (opts.breathPhase !== "holding") {
      return { code: "breath_prep", labelRu: SILENCE_RU.breath_prep };
    }
    if (
      block.breathMode === "still" ||
      block.breathMode === "hold_edge"
    ) {
      return { code: "breath_still", labelRu: SILENCE_RU.breath_still };
    }
  }
  return null;
}

export function beatDriftMs(opts: {
  originPerf: number | null | undefined;
  lastBeatAtMs: number | null | undefined;
  lastBeatFiredPerf: number | null | undefined;
}): number | null {
  if (
    opts.originPerf == null ||
    opts.lastBeatAtMs == null ||
    opts.lastBeatFiredPerf == null
  ) {
    return null;
  }
  return Math.round(opts.lastBeatFiredPerf - (opts.originPerf + opts.lastBeatAtMs));
}

export function nextBeatInMs(opts: {
  pattern: Parameters<typeof nextHitAfter>[0];
  bpm: number;
  originPerf: number | null | undefined;
  untilAtMs: number | null | undefined;
  nowPerf?: number;
}): { inMs: number; atMs: number } | null {
  if (opts.originPerf == null) return null;
  const now = opts.nowPerf ?? performance.now();
  const elapsed = now - opts.originPerf;
  const hit = nextHitAfter(
    opts.pattern,
    opts.bpm,
    BEAT_LEAD_IN_MS,
    elapsed,
    opts.untilAtMs ?? null,
  );
  if (!hit) return null;
  return { inMs: Math.max(0, Math.round(opts.originPerf + hit.atMs - now)), atMs: hit.atMs };
}
