/**
 * Explore map-change fade: idle → out → in.
 * Visual overlay is driven from play; headless sim only records `faded: true`.
 */
export type MapFadePhase = "idle" | "out" | "in";

/** Fade to black before the map swap. */
export const MAP_FADE_OUT_MS = 400;
/** Fade in after the destination map is loaded. */
export const MAP_FADE_IN_MS = 380;
/** Cheap door-jamb close during the start of fade-out. */
export const MAP_FADE_DOOR_CLOSE_MS = 110;
/** Door-jamb release near the end of fade-in. */
export const MAP_FADE_DOOR_OPEN_MS = 140;

export type MapFadeState = {
  phase: MapFadePhase;
  elapsedMs: number;
  /** 0 transparent … 1 fully covering. */
  opacity: number;
  /** 0 open … 1 shut (side vignette). */
  door: number;
};

export function createMapFadeState(): MapFadeState {
  return { phase: "idle", elapsedMs: 0, opacity: 0, door: 0 };
}

export function mapFadeBusy(state: MapFadeState): boolean {
  return state.phase !== "idle";
}

export function beginMapFade(state: MapFadeState): MapFadeState {
  if (state.phase !== "idle") return state;
  return { phase: "out", elapsedMs: 0, opacity: 0, door: 0 };
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function sampleOut(elapsedMs: number): { opacity: number; door: number } {
  return {
    opacity: smoothstep(elapsedMs / MAP_FADE_OUT_MS),
    door: clamp01(elapsedMs / MAP_FADE_DOOR_CLOSE_MS),
  };
}

function sampleIn(elapsedMs: number): { opacity: number; door: number } {
  const remain = MAP_FADE_IN_MS - elapsedMs;
  return {
    opacity: smoothstep(1 - elapsedMs / MAP_FADE_IN_MS),
    door: clamp01(remain / MAP_FADE_DOOR_OPEN_MS),
  };
}

export function stepMapFade(
  state: MapFadeState,
  dtMs: number,
): { state: MapFadeState; swap: boolean } {
  if (dtMs <= 0) return { state, swap: false };
  switch (state.phase) {
    case "idle":
      return { state, swap: false };
    case "out": {
      const elapsedMs = state.elapsedMs + dtMs;
      if (elapsedMs >= MAP_FADE_OUT_MS) {
        return {
          state: { phase: "in", elapsedMs: 0, opacity: 1, door: 1 },
          swap: true,
        };
      }
      return {
        state: { phase: "out", elapsedMs, ...sampleOut(elapsedMs) },
        swap: false,
      };
    }
    case "in": {
      const elapsedMs = state.elapsedMs + dtMs;
      if (elapsedMs >= MAP_FADE_IN_MS) {
        return { state: createMapFadeState(), swap: false };
      }
      return {
        state: { phase: "in", elapsedMs, ...sampleIn(elapsedMs) },
        swap: false,
      };
    }
    default: {
      const _never: never = state.phase;
      void _never;
      return { state, swap: false };
    }
  }
}
