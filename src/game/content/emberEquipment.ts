/**
 * Loadout: JRPG weapon / arena_weapon / head / body / accessory.
 * weapon_jrpg fills `weapon` (explore strikes). weapon_arena fills `arena_weapon`
 * (Vampire Survivors bullets). Combat formulas live in emberCombatStats.ts.
 * itemIsArenaOnly is still the bag tag; those items can be equipped into the arena slot.
 */
import type { EmberItemDef, EmberItemKind, EmberItemSlot } from "./types";
import {
  compactInventory,
  grantItemCounts,
  itemDisplayName,
} from "./emberItem";

export const EMBER_EQUIP_SLOTS = [
  "weapon",
  "arena_weapon",
  "head",
  "body",
  "accessory",
] as const;

export type EmberEquipSlot = (typeof EMBER_EQUIP_SLOTS)[number];

export type EmberEquipment = Record<EmberEquipSlot, string | null>;

export const EMBER_EQUIP_SLOT_LABELS_RU: Record<EmberEquipSlot, string> = {
  weapon: "Оружие",
  arena_weapon: "Арена",
  head: "Голова",
  body: "Тело",
  accessory: "Аксессуар",
};

export type EquipFailReason =
  | "missing_item"
  | "not_in_bag"
  | "arena_only"
  | "cannot_equip"
  | "empty_slot"
  | "cannot_use";

export type EquipMutateResult =
  | {
      ok: true;
      inventory: Record<string, number>;
      equipment: EmberEquipment;
      heal?: number;
    }
  | {
      ok: false;
      reason: EquipFailReason;
      inventory: Record<string, number>;
      equipment: EmberEquipment;
    };

export type InventoryItemView = {
  itemId: string;
  nameRu: string;
  count: number;
  kind: EmberItemKind;
  slot: EmberItemSlot;
  atk?: number;
  def?: number;
  hpRestore?: number;
  arenaOnly: boolean;
  canEquip: boolean;
  canUse: boolean;
};

export function emptyEquipment(): EmberEquipment {
  return {
    weapon: null,
    arena_weapon: null,
    head: null,
    body: null,
    accessory: null,
  };
}

export function isEmberEquipSlot(value: unknown): value is EmberEquipSlot {
  return (
    typeof value === "string" &&
    (EMBER_EQUIP_SLOTS as readonly string[]).includes(value)
  );
}

export function compactEquipment(
  equipment: Partial<EmberEquipment> | undefined,
): EmberEquipment {
  const next = emptyEquipment();
  if (!equipment) return next;
  for (const slot of EMBER_EQUIP_SLOTS) {
    const id = equipment[slot]?.trim();
    next[slot] = id ? id : null;
  }
  return next;
}

export function itemIsArenaOnly(item: EmberItemDef): boolean {
  switch (item.kind) {
    case "weapon_arena":
      return true;
    case "weapon_jrpg":
    case "armor":
    case "accessory":
    case "consumable":
    case "material":
    case "key":
      return false;
    default: {
      const _never: never = item.kind;
      return _never;
    }
  }
}

export function itemCanUse(item: EmberItemDef): boolean {
  return (item.hpRestore ?? 0) > 0;
}

export function equipSlotForItem(item: EmberItemDef): EmberEquipSlot | null {
  switch (item.kind) {
    case "weapon_jrpg":
      return "weapon";
    case "weapon_arena":
      return "arena_weapon";
    case "armor":
      if (item.slot === "head" || item.slot === "body") return item.slot;
      return null;
    case "accessory":
      return "accessory";
    case "consumable":
    case "material":
    case "key":
      return null;
    default: {
      const _never: never = item.kind;
      return _never;
    }
  }
}

export function takeItemCount(
  inventory: Record<string, number>,
  itemId: string,
  amount = 1,
): Record<string, number> | null {
  const have = inventory[itemId] ?? 0;
  if (have < amount) return null;
  return compactInventory({ ...inventory, [itemId]: have - amount }) ?? {};
}

export function equipFailRu(reason: EquipFailReason): string {
  switch (reason) {
    case "missing_item":
      return "Нет такого предмета";
    case "not_in_bag":
      return "Нет в сумке";
    case "arena_only":
      return "Только для арены";
    case "cannot_equip":
      return "Нельзя надеть";
    case "empty_slot":
      return "Слот пуст";
    case "cannot_use":
      return "Нельзя использовать";
    default: {
      const _never: never = reason;
      return _never;
    }
  }
}

export function listInventoryViews(
  inventory: Record<string, number>,
  catalog: Record<string, EmberItemDef> | undefined,
): InventoryItemView[] {
  const rows: InventoryItemView[] = [];
  for (const [itemId, count] of Object.entries(inventory)) {
    if (!itemId.trim() || !Number.isFinite(count) || count <= 0) continue;
    const item = catalog?.[itemId];
    const arenaOnly = item ? itemIsArenaOnly(item) : false;
    const canEquip = item != null && equipSlotForItem(item) != null;
    rows.push({
      itemId,
      nameRu: itemDisplayName(item, itemId),
      count: Math.round(count),
      kind: item?.kind ?? "material",
      slot: item?.slot ?? "none",
      atk: item?.atk,
      def: item?.def,
      hpRestore: item?.hpRestore,
      arenaOnly,
      canEquip,
      canUse: item != null && itemCanUse(item),
    });
  }
  rows.sort((a, b) => a.nameRu.localeCompare(b.nameRu, "ru"));
  return rows;
}

export function equippedStatTotals(
  equipment: EmberEquipment,
  catalog: Record<string, EmberItemDef> | undefined,
): { atk: number; def: number } {
  let atk = 0;
  let def = 0;
  for (const slot of EMBER_EQUIP_SLOTS) {
    if (slot === "arena_weapon") continue;
    const id = equipment[slot];
    if (!id) continue;
    const item = catalog?.[id];
    if (!item) continue;
    atk += item.atk ?? 0;
    def += item.def ?? 0;
  }
  return { atk, def };
}

export function equipItem(
  inventory: Record<string, number>,
  equipment: EmberEquipment,
  itemId: string,
  catalog: Record<string, EmberItemDef> | undefined,
): EquipMutateResult {
  const eq = compactEquipment(equipment);
  const inv = compactInventory(inventory) ?? {};
  const item = catalog?.[itemId];
  if (!item) {
    return { ok: false, reason: "missing_item", inventory: inv, equipment: eq };
  }
  const slot = equipSlotForItem(item);
  if (!slot) {
    return { ok: false, reason: "cannot_equip", inventory: inv, equipment: eq };
  }
  if ((inv[itemId] ?? 0) < 1) {
    return { ok: false, reason: "not_in_bag", inventory: inv, equipment: eq };
  }
  let nextInv = takeItemCount(inv, itemId, 1);
  if (!nextInv) {
    return { ok: false, reason: "not_in_bag", inventory: inv, equipment: eq };
  }
  const previous = eq[slot];
  if (previous) {
    nextInv = grantItemCounts(nextInv, [previous], catalog);
  }
  return {
    ok: true,
    inventory: nextInv,
    equipment: { ...eq, [slot]: itemId },
  };
}

export function unequipSlot(
  inventory: Record<string, number>,
  equipment: EmberEquipment,
  slot: EmberEquipSlot,
  catalog: Record<string, EmberItemDef> | undefined,
): EquipMutateResult {
  const eq = compactEquipment(equipment);
  const inv = compactInventory(inventory) ?? {};
  const equipped = eq[slot];
  if (!equipped) {
    return { ok: false, reason: "empty_slot", inventory: inv, equipment: eq };
  }
  return {
    ok: true,
    inventory: grantItemCounts(inv, [equipped], catalog),
    equipment: { ...eq, [slot]: null },
  };
}

export function useInventoryItem(
  inventory: Record<string, number>,
  equipment: EmberEquipment,
  itemId: string,
  catalog: Record<string, EmberItemDef> | undefined,
): EquipMutateResult {
  const eq = compactEquipment(equipment);
  const inv = compactInventory(inventory) ?? {};
  const item = catalog?.[itemId];
  if (!item) {
    return { ok: false, reason: "missing_item", inventory: inv, equipment: eq };
  }
  if (!itemCanUse(item)) {
    return { ok: false, reason: "cannot_use", inventory: inv, equipment: eq };
  }
  const nextInv = takeItemCount(inv, itemId, 1);
  if (!nextInv) {
    return { ok: false, reason: "not_in_bag", inventory: inv, equipment: eq };
  }
  return {
    ok: true,
    inventory: nextInv,
    equipment: eq,
    heal: item.hpRestore ?? 0,
  };
}
