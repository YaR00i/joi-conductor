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
  EmberSpawnTable,
  EmberStage,
  EmberTileset,
  EmberVoxelsFile,
  EmberWeaponDef,
} from "./types";
import { validatePack } from "./validate";
import { ensureMapLayers } from "../tile/mapUtils";
import { normalizeVoxelModel } from "../voxel/voxelModel";

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

  it("is an explore map with a player start and no NPCs", () => {
    expect(map.id).toBe("hu_tao_village");
    expect(map.playProfile).toBe("explore");
    expect(resolveMapPlayProfile(map)).toBe("explore");
    expect(resolveMapAutoAttack(map)).toBe(false);
    expect(map.tilesetId).toBe("village_16");
    expect(map.regions.some((r) => r.kind === "player_start")).toBe(true);
    expect(
      map.regions.some((r) => r.kind === "npc_idle" || r.kind === "npc_wander"),
    ).toBe(false);
    expect(map.sprites?.some((s) => s.role === "npc")).toBeFalsy();
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
    expect(windowModel?.emissiveLightShadows).toBe(false);
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
    const pack: EmberPack = {
      meta: {
        id: "test",
        version: 1,
        nameRu: "test",
        defaultStageId: "village_stroll",
      },
      maps: { [map.id]: map },
      tilesets: { [tileset.id]: tileset },
      stages: { [stage.id]: stage },
      spawns: { [spawn.id]: spawn },
      pools: {
        p1_weapons: { id: "p1_weapons", entries: [] },
        p1_chests: { id: "p1_chests", entries: [] },
      },
      weapons: { [weapon.id]: weapon },
      enemies: {},
      scenes: {},
      events: {},
      arts: {},
      portraits: {},
      sprites: {},
      voxelModels,
      voxelScenes: {},
      lightPresets: {},
      lookPresets: {},
      paletteFavorites: [],
    };
    const issues = validatePack(pack).filter((i) => i.level === "error");
    expect(issues).toEqual([]);
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
