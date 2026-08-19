import { listEmberDir, readEmberJson } from "./io";
import type {
  EmberArt,
  EmberEnemyDef,
  EmberEvent,
  EmberLightPreset,
  EmberLightsFile,
  EmberLookPreset,
  EmberLooksFile,
  EmberMap,
  EmberPack,
  EmberPackMeta,
  EmberPixelSprite,
  EmberPool,
  EmberPortraitRegistry,
  EmberScene,
  EmberSpawnTable,
  EmberSpritesFile,
  EmberStage,
  EmberTileset,
  ValidationIssue,
  EmberVoxelsFile,
  EmberWeaponDef,
} from "./types";
import { normalizePixelSprite } from "./pixelSprite";
import { presetsFromLightsFile } from "./lightPresets";
import { presetsFromLooksFile } from "./lookPresets";
import { validatePack } from "./validate";
import { ensureMapLayers } from "../tile/mapUtils";
import {
  normalizeVoxelModel,
  stampSolidBlock,
} from "../voxel/voxelModel";
import {
  ensureVoxelScenes,
  normalizeVoxelScene,
} from "../voxel/voxelScene";

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
  return {
    data: fallback,
    issue: {
      level: "error",
      path: rel,
      message: `Ресурс не загружен: ${res.error}`,
    },
  };
}

async function loadJsonDir<T extends { id: string }>(
  dir: string,
): Promise<Record<string, T>> {
  const listed = await listEmberDir(dir);
  const names = listed.ok
    ? listed.data.filter((n) => n.endsWith(".json"))
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

export async function loadEmberPack(): Promise<{
  pack: EmberPack;
  issues: ReturnType<typeof validatePack>;
}> {
  const meta = await loadJson<EmberPackMeta>("pack.json");

  const [
    mapYard,
    tileset,
    stage,
    spawn,
    poolW,
    poolC,
    weaponsFile,
    enemiesFile,
    scenes,
    events,
    artsFile,
    portraits,
    spritesLoad,
    voxelsLoad,
    lightsLoad,
    looksLoad,
  ] = await Promise.all([
    loadJson<EmberMap>("maps/hu_tao_yard.json"),
    loadJson<EmberTileset>("tilesets/graveyard_16.json"),
    loadJson<EmberStage>("stages/hu_tao_p1.json"),
    loadJson<EmberSpawnTable>("spawns/hu_tao_p1.json"),
    loadJson<EmberPool>("pools/p1_weapons.json"),
    loadJson<EmberPool>("pools/p1_chests.json"),
    loadJson<{ weapons: EmberWeaponDef[] }>("weapons.json"),
    loadJson<{ enemies: EmberEnemyDef[] }>("enemies.json"),
    loadJsonDir<EmberScene>("scenes"),
    loadJsonDir<EmberEvent>("events"),
    loadJson<{ arts: EmberArt[] }>("arts/registry.json"),
    loadJson<EmberPortraitRegistry>("portraits/hu_tao/registry.json"),
    loadJsonOptionalReported<EmberSpritesFile>("sprites/registry.json", {
      paletteFavorites: [],
      sprites: [],
    }),
    loadJsonOptionalReported<EmberVoxelsFile>("voxels/registry.json", {
      models: [],
    }),
    loadJsonOptionalReported<EmberLightsFile>("lights/registry.json", {
      presets: [],
    }),
    loadJsonOptionalReported<EmberLooksFile>("looks/registry.json", {
      presets: [],
    }),
  ]);

  const spritesFile = spritesLoad.data;
  const voxelsFile = voxelsLoad.data;
  const lightsFile = lightsLoad.data;
  const looksFile = looksLoad.data;

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
    let m = normalizeVoxelModel(raw);
    if (!m.voxels.some((v) => v > 0)) {
      m = stampSolidBlock(m, 1);
    }
    voxelModels[m.id] = m;
  }

  const voxelScenesRaw: EmberPack["voxelScenes"] = {};
  for (const raw of voxelsFile.scenes ?? []) {
    if (!raw?.id) continue;
    voxelScenesRaw[raw.id] = normalizeVoxelScene(raw);
  }
  const voxelScenes = ensureVoxelScenes(voxelModels, voxelScenesRaw);

  const lightPresets = presetsFromLightsFile(lightsFile);
  const lookPresets = presetsFromLooksFile(looksFile);

  const pack: EmberPack = {
    meta,
    maps: { [mapYard.id]: ensureMapLayers(mapYard) },
    tilesets: { [tileset.id]: tileset },
    stages: { [stage.id]: stage },
    spawns: { [spawn.id]: spawn },
    pools: { [poolW.id]: poolW, [poolC.id]: poolC },
    weapons,
    enemies,
    scenes,
    events,
    arts,
    portraits: { [portraits.mistressId]: portraits },
    sprites,
    voxelModels,
    voxelScenes,
    lightPresets,
    lookPresets,
    paletteFavorites: spritesFile.paletteFavorites ?? [],
  };

  const loadIssues = [
    spritesLoad.issue,
    voxelsLoad.issue,
    lightsLoad.issue,
    looksLoad.issue,
  ].filter((issue): issue is ValidationIssue => Boolean(issue));
  return { pack, issues: [...loadIssues, ...validatePack(pack)] };
}

/** Merge a single updated document back into an existing pack (editor). */
export function upsertMap(pack: EmberPack, map: EmberMap): EmberPack {
  return { ...pack, maps: { ...pack.maps, [map.id]: map } };
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
