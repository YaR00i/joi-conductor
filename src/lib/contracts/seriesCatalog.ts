import {
  getContractDef,
  type ContractDef,
  type ContractRollKey,
} from "./catalog";
import {
  fillContractTemplate,
  unresolvedPlaceholders,
} from "./contractInstantiate";
import { CONTRACT_ROLL_KEYS } from "./contractEditorDraft";
import {
  normalizeParamOverrides,
  restrictOverridesToDef,
  resolveSeriesDayParams,
} from "./seriesParams";
import { seriesProgressionWarnings } from "./seriesProgression";

export type ContractSeriesPeriodKind = "week" | "month";
export type ContractSeriesIntensity = 1 | 2 | 3 | 4 | 5;

export const SERIES_PERIOD_DAYS: Record<ContractSeriesPeriodKind, number> = {
  week: 7,
  month: 30,
};

export type ContractSeriesTheme = {
  id: string;
  labelRu: string;
};

export type ContractSeriesDaySpec = {
  contractDefId: string;
  intensity: ContractSeriesIntensity;
  paramOverrides?: Partial<Record<ContractRollKey, string | number>>;
};

export type ContractSeriesDef = {
  id: string;
  periodKind: ContractSeriesPeriodKind;
  nameRu: string;
  descriptionRu: string;
  theme: ContractSeriesTheme;
  days: ContractSeriesDaySpec[];
  /** Legacy authoring field; coerced into `days` on load. */
  dayDefIds?: string[];
};

export type SeriesValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export const SERIES_THEMES: ContractSeriesTheme[] = [
  { id: "edge_control", labelRu: "Контроль возбуждения" },
];

export const EDGE_CONTROL_THEME: ContractSeriesTheme = SERIES_THEMES[0]!;

const MEDIA_EXTRA_KEYS = new Set([
  "trigger",
  "actionLabel",
  "timerMin",
  "actionKind",
  "actionN",
]);

function day(
  contractDefId: string,
  intensity: ContractSeriesIntensity,
  paramOverrides?: Partial<Record<ContractRollKey, string | number>>,
): ContractSeriesDaySpec {
  return paramOverrides
    ? { contractDefId, intensity, paramOverrides }
    : { contractDefId, intensity };
}

const WEEK_CONTROL_DAYS: ContractSeriesDaySpec[] = [
  day("edge_count", 1, { n: 3 }),
  day("edge_precum_day", 2, { n: 2 }),
  day("edge_count", 2, { n: 5 }),
  day("edge_hands_off", 3, { n: 3, minutes: 10 }),
  day("edge_metronome", 3, { n: 6 }),
  day("edge_slow", 4, { n: 4 }),
  day("edge_hands_off", 5, { n: 5, minutes: 20 }),
];

const MONTH_CONTROL_DAYS: ContractSeriesDaySpec[] = [
  day("edge_count", 1, { n: 3 }),
  day("edge_precum_day", 1, { n: 2 }),
  day("life_shower_edge", 2, { n: 2 }),
  day("edge_count", 2, { n: 3 }),
  day("life_bedtime_edge", 2, { n: 2 }),
  day("edge_count", 2, { n: 5 }),
  day("edge_metronome", 3, { n: 4 }),
  day("edge_count", 2, { n: 5 }),
  day("life_shower_edge", 3, { n: 3 }),
  day("edge_hands_off", 3, { n: 3, minutes: 10 }),
  day("edge_precum_day", 3, { n: 3 }),
  day("edge_metronome", 3, { n: 6 }),
  day("life_bedtime_edge", 3, { n: 3 }),
  day("edge_count", 3, { n: 5 }),
  day("edge_hands_off", 3, { n: 3, minutes: 15 }),
  day("edge_slow", 3, { n: 3 }),
  day("session_long_edges", 4, { n: 6 }),
  day("edge_metronome", 4, { n: 6 }),
  day("life_shower_edge", 4, { n: 4 }),
  day("edge_slow", 4, { n: 4 }),
  day("edge_precum_day", 4, { n: 4 }),
  day("edge_hands_off", 4, { n: 5, minutes: 15 }),
  day("session_long_edges", 4, { n: 8 }),
  day("edge_slow", 4, { n: 4 }),
  day("edge_metronome", 5, { n: 8 }),
  day("edge_hands_off", 5, { n: 5, minutes: 20 }),
  day("session_long_edges", 5, { n: 10 }),
  day("edge_slow", 5, { n: 5 }),
  day("life_bedtime_edge", 5, { n: 4 }),
  day("edge_slow", 5, { n: 5 }),
];

export const BUILTIN_SERIES_CATALOG: ContractSeriesDef[] = [
  {
    id: "series_week_skin",
    periodKind: "week",
    nameRu: "Семь дней контроля",
    descriptionRu:
      "Неделя одной темы: контроль возбуждения. Эджи растут к финальному испытанию. Пропуск дня не обнуляет серию.",
    theme: EDGE_CONTROL_THEME,
    days: WEEK_CONTROL_DAYS,
  },
  {
    id: "series_month_discipline",
    periodKind: "month",
    nameRu: "Тридцать дней контроля возбуждения",
    descriptionRu:
      "Тридцать последовательных дней, не календарный месяц: вход, ритм, контроль, дисциплина и финал. Награда только за каждый день.",
    theme: EDGE_CONTROL_THEME,
    days: MONTH_CONTROL_DAYS,
  },
];

export function expectedSeriesLength(
  periodKind: ContractSeriesPeriodKind,
): number {
  return SERIES_PERIOD_DAYS[periodKind];
}

export function seriesDayDefIds(def: Pick<ContractSeriesDef, "days" | "dayDefIds">): string[] {
  if (Array.isArray(def.days) && def.days.length > 0) {
    return def.days.map((d) => d.contractDefId);
  }
  return (def.dayDefIds ?? []).map((id) => String(id));
}

export function coerceIntensity(raw: unknown): ContractSeriesIntensity | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n;
  return null;
}

export function emptySeriesDaySpec(
  intensity: ContractSeriesIntensity = 3,
): ContractSeriesDaySpec {
  return { contractDefId: "", intensity };
}

export function coerceSeriesTheme(raw: unknown): ContractSeriesTheme {
  if (raw == null) {
    return { id: "custom", labelRu: "Своя тема" };
  }
  if (typeof raw === "string" && raw.trim()) {
    const known = SERIES_THEMES.find((t) => t.id === raw.trim());
    if (known) return known;
    return { id: raw.trim(), labelRu: raw.trim() };
  }
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const labelRu = String(r.labelRu ?? "").trim();
    const id = String(r.id ?? "").trim();
    return {
      id: id || "custom",
      labelRu,
    };
  }
  return { id: "custom", labelRu: "Своя тема" };
}

export function coerceSeriesDaySpec(raw: unknown): ContractSeriesDaySpec | null {
  if (typeof raw === "string") {
    const id = raw.trim();
    if (!id) return null;
    return { contractDefId: id, intensity: 3 };
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const contractDefId = String(
    r.contractDefId ?? r.defId ?? r.id ?? "",
  ).trim();
  if (!contractDefId) return null;
  const intensity = coerceIntensity(r.intensity) ?? 3;
  const paramOverrides = restrictOverridesToDef(
    getContractDef(contractDefId),
    normalizeParamOverrides(r.paramOverrides),
  );
  return paramOverrides
    ? { contractDefId, intensity, paramOverrides }
    : { contractDefId, intensity };
}

function coerceDaysFromRaw(raw: Record<string, unknown>): ContractSeriesDaySpec[] {
  if (Array.isArray(raw.days) && raw.days.length > 0) {
    return raw.days
      .map((row) => coerceSeriesDaySpec(row))
      .filter((row): row is ContractSeriesDaySpec => Boolean(row));
  }
  if (Array.isArray(raw.dayDefIds)) {
    return raw.dayDefIds
      .map((id) => coerceSeriesDaySpec(id))
      .filter((row): row is ContractSeriesDaySpec => Boolean(row));
  }
  return [];
}

export function coerceSeriesDefinition(raw: unknown): ContractSeriesDef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id ?? "").trim();
  if (!id) return null;
  const periodKind: ContractSeriesPeriodKind =
    r.periodKind === "month" ? "month" : "week";
  return canonicalSeriesDef({
    id,
    periodKind,
    nameRu: String(r.nameRu ?? r.titleRu ?? "").trim() || "Без названия",
    descriptionRu: String(r.descriptionRu ?? "").trim(),
    theme: coerceSeriesTheme(r.theme),
    days: coerceDaysFromRaw(r),
  });
}

export function canonicalSeriesDef(def: ContractSeriesDef): ContractSeriesDef {
  return {
    id: def.id,
    periodKind: def.periodKind === "month" ? "month" : "week",
    nameRu: def.nameRu,
    descriptionRu: def.descriptionRu,
    theme: {
      id: def.theme.id.trim() || "custom",
      labelRu: def.theme.labelRu.trim(),
    },
    days: def.days.map((d) => {
      const paramOverrides = d.paramOverrides
        ? { ...d.paramOverrides }
        : undefined;
      return paramOverrides
        ? {
            contractDefId: d.contractDefId,
            intensity: d.intensity,
            paramOverrides,
          }
        : { contractDefId: d.contractDefId, intensity: d.intensity };
    }),
  };
}

function padDays(
  days: ContractSeriesDaySpec[],
  need: number,
): ContractSeriesDaySpec[] {
  const next = days.slice(0, need);
  while (next.length < need) next.push(emptySeriesDaySpec());
  return next;
}

export function resizeSeriesDays(
  days: ContractSeriesDaySpec[],
  periodKind: ContractSeriesPeriodKind,
): ContractSeriesDaySpec[] {
  return padDays(days, expectedSeriesLength(periodKind));
}

function mediaExtrasAllowed(def: ContractDef | undefined, key: string): boolean {
  if (MEDIA_EXTRA_KEYS.has(key) && def?.kind === "media_drill") return true;
  if (key === "finishDebriefPreset" && def?.kind === "finish_debrief") {
    return true;
  }
  return false;
}

export function validateSeriesDef(
  def: Pick<
    ContractSeriesDef,
    "id" | "periodKind" | "nameRu" | "descriptionRu" | "theme" | "days" | "dayDefIds"
  >,
  lookup: (id: string) => ContractDef | undefined = getContractDef,
): SeriesValidation {
  const errors: string[] = [];
  const coerced = coerceSeriesDefinition({
    id: def.id,
    periodKind: def.periodKind,
    nameRu: def.nameRu,
    descriptionRu: def.descriptionRu,
    theme: def.theme,
    days: def.days,
    dayDefIds: def.dayDefIds,
  });
  const shape = coerced ?? def;
  const theme = shape.theme ?? { id: "", labelRu: "" };
  if (!String(def.nameRu ?? "").trim()) errors.push("Укажи название серии.");
  if (!String(def.descriptionRu ?? "").trim()) {
    errors.push("Укажи описание серии.");
  }
  const themeLabel = String(def.theme?.labelRu ?? theme.labelRu ?? "").trim();
  if (!themeLabel) errors.push("Укажи тему серии.");
  if (shape.periodKind !== "week" && shape.periodKind !== "month") {
    errors.push("Длительность — 7 или 30 дней.");
  }
  const need = expectedSeriesLength(
    shape.periodKind === "month" ? "month" : "week",
  );
  const days: ContractSeriesDaySpec[] =
    Array.isArray(shape.days) && shape.days.length > 0
      ? shape.days
      : (shape.dayDefIds ?? []).map((id) => ({
          contractDefId: id,
          intensity: 3 as const,
        }));
  if (days.length !== need) {
    errors.push(`Нужно ровно ${need} суточных контрактов.`);
  } else {
    const rawDays = Array.isArray(def.days) ? def.days : [];
    days.forEach((spec, i) => {
      const raw = rawDays[i];
      const rawIntensity =
        raw && typeof raw === "object" && "intensity" in raw
          ? (raw as { intensity?: unknown }).intensity
          : spec.intensity;
      if (raw && typeof raw === "object" && "intensity" in raw) {
        if (!coerceIntensity(rawIntensity)) {
          errors.push(`День ${i + 1}: интенсивность 1–5.`);
        }
      } else if (!coerceIntensity(spec.intensity)) {
        errors.push(`День ${i + 1}: интенсивность 1–5.`);
      }
      const rawOverrides =
        raw && typeof raw === "object"
          ? (raw as { paramOverrides?: unknown }).paramOverrides
          : spec.paramOverrides;
      if (rawOverrides && typeof rawOverrides === "object") {
        for (const [key, value] of Object.entries(
          rawOverrides as Record<string, unknown>,
        )) {
          if (!(CONTRACT_ROLL_KEYS as readonly string[]).includes(key)) {
            errors.push(`День ${i + 1}: неизвестный параметр «${key}».`);
          }
          if (
            typeof value === "number" &&
            (!Number.isFinite(value) || value < 0)
          ) {
            errors.push(`День ${i + 1}: параметр ${key} недопустим.`);
          }
        }
      }
      const id = spec.contractDefId?.trim() ?? "";
      if (!id) {
        errors.push(`День ${i + 1}: не выбран контракт.`);
        return;
      }
      const child = lookup(id);
      if (!child) {
        errors.push(`День ${i + 1}: неизвестный контракт «${id}».`);
        return;
      }
      const overrides = normalizeParamOverrides(spec.paramOverrides);
      const params = resolveSeriesDayParams(
        child,
        { paramOverrides: overrides },
        () => 0.5,
      );
      const leftover = unresolvedPlaceholders(child.instructionRu, params).filter(
        (key) => !mediaExtrasAllowed(child, key),
      );
      if (leftover.length > 0) {
        errors.push(
          `День ${i + 1}: в тексте остались плейсхолдеры {${leftover.join("}, {")}}.`,
        );
      }
    });
  }
  const warnings =
    days.length === need
      ? seriesProgressionWarnings(
          {
            theme,
            days: days.map((d) => ({
              contractDefId: d.contractDefId,
              intensity: coerceIntensity(d.intensity) ?? 3,
              paramOverrides: d.paramOverrides,
            })),
            periodKind: shape.periodKind === "month" ? "month" : "week",
          },
          lookup,
        )
      : [];
  return { ok: errors.length === 0, errors, warnings };
}

export function previewSeriesDayBodyRu(
  spec: ContractSeriesDaySpec,
  lookup: (id: string) => ContractDef | undefined = getContractDef,
  rng: () => number = () => 0.5,
): string | null {
  const child = lookup(spec.contractDefId);
  if (!child) return null;
  const params = resolveSeriesDayParams(child, spec, rng);
  return fillContractTemplate(child.instructionRu, params);
}

export function getBuiltinSeriesDef(
  id: string,
): ContractSeriesDef | undefined {
  return BUILTIN_SERIES_CATALOG.find((s) => s.id === id);
}
