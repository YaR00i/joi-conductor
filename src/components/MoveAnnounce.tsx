import { useEffect, useState } from "react";

type Phase = "typing" | "hold" | "deleting" | "done";

type Props = {
  /** Changes when a new block / ход starts. */
  moveKey: string;
  text: string;
  /** Total visible lifetime before fully gone (ms). */
  lifetimeMs?: number;
};

const TYPE_MS = 38;
const DELETE_MS = 28;
const HOLD_MS = 5000;

/**
 * Typewriter banner above the beat bar: types the move name, holds ~5s, then
 * reverse-types away.
 */
export function MoveAnnounce({
  moveKey,
  text,
  lifetimeMs = HOLD_MS,
}: Props) {
  const [shown, setShown] = useState("");
  const [phase, setPhase] = useState<Phase>("done");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const full = text.trim();
    if (!full || !moveKey) {
      setShown("");
      setPhase("done");
      setVisible(false);
      return;
    }

    let cancelled = false;
    let timer = 0;
    let i = 0;
    setVisible(true);
    setPhase("typing");
    setShown("");

    const typeNext = () => {
      if (cancelled) return;
      i += 1;
      setShown(full.slice(0, i));
      if (i < full.length) {
        timer = window.setTimeout(typeNext, TYPE_MS);
        return;
      }
      setPhase("hold");
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setPhase("deleting");
        const deleteNext = () => {
          if (cancelled) return;
          i -= 1;
          setShown(full.slice(0, Math.max(0, i)));
          if (i > 0) {
            timer = window.setTimeout(deleteNext, DELETE_MS);
            return;
          }
          setPhase("done");
          setVisible(false);
        };
        deleteNext();
      }, lifetimeMs);
    };

    timer = window.setTimeout(typeNext, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [moveKey, text, lifetimeMs]);

  if (!visible && phase === "done") return null;

  return (
    <div
      className={`move-announce${phase === "deleting" ? " is-deleting" : ""}`}
      aria-live="polite"
    >
      <span className="move-announce__label">Ход</span>
      <span className="move-announce__text">
        {shown}
        {phase === "typing" || phase === "deleting" ? (
          <span className="move-announce__caret" aria-hidden>
            |
          </span>
        ) : null}
      </span>
    </div>
  );
}
