import { describe, expect, it } from "vitest";
import type { EmberMap, EmberPack, EmberStage } from "./types";
import { removeMapFromPack } from "./loadPack";

function map(id: string): EmberMap {
  return {
    id,
    nameRu: id,
    tileSize: 16,
    width: 8,
    height: 8,
    tilesetId: "ts",
    layers: [],
    regions: [],
  };
}

function stage(id: string, mapId: string): EmberStage {
  return {
    id,
    nameRu: id,
    playerMistressId: "hu_tao",
    mapId,
    spawnTableId: "sp",
    weaponPoolId: "wp",
    chestPoolId: "ch",
    starterWeaponId: "w",
    durationSec: 60,
    bossAtSec: 50,
    playerHp: 100,
    moveSpeed: 100,
    cindersClear: 0,
    cindersFail: 0,
    xpGemValue: 1,
    baseXpToLevel: 10,
  };
}

describe("removeMapFromPack", () => {
  it("removes the map and stages that point at it", () => {
    const pack = {
      meta: { id: "p", version: 1, nameRu: "p", defaultStageId: "s1" },
      maps: { keep: map("keep"), gone: map("gone") },
      stages: {
        s1: stage("s1", "gone"),
        s2: stage("s2", "keep"),
      },
    } as unknown as EmberPack;

    const { pack: next, removedStageIds } = removeMapFromPack(pack, "gone");
    expect(next.maps.gone).toBeUndefined();
    expect(next.maps.keep).toBeDefined();
    expect(removedStageIds).toEqual(["s1"]);
    expect(next.stages.s1).toBeUndefined();
    expect(next.stages.s2).toBeDefined();
    expect(next.meta.defaultStageId).toBe("s2");
  });

  it("is a no-op for an unknown map", () => {
    const pack = {
      meta: { id: "p", version: 1, nameRu: "p", defaultStageId: "s2" },
      maps: { keep: map("keep") },
      stages: { s2: stage("s2", "keep") },
    } as unknown as EmberPack;
    const { pack: next, removedStageIds } = removeMapFromPack(pack, "missing");
    expect(next).toBe(pack);
    expect(removedStageIds).toEqual([]);
  });
});
