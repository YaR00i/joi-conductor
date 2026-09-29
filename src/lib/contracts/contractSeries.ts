/**
 * Runtime long-series progress (7/30 local calendar days).
 * Does not award cinders. Child instances use the daily-board instantiate path.
 */

import { getContractDef } from "./catalog";
import type {
  ContractInstance,
  ContractLifecycleNotice,
  DailyContractBoard,
} from "./dailyBoard";
import {
  appendContractJournalEntryIfAbsent,
  buildContractJournalEntry,
} from "../contractJournal";
import {
  addLocalDays,
  contractRng,
  contractsTodayKey,
  endOfLocalDayMs,
  localCalendarDayDiff,
} from "./contractTime";
import { getActiveMistress } from "../mistress";
import type { MistressId } from "../mistress/types";
import {
  expectedSeriesLength,
  validateSeriesDef,
  type ContractSeriesDef,
  type ContractSeriesTheme,
} from "./seriesCatalog";
import {
  buildSeriesSnapshot,
  coerceSeriesSnapshot,
  type SeriesDaySnapshot,
} from "./seriesSnapshot";
import { getMergedSeriesDef } from "./userSeriesCatalog";

export const SERIES_STORAGE_KEY = "joi-contract-series-v1";

export type ContractSeriesStatus = "active" | "completed" | "cancelled";

export type ContractSeriesDayOutcome = {
  dayIndex: number;
  dayKey: string;
  childInstanceId: string;
  defId: string;
  outcome: "done" | "failed" | "expired";
  creditedReward: number;
};

export type ContractSeriesInstance = {
  instanceId: string;
  defId: string;
  mistressId: MistressId;
  startedDayKey: string;
  totalDays: number;
  cursorDayIndex: number;
  status: ContractSeriesStatus;
  days: ContractSeriesDayOutcome[];
  nameRu?: string;
  theme?: ContractSeriesTheme;
  snapshot?: SeriesDaySnapshot[];
  blockedReasonRu?: string;
  cancelledAtMs?: number;
  completedAtMs?: number;
};

export type ContractSeriesState = {
  version: 1;
  series: ContractSeriesInstance | null;
};

export type SeriesInstantiate = (
  defId: string,
  dayKey: string,
  mistressId: MistressId,
  rng: () => number,
  extras: {
    instanceId: string;
    acceptedAtMs: number;
    seriesInstanceId: string;
    seriesDefId: string;
    seriesDayIndex: number;
    seriesTotalDays: number;
    paramOverrides?: Record<string, string | number>;
    intensity?: 1 | 2 | 3 | 4 | 5;
    themeLabelRu?: string;
  },
) => ContractInstance | null;

export function isSeriesContract(c: ContractInstance): boolean {
  return c.source === "series";
}

export function seriesChildInstanceId(
  seriesInstanceId: string,
  dayIndex: number,
): string {
  return `${seriesInstanceId}:d${dayIndex}`;
}

export function seriesChipLabelRu(dayIndex: number, totalDays: number): string {
  return `Серия · день ${dayIndex + 1}/${totalDays}`;
}

export function emptySeriesState(): ContractSeriesState {
  return { version: 1, series: null };
}

function coerceDayOutcome(raw: unknown): ContractSeriesDayOutcome | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.dayIndex !== "number" ||
    typeof r.dayKey !== "string" ||
    typeof r.childInstanceId !== "string" ||
    typeof r.defId !== "string"
  ) {
    return null;
  }
  const outcome =
    r.outcome === "done" || r.outcome === "failed" || r.outcome === "expired"
      ? r.outcome
      : null;
  if (!outcome) return null;
  return {
    dayIndex: r.dayIndex,
    dayKey: r.dayKey,
    childInstanceId: r.childInstanceId,
    defId: r.defId,
    outcome,
    creditedReward:
      typeof r.creditedReward === "number" ? r.creditedReward : 0,
  };
}

function coerceSeriesInstance(raw: unknown): ContractSeriesInstance | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.instanceId !== "string" ||
    typeof r.defId !== "string" ||
    typeof r.startedDayKey !== "string" ||
    typeof r.totalDays !== "number"
  ) {
    return null;
  }
  const status: ContractSeriesStatus =
    r.status === "completed" || r.status === "cancelled" || r.status === "active"
      ? r.status
      : "active";
  const days: ContractSeriesDayOutcome[] = [];
  const seen = new Set<number>();
  if (Array.isArray(r.days)) {
    for (const row of r.days) {
      const day = coerceDayOutcome(row);
      if (!day || seen.has(day.dayIndex)) continue;
      seen.add(day.dayIndex);
      days.push(day);
    }
  }
  days.sort((a, b) => a.dayIndex - b.dayIndex);
  const snapshot = coerceSeriesSnapshot(r.snapshot);
  const theme =
    r.theme && typeof r.theme === "object"
      ? {
          id: String((r.theme as { id?: unknown }).id ?? "custom"),
          labelRu: String((r.theme as { labelRu?: unknown }).labelRu ?? ""),
        }
      : undefined;
  return {
    instanceId: r.instanceId,
    defId: r.defId,
    mistressId: (r.mistressId as MistressId) ?? "hu_tao",
    startedDayKey: r.startedDayKey,
    totalDays: r.totalDays,
    cursorDayIndex:
      typeof r.cursorDayIndex === "number" ? r.cursorDayIndex : days.length,
    status,
    days,
    nameRu: typeof r.nameRu === "string" ? r.nameRu : undefined,
    theme: theme?.labelRu ? theme : undefined,
    snapshot:
      snapshot && snapshot.length === r.totalDays ? snapshot : undefined,
    blockedReasonRu:
      typeof r.blockedReasonRu === "string" ? r.blockedReasonRu : undefined,
    cancelledAtMs:
      typeof r.cancelledAtMs === "number" ? r.cancelledAtMs : undefined,
    completedAtMs:
      typeof r.completedAtMs === "number" ? r.completedAtMs : undefined,
  };
}

export function loadSeriesState(): ContractSeriesState {
  try {
    const raw = localStorage.getItem(SERIES_STORAGE_KEY);
    if (!raw) return emptySeriesState();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return emptySeriesState();
    const o = parsed as Record<string, unknown>;
    return {
      version: 1,
      series: coerceSeriesInstance(o.series),
    };
  } catch {
    return emptySeriesState();
  }
}

export function saveSeriesState(state: ContractSeriesState): void {
  try {
    localStorage.setItem(SERIES_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

export function activeSeries(): ContractSeriesInstance | null {
  const s = loadSeriesState().series;
  return s?.status === "active" ? s : null;
}

function withSeriesSnapshot(
  series: ContractSeriesInstance,
): ContractSeriesInstance {
  if (series.snapshot && series.snapshot.length === series.totalDays) {
    return series;
  }
  const def = getMergedSeriesDef(series.defId);
  if (def && validateSeriesDef(def, getContractDef).ok) {
    return {
      ...series,
      nameRu: series.nameRu ?? def.nameRu,
      theme: series.theme ?? def.theme,
      snapshot: buildSeriesSnapshot(def, series.instanceId),
      blockedReasonRu: undefined,
    };
  }
  if (series.status !== "active") return series;
  return {
    ...series,
    blockedReasonRu:
      series.blockedReasonRu ??
      "Пресет серии пропал или сломан. Закрытые дни на месте, новые шаги не выдаются.",
  };
}

function snapshotDay(
  series: ContractSeriesInstance,
  dayIndex: number,
): SeriesDaySnapshot | undefined {
  return series.snapshot?.find((d) => d.dayIndex === dayIndex);
}

function seriesDayContractId(
  series: ContractSeriesInstance,
  dayIndex: number,
  fallback?: ContractSeriesDef,
): string {
  return (
    snapshotDay(series, dayIndex)?.contractDefId ??
    fallback?.days[dayIndex]?.contractDefId ??
    ""
  );
}

function maybeComplete(
  series: ContractSeriesInstance,
  nowMs: number,
): ContractSeriesInstance {
  if (series.status !== "active") return series;
  if (series.days.length < series.totalDays) return series;
  return {
    ...series,
    status: "completed",
    cursorDayIndex: series.totalDays,
    completedAtMs: nowMs,
  };
}

function recordDay(
  series: ContractSeriesInstance,
  row: ContractSeriesDayOutcome,
  nowMs: number,
): ContractSeriesInstance {
  if (series.days.some((d) => d.dayIndex === row.dayIndex)) return series;
  const days = [...series.days, row].sort((a, b) => a.dayIndex - b.dayIndex);
  const next: ContractSeriesInstance = {
    ...series,
    days,
    cursorDayIndex: Math.max(series.cursorDayIndex, row.dayIndex + 1),
  };
  return maybeComplete(next, nowMs);
}

function stubSeriesChild(
  extras: Parameters<SeriesInstantiate>[4],
  dayKey: string,
  mistressId: MistressId,
  defId: string,
): ContractInstance {
  return {
    instanceId: extras.instanceId,
    defId,
    dayKey,
    mistressId,
    category: "life",
    titleRu: "Контракт серии",
    bodyRu: "Суточный шаг серии недоступен — определение пропало.",
    reward: 0,
    deadlineMs: endOfLocalDayMs(dayKey),
    status: "open",
    params: {},
    difficulty: 1,
    acceptedAtMs: extras.acceptedAtMs,
    source: "series",
    seriesInstanceId: extras.seriesInstanceId,
    seriesDefId: extras.seriesDefId,
    seriesDayIndex: extras.seriesDayIndex,
    seriesTotalDays: extras.seriesTotalDays,
    seriesIntensity: extras.intensity,
    seriesThemeLabelRu: extras.themeLabelRu,
  };
}

function buildChild(
  instantiate: SeriesInstantiate,
  series: ContractSeriesInstance,
  dayIndex: number,
  nowMs: number,
  fallbackDef?: ContractSeriesDef,
): ContractInstance {
  const dayKey = addLocalDays(series.startedDayKey, dayIndex);
  const snap = snapshotDay(series, dayIndex);
  const defId = seriesDayContractId(series, dayIndex, fallbackDef);
  const extras = {
    instanceId: seriesChildInstanceId(series.instanceId, dayIndex),
    acceptedAtMs: nowMs,
    seriesInstanceId: series.instanceId,
    seriesDefId: series.defId,
    seriesDayIndex: dayIndex,
    seriesTotalDays: series.totalDays,
    paramOverrides: snap?.resolvedParams,
    intensity: snap?.intensity,
    themeLabelRu: series.theme?.labelRu,
  };
  const rng = contractRng(`${series.instanceId}|d${dayIndex}`);
  return (
    instantiate(defId, dayKey, series.mistressId, rng, extras) ??
    stubSeriesChild(extras, dayKey, series.mistressId, defId)
  );
}

function journalAutoExpired(instance: ContractInstance): void {
  const id = `cj:${instance.instanceId}:expired`;
  appendContractJournalEntryIfAbsent(
    id,
    buildContractJournalEntry({
      contract: instance,
      outcome: "expired",
      reward: 0,
      performedVia: "auto",
      acceptedAtMs: instance.acceptedAtMs,
    }),
  );
}

function journalFailed(instance: ContractInstance): void {
  const id = `cj:${instance.instanceId}:failed`;
  appendContractJournalEntryIfAbsent(
    id,
    buildContractJournalEntry({
      contract: instance,
      outcome: "failed",
      reward: 0,
      performedVia: "honor",
      acceptedAtMs: instance.acceptedAtMs,
    }),
  );
}

function emitAcceptedThen(
  emit: (n: ContractLifecycleNotice) => void,
  instance: ContractInstance,
  terminal: "expired" | "failed" | "done",
  alreadyAccepted: boolean,
): void {
  if (!alreadyAccepted) {
    emit({ instance, outcome: "accepted" });
  }
  emit({ instance, outcome: terminal });
}

function replaceOnBoard(
  board: DailyContractBoard,
  instance: ContractInstance,
): DailyContractBoard {
  const idx = board.contracts.findIndex(
    (c) => c.instanceId === instance.instanceId,
  );
  const contracts = board.contracts.slice();
  if (idx >= 0) contracts[idx] = instance;
  else contracts.push(instance);
  return { ...board, contracts };
}

function expireOneDay(
  series: ContractSeriesInstance,
  dayIndex: number,
  board: DailyContractBoard,
  previousOpen: ContractInstance[],
  instantiate: SeriesInstantiate,
  emit: (n: ContractLifecycleNotice) => void,
  nowMs: number,
  fallbackDef?: ContractSeriesDef,
): { series: ContractSeriesInstance; board: DailyContractBoard } {
  if (series.days.some((d) => d.dayIndex === dayIndex)) {
    return { series, board };
  }
  const childId = seriesChildInstanceId(series.instanceId, dayIndex);
  const found =
    previousOpen.find((c) => c.instanceId === childId) ??
    board.contracts.find((c) => c.instanceId === childId);
  const alreadyAccepted = Boolean(found?.acceptedAtMs);
  let instance: ContractInstance = found
    ? { ...found, status: "expired" }
    : {
        ...buildChild(instantiate, series, dayIndex, nowMs, fallbackDef),
        status: "expired",
      };
  instance = { ...instance, status: "expired" };
  if (found && board.contracts.some((c) => c.instanceId === childId)) {
    board = replaceOnBoard(board, instance);
  }
  journalAutoExpired(instance);
  emitAcceptedThen(emit, instance, "expired", alreadyAccepted);
  series = recordDay(
    series,
    {
      dayIndex,
      dayKey: addLocalDays(series.startedDayKey, dayIndex),
      childInstanceId: childId,
      defId: seriesDayContractId(series, dayIndex, fallbackDef) || instance.defId,
      outcome: "expired",
      creditedReward: 0,
    },
    nowMs,
  );
  return { series, board };
}

export type StartSeriesResult =
  | { ok: true; series: ContractSeriesInstance }
  | { ok: false; error: string };

export function startContractSeries(
  defId: string,
  now = new Date(),
): StartSeriesResult {
  const current = loadSeriesState().series;
  if (current?.status === "active") {
    const title =
      current.nameRu ??
      getMergedSeriesDef(current.defId)?.nameRu ??
      current.defId;
    return {
      ok: false,
      error: `Уже идёт серия «${title}». Сначала прерви её или дождись конца.`,
    };
  }
  const def = getMergedSeriesDef(defId);
  if (!def) {
    return { ok: false, error: "Серия не найдена." };
  }
  const valid = validateSeriesDef(def, getContractDef);
  if (!valid.ok) {
    return { ok: false, error: valid.errors[0] ?? "Серию нельзя начать." };
  }
  const dayKey = contractsTodayKey(now);
  const instanceId = `ser_${def.id}_${dayKey}_${now.getTime()}`;
  const series: ContractSeriesInstance = {
    instanceId,
    defId: def.id,
    mistressId: getActiveMistress().id,
    startedDayKey: dayKey,
    totalDays: expectedSeriesLength(def.periodKind),
    cursorDayIndex: 0,
    status: "active",
    days: [],
    nameRu: def.nameRu,
    theme: def.theme,
    snapshot: buildSeriesSnapshot(def, instanceId),
  };
  saveSeriesState({ version: 1, series });
  return { ok: true, series };
}

export function recordSeriesChildOutcome(
  instance: ContractInstance,
  outcome: "done" | "failed" | "expired",
  creditedReward: number,
  now = new Date(),
): void {
  if (!isSeriesContract(instance)) return;
  const state = loadSeriesState();
  const series = state.series;
  if (!series || series.instanceId !== instance.seriesInstanceId) return;
  if (series.status === "cancelled" && outcome !== "failed") {
    /* still record the closing fail below */
  }
  const dayIndex = instance.seriesDayIndex ?? 0;
  const next = recordDay(
    series,
    {
      dayIndex,
      dayKey: instance.dayKey,
      childInstanceId: instance.instanceId,
      defId: instance.defId,
      outcome,
      creditedReward: outcome === "done" ? Math.max(0, creditedReward) : 0,
    },
    now.getTime(),
  );
  saveSeriesState({ version: 1, series: next });
}

/**
 * Pure-ish board patch: expire missed series days, pin today's child.
 * Caller owns board persistence. Does not call ensureDailyContractBoard.
 */
export function reconcileSeriesOnBoard(
  board: DailyContractBoard,
  now: Date,
  instantiate: SeriesInstantiate,
  emit: (n: ContractLifecycleNotice) => void,
  previousOpen: ContractInstance[] = [],
): DailyContractBoard {
  const state = loadSeriesState();
  const series0 = state.series;
  if (!series0 || series0.status !== "active") {
    return board;
  }
  let series = withSeriesSnapshot(series0);
  const fallbackDef = getMergedSeriesDef(series.defId);

  const nowMs = now.getTime();
  const todayKey = contractsTodayKey(now);
  const todayIndex = localCalendarDayDiff(series.startedDayKey, todayKey);
  let nextBoard = board;

  const lastIndex = Math.min(
    Math.max(todayIndex, 0),
    series.totalDays - 1,
  );
  const expireThrough =
    todayIndex >= series.totalDays
      ? series.totalDays - 1
      : lastIndex;

  for (let i = 0; i <= expireThrough; i++) {
    const dayKey = addLocalDays(series.startedDayKey, i);
    const past = nowMs > endOfLocalDayMs(dayKey);
    if (!past) continue;
    const result = expireOneDay(
      series,
      i,
      nextBoard,
      previousOpen,
      instantiate,
      emit,
      nowMs,
      fallbackDef,
    );
    series = result.series;
    nextBoard = result.board;
  }

  if (series.status === "active" && todayIndex >= 0 && todayIndex < series.totalDays) {
    const dayKey = addLocalDays(series.startedDayKey, todayIndex);
    if (nowMs <= endOfLocalDayMs(dayKey) && !series.days.some((d) => d.dayIndex === todayIndex)) {
      const childId = seriesChildInstanceId(series.instanceId, todayIndex);
      const existing =
        nextBoard.contracts.find((c) => c.instanceId === childId) ??
        previousOpen.find(
          (c) => c.instanceId === childId && c.dayKey === dayKey,
        );
      if (existing) {
        if (!nextBoard.contracts.some((c) => c.instanceId === childId)) {
          nextBoard = {
            ...nextBoard,
            contracts: [...nextBoard.contracts, existing],
          };
        }
      } else {
        const snap = snapshotDay(series, todayIndex);
        const defId = seriesDayContractId(series, todayIndex, fallbackDef);
        if (!snap && !defId) {
          series = {
            ...series,
            blockedReasonRu:
              "Нельзя выдать шаг: у серии нет снимка дней и пресет недоступен.",
          };
        } else if (defId && !getContractDef(defId)) {
          series = {
            ...series,
            blockedReasonRu: `День ${todayIndex + 1}: контракт «${defId}» больше недоступен.`,
          };
        } else {
          const child = buildChild(
            instantiate,
            series,
            todayIndex,
            nowMs,
            fallbackDef,
          );
          nextBoard = {
            ...nextBoard,
            contracts: [...nextBoard.contracts, child],
          };
          emit({ instance: child, outcome: "accepted" });
        }
      }
    }
  }

  series = maybeComplete(series, nowMs);
  if (series !== series0) {
    saveSeriesState({ version: 1, series });
  } else {
    saveSeriesState({ version: 1, series });
  }
  return nextBoard;
}

export function cancelContractSeries(
  board: DailyContractBoard,
  now: Date,
  instantiate: SeriesInstantiate,
  emit: (n: ContractLifecycleNotice) => void,
): DailyContractBoard {
  const state = loadSeriesState();
  const series0 = state.series;
  if (!series0 || series0.status !== "active") return board;
  const nowMs = now.getTime();
  let nextBoard = board;
  let series = withSeriesSnapshot(series0);
  const fallbackDef = getMergedSeriesDef(series.defId);

  const openChild = board.contracts.find(
    (c) =>
      isSeriesContract(c) &&
      c.status === "open" &&
      c.seriesInstanceId === series0.instanceId,
  );
  if (openChild) {
    const instance: ContractInstance = { ...openChild, status: "failed" };
    nextBoard = replaceOnBoard(nextBoard, instance);
    journalFailed(instance);
    emitAcceptedThen(emit, instance, "failed", true);
    series = recordDay(
      series,
      {
        dayIndex: openChild.seriesDayIndex ?? series0.days.length,
        dayKey: openChild.dayKey,
        childInstanceId: openChild.instanceId,
        defId: openChild.defId,
        outcome: "failed",
        creditedReward: 0,
      },
      nowMs,
    );
  } else {
    const todayKey = contractsTodayKey(now);
    const dayIndex = Math.min(
      Math.max(localCalendarDayDiff(series.startedDayKey, todayKey), 0),
      Math.max(0, series.totalDays - 1),
    );
    if (!series.days.some((d) => d.dayIndex === dayIndex)) {
      const childId = seriesChildInstanceId(series.instanceId, dayIndex);
      const instance: ContractInstance = {
        ...buildChild(instantiate, series, dayIndex, nowMs, fallbackDef),
        status: "failed",
      };
      journalFailed(instance);
      emitAcceptedThen(emit, instance, "failed", false);
      series = recordDay(
        series,
        {
          dayIndex,
          dayKey: addLocalDays(series.startedDayKey, dayIndex),
          childInstanceId: childId,
          defId:
            seriesDayContractId(series, dayIndex, fallbackDef) || instance.defId,
          outcome: "failed",
          creditedReward: 0,
        },
        nowMs,
      );
    }
  }

  series = {
    ...series,
    status: "cancelled",
    cancelledAtMs: nowMs,
  };
  saveSeriesState({ version: 1, series });
  return nextBoard;
}

export function seriesCounts(series: ContractSeriesInstance): {
  done: number;
  failed: number;
  expired: number;
} {
  let done = 0;
  let failed = 0;
  let expired = 0;
  for (const d of series.days) {
    if (d.outcome === "done") done += 1;
    else if (d.outcome === "failed") failed += 1;
    else expired += 1;
  }
  return { done, failed, expired };
}

export function clearCompletedSeriesChoice(): void {
  const state = loadSeriesState();
  if (state.series?.status === "active") return;
  saveSeriesState(emptySeriesState());
}
