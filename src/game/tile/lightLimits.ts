/**
 * Shared clamps for map lanterns and emissive PointLights.
 * One ceiling so voxel / tile / sprite / lamp UIs stay in sync.
 */

/** Lantern disc + emissive PointLight reach in tiles. */
export const MAP_LIGHT_RANGE_MAX = 16;

export const DEFAULT_EMISSIVE_STRENGTH = 0.75;
export const MIN_EMISSIVE_STRENGTH = 0;
/** PointLight / fill candela (material glow soft-caps separately at 0..1). */
export const MAX_EMISSIVE_STRENGTH = 30;

export const DEFAULT_EMISSIVE_LIGHT_RANGE = 0.85;
export const MIN_EMISSIVE_LIGHT_RANGE = 0.35;
/** Same as `MAP_LIGHT_RANGE_MAX`. */
export const MAX_EMISSIVE_LIGHT_RANGE = MAP_LIGHT_RANGE_MAX;
