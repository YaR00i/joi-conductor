import { useEffect, useState } from "react";
import {
  loadSessionFxSettings,
  patchSessionFxSettings,
  sessionFxThemeLabelRu,
  SESSION_FX_THEMES,
  subscribeSessionFx,
  type SessionFxSettings,
  type SessionFxTheme,
} from "../lib/sessionFx";
import "./sessionFx.css";

const LAYERS: {
  key:
    | "hypno"
    | "artifacts"
    | "captions"
    | "popups"
    | "glitch"
    | "pulse"
    | "avatarBar"
    | "mixCaptions";
  label: string;
}[] = [
  { key: "hypno", label: "Гипноз" },
  { key: "artifacts", label: "Артефакты" },
  { key: "captions", label: "Мантра" },
  { key: "popups", label: "Всплывашки" },
  { key: "glitch", label: "Глитч" },
  { key: "pulse", label: "Вспышки" },
  { key: "avatarBar", label: "Плашка" },
  { key: "mixCaptions", label: "Мешать" },
];

/** Compact FX kit for sandbox lab — same storage as Настройки → Эффекты. */
export function SessionFxLabStrip() {
  const [fx, setFx] = useState<SessionFxSettings>(() => loadSessionFxSettings());

  useEffect(() => subscribeSessionFx(() => setFx(loadSessionFxSettings())), []);

  function patch(next: Partial<SessionFxSettings>) {
    setFx(patchSessionFxSettings(next));
  }

  return (
    <div className="session-fx-lab">
      <div className="session-fx-lab__head">
        <strong>Эффекты</strong>
        <span>тест на кадре · как в настройках</span>
      </div>
      <div className="session-fx-lab__row" role="group" aria-label="Эффекты сессии">
        <button
          type="button"
          className={"session-fx-lab__chip" + (fx.enabled ? " is-on" : "")}
          aria-pressed={fx.enabled}
          onClick={() => patch({ enabled: !fx.enabled })}
        >
          Вкл
        </button>
        {LAYERS.map((layer) => {
          const on = Boolean(fx[layer.key]);
          return (
            <button
              key={layer.key}
              type="button"
              className={"session-fx-lab__chip" + (on ? " is-on" : "")}
              aria-pressed={on}
              onClick={() => patch({ [layer.key]: !fx[layer.key] })}
            >
              {layer.label}
            </button>
          );
        })}
      </div>
      <div className="session-fx-lab__row" role="radiogroup" aria-label="Тема надписей">
        {SESSION_FX_THEMES.map((id: SessionFxTheme) => {
          const on = id === fx.theme;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              className={"session-fx-lab__chip" + (on ? " is-on" : "")}
              onClick={() => patch({ theme: id })}
            >
              {sessionFxThemeLabelRu(id)}
            </button>
          );
        })}
      </div>
      <label className="session-fx-lab__gain">
        Сила {fx.intensity}
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={fx.intensity}
          onChange={(e) => patch({ intensity: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}
