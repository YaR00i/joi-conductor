import { reportPersistFailure } from "../persistFailure";
import { moveListItem, newReadingListId } from "../doujin/readingLists";
import {
  addReadingListPlayStats,
  EMPTY_READING_LIST_PLAY_STATS,
  parseReadingListPlayStats,
  readingPlayStatsHasAny,
  type ReadingListPlayStats,
} from "../doujin/readingListPlayStats";
import { JOIDB_LISTS_KEY, joidbMediaId, parseJoidbMediaId } from "./origin";
import type { JoidbVideo } from "./parseCatalog";

export const DEFAULT_JOIDB_LIST_NAME = "К просмотру";
export const JOIDB_LIST_NOTE_MAX = 4000;

export type JoidbListOrigin = "user" | "mistress";

export type JoidbListItem = JoidbVideo & { addedAt: number };

export type JoidbPlayList = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  cursorIndex: number;
  origin: JoidbListOrigin;
  note: string;
  items: JoidbListItem[];
  playStats?: ReadingListPlayStats;
};

export function videoToJoidbListItem(
  video: JoidbVideo,
  addedAt = Date.now(),
): JoidbListItem | null {
  const hex = parseJoidbMediaId(video.mediaId) ?? video.id;
  if (!hex) return null;
  return {
    ...video,
    id: hex.toLowerCase(),
    mediaId: joidbMediaId(hex),
    addedAt,
  };
}

export function joidbListItemLabel(item: JoidbListItem): string {
  return item.title.trim() || item.id;
}

export function joidbListDeckUrls(items: readonly JoidbListItem[]): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const src = item.thumbnail.trim();
    if (!src || seen.has(src)) continue;
    seen.add(src);
    urls.push(src);
    if (urls.length >= 8) break;
  }
  return urls;
}

export type JoidbListOption = {
  id: string;
  name: string;
  count: number;
  previewUrls: string[];
};

export function joidbListOption(list: JoidbPlayList): JoidbListOption {
  return {
    id: list.id,
    name: list.name,
    count: list.items.length,
    previewUrls: joidbListDeckUrls(list.items),
  };
}

export function listedJoidbIds(lists: readonly JoidbPlayList[]): Set<string> {
  const ids = new Set<string>();
  for (const list of lists) {
    for (const item of list.items) {
      ids.add(item.mediaId);
      ids.add(item.id);
    }
  }
  return ids;
}

export function joidbListOrigin(
  list: Pick<JoidbPlayList, "origin">,
): JoidbListOrigin {
  return list.origin === "mistress" ? "mistress" : "user";
}

export function otherUserJoidbLists(
  lists: readonly JoidbPlayList[],
  exceptId: string,
): JoidbListOption[] {
  return lists
    .filter((list) => list.id !== exceptId && joidbListOrigin(list) === "user")
    .map((list) => joidbListOption(list));
}

export function joidbListResumeIndex(list: JoidbPlayList): number {
  if (list.items.length === 0) return 0;
  return Math.min(Math.max(0, list.cursorIndex), list.items.length - 1);
}

export function joidbListCanResume(list: JoidbPlayList): boolean {
  return list.items.length > 0 && list.cursorIndex > 0;
}

export function clipJoidbListNote(raw: string): string {
  return raw.replace(/\r\n/g, "\n").slice(0, JOIDB_LIST_NOTE_MAX);
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

function parseItem(raw: unknown): JoidbListItem | null {
  const o = rec(raw);
  if (!o) return null;
  const hex = (parseJoidbMediaId(str(o.mediaId)) ?? str(o.id)).toLowerCase();
  if (!hex) return null;
  const title = str(o.title).trim() || hex;
  const thumbnail = str(o.thumbnail).trim();
  const duration = str(o.duration);
  return {
    id: hex,
    mediaId: joidbMediaId(hex),
    title,
    duration,
    durationSec: num(o.durationSec) ?? 0,
    thumbnail,
    exclusive: o.exclusive === true,
    creator: str(o.creator) || undefined,
    addedAt: num(o.addedAt) ?? 0,
  };
}

function parseList(raw: unknown): JoidbPlayList | null {
  const o = rec(raw);
  if (!o) return null;
  const id = str(o.id);
  const name = str(o.name).trim();
  if (!id || !name) return null;
  const items = Array.isArray(o.items)
    ? o.items.map(parseItem).filter((row): row is JoidbListItem => Boolean(row))
    : [];
  return {
    id,
    name,
    createdAt: num(o.createdAt) ?? 0,
    updatedAt: num(o.updatedAt) ?? 0,
    cursorIndex: Math.max(0, num(o.cursorIndex) ?? 0),
    origin: str(o.origin) === "mistress" ? "mistress" : "user",
    note: clipJoidbListNote(str(o.note)),
    items,
    playStats: parseReadingListPlayStats(o.playStats),
  };
}

export function parseJoidbListsJson(raw: string | null): JoidbPlayList[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseList)
      .filter((list): list is JoidbPlayList => Boolean(list));
  } catch {
    return [];
  }
}

function loadLists(): JoidbPlayList[] {
  try {
    return parseJoidbListsJson(localStorage.getItem(JOIDB_LISTS_KEY));
  } catch {
    return [];
  }
}

function saveLists(lists: JoidbPlayList[]): void {
  try {
    localStorage.setItem(JOIDB_LISTS_KEY, JSON.stringify(lists));
  } catch {
    reportPersistFailure("списки joidb");
  }
}

function putList(list: JoidbPlayList): JoidbPlayList {
  const next: JoidbPlayList = { ...list, updatedAt: Date.now() };
  const lists = loadLists();
  const index = lists.findIndex((row) => row.id === next.id);
  if (index >= 0) lists[index] = next;
  else lists.push(next);
  saveLists(lists);
  return next;
}

export async function listJoidbLists(): Promise<JoidbPlayList[]> {
  return loadLists();
}

export async function getJoidbList(
  id: string,
): Promise<JoidbPlayList | undefined> {
  return loadLists().find((row) => row.id === id);
}

export async function createJoidbList(
  name: string,
  opts?: { origin?: JoidbListOrigin; items?: JoidbListItem[]; note?: string },
): Promise<JoidbPlayList> {
  const trimmed = name.trim() || DEFAULT_JOIDB_LIST_NAME;
  const now = Date.now();
  return putList({
    id: newReadingListId(),
    name: trimmed,
    createdAt: now,
    updatedAt: now,
    cursorIndex: 0,
    origin: opts?.origin === "mistress" ? "mistress" : "user",
    note: clipJoidbListNote(opts?.note ?? ""),
    items: opts?.items ?? [],
    playStats: EMPTY_READING_LIST_PLAY_STATS,
  });
}

export async function bumpJoidbListPlayStats(
  listId: string,
  delta: ReadingListPlayStats,
): Promise<JoidbPlayList | undefined> {
  const existing = await getJoidbList(listId);
  if (!existing) return undefined;
  if (!readingPlayStatsHasAny(delta)) return existing;
  return putList({
    ...existing,
    playStats: addReadingListPlayStats(existing.playStats, delta),
  });
}

export async function addToJoidbList(
  listId: string,
  video: JoidbVideo,
): Promise<JoidbPlayList | undefined> {
  const existing = await getJoidbList(listId);
  if (!existing) return undefined;
  const row = videoToJoidbListItem(video);
  if (!row) return existing;
  if (existing.items.some((entry) => entry.id === row.id)) return existing;
  return putList({ ...existing, items: [...existing.items, row] });
}

export async function removeFromJoidbList(
  listId: string,
  itemId: string,
): Promise<JoidbPlayList | undefined> {
  const existing = await getJoidbList(listId);
  if (!existing) return undefined;
  const items = existing.items.filter(
    (row) => row.id !== itemId && row.mediaId !== itemId,
  );
  const cursorIndex = Math.min(
    existing.cursorIndex,
    Math.max(0, items.length - 1),
  );
  return putList({ ...existing, items, cursorIndex });
}

export async function toggleInJoidbList(
  listId: string,
  video: JoidbVideo,
): Promise<JoidbPlayList | undefined> {
  const existing = await getJoidbList(listId);
  if (!existing) return undefined;
  const row = videoToJoidbListItem(video);
  if (!row) return existing;
  if (existing.items.some((entry) => entry.id === row.id)) {
    return removeFromJoidbList(listId, row.id);
  }
  return addToJoidbList(listId, video);
}

export async function moveInJoidbList(
  listId: string,
  from: number,
  to: number,
): Promise<JoidbPlayList | undefined> {
  const existing = await getJoidbList(listId);
  if (!existing) return undefined;
  return putList({ ...existing, items: moveListItem(existing.items, from, to) });
}

export async function renameJoidbList(
  listId: string,
  name: string,
): Promise<JoidbPlayList | undefined> {
  const existing = await getJoidbList(listId);
  if (!existing) return undefined;
  const trimmed = name.trim();
  if (!trimmed) return existing;
  return putList({ ...existing, name: trimmed });
}

export async function setJoidbListNote(
  listId: string,
  note: string,
): Promise<JoidbPlayList | undefined> {
  const existing = await getJoidbList(listId);
  if (!existing) return undefined;
  return putList({ ...existing, note: clipJoidbListNote(note) });
}

export async function setJoidbListCursor(
  listId: string,
  index: number,
): Promise<JoidbPlayList | undefined> {
  const existing = await getJoidbList(listId);
  if (!existing) return undefined;
  const cursorIndex = Math.min(
    Math.max(0, index),
    Math.max(0, existing.items.length - 1),
  );
  return putList({ ...existing, cursorIndex });
}

export async function deleteJoidbList(listId: string): Promise<void> {
  saveLists(loadLists().filter((row) => row.id !== listId));
}
