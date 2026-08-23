import { describe, expect, it } from "vitest";
import {
  beginMapFade,
  createMapFadeState,
  MAP_FADE_DOOR_CLOSE_MS,
  MAP_FADE_IN_MS,
  MAP_FADE_OUT_MS,
  mapFadeBusy,
  stepMapFade,
} from "./mapFade";

describe("mapFade", () => {
  it("starts idle and stays idle until begin", () => {
    const idle = createMapFadeState();
    expect(idle).toEqual({
      phase: "idle",
      elapsedMs: 0,
      opacity: 0,
      door: 0,
    });
    expect(mapFadeBusy(idle)).toBe(false);
    expect(stepMapFade(idle, 100).state.phase).toBe("idle");
  });

  it("fades out, swaps at black, then fades in to idle", () => {
    let state = beginMapFade(createMapFadeState());
    expect(state.phase).toBe("out");
    expect(mapFadeBusy(state)).toBe(true);
    expect(state.opacity).toBe(0);

    const mid = stepMapFade(state, MAP_FADE_OUT_MS / 2);
    expect(mid.swap).toBe(false);
    expect(mid.state.phase).toBe("out");
    expect(mid.state.opacity).toBeCloseTo(0.5, 5);

    const endOut = stepMapFade(mid.state, MAP_FADE_OUT_MS / 2);
    expect(endOut.swap).toBe(true);
    expect(endOut.state.phase).toBe("in");
    expect(endOut.state.opacity).toBe(1);
    expect(endOut.state.door).toBe(1);

    const endIn = stepMapFade(endOut.state, MAP_FADE_IN_MS);
    expect(endIn.swap).toBe(false);
    expect(endIn.state.phase).toBe("idle");
    expect(endIn.state.opacity).toBe(0);
    expect(mapFadeBusy(endIn.state)).toBe(false);
  });

  it("closes the door vignette in the first slice of fade-out", () => {
    const started = beginMapFade(createMapFadeState());
    const shut = stepMapFade(started, MAP_FADE_DOOR_CLOSE_MS);
    expect(shut.state.phase).toBe("out");
    expect(shut.state.door).toBe(1);
    expect(shut.state.opacity).toBeLessThan(1);
  });

  it("does not restart while already fading", () => {
    const started = beginMapFade(createMapFadeState());
    const advanced = stepMapFade(started, 80).state;
    expect(beginMapFade(advanced)).toBe(advanced);
  });
});
