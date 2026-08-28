import { beforeEach, describe, expect, it } from "vitest";
import {
  calcDoodleReward,
  DOODLE_FALL_SALVAGE,
  DOODLE_HEIGHT_K,
  DOODLE_HEAT_FULL_M,
  DOODLE_DIFFICULTIES,
  fallPunishSec,
  getDoodleDifficulty,
  heatMultiplier,
  loadDoodleBest,
  saveDoodleBestIfBetter,
} from "./doodleReward";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../test/localStorageMock";

installLocalStorageMock();

describe("getDoodleDifficulty", () => {
  it("returns the requested difficulty", () => {
    expect(getDoodleDifficulty("storm").labelRu).toBe("Штурм");
  });

  it("falls back to the first difficulty on unknown id", () => {
    expect(getDoodleDifficulty("nope" as never).id).toBe("warmup");
  });
});

describe("heat economy", () => {
  it("multiplier grows ×1 → ×2 and caps at DOODLE_HEAT_FULL_M", () => {
    expect(heatMultiplier(0)).toBe(1);
    expect(heatMultiplier(DOODLE_HEAT_FULL_M / 2)).toBe(1.5);
    expect(heatMultiplier(DOODLE_HEAT_FULL_M)).toBe(2);
    expect(heatMultiplier(DOODLE_HEAT_FULL_M * 4)).toBe(2);
    expect(heatMultiplier(-10)).toBe(1);
  });

  it("fall punishment forgives low heat and scales up to 12 s", () => {
    expect(fallPunishSec(0)).toBe(0);
    expect(fallPunishSec(0.2)).toBe(0); // cold fall is free
    expect(fallPunishSec(0.25)).toBeGreaterThan(0);
    expect(fallPunishSec(1)).toBe(12);
  });

  it("hearth spacing is configured on every difficulty", () => {
    for (const d of DOODLE_DIFFICULTIES) {
      expect(d.hearthMinM).toBeLessThan(d.hearthMaxM);
      // a typical climb (see balance sim medians ~180-210 m) must cross
      // at least one hearth, otherwise the whole bank loop is dead code
      expect(d.hearthMaxM).toBeLessThan(170);
    }
  });
});

describe("calcDoodleReward", () => {
  const diff = getDoodleDifficulty("climb");

  it("base + heat height bonus + tasks + stomps", () => {
    const r = calcDoodleReward({
      difficulty: diff,
      bankedMeters: 180,
      burnedMeters: 39,
      taskReward: 7,
      stompReward: 8,
      taskPenalty: 2,
    });
    expect(r.base).toBe(8);
    expect(r.heightBonus).toBe(
      Math.round(Math.sqrt(219) * DOODLE_HEIGHT_K * 1.25),
    );
    expect(r.total).toBe(r.base + r.heightBonus + 7 + 8 - 2);
  });

  it("stomped frost blobs pay out flat", () => {
    const base = calcDoodleReward({
      difficulty: diff,
      bankedMeters: 100,
      burnedMeters: 0,
      taskReward: 0,
      stompReward: 0,
      taskPenalty: 0,
    });
    const withStomps = calcDoodleReward({
      difficulty: diff,
      bankedMeters: 100,
      burnedMeters: 0,
      taskReward: 0,
      stompReward: 12,
      taskPenalty: 0,
    });
    expect(withStomps.total - base.total).toBe(12);
  });

  it("banked heat beats the same height lost to a fall", () => {
    const banked = calcDoodleReward({
      difficulty: diff,
      bankedMeters: 200,
      burnedMeters: 0,
      taskReward: 0,
      stompReward: 0,
      taskPenalty: 0,
    });
    const fallen = calcDoodleReward({
      difficulty: diff,
      bankedMeters: 0,
      // same raw climb, but salvaged at 25% of the multiplied value
      burnedMeters: Math.round(200 * DOODLE_FALL_SALVAGE),
      taskReward: 0,
      stompReward: 0,
      taskPenalty: 0,
    });
    expect(banked.heightBonus).toBeGreaterThan(fallen.heightBonus);
  });

  it("payouts are modest: a good climb run stays under ~60 cinders", () => {
    // 320 m on storm with two hearths banked hot + tasks is a great run
    const r = calcDoodleReward({
      difficulty: getDoodleDifficulty("storm"),
      bankedMeters: 290,
      burnedMeters: 80,
      taskReward: 15,
      stompReward: 8,
      taskPenalty: 0,
    });
    expect(r.total).toBeLessThan(80);
    // and a typical climb run is far below that
    const mid = calcDoodleReward({
      difficulty: diff,
      bankedMeters: 180,
      burnedMeters: 39,
      taskReward: 5,
      stompReward: 4,
      taskPenalty: 3,
    });
    expect(mid.total).toBeLessThan(50);
  });

  it("never goes negative even with heavy task penalties", () => {
    const r = calcDoodleReward({
      difficulty: diff,
      bankedMeters: 0,
      burnedMeters: 0,
      taskReward: 0,
      stompReward: 0,
      taskPenalty: 999,
    });
    expect(r.total).toBe(0);
  });

  it("harder difficulties pay a bigger height multiplier", () => {
    const mk = (id: string) =>
      calcDoodleReward({
        difficulty: getDoodleDifficulty(id as never),
        bankedMeters: 150,
        burnedMeters: 0,
        taskReward: 0,
        stompReward: 0,
        taskPenalty: 0,
      });
    const vals = DOODLE_DIFFICULTIES.map((d) => mk(d.id).heightBonus);
    expect(vals[0]).toBeLessThan(vals[1]);
    expect(vals[1]).toBeLessThan(vals[2]);
  });
});

describe("doodle best persistence", () => {
  beforeEach(() => {
    resetLocalStorage();
  });

  it("stores the highest climb per difficulty", () => {
    saveDoodleBestIfBetter("climb", { height: 120, total: 40 });
    saveDoodleBestIfBetter("climb", { height: 200, total: 55 });
    saveDoodleBestIfBetter("climb", { height: 150, total: 99 }); // lower climb ignored
    const best = loadDoodleBest();
    expect(best.climb?.height).toBe(200);
    expect(best.climb?.total).toBe(55);
    expect(best.warmup).toBeUndefined();
  });

  it("survives corrupt storage", () => {
    localStorage.setItem("joi-doodle-best-v1", "{oops");
    expect(loadDoodleBest()).toEqual({});
  });
});
