import {
  favoriteWallThumbConcurrency,
  mapWithConcurrency,
  stillBlobToWallThumb,
} from "./favoriteWallThumb";
import {
  booruMediaId,
  booruPostIdFromMediaId,
  inferBooruSite,
} from "./booruSites";
import { downloadMediaUrl, type MediaItem, type MediaKind } from "./media";
import type { HubKindFilter } from "./mediaTypeFilter";
import { isJunkBooruTag } from "./shopTagNoise";

const DB_NAME = "joi-conductor-favorites";
const DB_VERSION = 5;
const STORE = "items";
const METADATA_STORE = "metadata";
const SAVED_AT_INDEX = "savedAt";

export interface FavoriteRecord {
  id: string;
  kind: MediaKind;
  /** Space-separated booru tags from the post */
  tags?: string;
  mime: string;
  fileName: string;
  remoteUrl?: string;
  /** Stable Gelbooru post id */
  gelbooruId?: string;
  blob: Blob;
  /** Sample-sized still for the masonry wall. Lightbox uses `blob`. */
  thumbBlob?: Blob;
  savedAt: number;
}

export interface FavoriteMetadata {
  id: string;
  tags?: string;
  /** Media kind (added in v5; absent on records migrated before it). */
  kind?: MediaKind;
  mime?: string;
  savedAt: number;
}

export interface FavoriteTagStat {
  tag: string;
  count: number;
}

/** Fast lookup so re-pulled Gelbooru posts still show as liked. */
export type FavoritesIndex = {
  ids: Set<string>;
  gelbooruIds: Set<string>;
  remoteUrls: Set<string>;
};

export const EMPTY_FAVORITES_INDEX: FavoritesIndex = {
  ids: new Set(),
  gelbooruIds: new Set(),
  remoteUrls: new Set(),
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const tx = req.transaction!;
      let itemStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE)) {
        itemStore = db.createObjectStore(STORE, { keyPath: "id" });
        itemStore.createIndex("gelbooruId", "gelbooruId", { unique: false });
        itemStore.createIndex("remoteUrl", "remoteUrl", { unique: false });
        itemStore.createIndex(SAVED_AT_INDEX, "savedAt", { unique: false });
      } else {
        itemStore = tx.objectStore(STORE);
        if (ev.oldVersion < 2 && !itemStore.indexNames.contains("gelbooruId")) {
          itemStore.createIndex("gelbooruId", "gelbooruId", { unique: false });
        }
        if (ev.oldVersion < 2 && !itemStore.indexNames.contains("remoteUrl")) {
          itemStore.createIndex("remoteUrl", "remoteUrl", { unique: false });
        }
        if (!itemStore.indexNames.contains(SAVED_AT_INDEX)) {
          itemStore.createIndex(SAVED_AT_INDEX, "savedAt", { unique: false });
        }
      }

      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        const metadataStore = db.createObjectStore(METADATA_STORE, {
          keyPath: "id",
        });
        metadataStore.createIndex(SAVED_AT_INDEX, "savedAt", { unique: false });

        // One-time v4 migration: copy only lightweight fields. The cursor keeps
        // the upgrade transaction alive and never materializes every Blob.
        const cursorRequest = itemStore.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          metadataStore.put(toFavoriteMetadata(cursor.value as FavoriteRecord));
          cursor.continue();
        };
      }

      // v5: backfill kind/mime into existing metadata rows so callers can
      // filter by media kind without loading Blobs.
      if (ev.oldVersion < 5 && db.objectStoreNames.contains(METADATA_STORE)) {
        const metadataStore = tx.objectStore(METADATA_STORE);
        const backfillReq = itemStore.openCursor();
        backfillReq.onsuccess = () => {
          const cursor = backfillReq.result;
          if (!cursor) return;
          metadataStore.put(toFavoriteMetadata(cursor.value as FavoriteRecord));
          cursor.continue();
        };
      }
    };
  });
  return dbPromise;
}

function toFavoriteMetadata(record: FavoriteRecord): FavoriteMetadata {
  return {
    id: record.id,
    tags: record.tags,
    kind: record.kind,
    mime: record.mime,
    savedAt: record.savedAt,
  };
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export function normalizeRemoteUrl(url: string | undefined | null): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.trim());
    return `${u.origin}${u.pathname}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/** Parse `gb-123` / `blacked-123` / legacy `gb-123-7` → `123`. */
export function gelbooruIdFromMediaId(id: string): string | null {
  return booruPostIdFromMediaId(id);
}

export function resolveGelbooruId(item: {
  id: string;
  gelbooruId?: string;
}): string | null {
  if (item.gelbooruId?.trim()) return item.gelbooruId.trim();
  return gelbooruIdFromMediaId(item.id);
}

export function tokenizeBooruTags(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Tags useful for filter chips (skip sort / junk / empty). */
export function contentBooruTags(raw?: string | null): string[] {
  return tokenizeBooruTags(raw).filter((t) => {
    const key = t.toLowerCase();
    if (key === "sort:random" || key.startsWith("sort:")) return false;
    if (key.startsWith("rating:") || key.startsWith("score:")) return false;
    if (isJunkBooruTag(t)) return false;
    return true;
  });
}

export function buildFavoritesIndex(records: FavoriteRecord[]): FavoritesIndex {
  const ids = new Set<string>();
  const gelbooruIds = new Set<string>();
  const remoteUrls = new Set<string>();
  for (const r of records) {
    ids.add(r.id);
    const site = inferBooruSite(r);
    const gid = r.gelbooruId?.trim() || gelbooruIdFromMediaId(r.id);
    if (gid) {
      ids.add(booruMediaId(site, gid));
      if (site === "gelbooru") {
        gelbooruIds.add(gid);
        ids.add(`gb-${gid}`);
      }
    }
    const nu = normalizeRemoteUrl(r.remoteUrl);
    if (nu) remoteUrls.add(nu);
  }
  return { ids, gelbooruIds, remoteUrls };
}

export function mediaMatchesFavorite(
  item: MediaItem,
  index: FavoritesIndex,
): boolean {
  if (index.ids.has(item.id)) return true;
  const gid = resolveGelbooruId(item);
  const site = inferBooruSite(item);
  if (gid) {
    if (index.ids.has(booruMediaId(site, gid))) return true;
    if (site === "gelbooru" && index.gelbooruIds.has(gid)) return true;
  }
  const nu = normalizeRemoteUrl(item.url);
  if (nu && index.remoteUrls.has(nu)) return true;
  if (item.previewUrl) {
    const pu = normalizeRemoteUrl(item.previewUrl);
    if (pu && index.remoteUrls.has(pu)) return true;
  }
  return false;
}

export function findMatchingFavorite(
  item: MediaItem,
  records: FavoriteRecord[],
): FavoriteRecord | null {
  const gid = resolveGelbooruId(item);
  const site = inferBooruSite(item);
  const nu = normalizeRemoteUrl(item.url);
  const pu = normalizeRemoteUrl(item.previewUrl);
  for (const r of records) {
    if (r.id === item.id) return r;
    const rg = r.gelbooruId?.trim() || gelbooruIdFromMediaId(r.id);
    if (
      gid &&
      rg &&
      gid === rg &&
      inferBooruSite(r) === site
    ) {
      return r;
    }
    const ru = normalizeRemoteUrl(r.remoteUrl);
    if (nu && ru && nu === ru) return r;
    if (pu && ru && pu === ru) return r;
  }
  return null;
}

export async function listFavoriteRecords(): Promise<FavoriteRecord[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  const rows = await idbReq(store.getAll() as IDBRequest<FavoriteRecord[]>);
  return (rows ?? []).sort((a, b) => b.savedAt - a.savedAt);
}

/** Total record count without loading blobs (cheap). */
export async function countFavoriteRecords(): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  return idbReq(store.count() as IDBRequest<number>);
}

/**
 * Page through favorites by savedAt desc. To avoid pulling every blob into
 * memory at once, we first read all lightweight metadata via getAllKeys + a
 * metadata-only cursor, sort by savedAt, then fetch only the blobs for the
 * requested page with individual get() calls.
 *
 * In practice IDB getAllKeys + per-id get on the small page is dramatically
 * cheaper than getAll() on large libraries (blobs are the memory cost).
 */
export async function listFavoriteRecordsPaged(opts: {
  offset: number;
  limit: number;
}): Promise<{ rows: FavoriteRecord[]; total: number }> {
  const { offset, limit } = opts;
  const db = await openDb();
  const countTx = db.transaction(STORE, "readonly");
  const total =
    (await idbReq(
      countTx.objectStore(STORE).count() as IDBRequest<number>,
    )) ?? 0;
  const rows: FavoriteRecord[] = [];
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(0, Math.floor(limit));
  if (safeLimit === 0 || safeOffset >= total) return { rows, total };

  const pageTx = db.transaction(STORE, "readonly");
  const store = pageTx.objectStore(STORE);

  // savedAt index lets IndexedDB seek newest-first and stop after one page.
  // This is important for videos: their Blob values are no longer all
  // materialized in renderer memory just to display the first screen.
  await new Promise<void>((resolve, reject) => {
    const request = store.index(SAVED_AT_INDEX).openCursor(null, "prev");
    let skipped = false;
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB cursor failed"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || rows.length >= safeLimit) {
        resolve();
        return;
      }
      if (!skipped && safeOffset > 0) {
        skipped = true;
        cursor.advance(safeOffset);
        return;
      }
      skipped = true;
      rows.push(cursor.value as FavoriteRecord);
      cursor.continue();
    };
  });
  return { rows, total };
}

/** Fetch a single record by id (for the fullscreen viewer). */
export async function getFavoriteRecord(
  id: string,
): Promise<FavoriteRecord | null> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  const row = await idbReq(
    store.get(id) as IDBRequest<FavoriteRecord | undefined>,
  );
  return row ?? null;
}

/** Keys to try in IndexedDB so a Gelbooru card can reuse a saved file. */
export function favoriteLookupPlan(item: {
  id: string;
  url?: string;
  previewUrl?: string;
  gelbooruId?: string;
  booruSite?: string | null;
}): { ids: string[]; gelbooruId: string | null; remoteUrls: string[] } {
  const gid = resolveGelbooruId(item);
  const site = inferBooruSite(item);
  const ids = [item.id];
  if (gid) {
    const namespaced = booruMediaId(site, gid);
    if (namespaced !== item.id) ids.push(namespaced);
  }
  const remoteUrls: string[] = [];
  const seen = new Set<string>();
  for (const raw of [item.url, item.previewUrl]) {
    if (!raw?.trim()) continue;
    for (const key of [raw, normalizeRemoteUrl(raw)]) {
      if (!key || seen.has(key)) continue;
      seen.add(key);
      remoteUrls.push(key);
    }
  }
  return { ids, gelbooruId: gid, remoteUrls };
}

/**
 * One-record IndexedDB lookup. Does not load the whole shelf.
 * Used when a site card is already saved — play the local blob instead of CDN.
 */
export async function getMatchingFavoriteRecord(
  item: Pick<MediaItem, "id" | "url" | "previewUrl" | "gelbooruId">,
): Promise<FavoriteRecord | null> {
  const plan = favoriteLookupPlan(item);
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  for (const id of plan.ids) {
    const row = await idbReq(
      store.get(id) as IDBRequest<FavoriteRecord | undefined>,
    );
    if (row) return row;
  }
  if (plan.gelbooruId && store.indexNames.contains("gelbooruId")) {
    const row = await idbReq(
      store
        .index("gelbooruId")
        .get(plan.gelbooruId) as IDBRequest<FavoriteRecord | undefined>,
    );
    if (row) return row;
  }
  if (store.indexNames.contains("remoteUrl")) {
    const index = store.index("remoteUrl");
    for (const key of plan.remoteUrls) {
      const row = await idbReq(
        index.get(key) as IDBRequest<FavoriteRecord | undefined>,
      );
      if (row) return row;
    }
  }
  return null;
}

export async function revealFavoriteOnDisk(
  item: Pick<MediaItem, "id" | "url" | "previewUrl" | "gelbooruId">,
): Promise<{ ok: boolean; detail?: string }> {
  const row = await getMatchingFavoriteRecord(item);
  if (!row) return { ok: false, detail: "нет файла на полке" };
  const bytes = new Uint8Array(await row.blob.arrayBuffer());
  const desktop = window.joiDesktop?.shell?.showTempFile;
  if (desktop) {
    return desktop({ fileName: row.fileName, bytes });
  }
  const url = URL.createObjectURL(row.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = row.fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
  return { ok: true };
}

export async function getFavoritesIndex(): Promise<FavoritesIndex> {
  const rows = await listFavoriteRecords();
  return buildFavoritesIndex(rows);
}

/** @deprecated Prefer getFavoritesIndex — kept for call sites that only need ids. */
export async function getFavoriteIds(): Promise<Set<string>> {
  const index = await getFavoritesIndex();
  return index.ids;
}

export async function hasFavorite(id: string): Promise<boolean> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const row = await idbReq(tx.objectStore(STORE).get(id));
  return Boolean(row);
}

export async function countFavorites(): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const n = await idbReq(tx.objectStore(STORE).count());
  return n ?? 0;
}

/** Turn stored blobs into playable MediaItems (caller should revoke later). */
export async function loadFavoritesAsMedia(opts?: {
  offset?: number;
  limit?: number;
}): Promise<MediaItem[]> {
  const rows = opts
    ? (
        await listFavoriteRecordsPaged({
          offset: opts.offset ?? 0,
          limit: opts.limit ?? 60,
        })
      ).rows
    : await listFavoriteRecords();
  return rows.map((r) => favoriteRecordToMedia(r));
}

export function favoriteRecordToMedia(r: FavoriteRecord): MediaItem {
  const gid = r.gelbooruId?.trim() || gelbooruIdFromMediaId(r.id) || undefined;
  const url = URL.createObjectURL(r.blob);
  const previewUrl = r.thumbBlob ? URL.createObjectURL(r.thumbBlob) : undefined;
  const site = inferBooruSite(r);
  return {
    id: r.id,
    url,
    previewUrl,
    kind: r.kind,
    source: "favorites" as const,
    tags: r.tags,
    gelbooruId: gid,
    booruSite: site,
  };
}

/** Remote Gelbooru shape for lists — blob URLs cannot be stored in a playlist. */
export function favoriteRecordToListItem(r: FavoriteRecord): MediaItem | null {
  const remote = r.remoteUrl?.trim();
  if (!remote || remote.startsWith("blob:") || remote.startsWith("data:")) {
    return null;
  }
  const gid = r.gelbooruId?.trim() || gelbooruIdFromMediaId(r.id) || undefined;
  const site = inferBooruSite(r);
  return {
    id: gid ? booruMediaId(site, gid) : r.id,
    url: remote,
    kind: r.kind,
    source: "gelbooru",
    tags: r.tags,
    gelbooruId: gid,
    booruSite: site,
  };
}

export function revokeFavoriteMedia(items: MediaItem[]): void {
  for (const item of items) {
    if (item.source !== "favorites") continue;
    const urls = new Set<string>();
    if (item.url.startsWith("blob:")) urls.add(item.url);
    if (item.previewUrl?.startsWith("blob:")) urls.add(item.previewUrl);
    for (const url of urls) URL.revokeObjectURL(url);
  }
}

/** Tag frequency for filter chips (desc). */
export function collectFavoriteTagStats(
  records: Array<Pick<FavoriteRecord, "tags">>,
): FavoriteTagStat[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const r of records) {
    const seen = new Set<string>();
    for (const tag of contentBooruTags(r.tags)) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const cur = counts.get(key);
      if (cur) cur.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
  );
}

/** Exact tag totals for the entire library without reading media Blobs. */
export async function collectAllFavoriteTagStats(): Promise<FavoriteTagStat[]> {
  return collectFavoriteTagStats(await listFavoriteMetadata());
}

/** All lightweight favorite data; safe to use for whole-library summaries. */
export async function listFavoriteMetadata(): Promise<FavoriteMetadata[]> {
  const db = await openDb();
  const tx = db.transaction(METADATA_STORE, "readonly");
  const rows = await idbReq(
    tx.objectStore(METADATA_STORE).getAll() as IDBRequest<FavoriteMetadata[]>,
  );
  return (rows ?? []).sort((a, b) => b.savedAt - a.savedAt);
}

export function favoriteMatchesTagFilter(
  tags: string | undefined,
  selected: string[],
  search: string,
): boolean {
  const tokens = contentBooruTags(tags).map((t) => t.toLowerCase());
  const q = search.trim().toLowerCase();
  if (q) {
    const hay = tokens.join(" ");
    if (!hay.includes(q) && !tokens.some((t) => t.includes(q))) {
      return false;
    }
  }
  if (selected.length === 0) return true;
  // Booru-style AND: every selected tag must be present
  return selected.every((sel) => {
    const s = sel.toLowerCase();
    return tokens.some((t) => t === s);
  });
}

export type FavoriteKindFilter = HubKindFilter;

/** Resolve kind from v5 metadata, falling back to mime for older rows. */
export function favoriteMediaKind(
  meta: Pick<FavoriteMetadata, "kind" | "mime">,
): MediaKind {
  if (meta.kind) return meta.kind;
  const mime = (meta.mime ?? "").toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime === "image/gif") return "gif";
  return "image";
}

export function favoriteMatchesKindFilter(
  meta: Pick<FavoriteMetadata, "kind" | "mime">,
  kind: FavoriteKindFilter,
): boolean {
  if (kind === "all") return true;
  const resolved = favoriteMediaKind(meta);
  if (kind === "video") return resolved === "video";
  if (kind === "gif") return resolved === "gif";
  if (kind === "image") return resolved === "image";
  const _exhaustive: never = kind;
  return _exhaustive;
}

/** Whole-library filter (tags + search + kind) without loading blobs. */
export function filterFavoriteMetadata(
  rows: FavoriteMetadata[],
  opts: {
    selectedTags: string[];
    search: string;
    kind: FavoriteKindFilter;
  },
): FavoriteMetadata[] {
  return rows.filter(
    (row) =>
      favoriteMatchesKindFilter(row, opts.kind) &&
      favoriteMatchesTagFilter(row.tags, opts.selectedTags, opts.search),
  );
}

/** Fetch records by id, preserving the requested order. */
export async function listFavoriteRecordsByIds(
  ids: string[],
): Promise<FavoriteRecord[]> {
  if (ids.length === 0) return [];
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  const rows = await Promise.all(
    ids.map((id) =>
      idbReq(store.get(id) as IDBRequest<FavoriteRecord | undefined>),
    ),
  );
  return rows.filter((row): row is FavoriteRecord => Boolean(row));
}

async function fetchFavoriteBlob(item: MediaItem): Promise<Blob> {
  const fetchUrl = downloadMediaUrl(item);
  // The heart button stays disabled for the duration — never let it hang.
  const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) {
    throw new Error(`Не удалось скачать медиа (${res.status})`);
  }
  return res.blob();
}

/** Download current booru (or any remote) item and store locally. */
export async function addFavoriteFromItem(
  item: MediaItem,
  cachedBlob?: Blob | null,
): Promise<void> {
  if (item.source === "favorites") return;

  const existing = findMatchingFavorite(item, await listFavoriteRecords());
  if (existing) {
    // Refresh tags / gelbooruId on an older record if we know more now
    const gid = resolveGelbooruId(item) || existing.gelbooruId;
    const tags =
      item.tags && contentBooruTags(item.tags).length > contentBooruTags(existing.tags).length
        ? item.tags
        : existing.tags;
    let thumbBlob = existing.thumbBlob;
    if (!thumbBlob && existing.kind === "image") {
      thumbBlob = await resolveFavoriteThumbBlob(item, existing.blob);
    }
    const next: FavoriteRecord = {
      ...existing,
      gelbooruId: gid,
      tags: tags ?? existing.tags,
      remoteUrl: existing.remoteUrl || item.url,
      thumbBlob,
    };
    const metaChanged =
      (gid && gid !== existing.gelbooruId) || (tags && tags !== existing.tags);
    const thumbChanged = Boolean(thumbBlob && thumbBlob !== existing.thumbBlob);
    if (metaChanged || thumbChanged) {
      await putFavoriteRecord(next);
    }
    return;
  }

  const blob = cachedBlob && cachedBlob.size > 0
    ? cachedBlob
    : await fetchFavoriteBlob(item);
  const mime = blob.type || guessMime(item);
  const ext = extFromMime(mime, item.kind);
  const gid = resolveGelbooruId(item) ?? undefined;
  const site = inferBooruSite(item);
  const stableId = gid ? booruMediaId(site, gid) : item.id;
  const thumbBlob = await resolveFavoriteThumbBlob(item, blob);
  const record: FavoriteRecord = {
    id: stableId,
    kind: item.kind,
    tags: item.tags,
    mime,
    fileName: `${sanitizeFileName(stableId)}.${ext}`,
    remoteUrl: item.url,
    gelbooruId: gid,
    blob,
    thumbBlob,
    savedAt: Date.now(),
  };

  const db = await openDb();
  const tx = db.transaction([STORE, METADATA_STORE], "readwrite");
  const done = txComplete(tx);
  await Promise.all([
    idbReq(tx.objectStore(STORE).put(record)),
    idbReq(tx.objectStore(METADATA_STORE).put(toFavoriteMetadata(record))),
  ]);
  await done;
}

export async function removeFavorite(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([STORE, METADATA_STORE], "readwrite");
  const done = txComplete(tx);
  await Promise.all([
    idbReq(tx.objectStore(STORE).delete(id)),
    idbReq(tx.objectStore(METADATA_STORE).delete(id)),
  ]);
  await done;
}

/** Upsert a full favorite record (used by progress backup import). */
export async function putFavoriteRecord(record: FavoriteRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([STORE, METADATA_STORE], "readwrite");
  const done = txComplete(tx);
  await Promise.all([
    idbReq(tx.objectStore(STORE).put(record)),
    idbReq(tx.objectStore(METADATA_STORE).put(toFavoriteMetadata(record))),
  ]);
  await done;
}

/**
 * Encode a wall thumb for stills that were saved before thumbs existed.
 * GIFs/videos stay on the original blob. Persists so the next visit skips work.
 */
export async function ensureFavoriteWallThumb(
  record: FavoriteRecord,
): Promise<FavoriteRecord> {
  if (record.kind !== "image" || record.thumbBlob) return record;
  const thumb = await stillBlobToWallThumb(record.blob);
  if (!thumb) return record;
  const next: FavoriteRecord = { ...record, thumbBlob: thumb };
  await putFavoriteRecord(next);
  return next;
}

export async function ensureFavoriteWallThumbs(
  records: FavoriteRecord[],
): Promise<FavoriteRecord[]> {
  return mapWithConcurrency(
    records,
    favoriteWallThumbConcurrency(),
    (record) => ensureFavoriteWallThumb(record),
  );
}

/** Wipe all favorites (progress backup replace). */
export async function clearAllFavorites(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([STORE, METADATA_STORE], "readwrite");
  const done = txComplete(tx);
  await Promise.all([
    idbReq(tx.objectStore(STORE).clear()),
    idbReq(tx.objectStore(METADATA_STORE).clear()),
  ]);
  await done;
}

/** Remove by current MediaItem (matches legacy ids / urls / post id). */
export async function removeFavoriteForItem(item: MediaItem): Promise<boolean> {
  const match = findMatchingFavorite(item, await listFavoriteRecords());
  if (!match) return false;
  await removeFavorite(match.id);
  return true;
}

async function resolveFavoriteThumbBlob(
  item: MediaItem,
  original: Blob,
): Promise<Blob | undefined> {
  if (item.kind !== "image") return undefined;
  const sampleUrl = item.sampleUrl?.trim();
  if (sampleUrl && sampleUrl !== item.url) {
    try {
      const res = await fetch(downloadMediaUrl({ ...item, url: sampleUrl }), {
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        const sample = await res.blob();
        if (
          sample.size > 0 &&
          sample.type.startsWith("image/") &&
          sample.type !== "image/gif"
        ) {
          return (await stillBlobToWallThumb(sample)) ?? sample;
        }
      }
    } catch {
      /* downsample the original instead */
    }
  }
  return (await stillBlobToWallThumb(original)) ?? undefined;
}

function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("favorite tx failed"));
  });
}

function guessMime(item: MediaItem): string {
  if (item.kind === "video") return "video/mp4";
  if (item.kind === "gif") return "image/gif";
  return "image/jpeg";
}

function extFromMime(mime: string, kind: MediaKind): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (kind === "video") return "mp4";
  if (kind === "gif") return "gif";
  return "jpg";
}

function sanitizeFileName(id: string): string {
  return id.replace(/[^\w.-]+/g, "_").slice(0, 80) || "fav";
}
