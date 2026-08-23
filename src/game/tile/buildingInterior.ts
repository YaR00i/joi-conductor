/**
 * Building interiors for isometric play: occupancy + roof/wall cutaway.
 *
 * Ember is a 3D voxel village with a locked-pitch follow camera (~54°),
 * not a 2D Zelda overworld. Separate interior maps would need teleports
 * (owned by another agent). HD-2D / Octopath-style in-place cutaway fits:
 * walk in, hide the roof and camera-facing walls of that volume.
 */
import type {
  EmberInteriorVolume,
  EmberMap,
  EmberTileset,
  EmberTilesetTile,
} from "../content/types";
import { MAX_ELEVATION } from "../content/types";
import { elevTileIdAt, isElevGroundLayerName } from "./elevGroundLayers";

export type CutawayRole = "floor" | "wall" | "roof" | "prop";

export type EmberCutawayTag = {
  tx: number;
  ty: number;
  elev: number;
  role: CutawayRole;
};

export type CutawayHideSet = {
  roofCells: Set<string>;
  wallTiles: Set<string>;
};

export function cellCutawayKey(tx: number, ty: number, elev: number): string {
  return `${tx},${ty},${elev}`;
}

export function tileCutawayKey(tx: number, ty: number): string {
  return `${tx},${ty}`;
}

export function cutawayRoleForCell(
  tileName: string | undefined,
  elev: number,
  kind: "floor" | "wall",
): CutawayRole {
  const name = (tileName ?? "").toLowerCase();
  if (name.includes("крыша") || elev >= 2) return "roof";
  if (kind === "wall" || elev >= 1) return "wall";
  return "floor";
}

export function mapNeedsInteriorCutawayMeshes(map: EmberMap): boolean {
  if ((map.interiorVolumes?.length ?? 0) > 0) return true;
  for (const layer of map.layers) {
    if (!isElevGroundLayerName(layer.name)) continue;
    const elev = Number(layer.name.slice("ground_z".length));
    if (!Number.isFinite(elev) || elev < 1) continue;
    if (layer.data.some((id) => (id ?? 0) > 0)) return true;
  }
  return false;
}

function pointInVolume(
  volume: EmberInteriorVolume,
  tx: number,
  ty: number,
): boolean {
  return (
    tx >= volume.x &&
    ty >= volume.y &&
    tx < volume.x + volume.w &&
    ty < volume.y + volume.h
  );
}

function hasCoverAbove(map: EmberMap, tx: number, ty: number): boolean {
  for (let elev = 1; elev <= MAX_ELEVATION; elev++) {
    if (elevTileIdAt(map, tx, ty, elev) > 0) return true;
  }
  return false;
}

function neighbors4(tx: number, ty: number): Array<{ x: number; y: number }> {
  return [
    { x: tx + 1, y: ty },
    { x: tx - 1, y: ty },
    { x: tx, y: ty + 1 },
    { x: tx, y: ty - 1 },
  ];
}

/** Flood-fill connected roof cells (elev >= 2) into axis-aligned volumes. */
export function detectRoofInteriorVolumes(map: EmberMap): EmberInteriorVolume[] {
  const seen = new Set<string>();
  const volumes: EmberInteriorVolume[] = [];
  let serial = 0;
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const startKey = tileCutawayKey(tx, ty);
      if (seen.has(startKey) || !hasCoverAbove(map, tx, ty)) continue;
      const stack = [{ x: tx, y: ty }];
      seen.add(startKey);
      let minX = tx;
      let minY = ty;
      let maxX = tx;
      let maxY = ty;
      while (stack.length) {
        const cell = stack.pop()!;
        minX = Math.min(minX, cell.x);
        minY = Math.min(minY, cell.y);
        maxX = Math.max(maxX, cell.x);
        maxY = Math.max(maxY, cell.y);
        for (const next of neighbors4(cell.x, cell.y)) {
          if (
            next.x < 0 ||
            next.y < 0 ||
            next.x >= map.width ||
            next.y >= map.height
          ) {
            continue;
          }
          const key = tileCutawayKey(next.x, next.y);
          if (seen.has(key) || !hasCoverAbove(map, next.x, next.y)) continue;
          seen.add(key);
          stack.push(next);
        }
      }
      volumes.push({
        id: `roof_room_${serial++}`,
        x: minX,
        y: minY,
        w: maxX - minX + 1,
        h: maxY - minY + 1,
      });
    }
  }
  return volumes;
}

export function resolveInteriorVolumes(map: EmberMap): EmberInteriorVolume[] {
  const authored = map.interiorVolumes ?? [];
  if (authored.length > 0) return authored;
  return detectRoofInteriorVolumes(map);
}

export function occupiedInteriorAt(
  map: EmberMap,
  tx: number,
  ty: number,
): EmberInteriorVolume | null {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return null;
  const volumes = resolveInteriorVolumes(map);
  for (const volume of volumes) {
    if (!pointInVolume(volume, tx, ty)) continue;
    if ((map.interiorVolumes?.length ?? 0) > 0 || hasCoverAbove(map, tx, ty)) {
      return volume;
    }
  }
  return null;
}

function collectRoofCells(
  map: EmberMap,
  volume: EmberInteriorVolume,
): Array<{ tx: number; ty: number; elev: number }> {
  const cells: Array<{ tx: number; ty: number; elev: number }> = [];
  for (let ty = volume.y; ty < volume.y + volume.h; ty++) {
    for (let tx = volume.x; tx < volume.x + volume.w; tx++) {
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
      for (let elev = 1; elev <= MAX_ELEVATION; elev++) {
        if (elevTileIdAt(map, tx, ty, elev) > 0) {
          cells.push({ tx, ty, elev });
        }
      }
    }
  }
  return cells;
}

function tileById(
  tileset: EmberTileset,
  id: number,
): EmberTilesetTile | undefined {
  return tileset.tiles.find((tile) => tile.id === id);
}

/** Visual house walls: solid non-roof tiles on stories 0–1, not the roof cap. */
function isCutawayWallCell(
  map: EmberMap,
  tileset: EmberTileset,
  tx: number,
  ty: number,
): boolean {
  for (let elev = 0; elev <= 1; elev++) {
    const id = elevTileIdAt(map, tx, ty, elev);
    if (id <= 0) continue;
    const tile = tileById(tileset, id);
    if (!tile || tileIsRoofName(tile)) continue;
    if (tile.solid) return true;
  }
  return false;
}

function collectWallTiles(
  map: EmberMap,
  tileset: EmberTileset,
  volume: EmberInteriorVolume,
): Array<{ tx: number; ty: number }> {
  const tiles: Array<{ tx: number; ty: number }> = [];
  const x0 = Math.max(0, volume.x - 1);
  const y0 = Math.max(0, volume.y - 1);
  const x1 = Math.min(map.width - 1, volume.x + volume.w);
  const y1 = Math.min(map.height - 1, volume.y + volume.h);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!isCutawayWallCell(map, tileset, tx, ty)) continue;
      tiles.push({ tx, ty });
    }
  }
  return tiles;
}

/**
 * Camera yaw is atan2(offset.x, offset.z): default isometric ~π/4 looks from +X+Z.
 * Hide walls on the camera-near side of the volume (east/south at default yaw).
 */
export function isCameraFacingWall(
  volume: EmberInteriorVolume,
  tx: number,
  ty: number,
  cameraYaw: number,
): boolean {
  const cx = volume.x + volume.w * 0.5;
  const cy = volume.y + volume.h * 0.5;
  const dx = tx + 0.5 - cx;
  const dy = ty + 0.5 - cy;
  const camX = Math.sin(cameraYaw);
  const camZ = Math.cos(cameraYaw);
  return dx * camX + dy * camZ > 0.12;
}

export function emptyCutawayHideSet(): CutawayHideSet {
  return { roofCells: new Set(), wallTiles: new Set() };
}

/** 45° buckets so orbiting the camera does not rebuild hide sets every micro-yaw. */
export const CUTAWAY_YAW_SECTORS = 8;

export function cutawayYawSector(
  yaw: number,
  sectors = CUTAWAY_YAW_SECTORS,
): number {
  const twoPi = Math.PI * 2;
  const n = ((yaw % twoPi) + twoPi) % twoPi;
  return Math.round((n / twoPi) * sectors) % sectors;
}

/**
 * Outside: only the player tile. Inside: tile + volume + coarse yaw sector
 * (camera-facing walls). Do not include raw yaw — that retriggers a full
 * hide pass on every mouse tick.
 */
export function playCutawayCacheKey(
  map: EmberMap,
  tx: number,
  ty: number,
  yaw: number,
): string {
  const volume = occupiedInteriorAt(map, tx, ty);
  if (!volume) return `${tx},${ty}`;
  return `${tx},${ty},${volume.id},${cutawayYawSector(yaw)}`;
}

export function buildCutawayHideSet(
  map: EmberMap,
  tileset: EmberTileset,
  tx: number,
  ty: number,
  cameraYaw: number,
): CutawayHideSet {
  const hide = emptyCutawayHideSet();
  const volume = occupiedInteriorAt(map, tx, ty);
  if (!volume) return hide;
  for (const cell of collectRoofCells(map, volume)) {
    hide.roofCells.add(cellCutawayKey(cell.tx, cell.ty, cell.elev));
  }
  for (const wall of collectWallTiles(map, tileset, volume)) {
    if (!isCameraFacingWall(volume, wall.tx, wall.ty, cameraYaw)) continue;
    hide.wallTiles.add(tileCutawayKey(wall.tx, wall.ty));
  }
  return hide;
}

export function tileIsRoofName(tile: EmberTilesetTile | undefined): boolean {
  return (tile?.name ?? "").toLowerCase().includes("крыша");
}
