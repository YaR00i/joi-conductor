/**
 * World-space voxel collision for Three.js play.
 * Logical map coords: X/Z gameplay uses mapUtils top-view (x,y) → Three (x, elevY, y).
 */
import type { EmberBodyModifier, EmberMap, EmberTileset } from "../content/types";
import { blockStoryHeight } from "../tile/extruded";
import {
  circleHitsSolid,
  tryJumpLedge,
  tryMoveWithElevation,
  type EmberSpriteLib,
  type EmberVoxelModelLib,
  type EmberVoxelSceneLib,
} from "../tile/mapUtils";

export const VIEW_TOP = "top" as const;

export function elevToWorldY(
  elev: number,
  offset = 0,
  tileSize = 16,
): number {
  return elev * blockStoryHeight(tileSize) + offset;
}

export function logicToThree(
  lx: number,
  ly: number,
  elev: number,
  yOffset = 4,
  tileSize = 16,
): { x: number; y: number; z: number } {
  return { x: lx, y: elevToWorldY(elev, yOffset, tileSize), z: ly };
}

export function moveWithVoxels(
  map: EmberMap,
  tileset: EmberTileset,
  x: number,
  y: number,
  nextX: number,
  nextY: number,
  radius: number,
  elev: number,
  sprites?: EmberSpriteLib,
  voxelModels?: EmberVoxelModelLib,
  voxelScenes?: EmberVoxelSceneLib,
  body?: EmberBodyModifier,
): { x: number; y: number; elev: number } {
  return tryMoveWithElevation(
    map,
    tileset,
    x,
    y,
    nextX,
    nextY,
    radius,
    elev,
    sprites,
    VIEW_TOP,
    voxelModels,
    voxelScenes,
    body,
  );
}

export function jumpLedgeVoxels(
  map: EmberMap,
  tileset: EmberTileset,
  x: number,
  y: number,
  elev: number,
  dirX: number,
  dirY: number,
  radius: number,
  sprites?: EmberSpriteLib,
  voxelModels?: EmberVoxelModelLib,
  voxelScenes?: EmberVoxelSceneLib,
  body?: EmberBodyModifier,
): { x: number; y: number; elev: number } | null {
  return tryJumpLedge(
    map,
    tileset,
    x,
    y,
    elev,
    dirX,
    dirY,
    radius,
    sprites,
    VIEW_TOP,
    voxelModels,
    voxelScenes,
    body,
  );
}

export function hitsSolidVoxels(
  map: EmberMap,
  tileset: EmberTileset,
  x: number,
  y: number,
  radius: number,
  elev: number,
  sprites?: EmberSpriteLib,
  voxelModels?: EmberVoxelModelLib,
  voxelScenes?: EmberVoxelSceneLib,
  body?: EmberBodyModifier,
): boolean {
  return circleHitsSolid(
    map,
    tileset,
    x,
    y,
    radius,
    elev,
    sprites,
    VIEW_TOP,
    voxelModels,
    voxelScenes,
    body,
  );
}
