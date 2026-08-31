/** Lifetime session counters + leveled achievements showcase. */

import { reportPersistFailure } from "./persistFailure";
import {
  isMistressIdUnlocked,
  type MistressUnlockSnapshot,
} from "./mistress/mistressUnlocks";
import type { MistressId } from "./mistress/types";
import {
  countDiaryAteCum,
  countDiarySmearCum,
  entryCumFate,
  loadDiaryEntries,
  resolveCumFate,
  type DiaryEntry,
} from "./sessionDiary";
import type { SessionEvent, SessionMode, SessionState } from "./types";

const STORAGE_KEY = "joi-achievements-v1";

const MISTRESS_IDS: MistressId[] = [
  "hu_tao",
  "furina",
  "sunna",
  "sparkle",
];

export type LifetimeCounters = {
  sessionsStarted: number;
  sessionsCompleted: number;
  sessionsAborted: number;
  sessionSec: number;
  /** Metronome beats in stroke / onahole modes */
  strokes: number;
  /** Metronome beats in anal mode */
  analThrusts: number;
  /** Completed sessions that used chastity mode */
  chastitySessionsCompleted: number;
  /** Completed sessions with each mistress active */
  sessionsHuTao: number;
  sessionsFurina: number;
  sessionsSunna: number;
  sessionsSparkle: number;
  /** Completed sessions in CBT mode (Tide identity) */
  cbtSessionsCompleted: number;
  /** Completed sessions in oral mode (Idol identity) */
  oralSessionsCompleted: number;
  /** How many mistress packs are unlocked (1–4) */
  mistressesUnlocked: number;
  edges: number;
  ruins: number;
  holds: number;
  unauthorized: number;
  vibeSec: number;
  cageHours: number;
  denialHours: number;
  ateCum: number;
  smearCum: number;
  cumplayDone: number;
  finalesCum: number;
  finalesRuin: number;
  finalesDeny: number;
  /** Prompts answered while Hu Tao is active */
  promptsAnswered: number;
  daresDone: number;
  promisesKept: number;
  questsCompleted: number;
  cindersEarned: number;
  /** Successful breath-hold challenges */
  breathHolds: number;
  /** Self-reported Tide / CBT hits */
  tideHits: number;
  /** Ladder blocks completed */
  ladders: number;
  /** Countdown blocks completed */
  countdowns: number;
  /** Dice chaos rolls survived */
  diceRolls: number;
  /** Toys equipped mid-session via mistress prompt */
  toysEquipped: number;
  /** Timer-tease freezes endured */
  timerTeases: number;
  /** Completed sessions by mode identity */
  sessionsStroke: number;
  sessionsAnal: number;
  sessionsOnahole: number;
  sessionsProne: number;
  /** Sessions lasting ≥ 40 minutes */
  marathonSessions: number;
  /** Runner mini-game: runs started */
  runnerRuns: number;
  /** Runner mini-game: runs finished (boss beaten) */
  runnerWins: number;
  /** Runner mini-game: bosses defeated */
  runnerBosses: number;
  /** Runner mini-game: finished runs with zero red gates */
  runnerCleanRuns: number;
  /** Runner mini-game: largest crowd delivered to the finish */
  runnerBestCrowd: number;
};

export type AchievementId =
  | "sessions"
  | "time"
  | "strokes"
  | "anal"
  | "edges"
  | "ruins"
  | "holds"
  | "vibe"
  | "cage"
  | "denial"
  | "ate_cum"
  | "smear"
  | "cumplay"
  | "finale_cum"
  | "finale_ruin"
  | "finale_deny"
  | "prompts"
  | "dares"
  | "promises"
  | "quests"
  | "unauthorized"
  | "cinders"
  | "girl_hu_tao"
  | "girl_furina"
  | "girl_sunna"
  | "girl_sparkle"
  | "cbt"
  | "oral"
  | "harem"
  | "breath"
  | "tide"
  | "ladders"
  | "countdowns"
  | "dice"
  | "toys"
  | "tease"
  | "mode_stroke"
  | "mode_anal"
  | "mode_onahole"
  | "mode_prone"
  | "marathon"
  | "runner_boss"
  | "runner_wins"
  | "runner_clean"
  | "runner_crowd";

/**
 * Showcase groups (UI order):
 * sessions → control → modes → ritual → mistress
 */
export type AchievementSet =
  | "sessions"
  | "control"
  | "modes"
  | "ritual"
  | "mistress"
  | "minigames";

export type AchievementDef = {
  id: AchievementId;
  nameRu: string;
  blurbRu: string;
  /** Counter key driving progress */
  counter: keyof LifetimeCounters;
  /** Thresholds for levels 1..n (cumulative) */
  tiers: number[];
  unit: "count" | "sec" | "hours";
  glyph: string;
  accent: string;
  /** Showcase grouping — required so nothing falls into a random bucket */
  set: AchievementSet;
};

export type AchievementsState = {
  counters: LifetimeCounters;
  /** One-time diary backfill done */
  migratedFromDiary: boolean;
  /** Per-mistress / CBT / oral counters backfilled from diary */
  migratedGirlCounters?: boolean;
  /** Mode-session counters (stroke/anal/onahole/prone/marathon) from diary */
  migratedModeSessions?: boolean;
  /**
   * Raise ateCum to match diary after cumFate patches
   * (e.g. ruin session corrected to «съел»).
   */
  migratedAteCumDiarySync?: boolean;
  /**
   * Align smearCum with diary (kiss_palm etc. no longer count as smear).
   * May lower the counter.
   */
  migratedSmearCumDiarySync?: boolean;
};

export type AchievementProgress = {
  def: AchievementDef;
  value: number;
  level: number;
  /** Next tier target, or null if maxed */
  nextTier: number | null;
  /** 0..1 toward next tier (1 if maxed) */
  progress: number;
  unlocked: boolean;
};

export function emptyCounters(): LifetimeCounters {
  return {
    sessionsStarted: 0,
    sessionsCompleted: 0,
    sessionsAborted: 0,
    sessionSec: 0,
    strokes: 0,
    analThrusts: 0,
    chastitySessionsCompleted: 0,
    sessionsHuTao: 0,
    sessionsFurina: 0,
    sessionsSunna: 0,
    sessionsSparkle: 0,
    cbtSessionsCompleted: 0,
    oralSessionsCompleted: 0,
    mistressesUnlocked: 0,
    edges: 0,
    ruins: 0,
    holds: 0,
    unauthorized: 0,
    vibeSec: 0,
    cageHours: 0,
    denialHours: 0,
    ateCum: 0,
    smearCum: 0,
    cumplayDone: 0,
    finalesCum: 0,
    finalesRuin: 0,
    finalesDeny: 0,
    promptsAnswered: 0,
    daresDone: 0,
    promisesKept: 0,
    questsCompleted: 0,
    cindersEarned: 0,
    breathHolds: 0,
    tideHits: 0,
    ladders: 0,
    countdowns: 0,
    diceRolls: 0,
    toysEquipped: 0,
    timerTeases: 0,
    sessionsStroke: 0,
    sessionsAnal: 0,
    sessionsOnahole: 0,
    sessionsProne: 0,
    marathonSessions: 0,
    runnerRuns: 0,
    runnerWins: 0,
    runnerBosses: 0,
    runnerCleanRuns: 0,
    runnerBestCrowd: 0,
  };
}

export function emptyAchievements(): AchievementsState {
  return {
    counters: emptyCounters(),
    migratedFromDiary: false,
    migratedGirlCounters: false,
    migratedModeSessions: false,
  };
}

/** Showcase catalog — ordered by set, then by theme within the set. */
export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // —— Сессии ——
  {
    id: "sessions",
    nameRu: "Верный питомец",
    blurbRu: "Завершённые сессии с госпожой",
    counter: "sessionsCompleted",
    tiers: [1, 5, 15, 40, 100, 250],
    unit: "count",
    glyph: "★",
    accent: "#ff8a4a",
    set: "sessions",
  },
  {
    id: "time",
    nameRu: "Часы в лабе",
    blurbRu: "Суммарное время сессий",
    counter: "sessionSec",
    tiers: [600, 3600, 10_800, 36_000, 108_000, 360_000],
    unit: "sec",
    glyph: "⏱",
    accent: "#c4a06a",
    set: "sessions",
  },
  {
    id: "marathon",
    nameRu: "Марафонец",
    blurbRu: "Сессии длиной 40+ минут",
    counter: "marathonSessions",
    tiers: [1, 3, 10, 25, 60, 150],
    unit: "count",
    glyph: "⏳",
    accent: "#c4a06a",
    set: "sessions",
  },
  {
    id: "cinders",
    nameRu: "Угольная жатва",
    blurbRu: "Угольки, заработанные в сессиях и квестах",
    counter: "cindersEarned",
    tiers: [50, 200, 800, 2500, 8000, 25_000],
    unit: "count",
    glyph: "✦",
    accent: "#ff8a4a",
    set: "sessions",
  },
  {
    id: "cage",
    nameRu: "Пленник клетки",
    blurbRu: "Часы в клетке по приговору",
    counter: "cageHours",
    tiers: [1, 6, 24, 72, 168, 500],
    unit: "hours",
    glyph: "⬡",
    accent: "#6a8cff",
    set: "sessions",
  },
  {
    id: "denial",
    nameRu: "Отказник",
    blurbRu: "Часы отказа / denial-квестов",
    counter: "denialHours",
    tiers: [1, 12, 48, 120, 336, 1000],
    unit: "hours",
    glyph: "⊘",
    accent: "#8a6a9a",
    set: "sessions",
  },

  // —— Контроль грани ——
  {
    id: "edges",
    nameRu: "На грани",
    blurbRu: "Подтверждённые эджи",
    counter: "edges",
    tiers: [10, 50, 150, 500, 1500, 5000],
    unit: "count",
    glyph: "✦",
    accent: "#ff6b4a",
    set: "control",
  },
  {
    id: "holds",
    nameRu: "Железная воля",
    blurbRu: "Удержания на грани (hold)",
    counter: "holds",
    tiers: [1, 5, 25, 80, 250, 800],
    unit: "count",
    glyph: "▣",
    accent: "#d4a017",
    set: "control",
  },
  {
    id: "ruins",
    nameRu: "Разрушитель",
    blurbRu: "Руины по приказу",
    counter: "ruins",
    tiers: [3, 15, 50, 150, 400, 1200],
    unit: "count",
    glyph: "✝",
    accent: "#e07272",
    set: "control",
  },
  {
    id: "breath",
    nameRu: "Затаи дыхание",
    blurbRu: "Успешные breath-hold челленджи",
    counter: "breathHolds",
    tiers: [1, 5, 20, 60, 150, 400],
    unit: "count",
    glyph: "∿",
    accent: "#6ec6ff",
    set: "control",
  },
  {
    id: "ladders",
    nameRu: "Лестница темпа",
    blurbRu: "Пройденные ladder-кластеры",
    counter: "ladders",
    tiers: [1, 5, 20, 60, 150, 400],
    unit: "count",
    glyph: "☰",
    accent: "#e6b422",
    set: "control",
  },
  {
    id: "countdowns",
    nameRu: "Обратный отсчёт",
    blurbRu: "Завершённые countdown-блоки",
    counter: "countdowns",
    tiers: [1, 5, 20, 60, 150, 400],
    unit: "count",
    glyph: "3",
    accent: "#ff8a4a",
    set: "control",
  },
  {
    id: "dice",
    nameRu: "Кости судьбы",
    blurbRu: "Броски dice chaos",
    counter: "diceRolls",
    tiers: [1, 5, 20, 60, 150, 400],
    unit: "count",
    glyph: "⚄",
    accent: "#c45c8a",
    set: "control",
  },
  {
    id: "tease",
    nameRu: "Замороженный таймер",
    blurbRu: "Паузы таймера от госпожи (timer tease)",
    counter: "timerTeases",
    tiers: [1, 5, 20, 60, 150, 400],
    unit: "count",
    glyph: "❄",
    accent: "#8ec8e8",
    set: "control",
  },
  {
    id: "unauthorized",
    nameRu: "Нарушитель",
    blurbRu: "Срывы без приказа",
    counter: "unauthorized",
    tiers: [1, 5, 20, 60, 150, 400],
    unit: "count",
    glyph: "⚠",
    accent: "#e04545",
    set: "control",
  },

  // —— Режимы и ритм ——
  {
    id: "mode_stroke",
    nameRu: "Классика Ember",
    blurbRu: "Завершённые сессии в режиме дрочки",
    counter: "sessionsStroke",
    tiers: [1, 5, 15, 40, 100, 250],
    unit: "count",
    glyph: "〰",
    accent: "#ff8a4a",
    set: "modes",
  },
  {
    id: "mode_onahole",
    nameRu: "Честная дырка",
    blurbRu: "Завершённые сессии в режиме онахол",
    counter: "sessionsOnahole",
    tiers: [1, 3, 10, 30, 80, 200],
    unit: "count",
    glyph: "◎",
    accent: "#e8a050",
    set: "modes",
  },
  {
    id: "mode_anal",
    nameRu: "Глубина",
    blurbRu: "Завершённые сессии в анальном режиме",
    counter: "sessionsAnal",
    tiers: [1, 3, 10, 30, 80, 200],
    unit: "count",
    glyph: "◆",
    accent: "#c45c8a",
    set: "modes",
  },
  {
    id: "cbt",
    nameRu: "Суд боли",
    blurbRu: "Сессии в режиме CBT",
    counter: "cbtSessionsCompleted",
    tiers: [1, 3, 10, 30, 80, 200],
    unit: "count",
    glyph: "⚖",
    accent: "#4d8dff",
    set: "modes",
  },
  {
    id: "mode_prone",
    nameRu: "Бёдра к полу",
    blurbRu: "Завершённые сессии в режиме prone",
    counter: "sessionsProne",
    tiers: [1, 3, 10, 30, 80, 200],
    unit: "count",
    glyph: "▬",
    accent: "#4d8dff",
    set: "modes",
  },
  {
    id: "oral",
    nameRu: "Горло по расписанию",
    blurbRu: "Сессии в оральном режиме",
    counter: "oralSessionsCompleted",
    tiers: [1, 3, 10, 30, 80, 200],
    unit: "count",
    glyph: "○",
    accent: "#7ddbb5",
    set: "modes",
  },
  {
    id: "strokes",
    nameRu: "Удары метронома",
    blurbRu: "Биты в дрочке / онахол / CBT / oral / prone",
    counter: "strokes",
    tiers: [500, 1500, 5000, 15_000, 50_000, 150_000],
    unit: "count",
    glyph: "〰",
    accent: "#e8a050",
    set: "modes",
  },
  {
    id: "anal",
    nameRu: "Анальный ритм",
    blurbRu: "Толчки под метроном в анальном режиме",
    counter: "analThrusts",
    tiers: [200, 800, 2500, 8000, 25_000, 80_000],
    unit: "count",
    glyph: "◆",
    accent: "#c45c8a",
    set: "modes",
  },
  {
    id: "tide",
    nameRu: "Прилив ударов",
    blurbRu: "Tide / CBT hits по счётчику",
    counter: "tideHits",
    tiers: [20, 100, 400, 1200, 4000, 12_000],
    unit: "count",
    glyph: "≋",
    accent: "#4d8dff",
    set: "modes",
  },
  {
    id: "vibe",
    nameRu: "Жужжащий раб",
    blurbRu: "Время под вибрацией",
    counter: "vibeSec",
    tiers: [300, 1800, 7200, 21_600, 72_000, 216_000],
    unit: "sec",
    glyph: "≋",
    accent: "#9b7bff",
    set: "modes",
  },
  {
    id: "toys",
    nameRu: "Арсенал",
    blurbRu: "Игрушки, надетые по приказу mid-session",
    counter: "toysEquipped",
    tiers: [1, 5, 20, 60, 150, 400],
    unit: "count",
    glyph: "⚒",
    accent: "#a08060",
    set: "modes",
  },

  // —— Финал и ритуалы ——
  {
    id: "finale_cum",
    nameRu: "Разрешение",
    blurbRu: "Финалы с правом кончить",
    counter: "finalesCum",
    tiers: [1, 5, 15, 40, 100, 250],
    unit: "count",
    glyph: "▲",
    accent: "#3dd68c",
    set: "ritual",
  },
  {
    id: "finale_ruin",
    nameRu: "Почти…",
    blurbRu: "Финалы-руины",
    counter: "finalesRuin",
    tiers: [1, 5, 15, 40, 100, 250],
    unit: "count",
    glyph: "▽",
    accent: "#e07272",
    set: "ritual",
  },
  {
    id: "finale_deny",
    nameRu: "Отказ у финиша",
    blurbRu: "Финалы с полным отказом",
    counter: "finalesDeny",
    tiers: [1, 3, 10, 30, 80, 200],
    unit: "count",
    glyph: "✕",
    accent: "#a06070",
    set: "ritual",
  },
  {
    id: "cumplay",
    nameRu: "Ритуалист",
    blurbRu: "Завершённые cumplay-ритуалы",
    counter: "cumplayDone",
    tiers: [1, 5, 20, 60, 150, 400],
    unit: "count",
    glyph: "❀",
    accent: "#f0a0c0",
    set: "ritual",
  },
  {
    id: "ate_cum",
    nameRu: "Проглотил",
    blurbRu: "Сколько раз съел сперму",
    counter: "ateCum",
    tiers: [1, 5, 15, 40, 100, 300],
    unit: "count",
    glyph: "◉",
    accent: "#e8c4a0",
    set: "ritual",
  },
  {
    id: "smear",
    nameRu: "Размазня",
    blurbRu: "Размазал / показал — без глотка",
    counter: "smearCum",
    tiers: [1, 5, 20, 60, 150, 400],
    unit: "count",
    glyph: "◌",
    accent: "#ffb070",
    set: "ritual",
  },

  // —— Госпожи и задания ——
  {
    id: "girl_hu_tao",
    nameRu: "Эмбер-клятва",
    blurbRu: "Завершённые сессии с Ху Тао",
    counter: "sessionsHuTao",
    tiers: [1, 5, 15, 40, 100, 250],
    unit: "count",
    glyph: "火",
    accent: "#ff8a4a",
    set: "mistress",
  },
  {
    id: "girl_furina",
    nameRu: "Придворный Tide",
    blurbRu: "Завершённые сессии с Фуриной",
    counter: "sessionsFurina",
    tiers: [1, 5, 15, 40, 100, 250],
    unit: "count",
    glyph: "〜",
    accent: "#4d8dff",
    set: "mistress",
  },
  {
    id: "girl_sunna",
    nameRu: "Фанат айдола",
    blurbRu: "Завершённые сессии с Санной",
    counter: "sessionsSunna",
    tiers: [1, 5, 15, 40, 100, 250],
    unit: "count",
    glyph: "♪",
    accent: "#f5a6c8",
    set: "mistress",
  },
  {
    id: "girl_sparkle",
    nameRu: "Mask Circus",
    blurbRu: "Завершённые сессии с Искоркой / Искрой",
    counter: "sessionsSparkle",
    tiers: [1, 5, 15, 40, 100, 250],
    unit: "count",
    glyph: "◈",
    accent: "#c41e3a",
    set: "mistress",
  },
  {
    id: "harem",
    nameRu: "Полный гарем",
    blurbRu: "Сколько госпож открыто в витрине",
    counter: "mistressesUnlocked",
    tiers: [2, 3, 4],
    unit: "count",
    glyph: "♛",
    accent: "#f0d78c",
    set: "mistress",
  },
  {
    id: "prompts",
    nameRu: "Послушный рот",
    blurbRu: "Ответы на вопросы Ху Тао",
    counter: "promptsAnswered",
    tiers: [10, 50, 150, 400, 1000, 3000],
    unit: "count",
    glyph: "?",
    accent: "#ffc48a",
    set: "mistress",
  },
  {
    id: "dares",
    nameRu: "Сорвиголова",
    blurbRu: "Выполненные dare-задания",
    counter: "daresDone",
    tiers: [3, 15, 50, 150, 400, 1000],
    unit: "count",
    glyph: "!",
    accent: "#ff7a5c",
    set: "mistress",
  },
  {
    id: "promises",
    nameRu: "Клятва",
    blurbRu: "Сдержанные обещания (promise)",
    counter: "promisesKept",
    tiers: [1, 5, 20, 60, 150, 400],
    unit: "count",
    glyph: "♡",
    accent: "#e8a0b8",
    set: "mistress",
  },
  {
    id: "quests",
    nameRu: "Охотник за угольками",
    blurbRu: "Выполненные квесты",
    counter: "questsCompleted",
    tiers: [1, 5, 20, 60, 150, 400],
    unit: "count",
    glyph: "♦",
    accent: "#3dd68c",
    set: "mistress",
  },
  // —— Мини-игры (раннер) ——
  {
    id: "runner_boss",
    nameRu: "Первая кровь босса",
    blurbRu: "Боссы, смешанные с асфальтом в пробеге толпы",
    counter: "runnerBosses",
    tiers: [1, 5, 15, 40],
    unit: "count",
    glyph: "☠",
    accent: "#ff5a4e",
    set: "minigames",
  },
  {
    id: "runner_wins",
    nameRu: "Доставщик толпы",
    blurbRu: "Забеги, доведённые до финиша",
    counter: "runnerWins",
    tiers: [1, 10, 25, 60],
    unit: "count",
    glyph: "🏃",
    accent: "#ff8a4a",
    set: "minigames",
  },
  {
    id: "runner_clean",
    nameRu: "Чистый пробег",
    blurbRu: "Финиши без единого красного ворот",
    counter: "runnerCleanRuns",
    tiers: [1, 5, 15],
    unit: "count",
    glyph: "✨",
    accent: "#3dd68c",
    set: "minigames",
  },
  {
    id: "runner_crowd",
    nameRu: "Толпа-легенда",
    blurbRu: "Самая большая толпа, доведённая до финиша",
    counter: "runnerBestCrowd",
    tiers: [25, 75, 150],
    unit: "count",
    glyph: "👥",
    accent: "#ffd23e",
    set: "minigames",
  },
];

/** UI group titles + order for the achievements page. */
export const ACHIEVEMENT_SET_ORDER: {
  id: AchievementSet;
  titleRu: string;
}[] = [
  { id: "sessions", titleRu: "Сессии" },
  { id: "control", titleRu: "Контроль грани" },
  { id: "modes", titleRu: "Режимы и ритм" },
  { id: "ritual", titleRu: "Финал и ритуалы" },
  { id: "mistress", titleRu: "Госпожи и задания" },
  { id: "minigames", titleRu: "Мини-игры" },
];

function normalizeCounters(raw: unknown): LifetimeCounters {
  const base = emptyCounters();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof LifetimeCounters)[]) {
    const n = o[key];
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) {
      base[key] = Math.floor(n);
    }
  }
  return base;
}

export function loadAchievements(): AchievementsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyAchievements();
    const parsed = JSON.parse(raw) as Partial<AchievementsState>;
    return {
      counters: normalizeCounters(parsed.counters),
      migratedFromDiary: parsed.migratedFromDiary === true,
      migratedGirlCounters: parsed.migratedGirlCounters === true,
      migratedModeSessions: parsed.migratedModeSessions === true,
    };
  } catch {
    return emptyAchievements();
  }
}

export function saveAchievements(state: AchievementsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    reportPersistFailure("прогресс достижений");
  }
}

/** Facts about one finished runner run, for the mini-game counters. */
export interface RunnerRunFacts {
  /** Run reached the finish line (boss beaten). */
  survived: boolean;
  /** Boss crowd was defeated this run. */
  bossDefeated: boolean;
  /** Survived with zero red gates taken. */
  clean: boolean;
  /** Crowd size delivered at the finish (0 when wiped). */
  crowd: number;
}

/** Fold a finished runner run into the achievements state (pure). */
export function applyRunnerRun(
  state: AchievementsState,
  r: RunnerRunFacts,
): AchievementsState {
  const clean = r.survived && r.clean;
  const crowd = r.survived ? Math.max(0, Math.floor(r.crowd)) : 0;
  return {
    ...state,
    counters: {
      ...state.counters,
      runnerRuns: state.counters.runnerRuns + 1,
      runnerWins: state.counters.runnerWins + (r.survived ? 1 : 0),
      runnerBosses: state.counters.runnerBosses + (r.bossDefeated ? 1 : 0),
      runnerCleanRuns: state.counters.runnerCleanRuns + (clean ? 1 : 0),
      runnerBestCrowd: Math.max(state.counters.runnerBestCrowd, crowd),
    },
  };
}

function addCounters(
  a: LifetimeCounters,
  delta: Partial<LifetimeCounters>,
): LifetimeCounters {
  const next = { ...a };
  for (const [k, v] of Object.entries(delta) as [
    keyof LifetimeCounters,
    number,
  ][]) {
    if (typeof v === "number" && v !== 0) {
      next[k] = Math.max(0, next[k] + Math.floor(v));
    }
  }
  return next;
}

export function levelForValue(tiers: number[], value: number): number {
  let level = 0;
  for (const t of tiers) {
    if (value >= t) level += 1;
    else break;
  }
  return level;
}

export function progressFor(
  def: AchievementDef,
  counters: LifetimeCounters,
): AchievementProgress {
  const value = counters[def.counter] ?? 0;
  const level = levelForValue(def.tiers, value);
  const nextTier = level < def.tiers.length ? def.tiers[level]! : null;
  const prevTier = level > 0 ? def.tiers[level - 1]! : 0;
  let progress = 1;
  if (nextTier != null) {
    const span = Math.max(1, nextTier - prevTier);
    progress = Math.min(1, Math.max(0, (value - prevTier) / span));
  }
  return {
    def,
    value,
    level,
    nextTier,
    progress,
    unlocked: level > 0,
  };
}

export function listAchievementProgress(
  counters: LifetimeCounters,
  set?: AchievementSet,
): AchievementProgress[] {
  const defs =
    set == null
      ? ACHIEVEMENT_DEFS
      : ACHIEVEMENT_DEFS.filter((d) => d.set === set);
  return defs
    .map((def) => progressFor(def, counters))
    .sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      if (b.level !== a.level) return b.level - a.level;
      return a.def.nameRu.localeCompare(b.def.nameRu, "ru");
    });
}

export function countUnlockedMistresses(
  unlocks: MistressUnlockSnapshot,
): number {
  return MISTRESS_IDS.filter((id) => isMistressIdUnlocked(id, unlocks))
    .length;
}

function sessionMistressCounter(
  id: MistressId,
): keyof LifetimeCounters | null {
  switch (id) {
    case "hu_tao":
      return "sessionsHuTao";
    case "furina":
      return "sessionsFurina";
    case "sunna":
      return "sessionsSunna";
    case "sparkle":
      return "sessionsSparkle";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

function resolveDiaryMistressId(entry: DiaryEntry): MistressId {
  if (
    entry.mistressId === "hu_tao" ||
    entry.mistressId === "furina" ||
    entry.mistressId === "sunna" ||
    entry.mistressId === "sparkle"
  ) {
    return entry.mistressId;
  }
  return "hu_tao";
}

export function formatCounterValue(
  value: number,
  unit: AchievementDef["unit"],
): string {
  if (unit === "hours") {
    if (value < 1) return `${Math.round(value * 60)} мин`;
    if (value < 48) return `${formatNum(value)} ч`;
    return `${formatNum(value / 24)} д`;
  }
  if (unit === "sec") {
    if (value < 60) return `${value} с`;
    const min = value / 60;
    if (min < 120) return `${formatNum(min)} мин`;
    const h = min / 60;
    if (h < 48) return `${formatNum(h)} ч`;
    return `${formatNum(h / 24)} д`;
  }
  return formatNum(value);
}

function formatNum(n: number): string {
  if (n >= 1000) {
    return new Intl.NumberFormat("ru-RU", {
      maximumFractionDigits: n >= 10_000 ? 0 : 1,
    }).format(n);
  }
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: Number.isInteger(n) ? 0 : 1,
  }).format(n);
}

function resolveAteCumYes(
  events: SessionEvent[],
  cumplayId: string,
  finaleOutcome?: SessionState["finaleOutcome"],
): boolean {
  return resolveCumFate(events, cumplayId, finaleOutcome) === "ate";
}

function resolveSmearYes(
  events: SessionEvent[],
  cumplayId: string,
  finaleOutcome?: SessionState["finaleOutcome"],
): boolean {
  const fate = resolveCumFate(events, cumplayId, finaleOutcome);
  return fate === "smear_face" || fate === "smear_body";
}

function countBeats(events: SessionEvent[]): number {
  let n = 0;
  for (const e of events) {
    if (e.type === "beat") n += 1;
  }
  return n;
}

function sumVibeSec(events: SessionEvent[]): number {
  const seen = new Set<string>();
  let sec = 0;
  for (const e of events) {
    if (e.type !== "vibe_level") continue;
    const key = `${e.blockId}:${e.segmentIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sec += Math.max(0, e.segmentDurationSec || 0);
  }
  return Math.floor(sec);
}

function modeBeatBucket(mode: SessionMode): "strokes" | "analThrusts" | null {
  if (mode === "anal") return "analThrusts";
  if (
    mode === "stroke" ||
    mode === "onahole" ||
    mode === "cbt" ||
    mode === "oral" ||
    mode === "prone" ||
    mode === "plapping"
  ) {
    return "strokes";
  }
  return null;
}

/** Build per-session deltas from runtime state + event log. */
export function tallySessionDeltas(opts: {
  state: SessionState;
  events: SessionEvent[];
  reason: "complete" | "abort";
  cindersEarned?: number;
  mistressId?: MistressId;
}): Partial<LifetimeCounters> {
  const { state, events, reason } = opts;
  const mistressId = opts.mistressId ?? "hu_tao";
  const beats = countBeats(events);
  const bucket = modeBeatBucket(state.params.mode);
  const cumplayId = state.params.cumplayId ?? "";
  const cumplayDone = events.some((e) => e.type === "mistress_cumplay_done");
  // Prefer session counter (always incremented); fall back to events for older runs.
  const holdsFromState = Math.max(0, state.holdsDone ?? 0);
  const holdsFromEvents = events.filter((e) => e.type === "hold_done").length;
  const holds = Math.max(holdsFromState, holdsFromEvents);
  const unauthorized = events.filter((e) => e.type === "unauthorized").length;
  const breathHolds = events.filter(
    (e) => e.type === "breath_done" && e.success,
  ).length;
  // Each auto accent emits tide_hit; block-end tide_hits is a summary (skip).
  const tideHits = events.filter((e) => e.type === "tide_hit").length;
  const ladders = events.filter(
    (e) => e.type === "block_start" && e.block.goal === "ladder",
  ).length;
  const countdownStarts = events.filter(
    (e) => e.type === "block_start" && e.block.goal === "countdown",
  ).length;
  const diceRolls = events.filter((e) => e.type === "dice_chaos").length;
  const toysEquipped = events.filter((e) => e.type === "mistress_equip").length;
  const timerTeases = events.filter(
    (e) => e.type === "timer_tease" && e.phase === "freeze",
  ).length;
  const promptsAnswered =
    mistressId === "hu_tao"
      ? events.filter((e) => e.type === "mistress_answer").length
      : 0;
  const daresDone = events.filter((e) => e.type === "mistress_dare_start").length;
  const promisesKept = events.filter(
    (e) =>
      e.type === "mistress_answer" &&
      e.promptId === "promise_cum_eat" &&
      e.optionId === "done",
  ).length;
  const questsCompleted = events.filter(
    (e) => e.type === "quest_completed",
  ).length;
  const questCinders = events.reduce((sum, e) => {
    if (e.type === "quest_completed") return sum + Math.max(0, e.reward);
    return sum;
  }, 0);

  let finalesCum = 0;
  let finalesRuin = 0;
  let finalesDeny = 0;
  const outcome = state.finaleOutcome;
  if (reason === "complete" && outcome === "cum") finalesCum = 1;
  if (reason === "complete" && outcome === "ruin") finalesRuin = 1;
  if (reason === "complete" && outcome === "deny") finalesDeny = 1;

  const completed = reason === "complete";
  const mode = state.params.mode;
  const elapsed = Math.max(0, Math.floor(state.elapsedSec));
  const delta: Partial<LifetimeCounters> = {
    sessionsStarted: 1,
    sessionsCompleted: completed ? 1 : 0,
    sessionsAborted: reason === "abort" ? 1 : 0,
    chastitySessionsCompleted: completed && mode === "chastity" ? 1 : 0,
    cbtSessionsCompleted: completed && mode === "cbt" ? 1 : 0,
    oralSessionsCompleted: completed && mode === "oral" ? 1 : 0,
    sessionsStroke: completed && mode === "stroke" ? 1 : 0,
    sessionsAnal: completed && mode === "anal" ? 1 : 0,
    sessionsOnahole: completed && mode === "onahole" ? 1 : 0,
    sessionsProne: completed && mode === "prone" ? 1 : 0,
    marathonSessions: completed && elapsed >= 40 * 60 ? 1 : 0,
    sessionSec: elapsed,
    edges: Math.max(0, state.edgesDone),
    ruins: Math.max(0, state.ruinsDone),
    holds,
    unauthorized,
    breathHolds,
    tideHits,
    ladders,
    countdowns: countdownStarts,
    diceRolls,
    toysEquipped,
    timerTeases,
    vibeSec: sumVibeSec(events),
    cageHours: Math.max(0, state.pendingCageHours ?? 0),
    denialHours: Math.max(0, state.pendingDenialHours ?? 0),
    ateCum: resolveAteCumYes(events, cumplayId, outcome) ? 1 : 0,
    smearCum: resolveSmearYes(events, cumplayId, outcome) ? 1 : 0,
    cumplayDone: cumplayDone ? 1 : 0,
    finalesCum,
    finalesRuin,
    finalesDeny,
    promptsAnswered,
    daresDone,
    promisesKept,
    questsCompleted,
    cindersEarned:
      Math.max(0, Math.floor(opts.cindersEarned ?? 0)) + questCinders,
  };

  if (completed) {
    const girlKey = sessionMistressCounter(mistressId);
    if (girlKey) delta[girlKey] = 1;
  }

  if (bucket) {
    delta[bucket] = beats;
  }

  return delta;
}

/** Угольки за взятие уровня N (1-based). */
export function cindersForAchievementLevel(level: number): number {
  const table = [0, 12, 28, 55, 100, 180, 320];
  if (level >= 1 && level < table.length) return table[level]!;
  if (level < 1) return 0;
  return Math.round(320 * Math.pow(1.45, level - 6));
}

export type AchievementLevelUp = {
  id: AchievementId;
  nameRu: string;
  level: number;
  cinders: number;
};

export function calcLevelUpRewards(
  before: LifetimeCounters,
  after: LifetimeCounters,
): { cinders: number; levelUps: AchievementLevelUp[] } {
  const levelUps: AchievementLevelUp[] = [];
  let cinders = 0;
  for (const def of ACHIEVEMENT_DEFS) {
    const prev = levelForValue(def.tiers, before[def.counter] ?? 0);
    const next = levelForValue(def.tiers, after[def.counter] ?? 0);
    for (let lv = prev + 1; lv <= next; lv++) {
      const reward = cindersForAchievementLevel(lv);
      cinders += reward;
      levelUps.push({
        id: def.id,
        nameRu: def.nameRu,
        level: lv,
        cinders: reward,
      });
    }
  }
  return { cinders, levelUps };
}

export type ApplyAchievementsResult = {
  state: AchievementsState;
  cindersReward: number;
  levelUps: AchievementLevelUp[];
};

export function applySessionToAchievements(
  state: AchievementsState,
  deltas: Partial<LifetimeCounters>,
): ApplyAchievementsResult {
  const before = state.counters;
  const after = addCounters(before, deltas);
  const { cinders, levelUps } = calcLevelUpRewards(before, after);
  const next: AchievementsState = {
    ...state,
    counters: after,
  };
  saveAchievements(next);
  return { state: next, cindersReward: cinders, levelUps };
}

/**
 * Backfill from diary. Completes get full session tallies; aborts only bump
 * sessionsStarted + sessionsAborted (never completed / mode / finale counters).
 */
function diaryToCounters(entries: DiaryEntry[]): Partial<LifetimeCounters> {
  const d: Partial<LifetimeCounters> = emptyCounters();
  for (const e of entries) {
    if (e.ended === "abort") {
      d.sessionsStarted = (d.sessionsStarted ?? 0) + 1;
      d.sessionsAborted = (d.sessionsAborted ?? 0) + 1;
      continue;
    }
    if (e.ended !== "complete") continue;
    d.sessionsStarted = (d.sessionsStarted ?? 0) + 1;
    d.sessionsCompleted = (d.sessionsCompleted ?? 0) + 1;
    d.sessionSec = (d.sessionSec ?? 0) + Math.max(0, e.elapsedSec);
    d.edges = (d.edges ?? 0) + Math.max(0, e.edgesDone);
    d.ruins = (d.ruins ?? 0) + Math.max(0, e.ruinsDone);
    const fate = entryCumFate(e);
    if (fate === "ate") d.ateCum = (d.ateCum ?? 0) + 1;
    if (fate === "smear_face" || fate === "smear_body") {
      d.smearCum = (d.smearCum ?? 0) + 1;
    }
    if (e.mode === "chastity") {
      d.chastitySessionsCompleted = (d.chastitySessionsCompleted ?? 0) + 1;
    }
    if (e.mode === "cbt") {
      d.cbtSessionsCompleted = (d.cbtSessionsCompleted ?? 0) + 1;
    }
    if (e.mode === "oral") {
      d.oralSessionsCompleted = (d.oralSessionsCompleted ?? 0) + 1;
    }
    if (e.mode === "stroke") d.sessionsStroke = (d.sessionsStroke ?? 0) + 1;
    if (e.mode === "anal") d.sessionsAnal = (d.sessionsAnal ?? 0) + 1;
    if (e.mode === "onahole") {
      d.sessionsOnahole = (d.sessionsOnahole ?? 0) + 1;
    }
    if (e.mode === "prone") d.sessionsProne = (d.sessionsProne ?? 0) + 1;
    if (e.elapsedSec >= 40 * 60) {
      d.marathonSessions = (d.marathonSessions ?? 0) + 1;
    }
    if (e.finaleOutcome === "cum") d.finalesCum = (d.finalesCum ?? 0) + 1;
    if (e.finaleOutcome === "ruin") d.finalesRuin = (d.finalesRuin ?? 0) + 1;
    if (e.finaleOutcome === "deny") d.finalesDeny = (d.finalesDeny ?? 0) + 1;
    const girlKey = sessionMistressCounter(resolveDiaryMistressId(e));
    if (girlKey) d[girlKey] = (d[girlKey] ?? 0) + 1;
  }
  return d;
}

/** Only the girl / identity counters — for users who already migrated core stats. */
function diaryToGirlCounters(entries: DiaryEntry[]): Partial<LifetimeCounters> {
  const d: Partial<LifetimeCounters> = {};
  for (const e of entries) {
    if (e.ended !== "complete") continue;
    if (e.mode === "cbt") {
      d.cbtSessionsCompleted = (d.cbtSessionsCompleted ?? 0) + 1;
    }
    if (e.mode === "oral") {
      d.oralSessionsCompleted = (d.oralSessionsCompleted ?? 0) + 1;
    }
    const girlKey = sessionMistressCounter(resolveDiaryMistressId(e));
    if (girlKey) d[girlKey] = (d[girlKey] ?? 0) + 1;
  }
  return d;
}

/** Mode / marathon counters from diary (for users who already migrated core). */
function diaryToModeSessionCounters(
  entries: DiaryEntry[],
): Partial<LifetimeCounters> {
  const d: Partial<LifetimeCounters> = {};
  for (const e of entries) {
    if (e.ended !== "complete") continue;
    if (e.mode === "stroke") {
      d.sessionsStroke = (d.sessionsStroke ?? 0) + 1;
    } else if (e.mode === "anal") {
      d.sessionsAnal = (d.sessionsAnal ?? 0) + 1;
    } else if (e.mode === "onahole") {
      d.sessionsOnahole = (d.sessionsOnahole ?? 0) + 1;
    } else if (e.mode === "prone") {
      d.sessionsProne = (d.sessionsProne ?? 0) + 1;
    }
    if (e.elapsedSec >= 40 * 60) {
      d.marathonSessions = (d.marathonSessions ?? 0) + 1;
    }
  }
  return d;
}

/**
 * Raise `mistressesUnlocked` to match wallet (awards harem levels if higher).
 * Safe to call after shop purchases / session end.
 */
export function syncMistressUnlockAchievements(
  state: AchievementsState,
  unlocks: MistressUnlockSnapshot,
): ApplyAchievementsResult {
  const target = countUnlockedMistresses(unlocks);
  const before = state.counters;
  if (before.mistressesUnlocked >= target) {
    return { state, cindersReward: 0, levelUps: [] };
  }
  const after: LifetimeCounters = {
    ...before,
    mistressesUnlocked: target,
  };
  const { cinders, levelUps } = calcLevelUpRewards(before, after);
  const next: AchievementsState = {
    ...state,
    counters: after,
  };
  saveAchievements(next);
  return { state: next, cindersReward: cinders, levelUps };
}

/** First launch: seed from diary so old sessions count toward levels. */
export function ensureAchievementsMigrated(
  state: AchievementsState = loadAchievements(),
  unlocks?: MistressUnlockSnapshot,
): AchievementsState {
  let next = state;
  if (!next.migratedFromDiary) {
    const fromDiary = diaryToCounters(loadDiaryEntries());
    next = {
      counters: addCounters(next.counters, fromDiary),
      migratedFromDiary: true,
      migratedGirlCounters: true,
      migratedModeSessions: true,
    };
  } else if (!next.migratedGirlCounters) {
    const girl = diaryToGirlCounters(loadDiaryEntries());
    next = {
      ...next,
      counters: addCounters(next.counters, girl),
      migratedGirlCounters: true,
    };
  }

  if (next.migratedFromDiary && !next.migratedModeSessions) {
    const modes = diaryToModeSessionCounters(loadDiaryEntries());
    next = {
      ...next,
      counters: addCounters(next.counters, modes),
      migratedModeSessions: true,
    };
  }

  if (!next.migratedAteCumDiarySync) {
    const diaryAte = countDiaryAteCum(loadDiaryEntries());
    const cur = next.counters.ateCum ?? 0;
    next = {
      ...next,
      counters:
        diaryAte > cur
          ? { ...next.counters, ateCum: diaryAte }
          : next.counters,
      migratedAteCumDiarySync: true,
    };
  }

  if (!next.migratedSmearCumDiarySync) {
    const diarySmear = countDiarySmearCum(loadDiaryEntries());
    const curSmear = next.counters.smearCum ?? 0;
    next = {
      ...next,
      counters:
        diarySmear !== curSmear
          ? { ...next.counters, smearCum: diarySmear }
          : next.counters,
      migratedSmearCumDiarySync: true,
    };
  }

  if (unlocks) {
    const unlocked = countUnlockedMistresses(unlocks);
    if (unlocked > next.counters.mistressesUnlocked) {
      next = {
        ...next,
        counters: {
          ...next.counters,
          mistressesUnlocked: unlocked,
        },
      };
    }
  }

  if (
    next.migratedFromDiary !== state.migratedFromDiary ||
    next.migratedGirlCounters !== state.migratedGirlCounters ||
    next.migratedModeSessions !== state.migratedModeSessions ||
    next.migratedAteCumDiarySync !== state.migratedAteCumDiarySync ||
    next.migratedSmearCumDiarySync !== state.migratedSmearCumDiarySync ||
    next.counters !== state.counters
  ) {
    saveAchievements(next);
  }
  return next;
}

export function totalLevels(counters: LifetimeCounters): number {
  return ACHIEVEMENT_DEFS.reduce(
    (sum, def) => sum + levelForValue(def.tiers, counters[def.counter] ?? 0),
    0,
  );
}

export function unlockedCount(counters: LifetimeCounters): number {
  return ACHIEVEMENT_DEFS.filter(
    (def) => levelForValue(def.tiers, counters[def.counter] ?? 0) > 0,
  ).length;
}
