import type { EmberMap, EmberTileset } from "../content/types";
import {
  canStandAtElev,
  listPhysicalVoxelCollisionAabbs,
  MAX_AUTO_STEP_VOXELS,
  navigationSurfaceElevAtWorld,
  solidSpriteAabb,
  type EmberSpriteLib,
  type EmberVoxelModelLib,
  type EmberVoxelSceneLib,
} from "../tile/mapUtils";
import { VOXELS_PER_BLOCK } from "../voxel/constants";

/** Two 8-voxel cells per tile; centre/edge samples still enforce 4-voxel rises. */
export const ENEMY_NAV_SUBDIVISIONS = 2;

const EDGE_EAST = 1 << 0;
const EDGE_WEST = 1 << 1;
const EDGE_SOUTH = 1 << 2;
const EDGE_NORTH = 1 << 3;
const CARDINAL_DX = [1, -1, 0, 0] as const;
const CARDINAL_DY = [0, 0, 1, -1] as const;
const CARDINAL_BITS = [EDGE_EAST, EDGE_WEST, EDGE_SOUTH, EDGE_NORTH] as const;

export type EnemyCrowdOpenField = {
  width: number;
  height: number;
  mapTileSize: number;
  subdivisions: number;
  /** World size of one baked navigation cell. */
  tileSize: number;
  /** Cells represented by the height-aware navigation graph. */
  open: Uint8Array;
  /** Flat cells safe for allocation-free swept-circle movement. */
  collisionOpen: Uint8Array;
  surfaceElev: Float32Array;
  surfaceMin: Float32Array;
  surfaceMax: Float32Array;
  edgeEastElev: Float32Array;
  edgeWestElev: Float32Array;
  edgeSouthElev: Float32Array;
  edgeNorthElev: Float32Array;
  /** Directed cardinal edges allowed by the shared 4-voxel step rule. */
  moveMask: Uint8Array;
  /** Cells whose movement must use exact height-aware collision. */
  heightAware: Uint8Array;
  transitionCount: number;
  connectorDx: Int8Array;
  connectorDy: Int8Array;
  connectorLow: Float32Array;
  connectorHigh: Float32Array;
};

function markBoundsBlocked(
  field: EnemyCrowdOpenField,
  left: number,
  top: number,
  right: number,
  bottom: number,
  blockNavigation = true,
): void {
  const ts = field.tileSize;
  const epsilon = 1e-6;
  const minTx = Math.max(0, Math.floor(left / ts));
  const maxTx = Math.min(
    field.width - 1,
    Math.floor((right - epsilon) / ts),
  );
  const minTy = Math.max(0, Math.floor(top / ts));
  const maxTy = Math.min(
    field.height - 1,
    Math.floor((bottom - epsilon) / ts),
  );
  if (minTx > maxTx || minTy > maxTy) return;
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const index = tx + ty * field.width;
      if (blockNavigation) field.open[index] = 0;
      field.collisionOpen[index] = 0;
      if (!blockNavigation) field.heightAware[index] = 1;
    }
  }
}

function fieldIndexAt(
  field: EnemyCrowdOpenField,
  worldX: number,
  worldY: number,
): number {
  const tx = Math.floor(worldX / field.tileSize);
  const ty = Math.floor(worldY / field.tileSize);
  if (tx < 0 || ty < 0 || tx >= field.width || ty >= field.height) return -1;
  return tx + ty * field.width;
}

/**
 * Precompute the unquestionably flat/open part of an authored map once.
 *
 * Horde actors can move directly inside this grid. Walls, stairs, elevated
 * stacks, solid sprites and physical voxel props remain on the exact collision
 * path. This is a conservative broad phase: a false negative only costs CPU;
 * it can never let an actor pass through authored collision.
 */
export function buildEnemyCrowdOpenField(
  map: EmberMap,
  tileset: EmberTileset,
  sprites?: EmberSpriteLib,
  voxelModels?: EmberVoxelModelLib,
  voxelScenes?: EmberVoxelSceneLib,
): EnemyCrowdOpenField {
  const subdivisions = ENEMY_NAV_SUBDIVISIONS;
  const width = map.width * subdivisions;
  const height = map.height * subdivisions;
  const cellSize = map.tileSize / subdivisions;
  const count = width * height;
  const field: EnemyCrowdOpenField = {
    width,
    height,
    mapTileSize: map.tileSize,
    subdivisions,
    tileSize: cellSize,
    open: new Uint8Array(count),
    collisionOpen: new Uint8Array(count),
    surfaceElev: new Float32Array(count),
    surfaceMin: new Float32Array(count),
    surfaceMax: new Float32Array(count),
    edgeEastElev: new Float32Array(count),
    edgeWestElev: new Float32Array(count),
    edgeSouthElev: new Float32Array(count),
    edgeNorthElev: new Float32Array(count),
    moveMask: new Uint8Array(count),
    heightAware: new Uint8Array(count),
    transitionCount: 0,
    connectorDx: new Int8Array(count),
    connectorDy: new Int8Array(count),
    connectorLow: new Float32Array(count),
    connectorHigh: new Float32Array(count),
  };

  const sampleOffset = cellSize * 0.48;
  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const index = gx + gy * width;
      const worldX = (gx + 0.5) * cellSize;
      const worldY = (gy + 0.5) * cellSize;
      const samples = [
        navigationSurfaceElevAtWorld(
          map,
          tileset,
          worldX,
          worldY,
          voxelModels,
          voxelScenes,
        ),
        navigationSurfaceElevAtWorld(
          map,
          tileset,
          worldX - sampleOffset,
          worldY,
          voxelModels,
          voxelScenes,
        ),
        navigationSurfaceElevAtWorld(
          map,
          tileset,
          worldX + sampleOffset,
          worldY,
          voxelModels,
          voxelScenes,
        ),
        navigationSurfaceElevAtWorld(
          map,
          tileset,
          worldX,
          worldY - sampleOffset,
          voxelModels,
          voxelScenes,
        ),
        navigationSurfaceElevAtWorld(
          map,
          tileset,
          worldX,
          worldY + sampleOffset,
          voxelModels,
          voxelScenes,
        ),
      ].filter((surface): surface is number => surface != null && Number.isFinite(surface));
      if (samples.length === 0) continue;
      const center = samples[0]!;
      let min = center;
      let max = center;
      for (const sample of samples) {
        min = Math.min(min, sample);
        max = Math.max(max, sample);
      }
      field.open[index] = 1;
      field.surfaceElev[index] = center;
      field.surfaceMin[index] = min;
      field.surfaceMax[index] = max;
      field.edgeWestElev[index] = samples[1] ?? center;
      field.edgeEastElev[index] = samples[2] ?? center;
      field.edgeNorthElev[index] = samples[3] ?? center;
      field.edgeSouthElev[index] = samples[4] ?? center;
      field.connectorLow[index] = min;
      field.connectorHigh[index] = max;
      const tileX = Math.floor(worldX / map.tileSize);
      const tileY = Math.floor(worldY / map.tileSize);
      const flat = max - min <= 0.02;
      field.collisionOpen[index] =
        flat && canStandAtElev(map, tileset, tileX, tileY, center) ? 1 : 0;
      field.heightAware[index] = flat ? 0 : 1;
    }
  }

  for (const box of listPhysicalVoxelCollisionAabbs(
    map,
    voxelModels,
    voxelScenes,
  )) {
    markBoundsBlocked(
      field,
      box.minX,
      box.minZ,
      box.maxX,
      box.maxZ,
      false,
    );
  }
  if (sprites) {
    for (const place of map.sprites ?? []) {
      const box = solidSpriteAabb(map, place, sprites);
      if (!box) continue;
      markBoundsBlocked(field, box.left, box.top, box.right, box.bottom);
    }
  }

  const maxStepElev = MAX_AUTO_STEP_VOXELS / VOXELS_PER_BLOCK + 0.01;
  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const index = gx + gy * width;
      if (field.open[index] === 0) continue;
      const fromElev = field.surfaceElev[index]!;
      let mask = 0;
      for (let direction = 0; direction < 4; direction++) {
        const nx = gx + CARDINAL_DX[direction]!;
        const ny = gy + CARDINAL_DY[direction]!;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nextIndex = nx + ny * width;
        if (field.open[nextIndex] === 0) continue;
        const fromEdge =
          direction === 0
            ? field.edgeEastElev[index]!
            : direction === 1
              ? field.edgeWestElev[index]!
              : direction === 2
                ? field.edgeSouthElev[index]!
                : field.edgeNorthElev[index]!;
        const toEdge =
          direction === 0
            ? field.edgeWestElev[nextIndex]!
            : direction === 1
              ? field.edgeEastElev[nextIndex]!
              : direction === 2
                ? field.edgeNorthElev[nextIndex]!
                : field.edgeSouthElev[nextIndex]!;
        const toElev = field.surfaceElev[nextIndex]!;
        if (
          fromEdge - fromElev > maxStepElev ||
          toEdge - fromEdge > maxStepElev ||
          toElev - toEdge > maxStepElev
        ) {
          continue;
        }
        mask |= CARDINAL_BITS[direction]!;
        if (
          Math.abs(fromEdge - fromElev) > 0.02 ||
          Math.abs(toEdge - fromEdge) > 0.02 ||
          Math.abs(toElev - toEdge) > 0.02
        ) {
          field.heightAware[index] = 1;
          field.heightAware[nextIndex] = 1;
        }
      }
      field.moveMask[index] = mask;
      field.transitionCount +=
        ((mask & EDGE_EAST) !== 0 ? 1 : 0) +
        ((mask & EDGE_SOUTH) !== 0 ? 1 : 0);
    }
  }
  return field;
}

/** Allocation-free swept-circle broad phase for horde movement. */
export function enemyCrowdOpenFieldAllowsMove(
  field: EnemyCrowdOpenField,
  x: number,
  y: number,
  nextX: number,
  nextY: number,
  radius: number,
  elev: number,
): boolean {
  const r = Math.max(0.5, radius);
  const ts = field.tileSize;
  const minTx = Math.floor((Math.min(x, nextX) - r) / ts);
  const maxTx = Math.floor((Math.max(x, nextX) + r) / ts);
  const minTy = Math.floor((Math.min(y, nextY) - r) / ts);
  const maxTy = Math.floor((Math.max(y, nextY) + r) / ts);
  if (
    minTx < 0 ||
    minTy < 0 ||
    maxTx >= field.width ||
    maxTy >= field.height
  ) {
    return false;
  }
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const index = tx + ty * field.width;
      if (
        field.collisionOpen[index] === 0 ||
        Math.abs(field.surfaceElev[index]! - elev) > 0.05
      ) {
        return false;
      }
    }
  }
  return true;
}

/** Conservative full-segment test used to bypass flow on clear flat ground. */
export function enemyCrowdOpenFieldAllowsDirectPath(
  field: EnemyCrowdOpenField,
  x: number,
  y: number,
  targetX: number,
  targetY: number,
  radius: number,
  elev: number,
): boolean {
  const dx = targetX - x;
  const dy = targetY - y;
  const distance = Math.hypot(dx, dy);
  if (distance <= 1e-6) return true;
  const steps = Math.max(1, Math.ceil(distance / (field.tileSize * 0.5)));
  let fromX = x;
  let fromY = y;
  for (let step = 1; step <= steps; step++) {
    const amount = step / steps;
    const nextX = x + dx * amount;
    const nextY = y + dy * amount;
    if (
      !enemyCrowdOpenFieldAllowsMove(
        field,
        fromX,
        fromY,
        nextX,
        nextY,
        radius,
        elev,
      )
    ) {
      return false;
    }
    fromX = nextX;
    fromY = nextY;
  }
  return true;
}

export type EnemyCrowdConnectorMove = {
  x: number;
  y: number;
  elev: number;
};

function bakedSurfaceElevAtWorld(
  field: EnemyCrowdOpenField,
  index: number,
  worldX: number,
  worldY: number,
): number {
  const tx = index % field.width;
  const ty = Math.floor(index / field.width);
  const centerX = (tx + 0.5) * field.tileSize;
  const centerY = (ty + 0.5) * field.tileSize;
  const center = field.surfaceElev[index]!;
  const nx = Math.max(-1, Math.min(1, (worldX - centerX) / (field.tileSize * 0.5)));
  const ny = Math.max(-1, Math.min(1, (worldY - centerY) / (field.tileSize * 0.5)));
  const edgeX = nx >= 0 ? field.edgeEastElev[index]! : field.edgeWestElev[index]!;
  const edgeY = ny >= 0 ? field.edgeSouthElev[index]! : field.edgeNorthElev[index]!;
  const sampled = center + (edgeX - center) * Math.abs(nx) + (edgeY - center) * Math.abs(ny);
  return Math.max(
    field.surfaceMin[index]!,
    Math.min(field.surfaceMax[index]!, sampled),
  );
}

function bakedCardinalMoveAllowed(
  field: EnemyCrowdOpenField,
  fromIndex: number,
  dx: number,
  dy: number,
): boolean {
  const bit =
    dx === 1 ? EDGE_EAST : dx === -1 ? EDGE_WEST : dy === 1 ? EDGE_SOUTH : EDGE_NORTH;
  return (field.moveMask[fromIndex]! & bit) !== 0;
}

function enemyCrowdTryBakedHeightMove(
  field: EnemyCrowdOpenField,
  currentIndex: number,
  nextIndex: number,
  nextX: number,
  nextY: number,
  elev: number,
  out: EnemyCrowdConnectorMove,
): boolean {
  if (
    currentIndex < 0 ||
    nextIndex < 0 ||
    field.open[currentIndex] === 0 ||
    field.open[nextIndex] === 0 ||
    (field.heightAware[currentIndex] === 0 && field.heightAware[nextIndex] === 0)
  ) {
    return false;
  }
  if (
    elev < field.surfaceMin[currentIndex]! - 0.3 ||
    elev > field.surfaceMax[currentIndex]! + 0.3
  ) {
    return false;
  }
  const fromX = currentIndex % field.width;
  const fromY = Math.floor(currentIndex / field.width);
  const toX = nextIndex % field.width;
  const toY = Math.floor(nextIndex / field.width);
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return false;
  if (dx !== 0 || dy !== 0) {
    if (dx === 0 || dy === 0) {
      if (!bakedCardinalMoveAllowed(field, currentIndex, dx, dy)) return false;
    } else {
      const xIndex = fromX + dx + fromY * field.width;
      const yIndex = fromX + (fromY + dy) * field.width;
      const viaX =
        bakedCardinalMoveAllowed(field, currentIndex, dx, 0) &&
        bakedCardinalMoveAllowed(field, xIndex, 0, dy);
      const viaY =
        bakedCardinalMoveAllowed(field, currentIndex, 0, dy) &&
        bakedCardinalMoveAllowed(field, yIndex, dx, 0);
      if (!viaX || !viaY) return false;
    }
  }
  const nextElev = bakedSurfaceElevAtWorld(field, nextIndex, nextX, nextY);
  if (nextElev - elev > MAX_AUTO_STEP_VOXELS / VOXELS_PER_BLOCK + 0.06) {
    return false;
  }
  out.x = nextX;
  out.y = nextY;
  out.elev = nextElev;
  return true;
}

/**
 * Fast movement inside a connector whose voxel profile was verified at bake.
 * The crowd follows the connector centre lane; arbitrary side entry still
 * falls back to exact voxel collision.
 */
export function enemyCrowdTryConnectorMove(
  field: EnemyCrowdOpenField,
  x: number,
  y: number,
  nextX: number,
  nextY: number,
  radius: number,
  elev: number,
  out: EnemyCrowdConnectorMove,
): boolean {
  const ts = field.tileSize;
  const currentIndex = fieldIndexAt(field, x, y);
  const nextIndex = fieldIndexAt(field, nextX, nextY);
  const currentIsConnector =
    currentIndex >= 0 &&
    field.open[currentIndex] !== 0 &&
    (field.connectorDx[currentIndex] !== 0 ||
      field.connectorDy[currentIndex] !== 0);
  const nextIsConnector =
    nextIndex >= 0 &&
    field.open[nextIndex] !== 0 &&
    (field.connectorDx[nextIndex] !== 0 ||
      field.connectorDy[nextIndex] !== 0);
  const connectorIndex = currentIsConnector
    ? currentIndex
    : nextIsConnector
      ? nextIndex
      : -1;
  if (connectorIndex < 0) {
    return enemyCrowdTryBakedHeightMove(
      field,
      currentIndex,
      nextIndex,
      nextX,
      nextY,
      elev,
      out,
    );
  }
  const tx = connectorIndex % field.width;
  const ty = Math.floor(connectorIndex / field.width);
  const axisX = field.connectorDx[connectorIndex]!;
  const axisY = field.connectorDy[connectorIndex]!;
  const halfLane = ts * 0.5 - Math.max(0.5, radius);
  if (
    (axisX !== 0 && Math.abs(nextY - (ty + 0.5) * ts) > halfLane) ||
    (axisY !== 0 && Math.abs(nextX - (tx + 0.5) * ts) > halfLane)
  ) {
    return false;
  }
  const alongMove = (nextX - x) * axisX + (nextY - y) * axisY;
  if (Math.abs(alongMove) <= 1e-6) return false;
  const low = field.connectorLow[connectorIndex]!;
  const high = field.connectorHigh[connectorIndex]!;
  if (elev < low - 0.3 || elev > high + 0.3) return false;

  let nextElev: number;
  if (nextIndex === connectorIndex) {
    const localX = nextX / ts - tx;
    const localY = nextY / ts - ty;
    const amount = Math.max(
      0,
      Math.min(
        1,
        axisX > 0
          ? localX
          : axisX < 0
            ? 1 - localX
            : axisY > 0
              ? localY
              : 1 - localY,
      ),
    );
    nextElev = low + (high - low) * amount;
  } else {
    if (nextIndex < 0 || field.open[nextIndex] === 0) return false;
    const endpoint = alongMove > 0 ? high : low;
    const nextSurface = field.surfaceElev[nextIndex]!;
    if (Math.abs(nextSurface - endpoint) > 0.08) return false;
    nextElev = nextSurface;
  }
  out.x = nextX;
  out.y = nextY;
  out.elev = nextElev;
  return true;
}

/** True when the swept footprint enters baked non-flat/voxel navigation. */
export function enemyCrowdMoveTouchesConnector(
  field: EnemyCrowdOpenField,
  x: number,
  y: number,
  nextX: number,
  nextY: number,
  radius: number,
): boolean {
  const r = Math.max(0.5, radius);
  const ts = field.tileSize;
  const minTx = Math.max(0, Math.floor((Math.min(x, nextX) - r) / ts));
  const maxTx = Math.min(
    field.width - 1,
    Math.floor((Math.max(x, nextX) + r) / ts),
  );
  const minTy = Math.max(0, Math.floor((Math.min(y, nextY) - r) / ts));
  const maxTy = Math.min(
    field.height - 1,
    Math.floor((Math.max(y, nextY) + r) / ts),
  );
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const index = tx + ty * field.width;
      if (field.heightAware[index] !== 0) {
        return true;
      }
    }
  }
  return false;
}
