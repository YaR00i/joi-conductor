/**
 * Persist voxel models as a json + .vox pair (`voxels/models/<id>.json|.vox`).
 * Absence from memory is not a delete — only dirtyIds / deletedIds are written.
 */
import type {
  EmberPack,
  EmberVoxelAssetFile,
  EmberVoxelModel,
  EmberVoxelScene,
} from "../content/types";
import {
  deleteEmberFile,
  readEmberBytes,
  readEmberJsonFromDisk,
  writeEmberBytes,
  writeEmberJson,
} from "../content/io";
import {
  joinEmberVoxelPrefab,
  splitEmberVoxelPrefab,
} from "./emberVoxCodec";
import { ensureVoxelScenes, normalizeVoxelScene } from "./voxelScene";
import {
  assignVoxelAssetRel,
  isTrivialVoxelScene,
  parseVoxelLibraryDocument,
  voxelAssetFingerprint,
  voxelMeshFileFromRaw,
  voxelModelRel,
  voxelSceneRel,
  voxelVoxRelForJson,
} from "./voxelLibrary";

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function prefabFromDiskRaw(raw: unknown): EmberVoxelAssetFile | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const parsed = parseVoxelLibraryDocument(raw);
  const model = parsed.models[0];
  if (!model?.id) return null;
  const file: EmberVoxelAssetFile = {
    id: typeof rec.id === "string" ? rec.id : model.id,
    model,
  };
  if (typeof rec.nameRu === "string") file.nameRu = rec.nameRu;
  else if (model.nameRu) file.nameRu = model.nameRu;
  if (Array.isArray(rec.tags)) file.tags = rec.tags as string[];
  const meshFile = voxelMeshFileFromRaw(raw);
  if (meshFile) file.mesh = { kind: "vox", file: meshFile };
  if (parsed.scenes?.[0]) file.scene = parsed.scenes[0];
  return file;
}

async function readDiskPrefab(rel: string): Promise<EmberVoxelAssetFile | null> {
  const res = await readEmberJsonFromDisk<unknown>(rel);
  if (!res.ok) return null;
  return prefabFromDiskRaw(res.data);
}

export async function hydrateVoxelPrefab(
  model: EmberVoxelModel,
  raw: unknown,
): Promise<EmberVoxelModel> {
  if (model.voxels.some((value) => value > 0)) return model;
  const meshFile = voxelMeshFileFromRaw(raw);
  if (!meshFile) return model;
  const bytes = await readEmberBytes(meshFile);
  if (!bytes.ok) return model;
  try {
    return joinEmberVoxelPrefab(
      {
        id: model.id,
        nameRu: model.nameRu,
        tags: model.tags,
        mesh: { kind: "vox", file: meshFile },
        model,
      },
      bytes.data,
    );
  } catch {
    return model;
  }
}

// Editors fire saves fire-and-forget; overlapping read-disk/write cycles
// could let an older snapshot overwrite a newer model's just-written file.
// Serialize the whole cycle so each save sees the previous one on disk.
let voxelWriteChain: Promise<unknown> = Promise.resolve();

export function writeVoxelRegistry(
  models: Record<string, EmberVoxelModel>,
  scenes: Record<string, EmberVoxelScene>,
  options?: {
    deletedIds?: Iterable<string>;
    dirtyIds?: Iterable<string>;
    /** Do not overwrite MagicaVoxel `.vox` for these ids (JSON still updates). */
    skipVoxWrite?: Iterable<string>;
  },
): Promise<
  | { ok: true; libraryFiles: Record<string, string> }
  | { ok: false; error: string }
> {
  const task = voxelWriteChain.then(() =>
    runWriteVoxelRegistry(models, scenes, options),
  );
  voxelWriteChain = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

async function runWriteVoxelRegistry(
  models: Record<string, EmberVoxelModel>,
  scenes: Record<string, EmberVoxelScene>,
  options?: {
    deletedIds?: Iterable<string>;
    dirtyIds?: Iterable<string>;
    /** Do not overwrite MagicaVoxel `.vox` for these ids (JSON still updates). */
    skipVoxWrite?: Iterable<string>;
  },
): Promise<
  | { ok: true; libraryFiles: Record<string, string> }
  | { ok: false; error: string }
> {
  const deleted = [...new Set(options?.deletedIds ?? [])];
  const dirty = [
    ...new Set(options?.dirtyIds ?? Object.keys(models)),
  ].filter((id) => !deleted.includes(id));
  const skipVox = new Set(options?.skipVoxWrite ?? []);

  const libraryFiles: Record<string, string> = {};
  const ensured = ensureVoxelScenes(models, scenes);

  for (const id of deleted) {
    const jsonRel = voxelModelRel(id);
    const voxRel = voxelVoxRelForJson(jsonRel, id);
    const modelDel = await deleteEmberFile(jsonRel);
    if (!modelDel.ok) return { ok: false, error: modelDel.error };
    await deleteEmberFile(voxelSceneRel(id));
    await deleteEmberFile(voxRel);
  }

  for (const id of dirty) {
    const model = models[id];
    if (!model?.id) continue;
    const rel = assignVoxelAssetRel(id, {});
    const scene = ensured[id];
    const { asset, vox } = splitEmberVoxelPrefab(model);
    const payload: EmberVoxelAssetFile = { ...asset };
    if (scene && !isTrivialVoxelScene(scene, model.id)) {
      payload.scene = scene;
    }
    const voxRel = payload.mesh?.file ?? voxelVoxRelForJson(rel, id);

    const prev = await readDiskPrefab(rel);
    const jsonUnchanged =
      prev != null &&
      voxelAssetFingerprint(prev) === voxelAssetFingerprint(payload);
    const diskVox = await readEmberBytes(voxRel);
    const voxUnchanged = diskVox.ok && bytesEqual(diskVox.data, vox);
    if (jsonUnchanged && (voxUnchanged || skipVox.has(id))) {
      libraryFiles[id] = rel;
      continue;
    }

    if (!voxUnchanged && !skipVox.has(id)) {
      const voxRes = await writeEmberBytes(voxRel, vox);
      if (!voxRes.ok) return { ok: false, error: voxRes.error };
    }
    if (!jsonUnchanged) {
      const res = await writeEmberJson(rel, payload);
      if (!res.ok) return { ok: false, error: res.error };
    }
    libraryFiles[id] = rel;
  }

  for (const scene of Object.values(ensured)) {
    if (models[scene.id]) continue;
    const touchesDirty =
      dirty.includes(scene.id) ||
      scene.objects.some((object) => dirty.includes(object.modelId));
    if (!touchesDirty) continue;
    if (isTrivialVoxelScene(scene, scene.id)) continue;
    const rel = voxelSceneRel(scene.id);
    const res = await writeEmberJson(rel, { id: scene.id, scene });
    if (!res.ok) return { ok: false, error: res.error };
  }

  return { ok: true, libraryFiles };
}

export function packWithVoxels(
  pack: EmberPack,
  models: Record<string, EmberVoxelModel>,
  scenes?: Record<string, EmberVoxelScene>,
  libraryFiles?: Record<string, string>,
): EmberPack {
  const voxelScenes = ensureVoxelScenes(
    models,
    scenes ?? pack.voxelScenes ?? {},
  );
  const known = libraryFiles ?? pack.voxelLibraryFiles ?? {};
  const nextFiles = { ...known };
  for (const id of Object.keys(models)) {
    nextFiles[id] = assignVoxelAssetRel(id, known);
  }
  return {
    ...pack,
    voxelModels: models,
    voxelScenes,
    voxelLibraryFiles: nextFiles,
  };
}

export function upsertVoxelScene(
  scenes: Record<string, EmberVoxelScene>,
  scene: EmberVoxelScene,
): Record<string, EmberVoxelScene> {
  return { ...scenes, [scene.id]: normalizeVoxelScene(scene) };
}
