import { fetchFavorites, fetchFavoritesWindow, fetchTagsByIds } from "./client";
import { rankTagIdStats } from "./query";
import {
  cardTagIds,
  loadPersistedTaste,
  loadTasteGalleries,
  rememberTasteGalleryCards,
  windowLedgerFavorites,
} from "./tasteSync";
import type {
  DoujinAccountTaste,
  DoujinCard,
  DoujinLibraryCatalogSort,
  DoujinListPage,
  DoujinTag,
} from "./types";

export const ACCOUNT_TASTE_CACHE_KEY = "joi-doujin-account-taste-v2";
export const FAVORITES_SNAPSHOT_KEY = "joi-doujin-fav-snap-v1";
const CACHE_TTL_MS = 45 * 60 * 1000;
const MAX_FAVORITE_PAGES = 8;
const TASTE_PAGES = 2;
/** One `/tags/ids` chunk on the sample path; full names come from taste sync. */
const MAX_RESOLVE_IDS = 100;

export type FavoritesSnapshot = {
  ids: number[];
  tagLists: number[][];
  items: DoujinCard[];
  total: number;
  numPages: number;
  pagesLoaded: number;
  at: number;
};

export type AccountTaste = DoujinAccountTaste;

let snapMemory: FavoritesSnapshot | null = null;
let tasteMemory: AccountTaste | null = null;
let snapChain: Promise<unknown> = Promise.resolve();

function emptySnapshot(): FavoritesSnapshot {
  return {
    ids: [],
    tagLists: [],
    items: [],
    total: 0,
    numPages: 1,
    pagesLoaded: 0,
    at: Date.now(),
  };
}

export function mergeFavoritePage(
  snap: FavoritesSnapshot,
  page: DoujinListPage,
  pageNum: number,
): FavoritesSnapshot {
  const seen = new Set(snap.ids);
  const ids = snap.ids.slice();
  const tagLists = snap.tagLists.slice();
  const items = snap.items.slice();
  for (const card of page.items) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    ids.push(card.id);
    tagLists.push(cardTagIds(card));
    items.push(card);
  }
  return {
    ids,
    tagLists,
    items,
    total: page.total ?? snap.total,
    numPages: Math.max(1, page.numPages || snap.numPages),
    pagesLoaded: Math.max(snap.pagesLoaded, pageNum),
    at: Date.now(),
  };
}

function readSnapCache(): FavoritesSnapshot | null {
  try {
    const raw = sessionStorage.getItem(FAVORITES_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FavoritesSnapshot>;
    if (!parsed || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    if (!Array.isArray(parsed.ids) || !Array.isArray(parsed.tagLists)) {
      return null;
    }
    return {
      ids: parsed.ids.filter((id) => Number.isInteger(id) && id > 0),
      tagLists: parsed.tagLists.filter((row): row is number[] =>
        Array.isArray(row),
      ),
      items: Array.isArray(parsed.items)
        ? parsed.items.filter(
            (card): card is DoujinCard =>
              Boolean(card) &&
              typeof card === "object" &&
              Number.isInteger(card.id) &&
              card.id > 0,
          )
        : [],
      total: typeof parsed.total === "number" ? parsed.total : 0,
      numPages: typeof parsed.numPages === "number" ? parsed.numPages : 1,
      pagesLoaded:
        typeof parsed.pagesLoaded === "number" ? parsed.pagesLoaded : 0,
      at: parsed.at,
    };
  } catch {
    return null;
  }
}

function writeSnapCache(snap: FavoritesSnapshot): void {
  snapMemory = snap;
  try {
    sessionStorage.setItem(FAVORITES_SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    /* quota / private mode */
  }
}

export function peekFavoriteIds(): Set<number> {
  const snap = snapMemory ?? readSnapCache();
  return new Set(snap?.ids ?? []);
}

export function setAccountFavoriteLocal(id: number, on: boolean): Set<number> {
  const prev = snapMemory ?? readSnapCache() ?? emptySnapshot();
  const snap: FavoritesSnapshot = {
    ...prev,
    ids: prev.ids.slice(),
    tagLists: prev.tagLists.slice(),
    items: prev.items.slice(),
  };
  const seen = new Set(snap.ids);
  if (on && !seen.has(id)) {
    snap.ids.push(id);
    snap.tagLists.push([]);
    snap.total = Math.max(snap.total, snap.ids.length);
  } else if (!on && seen.has(id)) {
    const idx = snap.ids.indexOf(id);
    snap.ids = snap.ids.filter((x) => x !== id);
    if (idx >= 0) {
      snap.tagLists.splice(idx, 1);
      snap.items.splice(idx, 1);
    }
    snap.items = snap.items.filter((card) => card.id !== id);
    snap.total = Math.max(0, snap.total - 1);
  }
  snap.at = Date.now();
  writeSnapCache(snap);
  tasteMemory = null;
  try {
    sessionStorage.removeItem(ACCOUNT_TASTE_CACHE_KEY);
  } catch {
    /* ignore */
  }
  return new Set(snap.ids);
}

function peekSnapshot(): FavoritesSnapshot | null {
  return snapMemory ?? readSnapCache();
}

async function ensureFavoritePages(minPages: number): Promise<FavoritesSnapshot> {
  const run = snapChain.then(async () => {
    let snap = peekSnapshot();
    if (
      snap &&
      snap.pagesLoaded >= minPages &&
      snap.items.length > 0 &&
      Date.now() - snap.at < CACHE_TTL_MS
    ) {
      return snap;
    }
    if (
      !snap ||
      Date.now() - snap.at >= CACHE_TTL_MS ||
      (snap.ids.length > 0 && snap.items.length === 0)
    ) {
      snap = emptySnapshot();
      snap.pagesLoaded = 0;
    }
    const target = Math.min(MAX_FAVORITE_PAGES, Math.max(minPages, 1));
    if (snap.pagesLoaded === 0) {
      const first = await fetchFavorites(1);
      snap = mergeFavoritePage(emptySnapshot(), first, 1);
      writeSnapCache(snap);
    }
    const last = Math.min(target, Math.max(1, snap.numPages));
    while (snap.pagesLoaded < last) {
      const nextNum = snap.pagesLoaded + 1;
      const page = await fetchFavorites(nextNum);
      snap = mergeFavoritePage(snap, page, nextNum);
      writeSnapCache(snap);
    }
    return snap;
  });
  snapChain = run.catch(() => undefined);
  return run;
}

function readTasteCache(): AccountTaste | null {
  try {
    const raw = sessionStorage.getItem(ACCOUNT_TASTE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AccountTaste>;
    if (!parsed || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    if (!Array.isArray(parsed.tags) || !Array.isArray(parsed.favoriteIds)) {
      return null;
    }
    return {
      tags: parsed.tags.filter(
        (t): t is DoujinTag =>
          Boolean(t) &&
          typeof t === "object" &&
          typeof t.name === "string" &&
          typeof t.type === "string",
      ),
      favoriteIds: parsed.favoriteIds.filter(
        (id): id is number => Number.isInteger(id) && id > 0,
      ),
      sampled: typeof parsed.sampled === "number" ? parsed.sampled : 0,
      total: typeof parsed.total === "number" ? parsed.total : 0,
      complete: parsed.complete === true,
      at: parsed.at,
    };
  } catch {
    return null;
  }
}

export function writeTasteCache(taste: AccountTaste): void {
  tasteMemory = taste;
  try {
    sessionStorage.setItem(ACCOUNT_TASTE_CACHE_KEY, JSON.stringify(taste));
  } catch {
    /* quota / private mode */
  }
}

export function peekAccountTasteCache(): AccountTaste | null {
  return tasteMemory ?? readTasteCache();
}

export function clearAccountTasteCache(): void {
  tasteMemory = null;
  snapMemory = null;
  try {
    sessionStorage.removeItem(ACCOUNT_TASTE_CACHE_KEY);
    sessionStorage.removeItem(FAVORITES_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

export async function loadAccountFavoriteIds(): Promise<Set<number>> {
  const ledger = await loadTasteGalleries();
  if (ledger.length > 0) return new Set(ledger.map((row) => row.id));
  const snap = await ensureFavoritePages(4);
  return new Set(snap.ids);
}

/** Sample the account favorites list and resolve frequent tag ids to names. */
export async function fetchAccountTaste(
  apiKey?: string,
): Promise<AccountTaste> {
  try {
    const persisted = await loadPersistedTaste();
    if (persisted && persisted.sampled > 0) {
      writeTasteCache(persisted);
      return persisted;
    }
  } catch {
    /* IndexedDB unavailable — fall back to a live sample */
  }

  const cached = peekAccountTasteCache();
  if (cached) {
    tasteMemory = cached;
    return cached;
  }

  const snap = await ensureFavoritePages(TASTE_PAGES);
  const ranked = rankTagIdStats(snap.tagLists).slice(0, MAX_RESOLVE_IDS);
  const rankedIds = ranked.map((row) => row.id);
  const countById = new Map(ranked.map((row) => [row.id, row.count]));
  const resolved =
    rankedIds.length > 0 ? await fetchTagsByIds(rankedIds, apiKey) : [];
  const byId = new Map<number, DoujinTag>();
  for (const tag of resolved) {
    if (tag.id == null) continue;
    byId.set(tag.id, tag);
  }
  const ordered: DoujinTag[] = [];
  for (const row of ranked) {
    const tag = byId.get(row.id);
    if (!tag) continue;
    ordered.push({ ...tag, count: row.count });
  }
  const tags: DoujinTag[] =
    ordered.length > 0
      ? ordered
      : resolved.map((tag) => {
          const count = tag.id != null ? countById.get(tag.id) : undefined;
          return count != null ? { ...tag, count } : tag;
        });
  const taste: AccountTaste = {
    tags,
    favoriteIds: snap.ids,
    sampled: snap.ids.length,
    total: snap.total || snap.ids.length,
    complete: false,
    at: Date.now(),
  };
  writeTasteCache(taste);
  return taste;
}

export async function fetchLocalFavoritesWindow(
  gridPage: number,
  pageSize: number,
  sortTags: readonly DoujinTag[] = [],
  catalogSort: DoujinLibraryCatalogSort = "added",
): Promise<DoujinListPage> {
  const ledger = await loadTasteGalleries();
  const local = windowLedgerFavorites(
    ledger,
    gridPage,
    pageSize,
    sortTags,
    catalogSort,
  );
  if (local) return local;
  const live = await fetchFavoritesWindow(gridPage, pageSize);
  try {
    await rememberTasteGalleryCards(live.items);
  } catch {
    /* IndexedDB unavailable */
  }
  return live;
}

export async function fetchSortedFavoritesWindow(
  gridPage: number,
  pageSize: number,
  sortTags: readonly DoujinTag[],
): Promise<DoujinListPage> {
  return fetchLocalFavoritesWindow(gridPage, pageSize, sortTags);
}
