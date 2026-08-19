import { useEffect, useRef, useState } from "react";
import { CUM_BOOST_DELTA } from "../../lib/wallet";

function CindersGlyph() {
  return (
    <svg
      className="session__cinders-icon"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <defs>
        <radialGradient id="cinder-core" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ffe0a8" />
          <stop offset="45%" stopColor="#ff8a4a" />
          <stop offset="100%" stopColor="#7a2410" />
        </radialGradient>
      </defs>
      <path
        d="M12 2.8c1.4 2.2 2.1 4 2.1 5.6 0 1.7-1 3-2.1 3-1.2 0-2.1-1.3-2.1-3 0-1.6.7-3.4 2.1-5.6Z"
        fill="url(#cinder-core)"
        opacity="0.95"
      />
      <path
        d="M7.2 9.2c1.8 1.1 2.9 2.4 3.2 4 .3 1.6-.5 3-1.6 3.4-1.2.4-2.5-.6-2.9-2.2-.4-1.6.1-3.6 1.3-5.2Z"
        fill="#ff6a35"
        opacity="0.9"
      />
      <path
        d="M16.8 9.2c-1.8 1.1-2.9 2.4-3.2 4-.3 1.6.5 3 1.6 3.4 1.2.4 2.5-.6 2.9-2.2.4-1.6-.1-3.6-1.3-5.2Z"
        fill="#ff9a55"
        opacity="0.85"
      />
      <ellipse cx="12" cy="18.4" rx="6.2" ry="2.4" fill="#3a1510" opacity="0.55" />
      <path
        d="M8.4 15.2c1.1 1.6 2.3 2.5 3.6 2.5s2.5-.9 3.6-2.5c-1 .9-2.2 1.4-3.6 1.4s-2.6-.5-3.6-1.4Z"
        fill="#ffb070"
        opacity="0.75"
      />
    </svg>
  );
}

function useAnimatedCinders(target: number, durationMs = 700): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  shownRef.current = shown;

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(from + (target - from) * eased);
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return shown;
}

export function SessionShopStrip({
  cindersBalance,
  begBonus,
  cumBoost,
  cinderGain,
}: {
  cindersBalance: number;
  begBonus: number;
  cumBoost: number;
  cinderGain?: { key: number; amount: number; source: "quest" | "session" } | null;
}) {
  const display = useAnimatedCinders(cindersBalance);
  const [pulseKey, setPulseKey] = useState(0);
  const [floatAmt, setFloatAmt] = useState<number | null>(null);

  useEffect(() => {
    if (!cinderGain || cinderGain.amount <= 0) return;
    setPulseKey(cinderGain.key);
    setFloatAmt(cinderGain.amount);
    const t = window.setTimeout(() => setFloatAmt(null), 1400);
    return () => window.clearTimeout(t);
  }, [cinderGain]);

  const buffs: { id: string; label: string; title: string }[] = [];
  if (begBonus > 0) {
    buffs.push({
      id: "beg",
      label: `Лишняя мольба +${begBonus}`,
      title: `+${begBonus} beg-кредит на эту сессию`,
    });
  }
  if (cumBoost > 0) {
    const pct = Math.round(CUM_BOOST_DELTA * 100) * cumBoost;
    buffs.push({
      id: "cum",
      label: `Шанс кончить ↑ ×${cumBoost}`,
      title: `+${pct}% к pCum на эту сессию`,
    });
  }

  return (
    <div className="session__shop-strip" aria-label="Угольки и бафы">
      <div
        className={`session__cinders${pulseKey > 0 ? " is-gaining" : ""}`}
        title="Угольки"
        key={pulseKey > 0 ? `pulse-${pulseKey}` : "idle"}
      >
        <CindersGlyph />
        <span className="session__cinders-num">{display}</span>
        {floatAmt != null ? (
          <span className="session__cinders-float" aria-live="polite">
            +{floatAmt}
          </span>
        ) : null}
      </div>
      {buffs.length > 0 ? (
        <ul className="session__buffs">
          {buffs.map((b) => (
            <li
              key={b.id}
              className="session__buff session__buff--active"
              title={b.title}
            >
              <span className="session__buff-tag">Бонус</span>
              {b.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
