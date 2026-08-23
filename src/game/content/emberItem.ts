/**
 * Explore + arena item catalog: kinds, slots, pixel icons, loot resolve.
 * Data lives in content/ember/items/catalog.json — not hardcoded in React.
 */
import type {
  EmberItemDef,
  EmberItemIcon,
  EmberItemKind,
  EmberItemRarity,
  EmberItemSlot,
  EmberItemUseIn,
  EmberItemsFile,
  ValidationIssue,
} from "./types";
import {
  EMBER_ITEM_KINDS,
  EMBER_ITEM_RARITIES,
  EMBER_ITEM_SLOTS,
  EMBER_ITEM_USE_IN,
} from "./types";

export const ITEM_CATALOG_REL = "items/catalog.json";
export const ITEM_ICON_SIZE = 16;
export const ITEM_ICON_SIZE_MAX = 32;

export const EMBER_ITEM_KIND_LABELS_RU: Record<EmberItemKind, string> = {
  weapon_arena: "Оружие арены",
  weapon_jrpg: "Оружие JRPG",
  armor: "Броня",
  accessory: "Аксессуар",
  consumable: "Расходник",
  material: "Материал",
  key: "Ключ",
};

export const EMBER_ITEM_SLOT_LABELS_RU: Record<EmberItemSlot, string> = {
  none: "Нет",
  weapon: "Оружие",
  head: "Голова",
  body: "Тело",
  accessory: "Аксессуар",
};

export const EMBER_ITEM_RARITY_LABELS_RU: Record<EmberItemRarity, string> = {
  common: "Обычный",
  uncommon: "Необычный",
  rare: "Редкий",
  epic: "Эпический",
};

export const EMBER_ITEM_USE_IN_LABELS_RU: Record<EmberItemUseIn, string> = {
  arena: "Арена",
  explore: "Исследование",
  both: "Оба",
};

export function isEmberItemKind(value: unknown): value is EmberItemKind {
  return (
    typeof value === "string" &&
    (EMBER_ITEM_KINDS as readonly string[]).includes(value)
  );
}

export function isEmberItemSlot(value: unknown): value is EmberItemSlot {
  return (
    typeof value === "string" &&
    (EMBER_ITEM_SLOTS as readonly string[]).includes(value)
  );
}

export function isEmberItemRarity(value: unknown): value is EmberItemRarity {
  return (
    typeof value === "string" &&
    (EMBER_ITEM_RARITIES as readonly string[]).includes(value)
  );
}

export function isEmberItemUseIn(value: unknown): value is EmberItemUseIn {
  return (
    typeof value === "string" &&
    (EMBER_ITEM_USE_IN as readonly string[]).includes(value)
  );
}

/** Disk catalogs sometimes used English aliases; map them onto the schema. */
function parseItemKind(value: unknown): EmberItemKind | null {
  if (isEmberItemKind(value)) return value;
  if (value === "weapon_jrpg") return "weapon_jrpg";
  if (value === "weapon_arena") return "weapon_arena";
  return null;
}

function pickTrimmedString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function defaultSlotForKind(kind: EmberItemKind): EmberItemSlot {
  switch (kind) {
    case "weapon_arena":
    case "weapon_jrpg":
      return "weapon";
    case "armor":
      return "body";
    case "accessory":
      return "accessory";
    case "consumable":
    case "material":
    case "key":
      return "none";
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

export function defaultUseInForKind(kind: EmberItemKind): EmberItemUseIn {
  switch (kind) {
    case "weapon_arena":
      return "arena";
    case "weapon_jrpg":
      return "explore";
    case "armor":
    case "accessory":
    case "consumable":
    case "material":
    case "key":
      return "both";
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

export function defaultStackMaxForKind(kind: EmberItemKind): number {
  switch (kind) {
    case "weapon_arena":
    case "weapon_jrpg":
    case "armor":
    case "accessory":
    case "key":
      return 1;
    case "consumable":
    case "material":
      return 99;
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

export function slotAllowedForKind(
  kind: EmberItemKind,
  slot: EmberItemSlot,
): boolean {
  switch (kind) {
    case "weapon_arena":
    case "weapon_jrpg":
      return slot === "weapon";
    case "armor":
      return slot === "head" || slot === "body";
    case "accessory":
      return slot === "accessory";
    case "consumable":
    case "material":
    case "key":
      return slot === "none";
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampIconSize(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : ITEM_ICON_SIZE;
  if (n === 32) return 32;
  return ITEM_ICON_SIZE;
}

function normalizeHexColor(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const t = raw.trim();
  if (!t || t === "#00000000") return "";
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    const r = t[1];
    const g = t[2];
    const b = t[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{8}$/.test(t)) {
    if (t.slice(7).toLowerCase() === "00") return "";
    return t.slice(0, 7).toLowerCase();
  }
  return "";
}

export function emptyIconPixels(size = ITEM_ICON_SIZE): string[] {
  return Array.from({ length: size * size }, () => "");
}

export function decodeIconRows(
  rows: string[] | undefined,
  palette: Record<string, string> | undefined,
  size = ITEM_ICON_SIZE,
): string[] {
  const pixels = emptyIconPixels(size);
  if (!rows?.length) return pixels;
  const map = palette ?? {};
  for (let y = 0; y < size; y++) {
    const row = rows[y] ?? "";
    for (let x = 0; x < size; x++) {
      const ch = row[x] ?? ".";
      pixels[y * size + x] = normalizeHexColor(map[ch] ?? (ch === "." ? "" : ch));
    }
  }
  return pixels;
}

export function normalizeItemIcon(raw: unknown): EmberItemIcon | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !rec.id.trim()) return null;
  const size = clampIconSize(rec.size);
  const palette =
    rec.palette != null && typeof rec.palette === "object" && !Array.isArray(rec.palette)
      ? Object.fromEntries(
          Object.entries(rec.palette as Record<string, unknown>).map(([k, v]) => [
            k,
            normalizeHexColor(v),
          ]),
        )
      : undefined;
  const rows = Array.isArray(rec.rows)
    ? rec.rows.filter((row): row is string => typeof row === "string")
    : undefined;
  let pixels = emptyIconPixels(size);
  if (Array.isArray(rec.pixels) && rec.pixels.length >= size * size) {
    pixels = rec.pixels.slice(0, size * size).map((c) => normalizeHexColor(c));
  } else if (rows?.length) {
    pixels = decodeIconRows(rows, palette, size);
  }
  const icon: EmberItemIcon = {
    id: rec.id.trim(),
    size,
    pixels,
  };
  const iconNameRu = pickTrimmedString(rec.nameRu, rec.nameRu);
  if (iconNameRu) icon.nameRu = iconNameRu;
  if (palette && Object.keys(palette).length) icon.palette = palette;
  if (rows?.length) icon.rows = rows.slice(0, size);
  return icon;
}

function optionalFiniteNumber(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return raw;
}

function normalizeTags(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const tag = item.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out.length ? out : undefined;
}

export function normalizeItemDef(raw: unknown): EmberItemDef | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !rec.id.trim()) return null;
  const kind = parseItemKind(rec.kind);
  if (!kind) return null;
  const slot = isEmberItemSlot(rec.slot) ? rec.slot : defaultSlotForKind(kind);
  const rarity = isEmberItemRarity(rec.rarity) ? rec.rarity : "common";
  const useInRaw = rec.useIn ?? rec.useIn;
  const useIn = isEmberItemUseIn(useInRaw)
    ? useInRaw
    : defaultUseInForKind(kind);
  const nameRu =
    pickTrimmedString(rec.nameRu, rec.nameRu) ?? rec.id.trim();
  const item: EmberItemDef = {
    id: rec.id.trim(),
    nameRu,
    kind,
    slot,
    rarity,
    stackMax: clampInt(
      rec.stackMax ?? rec.stackMax,
      defaultStackMaxForKind(kind),
      1,
      999,
    ),
    useIn,
  };
  if (typeof rec.name === "string" && rec.name.trim()) item.name = rec.name.trim();
  const atk = optionalFiniteNumber(rec.atk);
  if (atk != null) item.atk = Math.round(atk);
  const def = optionalFiniteNumber(rec.def);
  if (def != null) item.def = Math.round(def);
  const hpRestore = optionalFiniteNumber(rec.hpRestore ?? rec.hpRestore);
  if (hpRestore != null) item.hpRestore = Math.round(hpRestore);
  const tags = normalizeTags(rec.tags);
  if (tags) item.tags = tags;
  const iconId = pickTrimmedString(rec.iconId, rec.iconId);
  if (iconId) item.iconId = iconId;
  if (Array.isArray(rec.iconPixels)) {
    const size = ITEM_ICON_SIZE;
    item.iconPixels = rec.iconPixels
      .slice(0, size * size)
      .map((c) => normalizeHexColor(c));
    while (item.iconPixels.length < size * size) item.iconPixels.push("");
  }
  if (typeof rec.notesRu === "string" && rec.notesRu.trim()) {
    item.notesRu = rec.notesRu.trim();
  }
  const sellPrice = optionalFiniteNumber(rec.sellPrice);
  if (sellPrice != null) item.sellPrice = Math.max(0, Math.round(sellPrice));
  if (rec.unsellable === true) item.unsellable = true;
  return item;
}

export function parseItemsFile(raw: unknown): {
  items: Record<string, EmberItemDef>;
  itemIcons: Record<string, EmberItemIcon>;
} {
  const items: Record<string, EmberItemDef> = {};
  const itemIcons: Record<string, EmberItemIcon> = {};
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { items, itemIcons };
  }
  const rec = raw as Record<string, unknown>;
  const iconList = Array.isArray(rec.icons) ? rec.icons : [];
  for (const entry of iconList) {
    const icon = normalizeItemIcon(entry);
    if (icon) itemIcons[icon.id] = icon;
  }
  const itemList = Array.isArray(rec.items) ? rec.items : [];
  for (const entry of itemList) {
    const item = normalizeItemDef(entry);
    if (item) items[item.id] = item;
  }
  return { items, itemIcons };
}

export function itemsFileFromPack(
  items: Record<string, EmberItemDef>,
  itemIcons: Record<string, EmberItemIcon>,
): EmberItemsFile {
  const icons = Object.values(itemIcons).sort((a, b) => a.id.localeCompare(b.id));
  const list = Object.values(items).sort((a, b) => a.id.localeCompare(b.id));
  return { icons, items: list };
}

export function itemDisplayName(item: EmberItemDef | undefined, fallbackId: string): string {
  if (!item) return fallbackId;
  const ru = item.nameRu?.trim();
  if (ru) return ru;
  const en = item.name?.trim();
  if (en) return en;
  return item.id || fallbackId;
}

export function resolveLootLabels(
  lootIds: readonly string[],
  catalog: Record<string, EmberItemDef> | undefined,
): string[] {
  return lootIds.map((id) => itemDisplayName(catalog?.[id], id));
}

export function resolveItemIconPixels(
  item: EmberItemDef | undefined,
  icons: Record<string, EmberItemIcon> | undefined,
): { size: number; pixels: string[] } | null {
  if (!item) return null;
  if (item.iconPixels?.length) {
    const size = Math.round(Math.sqrt(item.iconPixels.length)) || ITEM_ICON_SIZE;
    return { size, pixels: item.iconPixels };
  }
  const icon = item.iconId ? icons?.[item.iconId] : undefined;
  if (!icon) return null;
  return { size: icon.size, pixels: icon.pixels };
}

export function grantItemCounts(
  inventory: Record<string, number>,
  lootIds: readonly string[],
  catalog: Record<string, EmberItemDef> | undefined,
): Record<string, number> {
  const next = { ...inventory };
  for (const id of lootIds) {
    const stackMax = catalog?.[id]?.stackMax ?? 99;
    next[id] = Math.min(stackMax, (next[id] ?? 0) + 1);
  }
  return next;
}

export function compactInventory(
  inventory: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!inventory) return undefined;
  const next: Record<string, number> = {};
  for (const [id, count] of Object.entries(inventory)) {
    if (!id.trim() || !Number.isFinite(count) || count <= 0) continue;
    next[id] = Math.round(count);
  }
  return Object.keys(next).length ? next : undefined;
}

function pushIssue(
  issues: ValidationIssue[],
  level: ValidationIssue["level"],
  path: string,
  message: string,
): void {
  issues.push({ level, path, message });
}

export function validateItemCatalog(
  items: Record<string, EmberItemDef>,
  itemIcons: Record<string, EmberItemIcon>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const icon of Object.values(itemIcons)) {
    const base = `items/icons/${icon.id}`;
    if (icon.size !== 16 && icon.size !== 32) {
      pushIssue(issues, "error", `${base}.size`, "Размер иконки 16 или 32");
    }
    const expected = icon.size * icon.size;
    if (icon.pixels.length !== expected) {
      pushIssue(
        issues,
        "error",
        `${base}.pixels`,
        `Ожидалось ${expected} пикселей`,
      );
    }
  }
  for (const item of Object.values(items)) {
    const base = `items/${item.id}`;
    if (!isEmberItemKind(item.kind)) {
      pushIssue(issues, "error", `${base}.kind`, "Неизвестный kind");
      continue;
    }
    if (!isEmberItemSlot(item.slot)) {
      pushIssue(issues, "error", `${base}.slot`, "Неизвестный slot");
      continue;
    }
    if (!slotAllowedForKind(item.kind, item.slot)) {
      pushIssue(
        issues,
        "error",
        `${base}.slot`,
        `Слот «${item.slot}» не подходит к kind «${item.kind}»`,
      );
    }
    if (!isEmberItemRarity(item.rarity)) {
      pushIssue(issues, "error", `${base}.rarity`, "Неизвестный rarity");
    }
    if (!isEmberItemUseIn(item.useIn)) {
      pushIssue(issues, "error", `${base}.useIn`, "Неизвестный useIn");
    }
    if (item.kind === "weapon_arena" && item.useIn === "explore") {
      pushIssue(
        issues,
        "warn",
        `${base}.useIn`,
        "Оружие арены помечено только как explore",
      );
    }
    if (item.kind === "weapon_jrpg" && item.useIn === "arena") {
      pushIssue(
        issues,
        "warn",
        `${base}.useIn`,
        "JRPG-оружие помечено только как arena",
      );
    }
    if (item.iconId && !itemIcons[item.iconId] && !item.iconPixels?.length) {
      pushIssue(
        issues,
        "warn",
        `${base}.iconId`,
        `Иконка «${item.iconId}» отсутствует`,
      );
    }
  }
  return issues;
}

export function validateChestLootIds(
  lootIds: unknown,
  catalog: Record<string, EmberItemDef> | undefined,
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (lootIds == null) return issues;
  if (!Array.isArray(lootIds) || lootIds.some((id) => typeof id !== "string")) {
    issues.push({
      level: "error",
      path,
      message: "Ожидался массив строк (id предметов)",
    });
    return issues;
  }
  if (!catalog) return issues;
  for (const id of lootIds) {
    if (!id.trim() || catalog[id]) continue;
    issues.push({
      level: "warn",
      path,
      message: `Предмет «${id}» нет в каталоге — останется stub`,
    });
  }
  return issues;
}
