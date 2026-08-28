import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  resolveMapAutoAttack,
  resolveMapPlayProfile,
} from "./playProfile";
import type { EmberMap, EmberSpawnTable, EmberStage } from "./types";
import { ensureMapLayers } from "../tile/mapUtils";

const emberRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../content/ember",
);

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(path.join(emberRoot, rel), "utf8")) as T;
}

describe("fan_town explore content", () => {
  const map = ensureMapLayers(readJson<EmberMap>("maps/fan_town.json"));
  const stage = readJson<EmberStage>("stages/fan_town.json");
  const spawn = readJson<EmberSpawnTable>("spawns/fan_town.json");
  const packMeta = readJson<{ defaultStageId: string }>("pack.json");

  it("is an explore hub with a play stage", () => {
    expect(map.id).toBe("fan_town");
    expect(map.nameRu).toBe("Фэнтези-городок");
    expect(map.playProfile).toBe("explore");
    expect(resolveMapPlayProfile(map)).toBe("explore");
    expect(resolveMapAutoAttack(map)).toBe(false);
    expect(map.regions.find((r) => r.kind === "player_start")?.id).toBe("start");
    expect(stage.id).toBe("fan_town");
    expect(stage.mapId).toBe("fan_town");
    expect(stage.spawnTableId).toBe("fan_town");
    expect(stage.nameRu).toBe("Фэнтези-городок");
    expect(spawn.id).toBe("fan_town");
    expect(spawn.entries).toEqual([]);
    expect(packMeta.defaultStageId).toBe("hu_tao_p1");
  });

  it("keeps four interiors reachable from the hub and back", () => {
    const interiors = [
      "fan_town_inn",
      "fan_town_mage",
      "fan_town_smith",
      "fan_town_house",
    ] as const;
    for (const id of interiors) {
      const interior = ensureMapLayers(readJson<EmberMap>(`maps/${id}.json`));
      expect(interior.playProfile).toBe("explore");
      expect(interior.regions.find((r) => r.id === "start")?.kind).toBe(
        "player_start",
      );
      expect(interior.regions.find((r) => r.id === "exit")).toMatchObject({
        kind: "trigger",
        targetMapId: "fan_town",
      });
      const enter = map.regions.find((r) => r.targetMapId === id);
      expect(enter).toMatchObject({
        kind: "trigger",
        targetRegionId: "start",
      });
    }
  });
});
