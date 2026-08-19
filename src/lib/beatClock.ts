import { accentAtStep, effectiveBpm } from "./beatSchedule";
import { BEAT_LEAD_IN_MS } from "./beatTiming";
import type { BeatPatternDef } from "./types";

export type BeatHandler = (payload: {
  stepIndex: number;
  accent: number;
  bpm: number;
  atMs: number;
}) => void;

/**
 * Schedules pattern steps at BPM.
 * First beat waits lead-in so the highway can roll balls from the right.
 * Optional originPerf locks the timeline to the visual BeatBar.
 */
export class BeatClock {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pattern: BeatPatternDef | null = null;
  private baseBpm = 60;
  private stepIndex = 0;
  private startedAt = 0;
  private blockElapsedMs = 0;
  private running = false;
  private awaitingFirst = true;
  private leadInMs = BEAT_LEAD_IN_MS;
  private untilAtMs: number | null = null;
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
    this.awaitingFirst = true;
    this.leadInMs = Math.max(0, leadInMs);
    this.untilAtMs = untilAtMs;
    this.running = true;
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    this.pattern = null;
    this.awaitingFirst = true;
    this.untilAtMs = null;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  pause(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.blockElapsedMs = performance.now() - this.startedAt;
  }

  /** Raise/lower metronome tempo without restarting the timeline. */
  setBaseBpm(bpm: number): void {
    this.baseBpm = Math.max(20, bpm);
  }

  getBaseBpm(): number {
    return this.baseBpm;
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
      if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    }
  }

  /** Resume only after pause(); no-op after stop() (pattern cleared). */
  resume(): void {
    if (this.running || !this.pattern) return;
    this.running = true;
    this.startedAt = performance.now() - this.blockElapsedMs;
    this.scheduleNext();
  }

  private scheduleNext(): void {
    if (!this.running || !this.pattern) return;
    const now = performance.now();
    const elapsed = now - this.startedAt;
    const bpm = effectiveBpm(
      this.pattern,
      this.baseBpm,
      Math.max(0, elapsed - this.leadInMs),
    );
    const intervalMs = 60_000 / bpm;

    let nextAtMs: number;
    if (this.awaitingFirst) {
      nextAtMs = this.leadInMs;
    } else {
      // Approximate next step time from current elapsed (same model as highway).
      nextAtMs = elapsed + intervalMs;
    }

    if (this.untilAtMs != null && nextAtMs > this.untilAtMs + 1) {
      this.running = false;
      return;
    }

    const delay = this.awaitingFirst
      ? Math.max(0, this.leadInMs - elapsed)
      : intervalMs;

    this.timer = setTimeout(() => {
      if (!this.running || !this.pattern) return;
      this.awaitingFirst = false;
      this.blockElapsedMs = performance.now() - this.startedAt;

      if (this.untilAtMs != null && this.blockElapsedMs > this.untilAtMs + 1) {
        this.running = false;
        return;
      }

      const accent = accentAtStep(
        this.pattern,
        this.stepIndex,
        Math.max(0, this.blockElapsedMs - this.leadInMs),
        this.baseBpm,
      );
      const stepIndex = this.stepIndex;
      this.stepIndex += 1;

      if (this.pattern.id === "special_double" && accent > 0) {
        this.onBeat({
          stepIndex,
          accent,
          bpm,
          atMs: this.blockElapsedMs,
        });
        const microAt = this.blockElapsedMs + intervalMs * 0.35;
        if (this.untilAtMs == null || microAt <= this.untilAtMs + 1) {
          setTimeout(() => {
            if (!this.running) return;
            this.onBeat({
              stepIndex,
              accent: 1,
              bpm,
              atMs: performance.now() - this.startedAt,
            });
          }, intervalMs * 0.35);
        }
      } else {
        this.onBeat({
          stepIndex,
          accent,
          bpm,
          atMs: this.blockElapsedMs,
        });
      }
      this.scheduleNext();
    }, delay);
  }
}
