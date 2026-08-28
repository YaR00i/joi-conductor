import { listEmberDir, readEmberJson } from "./io";
import type {
  EmberArt,
  EmberEnemyDef,
  EmberEvent,
  EmberItemDef,
  EmberItemIcon,
  EmberShopDef,
  EmberLightPreset,
  EmberLightsFile,
  EmberLookPreset,
  EmberLooksFile,
  EmberUserCameraPreset,
  EmberCamerasFile,
  EmberMap,
  EmberPack,
  EmberPackMeta,
  EmberPixelSprite,
  EmberPool,
  EmberPortraitRegistry,
  EmberActionScript,
  EmberScene,
  EmberSpawnTable,
  EmberSpritesFile,
  EmberStage,
  EmberTileset,
  ValidationIssue,
  EmberVoxelsFile,
  EmberWeaponDef,
} from "./types";
import { ITEM_CATALOG_REL, parseItemsFile } from "./emberItem";
import { parseActionScript } from "./emberScript";
import { SHOP_CATALOG_REL, parseShopsFile } from "./emberShop";
import { normalizePixelSprite } from "./pixelSprite";
import { presetsFromLightsFile } from "./lightPresets";
import { presetsFromLooksFile } from "./lookPresets";
import { presetsFromCamerasFile } from "./cameraPresets";
import { validatePack } from "./validate";
import { ensureMapLayers } from "../tile/mapUtils";
import { normalizeMapPlayProfile } from "./playProfile";
import { cameraValidationMessage, normalizeMapCamera } from "./emberCamera";
import {
  normalizeVoxelModel,
  stampSolidBlock,
} from "../voxel/voxelModel";
import {
  ensureVoxelScenes,
  normalizeVoxelScene,
} from "../voxel/voxelScene";
import {
  defaultVoxelShardNames,
  parseVoxelLibraryDocument,
  voxelMeshFileFromRaw,
  VOXEL_LEGACY_SHARD_NAMES,
  VOXEL_MODELS_DIR,
  VOXEL_SCENES_DIR,
} from "../voxel/voxelLibrary";
import { hydrateVoxelPrefab } from "../voxel/voxelRegistry";
import { prunePaletteFavorites } from "./pixelSprite";

async function loadJson<T>(rel: string): Promise<T> {
  const res = await readEmberJson<T>(rel);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

async function loadJsonOptional<T>(rel: string, fallback: T): Promise<T> {
  const res = await readEmberJson<T>(rel);
  if (!res.ok) return fallback;
  return res.data;
}

async function loadJsonOptionalReported<T>(
  rel: string,
  fallback: T,
): Promise<{ data: T; issue?: ValidationIssue }> {
  const res = await readEmberJson<T>(rel);
  if (res.ok) {
    return res.source === "backup"
      ? {
          data: res.data,
          issue: {
            level: "warn",
            path: rel,
            message: "Основной JSON повреждён — загружена последняя корректная резервная копия",
          },
        }
      : { data: res.data };
  }
  // Empty optional catalogs (cameras/looks/…) must not block Start.
  if (isMissingOptionalCatalog(res.error)) {
    return { data: fallback };
  }
  return {
    data: fallback,
    issue: {
      level: "error",
      path: rel,
      message: `Ресурс не загружен: ${res.error}`,
    },
  };
}

function isMissingOptionalCatalog(error: string): boolean {
  return /:\s*404\b/.test(error) || /\bnot found\b/i.test(error);
}

async function loadJsonDir<T extends { id: string }>(
  dir: string,
): Promise<Record<string, T>> {
  const listed = await listEmberDir(dir);
  const names = listed.ok
    ? listed.data.filter((n) => n.endsWith(".json") && !n.endsWith(".bak.json"))
    : [];
  const out: Record<string, T> = {};
  await Promise.all(
    names.map(async (name) => {
      const res = await readEmberJson<T>(`${dir}/${name}`);
      if (!res.ok || !res.data?.id) return;
      out[res.data.id] = res.data;
    }),
  );
  return out;
}

async function loadJsonDirWithFallback<T extends { id: string }>(
  dir: string,
  fallbackRels: string[],
): Promise<Record<string, T>> {
  const listed = await loadJsonDir<T>(dir);
  if (Object.keys(listed).length > 0) return listed;
  const out: Record<string, T> = {};
  for (const rel of fallbackRels) {
    const item = await loadJsonOptional<T | null>(rel, null);
    if (item?.id) out[item.id] = item;
  }
  return out;
}

/** Merge extra voxel files without replacing ids already in the main registry. */
export function mergeVoxelFiles(
  base: EmberVoxelsFile,
  extra: EmberVoxelsFile,
): EmberVoxelsFile {
  const models = [...(base.models ?? [])];
  const seenModels = new Set(models.map((m) => m.id));
  for (const model of extra.models ?? []) {
    if (!model?.id || seenModels.has(model.id)) continue;
    models.push(model);
    seenModels.add(model.id);
  }
  const scenes = [...(base.scenes ?? [])];
  const seenScenes = new Set(scenes.map((s) => s.id));
  for (const scene of extra.scenes ?? []) {
    if (!scene?.id || seenScenes.has(scene.id)) continue;
    scenes.push(scene);
    seenScenes.add(scene.id);
  }
  return { models, scenes };
}

async function loadVoxelLibraries(): Promise<{
  file: EmberVoxelsFile;
  issues: ValidationIssue[];
  sources: Record<string, string>;
}> {
  const [modelList, sceneList, rootList] = await Promise.all([
    listEmberDir(VOXEL_MODELS_DIR),
    listEmberDir(VOXEL_SCENES_DIR),
    listEmberDir("voxels"),
  ]);
  let merged: EmberVoxelsFile = { models: [], scenes: [] };
  const sources: Record<string, string> = {};
  const issues: ValidationIssue[] = [];

  const ingest = async (
    rel: string,
    data: unknown,
    issue?: ValidationIssue,
  ) => {
    if (issue) issues.push(issue);
    const parsed = parseVoxelLibraryDocument(data);
    const models = [];
    for (const model of parsed.models ?? []) {
      if (!model?.id) continue;
      if (!sources[model.id]) sources[model.id] = rel;
      let next = await hydrateVoxelPrefab(model, data);
      next = normalizeVoxelModel(next);
      const meshFile = voxelMeshFileFromRaw(data);
      if (!next.voxels.some((value) => value > 0)) {
        if (meshFile) {
          issues.push({
            level: "warn",
            path: meshFile,
            message: `Не загружена сетка MagicaVoxel для ${model.id}`,
          });
        } else {
          next = stampSolidBlock(next, 1);
        }
      }
      models.push(next);
    }
    merged = mergeVoxelFiles(merged, {
      models,
      scenes: parsed.scenes,
    });
  };

  const modelNames = (modelList.ok ? modelList.data : []).filter((name) =>
    name.endsWith(".json"),
  );
  for (const name of modelNames) {
    const rel = `${VOXEL_MODELS_DIR}/${name}`;
    const loaded = await loadJsonOptionalReported<unknown>(rel, {});
    await ingest(rel, loaded.data, loaded.issue);
  }

  const sceneNames = (sceneList.ok ? sceneList.data : []).filter((name) =>
    name.endsWith(".json"),
  );
  for (const name of sceneNames) {
    const rel = `${VOXEL_SCENES_DIR}/${name}`;
    const data = await loadJsonOptional<unknown>(rel, {});
    await ingest(rel, data);
  }

  const leftover = defaultVoxelShardNames(rootList.ok ? rootList.data : []).filter(
    (name) =>
      (VOXEL_LEGACY_SHARD_NAMES as readonly string[]).includes(name),
  );
  for (const name of leftover) {
    const rel = `voxels/${name}`;
    const data = await loadJsonOptional<EmberVoxelsFile>(rel, { models: [] });
    await ingest(rel, data);
  }

  return { file: merged, issues, sources };
}

export async function loadEmberPack(): Promise<{
  pack: EmberPack;
  issues: ReturnType<typeof validatePack>;
}> {
  const meta = await loadJson<EmberPackMeta>("pack.json");

  const [
    mapsRaw,
    tilesetsRaw,
    stagesRaw,
    spawnsRaw,
    poolW,
    poolC,
    weaponsFile,
    enemiesFile,
    scenes,
    scriptsRaw,
    events,
    artsFile,
    portraits,
    spritesLoad,
    voxelLibs,
    lightsLoad,
    looksLoad,
    camerasLoad,
    itemsLoad,
    shopsLoad,
  ] = await Promise.all([
    loadJsonDirWithFallback<EmberMap>("maps", ["maps/hu_tao_yard.json"]),
    loadJsonDirWithFallback<EmberTileset>("tilesets", [
      "tilesets/graveyard_16.json",
    ]),
    loadJsonDirWithFallback<EmberStage>("stages", ["stages/hu_tao_p1.json"]),
    loadJsonDirWithFallback<EmberSpawnTable>("spawns", ["spawns/hu_tao_p1.json"]),
    loadJson<EmberPool>("pools/p1_weapons.json"),
    loadJson<EmberPool>("pools/p1_chests.json"),
    loadJson<{ weapons: EmberWeaponDef[] }>("weapons.json"),
    loadJson<{ enemies: EmberEnemyDef[] }>("enemies.json"),
    loadJsonDir<EmberScene>("scenes"),
    loadJsonDir<EmberActionScript>("scripts"),
    loadJsonDir<EmberEvent>("events"),
    loadJson<{ arts: EmberArt[] }>("arts/registry.json"),
    loadJson<EmberPortraitRegistry>("portraits/hu_tao/registry.json"),
    loadJsonOptionalReported<EmberSpritesFile>("sprites/registry.json", {
      paletteFavorites: [],
      sprites: [],
    }),
    loadVoxelLibraries(),
    loadJsonOptionalReported<EmberLightsFile>("lights/registry.json", {
      presets: [],
    }),
    loadJsonOptionalReported<EmberLooksFile>("looks/registry.json", {
      presets: [],
    }),
    loadJsonOptionalReported<EmberCamerasFile>("cameras/registry.json", {
      presets: [],
    }),
    loadJsonOptionalReported<unknown>(ITEM_CATALOG_REL, {
      icons: [],
      items: [],
    }),
    loadJsonOptionalReported<unknown>(SHOP_CATALOG_REL, {
      shops: [],
    }),
  ]);

  const spritesFile = spritesLoad.data;
  const voxelsFile = voxelLibs.file;
  const lightsFile = lightsLoad.data;
  const looksFile = looksLoad.data;
  const camerasFile = camerasLoad.data;

  const maps: Record<string, EmberMap> = {};
  for (const map of Object.values(mapsRaw)) {
    maps[map.id] = normalizeLoadedMap(map);
  }
  const tilesets = tilesetsRaw;
  const stages = stagesRaw;
  const spawns = spawnsRaw;

  // Fallback if directory listing failed on older hosts
  if (Object.keys(scenes).length === 0) {
    const scene = await loadJsonOptional<EmberScene | null>(
      "scenes/hu_tao_clear_demo.json",
      null,
    );
    if (scene) scenes[scene.id] = scene;
  }
  if (Object.keys(events).length === 0) {
    const event = await loadJsonOptional<EmberEvent | null>(
      "events/hu_tao_clear_demo.json",
      null,
    );
    if (event) events[event.id] = event;
  }

  const weapons: Record<string, EmberWeaponDef> = {};
  for (const w of weaponsFile.weapons) weapons[w.id] = w;

  const enemies: Record<string, EmberEnemyDef> = {};
  for (const e of enemiesFile.enemies) enemies[e.id] = e;

  const arts: Record<string, EmberArt> = {};
  for (const a of artsFile.arts) arts[a.id] = a;

  const sprites: Record<string, EmberPixelSprite> = {};
  for (const s of spritesFile.sprites ?? []) {
    const n = normalizePixelSprite(s);
    sprites[n.id] = n;
  }

  const voxelModels: EmberPack["voxelModels"] = {};
  for (const raw of voxelsFile.models ?? []) {
    voxelModels[raw.id] = normalizeVoxelModel(raw);
  }

  const voxelScenesRaw: EmberPack["voxelScenes"] = {};
  for (const raw of voxelsFile.scenes ?? []) {
    if (!raw?.id) continue;
    voxelScenesRaw[raw.id] = normalizeVoxelScene(raw);
  }
  const voxelScenes = ensureVoxelScenes(voxelModels, voxelScenesRaw);

  const lightPresets = presetsFromLightsFile(lightsFile);
  const lookPresets = presetsFromLooksFile(looksFile);
  const cameraPresets = presetsFromCamerasFile(camerasFile);
  const { items, itemIcons } = parseItemsFile(itemsLoad.data);
  const shops = parseShopsFile(shopsLoad.data);
  const scripts: Record<string, EmberActionScript> = {};
  for (const raw of Object.values(scriptsRaw)) {
    const parsed = parseActionScript(raw);
    if (parsed) scripts[parsed.id] = parsed;
  }

  const pack: EmberPack = {
    meta,
    maps,
    tilesets,
    stages,
    spawns,
    pools: { [poolW.id]: poolW, [poolC.id]: poolC },
    weapons,
    items,
    itemIcons,
    shops,
    enemies,
    scenes,
    scripts,
    events,
    arts,
    portraits: { [portraits.mistressId]: portraits },
    sprites,
    voxelModels,
    voxelScenes,
    voxelLibraryFiles: voxelLibs.sources,
    lightPresets,
    lookPresets,
    cameraPresets,
    paletteFavorites: prunePaletteFavorites(
      spritesFile.paletteFavorites ?? [],
    ),
  };

  const loadIssues = [
    spritesLoad.issue,
    ...voxelLibs.issues,
    lightsLoad.issue,
    looksLoad.issue,
    camerasLoad.issue,
    itemsLoad.issue,
    shopsLoad.issue,
  ].filter((issue): issue is ValidationIssue => Boolean(issue));
  return { pack, issues: [...loadIssues, ...validatePack(pack)] };
}

function normalizeLoadedMap(map: EmberMap): EmberMap {
  const next = ensureMapLayers(map);
  const raw = (map as { playProfile?: unknown }).playProfile;
  if (raw == null || raw === "") {
    delete next.playProfile;
  } else {
    const playProfile = normalizeMapPlayProfile(raw);
    if (playProfile) next.playProfile = playProfile;
    else (next as { playProfile?: unknown }).playProfile = raw;
  }
  const rawCam = (map as { camera?: unknown }).camera;
  if (rawCam == null || rawCam === "") {
    delete next.camera;
  } else if (cameraValidationMessage(rawCam)) {
    (next as { camera?: unknown }).camera = rawCam;
  } else {
    const camera = normalizeMapCamera(rawCam, next.tileSize);
    if (camera) next.camera = camera;
    else delete next.camera;
  }
  return next;
}

/** Merge a single updated document back into an existing pack (editor). */
export function upsertMap(pack: EmberPack, map: EmberMap): EmberPack {
  return { ...pack, maps: { ...pack.maps, [map.id]: normalizeLoadedMap(map) } };
}

/** Drop a map and stages that only point at it. Does not write files. */
export function removeMapFromPack(
  pack: EmberPack,
  mapId: string,
): { pack: EmberPack; removedStageIds: string[] } {
  if (!pack.maps[mapId]) return { pack, removedStageIds: [] };
  const maps = { ...pack.maps };
  delete maps[mapId];
  const stages = { ...pack.stages };
  const removedStageIds: string[] = [];
  for (const [id, stage] of Object.entries(stages)) {
    if (stage.mapId === mapId) {
      delete stages[id];
      removedStageIds.push(id);
    }
  }
  let meta = pack.meta;
  if (removedStageIds.includes(pack.meta.defaultStageId)) {
    const fallback = Object.keys(stages)[0];
    if (fallback) meta = { ...meta, defaultStageId: fallback };
  }
  return { pack: { ...pack, maps, stages, meta }, removedStageIds };
}

export function upsertStage(pack: EmberPack, stage: EmberStage): EmberPack {
  return { ...pack, stages: { ...pack.stages, [stage.id]: stage } };
}

export function upsertScene(pack: EmberPack, scene: EmberScene): EmberPack {
  return { ...pack, scenes: { ...pack.scenes, [scene.id]: scene } };
}

export function upsertEvent(pack: EmberPack, event: EmberEvent): EmberPack {
  return { ...pack, events: { ...pack.events, [event.id]: event } };
}

export function upsertScript(
  pack: EmberPack,
  script: EmberActionScript,
): EmberPack {
  return { ...pack, scripts: { ...pack.scripts, [script.id]: script } };
}

export function upsertArts(pack: EmberPack, arts: EmberArt[]): EmberPack {
  const next: Record<string, EmberArt> = {};
  for (const a of arts) next[a.id] = a;
  return { ...pack, arts: next };
}

export function upsertLightPresets(
  pack: EmberPack,
  lightPresets: Record<string, EmberLightPreset>,
): EmberPack {
  return { ...pack, lightPresets: { ...lightPresets } };
}

export function upsertLookPresets(
  pack: EmberPack,
  lookPresets: Record<string, EmberLookPreset>,
): EmberPack {
  return { ...pack, lookPresets: { ...lookPresets } };
}

export function upsertCameraPresets(
  pack: EmberPack,
  cameraPresets: Record<string, EmberUserCameraPreset>,
): EmberPack {
  return { ...pack, cameraPresets: { ...cameraPresets } };
}

export function upsertItems(
  pack: EmberPack,
  items: Record<string, EmberItemDef>,
  itemIcons?: Record<string, EmberItemIcon>,
): EmberPack {
  return {
    ...pack,
    items: { ...items },
    itemIcons: itemIcons ? { ...itemIcons } : pack.itemIcons,
  };
}

export function upsertShops(
  pack: EmberPack,
  shops: Record<string, EmberShopDef>,
): EmberPack {
  return { ...pack, shops: { ...shops } };
}
