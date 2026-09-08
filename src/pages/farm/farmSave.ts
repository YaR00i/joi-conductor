/**
 * Persistent homestead snapshot. Phaser never writes storage.
 */

import {
  defaultFarmRanks,
  farmUpgradesFrom,
  homesteadSpec,
  type FarmRanks,
} from "./farmCampaign";
import type { FarmCropKind, FarmFactoryKind, FarmItemId } from "./farmItems";
import {
  createFarmWorld,
  type FarmAnimal,
  type FarmCrop,
  type FarmDrop,
  type FarmFactoryState,
  type FarmMover,
  type FarmPest,
  type FarmTruck,
  type FarmWorld,
} from "./farmSim";

export const FARM_WORLD_KEY = "joi-farm-world-v1";
const LEGACY_CAMPAIGN_KEY = "joi-farm-campaign-v1";

/** XP thresholds: index = farm level. Level 1 starts at 0. */
export const FARM_LEVEL_XP = [0, 0, 50, 130, 240, 380, 560] as const;

export function farmLevelFromXp(xp: number): number {
  const n = Math.max(0, xp);
  let lvl = 1;
  for (let i = 2; i < FARM_LEVEL_XP.length; i++) {
    if (n >= FARM_LEVEL_XP[i]) lvl = i;
  }
  return lvl;
}

export function farmXpBar(xp: number): { level: number; have: number; need: number } {
  const level = farmLevelFromXp(xp);
  const floor = FARM_LEVEL_XP[level] ?? 0;
  const next = FARM_LEVEL_XP[level + 1];
  return {
    level,
    have: nSafe(xp) - floor,
    need: next == null ? 0 : next - floor,
  };
}

function nSafe(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export type FarmWorldSnap = {
  cols: number;
  rows: number;
  gold: number;
  water: number;
  xp: number;
  grass: number[];
  crops: Array<{ kind: FarmCropKind; growMs: number } | null>;
  animals: FarmAnimal[];
  drops: FarmDrop[];
  pests: FarmPest[];
  warehouse: FarmItemId[];
  sold: Partial<Record<FarmItemId, number>>;
  factories: FarmFactoryState[];
  truck: FarmTruck;
  cat: FarmMover | null;
  dog: FarmMover | null;
  elapsedMs: number;
  nextPestMs: number;
  nextId: number;
  starved: number;
  rotten: number;
};

export type FarmDisk = {
  v: 1;
  ranks: FarmRanks;
  world: FarmWorldSnap;
};

export function snapshotFarmWorld(w: FarmWorld): FarmWorldSnap {
  return {
    cols: w.cols,
    rows: w.rows,
    gold: w.gold,
    water: w.water,
    xp: w.xp,
    grass: [...w.grass],
    crops: w.crops.map((c) => (c ? { kind: c.kind, growMs: c.growMs } : null)),
    animals: w.animals.map((a) => ({ ...a })),
    drops: w.drops.map((d) => ({ ...d })),
    pests: w.pests.map((p) => ({ ...p })),
    warehouse: [...w.warehouse],
    sold: { ...w.sold },
    factories: w.factories.map((f) => ({ ...f })),
    truck: { awayMs: w.truck.awayMs, cargo: [...w.truck.cargo] },
    cat: w.cat ? { ...w.cat } : null,
    dog: w.dog ? { ...w.dog } : null,
    elapsedMs: w.elapsedMs,
    nextPestMs: w.nextPestMs,
    nextId: w.nextId,
    starved: w.starved,
    rotten: w.rotten,
  };
}

export function applyFarmSnap(w: FarmWorld, snap: FarmWorldSnap): void {
  w.gold = snap.gold;
  w.water = snap.water;
  w.xp = snap.xp;
  w.grass = [...snap.grass];
  w.crops = snap.crops.map((c) => (c ? { kind: c.kind, growMs: c.growMs } : null)) as Array<FarmCrop | null>;
  w.animals = snap.animals.map((a) => ({
    ...a,
    chewMs: a.chewMs ?? 0,
    wanderMs: a.wanderMs ?? 0,
    wanderTx: a.wanderTx ?? a.x,
    wanderTy: a.wanderTy ?? a.y,
    vx: a.vx ?? 0,
    vy: a.vy ?? 0,
  }));
  w.drops = snap.drops.map((d) => ({ ...d }));
  w.pests = snap.pests.map((p) => ({ ...p }));
  w.warehouse = [...snap.warehouse];
  w.sold = { ...snap.sold };
  w.factories = snap.factories.map((f) => ({ ...f }));
  w.truck = { awayMs: snap.truck.awayMs, cargo: [...snap.truck.cargo] };
  w.cat = snap.cat ? { ...snap.cat } : w.cat;
  w.dog = snap.dog ? { ...snap.dog } : w.dog;
  w.elapsedMs = snap.elapsedMs;
  w.nextPestMs = snap.nextPestMs;
  w.nextId = snap.nextId;
  w.starved = snap.starved;
  w.rotten = snap.rotten;
  const kinds = [...new Set(w.factories.map((f) => f.kind))] as FarmFactoryKind[];
  w.spec.factories = kinds;
}

export function bootFarmWorld(rng: () => number, disk?: FarmDisk | null): FarmWorld {
  const ranks = disk?.ranks ?? defaultFarmRanks();
  const upgrades = farmUpgradesFrom(ranks);
  if (!disk) {
    const spec = homesteadSpec(1);
    return createFarmWorld(spec, upgrades, rng);
  }
  const level = farmLevelFromXp(disk.world.xp);
  const spec = homesteadSpec(level);
  spec.factories = disk.world.factories.map((f) => f.kind);
  spec.pests = homesteadSpec(level).pests;
  const w = createFarmWorld({ ...spec, startAnimals: [] }, upgrades, rng);
  applyFarmSnap(w, disk.world);
  w.upgrades = upgrades;
  if (upgrades.hasCat && !w.cat) w.cat = { x: 0.8, y: w.rows - 0.8, vx: 0, vy: 0 };
  if (!upgrades.hasCat) w.cat = null;
  if (upgrades.hasDog && !w.dog) w.dog = { x: 1.6, y: w.rows - 0.8, vx: 0, vy: 0 };
  if (!upgrades.hasDog) w.dog = null;
  w.spec.shop = homesteadSpec(farmLevelFromXp(w.xp)).shop;
  w.spec.pests = homesteadSpec(farmLevelFromXp(w.xp)).pests;
  return w;
}

export function syncFarmUnlocks(w: FarmWorld): void {
  const u = homesteadSpec(farmLevelFromXp(w.xp));
  w.spec.shop = u.shop;
  w.spec.pests = u.pests;
}

export function packFarmDisk(w: FarmWorld, ranks: FarmRanks): FarmDisk {
  return { v: 1, ranks, world: snapshotFarmWorld(w) };
}

function parseDisk(raw: string): FarmDisk | null {
  try {
    const p = JSON.parse(raw) as Partial<FarmDisk>;
    if (p.v !== 1 || !p.world || typeof p.world.gold !== "number") return null;
    return {
      v: 1,
      ranks: { ...defaultFarmRanks(), ...(p.ranks ?? {}) },
      world: p.world as FarmWorldSnap,
    };
  } catch {
    return null;
  }
}

function migrateLegacyCampaign(): FarmDisk | null {
  try {
    const raw = localStorage.getItem(LEGACY_CAMPAIGN_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as {
      bank?: number;
      ranks?: Partial<FarmRanks>;
    };
    const ranks = { ...defaultFarmRanks(), ...(p.ranks ?? {}) };
    const bank = typeof p.bank === "number" ? Math.max(0, p.bank) : 0;
    const rng = () => 0.42;
    const w = bootFarmWorld(rng, null);
    w.gold += bank * 12;
    w.xp += bank * 18;
    localStorage.removeItem(LEGACY_CAMPAIGN_KEY);
    return packFarmDisk(w, ranks);
  } catch {
    return null;
  }
}

export function loadFarmDisk(): FarmDisk | null {
  try {
    const raw = localStorage.getItem(FARM_WORLD_KEY);
    if (raw) return parseDisk(raw);
    return migrateLegacyCampaign();
  } catch {
    return null;
  }
}

export function saveFarmDisk(disk: FarmDisk): void {
  try {
    localStorage.setItem(FARM_WORLD_KEY, JSON.stringify(disk));
  } catch {
    // ignore
  }
}
