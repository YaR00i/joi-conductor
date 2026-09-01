import { useEffect, useId, useState } from "react";
import type { MistressId } from "../lib/mistress/types";
import {
  getActiveMistress,
  subscribeActiveMistress,
} from "../lib/mistress";
import {
  loadSessionFxSettings,
  pickSessionFxCaption,
  sessionFxAnyOn,
  sessionFxCaptionMs,
  sessionFxOpacity,
  sessionFxPopupMs,
  sessionFxPopupPlace,
  sessionFxResolve,
  SESSION_FX_SPIRAL_D,
  SESSION_FX_SPIRAL_VIEWBOX,
  subscribeSessionFx,
  type SessionFxSettings,
} from "../lib/sessionFx";
import "./sessionFx.css";

type Popup = {
  id: number;
  text: string;
  x: number;
  y: number;
  rot: number;
  ms: number;
};

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Sparkle session overlays. User kit in Настройки → Геймплей → Эффекты.
 * Other mistresses still follow pack.fx (usually off).
 */
export function SessionFxOverlay({
  active,
  previewUser = false,
}: {
  active: boolean;
  /** Sandbox lab: drive overlays from user kit even if Sparkle is not selected. */
  previewUser?: boolean;
}) {
  const uid = useId();
  const [mistressId, setMistressId] = useState<MistressId>(
    () => getActiveMistress().id,
  );
  const [packFx, setPackFx] = useState(() => getActiveMistress().fx);
  const [user, setUser] = useState<SessionFxSettings>(() => loadSessionFxSettings());
  const [caption, setCaption] = useState<string | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);

  useEffect(
    () =>
      subscribeActiveMistress((p) => {
        setMistressId(p.id);
        setPackFx(p.fx);
      }),
    [],
  );
  useEffect(() => subscribeSessionFx(() => setUser(loadSessionFxSettings())), []);

  const fx = sessionFxResolve(mistressId, packFx, user, previewUser);
  const show = active && sessionFxAnyOn(fx);
  const quiet = reducedMotion();

  useEffect(() => {
    if (!show || !fx.captions) {
      setCaption(null);
      return;
    }
    let salt = Date.now();
    const tick = () => {
      salt += 17;
      setCaption(pickSessionFxCaption(fx, salt));
    };
    tick();
    const id = window.setInterval(tick, sessionFxCaptionMs(fx.intensity));
    return () => window.clearInterval(id);
  }, [show, fx.captions, fx.theme, fx.mixCaptions, fx.captionsByTheme, fx.intensity]);

  useEffect(() => {
    if (!show || !fx.popups) {
      setPopups([]);
      return;
    }
    let salt = Date.now() + 91;
    let seq = 0;
    let recent: { x: number; y: number }[] = [];
    const timeouts: number[] = [];
    const spawn = () => {
      salt = (salt + 0x9e3779b9) >>> 0;
      seq += 1;
      const id = seq;
      const place = sessionFxPopupPlace(salt, recent);
      recent = [...recent, place].slice(-3);
      const next: Popup = {
        id,
        text: pickSessionFxCaption(fx, salt),
        x: place.x,
        y: place.y,
        rot: place.rot,
        ms: 2200 + fx.intensity * 180,
      };
      setPopups((prev) => [...prev.slice(-4), next]);
      timeouts.push(
        window.setTimeout(() => {
          setPopups((prev) => prev.filter((p) => p.id !== id));
        }, next.ms),
      );
    };
    spawn();
    const id = window.setInterval(spawn, sessionFxPopupMs(fx.intensity));
    return () => {
      window.clearInterval(id);
      for (const t of timeouts) window.clearTimeout(t);
      setPopups([]);
    };
  }, [show, fx.popups, fx.theme, fx.mixCaptions, fx.captionsByTheme, fx.intensity]);

  if (!show) return null;

  const opacity = sessionFxOpacity(fx.intensity);
  const classes = [
    "session-fx",
    `session-fx--${fx.theme}`,
    fx.glitch && !quiet ? "session-fx--glitch" : "",
    fx.pulse && !quiet ? "session-fx--pulse" : "",
    fx.hypno ? "session-fx--hypno" : "",
    fx.artifacts ? "session-fx--artifacts" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={{ ["--session-fx-a" as string]: String(opacity) }}
      aria-hidden
    >
      {fx.hypno ? (
        <div className="session-fx__clip">
          <svg
            className="session-fx__spiral"
            viewBox={SESSION_FX_SPIRAL_VIEWBOX}
            preserveAspectRatio="xMidYMid slice"
          >
            <path d={SESSION_FX_SPIRAL_D} />
          </svg>
        </div>
      ) : null}
      {fx.artifacts ? (
        <>
          <div className="session-fx__scan" />
          <div className="session-fx__grain" />
          <div className="session-fx__chroma" />
          <div className="session-fx__track" />
          <div className="session-fx__track session-fx__track--b" />
        </>
      ) : null}
      {fx.glitch && !quiet ? (
        <>
          <div className="session-fx__split session-fx__split--r" />
          <div className="session-fx__split session-fx__split--c" />
          <div className="session-fx__slice" />
          <div className="session-fx__tear" />
        </>
      ) : null}
      {fx.avatarBar ? <div className="session-fx__censor" /> : null}
      {fx.captions && caption ? (
        <p className="session-fx__caption">
          <span className="session-fx__sway">{caption}</span>
        </p>
      ) : null}
      {fx.popups
        ? popups.map((p) => (
            <span
              key={`${uid}-${p.id}`}
              className="session-fx__popup"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                animationDuration: `${p.ms}ms`,
                transform: `rotate(${p.rot}deg)`,
              }}
            >
              <span
                className="session-fx__sway"
                style={{ animationDelay: `${(p.id % 7) * -0.38}s` }}
              >
                {p.text}
              </span>
            </span>
          ))
        : null}
    </div>
  );
}
