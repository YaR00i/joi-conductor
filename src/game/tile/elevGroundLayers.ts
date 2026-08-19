/**
 * Per-elevation ground tile stacks (Minecraft-like columns).
 *
 * Layers are named `ground_z{N}` for N in MIN_ELEVATION…MAX_ELEVATION.
 * Legacy `ground` + `elevation` are kept in sync: elevation = top occupied Z,
 * ground = tile id at that top (for older readers / 2D paint).
 */
import type { EmberMap, EmberTileset, EmberTilesetTile } from "../content/types";
import {
  clampElevation,
  elevationSteps,
  MAX_ELEVATION,
  MIN_ELEVATION,
} from "../content/types";

function layerData(map: EmberMap, name: string): number[] | null {
  return map.layers.find((l) => l.name === name)?.data ?? null;
}

export function elevGroundLayerName(elev: number): string {
  return `ground_z${clampElevation(elev)}`;
}

export function isElevGroundLayerName(name: string): boolean {
  return /^ground_z-?\d+$/.test(name);
}

/** Ensure every elev has a tile layer; migrate once from legacy ground+elevation. */
export function ensureElevGroundLayers(map: EmberMap): EmberMap {
  const n = map.width * map.height;
  const steps = elevationSteps();
  const haveAll = steps.every((e) => layerData(map, elevGroundLayerName(e)));
  if (haveAll) return map;

  const legacyGround = layerData(map, "ground");
  const legacyElev = layerData(map, "elevation");

  let layers = [...map.layers];
  for (const e of steps) {
    const name = elevGroundLayerName(e);
    if (layers.some((l) => l.name === name)) continue;
    layers.push({
      name,
      type: "tile",
      data: new Array<number>(n).fill(0),
    });
  }

  const anyStack = steps.some((e) => {
    const d = layers.find((l) => l.name === elevGroundLayerName(e))?.data;
    return d?.some((v) => (v ?? 0) > 0);
  });

  // One-time: put legacy ground tile into each story from 0..elev (column fill)
  // so existing raised floors keep their look; empty cells stay empty.
  if (legacyGround && !anyStack) {
    layers = layers.map((l) => {
      if (!isElevGroundLayerName(l.name)) return l;
      const e = Number(l.name.slice("ground_z".length));
      if (!Number.isFinite(e)) return l;
      const data = [...l.data];
      for (let i = 0; i < n; i++) {
        const g = legacyGround[i] ?? 0;
        if (!g) continue;
        const top = clampElevation(legacyElev?.[i] ?? 0);
        if (top >= 0 && e >= 0 && e <= top) data[i] = g;
        else if (top < 0 && e === top) data[i] = g;
      }
      return { ...l, data };
    });
  }

  const next: EmberMap = { ...map, layers };
  syncLegacyGroundElevation(next);
  return next;
}

export function elevTileIdAt(
  map: EmberMap,
  tileX: number,
  tileY: number,
  elev: number,
): number {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
    return 0;
  }
  const data = layerData(map, elevGroundLayerName(elev));
  if (!data) return 0;
  return data[tileY * map.width + tileX] ?? 0;
}

export function elevTileAt(
  map: EmberMap,
  tileset: EmberTileset,
  tileX: number,
  tileY: number,
  elev: number,
): EmberTilesetTile | undefined {
  const id = elevTileIdAt(map, tileX, tileY, elev);
  if (!id) return undefined;
  return tileset.tiles.find((t) => t.id === id);
}

/** Highest elev with a non-zero tile, or null if empty. */
export function topOccupiedElevAt(
  map: EmberMap,
  tileX: number,
  tileY: number,
): number | null {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
    return null;
  }
  for (let e = MAX_ELEVATION; e >= MIN_ELEVATION; e--) {
    if (elevTileIdAt(map, tileX, tileY, e)) return e;
  }
  return null;
}

/** Lowest elev with a non-zero tile, or null if empty. */
export function bottomOccupiedElevAt(
  map: EmberMap,
  tileX: number,
  tileY: number,
): number | null {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
    return null;
  }
  for (let e = MIN_ELEVATION; e <= MAX_ELEVATION; e++) {
    if (elevTileIdAt(map, tileX, tileY, e)) return e;
  }
  return null;
}

/**
 * Write a tile into one elev story. Does not clear other stories.
 * Syncs legacy `ground` + `elevation` afterward.
 */
export function setElevTileId(
  map: EmberMap,
  tileX: number,
  tileY: number,
  elev: number,
  tileId: number,
): void {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
    return;
  }
  const e = clampElevation(elev);
  const name = elevGroundLayerName(e);
  let layer = map.layers.find((l) => l.name === name);
  if (!layer) {
    const n = map.width * map.height;
    layer = { name, type: "tile", data: new Array<number>(n).fill(0) };
    map.layers.push(layer);
  }
  const idx = tileY * map.width + tileX;
  layer.data[idx] = Math.max(0, Math.round(tileId));
  syncLegacyGroundElevationAt(map, idx);
}

/** Clear one elev story (Minecraft break). */
export function clearElevTile(
  map: EmberMap,
  tileX: number,
  tileY: number,
  elev: number,
): void {
  setElevTileId(map, tileX, tileY, elev, 0);
  if (map.tileModifiers) {
    const e = clampElevation(elev);
    map.tileModifiers = map.tileModifiers.filter(
      (modifier) =>
        modifier.x !== tileX ||
        modifier.y !== tileY ||
        modifier.elev !== e,
    );
  }
}

/**
 * Move one explicit block story without touching the rest of the column.
 * Occupied targets are rejected instead of silently overwriting another block.
 */
export function moveElevTile(
  map: EmberMap,
  tileX: number,
  tileY: number,
  fromElev: number,
  toElev: number,
): boolean {
  const from = clampElevation(fromElev);
  const to = clampElevation(toElev);
  if (from === to) return true;
  const tileId = elevTileIdAt(map, tileX, tileY, from);
  if (!tileId || elevTileIdAt(map, tileX, tileY, to)) return false;
  setElevTileId(map, tileX, tileY, to, tileId);
  if (map.tileModifiers) {
    map.tileModifiers = map.tileModifiers.map((modifier) =>
      modifier.x === tileX &&
      modifier.y === tileY &&
      modifier.elev === from
        ? { ...modifier, elev: to }
        : modifier,
    );
  }
  clearElevTile(map, tileX, tileY, from);
  return true;
}

/** Fill every story from Z0 to `topElev` with one block (solid column). */
export function fillElevColumn(
  map: EmberMap,
  tileX: number,
  tileY: number,
  topElev: number,
  tileId: number,
): void {
  const top = clampElevation(topElev);
  if (top < 0) {
    setElevTileId(map, tileX, tileY, top, tileId);
    return;
  }
  for (let elev = 0; elev <= top; elev++) {
    setElevTileId(map, tileX, tileY, elev, tileId);
  }
}

/**
 * Turn a formerly filled raised column into floor + independent top slab.
 * Z0 and the selected top stay intact; intermediate stories become air.
 */
export function hollowElevColumn(
  map: EmberMap,
  tileX: number,
  tileY: number,
  topElev: number,
): void {
  const top = clampElevation(topElev);
  for (let elev = 1; elev < top; elev++) {
    clearElevTile(map, tileX, tileY, elev);
  }
}

function syncLegacyGroundElevationAt(map: EmberMap, idx: number): void {
  const tx = idx % map.width;
  const ty = Math.floor(idx / map.width);
  const top = topOccupiedElevAt(map, tx, ty);
  let ground = map.layers.find((l) => l.name === "ground");
  if (!ground) {
    ground = {
      name: "ground",
      type: "tile",
      data: new Array<number>(map.width * map.height).fill(0),
    };
    map.layers.push(ground);
  }
  let elevation = map.layers.find((l) => l.name === "elevation");
  if (!elevation) {
    elevation = {
      name: "elevation",
      type: "tile",
      data: new Array<number>(map.width * map.height).fill(0),
    };
    map.layers.push(elevation);
  }
  if (top == null) {
    ground.data[idx] = 0;
    elevation.data[idx] = 0;
    return;
  }
  ground.data[idx] = elevTileIdAt(map, tx, ty, top);
  elevation.data[idx] = top;
}

/** Sync every cell's legacy ground/elevation from the stack. */
export function syncLegacyGroundElevation(map: EmberMap): void {
  const n = map.width * map.height;
  for (let i = 0; i < n; i++) syncLegacyGroundElevationAt(map, i);
}

export { MIN_ELEVATION, MAX_ELEVATION, elevationSteps, clampElevation };
