import { parseCdnConfig, type DoujinCdnConfig, defaultCdnConfig } from "./cdn";
import {
  apiWindowForGridPage,
  gridPageCount,
  windowListItems,
} from "./fitGrid";
import {
  cardMatchesLanguage,
  parseGallery,
  parseListPage,
  parseTag,
} from "./normalize";
import { buildSearchQuery, nhentaiSlugToName, parseExactTagLookup, parseGalleryCode } from "./query";
import {
  awaitNhentaiSlot,
  isNhentaiTransientStatus,
  nhentaiTransientMessage,
  parseRetryAfterMs,
  sleep,
} from "./rateLimit";
import {
  effectiveBlacklist,
  filterUnblocked,
  galleryIsBlocked,
  normalizeTagName,
  tagIsBlocked,
} from "./safety";
import { loadDoujinSettings } from "./settings";
import type {
  DoujinCard,
  DoujinCategoryFilter,
  DoujinGallery,
  DoujinLanguageFilter,
  DoujinListPage,
  DoujinMinFavorites,
  DoujinPagesBand,
  DoujinSearchSort,
  DoujinTag,
} from "./types";

const API_BASE = "/api/nhentai";
const FETCH_TIMEOUT_MS = 20_000;
const RATE_LIMIT_RETRIES = 5;

let cachedCdn: DoujinCdnConfig | null = null;
let cdnPromise: Promise<DoujinCdnConfig> | null = null;
const tagBySlugCache = new Map<string, DoujinTag | null>();

export function resolveApiKey(explicit?: string): string {
  const key = (explicit ?? loadDoujinSettings().apiKey).trim();
  return key;
}

export function hasDoujinApiKey(explicit?: string): boolean {
  return resolveApiKey(explicit).length > 0;
}

async function nhentaiFetch(
  pathAndQuery: string,
  apiKey: string,
  opts?: { method?: "GET" | "POST" | "DELETE"; allowStatuses?: number[] },
): Promise<unknown> {
  if (!apiKey) {
    throw new Error("Нужен API-ключ nhentai (Настройки → Медиа)");
  }
  const method = opts?.method ?? "GET";
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt += 1) {
    await awaitNhentaiSlot();
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}${pathAndQuery}`, {
        method,
        headers: {
          Authorization: `Key ${apiKey}`,
          Accept: "application/json",
        },
        signal: ctrl.signal,
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error("nhentai отказал в доступе — проверь API-ключ");
      }
      if (isNhentaiTransientStatus(res.status)) {
        lastError = new Error(nhentaiTransientMessage(res.status));
        if (attempt >= RATE_LIMIT_RETRIES) throw lastError;
        await sleep(parseRetryAfterMs(res.headers.get("Retry-After"), attempt));
        continue;
      }
      if (opts?.allowStatuses?.includes(res.status)) {
        const text = await res.text().catch(() => "");
        if (!text) return { favorited: false };
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return { favorited: false };
        }
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `nhentai HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`,
        );
      }
      if (res.status === 204) return { favorited: method !== "DELETE" };
      return await res.json();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("nhentai: таймаут запроса");
      }
      throw err;
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("nhentai 429 — лимит запросов. Подожди минуту и повтори.");
}

export async function loadCdnConfig(apiKey?: string): Promise<DoujinCdnConfig> {
  if (cachedCdn) return cachedCdn;
  if (cdnPromise) return cdnPromise;
  const key = resolveApiKey(apiKey);
  cdnPromise = (async () => {
    try {
      const data = await nhentaiFetch("/config", key);
      cachedCdn = parseCdnConfig(data);
    } catch {
      try {
        const data = await nhentaiFetch("/cdn", key);
        cachedCdn = parseCdnConfig(data);
      } catch {
        cachedCdn = defaultCdnConfig();
      }
    }
    return cachedCdn;
  })();
  try {
    return await cdnPromise;
  } finally {
    cdnPromise = null;
  }
}

function matchesPagesBand(numPages: number, band: DoujinPagesBand): boolean {
  switch (band) {
    case "all":
      return true;
    case "short":
      return numPages < 20;
    case "mid":
      return numPages >= 20 && numPages < 80;
    case "long":
      return numPages >= 80;
    default: {
      const _never: never = band;
      return _never;
    }
  }
}

function matchesMinFavorites(
  num: number | undefined,
  min: DoujinMinFavorites,
): boolean {
  if (min === "all") return true;
  if (num == null) return true;
  const n = Number(min);
  return Number.isFinite(n) && num >= n;
}

function matchesCategory(
  card: DoujinCard,
  category: DoujinCategoryFilter,
): boolean {
  if (category === "all") return true;
  const cats = card.tags.filter(
    (t) => t.type === "category" || t.type === "tag",
  );
  if (cats.length === 0) return true;
  return cats.some((t) => normalizeTagName(t.name) === category);
}

function applySearchDropdownFilters(
  items: readonly DoujinCard[],
  opts: {
    language?: DoujinLanguageFilter;
    category?: DoujinCategoryFilter;
    pagesBand?: DoujinPagesBand;
    minFavorites?: DoujinMinFavorites;
  },
): DoujinCard[] {
  const language = opts.language ?? "all";
  const category = opts.category ?? "all";
  const pagesBand = opts.pagesBand ?? "all";
  const minFavorites = opts.minFavorites ?? "all";
  return items.filter(
    (card) =>
      cardMatchesLanguage(card.languages ?? card.language, language) &&
      matchesCategory(card, category) &&
      matchesPagesBand(card.numPages, pagesBand) &&
      matchesMinFavorites(card.numFavorites, minFavorites),
  );
}

function parseTagResponse(data: unknown): DoujinTag | null {
  const direct = parseTag(data);
  if (direct?.name) return direct;
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  return parseTag(o.tag ?? o.data ?? o.result ?? o.body);
}

function tagLookupError(type: string, slug: string): Error {
  return new Error(`На сайте нет ${type}/${slug}`);
}

export async function fetchTagBySlug(
  type: string,
  slug: string,
  apiKey?: string,
): Promise<DoujinTag> {
  const key = resolveApiKey(apiKey);
  const cacheKey = `${type}:${slug}`;
  if (tagBySlugCache.has(cacheKey)) {
    const hit = tagBySlugCache.get(cacheKey);
    if (!hit) throw tagLookupError(type, slug);
    return hit;
  }
  try {
    const data = await nhentaiFetch(
      `/tags/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`,
      key,
    );
    const tag = parseTagResponse(data);
    if (!tag?.id) {
      throw new Error(`Тег ${type}/${slug} не разобрался`);
    }
    const expected = nhentaiSlugToName(slug);
    if (normalizeTagName(tag.name) !== expected) {
      tagBySlugCache.set(cacheKey, null);
      throw tagLookupError(type, slug);
    }
    tagBySlugCache.set(cacheKey, tag);
    return tag;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("HTTP 404")) {
      tagBySlugCache.set(cacheKey, null);
      throw tagLookupError(type, slug);
    }
    throw err;
  }
}

function applyListFilter(page: DoujinListPage): DoujinListPage {
  const blacklist = effectiveBlacklist();
  return { ...page, items: filterUnblocked(page.items, blacklist) };
}

function clampPerPage(n?: number): number {
  if (n == null || !Number.isFinite(n)) return 25;
  return Math.min(100, Math.max(6, Math.round(n)));
}

function withPerPage(path: string, perPage?: number): string {
  const n = clampPerPage(perPage);
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}per_page=${n}`;
}

async function nhentaiFetchList(
  path: string,
  key: string,
  perPage?: number,
): Promise<unknown> {
  if (perPage == null) {
    return await nhentaiFetch(path, key);
  }
  try {
    return await nhentaiFetch(withPerPage(path, perPage), key);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("HTTP 422") || msg.includes("HTTP 400")) {
      return await nhentaiFetch(path, key);
    }
    throw err;
  }
}

export async function fetchGalleryList(
  page = 1,
  apiKey?: string,
  perPage?: number,
): Promise<DoujinListPage> {
  const key = resolveApiKey(apiKey);
  const cdn = await loadCdnConfig(key);
  const data = await nhentaiFetchList(
    `/galleries?page=${Math.max(1, page)}`,
    key,
    perPage,
  );
  return applyListFilter(parseListPage(data, cdn, page));
}

export async function fetchSearch(opts: {
  query: string;
  sort?: DoujinSearchSort;
  page?: number;
  language?: DoujinLanguageFilter;
  category?: DoujinCategoryFilter;
  pagesBand?: DoujinPagesBand;
  minFavorites?: DoujinMinFavorites;
  perPage?: number;
  apiKey?: string;
}): Promise<DoujinListPage & { stripped: string[] }> {
  const key = resolveApiKey(opts.apiKey);
  const page = Math.max(1, opts.page ?? 1);
  const galleryId = parseGalleryCode(opts.query);
  if (galleryId != null) {
    if (page > 1) {
      return {
        items: [],
        page,
        numPages: 1,
        total: 1,
        stripped: [],
      };
    }
    try {
      const gallery = await fetchGallery(galleryId, key);
      return {
        items: [gallery],
        page: 1,
        numPages: 1,
        total: 1,
        stripped: [],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("HTTP 404")) {
        throw new Error(`Галерея #${galleryId} не найдена`);
      }
      throw err;
    }
  }
  const lookup = parseExactTagLookup(opts.query);
  if (lookup) {
    const blacklist = effectiveBlacklist();
    if (tagIsBlocked(lookup.name, blacklist)) {
      return {
        items: [],
        page,
        numPages: 1,
        total: 0,
        stripped: [lookup.name],
      };
    }
    const cdn = await loadCdnConfig(key);
    const tag = await fetchTagBySlug(lookup.type, lookup.slug, key);
    const tagged = new URLSearchParams();
    tagged.set("tag_id", String(tag.id));
    tagged.set("page", String(page));
    if (opts.sort) tagged.set("sort", opts.sort);
    const data = await nhentaiFetchList(
      `/galleries/tagged?${tagged.toString()}`,
      key,
      opts.perPage,
    );
    const list = applyListFilter(parseListPage(data, cdn, page));
    return {
      ...list,
      items: applySearchDropdownFilters(list.items, opts),
      stripped: [],
    };
  }
  const cdn = await loadCdnConfig(key);
  const built = buildSearchQuery({
    userQuery: opts.query,
    language: opts.language ?? "all",
    category: opts.category ?? "all",
    pagesBand: opts.pagesBand ?? "all",
    minFavorites: opts.minFavorites ?? "all",
    blacklist: effectiveBlacklist(),
  });
  if (!built.query) {
    const list = await fetchGalleryList(page, key, opts.perPage);
    return { ...list, stripped: built.stripped };
  }
  const params = new URLSearchParams();
  params.set("query", built.query);
  params.set("page", String(page));
  if (opts.sort) params.set("sort", opts.sort);
  const data = await nhentaiFetchList(
    `/search?${params.toString()}`,
    key,
    opts.perPage,
  );
  const list = applyListFilter(parseListPage(data, cdn, page));
  return { ...list, stripped: built.stripped };
}

export async function fetchNewest(
  page = 1,
  apiKey?: string,
  perPage?: number,
): Promise<DoujinListPage & { stripped: string[] }> {
  const list = await fetchGalleryList(page, apiKey, perPage);
  return { ...list, stripped: [] };
}

export async function fetchGallery(
  id: number,
  apiKey?: string,
): Promise<DoujinGallery> {
  const key = resolveApiKey(apiKey);
  const cdn = await loadCdnConfig(key);
  const data = await nhentaiFetch(
    `/galleries/${Math.floor(id)}?include=related`,
    key,
  );
  const gallery = parseGallery(data, cdn);
  if (!gallery) {
    throw new Error(`Галерея #${id} не разобралась`);
  }
  if (galleryIsBlocked(gallery.tags, effectiveBlacklist())) {
    throw new Error("Галерея скрыта фильтром тегов");
  }
  gallery.related = filterUnblocked(gallery.related, effectiveBlacklist());
  return gallery;
}

export async function fetchRelated(
  id: number,
  apiKey?: string,
): Promise<DoujinGallery["related"]> {
  const key = resolveApiKey(apiKey);
  const cdn = await loadCdnConfig(key);
  const data = await nhentaiFetch(`/galleries/${Math.floor(id)}/related`, key);
  const list = parseListPage(data, cdn, 1);
  return applyListFilter(list).items;
}

export async function fetchFavorites(
  page = 1,
  apiKey?: string,
  perPage?: number,
): Promise<DoujinListPage> {
  const key = resolveApiKey(apiKey);
  const cdn = await loadCdnConfig(key);
  const data = await nhentaiFetchList(
    `/favorites?page=${Math.max(1, page)}`,
    key,
    perPage,
  );
  return applyListFilter(parseListPage(data, cdn, page));
}

/** Favorites in the same cols×rows window as Newest, even if the API ignores per_page. */
export async function fetchFavoritesWindow(
  gridPage: number,
  pageSize: number,
  apiKey?: string,
): Promise<DoujinListPage> {
  const wanted = clampPerPage(pageSize);
  const g = Math.max(1, gridPage);
  const probe = await fetchFavorites(g, apiKey, wanted);
  if (probe.items.length <= wanted) return probe;

  const apiSize = probe.items.length;
  const { apiPage, offset } = apiWindowForGridPage(g, wanted, apiSize);
  const total = probe.total ?? apiSize * Math.max(1, probe.numPages);
  const numPages = gridPageCount(total, wanted);
  const primary =
    apiPage === g ? probe : await fetchFavorites(apiPage, apiKey, wanted);
  const needNext =
    offset + wanted > primary.items.length && apiPage < primary.numPages;
  const nextItems = needNext
    ? apiPage + 1 === g
      ? probe.items
      : (await fetchFavorites(apiPage + 1, apiKey, wanted)).items
    : undefined;
  return {
    items: windowListItems(primary.items, offset, wanted, nextItems),
    page: g,
    numPages,
    total,
  };
}

export async function fetchTagsByIds(
  ids: readonly number[],
  apiKey?: string,
): Promise<DoujinTag[]> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return [];
  const key = resolveApiKey(apiKey);
  const chunk = unique.slice(0, 100);
  const params = new URLSearchParams();
  params.set("ids", chunk.join(","));
  const data = await nhentaiFetch(`/tags/ids?${params.toString()}`, key);
  const list = Array.isArray(data) ? data : [];
  const out: DoujinTag[] = [];
  const seen = new Set<string>();
  for (const row of list) {
    const tag = parseTag(row);
    if (!tag) continue;
    const k = `${tag.type}:${tag.name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(tag);
  }
  return out;
}

export async function setGalleryFavorite(
  id: number,
  favorite: boolean,
  apiKey?: string,
): Promise<boolean> {
  const key = resolveApiKey(apiKey);
  await nhentaiFetch(`/galleries/${Math.floor(id)}/favorite`, key, {
    method: favorite ? "POST" : "DELETE",
    allowStatuses: favorite ? [] : [404],
  });
  return favorite;
}
