/**
 * Reward math + tuning for the Minigames → Doodle jump (Прыжки уголька) game.
 *
 * Heat economy: height climbed since the last hearth is "hot" — it builds the
 * heat multiplier (×1 → ×2) but burns on a fall. Touching a hearth 🏺 platform
 * banks the climbed meters at the current multiplier; falling salvages only
 * DOODLE_FALL_SALVAGE of the hot part and punishes with a device stimulus
 * pulse that scales with heat (see fallPunishSec).
 *
 * total = base(difficulty) + heightBonus(banked + burned) + Σ taskReward − Σ taskFailPenalty
 */

export type DoodleDifficultyId = "warmup" | "climb" | "storm";

export interface DoodleDifficulty {
  id: DoodleDifficultyId;
  labelRu: string;
  /** Base cinders for a real climb (not a 10 m hop). */
  base: number;
  /** Height bonus multiplier (scales with difficulty). */
  heightMult: number;
  /** Vertical gap between consecutive platforms, world units [minGap, maxGap]. */
  minGap: number;
  maxGap: number;
  /** Typical platform width, world units. */
  platWidth: number;
  /** Share of platforms that drift sideways. */
  movingChance: number;
  /** Share of platforms that crumble after one bounce. */
  breakChance: number;
  /** Share of platforms with a bonus spring. */
  springChance: number;
  /** Task platforms appear every [taskMin, taskMax] platforms. */
  taskMin: number;
  taskMax: number;
  /** Hearth (bank) platforms appear every [hearthMinM..hearthMaxM] meters. */
  hearthMinM: number;
  hearthMaxM: number;
  /** Share of platforms that are icy (steering slides after a bounce). */
  iceChance: number;
  /** Share of platforms that blink (solid only while bright). */
  phantomChance: number;
  /** Frost blob chance per generated platform once past blobAfterM. */
  blobChance: number;
  /** Meters climbed before frost blobs start appearing. */
  blobAfterM: number;
  /** Fog punishment duration (seconds) after a failed task. */
  fogSec: number;
  /** Device stimulus pulse level (0..5) for punishments, 0 = off. */
  punishVibe: number;
}

export const DOODLE_DIFFICULTIES: readonly DoodleDifficulty[] = [
  {
    id: "warmup",
    labelRu: "Разминка",
    base: 4,
    heightMult: 1,
    minGap: 46,
    maxGap: 84,
    platWidth: 76,
    movingChance: 0.06,
    breakChance: 0.05,
    springChance: 0.06,
    taskMin: 9,
    taskMax: 13,
    hearthMinM: 65,
    hearthMaxM: 95,
    iceChance: 0.04,
    phantomChance: 0,
    blobChance: 0.025,
    blobAfterM: 100,
    fogSec: 8,
    punishVibe: 2,
  },
  {
    id: "climb",
    labelRu: "Подъём",
    base: 8,
    heightMult: 1.25,
    minGap: 54,
    maxGap: 102,
    platWidth: 66,
    movingChance: 0.12,
    breakChance: 0.13,
    springChance: 0.06,
    taskMin: 7,
    taskMax: 10,
    hearthMinM: 85,
    hearthMaxM: 125,
    iceChance: 0.08,
    phantomChance: 0.06,
    blobChance: 0.05,
    blobAfterM: 80,
    fogSec: 10,
    punishVibe: 3,
  },
  {
    id: "storm",
    labelRu: "Штурм",
    base: 14,
    heightMult: 1.5,
    minGap: 62,
    maxGap: 120,
    platWidth: 58,
    movingChance: 0.2,
    breakChance: 0.22,
    springChance: 0.07,
    taskMin: 5,
    taskMax: 8,
    hearthMinM: 105,
    hearthMaxM: 155,
    iceChance: 0.12,
    phantomChance: 0.1,
    blobChance: 0.09,
    blobAfterM: 60,
    fogSec: 12,
    punishVibe: 4,
  },
] as const;

export function getDoodleDifficulty(id: DoodleDifficultyId): DoodleDifficulty {
  return DOODLE_DIFFICULTIES.find((d) => d.id === id) ?? DOODLE_DIFFICULTIES[0];
}

// ---- heat economy ----

/** Unbanked meters at which heat (and the multiplier) maxes out. */
export const DOODLE_HEAT_FULL_M = 125;
/** Share of the hot part a fall still salvages into the payout. */
export const DOODLE_FALL_SALVAGE = 0.25;
/** Payout constant: heightBonus = √(meters) × DOODLE_HEIGHT_K × heightMult. */
export const DOODLE_HEIGHT_K = 1.4;

/** Heat multiplier for the given amount of unbanked meters (×1 … ×2). */
export function heatMultiplier(unbankedMeters: number): number {
  return 1 + Math.min(1, Math.max(0, unbankedMeters) / DOODLE_HEAT_FULL_M);
}

/**
 * Device stimulus seconds after falling with unbanked heat.
 * Low heat (< 0.25) is forgiven — early hops are not punished.
 */
export function fallPunishSec(heat: number): number {
  const h = Math.min(1, Math.max(0, heat));
  if (h < 0.25) return 0;
  return 3 + Math.round(9 * h);
}

// ---- payout ----

export interface DoodleRewardInput {
  difficulty: DoodleDifficulty;
  /** Effective (heat-multiplied) meters banked at hearths. */
  bankedMeters: number;
  /** Salvage of the hot part after the fall (already multiplier-applied). */
  burnedMeters: number;
  taskReward: number; // Σ rewardBonus of succeeded task platforms
  stompReward: number; // Σ cinders for frost blobs stomped mid-air
  taskPenalty: number; // Σ failPenalty of failed task platforms
}

export interface DoodleRewardResult {
  base: number;
  heightBonus: number;
  taskReward: number;
  stompReward: number;
  taskPenalty: number;
  total: number;
}

export function calcDoodleReward(input: DoodleRewardInput): DoodleRewardResult {
  const { difficulty, bankedMeters, burnedMeters, taskReward, stompReward, taskPenalty } =
    input;
  const meters = Math.max(0, bankedMeters + burnedMeters);
  // sqrt keeps early meters valuable while a deep climb still pays off.
  const heightBonus = Math.round(
    Math.sqrt(meters) * DOODLE_HEIGHT_K * difficulty.heightMult,
  );
  const total = Math.max(
    0,
    difficulty.base + heightBonus + taskReward + stompReward - taskPenalty,
  );
  return {
    base: difficulty.base,
    heightBonus,
    taskReward,
    stompReward,
    taskPenalty,
    total,
  };
}

// ---- best-run persistence (per difficulty) ----

export interface DoodleBest {
  height: number; // meters (max climb, banking-independent)
  total: number; // cinders
}

const BEST_KEY = "joi-doodle-best-v1";

export function loadDoodleBest(): Partial<
  Record<DoodleDifficultyId, DoodleBest>
> {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Partial<Record<DoodleDifficultyId, DoodleBest>> = {};
    for (const d of DOODLE_DIFFICULTIES) {
      const v = (parsed as Record<string, unknown>)[d.id];
      if (
        v && typeof v === "object" &&
        typeof (v as DoodleBest).height === "number" &&
        typeof (v as DoodleBest).total === "number"
      ) {
        out[d.id] = v as DoodleBest;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveDoodleBestIfBetter(
  id: DoodleDifficultyId,
  run: DoodleBest,
): Partial<Record<DoodleDifficultyId, DoodleBest>> {
  const all = loadDoodleBest();
  const prev = all[id];
  if (!prev || run.height > prev.height) {
    all[id] = run;
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(all));
    } catch {
      // ignore quota
    }
  }
  return all;
}
