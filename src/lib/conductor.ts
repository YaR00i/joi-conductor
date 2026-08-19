import type {
  BeatPatternDef,
  Block,
  BlockModifier,
  FunctionDef,
  SessionMode,
  SessionMood,
  SessionParams,
  ToyDef,
} from "./types";
import { getActiveMistress } from "./mistress/activeMistress";
import { pickVibeProfile } from "./vibeProfiles";
import {
  functionFitsLoadout,
  pickWeightedFunction,
  requirementMet,
  scoreFunctionForLoadout,
} from "./toyLoadout";
import {
  moodCountdownChance,
  moodEdgeAdChance,
  moodEdgeAdPlan,
  moodEdgeChanceMult,
  moodHoldChance,
  moodHoldSec,
  moodLadderChance,
  moodRuinChanceMult,
} from "./moodSessionBias";
import {
  makeBreathBlock,
  moodBreathChance,
  moodBreathHoldSec,
  moodBreathPrepSec,
  moodBreathTargetCount,
  pickBreathMode,
  BREATH_FEATURE_ID,
} from "./breathHold";
import {
  emptyWallet,
  isFeatureUnlocked,
  isFunctionUnlocked,
  isPatternUnlocked,
  mergeAllowedIds,
  type WalletUnlocks,
} from "./wallet";

export interface CatalogSlice {
  functions: FunctionDef[];
  patterns: BeatPatternDef[];
  toys: ToyDef[];
}

export type BuildQueueOptions = {
  /** Toys already on/in the body — requirements checked against this, not inventory. */
  equippedToyIds?: string[];
  /** Prefer continuity with the last played function. */
  previousFunctionId?: string | null;
  /** Mistress mood — biases edge/ruin rates and edge-ad clusters. */
  mood?: SessionMood;
  /** Shop unlocks for gated catalog entries / whitelist merge. */
  unlocks?: WalletUnlocks;
  /**
   * How far the live session already is (0…1+). Later rebuilds get hotter
   * edges / higher average BPM as the session runs long.
   */
  sessionHeat?: number;
  /** Edges already confirmed — remaining plan only fills the deficit. */
  edgesAlreadyDone?: number;
  /** Ruins already confirmed — remaining plan only fills the deficit. */
  ruinsAlreadyDone?: number;
};

/** Clamp session heat used for difficulty / BPM ramps. */
export function clampSessionHeat(heat: number): number {
  if (!Number.isFinite(heat) || heat <= 0) return 0;
  return Math.min(1.35, heat);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function ownedToyIds(toys: ToyDef[], allowed?: string[]): Set<string> {
  const owned = toys.filter((t) => t.owned).map((t) => t.id);
  if (!allowed || allowed.length === 0) return new Set(owned);
  return new Set(owned.filter((id) => allowed.includes(id)));
}

/** @deprecated use requirementMet from toyLoadout — kept for callers */
export function toyRequirementMet(
  requirement: string,
  availableIds: Set<string>,
  toys: ToyDef[],
): boolean {
  return requirementMet(requirement, availableIds, toys);
}

const ORAL_ASSIST_IDS = new Set([
  "vibe_assist",
  "hands_off_vibe",
  "vibe_press",
]);

/** Sunna Idol: throat + vibe-on-cage + soft ball mercy — no hand-on-shaft. */
const SUNNA_ORAL_ASSIST_IDS = new Set([
  "hands_off_vibe",
  "vibe_press",
  "ball_pet",
  "ball_cradle",
  "ball_weight",
]);

/** Cage mercy: beat-driven ball focus while locked (not CBT). */
export function isCageBallMercyFunction(
  functionId: string | null | undefined,
): boolean {
  return (
    typeof functionId === "string" &&
    (functionId === "ball_pet" ||
      functionId === "ball_tug" ||
      functionId === "ball_cradle" ||
      functionId === "ball_weight")
  );
}

function functionAllowed(
  fn: FunctionDef,
  mode: SessionMode,
  allowedIds: string[],
  equipped: Set<string>,
  toys: ToyDef[],
): boolean {
  if (!fn.enabled) return false;
  // Idol Soft: never queue hand-on-shaft / stroke-identity functions
  if (
    getActiveMistress().id === "sunna" &&
    (fn.id === "vibe_assist" ||
      (fn.category === "stroke" &&
        fn.id !== "rest_hands_off" &&
        fn.id !== "stroke_prone") ||
      fn.category === "cbt" ||
      fn.id === "plapping" ||
      fn.id === "stroke_prone")
  ) {
    return false;
  }
  // onahole ≈ stroke drive; cbt mixes pain + limited stroke for edges
  const effectiveMode: SessionMode =
    mode === "onahole" || mode === "cbt" ? "stroke" : mode;
  if (mode === "cbt") {
    // Prefer CBT catalog; still allow stroke-mode functions (edges/holds)
    if (
      fn.category !== "cbt" &&
      !fn.modes.includes("cbt") &&
      !fn.modes.includes("stroke") &&
      fn.id !== "rest_hands_off"
    ) {
      return false;
    }
  } else if (mode === "prone") {
    // Hip-pressure identity — not hand-stroke
    if (fn.id !== "stroke_prone" && fn.id !== "rest_hands_off") {
      return false;
    }
  } else if (mode === "plapping") {
    // Sunna caged plapping: hit blocks + fill grind + buzz + ball mercy
    const plappingOk =
      fn.modes.includes("plapping") ||
      fn.id === "rest_hands_off" ||
      isCageBallMercyFunction(fn.id) ||
      SUNNA_ORAL_ASSIST_IDS.has(fn.id) ||
      fn.id.startsWith("combo_cage") ||
      fn.id === "plug_passive";
    if (!plappingOk) return false;
  } else if (mode === "oral") {
    // Signature throat + curated vibe assists only (no full chastity/vibe pool)
    const oralAssists =
      getActiveMistress().id === "sunna"
        ? SUNNA_ORAL_ASSIST_IDS
        : ORAL_ASSIST_IDS;
    if (
      fn.category !== "oral" &&
      !fn.modes.includes("oral") &&
      !oralAssists.has(fn.id) &&
      fn.id !== "rest_hands_off"
    ) {
      return false;
    }
  } else if (!fn.modes.includes(effectiveMode) && mode !== "onahole") {
    return false;
  }
  if (mode === "onahole" && !fn.modes.includes("stroke")) return false;
  if (allowedIds.length > 0 && !allowedIds.includes(fn.id)) return false;
  if (fn.id === "finale_roulette") return false;
  if (
    mode === "chastity" &&
    fn.category === "stroke" &&
    fn.id !== "rest_hands_off"
  ) {
    return false;
  }
  // Key rule: only use toys that are currently equipped
  return functionFitsLoadout(fn, equipped, toys);
}

/**
 * Modifiers = the current loadout (worn/active), not a random pick per block.
 * Function-required toys are included if somehow missing from list.
 */
export function buildLoadoutModifiers(
  fn: FunctionDef,
  equippedToyIds: string[],
  toys: ToyDef[],
): BlockModifier[] {
  const byId = new Map<string, BlockModifier>();

  for (const toyId of equippedToyIds) {
    const toy = toys.find((t) => t.id === toyId);
    if (!toy) continue;
    byId.set(toyId, {
      toyId,
      role: toy.role ?? "worn",
      intensity: toy.vibe ? 3 : undefined,
    });
  }

  const equipped = new Set(equippedToyIds);
  for (const req of fn.requiresToys) {
    if (requirementMet(req, equipped, toys)) {
      // Resolve concrete toy for abstract requirement
      let toyId = equippedToyIds.find((id) => id === req);
      if (!toyId) {
        toyId = equippedToyIds.find((id) => {
          const t = toys.find((x) => x.id === id);
          return t?.satisfies?.includes(req);
        });
      }
      if (toyId && !byId.has(toyId)) {
        const toy = toys.find((t) => t.id === toyId);
        byId.set(toyId, {
          toyId,
          role: toy?.role ?? "required",
          intensity: toy?.vibe ? 3 : undefined,
        });
      }
    }
  }

  return [...byId.values()];
}

function resolveDrive(fn: FunctionDef, mode: SessionMode): "beat" | "vibe" {
  if (fn.drive === "vibe") return "vibe";
  // Nipple + cage ball mercy + worn grind keep the metronome
  if (
    fn.category === "nipple" ||
    isCageBallMercyFunction(fn.id) ||
    fn.id === "plug_passive"
  ) {
    return "beat";
  }
  if (mode === "chastity") return "vibe";
  // Oral vibe assists use vibe HUD; throat signature stays on the beat
  if (mode === "oral" && ORAL_ASSIST_IDS.has(fn.id)) return "vibe";
  return "beat";
}

/** Base edge/ruin roll odds by mode (before mood multipliers). */
function modeEdgeRuinBase(mode: SessionMode): {
  edge: number;
  ruin: number;
} {
  switch (mode) {
    case "chastity":
      return { edge: 0.12, ruin: 0.08 };
    case "cbt":
      // Pain focus: fewer arousal spam edges than stroke
      return { edge: 0.14, ruin: 0.1 };
    case "prone":
      // Surface friction — readable tempo, moderate edges
      return { edge: 0.16, ruin: 0.12 };
    case "oral":
      return { edge: 0.14, ruin: 0.1 };
    case "plapping":
      // Pain + cage denial — fewer edges than stroke
      return { edge: 0.13, ruin: 0.09 };
    case "stroke":
    case "anal":
    case "onahole":
      return { edge: 0.22, ruin: 0.16 };
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/**
 * Cap BPM so pain / throat / prone blocks stay readable.
 * Applied after the random draw within session bpmMin–bpmMax.
 */
function applyModeFunctionBpmCap(
  bpm: number,
  fn: FunctionDef,
  mode: SessionMode,
  bpmMin: number,
  bpmMax: number,
): number {
  const mid = Math.round((bpmMin + bpmMax) / 2);
  if (
    mode === "cbt" ||
    mode === "stroke" ||
    mode === "prone" ||
    mode === "plapping"
  ) {
    const isCbtFn =
      fn.category === "cbt" ||
      fn.id === "plapping" ||
      fn.id.startsWith("plapping_cage") ||
      fn.id.startsWith("cbt_");
    if (isCbtFn) {
      const cap = Math.min(bpmMax, Math.max(bpmMin, mid + 8));
      return Math.min(bpm, cap);
    }
    if (fn.id === "stroke_prone" || mode === "prone") {
      const lo = Math.max(bpmMin, mid - 12);
      const hi = Math.min(bpmMax, mid + 16);
      return Math.min(hi, Math.max(lo, bpm));
    }
  }
  if (mode === "oral") {
    const isOralFn =
      fn.category === "oral" || fn.id.startsWith("oral_");
    if (isOralFn) {
      // Mid band — throat tempo, not stroke fury
      const lo = Math.max(bpmMin, mid - 10);
      const hi = Math.min(bpmMax, mid + 14);
      return Math.min(hi, Math.max(lo, bpm));
    }
  }
  return bpm;
}

function getFunctionCategory(
  fns: FunctionDef[],
  functionId: string | null | undefined,
): string | null {
  if (!functionId) return null;
  return fns.find((f) => f.id === functionId)?.category ?? null;
}

function fnUnlocked(
  fn: FunctionDef,
  unlocks: WalletUnlocks,
): boolean {
  return fn.enabled && isFunctionUnlocked(fn.id, unlocks);
}

/**
 * Bare nipple / oral / CBT-only moves can't reach a real edge in stroke JOI.
 * Upgrade to a combo or stroke so edge/ruin requests stay reachable.
 */
function ensureEdgeCapableFunction(
  fn: FunctionDef,
  pool: FunctionDef[],
  mode: SessionMode,
  unlocks: WalletUnlocks,
): FunctionDef {
  const shaftOk =
    fn.category === "stroke" ||
    fn.category === "vibe" ||
    fn.category === "combo" ||
    fn.category === "anal" ||
    fn.bodyFocus.includes("shaft");
  if (shaftOk && fn.id !== "nipple_play") return fn;

  const pickId = (id: string): FunctionDef | undefined => {
    const hit = pool.find(
      (f) => f.id === id && f.modes.includes(mode) && fnUnlocked(f, unlocks),
    );
    return hit;
  };

  if (fn.id === "nipple_play" || fn.category === "nipple") {
    if (mode === "stroke") {
      const combo = pickId("nipple_plus_stroke");
      if (combo) return combo;
    }
    if (mode === "anal") {
      const analNip = pickId("anal_thrust_plus_nipple");
      if (analNip) return analNip;
    }
  }

  if (fn.category === "cbt" || fn.category === "oral") {
    const stroke =
      pickId("stroke_right") ??
      pickId("stroke_left") ??
      pool.find(
        (f) =>
          f.category === "stroke" &&
          f.id !== "rest_hands_off" &&
          f.modes.includes(mode) &&
          fnUnlocked(f, unlocks),
      );
    if (stroke) return stroke;
  }

  return fn;
}

/**
 * Secret mid-ruin warmup band: session rolls how many edges/holds are
 * required before a ruin can appear — player doesn't know the exact count.
 */
const RUIN_WARMUP_MIN = 2;
const RUIN_WARMUP_MAX = 5;

function countRuinWarmupUnits(edges: number, holds: number): number {
  return edges + holds;
}

function rollRuinWarmupNeed(rng: () => number): number {
  return randInt(rng, RUIN_WARMUP_MIN, RUIN_WARMUP_MAX);
}

/**
 * How many edge goals we can honestly fit into a duration without turning
 * the whole session into edge spam.
 */
export function edgeCapacityForDuration(
  durationSec: number,
  blockSecMin: number,
  blockSecMax: number,
): number {
  const avgBlock = Math.max(20, (blockSecMin + blockSecMax) / 2);
  const contentBudget = Math.max(0, durationSec - 90);
  const perEdge = Math.max(70, avgBlock * 1.55);
  return Math.max(0, Math.floor(contentBudget / perEdge));
}

/** Convert spaced stroke slots into edges until `need` is met (mirrors ruin fill). */
function ensureEdgesTarget(
  queue: Block[],
  need: number,
  edgesPlanned: number,
  fns: FunctionDef[],
  catalog: CatalogSlice,
  equippedOwned: string[],
  mode: SessionMode,
  unlocks: WalletUnlocks,
): number {
  if (need <= 0 || edgesPlanned >= need || queue.length < 3) {
    return edgesPlanned;
  }
  let have = edgesPlanned;
  const candidates = queue
    .map((b, i) => ({ b, i }))
    .filter(
      ({ b, i }) =>
        b.goal === "stroke" &&
        i > 0 &&
        i < queue.length - 1 &&
        b.functionId !== "rest_hands_off" &&
        b.functionId !== "finale_roulette",
    );
  if (candidates.length === 0) return have;

  const stillNeed = need - have;
  // Spread picks across the candidate list instead of clustering at the end
  const picks: typeof candidates = [];
  for (let n = 0; n < stillNeed && n < candidates.length; n++) {
    const t = (n + 0.5) / stillNeed;
    const idx = Math.min(
      candidates.length - 1,
      Math.floor(t * candidates.length),
    );
    const slot = candidates[idx]!;
    if (!picks.some((p) => p.i === slot.i)) picks.push(slot);
  }
  // Fill leftovers if spacing collided
  for (const slot of candidates) {
    if (picks.length >= stillNeed) break;
    if (!picks.some((p) => p.i === slot.i)) picks.push(slot);
  }

  for (const slot of picks) {
    if (have >= need) break;
    const capable = ensureEdgeCapableFunction(
      catalog.functions.find((f) => f.id === slot.b.functionId) ?? fns[0]!,
      fns,
      mode,
      unlocks,
    );
    queue[slot.i] = {
      ...slot.b,
      functionId: capable.id,
      goal: "edge",
      holdSec: 8,
      holdGraceSec: undefined,
      modifiers: buildLoadoutModifiers(capable, equippedOwned, catalog.toys),
      drive: resolveDrive(capable, mode),
    };
    have += 1;
  }
  return have;
}

/** Ensure each mid-ruin has at least `need` edges/holds earlier in the queue. */
function ensureMidRuinWarmup(queue: Block[], need: number): void {
  const target = Math.max(RUIN_WARMUP_MIN, Math.min(RUIN_WARMUP_MAX, need));
  for (let i = 0; i < queue.length; i++) {
    const block = queue[i];
    if (!block || block.goal !== "ruin_attempt") continue;
    let warmup = 0;
    for (let j = 0; j < i; j++) {
      const g = queue[j]?.goal;
      if (g === "edge" || g === "hold") warmup += 1;
    }
    if (warmup >= target) continue;
    for (let j = i - 1; j >= 0 && warmup < target; j--) {
      const prev = queue[j];
      if (!prev) continue;
      if (prev.goal !== "stroke" || prev.functionId === "rest_hands_off") {
        continue;
      }
      // Prefer edges; last fill slot may be a hold for variety.
      const asHold = warmup === target - 1 && target >= 3;
      queue[j] = {
        ...prev,
        goal: asHold ? "hold" : "edge",
        holdSec: 8,
        holdGraceSec: asHold ? 28 : undefined,
      };
      warmup += 1;
    }
  }
}

export function buildQueue(
  params: SessionParams,
  catalog: CatalogSlice,
  seed = Date.now() % 1_000_000,
  options: BuildQueueOptions = {},
): Block[] {
  const rng = mulberry32(seed);
  const equippedToyIds = options.equippedToyIds ?? [];

  // Inventory gate: cannot equip what isn't owned — equipped should already be owned
  const owned = ownedToyIds(catalog.toys, params.allowedToyIds);
  const equippedOwned = equippedToyIds.filter((id) => owned.has(id));
  const equippedSet = new Set(equippedOwned);

  const unlocks: WalletUnlocks = options.unlocks ?? emptyWallet().unlocks;
  const allowedFunctionIds = mergeAllowedIds(
    params.allowedFunctionIds,
    unlocks.functionIds,
  );
  const allowedPatternIds = mergeAllowedIds(
    params.allowedPatternIds,
    unlocks.patternIds,
  );

  const fns = catalog.functions.filter(
    (f) =>
      functionAllowed(
        f,
        params.mode,
        allowedFunctionIds,
        equippedSet,
        catalog.toys,
      ) && isFunctionUnlocked(f.id, unlocks),
  );

  const beatPatterns = catalog.patterns.filter((p) => {
    if (!p.enabled) return false;
    if (p.id === "vibe_timeline") return false;
    if (!isPatternUnlocked(p.id, unlocks)) return false;
    if (
      allowedPatternIds.length > 0 &&
      !allowedPatternIds.includes(p.id)
    ) {
      return false;
    }
    return true;
  });
  const vibePattern =
    catalog.patterns.find((p) => p.id === "vibe_timeline" && p.enabled) ??
    beatPatterns[0];

  if (fns.length === 0) {
    throw new Error("No compatible functions for these params/loadout");
  }
  if (params.mode !== "chastity" && beatPatterns.length === 0) {
    throw new Error("No compatible patterns");
  }
  if (!vibePattern && beatPatterns.length === 0) {
    throw new Error("No compatible patterns");
  }

  const queue: Block[] = [];
  let planned = 0;
  let edgesPlanned = 0;
  let blockIndex = 0;
  const mood = options.mood ?? "calm";
  const sessionHeat = clampSessionHeat(options.sessionHeat ?? 0);
  const edgesAlreadyDone = Math.max(0, Math.floor(options.edgesAlreadyDone ?? 0));
  const ruinsAlreadyDone = Math.max(0, Math.floor(options.ruinsAlreadyDone ?? 0));
  const edgesQuota = Math.max(0, params.edgesTarget - edgesAlreadyDone);
  const ruinsQuota = Math.max(0, params.ruinsTarget - ruinsAlreadyDone);
  const capacityEdges = edgeCapacityForDuration(
    params.durationSec,
    params.blockSecMin,
    params.blockSecMax,
  );
  /** Edges this plan must place (quota capped by honest duration capacity). */
  const edgesCommit =
    edgesQuota <= 0
      ? 0
      : capacityEdges >= edgesQuota
        ? edgesQuota
        : Math.max(edgesQuota > 0 ? 1 : 0, capacityEdges);
  const oddsBase = modeEdgeRuinBase(params.mode);
  const edgeChance = Math.min(
    0.78,
    oddsBase.edge * moodEdgeChanceMult(mood) * (1 + 0.65 * sessionHeat),
  );
  const ruinChance = Math.min(
    0.48,
    oddsBase.ruin * moodRuinChanceMult(mood) * (1 + 0.35 * sessionHeat),
  );
  const heatBpmMin = Math.round(
    params.bpmMin + (params.bpmMax - params.bpmMin) * 0.22 * sessionHeat,
  );
  const heatBpmMax = Math.round(
    params.bpmMax + Math.max(8, (params.bpmMax - params.bpmMin) * 0.18) * sessionHeat,
  );
  let prevFnId = options.previousFunctionId ?? null;
  let prevCategory = getFunctionCategory(catalog.functions, prevFnId);
  let ruinsPlanned = 0;
  let edgeAdsPlanned = 0;
  let holdsPlanned = 0;
  let countdownsPlanned = 0;
  let laddersPlanned = 0;
  let breathsPlanned = 0;
  /** Rolled once per plan — how many edge/hold units before mid-ruins unlock. */
  const ruinWarmupNeed = rollRuinWarmupNeed(rng);
  const breathUnlocked = isFeatureUnlocked(
    BREATH_FEATURE_ID,
    options.unlocks ?? emptyWallet().unlocks,
  );

  while (planned < params.durationSec) {
    const durationSec = randInt(rng, params.blockSecMin, params.blockSecMax);

    const scored = fns.map((fn) => ({
      fn,
      score: scoreFunctionForLoadout(
        fn,
        equippedOwned,
        prevFnId,
        prevCategory,
        rng,
        params.mode,
      ),
    }));
    const fn = pickWeightedFunction(scored, rng);

    const drive = resolveDrive(fn, params.mode);
    const pattern =
      drive === "vibe"
        ? (vibePattern ?? pick(rng, beatPatterns))
        : pick(rng, beatPatterns);

    const localHeat = clampSessionHeat(
      sessionHeat + (planned / Math.max(1, params.durationSec)) * 0.55,
    );
    const bpmLo = Math.min(
      heatBpmMax,
      Math.round(heatBpmMin + (heatBpmMax - heatBpmMin) * 0.35 * localHeat),
    );
    const bpmHi = Math.max(bpmLo, heatBpmMax);
    let bpm = randInt(rng, bpmLo, bpmHi);
    const mods = buildLoadoutModifiers(fn, equippedOwned, catalog.toys);
    if (mods.some((m) => m.toyId === "dildo_large")) {
      bpm = Math.min(bpm, Math.round((bpmLo + bpmHi) / 2));
    }
    bpm = applyModeFunctionBpmCap(
      bpm,
      fn,
      params.mode,
      bpmLo,
      bpmHi,
    );

    let vibeProfileId: string | undefined;
    if (drive === "vibe" && fn.id !== "rest_hands_off") {
      vibeProfileId = pickVibeProfile(fn.intensity, rng).id;
      bpm = 0;
    }

    let goal: Block["goal"] = "stroke";
    const progress = planned / Math.max(1, params.durationSec);
    const ruinWarmupReady =
      countRuinWarmupUnits(edgesPlanned, holdsPlanned) >= ruinWarmupNeed;
    if (fn.id === "rest_hands_off") {
      goal = "rest";
    } else if (
      ruinsPlanned < ruinsQuota &&
      ruinWarmupReady &&
      progress > 0.2 &&
      progress < 0.78 &&
      rng() < ruinChance
    ) {
      goal = "ruin_attempt";
      ruinsPlanned += 1;
    } else if (
      (() => {
        if (edgesPlanned >= edgesCommit + Math.floor(0.35 * sessionHeat)) {
          return false;
        }
        if (progress <= 0.08) return false;
        // Behind-schedule boost so soft moods don't starve the quota before fill-pass
        const expected = edgesCommit * progress;
        let rollChance = edgeChance;
        if (edgesPlanned + 0.4 < expected) {
          rollChance = Math.min(0.9, edgeChance * 1.85);
        } else if (progress > 0.4 && edgesPlanned < edgesCommit * 0.45) {
          rollChance = Math.min(0.92, edgeChance * 2.1);
        }
        return rng() < rollChance;
      })()
    ) {
      goal = "edge";
      edgesPlanned += 1;
    } else if (
      fn.id !== "rest_hands_off" &&
      holdsPlanned < 4 + Math.floor(sessionHeat) &&
      progress > 0.18 &&
      progress < 0.88 &&
      rng() < moodHoldChance(mood) * (1 + 0.4 * localHeat)
    ) {
      goal = "hold";
      holdsPlanned += 1;
    } else if (
      fn.id !== "rest_hands_off" &&
      countdownsPlanned < 3 + Math.floor(sessionHeat * 0.8) &&
      progress > 0.22 &&
      progress < 0.9 &&
      rng() < moodCountdownChance(mood) * (1 + 0.35 * localHeat)
    ) {
      goal = "countdown";
      countdownsPlanned += 1;
    } else if (
      breathUnlocked &&
      fn.id !== "rest_hands_off" &&
      breathsPlanned < 3 + Math.floor(sessionHeat * 0.8) &&
      progress > 0.16 &&
      progress < 0.85 &&
      rng() < moodBreathChance(mood) * (1 + 0.3 * localHeat)
    ) {
      goal = "breath";
      breathsPlanned += 1;
    }

    // Stroke ladder: slow → mid → fast mini-cluster
    if (
      goal === "stroke" &&
      fn.id !== "rest_hands_off" &&
      laddersPlanned < 2 &&
      progress > 0.2 &&
      progress < 0.8 &&
      rng() < moodLadderChance(mood)
    ) {
      const steps = [
        { mult: 0.7, label: 0 },
        { mult: 1.0, label: 1 },
        { mult: 1.25, label: 2 },
      ];
      const baseBpm = Math.max(
        bpmLo,
        Math.min(bpmHi, Math.round((bpmLo + bpmHi) / 2)),
      );
      for (let s = 0; s < steps.length; s++) {
        if (planned >= params.durationSec) break;
        const step = steps[s]!;
        const stepDur = Math.min(
          Math.max(18, Math.round(durationSec * 0.55)),
          params.durationSec - planned,
        );
        if (stepDur <= 0) break;
        const stepBpm =
          drive === "vibe"
            ? 0
            : Math.min(
                bpmHi,
                Math.max(bpmLo, Math.round(baseBpm * step.mult)),
              );
        queue.push({
          id: `b${blockIndex++}`,
          durationSec: stepDur,
          functionId: fn.id,
          patternId: pattern!.id,
          bpm: stepBpm,
          mode: params.mode,
          modifiers: mods,
          goal: s === 0 ? "ladder" : "stroke",
          drive,
          vibeProfileId,
        });
        planned += stepDur;
        prevFnId = fn.id;
        prevCategory = fn.category;
        if (s < steps.length - 1 && planned < params.durationSec) {
          const pause = Math.min(4, params.durationSec - planned);
          if (pause > 0) {
            queue.push({
              id: `b${blockIndex++}`,
              durationSec: pause,
              functionId: "rest_hands_off",
              patternId: (beatPatterns[0] ?? vibePattern)!.id,
              bpm: 40,
              mode: params.mode,
              modifiers: [],
              goal: "rest",
              drive: "beat",
            });
            planned += pause;
          }
        }
      }
      laddersPlanned += 1;
      continue;
    }

    // Edge-ad: several edges in a row with short pauses (mood-scaled)
    if (
      goal === "edge" &&
      fn.id !== "rest_hands_off" &&
      edgeAdsPlanned < 3 &&
      progress > 0.18 &&
      progress < 0.82 &&
      rng() < moodEdgeAdChance(mood)
    ) {
      const ad = moodEdgeAdPlan(mood, rng);
      const maxEdges = Math.max(
        2,
        Math.min(ad.edges, params.edgesTarget - edgesPlanned + 1),
      );
      // First edge already counted in edgesPlanned above
      for (let k = 0; k < maxEdges; k++) {
        if (planned >= params.durationSec) break;
        const edgeDur =
          k === 0
            ? Math.min(durationSec, params.durationSec - planned)
            : Math.min(
                randInt(rng, params.blockSecMin, params.blockSecMax),
                params.durationSec - planned,
              );
        if (edgeDur <= 0) break;

        let edgeFn = fn;
        let edgeDrive = drive;
        let edgePattern = pattern!;
        let edgeBpm = bpm;
        let edgeVibe = vibeProfileId;
        let edgeMods = mods;
        if (k > 0) {
          const scoredK = fns
            .filter((f) => f.id !== "rest_hands_off")
            .map((f) => ({
              fn: f,
              score: scoreFunctionForLoadout(
                f,
                equippedOwned,
                prevFnId,
                prevCategory,
                rng,
                params.mode,
              ),
            }));
          edgeFn =
            scoredK.length > 0 ? pickWeightedFunction(scoredK, rng) : fn;
          edgesPlanned += 1;
        }
        const rawEdgeFn = edgeFn;
        edgeFn = ensureEdgeCapableFunction(
          edgeFn,
          fns,
          params.mode,
          unlocks,
        );
        if (k > 0 || edgeFn.id !== rawEdgeFn.id) {
          edgeDrive = resolveDrive(edgeFn, params.mode);
          edgePattern =
            edgeDrive === "vibe"
              ? (vibePattern ?? pick(rng, beatPatterns))
              : pick(rng, beatPatterns);
          if (k > 0) {
            edgeBpm = randInt(rng, bpmLo, bpmHi);
            edgeBpm = applyModeFunctionBpmCap(
              edgeBpm,
              edgeFn,
              params.mode,
              bpmLo,
              bpmHi,
            );
          }
          edgeMods = buildLoadoutModifiers(
            edgeFn,
            equippedOwned,
            catalog.toys,
          );
          edgeVibe = undefined;
          if (edgeDrive === "vibe") {
            edgeVibe = pickVibeProfile(edgeFn.intensity, rng).id;
            edgeBpm = 0;
          }
        }

        queue.push({
          id: `b${blockIndex++}`,
          durationSec: edgeDur,
          functionId: edgeFn.id,
          patternId: edgePattern.id,
          bpm: edgeBpm,
          mode: params.mode,
          modifiers: edgeMods,
          goal: "edge",
          holdSec: 8,
          drive: edgeDrive,
          vibeProfileId: edgeVibe,
        });
        prevFnId = edgeFn.id;
        prevCategory = edgeFn.category;
        planned += edgeDur;

        if (k < maxEdges - 1 && planned < params.durationSec) {
          const pause = Math.min(ad.pauseSec, params.durationSec - planned);
          if (pause > 0) {
            queue.push({
              id: `b${blockIndex++}`,
              durationSec: pause,
              functionId: "rest_hands_off",
              patternId: (beatPatterns[0] ?? vibePattern)!.id,
              bpm: 40,
              mode: params.mode,
              modifiers: [],
              goal: "rest",
              drive: "beat",
            });
            planned += pause;
          }
        }
      }
      edgeAdsPlanned += 1;
      continue;
    }

    const holdDuration =
      goal === "hold"
        ? Math.min(
            moodHoldSec(mood, rng),
            Math.max(10, params.durationSec - planned),
          )
        : goal === "countdown"
          ? Math.min(28 + Math.floor(rng() * 12), params.durationSec - planned)
          : goal === "breath"
            ? Math.min(
                moodBreathHoldSec(mood, rng),
                Math.max(8, params.durationSec - planned),
              )
            : Math.min(durationSec, params.durationSec - planned);

    if (goal === "breath") {
      const breathMode = pickBreathMode(mood, rng);
      const breath = makeBreathBlock({
        id: `b${blockIndex++}`,
        mode: params.mode,
        breathMode,
        holdSec: holdDuration,
        prepSec: moodBreathPrepSec(mood),
        targetCount:
          breathMode === "stroke_count" || breathMode === "stroke_beats"
            ? moodBreathTargetCount(breathMode, mood, rng)
            : undefined,
        bpm:
          breathMode === "stroke_beats"
            ? Math.min(params.bpmMax, Math.max(params.bpmMin, bpm + 8))
            : Math.max(params.bpmMin, bpm - 5),
        functionId: breathMode === "still" ? "rest_hands_off" : fn.id,
        patternId: pattern!.id,
      });
      queue.push(breath);
      prevFnId = breath.functionId;
      prevCategory = getFunctionCategory(catalog.functions, breath.functionId);
      planned += holdDuration;
      continue;
    }

    let blockFn = fn;
    let blockDrive = drive;
    let blockPattern = pattern!;
    let blockBpm = goal === "hold" ? Math.max(params.bpmMin, bpm - 10) : bpm;
    let blockMods = mods;
    let blockVibe = vibeProfileId;
    if (goal === "edge" || goal === "ruin_attempt") {
      blockFn = ensureEdgeCapableFunction(fn, fns, params.mode, unlocks);
      if (blockFn.id !== fn.id) {
        blockDrive = resolveDrive(blockFn, params.mode);
        blockPattern =
          blockDrive === "vibe"
            ? (vibePattern ?? pick(rng, beatPatterns))
            : pick(rng, beatPatterns);
        blockMods = buildLoadoutModifiers(
          blockFn,
          equippedOwned,
          catalog.toys,
        );
        blockVibe = undefined;
        if (blockDrive === "vibe") {
          blockVibe = pickVibeProfile(blockFn.intensity, rng).id;
          blockBpm = 0;
        }
      }
    }

    queue.push({
      id: `b${blockIndex++}`,
      durationSec: holdDuration,
      functionId: blockFn.id,
      patternId: blockPattern.id,
      bpm: blockBpm,
      mode: params.mode,
      modifiers: blockMods,
      goal,
      holdSec: goal === "edge" || goal === "hold" ? 8 : undefined,
      holdGraceSec: goal === "hold" ? 28 : undefined,
      drive: goal === "rest" ? "beat" : blockDrive,
      vibeProfileId: goal === "rest" ? undefined : blockVibe,
    });

    prevFnId = blockFn.id;
    prevCategory = blockFn.category;
    planned += holdDuration;
  }

  // Ensure edgesCommit is met if rolls were unlucky (ruins already had a fill-pass)
  edgesPlanned = ensureEdgesTarget(
    queue,
    edgesCommit,
    edgesPlanned,
    fns,
    catalog,
    equippedOwned,
    params.mode,
    unlocks,
  );

  // Ensure remaining ruins quota is met if session was too short / unlucky rolls
  if (ruinsPlanned < ruinsQuota && queue.length > 2) {
    const need = ruinsQuota - ruinsPlanned;
    const candidates = queue
      .map((b, i) => ({ b, i }))
      .filter(
        ({ b, i }) =>
          b.goal === "stroke" &&
          i > 0 &&
          i < queue.length - 1 &&
          b.functionId !== "rest_hands_off",
      );
    for (let n = 0; n < need && candidates.length > 0; n++) {
      const pickIdx = Math.floor(rng() * candidates.length);
      const slot = candidates.splice(pickIdx, 1)[0]!;
      const capable = ensureEdgeCapableFunction(
        catalog.functions.find((f) => f.id === slot.b.functionId) ??
          fns[0]!,
        fns,
        params.mode,
        unlocks,
      );
      queue[slot.i] = {
        ...slot.b,
        functionId: capable.id,
        goal: "ruin_attempt",
        holdSec: undefined,
        modifiers: buildLoadoutModifiers(
          capable,
          equippedOwned,
          catalog.toys,
        ),
        drive: resolveDrive(capable, params.mode),
      };
      ruinsPlanned += 1;
    }
  }

  ensureMidRuinWarmup(queue, ruinWarmupNeed);

  const finalePool = catalog.functions.filter(
    (f) =>
      f.enabled &&
      f.id === "finale_roulette" &&
      f.modes.includes(params.mode),
  );
  const finaleFn =
    finalePool[0] ??
    fns.find((f) => f.id === "rest_hands_off") ??
    fns[0]!;

  queue.push({
    id: `b${blockIndex}`,
    durationSec: 120,
    functionId: finaleFn.id,
    patternId: (vibePattern ?? beatPatterns[0])!.id,
    bpm: params.mode === "chastity" ? 0 : params.bpmMin,
    mode: params.mode,
    modifiers: buildLoadoutModifiers(finaleFn, equippedOwned, catalog.toys),
    goal: "finale",
    drive: "beat",
  });

  return queue;
}

/** Rebuild the remaining session under the current loadout / mode. */
export function buildRemainingQueue(
  params: SessionParams,
  catalog: CatalogSlice,
  remainingSec: number,
  seed = Date.now() % 1_000_000,
  options: BuildQueueOptions = {},
): Block[] {
  const durationSec = Math.max(45, Math.round(remainingSec));
  return buildQueue({ ...params, durationSec }, catalog, seed, options);
}

/** Live session heat from elapsed wall time vs planned duration. */
export function sessionHeatFromElapsed(
  elapsedSec: number,
  durationSec: number,
): number {
  return clampSessionHeat(elapsedSec / Math.max(60, durationSec));
}

/** Build a live edge-ad splice (edges + short rests) for runtime injection. */
export function buildEdgeAdSequence(
  params: SessionParams,
  catalog: CatalogSlice,
  opts: {
    mood?: SessionMood;
    equippedToyIds?: string[];
    previousFunctionId?: string | null;
    seed?: number;
    idPrefix?: string;
    unlocks?: WalletUnlocks;
    /** Override mood plan edge count (choice roulette / edge hell). */
    forceEdges?: number;
  } = {},
): Block[] {
  const rng = mulberry32(opts.seed ?? Date.now() % 1_000_000);
  const mood = opts.mood ?? "cruel";
  const ad = moodEdgeAdPlan(mood, rng);
  const edgeTotal = Math.max(
    2,
    Math.min(12, Math.floor(opts.forceEdges ?? ad.edges)),
  );
  const owned = ownedToyIds(catalog.toys, params.allowedToyIds);
  const equippedOwned = (opts.equippedToyIds ?? []).filter((id) =>
    owned.has(id),
  );
  const equippedSet = new Set(equippedOwned);
  const unlocks = opts.unlocks ?? emptyWallet().unlocks;
  const allowedFunctionIds = mergeAllowedIds(
    params.allowedFunctionIds,
    unlocks.functionIds,
  );
  const allowedPatternIds = mergeAllowedIds(
    params.allowedPatternIds,
    unlocks.patternIds,
  );
  const fns = catalog.functions.filter(
    (f) =>
      functionAllowed(
        f,
        params.mode,
        allowedFunctionIds,
        equippedSet,
        catalog.toys,
      ) && isFunctionUnlocked(f.id, unlocks),
  );
  const strokeFns = fns.filter((f) => f.id !== "rest_hands_off");
  const beatPatterns = catalog.patterns.filter((p) => {
    if (!p.enabled) return false;
    if (p.id === "vibe_timeline") return false;
    if (!isPatternUnlocked(p.id, unlocks)) return false;
    if (
      allowedPatternIds.length > 0 &&
      !allowedPatternIds.includes(p.id)
    ) {
      return false;
    }
    return true;
  });
  const vibePattern =
    catalog.patterns.find((p) => p.id === "vibe_timeline" && p.enabled) ??
    beatPatterns[0];
  if (strokeFns.length === 0 || (!vibePattern && beatPatterns.length === 0)) {
    return [];
  }

  const prefix = opts.idPrefix ?? `ead-${Date.now()}`;
  const blocks: Block[] = [];
  let prevFnId = opts.previousFunctionId ?? null;
  let prevCategory = getFunctionCategory(catalog.functions, prevFnId);

  for (let k = 0; k < edgeTotal; k++) {
    const scored = strokeFns.map((fn) => ({
      fn,
      score: scoreFunctionForLoadout(
        fn,
        equippedOwned,
        prevFnId,
        prevCategory,
        rng,
        params.mode,
      ),
    }));
    const picked = pickWeightedFunction(scored, rng);
    const fn = ensureEdgeCapableFunction(
      picked,
      strokeFns,
      params.mode,
      unlocks,
    );
    const drive = resolveDrive(fn, params.mode);
    const pattern =
      drive === "vibe"
        ? (vibePattern ?? pick(rng, beatPatterns))
        : pick(rng, beatPatterns);
    let bpm = randInt(rng, params.bpmMin, params.bpmMax);
    let vibeProfileId: string | undefined;
    if (drive === "vibe") {
      vibeProfileId = pickVibeProfile(fn.intensity, rng).id;
      bpm = 0;
    } else {
      bpm = applyModeFunctionBpmCap(
        bpm,
        fn,
        params.mode,
        params.bpmMin,
        params.bpmMax,
      );
    }
    const durationSec = randInt(rng, params.blockSecMin, params.blockSecMax);
    blocks.push({
      id: `${prefix}-e${k}`,
      durationSec,
      functionId: fn.id,
      patternId: pattern!.id,
      bpm,
      mode: params.mode,
      modifiers: buildLoadoutModifiers(fn, equippedOwned, catalog.toys),
      goal: "edge",
      holdSec: 8,
      drive,
      vibeProfileId,
    });
    prevFnId = fn.id;
    prevCategory = fn.category;

    if (k < edgeTotal - 1) {
      blocks.push({
        id: `${prefix}-r${k}`,
        durationSec: ad.pauseSec,
        functionId: "rest_hands_off",
        patternId: (beatPatterns[0] ?? vibePattern)!.id,
        bpm: 40,
        mode: params.mode,
        modifiers: [],
        goal: "rest",
        drive: "beat",
      });
    }
  }
  return blocks;
}

export function rollFinale(
  params: SessionParams,
  rng: () => number = Math.random,
): "cum" | "ruin" | "deny" {
  const pCum = Math.max(0, Math.min(1, params.pCum));
  const pRuin = Math.max(0, Math.min(1 - pCum, params.pRuin));
  const u = rng();
  if (u < pCum) return "cum";
  if (u < pCum + pRuin) return "ruin";
  return "deny";
}
