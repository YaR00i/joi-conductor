import { isTasteTag, MAX_LIBRARY_SORT_TAGS, MAX_LOVED_TAGS } from "./query";
import { normalizeTagName } from "./safety";
import type {
  DoujinCategoryFilter,
  DoujinLanguageFilter,
  DoujinLibraryCatalogSort,
  DoujinMinFavorites,
  DoujinPagesBand,
  DoujinRecsPrefs,
  DoujinSettings,
  DoujinTag,
  DoujinTagType,
} from "./types";
import {
  DOUJIN_LIBRARY_CATALOG_SORTS,
  DOUJIN_SEARCH_SORTS,
} from "./types";

export const DOUJIN_SETTINGS_KEY = "joi-doujin-settings-v1";

export const DEFAULT_DOUJIN_RECS: DoujinRecsPrefs = {
  language: "english",
  sort: "popular",
  category: "all",
  pagesBand: "all",
  minFavorites: "all",
};

export const DEFAULT_DOUJIN_SETTINGS: DoujinSettings = {
  apiKey: "",
  recs: { ...DEFAULT_DOUJIN_RECS },
  lovedTags: [],
  librarySortTags: [],
  libraryCatalogSort: "added",
};

const LANGS: readonly DoujinLanguageFilter[] = [
  "all",
  "english",
  "japanese",
  "chinese",
];
const CATEGORIES: readonly DoujinCategoryFilter[] = [
  "all",
  "doujinshi",
  "manga",
  "artistcg",
  "gamecg",
  "imageset",
  "western",
  "non-h",
  "misc",
];
const PAGE_BANDS: readonly DoujinPagesBand[] = ["all", "short", "mid", "long"];
const MIN_FAVS: readonly DoujinMinFavorites[] = ["all", "100", "500", "1000"];

function pick<T extends string>(
  v: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}

export function parseLovedTags(raw: unknown): DoujinTag[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DoujinTag[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.type !== "string" || typeof o.name !== "string") continue;
    const tag: DoujinTag = {
      type: o.type as DoujinTagType,
      name: normalizeTagName(o.name),
    };
    if (typeof o.id === "number" && Number.isInteger(o.id) && o.id > 0) {
      tag.id = o.id;
    }
    if (!isTasteTag(tag)) continue;
    const key = `${tag.type}:${tag.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_LOVED_TAGS) break;
  }
  return out;
}

export function parseLibrarySortTags(raw: unknown): DoujinTag[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DoujinTag[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.type !== "string" || typeof o.name !== "string") continue;
    const tag: DoujinTag = {
      type: o.type as DoujinTagType,
      name: normalizeTagName(o.name),
    };
    if (!tag.name) continue;
    if (typeof o.id === "number" && Number.isInteger(o.id) && o.id > 0) {
      tag.id = o.id;
    }
    const key = `${tag.type}:${tag.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_LIBRARY_SORT_TAGS) break;
  }
  return out;
}

export function parseDoujinRecs(
  raw: unknown,
  fallback: DoujinRecsPrefs = DEFAULT_DOUJIN_RECS,
): DoujinRecsPrefs {
  const o =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    language: pick(o.language, LANGS, fallback.language),
    sort: pick(o.sort, DOUJIN_SEARCH_SORTS, fallback.sort),
    category: pick(o.category, CATEGORIES, fallback.category),
    pagesBand: pick(o.pagesBand, PAGE_BANDS, fallback.pagesBand),
    minFavorites: pick(o.minFavorites, MIN_FAVS, fallback.minFavorites),
  };
}

export function loadDoujinSettings(): DoujinSettings {
  try {
    const raw = localStorage.getItem(DOUJIN_SETTINGS_KEY);
    if (!raw) {
      return {
        apiKey: "",
        recs: { ...DEFAULT_DOUJIN_RECS },
        lovedTags: [],
        librarySortTags: [],
        libraryCatalogSort: "added",
      };
    }
    const parsed = JSON.parse(raw) as Partial<DoujinSettings> & {
      recs?: unknown;
      lovedTags?: unknown;
      librarySortTags?: unknown;
      libraryCatalogSort?: unknown;
    };
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      recs: parseDoujinRecs(parsed.recs),
      lovedTags: parseLovedTags(parsed.lovedTags),
      librarySortTags: parseLibrarySortTags(parsed.librarySortTags),
      libraryCatalogSort: pick(
        parsed.libraryCatalogSort,
        DOUJIN_LIBRARY_CATALOG_SORTS,
        "added",
      ),
    };
  } catch {
    return {
      apiKey: "",
      recs: { ...DEFAULT_DOUJIN_RECS },
      lovedTags: [],
      librarySortTags: [],
      libraryCatalogSort: "added",
    };
  }
}

export function saveDoujinSettings(patch: {
  apiKey?: string;
  recs?: Partial<DoujinRecsPrefs>;
  lovedTags?: readonly DoujinTag[];
  librarySortTags?: readonly DoujinTag[];
  libraryCatalogSort?: DoujinLibraryCatalogSort;
}): DoujinSettings {
  const prev = loadDoujinSettings();
  const next: DoujinSettings = {
    apiKey: (patch.apiKey ?? prev.apiKey).trim(),
    recs: patch.recs
      ? parseDoujinRecs({ ...prev.recs, ...patch.recs }, prev.recs)
      : prev.recs,
    lovedTags: parseLovedTags(patch.lovedTags ?? prev.lovedTags),
    librarySortTags: parseLibrarySortTags(
      patch.librarySortTags ?? prev.librarySortTags,
    ),
    libraryCatalogSort: pick(
      patch.libraryCatalogSort ?? prev.libraryCatalogSort,
      DOUJIN_LIBRARY_CATALOG_SORTS,
      prev.libraryCatalogSort,
    ),
  };
  localStorage.setItem(
    DOUJIN_SETTINGS_KEY,
    JSON.stringify({
      apiKey: next.apiKey,
      recs: next.recs,
      lovedTags: next.lovedTags,
      librarySortTags: next.librarySortTags,
      libraryCatalogSort: next.libraryCatalogSort,
    }),
  );
  return next;
}
