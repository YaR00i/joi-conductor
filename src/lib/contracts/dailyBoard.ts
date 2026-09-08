import { getActiveMistress } from "../mistress";
import type { MistressId } from "../mistress/types";
import {
  CONTRACT_CATALOG,
  CONTRACT_CATEGORY_LABELS,
  getContractDef,
  isHabitContractId,
  type ContractCategory,
  type ContractDef,
  type ContractRollKey,
} from "./catalog";
import { getMergedContractCatalog } from "./userCatalog";
import {
  isMediaDrillContract,
  MEDIA_DRILL_FOCUS_TAGS,
  MEDIA_DRILL_TRIGGERS,
  rollMediaDrillAction,
  timerMinForLimit,
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

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function contractsTodayKey(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function endOfLocalDayMs(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999).getTime();
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

function fillTemplate(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = params[key];
    return v == null ? `{${key}}` : String(v);
  });
}

/** Pull latest catalog name/body onto open rows so copy waves land today. */
function syncOpenContractCopy(board: DailyContractBoard): DailyContractBoard {
  let changed = false;
  const contracts = board.contracts.map((c) => {
    if (c.status !== "open") return c;
    const def = getContractDef(c.defId);
    if (!def) return c;
    const titleRu = def.nameRu;
    const bodyRu = fillTemplate(def.instructionRu, c.params);
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

function rollParams(
  def: ContractDef,
  rng: () => number,
): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  const rolls = def.rolls;
  if (!rolls) return params;
  for (const key of Object.keys(rolls) as ContractRollKey[]) {
    const pool = rolls[key];
    if (!pool || pool.length === 0) continue;
    params[key] = pool[Math.floor(rng() * pool.length)]!;
  }
  return params;
}

function rollReward(def: ContractDef, rng: () => number): number {
  const lo = Math.min(def.rewardMin, def.rewardMax);
  const hi = Math.max(def.rewardMin, def.rewardMax);
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function instantiateMediaDrill(
  def: ContractDef,
  dayKey: string,
  mistressId: MistressId,
  rng: () => number,
): ContractInstance {
  const limitPool = (def.rolls?.limit as number[] | undefined) ?? [
    20, 40, 60, 80,
  ];
  const limit = limitPool[Math.floor(rng() * limitPool.length)]!;
  const tag =
    MEDIA_DRILL_FOCUS_TAGS[
      Math.floor(rng() * MEDIA_DRILL_FOCUS_TAGS.length)
    ]!;
  const trigger =
    MEDIA_DRILL_TRIGGERS[Math.floor(rng() * MEDIA_DRILL_TRIGGERS.length)]!;
  const action = rollMediaDrillAction(rng);
  const timerMin = timerMinForLimit(limit);
  const params: Record<string, string | number> = {
    limit,
    tag,
    trigger,
    actionLabel: action.actionRu,
    actionKind: action.actionKind,
    actionN: action.actionN,
    timerMin,
  };
  return {
    instanceId: `${dayKey}-${def.id}-${Math.floor(rng() * 1e9)}`,
    defId: def.id,
    dayKey,
    mistressId,
    category: def.category,
    titleRu: def.nameRu,
    bodyRu: fillTemplate(def.instructionRu, params),
    reward: rollReward(def, rng),
    deadlineMs: endOfLocalDayMs(dayKey),
    status: "open",
    params,
    difficulty: def.difficulty,
  };
}

function instantiate(
  def: ContractDef,
  dayKey: string,
  mistressId: MistressId,
  rng: () => number,
  paramOverrides?: Record<string, string | number>,
): ContractInstance {
  if (def.kind === "media_drill") {
    return instantiateMediaDrill(def, dayKey, mistressId, rng);
  }
  const params = { ...rollParams(def, rng), ...paramOverrides };
  if (def.kind === "finish_debrief" && def.finishDebriefPreset) {
    params.finishDebriefPreset = def.finishDebriefPreset;
  }
  return {
    instanceId: `${dayKey}-${def.id}-${Math.floor(rng() * 1e9)}`,
    defId: def.id,
    dayKey,
    mistressId,
    category: def.category,
    titleRu: def.nameRu,
    bodyRu: fillTemplate(def.instructionRu, params),
    reward: rollReward(def, rng),
    deadlineMs: endOfLocalDayMs(dayKey),
    status: "open",
    params,
    difficulty: def.difficulty,
  };
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
    contracts.push(instantiate(def, dayKey, mistressId, rng));
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
      contracts[replaceAt] = instantiate(hard, dayKey, mistressId, rng);
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
      contracts[replaceAt] = instantiate(habit, dayKey, mistressId, rng);
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
  const board = mergeCarriedAccepted(
    rollDailyBoard(dayKey, mistressId, prevSalt + 1),
    takeCarriedAccepted(existing),
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
    if (c.status === "open" && nowMs > c.deadlineMs && c.acceptedAtMs == null) {
      changed = true;
      return { ...c, status: "expired" as const };
    }
    return c;
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
    (c) => isAcceptedOpen(c) && !RETIRED_CONTRACT_DEF_IDS.has(c.defId),
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

  if (
    existing &&
    existing.dayKey === dayKey &&
    existing.mistressId === mistressId &&
    !boardNeedsReroll(existing)
  ) {
    const next = syncOpenContractCopy(
      ensureMediaDrillSlot(expireOpen(existing, nowMs)),
    );
    if (next !== existing) saveContractBoard(next);
    return next;
  }

  const board = ensureMediaDrillSlot(
    mergeCarriedAccepted(rollDailyBoard(dayKey, mistressId), carried),
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
  },
): ContractReportResult | null {
  const board = ensureDailyContractBoard();
  const idx = board.contracts.findIndex((c) => c.instanceId === instanceId);
  if (idx < 0) return null;
  const cur = board.contracts[idx]!;
  if (cur.status !== "open") {
    return { board, rewarded: 0, status: cur.status };
  }
  if (Date.now() > cur.deadlineMs) {
    const expired: ContractInstance = { ...cur, status: "expired" };
    const contracts = board.contracts.slice();
    contracts[idx] = expired;
    const next = { ...board, contracts };
    saveContractBoard(next);
    emitContractLifecycle({ instance: expired, outcome: "expired" });
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
  const instance = instantiate(
    def,
    board.dayKey,
    board.mistressId,
    rng,
    paramOverrides,
  );
  const named = titleRu ? { ...instance, titleRu } : instance;
  const replaceAt = board.contracts.findIndex(
    (c) => c.status === "open" && c.acceptedAtMs == null && c.defId !== defId,
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
      bodyRu: fillTemplate(def.instructionRu, params),
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
  const instance = instantiate(
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

export const MISTRESS_CONTRACT_LINES: Record<MistressId, string> = {
  hu_tao:
    "Сегодняшние контракты на доске. Не торгуйся — отмечай честно.",
  furina:
    "Суд опубликовал контракты дня. Исполнение обязательно, оправдания — нет.",
  sunna: "Айдол ждёт отчёт. Контракты простые — если не лениться.",
  sparkle:
    "Маска улыбается: пять бумажек на сегодня. Порвёшь — сам виноват.",
};
