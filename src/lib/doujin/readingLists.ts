import { feedTakeCounts } from "../feedTake";
import { displayTitle, parseTags } from "./normalize";
import {
  addReadingListPlayStats,
  EMPTY_READING_LIST_PLAY_STATS,
  parseReadingListPlayStats,
  readingPlayStatsHasAny,
  type ReadingListPlayStats,
} from "./readingListPlayStats";
import type {
  DoujinCard,
  DoujinGallery,
  DoujinReadingList,
  DoujinReadingListItem,
  DoujinTitle,
} from "./types";

export const READING_LISTS_KEY = "joi-doujin-reading-lists-v1";
export const DEFAULT_READING_LIST_NAME = "К прочтению";
export const LIST_PAGE_PREVIEW_CAP = 48;
export const READING_LIST_NOTE_MAX = 4000;

export function newReadingListId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `list_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function pagePreviewUrls(card: DoujinCard): string[] {
  if (!isGallery(card)) return [];
  const out: string[] = [];
  for (const page of card.pages) {
    const url = page.previewUrl || page.url;
    if (!url) continue;
    out.push(url);
    if (out.length >= LIST_PAGE_PREVIEW_CAP) break;
  }
  return out;
}

function isGallery(card: DoujinCard): card is DoujinGallery {
  return "pages" in card && Array.isArray((card as DoujinGallery).pages);
}

export function cardToListItem(card: DoujinCard): DoujinReadingListItem {
  const previews = pagePreviewUrls(card);
  return {
    galleryId: card.id,
    addedAt: Date.now(),
    mediaId: card.mediaId,
    title: card.title,
    coverUrl: card.thumbnailUrl || card.coverUrl,
    numPages: card.numPages,
    language: card.language ?? card.languages?.[0],
    languages:
      card.languages && card.languages.length > 0
        ? [...card.languages]
        : card.language
          ? [card.language]
          : undefined,
    tags: card.tags,
    uploadedAt: card.uploadedAt,
    numFavorites: card.numFavorites,
    pagePreviews: previews.length > 0 ? previews : undefined,
  };
}

export function listItemToCard(item: DoujinReadingListItem): DoujinCard {
  return {
    id: item.galleryId,
    mediaId: item.mediaId,
    title: item.title,
    numPages: item.numPages,
    coverUrl: item.coverUrl,
    thumbnailUrl: item.coverUrl,
    tags: item.tags ?? [],
    language: item.language,
    languages: item.languages,
    uploadedAt: item.uploadedAt,
    numFavorites: item.numFavorites,
  };
}

export function listItemHasTags(item: DoujinReadingListItem): boolean {
  return (item.tags?.length ?? 0) > 0;
}

export function listItemNeedsEnrich(item: DoujinReadingListItem): boolean {
  return !listItemHasTags(item) || (item.pagePreviews?.length ?? 0) === 0;
}

export function moveListItem<T>(items: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }
  const next = items.slice();
  const [row] = next.splice(from, 1);
  if (row === undefined) return items;
  next.splice(to, 0, row);
  return next;
}

export function listedGalleryIds(lists: DoujinReadingList[]): Set<number> {
  const ids = new Set<number>();
  for (const list of lists) {
    for (const item of list.items) ids.add(item.galleryId);
  }
  return ids;
}

export function clipReadingListNote(raw: string): string {
  return raw.replace(/\r\n/g, "\n").slice(0, READING_LIST_NOTE_MAX);
}

export function readingFeedTakeCounts(remaining: number): number[] {
  return feedTakeCounts(remaining);
}

export function sliceDoujinFeedFrom(
  items: readonly DoujinCard[],
  startId: number,
  count: number,
): DoujinCard[] {
  const from = items.findIndex((card) => card.id === startId);
  if (from < 0) return [];
  const take = Math.max(1, Math.floor(count) || 1);
  return items.slice(from, from + take);
}

export function listItemLabel(item: DoujinReadingListItem): string {
  return displayTitle(item.title) || `#${item.galleryId}`;
}

function rec(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function parseTitle(raw: unknown): DoujinTitle {
  const o = rec(raw);
  if (!o) return { english: "", japanese: "", pretty: "" };
  return {
    english: str(o.english),
    japanese: str(o.japanese),
    pretty: str(o.pretty),
  };
}

function parseLanguageList(
  raw: unknown,
  fallback: string,
): string[] | undefined {
  const out: string[] = [];
  const seen = new Set<string>();
  const list = Array.isArray(raw) ? raw : [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const n = item.trim().toLowerCase();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  if (out.length === 0 && fallback) {
    const n = fallback.trim().toLowerCase();
    if (n) out.push(n);
  }
  return out.length > 0 ? out : undefined;
}

function parseUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && Boolean(v));
}

function parseItem(raw: unknown): DoujinReadingListItem | null {
  const o = rec(raw);
  if (!o) return null;
  const galleryId = num(o.galleryId);
  if (galleryId == null) return null;
  const pagePreviews = parseUrls(o.pagePreviews);
  return {
    galleryId,
    addedAt: num(o.addedAt) ?? 0,
    mediaId: str(o.mediaId),
    title: parseTitle(o.title),
    coverUrl: str(o.coverUrl),
    numPages: num(o.numPages) ?? 0,
    language: str(o.language) || undefined,
    languages: parseLanguageList(o.languages, str(o.language)),
    tags: parseTags(o.tags),
    uploadedAt: num(o.uploadedAt) ?? undefined,
    numFavorites: num(o.numFavorites) ?? undefined,
    pagePreviews: pagePreviews.length > 0 ? pagePreviews : undefined,
  };
}

function parseList(raw: unknown): DoujinReadingList | null {
  const o = rec(raw);
  if (!o) return null;
  const id = str(o.id);
  const name = str(o.name).trim();
  if (!id || !name) return null;
  const items = Array.isArray(o.items)
    ? o.items.map(parseItem).filter((item): item is DoujinReadingListItem => Boolean(item))
    : [];
  const originRaw = str(o.origin);
  const origin: DoujinReadingList["origin"] =
    originRaw === "mistress" ? "mistress" : "user";
  return {
    id,
    name,
    createdAt: num(o.createdAt) ?? 0,
    updatedAt: num(o.updatedAt) ?? 0,
    cursorIndex: Math.max(0, num(o.cursorIndex) ?? 0),
    items,
    origin,
    note: clipReadingListNote(str(o.note) || str(o.description)),
    playStats: parseReadingListPlayStats(o.playStats),
  };
}

export function parseReadingListsJson(raw: string | null): DoujinReadingList[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const lists = parsed
      .map(parseList)
      .filter((list): list is DoujinReadingList => Boolean(list));
    return lists;
  } catch {
    return [];
  }
}

function loadLists(): DoujinReadingList[] {
  try {
    return parseReadingListsJson(localStorage.getItem(READING_LISTS_KEY));
  } catch {
    return [];
  }
}

function saveLists(lists: DoujinReadingList[]): void {
  localStorage.setItem(READING_LISTS_KEY, JSON.stringify(lists));
}

function putList(list: DoujinReadingList): DoujinReadingList {
  const next: DoujinReadingList = { ...list, updatedAt: Date.now() };
  const lists = loadLists();
  const index = lists.findIndex((row) => row.id === next.id);
  if (index >= 0) {
    lists[index] = next;
  } else {
    lists.push(next);
  }
  saveLists(lists);
  return next;
}

export async function listReadingLists(): Promise<DoujinReadingList[]> {
  return loadLists();
}

export async function getReadingList(
  id: string,
): Promise<DoujinReadingList | undefined> {
  return loadLists().find((list) => list.id === id);
}

export function listOrigin(
  list: Pick<DoujinReadingList, "origin">,
): NonNullable<DoujinReadingList["origin"]> {
  return list.origin === "mistress" ? "mistress" : "user";
}

export function otherUserLists(
  lists: readonly DoujinReadingList[],
  exceptId: string,
): DoujinReadingList[] {
  return lists.filter(
    (list) => list.id !== exceptId && listOrigin(list) === "user",
  );
}

export async function createReadingList(
  name: string,
  opts?: {
    origin?: DoujinReadingList["origin"];
    items?: readonly DoujinCard[];
    note?: string;
  },
): Promise<DoujinReadingList> {
  const trimmed = name.trim() || DEFAULT_READING_LIST_NAME;
  const now = Date.now();
  const have = new Set<number>();
  const items: DoujinReadingListItem[] = [];
  for (const card of opts?.items ?? []) {
    if (have.has(card.id)) continue;
    have.add(card.id);
    items.push(cardToListItem(card));
  }
  return putList({
    id: newReadingListId(),
    name: trimmed,
    createdAt: now,
    updatedAt: now,
    cursorIndex: 0,
    items,
    origin: opts?.origin === "mistress" ? "mistress" : "user",
    note: clipReadingListNote(opts?.note ?? ""),
    playStats: EMPTY_READING_LIST_PLAY_STATS,
  });
}

export async function bumpReadingListPlayStats(
  listId: string,
  delta: ReadingListPlayStats,
): Promise<DoujinReadingList | undefined> {
  const existing = await getReadingList(listId);
  if (!existing) return undefined;
  if (!readingPlayStatsHasAny(delta)) return existing;
  return putList({
    ...existing,
    playStats: addReadingListPlayStats(existing.playStats, delta),
  });
}

export async function setReadingListNote(
  id: string,
  note: string,
): Promise<DoujinReadingList | undefined> {
  const existing = await getReadingList(id);
  if (!existing) return undefined;
  return putList({ ...existing, note: clipReadingListNote(note) });
}

export async function renameReadingList(
  id: string,
  name: string,
): Promise<DoujinReadingList | undefined> {
  const existing = await getReadingList(id);
  if (!existing) return undefined;
  const trimmed = name.trim();
  if (!trimmed) return existing;
  return putList({ ...existing, name: trimmed });
}

export async function deleteReadingList(id: string): Promise<void> {
  saveLists(loadLists().filter((list) => list.id !== id));
}

export async function setReadingListCursor(
  id: string,
  cursorIndex: number,
): Promise<void> {
  const existing = await getReadingList(id);
  if (!existing) return;
  const max = Math.max(0, existing.items.length - 1);
  putList({
    ...existing,
    cursorIndex: Math.min(max, Math.max(0, cursorIndex)),
  });
}

export async function addManyToReadingList(
  listId: string,
  cards: readonly DoujinCard[],
): Promise<DoujinReadingList | undefined> {
  const existing = await getReadingList(listId);
  if (!existing) return undefined;
  const have = new Set(existing.items.map((item) => item.galleryId));
  const extra: DoujinReadingListItem[] = [];
  for (const card of cards) {
    if (have.has(card.id)) continue;
    have.add(card.id);
    extra.push(cardToListItem(card));
  }
  if (extra.length === 0) return existing;
  return putList({ ...existing, items: [...existing.items, ...extra] });
}

export async function addToReadingList(
  listId: string,
  card: DoujinCard,
): Promise<DoujinReadingList | undefined> {
  const existing = await getReadingList(listId);
  if (!existing) return undefined;
  if (existing.items.some((item) => item.galleryId === card.id)) {
    return existing;
  }
  return putList({
    ...existing,
    items: [...existing.items, cardToListItem(card)],
  });
}

export async function refreshReadingListItem(
  listId: string,
  card: DoujinCard,
): Promise<DoujinReadingList | undefined> {
  const existing = await getReadingList(listId);
  if (!existing) return undefined;
  const index = existing.items.findIndex((item) => item.galleryId === card.id);
  if (index < 0) return existing;
  const prev = existing.items[index];
  if (!prev) return existing;
  const next = existing.items.slice();
  next[index] = { ...cardToListItem(card), addedAt: prev.addedAt };
  return putList({ ...existing, items: next });
}

export async function removeFromReadingList(
  listId: string,
  galleryId: number,
): Promise<DoujinReadingList | undefined> {
  const existing = await getReadingList(listId);
  if (!existing) return undefined;
  const items = existing.items.filter((item) => item.galleryId !== galleryId);
  const cursorIndex = Math.min(
    existing.cursorIndex,
    Math.max(0, items.length - 1),
  );
  return putList({ ...existing, items, cursorIndex });
}

export async function toggleInReadingList(
  listId: string,
  card: DoujinCard,
): Promise<DoujinReadingList | undefined> {
  const existing = await getReadingList(listId);
  if (!existing) return undefined;
  const inList = existing.items.some((item) => item.galleryId === card.id);
  if (inList) return removeFromReadingList(listId, card.id);
  return addToReadingList(listId, card);
}

export async function moveInReadingList(
  listId: string,
  from: number,
  to: number,
): Promise<DoujinReadingList | undefined> {
  const existing = await getReadingList(listId);
  if (!existing) return undefined;
  return putList({
    ...existing,
    items: moveListItem(existing.items, from, to),
  });
}

export async function ensureDefaultReadingList(): Promise<DoujinReadingList> {
  const lists = await listReadingLists();
  if (lists[0]) return lists[0];
  return createReadingList(DEFAULT_READING_LIST_NAME);
}

export function listResumeIndex(list: DoujinReadingList): number {
  if (list.items.length === 0) return 0;
  return Math.min(Math.max(0, list.cursorIndex), list.items.length - 1);
}

export function listCanResume(
  list: DoujinReadingList,
  pageById: Readonly<Record<number, number>> = {},
): boolean {
  if (list.items.length === 0) return false;
  if (list.cursorIndex > 0) return true;
  const item = list.items[0];
  if (!item) return false;
  const page = pageById[item.galleryId] ?? 0;
  const last = Math.max(1, item.numPages) - 1;
  return page > 0 && page < last;
}
