import { useEffect, useState } from "react";
import {
  cageIsActive,
  cageRemainingMs,
  clearCageLock,
  formatCageRemaining,
  loadCageLock,
  wearTimerLabelRu,
  type CageLock,
} from "../lib/cageTimer";

/** Titlebar pill for out-of-session wear timer (cage / plug). */
export function CageLockPill() {
  const [lock, setLock] = useState<CageLock | null>(() => loadCageLock());
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const sync = () => {
      const next = loadCageLock();
      if (!cageIsActive(next)) {
        if (next) clearCageLock();
        setLock(null);
        setRemaining(0);
        return;
      }
      setLock(next);
      setRemaining(cageRemainingMs(next!));
    };
    sync();
    const id = window.setInterval(sync, 1000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "joi-conductor.cageLock") sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("joi-cage-lock-changed", sync);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("joi-cage-lock-changed", sync);
    };
  }, []);

  if (!lock || remaining <= 0) return null;

  const label = wearTimerLabelRu(lock.kind);
  const kindClass =
    lock.kind === "plug" ? " cage-lock-pill--plug" : " cage-lock-pill--cage";

  return (
    <div
      className={`cage-lock-pill${kindClass}`}
      title={`${label} ещё ${formatCageRemaining(remaining)}`}
    >
      <span className="cage-lock-pill__icon" aria-hidden>
        {lock.kind === "plug" ? "◆" : "🔒"}
      </span>
      <span className="cage-lock-pill__label">{label}</span>
      <span className="cage-lock-pill__time">{formatCageRemaining(remaining)}</span>
      <button
        type="button"
        className="cage-lock-pill__done"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          clearCageLock();
          setLock(null);
          window.dispatchEvent(new Event("joi-cage-lock-changed"));
        }}
      >
        Снял
      </button>
    </div>
  );
}

export function notifyCageLockChanged(): void {
  window.dispatchEvent(new Event("joi-cage-lock-changed"));
}
