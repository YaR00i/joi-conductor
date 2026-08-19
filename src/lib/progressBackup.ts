/**
 * Full progress backup / restore (move to another PC).
 *
 * Covers slot progress keys + parked live/sandbox + optional IndexedDB favorites.
 * Shared settings (Gelbooru keys, voice, roulette) are intentionally excluded —
 * reconfigure on the target machine or copy those keys separately.
 *
 * Transport: downloadable JSON + file import in Settings.
 * Electron userData path is not wired; browser download/upload works in Electron too.
 */

import type { MediaKind } from "./media";
import {
  clearAllFavorites,
  listFavoriteRecords,
  putFavoriteRecord,
  type FavoriteRecord,
} from "./mediaFavorites";
import {
  captureProgress,
  loadSaveSlotsMeta,
  PROGRESS_STORAGE_KEYS,
  restoreProgress,
  saveSaveSlotsMeta,
  type ProgressSnapshot,
  type SaveSlotId,
  type SaveSlotsMeta,
} from "./saveSlots";

export const PROGRESS_BACKUP_KIND = "joi-progress-backup" as const;
export const PROGRESS_BACKUP_VERSION = 1 as const;

/** Migration / patch flags that travel with progress but are not slot-swapped. */
export const PROGRESS_EXTRA_KEYS = [
  "joi-diary-ate-patch-v1",
  "joi-contracts-mig-media-drill-1",
] as const;

export type ProgressBackupFavorite = {
  id: string;
  kind: MediaKind;
  tags?: string;
  mime: string;
  fileName: string;
  remoteUrl?: string;
  gelbooruId?: string;
  savedAt: number;
  blobBase64: string;
};

export type ProgressBackupPayload = {
  kind: typeof PROGRESS_BACKUP_KIND;
  version: typeof PROGRESS_BACKUP_VERSION;
  exportedAt: string;
  activeSlot: SaveSlotId;
  /** Working (active) progress keys from localStorage. */
  progress: ProgressSnapshot;
  /** Non-slot progress-adjacent flags. */
  extras: Partial<Record<(typeof PROGRESS_EXTRA_KEYS)[number], string | null>>;
  /** Inactive slot snapshots from save-slot meta. */
  parked: Partial<Record<SaveSlotId, ProgressSnapshot>>;
  /**
   * Favorites blobs (base64). `null` = not included / skipped.
   * Empty array = included and intentionally empty.
   */
  favorites: ProgressBackupFavorite[] | null;
  favoritesNote?: string;
};

export type ProgressBackupParseResult =
  | { ok: true; data: ProgressBackupPayload }
  | { ok: false; error: string };

function isSaveSlotId(v: unknown): v is SaveSlotId {
  return v === "live" || v === "sandbox";
}

function isMediaKind(v: unknown): v is MediaKind {
  return v === "image" || v === "video" || v === "gif";
}

function normalizeProgressSnapshot(raw: unknown): ProgressSnapshot {
  const out: ProgressSnapshot = {};
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  for (const key of PROGRESS_STORAGE_KEYS) {
    const v = obj[key];
    if (v == null) {
      out[key] = null;
    } else if (typeof v === "string") {
      out[key] = v;
    }
  }
  return out;
}

function normalizeExtras(
  raw: unknown,
): ProgressBackupPayload["extras"] {
  const out: ProgressBackupPayload["extras"] = {};
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  for (const key of PROGRESS_EXTRA_KEYS) {
    const v = obj[key];
    if (v == null) out[key] = null;
    else if (typeof v === "string") out[key] = v;
  }
  return out;
}

function normalizeParked(
  raw: unknown,
): Partial<Record<SaveSlotId, ProgressSnapshot>> {
  const out: Partial<Record<SaveSlotId, ProgressSnapshot>> = {};
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  for (const id of ["live", "sandbox"] as const) {
    if (id in obj) out[id] = normalizeProgressSnapshot(obj[id]);
  }
  return out;
}

function normalizeFavorites(
  raw: unknown,
): { favorites: ProgressBackupFavorite[] | null; note?: string } {
  if (raw == null) return { favorites: null };
  if (!Array.isArray(raw)) {
    return { favorites: null, note: "favorites: invalid shape, skipped" };
  }
  const rows: ProgressBackupFavorite[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id.trim()) continue;
    if (!isMediaKind(r.kind)) continue;
    if (typeof r.mime !== "string" || typeof r.fileName !== "string") continue;
    if (typeof r.blobBase64 !== "string" || !r.blobBase64) continue;
    if (typeof r.savedAt !== "number" || !Number.isFinite(r.savedAt)) continue;
    rows.push({
      id: r.id,
      kind: r.kind,
      tags: typeof r.tags === "string" ? r.tags : undefined,
      mime: r.mime,
      fileName: r.fileName,
      remoteUrl: typeof r.remoteUrl === "string" ? r.remoteUrl : undefined,
      gelbooruId:
        typeof r.gelbooruId === "string" ? r.gelbooruId : undefined,
      savedAt: r.savedAt,
      blobBase64: r.blobBase64,
    });
  }
  return { favorites: rows };
}

/** Validate unknown JSON into a typed backup (or error). */
export function validateProgressBackup(
  data: unknown,
): ProgressBackupParseResult {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Ожидался объект JSON" };
  }
  const obj = data as Record<string, unknown>;
  if (obj.kind !== PROGRESS_BACKUP_KIND) {
    return {
      ok: false,
      error: `Неверный kind (нужен ${PROGRESS_BACKUP_KIND})`,
    };
  }
  if (obj.version !== PROGRESS_BACKUP_VERSION) {
    return {
      ok: false,
      error: `Неподдерживаемая версия бэкапа (${String(obj.version)})`,
    };
  }
  if (!isSaveSlotId(obj.activeSlot)) {
    return { ok: false, error: "Неверный activeSlot" };
  }
  if (typeof obj.exportedAt !== "string" || !obj.exportedAt) {
    return { ok: false, error: "Нет exportedAt" };
  }
  if (!obj.progress || typeof obj.progress !== "object") {
    return { ok: false, error: "Нет progress" };
  }

  const fav = normalizeFavorites(obj.favorites);
  const payload: ProgressBackupPayload = {
    kind: PROGRESS_BACKUP_KIND,
    version: PROGRESS_BACKUP_VERSION,
    exportedAt: obj.exportedAt,
    activeSlot: obj.activeSlot,
    progress: normalizeProgressSnapshot(obj.progress),
    extras: normalizeExtras(obj.extras),
    parked: normalizeParked(obj.parked),
    favorites: fav.favorites,
    favoritesNote:
      typeof obj.favoritesNote === "string"
        ? obj.favoritesNote
        : fav.note,
  };
  return { ok: true, data: payload };
}

export function serializeProgressBackup(
  payload: ProgressBackupPayload,
): string {
  return JSON.stringify(payload, null, 2);
}

export function parseProgressBackup(raw: string): ProgressBackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, error: "Невалидный JSON" };
  }
  return validateProgressBackup(parsed);
}

function captureExtras(): ProgressBackupPayload["extras"] {
  const extras: ProgressBackupPayload["extras"] = {};
  for (const key of PROGRESS_EXTRA_KEYS) {
    extras[key] = localStorage.getItem(key);
  }
  return extras;
}

function restoreExtras(extras: ProgressBackupPayload["extras"]): void {
  for (const key of PROGRESS_EXTRA_KEYS) {
    const value = extras[key];
    if (value == null || value === "") {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  }
}

export function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function favoriteRecordToBackup(
  r: FavoriteRecord,
): Promise<ProgressBackupFavorite> {
  const buf = new Uint8Array(await r.blob.arrayBuffer());
  return {
    id: r.id,
    kind: r.kind,
    tags: r.tags,
    mime: r.mime,
    fileName: r.fileName,
    remoteUrl: r.remoteUrl,
    gelbooruId: r.gelbooruId,
    savedAt: r.savedAt,
    blobBase64: uint8ToBase64(buf),
  };
}

function backupFavoriteToRecord(row: ProgressBackupFavorite): FavoriteRecord {
  const bytes = base64ToUint8(row.blobBase64);
  const blob = new Blob([bytes], { type: row.mime || "application/octet-stream" });
  return {
    id: row.id,
    kind: row.kind,
    tags: row.tags,
    mime: row.mime,
    fileName: row.fileName,
    remoteUrl: row.remoteUrl,
    gelbooruId: row.gelbooruId,
    blob,
    savedAt: row.savedAt,
  };
}

/**
 * Build a full backup payload from current localStorage (+ optional IDB favorites).
 */
export async function collectProgressBackup(opts?: {
  includeFavorites?: boolean;
}): Promise<ProgressBackupPayload> {
  const includeFavorites = opts?.includeFavorites !== false;
  const meta = loadSaveSlotsMeta();
  const progress = captureProgress();
  const parked = { ...meta.parked };
  parked[meta.active] = progress;

  let favorites: ProgressBackupFavorite[] | null = null;
  let favoritesNote: string | undefined;

  if (includeFavorites) {
    try {
      const rows = await listFavoriteRecords();
      favorites = await Promise.all(rows.map(favoriteRecordToBackup));
    } catch (err) {
      favorites = null;
      favoritesNote =
        err instanceof Error
          ? `Избранное не включено: ${err.message}`
          : "Избранное не включено (IndexedDB недоступен)";
    }
  } else {
    favoritesNote = "Избранное пропущено по запросу";
  }

  return {
    kind: PROGRESS_BACKUP_KIND,
    version: PROGRESS_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    activeSlot: meta.active,
    progress,
    extras: captureExtras(),
    parked,
    favorites,
    favoritesNote,
  };
}

/**
 * Replace progress keys + slot meta (+ extras). Does not touch voice / Gelbooru /
 * roulette / ephemeral UI. Favorites applied separately via applyFavoritesBackup.
 */
export function applyProgressBackupLocal(
  data: ProgressBackupPayload,
): SaveSlotsMeta {
  restoreProgress(data.progress);
  restoreExtras(data.extras);

  const parked = { ...data.parked };
  parked[data.activeSlot] = data.progress;

  const meta: SaveSlotsMeta = {
    version: 1,
    active: data.activeSlot,
    parked,
  };
  saveSaveSlotsMeta(meta);
  return meta;
}

/** Replace IndexedDB favorites from backup rows. No-op if favorites is null. */
export async function applyFavoritesBackup(
  favorites: ProgressBackupFavorite[] | null,
): Promise<{ applied: boolean; count: number }> {
  if (favorites == null) return { applied: false, count: 0 };
  await clearAllFavorites();
  for (const row of favorites) {
    await putFavoriteRecord(backupFavoriteToRecord(row));
  }
  return { applied: true, count: favorites.length };
}

/**
 * Full replace import: localStorage progress + optional favorites, then caller
 * should reload. Mode is always replace (confirm in UI).
 */
export async function applyProgressBackup(
  data: ProgressBackupPayload,
  opts?: { applyFavorites?: boolean },
): Promise<{ favoritesApplied: boolean; favoritesCount: number }> {
  applyProgressBackupLocal(data);
  const wantFav = opts?.applyFavorites !== false;
  if (wantFav && data.favorites != null) {
    const res = await applyFavoritesBackup(data.favorites);
    return {
      favoritesApplied: res.applied,
      favoritesCount: res.count,
    };
  }
  return { favoritesApplied: false, favoritesCount: 0 };
}

export function downloadProgressBackupJson(
  payload: ProgressBackupPayload,
): void {
  const blob = new Blob([serializeProgressBackup(payload)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = payload.exportedAt.replace(/[:.]/g, "-").slice(0, 19);
  a.href = url;
  a.download = `joi-progress-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readProgressBackupFile(
  file: File,
): Promise<ProgressBackupParseResult> {
  const text = await file.text();
  return parseProgressBackup(text);
}
