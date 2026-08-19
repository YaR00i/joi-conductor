/**
 * Session-replay lite: restore plan params (+ media tags) from a diary entry
 * so Roulette can be seeded with «ещё раз такой же план».
 */

import { toys as catalogToys } from "./catalog";
import type { DiaryEntry } from "./sessionDiary";
import { DEFAULT_PARAMS, type SessionMood, type SessionParams } from "./types";

export type DiaryPlanReplay = {
  params: SessionParams;
  /** Raw gelbooru / media query when known. */
  mediaTags?: string;
  mood: SessionMood;
  seed?: number;
  /** True when rebuilt from summary fields (pre-planParams rows). */
  fromLegacy: boolean;
};

const SESSION_MODES = new Set<SessionParams["mode"]>([
  "stroke",
  "anal",
  "chastity",
  "onahole",
  "cbt",
  "oral",
  "prone",
  "plapping",
]);

const SESSION_MOODS = new Set<SessionMood>([
  "sweet",
  "cruel",
  "calm",
  "chaotic",
  "horny",
  "bored",
]);

function isSessionParams(raw: unknown): raw is SessionParams {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    typeof o.durationSec === "number" &&
    typeof o.mode === "string" &&
    SESSION_MODES.has(o.mode as SessionParams["mode"]) &&
    typeof o.edgesTarget === "number" &&
    typeof o.ruinsTarget === "number" &&
    typeof o.finishId === "string" &&
    typeof o.cumplayId === "string" &&
    typeof o.bpmMin === "number" &&
    typeof o.bpmMax === "number"
  );
}

/** Heuristic: human content labels use « · » / Cyrillic; tag queries use spaces + underscores. */
export function looksLikeMediaTagQuery(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  if (s.includes(" · ")) return false;
  if (/[А-Яа-яЁё]/.test(s) && !/[a-z0-9_]{3,}/i.test(s)) return false;
  // At least one token that looks like a booru tag or rating filter.
  return s
    .split(/\s+/)
    .some(
      (tok) =>
        tok.startsWith("rating:") ||
        tok.startsWith("-") ||
        /_/.test(tok) ||
        /^[a-z0-9][a-z0-9.+-]*$/i.test(tok),
    );
}

/** Parse «50–90», «60-120 BPM», «Медленно 50–90». */
export function parseBpmRangeFromLabel(
  label: string | undefined,
): { bpmMin: number; bpmMax: number } | null {
  if (!label) return null;
  const m = label.match(/(\d+)\s*[–\-]\s*(\d+)/);
  if (!m) {
    const single = label.match(/(\d+)\s*bpm/i);
    if (!single) return null;
    const n = Number(single[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    return { bpmMin: n, bpmMax: n };
  }
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0 || hi <= 0) {
    return null;
  }
  return { bpmMin: Math.min(lo, hi), bpmMax: Math.max(lo, hi) };
}

/** Match «Дилдо маленький · Пробка» (or «Без игрушек») back to catalog ids. */
export function parseToyIdsFromLabel(
  label: string | undefined,
): string[] | undefined {
  if (!label) return undefined;
  const trimmed = label.trim();
  if (!trimmed) return undefined;
  if (/без игрушек/i.test(trimmed)) return ["__none__"];

  const parts = trimmed
    .split(/\s*[·|,]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;

  const ids: string[] = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    const hit = catalogToys.find(
      (t) =>
        t.nameRu.toLowerCase() === lower ||
        t.id.toLowerCase() === lower,
    );
    if (hit) ids.push(hit.id);
  }
  return ids.length > 0 ? ids : undefined;
}

function resolveMediaTags(entry: DiaryEntry): string | undefined {
  const stored = entry.mediaTags?.trim();
  if (stored) return stored;
  const label = entry.tagsLabelRu?.trim();
  if (label && looksLikeMediaTagQuery(label)) return label;
  return undefined;
}

function mergePlanParams(
  base: SessionParams,
  patch: Partial<SessionParams>,
): SessionParams {
  return {
    ...base,
    ...patch,
    allowedFunctionIds:
      patch.allowedFunctionIds ?? base.allowedFunctionIds,
    allowedPatternIds: patch.allowedPatternIds ?? base.allowedPatternIds,
    allowedToyIds: patch.allowedToyIds ?? base.allowedToyIds,
  };
}

/**
 * Enough to seed Roulette: mode + planned duration (or a full planParams snap).
 * Aborted tiny rows without duration/mode are skipped.
 */
export function diaryEntryHasReplayablePlan(entry: DiaryEntry): boolean {
  if (entry.planParams && isSessionParams(entry.planParams)) return true;
  if (!SESSION_MODES.has(entry.mode)) return false;
  return (
    typeof entry.durationSec === "number" &&
    entry.durationSec > 0 &&
    typeof entry.edgesTarget === "number"
  );
}

/**
 * Build SessionParams (+ optional media tags) from a diary entry.
 * Prefer stored `planParams`; otherwise reconstruct from summary fields.
 */
export function extractDiaryPlanReplay(
  entry: DiaryEntry,
  base: SessionParams = DEFAULT_PARAMS,
): DiaryPlanReplay | null {
  if (!diaryEntryHasReplayablePlan(entry)) return null;

  const mood: SessionMood = SESSION_MOODS.has(entry.mood)
    ? entry.mood
    : "sweet";
  const mediaTags = resolveMediaTags(entry);

  if (entry.planParams && isSessionParams(entry.planParams)) {
    return {
      params: mergePlanParams(base, entry.planParams),
      mediaTags,
      mood,
      seed: entry.seed,
      fromLegacy: false,
    };
  }

  const bpm = parseBpmRangeFromLabel(entry.bpmLabelRu);
  const toyIds = parseToyIdsFromLabel(entry.toysLabelRu);

  const patch: Partial<SessionParams> = {
    durationSec: entry.durationSec,
    mode: entry.mode,
    edgesTarget: entry.edgesTarget,
    ruinsTarget: entry.ruinsTarget,
    finishId: entry.finishId || base.finishId,
    cumplayId: entry.cumplayId || base.cumplayId,
  };
  if (bpm) {
    patch.bpmMin = bpm.bpmMin;
    patch.bpmMax = bpm.bpmMax;
  }
  if (toyIds) {
    patch.allowedToyIds = toyIds;
  }

  return {
    params: mergePlanParams(base, patch),
    mediaTags,
    mood,
    seed: entry.seed,
    fromLegacy: true,
  };
}
