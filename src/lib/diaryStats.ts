import {
  diaryCumplayNameRu,
  entryCumFate,
  type DiaryEntry,
} from "./sessionDiary";
import type { FinaleOutcome, SessionMode } from "./types";

export type StatsRange = "7d" | "14d" | "30d" | "all";

export type DayBucket = {
  /** Local calendar day YYYY-MM-DD */
  day: string;
  /** Midnight local for sorting / axis */
  at: number;
  label: string;
  sessions: number;
  completed: number;
  aborted: number;
  edges: number;
  ruins: number;
  ateCum: number;
  minutes: number;
  moodSum: number;
  moodCount: number;
  finaleCum: number;
  finaleRuin: number;
  finaleDeny: number;
  finaleNone: number;
};

export type NamedCount = {
  id: string;
  label: string;
  count: number;
};

export type DiaryStatsSummary = {
  sessions: number;
  completed: number;
  aborted: number;
  /** 0–100 share of aborted among sessions; null when no sessions. */
  abortPct: number | null;
  edges: number;
  ruins: number;
  ateCum: number;
  minutes: number;
  avgMood: number | null;
  avgEdges: number | null;
  avgRuins: number | null;
  avgMinutes: number | null;
  finaleCum: number;
  finaleRuin: number;
  finaleDeny: number;
  finaleNone: number;
};

export type DiaryStats = {
  range: StatsRange;
  days: DayBucket[];
  summary: DiaryStatsSummary;
  byMode: NamedCount[];
  byFinale: NamedCount[];
  byFinish: NamedCount[];
  byCumplay: NamedCount[];
};

const RANGE_DAYS: Record<Exclude<StatsRange, "all">, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local calendar day key. */
export function dayKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dayStartMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function formatDayLabel(key: string): string {
  const at = dayStartMs(key);
  return new Date(at).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

function emptyBucket(key: string): DayBucket {
  return {
    day: key,
    at: dayStartMs(key),
    label: formatDayLabel(key),
    sessions: 0,
    completed: 0,
    aborted: 0,
    edges: 0,
    ruins: 0,
    ateCum: 0,
    minutes: 0,
    moodSum: 0,
    moodCount: 0,
    finaleCum: 0,
    finaleRuin: 0,
    finaleDeny: 0,
    finaleNone: 0,
  };
}

function enumerateDays(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let cur = dayStartMs(fromKey);
  const end = dayStartMs(toKey);
  while (cur <= end) {
    const d = new Date(cur);
    out.push(
      `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    );
    cur += 24 * 60 * 60 * 1000;
  }
  return out;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function rangeStartKey(range: StatsRange, entryKeys: string[]): string | null {
  if (range === "all") {
    if (entryKeys.length === 0) return null;
    return entryKeys.reduce((a, b) => (a < b ? a : b));
  }
  const days = RANGE_DAYS[range];
  const end = dayStartMs(todayKey());
  const start = new Date(end - (days - 1) * 24 * 60 * 60 * 1000);
  return `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`;
}

function bumpNamed(
  map: Map<string, NamedCount>,
  id: string,
  label: string,
): void {
  const cur = map.get(id);
  if (cur) cur.count += 1;
  else map.set(id, { id, label, count: 1 });
}

function sortedNamed(map: Map<string, NamedCount>): NamedCount[] {
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "ru"),
  );
}

function finaleLabel(outcome?: FinaleOutcome): string {
  switch (outcome) {
    case "cum":
      return "Кончить";
    case "ruin":
      return "Руина";
    case "deny":
      return "Отказ";
    case undefined:
      return "Без финала";
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}

function modeFallback(mode: SessionMode, nameRu: string): string {
  return nameRu || mode;
}

function applyFinale(bucket: DayBucket, outcome?: FinaleOutcome): void {
  switch (outcome) {
    case "cum":
      bucket.finaleCum += 1;
      break;
    case "ruin":
      bucket.finaleRuin += 1;
      break;
    case "deny":
      bucket.finaleDeny += 1;
      break;
    case undefined:
      bucket.finaleNone += 1;
      break;
    default: {
      const _exhaustive: never = outcome;
      void _exhaustive;
      bucket.finaleNone += 1;
    }
  }
}

export function buildDiaryStats(
  entries: DiaryEntry[],
  range: StatsRange = "30d",
): DiaryStats {
  const keyed = entries
    .map((e) => ({ entry: e, day: dayKey(e.createdAt) }))
    .filter((x): x is { entry: DiaryEntry; day: string } => x.day != null);

  const start = rangeStartKey(
    range,
    keyed.map((k) => k.day),
  );
  const end = todayKey();

  const filtered =
    start == null
      ? []
      : keyed.filter((k) => k.day >= start && k.day <= end);

  const buckets = new Map<string, DayBucket>();
  if (start != null) {
    for (const key of enumerateDays(start, end)) {
      buckets.set(key, emptyBucket(key));
    }
  }

  const byMode = new Map<string, NamedCount>();
  const byFinale = new Map<string, NamedCount>();
  const byFinish = new Map<string, NamedCount>();
  const byCumplay = new Map<string, NamedCount>();

  const summary: DiaryStatsSummary = {
    sessions: 0,
    completed: 0,
    aborted: 0,
    abortPct: null,
    edges: 0,
    ruins: 0,
    ateCum: 0,
    minutes: 0,
    avgMood: null,
    avgEdges: null,
    avgRuins: null,
    avgMinutes: null,
    finaleCum: 0,
    finaleRuin: 0,
    finaleDeny: 0,
    finaleNone: 0,
  };

  let moodSum = 0;
  let moodCount = 0;

  for (const { entry, day } of filtered) {
    let bucket = buckets.get(day);
    if (!bucket) {
      bucket = emptyBucket(day);
      buckets.set(day, bucket);
    }

    bucket.sessions += 1;
    summary.sessions += 1;

    if (entry.ended === "complete") {
      bucket.completed += 1;
      summary.completed += 1;
    } else {
      bucket.aborted += 1;
      summary.aborted += 1;
    }

    const edges = Math.max(0, entry.edgesDone);
    const ruins = Math.max(0, entry.ruinsDone);
    const minutes = Math.max(0, entry.elapsedSec) / 60;

    bucket.edges += edges;
    bucket.ruins += ruins;
    bucket.minutes += minutes;
    summary.edges += edges;
    summary.ruins += ruins;
    summary.minutes += minutes;

    if (entryCumFate(entry) === "ate") {
      bucket.ateCum += 1;
      summary.ateCum += 1;
    }

    if (typeof entry.moodScore === "number" && Number.isFinite(entry.moodScore)) {
      bucket.moodSum += entry.moodScore;
      bucket.moodCount += 1;
      moodSum += entry.moodScore;
      moodCount += 1;
    }

    applyFinale(bucket, entry.finaleOutcome);
    switch (entry.finaleOutcome) {
      case "cum":
        summary.finaleCum += 1;
        break;
      case "ruin":
        summary.finaleRuin += 1;
        break;
      case "deny":
        summary.finaleDeny += 1;
        break;
      case undefined:
        summary.finaleNone += 1;
        break;
      default: {
        const _exhaustive: never = entry.finaleOutcome;
        void _exhaustive;
        summary.finaleNone += 1;
      }
    }

    bumpNamed(
      byMode,
      entry.mode,
      modeFallback(entry.mode, entry.modeNameRu),
    );
    bumpNamed(
      byFinale,
      entry.finaleOutcome ?? "none",
      finaleLabel(entry.finaleOutcome),
    );
    bumpNamed(byFinish, entry.finishId || "unknown", entry.finishNameRu || "—");
    bumpNamed(
      byCumplay,
      entry.cumplayId || "unknown",
      diaryCumplayNameRu(entry) || "—",
    );
  }

  if (summary.sessions > 0) {
    summary.avgEdges = summary.edges / summary.sessions;
    summary.avgRuins = summary.ruins / summary.sessions;
    summary.avgMinutes = summary.minutes / summary.sessions;
    summary.abortPct = Math.round((summary.aborted / summary.sessions) * 100);
  }
  if (moodCount > 0) summary.avgMood = moodSum / moodCount;

  const days = [...buckets.values()].sort((a, b) => a.at - b.at);

  return {
    range,
    days,
    summary,
    byMode: sortedNamed(byMode),
    byFinale: sortedNamed(byFinale),
    byFinish: sortedNamed(byFinish).slice(0, 12),
    byCumplay: sortedNamed(byCumplay).slice(0, 12),
  };
}

export function formatStatMinutes(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0) return r > 0 ? `${h} ч ${r} м` : `${h} ч`;
  return `${r} м`;
}

export function formatStatNumber(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("ru-RU", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

/** Abort share as «N%», or em dash when unknown. */
export function formatAbortPct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  return `${Math.max(0, Math.min(100, Math.round(pct)))}%`;
}
