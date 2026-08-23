/** Voxels along one axis of a single world block. */
export const VOXELS_PER_BLOCK = 16;

/** Palette array length cap (index 0 = air). */
export const MAX_VOXEL_PALETTE = 256;

/** Default palette (index 0 = empty / air). */
export const DEFAULT_VOXEL_PALETTE = [
  "",
  "#6a7a50",
  "#5a4a40",
  "#c8a878",
  "#e8d0a0",
  "#4080c0",
  "#c04040",
  "#f0f0f0",
  "#202028",
] as const;
