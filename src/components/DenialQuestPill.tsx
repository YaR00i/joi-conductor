import { useEffect, useState } from "react";
import {
  clearDenialQuest,
  denialEdgesComplete,
  denialIsActive,
  denialRemainingMs,
  formatDenialRemaining,
  loadDenialQuest,
  reportDenialEdge,
  type DenialQuest,
} from "../lib/denialQuest";

/** Titlebar pill for post-session denial / no-touch quest. */
export function DenialQuestPill() {
  const [quest, setQuest] = useState<DenialQuest | null>(() =>
    loadDenialQuest(),
  );
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const sync = () => {
      const next = loadDenialQuest();
      if (!denialIsActive(next)) {
        if (next) clearDenialQuest();
        setQuest(null);
        setRemaining(0);
        return;
      }
      setQuest(next);
      setRemaining(denialRemainingMs(next!));
    };
    sync();
    const id = window.setInterval(sync, 1000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "joi-conductor.denialQuest") sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("joi-denial-quest-changed", sync);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("joi-denial-quest-changed", sync);
    };
  }, []);

  if (!quest || remaining <= 0) return null;

  const edgesDone = denialEdgesComplete(quest);

  return (
    <div
      className="cage-lock-pill cage-lock-pill--denial"
      title={`Denial ещё ${formatDenialRemaining(remaining)}`}
    >
      <span className="cage-lock-pill__icon" aria-hidden>
        ◇
      </span>
      <span className="cage-lock-pill__label">Denial</span>
      <span className="cage-lock-pill__time">
        {formatDenialRemaining(remaining)}
        {quest.edgesTarget > 0
          ? ` · ${quest.edgesDone}/${quest.edgesTarget}`
          : ""}
      </span>
      {quest.edgesTarget > 0 && !edgesDone ? (
        <button
          type="button"
          className="cage-lock-pill__done"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const next = reportDenialEdge();
            setQuest(next);
            window.dispatchEvent(new Event("joi-denial-quest-changed"));
          }}
        >
          Эдж ✓
        </button>
      ) : null}
      <button
        type="button"
        className="cage-lock-pill__done"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          clearDenialQuest();
          setQuest(null);
          window.dispatchEvent(new Event("joi-denial-quest-changed"));
        }}
      >
        Снять задание без выполнения
      </button>
    </div>
  );
}

export function notifyDenialQuestChanged(): void {
  window.dispatchEvent(new Event("joi-denial-quest-changed"));
}
