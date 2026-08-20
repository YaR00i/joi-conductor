import { useEffect, useRef, useState } from "react";
import {
  beatFullyExited,
  beatXPercent,
  scheduleWindow,
  type ScheduledBeat,
} from "../lib/beatSchedule";
import {
  BEAT_LEAD_IN_MS,
  BEAT_LOOK_AHEAD_MS,
  BEAT_LOOK_BEHIND_MS,
} from "../lib/beatTiming";
import type { BeatPatternDef } from "../lib/types";

export interface BeatBarProps {
  /** Unique per session block — triggers handoff even if pattern/BPM match. */
  blockKey: string;
  pattern: BeatPatternDef | null;
  bpm: number;
  active: boolean;
  paused: boolean;
  silent?: boolean;
  /**
   * Shared timeline zero with BeatClock (`performance.now()`).
   * First hit at beatOriginPerf + BEAT_LEAD_IN_MS. Preferred over handoffDelayMs.
   */
  beatOriginPerf?: number | null;
  /** Last hit atMs from origin; null = open-ended (edge/hold). */
  beatUntilAtMs?: number | null;
  /** Fallback gap when beatOriginPerf is missing (legacy). */
  handoffDelayMs?: number;
  hitSeq?: number;
  patternLabel?: string;
  timeLabel?: string;
  /** Upcoming block name — shown so the next handoff is visible. */
  nextLabel?: string | null;
}

interface BallView {
  key: string;
  accent: number;
  x: number;
  hitting: boolean;
}

interface CarryBall {
  key: string;
  accent: number;
  hitAt: number;
}

/**
 * Beat highway. On block change:
 * - old balls keep exiting left
 * - new block arms at the same handoff time as the metronome (not after exit)
 *   so visuals stay in sync with audio
 */
export function BeatBar({
  blockKey,
  pattern,
  bpm,
  active,
  paused,
  silent = false,
  beatOriginPerf = null,
  beatUntilAtMs = null,
  handoffDelayMs = 0,
  hitSeq = 0,
  patternLabel,
  timeLabel,
  nextLabel = null,
}: BeatBarProps) {
  const [balls, setBalls] = useState<BallView[]>([]);
  const [flash, setFlash] = useState(false);

  const propsRef = useRef({
    blockKey,
    pattern,
    bpm,
    active,
    paused,
    silent,
    beatOriginPerf,
    beatUntilAtMs,
    handoffDelayMs,
  });
  propsRef.current = {
    blockKey,
    pattern,
    bpm,
    active,
    paused,
    silent,
    beatOriginPerf,
    beatUntilAtMs,
    handoffDelayMs,
  };

  const originRef = useRef(0);
  const frozenElapsedRef = useRef(0);
  const livePatternRef = useRef<BeatPatternDef | null>(null);
  const liveBpmRef = useRef(bpm);
  const liveBlockRef = useRef("");
  const exitingRef = useRef<CarryBall[]>([]);
  const pendingRef = useRef<{
    blockKey: string;
    pattern: BeatPatternDef;
    bpm: number;
    /** Absolute time when live schedule + metronome should start */
    startAt: number;
  } | null>(null);
  const lastScheduleRef = useRef<ScheduledBeat[]>([]);
  const lastHitKeys = useRef(new Set<string>());
  const rafRef = useRef(0);
  const flashTimer = useRef(0);
  const wasPausedRef = useRef(false);

  useEffect(() => {
    if (!hitSeq || pendingRef.current) return;
    setFlash(true);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), 120);
  }, [hitSeq]);

  useEffect(() => {
    if (!active) {
      exitingRef.current = [];
      pendingRef.current = null;
      livePatternRef.current = null;
      liveBlockRef.current = "";
      lastScheduleRef.current = [];
      lastHitKeys.current.clear();
      setBalls([]);
      return;
    }

    const snapshotExiting = (now: number): CarryBall[] =>
      lastScheduleRef.current
        .map((b) => {
          const msToHit = b.hitAt - now;
          return {
            key: `x-${b.stepIndex}-${Math.round(b.atMs)}-${b.accent}`,
            accent: b.accent,
            hitAt: b.hitAt,
            done: beatFullyExited(msToHit, BEAT_LOOK_AHEAD_MS),
          };
        })
        .filter((b) => !b.done)
        .map(({ key, accent, hitAt }) => ({ key, accent, hitAt }));

    const startLive = (
      key: string,
      next: BeatPatternDef,
      nextBpm: number,
      originAt: number,
    ) => {
      liveBlockRef.current = key;
      livePatternRef.current = next;
      liveBpmRef.current = nextBpm;
      // Anchor to the planned handoff instant so we match the metronome
      // even if this frame runs a few ms late.
      originRef.current = originAt;
      frozenElapsedRef.current = 0;
      lastHitKeys.current.clear();
      lastScheduleRef.current = [];
      pendingRef.current = null;
    };

    const tick = () => {
      const p = propsRef.current;
      const now = performance.now();

      // —— Block change / silence ——
      if (p.silent || !p.pattern) {
        if (liveBlockRef.current && liveBlockRef.current !== "") {
          exitingRef.current = [
            ...exitingRef.current,
            ...snapshotExiting(now),
          ];
          livePatternRef.current = null;
          liveBlockRef.current = "";
          pendingRef.current = null;
          lastScheduleRef.current = [];
        }
      } else if (p.blockKey !== liveBlockRef.current) {
        const alreadyPending =
          pendingRef.current?.blockKey === p.blockKey;
        if (!alreadyPending && liveBlockRef.current) {
          // Handoff from a previous live block — lock to shared clock origin
          exitingRef.current = [
            ...exitingRef.current,
            ...snapshotExiting(now),
          ];
          livePatternRef.current = null;
          lastScheduleRef.current = [];
          const startAt =
            typeof p.beatOriginPerf === "number"
              ? p.beatOriginPerf
              : now + Math.max(0, p.handoffDelayMs);
          pendingRef.current = {
            blockKey: p.blockKey,
            pattern: p.pattern,
            bpm: p.bpm,
            startAt,
          };
          // Prevent re-queueing every frame
          liveBlockRef.current = `__pending__:${p.blockKey}`;
        } else if (!alreadyPending && !liveBlockRef.current) {
          // First block — same origin as metronome when available
          const origin =
            typeof p.beatOriginPerf === "number" ? p.beatOriginPerf : now;
          startLive(p.blockKey, p.pattern, p.bpm, origin);
        } else if (pendingRef.current) {
          pendingRef.current = {
            ...pendingRef.current,
            pattern: p.pattern,
            bpm: p.bpm,
            startAt:
              typeof p.beatOriginPerf === "number"
                ? p.beatOriginPerf
                : pendingRef.current.startAt,
          };
        }
      }

      // —— Arm new live on the same beat as metronome gap ——
      const pending = pendingRef.current;
      if (
        pending &&
        now >= pending.startAt &&
        !p.silent &&
        p.pattern
      ) {
        startLive(
          pending.blockKey,
          pending.pattern,
          pending.bpm,
          pending.startAt,
        );
      }

      // —— Exiting (old) balls ——
      const exitViews: BallView[] = [];
      const stillExit: CarryBall[] = [];
      for (const c of exitingRef.current) {
        const msToHit = c.hitAt - now;
        if (beatFullyExited(msToHit, BEAT_LOOK_AHEAD_MS)) continue;
        stillExit.push(c);
        exitViews.push({
          key: c.key,
          accent: c.accent,
          x: beatXPercent(msToHit, BEAT_LOOK_AHEAD_MS),
          hitting: false,
        });
      }
      exitingRef.current = stillExit;

      // —— Live balls ——
      const liveViews: BallView[] = [];
      if (livePatternRef.current) {
        if (p.paused && !wasPausedRef.current) {
          frozenElapsedRef.current = now - originRef.current;
        } else if (!p.paused && wasPausedRef.current) {
          originRef.current = now - frozenElapsedRef.current;
        }
        wasPausedRef.current = p.paused;

        // Chase BPM ramp: keep highway on the same tempo as BeatClock.setBaseBpm
        if (
          p.blockKey === liveBlockRef.current &&
          Number.isFinite(p.bpm) &&
          p.bpm > 0 &&
          p.bpm !== liveBpmRef.current
        ) {
          const oldBpm = liveBpmRef.current;
          const elapsedNow = p.paused
            ? frozenElapsedRef.current
            : now - originRef.current;
          const oldInterval = 60_000 / Math.max(20, oldBpm);
          const newInterval = 60_000 / Math.max(20, p.bpm);
          const phase = (elapsedNow % oldInterval) / oldInterval;
          const beatIndex = Math.floor(elapsedNow / oldInterval);
          const rebased = beatIndex * newInterval + phase * newInterval;
          liveBpmRef.current = p.bpm;
          if (p.paused) {
            frozenElapsedRef.current = rebased;
          } else {
            originRef.current = now - rebased;
          }
        }

        const elapsed = p.paused
          ? frozenElapsedRef.current
          : now - originRef.current;
        const blockStartPerf = now - elapsed;
        const simNow = p.paused ? blockStartPerf + elapsed : now;

        const scheduled = scheduleWindow({
          pattern: livePatternRef.current,
          baseBpm: liveBpmRef.current,
          blockStartPerf,
          nowPerf: simNow,
          lookAheadMs: BEAT_LOOK_AHEAD_MS,
          lookBehindMs: BEAT_LOOK_BEHIND_MS,
          leadInMs: BEAT_LEAD_IN_MS,
          untilAtMs: p.beatUntilAtMs,
        });
        lastScheduleRef.current = scheduled;

        for (const b of scheduled) {
          const msToHit = b.hitAt - simNow;
          if (msToHit > BEAT_LOOK_AHEAD_MS + 50) continue;
          if (beatFullyExited(msToHit, BEAT_LOOK_AHEAD_MS)) continue;
          const x = beatXPercent(msToHit, BEAT_LOOK_AHEAD_MS);
          if (x > 106) continue;
          const key = `${b.stepIndex}-${Math.round(b.atMs)}-${b.accent}`;
          const hitting = Math.abs(msToHit) < 55;
          if (hitting && b.accent > 0 && !lastHitKeys.current.has(key)) {
            lastHitKeys.current.add(key);
            setFlash(true);
            window.clearTimeout(flashTimer.current);
            flashTimer.current = window.setTimeout(() => setFlash(false), 100);
          }
          liveViews.push({ key, accent: b.accent, x, hitting });
        }
      } else {
        wasPausedRef.current = p.paused;
      }

      setBalls([...exitViews, ...liveViews]);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(flashTimer.current);
    };
  }, [active]);

  return (
    <div
      className={[
        "beat-bar",
        active && !silent ? "is-live" : "",
        flash ? "is-flash" : "",
        paused ? "is-paused" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="beat-bar__track">
        <div className="beat-bar__rail" />
        <div className="beat-bar__hit">
          <div className="beat-bar__triangle" />
        </div>
        {balls.map((b) => (
          <div
            key={b.key}
            className={[
              "beat-bar__ball",
              b.accent >= 2 ? "is-strong" : "",
              b.accent === 1 ? "is-soft" : "",
              b.accent <= 0 ? "is-stop" : "",
              b.hitting ? "is-hit" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ left: `${b.x}%` }}
          />
        ))}
      </div>
      <div className="beat-bar__meta">
        <span>{patternLabel ?? "—"}</span>
        {nextLabel ? <span className="beat-bar__next">{nextLabel}</span> : null}
        <span>{timeLabel ?? "00:00"}</span>
      </div>
    </div>
  );
}
