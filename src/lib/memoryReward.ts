/**
 * Reward math for the Minigames → Memory pairs (Пары на память) game.
 *
 * total = base + Σ matchReward·streakMult + speedBonus + perfectBonus
 *         + Σ taskReward − misses·missPenalty − peeks·peekPenalty − Σ taskPenalty
 * clamped to >= 0. Payout happens only when the board is fully cleared.
 *
 * Design notes (legible risk/reward):
 *  - streak multiplier grows ×1 → ×2 with consecutive matches and resets on a
 *    miss, shown live in the HUD so the player always knows what's at stake;
 *  - a peek (reveal all cards) costs cinders up front, never the streak;
 *  - cursed pairs run a PuzzleTask on match — bonus on success, penalty on
 *    fail (shared task library, see puzzleTasks.ts).
 */

export type MemoryDifficultyId = "easy" | "medium" | "hard" | "expert";

export interface MemoryDifficulty {
  id: MemoryDifficultyId;
  labelRu: string;
  /** Number of image pairs on the board. */
  pairs: number;
  /** Base cinders for clearing the board. */
  base: number;
  /** Cinders per matched pair at streak ×1. */
  matchReward: number;
  /** Bonus for clearing with zero mismatches. */
  perfectBonus: number;
  /** Cinders lost per mismatch. */
  missPenalty: number;
  /** Cinders lost per peek (all cards revealed briefly). */
  peekPenalty: number;
  /** Soft time target (seconds); faster clears add a speed bonus. */
  targetSec: number;
  /** How many pairs carry a task (cursed pairs). */
  cursedPairs: number;
}

export const MEMORY_DIFFICULTIES: readonly MemoryDifficulty[] = [
  { id: "easy", labelRu: "Лёгкий", pairs: 6, base: 6, matchReward: 2, perfectBonus: 6, missPenalty: 1, peekPenalty: 3, targetSec: 90, cursedPairs: 1 },
  { id: "medium", labelRu: "Средний", pairs: 8, base: 10, matchReward: 3, perfectBonus: 10, missPenalty: 1, peekPenalty: 4, targetSec: 150, cursedPairs: 2 },
  { id: "hard", labelRu: "Сложный", pairs: 10, base: 16, matchReward: 4, perfectBonus: 16, missPenalty: 2, peekPenalty: 5, targetSec: 240, cursedPairs: 3 },
  { id: "expert", labelRu: "Эксперт", pairs: 12, base: 24, matchReward: 5, perfectBonus: 24, missPenalty: 2, peekPenalty: 6, targetSec: 330, cursedPairs: 4 },
] as const;

export function getMemoryDifficulty(id: MemoryDifficultyId): MemoryDifficulty {
  return MEMORY_DIFFICULTIES.find((d) => d.id === id) ?? MEMORY_DIFFICULTIES[0];
}

/** How long a peek reveals the whole board. */
export const MEMORY_PEEK_MS = 1600;

/** How long a matched pair's picture stays up in the reward rail. */
export const MEMORY_REWARD_PREVIEW_MS = 5000;

/**
 * Streak multiplier applied to a match that raised the streak to `streak`
 * (1-based): 1st match ×1, then +0.25 per consecutive match, capped at ×2.
 */
export function streakMult(streak: number): number {
  return 1 + 0.25 * Math.max(0, Math.min(streak - 1, 4));
}

/** Cinders for one matched pair at the given streak level. */
export function matchRewardFor(difficulty: MemoryDifficulty, streak: number): number {
  return Math.round(difficulty.matchReward * streakMult(streak));
}

export interface MemoryRewardInput {
  difficulty: MemoryDifficulty;
  elapsedSec: number;
  /** Σ matchRewardFor over all matched pairs (game tracks it live). */
  matchScore: number;
  mismatches: number;
  peeks: number;
  taskReward: number; // Σ rewardBonus of succeeded cursed-pair tasks
  taskPenalty: number; // Σ failPenalty of failed cursed-pair tasks
}

export interface MemoryRewardResult {
  base: number;
  matchScore: number;
  speedBonus: number;
  perfectBonus: number;
  missPenalty: number;
  peekPenalty: number;
  taskReward: number;
  taskPenalty: number;
  total: number;
}

export function calcMemoryReward(input: MemoryRewardInput): MemoryRewardResult {
  const { difficulty: d } = input;
  const speedFactor = Math.max(0, Math.min(1, 1 - input.elapsedSec / d.targetSec));
  const speedBonus = Math.round(d.base * speedFactor * 0.6);
  const perfectBonus = input.mismatches === 0 ? d.perfectBonus : 0;
  const missPenalty = input.mismatches * d.missPenalty;
  const peekPenalty = input.peeks * d.peekPenalty;
  const total = Math.max(
    0,
    d.base +
      input.matchScore +
      speedBonus +
      perfectBonus +
      input.taskReward -
      missPenalty -
      peekPenalty -
      input.taskPenalty,
  );
  return {
    base: d.base,
    matchScore: input.matchScore,
    speedBonus,
    perfectBonus,
    missPenalty,
    peekPenalty,
    taskReward: input.taskReward,
    taskPenalty: input.taskPenalty,
    total,
  };
}
