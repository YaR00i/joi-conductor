import { describe, expect, it } from "vitest";
import {
  applyChestOpen,
  chestKey,
  chestToastText,
  compactLootIds,
  formatLootIds,
  parseLootIds,
  stampOpenedChests,
  wouldFireForChest,
} from "./chestLoot";
import type { EmberMap, EmberMapRegion } from "./types";

function chest(partial: Partial<EmberMapRegion> = {}): EmberMapRegion {
  return {
    id: "stash",
    kind: "chest",
    x: 2,
    y: 2,
    w: 1,
    h: 1,
    lootIds: ["coin", "herb"],
    ...partial,
  };
}

describe("chest loot stubs", () => {
  it("parses comma lists and drops duplicates", () => {
    expect(parseLootIds("coin, herb")).toEqual(["coin", "herb"]);
    expect(parseLootIds([" coin ", "herb", "coin", ""])).toEqual([
      "coin",
      "herb",
    ]);
    expect(compactLootIds([])).toBeUndefined();
    expect(formatLootIds(["coin", "herb"])).toBe("coin, herb");
  });

  it("opens once, then reports empty / already open", () => {
    const region = chest();
    const opened = new Set<string>();
    const first = applyChestOpen("agent_sandbox", region, opened);
    expect(first).toEqual({
      loot: ["coin", "herb"],
      lootNames: ["coin", "herb"],
      empty: false,
      opened: true,
      alreadyOpen: false,
      repeatable: false,
    });
    expect(region.opened).toBe(true);
    expect(opened.has(chestKey("agent_sandbox", "stash"))).toBe(true);
    expect(wouldFireForChest(region, first)).toMatchObject({
      action: "open_chest",
      loot: ["coin", "herb"],
      lootNames: ["coin", "herb"],
      empty: false,
      alreadyOpen: false,
    });
    expect(chestToastText(first)).toBe("Лут: coin, herb");

    const second = applyChestOpen("agent_sandbox", region, opened);
    expect(second.alreadyOpen).toBe(true);
    expect(second.empty).toBe(true);
    expect(second.loot).toEqual([]);
    expect(chestToastText(second)).toBe("Сундук уже открыт");
  });

  it("resolves catalog names and keeps unknown ids as stubs", () => {
    const region = chest();
    const catalog = {
      coin: {
        id: "coin",
        nameRu: "Монета",
        kind: "material" as const,
        slot: "none" as const,
        rarity: "common" as const,
        stackMax: 99,
        useIn: "both" as const,
      },
    };
    const first = applyChestOpen("agent_sandbox", region, new Set(), catalog);
    expect(first.loot).toEqual(["coin", "herb"]);
    expect(first.lootNames).toEqual(["Монета", "herb"]);
    expect(chestToastText(first)).toBe("Лут: Монета, herb");
  });

  it("repeatable chests grant loot again while staying opened", () => {
    const region = chest({ repeatable: true });
    const opened = new Set<string>();
    applyChestOpen("m", region, opened);
    const again = applyChestOpen("m", region, opened);
    expect(again.alreadyOpen).toBe(true);
    expect(again.loot).toEqual(["coin", "herb"]);
    expect(again.empty).toBe(false);
    expect(again.repeatable).toBe(true);
  });

  it("stamps opened onto regions after a session restore", () => {
    const map: EmberMap = {
      id: "agent_sandbox",
      tileSize: 16,
      width: 8,
      height: 8,
      tilesetId: "test",
      layers: [],
      regions: [chest(), chest({ id: "other", lootIds: ["coin"] })],
    };
    stampOpenedChests(map, new Set([chestKey("agent_sandbox", "stash")]));
    expect(map.regions[0]?.opened).toBe(true);
    expect(map.regions[1]?.opened).toBeUndefined();
  });
});
