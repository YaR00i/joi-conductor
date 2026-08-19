import type { VibeLevel } from "../types";

/** Clamp any number into VibeLevel 0–5. */
export function clampVibeLevel(level: number): VibeLevel {
  const n = Math.round(Number.isFinite(level) ? level : 0);
  if (n <= 0) return 0;
  if (n >= 5) return 5;
  return n as VibeLevel;
}

/**
 * Map session vibe level 0–5 → normalized intensity 0–1.
 * Level 0 is hard off; 1–5 scale linearly to 0.2–1.0.
 */
export function vibeLevelToIntensity(level: number): number {
  const lvl = clampVibeLevel(level);
  if (lvl === 0) return 0;
  return lvl / 5;
}

/** Map normalized intensity 0–1 → Lovense Game Mode Vibrate:0–20. */
export function intensityToLovense(intensity: number): number {
  const i = Math.max(0, Math.min(1, Number.isFinite(intensity) ? intensity : 0));
  return Math.round(i * 20);
}

/** Convenience: vibe level → Lovense 0–20. */
export function vibeLevelToLovense(level: number): number {
  return intensityToLovense(vibeLevelToIntensity(level));
}
