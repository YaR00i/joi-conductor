import { describe, expect, it } from "vitest";
import {
  calcMemoryReward,
  getMemoryDifficulty,
  matchRewardFor,
  streakMult,
} from "./memoryReward";

describe("streakMult", () => {
  it("grows ×1 → ×2 in 0.25 steps and caps", () => {
    expect(streakMult(1)).toBe(1);
    expect(streakMult(2)).toBe(1.25);
    expect(streakMult(3)).toBe(1.5);
    expect(streakMult(4)).toBe(1.75);
    expect(streakMult(5)).toBe(2);
    expect(streakMult(9)).toBe(2);
  });

  it("never drops below ×1", () => {
    expect(streakMult(0)).toBe(1);
    expect(streakMult(-3)).toBe(1);
  });
});

describe("matchRewardFor", () => {
  it("scales the pair reward by the streak", () => {
    const d = getMemoryDifficulty("medium"); // matchReward 3
    expect(matchRewardFor(d, 1)).toBe(3);
    expect(matchRewardFor(d, 3)).toBe(5); // 3 × 1.5 = 4.5 → 5
    expect(matchRewardFor(d, 5)).toBe(6); // 3 × 2
  });
});

describe("calcMemoryReward", () => {
  const d = getMemoryDifficulty("medium");
  // base 10, perfect 10, miss 1, peek 4, target 150

  it("perfect fast clear with no tasks", () => {
    const r = calcMemoryReward({
      difficulty: d,
      elapsedSec: 0,
      matchScore: 24,
      mismatches: 0,
      peeks: 0,
      taskReward: 0,
      taskPenalty: 0,
    });
    // base 10 + 24 + speed 6 + perfect 10
    expect(r.speedBonus).toBe(6);
    expect(r.perfectBonus).toBe(10);
    expect(r.total).toBe(50);
  });

  it("slow clear: no speed bonus, misses and peeks subtract", () => {
    const r = calcMemoryReward({
      difficulty: d,
      elapsedSec: 600,
      matchScore: 24,
      mismatches: 7,
      peeks: 2,
      taskReward: 0,
      taskPenalty: 0,
    });
    expect(r.speedBonus).toBe(0);
    expect(r.perfectBonus).toBe(0);
    expect(r.missPenalty).toBe(7);
    expect(r.peekPenalty).toBe(8);
    expect(r.total).toBe(10 + 24 - 7 - 8);
  });

  it("cursed tasks add and subtract", () => {
    const r = calcMemoryReward({
      difficulty: d,
      elapsedSec: 150,
      matchScore: 24,
      mismatches: 3,
      peeks: 1,
      taskReward: 11,
      taskPenalty: 7,
    });
    expect(r.taskReward).toBe(11);
    expect(r.taskPenalty).toBe(7);
    // 10 + 24 + 0 speed + 0 perfect + 11 − 3 − 4 − 7 = 31
    expect(r.total).toBe(31);
  });

  it("clamps to zero instead of going negative", () => {
    const r = calcMemoryReward({
      difficulty: d,
      elapsedSec: 9999,
      matchScore: 0,
      mismatches: 50,
      peeks: 50,
      taskReward: 0,
      taskPenalty: 40,
    });
    expect(r.total).toBe(0);
  });

  it("speed bonus fades linearly to the target time", () => {
    const half = calcMemoryReward({
      difficulty: d,
      elapsedSec: 75,
      matchScore: 0,
      mismatches: 0,
      peeks: 0,
      taskReward: 0,
      taskPenalty: 0,
    });
    expect(half.speedBonus).toBe(3); // half of the max 6
  });
});
