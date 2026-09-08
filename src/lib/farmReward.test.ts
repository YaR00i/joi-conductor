import { describe, expect, it } from "vitest";
import { calcFarmVisitReward, formatRoundClock } from "./farmReward";

describe("calcFarmVisitReward", () => {
  it("pays a capped visit for gold and xp after a real session", () => {
    const r = calcFarmVisitReward({
      visitMs: 40_000,
      goldEarned: 50,
      xpGained: 50,
      taskReward: 4,
      taskPenalty: 0,
    });
    expect(r.visit).toBe(2);
    expect(r.goldConvert).toBe(2);
    expect(r.xpConvert).toBe(2);
    expect(r.total).toBe(10);
  });

  it("pays nothing for a peek with no earnings", () => {
    const r = calcFarmVisitReward({
      visitMs: 5_000,
      goldEarned: 0,
      xpGained: 0,
      taskReward: 0,
      taskPenalty: 0,
    });
    expect(r.total).toBe(0);
  });
});

describe("formatRoundClock", () => {
  it("uses floor minutes so 100s is 1:40, not 2:40", () => {
    expect(formatRoundClock(100)).toBe("1:40");
    expect(formatRoundClock(120)).toBe("2:00");
    expect(formatRoundClock(59)).toBe("0:59");
  });
});
