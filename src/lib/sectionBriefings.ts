/**
 * First-visit dismissible briefings for hub sections (not Ember play / editor).
 * Persisted in localStorage (shared across save slots; not progress).
 */

import type { NavId } from "../components/SideNav";

export const SECTION_BRIEFINGS_STORAGE_KEY = "joi-section-briefings-v1";

export type SectionBriefingStatus = "pending" | "completed" | "dismissed";

/** Sections that get a first-visit briefing. */
export type BriefableNavId = Exclude<
  NavId,
  "ember" | "ember_editor" | "minigames"
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
  "shop",
  "contracts",
  "diary",
  "stats",
  "achievements",
  "favorites",
  "settings",
] as const;

export const SECTION_BRIEFINGS: ReadonlyArray<SectionBriefingCopy> = [
  {
    id: "roulette",
    eyebrowRu: "Раздел · Рулетка",
    titleRu: "Колёса решают вечер",
    leadRu:
      "Здесь Госпожа крутит параметры, а сверху блок «Сегодня» — контракты, угольки и задания. Можно дать ей решить или стартовать без колёс.",
    hintRu: "Контракт из «Сегодня» можно взять прямо отсюда — или заглянуть в раздел Контракты.",
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
    id: "shop",
    eyebrowRu: "Раздел · Магазин",
    titleRu: "Угольки в дело",
    leadRu:
      "Трать угольки на пакеты тегов, игрушки и штуки у Госпожи. Полка избранного подпитывает предложения — лайки с сессий тоже считаются.",
    hintRu: "Не хватает угольков — сессии и контракты их приносят.",
    ctas: [
      { labelRu: "К избранному", nav: "favorites" },
      { labelRu: "К рулетке", nav: "roulette", primary: true },
    ],
  },
  {
    id: "contracts",
    eyebrowRu: "Раздел · Контракты",
    titleRu: "Доски на сегодня",
    leadRu:
      "Ежедневные контракты Госпожи: взять, выполнить, отчитаться. Часть заданий сеет параметры в Рулетку или вешает таймеры вне сессии.",
    hintRu: "Открытые на сегодня тоже видны в блоке «Сегодня» на Рулетке.",
    ctas: [
      { labelRu: "К «Сегодня»", nav: "roulette", primary: true },
    ],
  },
  {
    id: "diary",
    eyebrowRu: "Раздел · Дневник",
    titleRu: "Следы вечеров",
    leadRu:
      "Записи завершённых сессий: финал, настроение, сувенир. Можно пересмотреть план и снова бросить его на Рулетку.",
    hintRu: "Пусто? Сначала проведи сессию — запись появится сама.",
    ctas: [
      { labelRu: "К рулетке", nav: "roulette", primary: true },
      { labelRu: "К статистике", nav: "stats" },
    ],
  },
  {
    id: "stats",
    eyebrowRu: "Раздел · Статистика",
    titleRu: "Цифры по следам",
    leadRu:
      "Сводка по дневнику: сколько сессий, минут, эджей и срывов за выбранный период. Переключай диапазон сверху.",
    hintRu: "Данные берутся из Дневника — без записей график пустой.",
    ctas: [
      { labelRu: "К дневнику", nav: "diary", primary: true },
    ],
  },
  {
    id: "achievements",
    eyebrowRu: "Раздел · Достижения",
    titleRu: "Ступени и угольки",
    leadRu:
      "Наборы ачивок копятся от сессий, контрактов и привычек. Уровни дают угольки и иногда открывают контент.",
    hintRu: "Кнопка действия у ачивки подскажет, куда идти дальше.",
    ctas: [
      { labelRu: "К рулетке", nav: "roulette", primary: true },
      { labelRu: "В магазин", nav: "shop" },
    ],
  },
  {
    id: "favorites",
    eyebrowRu: "Раздел · Избранное",
    titleRu: "Полка вкуса",
    leadRu:
      "Лайкнутое медиа и теги. Типы тегов и паспорт вкуса кормят Магазин и ставки на Рулетке.",
    hintRu: "Пустая полка — лайкай во время сессий или подгружай избранное в Магазине.",
    ctas: [
      { labelRu: "В магазин", nav: "shop", primary: true },
      { labelRu: "К рулетке", nav: "roulette" },
    ],
  },
  {
    id: "settings",
    eyebrowRu: "Раздел · Настройки",
    titleRu: "Слоты и голос",
    leadRu:
      "Сейвы, медиа (Gelbooru), голос/TTS, бэкап прогресса. Слот «Песочница» — тренировка без прогресса основного сейва.",
    hintRu: "«Вечерний маршрут» и подсказки разделов можно снова открыть отсюда.",
    ctas: [{ labelRu: "К рулетке", nav: "roulette", primary: true }],
  },
];

export function isBriefableNav(id: NavId): id is BriefableNavId {
  return (BRIEFABLE_NAV_IDS as readonly string[]).includes(id);
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
