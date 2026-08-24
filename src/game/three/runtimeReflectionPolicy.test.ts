import { describe, expect, it } from "vitest";
import {
  advanceRuntimeReflectionClock,
  runtimeReflectionIntervalMs,
  shouldRenderRuntimeReflection,
} from "./runtimeReflectionPolicy";

describe("runtime reflection policy", () => {
  it("keeps normal reflections responsive and degrades idle stress crowds", () => {
    expect(runtimeReflectionIntervalMs(16)).toBeCloseTo(1000 / 30);
    expect(runtimeReflectionIntervalMs(159, true)).toBeCloseTo(1000 / 60);
    expect(runtimeReflectionIntervalMs(160)).toBe(500);
    expect(runtimeReflectionIntervalMs(160, true)).toBeCloseTo(1000 / 30);
    expect(shouldRenderRuntimeReflection(499, 0, 180)).toBe(false);
    expect(shouldRenderRuntimeReflection(500, 0, 180)).toBe(true);
    expect(shouldRenderRuntimeReflection(16, 0, 16, true)).toBe(false);
    expect(shouldRenderRuntimeReflection(17, 0, 16, true)).toBe(true);
  });

  it("keeps cadence debt so 60 Hz does not collapse to half the render FPS", () => {
    const interval = 1000 / 60;
    expect(advanceRuntimeReflectionClock(24, 0, interval)).toBeCloseTo(interval);
    expect(
      advanceRuntimeReflectionClock(36, interval, interval),
    ).toBeCloseTo(interval * 2);
    expect(advanceRuntimeReflectionClock(1000, 0, interval)).toBeCloseTo(
      1000 - interval,
    );
  });
});
