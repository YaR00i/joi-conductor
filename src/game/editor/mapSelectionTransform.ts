import type { EmberMap } from "../content/types";
import {
  clearElevTile,
  elevTileIdAt,
  ensureMapLayers,
  heightVoxelsAt,
  setElevTileId,
  topOccupiedElevAt,
} from "../tile/mapUtils";
import type { EmberWorldObject } from "./world";
import { translateEmberWorldObjects } from "./world";

function ensureLayerData(map: EmberMap, name: string): number[] {
  let layer = map.layers.find((candidate) => candidate.name === name);
  if (!layer) {
    layer = {
      name,
      type: "tile",
      data: new Array(map.width * map.height).fill(0),
    };
    map.layers.push(layer);
  }
  return layer.data;
}

function setWallHeightVoxels(map: EmberMap, idx: number, voxels: number): void {
  const height = ensureLayerData(map, "height");
  const collision = ensureLayerData(map, "collision");
  const value = Math.max(
    0,
    Math.min(8 * Math.max(1, map.tileSize || 16), Math.round(voxels)),
  );
  height[idx] = value;
  collision[idx] = value > 0 ? 1 : 0;
}

function cloneForTileMove(map: EmberMap): EmberMap {
  return ensureMapLayers({
    ...map,
    layers: map.layers.map((layer) => ({ ...layer, data: [...layer.data] })),
    tileModifiers: map.tileModifiers?.map((modifier) => ({
      ...modifier,
      componentStates: modifier.componentStates
        ? { ...modifier.componentStates }
        : undefined,
      collider: modifier.collider ? { ...modifier.collider } : undefined,
    })),
  });
}

/**
 * Translate a mixed World Editor selection as one atomic map operation.
 * Regular scene objects use the shared adapter; explicit tile stories are
 * snapshotted, cleared together and only then written to their destinations.
 */
export function translateEmberWorldSelection(
  map: EmberMap,
  objects: readonly EmberWorldObject[],
  dx: number,
  dy: number,
): EmberMap {
  const nonTiles = objects.filter((object) => object.kind !== "tile");
  const tileObjects = objects.filter(
    (object): object is EmberWorldObject & { source: { kind: "tile" } } =>
      object.source.kind === "tile",
  );
  let next = translateEmberWorldObjects(
    map,
    nonTiles.map((object) => object.ref),
    dx,
    dy,
  );
  if (tileObjects.length === 0) return next;

  next = cloneForTileMove(next);
  const snapshots = tileObjects.map((object) => {
    const value = object.source.value;
    return {
      ...value,
      tileId: elevTileIdAt(map, value.tx, value.ty, value.elev),
      x: Math.max(0, Math.min(map.width - 1, value.tx + dx)),
      y: Math.max(0, Math.min(map.height - 1, value.ty + dy)),
      moveWall: value.elev === topOccupiedElevAt(map, value.tx, value.ty),
      wallHeight: heightVoxelsAt(map, value.tx, value.ty),
    };
  });
  const selectedTileKeys = new Set(
    snapshots.map((item) => `${item.tx}:${item.ty}:${item.elev}`),
  );
  const movedModifiers = (map.tileModifiers ?? [])
    .filter((modifier) =>
      selectedTileKeys.has(`${modifier.x}:${modifier.y}:${modifier.elev}`),
    )
    .map((modifier) => {
      const snapshot = snapshots.find(
        (item) =>
          item.tx === modifier.x &&
          item.ty === modifier.y &&
          item.elev === modifier.elev,
      );
      return snapshot ? { ...modifier, x: snapshot.x, y: snapshot.y } : modifier;
    });

  for (const item of snapshots) {
    clearElevTile(next, item.tx, item.ty, item.elev);
    if (item.moveWall) {
      setWallHeightVoxels(next, item.ty * next.width + item.tx, 0);
    }
  }
  if (next.tileModifiers) {
    next.tileModifiers = next.tileModifiers.filter(
      (modifier) =>
        !selectedTileKeys.has(`${modifier.x}:${modifier.y}:${modifier.elev}`),
    );
  }
  for (const item of snapshots) {
    if (!item.tileId) continue;
    setElevTileId(next, item.x, item.y, item.elev, item.tileId);
    if (item.moveWall) {
      setWallHeightVoxels(next, item.y * next.width + item.x, item.wallHeight);
    }
  }
  if (movedModifiers.length > 0) {
    next.tileModifiers = [...(next.tileModifiers ?? []), ...movedModifiers];
  }
  return next;
}
