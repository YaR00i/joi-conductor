import {
  effectiveBpm,
  hitsForStep,
  type PlannedHit,
} from "./beatSchedule";
import { BEAT_LEAD_IN_MS } from "./beatTiming";
import { getMetronomeContext, scheduleBeatTick } from "./metronome";
import type { BeatPatternDef } from "./types";

export type BeatHandler = (payload: {
  stepIndex: number;
  accent: number;
  bpm: number;
  atMs: number;
}) => void;

/** Skip a hit that is already this late instead of bursting catch-up ticks. */
const SKIP_LATE_MS = 80;

/**
 * Schedules pattern steps on the same absolute timeline as BeatBar
 * (`origin + hitAtMsForStep`). Audio is armed on AudioContext time so the
 * tick does not wait for a late setTimeout.
 */
export class BeatClock {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cancelTick: (() => void) | null = null;
  private pattern: BeatPatternDef | null = null;
  private baseBpm = 60;
  private stepIndex = 0;
  private startedAt = 0;
  private blockElapsedMs = 0;
  private running = false;
  private leadInMs = BEAT_LEAD_IN_MS;
  private untilAtMs: number | null = null;
  private pendingHits: PlannedHit[] = [];
  private onBeat: BeatHandler;

  constructor(onBeat: BeatHandler) {
    this.onBeat = onBeat;
  }

  /**
   * @param originPerf - Absolute performance.now() timeline zero.
   *   May be in the future (handoff gap). First beat at originPerf + leadInMs.
   * @param untilAtMs - Stop scheduling hits after this ms from origin (block end).
   */
  start(
    pattern: BeatPatternDef,
    bpm: number,
    leadInMs = BEAT_LEAD_IN_MS,
    originPerf?: number,
    untilAtMs: number | null = null,
  ): void {
    this.stop();
    this.pattern = pattern;
    this.baseBpm = Math.max(20, bpm);
    this.stepIndex = 0;
    this.startedAt = originPerf ?? performance.now();
    this.blockElapsedMs = performance.now() - this.startedAt;
    this.leadInMs = Math.max(0, leadInMs);
    this.untilAtMs = untilAtMs;
    this.pendingHits = [];
    this.running = true;
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    this.pattern = null;
    this.untilAtMs = null;
    this.pendingHits = [];
    this.clearTimer();
  }

  pause(): void {
    if (!this.running) return;
    this.running = false;
    this.clearTimer();
    this.blockElapsedMs = performance.now() - this.startedAt;
  }

  /**
   * Raise/lower metronome tempo without restarting the timeline.
   * Rebases origin like BeatBar so the next interval is from the last phase,
   * not a full recompute of step 0 at the new BPM.
   */
  setBaseBpm(bpm: number): void {
    const next = Math.max(20, bpm);
    if (next === this.baseBpm) return;
    const now = performance.now();
    const elapsedNow = this.running
      ? now - this.startedAt
      : this.blockElapsedMs;
    const oldInterval = 60_000 / Math.max(20, this.baseBpm);
    const newInterval = 60_000 / next;
    const phase =
      oldInterval > 0 ? (elapsedNow % oldInterval) / oldInterval : 0;
    const beatIndex = Math.floor(Math.max(0, elapsedNow) / oldInterval);
    const rebased = beatIndex * newInterval + phase * newInterval;
    this.baseBpm = next;
    if (this.running) this.startedAt = now - rebased;
    else this.blockElapsedMs = rebased;
    this.pendingHits = [];
    this.stepIndex = Math.max(
      0,
      Math.floor((rebased - this.leadInMs) / newInterval),
    );
    this.clearTimer();
    if (this.running) this.scheduleNext();
  }

  getBaseBpm(): number {
    return this.baseBpm;
  }

  getOriginPerf(): number {
    return this.startedAt;
  }

  /** Tighten (or set) the hit cap without restarting the timeline. */
  setUntilAtMs(untilAtMs: number | null): void {
    if (untilAtMs == null) {
      this.untilAtMs = null;
      return;
    }
    this.untilAtMs =
      this.untilAtMs == null
        ? untilAtMs
        : Math.min(this.untilAtMs, untilAtMs);

    const elapsed = performance.now() - this.startedAt;
    if (elapsed > this.untilAtMs + 1) {
      this.running = false;
      this.clearTimer();
    }
  }

  /** Resume only after pause(); no-op after stop() (pattern cleared). */
  resume(): void {
    if (this.running || !this.pattern) return;
    this.running = true;
    this.startedAt = performance.now() - this.blockElapsedMs;
    this.scheduleNext();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.cancelTick) {
      this.cancelTick();
      this.cancelTick = null;
    }
  }

  private pullNextHit(): PlannedHit | null {
    if (!this.pattern) return null;
    while (this.pendingHits.length === 0) {
      const planned = hitsForStep(
        this.pattern,
        this.baseBpm,
        this.leadInMs,
        this.stepIndex,
      );
      this.stepIndex += 1;
      if (planned.length === 0) {
        if (this.stepIndex > 20_000) return null;
        continue;
      }
      this.pendingHits.push(...planned);
    }
    return this.pendingHits.shift() ?? null;
  }

  private scheduleNext(): void {
    if (!this.running || !this.pattern) return;
    const now = performance.now();

    let hit: PlannedHit | null = this.pullNextHit();
    while (hit) {
      if (this.untilAtMs != null && hit.atMs > this.untilAtMs + 1) {
        this.running = false;
        return;
      }
      const delay = this.startedAt + hit.atMs - now;
      if (delay < -SKIP_LATE_MS) {
        hit = this.pullNextHit();
        continue;
      }
      this.armHit(hit, Math.max(0, delay));
      return;
    }
    this.running = false;
  }

  private armHit(hit: PlannedHit, delayMs: number): void {
    if (!this.pattern) return;
    const bpm = effectiveBpm(
      this.pattern,
      this.baseBpm,
      Math.max(0, hit.atMs - this.leadInMs),
    );
    try {
      const ctx = getMetronomeContext();
      const whenCtx = ctx.currentTime + delayMs / 1000;
      this.cancelTick = scheduleBeatTick(hit.accent, whenCtx);
    } catch {
      this.cancelTick = null;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      this.cancelTick = null;
      if (!this.running || !this.pattern) return;
      this.blockElapsedMs = hit.atMs;
      this.onBeat({
        stepIndex: hit.stepIndex,
        accent: hit.accent,
        bpm,
        atMs: hit.atMs,
      });
      this.scheduleNext();
    }, delayMs);
  }
}
