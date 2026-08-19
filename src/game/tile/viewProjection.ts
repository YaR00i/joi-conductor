import type { EmberMap } from "../content/types";
import type { RampDir } from "../content/types";
import { WALL_HEIGHT } from "./extruded";

/**
 * Orthographic map cameras (same 2.5D extrusion, different yaw):
 * - top:       near = south
 * - sideEast:  near = east
 * - sideWest:  near = west
 * - sideNorth: near = north
 */
export type MapViewMode = "top" | "sideEast" | "sideWest" | "sideNorth";

export const MAP_VIEW_MODES: MapViewMode[] = [
  "top",
  "sideEast",
  "sideWest",
  "sideNorth",
];

export function nextMapViewMode(mode: MapViewMode): MapViewMode {
  const i = MAP_VIEW_MODES.indexOf(mode);
  return MAP_VIEW_MODES[(i + 1) % MAP_VIEW_MODES.length]!;
}

/** Arrow keys → camera facing that compass side (Down = default top). */
export function mapViewModeFromArrow(code: string): MapViewMode | null {
  switch (code) {
    case "ArrowUp":
      return "sideNorth";
    case "ArrowDown":
      return "top";
    case "ArrowLeft":
      return "sideWest";
    case "ArrowRight":
      return "sideEast";
    default:
      return null;
  }
}

export function mapViewModeLabelRu(mode: MapViewMode): string {
  switch (mode) {
    case "top":
      return "Сверху";
    case "sideEast":
      return "С востока";
    case "sideWest":
      return "С запада";
    case "sideNorth":
      return "С севера";
    default: {
      const _n: never = mode;
      return _n;
    }
  }
}

/**
 * Map camera-relative move (WASD / screen axes) into logical world deltas.
 * cam: +x = right on screen, +y = down on screen (W = -y).
 * world: +x = east, +y = south.
 */
export function cameraMoveToWorld(
  mode: MapViewMode,
  camVx: number,
  camVy: number,
): { vx: number; vy: number } {
  switch (mode) {
    case "top":
      return { vx: camVx, vy: camVy };
    case "sideEast":
      // right→south, down→east (toward camera)
      return { vx: camVy, vy: camVx };
    case "sideWest":
      // right→north, down→west (toward camera)
      return { vx: -camVy, vy: -camVx };
    case "sideNorth":
      // right→west, down→north (toward camera); up→south into the map
      return { vx: -camVx, vy: -camVy };
    default: {
      const _n: never = mode;
      return _n;
    }
  }
}

function layerData(map: EmberMap, name: string): number[] | null {
  return map.layers.find((l) => l.name === name)?.data ?? null;
}

function elevAt(map: EmberMap, tx: number, ty: number): number {
  const e = layerData(map, "elevation");
  if (!e || tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return 0;
  return e[ty * map.width + tx] ?? 0;
}

/** Raw height cell → voxels (legacy 1..8 = stories). */
function heightRawToVoxels(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (raw <= 8) return Math.round(raw) * WALL_HEIGHT;
  return Math.round(raw);
}

function wallStoriesAt(map: EmberMap, tx: number, ty: number): number {
  const h = layerData(map, "height");
  if (!h || tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return 0;
  const vox = heightRawToVoxels(h[ty * map.width + tx] ?? 0);
  if (vox <= 0) return 0;
  return Math.max(1, Math.ceil(vox / WALL_HEIGHT));
}

function maxElev(map: EmberMap): number {
  const e = layerData(map, "elevation");
  if (!e) return 0;
  let m = 0;
  for (const v of e) m = Math.max(m, v ?? 0);
  return m;
}

function maxWall(map: EmberMap): number {
  const h = layerData(map, "height");
  if (!h) return 1;
  let m = 1;
  for (const v of h) {
    const vox = heightRawToVoxels(v ?? 0);
    if (vox > 0) m = Math.max(m, Math.ceil(vox / WALL_HEIGHT));
  }
  return Math.max(1, m);
}

type ViewPadInfo = { pad: number; maxElev: number; maxWall: number };

/** Avoid rescanning elevation/height layers on every project/collision call. */
const viewPadCache = new WeakMap<EmberMap, ViewPadInfo>();

export function getViewPadInfo(map: EmberMap): ViewPadInfo {
  let info = viewPadCache.get(map);
  if (!info) {
    const elevM = maxElev(map);
    const wallM = maxWall(map);
    info = {
      maxElev: elevM,
      maxWall: wallM,
      pad: WALL_HEIGHT * (elevM + wallM),
    };
    viewPadCache.set(map, info);
  }
  return info;
}

export function invalidateViewPadCache(map: EmberMap): void {
  viewPadCache.delete(map);
}

export function viewVerticalPad(map: EmberMap): number {
  return getViewPadInfo(map).pad;
}

export function viewElevOffset(elev: number): number {
  return elev * WALL_HEIGHT;
}

export type ProjectedCell = {
  px: number;
  py: number;
  ts: number;
  depth: number;
  elevOff: number;
  shelfH: number;
};

export function isYawedViewMode(
  mode: MapViewMode,
): mode is "sideEast" | "sideWest" | "sideNorth" {
  return mode !== "top";
}

/**
 * Project a map cell. Yawed views keep the same extruded cell; only axes rotate.
 * Optional `pad` (unscaled, from getViewPadInfo) avoids repeated map scans.
 */
export function projectCell(
  mode: MapViewMode,
  map: EmberMap,
  tx: number,
  ty: number,
  elev: number,
  scale = 1,
  pad?: number,
): ProjectedCell {
  const ts = map.tileSize * scale;
  const padUse = (pad ?? getViewPadInfo(map).pad) * scale;
  const elevOff = viewElevOffset(elev) * scale;

  switch (mode) {
    case "top":
      return {
        px: tx * ts,
        py: ty * ts + padUse - elevOff,
        ts,
        depth: ty * 4 + elev + tx * 0.001,
        elevOff,
        shelfH: ts,
      };
    case "sideEast":
      return {
        px: ty * ts,
        py: tx * ts + padUse - elevOff,
        ts,
        depth: tx * 4 + elev + ty * 0.001,
        elevOff,
        shelfH: ts,
      };
    case "sideWest":
      return {
        px: (map.height - 1 - ty) * ts,
        py: (map.width - 1 - tx) * ts + padUse - elevOff,
        ts,
        depth: (map.width - 1 - tx) * 4 + elev + ty * 0.001,
        elevOff,
        shelfH: ts,
      };
    case "sideNorth":
      return {
        px: (map.width - 1 - tx) * ts,
        py: (map.height - 1 - ty) * ts + padUse - elevOff,
        ts,
        depth: (map.height - 1 - ty) * 4 + elev + tx * 0.001,
        elevOff,
        shelfH: ts,
      };
    default: {
      const _n: never = mode;
      return _n;
    }
  }
}

/** Remap logical stair dir into paintStairExtrusion dirs for a yawed view. */
export function sideVisualStairDir(
  mode: "sideEast" | "sideWest" | "sideNorth",
  dir: RampDir,
): RampDir {
  if (mode === "sideEast") {
    switch (dir) {
      case "n":
        return "w";
      case "s":
        return "e";
      case "e":
        return "s";
      case "w":
        return "n";
      default: {
        const _n: never = dir;
        return _n;
      }
    }
  }
  if (mode === "sideWest") {
    switch (dir) {
      case "n":
        return "e";
      case "s":
        return "w";
      case "e":
        return "n";
      case "w":
        return "s";
      default: {
        const _n: never = dir;
        return _n;
      }
    }
  }
  // sideNorth — 180° yaw + mirrored X
  switch (dir) {
    case "n":
      return "s";
    case "s":
      return "n";
    case "e":
      return "w";
    case "w":
      return "e";
    default: {
      const _n: never = dir;
      return _n;
    }
  }
}

/** Neighbor tile toward the camera (the "south" of top-view). */
export function towardCameraDelta(
  mode: "sideEast" | "sideWest" | "sideNorth",
): { dx: number; dy: number } {
  switch (mode) {
    case "sideEast":
      return { dx: 1, dy: 0 };
    case "sideWest":
      return { dx: -1, dy: 0 };
    case "sideNorth":
      return { dx: 0, dy: -1 };
    default: {
      const _n: never = mode;
      return _n;
    }
  }
}

/** Nearness score for painter / hit-test (higher = closer to camera). */
export function viewNearScore(
  mode: MapViewMode,
  map: EmberMap,
  tx: number,
  ty: number,
): number {
  switch (mode) {
    case "top":
      return ty;
    case "sideEast":
      return tx;
    case "sideWest":
      return map.width - 1 - tx;
    case "sideNorth":
      return map.height - 1 - ty;
    default: {
      const _n: never = mode;
      return _n;
    }
  }
}

/** Canvas pixel size for the given view. */
export function mapCanvasSize(
  mode: MapViewMode,
  map: EmberMap,
  scale = 1,
): { width: number; height: number; pad: number; ts: number } {
  const ts = map.tileSize * scale;
  const pad = viewVerticalPad(map) * scale;
  if (mode === "top" || mode === "sideNorth") {
    return {
      width: Math.ceil(map.width * ts),
      height: Math.ceil(map.height * ts + pad),
      pad,
      ts,
    };
  }
  // East/west yaw: width ← N–S, height ← E–W
  return {
    width: Math.ceil(map.height * ts),
    height: Math.ceil(map.width * ts + pad),
    pad,
    ts,
  };
}

/**
 * Yawed-view pick — same rules as top hit-test on remapped axes.
 */
export function canvasPixelToTileSide(
  mode: "sideEast" | "sideWest" | "sideNorth",
  map: EmberMap,
  sx: number,
  sy: number,
  scale = 1,
): { tx: number; ty: number } | null {
  const ts = map.tileSize * scale;
  const pad = viewVerticalPad(map) * scale;
  const wallH = WALL_HEIGHT * scale;
  const { dx: camDx, dy: camDy } = towardCameraDelta(mode);

  if (mode === "sideNorth") {
    const tx = map.width - 1 - Math.floor(sx / ts);
    if (tx < 0 || tx >= map.width) return null;

    let bestTy = -1;
    let bestScore = -Infinity;

    for (let ty = 0; ty < map.height; ty++) {
      const elev = elevAt(map, tx, ty);
      const p = projectCell(mode, map, tx, ty, elev, scale);
      const basePy = p.py;
      const stories = wallStoriesAt(map, tx, ty);
      const isWall = stories >= 1;
      const near = viewNearScore(mode, map, tx, ty);

      if (isWall) {
        const raise = wallH * Math.max(1, stories);
        if (sy >= basePy - raise && sy < basePy + ts) {
          const score = near * 1000 + elev * 10 + 2;
          if (score >= bestScore) {
            bestScore = score;
            bestTy = ty;
          }
        }
      } else {
        if (sy >= basePy && sy < basePy + ts) {
          const score = near * 1000 + elev * 10;
          if (score >= bestScore) {
            bestScore = score;
            bestTy = ty;
          }
        }
        const nx = tx + camDx;
        const ny = ty + camDy;
        if (
          elev > 0 &&
          nx >= 0 &&
          nx < map.width &&
          ny >= 0 &&
          ny < map.height
        ) {
          const ne = elevAt(map, nx, ny);
          const nh = wallStoriesAt(map, nx, ny);
          if (ne < elev && nh < 1) {
            const drop = (elev - ne) * wallH;
            const faceY = basePy + ts;
            if (drop > 0 && sy >= faceY && sy < faceY + drop) {
              const score = near * 1000 + elev * 10 + 5;
              if (score >= bestScore) {
                bestScore = score;
                bestTy = ty;
              }
            }
          }
        }
      }
    }

    if (bestTy >= 0) return { tx, ty: bestTy };
    const row = Math.floor((sy - pad) / ts);
    const ty = map.height - 1 - row;
    if (ty < 0 || ty >= map.height) return null;
    return { tx, ty };
  }

  const ty =
    mode === "sideEast"
      ? Math.floor(sx / ts)
      : map.height - 1 - Math.floor(sx / ts);
  if (ty < 0 || ty >= map.height) return null;

  let bestTx = -1;
  let bestScore = -Infinity;

  for (let tx = 0; tx < map.width; tx++) {
    const elev = elevAt(map, tx, ty);
    const p = projectCell(mode, map, tx, ty, elev, scale);
    const basePy = p.py;
    const stories = wallStoriesAt(map, tx, ty);
    const isWall = stories >= 1;
    const near = viewNearScore(mode, map, tx, ty);

    if (isWall) {
      const raise = wallH * Math.max(1, stories);
      if (sy >= basePy - raise && sy < basePy + ts) {
        const score = near * 1000 + elev * 10 + 2;
        if (score >= bestScore) {
          bestScore = score;
          bestTx = tx;
        }
      }
    } else {
      if (sy >= basePy && sy < basePy + ts) {
        const score = near * 1000 + elev * 10;
        if (score >= bestScore) {
          bestScore = score;
          bestTx = tx;
        }
      }
      const nx = tx + camDx;
      const ny = ty + camDy;
      if (elev > 0 && nx >= 0 && nx < map.width && ny >= 0 && ny < map.height) {
        const ne = elevAt(map, nx, ny);
        const nh = wallStoriesAt(map, nx, ny);
        if (ne < elev && nh < 1) {
          const drop = (elev - ne) * wallH;
          const faceY = basePy + ts;
          if (drop > 0 && sy >= faceY && sy < faceY + drop) {
            const score = near * 1000 + elev * 10 + 5;
            if (score >= bestScore) {
              bestScore = score;
              bestTx = tx;
            }
          }
        }
      }
    }
  }

  if (bestTx >= 0) return { tx: bestTx, ty };

  const row = Math.floor((sy - pad) / ts);
  const tx =
    mode === "sideEast" ? row : map.width - 1 - row;
  if (tx < 0 || tx >= map.width) return null;
  return { tx, ty };
}

/**
 * World (logical) point → display position for entities.
 */
export function projectWorldPoint(
  mode: MapViewMode,
  map: EmberMap,
  x: number,
  y: number,
  elev: number,
  scale = 1,
  pad?: number,
): { x: number; y: number; depth: number } {
  const ts = map.tileSize;
  const tx = x / ts;
  const ty = y / ts;
  const padUse = (pad ?? getViewPadInfo(map).pad) * scale;
  const elevOff = viewElevOffset(elev) * scale;

  switch (mode) {
    case "top":
      return {
        x: x * scale,
        y: y * scale - elevOff,
        depth: ty * 4 + elev,
      };
    case "sideEast":
      return {
        x: y * scale,
        y: x * scale + padUse - elevOff,
        depth: tx * 4 + elev,
      };
    case "sideWest":
      return {
        x: (map.height * ts - y) * scale,
        y: (map.width * ts - x) * scale + padUse - elevOff,
        depth: (map.width - 1 - tx) * 4 + elev,
      };
    case "sideNorth":
      return {
        x: (map.width * ts - x) * scale,
        y: (map.height * ts - y) * scale + padUse - elevOff,
        depth: (map.height - 1 - ty) * 4 + elev,
      };
    default: {
      const _n: never = mode;
      return _n;
    }
  }
}

export function projectCellPhaser(
  mode: MapViewMode,
  map: EmberMap,
  tx: number,
  ty: number,
  elev: number,
  pad?: number,
): ProjectedCell {
  const pad0 = pad ?? getViewPadInfo(map).pad;
  const p = projectCell(mode, map, tx, ty, elev, 1, pad0);
  if (mode === "top") {
    return { ...p, py: p.py - pad0 };
  }
  return p;
}

export function mapViewBounds(
  mode: MapViewMode,
  map: EmberMap,
): { x: number; y: number; width: number; height: number } {
  const { width, height, pad } = mapCanvasSize(mode, map, 1);
  if (mode === "top") {
    return {
      x: 0,
      y: -pad,
      width: map.width * map.tileSize,
      height: map.height * map.tileSize + pad,
    };
  }
  return { x: 0, y: 0, width, height };
}
