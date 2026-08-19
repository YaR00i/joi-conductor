import { playUiClick, playUiNav, primeUiAudio } from "../lib/uiSound";

export type NavId =
  | "roulette"
  | "session"
  | "ember"
  | "ember_editor"
  | "shop"
  | "contracts"
  | "contract_journal"
  | "diary"
  | "stats"
  | "achievements"
  | "favorites"
  | "minigames"
  | "settings";

interface SideNavProps {
  active: NavId;
  onChange: (id: NavId) => void;
  sessionLive?: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  favoritesCount?: number;
  cindersBalance?: number;
  diaryCount?: number;
  /** Open contracts remaining today */
  contractsOpenCount?: number;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function SideNav({
  active,
  onChange,
  sessionLive,
  collapsed,
  onToggleCollapsed,
  favoritesCount = 0,
  cindersBalance = 0,
  diaryCount = 0,
  contractsOpenCount = 0,
  fullscreen = false,
  onToggleFullscreen,
}: SideNavProps) {
  const go = (id: NavId) => {
    void primeUiAudio();
    if (id !== active) playUiNav();
    else playUiClick(0.7);
    onChange(id);
  };

  return (
    <nav
      className={`side-nav ${collapsed ? "side-nav--collapsed" : ""}`}
      aria-label="Разделы"
    >
      <div className="side-nav__brand">
        <img className="side-nav__mark-img" src="/icon.png" alt="" />
        <div className="side-nav__brand-text">
          <div className="side-nav__name">Conductor</div>
          <div className="side-nav__tag">личная лаба</div>
        </div>
      </div>

      <button
        type="button"
        className={`side-nav__item ${active === "roulette" ? "is-active" : ""}`}
        onClick={() => go("roulette")}
        title="Рулетка Госпожи"
      >
        <RouletteIcon />
        <span>Рулетка</span>
      </button>

      <button
        type="button"
        className={`side-nav__item ${active === "session" ? "is-active" : ""}`}
        onClick={() => go("session")}
        title="Сессия"
      >
        <SessionIcon />
        <span>Сессия</span>
        {sessionLive ? <span className="side-nav__live">live</span> : null}
      </button>

      <button
        type="button"
        className={`side-nav__item ${active === "shop" ? "is-active" : ""}`}
        onClick={() => go("shop")}
        title="Магазин"
      >
        <ShopIcon />
        <span>Магазин</span>
        {cindersBalance > 0 ? (
          <span className="side-nav__badge" title="Угольки">
            {cindersBalance}
          </span>
        ) : null}
      </button>

      <button
        type="button"
        className={`side-nav__item ${active === "contracts" ? "is-active" : ""}`}
        onClick={() => go("contracts")}
        title="Контракты госпожи"
      >
        <ContractsIcon />
        <span>Контракты</span>
        {contractsOpenCount > 0 ? (
          <span className="side-nav__badge" title="Открытые сегодня">
            {contractsOpenCount}
          </span>
        ) : null}
      </button>

      <button
        type="button"
        className={`side-nav__item ${active === "contract_journal" ? "is-active" : ""}`}
        onClick={() => go("contract_journal")}
        title="Журнал отчётов по контрактам"
      >
        <JournalIcon />
        <span>Журнал</span>
      </button>

      <button
        type="button"
        className={`side-nav__item ${active === "diary" ? "is-active" : ""}`}
        onClick={() => go("diary")}
        title="Дневник сессий"
      >
        <DiaryIcon />
        <span>Дневник</span>
        {diaryCount > 0 ? (
          <span className="side-nav__badge">{diaryCount}</span>
        ) : null}
      </button>

      <button
        type="button"
        className={`side-nav__item ${active === "stats" ? "is-active" : ""}`}
        onClick={() => go("stats")}
        title="Статистика сессий"
      >
        <StatsIcon />
        <span>Статистика</span>
      </button>

      <button
        type="button"
        className={`side-nav__item ${active === "achievements" ? "is-active" : ""}`}
        onClick={() => go("achievements")}
        title="Достижения"
      >
        <TrophyIcon />
        <span>Достижения</span>
      </button>

      <button
        type="button"
        className={`side-nav__item ${active === "favorites" ? "is-active" : ""}`}
        onClick={() => go("favorites")}
        title="Избранное"
      >
        <HeartIcon />
        <span>Избранное</span>
        {favoritesCount > 0 ? (
          <span className="side-nav__badge">{favoritesCount}</span>
        ) : null}
      </button>

      <button
        type="button"
        className={`side-nav__item ${active === "ember" ? "is-active" : ""}`}
        onClick={() => go("ember")}
        title="Ember Anomaly"
      >
        <EmberIcon />
        <span>Аномалия</span>
      </button>

      <button
        type="button"
        className={`side-nav__item ${active === "ember_editor" ? "is-active" : ""}`}
        onClick={() => go("ember_editor")}
        title="Ember Editor"
      >
        <EmberEditIcon />
        <span>Ember Editor</span>
      </button>

      <button
        type="button"
        className={`side-nav__item ${active === "minigames" ? "is-active" : ""}`}
        onClick={() => go("minigames")}
        title="Мини-игры на Угольки"
      >
        <PuzzleIcon />
        <span>Мини-игры</span>
      </button>

      <div className="side-nav__spacer" />

      <button
        type="button"
        className={`side-nav__item ${active === "settings" ? "is-active" : ""}`}
        onClick={() => go("settings")}
        title="Настройки"
      >
        <GearIcon />
        <span>Настройки</span>
      </button>

      <button
        type="button"
        className={`side-nav__item${fullscreen ? " is-active" : ""}`}
        onClick={() => {
          void primeUiAudio();
          playUiClick();
          onToggleFullscreen?.();
        }}
        title={
          fullscreen
            ? "Выйти из полного экрана (F11)"
            : "Полный экран — без шапки и панели задач (F11)"
        }
        aria-pressed={fullscreen}
      >
        <FullscreenIcon active={fullscreen} />
        <span>{fullscreen ? "Окно" : "Полный экран"}</span>
      </button>

      <button
        type="button"
        className="side-nav__collapse"
        onClick={() => {
          void primeUiAudio();
          playUiClick();
          onToggleCollapsed();
        }}
        title={collapsed ? "Развернуть панель" : "Свернуть панель"}
        aria-pressed={collapsed}
      >
        <CollapseIcon collapsed={collapsed} />
        <span>{collapsed ? "Развернуть" : "Свернуть"}</span>
      </button>
    </nav>
  );
}

function EmberIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        d="M12 3c2.5 3.5 6 5.5 6 10a6 6 0 0 1-12 0c0-3 1.5-5.5 3-7.5C10 7 11 8.5 12 10c.8-1.8 1.2-3.5 0-7z"
        strokeLinejoin="round"
      />
      <path d="M10 16c.5 1.5 1.2 2 2 2s1.5-.5 2-2" strokeLinecap="round" />
    </svg>
  );
}

function EmberEditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 14h3M8 10h8M14 14l3-3 1.5 1.5L15.5 15.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PuzzleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path
        d="M4 4h6v2.4a1.4 1.4 0 0 0 2.8 0V4h6.2v6h-2.4a1.4 1.4 0 0 0 0 2.8h2.4v6.2h-6.2v-2.4a1.4 1.4 0 0 0-2.8 0v2.4H4v-6.2h2.4a1.4 1.4 0 0 0 0-2.8H4V4Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6" strokeLinecap="round" />
    </svg>
  );
}

function FullscreenIcon({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden
      >
        <path
          d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9 9 4 4M15 9l5-5M9 15l-5 5M15 15l5 5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path
        d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RouletteIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 4v3M12 17v3M4 12h3M17 12h3" strokeLinecap="round" />
    </svg>
  );
}

function SessionIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </svg>
  );
}

function ShopIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M4 9h16l-1.2 10.2A2 2 0 0 1 16.81 21H7.19a2 2 0 0 1-1.99-1.8L4 9Z" />
      <path d="M8 9V7a4 4 0 0 1 8 0v2" strokeLinecap="round" />
    </svg>
  );
}

function ContractsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M8 3h8l1 3H7l1-3Z" strokeLinejoin="round" />
      <path d="M7 6h10v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V6Z" />
      <path d="M10 11h4M10 15h4" strokeLinecap="round" />
    </svg>
  );
}

function JournalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M5 3h11l3 3v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M8 9h8M8 13h8M8 17h5" strokeLinecap="round" />
    </svg>
  );
}

function DiaryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M4 19h16" strokeLinecap="round" />
      <path
        d="M6 15.5 9.2 11l3.1 3.4L17.5 7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9.2" cy="11" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12.3" cy="14.4" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="7" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path
        d="M8 4h8v3a4 4 0 0 1-8 0V4Z"
        strokeLinejoin="round"
      />
      <path d="M8 5H5.5A2.5 2.5 0 0 0 5.5 10H8" strokeLinecap="round" />
      <path d="M16 5h2.5A2.5 2.5 0 0 1 18.5 10H16" strokeLinecap="round" />
      <path d="M12 11v3.5" strokeLinecap="round" />
      <path d="M9 20h6" strokeLinecap="round" />
      <path d="M10 17h4l-.5 3h-3L10 17Z" strokeLinejoin="round" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s-6.7-4.35-9.33-8.1C.8 10.1 1.1 6.7 3.7 5.05 6.05 3.55 8.85 4.3 12 7.05c3.15-2.75 5.95-3.5 8.3-2 2.6 1.65 2.9 5.05 1.03 7.85C18.7 16.65 12 21 12 21z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
      style={{ transform: collapsed ? "rotate(180deg)" : undefined }}
    >
      <path d="M15 6 9 12l6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
