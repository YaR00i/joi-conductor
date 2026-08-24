import { describe, expect, it } from "vitest";
import {
  emberProfilerUnaccountedMs,
  type EmberProfilerWork,
} from "./emberFrameProfiler";

const emptyWork = (): EmberProfilerWork => ({
  worldMs: 0,
  weaponsMs: 0,
  bulletsMs: 0,
  orbitalsMs: 0,
  spawnsMs: 0,
  aiMs: 0,
  terrainMs: 0,
  cameraMs: 0,
  billboardsMs: 0,
  environmentMs: 0,
  shadowsMs: 0,
  hudMs: 0,
  reflectionMs: 0,
  mainRenderMs: 0,
  profilerMs: 0,
});

describe("Ember frame profiler", () => {
  it("reports CPU time not covered by named work buckets", () => {
    const work = emptyWork();
    work.aiMs = 3.5;
    work.mainRenderMs = 4;
    work.profilerMs = 0.5;

    expect(emberProfilerUnaccountedMs(12, work)).toBe(4);
  });

  it("never reports a negative remainder when timers overlap or round", () => {
    const work = emptyWork();
    work.worldMs = 7;
    work.bulletsMs = 5;

    expect(emberProfilerUnaccountedMs(10, work)).toBe(0);
  });
});
