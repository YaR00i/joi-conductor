import type { MistressMood } from "./voice/moodLines";

export const MOOD_SCORE_MIN = -3;
export const MOOD_SCORE_MAX = 3;
export const DEFAULT_MOOD_SCORE = 2; // → sweet

/** Seconds after block duration before confirm is "late". */
export const CONFIRM_LATE_SEC = 20;
/** Extra late threshold (additional −1). */
export const CONFIRM_VERY_LATE_SEC = 45;
/** Confirm within this many seconds after duration still counts as on-time. */
export const CONFIRM_ON_TIME_GRACE_SEC = 8;

export function clampMoodScore(score: number): number {
  return Math.max(MOOD_SCORE_MIN, Math.min(MOOD_SCORE_MAX, score));
}

export function moodFromScore(score: number): MistressMood {
  const s = clampMoodScore(score);
  if (s >= 2) return "sweet";
  if (s === 1) return "horny";
  if (s === 0) return "calm";
  if (s === -1) return "bored";
  if (s === -2) return "cruel";
  return "chaotic";
}

/** Inverse of moodFromScore — for roulette / forced start mood. */
export function scoreFromMood(mood: MistressMood): number {
  switch (mood) {
    case "sweet":
      return 2;
    case "horny":
      return 1;
    case "calm":
      return 0;
    case "bored":
      return -1;
    case "cruel":
      return -2;
    case "chaotic":
      return -3;
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

export function applyMoodDelta(
  score: number,
  delta: number,
): { score: number; mood: MistressMood; changed: boolean } {
  const next = clampMoodScore(score + delta);
  const prevMood = moodFromScore(score);
  const mood = moodFromScore(next);
  return { score: next, mood, changed: prevMood !== mood };
}

/**
 * Obedience delta for edge/ruin confirm.
 * `blockElapsedSec` vs `durationSec`; timing measured from request via elapsed.
 */
export function confirmObedienceDelta(
  blockElapsedSec: number,
  durationSec: number,
): number {
  // Early confirm before block timer ends — prompt obedience
  if (blockElapsedSec < durationSec) {
    return 1;
  }
  const over = blockElapsedSec - durationSec;
  if (over <= CONFIRM_ON_TIME_GRACE_SEC) {
    return 1;
  }
  if (over > CONFIRM_VERY_LATE_SEC) {
    return -2;
  }
  if (over > CONFIRM_LATE_SEC) {
    return -1;
  }
  // Between grace and late: neutral
  return 0;
}

export function unauthorizedMoodDelta(kind: "edge" | "ruin" | "cum"): number {
  switch (kind) {
    case "cum":
      return -3;
    case "edge":
    case "ruin":
      return -2;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function isHarshMood(mood: MistressMood): boolean {
  return mood === "cruel" || mood === "chaotic";
}
