/**
 * Explore progress saves: pack + slot, localStorage (play) or a JSON folder (CLI).
 * No cloud. Empty slot = do not apply; start inventory stays whatever play/sim uses.
 */
import { reportPersistFailure } from "../../lib/persistFailure";
import { compactEquipment, type EmberEquipment } from "./emberEquipment";
import { compactInventory } from "./emberItem";
import { parseFlagValue } from "./emberScript";
import type { EmberFlagValue } from "./types";

export const EMBER_SAVE_VERSION = 1 as const;
export const EMBER_SAVE_SLOT_MIN = 0;
export const EMBER_SAVE_SLOT_MAX = 9;
export const EMBER_SAVE_DEFAULT_SLOT = 0;
export const DEFAULT_EMBER_PACK_ID = "ember_p1";
export const EMBER_SAVE_KEY_PREFIX = "ember-save-v1";

export const EMBER_EXPLORE_AUTOSAVE_REASONS = [
  "map_change",
  "chest",
  "shop",
  "quit",
] as const;

export type EmberExploreAutosaveReason =
  (typeof EMBER_EXPLORE_AUTOSAVE_REASONS)[number];

export type EmberExploreSaveTile = {
  tx: number;
  ty: number;
};

export type EmberExploreSaveState = {
  version: typeof EMBER_SAVE_VERSION;
  packId: string;
  slot: number;
  savedAtMs: number;
  mapId: string;
  tile: EmberExploreSaveTile;
  x?: number;
  y?: number;
  elev?: number;
  inventory: Record<string, number>;
  equipment: EmberEquipment;
  openedChests: string[];
  shopStock: Record<string, Record<string, number>>;
  flags: Record<string, EmberFlagValue>;
  hp?: number;
  maxHp?: number;
};

export type EmberExploreSaveSource = {
  mapId: string;
  x: number;
  y: number;
  elev: number;
  tile: EmberExploreSaveTile;
  inventory: Record<string, number>;
  equipment: EmberEquipment;
  openedChests: readonly string[];
  shopStock: Record<string, Record<string, number>>;
  flags: Record<string, EmberFlagValue>;
};

export type EmberExploreSaveSlotInfo = {
  slot: number;
  empty: boolean;
  mapId: string | null;
  tile: EmberExploreSaveTile | null;
  savedAtMs: number | null;
};

export type EmberSaveBackend = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
};

export type CaptureExploreSaveOpts = {
  packId: string;
  slot: number;
  source: EmberExploreSaveSource;
  savedAtMs?: number;
  hp?: number;
  maxHp?: number;
};

export function isEmberExploreAutosaveReason(
  value: unknown,
): value is EmberExploreAutosaveReason {
  return (
    typeof value === "string" &&
    (EMBER_EXPLORE_AUTOSAVE_REASONS as readonly string[]).includes(value)
  );
}

export function clampExploreSaveSlot(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  if (raw < EMBER_SAVE_SLOT_MIN || raw > EMBER_SAVE_SLOT_MAX) return null;
  return raw;
}

export function parseExploreSaveSlot(raw: unknown): number | null {
  if (typeof raw === "number") return clampExploreSaveSlot(raw);
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    if (!Number.isInteger(n)) return null;
    return clampExploreSaveSlot(n);
  }
  return null;
}

export function exploreSaveKey(packId: string, slot: number): string {
  return `${EMBER_SAVE_KEY_PREFIX}:${packId}:${slot}`;
}

export function exploreActiveSlotKey(packId: string): string {
  return `${EMBER_SAVE_KEY_PREFIX}:active:${packId}`;
}

export function createMemorySaveBackend(
  seed?: Record<string, string>,
): EmberSaveBackend {
  const store = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
    keys() {
      return [...store.keys()];
    },
  };
}

export function createLocalStorageSaveBackend(): EmberSaveBackend {
  return {
    getItem(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        reportPersistFailure("автосейв Ember");
      }
    },
    removeItem(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
    keys() {
      const out: string[] = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) out.push(key);
        }
      } catch {
        return out;
      }
      return out;
    },
  };
}

function optionalFinite(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function parseTile(raw: unknown): EmberExploreSaveTile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const tx = rec.tx;
  const ty = rec.ty;
  if (typeof tx !== "number" || !Number.isFinite(tx)) return null;
  if (typeof ty !== "number" || !Number.isFinite(ty)) return null;
  return { tx: Math.trunc(tx), ty: Math.trunc(ty) };
}

function parseCountMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return compactInventory(raw as Record<string, number>) ?? {};
}

/** Unlike inventory, finite shop stock must retain an explicit sold-out zero. */
function parseStockCountMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const next: Record<string, number> = {};
  for (const [itemId, count] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!itemId.trim() || typeof count !== "number" || !Number.isFinite(count)) {
      continue;
    }
    next[itemId] = Math.max(0, Math.round(count));
  }
  return next;
}

function parseShopStock(raw: unknown): Record<string, Record<string, number>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const next: Record<string, Record<string, number>> = {};
  for (const [shopId, stock] of Object.entries(raw as Record<string, unknown>)) {
    if (!shopId.trim()) continue;
    next[shopId] = parseStockCountMap(stock);
  }
  return next;
}

function parseFlags(raw: unknown): Record<string, EmberFlagValue> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const next: Record<string, EmberFlagValue> = {};
  for (const [flag, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!flag.trim()) continue;
    const parsed = parseFlagValue(value);
    if (parsed != null) next[flag] = parsed;
  }
  return next;
}

function parseOpenedChests(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const key = item.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function parseEquipment(raw: unknown): EmberEquipment {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return compactEquipment(undefined);
  }
  return compactEquipment(raw as Partial<EmberEquipment>);
}

export function parseExploreSave(raw: unknown): EmberExploreSaveState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (rec.version !== EMBER_SAVE_VERSION) return null;
  const packId = typeof rec.packId === "string" ? rec.packId.trim() : "";
  if (!packId) return null;
  const slot = clampExploreSaveSlot(rec.slot);
  if (slot == null) return null;
  const mapId = typeof rec.mapId === "string" ? rec.mapId.trim() : "";
  if (!mapId) return null;
  const tile = parseTile(rec.tile);
  if (!tile) return null;
  const x = optionalFinite(rec.x);
  const y = optionalFinite(rec.y);
  const elev = optionalFinite(rec.elev);
  const savedAtMs = optionalFinite(rec.savedAtMs) ?? 0;
  const hp = optionalFinite(rec.hp);
  const maxHp = optionalFinite(rec.maxHp);
  return {
    version: EMBER_SAVE_VERSION,
    packId,
    slot,
    savedAtMs,
    mapId,
    tile,
    ...(x != null ? { x } : {}),
    ...(y != null ? { y } : {}),
    ...(elev != null ? { elev } : {}),
    inventory: parseCountMap(rec.inventory),
    equipment: parseEquipment(rec.equipment),
    openedChests: parseOpenedChests(rec.openedChests),
    shopStock: parseShopStock(rec.shopStock),
    flags: parseFlags(rec.flags),
    ...(hp != null ? { hp } : {}),
    ...(maxHp != null ? { maxHp } : {}),
  };
}

export function captureExploreSave(
  opts: CaptureExploreSaveOpts,
): EmberExploreSaveState {
  const slot = clampExploreSaveSlot(opts.slot) ?? EMBER_SAVE_DEFAULT_SLOT;
  const hp = optionalFinite(opts.hp);
  const maxHp = optionalFinite(opts.maxHp);
  return {
    version: EMBER_SAVE_VERSION,
    packId: opts.packId.trim() || DEFAULT_EMBER_PACK_ID,
    slot,
    savedAtMs: opts.savedAtMs ?? Date.now(),
    mapId: opts.source.mapId,
    tile: {
      tx: Math.trunc(opts.source.tile.tx),
      ty: Math.trunc(opts.source.tile.ty),
    },
    x: opts.source.x,
    y: opts.source.y,
    elev: opts.source.elev,
    inventory: compactInventory(opts.source.inventory) ?? {},
    equipment: compactEquipment(opts.source.equipment),
    openedChests: [...new Set(opts.source.openedChests.map((id) => id.trim()).filter(Boolean))],
    shopStock: parseShopStock(opts.source.shopStock),
    flags: parseFlags(opts.source.flags),
    ...(hp != null ? { hp } : {}),
    ...(maxHp != null ? { maxHp } : {}),
  };
}

export function exploreSaveWorldPos(
  save: EmberExploreSaveState,
  tileSize: number,
): { x: number; y: number; elev: number; tx: number; ty: number } {
  const ts = Math.max(1, tileSize);
  const x =
    save.x != null && Number.isFinite(save.x)
      ? save.x
      : save.tile.tx * ts + ts / 2;
  const y =
    save.y != null && Number.isFinite(save.y)
      ? save.y
      : save.tile.ty * ts + ts / 2;
  return {
    x,
    y,
    elev: save.elev != null && Number.isFinite(save.elev) ? save.elev : 0,
    tx: Math.floor(x / ts),
    ty: Math.floor(y / ts),
  };
}

export function writeExploreSave(
  backend: EmberSaveBackend,
  save: EmberExploreSaveState,
): void {
  backend.setItem(exploreSaveKey(save.packId, save.slot), JSON.stringify(save));
}

export function readExploreSave(
  backend: EmberSaveBackend,
  packId: string,
  slot: number,
): EmberExploreSaveState | null {
  const clamped = clampExploreSaveSlot(slot);
  if (clamped == null) return null;
  const raw = backend.getItem(exploreSaveKey(packId, clamped));
  if (!raw) return null;
  try {
    return parseExploreSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function deleteExploreSave(
  backend: EmberSaveBackend,
  packId: string,
  slot: number,
): boolean {
  const clamped = clampExploreSaveSlot(slot);
  if (clamped == null) return false;
  const key = exploreSaveKey(packId, clamped);
  const existed = backend.getItem(key) != null;
  backend.removeItem(key);
  return existed;
}

export function copyExploreSave(
  backend: EmberSaveBackend,
  packId: string,
  fromSlot: number,
  toSlot: number,
  savedAtMs = Date.now(),
): EmberExploreSaveState | null {
  const src = readExploreSave(backend, packId, fromSlot);
  const dest = clampExploreSaveSlot(toSlot);
  if (!src || dest == null || dest === src.slot) return src;
  const copied: EmberExploreSaveState = {
    ...src,
    slot: dest,
    savedAtMs,
  };
  writeExploreSave(backend, copied);
  return copied;
}

export function listExploreSaveSlots(
  backend: EmberSaveBackend,
  packId: string,
): EmberExploreSaveSlotInfo[] {
  const out: EmberExploreSaveSlotInfo[] = [];
  for (let slot = EMBER_SAVE_SLOT_MIN; slot <= EMBER_SAVE_SLOT_MAX; slot++) {
    const save = readExploreSave(backend, packId, slot);
    out.push(
      save
        ? {
            slot,
            empty: false,
            mapId: save.mapId,
            tile: save.tile,
            savedAtMs: save.savedAtMs,
          }
        : {
            slot,
            empty: true,
            mapId: null,
            tile: null,
            savedAtMs: null,
          },
    );
  }
  return out;
}

export function getActiveExploreSaveSlot(
  backend: EmberSaveBackend,
  packId: string,
): number {
  const raw = backend.getItem(exploreActiveSlotKey(packId));
  if (!raw) return EMBER_SAVE_DEFAULT_SLOT;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const slot = parseExploreSaveSlot((parsed as { slot?: unknown }).slot);
      if (slot != null) return slot;
    }
    const slot = parseExploreSaveSlot(parsed);
    return slot ?? EMBER_SAVE_DEFAULT_SLOT;
  } catch {
    return parseExploreSaveSlot(raw) ?? EMBER_SAVE_DEFAULT_SLOT;
  }
}

export function setActiveExploreSaveSlot(
  backend: EmberSaveBackend,
  packId: string,
  slot: number,
): number {
  const next = clampExploreSaveSlot(slot) ?? EMBER_SAVE_DEFAULT_SLOT;
  backend.setItem(
    exploreActiveSlotKey(packId),
    JSON.stringify({ slot: next }),
  );
  return next;
}
