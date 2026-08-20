import { Children, useEffect, useState, type ReactNode } from "react";

/**
 * Lightweight tabbed container for SettingsPage.
 *
 * Active tab persists in localStorage ("joi-settings-tab-v1") so reloads keep
 * the user's place. Mirrors the look of `.contracts-page__mode-toggle`.
 */

export type SettingsTabId =
  | "profile"
  | "brain"
  | "voice"
  | "media"
  | "gameplay"
  | "debug";

const STORAGE_KEY = "joi-settings-tab-v1";
const VALID_TABS: SettingsTabId[] = [
  "profile",
  "brain",
  "voice",
  "media",
  "gameplay",
  "debug",
];

export type SettingsTab = {
  id: SettingsTabId;
  label: string;
  hint?: string;
};

function loadInitialTab(): SettingsTabId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && VALID_TABS.includes(raw as SettingsTabId)) {
      return raw as SettingsTabId;
    }
  } catch {
    /* ignore */
  }
  return "brain";
}

export function SettingsTabs({
  tabs,
  children,
}: {
  tabs: SettingsTab[];
  /** Children are rendered in tab order; each child maps to one tab. */
  children: ReactNode;
}) {
  const [active, setActive] = useState<SettingsTabId>(() => loadInitialTab());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, active);
    } catch {
      /* ignore */
    }
  }, [active]);

  // Map children to tabs by index (caller must keep them aligned).
  const childArray = Children.toArray(children).filter(
    (child) => typeof child !== "string" && typeof child !== "number",
  );
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === active),
  );
  const activeChild =
    childArray[activeIndex] ?? childArray[0] ?? null;
  const activeTab = tabs[activeIndex] ?? tabs[0];

  return (
    <div className="settings-tabs">
      <div className="settings-tabs__bar" role="tablist">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              title={t.hint}
              className={
                "settings-tabs__btn" + (isActive ? " is-active" : "")
              }
              onClick={() => setActive(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        className="settings-tabs__panel"
        role="tabpanel"
        aria-labelledby={activeTab?.id}
      >
        {activeChild}
      </div>
    </div>
  );
}
