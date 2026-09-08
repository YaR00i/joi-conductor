import { describe, expect, it } from "vitest";
import { buyFarmUpgrade, defaultFarmRanks, farmUnlocks, farmUpgradesFrom, homesteadSpec } from "./farmCampaign";

describe("farm homestead catalog", () => {
  it("starts as an open yard without a round timer", () => {
    const spec = homesteadSpec(1);
    expect(spec.timeLimitMs).toBe(0);
    expect(spec.goals).toHaveLength(0);
    expect(spec.shop).toEqual(["chicken"]);
    expect(spec.factories).toHaveLength(0);
  });

  it("unlocks mill and corn at level 2, livestock later", () => {
    expect(farmUnlocks(2).factories).toContain("mill");
    expect(farmUnlocks(2).crops).toContain("corn");
    expect(farmUnlocks(3).shop).toContain("cow");
    expect(farmUnlocks(5).pests).toBe(true);
  });

  it("spends gold on a well upgrade", () => {
    const ranks = defaultFarmRanks();
    const next = buyFarmUpgrade(ranks, 80, "well");
    expect(next).not.toBeNull();
    expect(next!.ranks.well).toBe(1);
    expect(next!.gold).toBe(45);
    expect(farmUpgradesFrom(next!.ranks).wellCap).toBeGreaterThan(farmUpgradesFrom(ranks).wellCap);
  });
});
