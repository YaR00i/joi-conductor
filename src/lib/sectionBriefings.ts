/**
 * First-visit dismissible briefings for hub sections (not Ember play / editor).
 * Persisted in localStorage (shared across save slots; not progress).
 */

import type { NavId } from "../components/SideNav";
import { isProgressNav } from "./hubNav";

export const SECTION_BRIEFINGS_STORAGE_KEY = "joi-section-briefings-v1";

export type SectionBriefingStatus = "pending" | "completed" | "dismissed";

/** Sections that get a first-visit briefing. */
export type BriefableNavId = Exclude<
  NavId,
  | "ember"
  | "ember_editor"
  | "minigames"
  | "stats"
  | "achievements"
  | "contract_journal"
  | "favorites"
>;

export type SectionBriefingCta = {
  labelRu: string;
  nav: NavId;
  primary?: boolean;
};

export type SectionBriefingCopy = {
  id: BriefableNavId;
  eyebrowRu: string;
  titleRu: string;
  leadRu: string;
  hintRu?: string;
  ctas?: ReadonlyArray<SectionBriefingCta>;
};

export type SectionBriefingsState = {
  byId: Partial<Record<BriefableNavId, SectionBriefingStatus>>;
};

export const BRIEFABLE_NAV_IDS: readonly BriefableNavId[] = [
  "roulette",
  "session",
  "chat",
  "shop",
  "contracts",
  "diary",
  "doujin",
  "settings",
] as const;

export const SECTION_BRIEFINGS: ReadonlyArray<SectionBriefingCopy> = [
  {
    id: "roulette",
    eyebrowRu: "Раздел · Рулетка",
    titleRu: "Колёса решают вечер",
    leadRu:
      "Здесь Госпожа крутит параметры, а сверху блок «Сегодня» — контракты дня и угольки. Можно дать ей решить или стартовать без колёс.",
    hintRu: "Контракт из «Сегодня» берётся здесь. Задания появляются уже в сессии.",
    ctas: [
      { labelRu: "К «Сегодня»", nav: "roulette", primary: true },
      { labelRu: "К контрактам", nav: "contracts" },
    ],
  },
  {
    id: "session",
    eyebrowRu: "Раздел · Сессия",
    titleRu: "Живой зал",
    leadRu:
      "Во время сессии здесь бит, инструкции, подтверждения и медиа. Следи за панелью квестов и отвечай на запросы Госпожи — отмена и пауза тоже здесь.",
    hintRu: "Сессия стартует с Рулетки. Пока live — другие разделы лучше не трогать без нужды.",
    ctas: [{ labelRu: "К рулетке", nav: "roulette", primary: true }],
  },
  {
    id: "chat",
    eyebrowRu: "Раздел · Чат",
    titleRu: "Разговор вне зала",
    leadRu:
      "Свободный чат с госпожой. Soul Memory пишет психологию, отношения, эпизоды и дневник. Очередь сессии сюда не ходит — сессия по-прежнему из библии и блоков.",
    hintRu: "Селфи и голосовой звонок — позже. Пока можно писать и, если голос включён, слушать ответы.",
    ctas: [
      { labelRu: "К сессии", nav: "session" },
      { labelRu: "К рулетке", nav: "roulette", primary: true },
    ],
  },
  {
    id: "shop",
    eyebrowRu: "Раздел · Магазин",
    titleRu: "Угольки в дело",
    leadRu:
      "Трать угольки на пакеты тегов, игрушки и штуки у Госпожи. Полка избранного подпитывает предложения — лайки с сессий тоже считаются.",
    hintRu: "Не хватает угольков — сессии и контракты их приносят.",
    ctas: [
      { labelRu: "К полке", nav: "favorites" },
      { labelRu: "К рулетке", nav: "roulette", primary: true },
    ],
  },
  {
    id: "contracts",
    eyebrowRu: "Раздел · Контракты",
    titleRu: "Доски на сегодня",
    leadRu:
      "Ежедневные контракты Госпожи: взять, выполнить, отчитаться. Клетка, пробка и denial тоже здесь, не отдельными заданиями.",
    hintRu: "Открытые и активные на сегодня видны в блоке «Сегодня» на Рулетке. Задания — только в сессии.",
    ctas: [
      { labelRu: "К «Сегодня»", nav: "roulette", primary: true },
    ],
  },
  {
    id: "diary",
    eyebrowRu: "Раздел · Прогресс",
    titleRu: "Следы вечеров",
    leadRu:
      "Дневник, статистика и достижения — вкладки одного раздела. Записи сессий, цифры за период и ступени за угольки.",
    hintRu: "Пусто? Сначала проведи сессию — запись появится сама.",
    ctas: [
      { labelRu: "К рулетке", nav: "roulette", primary: true },
      { labelRu: "К статистике", nav: "stats" },
    ],
  },
  {
    id: "doujin",
    eyebrowRu: "Раздел · Контент",
    titleRu: "Одна полка, два источника",
    leadRu:
      "В шапке переключатель nhentai / Gelbooru, вкладки общие. Gelbooru — стена постов (новинки, поиск, рекомендации, локальная полка) и лайтбокс; сердечко пишет в IndexedDB полки, которая кормит сессию, рулетку и магазин. На карточках закладка кладёт пост в локальные списки (свои очереди и автоочередь госпожи из тегов полки). nhentai — сетка томов, ридер и избранное аккаунта; в сессию не идёт. Списки nhentai — очереди и прогон. Ключи API — в Настройках → Медиа.",
    hintRu: "Песочница: blacklist тегов nhentai правится в Настройках. В Живом слоте фильтр зашит.",
    ctas: [
      { labelRu: "К настройкам", nav: "settings", primary: true },
      { labelRu: "В магазин", nav: "shop" },
    ],
  },
  {
    id: "settings",
    eyebrowRu: "Раздел · Настройки",
    titleRu: "Слоты, ИИ и голос",
    leadRu:
      "Сейвы, медиа (Gelbooru), ИИ-ресурсы, озвучка, бэкап прогресса. Слот «Песочница» — тренировка без прогресса основного сейва.",
    hintRu: "«Вечерний маршрут» и подсказки разделов можно снова открыть отсюда.",
    ctas: [{ labelRu: "К рулетке", nav: "roulette", primary: true }],
  },
];

export function isBriefableNav(id: NavId): id is BriefableNavId {
  return (BRIEFABLE_NAV_IDS as readonly string[]).includes(id);
}

/** First-visit overlay for a route: progress tabs share diary; old Избранное shares Content. */
export function briefingNavFor(id: NavId): BriefableNavId | null {
  if (isProgressNav(id)) return "diary";
  if (id === "favorites") return "doujin";
  return isBriefableNav(id) ? id : null;
}

export function defaultSectionBriefingsState(): SectionBriefingsState {
  return { byId: {} };
}

function isStatus(v: unknown): v is SectionBriefingStatus {
  return v === "pending" || v === "completed" || v === "dismissed";
}

export function loadSectionBriefingsState(): SectionBriefingsState {
  try {
    const raw = localStorage.getItem(SECTION_BRIEFINGS_STORAGE_KEY);
    if (!raw) return defaultSectionBriefingsState();
    const parsed = JSON.parse(raw) as Partial<SectionBriefingsState>;
    const byId: SectionBriefingsState["byId"] = {};
    if (parsed.byId && typeof parsed.byId === "object") {
      for (const id of BRIEFABLE_NAV_IDS) {
        const status = parsed.byId[id];
        if (isStatus(status)) byId[id] = status;
      }
    }
    return { byId };
  } catch {
    return defaultSectionBriefingsState();
  }
}

export function saveSectionBriefingsState(state: SectionBriefingsState): void {
  try {
    localStorage.setItem(SECTION_BRIEFINGS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function sectionBriefingStatus(
  id: BriefableNavId,
  state: SectionBriefingsState = loadSectionBriefingsState(),
): SectionBriefingStatus {
  return state.byId[id] ?? "pending";
}

export function shouldShowSectionBriefing(
  id: BriefableNavId,
  state: SectionBriefingsState = loadSectionBriefingsState(),
): boolean {
  return sectionBriefingStatus(id, state) === "pending";
}

export function markSectionBriefingCompleted(id: BriefableNavId): void {
  const state = loadSectionBriefingsState();
  state.byId[id] = "completed";
  saveSectionBriefingsState(state);
}

export function markSectionBriefingDismissed(id: BriefableNavId): void {
  const state = loadSectionBriefingsState();
  state.byId[id] = "dismissed";
  saveSectionBriefingsState(state);
}

/** Re-open all section tips from Settings. */
export function reopenAllSectionBriefings(): void {
  saveSectionBriefingsState(defaultSectionBriefingsState());
}

export function reopenSectionBriefing(id: BriefableNavId): void {
  const state = loadSectionBriefingsState();
  state.byId[id] = "pending";
  saveSectionBriefingsState(state);
}

const SECTION_BRIEFING_BY_ID: Record<BriefableNavId, SectionBriefingCopy> =
  Object.fromEntries(SECTION_BRIEFINGS.map((b) => [b.id, b])) as Record<
    BriefableNavId,
    SectionBriefingCopy
  >;

export function sectionBriefingCopy(id: BriefableNavId): SectionBriefingCopy {
  return SECTION_BRIEFING_BY_ID[id];
}
