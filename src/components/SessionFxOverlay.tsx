import { useEffect, useState } from "react";
import { getActiveMistress, subscribeActiveMistress } from "../lib/mistress";
import type { MistressSessionFx } from "../lib/mistress/types";

const CAPTIONS = [
  "только анал",
  "в клетке",
  "не думай",
  "фантом",
  "искра",
  "смотри",
  "глубже",
  "тише",
];

/**
 * Sparkle-oriented session overlays. Reads active pack.fx each tick of mistress change.
 */
export function SessionFxOverlay({ active }: { active: boolean }) {
  const [fx, setFx] = useState<MistressSessionFx>(() => getActiveMistress().fx);
  const [caption, setCaption] = useState<string | null>(null);

  useEffect(() => subscribeActiveMistress((p) => setFx(p.fx)), []);

  useEffect(() => {
    if (!active || !fx.floatingCaptions) {
      setCaption(null);
      return;
    }
    const tick = () => {
      setCaption(CAPTIONS[Math.floor(Math.random() * CAPTIONS.length)] ?? null);
    };
    tick();
    const id = window.setInterval(tick, 4200);
    return () => window.clearInterval(id);
  }, [active, fx.floatingCaptions]);

  if (!active) return null;
  if (
    !fx.avatarCensor &&
    !fx.spiralOverlay &&
    !fx.floatingCaptions &&
    !fx.glitchHud
  ) {
    return null;
  }

  return (
    <div
      className={[
        "session-fx",
        fx.glitchHud ? "session-fx--glitch" : "",
        fx.spiralOverlay ? "session-fx--spiral" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      {fx.spiralOverlay ? <div className="session-fx__spiral" /> : null}
      {fx.avatarCensor ? <div className="session-fx__censor" /> : null}
      {fx.floatingCaptions && caption ? (
        <p className="session-fx__caption">{caption}</p>
      ) : null}
    </div>
  );
}
