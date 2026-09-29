import { getContractDef, type ContractCategory, type ContractRollKey } from "./catalog";
import { numericRollBounds } from "./seriesParams";
import {
  type ContractSeriesDef,
  type ContractSeriesDaySpec,
  type ContractSeriesIntensity,
} from "./seriesCatalog";

export type ProgressionMode = "smooth" | "steps";

const EDGE_CONTROL_CATEGORIES: ReadonlySet<ContractCategory> = new Set([
  "edge",
  "life",
  "session_mod",
]);

export function clampIntensity(n: number): ContractSeriesIntensity {
  const rounded = Math.round(n);
  if (rounded <= 1) return 1;
  if (rounded === 2) return 2;
  if (rounded === 3) return 3;
  if (rounded === 4) return 4;
  return 5;
}

export function intensityAlongSeries(
  index: number,
  length: number,
): ContractSeriesIntensity {
  if (length <= 1) return 5;
  return clampIntensity(1 + (4 * index) / (length - 1));
}

export function seriesPhaseLabelRu(
  dayIndex: number,
  totalDays: number,
): string {
  if (totalDays <= 7) {
    if (dayIndex <= 1) return "Знакомство";
    if (dayIndex <= 3) return "Ритм";
    if (dayIndex <= 5) return "Контроль";
    return "Испытание";
  }
  if (dayIndex < 7) return "Вход";
  if (dayIndex < 14) return "Ритм";
  if (dayIndex < 21) return "Контроль";
  if (dayIndex < 29) return "Дисциплина";
  return "Финальное испытание";
}

export function meanIntensity(days: ContractSeriesDaySpec[]): number {
  if (days.length === 0) return 0;
  return days.reduce((sum, d) => sum + d.intensity, 0) / days.length;
}

function steppedT(index: number, length: number, plateaus: number): number {
  const count = Math.max(2, plateaus);
  const plateau = Math.min(
    count - 1,
    Math.floor((index * count) / length),
  );
  return plateau / (count - 1);
}

export function generateNumericValues(opts: {
  length: number;
  start: number;
  end: number;
  mode: ProgressionMode;
  integer: boolean;
  min?: number;
  max?: number;
}): { values: number[]; clamped: boolean } {
  const length = opts.length;
  const values: number[] = [];
  let clamped = false;
  const plateaus = length >= 30 ? 4 : 3;
  for (let i = 0; i < length; i++) {
    const t =
      opts.mode === "smooth"
        ? length <= 1
          ? 1
          : i / (length - 1)
        : steppedT(i, length, plateaus);
    let value = opts.start + (opts.end - opts.start) * t;
    if (opts.integer) value = Math.round(value);
    if (opts.min != null && value < opts.min) {
      value = opts.min;
      clamped = true;
    }
    if (opts.max != null && value > opts.max) {
      value = opts.max;
      clamped = true;
    }
    values.push(value);
  }
  return { values, clamped };
}

export type ProgressionGenerateInput = {
  length: 7 | 30;
  contractDefId: string;
  key: ContractRollKey;
  start: number;
  end: number;
  mode: ProgressionMode;
  allowOutOfRange?: boolean;
};

export type ProgressionGenerateResult = {
  days: ContractSeriesDaySpec[];
  warnings: string[];
};

export function generateSeriesProgression(
  input: ProgressionGenerateInput,
  lookup = getContractDef,
): ProgressionGenerateResult {
  const warnings: string[] = [];
  const def = lookup(input.contractDefId);
  if (!def) {
    return { days: [], warnings: ["Неизвестный контракт для генератора."] };
  }
  const bounds = numericRollBounds(def, input.key);
  const integer = bounds != null || Number.isInteger(input.start);
  let min = bounds?.min;
  let max = bounds?.max;
  if (input.allowOutOfRange) {
    min = undefined;
    max = undefined;
  }
  if (
    bounds &&
    !input.allowOutOfRange &&
    (input.start < bounds.min ||
      input.start > bounds.max ||
      input.end < bounds.min ||
      input.end > bounds.max)
  ) {
    warnings.push(
      `Старт/финиш сжаты в диапазон каталога ${bounds.min}–${bounds.max}.`,
    );
  }
  const { values, clamped } = generateNumericValues({
    length: input.length,
    start: input.start,
    end: input.end,
    mode: input.mode,
    integer,
    min,
    max,
  });
  if (clamped && !warnings.some((w) => w.includes("сжаты"))) {
    warnings.push("Значения удержаны в диапазоне броска каталога.");
  }
  const days: ContractSeriesDaySpec[] = values.map((value, i) => ({
    contractDefId: input.contractDefId,
    intensity: intensityAlongSeries(i, input.length),
    paramOverrides: { [input.key]: value },
  }));
  return { days, warnings };
}

export function seriesProgressionWarnings(
  def: Pick<ContractSeriesDef, "theme" | "days" | "periodKind">,
  lookup = getContractDef,
): string[] {
  const warnings: string[] = [];
  const days = def.days;
  if (days.length === 0) return warnings;
  if (days.every((d) => d.intensity === days[0]!.intensity)) {
    warnings.push("Интенсивность одинаковая все дни — нет нарастания.");
  }
  const third = Math.max(1, Math.floor(days.length / 3));
  const first = days.slice(0, third);
  const last = days.slice(days.length - third);
  if (meanIntensity(last) <= meanIntensity(first)) {
    warnings.push("Последняя треть не жёстче первой.");
  }
  const categories = new Set<ContractCategory>();
  for (const day of days) {
    const child = lookup(day.contractDefId);
    if (child) categories.add(child.category);
  }
  if (def.theme.id === "edge_control") {
    const stray = [...categories].filter((c) => !EDGE_CONTROL_CATEGORIES.has(c));
    if (stray.length > 0) {
      warnings.push("Есть дни вне темы контроля возбуждения.");
    }
  } else if (categories.size > 3) {
    warnings.push("Категории дней слабо связаны между собой.");
  }
  return warnings;
}

export function tileWeekSpecs(
  days: ContractSeriesDaySpec[],
  totalDays: number,
): ContractSeriesDaySpec[] | { error: string } {
  const week = days.slice(0, 7);
  if (week.length < 7 || week.some((d) => !d.contractDefId.trim())) {
    return { error: "Сначала заполни первую неделю." };
  }
  const next = days.slice();
  while (next.length < totalDays) {
    next.push({
      contractDefId: "",
      intensity: 3,
    });
  }
  for (let i = 7; i < totalDays; i++) {
    const src = week[i % 7]!;
    next[i] = {
      contractDefId: src.contractDefId,
      intensity: src.intensity,
      paramOverrides: src.paramOverrides
        ? { ...src.paramOverrides }
        : undefined,
    };
  }
  return next.slice(0, totalDays);
}
