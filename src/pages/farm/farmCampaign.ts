/**
 * Homestead catalog: starting yard, unlocks by farm level, paid upgrades.
 */

import type { FarmAnimalKind, FarmCropKind, FarmFactoryKind } from "./farmItems";
import { DEFAULT_FARM_UPGRADES, type FarmLevelSpec, type FarmUpgrades } from "./farmSim";

export type FarmUpgradeId =
  | "well"
  | "warehouse"
  | "truck"
  | "factory"
  | "cat"
  | "dog";

export type FarmUpgradeDef = {
  id: FarmUpgradeId;
  nameRu: string;
  hintRu: string;
  goldCost: number;
  maxRank: number;
};

export const FARM_UPGRADE_DEFS: readonly FarmUpgradeDef[] = [
  {
    id: "well",
    nameRu: "Колодец",
    hintRu: "Больше воды, дешевле долив",
    goldCost: 35,
    maxRank: 3,
  },
  {
    id: "warehouse",
    nameRu: "Сарай",
    hintRu: "Больше слотов на складе",
    goldCost: 40,
    maxRank: 3,
  },
  {
    id: "truck",
    nameRu: "Грузовик",
    hintRu: "Вместимость и скорость рейса",
    goldCost: 45,
    maxRank: 3,
  },
  {
    id: "factory",
    nameRu: "Станки",
    hintRu: "Заводики крутятся быстрее",
    goldCost: 55,
    maxRank: 2,
  },
  {
    id: "cat",
    nameRu: "Енот",
    hintRu: "Сам подбирает товар с земли",
    goldCost: 90,
    maxRank: 1,
  },
  {
    id: "dog",
    nameRu: "Пёс",
    hintRu: "Отгоняет медведя от скота",
    goldCost: 90,
    maxRank: 1,
  },
];

export type FarmUnlocks = {
  shop: FarmAnimalKind[];
  factories: FarmFactoryKind[];
  crops: FarmCropKind[];
  pests: boolean;
};

export function farmUnlocks(level: number): FarmUnlocks {
  const shop: FarmAnimalKind[] = ["chicken"];
  const factories: FarmFactoryKind[] = [];
  const crops: FarmCropKind[] = ["wheat"];
  if (level >= 2) {
    crops.push("corn");
    factories.push("mill");
  }
  if (level >= 3) {
    shop.push("cow");
    factories.push("dairy");
  }
  if (level >= 4) {
    shop.push("sheep");
    factories.push("bakery");
  }
  return {
    shop,
    factories,
    crops,
    pests: level >= 5,
  };
}

export function homesteadSpec(level: number): FarmLevelSpec {
  const u = farmUnlocks(level);
  return {
    id: "home",
    cols: 12,
    rows: 10,
    startGold: 40,
    startWater: 8,
    startGrass: 2,
    startAnimals: [{ kind: "chicken", n: 2 }],
    factories: [],
    shop: u.shop,
    pests: u.pests,
    pestFirstMs: 40_000,
    pestEveryMs: 70_000,
    dropDespawnMs: 16_000,
    timeLimitMs: 0,
    silverMs: 0,
    goldMs: 0,
    goals: [],
    inspections: [],
  };
}

export type FarmRanks = Record<FarmUpgradeId, number>;

export function defaultFarmRanks(): FarmRanks {
  return { well: 0, warehouse: 0, truck: 0, factory: 0, cat: 0, dog: 0 };
}

export function farmUpgradesFrom(ranks: FarmRanks): FarmUpgrades {
  const well = ranks.well ?? 0;
  const wh = ranks.warehouse ?? 0;
  const tr = ranks.truck ?? 0;
  const fac = ranks.factory ?? 0;
  return {
    wellCap: DEFAULT_FARM_UPGRADES.wellCap + well * 4,
    wellRefillCost: Math.max(4, DEFAULT_FARM_UPGRADES.wellRefillCost - well * 2),
    warehouseCap: DEFAULT_FARM_UPGRADES.warehouseCap + wh * 4,
    truckCap: DEFAULT_FARM_UPGRADES.truckCap + tr * 3,
    truckTravelMs: Math.max(2800, DEFAULT_FARM_UPGRADES.truckTravelMs - tr * 1400),
    factorySpeed: DEFAULT_FARM_UPGRADES.factorySpeed + fac * 0.35,
    hasCat: (ranks.cat ?? 0) > 0,
    hasDog: (ranks.dog ?? 0) > 0,
  };
}

export function buyFarmUpgrade(
  ranks: FarmRanks,
  gold: number,
  id: FarmUpgradeId,
): { ranks: FarmRanks; gold: number } | null {
  const def = FARM_UPGRADE_DEFS.find((d) => d.id === id);
  if (!def) return null;
  const rank = ranks[id] ?? 0;
  if (rank >= def.maxRank) return null;
  if (gold < def.goldCost) return null;
  return {
    ranks: { ...ranks, [id]: rank + 1 },
    gold: gold - def.goldCost,
  };
}

export const FARM_INSPECTION_EVERY_MS = 90_000;
export const FARM_INSPECTION_FIRST_MS = 45_000;
