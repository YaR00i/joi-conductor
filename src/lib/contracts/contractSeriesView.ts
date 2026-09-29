import { getContractDef } from "./catalog";
import {
  seriesChipLabelRu,
  seriesCounts,
  type ContractSeriesInstance,
  type ContractSeriesDayOutcome,
  type ContractSeriesStatus,
} from "./contractSeries";
import {
  contractsTodayKey,
  endOfLocalDayMs,
  localCalendarDayDiff,
} from "./contractTime";
import { formatCountdown } from "./dailyBoard";
import {
  validateSeriesDef,
  type ContractSeriesDef,
} from "./seriesCatalog";
import { seriesPhaseLabelRu } from "./seriesProgression";
import {
  getMergedSeriesCatalog,
  seriesEditorOrigin,
  SERIES_EDITOR_ORIGIN_RU,
  type SeriesEditorOrigin,
} from "./userSeriesCatalog";

export type SeriesOfferCard = {
  defId: string;
  periodKind: "week" | "month";
  periodLabelRu: string;
  nameRu: string;
  descriptionRu: string;
  themeId: string;
  themeLabelRu: string;
  origin: SeriesEditorOrigin;
  originLabelRu: string;
  intensityFirst: number;
  intensityLast: number;
  progressionRu: string;
  previewRu: string[];
  canStart: boolean;
  startError?: string;
};

export type SeriesPanelView =
  | {
      kind: "idle";
      offers: SeriesOfferCard[];
    }
  | {
      kind: "active";
      nameRu: string;
      themeLabelRu: string;
      phaseLabelRu: string;
      intensity: number | null;
      dayHuman: number;
      totalDays: number;
      progress01: number;
      done: number;
      failed: number;
      expired: number;
      todayTitleRu: string;
      todayBodyRu: string;
      nextTitleRu: string | null;
      countdownRu: string;
      deadlineMs: number;
      blockedReasonRu?: string;
    }
  | {
      kind: "settled";
      status: Exclude<ContractSeriesStatus, "active">;
      nameRu: string;
      done: number;
      totalDays: number;
      failed: number;
      expired: number;
    };

function previewNames(def: ContractSeriesDef, n = 3): string[] {
  const names: string[] = [];
  def.days.slice(0, n).forEach((spec, i) => {
    const child = getContractDef(spec.contractDefId);
    if (child) names.push(`День ${i + 1} · ${child.nameRu}`);
  });
  return names;
}

function calendarDayIndex(
  series: ContractSeriesInstance,
  nowMs: number,
): number {
  const today = contractsTodayKey(new Date(nowMs));
  const diff = localCalendarDayDiff(series.startedDayKey, today);
  return Math.min(
    Math.max(diff, 0),
    Math.max(0, series.totalDays - 1),
  );
}

function todayClosedHintRu(row: ContractSeriesDayOutcome): string {
  switch (row.outcome) {
    case "done":
      return "Сегодняшний шаг выполнен. Следующий откроется завтра.";
    case "failed":
      return "Сегодняшний шаг закрыт как провал. Следующий откроется завтра.";
    case "expired":
      return "Сегодняшний шаг просрочен. Следующий откроется завтра.";
    default: {
      const _never: never = row.outcome;
      return _never;
    }
  }
}

export function seriesOfferCards(
  catalog: ContractSeriesDef[] = getMergedSeriesCatalog(),
): SeriesOfferCard[] {
  return catalog.map((def) => {
    const valid = validateSeriesDef(def, getContractDef);
    const first = def.days[0]?.intensity ?? 1;
    const last = def.days[def.days.length - 1]?.intensity ?? first;
    const origin = seriesEditorOrigin(def.id);
    return {
      defId: def.id,
      periodKind: def.periodKind,
      periodLabelRu: def.periodKind === "week" ? "7 дней" : "30 дней",
      nameRu: def.nameRu,
      descriptionRu: def.descriptionRu,
      themeId: def.theme?.id ?? "custom",
      themeLabelRu: def.theme?.labelRu ?? "Своя тема",
      origin,
      originLabelRu: SERIES_EDITOR_ORIGIN_RU[origin],
      intensityFirst: first,
      intensityLast: last,
      progressionRu: `Интенсивность ${first} → ${last}`,
      previewRu: previewNames(def),
      canStart: valid.ok,
      startError: valid.ok ? undefined : valid.errors[0],
    };
  });
}

export function seriesPanelView(input: {
  series: ContractSeriesInstance | null;
  todayTitleRu?: string;
  todayBodyRu?: string;
  deadlineMs?: number;
  nowMs: number;
}): SeriesPanelView {
  const series = input.series;
  if (!series) {
    return { kind: "idle", offers: seriesOfferCards() };
  }
  const counts = seriesCounts(series);
  const nameRu =
    series.nameRu ??
    getMergedSeriesCatalog().find((d) => d.id === series.defId)?.nameRu ??
    series.defId;
  if (series.status !== "active") {
    return {
      kind: "settled",
      status: series.status,
      nameRu,
      done: counts.done,
      totalDays: series.totalDays,
      failed: counts.failed,
      expired: counts.expired,
    };
  }
  const dayIndex = calendarDayIndex(series, input.nowMs);
  const todayKey = contractsTodayKey(new Date(input.nowMs));
  const todayOutcome = series.days.find((d) => d.dayIndex === dayIndex);
  const snap = series.snapshot?.find((d) => d.dayIndex === dayIndex);
  const next = series.snapshot?.find((d) => d.dayIndex === dayIndex + 1);
  const dayHuman = dayIndex + 1;
  const openToday = Boolean(input.todayTitleRu);
  const todayClosed = Boolean(todayOutcome) && !openToday;
  const endMs = input.deadlineMs ?? endOfLocalDayMs(todayKey);
  return {
    kind: "active",
    nameRu,
    themeLabelRu: series.theme?.labelRu ?? "",
    phaseLabelRu: seriesPhaseLabelRu(dayIndex, series.totalDays),
    intensity: snap?.intensity ?? null,
    dayHuman,
    totalDays: series.totalDays,
    progress01: series.days.length / series.totalDays,
    done: counts.done,
    failed: counts.failed,
    expired: counts.expired,
    todayTitleRu: input.todayTitleRu ?? snap?.titleRu ?? "Сегодняшний шаг",
    todayBodyRu: todayClosed && todayOutcome
      ? todayClosedHintRu(todayOutcome)
      : input.todayBodyRu ?? snap?.bodyRu ?? "",
    nextTitleRu: next?.titleRu ?? null,
    countdownRu: formatCountdown(Math.max(0, endMs - input.nowMs)),
    deadlineMs: endMs,
    blockedReasonRu: series.blockedReasonRu,
  };
}

export function seriesChipText(instance: {
  seriesDayIndex?: number;
  seriesTotalDays?: number;
}): string | null {
  if (
    typeof instance.seriesDayIndex !== "number" ||
    typeof instance.seriesTotalDays !== "number"
  ) {
    return null;
  }
  return seriesChipLabelRu(instance.seriesDayIndex, instance.seriesTotalDays);
}

export function uniqueSeriesThemes(
  offers: SeriesOfferCard[],
): { id: string; labelRu: string }[] {
  const seen = new Map<string, string>();
  for (const offer of offers) {
    if (!seen.has(offer.themeId)) seen.set(offer.themeId, offer.themeLabelRu);
  }
  return [...seen.entries()].map(([id, labelRu]) => ({ id, labelRu }));
}
