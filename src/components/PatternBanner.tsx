import { useEffect, useState } from "react";

interface PatternBannerProps {
  patternId: string | undefined;
  /** Last beat accent: 0 = silent/red/pause, >0 = active */
  lastAccent: number;
  active: boolean;
}

/** Phase 2 special-pattern HUD: RLGL + cluster pause + brief tease flash. */
export function PatternBanner({
  patternId,
  lastAccent,
  active,
}: PatternBannerProps) {
  const [teaseFlash, setTeaseFlash] = useState(false);

  useEffect(() => {
    if (!active || patternId !== "special_tease") {
      setTeaseFlash(false);
      return;
    }
    // Soft beats only (accent 1) — brief cue, not a sticky panel.
    if (lastAccent !== 1) {
      setTeaseFlash(false);
      return;
    }
    setTeaseFlash(true);
    const id = window.setTimeout(() => setTeaseFlash(false), 750);
    return () => window.clearTimeout(id);
  }, [active, patternId, lastAccent]);

  if (!active || !patternId) return null;

  if (patternId === "special_rlgl") {
    const go = lastAccent > 0;
    return (
      <div
        className={`pattern-banner pattern-banner--rlgl ${go ? "is-green" : "is-red"}`}
        aria-live="polite"
      >
        <span className="pattern-banner__label">{go ? "ХОДИ" : "СТОП"}</span>
        <span className="pattern-banner__sub">
          {go ? "зелёный — в такт" : "красный — руки прочь"}
        </span>
      </div>
    );
  }

  if (patternId === "special_cluster" && lastAccent === 0) {
    return (
      <div className="pattern-banner pattern-banner--cluster" aria-live="polite">
        <span className="pattern-banner__label">ПАУЗА</span>
        <span className="pattern-banner__sub">cluster — жди вспышку</span>
      </div>
    );
  }

  if (patternId === "special_tease" && teaseFlash) {
    return (
      <div className="pattern-banner pattern-banner--tease" aria-live="polite">
        <span className="pattern-banner__label">ЕДВА</span>
        <span className="pattern-banner__sub">едва касайся</span>
      </div>
    );
  }

  return null;
}
