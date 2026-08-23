import { describe, expect, it } from "vitest";
import {
  compactEquipment,
  emptyEquipment,
  equipFailRu,
  equipItem,
  equipSlotForItem,
  equippedStatTotals,
  itemIsArenaOnly,
  listInventoryViews,
  takeItemCount,
  unequipSlot,
  useInventoryItem,
} from "./emberEquipment";
import type { EmberItemDef } from "./types";

function item(
  partial: Partial<EmberItemDef> & Pick<EmberItemDef, "id" | "kind">,
): EmberItemDef {
  return {
    nameRu: partial.nameRu ?? partial.id,
    slot: partial.slot ?? "none",
    rarity: "common",
    stackMax: partial.stackMax ?? 1,
    useIn: partial.useIn ?? "explore",
    ...partial,
  };
}

const catalog: Record<string, EmberItemDef> = {
  funeral_polearm: item({
    id: "funeral_polearm",
    nameRu: "Пика",
    kind: "weapon_jrpg",
    slot: "weapon",
    atk: 14,
  }),
  spirit_bolt: item({
    id: "spirit_bolt",
    nameRu: "Огонёк",
    kind: "weapon_arena",
    slot: "weapon",
    atk: 10,
    useIn: "arena",
  }),
  plum_helm: item({
    id: "plum_helm",
    nameRu: "Шлем",
    kind: "armor",
    slot: "head",
    def: 4,
  }),
  mourning_mail: item({
    id: "mourning_mail",
    nameRu: "Кольчуга",
    kind: "armor",
    slot: "body",
    def: 8,
  }),
  lantern_charm: item({
    id: "lantern_charm",
    nameRu: "Оберег",
    kind: "accessory",
    slot: "accessory",
    def: 1,
  }),
  meat_bun: item({
    id: "meat_bun",
    nameRu: "Булочка",
    kind: "consumable",
    stackMax: 20,
    hpRestore: 18,
  }),
  herb: item({
    id: "herb",
    nameRu: "Трава",
    kind: "material",
    stackMax: 99,
    hpRestore: 4,
  }),
  coin: item({
    id: "coin",
    nameRu: "Монета",
    kind: "material",
    stackMax: 99,
    useIn: "both",
  }),
};

describe("ember equipment", () => {
  it("maps JRPG gear to explore slots and arena weapons to arena_weapon", () => {
    expect(equipSlotForItem(catalog.funeral_polearm)).toBe("weapon");
    expect(equipSlotForItem(catalog.plum_helm)).toBe("head");
    expect(equipSlotForItem(catalog.mourning_mail)).toBe("body");
    expect(equipSlotForItem(catalog.lantern_charm)).toBe("accessory");
    expect(equipSlotForItem(catalog.spirit_bolt)).toBe("arena_weapon");
    expect(itemIsArenaOnly(catalog.spirit_bolt)).toBe(true);
    expect(itemIsArenaOnly(catalog.funeral_polearm)).toBe(false);
    expect(equipSlotForItem(catalog.meat_bun)).toBeNull();
  });

  it("equips from the bag and returns the previous piece", () => {
    const first = equipItem(
      { funeral_polearm: 1, plum_helm: 1 },
      emptyEquipment(),
      "funeral_polearm",
      catalog,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.equipment.weapon).toBe("funeral_polearm");
    expect(first.inventory.funeral_polearm).toBeUndefined();
    const helm = equipItem(first.inventory, first.equipment, "plum_helm", catalog);
    expect(helm.ok).toBe(true);
    if (!helm.ok) return;
    expect(helm.equipment.head).toBe("plum_helm");
  });

  it("labels arena weapons and equips them into arena_weapon", () => {
    const result = equipItem(
      { spirit_bolt: 1 },
      emptyEquipment(),
      "spirit_bolt",
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.equipment.arena_weapon).toBe("spirit_bolt");
    expect(result.equipment.weapon).toBeNull();
    expect(result.inventory.spirit_bolt).toBeUndefined();
    expect(equipFailRu("arena_only")).toBe("Только для арены");
    const views = listInventoryViews({ spirit_bolt: 1, coin: 3 }, catalog);
    const bolt = views.find((row) => row.itemId === "spirit_bolt");
    expect(bolt?.arenaOnly).toBe(true);
    expect(bolt?.canEquip).toBe(true);
  });

  it("uses items with hpRestore and decrements the stack", () => {
    const bun = useInventoryItem(
      { meat_bun: 2 },
      emptyEquipment(),
      "meat_bun",
      catalog,
    );
    expect(bun).toMatchObject({ ok: true, heal: 18, inventory: { meat_bun: 1 } });
    const herb = useInventoryItem({ herb: 1 }, emptyEquipment(), "herb", catalog);
    expect(herb.ok).toBe(true);
    if (!herb.ok) return;
    expect(herb.heal).toBe(4);
    expect(herb.inventory.herb).toBeUndefined();
    const coin = useInventoryItem({ coin: 5 }, emptyEquipment(), "coin", catalog);
    expect(coin).toMatchObject({ ok: false, reason: "cannot_use" });
  });

  it("unequips back into the bag and sums atk/def", () => {
    const armed = compactEquipment({
      weapon: "funeral_polearm",
      body: "mourning_mail",
      accessory: "lantern_charm",
    });
    expect(equippedStatTotals(armed, catalog)).toEqual({ atk: 14, def: 9 });
    const off = unequipSlot({}, armed, "weapon", catalog);
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    expect(off.equipment.weapon).toBeNull();
    expect(off.inventory.funeral_polearm).toBe(1);
    expect(takeItemCount({ coin: 2 }, "coin", 1)).toEqual({ coin: 1 });
    expect(takeItemCount({ coin: 1 }, "coin", 2)).toBeNull();
  });
});
