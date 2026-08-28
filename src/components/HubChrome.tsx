import type { CSSProperties, ReactNode } from "react";
import type { NavId } from "./SideNav";
import {
  PLAY_TABS,
  PROGRESS_TABS,
  playTabOf,
  progressTabOf,
  type PlayTabId,
  type ProgressTabId,
} from "../lib/hubNav";
import { playUiClick, playUiNav, primeUiAudio } from "../lib/uiSound";
import "./hubChrome.css";

type TabSpec<Id extends NavId> = {
  id: Id;
  label: string;
};

type HubChromeProps<Id extends NavId> = {
  kicker: string;
  title: string;
  tabs: readonly TabSpec<Id>[];
  active: Id;
  onChange: (id: Id) => void;
  trailing?: ReactNode;
  tight?: boolean;
};

export function HubChrome<Id extends NavId>({
  kicker,
  title,
  tabs,
  active,
  onChange,
  trailing,
  tight = false,
}: HubChromeProps<Id>) {
  const go = (id: Id) => {
    void primeUiAudio();
    if (id !== active) playUiNav();
    else playUiClick(0.7);
    onChange(id);
  };

  return (
    <header
      className={`hub-chrome${tight ? " hub-chrome--tight" : ""}`}
    >
      <div className="hub-chrome__brand">
        <span className="hub-chrome__kicker">{kicker}</span>
        <h1>{title}</h1>
      </div>
      <div
        className="hub-chrome__tabs"
        role="tablist"
        style={{ "--hub-tab-count": tabs.length } as CSSProperties}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            className={tab.id === active ? "is-active" : ""}
            onClick={() => go(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {trailing ? (
        <div className="hub-chrome__trailing">{trailing}</div>
      ) : null}
    </header>
  );
}

type ProgressHubChromeProps = {
  active: NavId;
  onChange: (id: NavId) => void;
  trailing?: ReactNode;
};

export function ProgressHubChrome({
  active,
  onChange,
  trailing,
}: ProgressHubChromeProps) {
  const tab = progressTabOf(active) ?? "diary";
  return (
    <HubChrome<ProgressTabId>
      kicker="Сессии"
      title="Прогресс"
      tabs={PROGRESS_TABS}
      active={tab}
      onChange={onChange}
      trailing={trailing}
    />
  );
}

type PlayHubChromeProps = {
  active: NavId;
  onChange: (id: NavId) => void;
  trailing?: ReactNode;
  tight?: boolean;
};

export function PlayHubChrome({
  active,
  onChange,
  trailing,
  tight = false,
}: PlayHubChromeProps) {
  const tab = playTabOf(active) ?? "minigames";
  return (
    <HubChrome<PlayTabId>
      kicker="Угольки"
      title="Мини-игры"
      tabs={PLAY_TABS}
      active={tab}
      onChange={onChange}
      trailing={trailing}
      tight={tight}
    />
  );
}
