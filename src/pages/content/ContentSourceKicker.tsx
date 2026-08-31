import { useEffect, useId, useRef, useState } from "react";
import {
  CONTENT_SOURCES,
  type ContentSource,
} from "../../lib/contentHub";
import { playUiClick, primeUiAudio } from "../../lib/uiSound";

type Props = {
  source: ContentSource;
  onChange: (next: ContentSource) => void;
};

function SourceListGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5.4 8.6 12 16.2 18.6 8.6"
        stroke="currentColor"
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ContentSourceGlyph({ source }: { source: ContentSource }) {
  switch (source) {
    case "nhentai":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 4.5h10.2A2.3 2.3 0 0 1 18.5 6.8v13.1H8A2 2 0 0 0 6 22V4.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M6 4.5A2 2 0 0 1 8 2.5h10.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M9.2 9h6.2M9.2 12.4h6.2M9.2 15.8h4.2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "gelbooru":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3.2 13.6 9.2 19.8 10.2 15.2 14.6 16.6 20.8 12 17.6 7.4 20.8 8.8 14.6 4.2 10.2 10.4 9.2Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "censored":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="4.2" y="4.2" width="6.4" height="6.4" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13.4" y="4.2" width="6.4" height="6.4" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
          <rect x="4.2" y="13.4" width="6.4" height="6.4" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13.4" y="13.4" width="6.4" height="6.4" rx="1.2" fill="currentColor" />
        </svg>
      );
    case "blacked":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 3.8a8.2 8.2 0 0 1 0 16.4Z" fill="currentColor" />
        </svg>
      );
    case "realbooru":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4.6 8.4h3.1l1.2-2.2h6.2l1.2 2.2h3.1A1.6 1.6 0 0 1 21 10v7.4a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 17.4V10a1.6 1.6 0 0 1 1.6-1.6Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="13.6" r="3.1" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case "xbooru":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M7.2 7.2 16.8 16.8M16.8 7.2 7.2 16.8"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        </svg>
      );
    case "hypnohub":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 4.2a7.8 7.8 0 1 1-5.4 2.2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M12 7.4a4.6 4.6 0 1 1-3.1 1.3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="1.15" fill="currentColor" />
        </svg>
      );
    case "joidb":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect
            x="4.2"
            y="6.2"
            width="15.6"
            height="11.6"
            rx="1.6"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M8 6.2v11.6M4.2 10.2h15.6M4.2 14h15.6"
            stroke="currentColor"
            strokeWidth="1.8"
          />
        </svg>
      );
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export function ContentSourceKicker({ source, onChange }: Props) {
  const [armed, setArmed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const index = Math.max(0, CONTENT_SOURCES.indexOf(source));
  const next =
    CONTENT_SOURCES[(index + 1) % CONTENT_SOURCES.length] ?? "nhentai";
  const shown: ContentSource[] = [source, next];

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || !(e.target instanceof Node) || el.contains(e.target)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function cycle() {
    void primeUiAudio();
    playUiClick();
    setArmed(true);
    setMenuOpen(false);
    onChange(next);
  }

  function pick(id: ContentSource) {
    void primeUiAudio();
    playUiClick();
    setMenuOpen(false);
    if (id === source) return;
    setArmed(true);
    onChange(id);
  }

  return (
    <div className="content-source-kicker-wrap" ref={rootRef}>
      <button
        type="button"
        className={
          "content-source-kicker" +
          (armed ? " is-armed" : "") +
          ` is-${source}`
        }
        aria-label={`Источник: ${source}. Нажми — переключить на ${next}`}
        title={`Сейчас ${source}. Нажми — ${next}`}
        onClick={cycle}
      >
        <span className="content-source-kicker__stack" aria-hidden>
          {shown.map((id) => (
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
          <path className="content-source-kicker__head" d="M3 3v5h5" />
          <path
            className="content-source-kicker__arc"
            d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"
          />
          <path className="content-source-kicker__head" d="M16 16h5v5" />
        </svg>
      </button>
      <div className={"content-source-menu" + (menuOpen ? " is-open" : "")}>
        <button
          type="button"
          className="content-source-menu__btn"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label="Все источники"
          title="Все источники"
          onClick={() => {
            void primeUiAudio();
            playUiClick(0.7);
            setMenuOpen((open) => !open);
          }}
        >
          <SourceListGlyph />
        </button>
        {menuOpen ? (
          <ul id={menuId} className="content-source-menu__list" role="menu">
            {CONTENT_SOURCES.map((id) => (
              <li key={id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={
                    "content-source-menu__item" +
                    (id === source ? " is-active" : "")
                  }
                  aria-current={id === source ? "true" : undefined}
                  onClick={() => pick(id)}
                >
                  <ContentSourceGlyph source={id} />
                  <span>{id}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
