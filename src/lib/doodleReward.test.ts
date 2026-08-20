import { beforeEach, describe, expect, it } from "vitest";
import {
  calcDoodleReward,
  getDoodleDifficulty,
  DOODLE_DIFFICULTIES,
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

describe("calcDoodleReward", () => {
  const diff = getDoodleDifficulty("climb");

  it("base + height bonus + tasks", () => {
    const r = calcDoodleReward({
      difficulty: diff,
      heightM: 144,
      taskReward: 7,
      taskPenalty: 2,
    });
    expect(r.base).toBe(12);
    expect(r.heightBonus).toBe(Math.round(Math.sqrt(144) * 3.2 * 1.25));
    expect(r.total).toBe(r.base + r.heightBonus + 7 - 2);
  });

  it("sqrt scaling: the second 100 m pays less than the first", () => {
    const at = (m: number) =>
      calcDoodleReward({ difficulty: diff, heightM: m, taskReward: 0, taskPenalty: 0 });
    const first100 = at(100).heightBonus - at(0).heightBonus;
    const second100 = at(200).heightBonus - at(100).heightBonus;
    expect(first100).toBeGreaterThan(second100);
  });

  it("never goes negative even with heavy task penalties", () => {
    const r = calcDoodleReward({
      difficulty: diff,
      heightM: 5,
      taskReward: 0,
      taskPenalty: 999,
    });
    expect(r.total).toBe(0);
  });

  it("harder difficulties pay a bigger height multiplier", () => {
    const mk = (id: string) =>
      calcDoodleReward({
        difficulty: getDoodleDifficulty(id as never),
        heightM: 100,
        taskReward: 0,
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
