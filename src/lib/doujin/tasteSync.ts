import { fetchFavorites, fetchTagsByIds } from "./client";
import {
  idbRequest,
  openDoujinDb,
  TASTE_GALLERIES_STORE,
  TASTE_META_STORE,
  TASTE_NAMES_STORE,
} from "./library";
import { mediaCoverUrls } from "./normalize";
import { orderFavoriteCatalogIds, rankTagIdStats, tasteTagKey } from "./query";
import { sleep } from "./rateLimit";
import { loadDoujinSettings } from "./settings";
import type {
  DoujinAccountTaste,
  DoujinCard,
  DoujinLibraryCatalogSort,
  DoujinListPage,
  DoujinTag,
} from "./types";

export const TASTE_SYNC_PAGE_SIZE = 100;
/** Favorites list ignores per_page (~25/page). Extra pause so we don't 429. */
const SYNC_PAGE_GAP_MS = 8_000;
const TAG_ID_CHUNK = 100;

const META_ID = "sync";

export type TasteGalleryRow = {
  id: number;
  tagIds: number[];
  /** List card from sync — cover, title, pages. Site is only hit on open. */
  card?: DoujinCard;
  /** Position in account favorites, 0 = newest. */
  ord?: number;
};

export type TasteMetaRow = {
  id: typeof META_ID;
  lastPage: number;
  numPages: number;
  total: number;
  complete: boolean;
  at: number;
};

export type TasteSyncPhase = "idle" | "favorites" | "names";

export type TasteSyncStatus = {
  running: boolean;
  complete: boolean;
  phase: TasteSyncPhase;
  page: number;
  numPages: number;
  galleries: number;
  total: number;
  error: string | null;
};

type TasteListener = (status: TasteSyncStatus, taste: DoujinAccountTaste | null) => void;

const listeners = new Set<TasteListener>();

let status: TasteSyncStatus = {
  running: false,
  complete: false,
  phase: "idle",
  page: 0,
  numPages: 0,
  galleries: 0,
  total: 0,
  error: null,
};

export function formatTasteSyncProgress(sync: TasteSyncStatus): string {
  if (sync.error) return sync.error;
  if (sync.running) {
    if (sync.phase === "names") {
      const pass = sync.page > 0 ? ` · проход ${sync.page}` : "";
      return sync.galleries > 0
        ? `Имена тегов${pass} · ${sync.galleries} работ в каталоге`
        : "Разбираем имена тегов…";
    }
    if (sync.numPages > 0) {
      if (sync.page <= 0) {
        return `Ждём первую страницу · ${sync.numPages} стр. · пауза ~8 с`;
      }
      const have =
        sync.total > 0
          ? `${sync.galleries} из ${sync.total}`
          : `${sync.galleries} работ`;
      return `Избранное ${sync.page} из ${sync.numPages} · ${have}`;
    }
    return "Синхронизация вкусов… пауза ~8 с на страницу";
  }
  if (sync.complete && sync.galleries > 0) {
    return `Каталог готов: ${sync.galleries} работ`;
  }
  return "";
}

export function tasteSyncProgressRatio(sync: TasteSyncStatus): number {
  if (sync.error) return 0;
  if (!sync.running) return sync.complete ? 1 : 0;
  if (sync.phase === "names") return 0.92;
  if (sync.numPages <= 0) return 0.06;
  return Math.min(0.9, Math.max(0.06, sync.page / sync.numPages));
}

let syncChain: Promise<void> | null = null;

function emptyMeta(): TasteMetaRow {
  return {
    id: META_ID,
    lastPage: 0,
    numPages: 1,
    total: 0,
    complete: false,
    at: Date.now(),
  };
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB tx failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB tx aborted"));
  });
}

export function pageIsFullyKnown(
  ids: readonly number[],
  known: ReadonlySet<number>,
): boolean {
  return ids.length > 0 && ids.every((id) => known.has(id));
}

export function pageHasSortCards(
  ids: readonly number[],
  byId: ReadonlyMap<number, TasteGalleryRow>,
): boolean {
  return ids.length > 0 && ids.every((id) => {
    const row = byId.get(id);
    return Boolean(row && rowHasCatalogCard(row));
  });
}

export function nextUnresolvedIds(
  stats: readonly { id: number; count: number }[],
  named: ReadonlySet<number>,
  limit = TAG_ID_CHUNK,
): number[] {
  const out: number[] = [];
  for (const row of stats) {
    if (named.has(row.id)) continue;
    out.push(row.id);
    if (out.length >= limit) break;
  }
  return out;
}

export function cardTagIds(card: Pick<DoujinCard, "tagIds" | "tags">): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  const source = [
    ...(card.tagIds ?? []),
    ...(card.tags ?? []).map((tag) => tag.id),
  ];
  for (const id of source) {
    if (id == null || !Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function tasteCardStub(card: DoujinCard): DoujinCard {
  const fromMedia = mediaCoverUrls(card.mediaId);
  const coverUrl = card.coverUrl || card.thumbnailUrl || fromMedia.coverUrl;
  const thumbnailUrl = card.thumbnailUrl || card.coverUrl || fromMedia.thumbnailUrl;
  return {
    id: card.id,
    mediaId: card.mediaId,
    title: card.title,
    numPages: card.numPages,
    coverUrl,
    thumbnailUrl,
    tags: card.tags ?? [],
    language: card.language,
    languages: card.languages,
    uploadedAt: card.uploadedAt,
    numFavorites: card.numFavorites,
    tagIds: cardTagIds(card),
  };
}

export function rowHasCatalogCard(row: TasteGalleryRow): boolean {
  const card = row.card;
  return Boolean(card && (card.mediaId || card.coverUrl || card.thumbnailUrl));
}

export function ledgerCatalogReady(rows: readonly TasteGalleryRow[]): boolean {
  return rows.length > 0 && rows.every((row) => rowHasCatalogCard(row));
}

export function catalogNeedsCardBackfill(
  rows: readonly TasteGalleryRow[],
): boolean {
  return rows.some((row) => !rowHasCatalogCard(row));
}

export function rowHasFavoriteOrd(row: TasteGalleryRow): boolean {
  return row.ord != null && Number.isFinite(row.ord);
}

export function catalogNeedsOrdBackfill(
  rows: readonly TasteGalleryRow[],
): boolean {
  return rows.some((row) => !rowHasFavoriteOrd(row));
}

export function tasteSyncStartPage(opts: {
  complete: boolean;
  lastPage: number;
  needsBackfill: boolean;
  needsOrd: boolean;
}): { page: number; resetProgress: boolean } {
  const catchingUp = opts.complete && !opts.needsBackfill && !opts.needsOrd;
  const resumeIncomplete = !opts.complete && opts.lastPage > 0;
  if (resumeIncomplete) {
    return { page: Math.max(1, opts.lastPage + 1), resetProgress: false };
  }
  if (catchingUp || opts.needsBackfill || opts.needsOrd) {
    return { page: 1, resetProgress: true };
  }
  return { page: Math.max(1, opts.lastPage + 1), resetProgress: false };
}

export function pageHasFavoriteOrds(
  ids: readonly number[],
  byId: ReadonlyMap<number, TasteGalleryRow>,
): boolean {
  return (
    ids.length > 0 &&
    ids.every((id) => {
      const row = byId.get(id);
      return Boolean(row && rowHasFavoriteOrd(row));
    })
  );
}

/** Stamp 0-based favorites-list positions. 0 = newest heart on the site. */
export function applyFavoriteListOrds(
  cards: readonly DoujinCard[],
  startOrd: number,
  byId: ReadonlyMap<number, TasteGalleryRow>,
  writeCards: boolean,
): { nextOrd: number; rows: TasteGalleryRow[] } {
  let nextOrd = startOrd;
  const rows: TasteGalleryRow[] = [];
  for (const card of cards) {
    const prev = byId.get(card.id);
    const row: TasteGalleryRow =
      writeCards || !prev
        ? {
            id: card.id,
            tagIds: mergeGalleryTagIds(prev?.tagIds, card),
            card: tasteCardStub(card),
            ord: nextOrd,
          }
        : { ...prev, ord: nextOrd };
    rows.push(row);
    nextOrd += 1;
  }
  return { nextOrd, rows };
}

export function compareFavoriteOrd(a: TasteGalleryRow, b: TasteGalleryRow): number {
  const ao = a.ord;
  const bo = b.ord;
  if (ao != null && bo != null && ao !== bo) return ao - bo;
  if (ao != null && bo == null) return -1;
  if (ao == null && bo != null) return 1;
  return a.id - b.id;
}

function maxFavoriteOrd(rows: readonly TasteGalleryRow[]): number {
  let max = -1;
  for (const row of rows) {
    if (row.ord != null && row.ord > max) max = row.ord;
  }
  return max;
}

export function emptyTasteCard(id: number): DoujinCard {
  const title = `#${id}`;
  return {
    id,
    mediaId: "",
    title: { english: title, japanese: title, pretty: title },
    numPages: 0,
    coverUrl: "",
    thumbnailUrl: "",
    tags: [],
  };
}

export function cardFromTasteRow(row: TasteGalleryRow): DoujinCard {
  const stub = row.card;
  if (!stub) return emptyTasteCard(row.id);
  const fromMedia = mediaCoverUrls(stub.mediaId);
  return {
    ...stub,
    coverUrl: stub.coverUrl || stub.thumbnailUrl || fromMedia.coverUrl,
    thumbnailUrl: stub.thumbnailUrl || stub.coverUrl || fromMedia.thumbnailUrl,
    tagIds: stub.tagIds && stub.tagIds.length > 0 ? stub.tagIds : row.tagIds,
  };
}

export function windowLedgerFavorites(
  rows: readonly TasteGalleryRow[],
  gridPage: number,
  pageSize: number,
  sortTags: readonly DoujinTag[] = [],
  catalogSort: DoujinLibraryCatalogSort = "added",
): DoujinListPage | null {
  if (!ledgerCatalogReady(rows)) return null;
  const wanted = Math.max(1, Math.floor(pageSize) || 1);
  const page = Math.max(1, gridPage);
  const ordered = orderFavoriteCatalogIds(
    rows.map((row) => ({
      id: row.id,
      tagIds: row.tagIds,
      tags: row.card?.tags,
      ord: row.ord,
      uploadedAt: row.card?.uploadedAt,
      numFavorites: row.card?.numFavorites,
      numPages: row.card?.numPages,
    })),
    sortTags,
    catalogSort,
  );
  const total = ordered.length;
  const numPages = Math.max(1, Math.ceil(total / wanted));
  const start = (page - 1) * wanted;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const items = ordered.slice(start, start + wanted).map((id) => {
    const row = byId.get(id);
    return row ? cardFromTasteRow(row) : emptyTasteCard(id);
  });
  return {
    items,
    page,
    numPages,
    total,
  };
}

function mergeGalleryTagIds(
  prev: readonly number[] | undefined,
  card: DoujinCard,
): number[] {
  const fromCard = cardTagIds(card);
  if (!prev || prev.length === 0) return fromCard;
  if (fromCard.length === 0) return [...prev];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of [...prev, ...fromCard]) {
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function countForLovedTag(
  tag: DoujinTag,
  countById: ReadonlyMap<number, number>,
  names: ReadonlyMap<number, DoujinTag>,
): number {
  if (tag.id != null && countById.has(tag.id)) {
    return countById.get(tag.id) ?? 0;
  }
  const key = tasteTagKey(tag);
  for (const [id, named] of names) {
    if (tasteTagKey(named) !== key) continue;
    return countById.get(id) ?? 0;
  }
  return 0;
}

export function buildTasteFromLedger(
  galleries: readonly TasteGalleryRow[],
  names: ReadonlyMap<number, DoujinTag>,
  total: number,
  complete: boolean,
  keepTags: readonly DoujinTag[] = [],
): DoujinAccountTaste {
  const stats = rankTagIdStats(galleries.map((row) => row.tagIds));
  const countById = new Map(stats.map((row) => [row.id, row.count]));
  const tags: DoujinTag[] = [];
  const seen = new Set<string>();
  const push = (tag: DoujinTag, count: number) => {
    const key = tasteTagKey(tag);
    if (!key || key.endsWith(":") || seen.has(key)) return;
    seen.add(key);
    tags.push({ ...tag, count });
  };
  for (const row of stats) {
    const named = names.get(row.id);
    if (!named) continue;
    push({ ...named, id: row.id }, row.count);
  }
  for (const tag of keepTags) {
    const key = tasteTagKey(tag);
    if (!key || key.endsWith(":") || seen.has(key)) continue;
    const named = tag.id != null ? names.get(tag.id) : undefined;
    push(
      {
        type: named?.type ?? tag.type,
        name: named?.name ?? tag.name,
        id: named?.id ?? tag.id,
      },
      countForLovedTag(tag, countById, names),
    );
  }
  return {
    tags,
    favoriteIds: galleries.map((row) => row.id),
    sampled: galleries.length,
    total: Math.max(total, galleries.length),
    complete,
    at: Date.now(),
  };
}

function keepLovedTags(): DoujinTag[] {
  try {
    return loadDoujinSettings().lovedTags;
  } catch {
    return [];
  }
}

function tasteFromLedger(
  galleries: readonly TasteGalleryRow[],
  names: ReadonlyMap<number, DoujinTag>,
  total: number,
  complete: boolean,
): DoujinAccountTaste {
  return buildTasteFromLedger(
    galleries,
    names,
    total,
    complete,
    keepLovedTags(),
  );
}

function emit(taste: DoujinAccountTaste | null): void {
  for (const listener of listeners) listener(status, taste);
}

export function peekTasteSyncStatus(): TasteSyncStatus {
  return status;
}

export function subscribeTasteSync(listener: TasteListener): () => void {
  listeners.add(listener);
  listener(status, null);
  return () => {
    listeners.delete(listener);
  };
}

async function readMeta(): Promise<TasteMetaRow> {
  const db = await openDoujinDb();
  const tx = db.transaction(TASTE_META_STORE, "readonly");
  const row = await idbRequest(
    tx.objectStore(TASTE_META_STORE).get(META_ID),
  );
  return (row as TasteMetaRow | undefined) ?? emptyMeta();
}

async function writeMeta(meta: TasteMetaRow): Promise<void> {
  const db = await openDoujinDb();
  const tx = db.transaction(TASTE_META_STORE, "readwrite");
  tx.objectStore(TASTE_META_STORE).put({ ...meta, id: META_ID, at: Date.now() });
  await txDone(tx);
}

async function readGalleries(): Promise<TasteGalleryRow[]> {
  const db = await openDoujinDb();
  const tx = db.transaction(TASTE_GALLERIES_STORE, "readonly");
  const rows = await idbRequest(tx.objectStore(TASTE_GALLERIES_STORE).getAll());
  return ((rows as TasteGalleryRow[]) ?? []).filter(
    (row) => Number.isInteger(row?.id) && row.id > 0,
  );
}

async function readNames(): Promise<Map<number, DoujinTag>> {
  const db = await openDoujinDb();
  const tx = db.transaction(TASTE_NAMES_STORE, "readonly");
  const rows = await idbRequest(tx.objectStore(TASTE_NAMES_STORE).getAll());
  const map = new Map<number, DoujinTag>();
  for (const tag of (rows as DoujinTag[]) ?? []) {
    if (tag?.id == null || typeof tag.name !== "string") continue;
    map.set(tag.id, { id: tag.id, type: tag.type, name: tag.name });
  }
  return map;
}

async function putGalleries(rows: readonly TasteGalleryRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await openDoujinDb();
  const tx = db.transaction(TASTE_GALLERIES_STORE, "readwrite");
  const store = tx.objectStore(TASTE_GALLERIES_STORE);
  for (const row of rows) store.put(row);
  await txDone(tx);
}

export async function rememberTasteGalleryCards(
  cards: readonly DoujinCard[],
): Promise<void> {
  if (cards.length === 0) return;
  const existing = await readGalleries();
  const byId = new Map(existing.map((row) => [row.id, row]));
  const rows: TasteGalleryRow[] = [];
  for (const card of cards) {
    const prev = byId.get(card.id);
    const row: TasteGalleryRow = {
      id: card.id,
      tagIds: mergeGalleryTagIds(prev?.tagIds, card),
      card: tasteCardStub(card),
      ord: prev?.ord,
    };
    byId.set(card.id, row);
    rows.push(row);
  }
  await putGalleries(rows);
}

async function deleteGallery(id: number): Promise<void> {
  const db = await openDoujinDb();
  const tx = db.transaction(TASTE_GALLERIES_STORE, "readwrite");
  tx.objectStore(TASTE_GALLERIES_STORE).delete(id);
  await txDone(tx);
}

async function putNames(tags: readonly DoujinTag[]): Promise<void> {
  const rows = tags.filter(
    (tag): tag is DoujinTag & { id: number } =>
      tag.id != null && Number.isInteger(tag.id) && tag.id > 0,
  );
  if (rows.length === 0) return;
  const db = await openDoujinDb();
  const tx = db.transaction(TASTE_NAMES_STORE, "readwrite");
  const store = tx.objectStore(TASTE_NAMES_STORE);
  for (const tag of rows) {
    store.put({ id: tag.id, type: tag.type, name: tag.name });
  }
  await txDone(tx);
}

async function snapshotTaste(): Promise<DoujinAccountTaste> {
  const [galleries, names, meta] = await Promise.all([
    readGalleries(),
    readNames(),
    readMeta(),
  ]);
  const taste = tasteFromLedger(
    galleries,
    names,
    meta.total,
    meta.complete,
  );
  status = {
    ...status,
    complete: meta.complete,
    page: meta.lastPage,
    numPages: meta.numPages,
    galleries: galleries.length,
    total: meta.total || galleries.length,
  };
  return taste;
}

export async function loadTasteGalleries(): Promise<TasteGalleryRow[]> {
  try {
    return await readGalleries();
  } catch {
    return [];
  }
}

export async function loadPersistedTaste(): Promise<DoujinAccountTaste | null> {
  try {
    const taste = await snapshotTaste();
    if (taste.sampled <= 0) return null;
    return taste;
  } catch {
    return null;
  }
}

async function resolveUnknownChunk(
  galleries: readonly TasteGalleryRow[],
  names: Map<number, DoujinTag>,
  skipped: Set<number>,
): Promise<boolean> {
  const named = new Set<number>([...names.keys(), ...skipped]);
  const unknown = nextUnresolvedIds(
    rankTagIdStats(galleries.map((row) => row.tagIds)),
    named,
  );
  if (unknown.length === 0) return false;
  const resolved = await fetchTagsByIds(unknown);
  await putNames(resolved);
  for (const tag of resolved) {
    if (tag.id == null) continue;
    names.set(tag.id, { id: tag.id, type: tag.type, name: tag.name });
  }
  for (const id of unknown) {
    if (!names.has(id)) skipped.add(id);
  }
  return true;
}

async function runTasteSync(): Promise<void> {
  let meta = await readMeta();
  let galleries = await readGalleries();
  const needsBackfill = catalogNeedsCardBackfill(galleries);
  const needsOrd = catalogNeedsOrdBackfill(galleries);
  const start = tasteSyncStartPage({
    complete: meta.complete,
    lastPage: meta.lastPage,
    needsBackfill,
    needsOrd,
  });
  const catchingUp = meta.complete && !needsBackfill && !needsOrd;
  if (start.resetProgress) {
    meta = { ...meta, lastPage: 0, complete: false };
  }
  const byId = new Map(galleries.map((row) => [row.id, row]));
  let names = await readNames();
  const known = new Set(byId.keys());
  const skipped = new Set<number>();
  let page = start.page;
  let nextOrd = page <= 1 ? 0 : maxFavoriteOrd(galleries) + 1;
  const seenThisRun = new Set<number>();
  const pruneOrphans = start.page === 1;
  let stoppedAtFront = false;

  status = {
    running: true,
    complete: false,
    phase: "favorites",
    page: 0,
    numPages: meta.numPages,
    galleries: galleries.length,
    total: meta.total,
    error: null,
  };
  emit(tasteFromLedger(galleries, names, meta.total, false));

  for (;;) {
    const list = await fetchFavorites(page);
    const ids = list.items.map((card) => card.id);
    if (list.items.length === 0) break;
    for (const id of ids) seenThisRun.add(id);

    meta = {
      id: META_ID,
      lastPage: page,
      numPages: Math.max(1, list.numPages || meta.numPages),
      total: list.total ?? meta.total,
      complete: false,
      at: Date.now(),
    };

    const cardsReady =
      pageIsFullyKnown(ids, known) && pageHasSortCards(ids, byId);
    if (
      catchingUp &&
      page === 1 &&
      cardsReady &&
      pageHasFavoriteOrds(ids, byId)
    ) {
      stoppedAtFront = true;
      break;
    }

    if (page === 1) nextOrd = 0;

    const stamped = applyFavoriteListOrds(
      list.items,
      nextOrd,
      byId,
      !cardsReady,
    );
    nextOrd = stamped.nextOrd;
    for (const row of stamped.rows) {
      byId.set(row.id, row);
      known.add(row.id);
    }
    await putGalleries(stamped.rows);
    galleries = [...byId.values()];
    await writeMeta(meta);

    status = {
      running: true,
      complete: false,
      phase: "favorites",
      page,
      numPages: meta.numPages,
      galleries: galleries.length,
      total: meta.total || galleries.length,
      error: null,
    };
    emit(tasteFromLedger(galleries, names, meta.total, false));

    if (page >= meta.numPages) break;
    page += 1;
    if (!cardsReady) await sleep(SYNC_PAGE_GAP_MS);
  }

  if (pruneOrphans && !stoppedAtFront && seenThisRun.size > 0) {
    for (const id of [...byId.keys()]) {
      if (seenThisRun.has(id)) continue;
      byId.delete(id);
      known.delete(id);
      await deleteGallery(id);
    }
    galleries = [...byId.values()];
  }

  let namePass = 0;
  while (await resolveUnknownChunk(galleries, names, skipped)) {
    namePass += 1;
    status = {
      running: true,
      complete: false,
      phase: "names",
      page: namePass,
      numPages: meta.numPages,
      galleries: galleries.length,
      total: meta.total || galleries.length,
      error: null,
    };
    emit(tasteFromLedger(galleries, names, meta.total, false));
    await sleep(SYNC_PAGE_GAP_MS);
  }

  meta = {
    ...meta,
    lastPage: Math.max(meta.lastPage, page),
    complete: true,
    at: Date.now(),
  };
  await writeMeta(meta);
  const taste = await snapshotTaste();
  status = {
    running: false,
    complete: true,
    phase: "idle",
    page: meta.lastPage,
    numPages: meta.numPages,
    galleries: taste.sampled,
    total: taste.total,
    error: null,
  };
  emit(taste);
}

export function startTasteSync(): Promise<void> {
  if (syncChain) return syncChain;
  status = { ...status, running: true, complete: false, phase: "favorites", error: null };
  emit(null);
  syncChain = runTasteSync()
    .catch((err) => {
      status = {
        ...status,
        running: false,
        phase: "idle",
        error: err instanceof Error ? err.message : "Синхронизация не удалась",
      };
      emit(null);
    })
    .finally(() => {
      syncChain = null;
    });
  return syncChain;
}

export async function ingestTasteGallery(
  id: number,
  tagIds: readonly number[],
  on: boolean,
  card?: DoujinCard,
): Promise<DoujinAccountTaste | null> {
  const [meta, galleries] = await Promise.all([readMeta(), readGalleries()]);
  const hadLedger =
    galleries.length > 0 || meta.complete || meta.lastPage > 0;
  if (!hadLedger) return null;
  if (on) {
    const prev = galleries.find((row) => row.id === id);
    const fromCard = card ? cardTagIds(card) : [];
    const ids = [
      ...new Set(
        [...tagIds, ...fromCard, ...(prev?.tagIds ?? [])].filter(
          (n) => Number.isInteger(n) && n > 0,
        ),
      ),
    ];
    if (ids.length === 0 && !card && !prev) {
      return snapshotTaste();
    }
    const ord =
      prev?.ord ??
      galleries.reduce((min, row) => Math.min(min, row.ord ?? 0), 0) - 1;
    await putGalleries([
      {
        id,
        tagIds: ids,
        card: card ? tasteCardStub(card) : prev?.card,
        ord,
      },
    ]);
  } else {
    await deleteGallery(id);
  }
  return snapshotTaste();
}
