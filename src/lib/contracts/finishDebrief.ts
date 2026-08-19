import type { ContractInstance } from "./dailyBoard";
import {
  getContractDef,
  type FinishDebriefPreset,
} from "./catalog";

export type { FinishDebriefPreset };

export type FinishDebriefOption = {
  id: string;
  labelRu: string;
  hintRu?: string;
  /** Added to base reward (can be negative; total clamped ≥ 0). */
  delta: number;
};

export type FinishDebriefQuestion = {
  id: string;
  promptRu: string;
  options: FinishDebriefOption[];
  /** Show only when prior answers match (all keys). */
  showWhen?: Record<string, string | string[]>;
};

export type FinishDebriefAnswers = Record<string, string>;

export type FinishDebriefScore = {
  rewarded: number;
  baseReward: number;
  delta: number;
  summaryRu: string;
  tone: "sweet" | "cruel" | "neutral";
};

const FINISH_DEBRIEF_DEF_IDS = new Set([
  "finish_earned_cum",
  "finish_earned_ruin",
  "finish_cei_dessert",
  "finish_mistress_choice",
  "media_faproulette_finish",
]);

export function isFinishDebriefContract(c: ContractInstance): boolean {
  if (FINISH_DEBRIEF_DEF_IDS.has(c.defId)) return true;
  return getContractDef(c.defId)?.kind === "finish_debrief";
}

export function finishDebriefPresetFor(
  c: ContractInstance,
): FinishDebriefPreset {
  const fromParams = c.params.finishDebriefPreset;
  if (
    fromParams === "cum_allowed" ||
    fromParams === "ruin_allowed" ||
    fromParams === "cei_required" ||
    fromParams === "choice" ||
    fromParams === "faproulette"
  ) {
    return fromParams;
  }
  const def = getContractDef(c.defId);
  return def?.finishDebriefPreset ?? "cum_allowed";
}

function optionMatches(
  answer: string | undefined,
  expect: string | string[],
): boolean {
  if (answer == null) return false;
  return Array.isArray(expect) ? expect.includes(answer) : answer === expect;
}

export function questionVisible(
  q: FinishDebriefQuestion,
  answers: FinishDebriefAnswers,
): boolean {
  if (!q.showWhen) return true;
  return Object.entries(q.showWhen).every(([key, expect]) =>
    optionMatches(answers[key], expect),
  );
}

const HOW_OPTIONS_FULL: FinishDebriefOption[] = [
  {
    id: "full",
    labelRu: "Полный оргазм",
    hintRu: "Кончил до конца",
    delta: 2,
  },
  {
    id: "ruin",
    labelRu: "Руин",
    hintRu: "Сорвал / капнуло без волны",
    delta: 4,
  },
  {
    id: "denied",
    labelRu: "Не кончил",
    hintRu: "Дошёл и остановил себя",
    delta: -99,
  },
];

const HOW_OPTIONS_RUIN_ONLY: FinishDebriefOption[] = [
  {
    id: "ruin",
    labelRu: "Руин",
    hintRu: "Как разрешено",
    delta: 6,
  },
  {
    id: "full",
    labelRu: "Полный оргазм",
    hintRu: "Взял больше, чем дали",
    delta: -99,
  },
  {
    id: "denied",
    labelRu: "Не кончил",
    hintRu: "Отказался от права",
    delta: -8,
  },
];

const HOW_OPTIONS_CHOICE: FinishDebriefOption[] = [
  {
    id: "full",
    labelRu: "Полный оргазм",
    hintRu: "Госпожа разрешила выбор",
    delta: 2,
  },
  {
    id: "ruin",
    labelRu: "Руин",
    hintRu: "Скромнее — милее",
    delta: 6,
  },
  {
    id: "denied",
    labelRu: "Не кончил",
    hintRu: "Вернул право",
    delta: -6,
  },
];

const ATE_OPTIONS: FinishDebriefOption[] = [
  {
    id: "all",
    labelRu: "Да, всю",
    hintRu: "Проглотил / слизал без остатка",
    delta: 10,
  },
  {
    id: "some",
    labelRu: "Часть",
    hintRu: "Попробовал, но не всё",
    delta: 4,
  },
  {
    id: "no",
    labelRu: "Нет",
    hintRu: "Вытер / смыл / выбросил",
    delta: -6,
  },
  {
    id: "none",
    labelRu: "Нечего было есть",
    hintRu: "Руин / впустую / сухо",
    delta: 0,
  },
];

const ATE_OPTIONS_REQUIRED: FinishDebriefOption[] = [
  {
    id: "all",
    labelRu: "Да, всю вкусняшку",
    hintRu: "Как велела госпожа",
    delta: 14,
  },
  {
    id: "some",
    labelRu: "Часть",
    hintRu: "Слабо, но хоть что-то",
    delta: 2,
  },
  {
    id: "no",
    labelRu: "Нет",
    hintRu: "Ослушался — награда тает",
    delta: -99,
  },
  {
    id: "none",
    labelRu: "Нечего было",
    hintRu: "Тогда это не CEI-финал",
    delta: -12,
  },
];

const WHERE_OPTIONS: FinishDebriefOption[] = [
  {
    id: "mouth",
    labelRu: "В рот / на язык",
    hintRu: "Готовил вкусняшку",
    delta: 4,
  },
  {
    id: "hand",
    labelRu: "На руку",
    hintRu: "Можно слизать",
    delta: 2,
  },
  {
    id: "body",
    labelRu: "На тело",
    hintRu: "Живот, бёдра, грудь…",
    delta: 1,
  },
  {
    id: "toy",
    labelRu: "В игрушку / презерватив",
    hintRu: "Собрал",
    delta: 2,
  },
  {
    id: "waste",
    labelRu: "В салфетку / унитаз",
    hintRu: "Потратил зря",
    delta: -4,
  },
];

const FEEL_OPTIONS: FinishDebriefOption[] = [
  {
    id: "thanks",
    labelRu: "Спасибо, госпожа",
    hintRu: "Благодарен за право",
    delta: 4,
  },
  {
    id: "shame",
    labelRu: "Стыдно и сладко",
    hintRu: "Унижение засчитано",
    delta: 3,
  },
  {
    id: "empty",
    labelRu: "Пусто / жалею",
    hintRu: "Послевкусие deny",
    delta: 1,
  },
  {
    id: "greedy",
    labelRu: "Хочу ещё",
    hintRu: "Жадность замечена",
    delta: -2,
  },
];

function howQuestion(
  options: FinishDebriefOption[],
  promptRu = "Как ты кончил?",
): FinishDebriefQuestion {
  return { id: "how", promptRu, options };
}

function buildQuestions(preset: FinishDebriefPreset): FinishDebriefQuestion[] {
  const how =
    preset === "ruin_allowed"
      ? howQuestion(HOW_OPTIONS_RUIN_ONLY, "Как воспользовался правом?")
      : preset === "choice"
        ? howQuestion(HOW_OPTIONS_CHOICE)
        : howQuestion(HOW_OPTIONS_FULL);

  const where: FinishDebriefQuestion = {
    id: "where",
    promptRu: "Куда попала конча?",
    options: WHERE_OPTIONS,
    showWhen: { how: ["full", "ruin"] },
  };

  const ate: FinishDebriefQuestion = {
    id: "ate",
    promptRu:
      preset === "cei_required"
        ? "Ты съел свою кончу, вкусняшка?"
        : "Ты съел свою кончу вкусняшку?",
    options: preset === "cei_required" ? ATE_OPTIONS_REQUIRED : ATE_OPTIONS,
    showWhen: { how: ["full", "ruin"] },
  };

  const feel: FinishDebriefQuestion = {
    id: "feel",
    promptRu: "Что скажешь госпоже?",
    options: FEEL_OPTIONS,
  };

  if (preset === "faproulette") {
    return [
      {
        id: "spins_done",
        promptRu: "Сколько бросков честно отыграл?",
        options: [
          { id: "all", labelRu: "Все по контракту", delta: 4 },
          { id: "most", labelRu: "Почти все", hintRu: "Чуть срезал", delta: 0 },
          { id: "few", labelRu: "Мало", hintRu: "Схалтурил", delta: -8 },
        ],
      },
      howQuestion(HOW_OPTIONS_FULL, "Как закончил на рулетке?"),
      where,
      ate,
      feel,
    ];
  }

  if (preset === "cei_required") {
    return [how, where, ate, feel];
  }

  if (preset === "ruin_allowed") {
    return [
      how,
      {
        id: "ate",
        promptRu: "Слизал капли после руина?",
        options: [
          { id: "all", labelRu: "Да", delta: 8 },
          { id: "some", labelRu: "Чуть-чуть", delta: 3 },
          { id: "no", labelRu: "Нет", delta: -2 },
          { id: "none", labelRu: "Не было", delta: 0 },
        ],
        showWhen: { how: "ruin" },
      },
      feel,
    ];
  }

  return [how, where, ate, feel];
}

export function finishDebriefQuestions(
  preset: FinishDebriefPreset,
): FinishDebriefQuestion[] {
  return buildQuestions(preset);
}

export function visibleFinishDebriefQuestions(
  preset: FinishDebriefPreset,
  answers: FinishDebriefAnswers,
): FinishDebriefQuestion[] {
  return finishDebriefQuestions(preset).filter((q) =>
    questionVisible(q, answers),
  );
}

function findOption(
  q: FinishDebriefQuestion,
  answerId: string | undefined,
): FinishDebriefOption | undefined {
  if (!answerId) return undefined;
  return q.options.find((o) => o.id === answerId);
}

/** Max bonus path (for UI hint: «до +N»). */
export function finishDebriefMaxBonus(preset: FinishDebriefPreset): number {
  const qs = finishDebriefQuestions(preset);
  let sum = 0;
  for (const q of qs) {
    const best = Math.max(0, ...q.options.map((o) => o.delta));
    sum += best;
  }
  return sum;
}

export function scoreFinishDebrief(
  baseReward: number,
  preset: FinishDebriefPreset,
  answers: FinishDebriefAnswers,
): FinishDebriefScore {
  const base = Math.max(0, Math.floor(baseReward));
  const visible = visibleFinishDebriefQuestions(preset, answers);
  let delta = 0;
  const bits: string[] = [];

  for (const q of visible) {
    const opt = findOption(q, answers[q.id]);
    if (!opt) continue;
    delta += opt.delta;
    if (opt.delta >= 6) bits.push(opt.labelRu.toLowerCase());
    else if (opt.delta <= -6) bits.push(opt.labelRu.toLowerCase());
  }

  // Soft floor: "denied" / hard disobedience zeros payout.
  const rewarded = Math.max(0, Math.min(base + 24, base + delta));

  let tone: FinishDebriefScore["tone"] = "neutral";
  if (rewarded === 0) tone = "cruel";
  else if (rewarded >= base + 8) tone = "sweet";

  let summaryRu: string;
  if (rewarded === 0) {
    summaryRu =
      answers.how === "denied"
        ? "Правом не воспользовался — угольков нет"
        : "Отчёт слабый — награды нет";
  } else if (rewarded > base) {
    summaryRu = `+${rewarded} · бонус за честный финал`;
  } else if (rewarded < base) {
    summaryRu = `+${rewarded} · урезано по ответу`;
  } else {
    summaryRu = `+${rewarded} угольков`;
  }
  if (bits.length > 0 && rewarded > 0) {
    summaryRu += ` (${bits.slice(0, 2).join(", ")})`;
  }

  return { rewarded, baseReward: base, delta, summaryRu, tone };
}

/** All visible questions must have an answer. */
export function finishDebriefComplete(
  preset: FinishDebriefPreset,
  answers: FinishDebriefAnswers,
): boolean {
  const visible = visibleFinishDebriefQuestions(preset, answers);
  return visible.every((q) => Boolean(answers[q.id]));
}

export function finishDebriefTitleRu(preset: FinishDebriefPreset): string {
  switch (preset) {
    case "cum_allowed":
      return "Отчёт о финале";
    case "ruin_allowed":
      return "Отчёт о руине";
    case "cei_required":
      return "CEI-отчёт";
    case "choice":
      return "Как воспользовался правом?";
    case "faproulette":
      return "Fap Roulette · финал";
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}
