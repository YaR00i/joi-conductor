import { displayMediaUrl, type MediaItem, type MediaKind } from "./media";
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

/** Parse `gb-123` / legacy `gb-123-7` → `123`. */
export function gelbooruIdFromMediaId(id: string): string | null {
  const m = /^gb-(\d+)(?:-\d+)?$/.exec(id);
  return m?.[1] ?? null;
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
    const gid = r.gelbooruId?.trim() || gelbooruIdFromMediaId(r.id);
    if (gid) {
      gelbooruIds.add(gid);
      ids.add(`gb-${gid}`);
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
  if (gid && index.gelbooruIds.has(gid)) return true;
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
  const nu = normalizeRemoteUrl(item.url);
  const pu = normalizeRemoteUrl(item.previewUrl);
  for (const r of records) {
    if (r.id === item.id) return r;
    const rg = r.gelbooruId?.trim() || gelbooruIdFromMediaId(r.id);
    if (gid && rg && gid === rg) return r;
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
  return {
    id: r.id,
    url: URL.createObjectURL(r.blob),
    kind: r.kind,
    source: "favorites" as const,
    tags: r.tags,
    gelbooruId: gid,
  };
}

export function revokeFavoriteMedia(items: MediaItem[]): void {
  for (const item of items) {
    if (item.source === "favorites" && item.url.startsWith("blob:")) {
      URL.revokeObjectURL(item.url);
    }
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

/** Download current booru (or any remote) item and store locally. */
export async function addFavoriteFromItem(item: MediaItem): Promise<void> {
  if (item.source === "favorites") return;

  const existing = findMatchingFavorite(item, await listFavoriteRecords());
  if (existing) {
    // Refresh tags / gelbooruId on an older record if we know more now
    const gid = resolveGelbooruId(item) || existing.gelbooruId;
    const tags =
      item.tags && contentBooruTags(item.tags).length > contentBooruTags(existing.tags).length
        ? item.tags
        : existing.tags;
    if (
      (gid && gid !== existing.gelbooruId) ||
      (tags && tags !== existing.tags)
    ) {
      const db = await openDb();
      const tx = db.transaction([STORE, METADATA_STORE], "readwrite");
      const next: FavoriteRecord = {
        ...existing,
        gelbooruId: gid,
        tags: tags ?? existing.tags,
        remoteUrl: existing.remoteUrl || item.url,
      };
      const done = txComplete(tx);
      await Promise.all([
        idbReq(tx.objectStore(STORE).put(next)),
        idbReq(tx.objectStore(METADATA_STORE).put(toFavoriteMetadata(next))),
      ]);
      await done;
    }
    return;
  }

  const fetchUrl = displayMediaUrl(item);
  const res = await fetch(fetchUrl);
  if (!res.ok) {
    throw new Error(`Не удалось скачать медиа (${res.status})`);
  }
  const blob = await res.blob();
  const mime = blob.type || guessMime(item);
  const ext = extFromMime(mime, item.kind);
  const gid = resolveGelbooruId(item) ?? undefined;
  const stableId = gid ? `gb-${gid}` : item.id;
  const record: FavoriteRecord = {
    id: stableId,
    kind: item.kind,
    tags: item.tags,
    mime,
    fileName: `${sanitizeFileName(stableId)}.${ext}`,
    remoteUrl: item.url,
    gelbooruId: gid,
    blob,
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
