import { describe, expect, it } from "vitest";
import {
  calcRunnerReward,
  getRunnerDifficulty,
  RUNNER_DIFFICULTIES,
} from "./runnerReward";

describe("getRunnerDifficulty", () => {
  it("returns the requested difficulty", () => {
    expect(getRunnerDifficulty("marathon").labelRu).toBe("Марафон");
  });

  it("falls back to the first difficulty on unknown id", () => {
    expect(getRunnerDifficulty("nope" as never).id).toBe("warmup");
  });
});

describe("calcRunnerReward", () => {
  const diff = getRunnerDifficulty("run");

  it("base + crowd bonus + tasks, clamped to >= 0", () => {
    const r = calcRunnerReward({
      difficulty: diff,
      finalCrowd: 100,
      survived: true,
      taskReward: 7,
      taskPenalty: 2,
    });
    expect(r.base).toBe(12);
    expect(r.crowdBonus).toBe(Math.round(Math.sqrt(100) * 2.2 * 1.2));
    expect(r.total).toBe(r.base + r.crowdBonus + 7 - 2);
  });

  it("a wiped crowd keeps only 40% of the crowd bonus", () => {
    const survived = calcRunnerReward({
      difficulty: diff,
      finalCrowd: 100,
      survived: true,
      taskReward: 0,
      taskPenalty: 0,
    });
    const wiped = calcRunnerReward({
      difficulty: diff,
      finalCrowd: 100,
      survived: false,
      taskReward: 0,
      taskPenalty: 0,
    });
    // The cut is applied to the raw bonus before rounding (see calcRunnerReward).
    expect(wiped.crowdBonus).toBe(Math.round(Math.sqrt(100) * 2.2 * 1.2 * 0.4));
    expect(wiped.crowdBonus).toBeLessThan(survived.crowdBonus);
  });

  it("never goes negative even with heavy task penalties", () => {
    const r = calcRunnerReward({
      difficulty: diff,
      finalCrowd: 0,
      survived: false,
      taskReward: 0,
      taskPenalty: 999,
    });
    expect(r.total).toBe(0);
  });

  it("harder difficulties pay a bigger crowd multiplier", () => {
    const mk = (id: string) =>
      calcRunnerReward({
        difficulty: getRunnerDifficulty(id as never),
        finalCrowd: 64,
        survived: true,
        taskReward: 0,
        taskPenalty: 0,
      });
    const vals = RUNNER_DIFFICULTIES.map((d) => mk(d.id).crowdBonus);
    expect(vals[0]).toBeLessThan(vals[1]);
    expect(vals[1]).toBeLessThan(vals[2]);
  });
});
