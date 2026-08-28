import { describe, expect, it } from "vitest";
import {
  FARM_DIFFICULTIES,
  calcFarmReward,
  farmComboMult,
  getFarmDifficulty,
  harvestValueFor,
} from "./farmReward";

describe("farmComboMult", () => {
  it("grows +0.25 per consecutive harvest and caps at ×2", () => {
    expect(farmComboMult(0)).toBe(1);
    expect(farmComboMult(1)).toBe(1);
    expect(farmComboMult(2)).toBe(1.25);
    expect(farmComboMult(5)).toBe(2);
    expect(farmComboMult(9)).toBe(2);
  });

  it("prices a single harvest with rounding", () => {
    expect(harvestValueFor(3, 1)).toBe(3);
    expect(harvestValueFor(3, 2)).toBe(4); // 3.75 → 4
    expect(harvestValueFor(5, 5)).toBe(10);
  });
});

describe("calcFarmReward", () => {
  const diff = getFarmDifficulty("medium");

  it("pays base + harvest + clean inspections", () => {
    const r = calcFarmReward({
      difficulty: diff,
      harvestScore: 30,
      cleanInspections: 2,
      totalInspections: 2,
      wilts: 0,
      weedsLeft: 0,
      taskReward: 0,
      taskPenalty: 0,
    });
    expect(r.base).toBe(10);
    expect(r.inspectionBonus).toBe(16); // 2 × 8
    expect(r.total).toBe(10 + 30 + 16);
  });

  it("charges wilts cumulatively and weeds only at the horn", () => {
    const r = calcFarmReward({
      difficulty: diff,
      harvestScore: 20,
      cleanInspections: 1,
      totalInspections: 2,
      wilts: 4,
      weedsLeft: 2,
      taskReward: 5,
      taskPenalty: 3,
    });
    expect(r.wiltPenalty).toBe(12); // 4 × 3
    expect(r.weedPenalty).toBe(2);
    expect(r.total).toBe(10 + 20 + 8 + 5 - 12 - 2 - 3);
  });

  it("clamps a disastrous round to zero, never negative", () => {
    const r = calcFarmReward({
      difficulty: diff,
      harvestScore: 0,
      cleanInspections: 0,
      totalInspections: 2,
      wilts: 9,
      weedsLeft: 5,
      taskReward: 0,
      taskPenalty: 6,
    });
    expect(r.total).toBe(0);
  });

  it("has sane difficulty tables (grids, ascending rounds and inspections)", () => {
    for (const d of FARM_DIFFICULTIES) {
      expect(d.cols).toBeGreaterThanOrEqual(3);
      expect(d.rows).toBeGreaterThanOrEqual(2);
      expect(d.base).toBeGreaterThan(0);
      expect(d.wiltPenalty).toBeGreaterThan(0);
      expect(d.inspections.length).toBeGreaterThanOrEqual(1);
      const fracs = [...d.inspections];
      expect(fracs).toEqual([...fracs].sort((a, b) => a - b));
      expect(fracs[0]).toBeGreaterThan(0);
      expect(fracs[fracs.length - 1]).toBeLessThan(1);
    }
  });
});
