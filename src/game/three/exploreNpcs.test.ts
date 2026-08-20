import { describe, expect, it } from "vitest";
import type { EmberPixelSprite } from "../content/types";
import { createEmptyMap } from "../tile/mapUtils";
import {
  collectExploreNpcSpawns,
  spritePlacementIsNpc,
  stepExploreNpcWander,
} from "./exploreNpcs";
import { EXPLORE_NPC_CAP } from "./renderBudget";

function stubSprite(id: string, npc = false): EmberPixelSprite {
  return {
    id,
    color: "#c8a878",
    width: 16,
    topHeight: 16,
    wallHeights: [8, 8, 8, 8],
    pixels: [],
    roles: npc ? ["npc"] : ["decor"],
  };
}

describe("explore NPCs", () => {
  it("caps authored NPCs and skips combat roles", () => {
    const map = createEmptyMap("village", 16, 16, "tiles", 16);
    map.playProfile = "explore";
    const sprites: Record<string, EmberPixelSprite> = {
      villager: stubSprite("villager", true),
    };
    map.regions.push({
      id: "idle_1",
      kind: "npc_idle",
      x: 4,
      y: 4,
      w: 2,
      h: 2,
      spriteId: "villager",
    });
    map.regions.push({
      id: "walk_1",
      kind: "npc_wander",
      x: 8,
      y: 8,
      w: 4,
      h: 4,
      spriteId: "villager",
    });
    map.sprites = Array.from({ length: 40 }, (_, i) => ({
      id: `p${i}`,
      spriteId: "villager",
      x: 1 + (i % 10),
      y: 1,
      role: "npc" as const,
    }));

    const spawned = collectExploreNpcSpawns(map, sprites, EXPLORE_NPC_CAP);
    expect(spawned).toHaveLength(EXPLORE_NPC_CAP);
    expect(spawned[0]?.mode).toBe("idle");
    expect(spawned[1]?.mode).toBe("wander");
    expect(spawned[1]?.wander).toEqual({
      x0: 8 * 16,
      y0: 8 * 16,
      x1: 12 * 16,
      y1: 12 * 16,
    });
  });

  it("treats placement role and asset role as NPC tags", () => {
    const npcAsset = stubSprite("npc_asset", true);
    expect(
      spritePlacementIsNpc(
        { id: "a", spriteId: "npc_asset", x: 0, y: 0 },
        npcAsset,
      ),
    ).toBe(true);
    expect(
      spritePlacementIsNpc(
        { id: "b", spriteId: "lamp", x: 0, y: 0, role: "npc" },
        stubSprite("lamp"),
      ),
    ).toBe(true);
    expect(
      spritePlacementIsNpc(
        { id: "c", spriteId: "lamp", x: 0, y: 0 },
        stubSprite("lamp"),
      ),
    ).toBe(false);
  });

  it("bounces wanderers inside the AABB", () => {
    const stepped = stepExploreNpcWander(
      10,
      10,
      -1,
      0,
      1,
      { x0: 0, y0: 0, x1: 32, y1: 32 },
      16,
      16,
      16,
      4,
      40,
    );
    expect(stepped.x).toBeGreaterThanOrEqual(4);
    expect(stepped.dirX).toBeGreaterThan(0);
  });
});
