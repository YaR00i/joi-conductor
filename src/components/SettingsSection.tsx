import { useState, type ReactNode } from "react";

const STORAGE_KEY = "joi-settings-open-v1";

function loadOpen(id: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed[id] === "boolean") return parsed[id];
  } catch {
    /* ignore */
  }
  return fallback;
}

function saveOpen(id: string, open: boolean): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed =
      raw != null ? (JSON.parse(raw) as Record<string, unknown>) : {};
    parsed[id] = open;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

type Props = {
  id: string;
  title: string;
  sub?: ReactNode;
  /** Default open when no saved preference. */
  defaultOpen?: boolean;
  wide?: boolean;
  className?: string;
  children: ReactNode;
};

/** Collapsible settings card; open state persists in localStorage. */
export function SettingsSection({
  id,
  title,
  sub,
  defaultOpen = true,
  wide = false,
  className = "",
  children,
}: Props) {
  const [open, setOpen] = useState(() => loadOpen(id, defaultOpen));

  return (
    <section
      className={`card${wide ? " card--wide" : ""} settings-section${
        open ? " is-open" : ""
      }${className ? ` ${className}` : ""}`}
    >
      <button
        type="button"
        className="settings-section__toggle"
        aria-expanded={open}
        onClick={() => {
          setOpen((prev) => {
            const next = !prev;
            saveOpen(id, next);
            return next;
          });
        }}
      >
        <h2 className="card__title settings-section__title">{title}</h2>
        <span className="settings-section__chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div className="settings-section__body">
          {sub ? <p className="card__sub">{sub}</p> : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}
