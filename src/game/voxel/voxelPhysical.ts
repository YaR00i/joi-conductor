/**
 * Physicality (collision) for voxel models on the map and in zones.
 * Model flag `physical !== false` → collide; `false` → walk-through.
 */
import type {
  EmberMapRegion,
  EmberVoxelModel,
  EmberVoxelPlacement,
  EmberVoxelScene,
} from "../content/types";
import { blockStoryHeight } from "../tile/extruded";
import { VOXELS_PER_BLOCK } from "./constants";
import {
  isVoxelModelPhysical,
  voxelDensity,
  voxelGridSize,
} from "./voxelModel";
import { sceneFootprintVoxels } from "./voxelModelApply";
import { normalizeVoxelRot } from "./voxelPlacement";

export { isVoxelModelPhysical };

export type EmberVoxelSceneLib = Record<string, EmberVoxelScene>;

export type ZoneVoxelPose = {
  x: number;
  y: number;
  elev: number;
  rot: number;
  scale: number;
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** SW-tile placement from a world-centered model instance. */
function placementFromWorldCenter(
  tileSize: number,
  model: EmberVoxelModel,
  worldX: number,
  worldY: number,
  elev: number,
  rot: number,
  id: string,
  scale = 1,
): EmberVoxelPlacement {
  const { sx, sz } = voxelGridSize(model);
  const vw = tileSize / voxelDensity(model);
  return {
    id,
    modelId: model.id,
    x: (worldX - sx * vw * 0.5) / tileSize,
    y: (worldY - sz * vw * 0.5) / tileSize,
    elev,
    rot: normalizeVoxelRot(rot),
    scale: { x: scale, y: scale, z: scale },
  };
}

/**
 * Synthetic voxel props for a zone region that uses physical voxel models
 * (chest scene / closed model). Pose is the visual center (same as mesh).
 */
export function zoneRegionPhysicalVoxelPlacements(
  tileSize: number,
  region: EmberMapRegion,
  pose: ZoneVoxelPose,
  models: Record<string, EmberVoxelModel>,
  scenes?: EmberVoxelSceneLib,
): EmberVoxelPlacement[] {
  const scale = clamp(pose.scale, 0.25, 3);
  const rot = normalizeVoxelRot(pose.rot);
  const story = blockStoryHeight(tileSize);
  const vw = (tileSize / VOXELS_PER_BLOCK) * scale;
  const out: EmberVoxelPlacement[] = [];

  const scene =
    region.sceneId && scenes ? scenes[region.sceneId] : undefined;

  if (scene) {
    const foot = sceneFootprintVoxels(scene, models);
    if (!foot) return out;
    const scx = (foot.minX + foot.maxX) * 0.5;
    const scz = (foot.minZ + foot.maxZ) * 0.5;
    const angle = rot * (Math.PI / 2);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (const obj of scene.objects) {
      if (obj.visible === false) continue;
      const model = models[obj.modelId];
      if (!model || !isVoxelModelPhysical(model)) continue;
      const g = voxelGridSize(model);
      const lx = (obj.offset.x + g.sx * 0.5 - scx) * vw;
      const lz = (obj.offset.z + g.sz * 0.5 - scz) * vw;
      // Match Three.js Yaw: x' = x cos + z sin, z' = -x sin + z cos
      const worldX = pose.x + lx * cos + lz * sin;
      const worldY = pose.y - lx * sin + lz * cos;
      const elev = pose.elev + (obj.offset.y * vw) / story;
      out.push(
        placementFromWorldCenter(
          tileSize,
          model,
          worldX,
          worldY,
          elev,
          rot,
          `zone_${region.id}_${obj.id}`,
          scale,
        ),
      );
    }
    return out;
  }

  const modelId = region.closedModelId;
  if (!modelId) return out;
  const model = models[modelId];
  if (!model || !isVoxelModelPhysical(model)) return out;
  out.push(
    placementFromWorldCenter(
      tileSize,
      model,
      pose.x,
      pose.y,
      pose.elev,
      rot,
      `zone_${region.id}_${modelId}`,
      scale,
    ),
  );
  return out;
}
