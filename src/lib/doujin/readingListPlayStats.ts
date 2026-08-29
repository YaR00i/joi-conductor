export type ReadingListPlayStats = {
  edges: number;
  ruins: number;
  orgasms: number;
};

export type ReadingPlayCounters = {
  edgesDone: number;
  ruinsDone: number;
  orgasmsDone: number;
};

export const EMPTY_READING_LIST_PLAY_STATS: ReadingListPlayStats = {
  edges: 0,
  ruins: 0,
  orgasms: 0,
};

function rec(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

export function clampPlayStat(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

export function parseReadingListPlayStats(raw: unknown): ReadingListPlayStats {
  const o = rec(raw);
  if (!o) return { ...EMPTY_READING_LIST_PLAY_STATS };
  return {
    edges: clampPlayStat(typeof o.edges === "number" ? o.edges : 0),
    ruins: clampPlayStat(typeof o.ruins === "number" ? o.ruins : 0),
    orgasms: clampPlayStat(typeof o.orgasms === "number" ? o.orgasms : 0),
  };
}

export function addReadingListPlayStats(
  base: ReadingListPlayStats | undefined,
  delta: ReadingListPlayStats,
): ReadingListPlayStats {
  const prev = base ?? EMPTY_READING_LIST_PLAY_STATS;
  return {
    edges: clampPlayStat(prev.edges + delta.edges),
    ruins: clampPlayStat(prev.ruins + delta.ruins),
    orgasms: clampPlayStat(prev.orgasms + delta.orgasms),
  };
}

export function readingPlayStatsDelta(
  before: ReadingPlayCounters,
  after: ReadingPlayCounters,
): ReadingListPlayStats {
  return {
    edges: clampPlayStat(after.edgesDone - before.edgesDone),
    ruins: clampPlayStat(after.ruinsDone - before.ruinsDone),
    orgasms: clampPlayStat(after.orgasmsDone - before.orgasmsDone),
  };
}

export function readingPlayStatsHasAny(stats: ReadingListPlayStats): boolean {
  return stats.edges > 0 || stats.ruins > 0 || stats.orgasms > 0;
}

export function formatReadingPlayStats(stats: ReadingListPlayStats): string {
  return `эдж ${stats.edges} · руин ${stats.ruins} · орг ${stats.orgasms}`;
}

export function readingPlayStatsCaption(
  stats: ReadingListPlayStats | undefined,
): string | null {
  const next = stats ?? EMPTY_READING_LIST_PLAY_STATS;
  if (!readingPlayStatsHasAny(next)) return null;
  return formatReadingPlayStats(next);
}
