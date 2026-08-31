import type { BeatPatternDef } from "./types";

export function effectiveBpm(
  pattern: BeatPatternDef | null,
  baseBpm: number,
  blockElapsedMs: number,
): number {
  const bpm = Math.max(20, baseBpm);
  if (!pattern || pattern.kind !== "special") return bpm;

  if (pattern.id === "special_accel") {
    const from = Number(pattern.params?.fromBpmScale ?? 0.7);
    const to = Number(pattern.params?.toBpmScale ?? 1.3);
    const t = Math.min(1, blockElapsedMs / 40000);
    return bpm * (from + (to - from) * t);
  }
  if (pattern.id === "special_half") {
    return bpm * Number(pattern.params?.bpmScale ?? 0.5);
  }
  return bpm;
}

/** Interval after a hit at `atMs` (from origin), using BPM at that instant. */
export function stepIntervalMs(
  pattern: BeatPatternDef,
  baseBpm: number,
  leadInMs: number,
  atMs: number,
): number {
  const patternElapsed = Math.max(0, atMs - leadInMs);
  const bpm = effectiveBpm(pattern, baseBpm, patternElapsed);
  return 60_000 / Math.max(20, bpm);
}

/**
 * Absolute hit time of main pattern step `step` (0-based), ms from origin.
 * `special_accel` integrates per-step intervals; other patterns use a constant interval.
 */
export function hitAtMsForStep(
  pattern: BeatPatternDef,
  baseBpm: number,
  leadInMs: number,
  step: number,
): number {
  const n = Math.max(0, Math.floor(step));
  if (pattern.id === "special_accel") {
    let t = leadInMs;
    for (let i = 0; i < n; i++) {
      t += stepIntervalMs(pattern, baseBpm, leadInMs, t);
    }
    return t;
  }
  const interval = stepIntervalMs(pattern, baseBpm, leadInMs, leadInMs);
  return leadInMs + n * interval;
}

/**
 * Lowest step whose main hit is at or after `atMs`.
 * Accel cannot treat the current (faster) interval as a constant grid —
 * that overestimates the step, drops balls still on the track, and makes
 * remaining hits flash to the right of center.
 */
export function firstStepOnOrAfter(
  pattern: BeatPatternDef,
  baseBpm: number,
  leadInMs: number,
  atMs: number,
): number {
  if (atMs <= leadInMs) return 0;
  if (pattern.id === "special_accel") {
    const slowIv = stepIntervalMs(pattern, baseBpm, leadInMs, leadInMs);
    let step = Math.max(0, Math.floor((atMs - leadInMs) / slowIv) - 2);
    let t = hitAtMsForStep(pattern, baseBpm, leadInMs, step);
    for (let n = 0; n < 20_000 && t + 1 < atMs; n++) {
      t += stepIntervalMs(pattern, baseBpm, leadInMs, t);
      step += 1;
    }
    return step;
  }
  const interval = stepIntervalMs(pattern, baseBpm, leadInMs, leadInMs);
  return Math.max(0, Math.ceil((atMs - leadInMs) / interval));
}

export type PlannedHit = {
  stepIndex: number;
  accent: number;
  /** Block-local ms from origin */
  atMs: number;
};

/** Main step hit plus optional special_double micro-hit. */
export function hitsForStep(
  pattern: BeatPatternDef,
  baseBpm: number,
  leadInMs: number,
  step: number,
): PlannedHit[] {
  const atMs = hitAtMsForStep(pattern, baseBpm, leadInMs, step);
  const accent = accentAtStep(
    pattern,
    step,
    Math.max(0, atMs - leadInMs),
    baseBpm,
  );
  const out: PlannedHit[] = [{ stepIndex: step, accent, atMs }];
  if (pattern.id === "special_double" && accent > 0) {
    const microAt =
      atMs + stepIntervalMs(pattern, baseBpm, leadInMs, atMs) * 0.35;
    out.push({ stepIndex: step, accent: 1, atMs: microAt });
  }
  return out;
}

/** Next planned hit at or after `elapsedFromOrigin` (ms from origin). */
export function nextHitAfter(
  pattern: BeatPatternDef,
  baseBpm: number,
  leadInMs: number,
  elapsedFromOrigin: number,
  untilAtMs: number | null = null,
): PlannedHit | null {
  let step = Math.max(
    0,
    firstStepOnOrAfter(pattern, baseBpm, leadInMs, elapsedFromOrigin) - 2,
  );
  for (let n = 0; n < 80; n++, step++) {
    const hits = hitsForStep(pattern, baseBpm, leadInMs, step);
    for (const hit of hits) {
      if (hit.atMs + 1 < elapsedFromOrigin) continue;
      if (untilAtMs != null && hit.atMs > untilAtMs) return null;
      return hit;
    }
  }
  return null;
}

export function accentAtStep(
  pattern: BeatPatternDef,
  stepIndex: number,
  blockElapsedMs: number,
  baseBpm: number,
): number {
  if (pattern.kind === "meter" && pattern.steps && pattern.steps.length > 0) {
    return pattern.steps[stepIndex % pattern.steps.length] ?? 2;
  }
  if (pattern.id === "special_double") return 2;
  if (pattern.id === "special_tease") {
    const on = Number(pattern.params?.onBeats ?? 2);
    const off = Number(pattern.params?.offBeats ?? 2);
    const cycle = on + off;
    const i = stepIndex % cycle;
    return i < on ? 2 : 1;
  }
  if (pattern.id === "special_rlgl") {
    const green = Number(pattern.params?.greenSecMin ?? 3);
    const red = Number(pattern.params?.redSecMin ?? 2);
    const periodMs = (green + red) * 1000;
    const inPeriod = blockElapsedMs % periodMs;
    return inPeriod < green * 1000 ? 2 : 0;
  }
  if (pattern.id === "special_cluster") {
    const burst = Number(pattern.params?.burstCount ?? 4);
    const pauseSec = Number(pattern.params?.pauseSec ?? 2);
    const bpm = effectiveBpm(pattern, baseBpm, blockElapsedMs);
    const burstMs = (burst / bpm) * 60_000;
    const periodMs = burstMs + pauseSec * 1000;
    const inPeriod = blockElapsedMs % periodMs;
    return inPeriod < burstMs ? 2 : 0;
  }
  return 2;
}

/**
 * End of the currently active pattern cycle, as atMs from beat origin
 * (same timeline as beatUntilAtMs / scheduleWindow).
 */
export function patternCycleEndAtMs(
  pattern: BeatPatternDef,
  baseBpm: number,
  leadInMs: number,
  elapsedFromOrigin: number,
): number {
  const patternElapsed = Math.max(0, elapsedFromOrigin - leadInMs);
  const bpm = effectiveBpm(pattern, baseBpm, patternElapsed);
  const interval = 60_000 / Math.max(20, bpm);

  if (pattern.id === "special_rlgl") {
    const green = Number(pattern.params?.greenSecMin ?? 3);
    const red = Number(pattern.params?.redSecMin ?? 2);
    const periodMs = (green + red) * 1000;
    const cycleEnd =
      (Math.floor(patternElapsed / periodMs) + 1) * periodMs;
    return leadInMs + cycleEnd;
  }

  if (pattern.id === "special_cluster") {
    const burst = Number(pattern.params?.burstCount ?? 4);
    const pauseSec = Number(pattern.params?.pauseSec ?? 2);
    const burstMs = (burst / bpm) * 60_000;
    const periodMs = burstMs + pauseSec * 1000;
    const cycleEnd =
      (Math.floor(patternElapsed / periodMs) + 1) * periodMs;
    return leadInMs + cycleEnd;
  }

  let cycleLen = 1;
  if (pattern.kind === "meter" && pattern.steps && pattern.steps.length > 0) {
    cycleLen = pattern.steps.length;
  } else if (pattern.id === "special_tease") {
    cycleLen =
      Number(pattern.params?.onBeats ?? 2) +
      Number(pattern.params?.offBeats ?? 2);
  } else if (
    pattern.id === "special_accel" ||
    pattern.id === "special_half"
  ) {
    cycleLen = 4;
  }

  const stepIndex =
    elapsedFromOrigin < leadInMs
      ? 0
      : pattern.id === "special_accel"
        ? firstStepOnOrAfter(pattern, baseBpm, leadInMs, elapsedFromOrigin)
        : Math.floor(patternElapsed / interval);
  const cycleEndStep =
    (Math.floor(stepIndex / cycleLen) + 1) * cycleLen - 1;
  let endAt =
    pattern.id === "special_accel"
      ? hitAtMsForStep(pattern, baseBpm, leadInMs, cycleEndStep)
      : leadInMs + cycleEndStep * interval;

  if (pattern.id === "special_double") {
    endAt += interval * 0.35;
  }

  // Already past this cycle's last hit → take the next full cycle.
  if (endAt < elapsedFromOrigin - 8) {
    endAt =
      pattern.id === "special_accel"
        ? hitAtMsForStep(pattern, baseBpm, leadInMs, cycleEndStep + cycleLen)
        : endAt + cycleLen * interval;
  }

  return endAt;
}

export interface ScheduledBeat {
  stepIndex: number;
  accent: number;
  /** Absolute performance.now() when ball should cross hit line */
  hitAt: number;
  /** Block-local ms at hit */
  atMs: number;
}

/**
 * Build upcoming beats for the highway (look-ahead window).
 * Hit times come from hitAtMsForStep — the same timeline BeatClock uses.
 */
export function scheduleWindow(options: {
  pattern: BeatPatternDef;
  baseBpm: number;
  blockStartPerf: number;
  nowPerf: number;
  lookAheadMs: number;
  lookBehindMs: number;
  /** Delay before first hit so balls travel from the right first */
  leadInMs?: number;
  /** Do not schedule hits after this block-local atMs (from origin). */
  untilAtMs?: number | null;
}): ScheduledBeat[] {
  const {
    pattern,
    baseBpm,
    blockStartPerf,
    nowPerf,
    lookAheadMs,
    lookBehindMs,
    leadInMs = 0,
    untilAtMs = null,
  } = options;

  const blockElapsed = Math.max(0, nowPerf - blockStartPerf);
  const interval = stepIntervalMs(
    pattern,
    baseBpm,
    leadInMs,
    Math.max(leadInMs, blockElapsed),
  );

  const windowStart = blockElapsed - lookBehindMs;
  const windowEnd = blockElapsed + lookAheadMs;

  const firstStep = Math.max(
    0,
    firstStepOnOrAfter(pattern, baseBpm, leadInMs, windowStart) - 4,
  );
  const lastStep =
    firstStepOnOrAfter(pattern, baseBpm, leadInMs, windowEnd) + 12;

  const out: ScheduledBeat[] = [];
  for (let step = firstStep; step <= lastStep; step++) {
    const planned = hitsForStep(pattern, baseBpm, leadInMs, step);
    for (const hit of planned) {
      if (hit.atMs < windowStart - interval || hit.atMs > windowEnd + interval) {
        continue;
      }
      if (untilAtMs != null && hit.atMs > untilAtMs) continue;
      out.push({
        stepIndex: hit.stepIndex,
        accent: hit.accent,
        hitAt: blockStartPerf + hit.atMs,
        atMs: hit.atMs,
      });
    }
  }
  return out;
}

/** Map time-to-hit → horizontal % (100 right → 50 center → 0 left) */
export function beatXPercent(msToHit: number, lookAheadMs: number): number {
  // msToHit > 0: approaching from right; 0 at center; < 0 past center to left
  const spawnToHit = lookAheadMs;
  const hitToExit = lookAheadMs * 0.55;
  if (msToHit >= 0) {
    // 0 at center (50%), lookAhead at right (100%)
    const t = Math.min(1, msToHit / spawnToHit);
    return 50 + t * 50;
  }
  // past hit: 0 → exit left
  const t = Math.min(1, -msToHit / hitToExit);
  return 50 - t * 55;
}

/** True when a ball has fully left the track on the left side. */
export function beatFullyExited(msToHit: number, lookAheadMs: number): boolean {
  const hitToExit = lookAheadMs * 0.55;
  return msToHit <= -hitToExit;
}
