/**
 * Authored fog 0..1 → Three.js FogExp2 density.
 *
 * Three FogExp2 uses `1 - exp(-(density * depth)^2)`, so a constant floor
 * (the old `0.002 + fog * 0.018`) made the first on-step (~0.02) already
 * wash mid-distance tiles. Mapping is linear through the origin: 0 is off,
 * low slider values stay as aerial haze, 1 keeps the previous max density.
 */
export const FOG_EXP2_DENSITY_AT_ONE = 0.02;
export const FOG_HAZE_AS_FOG = 0.28;
export const FOG_HAZE_DENSITY = 0.003;
/** Skip FogExp2 when the mapped density would not read. */
export const FOG_EXP2_MIN_DENSITY = 1e-6;

function unit(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function fogExp2Density(fog: number, haze = 0): number {
  const f = unit(fog);
  const h = unit(haze);
  const amt = Math.min(1, f + h * FOG_HAZE_AS_FOG);
  if (amt <= 0 && h <= 0) return 0;
  return amt * FOG_EXP2_DENSITY_AT_ONE + h * FOG_HAZE_DENSITY;
}
