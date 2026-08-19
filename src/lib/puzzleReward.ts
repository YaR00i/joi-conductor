/**
 * Reward math for the Minigames → Puzzle game.
 *
 * total = base(difficulty) + speedBonus + Σ taskRewardBonus − Σ taskFailPenalty
 * clamped to >= 0.
 */

export type PuzzleDifficultyId = "easy" | "medium" | "hard" | "expert";

export interface PuzzleDifficulty {
  id: PuzzleDifficultyId;
  labelRu: string;
  /** Rough piece count; actual cols×rows are derived from the image aspect so
   *  pieces stay close to square (see computeJigsawGrid). */
  targetPieces: number;
  /** Base cinders for finishing at all. */
  base: number;
  /** Soft time target (seconds); finishing faster grants a speed bonus. */
  targetSec: number;
  /** Number of special pieces placed on the board. */
  specialPieces: number;
}

export const PUZZLE_DIFFICULTIES: readonly PuzzleDifficulty[] = [
  { id: "easy", labelRu: "Лёгкий", targetPieces: 12, base: 8, targetSec: 240, specialPieces: 2 },
  { id: "medium", labelRu: "Средний", targetPieces: 24, base: 14, targetSec: 540, specialPieces: 3 },
  { id: "hard", labelRu: "Сложный", targetPieces: 48, base: 24, targetSec: 1320, specialPieces: 4 },
  { id: "expert", labelRu: "Эксперт", targetPieces: 70, base: 40, targetSec: 2400, specialPieces: 6 },
] as const;

export function getDifficulty(id: PuzzleDifficultyId): PuzzleDifficulty {
  return PUZZLE_DIFFICULTIES.find((d) => d.id === id) ?? PUZZLE_DIFFICULTIES[0];
}

export interface PuzzleGrid {
  cols: number;
  rows: number;
  pieces: number;
}

/**
 * Pick cols×rows for a target piece count and the image aspect ratio (w/h) so
 * each piece is as close to square as possible: cols/rows ≈ aspect, cols·rows ≈
 * target. aspect is clamped to keep grids sane on extreme panoramas/portraits.
 */
export function computeJigsawGrid(
  targetPieces: number,
  aspect: number,
): PuzzleGrid {
  const a = Math.max(0.4, Math.min(2.5, aspect && aspect > 0 ? aspect : 1));
  let cols = Math.max(2, Math.round(Math.sqrt(targetPieces * a)));
  let rows = Math.max(2, Math.round(targetPieces / cols));
  // nudge so we don't blow past ~1.5× the target
  while (cols * rows > targetPieces * 1.4 && cols > 2) {
    cols -= 1;
    rows = Math.max(2, Math.round(targetPieces / cols));
  }
  return { cols, rows, pieces: cols * rows };
}

export interface PuzzleRewardInput {
  difficulty: PuzzleDifficulty;
  elapsedSec: number;
  taskReward: number; // Σ rewardBonus of succeeded tasks
  taskPenalty: number; // Σ failPenalty of failed/skipped tasks
}

export interface PuzzleRewardResult {
  base: number;
  speedBonus: number;
  taskReward: number;
  taskPenalty: number;
  total: number;
}

export function calcPuzzleReward(input: PuzzleRewardInput): PuzzleRewardResult {
  const { difficulty, elapsedSec, taskReward, taskPenalty } = input;
  const speedFactor = Math.max(0, Math.min(1, 1 - elapsedSec / difficulty.targetSec));
  const speedBonus = Math.round(difficulty.base * speedFactor * 0.6);
  const total = Math.max(
    0,
    difficulty.base + speedBonus + taskReward - taskPenalty,
  );
  return { base: difficulty.base, speedBonus, taskReward, taskPenalty, total };
}

/** Approximate target time per piece, for showing a "pace" hint. */
export function expectedSecPerPiece(difficulty: PuzzleDifficulty): number {
  return Math.round(difficulty.targetSec / difficulty.targetPieces);
}
