/**
 * Reward math + tuning for the Minigames → Doodle jump (Прыжки уголька) game.
 *
 * total = base(difficulty) + heightBonus + Σ taskRewardBonus − Σ taskFailPenalty
 * Every run ends with a fall, so there is no survival cut — the height itself
 * is the score. Task fails sting three ways: a cinder penalty, a fog that
 * shrinks visibility for a few seconds, and a short device stimulus pulse
 * (see punishVibe / PUNISH_VIBE_SEC in the game shell).
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
  /** Fog punishment duration (seconds) after a failed task. */
  fogSec: number;
  /** Device stimulus pulse level (0..5) after a failed task, 0 = off. */
  punishVibe: number;
}

export const DOODLE_DIFFICULTIES: readonly DoodleDifficulty[] = [
  {
    id: "warmup",
    labelRu: "Разминка",
    base: 6,
    heightMult: 1,
    minGap: 46,
    maxGap: 84,
    platWidth: 76,
    movingChance: 0.06,
    breakChance: 0.05,
    springChance: 0.06,
    taskMin: 9,
    taskMax: 13,
    fogSec: 8,
    punishVibe: 2,
  },
  {
    id: "climb",
    labelRu: "Подъём",
    base: 12,
    heightMult: 1.25,
    minGap: 54,
    maxGap: 102,
    platWidth: 66,
    movingChance: 0.12,
    breakChance: 0.13,
    springChance: 0.06,
    taskMin: 7,
    taskMax: 10,
    fogSec: 10,
    punishVibe: 3,
  },
  {
    id: "storm",
    labelRu: "Штурм",
    base: 22,
    heightMult: 1.5,
    minGap: 62,
    maxGap: 120,
    platWidth: 58,
    movingChance: 0.2,
    breakChance: 0.22,
    springChance: 0.07,
    taskMin: 5,
    taskMax: 8,
    fogSec: 12,
    punishVibe: 4,
  },
] as const;

export function getDoodleDifficulty(id: DoodleDifficultyId): DoodleDifficulty {
  return DOODLE_DIFFICULTIES.find((d) => d.id === id) ?? DOODLE_DIFFICULTIES[0];
}

export interface DoodleRewardInput {
  difficulty: DoodleDifficulty;
  /** Max height reached, meters (start platform = 0 m). */
  heightM: number;
  taskReward: number; // Σ rewardBonus of succeeded task platforms
  taskPenalty: number; // Σ failPenalty of failed task platforms
}

export interface DoodleRewardResult {
  base: number;
  heightBonus: number;
  taskReward: number;
  taskPenalty: number;
  total: number;
}

export function calcDoodleReward(input: DoodleRewardInput): DoodleRewardResult {
  const { difficulty, heightM, taskReward, taskPenalty } = input;
  const meters = Math.max(0, heightM);
  // sqrt keeps early meters valuable while a deep climb still pays off.
  const heightBonus = Math.round(Math.sqrt(meters) * 3.2 * difficulty.heightMult);
  const total = Math.max(
    0,
    difficulty.base + heightBonus + taskReward - taskPenalty,
  );
  return { base: difficulty.base, heightBonus, taskReward, taskPenalty, total };
}

// ---- best-run persistence (per difficulty) ----

export interface DoodleBest {
  height: number; // meters
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
