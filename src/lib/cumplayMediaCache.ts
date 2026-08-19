import {
  fetchGelbooruFlexible,
  namespaceMediaItems,
  shuffleMediaItems,
  type MediaItem,
} from "./media";
import {
  collectFavoriteTagStats,
  listFavoriteRecords,
} from "./mediaFavorites";
import { getActiveMistress } from "./mistress";
import {
  getTagType,
  loadTagTypeMap,
  type TagTypeId,
} from "./tagTypes";

/** Cumplay-related booru tags — queried one-at-a-time against the main cache query. */
export const CUMPLAY_CUM_TAGS = [
  "cum_in_mouth",
  "gokkun",
  "bukkake",
  "cum_on_face",
  "cum_on_tongue",
  "swallowing",
  "oral_creampie",
  "cum_drip",
  "excessive_cum",
  "cum_on_body",
] as const;

const CUMPLAY_CUM_TAG_SET = new Set<string>([
  ...CUMPLAY_CUM_TAGS,
  "cum",
  "semen",
  "facial",
  "cumshot",
]);

/** Tag types that define the “taste” of the main library (not meta/artist). */
const CUMPLAY_ANCHOR_TYPES = new Set<TagTypeId>([
  "fetish",
  "body",
  "action",
  "character",
  "appearance",
  "clothing",
]);

const DEFAULT_BASE_FALLBACK = "rating:explicit 1girl";

export type CumplayCacheFetchOpts = {
  userId: string;
  apiKey: string;
  /** Main session/library Gelbooru query — cum tags are appended to this. */
  mediaQueryTags?: string;
  /** Soft abort — skip if generation changed. */
  isStale?: () => boolean;
  /** Max Gelbooru queries (base × one cum tag). */
  maxQueries?: number;
  /** Cap final deck size. */
  maxItems?: number;
};

function shuffleInPlace<T>(arr: T[], rng = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = a;
  }
  return arr;
}

function isOperatorToken(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  return (
    t.startsWith("rating:") ||
    t.startsWith("sort:") ||
    t.startsWith("score:") ||
    t.startsWith("order:") ||
    t.startsWith("md5:") ||
    t.startsWith("id:")
  );
}

function isCumRelatedToken(raw: string): boolean {
  const t = raw.trim().toLowerCase().replace(/^-/, "");
  if (!t) return false;
  if (CUMPLAY_CUM_TAG_SET.has(t)) return true;
  return t.startsWith("cum_") || t.startsWith("cumshot");
}

/**
 * Content anchors from Избранное: Фавориты / Тело / Действие / Персонаж / …
 * Used when the main library query has no content tags of its own.
 */
export async function resolveCumplayContentAnchors(opts?: {
  max?: number;
}): Promise<string[]> {
  const max = Math.max(1, opts?.max ?? 4);
  const map = loadTagTypeMap();
  const out: string[] = [];
  const seen = new Set<string>();

  try {
    const records = await listFavoriteRecords();
    const stats = collectFavoriteTagStats(records);
    for (const row of stats) {
      const tag = row.tag.trim().toLowerCase();
      if (!tag || seen.has(tag) || isCumRelatedToken(tag)) continue;
      if (!CUMPLAY_ANCHOR_TYPES.has(getTagType(tag, map))) continue;
      seen.add(tag);
      out.push(tag);
      if (out.length >= max) break;
    }
  } catch {
    // IndexedDB unavailable
  }

  return out;
}

/**
 * Base query for cumplay = main cache query (minus any cum tags already in it).
 * If the main query is only rating/meta, pull anchors from Favorites sections
 * (Фавориты, Тело, Действие, Персонаж, …).
 */
export async function resolveCumplayBaseQuery(opts?: {
  mediaQueryTags?: string;
}): Promise<string> {
  const raw = (opts?.mediaQueryTags ?? "").trim();
  const tokens = raw.split(/\s+/).filter(Boolean);

  const rating =
    tokens.find((t) => t.toLowerCase().startsWith("rating:")) ??
    "rating:explicit";
  const excludes = tokens.filter((t) => t.startsWith("-") && t.length > 1);
  const content = tokens.filter((t) => {
    if (t.startsWith("-")) return false;
    if (isOperatorToken(t)) return false;
    if (isCumRelatedToken(t)) return false;
    return true;
  });

  if (content.length > 0) {
    return [rating, ...content, ...excludes].join(" ");
  }

  const anchors = await resolveCumplayContentAnchors({ max: 3 });
  if (anchors.length > 0) {
    return [rating, ...anchors, ...excludes].join(" ");
  }

  return excludes.length > 0
    ? `${DEFAULT_BASE_FALLBACK} ${excludes.join(" ")}`
    : DEFAULT_BASE_FALLBACK;
}

/**
 * Build a small cumplay deck: take the main library query and run separate
 * searches of `base + one cum tag` (not all cum tags at once), then merge.
 */
export async function fetchCumplayMediaCache(
  opts: CumplayCacheFetchOpts,
): Promise<MediaItem[]> {
  const maxQueries = Math.max(3, opts.maxQueries ?? 8);
  const maxItems = Math.max(6, opts.maxItems ?? 16);
  const base = await resolveCumplayBaseQuery({
    mediaQueryTags: opts.mediaQueryTags,
  });
  const bias = getActiveMistress().media.cumplayBiasTags;
  const pool =
    bias.length > 0
      ? [...new Set([...bias, ...CUMPLAY_CUM_TAGS])]
      : [...CUMPLAY_CUM_TAGS];
  const cumTags = shuffleInPlace(pool).slice(0, maxQueries);

  const collected: MediaItem[] = [];
  const seenIds = new Set<string>();

  const pushItems = (items: MediaItem[]) => {
    for (const item of items) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      collected.push(item);
      if (collected.length >= maxItems) break;
    }
  };

  for (const cum of cumTags) {
    if (opts.isStale?.()) return collected;
    if (collected.length >= maxItems) break;
    const tags = `${base} ${cum}`;
    try {
      const { items } = await fetchGelbooruFlexible(tags, 8, {
        userId: opts.userId,
        apiKey: opts.apiKey,
      });
      pushItems(items);
    } catch {
      // skip failed pair
    }
  }

  // Soft fallback: same base + generic cum if still thin
  if (collected.length < 4 && !opts.isStale?.()) {
    try {
      const { items } = await fetchGelbooruFlexible(`${base} cum`, 12, {
        userId: opts.userId,
        apiKey: opts.apiKey,
      });
      pushItems(items);
    } catch {
      // ignore
    }
  }

  // Last resort: single favorite anchors × cum (when AND on full base is empty)
  if (collected.length < 4 && !opts.isStale?.()) {
    const anchors = await resolveCumplayContentAnchors({ max: 3 });
    const leftoverCum = shuffleInPlace([...CUMPLAY_CUM_TAGS]).slice(0, 4);
    for (const anchor of anchors) {
      for (const cum of leftoverCum) {
        if (opts.isStale?.() || collected.length >= maxItems) break;
        try {
          const { items } = await fetchGelbooruFlexible(
            `rating:explicit ${anchor} ${cum}`,
            6,
            { userId: opts.userId, apiKey: opts.apiKey },
          );
          pushItems(items);
        } catch {
          // skip
        }
      }
      if (collected.length >= maxItems) break;
    }
  }

  if (collected.length === 0) return [];
  return namespaceMediaItems(
    shuffleMediaItems(collected).slice(0, maxItems),
    "cumplay",
  );
}
