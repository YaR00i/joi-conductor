import { describe, expect, it } from "vitest";
import {
  normalizeRuntimeStressTarget,
  runtimeAllowsEnemyDamage,
  runtimeAllowsStageSpawns,
  runtimeEnemySpawnLimit,
  runtimeStressTargetForShortcut,
  runtimeXpAfterPickup,
} from "./runtimeStressPolicy";

describe("runtime stress policy", () => {
  it("keeps XP fixed while the F4 profiler mode is active", () => {
    expect(runtimeXpAfterPickup(0, 3, true)).toBe(0);
    expect(runtimeXpAfterPickup(4, 3, false)).toBe(7);
  });

  it("keeps the F4 actor target stable for repeatable profiling", () => {
    expect(runtimeAllowsStageSpawns(0)).toBe(true);
    expect(runtimeAllowsEnemyDamage(0)).toBe(true);
    expect(runtimeAllowsStageSpawns(120)).toBe(false);
    expect(runtimeAllowsEnemyDamage(120)).toBe(false);
  });

  it("maps profiling shortcuts to fixed 120/180/400/700 crowds", () => {
    expect(runtimeStressTargetForShortcut("F4", false)).toBe(120);
    expect(runtimeStressTargetForShortcut("F4", true)).toBe(180);
    expect(runtimeStressTargetForShortcut("F6", false)).toBe(400);
    expect(runtimeStressTargetForShortcut("F6", true)).toBe(700);
    expect(runtimeStressTargetForShortcut("F7", false)).toBeNull();
    expect(normalizeRuntimeStressTarget(401.4)).toBe(401);
    expect(normalizeRuntimeStressTarget(900)).toBe(700);
    expect(runtimeEnemySpawnLimit(0)).toBe(180);
    expect(runtimeEnemySpawnLimit(400)).toBe(400);
    expect(runtimeEnemySpawnLimit(700)).toBe(700);
  });
});
