/**
 * Persist voxel models + editor scenes to registry.json and pack.
 */
import type { EmberPack, EmberVoxelModel, EmberVoxelScene } from "../content/types";
import { writeEmberJson } from "../content/io";
import { ensureVoxelScenes, normalizeVoxelScene } from "./voxelScene";

export async function writeVoxelRegistry(
  models: Record<string, EmberVoxelModel>,
  scenes: Record<string, EmberVoxelScene>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ensured = ensureVoxelScenes(models, scenes);
  const res = await writeEmberJson("voxels/registry.json", {
    models: Object.values(models),
    scenes: Object.values(ensured),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true };
}

export function packWithVoxels(
  pack: EmberPack,
  models: Record<string, EmberVoxelModel>,
  scenes?: Record<string, EmberVoxelScene>,
): EmberPack {
  const voxelScenes = ensureVoxelScenes(
    models,
    scenes ?? pack.voxelScenes ?? {},
  );
  return {
    ...pack,
    voxelModels: models,
    voxelScenes,
  };
}

export function upsertVoxelScene(
  scenes: Record<string, EmberVoxelScene>,
  scene: EmberVoxelScene,
): Record<string, EmberVoxelScene> {
  return { ...scenes, [scene.id]: normalizeVoxelScene(scene) };
}
