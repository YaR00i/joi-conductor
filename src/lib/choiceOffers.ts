import type { SessionMood } from "./types";
import type { RouletteOption } from "./planRoulette";
import { isHarshMood } from "./moodEngine";

/** Mid-session «хочешь…?» actions (yes → optional roulette → effect). */
export type ChoiceAction =
  | "extend_sec"
  | "ruin_now"
  | "hold_sec"
  | "edge_hell"
  | "extra_edges"
  | "rest_sec"
  | "tip_sec"
  | "breath_hold";

export type ChoiceRouletteOptionDef = {
  id: string;
  /** Label; `{v}` replaced with scaled value when present. */
  labelRu: string;
  /** Base payload: seconds or count depending on action. */
  value: number;
  weight?: number;
  color?: string;
};

export type ChoiceRouletteSlice = RouletteOption & {
  value: number;
};

const COLORS = ["#2fbf6a", "#e6b422", "#c45c26", "#e04545", "#3d7ea6", "#8b5cf6"];

/** Base wheels — values scaled by mood at roll time. */
export const CHOICE_ROULETTES: Record<
  ChoiceAction,
  ChoiceRouletteOptionDef[] | null
> = {
  extend_sec: [
    { id: "ext5", labelRu: "+5 мин", value: 300, weight: 1.2, color: COLORS[0] },
    { id: "ext10", labelRu: "+10 мин", value: 600, weight: 1, color: COLORS[1] },
    { id: "ext15", labelRu: "+15 мин", value: 900, weight: 0.75, color: COLORS[2] },
  ],
  ruin_now: null,
  hold_sec: [
    { id: "h20", labelRu: "20 сек", value: 20, weight: 1.15, color: COLORS[0] },
    { id: "h30", labelRu: "30 сек", value: 30, weight: 1, color: COLORS[1] },
    { id: "h40", labelRu: "40 сек", value: 40, weight: 0.85, color: COLORS[2] },
  ],
  edge_hell: [
    { id: "eh4", labelRu: "4 подряд", value: 4, weight: 1.2, color: COLORS[1] },
    { id: "eh6", labelRu: "6 подряд", value: 6, weight: 1, color: COLORS[2] },
    { id: "eh8", labelRu: "8 подряд", value: 8, weight: 0.7, color: COLORS[3] },
  ],
  extra_edges: [
    { id: "ee1", labelRu: "+1 эдж", value: 1, weight: 1.15, color: COLORS[0] },
    { id: "ee2", labelRu: "+2 эджа", value: 2, weight: 1.2, color: COLORS[1] },
    { id: "ee3", labelRu: "+3 эджа", value: 3, weight: 1.05, color: COLORS[2] },
    { id: "ee4", labelRu: "+4 эджа", value: 4, weight: 0.8, color: COLORS[3] },
    { id: "ee5", labelRu: "+5 эджей", value: 5, weight: 0.55, color: COLORS[5] },
  ],
  rest_sec: [
    { id: "r20", labelRu: "20 сек", value: 20, weight: 1.1, color: COLORS[0] },
    { id: "r40", labelRu: "40 сек", value: 40, weight: 1, color: COLORS[4] },
    { id: "r60", labelRu: "60 сек", value: 60, weight: 0.85, color: COLORS[5] },
  ],
  tip_sec: [
    { id: "t15", labelRu: "15 сек", value: 15, weight: 1.15, color: COLORS[0] },
    { id: "t25", labelRu: "25 сек", value: 25, weight: 1, color: COLORS[1] },
    { id: "t40", labelRu: "40 сек", value: 40, weight: 0.8, color: COLORS[2] },
  ],
  breath_hold: [
    { id: "b10", labelRu: "10 сек", value: 10, weight: 1.2, color: COLORS[0] },
    { id: "b15", labelRu: "15 сек", value: 15, weight: 1, color: COLORS[1] },
    { id: "b20", labelRu: "20 сек", value: 20, weight: 0.75, color: COLORS[2] },
  ],
};

export function choiceActionLabelRu(action: ChoiceAction): string {
  switch (action) {
    case "extend_sec":
      return "Продление";
    case "ruin_now":
      return "Руин сейчас";
    case "hold_sec":
      return "Эдж с удержанием";
    case "edge_hell":
      return "Эдж-ад";
    case "extra_edges":
      return "Сколько эджей я тебе добавлю";
    case "rest_sec":
      return "Пауза";
    case "tip_sec":
      return "Только головка";
    case "breath_hold":
      return "Задержка дыхания";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

/** Mercy actions get longer values when soft; punishy get harder when harsh. */
function valueMoodFactor(action: ChoiceAction, mood: SessionMood): number {
  const harsh = isHarshMood(mood) || mood === "bored";
  const soft = mood === "sweet" || mood === "calm";
  const punishy =
    action === "hold_sec" ||
    action === "edge_hell" ||
    action === "extra_edges" ||
    action === "tip_sec" ||
    action === "ruin_now" ||
    action === "breath_hold";
  const mercy = action === "extend_sec" || action === "rest_sec";

  if (punishy) {
    if (harsh) return mood === "chaotic" ? 1.3 : 1.2;
    if (soft) return 0.85;
    if (mood === "horny") return 1.05;
    return 1;
  }
  if (mercy) {
    if (soft) return mood === "sweet" ? 1.2 : 1.1;
    if (harsh) return 0.8;
    return 1;
  }
  return 1;
}

/** Bias weights toward harsher (higher value) slices when cruel. */
function weightMoodFactor(
  action: ChoiceAction,
  value: number,
  values: number[],
  mood: SessionMood,
): number {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const t = max === min ? 0.5 : (value - min) / (max - min);
  const harsh = isHarshMood(mood) || mood === "bored";
  const soft = mood === "sweet" || mood === "calm";
  const punishy =
    action === "hold_sec" ||
    action === "edge_hell" ||
    action === "extra_edges" ||
    action === "tip_sec" ||
    action === "breath_hold";
  const mercy = action === "extend_sec" || action === "rest_sec";

  if (punishy) {
    if (harsh) return 0.65 + t * 1.1;
    if (soft) return 1.25 - t * 0.7;
    return 1;
  }
  if (mercy) {
    if (soft) return 0.7 + t * 1.0;
    if (harsh) return 1.3 - t * 0.8;
    return 1;
  }
  return 1;
}

function scaleValue(action: ChoiceAction, raw: number, mood: SessionMood): number {
  const f = valueMoodFactor(action, mood);
  if (action === "extend_sec" || action === "rest_sec" || action === "hold_sec" || action === "tip_sec" || action === "breath_hold") {
    const stepped = Math.round((raw * f) / 5) * 5;
    return Math.max(5, stepped);
  }
  // counts
  return Math.max(1, Math.round(raw * f));
}

function formatLabel(template: string, value: number, action: ChoiceAction): string {
  if (template.includes("{v}")) {
    return template.replace(/\{v\}/g, String(value));
  }
  // Rebuild common labels when mood scaled the number away from base text
  if (action === "extend_sec") {
    const mins = Math.round(value / 60);
    return `+${mins} мин`;
  }
  if (action === "hold_sec" || action === "rest_sec" || action === "tip_sec" || action === "breath_hold") {
    return `${value} сек`;
  }
  if (action === "edge_hell") {
    return `${value} подряд`;
  }
  if (action === "extra_edges") {
    if (value === 1) return "+1 эдж";
    if (value >= 2 && value <= 4) return `+${value} эджа`;
    return `+${value} эджей`;
  }
  return template;
}

/**
 * Mistress-forced mid-session wheel: «сколько эджей добавлю».
 * Slice weights lean harder on cruel / chaotic moods.
 */
export function buildEdgesTaxRoulette(
  mood: SessionMood,
): ChoiceRouletteSlice[] {
  const harsh = isHarshMood(mood) || mood === "bored";
  const soft = mood === "sweet" || mood === "calm";
  const base: ChoiceRouletteOptionDef[] = soft
    ? [
        { id: "ee1", labelRu: "+1 эдж", value: 1, weight: 1.45, color: COLORS[0] },
        { id: "ee2", labelRu: "+2 эджа", value: 2, weight: 1.05, color: COLORS[1] },
        { id: "ee3", labelRu: "+3 эджа", value: 3, weight: 0.55, color: COLORS[2] },
      ]
    : harsh
      ? [
          { id: "ee1", labelRu: "+1 эдж", value: 1, weight: 0.65, color: COLORS[0] },
          { id: "ee2", labelRu: "+2 эджа", value: 2, weight: 1.05, color: COLORS[1] },
          { id: "ee3", labelRu: "+3 эджа", value: 3, weight: 1.3, color: COLORS[2] },
          { id: "ee4", labelRu: "+4 эджа", value: 4, weight: 1.15, color: COLORS[3] },
          { id: "ee5", labelRu: "+5 эджей", value: 5, weight: 0.85, color: COLORS[5] },
        ]
      : [
          { id: "ee1", labelRu: "+1 эдж", value: 1, weight: 1.1, color: COLORS[0] },
          { id: "ee2", labelRu: "+2 эджа", value: 2, weight: 1.25, color: COLORS[1] },
          { id: "ee3", labelRu: "+3 эджа", value: 3, weight: 1.05, color: COLORS[2] },
          { id: "ee4", labelRu: "+4 эджа", value: 4, weight: 0.7, color: COLORS[3] },
        ];

  const scaled = base.map((opt) => ({
    ...opt,
    value: scaleValue("extra_edges", opt.value, mood),
  }));
  const values = scaled.map((o) => o.value);
  return scaled.map((opt, i) => ({
    id: opt.id,
    labelRu: formatLabel(opt.labelRu, opt.value, "extra_edges"),
    value: opt.value,
    weight:
      (opt.weight ?? 1) *
      weightMoodFactor("extra_edges", opt.value, values, mood),
    color: opt.color ?? COLORS[i % COLORS.length],
    payload: { value: opt.value, action: "extra_edges" },
  }));
}

export function moodEdgesTaxChance(mood: SessionMood): number {
  switch (mood) {
    case "chaotic":
      return 0.28;
    case "cruel":
      return 0.24;
    case "horny":
      return 0.18;
    case "bored":
      return 0.16;
    case "calm":
      return 0.08;
    case "sweet":
      return 0.05;
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

/** Soft cap: how many mistress edge-tax spins per session. */
export function moodEdgesTaxMaxSpins(mood: SessionMood): number {
  if (isHarshMood(mood) || mood === "bored") return 4;
  if (mood === "horny") return 3;
  return 2;
}

export function buildChoiceRoulette(
  action: ChoiceAction,
  mood: SessionMood,
): ChoiceRouletteSlice[] | null {
  const base = CHOICE_ROULETTES[action];
  if (!base || base.length === 0) return null;

  const scaled = base.map((opt) => ({
    ...opt,
    value: scaleValue(action, opt.value, mood),
  }));
  const values = scaled.map((o) => o.value);

  return scaled.map((opt, i) => ({
    id: opt.id,
    labelRu: formatLabel(opt.labelRu, opt.value, action),
    value: opt.value,
    weight:
      (opt.weight ?? 1) *
      weightMoodFactor(action, opt.value, values, mood),
    color: opt.color ?? COLORS[i % COLORS.length],
    payload: { value: opt.value, action },
  }));
}

export function pickChoiceRouletteTarget(
  options: ChoiceRouletteSlice[],
  rng: () => number = Math.random,
): ChoiceRouletteSlice {
  const weights = options.map((o) => Math.max(0.01, o.weight ?? 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rng() * sum;
  for (let i = 0; i < options.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return options[i]!;
  }
  return options[options.length - 1]!;
}

export function isChoiceAction(v: string | undefined): v is ChoiceAction {
  return (
    v === "extend_sec" ||
    v === "ruin_now" ||
    v === "hold_sec" ||
    v === "edge_hell" ||
    v === "extra_edges" ||
    v === "rest_sec" ||
    v === "tip_sec" ||
    v === "breath_hold"
  );
}
