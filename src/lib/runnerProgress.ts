/**
 * Stage progression for the runner: each difficulty is a 3-stage ladder.
 * Beating the boss on a stage unlocks the next one; later stages stretch the
 * track, toughen waves/boss slightly and pay a bigger base/crowd multiplier.
 */

import type { RunnerDifficulty, RunnerDifficultyId } from "./runnerReward";
import { RUNNER_DIFFICULTIES } from "./runnerReward";

export const RUNNER_STAGE_MAX = 3;

export interface RunnerProgress {
  /** Unlocked stage (1-based) per difficulty. */
  stage: Partial<Record<RunnerDifficultyId, number>>;
}

const STORAGE_KEY = "joi-runner-progress-v1";

export function loadRunnerProgress(): RunnerProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { stage: {} };
    const parsed = JSON.parse(raw) as Partial<RunnerProgress>;
    const stage: Partial<Record<RunnerDifficultyId, number>> = {};
    for (const d of RUNNER_DIFFICULTIES) {
      const v = parsed?.stage?.[d.id];
      if (typeof v === "number" && v >= 1 && v <= RUNNER_STAGE_MAX) {
        stage[d.id] = Math.floor(v);
      }
    }
    return { stage };
  } catch {
    return { stage: {} };
  }
}

export function saveRunnerProgress(p: RunnerProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota */
  }
}

export function stageOf(p: RunnerProgress, id: RunnerDifficultyId): number {
  return p.stage[id] ?? 1;
}

/** Advance the ladder after a survived run; returns the new unlocked stage
 *  and whether it just moved (for the "stage unlocked" notice). */
export function unlockNextStage(
  id: RunnerDifficultyId,
): { stage: number; advanced: boolean; progress: RunnerProgress } {
  const progress = loadRunnerProgress();
  const cur = stageOf(progress, id);
  const next = Math.min(RUNNER_STAGE_MAX, cur + 1);
  const advanced = next > cur;
  if (advanced) {
    progress.stage[id] = next;
    saveRunnerProgress(progress);
  }
  return { stage: next, advanced, progress };
}

/** Difficulty with stage multipliers applied (stage 1 = the base values). */
export function applyStage(
  diff: RunnerDifficulty,
  stage: number,
): RunnerDifficulty {
  const s = Math.max(1, Math.min(RUNNER_STAGE_MAX, Math.floor(stage)));
  const k = s - 1;
  if (k === 0) return diff;
  return {
    ...diff,
    trackLen: Math.round(diff.trackLen * (1 + 0.15 * k)),
    base: Math.round(diff.base * (1 + 0.15 * k)),
    crowdMult: diff.crowdMult + 0.1 * k,
    enemyFactor: Math.min(0.55, diff.enemyFactor + 0.02 * k),
    bossFactor: Math.min(0.7, diff.bossFactor + 0.02 * k),
  };
}
