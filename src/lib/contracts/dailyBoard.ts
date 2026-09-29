import { getActiveMistress } from "../mistress";
import type { MistressId } from "../mistress/types";
import {
  CONTRACT_CATALOG,
  CONTRACT_CATEGORY_LABELS,
  getContractDef,
  isHabitContractId,
  type ContractCategory,
  type ContractDef,
} from "./catalog";
import {
  fillContractTemplate,
  instantiateContract,
  instantiateMediaDrill,
} from "./contractInstantiate";
import {
  contractsTodayKey,
  endOfLocalDayMs,
  hashSeed,
  mulberry32,
} from "./contractTime";
import {
  cancelContractSeries,
  isSeriesContract,
  reconcileSeriesOnBoard,
  recordSeriesChildOutcome,
  startContractSeries,
  type SeriesInstantiate,
  type StartSeriesResult,
} from "./contractSeries";
import { getMergedContractCatalog } from "./userCatalog";
import {
  isMediaDrillContract,
  mediaDrillRewardBonus,
} from "./mediaDrill";
import {
  finishDebriefPresetFor,
  isFinishDebriefContract,
  scoreFinishDebrief,
  type FinishDebriefAnswers,
} from "./finishDebrief";

const STORAGE_KEY = "joi-contracts-v1";
const BOARD_SIZE = 5;

/** Fixed cinder cost to replace today's contract board. */
export const CONTRACT_BOARD_REROLL_COST = 18;

export type ContractStatus = "open" | "done" | "failed" | "expired";

export type ContractInstance = {
  instanceId: string;
  defId: string;
  dayKey: string;
  mistressId: MistressId;
  category: ContractCategory;
  titleRu: string;
  bodyRu: string;
  reward: number;
  deadlineMs: number;
  status: ContractStatus;
  params: Record<string, string | number>;
  difficulty: 1 | 2 | 3;
  /** Set when the player accepts; carried across day/mistress board rerolls. */
  acceptedAtMs?: number;
  /** Present only on a long-series daily child. */
  source?: "series";
  seriesInstanceId?: string;
  seriesDefId?: string;
  seriesDayIndex?: number;
  seriesTotalDays?: number;
  seriesIntensity?: 1 | 2 | 3 | 4 | 5;
  seriesThemeLabelRu?: string;
};

export type DailyContractBoard = {
  dayKey: string;
  mistressId: MistressId;
  contracts: ContractInstance[];
  /** Paid rerolls today — changes RNG salt so the board is not identical. */
  rerollSalt?: number;
};

export type ContractLifecycleOutcome = "accepted" | "done" | "failed" | "expired";

export type ContractLifecycleNotice = {
  instance: ContractInstance;
  outcome: ContractLifecycleOutcome;
};

type ContractLifecycleListener = (notice: ContractLifecycleNotice) => void;

let contractLifecycleListener: ContractLifecycleListener | null = null;

/** Soul installs one listener. Not a general event bus. */
export function setContractLifecycleListener(
  listener: ContractLifecycleListener | null,
): void {
  contractLifecycleListener = listener;
}

function emitContractLifecycle(notice: ContractLifecycleNotice): void {
  contractLifecycleListener?.(notice);
}

export {
  addLocalDays,
  localCalendarDayDiff,
  contractsTodayKey,
  endOfLocalDayMs,
} from "./contractTime";

function pickWeighted<T>(
  items: T[],
  weight: (item: T) => number,
  rng: () => number,
): T | null {
  if (items.length === 0) return null;
  let sum = 0;
  const weights = items.map((it) => {
    const w = Math.max(0.01, weight(it));
    sum += w;
    return w;
  });
  let r = rng() * sum;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function contractWeight(def: ContractDef, mistressId: MistressId): number {
  let w = 1;
  if (def.mistressBias?.includes(mistressId)) w += 1.4;
  const pack = getActiveMistress();
  const hints = pack.play.functionWeightHints.map((h) => h.toLowerCase());
  const preferred = pack.play.preferredModes.map((m) => m.toLowerCase());
  for (const hint of def.biasHints ?? []) {
    const h = hint.toLowerCase();
    if (hints.some((x) => x.includes(h) || h.includes(x))) w += 0.9;
    if (preferred.some((x) => x.includes(h) || h.includes(x))) w += 0.5;
  }
  // Soft prefer mid difficulty; hard less often unless biased
  if (def.difficulty === 1) w *= 1.15;
  if (def.difficulty === 3) w *= 0.55;
  if (def.kind === "media_drill") w *= 1.35;
  if (def.kind === "finish_debrief") w *= 1.2;
  if (isHabitContractId(def.id, def.clonedFrom)) w *= 1.25;
  return w;
}

/** Pull latest catalog name/body onto open rows so copy waves land today. */
function syncOpenContractCopy(board: DailyContractBoard): DailyContractBoard {
  let changed = false;
  const contracts = board.contracts.map((c) => {
    if (c.status !== "open") return c;
    const def = getContractDef(c.defId);
    if (!def) return c;
    const titleRu = def.nameRu;
    const bodyRu = fillContractTemplate(def.instructionRu, c.params);
    if (
      titleRu === c.titleRu &&
      bodyRu === c.bodyRu &&
      def.category === c.category
    ) {
      return c;
    }
    changed = true;
    return { ...c, titleRu, bodyRu, category: def.category };
  });
  return changed ? { ...board, contracts } : board;
}

function withSeriesExtras(
  instance: ContractInstance,
  extras: {
    instanceId: string;
    acceptedAtMs: number;
    seriesInstanceId: string;
    seriesDefId: string;
    seriesDayIndex: number;
    seriesTotalDays: number;
    intensity?: 1 | 2 | 3 | 4 | 5;
    themeLabelRu?: string;
  },
): ContractInstance {
  return {
    ...instance,
    instanceId: extras.instanceId,
    acceptedAtMs: extras.acceptedAtMs,
    source: "series",
    seriesInstanceId: extras.seriesInstanceId,
    seriesDefId: extras.seriesDefId,
    seriesDayIndex: extras.seriesDayIndex,
    seriesTotalDays: extras.seriesTotalDays,
    seriesIntensity: extras.intensity,
    seriesThemeLabelRu: extras.themeLabelRu,
  };
}

export const createSeriesChildInstance: SeriesInstantiate = (
  defId,
  dayKey,
  mistressId,
  rng,
  extras,
) => {
  const def = getContractDef(defId);
  if (!def) return null;
  return withSeriesExtras(
    instantiateContract(
      def,
      dayKey,
      mistressId,
      rng,
      extras.paramOverrides,
    ),
    extras,
  );
};

function applySeriesBoard(
  board: DailyContractBoard,
  now: Date,
  previousOpen: ContractInstance[],
): DailyContractBoard {
  return reconcileSeriesOnBoard(
    board,
    now,
    createSeriesChildInstance,
    emitContractLifecycle,
    previousOpen,
  );
}

/** Roll a fresh daily board: 5 contracts, prefer distinct categories. */
export function rollDailyBoard(
  dayKey: string,
  mistressId: MistressId,
  rerollSalt = 0,
): DailyContractBoard {
  const salt = Math.max(0, Math.floor(rerollSalt));
  const rng = mulberry32(
    hashSeed(`${dayKey}|${mistressId}|contracts|${salt}`),
  );
  const usedDefs = new Set<string>();
  const usedCats = new Set<ContractCategory>();
  const contracts: ContractInstance[] = [];

  // First pass: distinct categories
  while (contracts.length < BOARD_SIZE) {
    const catalog = getMergedContractCatalog();
    const pool = catalog.filter((d) => {
      if (usedDefs.has(d.id)) return false;
      if (usedCats.has(d.category) && usedCats.size < BOARD_SIZE) return false;
      return true;
    });
    const fallback = catalog.filter((d) => !usedDefs.has(d.id));
    const pickFrom = pool.length > 0 ? pool : fallback;
    const def = pickWeighted(
      pickFrom,
      (d) => contractWeight(d, mistressId),
      rng,
    );
    if (!def) break;
    usedDefs.add(def.id);
    usedCats.add(def.category);
    contracts.push(instantiateContract(def, dayKey, mistressId, rng));
    if (usedDefs.size >= catalog.length) break;
  }

  // Ensure at least one difficulty-3 if none rolled
  if (!contracts.some((c) => c.difficulty === 3)) {
    const hardPool = getMergedContractCatalog().filter(
      (d) => d.difficulty === 3 && !usedDefs.has(d.id),
    );
    const hard = pickWeighted(
      hardPool,
      (d) => contractWeight(d, mistressId),
      rng,
    );
    if (hard && contracts.length > 0) {
      const replaceAt = Math.floor(rng() * contracts.length);
      contracts[replaceAt] = instantiateContract(hard, dayKey, mistressId, rng);
    }
  }

  const hasHabit = contracts.some((c) =>
    isHabitContractId(c.defId, getContractDef(c.defId)?.clonedFrom),
  );
  if (!hasHabit) {
    const catalog = getMergedContractCatalog();
    const used = new Set(contracts.map((c) => c.defId));
    const habitPool = catalog.filter(
      (d) =>
        isHabitContractId(d.id, d.clonedFrom) && !used.has(d.id),
    );
    const habit = pickWeighted(
      habitPool,
      (d) => contractWeight(d, mistressId) + 1.2,
      rng,
    );
    if (habit && contracts.length > 0) {
      let replaceAt = contracts.findIndex((c) => c.difficulty !== 3);
      if (replaceAt < 0) replaceAt = contracts.length - 1;
      contracts[replaceAt] = instantiateContract(habit, dayKey, mistressId, rng);
    }
  }

  return {
    dayKey,
    mistressId,
    contracts,
    ...(salt > 0 ? { rerollSalt: salt } : {}),
  };
}

/**
 * Pay-to-refresh: new board for today with a new RNG salt.
 * Caller spends cinders and clears active drill/seed side effects.
 */
export function rerollDailyContractBoard(
  now = new Date(),
): DailyContractBoard {
  const dayKey = contractsTodayKey(now);
  const mistressId = getActiveMistress().id;
  const existing = loadContractBoard();
  const prevSalt =
    existing && existing.dayKey === dayKey ? (existing.rerollSalt ?? 0) : 0;
  const previousOpen = (existing?.contracts ?? []).filter(
    (c) => isSeriesContract(c) && c.status === "open",
  );
  const board = applySeriesBoard(
    mergeCarriedAccepted(
      rollDailyBoard(dayKey, mistressId, prevSalt + 1),
      takeCarriedAccepted(existing),
    ),
    now,
    previousOpen,
  );
  saveContractBoard(board);
  return board;
}

function isBoard(raw: unknown): raw is DailyContractBoard {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    typeof o.dayKey === "string" &&
    typeof o.mistressId === "string" &&
    Array.isArray(o.contracts)
  );
}

function expireOpen(board: DailyContractBoard, nowMs: number): DailyContractBoard {
  let changed = false;
  const contracts = board.contracts.map((c) => {
    if (c.status !== "open" || nowMs <= c.deadlineMs) return c;
    // Series children never roll over, even if already accepted.
    if (c.acceptedAtMs != null && !isSeriesContract(c)) return c;
    changed = true;
    return { ...c, status: "expired" as const };
  });
  return changed ? { ...board, contracts } : board;
}

export function isAcceptedOpen(c: ContractInstance): boolean {
  return c.status === "open" && typeof c.acceptedAtMs === "number";
}

function takeCarriedAccepted(
  board: DailyContractBoard | null,
): ContractInstance[] {
  if (!board) return [];
  return board.contracts.filter(
    (c) =>
      isAcceptedOpen(c) &&
      !isSeriesContract(c) &&
      !RETIRED_CONTRACT_DEF_IDS.has(c.defId),
  );
}

function mergeCarriedAccepted(
  board: DailyContractBoard,
  carried: ContractInstance[],
): DailyContractBoard {
  if (carried.length === 0) return board;
  const kept = carried.map((c) => ({
    ...c,
    dayKey: board.dayKey,
    deadlineMs: Math.max(c.deadlineMs, endOfLocalDayMs(board.dayKey)),
  }));
  const usedDefs = new Set(kept.map((c) => c.defId));
  const usedIds = new Set(kept.map((c) => c.instanceId));
  const fresh = board.contracts.filter(
    (c) => !usedDefs.has(c.defId) && !usedIds.has(c.instanceId),
  );
  const contracts = [...kept, ...fresh].slice(0, Math.max(BOARD_SIZE, kept.length));
  return { ...board, contracts };
}

/** Stamp accept time so the row survives the next daily board roll. */
export function markContractAccepted(
  instanceId: string,
  atMs = Date.now(),
): DailyContractBoard | null {
  const board = loadContractBoard();
  if (!board) return null;
  const idx = board.contracts.findIndex((c) => c.instanceId === instanceId);
  if (idx < 0) return null;
  const cur = board.contracts[idx]!;
  if (cur.status !== "open") return board;
  const already = cur.acceptedAtMs != null;
  const contracts = board.contracts.slice();
  const nextRow = { ...cur, acceptedAtMs: atMs };
  contracts[idx] = nextRow;
  const next = { ...board, contracts };
  saveContractBoard(next);
  if (!already) {
    emitContractLifecycle({ instance: nextRow, outcome: "accepted" });
  }
  return next;
}

export function loadContractBoard(): DailyContractBoard | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isBoard(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveContractBoard(board: DailyContractBoard): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  } catch {
    /* quota */
  }
}

const RETIRED_CONTRACT_DEF_IDS = new Set([
  "body_clamps",
  "bondage_wrists",
  "bondage_blind_edges",
  "bondage_gag_timer",
  "bondage_kneel",
  "bondage_tape",
  "media_blindfold_joi",
  "session_fitness_plug_mod",
  "anal_fitness_plug",
]);

function boardNeedsReroll(board: DailyContractBoard): boolean {
  return board.contracts.some(
    (c) =>
      RETIRED_CONTRACT_DEF_IDS.has(c.defId) ||
      (c.category as string) === "bondage" ||
      !getContractDef(c.defId),
  );
}

const MEDIA_DRILL_BOARD_MIG = "joi-contracts-mig-media-drill-1";

/** One-shot: ensure today's board includes a media-drill slot if missing. */
function ensureMediaDrillSlot(board: DailyContractBoard): DailyContractBoard {
  try {
    if (localStorage.getItem(MEDIA_DRILL_BOARD_MIG) === "1") return board;
  } catch {
    return board;
  }
  if (board.contracts.some((c) => isMediaDrillContract(c))) {
    try {
      localStorage.setItem(MEDIA_DRILL_BOARD_MIG, "1");
    } catch {
      /* ignore */
    }
    return board;
  }
  const def = CONTRACT_CATALOG.find((d) => d.kind === "media_drill");
  if (!def) return board;
  const rng = mulberry32(
    hashSeed(`${board.dayKey}|${board.mistressId}|inject-drill`),
  );
  const drill = instantiateMediaDrill(
    def,
    board.dayKey,
    board.mistressId,
    rng,
  );
  const openIdx = board.contracts.findIndex(
    (c) => c.status === "open" && c.acceptedAtMs == null,
  );
  const idx = openIdx >= 0 ? openIdx : 0;
  const contracts = board.contracts.slice();
  if (contracts.length === 0) contracts.push(drill);
  else contracts[idx] = drill;
  const next = { ...board, contracts };
  try {
    localStorage.setItem(MEDIA_DRILL_BOARD_MIG, "1");
    saveContractBoard(next);
  } catch {
    /* ignore */
  }
  return next;
}

/**
 * Ensure today's board for the active mistress exists.
 * Re-rolls when day or mistress changes, or when board has retired defs.
 */
export function ensureDailyContractBoard(
  now = new Date(),
): DailyContractBoard {
  const dayKey = contractsTodayKey(now);
  const mistressId = getActiveMistress().id;
  const nowMs = now.getTime();
  const existing = loadContractBoard();
  const carried = takeCarriedAccepted(existing);
  const previousOpen = (existing?.contracts ?? []).filter(
    (c) => isSeriesContract(c) && c.status === "open",
  );

  if (
    existing &&
    existing.dayKey === dayKey &&
    existing.mistressId === mistressId &&
    !boardNeedsReroll(existing)
  ) {
    const next = applySeriesBoard(
      syncOpenContractCopy(ensureMediaDrillSlot(expireOpen(existing, nowMs))),
      now,
      previousOpen,
    );
    if (next !== existing) saveContractBoard(next);
    return next;
  }

  const board = applySeriesBoard(
    ensureMediaDrillSlot(
      mergeCarriedAccepted(rollDailyBoard(dayKey, mistressId), carried),
    ),
    now,
    previousOpen,
  );
  saveContractBoard(board);
  return board;
}

export function countOpenContracts(board: DailyContractBoard | null): number {
  if (!board) return 0;
  const now = Date.now();
  return board.contracts.filter(
    (c) => c.status === "open" && now <= c.deadlineMs,
  ).length;
}

export type ContractReportResult = {
  board: DailyContractBoard;
  rewarded: number;
  status: ContractStatus;
  /** Human flash line when finish-debrief scored the payout. */
  rewardSummaryRu?: string;
};

export function reportContract(
  instanceId: string,
  outcome: "done" | "failed",
  opts?: {
    triggersReported?: number;
    finishDebrief?: FinishDebriefAnswers;
    /** Override the rolled reward (e.g. activity-debrief scoring). */
    reward?: number;
    now?: Date;
  },
): ContractReportResult | null {
  const now = opts?.now ?? new Date();
  const board = ensureDailyContractBoard(now);
  const idx = board.contracts.findIndex((c) => c.instanceId === instanceId);
  if (idx < 0) return null;
  const cur = board.contracts[idx]!;
  if (cur.status !== "open") {
    return { board, rewarded: 0, status: cur.status };
  }
  if (now.getTime() > cur.deadlineMs) {
    const expired: ContractInstance = { ...cur, status: "expired" };
    const contracts = board.contracts.slice();
    contracts[idx] = expired;
    const next = { ...board, contracts };
    saveContractBoard(next);
    emitContractLifecycle({ instance: expired, outcome: "expired" });
    recordSeriesChildOutcome(expired, "expired", 0, now);
    return { board: next, rewarded: 0, status: "expired" };
  }

  const status: ContractStatus = outcome === "done" ? "done" : "failed";
  const triggersReported =
    opts?.triggersReported != null
      ? Math.max(0, Math.floor(opts.triggersReported))
      : undefined;
  const finishAnswers = opts?.finishDebrief;
  let params: Record<string, string | number> = { ...cur.params };
  if (triggersReported != null) {
    params = { ...params, triggersReported };
  }
  if (finishAnswers) {
    for (const [k, v] of Object.entries(finishAnswers)) {
      params[`debrief_${k}`] = v;
    }
  }
  const updated: ContractInstance = { ...cur, status, params };
  const contracts = board.contracts.slice();
  contracts[idx] = updated;
  const next = { ...board, contracts };
  saveContractBoard(next);
  let rewarded = 0;
  let rewardSummaryRu: string | undefined;
  if (outcome === "done") {
    if (typeof opts?.reward === "number") {
      // Activity-debrief (or other) override takes precedence.
      rewarded = Math.max(0, Math.floor(opts.reward));
    } else if (isFinishDebriefContract(updated) && finishAnswers) {
      const scored = scoreFinishDebrief(
        updated.reward,
        finishDebriefPresetFor(updated),
        finishAnswers,
      );
      rewarded = scored.rewarded;
      rewardSummaryRu = scored.summaryRu;
    } else {
      rewarded =
        updated.reward +
        (triggersReported != null
          ? mediaDrillRewardBonus(triggersReported)
          : 0);
    }
  }
  emitContractLifecycle({
    instance: updated,
    outcome: status === "done" ? "done" : "failed",
  });
  recordSeriesChildOutcome(
    updated,
    status === "done" ? "done" : "failed",
    rewarded,
    now,
  );
  return {
    board: next,
    rewarded,
    status,
    rewardSummaryRu,
  };
}

export function findContract(
  instanceId: string,
): ContractInstance | null {
  const board = ensureDailyContractBoard();
  return board.contracts.find((c) => c.instanceId === instanceId) ?? null;
}

/** Put a program-assigned contract on today's board with fixed params. */
export function assignProgramContract(
  defId: string,
  paramOverrides: Record<string, string | number> = {},
  titleRu?: string,
): ContractInstance | null {
  const def = getContractDef(defId);
  if (!def) return null;
  const board = ensureDailyContractBoard();
  const rng = mulberry32(
    hashSeed(`${board.dayKey}|${defId}|program|${Date.now()}`),
  );
  const instance = instantiateContract(
    def,
    board.dayKey,
    board.mistressId,
    rng,
    paramOverrides,
  );
  const named = titleRu ? { ...instance, titleRu } : instance;
  const replaceAt = board.contracts.findIndex(
    (c) =>
      c.status === "open" &&
      c.acceptedAtMs == null &&
      c.defId !== defId &&
      !isSeriesContract(c),
  );
  const contracts = board.contracts.slice();
  if (replaceAt >= 0) {
    contracts[replaceAt] = named;
  } else {
    contracts.push(named);
  }
  saveContractBoard({ ...board, contracts });
  return named;
}

/**
 * Bind a live timer (cage / plug / denial) to a board row without replacing
 * an unrelated daily slot. Reuses an open row of the same def when present.
 */
export function ensureAcceptedProgramContract(
  defId: string,
  paramOverrides: Record<string, string | number> = {},
  opts?: { titleRu?: string; deadlineMs?: number; atMs?: number },
): ContractInstance | null {
  const def = getContractDef(defId);
  if (!def) return null;
  const board = ensureDailyContractBoard();
  const atMs = opts?.atMs ?? Date.now();
  const extraDeadline = opts?.deadlineMs;
  const idx = board.contracts.findIndex(
    (c) => c.status === "open" && c.defId === defId,
  );
  if (idx >= 0) {
    const cur = board.contracts[idx]!;
    const deadlineMs = Math.max(
      cur.deadlineMs,
      extraDeadline ?? 0,
      endOfLocalDayMs(board.dayKey),
    );
    if (isAcceptedOpen(cur)) {
      if (deadlineMs === cur.deadlineMs) return cur;
      const contracts = board.contracts.slice();
      const nextRow = { ...cur, deadlineMs };
      contracts[idx] = nextRow;
      saveContractBoard({ ...board, contracts });
      return nextRow;
    }
    const params = { ...cur.params, ...paramOverrides };
    const nextRow: ContractInstance = {
      ...cur,
      params,
      bodyRu: fillContractTemplate(def.instructionRu, params),
      titleRu: opts?.titleRu ?? cur.titleRu,
      acceptedAtMs: atMs,
      deadlineMs,
    };
    const contracts = board.contracts.slice();
    contracts[idx] = nextRow;
    saveContractBoard({ ...board, contracts });
    return nextRow;
  }
  const rng = mulberry32(
    hashSeed(`${board.dayKey}|${defId}|live|${atMs}`),
  );
  const instance = instantiateContract(
    def,
    board.dayKey,
    board.mistressId,
    rng,
    paramOverrides,
  );
  const nextRow: ContractInstance = {
    ...instance,
    titleRu: opts?.titleRu ?? instance.titleRu,
    acceptedAtMs: atMs,
    deadlineMs: Math.max(
      instance.deadlineMs,
      extraDeadline ?? 0,
    ),
  };
  saveContractBoard({
    ...board,
    contracts: [...board.contracts, nextRow],
  });
  return nextRow;
}

export function categoryLabelRu(cat: ContractCategory): string {
  return CONTRACT_CATEGORY_LABELS[cat] ?? cat;
}

export function contractBrief(defId: string): string {
  return getContractDef(defId)?.briefRu ?? "";
}

export function msUntilDeadline(deadlineMs: number, nowMs = Date.now()): number {
  return Math.max(0, deadlineMs - nowMs);
}

export function formatCountdown(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин`;
  return `${s % 60} с`;
}

export function startActiveContractSeries(
  defId: string,
  now = new Date(),
): StartSeriesResult & { board?: DailyContractBoard } {
  const result = startContractSeries(defId, now);
  if (!result.ok) return result;
  const board = ensureDailyContractBoard(now);
  return { ...result, board };
}

export function cancelActiveContractSeries(now = new Date()): DailyContractBoard {
  const board = ensureDailyContractBoard(now);
  const next = cancelContractSeries(
    board,
    now,
    createSeriesChildInstance,
    emitContractLifecycle,
  );
  saveContractBoard(next);
  return next;
}

export const MISTRESS_CONTRACT_LINES: Record<MistressId, string> = {
  hu_tao:
    "Сегодняшние контракты на доске. Не торгуйся — отмечай честно.",
  furina:
    "Суд опубликовал контракты дня. Исполнение обязательно, оправдания — нет.",
  sunna: "Айдол ждёт отчёт. Контракты простые — если не лениться.",
  sparkle:
    "Маска улыбается: пять бумажек на сегодня. Порвёшь — сам виноват.",
};
