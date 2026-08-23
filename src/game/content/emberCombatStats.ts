/**
 * Player combat stats from equipment. Explore uses JRPG weapon + armor;
 * arena auto-attack uses the arena_weapon slot so polearms never scale bullets.
 *
 * Explore currently has no player strikes (horde/auto-attack off). Stats are
 * still resolved and applied in EmberThreeWorld wherever the player deals or
 * takes damage (tile hazards, future hits).
 */
import type { EmberMapPlayProfile, EmberItemDef } from "./types";
import {
  compactEquipment,
  type EmberEquipment,
} from "./emberEquipment";

/** Bare-handed strike / arena bonus baseline. Equipped atk adds on top. */
export const UNARMED_ATK = 4;
export const UNARMED_DEF = 0;

export type EmberCombatStats = {
  atk: number;
  def: number;
};

function catalogStat(
  catalog: Record<string, EmberItemDef> | undefined,
  itemId: string | null,
  key: "atk" | "def",
): number {
  if (!itemId) return 0;
  const value = catalog?.[itemId]?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function armorDef(
  equipment: EmberEquipment,
  catalog: Record<string, EmberItemDef> | undefined,
): number {
  return (
    UNARMED_DEF +
    catalogStat(catalog, equipment.head, "def") +
    catalogStat(catalog, equipment.body, "def") +
    catalogStat(catalog, equipment.accessory, "def")
  );
}

export function playerCombatStats(
  profile: EmberMapPlayProfile,
  equipment: EmberEquipment | Partial<EmberEquipment> | undefined,
  catalog: Record<string, EmberItemDef> | undefined,
): EmberCombatStats {
  const eq = compactEquipment(equipment);
  const def = armorDef(eq, catalog);
  switch (profile) {
    case "explore":
      return {
        atk:
          UNARMED_ATK +
          catalogStat(catalog, eq.weapon, "atk") +
          catalogStat(catalog, eq.accessory, "atk"),
        def,
      };
    case "arena":
      return {
        atk: UNARMED_ATK + catalogStat(catalog, eq.arena_weapon, "atk"),
        def,
      };
    default: {
      const _never: never = profile;
      return _never;
    }
  }
}

/**
 * Explore: the strike is the JRPG atk (VS weapon tables are unused).
 * Arena: keep weapons.json damage when unarmed; add (atk − UNARMED_ATK)
 * from the arena_weapon slot so a catalog atk of 10 on a 10-damage bolt
 * becomes +10, not a rebalance of spawn HP.
 */
export function outgoingPlayerDamage(
  profile: EmberMapPlayProfile,
  baseDamage: number,
  stats: EmberCombatStats,
): number {
  const base = Number.isFinite(baseDamage) ? baseDamage : 0;
  switch (profile) {
    case "explore":
      return Math.max(1, stats.atk);
    case "arena":
      return Math.max(1, base + stats.atk - UNARMED_ATK);
    default: {
      const _never: never = profile;
      return _never;
    }
  }
}

/** Incoming hit after armor. Unarmed def 0 leaves the raw value unchanged. */
export function incomingPlayerDamage(
  rawDamage: number,
  stats: EmberCombatStats,
): number {
  const raw = Number.isFinite(rawDamage) ? rawDamage : 0;
  if (raw <= 0) return 0;
  return Math.max(1, raw - Math.max(0, stats.def));
}
