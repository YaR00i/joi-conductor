import { describe, expect, it } from "vitest";
import { FARM_ANIMALS } from "./farmItems";
import {
  clickBuy,
  clickFactory,
  clickTile,
  clickTruck,
  clickWell,
  createFarmWorld,
  farmMessCount,
  goalsMet,
  stepFarmWorld,
  tryStore,
  type FarmLevelSpec,
} from "./farmSim";
import { DEFAULT_FARM_UPGRADES } from "./farmSim";

const calm = () => 0.5;

function stepMany(w: ReturnType<typeof createFarmWorld>, ms: number, rng: () => number) {
  for (let t = 0; t < ms; t += 100) stepFarmWorld(w, 100, rng);
}

function spec(over: Partial<FarmLevelSpec> = {}): FarmLevelSpec {
  return {
    id: "t",
    cols: 6,
    rows: 5,
    startGold: 80,
    startWater: 8,
    startGrass: 0,
    startAnimals: [{ kind: "chicken", n: 1 }],
    factories: ["mill"],
    shop: ["chicken"],
    pests: false,
    pestFirstMs: 999999,
    pestEveryMs: 999999,
    dropDespawnMs: 8000,
    timeLimitMs: 60_000,
    silverMs: 40_000,
    goldMs: 20_000,
    goals: [{ kind: "gold", amount: 200 }],
    inspections: [0.5],
    ...over,
  };
}

describe("farmSim grass + well", () => {
  it("waters a tile and spends well water", () => {
    const w = createFarmWorld(spec({ startAnimals: [] }), DEFAULT_FARM_UPGRADES, calm);
    expect(w.water).toBe(8);
    clickTile(w, 1.2, 1.2, []);
    expect(w.grass[1 * w.cols + 1]).toBe(1);
    expect(w.water).toBe(7);
  });

  it("refills the well for gold", () => {
    const w = createFarmWorld(spec({ startAnimals: [], startWater: 0 }), DEFAULT_FARM_UPGRADES, calm);
    expect(clickWell(w)).toBe(true);
    expect(w.water).toBe(DEFAULT_FARM_UPGRADES.wellCap);
    expect(w.gold).toBe(70);
  });

  it("plants a starter lawn from startGrass", () => {
    const w = createFarmWorld(spec({ startAnimals: [], startGrass: 2, cols: 6, rows: 5 }), DEFAULT_FARM_UPGRADES, calm);
    expect(w.grass[2 * w.cols + 3]).toBe(2);
    expect(w.grass[0]).toBe(0);
  });
});

describe("farmSim livestock loop", () => {
  it("chicken eats grass and lays an egg that stores and sells", () => {
    const w = createFarmWorld(
      spec({
        startAnimals: [{ kind: "chicken", n: 1 }],
        startWater: 20,
        goals: [{ kind: "sold", item: "egg", amount: 1 }],
        timeLimitMs: 30_000,
      }),
      DEFAULT_FARM_UPGRADES,
      calm,
    );
    w.animals[0].x = 2.4;
    w.animals[0].y = 2.4;
    w.animals[0].produceMs = FARM_ANIMALS.chicken.produceSec * 1000 - 200;
    for (let i = 0; i < 6; i++) clickTile(w, 2.4, 2.4, []);
    for (let t = 0; t < 8000; t += 100) stepFarmWorld(w, 100, calm);
    expect(w.drops.length + w.warehouse.length).toBeGreaterThan(0);
    if (w.drops[0]) clickTile(w, w.drops[0].x, w.drops[0].y, []);
    expect(w.warehouse).toContain("egg");
    expect(clickTruck(w)).toBe(true);
    stepMany(w, DEFAULT_FARM_UPGRADES.truckTravelMs + 50, calm);
    expect(w.sold.egg).toBeGreaterThanOrEqual(1);
    expect(goalsMet(w)).toBe(true);
  });

  it("mill consumes an egg and drops powder", () => {
    const w = createFarmWorld(spec({ startAnimals: [] }), DEFAULT_FARM_UPGRADES, calm);
    expect(tryStore(w, "egg")).toBe(true);
    expect(clickFactory(w, "mill", [])).toBe(true);
    stepMany(w, 6000, calm);
    expect(w.drops.some((d) => d.item === "powder")).toBe(true);
  });

  it("buy chicken spends gold", () => {
    const w = createFarmWorld(spec({ startAnimals: [] }), DEFAULT_FARM_UPGRADES, calm);
    expect(clickBuy(w, "chicken", calm)).toBe(true);
    expect(w.animals).toHaveLength(1);
    expect(w.gold).toBe(60);
  });

  it("animals walk toward a wander point when the field is bare", () => {
    const w = createFarmWorld(
      spec({ startAnimals: [{ kind: "chicken", n: 1 }] }),
      DEFAULT_FARM_UPGRADES,
      () => 0.8,
    );
    const start = { x: w.animals[0].x, y: w.animals[0].y };
    stepMany(w, 2500, () => 0.8);
    expect(Math.hypot(w.animals[0].x - start.x, w.animals[0].y - start.y)).toBeGreaterThan(0.25);
  });

  it("nibbles one grass step per eatSec instead of stripping the plot", () => {
    const w = createFarmWorld(
      spec({ startAnimals: [{ kind: "chicken", n: 1 }] }),
      DEFAULT_FARM_UPGRADES,
      calm,
    );
    w.animals[0].x = 2.4;
    w.animals[0].y = 2.4;
    const i = 2 * w.cols + 2;
    w.grass[i] = 3;
    for (let t = 0; t < 200; t += 50) stepFarmWorld(w, 50, calm);
    expect(w.grass[i]).toBe(3);
    for (let t = 0; t < 2300; t += 50) stepFarmWorld(w, 50, calm);
    expect(w.grass[i]).toBe(2);
    expect(w.animals).toHaveLength(1);
  });

  it("stays on the field hungry instead of disappearing", () => {
    const w = createFarmWorld(
      spec({ startAnimals: [{ kind: "chicken", n: 1 }] }),
      DEFAULT_FARM_UPGRADES,
      calm,
    );
    stepMany(w, 20_000, calm);
    expect(w.animals).toHaveLength(1);
    stepMany(w, 50_000, calm);
    expect(w.animals).toHaveLength(1);
    expect(w.animals[0].hungerMs).toBeGreaterThan(20_000);
  });

  it("grows planted wheat and harvests it into the barn", () => {
    const w = createFarmWorld(spec({ startAnimals: [] }), DEFAULT_FARM_UPGRADES, calm);
    w.gold = 40;
    clickTile(w, 2.4, 2.4, [], "wheat");
    expect(w.crops[2 * w.cols + 2]?.kind).toBe("wheat");
    stepMany(w, 11_000, calm);
    clickTile(w, 2.4, 2.4, []);
    expect(w.warehouse).toContain("wheat");
    expect(w.crops[2 * w.cols + 2]).toBeNull();
  });

  it("raccoon walks to a drop before storing it", () => {
    const w = createFarmWorld(
      spec({ startAnimals: [] }),
      { ...DEFAULT_FARM_UPGRADES, hasCat: true },
      calm,
    );
    expect(w.cat).not.toBeNull();
    w.drops.push({ id: 90, item: "egg", x: 4.5, y: 3.5, ageMs: 0 });
    if (w.cat) {
      w.cat.x = 0.6;
      w.cat.y = 0.6;
    }
    stepMany(w, 400, calm);
    expect(w.drops.length).toBe(1);
    expect(Math.hypot((w.cat?.x ?? 0) - 4.5, (w.cat?.y ?? 0) - 3.5)).toBeLessThan(4);
    stepMany(w, 4000, calm);
    expect(w.warehouse).toContain("egg");
    expect(w.drops).toHaveLength(0);
  });
});

describe("farmSim mess", () => {
  it("counts a loose pest as mess", () => {
    const w = createFarmWorld(
      spec({ pests: true, pestFirstMs: 0, pestEveryMs: 999999, startAnimals: [] }),
      DEFAULT_FARM_UPGRADES,
      calm,
    );
    stepFarmWorld(w, 50, calm);
    expect(w.pests.length).toBe(1);
    expect(farmMessCount(w)).toBeGreaterThan(0);
  });
});
