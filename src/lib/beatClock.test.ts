import { afterEach, describe, expect, it, vi } from "vitest";
import { BeatClock } from "./beatClock";
import type { BeatPatternDef } from "./types";

const meter: BeatPatternDef = {
  id: "meter_straight",
  name: "Straight",
  nameRu: "Ровный",
  descriptionRu: "",
  kind: "meter",
  steps: [2],
  cuesRu: [],
  enabled: true,
};

describe("BeatClock pause origin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not let wall-clock pause eat the origin", () => {
    const hits: number[] = [];
    const clock = new BeatClock((p) => {
      hits.push(p.atMs);
    });
    let now = 10_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    clock.start(meter, 60, 0, 10_000, null);
    now = 10_400;
    clock.pause();
    const frozenOrigin = clock.getOriginPerf();
    now = 18_000;
    clock.resume();
    expect(clock.getOriginPerf()).toBeCloseTo(now - (10_400 - frozenOrigin), 3);
    clock.stop();
  });
});
