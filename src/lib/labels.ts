/** Подписи параметров сессии для UI (рус.) */

export const PARAM_LABELS = {
  durationSec: {
    nameRu: "Длительность",
    descriptionRu: "Минуты до финала — ориентир, не секундомер.",
    unit: "сек",
  },
  mode: {
    nameRu: "Режим",
    descriptionRu:
      "Как она тебя ведёт: рукой, в игрушке, аналом или в клетке. Закрытое — в Магазине.",
  },
  edgesTarget: {
    nameRu: "Эджи",
    descriptionRu:
      "Квота командных эджей в плане сессии (не только счётчик на экране).",
  },
  ruinsTarget: {
    nameRu: "Руины",
    descriptionRu: "Сколько ruined до финала. Ноль — не требовать.",
  },
  pCum: {
    nameRu: "Шанс cum",
    descriptionRu: "Вероятность полного оргазма на финальном ролле.",
  },
  pRuin: {
    nameRu: "Шанс ruin",
    descriptionRu:
      "Вероятность ruined. Что останется после cum+ruin — deny.",
  },
  finishId: {
    nameRu: "Куда кончить",
    descriptionRu: "Куда целиться, если ролл дал cum или ruin.",
  },
  cumplayId: {
    nameRu: "Cumplay",
    descriptionRu: "Что сделать со спермой после финиша.",
  },
  bpmMin: {
    nameRu: "BPM мин.",
    descriptionRu: "Нижняя граница темпа. В клетке не нужна.",
  },
  bpmMax: {
    nameRu: "BPM макс.",
    descriptionRu: "Верхняя граница темпа. В клетке не нужна.",
  },
  blockSecMin: {
    nameRu: "Блок мин.",
    descriptionRu: "Минимальная длина одного блока функции (сек).",
    unit: "сек",
  },
  blockSecMax: {
    nameRu: "Блок макс.",
    descriptionRu: "Максимальная длина одного блока функции (сек).",
    unit: "сек",
  },
  seed: {
    nameRu: "Сид",
    descriptionRu: "Число для повторяемой генерации очереди блоков.",
  },
} as const;

export const MODE_LABELS = {
  stroke: {
    nameRu: "Дрочка",
    descriptionRu: "Движения рукой под бит. Клетки в этом режиме нет.",
  },
  anal: {
    nameRu: "Анал",
    descriptionRu: "Толчки дилдо под бит вместо дрочки.",
  },
  chastity: {
    nameRu: "Клетка",
    descriptionRu:
      "Chastity on. Вибро + пощада на яичках (гладить/подтягивать) — ствол недоступен.",
  },
  onahole: {
    nameRu: "Онахол",
    descriptionRu:
      "Ход в онахоле под бит — фирменный режим Ху Тао (не для других госпож).",
  },
  cbt: {
    nameRu: "CBT",
    descriptionRu:
      "Tide: удары по яйцам и члену (шлепки/щелчки) в такт — без клетки. Бит читаемый.",
  },
  oral: {
    nameRu: "Орал",
    descriptionRu:
      "Горло под бит + vibe-assist. Режим Санны — феминные задания, не hand-stroke.",
  },
  prone: {
    nameRu: "Prone",
    descriptionRu:
      "Tide: лёжа на животе, член упирается в поверхность — ритм бёдрами без рук.",
  },
  plapping: {
    nameRu: "Plapping",
    descriptionRu:
      "Санна: клетка on — шлепки дилдо по яйцам в такт (счётчик акцентов). Ствол закрыт.",
  },
} as const;

export const GOAL_LABELS = {
  stroke: { nameRu: "Ход", descriptionRu: "Следуй функции и биту." },
  edge: { nameRu: "Эдж", descriptionRu: "Дойди до края и подтверди." },
  hold: { nameRu: "Удержание", descriptionRu: "Удержи край N секунд, потом подтверди." },
  ruin_attempt: { nameRu: "Попытка руина", descriptionRu: "Попытка ruined." },
  rest: { nameRu: "Отдых", descriptionRu: "Hands off." },
  finale: { nameRu: "Финал", descriptionRu: "На грани → рулетка по шансам." },
  countdown: { nameRu: "Отсчёт", descriptionRu: "Держи темп до отсчёта." },
  ladder: { nameRu: "Лесенка", descriptionRu: "Ступень темпа — ускоряйся по команде." },
  breath: {
    nameRu: "Задержка дыхания",
    descriptionRu: "Набери воздух, затем челлендж на задержке.",
  },
} as const;

export const OUTCOME_LABELS = {
  cum: { nameRu: "Кончить", descriptionRu: "Полный оргазм." },
  ruin: { nameRu: "Руинить", descriptionRu: "Ruined orgasm." },
  deny: { nameRu: "Отказ", descriptionRu: "Не кончать — руки прочь." },
} as const;

export const CATEGORY_LABELS = {
  stroke: "Дрочка",
  vibe: "Вибрация",
  nipple: "Соски",
  cbt: "CBT",
  anal: "Анал",
  combo: "Комбо",
  oral: "Орал",
} as const;
