/**
 * How much painted shine may darken base albedo (PBR metalness crush).
 * 0 = legacy metal-heavy look; 1 = keep base color (dielectric gloss).
 * Stored in localStorage so editor + runtime share one preference; not in pack saves.
 */

export const SHINE_COLOR_KEEP_STORAGE_KEY = "ember-shine-color-keep";

/** Default leans toward preserving color vs old aggressive metal curves. */
export const DEFAULT_SHINE_COLOR_KEEP = 0.55;

export type ShineSurfaceParams = {
  metalness: number;
  roughness: number;
  envMapIntensity: number;
};

export function clampShineColorKeep(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SHINE_COLOR_KEEP;
  return Math.max(0, Math.min(1, value));
}

export function getShineColorKeep(): number {
  try {
    const raw = localStorage.getItem(SHINE_COLOR_KEEP_STORAGE_KEY);
    if (raw == null || raw === "") return DEFAULT_SHINE_COLOR_KEEP;
    return clampShineColorKeep(Number(raw));
  } catch {
    return DEFAULT_SHINE_COLOR_KEEP;
  }
}

export function setShineColorKeep(value: number): void {
  try {
    localStorage.setItem(
      SHINE_COLOR_KEEP_STORAGE_KEY,
      String(clampShineColorKeep(value)),
    );
  } catch {
    /* private mode / quota */
  }
}

/**
 * Soften metalness (main source of albedo crush) while keeping wet/gloss response.
 */
export function applyShineColorKeep(
  params: ShineSurfaceParams,
  keepIn?: number,
): ShineSurfaceParams {
  const keep = clampShineColorKeep(
    keepIn == null ? getShineColorKeep() : keepIn,
  );
  return {
    metalness: params.metalness * (1 - keep * 0.92),
    roughness: Math.min(
      1,
      params.roughness + (1 - params.roughness) * keep * 0.28,
    ),
    envMapIntensity: params.envMapIntensity * (0.82 + keep * 0.28),
  };
}
