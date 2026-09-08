import { beforeEach, describe, expect, it } from "vitest";
import { installLocalStorageMock, resetLocalStorage } from "../../test/localStorageMock";
import { bootFarmWorld, farmLevelFromXp, packFarmDisk, snapshotFarmWorld } from "./farmSave";
import { DEFAULT_FARM_UPGRADES, createFarmWorld } from "./farmSim";
import { homesteadSpec } from "./farmCampaign";

installLocalStorageMock();
beforeEach(() => resetLocalStorage());

describe("farm homestead save", () => {
  it("keeps animals and gold across a snapshot", () => {
    const w = createFarmWorld(homesteadSpec(1), DEFAULT_FARM_UPGRADES, () => 0.4);
    w.gold = 77;
    w.xp = 60;
    const snap = snapshotFarmWorld(w);
    const again = bootFarmWorld(() => 0.4, packFarmDisk(w, {
      well: 0, warehouse: 0, truck: 0, factory: 0, cat: 0, dog: 0,
    }));
    expect(again.gold).toBe(77);
    expect(again.animals.length).toBe(w.animals.length);
    expect(again.grass.length).toBe(snap.grass.length);
    expect(farmLevelFromXp(again.xp)).toBe(2);
  });
});
