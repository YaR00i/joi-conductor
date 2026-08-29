import { recsShuffleIndex } from "../recsShuffle";
import { normalizeTagName, tagIsBlocked } from "./safety";
import type {
  DoujinCard,
  DoujinCategoryFilter,
  DoujinLanguageFilter,
  DoujinLibraryCatalogSort,
  DoujinMinFavorites,
  DoujinPagesBand,
  DoujinTag,
} from "./types";

const TASTE_TYPES = new Set(["tag", "parody", "character", "artist", "group"]);

const TASTE_NOISE = new Set([
  "english",
  "japanese",
  "chinese",
  "translated",
  "rewrite",
  "speechless",
  "text cleaned",
  "full color",
  "mosaic censorship",
  "uncensored",
  "already uploaded",
  "doujinshi",
  "manga",
  "artistcg",
  "gamecg",
  "imageset",
  "western",
  "non-h",
  "misc",
]);

export type BuiltSearchQuery = {
  query: string;
  stripped: string[];
};

function quoteToken(raw: string): string {
  const n = normalizeTagName(raw);
  if (!n) return "";
  return n.includes(" ") ? `"${n}"` : n;
}

/** Tag names that really contain a hyphen (URL slug == API name). */
const HYPHEN_TAG_NAMES = new Set(["non-h"]);

const NAME_PREFIXES = [
  "tag",
  "artist",
  "parody",
  "character",
  "group",
  "language",
  "category",
] as const;

export type DoujinNamePrefix = (typeof NAME_PREFIXES)[number];

function isNamePrefix(raw: string): raw is DoujinNamePrefix {
  return (NAME_PREFIXES as readonly string[]).includes(raw);
}

/**
 * nhentai URLs use hyphens for spaces (`/artist/mokuyama-hito/` → `mokuyama hito`).
 * A raw hyphen in /search is a minus, so unquoted slugs match the wrong people.
 */
export function nhentaiSlugToName(slug: string): string {
  const n = normalizeTagName(slug);
  if (!n) return "";
  if (HYPHEN_TAG_NAMES.has(n)) return n;
  return n.replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

/** Inverse of `nhentaiSlugToName` for `GET /tags/{type}/{slug}`. */
export function nameToNhentaiSlug(name: string): string {
  const n = nhentaiSlugToName(name);
  if (!n) return "";
  if (HYPHEN_TAG_NAMES.has(n)) return n;
  return n.replace(/\s+/g, "-");
}

export type ExactTagLookup = {
  type: DoujinNamePrefix;
  name: string;
  slug: string;
};

/**
 * One prefixed name (or a browse URL) — the site page `/artist/muk/`,
 * not `/search?query=artist:muk` which prefix-matches other artists.
 */
export function parseExactTagLookup(raw: string): ExactTagLookup | null {
  const normalized = normalizeSearchQuery(raw);
  if (!normalized) return null;
  const tokens = tokenizeQuery(normalized);
  if (tokens.length !== 1) return null;
  const m = tokens[0]!.match(
    /^(tag|artist|parody|character|group|language|category):"([^"]+)"$/i,
  );
  if (!m?.[1] || !m[2]) return null;
  const typeRaw = m[1].toLowerCase();
  if (!isNamePrefix(typeRaw)) return null;
  const name = nhentaiSlugToName(m[2]);
  const slug = nameToNhentaiSlug(name);
  if (!name || !slug) return null;
  return { type: typeRaw, name, slug };
}

export function formatPrefixedTerm(prefix: string, name: string): string {
  const value = nhentaiSlugToName(name);
  if (!value) return "";
  return `${prefix}:"${value}"`;
}

function rewritePrefixedToken(token: string): string {
  const m = token.match(
    /^(-)?(tag|artist|parody|character|group|language|category):(?:"([^"]*)"|(.*))$/i,
  );
  if (!m) return token;
  const value = (m[3] ?? m[4] ?? "").trim();
  if (!value) return token;
  const formatted = formatPrefixedTerm(m[2]!.toLowerCase(), value);
  if (!formatted) return token;
  return `${m[1] ?? ""}${formatted}`;
}

/** `/artist/mokuyama-hito/` or a full nhentai.net browse URL. */
export function parseNhentaiBrowseUrl(raw: string): string | null {
  const t = raw.trim();
  const m = t.match(
    /^(?:https?:\/\/)?(?:www\.)?nhentai\.net\/(artist|tag|parody|character|group|category|language)\/([^/?#]+)\/?(?:[?#].*)?$/i,
  );
  if (!m?.[1] || !m[2]) return null;
  let slug = m[2];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    /* keep raw */
  }
  return formatPrefixedTerm(m[1].toLowerCase(), slug);
}

/** Turn URL slugs and unquoted `artist:foo-bar` into exact `artist:"foo bar"`. */
export function normalizeSearchQuery(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const fromUrl = parseNhentaiBrowseUrl(t);
  if (fromUrl) return fromUrl;
  return tokenizeQuery(t).map(rewritePrefixedToken).join(" ");
}

export function negativeToken(tag: string): string {
  const q = quoteToken(tag);
  return q ? `-${q}` : "";
}

/** Split a nhentai-style query into tokens, keeping quoted groups. */
export function tokenizeQuery(raw: string): string[] {
  const out: string[] = [];
  const re = /(-)?(?:(\w+):)?(?:"([^"]*)"|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out.push(m[0]!.trim());
  }
  return out.filter(Boolean);
}

function tokenTagName(token: string): string {
  const m = token.match(/^-?(?:[\w-]+:)?"?([^"]*)"?$/);
  if (!m) return normalizeTagName(token.replace(/^-/, ""));
  return normalizeTagName(m[1] ?? "");
}

export function stripBlockedTokens(
  query: string,
  blacklist: readonly string[],
): BuiltSearchQuery {
  const stripped: string[] = [];
  const kept: string[] = [];
  for (const token of tokenizeQuery(query)) {
    const name = tokenTagName(token);
    if (name && tagIsBlocked(name, blacklist) && !token.startsWith("-")) {
      stripped.push(name);
      continue;
    }
    kept.push(token);
  }
  return { query: kept.join(" ").trim(), stripped };
}

export function withBlacklistNegatives(
  query: string,
  blacklist: readonly string[],
): string {
  const parts = query.trim() ? [query.trim()] : [];
  const have = new Set(tokenizeQuery(query).map((t) => t.toLowerCase()));
  for (const tag of blacklist) {
    const neg = negativeToken(tag);
    if (!neg) continue;
    if (have.has(neg.toLowerCase())) continue;
    parts.push(neg);
    have.add(neg.toLowerCase());
  }
  return parts.join(" ").trim();
}

function appendUniqueTokens(query: string, tokens: readonly string[]): string {
  const have = new Set(tokenizeQuery(query).map((t) => t.toLowerCase()));
  const parts = query.trim() ? [query.trim()] : [];
  for (const token of tokens) {
    const t = token.trim();
    if (!t || have.has(t.toLowerCase())) continue;
    parts.push(t);
    have.add(t.toLowerCase());
  }
  return parts.join(" ").trim();
}

export function withLanguage(
  query: string,
  language: DoujinLanguageFilter,
): string {
  if (language === "all") return query.trim();
  return appendUniqueTokens(query, [`language:${language}`]);
}

export function withCategory(
  query: string,
  category: DoujinCategoryFilter,
): string {
  if (category === "all") return query.trim();
  return appendUniqueTokens(query, [`category:${category}`]);
}

export function withPagesBand(
  query: string,
  band: DoujinPagesBand,
): string {
  switch (band) {
    case "all":
      return query.trim();
    case "short":
      return appendUniqueTokens(query, ["pages:<20"]);
    case "mid":
      return appendUniqueTokens(query, ["pages:>=20", "pages:<80"]);
    case "long":
      return appendUniqueTokens(query, ["pages:>=80"]);
    default: {
      const _never: never = band;
      return _never;
    }
  }
}

export function withMinFavorites(
  query: string,
  min: DoujinMinFavorites,
): string {
  if (min === "all") return query.trim();
  return appendUniqueTokens(query, [`favorites:>=${min}`]);
}

export function appendSearchPrefix(query: string, prefix: string): string {
  const insert = prefix.trim();
  if (!insert) return query.trim();
  const t = query.trim();
  return t ? `${t} ${insert}` : insert;
}

function galleryIdFromDigits(raw: string): number | null {
  if (!/^\d{1,8}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Whole-query gallery lookup: `675882`, `#675882`, `g/675882`,
 * `id:675882`, or `https://nhentai.net/g/675882`.
 * Bare numbers are 5–8 digits so a year like `2024` stays a text search.
 */
export function parseGalleryCode(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const fromUrl = t.match(
    /(?:https?:\/\/)?(?:www\.)?nhentai\.net\/g\/(\d{1,8})\b/i,
  );
  if (fromUrl?.[1]) return galleryIdFromDigits(fromUrl[1]);
  const fromPath = t.match(/^g\/(\d{1,8})\/?$/i);
  if (fromPath?.[1]) return galleryIdFromDigits(fromPath[1]);
  const fromHash = t.match(/^#(\d{1,8})$/);
  if (fromHash?.[1]) return galleryIdFromDigits(fromHash[1]);
  const fromId = t.match(/^id:(\d{1,8})$/i);
  if (fromId?.[1]) return galleryIdFromDigits(fromId[1]);
  if (/^\d{5,8}$/.test(t)) return galleryIdFromDigits(t);
  return null;
}

export const SEARCH_PREFIXES: ReadonlyArray<{
  id: string;
  insert: string;
  hint: string;
}> = [
  { id: "id", insert: "id:", hint: "код галереи" },
  { id: "tag", insert: "tag:", hint: "тег" },
  { id: "artist", insert: "artist:", hint: "автор" },
  { id: "parody", insert: "parody:", hint: "пародия" },
  { id: "character", insert: "character:", hint: "персонаж" },
  { id: "group", insert: "group:", hint: "круг" },
  { id: "pages", insert: "pages:", hint: "страницы" },
  { id: "favorites", insert: "favorites:", hint: "закладки сайта" },
  { id: "uploaded", insert: "uploaded:", hint: "дата" },
  { id: "title", insert: 'title:""', hint: "название" },
  { id: "jtitle", insert: 'jtitle:""', hint: "яп. название" },
];

export function buildSearchQuery(opts: {
  userQuery: string;
  language: DoujinLanguageFilter;
  category?: DoujinCategoryFilter;
  pagesBand?: DoujinPagesBand;
  minFavorites?: DoujinMinFavorites;
  blacklist: readonly string[];
}): BuiltSearchQuery {
  const stripped = stripBlockedTokens(
    normalizeSearchQuery(opts.userQuery),
    opts.blacklist,
  );
  let q = withLanguage(stripped.query, opts.language);
  q = withCategory(q, opts.category ?? "all");
  q = withPagesBand(q, opts.pagesBand ?? "all");
  q = withMinFavorites(q, opts.minFavorites ?? "all");
  return {
    query: withBlacklistNegatives(q, opts.blacklist),
    stripped: stripped.stripped,
  };
}

/** Rank tag ids by how many galleries they appear in (once per gallery). */
export function rankTagIdStats(
  idLists: readonly number[][],
): Array<{ id: number; count: number }> {
  const map = new Map<number, number>();
  for (const ids of idLists) {
    const seen = new Set<number>();
    for (const id of ids) {
      if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      map.set(id, (map.get(id) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([id, count]) => ({ id, count }));
}

export function rankTagIds(idLists: readonly number[][]): number[] {
  return rankTagIdStats(idLists).map((row) => row.id);
}

function typePrefix(type: DoujinTag["type"]): string {
  switch (type) {
    case "artist":
      return "artist:";
    case "character":
      return "character:";
    case "parody":
      return "parody:";
    case "group":
      return "group:";
    case "category":
      return "category:";
    case "tag":
    case "language":
    case "unknown":
      return "tag:";
    default: {
      const _never: never = type;
      return _never;
    }
  }
}

export function tagToQueryTerm(tag: DoujinTag): string {
  const name = normalizeTagName(tag.name);
  if (!name) return "";
  if (TASTE_TYPES.has(tag.type) && tag.type !== "tag") {
    const prefix = typePrefix(tag.type).replace(/:$/, "");
    return formatPrefixedTerm(prefix, name);
  }
  return formatPrefixedTerm("tag", name);
}

export function scoreTagNameMatch(name: string, query: string): number {
  const n = normalizeTagName(name);
  const q = normalizeTagName(query);
  if (!q || !n) return -1;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(q)) return 2;
  return -1;
}

const SEARCH_TAG_PREFIXES = new Set([
  "tag",
  "artist",
  "parody",
  "character",
  "group",
  "language",
  "category",
]);
const SEARCH_NON_TAG_PREFIXES = new Set([
  "id",
  "pages",
  "favorites",
  "uploaded",
  "title",
  "jtitle",
]);

export function splitLastSearchToken(query: string): {
  before: string;
  token: string;
} {
  if (!query || /\s$/.test(query)) return { before: query, token: "" };
  const start = query.search(/\S+$/);
  if (start < 0) return { before: query, token: "" };
  return { before: query.slice(0, start), token: query.slice(start) };
}

export function replaceLastSearchToken(query: string, nextToken: string): string {
  const { before } = splitLastSearchToken(query);
  const head = before.replace(/\s+$/, "");
  const term = nextToken.trim();
  if (!term) return query;
  return head ? `${head} ${term} ` : `${term} `;
}

export function suggestTagsForSearchQuery(
  tags: readonly DoujinTag[],
  query: string,
  limit = 12,
): DoujinTag[] {
  const { token } = splitLastSearchToken(query);
  if (!token || token.startsWith("-")) return [];
  const colon = token.indexOf(":");
  let typeFilter: DoujinTag["type"] | null = null;
  let nameQ = token;
  if (colon > 0) {
    const prefix = token.slice(0, colon).toLowerCase();
    if (SEARCH_NON_TAG_PREFIXES.has(prefix)) return [];
    if (SEARCH_TAG_PREFIXES.has(prefix)) {
      typeFilter = prefix as DoujinTag["type"];
      nameQ = token.slice(colon + 1).replace(/^["']+|["']+$/g, "");
    }
  } else {
    nameQ = token.replace(/^["']+|["']+$/g, "");
  }
  const name = normalizeTagName(nameQ);
  if (!name && !typeFilter) return [];
  const pool = typeFilter ? tags.filter((tag) => tag.type === typeFilter) : tags;
  const scored: Array<{ tag: DoujinTag; score: number }> = [];
  for (const tag of pool) {
    const score = name ? scoreTagNameMatch(tag.name, name) : 3;
    if (score < 0) continue;
    scored.push({ tag, score });
  }
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const ca =
      typeof a.tag.count === "number" && Number.isFinite(a.tag.count)
        ? a.tag.count
        : 0;
    const cb =
      typeof b.tag.count === "number" && Number.isFinite(b.tag.count)
        ? b.tag.count
        : 0;
    return cb - ca || a.tag.name.localeCompare(b.tag.name);
  });
  const seen = new Set<string>();
  const out: DoujinTag[] = [];
  for (const { tag } of scored) {
    const key = tasteTagKey(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= limit) break;
  }
  return out;
}

export function tasteTagKey(tag: Pick<DoujinTag, "type" | "name">): string {
  return `${tag.type}:${normalizeTagName(tag.name)}`;
}

export function isTasteTag(tag: Pick<DoujinTag, "type" | "name">): boolean {
  const name = normalizeTagName(tag.name);
  return TASTE_TYPES.has(tag.type) && Boolean(name) && !TASTE_NOISE.has(name);
}

export function collectTasteTagCounts(
  tags: readonly DoujinTag[],
): Array<{ tag: DoujinTag; count: number }> {
  const map = new Map<string, { tag: DoujinTag; count: number }>();
  for (const tag of tags) {
    if (!TASTE_TYPES.has(tag.type)) continue;
    const name = normalizeTagName(tag.name);
    if (!name || TASTE_NOISE.has(name)) continue;
    const key = `${tag.type}:${name}`;
    const add =
      typeof tag.count === "number" && Number.isFinite(tag.count) && tag.count > 0
        ? Math.floor(tag.count)
        : 1;
    const prev = map.get(key);
    if (prev) prev.count += add;
    else map.set(key, { tag: { ...tag, name }, count: add });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export const LOVED_TAG_MULTIPLIER = 5;
export const LOVED_TAG_BONUS = 15;
export const MAX_LOVED_TAGS = 24;
export const MAX_LIBRARY_SORT_TAGS = 8;

export function tasteWeight(count: number, loved: boolean): number {
  const n = Math.max(0, count);
  return loved ? n * LOVED_TAG_MULTIPLIER + LOVED_TAG_BONUS : n;
}

export function toggleLovedTag(
  list: readonly DoujinTag[],
  tag: DoujinTag,
): DoujinTag[] {
  const name = normalizeTagName(tag.name);
  if (!isTasteTag({ type: tag.type, name })) {
    return [...list];
  }
  const nextTag: DoujinTag = { type: tag.type, name, id: tag.id };
  const key = tasteTagKey(nextTag);
  if (list.some((row) => tasteTagKey(row) === key)) {
    return list.filter((row) => tasteTagKey(row) !== key);
  }
  return [nextTag, ...list].slice(0, MAX_LOVED_TAGS);
}

export function toggleLibrarySortTag(
  list: readonly DoujinTag[],
  tag: DoujinTag,
): DoujinTag[] {
  const name = normalizeTagName(tag.name);
  if (!name) return [...list];
  const nextTag: DoujinTag = { type: tag.type, name, id: tag.id };
  const key = tasteTagKey(nextTag);
  if (list.some((row) => tasteTagKey(row) === key)) {
    return list.filter((row) => tasteTagKey(row) !== key);
  }
  return [nextTag, ...list].slice(0, MAX_LIBRARY_SORT_TAGS);
}

export function moveLibrarySortTag(
  list: readonly DoujinTag[],
  from: number,
  to: number,
): DoujinTag[] {
  const next = [...list];
  if (
    from < 0 ||
    to < 0 ||
    from >= next.length ||
    to >= next.length ||
    from === to
  ) {
    return next;
  }
  const item = next[from]!;
  next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export type FavoriteSortRow = {
  id: number;
  tagIds: readonly number[];
  tags?: readonly DoujinTag[];
};

export type FavoriteCatalogRow = FavoriteSortRow & {
  ord?: number;
  uploadedAt?: number;
  numFavorites?: number;
  numPages?: number;
};

function compareCatalogAdded(a: FavoriteCatalogRow, b: FavoriteCatalogRow): number {
  const ao = a.ord;
  const bo = b.ord;
  if (ao != null && bo != null && ao !== bo) return ao - bo;
  if (ao != null && bo == null) return -1;
  if (ao == null && bo != null) return 1;
  return a.id - b.id;
}

function compareDescPresent(
  a: number | undefined,
  b: number | undefined,
): number {
  const av = a != null && a > 0 ? a : 0;
  const bv = b != null && b > 0 ? b : 0;
  if (av === 0 && bv === 0) return 0;
  if (av === 0) return 1;
  if (bv === 0) return -1;
  return bv - av;
}

export function compareFavoriteCatalog(
  a: FavoriteCatalogRow,
  b: FavoriteCatalogRow,
  catalogSort: DoujinLibraryCatalogSort,
): number {
  switch (catalogSort) {
    case "added":
      return compareCatalogAdded(a, b);
    case "uploaded": {
      const byDate = compareDescPresent(a.uploadedAt, b.uploadedAt);
      return byDate !== 0 ? byDate : compareCatalogAdded(a, b);
    }
    case "popular": {
      const byFav = compareDescPresent(a.numFavorites, b.numFavorites);
      return byFav !== 0 ? byFav : compareCatalogAdded(a, b);
    }
    case "pages": {
      const byPages = compareDescPresent(a.numPages, b.numPages);
      return byPages !== 0 ? byPages : compareCatalogAdded(a, b);
    }
    default: {
      const _never: never = catalogSort;
      return _never;
    }
  }
}

export function orderFavoriteCatalogIds(
  rows: readonly FavoriteCatalogRow[],
  sortTags: readonly DoujinTag[] = [],
  catalogSort: DoujinLibraryCatalogSort = "added",
): number[] {
  const pool =
    sortTags.length > 0
      ? rows.filter((row) => favoriteMatchScore(row, sortTags) > 0)
      : rows.slice();
  pool.sort((a, b) => compareFavoriteCatalog(a, b, catalogSort));
  return pool.map((row) => row.id);
}

function unionTagIds(
  ...lists: readonly (readonly number[] | undefined)[]
): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const list of lists) {
    if (!list) continue;
    for (const id of list) {
      if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Snapshot first (favorites recency), then the rest of the synced ledger. */
export function buildFavoriteSortUniverse(
  snap: readonly FavoriteSortRow[],
  ledger: readonly FavoriteSortRow[],
): FavoriteSortRow[] {
  const tagById = new Map<number, number[]>();
  const namesById = new Map<number, readonly DoujinTag[]>();
  const merge = (row: FavoriteSortRow) => {
    tagById.set(row.id, unionTagIds(tagById.get(row.id), row.tagIds));
    if (row.tags && row.tags.length > 0 && !namesById.has(row.id)) {
      namesById.set(row.id, row.tags);
    }
  };
  for (const row of ledger) merge(row);
  for (const row of snap) merge(row);
  const seen = new Set<number>();
  const out: FavoriteSortRow[] = [];
  const push = (id: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({
      id,
      tagIds: tagById.get(id) ?? [],
      tags: namesById.get(id),
    });
  };
  for (const row of snap) push(row.id);
  for (const row of ledger) push(row.id);
  return out;
}

export function favoriteMatchScore(
  row: FavoriteSortRow,
  sortTags: readonly DoujinTag[],
): number {
  if (sortTags.length === 0) return 0;
  const haveIds = new Set(row.tagIds);
  const haveKeys = new Set(
    (row.tags ?? [])
      .map((tag) => tasteTagKey(tag))
      .filter((key) => !key.endsWith(":")),
  );
  let score = 0;
  for (let i = 0; i < sortTags.length; i += 1) {
    const tag = sortTags[i];
    if (!tag) continue;
    const idHit =
      tag.id != null &&
      Number.isInteger(tag.id) &&
      tag.id > 0 &&
      haveIds.has(tag.id);
    const nameHit = haveKeys.has(tasteTagKey(tag));
    if (!idHit && !nameHit) continue;
    score += 1 << (sortTags.length - 1 - i);
  }
  return score;
}

export function sortFavoriteIds(
  rows: readonly FavoriteSortRow[],
  sortTags: readonly DoujinTag[],
  opts?: { matchesOnly?: boolean },
): number[] {
  const scored = rows.map((row, index) => ({
    id: row.id,
    score: favoriteMatchScore(row, sortTags),
    index,
  }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const picked = opts?.matchesOnly
    ? scored.filter((row) => row.score > 0)
    : scored;
  return picked.map((row) => row.id);
}

function rankTasteRows(
  savedTags: readonly DoujinTag[],
  blacklist: readonly string[],
  lovedTags: readonly DoujinTag[],
): Array<{ tag: DoujinTag; count: number; loved: boolean }> {
  const lovedKeys = new Set(
    lovedTags
      .filter((tag) => TASTE_TYPES.has(tag.type))
      .map((tag) => tasteTagKey(tag))
      .filter((key) => !key.endsWith(":")),
  );
  const map = new Map(
    collectTasteTagCounts(savedTags).map((row) => [tasteTagKey(row.tag), row]),
  );
  for (const tag of lovedTags) {
    if (!TASTE_TYPES.has(tag.type)) continue;
    const name = normalizeTagName(tag.name);
    if (!name || TASTE_NOISE.has(name)) continue;
    const key = `${tag.type}:${name}`;
    if (!map.has(key)) map.set(key, { tag: { ...tag, name }, count: 0 });
  }
  return [...map.values()]
    .filter((row) => !tagIsBlocked(row.tag.name, blacklist))
    .sort((a, b) => {
      const wa = tasteWeight(a.count, lovedKeys.has(tasteTagKey(a.tag)));
      const wb = tasteWeight(b.count, lovedKeys.has(tasteTagKey(b.tag)));
      return wb - wa || a.tag.name.localeCompare(b.tag.name);
    })
    .map((row) => ({
      ...row,
      loved: lovedKeys.has(tasteTagKey(row.tag)),
    }));
}

export type RecommendPlan = {
  query: string;
  label: string;
};

function tagsOfType(
  rows: readonly { tag: DoujinTag }[],
  type: DoujinTag["type"],
  cap: number,
): DoujinTag[] {
  const out: DoujinTag[] = [];
  for (const row of rows) {
    if (row.tag.type !== type) continue;
    out.push(row.tag);
    if (out.length >= cap) break;
  }
  return out;
}

function at<T>(rows: readonly T[], i: number): T | undefined {
  if (rows.length === 0) return undefined;
  const n = rows.length;
  return rows[((i % n) + n) % n];
}

const RECS_SPECIFIC_CAP = 4;
const RECS_MOOD_CAP = 6;
const RECS_PLAN_CAP = 24;

/**
 * nhentai has no CF recs API — only /related and tag search.
 * Rotate specific+mood AND pairs so Обновить is not the same two generic tags.
 */
export function buildRecommendPlans(
  savedTags: readonly DoujinTag[],
  blacklist: readonly string[],
  lovedTags: readonly DoujinTag[] = [],
): RecommendPlan[] {
  const ranked = rankTasteRows(savedTags, blacklist, lovedTags);
  if (ranked.length === 0) return [];
  const parodies = tagsOfType(ranked, "parody", RECS_SPECIFIC_CAP);
  const characters = tagsOfType(ranked, "character", RECS_SPECIFIC_CAP);
  const artists = tagsOfType(ranked, "artist", RECS_SPECIFIC_CAP);
  const moods = tagsOfType(ranked, "tag", RECS_MOOD_CAP);
  const lovedOnes = ranked
    .filter((row) => row.loved)
    .map((row) => row.tag)
    .slice(0, RECS_SPECIFIC_CAP);
  const pairs: Array<[DoujinTag, DoujinTag]> = [];
  const push = (a?: DoujinTag, b?: DoujinTag) => {
    if (!a || !b || tasteTagKey(a) === tasteTagKey(b)) return;
    if (
      pairs.some(
        (pair) =>
          tasteTagKey(pair[0]) === tasteTagKey(a) &&
          tasteTagKey(pair[1]) === tasteTagKey(b),
      )
    ) {
      return;
    }
    pairs.push([a, b]);
  };
  const rounds = Math.max(
    parodies.length,
    characters.length,
    artists.length,
    lovedOnes.length,
    1,
  );
  for (let i = 0; i < rounds; i++) {
    const mood = at(moods, i);
    const moodAlt = at(moods, i + 1);
    push(parodies[i], moodAlt ?? mood);
    push(characters[i], mood);
    push(artists[i], at(parodies, i) ?? mood);
    push(lovedOnes[i], at(parodies, i + 1) ?? at(characters, i) ?? mood);
    push(parodies[i], at(characters, i + 1));
    push(artists[i], moodAlt ?? mood);
  }
  const plans: RecommendPlan[] = [];
  const seen = new Set<string>();
  for (const [a, b] of pairs) {
    if (plans.length >= RECS_PLAN_CAP) break;
    const body = [tagToQueryTerm(a), tagToQueryTerm(b)].filter(Boolean).join(" ");
    const query = withBlacklistNegatives(body, blacklist).trim();
    if (!query || seen.has(query)) continue;
    seen.add(query);
    plans.push({ query, label: `${a.name} + ${b.name}` });
  }
  if (plans.length === 0) {
    const top = ranked[0]!.tag;
    const body = tagToQueryTerm(top);
    const query = withBlacklistNegatives(body, blacklist).trim();
    if (query) plans.push({ query, label: top.name });
  }
  return plans;
}

export function pickRecommendPlan(
  plans: readonly RecommendPlan[],
  tick: number,
): RecommendPlan | null {
  if (plans.length === 0) return null;
  return plans[recsShuffleIndex(plans.length, tick)] ?? null;
}

/** 1–2 strongest library tags as an AND search, minus blacklist. */
export function buildRecommendSearchQuery(
  savedTags: readonly DoujinTag[],
  blacklist: readonly string[],
  lovedTags: readonly DoujinTag[] = [],
): string | null {
  return pickRecommendPlan(
    buildRecommendPlans(savedTags, blacklist, lovedTags),
    0,
  )?.query ?? null;
}

export function mixUniqueCards(
  parts: readonly (readonly DoujinCard[])[],
  exclude: ReadonlySet<number>,
  limit: number,
): DoujinCard[] {
  const seen = new Set(exclude);
  const out: DoujinCard[] = [];
  let i = 0;
  let added = true;
  while (added && out.length < limit) {
    added = false;
    for (const part of parts) {
      const card = part[i];
      if (!card || seen.has(card.id)) continue;
      seen.add(card.id);
      out.push(card);
      added = true;
    }
    i += 1;
    if (parts.some((p) => i < p.length)) added = true;
  }
  return out;
}

/** Recs hub shows at most this many UI pages; refresh advances the search window. */
export const RECS_PAGE_CAP = 3;

/**
 * Several pairings: Обновить rotates the AND query and stays on API page 1.
 * One pairing: same 3-page window slide as before.
 */
export function recsPlanAndWindow(
  recsTick: number,
  planCount: number,
): { planTick: number; windowTick: number } {
  const t = Math.max(0, Math.floor(recsTick));
  const n = Math.max(0, Math.floor(planCount));
  if (n > 1) return { planTick: t, windowTick: 0 };
  return { planTick: 0, windowTick: t };
}

export function recsSearchApiPage(
  tick: number,
  uiPage: number,
  cap = RECS_PAGE_CAP,
): number {
  const t = Math.max(0, Math.floor(tick));
  const p = Math.max(1, Math.floor(uiPage));
  return t * cap + p;
}

/** How many UI pages this recs window has. 0 means tick is past the API list. */
export function recsWindowPageCount(
  apiNumPages: number,
  tick: number,
  cap = RECS_PAGE_CAP,
): number {
  const total = Math.max(0, Math.floor(apiNumPages));
  if (total <= 0) return 1;
  const start = Math.max(0, Math.floor(tick)) * cap;
  const remaining = total - start;
  if (remaining <= 0) return 0;
  return Math.min(cap, remaining);
}
