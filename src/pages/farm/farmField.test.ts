import { describe, expect, it } from "vitest";
import {
  FARM_CROPS,
  clearPlot,
  createFarmField,
  farmCropById,
  farmDirtCount,
  farmPlotProgress,
  farmRipeUrgency,
  farmWeedsLeft,
  harvestPlot,
  plantCrop,
  stepFarmField,
  waterPlot,
} from "./farmField";

/** rng that never fires events (all trials ≥ rate). */
const calm = () => 1;

describe("farmField growth lifecycle", () => {
  it("grows to ripe and wilts when nobody picks it", () => {
    const f = createFarmField(1);
    plantCrop(f, 0, "cucumber");
    const cuke = farmCropById("cucumber");

    stepFarmField(f, cuke.growMs, { thirstPerSec: 0, weedPerSec: 0 }, calm);
    expect(f.plots[0]).toMatchObject({ kind: "ripe", cropId: "cucumber" });
    expect(farmRipeUrgency(f.plots[0])).toBe(0);

    stepFarmField(f, cuke.ripeWindowMs, { thirstPerSec: 0, weedPerSec: 0 }, calm);
    expect(f.plots[0]).toMatchObject({ kind: "wilted" });
    expect(f.wilts).toBe(1);
    expect(f.combo).toBe(0);
  });

  it("harvest pays value × combo and raises the streak", () => {
    const f = createFarmField(2);
    const banana = farmCropById("banana");
    for (let i = 0; i < 2; i++) plantCrop(f, i, "banana");
    stepFarmField(f, banana.growMs, { thirstPerSec: 0, weedPerSec: 0 }, calm);

    expect(harvestPlot(f, 0)).toBe(2); // 2 × 1
    expect(harvestPlot(f, 1)).toBe(3); // 2 × 1.25 → round 3
    expect(f.harvested).toBe(2);
    expect(f.combo).toBe(2);
    expect(f.plots.every((p) => p.kind === "empty")).toBe(true);
  });

  it("thirst pauses growth; watering resumes it; drought wilts", () => {
    const f = createFarmField(1);
    plantCrop(f, 0, "banana");
    const banana = farmCropById("banana");
    const rates = { thirstPerSec: 0, weedPerSec: 0 };

    // First rng call is the thirst trial: 0 fires it, later calls pick an
    // in-range target index.
    let call = 0;
    const thirstyRng = () => (call++ === 0 ? 0 : 0.5);
    stepFarmField(f, 1000, { ...rates, thirstPerSec: 1 }, thirstyRng);
    expect(f.plots[0]).toMatchObject({ kind: "growing", thirsty: true });

    // Paused: staying thirsty below the drought tolerance → no ripening.
    stepFarmField(f, banana.thirstToleranceMs - 1500, rates, calm);
    expect(f.plots[0]).toMatchObject({ kind: "growing", growthMs: 0 });

    // Crossing the drought tolerance wilts the crop.
    stepFarmField(f, 1500, rates, calm);
    expect(f.plots[0]).toMatchObject({ kind: "wilted" });
    expect(f.wilts).toBe(1);
  });

  it("watering resets the thirst clock and growth continues", () => {
    const f = createFarmField(1);
    plantCrop(f, 0, "cucumber");
    const cuke = farmCropById("cucumber");
    const rates = { thirstPerSec: 0, weedPerSec: 0 };

    let call = 0;
    stepFarmField(f, 1000, { ...rates, thirstPerSec: 1 }, () => (call++ === 0 ? 0 : 0.5));
    expect(waterPlot(f, 0)).toBe(true);
    expect(f.watered).toBe(1);
    // Watering a non-thirsty plot is a no-op.
    expect(waterPlot(f, 0)).toBe(false);

    stepFarmField(f, cuke.growMs, rates, calm);
    expect(f.plots[0]).toMatchObject({ kind: "ripe" });
  });
});

describe("farmField weeds + dirt", () => {
  it("weeds sprout on empty plots only, block planting and are clearable", () => {
    const f = createFarmField(2);
    plantCrop(f, 0, "cucumber");
    const rates = { thirstPerSec: 0, weedPerSec: 0 };

    let call = 0;
    const weedRng = () => (call++ === 1 ? 0 : 0.5); // second call is the weed trial
    stepFarmField(f, 100, { ...rates, weedPerSec: 1 }, weedRng);
    expect(f.plots[1]).toMatchObject({ kind: "weed" });
    expect(f.plots[0].kind).toBe("growing"); // occupied plots are safe

    expect(plantCrop(f, 1, "cucumber")).toBe(false);
    expect(farmDirtCount(f)).toBe(1);
    expect(farmWeedsLeft(f)).toBe(1);

    expect(clearPlot(f, 1)).toBe(true);
    expect(f.weeded).toBe(1);
    expect(farmDirtCount(f)).toBe(0);
  });

  it("counts wilted crops as dirt for the Mistress", () => {
    const f = createFarmField(1);
    plantCrop(f, 0, "cucumber");
    const cuke = farmCropById("cucumber");
    const rates = { thirstPerSec: 0, weedPerSec: 0 };
    // Ripen first, then let the ripe window lapse (state turns once per step).
    stepFarmField(f, cuke.growMs, rates, calm);
    stepFarmField(f, cuke.ripeWindowMs, rates, calm);
    expect(farmDirtCount(f)).toBe(1);
    expect(clearPlot(f, 0)).toBe(true);
    expect(farmDirtCount(f)).toBe(0);
  });
});

describe("farmField helpers", () => {
  it("tracks growth progress between 0 and 1", () => {
    const f = createFarmField(1);
    plantCrop(f, 0, "eggplant");
    const half = farmCropById("eggplant").growMs / 2;
    stepFarmField(f, half, { thirstPerSec: 0, weedPerSec: 0 }, calm);
    expect(farmPlotProgress(f.plots[0])).toBeCloseTo(0.5, 5);
    stepFarmField(f, half, { thirstPerSec: 0, weedPerSec: 0 }, calm);
    expect(farmPlotProgress(f.plots[0])).toBe(0); // ripe now
  });

  it("exposes a full crop catalogue with sane timing", () => {
    expect(FARM_CROPS.length).toBeGreaterThanOrEqual(4);
    for (const c of FARM_CROPS) {
      expect(c.growMs).toBeGreaterThan(0);
      expect(c.ripeWindowMs).toBeGreaterThan(0);
      expect(c.thirstToleranceMs).toBeGreaterThan(0);
      expect(c.value).toBeGreaterThan(0);
      expect(c.nameRu.length).toBeGreaterThan(0);
      expect(c.jokeRu.length).toBeGreaterThan(0);
    }
  });
});
