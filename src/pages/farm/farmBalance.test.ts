import { describe, expect, it } from "vitest";
import { homesteadSpec } from "./farmCampaign";
import {
  DEFAULT_FARM_UPGRADES,
  clickTile,
  clickTruck,
  clickWell,
  createFarmWorld,
  stepFarmWorld,
} from "./farmSim";

function rng() {
  return 0.42;
}

describe("farm homestead loop", () => {
  it("can grow wheat, store it, and sell a truckload", () => {
    const w = createFarmWorld(homesteadSpec(1), DEFAULT_FARM_UPGRADES, rng);
    w.gold = 80;
    w.water = 8;
    clickTile(w, 2.4, 2.4, [], "wheat");
    for (let t = 0; t < 12_000; t += 100) {
      if (w.water <= 1) clickWell(w);
      stepFarmWorld(w, 100, rng);
    }
    clickTile(w, 2.4, 2.4, []);
    expect(w.warehouse).toContain("wheat");
    expect(clickTruck(w)).toBe(true);
    for (let t = 0; t < DEFAULT_FARM_UPGRADES.truckTravelMs + 100; t += 100) {
      stepFarmWorld(w, 100, rng);
    }
    expect((w.sold.wheat ?? 0)).toBeGreaterThanOrEqual(1);
    expect(w.won).toBe(false);
  });
});
