import { describe, expect, it } from "vitest";
import {
  clampMapSize,
  createBlankEmberMap,
  createStageForMap,
} from "./mapFactory";
import type { EmberMap, EmberPack, EmberStage } from "./types";

describe("createBlankEmberMap", () => {
  it("clamps size and stamps play profile", () => {
    expect(clampMapSize(3)).toBe(8);
    expect(clampMapSize(200)).toBe(96);
    const map = createBlankEmberMap({
      nameRu: "Лес",
      width: 20,
      height: 18,
      tilesetId: "village_16",
      playProfile: "explore",
      usedMapIds: { map_x: {} },
    });
    expect(map.nameRu).toBe("Лес");
    expect(map.width).toBe(20);
    expect(map.height).toBe(18);
    expect(map.tilesetId).toBe("village_16");
    expect(map.playProfile).toBe("explore");
    expect(map.regions?.some((r) => r.kind === "player_start")).toBe(true);
    expect(map.id.startsWith("map_")).toBe(true);
  });

  it("copies light from a template", () => {
    const map = createBlankEmberMap({
      nameRu: "Ночь",
      width: 12,
      height: 12,
      tilesetId: "village_16",
      lightTemplate: {
        id: "src",
        width: 8,
        height: 8,
        tileSize: 16,
        tilesetId: "village_16",
        layers: [],
        regions: [],
        light: { ambientAlpha: 0.4, bloomStrength: 0.8 },
      } as EmberMap,
    });
    expect(map.light?.ambientAlpha).toBe(0.4);
    expect(map.light?.bloomStrength).toBe(0.8);
  });
});

describe("createStageForMap", () => {
  it("retargets a template stage onto the new map", () => {
    const template: EmberStage = {
      id: "village_stroll",
      nameRu: "Вечерняя деревня",
      playerMistressId: "hu_tao",
      mapId: "hu_tao_village",
      spawnTableId: "village_stroll",
      weaponPoolId: "p1_weapons",
      chestPoolId: "p1_chests",
      starterWeaponId: "butterfly_fan",
      durationSec: 600,
      bossAtSec: 9999,
      playerHp: 100,
      moveSpeed: 110,
      cindersClear: 0,
      cindersFail: 0,
      xpGemValue: 1,
      baseXpToLevel: 12,
    };
    const pack = {
      meta: { defaultStageId: "village_stroll" },
      maps: {
        hu_tao_village: { playProfile: "explore" },
      },
      stages: { village_stroll: template },
    } as unknown as EmberPack;
    const map = createBlankEmberMap({
      nameRu: "Поляна",
      width: 16,
      height: 16,
      tilesetId: "village_16",
      playProfile: "explore",
    });
    const stage = createStageForMap(pack, map);
    expect(stage.mapId).toBe(map.id);
    expect(stage.id).not.toBe(template.id);
    expect(stage.spawnTableId).toBe(template.spawnTableId);
    expect(stage.nameRu).toBe("Поляна");
  });
});
