import { describe, expect, it } from "vitest";
import {
  FAVORITE_WALL_THUMB_MAX_EDGE,
  mapWithConcurrency,
  wallThumbTargetSize,
} from "./favoriteWallThumb";

describe("wallThumbTargetSize", () => {
  it("skips stills already at sample size", () => {
    expect(wallThumbTargetSize(850, 640)).toBeNull();
    expect(wallThumbTargetSize(900, 900)).toBeNull();
    expect(wallThumbTargetSize(640, 480)).toBeNull();
  });

  it("scales the long edge to the sample cap", () => {
    expect(wallThumbTargetSize(4000, 3000)).toEqual({
      width: FAVORITE_WALL_THUMB_MAX_EDGE,
      height: 675,
    });
    expect(wallThumbTargetSize(2000, 4000)).toEqual({
      width: 450,
      height: FAVORITE_WALL_THUMB_MAX_EDGE,
    });
  });

  it("rejects empty dimensions", () => {
    expect(wallThumbTargetSize(0, 100)).toBeNull();
    expect(wallThumbTargetSize(100, -1)).toBeNull();
  });
});

describe("mapWithConcurrency", () => {
  it("preserves order with a worker pool", async () => {
    const seen: number[] = [];
    const out = await mapWithConcurrency([10, 20, 30, 40], 2, async (n, i) => {
      seen.push(i);
      await Promise.resolve();
      return n + 1;
    });
    expect(out).toEqual([11, 21, 31, 41]);
    expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });
});
