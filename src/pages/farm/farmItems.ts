/** Catalog of farm goods, livestock and processing chains. */

export const FARM_ITEM_IDS = [
  "egg",
  "milk",
  "wool",
  "powder",
  "bun",
  "cheese",
  "bear",
  "wheat",
  "corn",
] as const;
export type FarmItemId = (typeof FARM_ITEM_IDS)[number];

export type FarmItemMeta = {
  nameRu: string;
  /** Warehouse slots this stack occupies. */
  slots: number;
  /** Gold when the truck sells one. */
  sell: number;
};

export const FARM_ITEMS: Record<FarmItemId, FarmItemMeta> = {
  egg: { nameRu: "яичко", slots: 1, sell: 5 },
  milk: { nameRu: "молочко", slots: 2, sell: 12 },
  wool: { nameRu: "шерстка", slots: 1, sell: 8 },
  powder: { nameRu: "порошок", slots: 1, sell: 14 },
  bun: { nameRu: "булочка", slots: 1, sell: 30 },
  cheese: { nameRu: "сыр", slots: 2, sell: 28 },
  bear: { nameRu: "клетка", slots: 4, sell: 20 },
  wheat: { nameRu: "пшеница", slots: 1, sell: 3 },
  corn: { nameRu: "кукуруза", slots: 1, sell: 4 },
};

export const FARM_ANIMAL_KINDS = ["chicken", "cow", "sheep"] as const;
export type FarmAnimalKind = (typeof FARM_ANIMAL_KINDS)[number];

export type FarmAnimalMeta = {
  nameRu: string;
  buyGold: number;
  produce: FarmItemId;
  eatSec: number;
  produceSec: number;
  starveSec: number;
  speed: number;
};

export const FARM_ANIMALS: Record<FarmAnimalKind, FarmAnimalMeta> = {
  chicken: {
    nameRu: "курочка",
    buyGold: 20,
    produce: "egg",
    eatSec: 2.2,
    produceSec: 5.5,
    starveSec: 55,
    speed: 2.4,
  },
  cow: {
    nameRu: "бурёнка",
    buyGold: 55,
    produce: "milk",
    eatSec: 3.4,
    produceSec: 9,
    starveSec: 70,
    speed: 1.6,
  },
  sheep: {
    nameRu: "овечка",
    buyGold: 35,
    produce: "wool",
    eatSec: 2.8,
    produceSec: 7.5,
    starveSec: 60,
    speed: 2,
  },
};

export const FARM_FACTORY_KINDS = ["mill", "bakery", "dairy"] as const;
export type FarmFactoryKind = (typeof FARM_FACTORY_KINDS)[number];

export type FarmFactoryMeta = {
  nameRu: string;
  input: FarmItemId;
  output: FarmItemId;
  craftSec: number;
};

export const FARM_FACTORIES: Record<FarmFactoryKind, FarmFactoryMeta> = {
  mill: { nameRu: "сушилка", input: "egg", output: "powder", craftSec: 5 },
  bakery: { nameRu: "пекарня", input: "powder", output: "bun", craftSec: 6 },
  dairy: { nameRu: "сыроварня", input: "milk", output: "cheese", craftSec: 7 },
};

export const FARM_CROP_KINDS = ["wheat", "corn"] as const;
export type FarmCropKind = (typeof FARM_CROP_KINDS)[number];

export type FarmCropMeta = {
  nameRu: string;
  seedGold: number;
  growSec: number;
  yield: FarmItemId;
  unlockLevel: number;
};

export const FARM_CROPS: Record<FarmCropKind, FarmCropMeta> = {
  wheat: {
    nameRu: "пшеница",
    seedGold: 2,
    growSec: 10,
    yield: "wheat",
    unlockLevel: 1,
  },
  corn: {
    nameRu: "кукуруза",
    seedGold: 3,
    growSec: 18,
    yield: "corn",
    unlockLevel: 2,
  },
};

export const FARM_BUILD_GOLD: Record<FarmFactoryKind, number> = {
  mill: 55,
  dairy: 80,
  bakery: 70,
};

export function farmCropRipeMs(kind: FarmCropKind): number {
  return FARM_CROPS[kind].growSec * 1000;
}

export function farmItemSlots(id: FarmItemId): number {
  return FARM_ITEMS[id].slots;
}

export function warehouseUsed(items: readonly FarmItemId[]): number {
  return items.reduce((n, id) => n + farmItemSlots(id), 0);
}
