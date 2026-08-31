import type {
  FinaleOutcome,
  QuestId,
  SessionMode,
  SessionParams,
  SessionState,
} from "../types";
import { getCumplay, getFinish } from "../catalog";
import {
  cageIsActive,
  clearCageLock,
  loadCageLock,
} from "../cageTimer";
import { clearDenialQuest, loadDenialQuest } from "../denialQuest";
import { MODE_LABELS } from "../labels";
import type { MistressId } from "../mistress/types";
import type { RouletteOption, RouletteStepDef } from "../planRoulette";
import type { RouletteStepId } from "../rouletteSettings";
import { getContractDef } from "./catalog";
import {
  markContractAccepted,
  type ContractInstance,
} from "./dailyBoard";

/** Eat-capable finish/cumplay pair for oral_next_ruin_eat seal. */
export const CEI_SEAL_FINISH_ID = "hand";
export const CEI_SEAL_CUMPLAY_ID = "swallow";

const STORAGE_KEY = "joi-contract-session-seed-v1";

/** Roulette / plan fields the contract pins after accept/seal. */
export type SessionSeedLockKey =
  | "mode"
  | "duration"
  | "edges"
  | "ruins"
  | "finaleOdds"
  | "finish"
  | "cumplay";

export type SessionSeedVerify =
  | { kind: "edges_min"; n: number }
  | { kind: "mode_in"; modes: SessionMode[] }
  | { kind: "finale_in"; outcomes: FinaleOutcome[] }
  /** Mid/finale CEI: ruin or cum happened → eat chain fulfilled. */
  | { kind: "ate_release" }
  /** Ruin finale sealed + live eat chain (session_ruin_only). */
  | { kind: "ruin_and_eat" }
  /** Complete a matching live quest exercise (CBT bridge). */
  | { kind: "quest_id"; questIds: QuestId[] }
  | { kind: "honor" };

/** One beat of a multi-step session contract. */
export type SessionSeedStepDef = {
  id: string;
  labelRu: string;
};

/** Multi-step CEI live chain: open → eat → thanks. */
export const CEI_PROGRESS_STEPS: SessionSeedStepDef[] = [
  { id: "cei_open", labelRu: "Покажи / не вытирай" },
  { id: "cei_eat", labelRu: "Съешь" },
  { id: "cei_thanks", labelRu: "Спасибо, хозяйка" },
];

/** Ruin-only composite: finale ruin, then same CEI eat chain. */
export const RUIN_EAT_PROGRESS_STEPS: SessionSeedStepDef[] = [
  { id: "ruin_finale", labelRu: "Финал — руин" },
  ...CEI_PROGRESS_STEPS,
];

export type SessionSeedProgressStatus =
  | "pending"
  | "awaiting"
  | "done"
  | "failed";

/**
 * Light multi-step progress on an accepted session obligation.
 * Single-step contracts use steps.length === 1.
 */
export type SessionSeedProgress = {
  steps: SessionSeedStepDef[];
  /** 0-based index of the active step. */
  currentStep: number;
  completedStepIds: string[];
  status: SessionSeedProgressStatus;
};

export type ActiveSessionSeed = {
  instanceId: string;
  dayKey: string;
  defId: string;
  titleRu: string;
  bodyRu: string;
  startedAtMs: number;
  /** End of local day / contract deadline — seal clears after this. */
  deadlineMs?: number;
  /**
   * Performance deadline = startedAtMs + durationLimitMin*60_000 (when the
   * contract defines an explicit perform window). Drives the live countdown
   * widget. Distinct from deadlineMs (end-of-day hard cap).
   */
  performDeadlineMs?: number;
  /** Stable sealed-fate overlay line for this accept. */
  sealedPhraseRu?: string;
  paramsPatch: Partial<SessionParams>;
  lockKeys: SessionSeedLockKey[];
  verify: SessionSeedVerify;
  /** auto = SessionEvent telemetry; honor = self-report still required */
  completion: "auto" | "honor";
  /** Optional live-session multi-step tracker (ruin→eat, later chains). */
  progress?: SessionSeedProgress;
  /** Hands-off rest duration for edge_hands_off (seconds). */
  handsOffSec?: number;
  /**
   * Denial quest untilMs started by this accept — clear only if still matching.
   */
  linkedDenialUntilMs?: number;
  /**
   * Cage lock untilMs started by this accept — clear only if still matching.
   */
  linkedCageUntilMs?: number;
  /**
   * Force / settle via this quest id (CBT bridge).
   * Reward rule: contract pays; quest cinders suppressed when set.
   */
  linkedQuestId?: QuestId;
  /**
   * Soft media-drill bridge: remind / hint this tag in a live session.
   */
  mediaBridgeTag?: string;
  mediaBridgeTriggerRu?: string;
};

export type SessionSeedEval =
  | { result: "done" }
  | { result: "failed"; reasonRu: string }
  | { result: "pending" };

export const SESSION_SEAL_ACCEPT_CTA_RU = "Принять";
export const SESSION_SEAL_CANCEL_CTA_RU = "Снять печать";
export const SESSION_SEAL_ACTIVE_TAG_RU = "Печать";

/** Shared mistress-flavored overlays for sealed drums / roulette. */
export const SEALED_FATE_PHRASES_RU = [
  "Судьба предрешена",
  "Условие принято",
  "Печать госпожи",
  "Выбора больше нет",
  "Так велела судьба",
  "Контракт запечатан",
] as const;

const MISTRESS_SEALED_PHRASE_RU: Record<MistressId, string> = {
  hu_tao: "Ху Тао уже решила",
  furina: "Вердикт вынесен",
  sunna: "Сценарий утверждён",
  sparkle: "Маска всё решила",
};

const SESSION_MOD_SEEDABLE = new Set([
  "session_ruin_only",
  "session_deny_tomorrow",
  "session_anal_plug_mod",
  "session_no_hands",
  "session_long_edges",
]);

const EDGE_SEEDABLE = new Set([
  "edge_count",
  "edge_metronome",
  "edge_hands_off",
  "edge_slow",
]);

/** Live obligations that track mid-session goals (may also seal finish/cumplay). */
const LIVE_GOAL_SEEDABLE = new Set(["oral_next_ruin_eat"]);

/** CBT contracts that force/settle via ball_taps quest. */
const CBT_QUEST_SEEDABLE = new Set(["cbt_taps", "cbt_edge_pain"]);

/** Hour-wear timers: chastity cage or anal plug (out-of-session pill). */
const WEAR_TIMER_SEEDABLE = new Set([
  "chastity_locked_hours",
  "chastity_key_lost",
  "anal_plug_hours",
]);

export function isWearTimerContractDefId(defId: string): boolean {
  return WEAR_TIMER_SEEDABLE.has(defId);
}

export const CONTRACT_PLAY_LANES = ["session", "live", "task"] as const;
export type ContractPlayLane = (typeof CONTRACT_PLAY_LANES)[number];

/** Where accepting this contract plays out. */
export function contractPlayLane(defId: string): ContractPlayLane {
  if (
    defId === "session_deny_tomorrow" ||
    defId === "chastity_night" ||
    isWearTimerContractDefId(defId)
  ) {
    return "live";
  }
  if (
    SESSION_MOD_SEEDABLE.has(defId) ||
    EDGE_SEEDABLE.has(defId) ||
    LIVE_GOAL_SEEDABLE.has(defId) ||
    CBT_QUEST_SEEDABLE.has(defId)
  ) {
    return "session";
  }
  return "task";
}

export function contractPlayLaneLabelRu(lane: ContractPlayLane): string {
  switch (lane) {
    case "session":
      return "Сессия Conductor";
    case "live":
      return "Вне сессии · таймер";
    case "task":
      return "Вне сессии · контракт";
    default: {
      const _exhaustive: never = lane;
      return _exhaustive;
    }
  }
}

export function wearTimerKindForDefId(
  defId: string,
): "cage" | "plug" | null {
  if (defId === "anal_plug_hours") return "plug";
  if (defId === "chastity_locked_hours" || defId === "chastity_key_lost") {
    return "cage";
  }
  return null;
}

export function isSessionSeedableContract(c: ContractInstance): boolean {
  if (SESSION_MOD_SEEDABLE.has(c.defId)) return true;
  if (EDGE_SEEDABLE.has(c.defId)) return true;
  if (LIVE_GOAL_SEEDABLE.has(c.defId)) return true;
  if (CBT_QUEST_SEEDABLE.has(c.defId)) return true;
  if (WEAR_TIMER_SEEDABLE.has(c.defId)) return true;
  // Generic catalog entries use an honor-only seed so «Принять» can start the
  // perform timer even when the task happens outside a conductor session.
  return Boolean(getContractDef(c.defId));
}

export function isLiveGoalSessionSeed(
  seed: ActiveSessionSeed | null | undefined,
): boolean {
  if (!seed) return false;
  if (seed.verify.kind === "ate_release") return true;
  if (seed.verify.kind === "ruin_and_eat") return true;
  if (seed.verify.kind === "quest_id") return true;
  if (seed.verify.kind === "edges_min" && seed.progress) return true;
  return false;
}

function numParam(
  params: Record<string, string | number>,
  key: string,
): number | null {
  const v = params[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function durationSecFromContract(c: ContractInstance): number | undefined {
  const minutes = numParam(c.params, "minutes");
  if (minutes != null && minutes > 0) {
    return Math.round(minutes * 60);
  }
  const hint = getContractDef(c.defId)?.durationHintMin;
  if (hint != null && hint > 0) {
    // Session-mod hints are often "5" (meta); prefer a playable floor.
    const playMin = hint <= 10 ? Math.max(10, hint * 2) : hint;
    return playMin * 60;
  }
  return undefined;
}

function hashSalt(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick a sealed-fate phrase; lightly bias toward mistress line. */
export function pickSealedFatePhraseRu(
  mistressId: MistressId | null | undefined,
  salt = "",
): string {
  const mistressLine =
    mistressId != null ? MISTRESS_SEALED_PHRASE_RU[mistressId] : null;
  const pool = mistressLine
    ? [...SEALED_FATE_PHRASES_RU, mistressLine, mistressLine]
    : [...SEALED_FATE_PHRASES_RU];
  const idx = hashSalt(`${mistressId ?? "any"}:${salt}`) % pool.length;
  return pool[idx]!;
}

export function sealedFatePhraseForSeed(
  seed: ActiveSessionSeed,
  mistressId?: MistressId | null,
): string {
  if (seed.sealedPhraseRu && seed.sealedPhraseRu.trim()) {
    return seed.sealedPhraseRu;
  }
  return pickSealedFatePhraseRu(
    mistressId,
    `${seed.instanceId}:${seed.defId}`,
  );
}

function withSealMeta(
  seed: Omit<ActiveSessionSeed, "deadlineMs" | "sealedPhraseRu">,
  c: ContractInstance,
): ActiveSessionSeed {
  // Performance countdown timer: explicit durationLimitMin wins, then a
  // rolled {minutes} value, finally the catalog's durationHintMin.
  const def = getContractDef(c.defId);
  let performMs: number | undefined;
  const limitMin =
    def?.durationLimitMin ?? (def?.durationHintMin ?? undefined);
  if (typeof limitMin === "number" && limitMin > 0) {
    performMs = seed.startedAtMs + Math.round(limitMin) * 60_000;
  } else {
    const minutes = numParam(c.params, "minutes");
    if (minutes != null && minutes > 0) {
      performMs = seed.startedAtMs + Math.round(minutes) * 60_000;
    }
  }
  return {
    ...seed,
    deadlineMs: c.deadlineMs,
    performDeadlineMs: performMs,
    sealedPhraseRu: pickSealedFatePhraseRu(
      c.mistressId,
      `${c.instanceId}:${c.defId}`,
    ),
  };
}

function sessionDurationFromHint(c: ContractInstance): number | undefined {
  const hint = getContractDef(c.defId)?.durationHintMin;
  if (hint != null && hint > 0) {
    const playMin = hint <= 10 ? Math.max(10, hint * 2) : hint;
    return playMin * 60;
  }
  return undefined;
}

function buildEdgesSeed(
  c: ContractInstance,
  edges: number,
  opts?: { durationSec?: number | undefined; skipMinutesParam?: boolean },
): ActiveSessionSeed {
  const n = Math.max(1, Math.floor(edges));
  const durationSec = opts?.skipMinutesParam
    ? (opts.durationSec ?? sessionDurationFromHint(c))
    : (opts?.durationSec ?? durationSecFromContract(c));
  const paramsPatch: Partial<SessionParams> = {
    edgesTarget: n,
  };
  if (durationSec != null) {
    paramsPatch.durationSec = durationSec;
  }
  const lockKeys: SessionSeedLockKey[] = ["edges"];
  if (durationSec != null) lockKeys.push("duration");
  return withSealMeta(
    {
      instanceId: c.instanceId,
      dayKey: c.dayKey,
      defId: c.defId,
      titleRu: c.titleRu,
      bodyRu: c.bodyRu,
      startedAtMs: Date.now(),
      paramsPatch,
      lockKeys,
      verify: { kind: "edges_min", n },
      completion: "auto",
      progress: {
        steps: [
          {
            id: "edges_quota",
            labelRu: `${n} эджей`,
          },
        ],
        currentStep: 0,
        completedStepIds: [],
        status: "pending",
      },
    },
    c,
  );
}

/** Map a catalog contract into a session seed plan, or null if not seedable. */
export function buildSessionSeedFromContract(
  c: ContractInstance,
): ActiveSessionSeed | null {
  if (c.status !== "open") return null;

  switch (c.defId) {
    case "session_long_edges":
    case "edge_count":
    case "edge_metronome":
    case "edge_slow": {
      const n = numParam(c.params, "n") ?? 6;
      return buildEdgesSeed(c, n);
    }
    case "edge_hands_off": {
      // `minutes` is hands-off duration, not session length.
      const n = numParam(c.params, "n") ?? 3;
      const handsOffMin = numParam(c.params, "minutes") ?? 10;
      const seed = buildEdgesSeed(c, n, { skipMinutesParam: true });
      const handsOffSec = Math.max(60, Math.round(handsOffMin * 60));
      return {
        ...seed,
        handsOffSec,
        progress: {
          steps: [
            {
              id: "edges_quota",
              labelRu: `${Math.max(1, Math.floor(n))} эджей`,
            },
            {
              id: "hands_off",
              labelRu: `Руки прочь ${Math.round(handsOffMin)} мин`,
            },
          ],
          currentStep: 0,
          completedStepIds: [],
          status: "pending",
        },
      };
    }
    case "session_ruin_only": {
      const durationSec = durationSecFromContract(c);
      const lockKeys: SessionSeedLockKey[] =
        durationSec != null
          ? ["finaleOdds", "ruins", "duration", "finish", "cumplay"]
          : ["finaleOdds", "ruins", "finish", "cumplay"];
      return withSealMeta(
        {
          instanceId: c.instanceId,
          dayKey: c.dayKey,
          defId: c.defId,
          titleRu: c.titleRu,
          bodyRu: c.bodyRu,
          startedAtMs: Date.now(),
          paramsPatch: {
            pCum: 0.08,
            pRuin: 0.72,
            ruinsTarget: 1,
            finishId: CEI_SEAL_FINISH_ID,
            cumplayId: CEI_SEAL_CUMPLAY_ID,
            ...(durationSec != null ? { durationSec } : {}),
          },
          lockKeys,
          verify: { kind: "ruin_and_eat" },
          completion: "auto",
          progress: {
            steps: [...RUIN_EAT_PROGRESS_STEPS],
            currentStep: 0,
            completedStepIds: [],
            status: "pending",
          },
        },
        c,
      );
    }
    case "session_deny_tomorrow": {
      const durationSec = durationSecFromContract(c);
      return withSealMeta(
        {
          instanceId: c.instanceId,
          dayKey: c.dayKey,
          defId: c.defId,
          titleRu: c.titleRu,
          bodyRu: c.bodyRu,
          startedAtMs: Date.now(),
          paramsPatch: {
            pCum: 0,
            pRuin: 0,
            ...(durationSec != null ? { durationSec } : {}),
          },
          lockKeys:
            durationSec != null ? ["finaleOdds", "duration"] : ["finaleOdds"],
          verify: { kind: "finale_in", outcomes: ["deny"] },
          completion: "auto",
        },
        c,
      );
    }
    case "session_anal_plug_mod": {
      const durationSec = durationSecFromContract(c);
      return withSealMeta(
        {
          instanceId: c.instanceId,
          dayKey: c.dayKey,
          defId: c.defId,
          titleRu: c.titleRu,
          bodyRu: c.bodyRu,
          startedAtMs: Date.now(),
          paramsPatch: {
            mode: "anal",
            ...(durationSec != null ? { durationSec } : {}),
          },
          lockKeys: durationSec != null ? ["mode", "duration"] : ["mode"],
          verify: { kind: "mode_in", modes: ["anal"] },
          completion: "auto",
        },
        c,
      );
    }
    case "session_no_hands": {
      const durationSec = durationSecFromContract(c);
      return withSealMeta(
        {
          instanceId: c.instanceId,
          dayKey: c.dayKey,
          defId: c.defId,
          titleRu: c.titleRu,
          bodyRu: c.bodyRu,
          startedAtMs: Date.now(),
          paramsPatch: {
            mode: "prone",
            ...(durationSec != null ? { durationSec } : {}),
          },
          lockKeys: durationSec != null ? ["mode", "duration"] : ["mode"],
          verify: { kind: "mode_in", modes: ["prone", "onahole", "anal"] },
          completion: "auto",
        },
        c,
      );
    }
    case "oral_next_ruin_eat": {
      // Seal finish/cumplay toward eat-capable pair; live open→eat→thanks.
      return withSealMeta(
        {
          instanceId: c.instanceId,
          dayKey: c.dayKey,
          defId: c.defId,
          titleRu: c.titleRu,
          bodyRu: c.bodyRu,
          startedAtMs: Date.now(),
          paramsPatch: {
            finishId: CEI_SEAL_FINISH_ID,
            cumplayId: CEI_SEAL_CUMPLAY_ID,
          },
          lockKeys: ["finish", "cumplay"],
          verify: { kind: "ate_release" },
          completion: "auto",
          progress: {
            steps: [...CEI_PROGRESS_STEPS],
            currentStep: 0,
            completedStepIds: [],
            status: "pending",
          },
        },
        c,
      );
    }
    case "cbt_taps":
    case "cbt_edge_pain": {
      return withSealMeta(
        {
          instanceId: c.instanceId,
          dayKey: c.dayKey,
          defId: c.defId,
          titleRu: c.titleRu,
          bodyRu: c.bodyRu,
          startedAtMs: Date.now(),
          paramsPatch: {},
          lockKeys: [],
          verify: { kind: "quest_id", questIds: ["ball_taps"] },
          completion: "auto",
          linkedQuestId: "ball_taps",
          progress: {
            steps: [
              {
                id: "ball_taps_quest",
                labelRu: "Квест: ударь по яйцам",
              },
            ],
            currentStep: 0,
            completedStepIds: [],
            status: "awaiting",
          },
        },
        c,
      );
    }
    case "chastity_locked_hours":
    case "chastity_key_lost":
    case "anal_plug_hours": {
      const hours = numParam(c.params, "hours") ?? (c.defId === "anal_plug_hours" ? 2 : 4);
      const kind = wearTimerKindForDefId(c.defId) ?? "cage";
      const label =
        kind === "plug"
          ? `Пробка ${Math.max(0.25, hours)} ч`
          : `Клетка ${Math.max(0.25, hours)} ч`;
      return withSealMeta(
        {
          instanceId: c.instanceId,
          dayKey: c.dayKey,
          defId: c.defId,
          titleRu: c.titleRu,
          bodyRu: c.bodyRu,
          startedAtMs: Date.now(),
          paramsPatch: {},
          lockKeys: [],
          verify: { kind: "honor" },
          completion: "honor",
          progress: {
            steps: [
              {
                id: kind === "plug" ? "plug_hours" : "cage_hours",
                labelRu: label,
              },
            ],
            currentStep: 0,
            completedStepIds: [],
            status: "awaiting",
          },
        },
        c,
      );
    }
    default: {
      // Every catalog contract can be explicitly accepted. Session modifiers
      // may lock the planned duration; ordinary/offline contracts get an
      // honor-only seal whose performDeadlineMs drives the visible countdown.
      const isSessionMod = getContractDef(c.defId)?.category === "session_mod";
      const durationSec = durationSecFromContract(c);
      return withSealMeta(
        {
          instanceId: c.instanceId,
          dayKey: c.dayKey,
          defId: c.defId,
          titleRu: c.titleRu,
          bodyRu: c.bodyRu,
          startedAtMs: Date.now(),
          paramsPatch:
            isSessionMod && durationSec != null ? { durationSec } : {},
          lockKeys:
            isSessionMod && durationSec != null ? ["duration"] : [],
          verify: { kind: "honor" },
          completion: "honor",
        },
        c,
      );
    }
  }
}

export function loadActiveSessionSeed(): ActiveSessionSeed | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveSessionSeed;
    if (
      typeof parsed.instanceId !== "string" ||
      typeof parsed.defId !== "string" ||
      !parsed.paramsPatch ||
      !Array.isArray(parsed.lockKeys)
    ) {
      return null;
    }
    return withCatalogTitle(parsed);
  } catch {
    return null;
  }
}

function withCatalogTitle(seed: ActiveSessionSeed): ActiveSessionSeed {
  const nameRu = getContractDef(seed.defId)?.nameRu;
  if (!nameRu || nameRu === seed.titleRu) return seed;
  const next = { ...seed, titleRu: nameRu };
  saveActiveSessionSeed(next);
  return next;
}

export function saveActiveSessionSeed(seed: ActiveSessionSeed): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  } catch {
    /* quota */
  }
}

/** Persist progress mutations (arm / step done) without changing identity. */
export function updateActiveSessionSeed(
  seed: ActiveSessionSeed,
): ActiveSessionSeed {
  saveActiveSessionSeed(seed);
  return seed;
}

export function clearActiveSessionSeed(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Clear denial/cage only when this seed started them (matching untilMs).
 * Does not clear the seed itself.
 */
export function unlinkSessionSeedSideEffects(
  seed: ActiveSessionSeed | null | undefined,
  opts?: { denial?: boolean; cage?: boolean },
): { clearedDenial: boolean; clearedCage: boolean } {
  let clearedDenial = false;
  let clearedCage = false;
  if (!seed) return { clearedDenial, clearedCage };
  const doDenial = opts?.denial !== false;
  const doCage = opts?.cage !== false;

  if (doDenial && typeof seed.linkedDenialUntilMs === "number") {
    const q = loadDenialQuest();
    if (q && q.untilMs === seed.linkedDenialUntilMs) {
      clearDenialQuest();
      clearedDenial = true;
    }
  }
  if (doCage && typeof seed.linkedCageUntilMs === "number") {
    const lock = loadCageLock();
    if (lock && lock.untilMs === seed.linkedCageUntilMs) {
      clearCageLock();
      clearedCage = true;
    }
  }
  return { clearedDenial, clearedCage };
}

/** Cancel seal + unlink denial/cage started by this accept. */
export function clearActiveSessionSeedWithSideEffects(): {
  clearedDenial: boolean;
  clearedCage: boolean;
} {
  const seed = loadActiveSessionSeed();
  const result = unlinkSessionSeedSideEffects(seed);
  clearActiveSessionSeed();
  return result;
}

/** True when a chastity seed's linked cage window has elapsed. */
export function chastityCageWindowElapsed(
  seed: ActiveSessionSeed,
  nowMs = Date.now(),
): boolean {
  if (typeof seed.linkedCageUntilMs !== "number") return false;
  if (nowMs < seed.linkedCageUntilMs) return false;
  // Window ended — cage may already be auto-cleared by the pill.
  const lock = loadCageLock();
  if (lock && lock.untilMs === seed.linkedCageUntilMs && cageIsActive(lock, nowMs)) {
    return false;
  }
  return true;
}

/** Early cage clear before linked deadline → fail chastity honor. */
export function chastityCageClearedEarly(
  seed: ActiveSessionSeed,
  nowMs = Date.now(),
): boolean {
  if (typeof seed.linkedCageUntilMs !== "number") return false;
  if (nowMs >= seed.linkedCageUntilMs) return false;
  const lock = loadCageLock();
  if (!lock) return true;
  if (lock.untilMs !== seed.linkedCageUntilMs) return true;
  return !cageIsActive(lock, nowMs);
}

export function startSessionSeedFromContract(
  contract: ContractInstance,
): ActiveSessionSeed | null {
  const seed = buildSessionSeedFromContract(contract);
  if (!seed) return null;
  saveActiveSessionSeed(seed);
  markContractAccepted(contract.instanceId, seed.startedAtMs);
  return seed;
}

/**
 * Drop seal when the backing contract is gone, closed, or past deadline.
 * Returns the seed still considered active, or null after clear.
 */
export type PruneSessionSeedResult = {
  seed: ActiveSessionSeed | null;
  clearedDenial: boolean;
  clearedCage: boolean;
};

export function pruneStaleSessionSeed(
  findOpen: (instanceId: string) => ContractInstance | null | undefined,
  nowMs = Date.now(),
  current: ActiveSessionSeed | null = loadActiveSessionSeed(),
): ActiveSessionSeed | null {
  return pruneStaleSessionSeedDetailed(findOpen, nowMs, current).seed;
}

/** Like pruneStaleSessionSeed, but reports linked denial/cage clears. */
export function pruneStaleSessionSeedDetailed(
  findOpen: (instanceId: string) => ContractInstance | null | undefined,
  nowMs = Date.now(),
  current: ActiveSessionSeed | null = loadActiveSessionSeed(),
): PruneSessionSeedResult {
  const seed = current;
  if (!seed) {
    return { seed: null, clearedDenial: false, clearedCage: false };
  }
  const open = findOpen(seed.instanceId);
  if (!open || open.status !== "open") {
    const side = unlinkSessionSeedSideEffects(seed);
    clearActiveSessionSeed();
    return { seed: null, ...side };
  }
  // Prefer the live board deadline so a carried accept can outlive the
  // original calendar day without the seed being wiped at midnight.
  if (nowMs > open.deadlineMs) {
    const side = unlinkSessionSeedSideEffects(seed);
    clearActiveSessionSeed();
    return { seed: null, ...side };
  }
  return { seed, clearedDenial: false, clearedCage: false };
}

export function applySessionSeedToParams(
  base: SessionParams,
  seed: ActiveSessionSeed | null,
): SessionParams {
  if (!seed) return base;
  const patch = seed.paramsPatch;
  return {
    ...base,
    ...patch,
    // Keep arrays from base unless explicitly patched.
    allowedFunctionIds:
      patch.allowedFunctionIds ?? base.allowedFunctionIds,
    allowedPatternIds: patch.allowedPatternIds ?? base.allowedPatternIds,
    allowedToyIds: patch.allowedToyIds ?? base.allowedToyIds,
  };
}

export function sessionSeedHasLock(
  seed: ActiveSessionSeed | null | undefined,
  key: SessionSeedLockKey,
): boolean {
  return Boolean(seed?.lockKeys.includes(key));
}

export function lockKeyToRouletteStep(
  key: SessionSeedLockKey,
): RouletteStepId | null {
  switch (key) {
    case "mode":
      return "mode";
    case "duration":
      return "duration";
    case "edges":
      return "edges";
    case "ruins":
      return "ruins";
    case "finaleOdds":
      return "finaleOdds";
    case "finish":
      return "finish";
    case "cumplay":
      return "cumplay";
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

export function rouletteStepToLockKey(
  stepId: RouletteStepId,
): SessionSeedLockKey | null {
  switch (stepId) {
    case "mode":
      return "mode";
    case "duration":
      return "duration";
    case "edges":
      return "edges";
    case "ruins":
      return "ruins";
    case "finaleOdds":
      return "finaleOdds";
    case "finish":
      return "finish";
    case "cumplay":
    case "cumplay_heavy":
      return "cumplay";
    case "mood":
    case "bpm":
    case "tags":
    case "tags_medium":
    case "tags_hard":
    case "tags_sadistic":
    case "character":
    case "media_type":
    case "toys_count":
    case "toys_1":
    case "toys_2":
    case "toys_3":
      return null;
    default: {
      const _exhaustive: never = stepId;
      return _exhaustive;
    }
  }
}

export function sessionSeedLocksRouletteStep(
  seed: ActiveSessionSeed | null | undefined,
  stepId: RouletteStepId,
): boolean {
  if (!seed) return false;
  const key = rouletteStepToLockKey(stepId);
  return key != null && sessionSeedHasLock(seed, key);
}

/** Single sealed outcome for a locked roulette axis, or null if unlocked. */
export function buildSealedRouletteOption(
  seed: ActiveSessionSeed,
  stepId: RouletteStepId,
  mistressId?: MistressId | null,
): RouletteOption | null {
  if (!sessionSeedLocksRouletteStep(seed, stepId)) return null;
  const phrase = sealedFatePhraseForSeed(seed, mistressId);
  const color = "#c4895a";

  switch (stepId) {
    case "mode": {
      const mode = seed.paramsPatch.mode;
      if (!mode) return null;
      const label =
        MODE_LABELS[mode]?.nameRu ?? mode;
      return {
        id: mode,
        labelRu: `${label} · ${phrase}`,
        weight: 1,
        color,
        unlocked: true,
      };
    }
    case "duration": {
      const sec = seed.paramsPatch.durationSec;
      if (typeof sec !== "number" || !(sec > 0)) return null;
      const min = Math.max(1, Math.round(sec / 60));
      return {
        id: `seal_dur_${sec}`,
        labelRu: `${min} мин · ${phrase}`,
        weight: 1,
        color,
        payload: { sec },
        unlocked: true,
      };
    }
    case "edges": {
      const n = seed.paramsPatch.edgesTarget;
      if (typeof n !== "number" || !(n >= 0)) return null;
      return {
        id: `seal_edges_${n}`,
        labelRu: `${n} · ${phrase}`,
        weight: 1,
        color,
        payload: { n, nMin: n, nMax: n },
        unlocked: true,
      };
    }
    case "ruins": {
      const n = seed.paramsPatch.ruinsTarget;
      if (typeof n !== "number" || !(n >= 0)) return null;
      return {
        id: `seal_ruins_${n}`,
        labelRu: `${n} · ${phrase}`,
        weight: 1,
        color,
        payload: { n, nMin: n, nMax: n },
        unlocked: true,
      };
    }
    case "finaleOdds": {
      const pCum = seed.paramsPatch.pCum;
      const pRuin = seed.paramsPatch.pRuin;
      if (typeof pCum !== "number" || typeof pRuin !== "number") return null;
      return {
        id: `seal_finale_${Math.round(pCum * 100)}_${Math.round(pRuin * 100)}`,
        labelRu: phrase,
        weight: 1,
        color,
        payload: { pCum, pRuin },
        unlocked: true,
      };
    }
    case "finish": {
      const id = seed.paramsPatch.finishId;
      if (!id) return null;
      const label = getFinish(id)?.nameRu ?? id;
      return {
        id,
        labelRu: `${label} · ${phrase}`,
        weight: 1,
        color,
        unlocked: true,
      };
    }
    case "cumplay":
    case "cumplay_heavy": {
      const id = seed.paramsPatch.cumplayId;
      if (!id) return null;
      const label = getCumplay(id)?.nameRu ?? id;
      return {
        id,
        labelRu: `${label} · ${phrase}`,
        weight: 1,
        color,
        unlocked: true,
      };
    }
    case "mood":
    case "bpm":
    case "tags":
    case "tags_medium":
    case "tags_hard":
    case "tags_sadistic":
    case "character":
    case "media_type":
    case "toys_count":
    case "toys_1":
    case "toys_2":
    case "toys_3":
      return null;
    default: {
      const _exhaustive: never = stepId;
      return _exhaustive;
    }
  }
}

/** Collapse locked roulette steps to a single sealed fate option. */
export function applySealToRouletteStep(
  step: RouletteStepDef,
  seed: ActiveSessionSeed | null | undefined,
  mistressId?: MistressId | null,
): RouletteStepDef {
  if (!seed) return step;
  const sealed = buildSealedRouletteOption(seed, step.id, mistressId);
  if (!sealed) return step;
  return {
    ...step,
    options: [sealed],
  };
}

export function applySealToRouletteSteps(
  steps: RouletteStepDef[],
  seed: ActiveSessionSeed | null | undefined,
  mistressId?: MistressId | null,
): RouletteStepDef[] {
  if (!seed) return steps;
  return steps.map((s) => applySealToRouletteStep(s, seed, mistressId));
}

export function sessionSeedLockLabelsRu(seed: ActiveSessionSeed): string[] {
  return seed.lockKeys.map((key) => {
    switch (key) {
      case "mode":
        return seed.paramsPatch.mode
          ? `режим ${MODE_LABELS[seed.paramsPatch.mode]?.nameRu ?? seed.paramsPatch.mode}`
          : "режим";
      case "duration": {
        const sec = seed.paramsPatch.durationSec;
        if (typeof sec === "number") {
          return `${Math.round(sec / 60)} мин`;
        }
        return "длительность";
      }
      case "edges":
        return typeof seed.paramsPatch.edgesTarget === "number"
          ? `эджи ≥ ${seed.paramsPatch.edgesTarget}`
          : "эджи";
      case "ruins":
        return typeof seed.paramsPatch.ruinsTarget === "number"
          ? `руины ${seed.paramsPatch.ruinsTarget}`
          : "руины";
      case "finaleOdds":
        return "шансы финала";
      case "finish": {
        const id = seed.paramsPatch.finishId;
        if (!id) return "куда кончить";
        return getFinish(id)?.nameRu ?? id;
      }
      case "cumplay": {
        const id = seed.paramsPatch.cumplayId;
        if (!id) return "cumplay";
        return getCumplay(id)?.nameRu ?? id;
      }
      default: {
        const _exhaustive: never = key;
        return _exhaustive;
      }
    }
  });
}

export function sessionSeedVerifyLabelRu(seed: ActiveSessionSeed): string {
  if (isWearTimerContractDefId(seed.defId)) {
    return "таймер · проверит Conductor";
  }
  switch (seed.verify.kind) {
    case "edges_min":
      return `авто · ${seed.verify.n} эджей`;
    case "mode_in":
      return `авто · режим`;
    case "finale_in":
      return `авто · финал`;
    case "ate_release":
      return "авто · open→eat→thanks";
    case "ruin_and_eat":
      return "авто · руин + съесть";
    case "quest_id":
      return "авто · квест CBT";
    case "honor":
      return "на честности";
    default: {
      const _exhaustive: never = seed.verify;
      return _exhaustive;
    }
  }
}

/** Short progress chip for banners / cards, e.g. «1/1». */
export function sessionSeedProgressLabelRu(
  seed: ActiveSessionSeed,
): string | null {
  const progress = seed.progress;
  if (!progress || progress.steps.length === 0) return null;
  const total = progress.steps.length;
  const done = progress.completedStepIds.length;
  const cur = Math.min(total, Math.max(1, progress.currentStep + 1));
  if (progress.status === "done") return `${total}/${total}`;
  if (done > 0) return `${done}/${total}`;
  return `${cur}/${total}`;
}

/**
 * Evaluate contract after a completed session.
 * Abort → pending (keep seed). Honor verify → pending (self-report).
 * Live ate_release may already be settled mid-session (seed cleared).
 */
export function evaluateSessionSeed(
  seed: ActiveSessionSeed,
  state: Pick<
    SessionState,
    "edgesDone" | "ruinsDone" | "finaleOutcome" | "params"
  > | null,
  reason: "complete" | "abort",
): SessionSeedEval {
  if (reason !== "complete" || !state) {
    return { result: "pending" };
  }

  switch (seed.verify.kind) {
    case "honor":
      return { result: "pending" };
    case "edges_min": {
      if (seed.progress?.status === "done") {
        return { result: "done" };
      }
      if (seed.progress?.status === "failed") {
        return {
          result: "failed",
          reasonRu: "Нарушение условия печати",
        };
      }
      if (state.edgesDone < seed.verify.n) {
        return {
          result: "failed",
          reasonRu: `Эджей ${state.edgesDone}/${seed.verify.n}`,
        };
      }
      // Quota met but multi-step still open (hands-off rest).
      if (seed.progress && seed.progress.steps.length > 1) {
        return {
          result: "failed",
          reasonRu: "Руки прочь не выдержаны",
        };
      }
      return { result: "done" };
    }
    case "mode_in": {
      if (seed.verify.modes.includes(state.params.mode)) {
        return { result: "done" };
      }
      return {
        result: "failed",
        reasonRu: `Режим был «${MODE_LABELS[state.params.mode]?.nameRu ?? state.params.mode}»`,
      };
    }
    case "finale_in": {
      const outcome = state.finaleOutcome;
      if (!outcome) return { result: "pending" };
      if (seed.verify.outcomes.includes(outcome)) {
        return { result: "done" };
      }
      return {
        result: "failed",
        reasonRu: `Финал: ${outcome}`,
      };
    }
    case "ate_release": {
      if (seed.progress?.status === "done") {
        return { result: "done" };
      }
      if (seed.progress?.status === "failed") {
        return {
          result: "failed",
          reasonRu: "Не съел по контракту",
        };
      }
      const hadRelease =
        state.ruinsDone > 0 ||
        state.finaleOutcome === "ruin" ||
        state.finaleOutcome === "cum";
      // No ruin/cum this session — keep obligation for a later run.
      if (!hadRelease) return { result: "pending" };
      // Had a release but CEI chain never finished mid-session.
      if (seed.progress?.status === "awaiting") {
        return {
          result: "failed",
          reasonRu: "Был руин/конч — цепочка CEI не закрыта",
        };
      }
      return {
        result: "failed",
        reasonRu: "Был руин/конч — контракт не закрыт",
      };
    }
    case "ruin_and_eat": {
      if (seed.progress?.status === "failed") {
        return {
          result: "failed",
          reasonRu: "Руин+съесть: нарушение печати",
        };
      }
      const outcome = state.finaleOutcome;
      if (!outcome) return { result: "pending" };
      if (outcome !== "ruin") {
        return {
          result: "failed",
          reasonRu: `Нужен финал-руин, было: ${outcome}`,
        };
      }
      if (seed.progress?.status === "done") {
        return { result: "done" };
      }
      return {
        result: "failed",
        reasonRu: "Руин был — не съел по печати",
      };
    }
    case "quest_id": {
      if (seed.progress?.status === "done") {
        return { result: "done" };
      }
      if (seed.progress?.status === "failed") {
        return {
          result: "failed",
          reasonRu: "CBT-квест провален",
        };
      }
      // Quest settle is mid-session; unfinished at end → fail.
      return {
        result: "failed",
        reasonRu: "CBT-квест не выполнен",
      };
    }
    default: {
      const _exhaustive: never = seed.verify;
      return _exhaustive;
    }
  }
}
