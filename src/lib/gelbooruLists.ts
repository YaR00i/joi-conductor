import { moveListItem, newReadingListId } from "./doujin/readingLists";
import { feedTakeCounts } from "./feedTake";
import {
  masonryPreviewSrc,
  type MediaItem,
  type MediaKind,
  type MediaSourceKind,
} from "./media";

export const GELBOORU_LISTS_KEY = "joi-gelbooru-lists-v1";
export const DEFAULT_GELBOORU_LIST_NAME = "К просмотру";
export const GELBOORU_LIST_NOTE_MAX = 4000;

export type GelbooruListOrigin = "user" | "mistress";

export type GelbooruListItem = MediaItem & { addedAt: number };

export type GelbooruPlayList = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  cursorIndex: number;
  origin: GelbooruListOrigin;
  /** User text + auto-queue pull log. */
  note: string;
  items: GelbooruListItem[];
};

export function itemToGelbooruListItem(
  item: MediaItem,
  addedAt = Date.now(),
): GelbooruListItem | null {
  const url = item.url?.trim();
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) return null;
  const kind: MediaKind =
    item.kind === "video" || item.kind === "gif" ? item.kind : "image";
  const source: MediaSourceKind = "gelbooru";
  const gid = item.gelbooruId?.trim() || undefined;
  return {
    id: gid ? `gb-${gid}` : item.id,
    url,
    previewUrl: item.previewUrl,
    sampleUrl: item.sampleUrl,
    kind,
    source,
    tags: item.tags,
    gelbooruId: gid,
    addedAt,
  };
}

export function gelbooruListItemLabel(item: GelbooruListItem): string {
  const tags = (item.tags ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  if (tags.length > 0) return tags.join(" ");
  if (item.gelbooruId) return `#${item.gelbooruId}`;
  return item.id;
}

export function gelbooruListDeckUrls(items: GelbooruListItem[]): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const src = masonryPreviewSrc(item);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    urls.push(src);
    if (urls.length >= 8) break;
  }
  return urls;
}

export type GelbooruListOption = {
  id: string;
  name: string;
  count: number;
  previewUrls: string[];
};

export function gelbooruListOption(list: GelbooruPlayList): GelbooruListOption {
  return {
    id: list.id,
    name: list.name,
    count: list.items.length,
    previewUrls: gelbooruListDeckUrls(list.items),
  };
}

export function listedGelbooruIds(lists: GelbooruPlayList[]): Set<string> {
  const ids = new Set<string>();
  for (const list of lists) {
    for (const item of list.items) {
      ids.add(item.id);
      if (item.gelbooruId) ids.add(`gb-${item.gelbooruId}`);
    }
  }
  return ids;
}

export function gelbooruListOrigin(
  list: Pick<GelbooruPlayList, "origin">,
): GelbooruListOrigin {
  return list.origin === "mistress" ? "mistress" : "user";
}

export function otherUserGelbooruLists(
  lists: readonly GelbooruPlayList[],
  exceptId: string,
): GelbooruListOption[] {
  return lists
    .filter((list) => list.id !== exceptId && gelbooruListOrigin(list) === "user")
    .map((list) => gelbooruListOption(list));
}

export function gelbooruListResumeIndex(list: GelbooruPlayList): number {
  if (list.items.length === 0) return 0;
  return Math.min(Math.max(0, list.cursorIndex), list.items.length - 1);
}

export function gelbooruListCanResume(list: GelbooruPlayList): boolean {
  return list.items.length > 0 && list.cursorIndex > 0;
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

export function clipGelbooruListNote(raw: string): string {
  return raw.replace(/\r\n/g, "\n").slice(0, GELBOORU_LIST_NOTE_MAX);
}

function parseKind(raw: unknown): MediaKind {
  if (raw === "video" || raw === "gif") return raw;
  return "image";
}

function parseItem(raw: unknown): GelbooruListItem | null {
  const o = rec(raw);
  if (!o) return null;
  const id = str(o.id).trim();
  const url = str(o.url).trim();
  if (!id || !url) return null;
  const previewUrl = str(o.previewUrl).trim() || undefined;
  const sampleUrl = str(o.sampleUrl).trim() || undefined;
  const tags = str(o.tags).trim() || undefined;
  const gelbooruId = str(o.gelbooruId).trim() || undefined;
  return {
    id: gelbooruId ? `gb-${gelbooruId}` : id,
    url,
    previewUrl,
    sampleUrl,
    kind: parseKind(o.kind),
    source: "gelbooru",
    tags,
    gelbooruId,
    addedAt: num(o.addedAt) ?? 0,
  };
}

function parseList(raw: unknown): GelbooruPlayList | null {
  const o = rec(raw);
  if (!o) return null;
  const id = str(o.id);
  const name = str(o.name).trim();
  if (!id || !name) return null;
  const items = Array.isArray(o.items)
    ? o.items
        .map(parseItem)
        .filter((item): item is GelbooruListItem => Boolean(item))
    : [];
  return {
    id,
    name,
    createdAt: num(o.createdAt) ?? 0,
    updatedAt: num(o.updatedAt) ?? 0,
    cursorIndex: Math.max(0, num(o.cursorIndex) ?? 0),
    origin: str(o.origin) === "mistress" ? "mistress" : "user",
    note: clipGelbooruListNote(str(o.note) || str(o.description)),
    items,
  };
}

export function parseGelbooruListsJson(raw: string | null): GelbooruPlayList[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseList)
      .filter((list): list is GelbooruPlayList => Boolean(list));
  } catch {
    return [];
  }
}

function loadLists(): GelbooruPlayList[] {
  try {
    return parseGelbooruListsJson(localStorage.getItem(GELBOORU_LISTS_KEY));
  } catch {
    return [];
  }
}

function saveLists(lists: GelbooruPlayList[]): void {
  localStorage.setItem(GELBOORU_LISTS_KEY, JSON.stringify(lists));
}

function putList(list: GelbooruPlayList): GelbooruPlayList {
  const next: GelbooruPlayList = { ...list, updatedAt: Date.now() };
  const lists = loadLists();
  const index = lists.findIndex((row) => row.id === next.id);
  if (index >= 0) lists[index] = next;
  else lists.push(next);
  saveLists(lists);
  return next;
}

export async function listGelbooruLists(): Promise<GelbooruPlayList[]> {
  return loadLists();
}

export async function getGelbooruList(
  id: string,
): Promise<GelbooruPlayList | undefined> {
  return loadLists().find((row) => row.id === id);
}

export async function createGelbooruList(
  name: string,
  opts?: { origin?: GelbooruListOrigin; items?: GelbooruListItem[]; note?: string },
): Promise<GelbooruPlayList> {
  const trimmed = name.trim() || DEFAULT_GELBOORU_LIST_NAME;
  const now = Date.now();
  return putList({
    id: newReadingListId(),
    name: trimmed,
    createdAt: now,
    updatedAt: now,
    cursorIndex: 0,
    origin: opts?.origin === "mistress" ? "mistress" : "user",
    note: clipGelbooruListNote(opts?.note ?? ""),
    items: opts?.items ?? [],
  });
}

export async function setGelbooruListNote(
  id: string,
  note: string,
): Promise<GelbooruPlayList | undefined> {
  const existing = await getGelbooruList(id);
  if (!existing) return undefined;
  return putList({ ...existing, note: clipGelbooruListNote(note) });
}

export async function renameGelbooruList(
  id: string,
  name: string,
): Promise<GelbooruPlayList | undefined> {
  const existing = await getGelbooruList(id);
  if (!existing) return undefined;
  const trimmed = name.trim();
  if (!trimmed) return existing;
  return putList({ ...existing, name: trimmed });
}

export async function deleteGelbooruList(id: string): Promise<void> {
  saveLists(loadLists().filter((list) => list.id !== id));
}

export async function setGelbooruListCursor(
  id: string,
  cursorIndex: number,
): Promise<void> {
  const existing = await getGelbooruList(id);
  if (!existing) return;
  const max = Math.max(0, existing.items.length - 1);
  putList({
    ...existing,
    cursorIndex: Math.min(max, Math.max(0, cursorIndex)),
  });
}

export async function addToGelbooruList(
  listId: string,
  item: MediaItem,
): Promise<GelbooruPlayList | undefined> {
  const existing = await getGelbooruList(listId);
  if (!existing) return undefined;
  const row = itemToGelbooruListItem(item);
  if (!row) return existing;
  if (existing.items.some((entry) => entry.id === row.id)) return existing;
  return putList({ ...existing, items: [...existing.items, row] });
}

export async function addManyToGelbooruList(
  listId: string,
  items: readonly MediaItem[],
): Promise<GelbooruPlayList | undefined> {
  const existing = await getGelbooruList(listId);
  if (!existing) return undefined;
  const have = new Set(existing.items.map((row) => row.id));
  const extra: GelbooruListItem[] = [];
  for (const item of items) {
    const row = itemToGelbooruListItem(item);
    if (!row || have.has(row.id)) continue;
    have.add(row.id);
    extra.push(row);
  }
  if (extra.length === 0) return existing;
  return putList({ ...existing, items: [...existing.items, ...extra] });
}

export async function removeFromGelbooruList(
  listId: string,
  itemId: string,
): Promise<GelbooruPlayList | undefined> {
  const existing = await getGelbooruList(listId);
  if (!existing) return undefined;
  const items = existing.items.filter((row) => row.id !== itemId);
  const cursorIndex = Math.min(
    existing.cursorIndex,
    Math.max(0, items.length - 1),
  );
  return putList({ ...existing, items, cursorIndex });
}

export async function toggleInGelbooruList(
  listId: string,
  item: MediaItem,
): Promise<GelbooruPlayList | undefined> {
  const existing = await getGelbooruList(listId);
  if (!existing) return undefined;
  const row = itemToGelbooruListItem(item);
  if (!row) return existing;
  if (existing.items.some((entry) => entry.id === row.id)) {
    return removeFromGelbooruList(listId, row.id);
  }
  return addToGelbooruList(listId, item);
}

export async function moveInGelbooruList(
  listId: string,
  from: number,
  to: number,
): Promise<GelbooruPlayList | undefined> {
  const existing = await getGelbooruList(listId);
  if (!existing) return undefined;
  return putList({
    ...existing,
    items: moveListItem(existing.items, from, to),
  });
}

export function gelbooruItemOnShelf(
  item: Pick<GelbooruListItem, "id" | "gelbooruId">,
  savedIds: ReadonlySet<string>,
): boolean {
  if (savedIds.has(item.id)) return true;
  const gid = item.gelbooruId?.trim();
  if (!gid) return false;
  return savedIds.has(gid) || savedIds.has(`gb-${gid}`);
}

export function gelbooruListUnsavedItems(
  list: Pick<GelbooruPlayList, "items">,
  savedIds: ReadonlySet<string>,
  busyIds?: ReadonlySet<string>,
): GelbooruListItem[] {
  return list.items.filter(
    (item) => !gelbooruItemOnShelf(item, savedIds) && !busyIds?.has(item.id),
  );
}

export function gelbooruFeedItemIndex(
  items: readonly Pick<MediaItem, "id" | "gelbooruId">[],
  startId: string,
): number {
  const needle = startId.trim();
  if (!needle) return -1;
  return items.findIndex((item) => {
    if (item.id === needle) return true;
    const gid = item.gelbooruId?.trim();
    if (!gid) return false;
    return needle === gid || needle === `gb-${gid}`;
  });
}

/** How many posts the drum may take from a found feed, including the remainder. */
export function gelbooruFeedTakeCounts(remaining: number): number[] {
  return feedTakeCounts(remaining);
}

/** Inclusive slice from the clicked post through the loaded found feed. */
export function sliceGelbooruFeedFrom(
  items: readonly MediaItem[],
  startId: string,
  count: number,
): MediaItem[] {
  const from = gelbooruFeedItemIndex(items, startId);
  if (from < 0) return [];
  const take = Math.max(1, Math.floor(count) || 1);
  return items.slice(from, from + take);
}

export function mergeUniqueMedia(
  existing: readonly MediaItem[],
  extra: readonly MediaItem[],
  cap: number,
): MediaItem[] {
  const out: MediaItem[] = [];
  const have = new Set<string>();
  for (const item of [...existing, ...extra]) {
    if (have.has(item.id)) continue;
    have.add(item.id);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}
