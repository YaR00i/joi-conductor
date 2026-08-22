import { clampMoodScore } from "./moodEngine";
import type { SessionParams } from "./types";

/** Hours / taps added to a progress base from moodScore (−3…+3). */
export function moodDeltaUnits(moodScore: number): number {
  const s = clampMoodScore(moodScore);
  if (s <= -3) return 3;
  if (s <= -2) return 2;
  if (s === -1) return 1;
  if (s >= 2) return -1;
  return 0;
}

export function scaleByMood(
  base: number,
  moodScore: number,
  min: number,
  max: number,
): number {
  const n = Math.round(base + moodDeltaUnits(moodScore));
  return Math.max(min, Math.min(max, n));
}

export function scaleDurationSec(baseSec: number, moodScore: number): number {
  const s = clampMoodScore(moodScore);
  const factor = 1 - s * 0.08;
  return Math.round(Math.max(180, Math.min(2400, baseSec * factor)));
}

export function scaleEdgesTarget(base: number, moodScore: number): number {
  const extra = moodDeltaUnits(moodScore);
  return Math.max(1, Math.min(20, Math.round(base + extra)));
}

export function applyMoodToSessionParams(
  params: SessionParams,
  moodScore: number,
): SessionParams {
  return {
    ...params,
    durationSec: scaleDurationSec(params.durationSec, moodScore),
    edgesTarget: scaleEdgesTarget(params.edgesTarget, moodScore),
  };
}
