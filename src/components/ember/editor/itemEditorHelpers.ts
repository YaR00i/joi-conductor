import {
  defaultSlotForKind,
  defaultStackMaxForKind,
  defaultUseInForKind,
  normalizeItemDef,
} from "../../../game/content/emberItem";
import type { EmberItemDef, EmberItemKind } from "../../../game/content/types";

const ID_RE = /^[a-z][a-z0-9_]*$/;

export function sanitizeItemId(raw: string, fallback = "item"): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
  const id = cleaned || fallback;
  return ID_RE.test(id) ? id : fallback;
}

export function nextItemId(
  existing: Iterable<string>,
  base = "item",
): string {
  const taken = new Set(existing);
  const stem = sanitizeItemId(base, "item");
  if (!taken.has(stem)) return stem;
  for (let n = 2; n < 10_000; n++) {
    const id = `${stem}_${n}`;
    if (!taken.has(id)) return id;
  }
  return `${stem}_${Date.now().toString(36)}`;
}

export function createBlankItem(
  existing: Iterable<string>,
  kind: EmberItemKind = "material",
): EmberItemDef {
  const id = nextItemId(existing, kind === "material" ? "item" : kind);
  return {
    id,
    nameRu: "Новый предмет",
    kind,
    slot: defaultSlotForKind(kind),
    rarity: "common",
    stackMax: defaultStackMaxForKind(kind),
    useIn: defaultUseInForKind(kind),
    unsellable: kind === "key" ? true : undefined,
  };
}

export function duplicateItem(
  item: EmberItemDef,
  existing: Iterable<string>,
): EmberItemDef {
  const id = nextItemId(existing, item.id);
  return {
    ...item,
    id,
    nameRu: `${item.nameRu} копия`,
  };
}

export function applyItemKind(
  item: EmberItemDef,
  kind: EmberItemKind,
): EmberItemDef {
  const next = {
    ...item,
    kind,
    slot: defaultSlotForKind(kind),
    useIn: defaultUseInForKind(kind),
    stackMax: defaultStackMaxForKind(kind),
    unsellable: kind === "key" ? true : item.unsellable,
  };
  if (kind !== "key") delete next.unsellable;
  return normalizeItemDef(next) ?? next;
}

export function isValidItemId(id: string): boolean {
  return ID_RE.test(id);
}

export function renameItemId(
  item: EmberItemDef,
  nextId: string,
  existing: Iterable<string>,
): EmberItemDef | null {
  const id = sanitizeItemId(nextId, "");
  if (!id || !isValidItemId(id)) return null;
  const taken = new Set(existing);
  taken.delete(item.id);
  if (taken.has(id)) return null;
  return { ...item, id };
}
