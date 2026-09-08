/**
 * Homestead field sim. Phaser only renders snapshots from here.
 */

import {
  FARM_ANIMALS,
  FARM_BUILD_GOLD,
  FARM_CROPS,
  FARM_FACTORIES,
  FARM_ITEMS,
  farmCropRipeMs,
  farmItemSlots,
  warehouseUsed,
  type FarmAnimalKind,
  type FarmCropKind,
  type FarmFactoryKind,
  type FarmItemId,
} from "./farmItems";

export type FarmGoal =
  | { kind: "gold"; amount: number }
  | { kind: "sold"; item: FarmItemId; amount: number }
  | { kind: "have"; item: FarmItemId; amount: number };

export type FarmUpgrades = {
  wellCap: number;
  wellRefillCost: number;
  warehouseCap: number;
  truckCap: number;
  truckTravelMs: number;
  factorySpeed: number;
  hasCat: boolean;
  hasDog: boolean;
};

export const DEFAULT_FARM_UPGRADES: FarmUpgrades = {
  wellCap: 8,
  wellRefillCost: 10,
  warehouseCap: 6,
  truckCap: 6,
  truckTravelMs: 7000,
  factorySpeed: 1,
  hasCat: false,
  hasDog: false,
};

export type FarmLevelSpec = {
  id: string;
  cols: number;
  rows: number;
  startGold: number;
  startWater: number;
  /** Grass height 0..3 on a 3×3 patch in the field center. */
  startGrass: number;
  startAnimals: ReadonlyArray<{ kind: FarmAnimalKind; n: number }>;
  factories: readonly FarmFactoryKind[];
  shop: readonly FarmAnimalKind[];
  pests: boolean;
  pestFirstMs: number;
  pestEveryMs: number;
  dropDespawnMs: number;
  timeLimitMs: number;
  silverMs: number;
  goldMs: number;
  goals: readonly FarmGoal[];
  inspections: readonly number[];
};

/** 0 = no round timer. */
export type FarmFieldTool = "water" | FarmCropKind;

export type FarmCrop = {
  kind: FarmCropKind;
  growMs: number;
};

export type FarmMover = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type FarmAnimal = FarmMover & {
  id: number;
  kind: FarmAnimalKind;
  hungerMs: number;
  produceMs: number;
  chewMs: number;
  wanderTx: number;
  wanderTy: number;
  wanderMs: number;
};

export type FarmDrop = {
  id: number;
  item: FarmItemId;
  x: number;
  y: number;
  ageMs: number;
};

export type FarmPest = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  cage: number;
  caged: boolean;
};

export type FarmFactoryState = {
  kind: FarmFactoryKind;
  busyMs: number;
  totalMs: number;
};

export type FarmTruck = {
  awayMs: number;
  cargo: FarmItemId[];
};

export type FarmWorld = {
  spec: FarmLevelSpec;
  upgrades: FarmUpgrades;
  cols: number;
  rows: number;
  /** 0 = bare, 1..3 = grass height. */
  grass: number[];
  /** Parallel to grass; a cell is pasture or a crop, not both. */
  crops: Array<FarmCrop | null>;
  gold: number;
  water: number;
  xp: number;
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
  won: boolean;
  failed: boolean;
};

export type FarmEvent =
  | { kind: "collect"; item: FarmItemId }
  | { kind: "sold"; gold: number }
  | { kind: "starve"; reason: "hunger" | "bear"; nameRu: string }
  | { kind: "hungry"; nameRu: string }
  | { kind: "harvest"; item: FarmItemId }
  | { kind: "planted"; nameRu: string }
  | { kind: "built"; nameRu: string }
  | { kind: "rot"; item: FarmItemId }
  | { kind: "pest" }
  | { kind: "win" }
  | { kind: "fail" }
  | { kind: "full" };

const GRASS_MAX = 3;
const PEST_CAGE_HITS = 4;
const PEST_SPEED = 1.7;
const DROP_PICK_R = 0.65;

export function idx(w: FarmWorld, x: number, y: number): number {
  return y * w.cols + x;
}

export function inField(w: FarmWorld, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < w.cols && y < w.rows;
}

export function createFarmWorld(
  spec: FarmLevelSpec,
  upgrades: FarmUpgrades,
  rng: () => number,
): FarmWorld {
  const w: FarmWorld = {
    spec: {
      ...spec,
      startAnimals: spec.startAnimals.map((a) => ({ ...a })),
      factories: [...spec.factories],
      shop: [...spec.shop],
      goals: [...spec.goals],
      inspections: [...spec.inspections],
    },
    upgrades,
    cols: spec.cols,
    rows: spec.rows,
    grass: Array.from({ length: spec.cols * spec.rows }, () => 0),
    crops: Array.from({ length: spec.cols * spec.rows }, () => null),
    gold: spec.startGold,
    water: Math.min(spec.startWater, upgrades.wellCap),
    xp: 0,
    animals: [],
    drops: [],
    pests: [],
    warehouse: [],
    sold: {},
    factories: spec.factories.map((kind) => ({ kind, busyMs: 0, totalMs: 0 })),
    truck: { awayMs: 0, cargo: [] },
    cat: upgrades.hasCat ? { x: 0.8, y: spec.rows - 0.8, vx: 0, vy: 0 } : null,
    dog: upgrades.hasDog ? { x: 1.6, y: spec.rows - 0.8, vx: 0, vy: 0 } : null,
    elapsedMs: 0,
    nextPestMs: spec.pests ? spec.pestFirstMs : Number.POSITIVE_INFINITY,
    nextId: 1,
    starved: 0,
    rotten: 0,
    won: false,
    failed: false,
  };
  plantStartGrass(w);
  for (const a of spec.startAnimals) {
    for (let i = 0; i < a.n; i++) spawnAnimal(w, a.kind, rng);
  }
  return w;
}

function plantStartGrass(w: FarmWorld): void {
  const height = Math.max(0, Math.min(GRASS_MAX, Math.floor(w.spec.startGrass)));
  if (height <= 0) return;
  const cx = Math.floor(w.cols / 2);
  const cy = Math.floor(w.rows / 2);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (!inField(w, x, y)) continue;
      w.grass[idx(w, x, y)] = height;
    }
  }
}

function spawnAnimal(w: FarmWorld, kind: FarmAnimalKind, rng: () => number): void {
  const x = 1 + rng() * Math.max(1, w.cols - 2);
  const y = 1 + rng() * Math.max(1, w.rows - 2);
  w.animals.push({
    id: w.nextId++,
    kind,
    x,
    y,
    hungerMs: 0,
    chewMs: 0,
    produceMs: FARM_ANIMALS[kind].produceSec * 1000 * (0.4 + rng() * 0.3),
    vx: 0,
    vy: 0,
    wanderTx: x,
    wanderTy: y,
    wanderMs: 0,
  });
}

export function cropRipe(c: FarmCrop | null | undefined): boolean {
  if (!c) return false;
  return c.growMs >= farmCropRipeMs(c.kind);
}

export function cropStage(c: FarmCrop): 1 | 2 | 3 {
  const t = c.growMs / farmCropRipeMs(c.kind);
  if (t >= 1) return 3;
  if (t >= 0.45) return 2;
  return 1;
}

export function warehouseFree(w: FarmWorld): number {
  return w.upgrades.warehouseCap - warehouseUsed(w.warehouse);
}

export function tryStore(w: FarmWorld, item: FarmItemId): boolean {
  if (farmItemSlots(item) > warehouseFree(w)) return false;
  w.warehouse.push(item);
  return true;
}

function takeFromWarehouse(w: FarmWorld, item: FarmItemId): boolean {
  const i = w.warehouse.indexOf(item);
  if (i < 0) return false;
  w.warehouse.splice(i, 1);
  return true;
}

export function countHave(w: FarmWorld, item: FarmItemId): number {
  return w.warehouse.filter((x) => x === item).length;
}

export function countSold(w: FarmWorld, item: FarmItemId): number {
  return w.sold[item] ?? 0;
}

export function goalsMet(w: FarmWorld): boolean {
  for (const g of w.spec.goals) {
    switch (g.kind) {
      case "gold":
        if (w.gold < g.amount) return false;
        break;
      case "sold":
        if (countSold(w, g.item) < g.amount) return false;
        break;
      case "have":
        if (countHave(w, g.item) < g.amount) return false;
        break;
      default: {
        const _never: never = g;
        void _never;
        return false;
      }
    }
  }
  return w.spec.goals.length > 0;
}

export function animalIsHungry(a: FarmAnimal): boolean {
  return a.hungerMs > FARM_ANIMALS[a.kind].starveSec * 450;
}

export function farmMessCount(w: FarmWorld): number {
  const hungry = w.animals.filter(animalIsHungry).length;
  const loose = w.pests.filter((p) => !p.caged).length;
  const rotting = w.drops.filter((d) => d.ageMs > w.spec.dropDespawnMs * 0.55).length;
  return hungry + loose + rotting;
}

export function farmMessSummaryRu(w: FarmWorld): string {
  const parts: string[] = [];
  const hungry = w.animals.filter(animalIsHungry).length;
  const loose = w.pests.filter((p) => !p.caged).length;
  const rotting = w.drops.filter((d) => d.ageMs > w.spec.dropDespawnMs * 0.55).length;
  if (hungry) parts.push(hungry === 1 ? "скот голоден" : `голодных ${hungry}`);
  if (loose) parts.push(loose === 1 ? "медведь на поле" : `медведей ${loose}`);
  if (rotting) parts.push(rotting === 1 ? "товар гниёт" : `гниль ${rotting}`);
  return parts.join(", ");
}

function pickWander(m: FarmMover & { wanderTx: number; wanderTy: number; wanderMs: number }, w: FarmWorld, rng: () => number): void {
  const cx = Math.min(w.cols - 1, Math.max(0, Math.floor(rng() * w.cols)));
  const cy = Math.min(w.rows - 1, Math.max(0, Math.floor(rng() * w.rows)));
  m.wanderTx = cx + 0.5;
  m.wanderTy = cy + 0.5;
  m.wanderMs = 700 + rng() * 1100;
}

function wanderOrStand(
  m: FarmMover & { wanderTx: number; wanderTy: number; wanderMs: number },
  speed: number,
  dt: number,
  w: FarmWorld,
  rng: () => number,
): void {
  m.wanderMs -= dt;
  if (m.wanderMs <= 0) pickWander(m, w, rng);
  const dist = Math.hypot(m.wanderTx - m.x, m.wanderTy - m.y);
  if (dist < 0.22) {
    m.vx = 0;
    m.vy = 0;
    return;
  }
  moveToward(m, m.wanderTx, m.wanderTy, speed, dt, w);
}

function cellOf(x: number, y: number): { cx: number; cy: number } {
  return { cx: Math.floor(x), cy: Math.floor(y) };
}

function nearestGrass(w: FarmWorld, x: number, y: number): { cx: number; cy: number } | null {
  let best: { cx: number; cy: number; d: number } | null = null;
  for (let cy = 0; cy < w.rows; cy++) {
    for (let cx = 0; cx < w.cols; cx++) {
      if (w.grass[idx(w, cx, cy)] <= 0) continue;
      if (w.crops[idx(w, cx, cy)]) continue;
      const d = (cx + 0.5 - x) ** 2 + (cy + 0.5 - y) ** 2;
      if (!best || d < best.d) best = { cx, cy, d };
    }
  }
  return best;
}

function moveToward(
  e: { x: number; y: number; vx?: number; vy?: number },
  tx: number,
  ty: number,
  speed: number,
  dt: number,
  w: FarmWorld,
): void {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const len = Math.hypot(dx, dy) || 1;
  const step = speed * (dt / 1000);
  e.x = Math.max(0.3, Math.min(w.cols - 0.3, e.x + (dx / len) * step));
  e.y = Math.max(0.3, Math.min(w.rows - 0.3, e.y + (dy / len) * step));
  e.vx = dx / len;
  e.vy = dy / len;
}

function spawnDrop(w: FarmWorld, item: FarmItemId, x: number, y: number): void {
  w.drops.push({
    id: w.nextId++,
    item,
    x: Math.max(0.4, Math.min(w.cols - 0.4, x)),
    y: Math.max(0.4, Math.min(w.rows - 0.4, y)),
    ageMs: 0,
  });
}

function collectDrop(w: FarmWorld, drop: FarmDrop, events: FarmEvent[]): boolean {
  if (!tryStore(w, drop.item)) {
    events.push({ kind: "full" });
    return false;
  }
  w.drops = w.drops.filter((d) => d.id !== drop.id);
  events.push({ kind: "collect", item: drop.item });
  w.xp += 1;
  return true;
}

function eatAt(w: FarmWorld, a: FarmAnimal): boolean {
  const { cx, cy } = cellOf(a.x, a.y);
  if (!inField(w, cx, cy)) return false;
  const i = idx(w, cx, cy);
  if (w.crops[i] || w.grass[i] <= 0) return false;
  w.grass[i] -= 1;
  a.hungerMs = 0;
  return true;
}

function harvestCrop(w: FarmWorld, i: number, events: FarmEvent[]): boolean {
  const crop = w.crops[i];
  if (!cropRipe(crop) || !crop) return false;
  const item = FARM_CROPS[crop.kind].yield;
  if (!tryStore(w, item)) {
    events.push({ kind: "full" });
    return false;
  }
  w.crops[i] = null;
  events.push({ kind: "harvest", item });
  w.xp += 2;
  return true;
}

export function clickTile(
  w: FarmWorld,
  x: number,
  y: number,
  events: FarmEvent[],
  tool: FarmFieldTool = "water",
): void {
  if (w.won || w.failed) return;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (!inField(w, cx, cy)) return;

  const pest = w.pests.find(
    (p) => Math.hypot(p.x - x, p.y - y) < 0.8,
  );
  if (pest) {
    clickPest(w, pest, events);
    return;
  }

  const drop = w.drops.find((d) => Math.hypot(d.x - x, d.y - y) < DROP_PICK_R);
  if (drop) {
    collectDrop(w, drop, events);
    return;
  }

  const i = idx(w, cx, cy);
  if (harvestCrop(w, i, events)) return;

  if (tool !== "water") {
    const meta = FARM_CROPS[tool];
    if (w.gold < meta.seedGold || w.water <= 0) return;
    if (w.crops[i] && !cropRipe(w.crops[i])) return;
    w.gold -= meta.seedGold;
    w.water -= 1;
    w.grass[i] = 0;
    w.crops[i] = { kind: tool, growMs: 0 };
    events.push({ kind: "planted", nameRu: meta.nameRu });
    return;
  }

  if (w.water <= 0) return;
  if (w.crops[i]) return;
  if (w.grass[i] >= GRASS_MAX) return;
  w.grass[i] += 1;
  w.water -= 1;
}

export function clickWell(w: FarmWorld): boolean {
  if (w.won || w.failed) return false;
  if (w.water >= w.upgrades.wellCap) return false;
  if (w.gold < w.upgrades.wellRefillCost) return false;
  w.gold -= w.upgrades.wellRefillCost;
  w.water = w.upgrades.wellCap;
  return true;
}

export function clickBuy(w: FarmWorld, kind: FarmAnimalKind, rng: () => number): boolean {
  if (w.won || w.failed) return false;
  if (!w.spec.shop.includes(kind)) return false;
  const cost = FARM_ANIMALS[kind].buyGold;
  if (w.gold < cost) return false;
  w.gold -= cost;
  spawnAnimal(w, kind, rng);
  w.xp += 3;
  return true;
}

export function clickBuildFactory(w: FarmWorld, kind: FarmFactoryKind, events: FarmEvent[]): boolean {
  if (w.won || w.failed) return false;
  if (w.factories.some((f) => f.kind === kind)) return false;
  const cost = FARM_BUILD_GOLD[kind];
  if (w.gold < cost) return false;
  w.gold -= cost;
  w.factories.push({ kind, busyMs: 0, totalMs: 0 });
  if (!w.spec.factories.includes(kind)) {
    w.spec.factories = [...w.spec.factories, kind];
  }
  events.push({ kind: "built", nameRu: FARM_FACTORIES[kind].nameRu });
  w.xp += 8;
  return true;
}

export function clickFactory(w: FarmWorld, kind: FarmFactoryKind, events: FarmEvent[]): boolean {
  if (w.won || w.failed) return false;
  const f = w.factories.find((x) => x.kind === kind);
  if (!f || f.busyMs > 0) return false;
  const meta = FARM_FACTORIES[kind];
  if (!takeFromWarehouse(w, meta.input)) return false;
  const dur = (meta.craftSec * 1000) / Math.max(0.5, w.upgrades.factorySpeed);
  f.busyMs = dur;
  f.totalMs = dur;
  void events;
  return true;
}

export function clickTruck(w: FarmWorld): boolean {
  if (w.won || w.failed) return false;
  if (w.truck.awayMs > 0) return false;
  if (w.warehouse.length === 0) return false;
  const cargo: FarmItemId[] = [];
  let used = 0;
  const left: FarmItemId[] = [];
  for (const item of w.warehouse) {
    const s = farmItemSlots(item);
    if (used + s <= w.upgrades.truckCap) {
      cargo.push(item);
      used += s;
    } else {
      left.push(item);
    }
  }
  if (cargo.length === 0) return false;
  w.warehouse = left;
  w.truck.cargo = cargo;
  w.truck.awayMs = w.upgrades.truckTravelMs;
  return true;
}

function clickPest(w: FarmWorld, pest: FarmPest, events: FarmEvent[]): void {
  if (pest.caged) {
    spawnDrop(w, "bear", pest.x, pest.y);
    w.pests = w.pests.filter((p) => p.id !== pest.id);
    return;
  }
  pest.cage += 1;
  if (pest.cage >= PEST_CAGE_HITS) {
    pest.caged = true;
    events.push({ kind: "pest" });
  }
}

function finishTruck(w: FarmWorld, events: FarmEvent[]): void {
  let gold = 0;
  for (const item of w.truck.cargo) {
    gold += FARM_ITEMS[item].sell;
    w.sold[item] = (w.sold[item] ?? 0) + 1;
  }
  w.gold += gold;
  w.truck.cargo = [];
  w.truck.awayMs = 0;
  if (gold > 0) {
    events.push({ kind: "sold", gold });
    w.xp += Math.max(1, Math.floor(gold / 5));
  }
}

export function stepFarmWorld(
  w: FarmWorld,
  dtMs: number,
  rng: () => number,
): FarmEvent[] {
  const events: FarmEvent[] = [];
  if (w.won || w.failed) return events;
  const dt = Math.max(0, Math.min(200, dtMs));
  w.elapsedMs += dt;

  if (w.truck.awayMs > 0) {
    w.truck.awayMs -= dt;
    if (w.truck.awayMs <= 0) finishTruck(w, events);
  }

  for (const f of w.factories) {
    if (f.busyMs <= 0) continue;
    f.busyMs -= dt;
    if (f.busyMs <= 0) {
      f.busyMs = 0;
      const meta = FARM_FACTORIES[f.kind];
      spawnDrop(w, meta.output, w.cols - 1.2, 1 + w.factories.indexOf(f) * 1.4);
    }
  }

  for (let i = 0; i < w.crops.length; i++) {
    const crop = w.crops[i];
    if (!crop || cropRipe(crop)) continue;
    crop.growMs += dt;
  }

  for (const a of w.animals) {
    const meta = FARM_ANIMALS[a.kind];
    const wasHungry = animalIsHungry(a);
    a.hungerMs = Math.min(meta.starveSec * 1000, a.hungerMs + dt);
    a.produceMs += dt;
    if (a.chewMs > 0) {
      a.chewMs -= dt;
      a.vx = 0;
      a.vy = 0;
      if (a.chewMs <= 0) {
        a.chewMs = 0;
        eatAt(w, a);
      }
    } else {
      const grass = nearestGrass(w, a.x, a.y);
      if (grass) {
        const tx = grass.cx + 0.5;
        const ty = grass.cy + 0.5;
        if (Math.hypot(tx - a.x, ty - a.y) < 0.45) {
          a.chewMs = meta.eatSec * 1000;
          a.vx = 0;
          a.vy = 0;
        } else {
          moveToward(a, tx, ty, meta.speed, dt, w);
        }
      } else {
        wanderOrStand(a, meta.speed * 0.55, dt, w, rng);
      }
    }
    if (!wasHungry && animalIsHungry(a)) {
      events.push({ kind: "hungry", nameRu: meta.nameRu });
    }
    if (a.produceMs >= meta.produceSec * 1000 && !animalIsHungry(a)) {
      a.produceMs = 0;
      spawnDrop(w, meta.produce, a.x, a.y);
    }
  }

  for (const d of [...w.drops]) {
    d.ageMs += dt;
    if (d.ageMs >= w.spec.dropDespawnMs) {
      w.drops = w.drops.filter((x) => x.id !== d.id);
      w.rotten += 1;
      events.push({ kind: "rot", item: d.item });
    }
  }

  if (w.spec.pests && w.elapsedMs >= w.nextPestMs) {
    w.nextPestMs = w.elapsedMs + w.spec.pestEveryMs;
    w.pests.push({
      id: w.nextId++,
      x: rng() * w.cols,
      y: 0.4,
      vx: 0,
      vy: 0,
      cage: 0,
      caged: false,
    });
    events.push({ kind: "pest" });
  }

  for (const p of w.pests) {
    if (p.caged) continue;
    if (w.dog) {
      moveToward(w.dog, p.x, p.y, 2.6, dt, w);
      if (Math.hypot(w.dog.x - p.x, w.dog.y - p.y) < 0.7) {
        moveToward(p, 0.3, 0.3, PEST_SPEED * 1.4, dt, w);
        continue;
      }
    }
    const prey = w.animals[0];
    if (prey) {
      moveToward(p, prey.x, prey.y, PEST_SPEED, dt, w);
      if (Math.hypot(p.x - prey.x, p.y - prey.y) < 0.55 && !animalIsHungry(prey)) {
        prey.hungerMs = FARM_ANIMALS[prey.kind].starveSec * 600;
        prey.produceMs = 0;
        w.starved += 1;
        events.push({
          kind: "starve",
          reason: "bear",
          nameRu: FARM_ANIMALS[prey.kind].nameRu,
        });
      }
    }
  }

  if (w.dog && !w.pests.some((p) => !p.caged)) {
    w.dog.vx = 0;
    w.dog.vy = 0;
  }

  if (w.cat) {
    const d = w.drops[0];
    if (d) {
      if (Math.hypot(w.cat.x - d.x, w.cat.y - d.y) < 0.45) collectDrop(w, d, events);
      else moveToward(w.cat, d.x, d.y, 2.3, dt, w);
    } else {
      w.cat.vx = 0;
      w.cat.vy = 0;
    }
  }

  if (goalsMet(w)) {
    w.won = true;
    events.push({ kind: "win" });
    return events;
  }
  if (w.spec.timeLimitMs > 0 && w.elapsedMs >= w.spec.timeLimitMs) {
    w.failed = true;
    events.push({ kind: "fail" });
  }
  return events;
}
