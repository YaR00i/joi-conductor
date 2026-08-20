/**
 * Shared clamps for map lanterns and emissive PointLights.
 * One ceiling so voxel / tile / sprite / lamp UIs stay in sync.
 */

/** Lantern disc + emissive PointLight reach in tiles. */
export const MAP_LIGHT_RANGE_MAX = 16;

/** Authored on-screen PointLight cap (still min'd with the GPU budget). */
export const MAP_POINT_LIGHTS_MAX = 40;
/** Authored cube-shadow cap. Baked shadows follow the light-object count. */
export const MAP_POINT_SHADOWS_MAX = MAP_POINT_LIGHTS_MAX;
/** Actor-aware cube maps. Each costs six scene passes; cap matches light objects. */
export const MAP_DYNAMIC_POINT_SHADOWS_MAX = MAP_POINT_LIGHTS_MAX;
export const MAP_DYNAMIC_SHADOW_SCALE_MIN = 0.25;
export const MAP_DYNAMIC_SHADOW_SCALE_MAX = 1.5;

export const DEFAULT_EMISSIVE_STRENGTH = 0.75;
export const MIN_EMISSIVE_STRENGTH = 0;
/** PointLight / fill candela (material glow soft-caps separately at 0..1). */
export const MAX_EMISSIVE_STRENGTH = 30;

export const DEFAULT_EMISSIVE_LIGHT_RANGE = 0.85;
export const MIN_EMISSIVE_LIGHT_RANGE = 0.35;
/** Same as `MAP_LIGHT_RANGE_MAX`. */
export const MAX_EMISSIVE_LIGHT_RANGE = MAP_LIGHT_RANGE_MAX;
