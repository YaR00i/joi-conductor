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
      : Math.floor(patternElapsed / interval);
  const cycleEndStep =
    (Math.floor(stepIndex / cycleLen) + 1) * cycleLen - 1;
  let endAt = leadInMs + cycleEndStep * interval;

  if (pattern.id === "special_double") {
    endAt += interval * 0.35;
  }

  // Already past this cycle's last hit → take the next full cycle.
  if (endAt < elapsedFromOrigin - 8) {
    endAt += cycleLen * interval;
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
 * Uses constant BPM approximation per window (good enough for meter patterns).
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
  const bpm = effectiveBpm(pattern, baseBpm, Math.max(0, blockElapsed - leadInMs));
  const interval = 60_000 / bpm;

  const windowStart = blockElapsed - lookBehindMs;
  const windowEnd = blockElapsed + lookAheadMs;

  const firstStep = Math.max(0, Math.floor((windowStart - leadInMs) / interval) - 1);
  const lastStep = Math.ceil((windowEnd - leadInMs) / interval) + 2;

  const out: ScheduledBeat[] = [];
  for (let step = firstStep; step <= lastStep; step++) {
    if (step < 0) continue;
    const atMs = leadInMs + step * interval;
    if (atMs < windowStart - interval || atMs > windowEnd + interval) continue;
    if (untilAtMs != null && atMs > untilAtMs) continue;
    const accent = accentAtStep(
      pattern,
      step,
      Math.max(0, atMs - leadInMs),
      baseBpm,
    );
    const hitAt = blockStartPerf + atMs;

    out.push({ stepIndex: step, accent, hitAt, atMs });

    if (pattern.id === "special_double" && accent > 0) {
      const microAt = atMs + interval * 0.35;
      if (untilAtMs == null || microAt <= untilAtMs) {
        out.push({
          stepIndex: step,
          accent: 1,
          hitAt: blockStartPerf + microAt,
          atMs: microAt,
        });
      }
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
