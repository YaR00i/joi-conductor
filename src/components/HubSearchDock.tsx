import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { loadContentHub, saveContentHub } from "../lib/contentHub";

type Props = {
  children: ReactNode;
  /** Sit above the nhentai pager pill. */
  abovePager?: boolean;
  peek?: string;
};

export function HubSearchDock({
  children,
  abovePager = false,
  peek = "Поиск",
}: Props) {
  const [open, setOpen] = useState(() => loadContentHub().searchDockOpen);

  function setDockOpen(next: boolean) {
    setOpen(next);
    saveContentHub({ searchDockOpen: next });
  }

  const label = peek.trim() || "Поиск";

  return createPortal(
    <div
      className={
        "hub-search-dock" +
        (open ? " is-open" : "") +
        (abovePager ? " is-above-pager" : "")
      }
    >
      {open ? (
        <div className="hub-search-dock__panel">
          <button
            type="button"
            className="hub-search-dock__toggle"
            title="Свернуть поиск"
            aria-label="Свернуть поиск"
            aria-expanded
            onClick={() => setDockOpen(false)}
          >
            <ChevronDownIcon />
          </button>
          <div className="hub-search-dock__body">{children}</div>
        </div>
      ) : (
        <button
          type="button"
          className="hub-search-dock__peek"
          title="Развернуть поиск"
          aria-label="Развернуть поиск"
          aria-expanded={false}
          onClick={() => setDockOpen(true)}
        >
          <SearchGlyph />
          <span className="hub-search-dock__peek-text">{label}</span>
          <ChevronUpIcon />
        </button>
      )}
    </div>,
    document.body,
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M3.4 6.2 8 10.6l4.6-4.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M3.4 10.4 8 6l4.6 4.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <circle
        cx="7"
        cy="7"
        r="4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
      />
      <path
        d="m10.2 10.2 3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
    </svg>
  );
}
