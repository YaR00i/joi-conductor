import { describe, expect, it } from "vitest";
import {
  UNARMED_ATK,
  UNARMED_DEF,
  incomingPlayerDamage,
  outgoingPlayerDamage,
  playerCombatStats,
} from "./emberCombatStats";
import { compactEquipment, emptyEquipment, equipItem } from "./emberEquipment";
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
  pyre_spark: item({
    id: "pyre_spark",
    nameRu: "Искра",
    kind: "weapon_arena",
    slot: "weapon",
    atk: 14,
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
  parlor_talisman: item({
    id: "parlor_talisman",
    nameRu: "Талисман",
    kind: "accessory",
    slot: "accessory",
    atk: 2,
    def: 2,
  }),
};

describe("playerCombatStats", () => {
  it("uses unarmed defaults when nothing is equipped", () => {
    const empty = emptyEquipment();
    expect(playerCombatStats("explore", empty, catalog)).toEqual({
      atk: UNARMED_ATK,
      def: UNARMED_DEF,
    });
    expect(playerCombatStats("arena", empty, catalog)).toEqual({
      atk: UNARMED_ATK,
      def: UNARMED_DEF,
    });
    expect(outgoingPlayerDamage("arena", 10, playerCombatStats("arena", empty, catalog))).toBe(
      10,
    );
    expect(incomingPlayerDamage(6, playerCombatStats("explore", empty, catalog))).toBe(6);
  });

  it("explore strikes use JRPG weapon + accessory atk and armor def", () => {
    const gear = compactEquipment({
      weapon: "funeral_polearm",
      head: "plum_helm",
      body: "mourning_mail",
      accessory: "parlor_talisman",
    });
    const stats = playerCombatStats("explore", gear, catalog);
    expect(stats).toEqual({ atk: 4 + 14 + 2, def: 4 + 8 + 2 });
    expect(outgoingPlayerDamage("explore", 999, stats)).toBe(20);
    expect(incomingPlayerDamage(18, stats)).toBe(4);
    expect(incomingPlayerDamage(3, stats)).toBe(1);
  });

  it("arena bullets add arena_weapon atk and ignore the JRPG polearm", () => {
    const mixed = compactEquipment({
      weapon: "funeral_polearm",
      arena_weapon: "spirit_bolt",
      body: "mourning_mail",
    });
    const arena = playerCombatStats("arena", mixed, catalog);
    const explore = playerCombatStats("explore", mixed, catalog);
    expect(arena.atk).toBe(4 + 10);
    expect(explore.atk).toBe(4 + 14);
    expect(arena.def).toBe(8);
    expect(outgoingPlayerDamage("arena", 10, arena)).toBe(20);
    const spark = compactEquipment({ arena_weapon: "pyre_spark" });
    expect(
      outgoingPlayerDamage(
        "arena",
        10,
        playerCombatStats("arena", spark, catalog),
      ),
    ).toBe(24);
  });

  it("equipping an arena weapon fills arena_weapon, not weapon", () => {
    const jrpg = equipItem(
      { funeral_polearm: 1, spirit_bolt: 1 },
      emptyEquipment(),
      "funeral_polearm",
      catalog,
    );
    expect(jrpg.ok).toBe(true);
    if (!jrpg.ok) return;
    const arena = equipItem(jrpg.inventory, jrpg.equipment, "spirit_bolt", catalog);
    expect(arena.ok).toBe(true);
    if (!arena.ok) return;
    expect(arena.equipment.weapon).toBe("funeral_polearm");
    expect(arena.equipment.arena_weapon).toBe("spirit_bolt");
    expect(playerCombatStats("arena", arena.equipment, catalog).atk).toBe(14);
    expect(playerCombatStats("explore", arena.equipment, catalog).atk).toBe(18);
  });
});
