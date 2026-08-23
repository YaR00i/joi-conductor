/**
 * Load explore maps / tilesets / voxel prefabs from content/ember on disk.
 * Node-only — does not go through Vite fetch or browser overrides.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  EmberActionScript,
  EmberBodyModifier,
  EmberItemDef,
  EmberItemIcon,
  EmberScene,
  EmberShopDef,
  EmberMap,
  EmberStage,
  EmberTileset,
  EmberVoxelAssetFile,
  EmberVoxelModel,
  EmberVoxelScene,
} from "../content/types";
import { ITEM_CATALOG_REL, parseItemsFile } from "../content/emberItem";
import { parseActionScript } from "../content/emberScript";
import { SHOP_CATALOG_REL, parseShopsFile } from "../content/emberShop";
import { joinEmberVoxelPrefab } from "../voxel/emberVoxCodec";
import {
  parseVoxelLibraryDocument,
  voxelModelRel,
  voxelVoxRelForJson,
  VOXEL_SCENES_DIR,
} from "../voxel/voxelLibrary";
import { normalizeVoxelModel } from "../voxel/voxelModel";
import { normalizeVoxelScene } from "../voxel/voxelScene";
import type { EmberVoxelModelLib, EmberVoxelSceneLib } from "../tile/mapUtils";
import { ensureMapLayers } from "../tile/mapUtils";

export const DEFAULT_AGENT_MAP_ID = "agent_sandbox";

export type ExploreWorld = {
  contentRoot: string;
  map: EmberMap;
  tileset: EmberTileset;
  stage: EmberStage | null;
  voxelModels: EmberVoxelModelLib;
  voxelScenes: EmberVoxelSceneLib;
  body: EmberBodyModifier | undefined;
  items: Record<string, EmberItemDef>;
  itemIcons: Record<string, EmberItemIcon>;
  shops: Record<string, EmberShopDef>;
  scenes: Record<string, EmberScene>;
  scripts: Record<string, EmberActionScript>;
};

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function repoRootFromThisModule(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

function findEmberContentFrom(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, "content", "ember");
    if (
      existsSync(path.join(candidate, "pack.json")) ||
      existsSync(path.join(candidate, "maps"))
    ) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function resolveEmberContentRoot(startDir = process.cwd()): string {
  const found =
    findEmberContentFrom(startDir) ?? findEmberContentFrom(repoRootFromThisModule());
  if (found) return found;
  throw new Error(
    `explorePackDisk: content/ember not found from ${startDir}`,
  );
}

function loadVoxelModelFromDisk(
  contentRoot: string,
  modelId: string,
): EmberVoxelModel | null {
  const rel = voxelModelRel(modelId);
  const jsonPath = path.join(contentRoot, rel);
  if (!existsSync(jsonPath)) return null;
  const raw: unknown = readJsonFile(jsonPath);
  const parsed = parseVoxelLibraryDocument(raw);
  const model = parsed.models[0];
  if (!model?.id) return null;
  let next = normalizeVoxelModel(model);
  if (!next.voxels.some((v) => v > 0)) {
    const voxRel = voxelVoxRelForJson(rel, model.id);
    const voxPath = path.join(contentRoot, voxRel);
    if (existsSync(voxPath)) {
      const bytes = new Uint8Array(readFileSync(voxPath));
      const rec = raw as Record<string, unknown>;
      const asset: EmberVoxelAssetFile = {
        id: typeof rec.id === "string" ? rec.id : next.id,
        model: next,
      };
      if (typeof rec.nameRu === "string") asset.nameRu = rec.nameRu;
      next = joinEmberVoxelPrefab(asset, bytes);
    }
  }
  return next;
}

function collectReferencedModelIds(map: EmberMap): string[] {
  const ids = new Set<string>();
  for (const prop of map.voxelProps ?? []) {
    if (prop.modelId) ids.add(prop.modelId);
  }
  for (const region of map.regions) {
    if (region.closedModelId) ids.add(region.closedModelId);
    if (region.openModelId) ids.add(region.openModelId);
  }
  return [...ids];
}

function collectReferencedSceneIds(map: EmberMap): string[] {
  const ids = new Set<string>();
  for (const region of map.regions) {
    if (region.sceneId) ids.add(region.sceneId);
  }
  return [...ids];
}

function loadVoxelSceneFromDisk(
  contentRoot: string,
  sceneId: string,
): EmberVoxelScene | null {
  const filePath = path.join(contentRoot, VOXEL_SCENES_DIR, `${sceneId}.json`);
  if (!existsSync(filePath)) return null;
  const raw: unknown = readJsonFile(filePath);
  const parsed = parseVoxelLibraryDocument(raw);
  const scene = parsed.scenes?.[0];
  if (!scene?.id) return null;
  return normalizeVoxelScene(scene);
}

function loadOptionalStage(
  contentRoot: string,
  mapId: string,
): EmberStage | null {
  const filePath = path.join(contentRoot, "stages", `${mapId}.json`);
  if (!existsSync(filePath)) return null;
  return readJsonFile<EmberStage>(filePath);
}

function loadItemCatalog(contentRoot: string): {
  items: Record<string, EmberItemDef>;
  itemIcons: Record<string, EmberItemIcon>;
} {
  const filePath = path.join(contentRoot, ITEM_CATALOG_REL);
  if (!existsSync(filePath)) return { items: {}, itemIcons: {} };
  try {
    return parseItemsFile(readJsonFile<unknown>(filePath));
  } catch {
    return { items: {}, itemIcons: {} };
  }
}

function loadJsonDirSync<T extends { id: string }>(
  contentRoot: string,
  dir: string,
): Record<string, T> {
  const folder = path.join(contentRoot, dir);
  if (!existsSync(folder)) return {};
  const out: Record<string, T> = {};
  for (const name of readdirSync(folder)) {
    if (!name.endsWith(".json") || name.endsWith(".bak.json")) continue;
    try {
      const raw = readJsonFile<T>(path.join(folder, name));
      if (raw?.id) out[raw.id] = raw;
    } catch {
      // skip broken authored files
    }
  }
  return out;
}

function loadShopCatalog(contentRoot: string): Record<string, EmberShopDef> {
  const filePath = path.join(contentRoot, SHOP_CATALOG_REL);
  if (!existsSync(filePath)) return {};
  try {
    return parseShopsFile(readJsonFile<unknown>(filePath));
  } catch {
    return {};
  }
}

export function loadExploreWorldFromDisk(opts?: {
  mapId?: string;
  contentRoot?: string;
}): ExploreWorld {
  const contentRoot = opts?.contentRoot ?? resolveEmberContentRoot();
  const mapId = opts?.mapId ?? DEFAULT_AGENT_MAP_ID;
  const mapPath = path.join(contentRoot, "maps", `${mapId}.json`);
  if (!existsSync(mapPath)) {
    throw new Error(`explorePackDisk: map not found: ${mapPath}`);
  }
  const map = ensureMapLayers(readJsonFile<EmberMap>(mapPath));
  const tilesetPath = path.join(
    contentRoot,
    "tilesets",
    `${map.tilesetId}.json`,
  );
  if (!existsSync(tilesetPath)) {
    throw new Error(`explorePackDisk: tileset not found: ${tilesetPath}`);
  }
  const tileset = readJsonFile<EmberTileset>(tilesetPath);
  const stage = loadOptionalStage(contentRoot, mapId);
  const { items, itemIcons } = loadItemCatalog(contentRoot);
  const shops = loadShopCatalog(contentRoot);
  const scenes = loadJsonDirSync<EmberScene>(contentRoot, "scenes");
  const scriptsRaw = loadJsonDirSync<EmberActionScript>(contentRoot, "scripts");
  const scripts: Record<string, EmberActionScript> = {};
  for (const raw of Object.values(scriptsRaw)) {
    const parsed = parseActionScript(raw);
    if (parsed) scripts[parsed.id] = parsed;
  }

  const voxelModels: EmberVoxelModelLib = {};
  for (const modelId of collectReferencedModelIds(map)) {
    const model = loadVoxelModelFromDisk(contentRoot, modelId);
    if (model) voxelModels[model.id] = model;
  }

  const voxelScenes: EmberVoxelSceneLib = {};
  for (const sceneId of collectReferencedSceneIds(map)) {
    const scene = loadVoxelSceneFromDisk(contentRoot, sceneId);
    if (scene) voxelScenes[scene.id] = scene;
  }

  return {
    contentRoot,
    map,
    tileset,
    stage,
    voxelModels,
    voxelScenes,
    body: stage?.playerBody,
    items,
    itemIcons,
    shops,
    scenes,
    scripts,
  };
}

/** Test helper: every model json in voxels/models (slow; prefer referenced). */
export function listVoxelModelIdsOnDisk(contentRoot: string): string[] {
  const dir = path.join(contentRoot, "voxels", "models");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".bak.json"))
    .map((name) => name.replace(/\.json$/i, ""));
}
