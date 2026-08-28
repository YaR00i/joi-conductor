import {
  isPlayNav,
  isProgressNav,
  lastPlayNav,
  lastProgressNav,
} from "../lib/hubNav";
import { playUiClick, playUiNav, primeUiAudio } from "../lib/uiSound";

export type NavId =
  | "roulette"
  | "session"
  | "chat"
  | "ember"
  | "ember_editor"
  | "shop"
  | "contracts"
  | "contract_journal"
  | "diary"
  | "stats"
  | "achievements"
  | "favorites"
  | "doujin"
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
  /** Mistress check-in overdue */
  chatWaiting?: boolean;
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
  chatWaiting = false,
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
        className={`side-nav__item ${active === "chat" ? "is-active" : ""}`}
        onClick={() => go("chat")}
        title="Чат с госпожой"
      >
        <ChatIcon />
        <span>Чат</span>
        {chatWaiting ? (
          <span className="side-nav__badge" title="Она ждёт отчёт">
            !
          </span>
        ) : null}
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
        className={`side-nav__item ${isProgressNav(active) ? "is-active" : ""}`}
        onClick={() => go(lastProgressNav())}
        title="Дневник, статистика и достижения"
      >
        <DiaryIcon />
        <span>Прогресс</span>
        {diaryCount > 0 ? (
          <span className="side-nav__badge">{diaryCount}</span>
        ) : null}
      </button>

      <button
        type="button"
        className={`side-nav__item ${active === "doujin" || active === "favorites" ? "is-active" : ""}`}
        onClick={() => go("doujin")}
        title="Контент: nhentai и Gelbooru"
      >
        <BookIcon />
        <span>Контент</span>
        {favoritesCount > 0 ? (
          <span className="side-nav__badge">{favoritesCount}</span>
        ) : null}
      </button>

      <button
        type="button"
        className={`side-nav__item ${isPlayNav(active) ? "is-active" : ""}`}
        onClick={() => go(lastPlayNav())}
        title="Мини-игры, Аномалия и Ember Editor"
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

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        d="M5 4.5h11.5A2.5 2.5 0 0 1 19 7v13.2H7.2A2.2 2.2 0 0 0 5 22.4V4.5Z"
        strokeLinejoin="round"
      />
      <path d="M5 4.5A2.2 2.2 0 0 1 7.2 2.3H19" strokeLinecap="round" />
      <path d="M8.5 8h7.5M8.5 12h7.5M8.5 16h5" strokeLinecap="round" />
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

function ChatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path
        d="M5 6.5h9.5a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H11l-3.5 3v-3H5A2.5 2.5 0 0 1 2.5 14V9A2.5 2.5 0 0 1 5 6.5Z"
        strokeLinejoin="round"
      />
      <path
        d="M15.5 5h3A2.5 2.5 0 0 1 21 7.5V12a2.5 2.5 0 0 1-2 2.45"
        strokeLinecap="round"
      />
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
