import { cardSpokenLanguages, displayTitle } from "./normalize";
import type {
  DoujinCard,
  DoujinGallery,
  DoujinLibraryRecord,
  DoujinTag,
} from "./types";

const DB_NAME = "joi-conductor-doujin";
/** v5 adds page blob cache for reading-run prefetch. */
const DB_VERSION = 5;
const STORE = "library";
export const READING_LISTS_STORE = "readingLists";
export const TASTE_META_STORE = "tasteMeta";
export const TASTE_GALLERIES_STORE = "tasteGalleries";
export const TASTE_NAMES_STORE = "tasteNames";
export const PAGE_BLOBS_STORE = "pageBlobs";
const SAVED_AT_INDEX = "savedAt";

const REQUIRED_STORES = [
  STORE,
  READING_LISTS_STORE,
  TASTE_META_STORE,
  TASTE_GALLERIES_STORE,
  TASTE_NAMES_STORE,
  PAGE_BLOBS_STORE,
] as const;

let dbPromise: Promise<IDBDatabase> | null = null;

export function missingDoujinStores(names: {
  contains(name: string): boolean;
}): string[] {
  return REQUIRED_STORES.filter((name) => !names.contains(name));
}

function ensureDoujinStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE)) {
    const store = db.createObjectStore(STORE, { keyPath: "id" });
    store.createIndex(SAVED_AT_INDEX, "savedAt", { unique: false });
  }
  if (!db.objectStoreNames.contains(READING_LISTS_STORE)) {
    const lists = db.createObjectStore(READING_LISTS_STORE, {
      keyPath: "id",
    });
    lists.createIndex("updatedAt", "updatedAt", { unique: false });
  }
  if (!db.objectStoreNames.contains(TASTE_META_STORE)) {
    db.createObjectStore(TASTE_META_STORE, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(TASTE_GALLERIES_STORE)) {
    db.createObjectStore(TASTE_GALLERIES_STORE, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(TASTE_NAMES_STORE)) {
    db.createObjectStore(TASTE_NAMES_STORE, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(PAGE_BLOBS_STORE)) {
    const pages = db.createObjectStore(PAGE_BLOBS_STORE, { keyPath: "key" });
    pages.createIndex("galleryId", "galleryId", { unique: false });
  }
}

function openAtVersion(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, version);
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB open failed"));
    req.onblocked = () => {
      dbPromise = null;
    };
    req.onupgradeneeded = () => {
      ensureDoujinStores(req.result);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
  });
}

async function openAndMigrate(): Promise<IDBDatabase> {
  let db = await openAtVersion(DB_VERSION);
  if (missingDoujinStores(db.objectStoreNames).length === 0) return db;
  const next = Math.max(DB_VERSION, db.version) + 1;
  db.close();
  db = await openAtVersion(next);
  const missing = missingDoujinStores(db.objectStoreNames);
  if (missing.length > 0) {
    db.close();
    throw new Error(`IndexedDB без магазинов: ${missing.join(", ")}`);
  }
  return db;
}

export function openDoujinDb(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openAndMigrate();
  return dbPromise.then((db) => {
    if (missingDoujinStores(db.objectStoreNames).length === 0) return db;
    try {
      db.close();
    } catch {
      /* already closed */
    }
    dbPromise = openAndMigrate();
    return dbPromise;
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    const pending = dbPromise;
    dbPromise = null;
    void pending?.then((db) => {
      try {
        db.close();
      } catch {
        /* already closed */
      }
    });
  });
}

export function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export function galleryToLibraryRecord(
  gallery: DoujinGallery,
  opts?: {
    coverBlob?: Blob;
    pageIndex?: number;
    savedAt?: number;
    readAt?: number;
  },
): DoujinLibraryRecord {
  return {
    id: gallery.id,
    mediaId: gallery.mediaId,
    title: gallery.title,
    tags: gallery.tags,
    numPages: gallery.numPages,
    coverUrl: gallery.coverUrl || gallery.thumbnailUrl,
    coverBlob: opts?.coverBlob,
    savedAt: opts?.savedAt ?? Date.now(),
    pageIndex: opts?.pageIndex ?? 0,
    readAt: opts?.readAt,
  };
}

export async function listLibrary(): Promise<DoujinLibraryRecord[]> {
  const db = await openDoujinDb();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  const rows = await idbRequest(store.getAll());
  const list = (rows as DoujinLibraryRecord[]) ?? [];
  list.sort((a, b) => b.savedAt - a.savedAt);
  return list;
}

export async function getLibraryRecords(
  ids: readonly number[],
): Promise<Map<number, DoujinLibraryRecord>> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  const map = new Map<number, DoujinLibraryRecord>();
  if (unique.length === 0) return map;
  const db = await openDoujinDb();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  await Promise.all(
    unique.map(async (id) => {
      const row = await idbRequest(store.get(id));
      if (row) map.set(id, row as DoujinLibraryRecord);
    }),
  );
  return map;
}

export async function getLibraryRecord(
  id: number,
): Promise<DoujinLibraryRecord | undefined> {
  const db = await openDoujinDb();
  const tx = db.transaction(STORE, "readonly");
  const row = await idbRequest(tx.objectStore(STORE).get(id));
  return row as DoujinLibraryRecord | undefined;
}

export async function isInLibrary(id: number): Promise<boolean> {
  const row = await getLibraryRecord(id);
  return Boolean(row);
}

export async function listLibraryIds(): Promise<Set<number>> {
  const rows = await listLibrary();
  return new Set(rows.map((r) => r.id));
}

export async function saveToLibrary(
  gallery: DoujinGallery,
  opts?: { coverBlob?: Blob; pageIndex?: number },
): Promise<DoujinLibraryRecord> {
  const existing = await getLibraryRecord(gallery.id);
  const record = galleryToLibraryRecord(gallery, {
    coverBlob: opts?.coverBlob ?? existing?.coverBlob,
    pageIndex: opts?.pageIndex ?? existing?.pageIndex ?? 0,
    savedAt: existing?.savedAt ?? Date.now(),
    readAt: existing?.readAt,
  });
  const db = await openDoujinDb();
  const tx = db.transaction(STORE, "readwrite");
  await idbRequest(tx.objectStore(STORE).put(record));
  return record;
}

export async function removeFromLibrary(id: number): Promise<void> {
  const db = await openDoujinDb();
  const tx = db.transaction(STORE, "readwrite");
  await idbRequest(tx.objectStore(STORE).delete(id));
}

export async function setLibraryPageIndex(
  id: number,
  pageIndex: number,
): Promise<void> {
  const existing = await getLibraryRecord(id);
  if (!existing) return;
  const next: DoujinLibraryRecord = {
    ...existing,
    pageIndex: Math.max(0, Math.floor(pageIndex)),
    readAt: Date.now(),
  };
  const db = await openDoujinDb();
  const tx = db.transaction(STORE, "readwrite");
  await idbRequest(tx.objectStore(STORE).put(next));
}

/** Persist reader progress even when the work is not in nhentai favorites. */
export async function touchLibraryProgress(
  gallery: DoujinGallery,
  pageIndex: number,
): Promise<void> {
  const existing = await getLibraryRecord(gallery.id);
  if (!existing) {
    await saveToLibrary(gallery, { pageIndex });
  }
  await setLibraryPageIndex(gallery.id, pageIndex);
}

export const CONTINUE_SHELF_CAP = 12;

export function isContinueRecord(row: DoujinLibraryRecord): boolean {
  const last = Math.max(1, row.numPages) - 1;
  return row.pageIndex > 0 && row.pageIndex < last;
}

export function continueReadingRows(
  rows: readonly DoujinLibraryRecord[],
  cap = CONTINUE_SHELF_CAP,
): DoujinLibraryRecord[] {
  return rows
    .filter(isContinueRecord)
    .sort(
      (a, b) =>
        (b.readAt ?? 0) - (a.readAt ?? 0) || b.savedAt - a.savedAt,
    )
    .slice(0, Math.max(1, cap));
}

export function libraryTagPool(rows: DoujinLibraryRecord[]): DoujinTag[] {
  const out: DoujinTag[] = [];
  for (const row of rows) {
    out.push(...row.tags);
  }
  return out;
}

export function libraryLabel(row: DoujinLibraryRecord): string {
  return displayTitle(row.title) || `#${row.id}`;
}

export function recordToCard(row: DoujinLibraryRecord): DoujinCard {
  const languages = cardSpokenLanguages(row.tags, [], "");
  return {
    id: row.id,
    mediaId: row.mediaId,
    title: row.title,
    numPages: row.numPages,
    coverUrl: row.coverUrl,
    thumbnailUrl: row.coverUrl,
    tags: row.tags,
    language: languages[0],
    languages: languages.length > 0 ? languages : undefined,
  };
}
