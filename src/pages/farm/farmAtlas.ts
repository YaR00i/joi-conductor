/** Kenney 2014 isometric + Tiny Farm 2D critters (Zombie Farm: 3D tiles, cartoon sprites). */

import { FARM_LAND_DIRT, FARM_LAND_GRASS } from "./farmDecor";

export const FARM_TILE_PX = 16;
export const FARM_SHEET = "/farm/kenney-tiny-farm/tilemap_packed.png";
export const CREATURE_SHEET = "/farm/tiny-creatures/tilemap_packed.png";
export const ISO_TRUCK = "/farm/iso/truck.png";

export const ISO_LAND_IDS = [FARM_LAND_GRASS, FARM_LAND_DIRT] as const;
export const ISO_BUILDING_IDS = [12, 18, 25, 33, 41, 48, 55, 62, 70, 77, 85, 92, 100] as const;

/** Plot top: bare dirt, then the same grass block (not canal/shore tiles). */
export const ISO_GRASS_BY_HEIGHT = [
  FARM_LAND_DIRT,
  FARM_LAND_GRASS,
  FARM_LAND_GRASS,
  FARM_LAND_GRASS,
] as const;

export function isoLandKey(id: number): string {
  return `land-${id}`;
}

export function isoLandUrl(id: number): string {
  return `/farm/iso/landscape/landscapeTiles_${String(id).padStart(3, "0")}.png`;
}

export function isoBuildingKey(id: number): string {
  return `b-${id}`;
}

export function isoBuildingUrl(id: number): string {
  return `/farm/iso/buildings/buildingTiles_${String(id).padStart(3, "0")}.png`;
}

export function isoCityKey(id: number): string {
  return `city-${id}`;
}

export function isoCityUrl(id: number): string {
  return `/farm/iso/city/cityDetails_${String(id).padStart(3, "0")}.png`;
}

/** Kenney Tiny Farm packed: 12 columns, 16px. */
export const FF = {
  dirt: 0,
  grass1: 12,
  grass2: 24,
  grass3: 36,
  tree: 15,
  can: 84,
  bucket: 72,
  barrel: 75,
  sack: 74,
  crate: 90,
  sheep: 120,
  cow: 121,
  chicken: 122,
  milk: 123,
  milkPail: 124,
  egg: 125,
  barn: 110,
  door: 126,
  farmer: 108,
} as const;

/** Tiny Creatures packed: 10 columns, tile_0001 = frame 0. Side-view, face left. */
export const CF = {
  chicken: 150,
  cow: 151,
  sheep: 153,
  bear: 163,
  dog: 169,
  raccoon: 178,
} as const;
