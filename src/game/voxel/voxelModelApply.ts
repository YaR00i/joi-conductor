/**
 * Pull voxel-editor model modifiers into map placements / chest regions.
 * Rule: applying a library model/scene into another tool copies size + light
 * (and related) settings so the instance matches the sculptor asset.
 */
import type {
  EmberMapRegion,
  EmberVoxelModel,
  EmberVoxelPlacement,
  EmberVoxelScene,
} from "../content/types";
import { VOXELS_PER_BLOCK } from "./constants";
import { voxelGridSize } from "./voxelModel";

export type VoxelModelLib = Record<string, EmberVoxelModel>;

/** Footprint of a lone model in map tiles (from sizeBlocks XZ). */
export function footprintTilesFromVoxelModel(model: EmberVoxelModel): {
  w: number;
  h: number;
} {
  return {
    w: Math.max(1, Math.round(model.sizeBlocks.x) || 1),
    h: Math.max(1, Math.round(model.sizeBlocks.z) || 1),
  };
}

/** Axis-aligned footprint of a scene in voxel units. */
export function sceneFootprintVoxels(
  scene: EmberVoxelScene,
  models: VoxelModelLib,
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let any = false;
  for (const obj of scene.objects) {
    if (obj.visible === false) continue;
    const m = models[obj.modelId];
    if (!m) continue;
    const g = voxelGridSize(m);
    any = true;
    minX = Math.min(minX, obj.offset.x);
    maxX = Math.max(maxX, obj.offset.x + g.sx);
    minZ = Math.min(minZ, obj.offset.z);
    maxZ = Math.max(maxZ, obj.offset.z + g.sz);
  }
  if (!any) return null;
  return { minX, maxX, minZ, maxZ };
}

/** Scene footprint in map tiles. */
export function footprintTilesFromVoxelScene(
  scene: EmberVoxelScene,
  models: VoxelModelLib,
): { w: number; h: number } {
  const foot = sceneFootprintVoxels(scene, models);
  if (!foot) return { w: 1, h: 1 };
  const w = Math.max(
    1,
    Math.ceil((foot.maxX - foot.minX) / VOXELS_PER_BLOCK),
  );
  const h = Math.max(
    1,
    Math.ceil((foot.maxZ - foot.minZ) / VOXELS_PER_BLOCK),
  );
  return { w, h };
}

/**
 * Light + related modifiers from a sculptor model → voxel map placement.
 * Size stays on the model via `modelId` (mesh footprint).
 */
export function voxelPlacementModifiersFromModel(
  model: EmberVoxelModel,
): Partial<
  Pick<
    EmberVoxelPlacement,
    | "emissiveCastsLight"
    | "emissiveLightRange"
    | "emissiveLightShadows"
    | "emissiveStrength"
    | "emissiveTorchFlicker"
    | "emissiveLanternFlicker"
    | "emissiveSuppressHostShadow"
  >
> {
  if (model.emissiveCastsLight !== true) {
    // Still pull suppress if authored (open frames without a light).
    if (model.emissiveSuppressHostShadow === true) {
      return { emissiveSuppressHostShadow: true };
    }
    return {};
  }
  return {
    emissiveCastsLight: true,
    emissiveLightRange: model.emissiveLightRange,
    emissiveLightShadows:
      model.emissiveLightShadows === true ? true : undefined,
    emissiveStrength: model.emissiveStrength,
    emissiveTorchFlicker:
      model.emissiveTorchFlicker === true ? true : undefined,
    emissiveLanternFlicker:
      model.emissiveLanternFlicker === true ? true : undefined,
    emissiveSuppressHostShadow:
      model.emissiveSuppressHostShadow === true ? true : undefined,
  };
}

/** Clamp region footprint to the map, keeping the NW corner when possible. */
export function clampRegionFootprint(
  region: Pick<EmberMapRegion, "x" | "y" | "w" | "h">,
  mapW: number,
  mapH: number,
  nextW: number,
  nextH: number,
): { x: number; y: number; w: number; h: number } {
  const w = Math.max(1, Math.min(mapW, nextW));
  const h = Math.max(1, Math.min(mapH, nextH));
  const x = Math.max(0, Math.min(region.x, mapW - w));
  const y = Math.max(0, Math.min(region.y, mapH - h));
  return { x, y, w, h };
}

/**
 * When linking a lone model to a chest: size (zone footprint) + model id.
 * Light stays on the model and is picked up at runtime for chest regions.
 */
export function chestRegionFromVoxelModel(
  region: EmberMapRegion,
  model: EmberVoxelModel,
  mapW: number,
  mapH: number,
): Partial<EmberMapRegion> {
  const foot = footprintTilesFromVoxelModel(model);
  const clamped = clampRegionFootprint(region, mapW, mapH, foot.w, foot.h);
  return {
    ...clamped,
    closedModelId: model.id,
    // Clear scene link when switching to a lone model.
    sceneId: undefined,
    openClipId: undefined,
  };
}

/**
 * When linking a sculptor scene to a chest: footprint from all objects +
 * scene/clip/model ids. Light modifiers live on each scene object’s model.
 */
export function chestRegionFromVoxelScene(
  region: EmberMapRegion,
  scene: EmberVoxelScene,
  models: VoxelModelLib,
  mapW: number,
  mapH: number,
): Partial<EmberMapRegion> {
  const foot = footprintTilesFromVoxelScene(scene, models);
  const clamped = clampRegionFootprint(region, mapW, mapH, foot.w, foot.h);
  const firstModel = scene.objects.find(
    (o) => o.visible !== false && models[o.modelId],
  )?.modelId;
  const firstClip = scene.animations?.[0]?.id;
  return {
    ...clamped,
    sceneId: scene.id,
    openClipId: firstClip,
    closedModelId: firstModel ?? region.closedModelId,
  };
}
