import { fetchGelbooru01 } from "./booruGelbooru01";
import {
  fetchRealbooru,
  REALBOORU_PAGE_FULL_MIN,
  REALBOORU_PAGE_SIZE,
} from "./booruRealbooru";
import { booruSite, type BooruSiteId } from "./booruSites";
import {
  extractExcludeTags,
  fetchGelbooru,
  fetchGelbooruFlexible,
  filterMediaByExcludes,
  shuffleMediaItems,
  type GelbooruFlexibleResult,
  type MediaItem,
} from "./media";

/**
 * dapi / html01: 0-based page index (hub `pidRef += 1`).
 * html02: HTML post offset (`page * native page size`).
 */
export function booruPagePid(site: BooruSiteId, pageIndex: number): number {
  const page = Math.max(0, Math.floor(pageIndex));
  const api = booruSite(site).api;
  switch (api) {
    case "dapi":
    case "html01":
      return page;
    case "html02":
      return page * REALBOORU_PAGE_SIZE;
    default: {
      const _never: never = api;
      return _never;
    }
  }
}

/** Advance the hub cursor after a wall batch. */
export function booruNextPid(
  site: BooruSiteId,
  currentPid: number,
  receivedCount: number,
): number {
  const pid = Math.max(0, Math.floor(currentPid));
  const api = booruSite(site).api;
  switch (api) {
    case "dapi":
    case "html01":
      return pid + 1;
    case "html02":
      return pid + Math.max(1, Math.floor(receivedCount));
    default: {
      const _never: never = api;
      return _never;
    }
  }
}

/**
 * html01 pads to the requested limit (20+20). html02 returns one native page
 * (~29), so `>= 36` would kill infinite scroll.
 */
export function booruWallHasMore(
  site: BooruSiteId,
  receivedCount: number,
  requestedLimit: number,
): boolean {
  const api = booruSite(site).api;
  switch (api) {
    case "dapi":
    case "html01":
      return receivedCount >= requestedLimit;
    case "html02":
      return receivedCount >= REALBOORU_PAGE_FULL_MIN;
    default: {
      const _never: never = api;
      return _never;
    }
  }
}

export async function fetchBooruPosts(
  site: BooruSiteId,
  tags: string,
  limit = 40,
  credentials?: { userId: string; apiKey: string },
  opts?: { pid?: number },
): Promise<MediaItem[]> {
  switch (site) {
    case "gelbooru":
    case "xbooru":
    case "hypnohub":
      return fetchGelbooru(tags, limit, credentials, { ...opts, site });
    case "censored":
    case "blacked":
      return fetchGelbooru01(site, tags, limit, opts);
    case "realbooru":
      return fetchRealbooru(site, tags, limit, opts);
    default: {
      const _never: never = site;
      return _never;
    }
  }
}

export function booruNeedsKey(site: BooruSiteId): boolean {
  return booruSite(site).needsKey;
}

export function booruFallbackTags(site: BooruSiteId, mediaTags: string): string {
  const trimmed = mediaTags.trim();
  if (site === "gelbooru" && trimmed) return trimmed;
  return booruSite(site).defaultTags;
}

function stripSortRandom(tags: string): string {
  return tags
    .trim()
    .split(/\s+/)
    .filter((t) => t && !t.toLowerCase().startsWith("sort:random"))
    .join(" ");
}

/**
 * Short fallback ladder for non-gelbooru boards. Never injects 1girl.
 * html01/html02: no sort:random.
 */
export function buildBooruFlexibleQueries(
  site: BooruSiteId,
  tags: string,
): string[] {
  const api = booruSite(site).api;
  const stripped =
    api === "html01" || api === "html02"
      ? stripSortRandom(tags)
      : tags.trim();
  const tokens = stripped.split(/\s+/).filter(Boolean);
  const rating = tokens.find((t) => t.toLowerCase().startsWith("rating:"));
  const rest = tokens.filter((t) => !t.toLowerCase().startsWith("rating:"));
  const queries: string[] = [];
  const push = (parts: string[]) => {
    const q = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (q && !queries.includes(q)) queries.push(q);
  };
  if (stripped) push([stripped]);
  if (rating && rest.length > 1) {
    push([rating, rest[0]!]);
  }
  if (rating) push([rating]);
  else if (rest[0]) push([rest[0]]);
  return queries;
}

/**
 * Site-aware flexible pull. Gelbooru keeps the existing query ladder.
 * Other dapi boards use a short ladder; html01/html02 skip sort:random.
 */
export async function fetchBooruFlexible(
  site: BooruSiteId,
  tags: string,
  limit = 40,
  credentials?: { userId: string; apiKey: string },
  opts?: { pid?: number },
): Promise<GelbooruFlexibleResult> {
  if (site === "gelbooru") {
    return fetchGelbooruFlexible(tags, limit, credentials, opts);
  }

  const attempted = buildBooruFlexibleQueries(site, tags);
  const excludes = extractExcludeTags(tags);
  const need = Math.max(
    limit,
    excludes.length > 0 ? Math.ceil(limit * 1.5) : limit,
  );
  const pid = opts?.pid ?? 0;

  for (const q of attempted) {
    if (!q.trim()) continue;
    const rawItems = await fetchBooruPosts(site, q, need, credentials, { pid });
    if (rawItems.length === 0) continue;
    const filtered = filterMediaByExcludes(rawItems, excludes);
    const items = (filtered.length > 0 ? filtered : rawItems).slice(0, limit);
    if (items.length > 0) {
      return {
        items: shuffleMediaItems(items),
        usedTags: q,
        attempted,
      };
    }
  }
  return { items: [], usedTags: tags.trim(), attempted };
}
