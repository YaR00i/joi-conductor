import type { EmberLootOption } from "../bridge/events";
import type { EmberPack, EmberPool, EmberWeaponDef } from "./types";

const RARITY_COLOR: Record<string, string> = {
  common: "#8ab4a0",
  rare: "#6aa0e8",
  epic: "#c080e0",
};

function pickWeighted<T extends { weight: number }>(
  entries: T[],
  rng: () => number,
): T | null {
  const total = entries.reduce((s, e) => s + Math.max(0, e.weight), 0);
  if (total <= 0 || entries.length === 0) return null;
  let r = rng() * total;
  for (const e of entries) {
    r -= Math.max(0, e.weight);
    if (r <= 0) return e;
  }
  return entries[entries.length - 1] ?? null;
}

export function rollLootOptions(
  pack: EmberPack,
  pool: EmberPool,
  count: number,
  owned: Set<string>,
  rng: () => number = Math.random,
): { options: EmberLootOption[]; targetId: string } {
  const options: EmberLootOption[] = [];
  const used = new Set<string>();

  for (let i = 0; i < count * 4 && options.length < count; i++) {
    const entry = pickWeighted(pool.entries, rng);
    if (!entry) break;
    if (used.has(entry.itemId)) continue;
    const weapon = pack.weapons[entry.itemId];
    if (!weapon) continue;
    // Prefer new weapons; allow upgrades / heals always
    if (
      owned.has(entry.itemId) &&
      weapon.kind !== "instant_heal" &&
      weapon.kind !== "passive" &&
      rng() < 0.45
    ) {
      continue;
    }
    used.add(entry.itemId);
    const upgrade = owned.has(entry.itemId) && weapon.kind !== "instant_heal";
    options.push({
      id: `${entry.itemId}_${options.length}`,
      itemId: entry.itemId,
      labelRu: upgrade ? `${weapon.nameRu} +1` : weapon.nameRu,
      rarity: entry.rarity,
      weight: entry.weight,
      color: RARITY_COLOR[entry.rarity] ?? "#ccc",
    });
  }

  // Fallback fill
  while (options.length < count) {
    const heal = pack.weapons.heal_ember;
    if (!heal) break;
    options.push({
      id: `heal_${options.length}`,
      itemId: heal.id,
      labelRu: heal.nameRu,
      rarity: heal.rarity,
      weight: 10,
      color: RARITY_COLOR.common,
    });
  }

  const target = pickWeighted(
    options.map((o) => ({ ...o, weight: o.weight })),
    rng,
  );
  return {
    options,
    targetId: target?.id ?? options[0]?.id ?? "",
  };
}

export function describeWeapon(w: EmberWeaponDef): string {
  return w.nameRu;
}
