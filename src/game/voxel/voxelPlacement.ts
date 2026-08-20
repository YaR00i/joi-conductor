/**
 * World transform for a voxel prop on the map (tile SW anchor + optional 90° yaw).
 */
import * as THREE from "three";
import type { EmberVoxelModel, EmberVoxelPlacement } from "../content/types";
import { blockStoryHeight } from "../tile/extruded";
import { VOXELS_PER_BLOCK } from "./constants";
import { voxelGridSize } from "./voxelModel";
import { resolveEmberTransformScale } from "../world/worldTransform";

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
  const vw = tileSize / VOXELS_PER_BLOCK;
  const w = sx * vw;
  const d = sz * vw;
  const rot = normalizeVoxelRot(placement.rot);
  const scale = resolveEmberTransformScale(placement.scale);

  // Center pivot so yaw spins in place (SW corner stays consistent at rot=0).
  if (!group.userData.voxelPivotReady) {
    const inner = new THREE.Group();
    while (group.children.length) {
      inner.add(group.children[0]!);
    }
    inner.position.set(-w * 0.5, 0, -d * 0.5);
    group.add(inner);
    group.userData.voxelPivotReady = true;
  } else {
    const inner = group.children[0] as THREE.Group | undefined;
    if (inner) inner.position.set(-w * 0.5, 0, -d * 0.5);
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
