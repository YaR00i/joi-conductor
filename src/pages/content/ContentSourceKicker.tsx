import { useState } from "react";
import {
  CONTENT_SOURCES,
  type ContentSource,
} from "../../lib/contentHub";
import { playUiClick, primeUiAudio } from "../../lib/uiSound";

type Props = {
  source: ContentSource;
  onChange: (next: ContentSource) => void;
};

export function ContentSourceKicker({ source, onChange }: Props) {
  const [armed, setArmed] = useState(false);
  const next: ContentSource = source === "nhentai" ? "gelbooru" : "nhentai";

  return (
    <button
      type="button"
      className={
        "content-source-kicker" +
        (armed ? " is-armed" : "") +
        ` is-${source}`
      }
      aria-label={`Источник: ${source}. Нажми — переключить на ${next}`}
      title={`Сейчас ${source}. Нажми — ${next}`}
      onClick={() => {
        void primeUiAudio();
        playUiClick();
        setArmed(true);
        onChange(next);
      }}
    >
      <span className="content-source-kicker__stack" aria-hidden>
        {CONTENT_SOURCES.map((id) => (
          <span
            key={id}
            className={
              "content-source-kicker__name" +
              (id === source ? " is-on" : " is-off")
            }
          >
            {id}
          </span>
        ))}
      </span>
      <svg
        className="content-source-kicker__swap"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <path
          className="content-source-kicker__arc"
          d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
        />
        <path
          className="content-source-kicker__head"
          d="M3 3v5h5"
        />
        <path
          className="content-source-kicker__arc"
          d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"
        />
        <path
          className="content-source-kicker__head"
          d="M16 16h5v5"
        />
      </svg>
    </button>
  );
}
