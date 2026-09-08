/**
 * World transform for a voxel prop on the map (tile SW anchor + optional 90° yaw).
 */
import * as THREE from "three";
import type { EmberVoxelModel, EmberVoxelPlacement } from "../content/types";
import { blockStoryHeight } from "../tile/extruded";
import { voxelDensity, voxelGridSize } from "./voxelModel";
import { resolveEmberTransformScale } from "../world/worldTransform";

/**
 * Tiny global geometry bleed which hides floating-point/raster cracks where
 * separately meshed voxel props meet. Only the map plane grows: authored
 * step heights and floor elevation stay bit-for-bit unchanged.
 */
export const VOXEL_PROP_SEAM_BLEED_VOXELS = 0.05;

export function voxelPlacementSeamScale(model: EmberVoxelModel): {
  x: number;
  y: number;
  z: number;
} {
  const { sx, sz } = voxelGridSize(model);
  const bleed = VOXEL_PROP_SEAM_BLEED_VOXELS;
  return {
    x: (sx + bleed * 2) / sx,
    y: 1,
    z: (sz + bleed * 2) / sz,
  };
}

/** Normalize quarter-turns (0..3). */
export function normalizeVoxelRot(rot: number | undefined): number {
  const r = Number.isFinite(rot) ? Math.round(rot!) : 0;
  return ((r % 4) + 4) % 4;
}

/**
 * Place a meshed voxel model in world space.
 * Rotates around the footprint center in 90° steps (`placement.rot`).
 */
export function applyVoxelPlacementTransform(
  group: THREE.Group,
  placement: Pick<
    EmberVoxelPlacement,
    "x" | "y" | "elev" | "rot" | "scale"
  >,
  model: EmberVoxelModel,
  tileSize: number,
  elev: number,
): void {
  const { sx, sz } = voxelGridSize(model);
  const vw = tileSize / voxelDensity(model);
  const w = sx * vw;
  const d = sz * vw;
  const rot = normalizeVoxelRot(placement.rot);
  const scale = resolveEmberTransformScale(placement.scale);
  const seam = voxelPlacementSeamScale(model);

  // Center pivot so yaw spins in place (SW corner stays consistent at rot=0).
  if (!group.userData.voxelPivotReady) {
    const inner = new THREE.Group();
    while (group.children.length) {
      inner.add(group.children[0]!);
    }
    inner.position.set(-w * seam.x * 0.5, 0, -d * seam.z * 0.5);
    inner.scale.set(seam.x, seam.y, seam.z);
    group.add(inner);
    group.userData.voxelPivotReady = true;
  } else {
    const inner = group.children[0] as THREE.Group | undefined;
    if (inner) {
      inner.position.set(-w * seam.x * 0.5, 0, -d * seam.z * 0.5);
      inner.scale.set(seam.x, seam.y, seam.z);
    }
  }

  group.position.set(
    placement.x * tileSize + w * 0.5,
    elev * blockStoryHeight(tileSize),
    placement.y * tileSize + d * 0.5,
  );
  group.rotation.y = rot * (Math.PI / 2);
  // Ember uses X/Y on the map plane and Z vertically; Three uses X/Z + Y-up.
  group.scale.set(scale.x, scale.z, scale.y);
}
