export const RUNTIME_REFLECTION_INTERVAL_MS = 1000 / 30;
/** A moving planar mirror stays fluid without rendering a second scene at 200 Hz. */
export const MOVING_REFLECTION_INTERVAL_MS = 1000 / 60;
export const STRESS_REFLECTION_INTERVAL_MS = 500;
export const STRESS_MOVING_REFLECTION_INTERVAL_MS = 1000 / 30;
export const STRESS_REFLECTION_CROWD_CUTOFF = 160;

/**
 * The planar mirror is a second render of nearly the whole scene. Keep normal
 * play responsive, but degrade its cadence during synthetic/extreme crowds so
 * reflection work cannot consume every render frame.
 */
export function runtimeReflectionIntervalMs(
  crowdSize: number,
  cameraMoved = false,
): number {
  if (cameraMoved) {
    return crowdSize >= STRESS_REFLECTION_CROWD_CUTOFF
      ? STRESS_MOVING_REFLECTION_INTERVAL_MS
      : MOVING_REFLECTION_INTERVAL_MS;
  }
  return crowdSize >= STRESS_REFLECTION_CROWD_CUTOFF
    ? STRESS_REFLECTION_INTERVAL_MS
    : RUNTIME_REFLECTION_INTERVAL_MS;
}

/**
 * Advance from the previous cadence deadline instead of resetting to `now`.
 * At 85 FPS a naive 60 Hz interval otherwise fires every second frame (42.5
 * Hz). Keeping at most one interval of debt produces the intended 60 Hz
 * 1/2-frame pattern without running a long catch-up burst after a hitch.
 */
export function advanceRuntimeReflectionClock(
  nowMs: number,
  previousClockMs: number,
  intervalMs: number,
): number {
  if (!Number.isFinite(previousClockMs) || intervalMs <= 0) return nowMs;
  return Math.max(nowMs - intervalMs, previousClockMs + intervalMs);
}

export function shouldRenderRuntimeReflection(
  nowMs: number,
  lastRenderMs: number,
  crowdSize: number,
  cameraMoved = false,
): boolean {
  return (
    nowMs - lastRenderMs >=
    runtimeReflectionIntervalMs(crowdSize, cameraMoved)
  );
}
