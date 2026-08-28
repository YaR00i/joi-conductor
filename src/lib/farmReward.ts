/**
 * Reward math for the Minigames → Naughty farm (Пошлая ферма) game.
 *
 * total = base + harvestScore + cleanInspections·inspectionBonus + taskReward
 *         − wilts·wiltPenalty − weedsLeft·weedPenalty − taskPenalty
 * clamped to >= 0. Payout happens when the round timer runs out.
 *
 * Design notes (legible risk/reward, mirrors memoryReward):
 *  - harvestScore is tracked live by the field sim (farmField.ts) using the
 *    shared combo multiplier here — one formula, no copies;
 *  - Mistress inspections sample the farm mid-round: a clean field pays a
 *    bonus, a neglected one runs a PuzzleTask (bonus on success, penalty on
 *    fail — shared task library, see puzzleTasks.ts);
 *  - wilts are cumulative neglect (the real punishment driver), weeds only
 *    cost what is still standing at the final horn.
 */

export type FarmDifficultyId = "easy" | "medium" | "hard" | "expert";

export interface FarmDifficulty {
  id: FarmDifficultyId;
  labelRu: string;
  /** Plot grid size (cols × rows). */
  cols: number;
  rows: number;
  /** Round length in seconds; the timer pauses while a task overlay is up. */
  roundSec: number;
  /** Base cinders for working the field the whole round. */
  base: number;
  /** Bonus for each inspection the farm survives without mess. */
  inspectionBonus: number;
  /** Cinders lost per wilted crop over the whole round. */
  wiltPenalty: number;
  /** Cinders lost per weed still standing at the end. */
  weedPenalty: number;
  /** Thirst events per minute across the whole field. */
  thirstPerMin: number;
  /** Weed sprouts per minute across the whole field. */
  weedPerMin: number;
  /** Mistress inspections as fractions of the round (0..1, ascending). */
  inspections: readonly number[];
}

export const FARM_DIFFICULTIES: readonly FarmDifficulty[] = [
  {
    id: "easy",
    labelRu: "Лёгкий",
    cols: 3,
    rows: 2,
    roundSec: 100,
    base: 6,
    inspectionBonus: 6,
    wiltPenalty: 2,
    weedPenalty: 1,
    thirstPerMin: 2,
    weedPerMin: 1.5,
    inspections: [0.55],
  },
  {
    id: "medium",
    labelRu: "Средний",
    cols: 4,
    rows: 2,
    roundSec: 120,
    base: 10,
    inspectionBonus: 8,
    wiltPenalty: 3,
    weedPenalty: 1,
    thirstPerMin: 3,
    weedPerMin: 2,
    inspections: [0.4, 0.75],
  },
  {
    id: "hard",
    labelRu: "Сложный",
    cols: 4,
    rows: 3,
    roundSec: 150,
    base: 16,
    inspectionBonus: 10,
    wiltPenalty: 4,
    weedPenalty: 2,
    thirstPerMin: 4,
    weedPerMin: 2.5,
    inspections: [0.3, 0.55, 0.8],
  },
  {
    id: "expert",
    labelRu: "Эксперт",
    cols: 4,
    rows: 4,
    roundSec: 180,
    base: 24,
    inspectionBonus: 12,
    wiltPenalty: 5,
    weedPenalty: 2,
    thirstPerMin: 5,
    weedPerMin: 3,
    inspections: [0.22, 0.45, 0.7, 0.9],
  },
] as const;

export function getFarmDifficulty(id: FarmDifficultyId): FarmDifficulty {
  return FARM_DIFFICULTIES.find((d) => d.id === id) ?? FARM_DIFFICULTIES[0];
}

/** How long before an inspection the "Хозяйка идёт" warning shows. */
export const FARM_INSPECTION_WARN_MS = 6000;

/**
 * Combo multiplier applied to a harvest that raised the combo to `combo`
 * (1-based): 1st harvest ×1, then +0.25 per consecutive harvest, capped ×2.
 * Reset by a wilted crop.
 */
export function farmComboMult(combo: number): number {
  return 1 + 0.25 * Math.max(0, Math.min(combo - 1, 4));
}

/** Cinders for one harvested crop at the given combo level. */
export function harvestValueFor(cropValue: number, combo: number): number {
  return Math.round(cropValue * farmComboMult(combo));
}

export interface FarmRewardInput {
  difficulty: FarmDifficulty;
  /** Σ harvestValueFor over the round (field sim tracks it live). */
  harvestScore: number;
  /** Inspections passed with zero wilted crops and zero weeds. */
  cleanInspections: number;
  /** Inspections that actually ran (clean + punished). */
  totalInspections: number;
  /** Cumulative wilted crops over the round. */
  wilts: number;
  /** Weeds still standing at the final horn. */
  weedsLeft: number;
  taskReward: number; // Σ rewardBonus of succeeded inspection tasks
  taskPenalty: number; // Σ failPenalty of failed inspection tasks
}

export interface FarmRewardResult {
  base: number;
  harvestScore: number;
  inspectionBonus: number;
  taskReward: number;
  wiltPenalty: number;
  weedPenalty: number;
  taskPenalty: number;
  total: number;
}

export function calcFarmReward(input: FarmRewardInput): FarmRewardResult {
  const { difficulty: d } = input;
  const inspectionBonus = input.cleanInspections * d.inspectionBonus;
  const wiltPenalty = input.wilts * d.wiltPenalty;
  const weedPenalty = input.weedsLeft * d.weedPenalty;
  const total = Math.max(
    0,
    d.base +
      input.harvestScore +
      inspectionBonus +
      input.taskReward -
      wiltPenalty -
      weedPenalty -
      input.taskPenalty,
  );
  return {
    base: d.base,
    harvestScore: input.harvestScore,
    inspectionBonus,
    taskReward: input.taskReward,
    wiltPenalty,
    weedPenalty,
    taskPenalty: input.taskPenalty,
    total,
  };
}
