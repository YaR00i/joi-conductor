/**
 * Voxel library: one Unity-like prefab file per model.
 * Absence from memory is not a delete. Saves write only dirty files.
 */
import type {
  EmberVoxelAssetFile,
  EmberVoxelModel,
  EmberVoxelScene,
  EmberVoxelsFile,
} from "../content/types";
import { normalizeEmberLibraryTags } from "../content/libraryTags";
import { stripVoxelGridForPrefab, voxRelForModelId } from "./emberVoxCodec";

export const VOXEL_MODELS_DIR = "voxels/models";
export const VOXEL_SCENES_DIR = "voxels/scenes";
export const VOXEL_LEGACY_SHARD_NAMES = [
  "registry.json",
  "village.json",
  "user.json",
  "fantasy.json",
] as const;

/** @deprecated leftover shard names; new writes go to voxels/models/<id>.json */
export const VOXEL_SHARD_REGISTRY = "voxels/registry.json";
export const VOXEL_SHARD_VILLAGE = "voxels/village.json";
export const VOXEL_SHARD_USER = "voxels/user.json";
export const VOXEL_SHARD_FANTASY = "voxels/fantasy.json";

export function voxelAssetFileName(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${safe || "voxel"}.json`;
}

export function voxelModelRel(id: string): string {
  return `${VOXEL_MODELS_DIR}/${voxelAssetFileName(id)}`;
}

export function voxelSceneRel(id: string): string {
  return `${VOXEL_SCENES_DIR}/${voxelAssetFileName(id)}`;
}

export function voxelVoxRel(id: string): string {
  return voxRelForModelId(id);
}

export function voxelVoxRelForJson(jsonRel: string, id: string): string {
  const rel = normalizeVoxelRel(jsonRel);
  if (rel.toLowerCase().endsWith(".json")) return `${rel.slice(0, -5)}.vox`;
  return voxelVoxRel(id);
}

function normalizeVoxelRel(relPath: string): string {
  return relPath.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function isVoxelLibraryRel(relPath: string): boolean {
  const rel = normalizeVoxelRel(relPath);
  if (!rel.startsWith("voxels/") || !rel.toLowerCase().endsWith(".json")) {
    return false;
  }
  if (rel.toLowerCase().endsWith(".bak")) return false;
  const rest = rel.slice("voxels/".length);
  const parts = rest.split("/");
  if (parts.some((part) => !part)) return false;
  if (parts.length === 1) return true;
  return (
    parts.length === 2 && (parts[0] === "models" || parts[0] === "scenes")
  );
}

export function isVoxelModelAssetRel(relPath: string): boolean {
  const rel = normalizeVoxelRel(relPath);
  return rel.startsWith(`${VOXEL_MODELS_DIR}/`) && rel.endsWith(".json");
}

export function voxelFileLooksEmpty(data: unknown): boolean {
  if (!data || typeof data !== "object") return true;
  const rec = data as {
    models?: unknown;
    model?: unknown;
    voxels?: unknown;
    id?: unknown;
    mesh?: { file?: unknown };
  };
  if (Array.isArray(rec.models)) return rec.models.length === 0;
  if (typeof rec.mesh?.file === "string" && rec.mesh.file) return false;
  if (rec.model && typeof rec.model === "object") {
    const model = rec.model as { id?: unknown };
    return !model.id && !rec.id;
  }
  if (typeof rec.id === "string" && Array.isArray(rec.voxels)) return false;
  return true;
}

function countModelsInData(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as {
    models?: unknown;
    model?: unknown;
    voxels?: unknown;
    id?: unknown;
    scene?: unknown;
    mesh?: { file?: unknown };
  };
  if (Array.isArray(rec.models)) return rec.models.length;
  if (typeof rec.mesh?.file === "string" && rec.mesh.file) return 1;
  if (rec.model && typeof rec.model === "object") {
    const model = rec.model as { id?: unknown };
    return model.id || rec.id ? 1 : 0;
  }
  if (typeof rec.id === "string" && Array.isArray(rec.voxels)) return 1;
  if (typeof rec.id === "string") return 0;
  if (rec.scene && typeof rec.scene === "object") return 0;
  return null;
}

export function voxelMeshFileFromRaw(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as { mesh?: { kind?: unknown; file?: unknown } };
  if (rec.mesh?.kind != null && rec.mesh.kind !== "vox") return null;
  if (typeof rec.mesh?.file !== "string") return null;
  const file = rec.mesh.file.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  return file || null;
}

export function countVoxelModelsInText(text: string): number | null {
  try {
    return countModelsInData(JSON.parse(text));
  } catch {
    return null;
  }
}

export function shouldIgnoreVoxelOverride(overrideText: string): boolean {
  const trimmed = overrideText.trim();
  if (!trimmed) return true;
  const count = countVoxelModelsInText(trimmed);
  return count == null || count === 0;
}

export function voxelTextLooksUsable(text: string | null | undefined): boolean {
  if (!text || !text.trim()) return false;
  const count = countVoxelModelsInText(text);
  return count != null && count > 0;
}

export type VoxelLibraryTextSource = "override" | "disk" | "backup";

/**
 * Prefer a usable override, but skip empty/thin ones so a bad browser cache
 * cannot hide the on-disk catalog (and later get written back over it).
 */
export function pickVoxelLibraryText(input: {
  overrideText?: string | null;
  diskText?: string | null;
  bakText?: string | null;
}): { text: string; source: VoxelLibraryTextSource } | null {
  const diskCount = input.diskText ? countVoxelModelsInText(input.diskText) : null;
  const overrideCount = input.overrideText
    ? countVoxelModelsInText(input.overrideText)
    : null;
  const overrideThin =
    diskCount != null &&
    diskCount >= 8 &&
    overrideCount != null &&
    overrideCount < diskCount * 0.5;

  if (
    input.overrideText &&
    voxelTextLooksUsable(input.overrideText) &&
    !overrideThin
  ) {
    return { text: input.overrideText, source: "override" };
  }
  if (input.diskText && voxelTextLooksUsable(input.diskText)) {
    return { text: input.diskText, source: "disk" };
  }
  if (input.bakText && voxelTextLooksUsable(input.bakText)) {
    return { text: input.bakText, source: "backup" };
  }
  if (input.diskText != null && input.diskText !== "") {
    return { text: input.diskText, source: "disk" };
  }
  if (input.overrideText) {
    return { text: input.overrideText, source: "override" };
  }
  if (input.bakText) {
    return { text: input.bakText, source: "backup" };
  }
  return null;
}

export function isVoxelShardFileName(name: string): boolean {
  const lower = name.toLowerCase();
  if (!lower.endsWith(".json") || lower.endsWith(".bak.json")) return false;
  if (lower.includes(".bak.")) return false;
  return !name.includes("/") && !name.includes("\\");
}

export function isVoxelJsonFileName(name: string): boolean {
  return isVoxelShardFileName(name);
}

/** registry.json first, then the rest alphabetically. */
export function orderVoxelShardNames(names: string[]): string[] {
  const json = [...new Set(names.filter(isVoxelShardFileName))];
  const rest = json.filter((name) => name !== "registry.json").sort();
  return json.includes("registry.json") ? ["registry.json", ...rest] : rest;
}

export function defaultVoxelShardNames(listed: string[]): string[] {
  return orderVoxelShardNames(listed.filter(isVoxelShardFileName));
}

export function formatVoxelShardLabel(relPath: string): string {
  const rel = normalizeVoxelRel(relPath);
  const short = rel.startsWith("voxels/") ? rel.slice("voxels/".length) : rel;
  if (short.startsWith("models/") && short.toLowerCase().endsWith(".json")) {
    return `${short} + .vox`;
  }
  return short;
}

export function assignVoxelAssetRel(
  id: string,
  knownShardById: Record<string, string>,
): string {
  const known = knownShardById[id];
  if (known && isVoxelModelAssetRel(known)) return known;
  return voxelModelRel(id);
}

/** @deprecated use assignVoxelAssetRel — always a per-model file now. */
export function assignVoxelShard(
  id: string,
  knownShardById: Record<string, string>,
): string {
  return assignVoxelAssetRel(id, knownShardById);
}

export function isTrivialVoxelScene(
  scene: EmberVoxelScene | undefined,
  modelId: string,
): boolean {
  if (!scene) return true;
  if (scene.id !== modelId) return false;
  if ((scene.joints?.length ?? 0) > 0) return false;
  if ((scene.animations?.length ?? 0) > 0) return false;
  const objects = scene.objects ?? [];
  if (objects.length !== 1) return false;
  return objects[0]?.modelId === modelId;
}

export function parseVoxelLibraryDocument(raw: unknown): EmberVoxelsFile {
  if (!raw || typeof raw !== "object") return { models: [], scenes: [] };
  const rec = raw as {
    models?: EmberVoxelModel[];
    scenes?: EmberVoxelScene[];
    model?: EmberVoxelModel;
    scene?: EmberVoxelScene;
    id?: string;
    voxels?: unknown;
    nameRu?: string;
    tags?: string[];
  };
  if (Array.isArray(rec.models)) {
    return { models: rec.models, scenes: rec.scenes };
  }
  if (rec.model && typeof rec.model === "object") {
    const model = {
      ...rec.model,
      id: rec.model.id || rec.id || "",
      nameRu: rec.model.nameRu ?? rec.nameRu,
      tags: rec.model.tags ?? rec.tags,
    };
    const scenes = rec.scene?.id ? [rec.scene] : [];
    return { models: model.id ? [model] : [], scenes };
  }
  if (rec.scene && typeof rec.scene === "object" && rec.scene.id) {
    return { models: [], scenes: [rec.scene] };
  }
  if (typeof rec.id === "string" && Array.isArray(rec.voxels)) {
    return { models: [rec as EmberVoxelModel], scenes: rec.scenes };
  }
  return { models: [], scenes: [] };
}

export function serializeVoxelAssetFile(
  model: EmberVoxelModel,
  scene?: EmberVoxelScene,
): EmberVoxelAssetFile {
  const tags = normalizeEmberLibraryTags(model.tags);
  const withTags = tags ? { ...model, tags } : { ...model, tags: undefined };
  const file: EmberVoxelAssetFile = {
    id: withTags.id,
    nameRu: withTags.nameRu,
    mesh: { kind: "vox", file: voxelVoxRel(withTags.id) },
    model: stripVoxelGridForPrefab(withTags),
  };
  if (tags) file.tags = tags;
  if (scene && !isTrivialVoxelScene(scene, model.id)) {
    file.scene = scene;
  }
  return file;
}

export function voxelAssetFingerprint(file: EmberVoxelAssetFile): string {
  return JSON.stringify({
    id: file.id,
    nameRu: file.nameRu,
    tags: file.tags ?? null,
    mesh: file.mesh ?? null,
    model: file.model,
    scene: file.scene ?? null,
  });
}

export type VoxelDiskAsset = {
  rel: string;
  model: EmberVoxelModel;
  scene?: EmberVoxelScene;
};

export type VoxelLibrarySaveInput = {
  diskAssets: Record<string, VoxelDiskAsset>;
  incomingModels: Record<string, EmberVoxelModel>;
  incomingScenes: Record<string, EmberVoxelScene>;
  deletedIds?: Iterable<string>;
  dirtyIds?: Iterable<string>;
};

export type VoxelLibrarySaveResult = {
  writeAssets: Record<string, EmberVoxelAssetFile>;
  writeRels: Record<string, string>;
  extraScenes: Record<string, EmberVoxelScene>;
  extraSceneRels: Record<string, string>;
  deleteRels: string[];
  sources: Record<string, string>;
  sceneSources: Record<string, string>;
};

function sceneForModel(
  modelId: string,
  scenes: Record<string, EmberVoxelScene>,
): EmberVoxelScene | undefined {
  const direct = scenes[modelId];
  if (direct) return direct;
  return Object.values(scenes).find(
    (scene) =>
      scene.objects.length === 1 && scene.objects[0]?.modelId === modelId,
  );
}

/**
 * Start from disk assets, upsert dirty incoming, remove only `deletedIds`.
 * Models missing from memory stay on disk.
 */
export function mergeVoxelLibrarySave(
  input: VoxelLibrarySaveInput,
): VoxelLibrarySaveResult {
  const deleted = new Set(input.deletedIds ?? []);
  const dirty = input.dirtyIds
    ? new Set([...input.dirtyIds])
    : new Set(Object.keys(input.incomingModels));

  const models: Record<string, EmberVoxelModel> = {};
  const scenes: Record<string, EmberVoxelScene> = {};
  const sources: Record<string, string> = {};
  const sceneSources: Record<string, string> = {};

  for (const [id, asset] of Object.entries(input.diskAssets)) {
    models[id] = asset.model;
    sources[id] = asset.rel;
    if (asset.scene) {
      scenes[asset.scene.id] = asset.scene;
      sceneSources[asset.scene.id] = asset.rel;
    }
  }

  for (const model of Object.values(input.incomingModels)) {
    if (!model?.id || deleted.has(model.id)) continue;
    if (!dirty.has(model.id) && models[model.id]) continue;
    models[model.id] = model;
  }
  for (const scene of Object.values(input.incomingScenes)) {
    if (!scene?.id || deleted.has(scene.id)) continue;
    const touchesDirty = dirty.has(scene.id) ||
      scene.objects.some((object) => dirty.has(object.modelId));
    if (!touchesDirty && scenes[scene.id]) continue;
    scenes[scene.id] = scene;
  }
  for (const id of deleted) {
    delete models[id];
    delete scenes[id];
    delete sources[id];
    delete sceneSources[id];
  }

  const writeAssets: Record<string, EmberVoxelAssetFile> = {};
  const writeRels: Record<string, string> = {};
  const extraScenes: Record<string, EmberVoxelScene> = {};
  const extraSceneRels: Record<string, string> = {};
  const deleteRels: string[] = [];
  const usedSceneIds = new Set<string>();

  for (const id of deleted) {
    const known = input.diskAssets[id];
    const jsonRel = known?.rel ?? voxelModelRel(id);
    deleteRels.push(jsonRel);
    deleteRels.push(voxelSceneRel(id));
    deleteRels.push(voxelVoxRelForJson(jsonRel, id));
  }

  for (const model of Object.values(models)) {
    const rel = assignVoxelAssetRel(model.id, sources);
    sources[model.id] = rel;
    const scene = sceneForModel(model.id, scenes);
    const file = serializeVoxelAssetFile(model, scene);
    if (file.scene) usedSceneIds.add(file.scene.id);
    else if (scene && isTrivialVoxelScene(scene, model.id)) {
      usedSceneIds.add(scene.id);
    }
    if (dirty.has(model.id) || !input.diskAssets[model.id]) {
      writeAssets[model.id] = file;
      writeRels[model.id] = rel;
    }
  }

  for (const scene of Object.values(scenes)) {
    if (usedSceneIds.has(scene.id)) continue;
    const rel = sceneSources[scene.id] ?? voxelSceneRel(scene.id);
    sceneSources[scene.id] = rel;
    const touchesDirty =
      dirty.has(scene.id) ||
      scene.objects.some((object) => dirty.has(object.modelId));
    if (!touchesDirty) continue;
    extraScenes[scene.id] = scene;
    extraSceneRels[scene.id] = rel;
  }

  return {
    writeAssets,
    writeRels,
    extraScenes,
    extraSceneRels,
    deleteRels: [...new Set(deleteRels)],
    sources,
    sceneSources,
  };
}

/** @deprecated shard fingerprint — kept for catalog JSON still on disk. */
export function voxelShardPayload(
  file: EmberVoxelsFile,
  hadScenes: boolean,
): EmberVoxelsFile {
  const models = file.models ?? [];
  const scenes = file.scenes ?? [];
  if (scenes.length > 0 || hadScenes) {
    return { models, scenes };
  }
  return { models };
}

export function voxelShardFingerprint(file: EmberVoxelsFile): string {
  const models = [...(file.models ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const scenes = [...(file.scenes ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({ models, scenes });
}

export function voxelShardChanged(
  next: EmberVoxelsFile,
  prev: EmberVoxelsFile | undefined,
): boolean {
  if (!prev) return (next.models?.length ?? 0) > 0 || (next.scenes?.length ?? 0) > 0;
  return voxelShardFingerprint(next) !== voxelShardFingerprint(prev);
}
