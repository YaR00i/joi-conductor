import type { MistressId } from "../mistress/types";

export type ContractCategory =
  | "edge"
  | "media"
  | "cbt"
  | "anal"
  | "oral_cei"
  | "chastity"
  | "body"
  | "life"
  | "role"
  | "session_mod";

export type ContractRollKey =
  | "n"
  | "minutes"
  | "hours"
  | "tag"
  | "taps"
  | "pages"
  | "sec"
  | "limit";

/** Honor finish-permission questionnaire variant (see finishDebrief.ts). */
export type FinishDebriefPreset =
  | "cum_allowed"
  | "ruin_allowed"
  | "cei_required"
  | "choice"
  | "faproulette";

export type ContractDef = {
  id: string;
  category: ContractCategory;
  nameRu: string;
  briefRu: string;
  /** Placeholders: {n} {minutes} {hours} {tag} {taps} {pages} {sec} {limit} {trigger} {actionLabel} {timerMin} */
  instructionRu: string;
  difficulty: 1 | 2 | 3;
  durationHintMin?: number;
  /**
   * Explicit perform-window limit (minutes) for non-session contracts —
   * e.g. «иди на сайт и сделай X за 30 мин». When set, the accepted seal
   * gets a live countdown timer (performDeadlineMs = startedAtMs + limit).
   * Falls back to durationHintMin when omitted.
   */
  durationLimitMin?: number;
  rewardMin: number;
  rewardMax: number;
  rolls?: Partial<Record<ContractRollKey, (string | number)[]>>;
  /** Soft affinity for mistress play hints / preferred modes */
  biasHints?: string[];
  mistressBias?: MistressId[];
  /**
   * media_drill — guided Gelbooru cache + trigger report.
   * finish_debrief — honor finish permission + questionnaire on complete.
   */
  kind?: "media_drill" | "finish_debrief";
  /** Questionnaire preset when kind is finish_debrief */
  finishDebriefPreset?: FinishDebriefPreset;
  /**
   * Force the activity-debrief questionnaire (edge count / hold time / how
   * finished / post-action) after the contract is reported done. Useful for
   * non-session «go to a site and do X» contracts. See activityDebrief.ts.
   */
  requireActivityDebrief?: boolean;
  /**
   * When a user contract is cloned from a built-in, this stores the original
   * builtin id so the merge layer can substitute the clone for the builtin on
   * the daily board. Undefined on genuine built-ins and brand-new user defs.
   */
  clonedFrom?: string;
};

export const CONTRACT_CATEGORY_LABELS: Record<ContractCategory, string> = {
  edge: "Эджи",
  media: "Медиа",
  cbt: "CBT",
  anal: "Анал",
  oral_cei: "Oral / CEI",
  chastity: "Клетка",
  body: "Тело",
  life: "Быт",
  role: "Роль",
  session_mod: "Сессия",
};

const MEDIA_TAGS = [
  "ahegao",
  "mind_break",
  "corruption",
  "cei",
  "foot_focus",
  "bondage",
  "netorare",
  "femdom",
];

/** Quick filters on faproulette.co (English labels as on the site). */
const FAPROULETTE_FILTERS = [
  "Edging",
  "Anal",
  "Oral",
  "Cum Lovers",
  "Chastity",
  "Straight",
];

/** Out-of-session contract templates (honor + guided drills). */
export const CONTRACT_CATALOG: ContractDef[] = [
  // —— Edge ——
  {
    id: "edge_count",
    category: "edge",
    nameRu: "До грани",
    briefRu: "Эджи запечатаны",
    instructionRu:
      "Прими условия: в сессии набери {n} эджей. После каждого — руки прочь минимум 60 секунд. Пока печать активна, квота эджей в плане не меняется. Кончать нельзя до выполнения.",
    difficulty: 1,
    durationHintMin: 25,
    rewardMin: 8,
    rewardMax: 16,
    rolls: { n: [3, 5, 8, 10] },
    biasHints: ["stroke", "onahole", "edge"],
  },
  {
    id: "edge_metronome",
    category: "edge",
    nameRu: "Метроном",
    briefRu: "Эджи под ритм",
    instructionRu:
      "Прими условия: метроном 60–80 BPM, {n} эджей строго в такт. Сбился — эдж не считается. Печать держит квоту в плане до выполнения или отмены.",
    difficulty: 2,
    durationHintMin: 30,
    rewardMin: 12,
    rewardMax: 22,
    rolls: { n: [4, 6, 8] },
    biasHints: ["stroke", "combo"],
  },
  {
    id: "edge_hands_off",
    category: "edge",
    nameRu: "Hands-off",
    briefRu: "После эджа — тишина",
    instructionRu:
      "Прими условия: {n} эджей в сессии, после последнего — hands-off {minutes} минут. Никаких касаний. Квота эджей запечатана в плане.",
    difficulty: 2,
    durationHintMin: 40,
    rewardMin: 14,
    rewardMax: 24,
    rolls: { n: [3, 5], minutes: [10, 15, 20] },
    biasHints: ["stroke", "denial"],
  },
  {
    id: "edge_precum_day",
    category: "edge",
    nameRu: "Только прекум",
    briefRu: "Без полного оргазма",
    instructionRu:
      "Сегодня вне сессии можно только дойти до прекума. {n} подходов по 5–8 минут. Полноценный оргазм — провал контракта.",
    difficulty: 2,
    durationHintMin: 35,
    rewardMin: 12,
    rewardMax: 20,
    rolls: { n: [2, 3, 4] },
    biasHints: ["stroke", "tease"],
  },
  {
    id: "edge_slow",
    category: "edge",
    nameRu: "Медленная пытка",
    briefRu: "Медленные эджи · печать",
    instructionRu:
      "Прими условия: {n} эджей на минимальной скорости. Каждый подъём не короче 3 минут. Без рывков. Пока печать жива — квота в плане не крутится.",
    difficulty: 3,
    durationHintMin: 45,
    rewardMin: 18,
    rewardMax: 30,
    rolls: { n: [3, 4, 5] },
    biasHints: ["stroke", "slow"],
  },

  // —— Media ——
  {
    id: "media_porn_timer",
    category: "media",
    nameRu: "Таймер порно",
    briefRu: "Смотри, не кончай",
    instructionRu:
      "Смотри порно {minutes} минут с тегом/темой «{tag}». Руки можно, но без оргазма. Таймер на виду.",
    difficulty: 1,
    durationHintMin: 25,
    rewardMin: 8,
    rewardMax: 14,
    rolls: { minutes: [10, 20, 30], tag: MEDIA_TAGS },
    biasHints: ["media", "stroke"],
  },
  {
    id: "media_doujin",
    category: "media",
    nameRu: "Додзинси",
    briefRu: "Почитай по тегу",
    instructionRu:
      "Найди и прочитай {pages} страниц/глав додзинси или манги с тегом «{tag}». Кратко отметь в голове, что тебя задело.",
    difficulty: 1,
    durationHintMin: 30,
    rewardMin: 10,
    rewardMax: 18,
    rolls: { pages: [10, 20, 30], tag: MEDIA_TAGS },
    biasHints: ["hentai", "media"],
  },
  {
    id: "media_hunt",
    category: "media",
    nameRu: "Охота на картинки",
    briefRu: "Собери подборку",
    instructionRu:
      "Найди и сохрани в избранное {n} картинок с тегом «{tag}». Без дрочки дольше 2 минут суммарно.",
    difficulty: 1,
    durationHintMin: 20,
    rewardMin: 8,
    rewardMax: 14,
    rolls: { n: [5, 8, 12], tag: MEDIA_TAGS },
    biasHints: ["media"],
  },
  {
    id: "media_eyes_closed_joi",
    category: "media",
    nameRu: "JOI с закрытыми глазами",
    briefRu: "Только слух",
    instructionRu:
      "Закрой глаза (без повязок/ремней). Слушай JOI или аудио {minutes} минут. Дрочи только по голосу. Без оргазма.",
    difficulty: 2,
    durationHintMin: 25,
    rewardMin: 12,
    rewardMax: 20,
    rolls: { minutes: [15, 20, 25] },
    biasHints: ["stroke", "media"],
  },
  {
    id: "media_caption",
    category: "media",
    nameRu: "Капшены",
    briefRu: "Читай вслух",
    instructionRu:
      "{minutes} минут читай femdom/CEI-капшены или captions вслух. После каждого — «Спасибо, госпожа».",
    difficulty: 2,
    durationHintMin: 20,
    rewardMin: 10,
    rewardMax: 16,
    rolls: { minutes: [10, 15, 20] },
    biasHints: ["humiliation", "cei"],
  },
  {
    id: "media_cache_triggers",
    category: "media",
    nameRu: "Кэш и триггеры",
    briefRu: "Смотри колоду — наказывай себя",
    instructionRu:
      "Нажми «Начать»: загрузится кэш {limit} с тегом «{tag}». В Сессии без старта смотри слайды. За каждый кадр с «{trigger}» — {actionLabel}. У тебя {timerMin} мин. В конце доложи число триггеров.",
    difficulty: 2,
    durationHintMin: 25,
    rewardMin: 14,
    rewardMax: 24,
    rolls: { limit: [20, 40, 60] },
    biasHints: ["media", "stroke", "cbt"],
    kind: "media_drill",
  },
  {
    id: "media_cache_triggers_hard",
    category: "media",
    nameRu: "Длинный кэш",
    briefRu: "Больше кадров — жёстче таймер",
    instructionRu:
      "Нажми «Начать»: кэш {limit}, тег «{tag}». Без старта сессии. За каждый «{trigger}» — {actionLabel}. Таймер {timerMin} мин. В конце — число триггеров.",
    difficulty: 3,
    durationHintMin: 40,
    rewardMin: 18,
    rewardMax: 32,
    rolls: { limit: [60, 80] },
    biasHints: ["media", "cbt"],
    kind: "media_drill",
  },
  {
    id: "media_faproulette_spins",
    category: "media",
    nameRu: "Fap Roulette · броски",
    briefRu: "Крути — дрочи по картинке",
    instructionRu:
      "Открой faproulette.co, выбери любую рулетку. Сделай {n} бросков (Roll). На каждый кадр: читай инструкцию и дрочи по картинке, пока не выполнишь. Между бросками — короткая пауза. Оргазм = провал.",
    difficulty: 1,
    durationHintMin: 25,
    rewardMin: 10,
    rewardMax: 18,
    rolls: { n: [5, 8, 12] },
    biasHints: ["media", "stroke"],
  },
  {
    id: "media_faproulette_timer",
    category: "media",
    nameRu: "Fap Roulette · таймер",
    briefRu: "Минуты на рулетке",
    instructionRu:
      "Открой faproulette.co в браузере. {minutes} минут: Roll → читай инструкцию кадра → дрочи по картинке. Нельзя залипать на одном кадре дольше 2 минут — новый бросок. Оргазм / руин = провал. Таймер на виду.",
    difficulty: 1,
    durationHintMin: 30,
    rewardMin: 10,
    rewardMax: 16,
    rolls: { minutes: [15, 20, 30] },
    biasHints: ["media", "stroke"],
  },
  {
    id: "media_faproulette_filter",
    category: "media",
    nameRu: "Fap Roulette · фильтр",
    briefRu: "Тема с сайта",
    instructionRu:
      "На faproulette.co включи фильтр «{tag}» (или рулетку с этой темой). {n} бросков: каждый кадр — инструкция + дрочка по картинке. Сменить фильтр нельзя до конца. Оргазм = провал.",
    difficulty: 2,
    durationHintMin: 30,
    rewardMin: 12,
    rewardMax: 22,
    rolls: { n: [6, 8, 10], tag: FAPROULETTE_FILTERS },
    biasHints: ["media", "stroke"],
  },
  {
    id: "media_faproulette_edge",
    category: "media",
    nameRu: "Fap Roulette · эджи",
    briefRu: "Эдж с каждого кадра",
    instructionRu:
      "faproulette.co: крути рулетку. На каждый бросок доведи себя почти до грани по картинке (эдж), потом руки прочь {sec} сек. Нужно {n} таких эджей. Если инструкция кадра говорит «кончай» — игнорируй финиш, только эдж. Оргазм = провал.",
    difficulty: 2,
    durationHintMin: 35,
    rewardMin: 14,
    rewardMax: 24,
    rolls: { n: [4, 6, 8], sec: [30, 45, 60] },
    biasHints: ["media", "edge", "stroke"],
  },
  {
    id: "media_faproulette_pace",
    category: "media",
    nameRu: "Fap Roulette · темп",
    briefRu: "Hands-off между бросками",
    instructionRu:
      "faproulette.co: {n} бросков. После каждого кадра — hands-off {sec} секунд (смотри на картинку, не трогай). Потом следующий Roll. Дрочи только пока выполняешь инструкцию кадра. Без оргазма.",
    difficulty: 2,
    durationHintMin: 30,
    rewardMin: 12,
    rewardMax: 20,
    rolls: { n: [5, 7, 9], sec: [20, 40, 60] },
    biasHints: ["media", "denial", "stroke"],
  },
  {
    id: "media_faproulette_deny",
    category: "media",
    nameRu: "Fap Roulette · deny",
    briefRu: "Финиш с кадра — отказ",
    instructionRu:
      "faproulette.co: играй {minutes} минут или минимум {n} бросков (что позже). Дрочи по картинкам. Если выпало «кончай / cum / finish» — руки прочь, скажи «отказ, госпожа», и закончи контракт без оргазма. Если кончил — провал. Руин тоже запрещён.",
    difficulty: 3,
    durationHintMin: 35,
    rewardMin: 16,
    rewardMax: 28,
    rolls: { minutes: [15, 20, 25], n: [6, 8, 10] },
    biasHints: ["media", "denial", "stroke"],
  },
  {
    id: "media_faproulette_finish",
    category: "media",
    nameRu: "Fap Roulette · право финала",
    briefRu: "Отыграл — можно кончить",
    instructionRu:
      "faproulette.co: честно отыграй {n} бросков, дроча по картинкам. После последнего — право кончить или руинить (на твой выбор). Потом «Доложить финал»: как кончил, съел ли вкусняшку. Награда от нуля до бонуса — по ответам.",
    difficulty: 2,
    durationHintMin: 35,
    rewardMin: 12,
    rewardMax: 20,
    rolls: { n: [6, 8, 10] },
    biasHints: ["media", "stroke", "cei"],
    kind: "finish_debrief",
    finishDebriefPreset: "faproulette",
  },
  {
    id: "media_hypnotube_timer",
    category: "media",
    nameRu: "Hypnotube · таймер",
    briefRu: "Ролик на сайте, не в приложении",
    instructionRu:
      "Открой hypnotube.com (или зеркало). Выбери одно hypno/JOI-видео. {minutes} минут смотри и дрочи по инструкции ролика. Пауза = руки прочь. Оргазм / руин = провал. Потом доложи, сколько эджей удержал.",
    difficulty: 2,
    durationHintMin: 30,
    rewardMin: 12,
    rewardMax: 22,
    rolls: { minutes: [10, 15, 20] },
    biasHints: ["media", "stroke"],
    requireActivityDebrief: true,
  },
  {
    id: "media_hypnotube_loop",
    category: "media",
    nameRu: "Hypnotube · петля",
    briefRu: "Один ролик {n} раз",
    instructionRu:
      "hypnotube.com: одно видео. Прокрути его {n} раз подряд (или {minutes} мин, что позже). Каждый проход — полный follow голосовых команд, без перемотки «скучных» кусков. Финиш с ролика игнорируй. Оргазм = провал.",
    difficulty: 2,
    durationHintMin: 35,
    rewardMin: 14,
    rewardMax: 24,
    rolls: { n: [2, 3, 4], minutes: [12, 18, 24] },
    biasHints: ["media", "stroke"],
    requireActivityDebrief: true,
  },
  {
    id: "media_joi_site_follow",
    category: "media",
    nameRu: "JOI-сайт · следовать",
    briefRu: "Голос с сайта — закон",
    instructionRu:
      "Открой JOI на hypnotube / joi.how / похожем сайте (не плейлист в приложении). {minutes} минут делай ровно то, что говорит голос: темп, hands-off, край. Если велит кончить — только эдж, финиш запрещён. Оргазм = провал.",
    difficulty: 2,
    durationHintMin: 30,
    rewardMin: 12,
    rewardMax: 22,
    rolls: { minutes: [12, 18, 25] },
    biasHints: ["media", "stroke", "edge"],
    requireActivityDebrief: true,
  },
  {
    id: "media_joi_site_finish",
    category: "media",
    nameRu: "JOI-сайт · право финала",
    briefRu: "Отыграл ролик — можно кончить",
    instructionRu:
      "Полный JOI-ролик на hypnotube / joi.how до титров, без перемотки финала. Честно следуй голосу. После — «Доложить финал»: как кончил. Награда от нуля до бонуса — по ответам.",
    difficulty: 2,
    durationHintMin: 35,
    rewardMin: 12,
    rewardMax: 22,
    biasHints: ["media", "stroke"],
    kind: "finish_debrief",
    finishDebriefPreset: "choice",
  },

  // —— CBT ——
  {
    id: "cbt_taps",
    category: "cbt",
    nameRu: "Удары по яйцам",
    briefRu: "Счётчик шлепков",
    instructionRu:
      "Лёгкими контролируемыми ударами — {taps} раз по яйцам. Считай вслух. Без синяков ради «геройства».",
    difficulty: 2,
    durationHintMin: 10,
    rewardMin: 10,
    rewardMax: 18,
    rolls: { taps: [10, 20, 40] },
    biasHints: ["cbt"],
    mistressBias: ["furina"],
  },
  {
    id: "cbt_timer_slaps",
    category: "cbt",
    nameRu: "Таймер шлепков",
    briefRu: "Ритм боли",
    instructionRu:
      "Каждые 30 секунд — один шлепок по яйцам. Всего {minutes} минут. Между — руки на бёдрах.",
    difficulty: 2,
    durationHintMin: 15,
    rewardMin: 12,
    rewardMax: 20,
    rolls: { minutes: [5, 8, 10] },
    biasHints: ["cbt"],
    mistressBias: ["furina"],
  },
  {
    id: "cbt_ice",
    category: "cbt",
    nameRu: "Лёд",
    briefRu: "Холод на яйцах",
    instructionRu:
      "Лёд или очень холодный предмет к яйцам на {sec} секунд. {n} подходов с паузой 1 минута.",
    difficulty: 2,
    durationHintMin: 12,
    rewardMin: 10,
    rewardMax: 18,
    rolls: { sec: [15, 25, 40], n: [2, 3, 4] },
    biasHints: ["cbt"],
  },
  {
    id: "cbt_squeeze",
    category: "cbt",
    nameRu: "Сжатие",
    briefRu: "Давление без удара",
    instructionRu:
      "{n} раз сильно (но осознанно) сожми яйца на счёт до 5. Между — 20 секунд отдыха.",
    difficulty: 1,
    durationHintMin: 8,
    rewardMin: 8,
    rewardMax: 14,
    rolls: { n: [5, 8, 12] },
    biasHints: ["cbt"],
    mistressBias: ["furina"],
  },
  {
    id: "cbt_edge_pain",
    category: "cbt",
    nameRu: "Эдж + боль",
    briefRu: "Чередование",
    instructionRu:
      "Чередуй: эдж → {taps} лёгких шлепков. Повтори цикл {n} раз. Кончать нельзя.",
    difficulty: 3,
    durationHintMin: 30,
    rewardMin: 16,
    rewardMax: 28,
    rolls: { taps: [5, 8, 10], n: [3, 4, 5] },
    biasHints: ["cbt", "stroke"],
    mistressBias: ["furina"],
  },

  // —— Anal ——
  {
    id: "anal_plug_hours",
    category: "anal",
    nameRu: "Пробка на часы",
    briefRu: "Таймер вне сессии",
    instructionRu:
      "Прими условия — запустится таймер «Пробка» на {hours} ч. Носи анальную пробку (туалет ≤10 мин ок). Минимум движения по дому — не лежи всё время. «Снял» раньше срока = провал; дождись конца таймера = награда.",
    difficulty: 2,
    durationHintMin: 120,
    rewardMin: 14,
    rewardMax: 26,
    rolls: { hours: [1, 2, 3] },
    biasHints: ["anal"],
  },
  {
    id: "anal_workout_plug",
    category: "anal",
    nameRu: "Зарядка с пробкой",
    briefRu: "Реальные упражнения",
    instructionRu:
      "Пробка в жопе — не сессия Conductor. Мини-зарядка: {n} приседаний и {taps} отжиманий (или планка {sec} сек вместо отжиманий). Медленно, дыхание ровное. Оргазм = провал.",
    difficulty: 2,
    durationHintMin: 20,
    rewardMin: 14,
    rewardMax: 26,
    rolls: { n: [15, 20, 30], taps: [10, 15, 20], sec: [45, 60, 90] },
    biasHints: ["anal"],
  },
  {
    id: "anal_walk_plug",
    category: "anal",
    nameRu: "Ходьба с пробкой",
    briefRu: "Движение, не лежа",
    instructionRu:
      "Пробка в жопе. {minutes} минут ходи по дому / на месте / лёгкая разминка. Нельзя всё время сидеть или лежать. Без дрочки до конца прогулки.",
    difficulty: 1,
    durationHintMin: 25,
    rewardMin: 10,
    rewardMax: 18,
    rolls: { minutes: [15, 20, 30] },
    biasHints: ["anal"],
  },
  {
    id: "anal_stretch",
    category: "anal",
    nameRu: "Растяжка",
    briefRu: "Спокойная тренировка",
    instructionRu:
      "{minutes} минут анальной растяжки: маленькая пробка/пальцы, медленно, с лубрикантом. Без жёсткого траха.",
    difficulty: 1,
    durationHintMin: 20,
    rewardMin: 10,
    rewardMax: 16,
    rolls: { minutes: [10, 15, 20] },
    biasHints: ["anal"],
  },
  {
    id: "anal_chores_plug",
    category: "anal",
    nameRu: "Пробка + дела",
    briefRu: "Быт на пробке",
    instructionRu:
      "Пробка в жопе, пока делаешь {n} бытовых дела (мытьё, пыль, бельё…). Минимум {minutes} минут суммарно.",
    difficulty: 2,
    durationHintMin: 40,
    rewardMin: 12,
    rewardMax: 22,
    rolls: { n: [2, 3, 4], minutes: [30, 45, 60] },
    biasHints: ["anal", "humiliation"],
  },
  {
    id: "anal_beads",
    category: "anal",
    nameRu: "Бусы",
    briefRu: "Медленный ввод/вывод",
    instructionRu:
      "Анальные бусы или пробка: {n} медленных полных вводов-выводов. Считай вслух. Без оргазма.",
    difficulty: 2,
    durationHintMin: 15,
    rewardMin: 10,
    rewardMax: 18,
    rolls: { n: [10, 15, 20] },
    biasHints: ["anal"],
  },

  // —— Oral / CEI ——
  {
    id: "oral_deep_practice",
    category: "oral_cei",
    nameRu: "Глубокий рот",
    briefRu: "Тренировка на игрушке",
    instructionRu:
      "Дилдо/пальцы: {n} попыток глубокого на {sec} секунд каждая. Без рвотного «на силу» — техника важнее.",
    difficulty: 2,
    durationHintMin: 15,
    rewardMin: 10,
    rewardMax: 18,
    rolls: { n: [5, 8, 10], sec: [5, 8, 10] },
    biasHints: ["oral", "cei"],
  },
  {
    id: "oral_hold",
    category: "oral_cei",
    nameRu: "Подержать во рту",
    briefRu: "Репетиция CEI",
    instructionRu:
      "Лубрикант или имитация «капли» на язык. Держи во рту {sec} секунд, {n} подходов. Проглоти в конце каждого.",
    difficulty: 1,
    durationHintMin: 10,
    rewardMin: 8,
    rewardMax: 14,
    rolls: { sec: [20, 30, 45], n: [3, 4, 5] },
    biasHints: ["cei", "oral"],
  },
  {
    id: "oral_next_ruin_eat",
    category: "oral_cei",
    nameRu: "Следующий руин — съесть",
    briefRu: "Обещание на сессию",
    instructionRu:
      "В следующей сессии с руином или кончей — съесть/слизать. Сегодня можешь закрыть контракт, если даёшь честное обещание и держишь его.",
    difficulty: 2,
    durationHintMin: 5,
    rewardMin: 12,
    rewardMax: 20,
    biasHints: ["cei"],
  },
  {
    id: "oral_toothbrush",
    category: "oral_cei",
    nameRu: "Вкус на языке",
    briefRu: "Унизительная гигиена",
    instructionRu:
      "После чистки зубов — {minutes} минут без полоскания, язык к нёбу. Думай, что «вкус принадлежит госпоже».",
    difficulty: 1,
    durationHintMin: 10,
    rewardMin: 6,
    rewardMax: 12,
    rolls: { minutes: [5, 8, 10] },
    biasHints: ["cei", "humiliation"],
  },
  {
    id: "oral_lube_cei_drill",
    category: "oral_cei",
    nameRu: "CEI-репетиция",
    briefRu: "Лубрикант как тренировка",
    instructionRu:
      "Капля лубриканта на ладонь → слизать → проглотить. Повтори {n} раз медленно, как ритуал.",
    difficulty: 2,
    durationHintMin: 10,
    rewardMin: 10,
    rewardMax: 16,
    rolls: { n: [3, 5, 7] },
    biasHints: ["cei"],
  },
  {
    id: "finish_earned_cum",
    category: "oral_cei",
    nameRu: "Право кончить",
    briefRu: "Заслужил полный финал",
    instructionRu:
      "Сначала {n} честных эджей (hands-off ≥30 сек после каждого). Потом — право на полный оргазм. Когда закончишь, отметь «Доложить финал» и ответь на вопросы. Награда зависит от честности отчёта.",
    difficulty: 2,
    durationHintMin: 30,
    rewardMin: 10,
    rewardMax: 18,
    rolls: { n: [3, 4, 5] },
    biasHints: ["stroke", "cei", "edge"],
    kind: "finish_debrief",
    finishDebriefPreset: "cum_allowed",
  },
  {
    id: "finish_earned_ruin",
    category: "oral_cei",
    nameRu: "Право на руин",
    briefRu: "Только сорвать — не волна",
    instructionRu:
      "Сделай {n} эджей. Госпожа даёт право только на руин (сорвать у края, без полной волны). Полный оргазм = ослушание в отчёте. После — «Доложить финал».",
    difficulty: 2,
    durationHintMin: 25,
    rewardMin: 12,
    rewardMax: 20,
    rolls: { n: [3, 4, 6] },
    biasHints: ["ruin", "stroke", "cei"],
    kind: "finish_debrief",
    finishDebriefPreset: "ruin_allowed",
  },
  {
    id: "finish_cei_dessert",
    category: "oral_cei",
    nameRu: "Вкусняшка после",
    briefRu: "Кончить — и съесть",
    instructionRu:
      "После {n} эджей можно кончить (полный или руин). Всё, что вышло — слизать/проглотить. Без CEI награда почти сгорает. Закрой контракт через «Доложить финал».",
    difficulty: 3,
    durationHintMin: 30,
    rewardMin: 12,
    rewardMax: 20,
    rolls: { n: [2, 3, 4] },
    biasHints: ["cei", "humiliation", "stroke"],
    kind: "finish_debrief",
    finishDebriefPreset: "cei_required",
  },
  {
    id: "finish_mistress_choice",
    category: "oral_cei",
    nameRu: "Выбор финала",
    briefRu: "Руин или полный — твой выбор",
    instructionRu:
      "Тильт {minutes} минут (дрочка / эджи без финала). Затем госпожа отпускает: можешь выбрать руин или полный оргазм. Отказ тоже возможен — но угольки урежут. Отметь «Доложить финал».",
    difficulty: 2,
    durationHintMin: 25,
    rewardMin: 10,
    rewardMax: 18,
    rolls: { minutes: [15, 20, 25] },
    biasHints: ["stroke", "ruin", "cei"],
    kind: "finish_debrief",
    finishDebriefPreset: "choice",
  },

  // —— Chastity ——
  {
    id: "chastity_morning_inspect",
    category: "chastity",
    nameRu: "Утренний осмотр",
    briefRu: "Ритуал клетки",
    instructionRu:
      "Утром (или сейчас): осмотри клетку, протри, скажи вслух «Клетка на месте, госпожа». {n} минут тишины hands-off после.",
    difficulty: 1,
    durationHintMin: 10,
    rewardMin: 6,
    rewardMax: 12,
    rolls: { n: [5, 10] },
    biasHints: ["chastity"],
  },
  {
    id: "chastity_locked_hours",
    category: "chastity",
    nameRu: "Заперт на часы",
    briefRu: "Без снятия",
    instructionRu:
      "Оставайся в клетке {hours} часов (или надень сейчас). Снимать только по гигиене с таймером ≤10 мин.",
    difficulty: 2,
    durationHintMin: 180,
    rewardMin: 14,
    rewardMax: 28,
    rolls: { hours: [4, 8, 12] },
    biasHints: ["chastity"],
  },
  {
    id: "chastity_key_lost",
    category: "chastity",
    nameRu: "Ключ «потерян»",
    briefRu: "До вечера",
    instructionRu:
      "Убери ключ так, чтобы не брать его до {hours} часов. Любой «случайный» доступ = провал.",
    difficulty: 2,
    durationHintMin: 120,
    rewardMin: 12,
    rewardMax: 22,
    rolls: { hours: [4, 6, 8] },
    biasHints: ["chastity", "denial"],
  },
  {
    id: "chastity_tease_locked",
    category: "chastity",
    nameRu: "Тизер в клетке",
    briefRu: "Возбуждение без доступа",
    instructionRu:
      "В клетке смотри возбуждающее {minutes} минут. Трение о клетку разрешено, оргазм — нет.",
    difficulty: 2,
    durationHintMin: 25,
    rewardMin: 10,
    rewardMax: 18,
    rolls: { minutes: [15, 20, 30] },
    biasHints: ["chastity", "tease"],
  },
  {
    id: "chastity_night",
    category: "chastity",
    nameRu: "Ночь в клетке",
    briefRu: "Спать запертым",
    instructionRu:
      "Ложись спать в клетке. Утром отметь контракт выполненным. Если снял ночью — провал.",
    difficulty: 3,
    durationHintMin: 480,
    rewardMin: 18,
    rewardMax: 32,
    biasHints: ["chastity"],
  },

  // —— Body ——
  {
    id: "body_daily_exercise",
    category: "body",
    nameRu: "Зарядка дня",
    briefRu: "Приседания / отжимания",
    instructionRu:
      "Не сессия Conductor. Сделай {n} приседаний и {taps} отжиманий (или планка {sec} сек вместо отжиманий). Считай вслух. Между подходами — дыхание, не дрочка. Оргазм = провал.",
    difficulty: 1,
    durationHintMin: 15,
    rewardMin: 8,
    rewardMax: 16,
    rolls: { n: [20, 30, 40], taps: [10, 15, 20], sec: [40, 60, 90] },
    biasHints: ["body"],
    requireActivityDebrief: true,
  },
  {
    id: "body_nipples_x3",
    category: "body",
    nameRu: "Соски ×3",
    briefRu: "Три подхода за день",
    instructionRu:
      "Три раза за день по {minutes} минут играй с сосками (щипки, круги). Между подходами ≥2 часа.",
    difficulty: 1,
    durationHintMin: 30,
    rewardMin: 8,
    rewardMax: 14,
    rolls: { minutes: [5, 8, 10] },
    biasHints: ["nipple", "body"],
  },
  {
    id: "body_nipple_pinch",
    category: "body",
    nameRu: "Щипки сосков",
    briefRu: "Только пальцами",
    instructionRu:
      "{minutes} минут щипай и крути соски пальцами (без прищепок/зажимов). Ритм: 10 секунд сильно — 10 мягко.",
    difficulty: 1,
    durationHintMin: 12,
    rewardMin: 8,
    rewardMax: 14,
    rolls: { minutes: [5, 8, 10] },
    biasHints: ["nipple", "body"],
  },
  {
    id: "body_socks_sniff",
    category: "body",
    nameRu: "Запах носков",
    briefRu: "Фетиш-ритуал",
    instructionRu:
      "{minutes} минут нюхай свои (или чистые «игровые») носки/стопы, пока дрочишь медленно. Без оргазма.",
    difficulty: 1,
    durationHintMin: 15,
    rewardMin: 8,
    rewardMax: 14,
    rolls: { minutes: [8, 12, 15] },
    biasHints: ["feet", "fetish"],
  },
  {
    id: "body_belly_write",
    category: "body",
    nameRu: "Надпись на теле",
    briefRu: "Маркер / палец",
    instructionRu:
      "Напиши на животе/бедре «owned» или «госпожа» (маркер/паста, смываемое). Носи {hours} ч или до душа вечером.",
    difficulty: 1,
    durationHintMin: 5,
    rewardMin: 6,
    rewardMax: 12,
    rolls: { hours: [2, 4, 6] },
    biasHints: ["humiliation", "role"],
  },
  {
    id: "body_edge_nipple",
    category: "body",
    nameRu: "Эдж сосками",
    briefRu: "Без рук на члене",
    instructionRu:
      "{n} попыток дойти почти до грани, трогая только соски/бёдра. Руки на член — сброс подхода.",
    difficulty: 3,
    durationHintMin: 25,
    rewardMin: 14,
    rewardMax: 24,
    rolls: { n: [2, 3, 4] },
    biasHints: ["nipple", "edge"],
  },

  // —— Life / free time (no special gear) ——
  {
    id: "life_shower_edge",
    category: "life",
    nameRu: "Эдж в душе",
    briefRu: "Гигиена + контроль",
    instructionRu:
      "В душе доведи до грани {n} раз. Вода может быть тёплой. Кончать нельзя — выключи воду и hands-off 1 минуту после каждого.",
    difficulty: 1,
    durationHintMin: 15,
    rewardMin: 8,
    rewardMax: 14,
    rolls: { n: [2, 3, 4] },
    biasHints: ["stroke", "edge"],
  },
  {
    id: "life_kettle_wait",
    category: "life",
    nameRu: "Пока чайник",
    briefRu: "Ожидание = тизер",
    instructionRu:
      "Пока кипятится чайник / греется еда / грузится игра — медленно тизерь себя. Сегодня минимум {n} таких «окон ожидания». Без оргазма.",
    difficulty: 1,
    durationHintMin: 20,
    rewardMin: 6,
    rewardMax: 12,
    rolls: { n: [3, 4, 5] },
    biasHints: ["tease", "stroke"],
  },
  {
    id: "life_commute_squeeze",
    category: "life",
    nameRu: "В пути",
    briefRu: "Скрытые сжатия",
    instructionRu:
      "Пока идёшь/едешь (где уединение позволяет): на каждом светофоре, остановке или лестничном пролёте — короткое сжатие яиц или бёдер. Цель — {n} раз за день.",
    difficulty: 1,
    durationHintMin: 30,
    rewardMin: 8,
    rewardMax: 14,
    rolls: { n: [8, 12, 15] },
    biasHints: ["cbt", "humiliation"],
  },
  {
    id: "life_no_underwear",
    category: "life",
    nameRu: "Без белья",
    briefRu: "Домашний день",
    instructionRu:
      "Дома {hours} часов без нижнего белья (штаны/шорты можно). Каждый раз, садясь — 5 секунд давления бёдрами и мысль «госпожа».",
    difficulty: 1,
    durationHintMin: 120,
    rewardMin: 8,
    rewardMax: 16,
    rolls: { hours: [2, 4, 6] },
    biasHints: ["humiliation", "denial"],
  },
  {
    id: "life_break_pomodoro",
    category: "life",
    nameRu: "Перерывы",
    briefRu: "Работа / учёба",
    instructionRu:
      "За день сделай {n} коротких перерывов по 2–3 минуты: только соски пальцами или лёгкий тизер члена через одежду. Потом сразу обратно к делу. Без оргазма.",
    difficulty: 1,
    durationHintMin: 40,
    rewardMin: 8,
    rewardMax: 14,
    rolls: { n: [3, 4, 5] },
    biasHints: ["nipple", "tease"],
  },
  {
    id: "life_meal_thanks",
    category: "life",
    nameRu: "Перед едой",
    briefRu: "Маленький протокол",
    instructionRu:
      "Перед каждым приёмом пищи сегодня тихо скажи «Спасибо, госпожа». Минимум {n} раз. Можно шёпотом, если не один.",
    difficulty: 1,
    durationHintMin: 5,
    rewardMin: 5,
    rewardMax: 10,
    rolls: { n: [2, 3, 4] },
    biasHints: ["protocol", "role"],
  },
  {
    id: "life_screen_tease",
    category: "life",
    nameRu: "Обычный экран",
    briefRu: "Сериал / ютуб / игры",
    instructionRu:
      "{minutes} минут обычного (не порно) контента: руки на бёдрах или медленный тизер через ткань. Цель — возбудиться «впустую», без грани и без оргазма.",
    difficulty: 1,
    durationHintMin: 30,
    rewardMin: 8,
    rewardMax: 14,
    rolls: { minutes: [20, 30, 40] },
    biasHints: ["tease", "denial"],
  },
  {
    id: "life_cold_rinse",
    category: "life",
    nameRu: "Холодный финиш",
    briefRu: "Душ / умывание",
    instructionRu:
      "После обычного душа или умывания — {sec} секунд холодной воды на пах/яйца. Скажи «остынь для госпожи». Повтори {n} подхода, если один раз слабо.",
    difficulty: 1,
    durationHintMin: 5,
    rewardMin: 6,
    rewardMax: 12,
    rolls: { sec: [15, 25, 40], n: [1, 2] },
    biasHints: ["cbt", "denial"],
  },
  {
    id: "life_bedtime_edge",
    category: "life",
    nameRu: "Перед сном",
    briefRu: "Лёгкий ритуал",
    instructionRu:
      "Лёжа в постели: {n} медленных эджа (или почти-эджа), потом hands-off и сон. Оргазм = провал. Можно без экрана.",
    difficulty: 2,
    durationHintMin: 20,
    rewardMin: 10,
    rewardMax: 18,
    rolls: { n: [2, 3, 4] },
    biasHints: ["edge", "stroke"],
  },
  {
    id: "life_chores_tease",
    category: "life",
    nameRu: "Уборка с тизером",
    briefRu: "Быт возбуждённым",
    instructionRu:
      "Сделай {n} бытовых дела (посуда, пол, бельё…) в возбуждённом состоянии: каждые 2–3 минуты — 20 секунд тизера, потом снова дело. Без оргазма.",
    difficulty: 2,
    durationHintMin: 35,
    rewardMin: 10,
    rewardMax: 18,
    rolls: { n: [2, 3, 4] },
    biasHints: ["humiliation", "tease"],
  },
  {
    id: "life_bathroom_rule",
    category: "life",
    nameRu: "Правило туалета",
    briefRu: "Каждый визит",
    instructionRu:
      "Каждый раз в туалет сегодня: перед/после — {taps} лёгких шлепков по яйцам или {sec} секунд сжатия. Минимум {n} визитов отметить про себя.",
    difficulty: 2,
    durationHintMin: 15,
    rewardMin: 8,
    rewardMax: 16,
    rolls: { taps: [5, 8, 10], sec: [10, 15], n: [3, 4, 5] },
    biasHints: ["cbt", "protocol"],
  },
  {
    id: "life_walk_fantasy",
    category: "life",
    nameRu: "Прогулка в голове",
    briefRu: "Свободное время на улице",
    instructionRu:
      "Прогулка или дорога {minutes}+ минут: без дрочки на улице. Вместо этого — фантазия, где госпожа ведёт тебя. Дома — один короткий эдж «за честность» (опционально).",
    difficulty: 1,
    durationHintMin: 25,
    rewardMin: 6,
    rewardMax: 12,
    rolls: { minutes: [15, 25, 40] },
    biasHints: ["protocol", "role"],
  },

  // —— Role ——
  {
    id: "role_kneel_wait",
    category: "role",
    nameRu: "На коленях",
    briefRu: "Поза ожидания",
    instructionRu:
      "Стой/сиди на коленях {minutes} минут, руки за спиной. Смотри в одну точку. Телефон — только таймер. Снаряжение не нужно.",
    difficulty: 1,
    durationHintMin: 15,
    rewardMin: 8,
    rewardMax: 14,
    rolls: { minutes: [10, 15, 20] },
    biasHints: ["protocol", "role"],
  },
  {
    id: "role_thanks_list",
    category: "role",
    nameRu: "Список благодарностей",
    briefRu: "Письменно госпоже",
    instructionRu:
      "Напиши {n} коротких пунктов: за что ты благодарен госпоже сегодня. Можно в заметках. Обращение — «госпожа».",
    difficulty: 1,
    durationHintMin: 10,
    rewardMin: 6,
    rewardMax: 12,
    rolls: { n: [5, 7, 10] },
    biasHints: ["protocol", "role"],
  },
  {
    id: "role_journal",
    category: "role",
    nameRu: "Дневник слуги",
    briefRu: "Отчёт за день",
    instructionRu:
      "Полстраницы (или {n} предложений) отчёта госпоже: что сделал, где слабый, что хочешь. Тон почтительный.",
    difficulty: 1,
    durationHintMin: 15,
    rewardMin: 8,
    rewardMax: 14,
    rolls: { n: [8, 12, 15] },
    biasHints: ["protocol"],
  },
  {
    id: "role_brat_pushups",
    category: "role",
    nameRu: "Brat-штраф",
    briefRu: "Отжимания за дерзость",
    instructionRu:
      "Сделай {n} отжиманий (или приседаний, если колени). Считай вслух. Это плата за мысль «а вдруг можно ослушаться».",
    difficulty: 1,
    durationHintMin: 10,
    rewardMin: 6,
    rewardMax: 12,
    rolls: { n: [15, 25, 40] },
    biasHints: ["brat", "role"],
    mistressBias: ["sparkle", "hu_tao"],
  },
  {
    id: "role_rice",
    category: "role",
    nameRu: "Рис",
    briefRu: "Унизительный счёт",
    instructionRu:
      "Отсчитай {n} зёрен риса (или мелких предметов) по одному. Вслух. Без ускорения «пачками».",
    difficulty: 2,
    durationHintMin: 20,
    rewardMin: 10,
    rewardMax: 16,
    rolls: { n: [50, 80, 100] },
    biasHints: ["humiliation", "protocol"],
  },
  {
    id: "role_mirror",
    category: "role",
    nameRu: "Зеркало",
    briefRu: "Признание вслух",
    instructionRu:
      "{minutes} минут перед зеркалом: смотри себе в глаза и повторяй «Я принадлежу госпоже». Можно на коленях.",
    difficulty: 2,
    durationHintMin: 15,
    rewardMin: 8,
    rewardMax: 14,
    rolls: { minutes: [5, 8, 10] },
    biasHints: ["humiliation", "role"],
  },

  // —— Session mod ——
  {
    id: "session_ruin_only",
    category: "session_mod",
    nameRu: "Только руин",
    briefRu: "Финал запечатан",
    instructionRu:
      "Прими условия — следующая сессия ведёт к руину. Шансы финала и цель «руин» запечатаны в плане и на колесе. Cum с колеса не спасает: сорви в руин или провал.",
    difficulty: 2,
    durationHintMin: 5,
    rewardMin: 12,
    rewardMax: 22,
    biasHints: ["ruin", "stroke"],
  },
  {
    id: "session_deny_tomorrow",
    category: "session_mod",
    nameRu: "Deny до завтра",
    briefRu: "Финал = deny",
    instructionRu:
      "Прими условия: до обновления доски — без оргазма (даже руина). Шансы финала запечатаны под deny. Сессии можно, финал — стоп. Честно отметь, если сорвался.",
    difficulty: 3,
    durationHintMin: 5,
    rewardMin: 16,
    rewardMax: 28,
    biasHints: ["denial"],
  },
  {
    id: "session_anal_plug_mod",
    category: "session_mod",
    nameRu: "Сессия с пробкой",
    briefRu: "Режим anal · печать",
    instructionRu:
      "Прими условия: следующая сессия в режиме anal (пробка обязательна). Режим запечатан в плане и на рулетке — снять печать можно только отменой или выполнением.",
    difficulty: 2,
    durationHintMin: 5,
    rewardMin: 14,
    rewardMax: 24,
    biasHints: ["anal"],
  },
  {
    id: "session_no_hands",
    category: "session_mod",
    nameRu: "Без рук",
    briefRu: "Режим без рук",
    instructionRu:
      "Прими условия: максимум времени без рук на члене (бёдра, игрушка, поверхность). Режим в плане запечатан под prone / безрукий старт — крутить барабан нельзя, пока печать жива.",
    difficulty: 3,
    durationHintMin: 5,
    rewardMin: 16,
    rewardMax: 28,
    biasHints: ["prone", "onahole", "anal"],
  },
  {
    id: "session_long_edges",
    category: "session_mod",
    nameRu: "Много эджей",
    briefRu: "Квота запечатана",
    instructionRu:
      "Прими условия: не меньше {n} эджей до финала. Квота эджей запечатана в плане. Если сорвался раньше — контракт провален.",
    difficulty: 2,
    durationHintMin: 5,
    rewardMin: 12,
    rewardMax: 20,
    rolls: { n: [6, 8, 10] },
    biasHints: ["edge", "stroke"],
  },
];

/**
 * Categories whose contracts represent a timed «go do X» activity (not a
 * session modifier). For these, when the def defines a durationHintMin but no
 * explicit perform-window limit, we promote the hint to a live countdown timer
 * (durationLimitMin). Session-mod / edge / cbt / anal / oral_cei / chastity
 * contracts stay untimed (they resolve inside a session or via self-report).
 */
for (const def of CONTRACT_CATALOG) {
  if (
    def.durationHintMin != null &&
    def.durationLimitMin == null
  ) {
    def.durationLimitMin = def.durationHintMin;
  }
}

/** Daily habits: exercise / cage / plug. Forced onto the 5-contract board. */
export const HABIT_CONTRACT_IDS: ReadonlySet<string> = new Set([
  "body_daily_exercise",
  "role_brat_pushups",
  "anal_workout_plug",
  "anal_walk_plug",
  "anal_plug_hours",
  "chastity_locked_hours",
]);

export function isHabitContractId(
  defId: string,
  clonedFrom?: string,
): boolean {
  if (HABIT_CONTRACT_IDS.has(defId)) return true;
  return Boolean(clonedFrom && HABIT_CONTRACT_IDS.has(clonedFrom));
}

export function getContractDef(id: string): ContractDef | undefined {
  // User overrides must win even when a cloned preset deliberately keeps the
  // built-in id. The old order made edits look saved while the live board kept
  // reading the immutable built-in definition.
  return getUserContractDef(id) ?? CONTRACT_CATALOG.find((c) => c.id === id);
}

// Indirection so catalog.ts does not import userCatalog at module top-level
// (userCatalog imports CONTRACT_CATALOG from here → would be circular).
let getUserContractDef: (id: string) => ContractDef | undefined = () => undefined;

/** Register the user-catalog lookup (called once from userCatalog.ts). */
export function _registerUserContractLookup(
  fn: (id: string) => ContractDef | undefined,
): void {
  getUserContractDef = fn;
}
