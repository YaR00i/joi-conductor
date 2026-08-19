import { useEffect, useRef, useState } from "react";
import { beatXPercent, scheduleWindow } from "../lib/beatSchedule";
import type { BeatPatternDef } from "../lib/types";

const LOOK_AHEAD_MS = 2200;
const LOOK_BEHIND_MS = 900;

export interface BeatHighwayProps {
  pattern: BeatPatternDef | null;
  bpm: number;
  active: boolean;
  paused: boolean;
  silent?: boolean;
  hitSeq?: number;
  hitAccent?: number;
}

interface BallView {
  key: string;
  accent: number;
  x: number;
  hitting: boolean;
}

/**
 * Cock-Hero style beat meter: balls travel right → left, trigger at center.
 */
export function BeatHighway({
  pattern,
  bpm,
  active,
  paused,
  silent = false,
  hitSeq = 0,
}: BeatHighwayProps) {
  const [balls, setBalls] = useState<BallView[]>([]);
  const [flash, setFlash] = useState(false);

  /** performance.now() anchor → block elapsed 0 */
  const originRef = useRef(0);
  /** Frozen elapsed while paused */
  const frozenElapsedRef = useRef(0);
  const lastHitKeys = useRef(new Set<string>());
  const rafRef = useRef(0);
  const flashTimer = useRef(0);

  useEffect(() => {
    if (!hitSeq) return;
    setFlash(true);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), 130);
  }, [hitSeq]);

  // New block / start
  useEffect(() => {
    if (!active || !pattern || silent) {
      setBalls([]);
      lastHitKeys.current.clear();
      return;
    }
    originRef.current = performance.now();
    frozenElapsedRef.current = 0;
    lastHitKeys.current.clear();
  }, [active, pattern?.id, bpm, silent]);

  // Capture elapsed when pausing
  useEffect(() => {
    if (!active || !pattern || silent) return;
    if (paused) {
      frozenElapsedRef.current = performance.now() - originRef.current;
    } else {
      originRef.current = performance.now() - frozenElapsedRef.current;
    }
  }, [paused, active, pattern, silent]);

  useEffect(() => {
    if (!active || !pattern || silent) {
      setBalls([]);
      return;
    }

    const tick = () => {
      const elapsed = paused
        ? frozenElapsedRef.current
        : performance.now() - originRef.current;
      const blockStartPerf = performance.now() - elapsed;
      const nowPerf = performance.now();

      // When paused, pretend "now" is frozen at blockStart + elapsed
      const simNow = paused ? blockStartPerf + elapsed : nowPerf;

      const scheduled = scheduleWindow({
        pattern,
        baseBpm: bpm,
        blockStartPerf,
        nowPerf: simNow,
        lookAheadMs: LOOK_AHEAD_MS,
        lookBehindMs: LOOK_BEHIND_MS,
      });

      const next: BallView[] = [];
      for (const b of scheduled) {
        const msToHit = b.hitAt - simNow;
        const x = beatXPercent(msToHit, LOOK_AHEAD_MS);
        if (x < -8 || x > 108) continue;
        const key = `${b.stepIndex}-${Math.round(b.atMs)}-${b.accent}`;
        const hitting = Math.abs(msToHit) < 60;
        if (hitting && b.accent > 0 && !lastHitKeys.current.has(key)) {
          lastHitKeys.current.add(key);
          setFlash(true);
          window.clearTimeout(flashTimer.current);
          flashTimer.current = window.setTimeout(() => setFlash(false), 110);
        }
        next.push({ key, accent: b.accent, x, hitting });
      }
      setBalls(next);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(flashTimer.current);
    };
  }, [active, paused, pattern, bpm, silent]);

  return (
    <div
      className={[
        "beat-highway",
        active && !silent ? "is-live" : "",
        flash ? "is-flash" : "",
        paused ? "is-paused" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Ритм: шарики едут справа налево, удар по центральной линии"
    >
      <div className="beat-highway__labels">
        <span className="beat-highway__label-hit">удар</span>
        <span className="beat-highway__hint">паттерн заранее →</span>
      </div>

      <div className="beat-highway__track">
        <div className="beat-highway__rail" />
        <div className="beat-highway__hit" aria-hidden>
          <div className="beat-highway__hit-glow" />
          <div className="beat-highway__hit-line" />
        </div>

        {balls.map((b) => (
          <div
            key={b.key}
            className={[
              "beat-ball",
              b.accent >= 2 ? "beat-ball--strong" : "",
              b.accent === 1 ? "beat-ball--soft" : "",
              b.accent <= 0 ? "beat-ball--stop" : "",
              b.hitting ? "beat-ball--hit" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ left: `${b.x}%` }}
          />
        ))}

        {!active || silent ? (
          <div className="beat-highway__idle">
            {silent
              ? "Без бита в этом блоке"
              : "Нажми «Старт» — шарики поедут справа налево"}
          </div>
        ) : null}
      </div>

      <div className="beat-highway__legend">
        <span>
          <i className="beat-dot beat-dot--strong" /> сильная
        </span>
        <span>
          <i className="beat-dot beat-dot--soft" /> слабая
        </span>
        <span>
          <i className="beat-dot beat-dot--stop" /> стоп
        </span>
      </div>
    </div>
  );
}
