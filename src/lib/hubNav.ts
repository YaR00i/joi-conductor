import type { NavId } from "../components/SideNav";

const LAST_PROGRESS_KEY = "joi-hub-progress-v1";
const LAST_PLAY_KEY = "joi-hub-play-v1";

export const PROGRESS_TAB_IDS = ["diary", "stats", "achievements"] as const;
export type ProgressTabId = (typeof PROGRESS_TAB_IDS)[number];

export const PLAY_TAB_IDS = ["minigames", "ember", "ember_editor"] as const;
export type PlayTabId = (typeof PLAY_TAB_IDS)[number];

export const PROGRESS_TABS: ReadonlyArray<{ id: ProgressTabId; label: string }> =
  [
    { id: "diary", label: "Дневник" },
    { id: "stats", label: "Статистика" },
    { id: "achievements", label: "Достижения" },
  ];

export const PLAY_TABS: ReadonlyArray<{ id: PlayTabId; label: string }> = [
  { id: "minigames", label: "Игры" },
  { id: "ember", label: "Аномалия" },
  { id: "ember_editor", label: "Ember Editor" },
];

function isProgressTab(id: string): id is ProgressTabId {
  return (PROGRESS_TAB_IDS as readonly string[]).includes(id);
}

function isPlayTab(id: string): id is PlayTabId {
  return (PLAY_TAB_IDS as readonly string[]).includes(id);
}

export function progressTabOf(id: NavId): ProgressTabId | null {
  if (id === "contract_journal") return "stats";
  return isProgressTab(id) ? id : null;
}

export function playTabOf(id: NavId): PlayTabId | null {
  return isPlayTab(id) ? id : null;
}

export function isProgressNav(id: NavId): boolean {
  return progressTabOf(id) != null;
}

export function isPlayNav(id: NavId): boolean {
  return playTabOf(id) != null;
}

function readStored(key: string, fallback: NavId, ok: (id: string) => boolean): NavId {
  try {
    const raw = localStorage.getItem(key);
    if (raw && ok(raw)) return raw as NavId;
  } catch {
    // ignore quota / private mode
  }
  return fallback;
}

export function lastProgressNav(): ProgressTabId {
  const stored = readStored(LAST_PROGRESS_KEY, "diary", isProgressTab);
  return stored as ProgressTabId;
}

export function lastPlayNav(): PlayTabId {
  const stored = readStored(LAST_PLAY_KEY, "minigames", isPlayTab);
  return stored as PlayTabId;
}

export function rememberHubNav(id: NavId): void {
  const progress = progressTabOf(id);
  if (progress) {
    try {
      localStorage.setItem(LAST_PROGRESS_KEY, progress);
    } catch {
      // ignore
    }
    return;
  }
  const play = playTabOf(id);
  if (play) {
    try {
      localStorage.setItem(LAST_PLAY_KEY, play);
    } catch {
      // ignore
    }
  }
}
