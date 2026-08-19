import type { VibeLevel, VibeProfileDef, VibeSegment } from "./types";

export type VibeHandler = (payload: {
  level: VibeLevel;
  labelRu: string;
  segmentIndex: number;
  segmentDurationSec: number;
  profileId: string;
  atMs: number;
}) => void;

/**
 * Time + intensity driver for vibe toys (no metronome).
 * Segments run sequentially; pause/resume freezes the current segment timer.
 */
export class VibeClock {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private segments: VibeSegment[] = [];
  private profileId = "";
  private index = 0;
  private startedAt = 0;
  private elapsedBeforePause = 0;
  private segmentStartedAt = 0;
  private segmentElapsedBeforePause = 0;
  private running = false;
  private onLevel: VibeHandler;

  constructor(onLevel: VibeHandler) {
    this.onLevel = onLevel;
  }

  start(profile: VibeProfileDef, blockDurationSec: number): void {
    this.stop();
    this.profileId = profile.id;
    this.segments = fitSegmentsToDuration(profile.segments, blockDurationSec);
    this.index = 0;
    this.startedAt = performance.now();
    this.elapsedBeforePause = 0;
    this.segmentElapsedBeforePause = 0;
    this.running = true;
    this.enterSegment(0);
  }

  stop(): void {
    this.running = false;
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
    this.segmentElapsedBeforePause =
      performance.now() - this.segmentStartedAt;
    this.elapsedBeforePause = performance.now() - this.startedAt;
  }

  resume(): void {
    if (this.running || this.segments.length === 0) return;
    this.running = true;
    this.startedAt = performance.now() - this.elapsedBeforePause;
    this.segmentStartedAt =
      performance.now() - this.segmentElapsedBeforePause;
    const seg = this.segments[this.index];
    if (!seg) return;
    const left = Math.max(
      0,
      seg.durationSec * 1000 - this.segmentElapsedBeforePause,
    );
    this.timer = setTimeout(() => this.advance(), left);
  }

  private enterSegment(index: number): void {
    if (!this.running) return;
    if (index >= this.segments.length) {
      this.running = false;
      return;
    }
    this.index = index;
    const seg = this.segments[index]!;
    this.segmentStartedAt = performance.now();
    this.segmentElapsedBeforePause = 0;
    this.onLevel({
      level: seg.level,
      labelRu: seg.labelRu,
      segmentIndex: index,
      segmentDurationSec: seg.durationSec,
      profileId: this.profileId,
      atMs: performance.now() - this.startedAt,
    });
    this.timer = setTimeout(() => this.advance(), seg.durationSec * 1000);
  }

  private advance(): void {
    if (!this.running) return;
    this.enterSegment(this.index + 1);
  }
}

/** Stretch / loop segments to fill block duration. */
export function fitSegmentsToDuration(
  segments: VibeSegment[],
  blockDurationSec: number,
): VibeSegment[] {
  if (segments.length === 0 || blockDurationSec <= 0) {
    return [{ durationSec: blockDurationSec, level: 1, labelRu: "фон" }];
  }
  const base = segments.reduce((s, x) => s + x.durationSec, 0);
  if (base <= 0) {
    return [{ durationSec: blockDurationSec, level: 2, labelRu: "средне" }];
  }
  const out: VibeSegment[] = [];
  let filled = 0;
  let i = 0;
  while (filled < blockDurationSec) {
    const src = segments[i % segments.length]!;
    const remaining = blockDurationSec - filled;
    const dur = Math.min(src.durationSec, remaining);
    out.push({ ...src, durationSec: dur });
    filled += dur;
    i += 1;
    if (i > segments.length * 20) break;
  }
  return out;
}
