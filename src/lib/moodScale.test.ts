import { describe, expect, it } from "vitest";
import {
  applyMoodToSessionParams,
  moodDeltaUnits,
  scaleByMood,
  scaleDurationSec,
  scaleEdgesTarget,
} from "./moodScale";
import { DEFAULT_PARAMS } from "./types";

describe("scaleByMood", () => {
  it("adds hours when cruel / chaotic", () => {
    expect(moodDeltaUnits(-2)).toBe(2);
    expect(moodDeltaUnits(-3)).toBe(3);
    expect(scaleByMood(8, -2, 4, 12)).toBe(10);
  });

  it("softens when sweet", () => {
    expect(moodDeltaUnits(2)).toBe(-1);
    expect(scaleByMood(8, 2, 4, 12)).toBe(7);
  });

  it("clamps to the pool", () => {
    expect(scaleByMood(12, -3, 4, 12)).toBe(12);
    expect(scaleByMood(4, 2, 4, 12)).toBe(4);
  });

  it("scales session duration and edges", () => {
    expect(scaleDurationSec(600, -2)).toBeGreaterThan(600);
    expect(scaleDurationSec(600, 2)).toBeLessThan(600);
    expect(scaleEdgesTarget(5, -2)).toBe(7);
    expect(scaleEdgesTarget(5, 2)).toBe(4);
  });

  it("applies to session params", () => {
    const next = applyMoodToSessionParams(
      { ...DEFAULT_PARAMS, durationSec: 600, edgesTarget: 5 },
      -2,
    );
    expect(next.durationSec).toBeGreaterThan(600);
    expect(next.edgesTarget).toBe(7);
  });
});
