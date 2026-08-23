import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mergeVoxelFiles } from "./loadPack";
import { parseVoxelLibraryDocument } from "../voxel/voxelLibrary";
import {
  resolveMapAutoAttack,
  resolveMapPlayProfile,
} from "./playProfile";
import type {
  EmberMap,
  EmberPack,
  EmberPixelSprite,
  EmberScene,
  EmberSpawnTable,
  EmberStage,
  EmberTileset,
  EmberVoxelsFile,
  EmberWeaponDef,
} from "./types";
import { parseShopsFile } from "./emberShop";
import { validatePack } from "./validate";
import {
  canStandAtElev,
  ensureMapLayers,
  elevTileIdAt,
} from "../tile/mapUtils";
import { normalizeVoxelModel } from "../voxel/voxelModel";
import { normalizePixelSprite } from "./pixelSprite";

const emberRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../content/ember",
);

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(path.join(emberRoot, rel), "utf8")) as T;
}

describe("hu_tao_village explore content", () => {
  const map = ensureMapLayers(readJson<EmberMap>("maps/hu_tao_village.json"));
  const tileset = readJson<EmberTileset>("tilesets/village_16.json");
  const voxels = (() => {
    const dir = path.join(emberRoot, "voxels", "models");
    try {
      const names = readdirSync(dir).filter((name) => name.endsWith(".json"));
      const models = names.flatMap((name) => {
        const raw = JSON.parse(readFileSync(path.join(dir, name), "utf8"));
        return parseVoxelLibraryDocument(raw).models;
      });
      if (models.length > 0) return { models };
    } catch {
      // fall through to leftover shard
    }
    return readJson<EmberVoxelsFile>("voxels/village.json");
  })();
  const stage = readJson<EmberStage>("stages/village_stroll.json");
  const spawn = readJson<EmberSpawnTable>("spawns/village_stroll.json");
  const interior = ensureMapLayers(
    readJson<EmberMap>("maps/hu_tao_house_interior.json"),
  );

  it("is an explore hub with a south-gate start", () => {
    expect(map.id).toBe("hu_tao_village");
    expect(map.playProfile).toBe("explore");
    expect(resolveMapPlayProfile(map)).toBe("explore");
    expect(resolveMapAutoAttack(map)).toBe(false);
    expect(map.tilesetId).toBe("village_16");
    const start = map.regions.find((r) => r.kind === "player_start");
    expect(start).toMatchObject({ id: "start", x: 16, y: 29, w: 3, h: 2 });
    expect(map.regions.some((r) => r.kind === "npc_idle")).toBe(true);
    expect(map.regions.some((r) => r.kind === "npc_wander")).toBe(true);
    expect(map.sprites?.some((s) => s.role === "npc")).toBe(true);
    expect(
      (map.voxelProps ?? []).some((p) => p.modelId.startsWith("vox_chr_")),
    ).toBe(false);
  });

  it("places shop, door+interior, chest, and talk NPCs", () => {
    expect(map.voxelProps?.find((p) => p.id === "vil_shop_kiosk")).toMatchObject({
      modelId: "vox_vil_counter",
      x: 13,
      y: 19,
      interactivity: {
        kind: "shop",
        shopId: "wangsheng_kiosk",
        scriptId: "village_shop_intro",
      },
    });
    expect(map.voxelProps?.find((p) => p.id === "vil_house_door")).toMatchObject({
      modelId: "vox_vil_door",
      x: 12,
      y: 9,
      interactivity: { kind: "door", triggerId: "house_enter" },
    });
    expect(map.regions.find((r) => r.id === "house_enter")).toMatchObject({
      kind: "trigger",
      targetMapId: "hu_tao_house_interior",
      targetRegionId: "start",
      boundObjectId: "vil_house_door",
    });
    expect(interior.id).toBe("hu_tao_house_interior");
    expect(interior.regions.find((r) => r.id === "exit")).toMatchObject({
      kind: "trigger",
      targetMapId: "hu_tao_village",
      targetRegionId: "house_enter",
    });
    expect(map.regions.find((r) => r.id === "side_chest")).toMatchObject({
      kind: "chest",
      x: 1,
      y: 13,
      lootIds: ["coin", "herb"],
      closedModelId: "vox_ms8vsb53",
    });
    expect(map.sprites?.find((s) => s.id === "vil_talk_porter")).toMatchObject({
      spriteId: "spr_vil_porter",
      x: 17,
      y: 28,
      interactivity: { kind: "talk", scriptId: "village_porter_talk" },
    });
    expect(map.sprites?.find((s) => s.id === "vil_talk_auntie")).toMatchObject({
      spriteId: "spr_vil_auntie",
      interactivity: { kind: "talk", scriptId: "village_auntie_talk" },
    });
    expect(map.voxelProps?.find((p) => p.id === "vil_quest_sign")).toMatchObject({
      interactivity: {
        kind: "quest_marker",
        questStatus: "available",
        triggerId: "vil_notice",
      },
    });
    expect(map.regions.find((r) => r.id === "vil_npc_keeper")).toMatchObject({
      kind: "npc_idle",
      spriteId: "spr_vil_keeper",
    });
    expect(map.regions.find((r) => r.id === "vil_npc_plaza")).toMatchObject({
      kind: "npc_wander",
      spriteId: "spr_vil_child",
    });
  });

  it("keeps layer sizes in sync and references village voxels", () => {
    const expected = map.width * map.height;
    for (const layer of map.layers) {
      expect(layer.data.length).toBe(expected);
    }
    const modelIds = new Set((voxels.models ?? []).map((m) => m.id));
    for (const prop of map.voxelProps ?? []) {
      expect(modelIds.has(prop.modelId)).toBe(true);
    }
    const windowProp = (map.voxelProps ?? []).find(
      (p) => p.modelId === "vox_vil_window",
    );
    expect(windowProp).toBeTruthy();
    expect(windowProp?.emissiveLightShadows).toBe(true);
    const windowModel = voxels.models.find((m) => m.id === "vox_vil_window");
    expect(windowModel?.emissiveCastsLight).toBe(true);
  });

  it("has shadow-casting emissive street lights and an empty spawn table", () => {
    const voxelModelsById = new Map(
      voxels.models.map((model) => [model.id, model]),
    );
    expect(
      (map.voxelProps ?? []).filter((prop) => {
        const model = voxelModelsById.get(prop.modelId);
        const castsLight =
          prop.emissiveCastsLight ?? model?.emissiveCastsLight ?? false;
        const castsShadows =
          prop.emissiveLightShadows ?? model?.emissiveLightShadows ?? false;
        return castsLight && castsShadows;
      }).length,
    ).toBeGreaterThan(
      3,
    );
    expect(spawn.entries).toEqual([]);
    expect(stage.mapId).toBe("hu_tao_village");
    expect(stage.spawnTableId).toBe("village_stroll");
  });

  it("passes validatePack with village assets", () => {
    const voxelModels: EmberPack["voxelModels"] = {};
    for (const raw of voxels.models ?? []) {
      const model = normalizeVoxelModel(raw);
      voxelModels[model.id] = model;
    }
    const weapon: EmberWeaponDef = {
      id: "butterfly_fan",
      nameRu: "stub",
      rarity: "common",
      kind: "orbit",
      damage: 1,
      cooldownMs: 1000,
      count: 1,
      speed: 1,
      range: 1,
    };
    const spriteIds = [
      "spr_vil_porter",
      "spr_vil_auntie",
      "spr_vil_child",
      "spr_vil_keeper",
    ] as const;
    const sprites: Record<string, EmberPixelSprite> = {};
    for (const id of spriteIds) {
      sprites[id] = normalizePixelSprite({
        id,
        color: "#c8a878",
        width: 16,
        topHeight: 4,
        wallHeights: [16],
        pixels: [],
        roles: ["npc"],
      });
    }
    const shops = parseShopsFile(
      readJson("shops/catalog.json"),
    );
    const scenes: Record<string, EmberScene> = {
      village_notice_talk: readJson("scenes/village_notice_talk.json"),
      village_porter_talk: readJson("scenes/village_porter_talk.json"),
      village_auntie_talk: readJson("scenes/village_auntie_talk.json"),
      village_shop_intro: readJson("scenes/village_shop_intro.json"),
    };
    const pack: EmberPack = {
      meta: {
        id: "test",
        version: 1,
        nameRu: "test",
        defaultStageId: "village_stroll",
      },
      maps: { [map.id]: map, [interior.id]: interior },
      tilesets: { [tileset.id]: tileset },
      stages: { [stage.id]: stage },
      spawns: { [spawn.id]: spawn },
      pools: {
        p1_weapons: { id: "p1_weapons", entries: [] },
        p1_chests: { id: "p1_chests", entries: [] },
      },
      weapons: { [weapon.id]: weapon },
      enemies: {},
      scenes,
      scripts: {},
      events: {},
      arts: {},
      portraits: {},
      sprites,
      voxelModels,
      voxelScenes: {},
      lightPresets: {},
      lookPresets: {},
      items: {},
      itemIcons: {},
      shops,
      paletteFavorites: [],
    };
    const issues = validatePack(pack).filter((i) => i.level === "error");
    expect(issues).toEqual([]);
  });

  it("drops suburban street furniture and restyles off asphalt language", () => {
    const banned = new Set([
      "vox_vil_fence",
      "vox_vil_mailbox",
      "vox_vil_hydrant",
    ]);
    expect(
      (map.voxelProps ?? []).some((prop) => banned.has(prop.modelId)),
    ).toBe(false);
    const ground =
      map.layers.find((layer) => layer.name === "ground")?.data ?? [];
    expect(ground.some((id) => id === 3 || id === 5)).toBe(false);
    const start = map.regions.find((region) => region.kind === "player_start");
    expect(start).toBeTruthy();
    expect((start?.y ?? 0) + (start?.h ?? 0)).toBeGreaterThan(map.height * 0.7);
  });

  it("adds plum trees, grass tufts, and interior roof volumes", () => {
    const props = map.voxelProps ?? [];
    expect(props.some((prop) => prop.modelId === "vox_vil_tree")).toBe(true);
    expect(props.some((prop) => prop.modelId === "vox_vil_grass_tuft")).toBe(
      true,
    );
    expect(
      props.filter((prop) => prop.modelId === "vox_vil_bush").length,
    ).toBeGreaterThan(8);
    expect(voxels.models.some((model) => model.id === "vox_vil_tree")).toBe(
      true,
    );
    expect(
      voxels.models.some((model) => model.id === "vox_vil_grass_tuft"),
    ).toBe(true);
    const grass = voxels.models.find((model) => model.id === "vox_vil_grass_tuft");
    expect(grass?.physical).toBe(false);
    expect((map.interiorVolumes?.length ?? 0)).toBeGreaterThan(0);
    const z2 =
      map.layers.find((layer) => layer.name === "ground_z2")?.data ?? [];
    expect(z2.some((id) => id === 14)).toBe(true);
    const cobbleBand =
      map.layers.find((layer) => layer.name === "ground_z0")?.data ?? [];
    for (let y = 16; y <= 22; y++) {
      let cobble = 0;
      for (let x = 0; x < map.width; x++) {
        if (cobbleBand[y * map.width + x] === 4) cobble += 1;
      }
      expect(cobble).toBeLessThan(8);
    }
  });

  it("keeps shop approach and interior doors walkable on z0", () => {
    const shop = map.voxelProps?.find((p) => p.id === "vil_shop_kiosk");
    expect(shop).toMatchObject({ x: 13, y: 19, elev: 0 });
    expect(canStandAtElev(map, tileset, 13, 20, 0)).toBe(true);
    expect(elevTileIdAt(map, 13, 20, 0)).toBeGreaterThan(0);
    expect(elevTileIdAt(map, 13, 20, 1)).toBe(0);

    expect(map.voxelProps?.find((p) => p.id === "vil_house_door")).toMatchObject({
      x: 12,
      y: 9,
      elev: 0,
    });
    expect(canStandAtElev(map, tileset, 12, 9, 0)).toBe(true);
    expect(elevTileIdAt(map, 12, 9, 1)).toBe(0);
    expect(canStandAtElev(map, tileset, 12, 7, 0)).toBe(true);
    expect(elevTileIdAt(map, 12, 7, 0)).toBeGreaterThan(0);
    expect(elevTileIdAt(map, 12, 7, 1)).toBe(0);
    expect(elevTileIdAt(map, 12, 7, 2)).toBe(14);

    expect(canStandAtElev(map, tileset, 7, 30, 0)).toBe(true);
    expect(elevTileIdAt(map, 7, 30, 1)).toBe(0);

    const interiorStart = interior.regions.find((r) => r.id === "start");
    expect(interiorStart).toBeTruthy();
    const ix = interiorStart?.x ?? 0;
    const iy = interiorStart?.y ?? 0;
    expect(canStandAtElev(interior, tileset, ix, iy, 0)).toBe(true);
    expect(elevTileIdAt(interior, ix, iy, 0)).toBeGreaterThan(0);
    expect(elevTileIdAt(interior, ix, iy, 1)).toBe(0);
  });
});

describe("mergeVoxelFiles", () => {
  it("appends new models and keeps existing ids", () => {
    const merged = mergeVoxelFiles(
      {
        models: [
          {
            id: "vox_crate_1",
            sizeBlocks: { x: 1, y: 1, z: 1 },
            palette: ["", "#fff"],
            voxels: [1],
          },
        ],
      },
      {
        models: [
          {
            id: "vox_crate_1",
            sizeBlocks: { x: 1, y: 1, z: 1 },
            palette: ["", "#000"],
            voxels: [2],
          },
          {
            id: "vox_vil_lamp",
            sizeBlocks: { x: 1, y: 2, z: 1 },
            palette: ["", "#aaa"],
            voxels: [1],
          },
        ],
      },
    );
    expect(merged.models.map((m) => m.id)).toEqual([
      "vox_crate_1",
      "vox_vil_lamp",
    ]);
    expect(merged.models[0]?.voxels[0]).toBe(1);
  });
});
