import { useEffect, useState } from "react";
import { UiCheck } from "./UiCheck";
import {
  loadMediaCensorLive,
  mediaCensorCoverageLabelRu,
  mediaCensorCoverageSubRu,
  mediaCensorPartHintRu,
  mediaCensorPartLabelRu,
  mediaCensorStyleLabelRu,
  mediaCensorStyleSubRu,
  MEDIA_CENSOR_COVERAGES,
  MEDIA_CENSOR_PARTS,
  MEDIA_CENSOR_STYLES,
  setMediaCensorEnabled,
  subscribeMediaCensor,
  type MediaCensorCoverage,
  type MediaCensorPart,
  type MediaCensorStyle,
} from "../lib/mediaCensor";

export function MediaCensorToggle({
  active,
  locked,
  onChange,
  compact = false,
  variant = "dock",
}: {
  active: boolean;
  locked: boolean;
  onChange: (on: boolean) => void;
  compact?: boolean;
  variant?: "dock" | "brain";
}) {
  const title = locked
    ? "Госпожа закрыла картинки — снять запрет в Настройках → Геймплей → Цензор"
    : active
      ? "Снять цензор с кадра сессии"
      : "Закрыть кадр сессии цензором";

  if (variant === "brain") {
    return (
      <div className="brain-seg" role="radiogroup" aria-label="Цензор медиа">
        {(
          [
            { on: false, label: "Выкл", sub: "как есть" },
            { on: true, label: "Вкл", sub: locked ? "госпожа" : "на кадре" },
          ] as const
        ).map((opt) => {
          const pressed = opt.on === active;
          return (
            <button
              key={opt.label}
              type="button"
              role="radio"
              aria-checked={pressed}
              title={title}
              disabled={locked && !opt.on}
              className={"brain-seg__btn" + (pressed ? " is-on" : "")}
              onClick={() => onChange(opt.on)}
            >
              {opt.label}
              <span className="brain-seg__sub">{opt.sub}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={
        "media-censor-toggle" + (compact ? " media-censor-toggle--compact" : "")
      }
      role="group"
      aria-label="Цензор медиа"
    >
      <button
        type="button"
        className={
          "media-censor-toggle__btn" + (active ? " is-active" : "")
        }
        aria-pressed={active}
        disabled={locked && active}
        title={title}
        onClick={() => onChange(!active)}
      >
        Цензор
        <span>{locked ? "госпожа" : active ? "на кадре" : "выкл"}</span>
      </button>
    </div>
  );
}

export function MediaCensorStyleSeg({
  style,
  onChange,
}: {
  style: MediaCensorStyle;
  onChange: (style: MediaCensorStyle) => void;
}) {
  return (
    <div className="brain-seg" role="radiogroup" aria-label="Вид цензора">
      {MEDIA_CENSOR_STYLES.map((id) => {
        const on = id === style;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            className={"brain-seg__btn" + (on ? " is-on" : "")}
            onClick={() => onChange(id)}
          >
            {mediaCensorStyleLabelRu(id)}
            <span className="brain-seg__sub">
              {mediaCensorStyleSubRu(id)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function MediaCensorCoverageSeg({
  coverage,
  onChange,
}: {
  coverage: MediaCensorCoverage;
  onChange: (coverage: MediaCensorCoverage) => void;
}) {
  return (
    <div className="brain-seg" role="radiogroup" aria-label="Что закрывать">
      {MEDIA_CENSOR_COVERAGES.map((id) => {
        const on = id === coverage;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            className={"brain-seg__btn" + (on ? " is-on" : "")}
            onClick={() => onChange(id)}
          >
            {mediaCensorCoverageLabelRu(id)}
            <span className="brain-seg__sub">
              {mediaCensorCoverageSubRu(id)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function MediaCensorDetectSeg({
  detect,
  disabled,
  busy,
  onChange,
}: {
  detect: boolean;
  disabled?: boolean;
  busy?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="brain-seg" role="radiogroup" aria-label="Слежение нейросетью">
      {(
        [
          { on: false, label: "Выкл", sub: "типичный кадр" },
          { on: true, label: "Вкл", sub: busy ? "качаю…" : "аниме" },
        ] as const
      ).map((opt) => {
        const pressed = opt.on === detect;
        return (
          <button
            key={opt.label}
            type="button"
            role="radio"
            aria-checked={pressed}
            disabled={disabled || busy}
            title={
              disabled
                ? "Сначала «Зоны»: «Кадр» закрывает всё без нейросети"
                : opt.on
                  ? "Голова, грудь, попа, пах, живот. Руки и позы докачает, если выйдет (~56 МБ). Не вышло — тело всё равно ловит. Член: выкл зоны — дырка, вкл — закрыть."
                  : "Типичные зоны кадра, без детектора"
            }
            className={"brain-seg__btn" + (pressed ? " is-on" : "")}
            onClick={() => onChange(opt.on)}
          >
            {opt.label}
            <span className="brain-seg__sub">{opt.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MediaCensorOnOffSeg({
  ariaLabel,
  value,
  disabled,
  onSub,
  offSub,
  onTitle,
  offTitle,
  onChange,
}: {
  ariaLabel: string;
  value: boolean;
  disabled?: boolean;
  onSub: string;
  offSub: string;
  onTitle?: string;
  offTitle?: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="brain-seg" role="radiogroup" aria-label={ariaLabel}>
      {(
        [
          { on: false, label: "Выкл", sub: offSub, title: offTitle },
          { on: true, label: "Вкл", sub: onSub, title: onTitle },
        ] as const
      ).map((opt) => {
        const pressed = opt.on === value;
        return (
          <button
            key={opt.label}
            type="button"
            role="radio"
            aria-checked={pressed}
            disabled={disabled}
            title={opt.title}
            className={"brain-seg__btn" + (pressed ? " is-on" : "")}
            onClick={() => onChange(opt.on)}
          >
            {opt.label}
            <span className="brain-seg__sub">{opt.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MediaCensorPartsRow({
  parts,
  onChange,
}: {
  parts: Record<MediaCensorPart, boolean>;
  onChange: (part: MediaCensorPart, on: boolean) => void;
}) {
  return (
    <div className="media-censor-parts" role="group" aria-label="Зоны">
      {MEDIA_CENSOR_PARTS.map((id) => {
        const on = parts[id];
        return (
          <button
            key={id}
            type="button"
            className={"media-censor-parts__btn" + (on ? " is-on" : "")}
            aria-pressed={on}
            title={mediaCensorPartHintRu(id)}
            onClick={() => onChange(id, !on)}
          >
            {mediaCensorPartLabelRu(id)}
          </button>
        );
      })}
    </div>
  );
}

/** Toolbar checkbox: owns its live state so SessionToolbar stays dumb. */
export function MediaCensorSessionCheck() {
  const [live, setLive] = useState(() => loadMediaCensorLive());

  useEffect(
    () => subscribeMediaCensor(() => setLive(loadMediaCensorLive())),
    [],
  );

  return (
    <UiCheck
      className="ui-check--inline"
      checked={live.active}
      disabled={live.lock.locked}
      onChange={(on) => setLive(setMediaCensorEnabled(on))}
      title={
        live.lock.locked
          ? "Госпожа закрыла картинки — снять в Настройках → Геймплей → Цензор"
          : live.active
            ? "Снять цензор с кадра"
            : "Закрыть кадр цензором"
      }
    >
      {live.lock.locked ? "цензор · госпожа" : "цензор"}
    </UiCheck>
  );
}
