import {
  normalizePixelSprite,
  spriteHasVisual,
  spriteTotalHeight,
} from "../content/pixelSprite";
import type {
  EmberLightSource,
  EmberBodyModifier,
  EmberMap,
  EmberMapAtmosphere,
  EmberMapGrade,
  EmberMapLight,
  EmberMapRegion,
  EmberPixelSprite,
  EmberSpritePlacement,
  EmberTileset,
  EmberTilesetTile,
  EmberVoxelModel,
  EmberVoxelPlacement,
  EmberVoxelScene,
  RampDir,
} from "../content/types";
import { MAX_ELEVATION, MIN_ELEVATION, clampElevation } from "../content/types";
import { voxelGridSize } from "../voxel/voxelModel";
import {
  isVoxelModelPhysical,
  zoneRegionPhysicalVoxelPlacements,
  type ZoneVoxelPose,
} from "../voxel/voxelPhysical";
import {
  emissiveCellSeed,
  emissivePlacementSeed,
  emissiveProximityAmount,
  emissiveTriggerAmount,
  hasEmissiveInk,
  paintEmissivePixels,
  resolveEmissiveTriggerRadius,
  resolveEmissiveTriggerWhen,
  spriteEmissiveAlpha,
  stampEmissiveBloomField,
  tileEmissiveAlpha,
} from "./emissivePaint";
import { MAP_LIGHT_RANGE_MAX } from "./lightLimits";
import type { EmberEmissiveTriggerWhen } from "../content/types";
import {
  blockStoryHeight,
  fillExtrudedWall,
  WALL_HEIGHT,
} from "./extruded";
import {
  bottomOccupiedElevAt,
  ensureElevGroundLayers,
  elevTileIdAt,
  topOccupiedElevAt,
} from "./elevGroundLayers";
import { VOXELS_PER_BLOCK } from "../voxel/constants";
import {
  blockSpanAtElev,
  bodyHasClearance,
  canAutoStepTo,
  colliderAffectsBody,
  mergeVerticalSpans,
  resolveWorldBody,
  resolveWorldCollider,
  spanBlocksBody,
  type ResolvedWorldBody,
  type WorldVerticalSpan,
} from "../world/worldPhysics";
import {
  resolveSpriteInstanceCollider,
  resolveTileInstanceCollider,
  tileInstanceModifierAt,
} from "../world/worldObjectModifiers";
import {
  blitTileFace,
  paintSpriteDecorOnFloor,
  paintStairExtrusion,
  paintStairLanternWashClipped,
  paintWallFront,
} from "./tileTextures";
import {
  computeLitSurfaces,
  litSurfacesToFloorGlow,
  paintSurfaceLightOverlay,
} from "./mapLighting";
import {
  canvasPixelToTileSide,
  getViewPadInfo,
  isYawedViewMode,
  mapCanvasSize,
  projectCell,
  sideVisualStairDir,
  towardCameraDelta,
  type MapViewMode,
} from "./viewProjection";

export {
  buildMapSurfaces,
  computeLitSurfaces,
  lightSurfaces,
  litSurfacesToFloorGlow,
  paintSurfaceLightOverlay,
  type LitSurface,
  type MapSurface,
} from "./mapLighting";

export {
  WALL_HEIGHT,
  MAX_ELEVATION,
  MIN_ELEVATION,
  clampElevation,
  blockStoryHeight,
};
export {
  elevGroundLayerName,
  elevTileIdAt,
  elevTileAt,
  setElevTileId,
  clearElevTile,
  fillElevColumn,
  hollowElevColumn,
  moveElevTile,
  topOccupiedElevAt,
  bottomOccupiedElevAt,
  ensureElevGroundLayers,
  elevationSteps,
} from "./elevGroundLayers";
export { VOXELS_PER_BLOCK };
export type { MapViewMode } from "./viewProjection";
export {
  MAP_VIEW_MODES,
  mapCanvasSize,
  mapViewBounds,
  mapViewModeFromArrow,
  mapViewModeLabelRu,
  cameraMoveToWorld,
  getViewPadInfo,
  invalidateViewPadCache,
  nextMapViewMode,
  projectCell,
  projectCellPhaser,
  projectWorldPoint,
} from "./viewProjection";

export type EmberSpriteLib = Record<string, EmberPixelSprite>;

export function layerData(map: EmberMap, name: string): number[] | null {
  return map.layers.find((l) => l.name === name)?.data ?? null;
}

/** Ensure height layer exists (0 = no wall, 1+ = wall stories). Migrates from collision. */
export function ensureHeightLayer(map: EmberMap): EmberMap {
  if (layerData(map, "height")) return map;
  const n = map.width * map.height;
  const col = layerData(map, "collision");
  const collisionWallHeight =
    map.worldPhysicsVersion === 2 || map.terrainHeightUnit === "voxels"
      ? blockStoryHeight(map.tileSize)
      : 1;
  const height = col
    ? col.map((v) => (v > 0 ? collisionWallHeight : 0))
    : new Array<number>(n).fill(0);
  return {
    ...map,
    layers: [...map.layers, { name: "height", type: "tile", data: height }],
  };
}

/** Ensure elevation layer exists (walkable floor Z). Defaults to 0. */
export function ensureElevationLayer(map: EmberMap): EmberMap {
  if (layerData(map, "elevation")) return map;
  const n = map.width * map.height;
  return {
    ...map,
    layers: [
      ...map.layers,
      { name: "elevation", type: "tile", data: new Array<number>(n).fill(0) },
    ],
  };
}

/**
 * One-time migrate: legacy height cells 1..8 were stories → voxels (* tileSize).
 * After this, the height layer is always in voxels.
 */
export function migrateHeightLayerToVoxels(map: EmberMap): EmberMap {
  const h = layerData(map, "height");
  if (!h || map.terrainHeightUnit === "voxels") return map;
  let max = 0;
  for (const v of h) max = Math.max(max, v ?? 0);
  const ts = blockStoryHeight(map.tileSize);
  // worldPhysicsVersion=2 maps already authored their height layer in voxels.
  // Only unversioned maps with the old 1..8 story range need conversion.
  const legacyStories = map.worldPhysicsVersion !== 2 && max > 0 && max <= 8;
  const data = legacyStories
    ? h.map((v) => ((v ?? 0) > 0 ? Math.round(v as number) * ts : 0))
    : h.map((v) => normalizeHeightVoxels(v ?? 0, ts));
  return {
    ...map,
    worldPhysicsVersion: 2,
    terrainHeightUnit: "voxels",
    layers: map.layers.map((l) =>
      l.name === "height" ? { ...l, data } : l,
    ),
  };
}

/** Height + elevation layers for runtime / editor. */
export function ensureMapLayers(map: EmberMap): EmberMap {
  return ensureElevGroundLayers(
    migrateHeightLayerToVoxels(ensureElevationLayer(ensureHeightLayer(map))),
  );
}

/** Clamp a height-layer cell (voxels). */
export function normalizeHeightVoxels(
  raw: number,
  tileSize: number,
): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const ts = blockStoryHeight(tileSize);
  return Math.min(8 * ts, Math.round(raw));
}

/** Wall height in voxels (0 = no wall). OOB treated as 1 story. */
export function heightVoxelsAt(
  map: EmberMap,
  tileX: number,
  tileY: number,
): number {
  const ts = blockStoryHeight(map.tileSize);
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
    return ts;
  }
  const h = layerData(map, "height");
  if (h) return normalizeHeightVoxels(h[tileY * map.width + tileX] ?? 0, ts);
  const col = layerData(map, "collision");
  if (col) return (col[tileY * map.width + tileX] ?? 0) > 0 ? ts : 0;
  return 0;
}

/**
 * Wall stories at tile (0 = walkable / no wall). OOB treated as wall.
 * Derived from voxel height (ceil) so collision stays story-based.
 */
export function heightAt(map: EmberMap, tileX: number, tileY: number): number {
  const vox = heightVoxelsAt(map, tileX, tileY);
  if (vox <= 0) return 0;
  const ts = blockStoryHeight(map.tileSize);
  return Math.max(1, Math.ceil(vox / ts));
}

/** Walkable floor elevation at tile (MIN_ELEVATION…MAX_ELEVATION). */
export function elevationAt(
  map: EmberMap,
  tileX: number,
  tileY: number,
): number {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
    return 0;
  }
  const top = topOccupiedElevAt(map, tileX, tileY);
  if (top != null) return top;
  const e = layerData(map, "elevation");
  if (!e) return 0;
  const v = e[tileY * map.width + tileX] ?? 0;
  return clampElevation(v);
}

/**
 * Stand / place elev at a tile: floor Z, plus wall extrusion top when present.
 * Use for props, regions, chests, lamps — so clicks on a wall top sit on that
 * surface instead of the floor slab under the wall.
 */
export function tileSurfaceElev(
  map: EmberMap,
  tileX: number,
  tileY: number,
): number {
  const base = elevationAt(map, tileX, tileY);
  const vox = heightVoxelsAt(map, tileX, tileY);
  if (vox <= 0) return base;
  return base + vox / blockStoryHeight(map.tileSize);
}

export function maxElevationOnMap(map: EmberMap): number {
  const e = layerData(map, "elevation");
  if (!e) return 0;
  let max = 0;
  for (const v of e) max = Math.max(max, v ?? 0);
  return Math.min(MAX_ELEVATION, max);
}

export function maxWallHeightOnMap(map: EmberMap): number {
  const h = layerData(map, "height");
  if (!h) return 1;
  const ts = blockStoryHeight(map.tileSize);
  let maxStories = 1;
  for (const v of h) {
    const vox = normalizeHeightVoxels(v ?? 0, ts);
    if (vox > 0) maxStories = Math.max(maxStories, Math.ceil(vox / ts));
  }
  return maxStories;
}

/** Camera / canvas top pad for extruded floors + walls. */
export function mapVerticalPad(map: EmberMap): number {
  return getViewPadInfo(map).pad;
}

/** Visual Y offset for a floor elevation (world / screen). */
export function elevVisualOffset(elev: number): number {
  return elev * WALL_HEIGHT;
}

/** Subtle brighten for higher floors (overlay alpha). */
export function elevationHighlightAlpha(elev: number): number {
  if (elev <= 0) return 0;
  return Math.min(0.22, elev * 0.055);
}

export function isSolidAt(
  map: EmberMap,
  tileset: EmberTileset,
  tileX: number,
  tileY: number,
): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
    return true;
  }
  const heightSolid = heightAt(map, tileX, tileY) >= 1;
  const col = layerData(map, "collision");
  const legacyCollision = Boolean(
    col && (col[tileY * map.width + tileX] ?? 0) > 0,
  );
  const ground = layerData(map, "ground");
  const elev =
    topOccupiedElevAt(map, tileX, tileY) ?? elevationAt(map, tileX, tileY);
  const id =
    elevTileIdAt(map, tileX, tileY, elev) ||
    (ground?.[tileY * map.width + tileX] ?? 0);
  const tile = tileset.tiles.find((t) => t.id === id);
  const modifier = tileInstanceModifierAt(map, tileX, tileY, elev);
  const assetSolid = col ? legacyCollision : Boolean(tile?.solid);
  const obstacle =
    heightSolid ||
    legacyCollision ||
    assetSolid ||
    modifier?.componentStates?.collider === true;
  if (!obstacle) return false;
  const collider = resolveTileInstanceCollider(
    modifier,
    tile,
    heightSolid || legacyCollision || assetSolid,
  );
  return collider.enabled && collider.blocksMovement && !collider.isTrigger;
}

/**
 * Unified vertical occupancy for one world cell. Ground blocks, walls and
 * legacy collision all become the same collider spans in story coordinates.
 */
export function tileColliderSpansAt(
  map: EmberMap,
  tileset: EmberTileset,
  tileX: number,
  tileY: number,
): WorldVerticalSpan[] {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
    return [{ min: -1024, max: 1024, walkableTop: false, layer: "world", source: "map-edge" }];
  }
  const spans: WorldVerticalSpan[] = [];
  let hasStack = false;
  for (let elev = MIN_ELEVATION; elev <= MAX_ELEVATION; elev++) {
    const id = elevTileIdAt(map, tileX, tileY, elev);
    if (!id) continue;
    hasStack = true;
    const tile = tileset.tiles.find((item) => item.id === id);
    const collider = resolveTileInstanceCollider(
      tileInstanceModifierAt(map, tileX, tileY, elev),
      tile,
      true,
    );
    const span = blockSpanAtElev(elev, collider, `block:${id}@z${elev}`);
    if (span) spans.push(span);
  }

  // Maps authored before ground_z layers still behave as a physical floor.
  if (!hasStack) {
    const ground = layerData(map, "ground");
    const id = ground?.[tileY * map.width + tileX] ?? 0;
    if (id) {
      const elev = elevationAt(map, tileX, tileY);
      const tile = tileset.tiles.find((item) => item.id === id);
      const span = blockSpanAtElev(
        elev,
        resolveTileInstanceCollider(
          tileInstanceModifierAt(map, tileX, tileY, elev),
          tile,
          true,
        ),
        `legacy-block:${id}@z${elev}`,
      );
      if (span) spans.push(span);
    }
  }

  const baseElev = elevationAt(map, tileX, tileY);
  const topTile = groundTileAt(map, tileset, tileX, tileY);
  const heightVoxels = heightVoxelsAt(map, tileX, tileY);
  const legacyCollision =
    (layerData(map, "collision")?.[tileY * map.width + tileX] ?? 0) > 0;
  const obstacleModifier = tileInstanceModifierAt(
    map,
    tileX,
    tileY,
    baseElev,
  );
  const obstacle =
    heightVoxels > 0 ||
    legacyCollision ||
    Boolean(topTile?.solid) ||
    obstacleModifier?.componentStates?.collider === true;
  if (obstacle) {
    const collider = resolveTileInstanceCollider(
      obstacleModifier,
      topTile,
      true,
    );
    if (collider.enabled && collider.blocksMovement && !collider.isTrigger) {
      const offset = collider.offsetVoxels / VOXELS_PER_BLOCK;
      const fallbackHeight =
        heightVoxels > 0
          ? heightVoxels
          : Math.max(1, topTile?.defaultHeight ?? 1) * VOXELS_PER_BLOCK;
      const height = (collider.heightVoxels ?? fallbackHeight) / VOXELS_PER_BLOCK;
      if (height > 0) {
        spans.push({
          min: baseElev + offset,
          max: baseElev + offset + height,
          walkableTop: collider.walkableTop,
          layer: collider.layer,
          source: `obstacle:${topTile?.id ?? "legacy"}`,
        });
      }
    }
  }
  return mergeVerticalSpans(spans);
}

function tileBlocksBodyAtElev(
  map: EmberMap,
  tileset: EmberTileset,
  tileX: number,
  tileY: number,
  feetElev: number,
  body: ResolvedWorldBody,
): boolean {
  const spans = tileColliderSpansAt(map, tileset, tileX, tileY);
  for (const span of spans) {
    if (!spanBlocksBody(span, feetElev, body)) continue;
    // A short obstacle is not a blocker when its top can be mounted and the
    // actor has enough head room at the resulting feet elevation.
    if (
      span.walkableTop &&
      canAutoStepTo(feetElev, span.max, body) &&
      bodyHasClearance(spans, span.max, body)
    ) {
      continue;
    }
    return true;
  }
  return false;
}

function tileSupportSurfacesAt(
  map: EmberMap,
  tileset: EmberTileset,
  tileX: number,
  tileY: number,
): number[] {
  return tileColliderSpansAt(map, tileset, tileX, tileY)
    .filter((span) => span.walkableTop)
    .map((span) => span.max);
}

function isConnectorLandingAt(
  map: EmberMap,
  tileset: EmberTileset,
  tileX: number,
  tileY: number,
): boolean {
  const dirs: Array<{ dx: number; dy: number }> = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];
  for (const d of dirs) {
    const sx = tileX - d.dx;
    const sy = tileY - d.dy;
    const conn = connectorDirAt(map, tileset, sx, sy);
    if (!conn) continue;
    const climb = rampDirDelta(conn);
    if (climb.dx !== d.dx || climb.dy !== d.dy) continue;
    const band = connectorElevBand(map, tileset, sx, sy);
    if (band && Math.abs(band.high - elevationAt(map, tileX, tileY)) < 0.05) {
      return true;
    }
  }
  return false;
}

export function groundTileAt(
  map: EmberMap,
  tileset: EmberTileset,
  tileX: number,
  tileY: number,
): EmberTilesetTile | undefined {
  // Prefer top of elev stack (Minecraft column); fall back to legacy ground.
  const top = topOccupiedElevAt(map, tileX, tileY);
  if (top != null) {
    const id = elevTileIdAt(map, tileX, tileY, top);
    if (id) return tileset.tiles.find((t) => t.id === id);
  }
  const ground = layerData(map, "ground");
  if (!ground) return undefined;
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
    return undefined;
  }
  const id = ground[tileY * map.width + tileX] ?? 0;
  return tileset.tiles.find((t) => t.id === id);
}

/** Ramp or stair climb direction on this cell, if any. */
export function connectorDirAt(
  map: EmberMap,
  tileset: EmberTileset,
  tileX: number,
  tileY: number,
): RampDir | null {
  const tile = groundTileAt(map, tileset, tileX, tileY);
  return tile?.stair ?? tile?.ramp ?? null;
}

export function rampDirDelta(dir: RampDir): { dx: number; dy: number } {
  switch (dir) {
    case "n":
      return { dx: 0, dy: -1 };
    case "s":
      return { dx: 0, dy: 1 };
    case "w":
      return { dx: -1, dy: 0 };
    case "e":
      return { dx: 1, dy: 0 };
    default: {
      const _n: never = dir;
      void _n;
      return { dx: 0, dy: 0 };
    }
  }
}

/**
 * Auto floor Z when placing a stair/ramp facing `dir` at (x,y).
 * If the cell opposite the climb has the same connector dir → behindE + 1
 * (continue the flight). Otherwise sit on that neighbor's elevation.
 */
export function suggestConnectorElevation(
  map: EmberMap,
  tileset: EmberTileset,
  x: number,
  y: number,
  dir: RampDir,
): number {
  const { dx, dy } = rampDirDelta(dir);
  const bx = x - dx;
  const by = y - dy;
  if (bx < 0 || by < 0 || bx >= map.width || by >= map.height) {
    return Math.max(0, Math.min(MAX_ELEVATION, elevationAt(map, x, y)));
  }
  const behindE = elevationAt(map, bx, by);
  const behindDir = connectorDirAt(map, tileset, bx, by);
  if (behindDir === dir) {
    return Math.min(MAX_ELEVATION, behindE + 1);
  }
  return Math.max(0, Math.min(MAX_ELEVATION, behindE));
}

/**
 * Elevation band a ramp/stair cell connects.
 * - Default (bottom-mounted): cellE ↔ cellE+1
 * - Top-mounted (climb-dir neighbor shares cellE, e.g. stair on a Z3 platform
 *   next to Z3 grass): (cellE-1) ↔ cellE — so you can walk onto the platform.
 */
export function connectorElevBand(
  map: EmberMap,
  tileset: EmberTileset,
  tileX: number,
  tileY: number,
): { low: number; high: number } | null {
  const conn = connectorDirAt(map, tileset, tileX, tileY);
  if (!conn) return null;
  const cellE = elevationAt(map, tileX, tileY);
  const { dx, dy } = rampDirDelta(conn);
  const fx = tileX + dx;
  const fy = tileY + dy;
  const fwdE =
    fx >= 0 && fy >= 0 && fx < map.width && fy < map.height
      ? elevationAt(map, fx, fy)
      : null;

  // Stairs painted on the upper landing (same elev as platform ahead)
  if (fwdE !== null && fwdE === cellE && cellE > 0) {
    return { low: cellE - 1, high: cellE };
  }
  // Classic: stair at low side, climb toward higher neighbor
  if (fwdE !== null && fwdE === cellE + 1) {
    return { low: cellE, high: cellE + 1 };
  }
  return {
    low: cellE,
    high: Math.min(MAX_ELEVATION, cellE + 1),
  };
}

/** Elevations within this delta count as the same floor for gameplay checks. */
const ELEV_SAME_EPS = 0.55;
/** Max elev change when crossing onto the next stair step / landing. */
const ELEV_STEP_EPS = 1.05;
/**
 * Max wall / voxel-prop height *delta* (in voxels) the player and mobs
 * auto-step onto from their current stand elev.
 * 4 voxels ≈ 0.25 elev stories when tileSize = 16.
 * Relative: floor→4vox and 4vox→8vox both work; floor→8vox does not.
 */
export const MAX_AUTO_STEP_VOXELS = 4;
/**
 * Extra south collision on walls / raised floors so the drawn sprite (larger
 * than the move radius) stops flush with the facade instead of sinking in.
 */
const WALL_SOUTH_STANDOFF = 0.5;

export type EmberVoxelModelLib = Record<string, EmberVoxelModel>;
export type EmberVoxelSceneLib = Record<string, EmberVoxelScene>;

const voxelSolidHeightCache = new WeakMap<EmberVoxelModel, number>();
const voxelColumnHeightCache = new WeakMap<EmberVoxelModel, Int16Array>();

/** Visual pose for zone voxel collision (mirrors chestPlacement, no import cycle). */
function zoneVoxelPoseForCollision(
  map: EmberMap,
  region: EmberMapRegion,
): ZoneVoxelPose {
  const center = regionCenter(map, region);
  const ox = clampFinite(region.modelOffsetX, -4, 4, 0) * map.tileSize;
  const oy = clampFinite(region.modelOffsetY, -4, 4, 0) * map.tileSize;
  const x = center.x + ox;
  const y = center.y + oy;
  const { tx, ty } = worldToTile(map, x, y);
  const ctx = Math.min(map.width - 1, Math.max(0, tx));
  const cty = Math.min(map.height - 1, Math.max(0, ty));
  const surfaceElev = tileSurfaceElev(map, ctx, cty);
  const elev =
    region.modelElev != null && Number.isFinite(region.modelElev)
      ? clampFinite(Math.round(region.modelElev), 0, 8, surfaceElev)
      : surfaceElev;
  return {
    x,
    y,
    elev,
    rot: voxelPropRot(region.modelRot),
    scale: clampFinite(region.modelScale, 0.25, 3, 1),
  };
}

/**
 * Map voxel props + zone-placed models that should collide.
 * Non-physical models are omitted (walk-through).
 */
function physicalVoxelPropPlacements(
  map: EmberMap,
  voxelModels?: EmberVoxelModelLib,
  voxelScenes?: EmberVoxelSceneLib,
): EmberVoxelPlacement[] {
  if (!voxelModels) return [];
  const out: EmberVoxelPlacement[] = [];
  for (const place of map.voxelProps ?? []) {
    const model = voxelModels[place.modelId];
    if (!model) continue;
    const collider = resolveWorldCollider(
      model.collider,
      place.collider,
      isVoxelModelPhysical(model),
    );
    if (!collider.enabled || !collider.blocksMovement || collider.isTrigger) continue;
    out.push(place);
  }
  for (const region of map.regions ?? []) {
    if (region.kind !== "chest") continue;
    if (!region.closedModelId && !region.sceneId) continue;
    const pose = zoneVoxelPoseForCollision(map, region);
    out.push(
      ...zoneRegionPhysicalVoxelPlacements(
        map.tileSize,
        region,
        pose,
        voxelModels,
        voxelScenes,
      ),
    );
  }
  return out;
}

function voxelsToElevStories(map: EmberMap, voxels: number): number {
  return voxels / blockStoryHeight(map.tileSize);
}

function maxAutoStepElev(map: EmberMap, body?: ResolvedWorldBody): number {
  return voxelsToElevStories(
    map,
    body?.stepHeightVoxels ?? MAX_AUTO_STEP_VOXELS,
  ) + 0.05;
}

/** Highest solid voxel row + 1 (0 = empty model). Cached per model object. */
export function voxelModelSolidHeightVoxels(model: EmberVoxelModel): number {
  const hit = voxelSolidHeightCache.get(model);
  if (hit != null) return hit;
  const { sx, sy, sz } = voxelGridSize(model);
  let maxY = -1;
  outer: for (let y = sy - 1; y >= 0; y--) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const i = x + z * sx + y * sx * sz;
        if ((model.voxels[i] ?? 0) > 0) {
          maxY = y;
          break outer;
        }
      }
    }
  }
  const h = maxY + 1;
  voxelSolidHeightCache.set(model, h);
  return h;
}

/** Per-footprint-column solid height (top voxel row + 1, 0 = empty column). */
function voxelModelColumnHeights(model: EmberVoxelModel): Int16Array {
  const hit = voxelColumnHeightCache.get(model);
  const { sx, sy, sz } = voxelGridSize(model);
  if (hit && hit.length === sx * sz) return hit;
  const out = new Int16Array(sx * sz);
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      for (let y = sy - 1; y >= 0; y--) {
        const i = x + z * sx + y * sx * sz;
        if ((model.voxels[i] ?? 0) > 0) {
          out[x + z * sx] = y + 1;
          break;
        }
      }
    }
  }
  voxelColumnHeightCache.set(model, out);
  return out;
}

/** Contiguous solid Y-spans per column (inclusive lo, exclusive hi in voxels). */
type VoxelColumnSpan = { lo: number; hi: number };

const voxelColumnSpanCache = new WeakMap<EmberVoxelModel, VoxelColumnSpan[][]>();

function voxelModelColumnSpans(model: EmberVoxelModel): VoxelColumnSpan[][] {
  const hit = voxelColumnSpanCache.get(model);
  const { sx, sy, sz } = voxelGridSize(model);
  if (hit && hit.length === sx * sz) return hit;
  const out: VoxelColumnSpan[][] = new Array(sx * sz);
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const spans: VoxelColumnSpan[] = [];
      let runLo = -1;
      for (let y = 0; y < sy; y++) {
        const solid = (model.voxels[x + z * sx + y * sx * sz] ?? 0) > 0;
        if (solid) {
          if (runLo < 0) runLo = y;
        } else if (runLo >= 0) {
          spans.push({ lo: runLo, hi: y });
          runLo = -1;
        }
      }
      if (runLo >= 0) spans.push({ lo: runLo, hi: sy });
      out[x + z * sx] = spans;
    }
  }
  voxelColumnSpanCache.set(model, out);
  return out;
}

/**
 * Walkable top elev of a wall tile (any voxel height), else null.
 * Whether you can *reach* it is elev-relative (`elevCanMountSurface`).
 */
export function shortWallTopElev(
  map: EmberMap,
  tileX: number,
  tileY: number,
): number | null {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
    return null;
  }
  const vox = heightVoxelsAt(map, tileX, tileY);
  if (vox <= 0) return null;
  return tileSurfaceElev(map, tileX, tileY);
}

function voxelPropRot(rot: number | undefined): number {
  const r = Number.isFinite(rot) ? Math.round(rot!) : 0;
  return ((r % 4) + 4) % 4;
}

type VoxelPropFootprint = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  rot: number;
  sx: number;
  sz: number;
  voxelWorld: number;
  baseElev: number;
  topElev: number;
  solidVoxH: number;
};

function voxelPropFootprint(
  map: EmberMap,
  place: EmberVoxelPlacement,
  model: EmberVoxelModel,
): VoxelPropFootprint | null {
  const solidVoxH = voxelModelSolidHeightVoxels(model);
  if (solidVoxH <= 0) return null;
  const { sx, sz } = voxelGridSize(model);
  const ts = map.tileSize;
  const vw = ts / VOXELS_PER_BLOCK;
  const rot = voxelPropRot(place.rot);
  const fw = (rot % 2 === 0 ? sx : sz) * vw;
  const fd = (rot % 2 === 0 ? sz : sx) * vw;
  const cx = place.x * ts + (sx * vw) * 0.5;
  const cy = place.y * ts + (sz * vw) * 0.5;
  const baseElev = place.elev ?? tileSurfaceElev(map, place.x, place.y);
  return {
    left: cx - fw * 0.5,
    right: cx + fw * 0.5,
    top: cy - fd * 0.5,
    bottom: cy + fd * 0.5,
    rot,
    sx,
    sz,
    voxelWorld: vw,
    baseElev,
    topElev: baseElev + voxelsToElevStories(map, solidVoxH),
    solidVoxH,
  };
}

function voxelPropLocalAtWorld(
  fp: VoxelPropFootprint,
  x: number,
  y: number,
): { x: number; z: number } {
  const w = fp.sx * fp.voxelWorld;
  const d = fp.sz * fp.voxelWorld;
  const dx = x - (fp.left + fp.right) * 0.5;
  const dz = y - (fp.top + fp.bottom) * 0.5;
  // Inverse of Three.js Yaw (group.rotation.y = rot * π/2):
  //   x' = x cosθ + z sinθ
  //   z' = -x sinθ + z cosθ
  // Using +θ here was a forward map and flipped climb direction for rot≠0.
  const angle = fp.rot * (Math.PI / 2);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const localX = (dx * cos - dz * sin + w * 0.5) / fp.voxelWorld;
  const localZ = (dx * sin + dz * cos + d * 0.5) / fp.voxelWorld;
  return { x: localX, z: localZ };
}

function voxelPropContainsLocal(
  fp: VoxelPropFootprint,
  local: { x: number; z: number },
): boolean {
  return local.x >= 0 && local.z >= 0 && local.x < fp.sx && local.z < fp.sz;
}

function voxelPropColumnHeightAtWorld(
  model: EmberVoxelModel,
  fp: VoxelPropFootprint,
  x: number,
  y: number,
): number {
  const local = voxelPropLocalAtWorld(fp, x, y);
  if (!voxelPropContainsLocal(fp, local)) return 0;
  const lx = Math.floor(local.x);
  const lz = Math.floor(local.z);
  return voxelModelColumnHeights(model)[lx + lz * fp.sx] ?? 0;
}

function voxelPropColumnTopElev(
  map: EmberMap,
  model: EmberVoxelModel,
  fp: VoxelPropFootprint,
  x: number,
  y: number,
): number | null {
  const h = voxelPropColumnHeightAtWorld(model, fp, x, y);
  if (h <= 0) return null;
  return fp.baseElev + voxelsToElevStories(map, h);
}

function pointInFootprint(
  x: number,
  y: number,
  fp: Pick<VoxelPropFootprint, "left" | "top" | "right" | "bottom">,
): boolean {
  return x >= fp.left && x < fp.right && y >= fp.top && y < fp.bottom;
}

/** Highest auto-step surface under world (x,y), if any. */
function autoStepSurfacesAt(
  map: EmberMap,
  x: number,
  y: number,
  voxelModels?: EmberVoxelModelLib,
  voxelScenes?: EmberVoxelSceneLib,
): number[] {
  const { tx, ty } = worldToTile(map, x, y);
  const out: number[] = [];
  const wallTop = shortWallTopElev(map, tx, ty);
  if (wallTop != null) out.push(wallTop);
  if (!voxelModels) return out;
  const places = physicalVoxelPropPlacements(map, voxelModels, voxelScenes);
  for (const place of places) {
    const model = voxelModels[place.modelId];
    if (!model) continue;
    const fp = voxelPropFootprint(map, place, model);
    if (!fp || fp.solidVoxH <= 0) continue;
    if (!pointInFootprint(x, y, fp)) continue;
    const surface = voxelPropColumnTopElev(map, model, fp, x, y);
    if (surface != null) out.push(surface);
  }
  return out;
}

/** Pick stand elev with asymmetric movement: step up is limited, falling down is not. */
function pickStandSurfaceElev(
  elev: number,
  map: EmberMap,
  surfaces: number[],
  body?: ResolvedWorldBody,
): number | null {
  if (surfaces.length === 0) return null;
  const maxUp = elev + maxAutoStepElev(map, body);
  let best: number | null = null;
  for (const s of surfaces) {
    if (s > maxUp) continue;
    if (best == null || s > best) best = s;
  }
  return best;
}

/**
 * Standing on / above a surface, or within the auto-step *up* band below it.
 * Deliberately ignores large drops — those are handled by snap/pickStand, not
 * by opening tall wall/prop solids for horizontal walk-through.
 */
function elevCanMountSurface(
  map: EmberMap,
  elev: number,
  surface: number,
  body?: ResolvedWorldBody,
): boolean {
  if (elev >= surface - 0.02) return true;
  return surface <= elev + maxAutoStepElev(map, body) + 0.02;
}

/**
 * Column is a hard blocker at `elev` when feet are below the mount band
 * (deep in the solid) and not entirely under the prop base.
 */
function elevBlockedByColumnTop(
  elev: number,
  baseElev: number,
  topElev: number,
  body: ResolvedWorldBody,
  layer: WorldVerticalSpan["layer"] = "world",
): boolean {
  const span: WorldVerticalSpan = {
    min: baseElev,
    max: topElev,
    walkableTop: true,
    layer,
  };
  if (!spanBlocksBody(span, elev, body)) return false;
  if (canAutoStepTo(elev, topElev, body)) return false;
  return true;
}

function circleHitsTallVoxelProp(
  map: EmberMap,
  x: number,
  y: number,
  radius: number,
  elev: number,
  voxelModels?: EmberVoxelModelLib,
  voxelScenes?: EmberVoxelSceneLib,
  body: ResolvedWorldBody = resolveWorldBody(),
): boolean {
  if (!voxelModels) return false;
  const places = physicalVoxelPropPlacements(map, voxelModels, voxelScenes);
  if (places.length === 0) return false;
  const r = Math.max(0.5, radius);
  for (const place of places) {
    const model = voxelModels[place.modelId];
    if (!model) continue;
    const collider = resolveWorldCollider(
      model.collider,
      place.collider,
      isVoxelModelPhysical(model),
    );
    if (!colliderAffectsBody(collider, body)) continue;
    const fp = voxelPropFootprint(map, place, model);
    if (!fp) continue;
    if (
      !circleOverlapsAabb(x, y, r, fp.left, fp.top, fp.right, fp.bottom)
    ) {
      continue;
    }

    const local = voxelPropLocalAtWorld(fp, x, y);
    const heights = voxelModelColumnHeights(model);
    const localR = r / fp.voxelWorld;
    const cx = local.x;
    const cz = local.z;
    const minX = Math.max(0, Math.floor(cx - localR));
    const maxX = Math.min(fp.sx - 1, Math.floor(cx + localR));
    const minZ = Math.max(0, Math.floor(cz - localR));
    const maxZ = Math.min(fp.sz - 1, Math.floor(cz + localR));

    const footTile = worldToTile(map, x, y);
    const floorE = elevationAt(map, footTile.tx, footTile.ty);
    const onFloor =
      Math.abs(elev - floorE) <= 0.05 &&
      shortWallTopElev(map, footTile.tx, footTile.ty) == null;
    // Fall soft-lock escape: grazing a tall exterior face while standing on
    // the floor outside the prop. Once the center is inside the footprint,
    // risers stay solid (stair phase-through).
    const centerOutsideProp = !pointInFootprint(x, y, fp);
    // Player radius reaches ~2.5 vx — only the immediate riser should body-block
    // so 2vx sculpted stairs can climb without the +2 step walling them off.
    const nearRiser = 1.05;

    const spansByCol = voxelModelColumnSpans(model);
    for (let lz = minZ; lz <= maxZ; lz++) {
      for (let lx = minX; lx <= maxX; lx++) {
        const h = heights[lx + lz * fp.sx] ?? 0;
        if (h <= 0) continue;
        const spans = spansByCol[lx + lz * fp.sx] ?? [];
        // Prefer real solid runs (overhangs / floating cells) over a solid pillar.
        const runs =
          spans.length > 0
            ? spans
            : [{ lo: 0, hi: h }];
        let blocked = false;
        for (const span of runs) {
          const spanBase =
            fp.baseElev +
            collider.offsetVoxels / VOXELS_PER_BLOCK +
            voxelsToElevStories(map, span.lo);
          const spanTop =
            fp.baseElev +
            collider.offsetVoxels / VOXELS_PER_BLOCK +
            voxelsToElevStories(map, span.hi);
          if (
            elevBlockedByColumnTop(
              elev,
              spanBase,
              spanTop,
              body,
              collider.layer,
            )
          ) {
            blocked = true;
            break;
          }
        }
        if (!blocked) continue;
        const centerInCol =
          cx >= lx && cx < lx + 1 && cz >= lz && cz < lz + 1;
        if (centerInCol) return true;
        if (
          !circleOverlapsAabb(cx, cz, localR, lx, lz, lx + 1, lz + 1)
        ) {
          continue;
        }
        if (onFloor && centerOutsideProp) continue;
        const nearest = Math.hypot(
          Math.max(lx - cx, 0, cx - (lx + 1)),
          Math.max(lz - cz, 0, cz - (lz + 1)),
        );
        if (nearest > nearRiser) continue;
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether an entity at `elev` may occupy world point (tile under feet).
 * On stairs/ramps any value in the climb band is allowed (smooth ascent).
 * Also allows approaching from the adjacent step (±1) so flights don't jam
 * on cell boundaries.
 */
export function canStandAtElev(
  map: EmberMap,
  tileset: EmberTileset,
  tileX: number,
  tileY: number,
  elev: number,
  bodyModifier?: EmberBodyModifier,
): boolean {
  const body = resolveWorldBody(bodyModifier);
  const colliderSpans = tileColliderSpansAt(map, tileset, tileX, tileY);
  if (!bodyHasClearance(colliderSpans, elev, body)) {
    return false;
  }
  const wallTop = shortWallTopElev(map, tileX, tileY);
  const hasWallCollider =
    wallTop != null && colliderSpans.some((span) => span.max >= wallTop - 0.01);
  if (wallTop != null && hasWallCollider) {
    return Math.abs(elev - wallTop) < ELEV_SAME_EPS;
  }
  const cellE = elevationAt(map, tileX, tileY);
  const band = connectorElevBand(map, tileset, tileX, tileY);
  if (band) {
    if (elev >= band.low - 0.05 && elev <= band.high + 0.05) return true;
    // Entering this step from the previous/next stair in a flight
    if (elev >= band.low - ELEV_STEP_EPS && elev < band.low) return true;
    if (elev <= band.high + ELEV_STEP_EPS && elev > band.high) return true;
    return false;
  }
  // Flat floor — allow a little slack so you can step off a stair smoothly.
  const supports = tileSupportSurfacesAt(map, tileset, tileX, tileY);
  if (supports.some((surface) => Math.abs(elev - surface) < ELEV_SAME_EPS)) {
    return true;
  }
  return supports.length === 0 && Math.abs(elev - cellE) < ELEV_SAME_EPS;
}

/**
 * Continuous elev on a connector: lerp low→high along the climb axis.
 * Off connectors, snap to the cell's floor elevation.
 */
export function snapElevAtWorld(
  map: EmberMap,
  tileset: EmberTileset,
  x: number,
  y: number,
  elev: number,
  voxelModels?: EmberVoxelModelLib,
  voxelScenes?: EmberVoxelSceneLib,
  bodyModifier?: EmberBodyModifier,
): number {
  const body = resolveWorldBody(bodyModifier);
  const { tx, ty } = worldToTile(map, x, y);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return elev;
  const cellE = elevationAt(map, tx, ty);
  const conn = connectorDirAt(map, tileset, tx, ty);
  if (conn) {
    const band = connectorElevBand(map, tileset, tx, ty);
    if (!band) return cellE;
    const ts = map.tileSize;
    const lx = (x - tx * ts) / ts;
    const ly = (y - ty * ts) / ts;
    // 0 = low end of the flight, 1 = high end
    let t = 0;
    switch (conn) {
      case "n":
        t = 1 - ly;
        break;
      case "s":
        t = ly;
        break;
      case "w":
        t = 1 - lx;
        break;
      case "e":
        t = lx;
        break;
      default: {
        const _n: never = conn;
        void _n;
      }
    }
    t = Math.max(0, Math.min(1, t));
    return band.low + (band.high - band.low) * t;
  }

  const wallTop = shortWallTopElev(map, tx, ty);
  const surfaces = autoStepSurfacesAt(map, x, y, voxelModels, voxelScenes);
  surfaces.push(...tileSupportSurfacesAt(map, tileset, tx, ty));
  if (surfaces.length === 0 && wallTop == null) surfaces.push(cellE);
  const stepped = pickStandSurfaceElev(elev, map, surfaces, body);
  if (stepped != null) return stepped;
  if (wallTop != null) return elev;
  // Same / lower floor: fall or stay. Higher unreachable floor: keep elev so
  // floating slabs (ground_z3 over air) can be walked under at Z0.
  if (cellE <= elev + 0.02) return cellE;
  return elev;
}

/** True when two elevations are close enough to interact (touch / projectiles). */
export function elevNearlyEqual(a: number, b: number, eps = ELEV_SAME_EPS): boolean {
  return Math.abs(a - b) < eps;
}

function circleOverlapsAabb(
  x: number,
  y: number,
  radius: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): boolean {
  const cx = Math.max(left, Math.min(x, right));
  const cy = Math.max(top, Math.min(y, bottom));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < radius * radius;
}

/**
 * How many vertical elev stories a solid sprite occupies.
 * Each wall strip contributes ~stripH/WALL_HEIGHT stories (min 1).
 */
function spriteSolidStories(
  n: Pick<EmberPixelSprite, "wallHeights" | "topHeight">,
): number {
  const walls = n.wallHeights ?? [];
  if (walls.length === 0) return 1;
  let stories = 0;
  for (const h of walls) {
    stories += Math.max(1, Math.round(h / WALL_HEIGHT));
  }
  return Math.max(1, stories);
}

/**
 * Logical footprint AABB for a solid sprite (world XY, not display extrusion).
 * Tall columns must not use the full drawn height as a Z0 hitbox.
 */
export function solidSpriteAabb(
  map: EmberMap,
  place: EmberSpritePlacement,
  sprites: EmberSpriteLib,
  _viewMode: MapViewMode = "top",
): {
  left: number;
  top: number;
  right: number;
  bottom: number;
  elev: number;
  stories: number;
} | null {
  const raw = sprites[place.spriteId];
  if (!raw) return null;
  const collider = resolveSpriteInstanceCollider(place, raw);
  if (!collider.enabled || !collider.blocksMovement || collider.isTrigger) return null;
  const n = normalizePixelSprite(raw);
  const elev = elevationAt(map, place.x, place.y);
  const ts = map.tileSize;
  const hw = Math.max(2, n.width / 2);
  const hh = Math.max(2, Math.min(ts, n.width) / 2);
  const cx = place.x * ts + ts / 2;
  const cy = place.y * ts + ts / 2;
  return {
    left: cx - hw,
    right: cx + hw,
    top: cy - hh,
    bottom: cy + hh,
    elev,
    stories: spriteSolidStories(n),
  };
}

function circleHitsSolidSprite(
  map: EmberMap,
  place: EmberSpritePlacement,
  sprites: EmberSpriteLib,
  x: number,
  y: number,
  radius: number,
  elev: number,
  body: ResolvedWorldBody,
): boolean {
  const box = solidSpriteAabb(map, place, sprites);
  if (!box) return false;
  const raw = sprites[place.spriteId];
  if (!raw) return false;
  const collider = resolveSpriteInstanceCollider(place, raw);
  if (!colliderAffectsBody(collider, body)) return false;
  const offset = collider.offsetVoxels / VOXELS_PER_BLOCK;
  const height =
    collider.heightVoxels == null
      ? box.stories
      : collider.heightVoxels / VOXELS_PER_BLOCK;
  if (
    !spanBlocksBody(
      {
        min: box.elev + offset,
        max: box.elev + offset + height,
        walkableTop: collider.walkableTop,
        layer: collider.layer,
      },
      elev,
      body,
    )
  ) return false;
  return circleOverlapsAabb(
    x,
    y,
    radius,
    box.left,
    box.top,
    box.right,
    box.bottom,
  );
}

/**
 * Solid / elevated-obstacle test in the active camera's display space.
 * Top view uses a tight display-space scan; yawed views project with a
 * cached pad (no full-map rescan per cell).
 */
export function circleHitsSolid(
  map: EmberMap,
  tileset: EmberTileset,
  x: number,
  y: number,
  radius: number,
  elev = 0,
  sprites?: EmberSpriteLib,
  viewMode: MapViewMode = "top",
  voxelModels?: EmberVoxelModelLib,
  voxelScenes?: EmberVoxelSceneLib,
  bodyModifier?: EmberBodyModifier,
): boolean {
  const body = resolveWorldBody(bodyModifier, radius);
  if (viewMode === "top") {
    return circleHitsSolidTop(
      map,
      tileset,
      x,
      y,
      radius,
      elev,
      sprites,
      voxelModels,
      voxelScenes,
      body,
    );
  }
  return circleHitsSolidYawed(
    map,
    tileset,
    x,
    y,
    radius,
    elev,
    sprites,
    viewMode,
    voxelModels,
    voxelScenes,
    body,
  );
}

/** Original top-down display-space collision (cheap, no per-cell project). */
function circleHitsSolidTop(
  map: EmberMap,
  tileset: EmberTileset,
  x: number,
  y: number,
  radius: number,
  elev: number,
  sprites?: EmberSpriteLib,
  voxelModels?: EmberVoxelModelLib,
  voxelScenes?: EmberVoxelSceneLib,
  body: ResolvedWorldBody = resolveWorldBody(),
): boolean {
  const r = Math.max(0.5, radius);
  const ts = map.tileSize;
  const entOff = elevVisualOffset(elev);
  const px = x;
  const py = y - entOff;
  const foot = worldToTile(map, x, y);
  const footBand = connectorElevBand(map, tileset, foot.tx, foot.ty);
  const padInfo = getViewPadInfo(map);
  const maxLift = WALL_HEIGHT * (padInfo.maxWall + padInfo.maxElev);
  const minTx = Math.floor((px - r) / ts);
  const maxTx = Math.floor((px + r) / ts);
  const minTy = Math.floor((py - r - maxLift) / ts) - 1;
  const maxTy = Math.floor((py + r + maxLift) / ts) + 1;

  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const solid = isSolidAt(map, tileset, tx, ty);
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) {
        if (!solid) continue;
        const left = tx * ts;
        const top = ty * ts;
        // Map edge is logical (world XY). Do NOT use display py — elev
        // lift would false-hit northern OOB and jam Z1→Z2 stairs near
        // the top of the map (or on short maps).
        if (circleOverlapsAabb(x, y, r, left, top, left + ts, top + ts)) {
          return true;
        }
        continue;
      }

      const cellE = elevationAt(map, tx, ty);
      const cellOff = elevVisualOffset(cellE);
      const left = tx * ts;
      const right = left + ts;

      if (solid) {
        if (!tileBlocksBodyAtElev(map, tileset, tx, ty, elev, body)) {
          continue;
        }
        // Wall top within auto-step *up* of current elev → walkable (no block).
        const wallTop = shortWallTopElev(map, tx, ty);
        if (wallTop != null && elevCanMountSurface(map, elev, wallTop, body)) {
          continue;
        }
        const standoff = WALL_SOUTH_STANDOFF;
        const wallTopY = ty * ts;
        const wallBotY = wallTopY + ts + standoff;
        if (!circleOverlapsAabb(x, y, r, left, wallTopY, right, wallBotY)) {
          continue;
        }
        // After a long fall, feet land on the adjacent floor while the radius
        // still overlaps the tall wall (+ south standoff). Keep the wall solid
        // for entry, but if feet are already on another walkable cell, only
        // block when the center crosses into this wall tile — otherwise the
        // player sticks forever against small move steps.
        const feetOnThis = foot.tx === tx && foot.ty === ty;
        if (feetOnThis) return true;
        if (x >= left && x < right && y >= wallTopY && y < wallTopY + ts) {
          return true;
        }
        continue;
      }

      const band = connectorElevBand(map, tileset, tx, ty);
      const onCell = foot.tx === tx && foot.ty === ty;
      const manh = Math.abs(tx - foot.tx) + Math.abs(ty - foot.ty);

      // Stairs/ramps: solid unless approaching from the climb low/high end.
      // High end requires elev on the upper landing — ELEV_STEP_EPS below
      // band.high let Z0 walk under the flight and phase through.
      if (band && !onCell) {
        const conn = connectorDirAt(map, tileset, tx, ty);
        if (conn) {
          const { dx, dy } = rampDirDelta(conn);
          const fromLow = foot.tx === tx - dx && foot.ty === ty - dy;
          const fromHigh = foot.tx === tx + dx && foot.ty === ty + dy;
          const elevOkLow =
            elev >= band.low - ELEV_STEP_EPS && elev <= band.high + ELEV_STEP_EPS;
          const elevOkHigh =
            elev >= band.high - ELEV_SAME_EPS && elev <= band.high + ELEV_SAME_EPS;
          const allowed = (fromLow && elevOkLow) || (fromHigh && elevOkHigh);
          if (
            !allowed &&
            circleOverlapsAabb(
              x,
              y,
              r,
              left,
              ty * ts,
              right,
              ty * ts + ts,
            )
          ) {
            return true;
          }
        }
        continue;
      }

      // Independent ground_z blocks use real body volume. A Z3 slab is above
      // the default actor's head at Z0; a Z1 slab or filled column is not.
      if (
        !band &&
        tileBlocksBodyAtElev(map, tileset, tx, ty, elev, body) &&
        (onCell || !isConnectorLandingAt(map, tileset, tx, ty)) &&
        circleOverlapsAabb(
          x,
          y,
          r,
          left,
          ty * ts,
          right,
          ty * ts + ts + WALL_SOUTH_STANDOFF,
        )
      ) {
        return true;
      }

      // Floating slabs (bottom story above feet) are walk-under.
      // Filled cliffs (bottom ≤ elev) still body-block like before.
      const bottomE = bottomOccupiedElevAt(map, tx, ty) ?? cellE;
      if (
        cellE > elev &&
        cellOff > 0 &&
        elev + 0.05 >= bottomE &&
        !canStandAtElev(map, tileset, tx, ty, elev)
      ) {
        if (
          footBand &&
          manh <= 2 &&
          cellE >= footBand.low - 0.05 &&
          cellE <= footBand.high + 1.05
        ) {
          continue;
        }
        if (manh <= 2 && cellE - elev <= ELEV_STEP_EPS) {
          continue;
        }
        const standoff = WALL_SOUTH_STANDOFF;
        if (
          circleOverlapsAabb(
            x,
            y,
            r,
            left,
            ty * ts,
            right,
            ty * ts + ts + standoff,
          )
        ) {
          return true;
        }
      }
    }
  }

  if (sprites && map.sprites?.length) {
    for (const place of map.sprites) {
      if (circleHitsSolidSprite(map, place, sprites, x, y, r, elev, body)) {
        return true;
      }
    }
  }
  if (circleHitsTallVoxelProp(map, x, y, r, elev, voxelModels, voxelScenes, body)) {
    return true;
  }
  return false;
}

function circleHitsSolidYawed(
  map: EmberMap,
  tileset: EmberTileset,
  x: number,
  y: number,
  radius: number,
  elev: number,
  sprites: EmberSpriteLib | undefined,
  _viewMode: "sideEast" | "sideWest" | "sideNorth",
  voxelModels?: EmberVoxelModelLib,
  voxelScenes?: EmberVoxelSceneLib,
  body: ResolvedWorldBody = resolveWorldBody(),
): boolean {
  const r = Math.max(0.5, radius);
  const ts = map.tileSize;
  const padInfo = getViewPadInfo(map);
  const foot = worldToTile(map, x, y);
  const footBand = connectorElevBand(map, tileset, foot.tx, foot.ty);
  // Logical neighborhood only — elev lift is already in projection.
  const margin = Math.min(4, padInfo.maxElev + 2);

  for (let ty = foot.ty - margin; ty <= foot.ty + margin; ty++) {
    for (let tx = foot.tx - margin; tx <= foot.tx + margin; tx++) {
      const solid = isSolidAt(map, tileset, tx, ty);
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) {
        if (!solid) continue;
        const left = tx * ts;
        const top = ty * ts;
        if (circleOverlapsAabb(x, y, r, left, top, left + ts, top + ts)) {
          return true;
        }
        continue;
      }

      const cellE = elevationAt(map, tx, ty);

      if (solid) {
        if (!tileBlocksBodyAtElev(map, tileset, tx, ty, elev, body)) {
          continue;
        }
        const wallTop = shortWallTopElev(map, tx, ty);
        if (wallTop != null && elevCanMountSurface(map, elev, wallTop, body)) {
          continue;
        }
        const standoff = WALL_SOUTH_STANDOFF;
        const left = tx * ts;
        const wallTopY = ty * ts;
        const right = left + ts;
        const wallBotY = wallTopY + ts + standoff;
        if (!circleOverlapsAabb(x, y, r, left, wallTopY, right, wallBotY)) {
          continue;
        }
        const feetOnThis = foot.tx === tx && foot.ty === ty;
        if (feetOnThis) return true;
        if (x >= left && x < right && y >= wallTopY && y < wallTopY + ts) {
          return true;
        }
        continue;
      }

      const band = connectorElevBand(map, tileset, tx, ty);
      const onCell = foot.tx === tx && foot.ty === ty;
      const manh = Math.abs(tx - foot.tx) + Math.abs(ty - foot.ty);

      if (band && !onCell) {
        const conn = connectorDirAt(map, tileset, tx, ty);
        if (conn) {
          const { dx, dy } = rampDirDelta(conn);
          const fromLow = foot.tx === tx - dx && foot.ty === ty - dy;
          const fromHigh = foot.tx === tx + dx && foot.ty === ty + dy;
          const elevOkLow =
            elev >= band.low - ELEV_STEP_EPS && elev <= band.high + ELEV_STEP_EPS;
          const elevOkHigh =
            elev >= band.high - ELEV_SAME_EPS && elev <= band.high + ELEV_SAME_EPS;
          const allowed = (fromLow && elevOkLow) || (fromHigh && elevOkHigh);
          if (
            !allowed &&
            circleOverlapsAabb(
              x,
              y,
              r,
              tx * ts,
              ty * ts,
              tx * ts + ts,
              ty * ts + ts,
            )
          ) {
            return true;
          }
        }
        continue;
      }


      if (
        !band &&
        tileBlocksBodyAtElev(map, tileset, tx, ty, elev, body) &&
        (onCell || !isConnectorLandingAt(map, tileset, tx, ty)) &&
        circleOverlapsAabb(
          x,
          y,
          r,
          tx * ts,
          ty * ts,
          tx * ts + ts,
          ty * ts + ts + WALL_SOUTH_STANDOFF,
        )
      ) {
        return true;
      }

      const bottomE = bottomOccupiedElevAt(map, tx, ty) ?? cellE;
      if (
        cellE > elev &&
        cellE > 0 &&
        elev + 0.05 >= bottomE &&
        !canStandAtElev(map, tileset, tx, ty, elev)
      ) {
        if (
          footBand &&
          manh <= 2 &&
          cellE >= footBand.low - 0.05 &&
          cellE <= footBand.high + 1.05
        ) {
          continue;
        }
        if (manh <= 2 && cellE - elev <= ELEV_STEP_EPS) {
          continue;
        }
        const standoff = WALL_SOUTH_STANDOFF;
        if (
          circleOverlapsAabb(
            x,
            y,
            r,
            tx * ts,
            ty * ts,
            tx * ts + ts,
            ty * ts + ts + standoff,
          )
        ) {
          return true;
        }
      }
    }
  }

  if (sprites && map.sprites?.length) {
    for (const place of map.sprites) {
      if (circleHitsSolidSprite(map, place, sprites, x, y, r, elev, body)) {
        return true;
      }
    }
  }
  if (circleHitsTallVoxelProp(map, x, y, r, elev, voxelModels, voxelScenes, body)) {
    return true;
  }
  return false;
}

/**
 * May the entity move to (x,y) at current elev?
 * Uses post-snap elev so stair→stair / stair→landing don't jam mid-step.
 * `fromX/fromY` = feet before this step (for stair→landing handoff).
 */
function canOccupyAtWorld(
  map: EmberMap,
  tileset: EmberTileset,
  x: number,
  y: number,
  elev: number,
  fromX: number,
  fromY: number,
  voxelModels?: EmberVoxelModelLib,
  voxelScenes?: EmberVoxelSceneLib,
  body: ResolvedWorldBody = resolveWorldBody(),
): boolean {
  const { tx, ty } = worldToTile(map, x, y);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;

  const wallTop = shortWallTopElev(map, tx, ty);
  if (tileBlocksBodyAtElev(map, tileset, tx, ty, elev, body) && wallTop == null) {
    return false;
  }

  const cellE = elevationAt(map, tx, ty);

  const snapped = snapElevAtWorld(
    map,
    tileset,
    x,
    y,
    elev,
    voxelModels,
    voxelScenes,
    body,
  );
  const maxStepUp = Math.max(ELEV_STEP_EPS, maxAutoStepElev(map, body));
  const deltaUp = snapped - elev;
  if (deltaUp > maxStepUp) return false;

  // Auto-step up or drop down onto short wall / voxel prop tops.
  const autoStepSurfaces = autoStepSurfacesAt(
    map,
    x,
    y,
    voxelModels,
    voxelScenes,
  );
  const standSurface = pickStandSurfaceElev(elev, map, autoStepSurfaces, body);
  if (standSurface != null) {
    if (Math.abs(snapped - standSurface) < 0.02) return true;
  }

  const from = worldToTile(map, fromX, fromY);
  const fromConn = connectorDirAt(map, tileset, from.tx, from.ty);
  const toConn = connectorDirAt(map, tileset, tx, ty);

  /** Leave a stair/ramp only via the climb-axis ends (not sideways through). */
  const leavingConnectorEnds = (): boolean => {
    if (!fromConn) return true;
    if (from.tx === tx && from.ty === ty) return true;
    const { dx, dy } = rampDirDelta(fromConn);
    const offLow = tx === from.tx - dx && ty === from.ty - dy;
    const offHigh = tx === from.tx + dx && ty === from.ty + dy;
    return offLow || offHigh;
  };

  if (canStandAtElev(map, tileset, tx, ty, snapped, body)) {
    // Onto / along a connector
    if (toConn) return true;
    // Falling may cover more than the auto-step budget; once snap found a
    // valid lower surface, allow the landing while preserving stair side gates.
    if (snapped < elev - ELEV_SAME_EPS) {
      return leavingConnectorEnds();
    }
    // Same floor — but not sideways off a stair
    if (Math.abs(elev - snapped) < ELEV_SAME_EPS) {
      return leavingConnectorEnds();
    }
    // Stair → landing: only off the high/low end
    if (fromConn && Math.abs(elev - cellE) <= ELEV_STEP_EPS) {
      return leavingConnectorEnds();
    }
    return false;
  }

  // Stair → stair handoff while circle still straddles (pre-snap elev)
  const fromBand = connectorElevBand(map, tileset, from.tx, from.ty);
  const toBand = connectorElevBand(map, tileset, tx, ty);
  if (fromBand && toBand) {
    const abut =
      Math.abs(fromBand.high - toBand.low) <= 0.05 ||
      Math.abs(fromBand.low - toBand.high) <= 0.05 ||
      (elev >= Math.min(fromBand.low, toBand.low) - 0.05 &&
        elev <= Math.max(fromBand.high, toBand.high) + 0.05);
    if (abut && Math.abs(snapped - elev) <= ELEV_STEP_EPS) return true;
  }

  // Walk under a floating slab (lowest occupied story above feet).
  const bottomE = bottomOccupiedElevAt(map, tx, ty);
  if (
    bottomE != null &&
    elev + 0.05 < bottomE &&
    wallTop == null &&
    !isSolidAt(map, tileset, tx, ty)
  ) {
    return true;
  }

  // Circle still centered on this tile with pre-snap elev (straddling cells)
  return canStandAtElev(map, tileset, tx, ty, elev, body);
}

/**
 * Solid test at the elev you would have after snapping at (x,y).
 * Using pre-snap elev made long drops land inside tall wall/prop AABBs and
 * then reject every subsequent step.
 */
function circleHitsSolidAtSnappedElev(
  map: EmberMap,
  tileset: EmberTileset,
  x: number,
  y: number,
  radius: number,
  elev: number,
  sprites: EmberSpriteLib | undefined,
  viewMode: MapViewMode,
  voxelModels: EmberVoxelModelLib | undefined,
  voxelScenes?: EmberVoxelSceneLib,
  bodyModifier?: EmberBodyModifier,
): { hit: boolean; elev: number } {
  const snapped = snapElevAtWorld(
    map,
    tileset,
    x,
    y,
    elev,
    voxelModels,
    voxelScenes,
    bodyModifier,
  );
  return {
    elev: snapped,
    hit: circleHitsSolid(
      map,
      tileset,
      x,
      y,
      radius,
      snapped,
      sprites,
      viewMode,
      voxelModels,
      voxelScenes,
      bodyModifier,
    ),
  };
}

/** Axis-separated move with wall + elevation gates; snaps elev on connectors. */
export function tryMoveWithElevation(
  map: EmberMap,
  tileset: EmberTileset,
  x: number,
  y: number,
  nextX: number,
  nextY: number,
  radius: number,
  elev: number,
  sprites?: EmberSpriteLib,
  viewMode: MapViewMode = "top",
  voxelModels?: EmberVoxelModelLib,
  voxelScenes?: EmberVoxelSceneLib,
  bodyModifier?: EmberBodyModifier,
): { x: number; y: number; elev: number } {
  let nx = x;
  let ny = y;
  let e = elev;
  const body = resolveWorldBody(bodyModifier, radius);

  const embeddedHere = circleHitsSolid(
    map,
    tileset,
    x,
    y,
    radius,
    e,
    sprites,
    viewMode,
    voxelModels,
    voxelScenes,
    bodyModifier,
  );

  const xProbe = circleHitsSolidAtSnappedElev(
    map,
    tileset,
    nextX,
    y,
    radius,
    e,
    sprites,
    viewMode,
    voxelModels,
    voxelScenes,
    bodyModifier,
  );
  if (
    (!xProbe.hit || embeddedHere) &&
    canOccupyAtWorld(
      map,
      tileset,
      nextX,
      y,
      e,
      x,
      y,
      voxelModels,
      voxelScenes,
      body,
    )
  ) {
    nx = nextX;
    e = xProbe.elev;
  }

  const yProbe = circleHitsSolidAtSnappedElev(
    map,
    tileset,
    nx,
    nextY,
    radius,
    e,
    sprites,
    viewMode,
    voxelModels,
    voxelScenes,
    bodyModifier,
  );
  if (
    (!yProbe.hit ||
      circleHitsSolid(
        map,
        tileset,
        nx,
        ny,
        radius,
        e,
        sprites,
        viewMode,
        voxelModels,
        voxelScenes,
        bodyModifier,
      )) &&
    canOccupyAtWorld(
      map,
      tileset,
      nx,
      nextY,
      e,
      nx,
      ny,
      voxelModels,
      voxelScenes,
      body,
    )
  ) {
    ny = nextY;
    e = yProbe.elev;
  } else {
    e = snapElevAtWorld(
      map,
      tileset,
      nx,
      ny,
      e,
      voxelModels,
      voxelScenes,
      bodyModifier,
    );
  }

  // Prefer canOccupy (stair handoffs) over raw canStand.
  if (
    !canOccupyAtWorld(
      map,
      tileset,
      nx,
      ny,
      e,
      x,
      y,
      voxelModels,
      voxelScenes,
      body,
    )
  ) {
    if (
      !canOccupyAtWorld(
        map,
        tileset,
        x,
        y,
        elev,
        x,
        y,
        voxelModels,
        voxelScenes,
        body,
      )
    ) {
      return { x, y, elev };
    }
    return {
      x,
      y,
      elev: snapElevAtWorld(
        map,
        tileset,
        x,
        y,
        elev,
        voxelModels,
        voxelScenes,
        bodyModifier,
      ),
    };
  }
  return { x: nx, y: ny, elev: e };
}

/** Jump to adjacent walkable cell if elevation differs by exactly 1. */
export function tryJumpLedge(
  map: EmberMap,
  tileset: EmberTileset,
  x: number,
  y: number,
  elev: number,
  dirX: number,
  dirY: number,
  radius: number,
  sprites?: EmberSpriteLib,
  viewMode: MapViewMode = "top",
  voxelModels?: EmberVoxelModelLib,
  voxelScenes?: EmberVoxelSceneLib,
  bodyModifier?: EmberBodyModifier,
): { x: number; y: number; elev: number } | null {
  const body = resolveWorldBody(bodyModifier, radius);
  const len = Math.hypot(dirX, dirY);
  if (len < 0.01) return null;
  const fx = dirX / len;
  const fy = dirY / len;
  const ts = map.tileSize;
  const { tx, ty } = worldToTile(map, x, y);
  const atx = tx + Math.round(fx);
  const aty = ty + Math.round(fy);
  // Prefer cardinal from aim
  let jx = tx;
  let jy = ty;
  if (Math.abs(fx) >= Math.abs(fy)) {
    jx = tx + (fx > 0 ? 1 : fx < 0 ? -1 : 0);
    jy = ty;
  } else {
    jx = tx;
    jy = ty + (fy > 0 ? 1 : fy < 0 ? -1 : 0);
  }
  if (jx === tx && jy === ty) {
    jx = atx;
    jy = aty;
  }
  const wallTop = shortWallTopElev(map, jx, jy);
  const targetE = wallTop ?? elevationAt(map, jx, jy);
  if (tileBlocksBodyAtElev(map, tileset, jx, jy, targetE, body) && wallTop == null) {
    return null;
  }
  if (Math.abs(targetE - elev) !== 1) return null;
  const cx = jx * ts + ts / 2;
  const cy = jy * ts + ts / 2;
  if (
    circleHitsSolid(
      map,
      tileset,
      cx,
      cy,
      radius,
      targetE,
      sprites,
      viewMode,
      voxelModels,
      voxelScenes,
      bodyModifier,
    )
  ) {
    return null;
  }
  if (!canStandAtElev(map, tileset, jx, jy, targetE, bodyModifier)) return null;
  return { x: cx, y: cy, elev: targetE };
}

export function resolveTeleportTarget(
  map: EmberMap,
  region: EmberMapRegion,
): { x: number; y: number; elev: number } | null {
  if (region.kind !== "teleport") return null;
  if (region.targetRegionId) {
    const dest = map.regions.find((r) => r.id === region.targetRegionId);
    if (!dest) return null;
    const c = regionCenter(map, dest);
    const { tx, ty } = worldToTile(map, c.x, c.y);
    return {
      x: c.x,
      y: c.y,
      elev: region.targetElevation ?? tileSurfaceElev(map, tx, ty),
    };
  }
  if (region.targetX == null || region.targetY == null) return null;
  const ts = map.tileSize;
  const tx = region.targetX;
  const ty = region.targetY;
  return {
    x: tx * ts + ts / 2,
    y: ty * ts + ts / 2,
    elev: region.targetElevation ?? tileSurfaceElev(map, tx, ty),
  };
}

export function pointInRegion(
  map: EmberMap,
  region: EmberMapRegion,
  x: number,
  y: number,
): boolean {
  const ts = map.tileSize;
  const left = region.x * ts;
  const top = region.y * ts;
  const right = (region.x + region.w) * ts;
  const bottom = (region.y + region.h) * ts;
  return x >= left && x < right && y >= top && y < bottom;
}

export function worldToTile(
  map: EmberMap,
  x: number,
  y: number,
): { tx: number; ty: number } {
  return {
    tx: Math.floor(x / map.tileSize),
    ty: Math.floor(y / map.tileSize),
  };
}

/** Screen-space top-left of a walkable/wall tile top (editor canvas coords). */
export function tileCanvasTopLeft(
  map: EmberMap,
  tx: number,
  ty: number,
  scale = 1,
  viewMode: MapViewMode = "top",
): { px: number; py: number; ts: number; elevOff: number; shelfH: number } {
  map = ensureMapLayers(map);
  const elev = elevationAt(map, tx, ty);
  const p = projectCell(viewMode, map, tx, ty, elev, scale);
  return {
    px: p.px,
    py: p.py,
    ts: p.ts,
    elevOff: p.elevOff,
    shelfH: p.shelfH,
  };
}

/**
 * Editor canvas pixel → sprite placement by visual AABB (top + wall stack).
 * Prefers frontmost (higher ty, then higher elev). Hits the base/block under
 * the top face, not only the placement tile center.
 */
export function canvasPixelToSpritePlacement(
  map: EmberMap,
  sx: number,
  sy: number,
  scale: number,
  sprites: EmberSpriteLib,
  viewMode: MapViewMode = "top",
): EmberSpritePlacement | null {
  map = ensureMapLayers(map);
  const list = map.sprites;
  if (!list?.length) return null;
  let best: EmberSpritePlacement | null = null;
  let bestScore = -Infinity;

  for (const place of list) {
    const raw = sprites[place.spriteId];
    if (!raw) continue;
    const n = normalizePixelSprite(raw);
    const elev = elevationAt(map, place.x, place.y);
    const p = projectCell(viewMode, map, place.x, place.y, elev, scale);
    const floorX = p.px;
    const floorY = p.py;
    const footprint = p.shelfH;
    const stackW = Math.max(1, Math.round(n.width * scale));
    const stackH = Math.max(1, Math.round(spriteTotalHeight(n) * scale));
    const wallH = Math.round(
      n.wallHeights.reduce((a, h) => a + h, 0) * scale,
    );
    const cx = floorX + p.ts / 2;
    const top =
      wallH > 0
        ? floorY + footprint - stackH
        : floorY + footprint / 2 - Math.round(n.topHeight * scale) / 2;
    const bottom = wallH > 0 ? floorY + footprint : top + stackH;
    const hitLeft = Math.min(cx - stackW / 2, floorX);
    const hitRight = Math.max(cx + stackW / 2, floorX + p.ts);
    const hitTop = Math.min(top, floorY);
    const hitBottom = Math.max(bottom, floorY + footprint);
    if (sx < hitLeft || sx >= hitRight || sy < hitTop || sy >= hitBottom) {
      continue;
    }
    const score = p.depth * 100 + elev * 10 + stackH * 0.01;
    if (score >= bestScore) {
      bestScore = score;
      best = place;
    }
  }
  return best;
}

/**
 * Editor canvas pixel → tile. Accounts for elevation lift, cliff faces, and
 * extruded wall blocks. When several tiles overlap, prefers the frontmost
 * (higher ty) / higher elevation — matching paint order.
 */
export function canvasPixelToTile(
  map: EmberMap,
  sx: number,
  sy: number,
  scale = 1,
  viewMode: MapViewMode = "top",
): { tx: number; ty: number } | null {
  map = ensureMapLayers(map);
  if (viewMode === "sideEast" || viewMode === "sideWest" || viewMode === "sideNorth") {
    return canvasPixelToTileSide(viewMode, map, sx, sy, scale);
  }
  const ts = map.tileSize * scale;
  const pad = mapVerticalPad(map) * scale;
  const wallH = WALL_HEIGHT * scale;
  const tx = Math.floor(sx / ts);
  if (tx < 0 || tx >= map.width) return null;

  let bestTy = -1;
  let bestScore = -Infinity;

  const consider = (ty: number, score: number) => {
    if (score >= bestScore) {
      bestScore = score;
      bestTy = ty;
    }
  };

  for (let ty = 0; ty < map.height; ty++) {
    const elev = elevationAt(map, tx, ty);
    const elevOff = elevVisualOffset(elev) * scale;
    const basePy = ty * ts + pad - elevOff;
    const stories = heightAt(map, tx, ty);
    const isWall = stories >= 1;

    if (isWall) {
      const raise = wallH * Math.max(1, stories);
      // Extruded: top at basePy-raise, front down to basePy+ts
      const topY = basePy - raise;
      const bottomY = basePy + ts;
      if (sy >= topY && sy < bottomY) {
        consider(ty, ty * 1000 + elev * 10 + 2);
      }
    } else {
      if (sy >= basePy && sy < basePy + ts) {
        consider(ty, ty * 1000 + elev * 10);
      }
      // South cliff face belongs to this elevated cell
      if (elev > 0 && ty + 1 < map.height) {
        const se = elevationAt(map, tx, ty + 1);
        const sh = heightAt(map, tx, ty + 1);
        if (se < elev && sh < 1) {
          const drop = (elev - se) * wallH;
          const faceY = basePy + ts;
          if (drop > 0 && sy >= faceY && sy < faceY + drop) {
            consider(ty, ty * 1000 + elev * 10 + 5);
          }
        }
      }
    }
  }

  if (bestTy < 0) {
    const ty = Math.floor((sy - pad) / ts);
    if (ty < 0 || ty >= map.height) return null;
    return { tx, ty };
  }
  return { tx, ty: bestTy };
}

export function regionCenter(
  map: EmberMap,
  region: EmberMapRegion,
): { x: number; y: number } {
  return {
    x: (region.x + region.w / 2) * map.tileSize,
    y: (region.y + region.h / 2) * map.tileSize,
  };
}

export function randomPointInRegion(
  map: EmberMap,
  region: EmberMapRegion,
  rng: () => number = Math.random,
): { x: number; y: number } {
  const tx = region.x + rng() * Math.max(0.01, region.w);
  const ty = region.y + rng() * Math.max(0.01, region.h);
  return {
    x: tx * map.tileSize,
    y: ty * map.tileSize,
  };
}

/** Spawn point that is not inside walls (retries, then scans region). */
export function randomWalkablePointInRegion(
  map: EmberMap,
  tileset: EmberTileset,
  region: EmberMapRegion,
  radius: number,
  rng: () => number = Math.random,
  sprites?: EmberSpriteLib,
): { x: number; y: number } | null {
  const ts = map.tileSize;
  for (let attempt = 0; attempt < 48; attempt++) {
    const p = randomPointInRegion(map, region, rng);
    // Nudge to tile center-ish to avoid edge clipping
    const cx = Math.floor(p.x / ts) * ts + ts / 2;
    const cy = Math.floor(p.y / ts) * ts + ts / 2;
    const { tx, ty } = worldToTile(map, cx, cy);
    const elev = elevationAt(map, tx, ty);
    if (!circleHitsSolid(map, tileset, cx, cy, radius, elev, sprites)) {
      return { x: cx, y: cy };
    }
  }

  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(map.width - 1, Math.ceil(region.x + region.w) - 1);
  const y1 = Math.min(map.height - 1, Math.ceil(region.y + region.h) - 1);
  const candidates: Array<{ x: number; y: number }> = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (isSolidAt(map, tileset, tx, ty)) continue;
      const cx = tx * ts + ts / 2;
      const cy = ty * ts + ts / 2;
      const elev = elevationAt(map, tx, ty);
      if (!circleHitsSolid(map, tileset, cx, cy, radius, elev, sprites)) {
        candidates.push({ x: cx, y: cy });
      }
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)]!;
}

export function findRegions(
  map: EmberMap,
  kind: EmberMapRegion["kind"],
  group?: string,
): EmberMapRegion[] {
  return map.regions.filter((r) => {
    if (r.kind !== kind) return false;
    if (group && group !== "any" && r.group && r.group !== group) return false;
    return true;
  });
}


/** Resolved per-lantern flood params (inherits map defaults). */
export type ResolvedLanternParams = {
  lampColor: string;
  lampFaceColor: string;
  lampRange: number;
  lampDiscCore: number;
  lampDiscMid: number;
  lampHeight: number;
  lampShowCore: boolean;
  lampStrength0: number;
  lampStrengthFalloff: number;
  lampTorchFlicker: boolean;
};

/** Keep core ≤ mid ≤ range (tiles), all in 1..MAP_LIGHT_RANGE_MAX. */
export function clampLampDiscRadii(
  coreTiles: number,
  midTiles: number,
  rangeTiles: number,
): { core: number; mid: number; range: number } {
  let range = Math.max(
    1,
    Math.min(MAP_LIGHT_RANGE_MAX, Math.round(rangeTiles)),
  );
  let core = Math.max(1, Math.min(range, Math.round(coreTiles)));
  let mid = Math.max(1, Math.min(range, Math.round(midTiles)));
  if (core > mid) mid = core;
  if (mid > range) range = mid;
  if (core > mid) core = mid;
  return { core, mid, range };
}

/** Defaults when a map/source omits disc radii (~40% / ~70% of range). */
export function defaultLampDiscRadii(rangeTiles: number): {
  core: number;
  mid: number;
} {
  const range = Math.max(
    1,
    Math.min(MAP_LIGHT_RANGE_MAX, Math.round(rangeTiles)),
  );
  const core = Math.max(1, Math.min(range, Math.round(range * 0.4)));
  const mid = Math.max(core, Math.min(range, Math.round(range * 0.7)));
  return { core, mid };
}

export type LanternSource = {
  id: string;
  x: number;
  y: number;
  /** Implicit glow tile/sprite vs free-standing / override entry. */
  kind: "implicit" | "placed";
  params: ResolvedLanternParams;
  /** True when map.lights has an entry for this cell. */
  hasOverride: boolean;
};

function resolveLanternParams(
  mapLight: ResolvedMapLight,
  src?: Pick<
    EmberLightSource,
    | "lampColor"
    | "lampFaceColor"
    | "lampRange"
    | "lampDiscCore"
    | "lampDiscMid"
    | "lampHeight"
    | "lampShowCore"
    | "lampStrength0"
    | "lampStrengthFalloff"
    | "lampTorchFlicker"
  >,
): ResolvedLanternParams {
  const range = Number.isFinite(src?.lampRange)
    ? Math.max(1, Math.min(MAP_LIGHT_RANGE_MAX, Math.round(src!.lampRange!)))
    : mapLight.lampRange;
  const fallback = defaultLampDiscRadii(range);
  const discs = clampLampDiscRadii(
    Number.isFinite(src?.lampDiscCore)
      ? src!.lampDiscCore!
      : (mapLight.lampDiscCore ?? fallback.core),
    Number.isFinite(src?.lampDiscMid)
      ? src!.lampDiscMid!
      : (mapLight.lampDiscMid ?? fallback.mid),
    range,
  );
  return {
    lampColor: normalizeHex(src?.lampColor) ?? mapLight.lampColor,
    lampFaceColor: normalizeHex(src?.lampFaceColor) ?? mapLight.lampFaceColor,
    lampRange: discs.range,
    lampDiscCore: discs.core,
    lampDiscMid: discs.mid,
    lampHeight: clampFinite(
      src?.lampHeight ?? mapLight.lampHeight,
      0.2,
      3,
      mapLight.lampHeight,
    ),
    lampShowCore:
      typeof src?.lampShowCore === "boolean"
        ? src.lampShowCore
        : mapLight.lampShowCore,
    lampStrength0: Number.isFinite(src?.lampStrength0)
      ? Math.max(0, Math.min(1, src!.lampStrength0!))
      : mapLight.lampStrength0,
    lampStrengthFalloff: Number.isFinite(src?.lampStrengthFalloff)
      ? Math.max(0, Math.min(1, src!.lampStrengthFalloff!))
      : mapLight.lampStrengthFalloff,
    lampTorchFlicker:
      typeof src?.lampTorchFlicker === "boolean"
        ? src.lampTorchFlicker
        : mapLight.lampTorchFlicker,
  };
}

/**
 * Collect lantern sources: glow tiles/sprites + map.lights entries.
 * Optional `sprites` pack enables pixel-sprite lamps.
 */
export function listLanternSources(
  map: EmberMap,
  tileset: EmberTileset,
  sprites?: EmberSpriteLib,
): LanternSource[] {
  const mapLight = resolveMapLight(map);
  const glowIds = new Set(
    tileset.tiles
      .filter((t) => t.glow || t.name === "lantern")
      .map((t) => t.id),
  );
  const byCell = new Map<string, LanternSource>();
  const overrideByCell = new Map<string, EmberLightSource>();
  for (const L of map.lights ?? []) {
    overrideByCell.set(`${L.x},${L.y}`, L);
  }

  const upsert = (
    x: number,
    y: number,
    kind: "implicit" | "placed",
    id: string,
  ) => {
    const key = `${x},${y}`;
    const ov = overrideByCell.get(key);
    if (ov?.enabled === false) {
      byCell.delete(key);
      return;
    }
    byCell.set(key, {
      id: ov?.id ?? id,
      x,
      y,
      kind: ov ? "placed" : kind,
      hasOverride: Boolean(ov),
      params: resolveLanternParams(mapLight, ov),
    });
  };

  if (glowIds.size > 0) {
    for (const layerName of ["decor", "ground"] as const) {
      const data = layerData(map, layerName);
      if (!data) continue;
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const id = data[y * map.width + x] ?? 0;
          if (glowIds.has(id)) upsert(x, y, "implicit", `glow:${x},${y}`);
        }
      }
    }
  }

  if (sprites && map.sprites?.length) {
    for (const place of map.sprites) {
      const spr = sprites[place.spriteId];
      if (spr?.glow) {
        upsert(place.x, place.y, "implicit", `sprite:${place.id}`);
      }
    }
  }

  for (const ov of map.lights ?? []) {
    if (ov.enabled === false) continue;
    const key = `${ov.x},${ov.y}`;
    if (byCell.has(key)) continue;
    byCell.set(key, {
      id: ov.id,
      x: ov.x,
      y: ov.y,
      kind: "placed",
      hasOverride: true,
      params: resolveLanternParams(mapLight, ov),
    });
  }

  return [...byCell.values()];
}

/**
 * Collect lantern / glow light sources: tileset glow tiles + glowing sprites.
 * Optional `sprites` pack enables pixel-sprite lamps (candle props, etc.).
 * @deprecated prefer {@link listLanternSources}
 */
export function findLanternTiles(
  map: EmberMap,
  tileset: EmberTileset,
  sprites?: EmberSpriteLib,
): Array<{ x: number; y: number }> {
  return listLanternSources(map, tileset, sprites).map(({ x, y }) => ({ x, y }));
}

/** True if every grid cell between A and B is non-solid (no corner-cutting). */
export function hasFloorLos(
  map: EmberMap,
  tileset: EmberTileset,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (x !== x1 || y !== y1) {
    const e2 = 2 * err;
    let steppedX = false;
    let steppedY = false;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
      steppedX = true;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
      steppedY = true;
    }
    // Diagonal: both side cells must be open (no squeeze through wall corners)
    if (steppedX && steppedY) {
      if (
        isSolidAt(map, tileset, x - sx, y) ||
        isSolidAt(map, tileset, x, y - sy)
      ) {
        return false;
      }
    }
    if (x === x1 && y === y1) break;
    if (isSolidAt(map, tileset, x, y)) return false;
  }
  return true;
}

/**
 * Shadow may land only on a floor with strictly lower elevation than the caster.
 * (Walls on the same elev must not paint strips onto neighboring tops.)
 */
export function canReceiveShadow(
  map: EmberMap,
  casterX: number,
  casterY: number,
  recvX: number,
  recvY: number,
): boolean {
  if (
    recvX < 0 ||
    recvY < 0 ||
    recvX >= map.width ||
    recvY >= map.height
  ) {
    return false;
  }
  return (
    elevationAt(map, recvX, recvY) < elevationAt(map, casterX, casterY)
  );
}

/** Resolved color grade (all fields filled). */
export type ResolvedMapGrade = Required<EmberMapGrade>;

export type ResolvedMapAtmosphere = {
  fog: number;
  fogColor: string;
  rain: number;
  wind: number;
  cloudShadows: number;
  cloudSpeed: number;
  dust: number;
  fireflies: number;
  vignette: number;
  haze: number;
  sunGlare: number;
};

/** Resolved map light (all fields filled). */
export type ResolvedMapLight = Required<
  Omit<EmberMapLight, "grade" | "atmosphere">
> & {
  grade: ResolvedMapGrade;
  atmosphere: ResolvedMapAtmosphere;
};

export const DEFAULT_MAP_GRADE: ResolvedMapGrade = {
  tone: 0,
  brightness: 1.15,
  saturation: 1,
};

export const DEFAULT_MAP_ATMOSPHERE: ResolvedMapAtmosphere = {
  fog: 0,
  fogColor: "#0c1018",
  rain: 0,
  wind: 0.35,
  cloudShadows: 0,
  cloudSpeed: 0.45,
  dust: 0,
  fireflies: 0,
  vignette: 0.15,
  haze: 0,
  sunGlare: 0,
};

export const DEFAULT_MAP_LIGHT: ResolvedMapLight = {
  ambientColor: "#080614",
  ambientAlpha: 0.32,
  fillIntensity: 1.15,
  lampColor: "#ffaa48",
  lampFaceColor: "#ff9030",
  lampRange: 3,
  lampDiscCore: 1,
  lampDiscMid: 2,
  lampHeight: 1.15,
  lampShowCore: true,
  lampStrength0: 0.62,
  lampStrengthFalloff: 0.45,
  lampPower: 1.25,
  floorGlowBase: 0.1,
  floorGlowScale: 0.32,
  faceGlowBase: 0.08,
  faceGlowScale: 0.45,
  bloomStrength: 0.55,
  // High threshold + tight radius: emissive lamps glow without a soft smear
  // bleeding down onto water (that smear was mistaken for a reflection).
  bloomThreshold: 0.62,
  bloomRadius: 0.16,
  sunAzimuth: 40,
  sunElevation: 45,
  sunColor: "#ffe4c8",
  sunIntensity: 1,
  torchFlicker: 0,
  torchFlickerSpeed: 1,
  voxelSnapLight: false,
  lampTorchFlicker: true,
  grade: { ...DEFAULT_MAP_GRADE },
  atmosphere: { ...DEFAULT_MAP_ATMOSPHERE },
};

/**
 * Pixel-art-friendly global lamp bloom (one pass for the whole map).
 * Blur runs on a downscaled emissive buffer, then additive-composited.
 */
export const LAMP_BLOOM = {
  /** Default additive strength when map.light.bloomStrength is unset. */
  strength: 0.34,
  /** Blur working resolution vs map canvas (lower = softer, less blocky). */
  downscale: 0.32,
  /** Box-blur radius at downscaled size. */
  blurRadius: 4,
  /** Cap longest side of the blur buffer (large maps). */
  maxBlurSide: 512,
} as const;

/**
 * Subtle wash gain as night ambient deepens so lamps read against darkness
 * (1 at day → ~1.22 at full night). Applied only to lantern overlays drawn
 * *after* ambient — never used to darken lights under the night wash.
 */
export function lanternNightBoost(ambientAlpha: number): number {
  const a = Number.isFinite(ambientAlpha)
    ? Math.max(0, Math.min(1, ambientAlpha))
    : 0;
  return 1 + 0.22 * a;
}

/** Floor / atmos wash alpha with night boost, clamped to 1. */
export function lanternFloorWashAlpha(
  light: Pick<
    ResolvedMapLight,
    "floorGlowBase" | "floorGlowScale" | "ambientAlpha"
  >,
  strength: number,
): number {
  const raw = light.floorGlowBase + strength * light.floorGlowScale;
  return Math.min(1, Math.max(0, raw * lanternNightBoost(light.ambientAlpha)));
}

/** Wall / cliff face wash alpha with night boost, clamped to 1. */
export function lanternFaceWashAlpha(
  light: Pick<
    ResolvedMapLight,
    "faceGlowBase" | "faceGlowScale" | "ambientAlpha"
  >,
  strength: number,
): number {
  const raw = light.faceGlowBase + strength * light.faceGlowScale;
  return Math.min(1, Math.max(0, raw * lanternNightBoost(light.ambientAlpha)));
}

/** @deprecated use resolveMapLight(map).lampRange */
export const LAMP_MAX_RANGE = DEFAULT_MAP_LIGHT.lampRange;

function clampFinite(v: number | undefined, min: number, max: number, d: number): number {
  if (!Number.isFinite(v)) return d;
  return Math.max(min, Math.min(max, v as number));
}

export function resolveMapGrade(
  grade: EmberMapGrade | undefined,
): ResolvedMapGrade {
  const g = grade ?? {};
  return {
    tone: clampFinite(g.tone, -1, 1, DEFAULT_MAP_GRADE.tone),
    brightness: clampFinite(
      g.brightness,
      0.25,
      3,
      DEFAULT_MAP_GRADE.brightness,
    ),
    saturation: clampFinite(
      g.saturation,
      0,
      2,
      DEFAULT_MAP_GRADE.saturation,
    ),
  };
}

export function resolveMapAtmosphere(
  atmosphere: EmberMapAtmosphere | undefined,
): ResolvedMapAtmosphere {
  const a = atmosphere ?? {};
  const clamp01 = (v: number | undefined, d: number) =>
    Number.isFinite(v) ? Math.max(0, Math.min(1, v as number)) : d;
  return {
    fog: clamp01(a.fog, DEFAULT_MAP_ATMOSPHERE.fog),
    fogColor: normalizeHex(a.fogColor) ?? DEFAULT_MAP_ATMOSPHERE.fogColor,
    rain: clamp01(a.rain, DEFAULT_MAP_ATMOSPHERE.rain),
    wind: clamp01(a.wind, DEFAULT_MAP_ATMOSPHERE.wind),
    cloudShadows: clamp01(a.cloudShadows, DEFAULT_MAP_ATMOSPHERE.cloudShadows),
    cloudSpeed: clampFinite(
      a.cloudSpeed,
      0,
      2,
      DEFAULT_MAP_ATMOSPHERE.cloudSpeed,
    ),
    dust: clamp01(a.dust, DEFAULT_MAP_ATMOSPHERE.dust),
    fireflies: clamp01(a.fireflies, DEFAULT_MAP_ATMOSPHERE.fireflies),
    vignette: clamp01(a.vignette, DEFAULT_MAP_ATMOSPHERE.vignette),
    haze: clamp01(a.haze, DEFAULT_MAP_ATMOSPHERE.haze),
    sunGlare: clamp01(a.sunGlare, DEFAULT_MAP_ATMOSPHERE.sunGlare),
  };
}

export function resolveMapLight(map: Pick<EmberMap, "light">): ResolvedMapLight {
  const L = map.light ?? {};
  const clamp01 = (v: number, d: number) =>
    Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d;
  const clampRange = (v: number, d: number) =>
    Number.isFinite(v)
      ? Math.max(1, Math.min(MAP_LIGHT_RANGE_MAX, Math.round(v)))
      : d;
  return {
    ambientColor: normalizeHex(L.ambientColor) ?? DEFAULT_MAP_LIGHT.ambientColor,
    ambientAlpha: clamp01(
      L.ambientAlpha ?? DEFAULT_MAP_LIGHT.ambientAlpha,
      DEFAULT_MAP_LIGHT.ambientAlpha,
    ),
    fillIntensity: clampFinite(
      L.fillIntensity,
      0,
      3,
      DEFAULT_MAP_LIGHT.fillIntensity,
    ),
    lampColor: normalizeHex(L.lampColor) ?? DEFAULT_MAP_LIGHT.lampColor,
    lampFaceColor:
      normalizeHex(L.lampFaceColor) ?? DEFAULT_MAP_LIGHT.lampFaceColor,
    ...(() => {
      const range = clampRange(
        L.lampRange ?? DEFAULT_MAP_LIGHT.lampRange,
        DEFAULT_MAP_LIGHT.lampRange,
      );
      const fallback = defaultLampDiscRadii(range);
      const discs = clampLampDiscRadii(
        L.lampDiscCore ?? DEFAULT_MAP_LIGHT.lampDiscCore ?? fallback.core,
        L.lampDiscMid ?? DEFAULT_MAP_LIGHT.lampDiscMid ?? fallback.mid,
        range,
      );
      return {
        lampRange: discs.range,
        lampDiscCore: discs.core,
        lampDiscMid: discs.mid,
      };
    })(),
    lampHeight: clampFinite(
      L.lampHeight,
      0.2,
      3,
      DEFAULT_MAP_LIGHT.lampHeight,
    ),
    lampShowCore:
      typeof L.lampShowCore === "boolean"
        ? L.lampShowCore
        : DEFAULT_MAP_LIGHT.lampShowCore,
    lampStrength0: clamp01(
      L.lampStrength0 ?? DEFAULT_MAP_LIGHT.lampStrength0,
      DEFAULT_MAP_LIGHT.lampStrength0,
    ),
    lampStrengthFalloff: clamp01(
      L.lampStrengthFalloff ?? DEFAULT_MAP_LIGHT.lampStrengthFalloff,
      DEFAULT_MAP_LIGHT.lampStrengthFalloff,
    ),
    lampPower: clampFinite(
      L.lampPower,
      0,
      4,
      DEFAULT_MAP_LIGHT.lampPower,
    ),
    floorGlowBase: clamp01(
      L.floorGlowBase ?? DEFAULT_MAP_LIGHT.floorGlowBase,
      DEFAULT_MAP_LIGHT.floorGlowBase,
    ),
    floorGlowScale: clamp01(
      L.floorGlowScale ?? DEFAULT_MAP_LIGHT.floorGlowScale,
      DEFAULT_MAP_LIGHT.floorGlowScale,
    ),
    faceGlowBase: clamp01(
      L.faceGlowBase ?? DEFAULT_MAP_LIGHT.faceGlowBase,
      DEFAULT_MAP_LIGHT.faceGlowBase,
    ),
    faceGlowScale: clamp01(
      L.faceGlowScale ?? DEFAULT_MAP_LIGHT.faceGlowScale,
      DEFAULT_MAP_LIGHT.faceGlowScale,
    ),
    bloomStrength: clampFinite(
      L.bloomStrength,
      0,
      2,
      DEFAULT_MAP_LIGHT.bloomStrength,
    ),
    bloomThreshold: clamp01(
      L.bloomThreshold ?? DEFAULT_MAP_LIGHT.bloomThreshold,
      DEFAULT_MAP_LIGHT.bloomThreshold,
    ),
    // Cap radius hard — UnrealBloom with r>~0.4 smears lamp glow onto water
    // and reads as a fake "soft reflection".
    bloomRadius: clampFinite(
      L.bloomRadius,
      0,
      0.35,
      DEFAULT_MAP_LIGHT.bloomRadius,
    ),
    sunAzimuth: clampFinite(
      L.sunAzimuth,
      0,
      360,
      DEFAULT_MAP_LIGHT.sunAzimuth,
    ),
    sunElevation: clampFinite(
      L.sunElevation,
      5,
      85,
      DEFAULT_MAP_LIGHT.sunElevation,
    ),
    sunColor: normalizeHex(L.sunColor) ?? DEFAULT_MAP_LIGHT.sunColor,
    sunIntensity: clampFinite(
      L.sunIntensity,
      0,
      3,
      DEFAULT_MAP_LIGHT.sunIntensity,
    ),
    torchFlicker: clamp01(
      L.torchFlicker ?? DEFAULT_MAP_LIGHT.torchFlicker,
      DEFAULT_MAP_LIGHT.torchFlicker,
    ),
    torchFlickerSpeed: clampFinite(
      L.torchFlickerSpeed,
      0.25,
      3,
      DEFAULT_MAP_LIGHT.torchFlickerSpeed,
    ),
    voxelSnapLight:
      typeof L.voxelSnapLight === "boolean"
        ? L.voxelSnapLight
        : DEFAULT_MAP_LIGHT.voxelSnapLight,
    lampTorchFlicker:
      typeof L.lampTorchFlicker === "boolean"
        ? L.lampTorchFlicker
        : DEFAULT_MAP_LIGHT.lampTorchFlicker,
    grade: resolveMapGrade(L.grade),
    atmosphere: resolveMapAtmosphere(L.atmosphere),
  };
}

/** True when grade leaves pixels unchanged (skip the pass). */
export function isNeutralMapGrade(grade: ResolvedMapGrade): boolean {
  return (
    Math.abs(grade.tone) < 1e-4 &&
    Math.abs(grade.brightness - 1) < 1e-4 &&
    Math.abs(grade.saturation - 1) < 1e-4
  );
}

/**
 * Build a Phaser-compatible 5×4 color matrix (20 floats) for map grade.
 * Layout: each row is [r, g, b, a, offset255]; applied after ambient+lamps.
 */
export function buildColorGradeMatrix(grade: ResolvedMapGrade): number[] {
  // Tone (temperature): warm (+) lifts R/G and cools B; cool (−) opposite.
  const t = grade.tone;
  const toneShift = 32;
  const tr = 1 + t * 0.08;
  const tg = 1 + t * 0.03;
  const tb = 1 - t * 0.1;
  const toR = t * toneShift;
  const toG = t * toneShift * 0.35;
  const toB = -t * toneShift;

  // Saturation (1 = identity, 0 = grayscale, 2 = punchy).
  const s = grade.saturation;
  const inv = 1 - s;
  const lr = 0.2126 * inv;
  const lg = 0.7152 * inv;
  const lb = 0.0722 * inv;

  // Brightness multiplier last.
  const b = grade.brightness;

  // Compose: brightness · saturation · tone
  // tone matrix (with channel scale + offset)
  const toneM = [
    tr, 0, 0, 0, toR,
    0, tg, 0, 0, toG,
    0, 0, tb, 0, toB,
    0, 0, 0, 1, 0,
  ];
  const satM = [
    lr + s, lg, lb, 0, 0,
    lr, lg + s, lb, 0, 0,
    lr, lg, lb + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
  const brightM = [
    b, 0, 0, 0, 0,
    0, b, 0, 0, 0,
    0, 0, b, 0, 0,
    0, 0, 0, 1, 0,
  ];
  return multiplyColorMatrix5x4(
    brightM,
    multiplyColorMatrix5x4(satM, toneM),
  );
}

/** Multiply two 5×4 color matrices (a · b): apply b first, then a. */
function multiplyColorMatrix5x4(a: number[], b: number[]): number[] {
  const out = new Array<number>(20);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      // Offset column: a_row · b_cols + a_offset (for col===4)
      let v =
        a[row * 5]! * b[col]! +
        a[row * 5 + 1]! * b[5 + col]! +
        a[row * 5 + 2]! * b[10 + col]! +
        a[row * 5 + 3]! * b[15 + col]!;
      if (col === 4) v += a[row * 5 + 4]!;
      out[row * 5 + col] = v;
    }
  }
  return out;
}

/**
 * Apply color grade to a finished canvas (after ambient + lantern overlays).
 * Pixel-art friendly: no blur — direct color-matrix on ImageData.
 */
export function applyMapColorGrade(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  grade: ResolvedMapGrade,
): void {
  if (width <= 0 || height <= 0 || isNeutralMapGrade(grade)) return;
  const m = buildColorGradeMatrix(grade);
  let img: ImageData;
  try {
    img = ctx.getImageData(0, 0, width, height);
  } catch {
    return;
  }
  const d = img.data;
  const clampByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    d[i] = clampByte(m[0]! * r + m[1]! * g + m[2]! * b + m[4]!);
    d[i + 1] = clampByte(m[5]! * r + m[6]! * g + m[7]! * b + m[9]!);
    d[i + 2] = clampByte(m[10]! * r + m[11]! * g + m[12]! * b + m[14]!);
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Premultiplied separable box blur (in-place on ImageData).
 * Uses Float32 scratch — Uint8ClampedArray was clipping `r*a` (up to ~65k)
 * to 255 and turning colored lamp bloom into grey/white fog.
 */
function boxBlurPremultiplied(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
): void {
  if (radius <= 0 || w < 1 || h < 1) return;
  const n = w * h * 4;
  const tmp = new Float32Array(n);
  const r = Math.max(1, Math.min(12, Math.round(radius)));
  const diam = r * 2 + 1;

  // Horizontal: store premultiplied RGB (0..255 scale) + alpha
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        const i = (y * w + xx) * 4;
        const a = data[i + 3]! / 255;
        sr += data[i]! * a;
        sg += data[i + 1]! * a;
        sb += data[i + 2]! * a;
        sa += a;
      }
      const o = (y * w + x) * 4;
      tmp[o] = sr / diam;
      tmp[o + 1] = sg / diam;
      tmp[o + 2] = sb / diam;
      tmp[o + 3] = sa / diam;
    }
  }

  // Vertical + unpremultiply back into ImageData
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        const i = (yy * w + x) * 4;
        sr += tmp[i]!;
        sg += tmp[i + 1]!;
        sb += tmp[i + 2]!;
        sa += tmp[i + 3]!;
      }
      const o = (y * w + x) * 4;
      const a = sa / diam;
      if (a < 1e-4) {
        data[o] = 0;
        data[o + 1] = 0;
        data[o + 2] = 0;
        data[o + 3] = 0;
      } else {
        data[o] = Math.min(255, Math.round(sr / diam / a));
        data[o + 1] = Math.min(255, Math.round(sg / diam / a));
        data[o + 2] = Math.min(255, Math.round(sb / diam / a));
        data[o + 3] = Math.min(255, Math.round(a * 255));
      }
    }
  }
}

export type LanternBloomOpts = {
  strength?: number;
  downscale?: number;
  blurRadius?: number;
  maxBlurSide?: number;
  /** When set, bloom under elevated floor ledges is cleared (post-blur). */
  occlude?: {
    map: EmberMap;
    tileset: EmberTileset;
    scale?: number;
    originY?: number;
    /** Keep bloom on tops lit at their own elev. */
    floorGlow?: Map<string, LampGlowCell>;
  };
};

/**
 * Downsample + blur a lamp-only emissive buffer (map-sized).
 * Returns a soft glow canvas at full emissive resolution, or null.
 */
export function buildLanternBloomCanvas(
  emissive: HTMLCanvasElement,
  opts?: LanternBloomOpts,
): HTMLCanvasElement | null {
  const w = emissive.width;
  const h = emissive.height;
  if (w <= 0 || h <= 0) return null;

  const downscale = Math.max(
    0.15,
    Math.min(1, opts?.downscale ?? LAMP_BLOOM.downscale),
  );
  const blurRadius = Math.max(
    0,
    Math.round(opts?.blurRadius ?? LAMP_BLOOM.blurRadius),
  );
  const maxSide = Math.max(64, opts?.maxBlurSide ?? LAMP_BLOOM.maxBlurSide);

  let dw = Math.max(1, Math.round(w * downscale));
  let dh = Math.max(1, Math.round(h * downscale));
  if (dw > maxSide || dh > maxSide) {
    const s = maxSide / Math.max(dw, dh);
    dw = Math.max(1, Math.round(dw * s));
    dh = Math.max(1, Math.round(dh * s));
  }

  const small = document.createElement("canvas");
  small.width = dw;
  small.height = dh;
  const sctx = small.getContext("2d");
  if (!sctx) return null;
  sctx.imageSmoothingEnabled = true;
  sctx.clearRect(0, 0, dw, dh);
  sctx.drawImage(emissive, 0, 0, dw, dh);

  if (blurRadius > 0) {
    try {
      const img = sctx.getImageData(0, 0, dw, dh);
      // Two passes ≈ soft gaussian without mush at art scale.
      boxBlurPremultiplied(img.data, dw, dh, blurRadius);
      boxBlurPremultiplied(img.data, dw, dh, Math.max(1, blurRadius - 1));
      sctx.putImageData(img, 0, 0);
    } catch {
      // Cross-origin / tainted — keep downsample-only soft glow.
    }
  }

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) return null;
  octx.imageSmoothingEnabled = true;
  octx.clearRect(0, 0, w, h);
  octx.drawImage(small, 0, 0, w, h);

  const occlude = opts?.occlude;
  if (occlude) {
    const scale = occlude.scale ?? 1;
    eraseBloomUnderElevatedLedges(
      octx,
      occlude.map,
      occlude.tileset,
      occlude.map.tileSize * scale,
      WALL_HEIGHT * scale,
      occlude.originY ?? 0,
      occlude.floorGlow,
    );
  }

  return out;
}

/**
 * Soft atmospheric bloom from a lamp-only emissive buffer.
 * One downsample → blur → additive composite for the whole frame
 * (not a per-tile stamp). Call after lantern washes, before color grade.
 */
export function applyLanternBloom(
  dest: CanvasRenderingContext2D,
  emissive: HTMLCanvasElement,
  opts?: LanternBloomOpts,
): void {
  const strength = Math.max(
    0,
    Math.min(1, opts?.strength ?? LAMP_BLOOM.strength),
  );
  if (strength <= 0) return;
  const bloom = buildLanternBloomCanvas(emissive, opts);
  if (!bloom) return;

  const prevSmooth = dest.imageSmoothingEnabled;
  const prevComp = dest.globalCompositeOperation;
  const prevAlpha = dest.globalAlpha;
  dest.imageSmoothingEnabled = true;
  dest.globalCompositeOperation = "lighter";
  dest.globalAlpha = strength;
  dest.drawImage(bloom, 0, 0);
  dest.globalCompositeOperation = prevComp;
  dest.globalAlpha = prevAlpha;
  dest.imageSmoothingEnabled = prevSmooth;
}

/** Allocate a transparent canvas matching map paint size. */
function createEmissiveBuffer(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (width <= 0 || height <= 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  return { canvas, ctx };
}

/**
 * Soft radial bloom field from lit floor cells (not hard tile rects / sprite AABBs).
 * Feed this into {@link applyLanternBloom} so glow stays lamp-colored and round.
 * After stamps, clears under elevated floor ledges so lamps on high floors cannot
 * bleed onto walls / stairs visually beneath the slab.
 */
export function paintLanternBloomField(
  ctx: CanvasRenderingContext2D,
  map: EmberMap,
  tileset: EmberTileset,
  scale = 1,
  originY = 0,
  glowInfo?: Map<string, LampGlowCell>,
  sprites?: EmberSpriteLib,
): void {
  const light = resolveMapLight(map);
  const glow =
    glowInfo ?? computeLanternGlowInfo(map, tileset, sprites);
  const ts = map.tileSize * scale;
  const wH = WALL_HEIGHT * scale;
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;

  for (const [key, cell] of glow) {
    const [tx, ty] = key.split(",").map(Number) as [number, number];
    if (isSolidAt(map, tileset, tx, ty)) continue;
    // Stair cells get silhouette wash — blooming them tints distant z0 props.
    if (connectorDirAt(map, tileset, tx, ty)) continue;
    const band = connectorElevBand(map, tileset, tx, ty);
    const elev = band ? (band.low + band.high) * 0.5 : elevationAt(map, tx, ty);
    const elevOff = elevVisualOffset(elev) * scale;
    const cx = tx * ts + ts * 0.5;
    const cy = ty * ts + originY - elevOff + ts * 0.5;
    const wash = lanternFloorWashAlpha(light, cell.strength);
    if (wash < 0.01) continue;
    const rgb = parseHexRgb(cell.lampColor) ?? { r: 255, g: 170, b: 70 };
    // Stronger core alpha into the bloom buffer so color survives blur + additive.
    const a0 = Math.min(0.95, wash * 1.35);
    const radius = ts * (0.75 + cell.strength * 0.9);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a0})`);
    grad.addColorStop(
      0.4,
      `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a0 * 0.5})`,
    );
    grad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Extra soft halo at each lantern source (atmospheric core).
  for (const src of listLanternSources(map, tileset, sprites)) {
    if (isSolidAt(map, tileset, src.x, src.y)) continue;
    const elevOff = elevVisualOffset(elevationAt(map, src.x, src.y)) * scale;
    const cx = src.x * ts + ts * 0.5;
    const cy = src.y * ts + originY - elevOff + ts * 0.5;
    const rgb =
      parseHexRgb(src.params.lampColor) ?? { r: 255, g: 170, b: 70 };
    const radius = ts * (1.1 + src.params.lampRange * 0.35);
    const a0 = Math.min(0.9, 0.35 + src.params.lampStrength0 * 0.45);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a0})`);
    grad.addColorStop(
      0.35,
      `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a0 * 0.4})`,
    );
    grad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Punch out bloom under elevated slabs and on unlit elevated tops
  // (z0 lamp bloom must not tint a z3 platform top).
  eraseBloomUnderElevatedLedges(ctx, map, tileset, ts, wH, originY, glow);

  ctx.imageSmoothingEnabled = prevSmooth;
}

/** Elevated floor top caps that must not receive lower-elev lamp wash / bloom. */
function forEachUnlitElevatedTopCap(
  map: EmberMap,
  tileset: EmberTileset,
  ts: number,
  wH: number,
  originY: number,
  floorGlow: Map<string, LampGlowCell> | undefined,
  fn: (px: number, py: number, tsR: number, tx: number, ty: number) => void,
): void {
  const tsR = Math.round(ts);
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (isSolidAt(map, tileset, tx, ty)) continue;
      if (connectorDirAt(map, tileset, tx, ty)) continue;
      const elev = elevationAt(map, tx, ty);
      if (elev <= 0) continue;
      const topGlow = floorGlow?.get(`${tx},${ty}`);
      const topLit =
        topGlow != null &&
        topGlow.strength > 0 &&
        topGlow.lampElev === elev;
      if (topLit) continue;
      const px = Math.round(tx * ts);
      const py = Math.round(ty * ts + originY - elev * wH);
      fn(px, py, tsR, tx, ty);
    }
  }
}

type ElevatedTopSnap = {
  canvas: HTMLCanvasElement;
  rects: Array<{ dx: number; dy: number; w: number; h: number }>;
};

/**
 * Snapshot elevated tops so later z0 washes / bloom can be restored away
 * (screen-space overlap with lower floors + soft glow bleed).
 */
function snapshotUnlitElevatedTopCaps(
  ctx: CanvasRenderingContext2D,
  map: EmberMap,
  tileset: EmberTileset,
  ts: number,
  wH: number,
  originY: number,
  floorGlow?: Map<string, LampGlowCell>,
): ElevatedTopSnap | null {
  const rects: Array<{ dx: number; dy: number; w: number; h: number }> = [];
  forEachUnlitElevatedTopCap(
    map,
    tileset,
    ts,
    wH,
    originY,
    floorGlow,
    (px, py, tsR) => {
      rects.push({ dx: px, dy: py, w: tsR, h: tsR });
    },
  );
  if (!rects.length) return null;
  const canvas = document.createElement("canvas");
  canvas.width = ctx.canvas.width;
  canvas.height = ctx.canvas.height;
  const c = canvas.getContext("2d");
  if (!c) return null;
  for (const r of rects) {
    c.drawImage(ctx.canvas, r.dx, r.dy, r.w, r.h, r.dx, r.dy, r.w, r.h);
  }
  return { canvas, rects };
}

function restoreUnlitElevatedTopCaps(
  ctx: CanvasRenderingContext2D,
  snap: ElevatedTopSnap | null,
): void {
  if (!snap) return;
  for (const r of snap.rects) {
    ctx.drawImage(snap.canvas, r.dx, r.dy, r.w, r.h, r.dx, r.dy, r.w, r.h);
  }
}

/**
 * Run a paint callback, then restore unlit elevated top caps to whatever was
 * on the canvas before the callback (blocks z0 wash / bloom onto z3 tops).
 */
export function withProtectedUnlitElevatedTops(
  ctx: CanvasRenderingContext2D,
  map: EmberMap,
  tileset: EmberTileset,
  opts: {
    scale?: number;
    originY?: number;
    floorGlow?: Map<string, LampGlowCell>;
  },
  paint: () => void,
): void {
  const scale = opts.scale ?? 1;
  const originY = opts.originY ?? 0;
  const ts = map.tileSize * scale;
  const wH = WALL_HEIGHT * scale;
  const snap = snapshotUnlitElevatedTopCaps(
    ctx,
    map,
    tileset,
    ts,
    wH,
    originY,
    opts.floorGlow,
  );
  paint();
  restoreUnlitElevatedTopCaps(ctx, snap);
}

/** Remove bloom that leaked under elevated floor tops onto cliff/wall volumes. */
function eraseBloomUnderElevatedLedges(
  ctx: CanvasRenderingContext2D,
  map: EmberMap,
  tileset: EmberTileset,
  ts: number,
  wH: number,
  originY: number,
  floorGlow?: Map<string, LampGlowCell>,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000";

  forEachUnlitElevatedTopCap(
    map,
    tileset,
    ts,
    wH,
    originY,
    floorGlow,
    (px, py, tsR) => {
      // Inflate slightly so soft bloom edges cannot tint the top.
      const pad = 1;
      ctx.fillRect(px - pad, py - pad, tsR + pad * 2, tsR + pad * 2);
    },
  );

  const tsR = Math.round(ts);
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (isSolidAt(map, tileset, tx, ty)) continue;
      // Stairs handle their own silhouette; flat elevated floors cast ledges.
      if (connectorDirAt(map, tileset, tx, ty)) continue;
      const elev = elevationAt(map, tx, ty);
      if (elev <= 0) continue;
      const px = Math.round(tx * ts);
      const py = Math.round(ty * ts + originY - elev * wH);
      const faceY = py + tsR;

      let southDrop = 0;
      if (ty + 1 < map.height) {
        const se = elevationAt(map, tx, ty + 1);
        const sh = heightAt(map, tx, ty + 1);
        if (se < elev && sh < 1) {
          southDrop = Math.round((elev - se) * wH);
        }
      }
      if (southDrop > 0) {
        ctx.fillRect(px, faceY, tsR, southDrop);
      }

      // East edge drop when south face isn't the main cliff.
      if (southDrop <= 0 && tx + 1 < map.width) {
        const ee = elevationAt(map, tx + 1, ty);
        const eh = heightAt(map, tx + 1, ty);
        if (ee < elev && eh < 1) {
          const drop = Math.round((elev - ee) * wH);
          if (drop > 0) {
            const edgeW = Math.max(2, Math.round(ts * 0.18));
            ctx.fillRect(px + tsR - edgeW, faceY, edgeW, drop);
          }
        }
      }
    }
  }

  ctx.restore();
}

function emissiveTriggerAmountForAsset(
  tx: number,
  ty: number,
  radius: number | undefined,
  when: EmberEmissiveTriggerWhen | undefined,
  eventId: string | undefined,
  opts: {
    playerPoints?: Array<{ x: number; y: number }>;
    enemyPoints?: Array<{ x: number; y: number }>;
    /** @deprecated use playerPoints */
    triggerPoints?: Array<{ x: number; y: number }>;
    activeEventIds?: ReadonlySet<string> | string[];
  },
): number {
  const r = resolveEmissiveTriggerRadius(radius);
  const mode = resolveEmissiveTriggerWhen(when);
  const players = opts.playerPoints ?? opts.triggerPoints;
  const playerAmount = emissiveProximityAmount(tx, ty, r, players);
  const enemyAmount = emissiveProximityAmount(tx, ty, r, opts.enemyPoints);
  let eventActive = false;
  if (eventId && opts.activeEventIds) {
    const ids = opts.activeEventIds;
    eventActive =
      ids instanceof Set
        ? ids.has(eventId)
        : (ids as readonly string[]).includes(eventId);
  }
  return emissiveTriggerAmount(mode, {
    playerAmount,
    enemyAmount,
    eventActive,
  });
}

/**
 * Stamp per-pixel emissive from tiles + prop sprites into a bloom buffer.
 * Call together with {@link paintLanternBloomField} before {@link applyLanternBloom}.
 */
export function paintMapEmissiveField(
  ctx: CanvasRenderingContext2D,
  map: EmberMap,
  tileset: EmberTileset,
  opts?: {
    sprites?: EmberSpriteLib;
    scale?: number;
    originY?: number;
    timeSec?: number;
    /** @deprecated use playerPoints */
    triggerPoints?: Array<{ x: number; y: number }>;
    playerPoints?: Array<{ x: number; y: number }>;
    enemyPoints?: Array<{ x: number; y: number }>;
    activeEventIds?: ReadonlySet<string> | string[];
    /** bloom = soft radials, crisp = pixel cores, both = default */
    mode?: "bloom" | "crisp" | "both";
  },
): void {
  const scale = opts?.scale ?? 1;
  const originY = opts?.originY ?? 0;
  const timeSec = opts?.timeSec ?? 0;
  const mode = opts?.mode ?? "both";
  const doBloom = mode === "bloom" || mode === "both";
  const doCrisp = mode === "crisp" || mode === "both";
  const ts = map.tileSize * scale;
  const ground = layerData(map, "ground");
  const decor = layerData(map, "decor");
  const triggerOpts = {
    playerPoints: opts?.playerPoints,
    enemyPoints: opts?.enemyPoints,
    triggerPoints: opts?.triggerPoints,
    activeEventIds: opts?.activeEventIds,
  };

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const gi = ty * map.width + tx;
      for (const id of [decor?.[gi] ?? 0, ground?.[gi] ?? 0]) {
        if (!id) continue;
        const tile = tileset.tiles.find((t) => t.id === id);
        if (!tile?.emissivePixels || !hasEmissiveInk(tile.emissivePixels)) {
          continue;
        }
        const elevOff = elevVisualOffset(elevationAt(map, tx, ty)) * scale;
        const mul = tileEmissiveAlpha(tile, {
          timeSec,
          seed: emissiveCellSeed(tile.id, tx, ty),
          triggerAmount: emissiveTriggerAmountForAsset(
            tx,
            ty,
            tile.emissiveTriggerRadius,
            tile.emissiveTriggerWhen,
            tile.emissiveTriggerEventId,
            triggerOpts,
          ),
        });
        const left = tx * ts;
        const top = ty * ts + originY - elevOff;
        if (doBloom) {
          stampEmissiveBloomField(
            ctx,
            tile.emissivePixels,
            map.tileSize,
            map.tileSize,
            left,
            top,
            ts,
            ts,
            mul,
            tile.emissiveBloomColor,
          );
        }
        if (doCrisp) {
          paintEmissivePixels(
            ctx,
            tile.emissivePixels,
            map.tileSize,
            map.tileSize,
            left,
            top,
            ts,
            ts,
            mul * 0.9,
          );
        }
      }
    }
  }

  const sprLib = opts?.sprites;
  if (!sprLib || !map.sprites?.length) return;
  for (const place of map.sprites) {
    const raw = sprLib[place.spriteId];
    if (!raw) continue;
    const spr = normalizePixelSprite(raw);
    if (!spr.emissivePixels || !hasEmissiveInk(spr.emissivePixels)) continue;
    const elevOff =
      elevVisualOffset(elevationAt(map, place.x, place.y)) * scale;
    const stackW = spr.width * scale;
    const stackH = spriteTotalHeight(spr) * scale;
    const floorY = place.y * ts + originY - elevOff;
    const left = place.x * ts + ts / 2 - stackW / 2;
    const top = floorY + ts - stackH;
    const mul = spriteEmissiveAlpha(spr, {
      timeSec,
      seed: emissivePlacementSeed(place.spriteId, place.x, place.y),
      triggerAmount: emissiveTriggerAmountForAsset(
        place.x,
        place.y,
        spr.emissiveTriggerRadius,
        spr.emissiveTriggerWhen,
        spr.emissiveTriggerEventId,
        triggerOpts,
      ),
    });
    if (doBloom) {
      stampEmissiveBloomField(
        ctx,
        spr.emissivePixels,
        spr.width,
        spriteTotalHeight(spr),
        left,
        top,
        stackW,
        stackH,
        mul,
        spr.emissiveBloomColor,
      );
    }
    if (doCrisp) {
      paintEmissivePixels(
        ctx,
        spr.emissivePixels,
        spr.width,
        spriteTotalHeight(spr),
        left,
        top,
        stackW,
        stackH,
        mul * 0.95,
      );
    }
  }
}

export function normalizeHex(hex: string | undefined): string | null {
  if (!hex) return null;
  const h = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(h)) return `#${h.toLowerCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return null;
}

export function parseHexRgb(
  hex: string,
): { r: number; g: number; b: number } | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

/** `#rrggbb` → Phaser 0xRRGGBB */
export function hexToPhaser(hex: string, fallback: number): number {
  const rgb = parseHexRgb(hex);
  if (!rgb) return fallback;
  return (rgb.r << 16) | (rgb.g << 8) | rgb.b;
}

export function rgbaFromHex(
  hex: string,
  alpha: number,
  fallbackRgb: { r: number; g: number; b: number },
): string {
  const rgb = parseHexRgb(hex) ?? fallbackRgb;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function lampStrengthAtDist(
  dist: number,
  light: Pick<
    ResolvedMapLight,
    "lampRange" | "lampStrength0" | "lampStrengthFalloff"
  > = DEFAULT_MAP_LIGHT,
): number {
  const maxRange = light.lampRange;
  // Hard tile cutoff — range N lights exactly N ortho steps, no soft overflow.
  if (dist < 0 || dist > maxRange) return 0;
  if (dist === 0) return light.lampStrength0;
  // dist=1 → full falloff strength; dist=maxRange → still visible (1/maxRange).
  const t = 1 - (dist - 1) / Math.max(1, maxRange);
  return light.lampStrengthFalloff * Math.max(0, t);
}

/**
 * Per-band face light forming a manhattan diamond with the floor flood.
 * Band index 0 = top of the face, last = bottom.
 * `distFromHigh` / `distFromLow` = flood distance on the source floor (null = none).
 * Effective distance = floorDist + stories away from that floor → edges go to 0.
 */
export function faceBandStrengths(
  bands: number,
  distFromHigh: number | null,
  distFromLow: number | null,
  light: ResolvedMapLight = DEFAULT_MAP_LIGHT,
): number[] {
  const n = Math.max(1, Math.round(bands));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const fromTop = i;
    const fromBot = n - 1 - i;
    let s = 0;
    if (distFromHigh != null) {
      s = Math.max(s, lampStrengthAtDist(distFromHigh + fromTop, light) * 0.9);
    }
    if (distFromLow != null) {
      s = Math.max(s, lampStrengthAtDist(distFromLow + fromBot, light) * 0.75);
    }
    out.push(s);
  }
  return out;
}

/** Apply optional single-band mask for tall-wall intermediate lamps. */
export function strengthsWithOptionalBand(
  strengths: number[],
  onlyBandFromTop?: number,
): number[] {
  if (onlyBandFromTop === undefined) return strengths;
  const i = Math.round(onlyBandFromTop);
  if (i < 0 || i >= strengths.length) return strengths.map(() => 0);
  const lit = strengths[i] ?? 0;
  return strengths.map((_, idx) => (idx === i ? lit : 0));
}

/** Paint stacked face-glow bands (top → bottom). */
export function paintFaceGlowBands(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  width: number,
  bandH: number,
  strengths: number[],
  light: ResolvedMapLight = DEFAULT_MAP_LIGHT,
): void {
  const bh = Math.max(1, Math.round(bandH));
  const faceRgb = parseHexRgb(light.lampFaceColor) ?? {
    r: 255,
    g: 150,
    b: 60,
  };
  for (let i = 0; i < strengths.length; i++) {
    const s = strengths[i] ?? 0;
    if (s <= 0.04) continue;
    const a = lanternFaceWashAlpha(light, s);
    ctx.fillStyle = `rgba(${faceRgb.r}, ${faceRgb.g}, ${faceRgb.b}, ${a})`;
    ctx.fillRect(
      Math.round(px),
      Math.round(py + i * bh),
      Math.round(width),
      bh + (i < strengths.length - 1 ? 1 : 0),
    );
  }
}

export type LampGlowCell = {
  strength: number;
  dist: number;
  /** Floor elevation of the winning lantern (for stair high/low wash). */
  lampElev: number;
  lampColor: string;
  lampFaceColor: string;
  lampRange: number;
  lampStrength0: number;
  lampStrengthFalloff: number;
};

/**
 * Floor light: orthogonal flood + LOS through walls, same elevation only.
 * Also stores flood distance for manhattan diamond falloff on wall faces.
 * Winning source (max strength) contributes its color / falloff params.
 */
/**
 * Floor/tread glow grid derived from the shared surface light pass.
 * Faces are not included — use {@link computeLitSurfaces} for walls/cliffs.
 */
export function computeLanternGlowInfo(
  map: EmberMap,
  tileset: EmberTileset,
  sprites?: EmberSpriteLib,
): Map<string, LampGlowCell> {
  const { lit } = computeLitSurfaces(map, tileset, sprites);
  return litSurfacesToFloorGlow(lit);
}

export function computeLanternGlow(
  map: EmberMap,
  tileset: EmberTileset,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, v] of computeLanternGlowInfo(map, tileset)) {
    out.set(k, v.strength);
  }
  return out;
}

export type WallFaceGlow = {
  distLow: number;
  bands: number;
  /**
   * When set, only this band index from the top of the face is lit
   * (intermediate lamp on a tall wall, e.g. z2 lamp → z2↔z3 story).
   */
  onlyBandFromTop?: number;
  lampFaceColor: string;
  lampRange: number;
  lampStrength0: number;
  lampStrengthFalloff: number;
};

/**
 * Wall front-face light from lit floor south of the wall (same elev as wall base).
 * Never lights the top cap. Requires the south floor to actually be lit (LOS+flood),
 * so a wall between a lamp and a dark room stays dark on the camera-facing side.
 */
export function computeWallFaceGlow(
  map: EmberMap,
  tileset: EmberTileset,
  floorGlow: Map<string, LampGlowCell>,
): Map<string, WallFaceGlow> {
  const faces = new Map<string, WallFaceGlow>();
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (!isSolidAt(map, tileset, tx, ty)) continue;
      const wallElev = elevationAt(map, tx, ty);
      const height = Math.max(1, heightAt(map, tx, ty) || 1);
      const fy = ty + 1;
      if (fy >= map.height) continue;
      if (isSolidAt(map, tileset, tx, fy)) continue;
      const cell = floorGlow.get(`${tx},${fy}`);
      if (!cell || cell.strength <= 0) continue;
      // Lamp must sit on a story this wall face covers.
      if (
        cell.lampElev < wallElev ||
        cell.lampElev >= wallElev + height
      ) {
        continue;
      }
      const fyE = elevationAt(map, tx, fy);
      const fyBand = connectorElevBand(map, tileset, tx, fy);
      // South floor at wall base, or at the lamp story (tall wall, z2 floor
      // south of a z0-based wall that rises past z2→z3).
      const touches =
        fyE === wallElev ||
        fyE === cell.lampElev ||
        (fyBand != null &&
          (fyBand.low === wallElev ||
            fyBand.high === wallElev ||
            fyBand.low === cell.lampElev ||
            fyBand.high === cell.lampElev));
      if (!touches) continue;
      // Base-elev lamp: wash the whole face from below (classic).
      // Higher lamp on a tall wall: only the story at that elev (z2→z3).
      const onlyBandFromTop =
        cell.lampElev === wallElev
          ? undefined
          : wallElev + height - 1 - cell.lampElev;
      faces.set(`${tx},${ty}`, {
        distLow: cell.dist,
        bands: height,
        onlyBandFromTop,
        lampFaceColor: cell.lampFaceColor,
        lampRange: cell.lampRange,
        lampStrength0: cell.lampStrength0,
        lampStrengthFalloff: cell.lampStrengthFalloff,
      });
    }
  }
  return faces;
}

export type CliffFaceGlow = {
  distLow: number | null;
  distHigh: number | null;
  bands: number;
  lampFaceColor: string;
  lampRange: number;
  lampStrength0: number;
  lampStrengthFalloff: number;
};

/**
 * Cliff south faces: lit only from the lower floor below the drop.
 * A lamp on the high ledge must NOT wash the downward cliff — that face
 * looks away / is occluded from lights standing on top.
 * Stair/ramp cells are skipped — their risers are part of the extrusion;
 * a full-rect cliff wash would shine through under the diagonal.
 * Key = "tx,ty" of the HIGH floor cell.
 */
export function computeCliffFaceGlow(
  map: EmberMap,
  tileset: EmberTileset,
  floorGlow: Map<string, LampGlowCell>,
): Map<string, CliffFaceGlow> {
  const faces = new Map<string, CliffFaceGlow>();
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (isSolidAt(map, tileset, tx, ty)) continue;
      if (connectorDirAt(map, tileset, tx, ty)) continue;
      const elev = elevationAt(map, tx, ty);
      if (elev <= 0) continue;
      const fy = ty + 1;
      if (fy >= map.height) continue;
      if (isSolidAt(map, tileset, tx, fy)) continue;
      // Stair extrusion below a ledge — skip full-rect wash (shine-through).
      if (connectorDirAt(map, tileset, tx, fy)) continue;
      const lowE = elevationAt(map, tx, fy);
      if (lowE >= elev) continue;
      const low = floorGlow.get(`${tx},${fy}`);
      if (!low || low.strength <= 0) continue;
      // Lamp must be on the lower ledge story (or the true low floor).
      // z2 lamp under z3 → ok; z2 lamp must not light a z3 cliff above z0
      // just because some other elev is confused.
      if (low.lampElev !== lowE && low.lampElev !== elev - 1) continue;
      const litBase = Math.max(lowE, Math.min(elev - 1, low.lampElev));
      if (litBase >= elev) continue;
      faces.set(`${tx},${ty}`, {
        distLow: low.dist,
        distHigh: null,
        bands: Math.max(1, elev - litBase),
        lampFaceColor: low.lampFaceColor,
        lampRange: low.lampRange,
        lampStrength0: low.lampStrength0,
        lampStrengthFalloff: low.lampStrengthFalloff,
      });
    }
  }
  return faces;
}

/** Editor floor tones — call AFTER ambient so night does not crush lamp wash.
 *  Skips solid cells and clips height near walls so raised tops stay untinted.
 *  Stairs are painted later via {@link paintLanternStairGlow} so they occlude
 *  wall/cliff face wash (no shine-through under the diagonal). */
export function paintLanternFloorGlow(
  ctx: CanvasRenderingContext2D,
  map: EmberMap,
  tileset: EmberTileset,
  scale = 1,
  originY = 0,
  wallH = 0,
  glowInfo?: Map<string, LampGlowCell>,
  sprites?: EmberSpriteLib,
): void {
  const light = resolveMapLight(map);
  const glow =
    glowInfo ?? computeLanternGlowInfo(map, tileset, sprites);
  const ts = map.tileSize * scale;
  const wH = wallH || WALL_HEIGHT * scale;
  const tsR = Math.round(ts);

  for (const [key, cell] of glow) {
    const [tx, ty] = key.split(",").map(Number) as [number, number];
    if (isSolidAt(map, tileset, tx, ty)) continue;
    if (connectorDirAt(map, tileset, tx, ty)) continue;
    const a = lanternFloorWashAlpha(light, cell.strength);
    if (a < 0.005) continue;
    const lampRgb = parseHexRgb(cell.lampColor) ?? { r: 255, g: 170, b: 70 };
    const elevOff = elevVisualOffset(elevationAt(map, tx, ty)) * scale;
    const px = Math.round(tx * ts);
    const py = Math.round(ty * ts + originY - elevOff);
    let h = Math.round(ts);
    if (ty + 1 < map.height && isSolidAt(map, tileset, tx, ty + 1)) {
      const levels = Math.max(1, heightAt(map, tx, ty + 1) || 1);
      h = Math.max(0, Math.round(ts) - Math.round(wH * levels));
    }
    if (h <= 0) continue;
    ctx.fillStyle = `rgba(${lampRgb.r}, ${lampRgb.g}, ${lampRgb.b}, ${a})`;
    ctx.fillRect(px, py, tsR, h);
  }
}

/**
 * Whether a lit neighbor may feed the high or low end of a stair band.
 * Flat landings at that elev feed the matching end. Adjacent stairs only
 * feed when they are the same one-story band (parallel steps).
 */
function neighborFeedsStairEnd(
  map: EmberMap,
  tileset: EmberTileset,
  nx: number,
  ny: number,
  band: { low: number; high: number },
  end: "low" | "high",
): boolean {
  const target = end === "high" ? band.high : band.low;
  const nBand = connectorElevBand(map, tileset, nx, ny);
  if (nBand) {
    return nBand.low === band.low && nBand.high === band.high;
  }
  return elevationAt(map, nx, ny) === target;
}

/** Previous one-story step in the flight (band.low-1 ↔ band.low). */
function isPriorFlightStep(
  map: EmberMap,
  tileset: EmberTileset,
  nx: number,
  ny: number,
  band: { low: number; high: number },
): boolean {
  const nBand = connectorElevBand(map, tileset, nx, ny);
  return (
    !!nBand &&
    nBand.high === band.low &&
    nBand.low === band.low - 1
  );
}

/** Next one-story step up the flight (band.high ↔ band.high+1). */
function isNextFlightStep(
  map: EmberMap,
  tileset: EmberTileset,
  nx: number,
  ny: number,
  band: { low: number; high: number },
): boolean {
  const nBand = connectorElevBand(map, tileset, nx, ny);
  return (
    !!nBand &&
    nBand.low === band.high &&
    nBand.high === band.high + 1
  );
}

export type StairLampWashEnds = {
  low: LampGlowCell | undefined;
  high: LampGlowCell | undefined;
  /**
   * Low wash comes only from the story below (prior flight step).
   * Soft bottom steps — not a full-stair cover and not side Z0 floor bleed.
   */
  lowSpill: boolean;
};

/**
 * Neighbor/spill wash may only extend onto a stair if that stair is still
 * inside the winning lamp's flood range (dist + manhattan step ≤ lampRange).
 * Prevents a range-3 lamp from tinting stairs at dist 4 via a lit landing.
 */
function glowReachesStair(
  cell: LampGlowCell,
  fromX: number,
  fromY: number,
  stairX: number,
  stairY: number,
): boolean {
  const step = Math.abs(stairX - fromX) + Math.abs(stairY - fromY);
  return cell.dist + step <= cell.lampRange;
}

/**
 * Resolve low/high lantern wash sources for one stair/ramp cell.
 * - Lamp on upper landing → soft top steps
 * - Lamp on this band's low elev → full cover
 * - Lit prior flight step (e.g. Z0→Z1 next to Z1→Z2) → soft bottom spill
 * All sources must still reach this stair within lampRange.
 */
export function resolveStairLampWashEnds(
  map: EmberMap,
  tileset: EmberTileset,
  tx: number,
  ty: number,
  glow: Map<string, LampGlowCell>,
): StairLampWashEnds {
  const conn = connectorDirAt(map, tileset, tx, ty);
  const band = connectorElevBand(map, tileset, tx, ty);
  if (!conn || !band) {
    return { low: undefined, high: undefined, lowSpill: false };
  }

  const pickBrighter = (
    a: LampGlowCell | undefined,
    b: LampGlowCell | undefined,
  ): LampGlowCell | undefined => {
    if (!a) return b;
    if (!b) return a;
    return a.strength >= b.strength ? a : b;
  };

  const { dx, dy } = rampDirDelta(conn);
  let lowCell: LampGlowCell | undefined;
  let highCell: LampGlowCell | undefined;
  let directLow = false;

  const consider = (nx: number, ny: number) => {
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) return;
    if (isSolidAt(map, tileset, nx, ny)) return;
    const n = glow.get(`${nx},${ny}`);
    if (!n || n.strength <= 0) return;
    if (!glowReachesStair(n, nx, ny, tx, ty)) return;
    if (neighborFeedsStairEnd(map, tileset, nx, ny, band, "high")) {
      highCell = pickBrighter(highCell, n);
    }
    if (neighborFeedsStairEnd(map, tileset, nx, ny, band, "low")) {
      lowCell = pickBrighter(lowCell, n);
      directLow = true;
    }
  };

  consider(tx - dx, ty - dy);
  consider(tx + dx, ty + dy);
  for (const [ox, oy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    consider(tx + ox, ty + oy);
  }

  const self = glow.get(`${tx},${ty}`);
  if (self && self.strength > 0 && glowReachesStair(self, tx, ty, tx, ty)) {
    if (self.lampElev === band.high) {
      highCell = pickBrighter(highCell, self);
    } else if (self.lampElev === band.low) {
      lowCell = pickBrighter(lowCell, self);
      directLow = true;
    } else if (self.lampElev === band.low - 1) {
      // Soft bottom spill from the story below (z0 lamp → z1↔z2).
      lowCell = pickBrighter(lowCell, self);
      directLow = true;
    } else if (self.lampElev === elevationAt(map, tx, ty)) {
      if (self.lampElev === band.high) highCell = pickBrighter(highCell, self);
      else {
        lowCell = pickBrighter(lowCell, self);
        directLow = true;
      }
    }
  }

  // Soft spill from the prior flight step only (Z0→Z1 → Z1→Z2). Never from
  // flat Z0 floors beside/behind — that painted leak strips through the stair.
  if (!directLow) {
    let spillLow: LampGlowCell | undefined;
    for (const [ox, oy] of [
      [-dx, -dy],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = tx + ox;
      const ny = ty + oy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const n = glow.get(`${nx},${ny}`);
      if (!n || n.strength <= 0) continue;
      if (!isPriorFlightStep(map, tileset, nx, ny, band)) continue;
      if (!glowReachesStair(n, nx, ny, tx, ty)) continue;
      spillLow = pickBrighter(spillLow, n);
    }
    if (spillLow) lowCell = pickBrighter(lowCell, spillLow);
  }

  // Soft top spill from the next flight step (Z2→Z3 → upper steps of Z1→Z2)
  // when the shared high landing itself is not feeding us.
  if (!highCell) {
    let spillHigh: LampGlowCell | undefined;
    for (const [ox, oy] of [
      [dx, dy],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = tx + ox;
      const ny = ty + oy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const n = glow.get(`${nx},${ny}`);
      if (!n || n.strength <= 0) continue;
      if (!isNextFlightStep(map, tileset, nx, ny, band)) continue;
      if (!glowReachesStair(n, nx, ny, tx, ty)) continue;
      // Exact high landing elev only — z2 lamp must not spill onto z0↔z1
      // via a lit z1↔z2 / z2↔z3 step (lampElev 2 > band.high 1).
      if (n.lampElev !== band.high) continue;
      spillHigh = pickBrighter(spillHigh, n);
    }
    if (spillHigh) highCell = pickBrighter(highCell, spillHigh);
  }

  const lowSpill = !!lowCell && !directLow && !highCell;
  return { low: lowCell, high: highCell, lowSpill };
}

/**
 * Redraw stairs after wall/cliff face wash: full extrusion + night + silhouette
 * lamp blend. Opaque stair pixels occlude face glow that would otherwise shine
 * through under the diagonal flight.
 */
export function paintLanternStairGlow(
  ctx: CanvasRenderingContext2D,
  map: EmberMap,
  tileset: EmberTileset,
  scale = 1,
  originY = 0,
  wallH = 0,
  glowInfo?: Map<string, LampGlowCell>,
  ambientCss?: string,
  sprites?: EmberSpriteLib,
): void {
  const light = resolveMapLight(map);
  const glow =
    glowInfo ?? computeLanternGlowInfo(map, tileset, sprites);
  const ts = map.tileSize * scale;
  const wH = wallH || WALL_HEIGHT * scale;
  const tsR = Math.round(ts);
  const ambient =
    ambientCss ??
    rgbaFromHex(light.ambientColor, light.ambientAlpha, {
      r: 8,
      g: 6,
      b: 20,
    });

  const washFill = (cell: LampGlowCell): string => {
    const a = lanternFloorWashAlpha(light, cell.strength);
    const rgb = parseHexRgb(cell.lampColor) ?? { r: 255, g: 170, b: 70 };
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
  };

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (isSolidAt(map, tileset, tx, ty)) continue;
      const conn = connectorDirAt(map, tileset, tx, ty);
      if (!conn) continue;
      const band = connectorElevBand(map, tileset, tx, ty);
      if (!band) continue;
      const tile = groundTileAt(map, tileset, tx, ty);
      if (!tile) continue;
      const story = Math.max(1, band.high - band.low);
      const storyH = Math.round(story * wH);
      if (storyH <= 0) continue;

      const { low: lowCell, high: highCell, lowSpill } =
        resolveStairLampWashEnds(map, tileset, tx, ty, glow);
      const lowFill = lowCell ? washFill(lowCell) : "rgba(0,0,0,0)";
      const highFill = highCell ? washFill(highCell) : "rgba(0,0,0,0)";
      const hasWash =
        (lowCell != null && lowCell.strength > 0) ||
        (highCell != null && highCell.strength > 0);

      const px = Math.round(tx * ts);
      const pyLow = Math.round(ty * ts + originY - band.low * wH);
      const s = tsR;
      const sh = Math.max(1, storyH);
      const tmp = document.createElement("canvas");
      tmp.width = s;
      tmp.height = sh + s;
      const tctx = tmp.getContext("2d");
      if (!tctx) continue;
      tctx.imageSmoothingEnabled = false;
      const color =
        tile.color && tile.color !== "#00000000" ? tile.color : "#7a6a50";
      // Always redraw opaque stairs after floor wash so lower elev light
      // cannot shine through gaps in the higher flight.
      paintStairExtrusion(tctx, 0, sh, s, sh, conn, color);
      tctx.globalCompositeOperation = "source-atop";
      tctx.fillStyle = ambient;
      tctx.fillRect(0, 0, tmp.width, tmp.height);
      if (hasWash) {
        tctx.globalCompositeOperation = "source-atop";
        paintStairLanternWashClipped(
          tctx,
          0,
          sh,
          s,
          sh,
          conn,
          lowFill,
          highFill,
          { lowSpill },
        );
      }
      tctx.globalCompositeOperation = "source-over";
      ctx.drawImage(tmp, px, pyLow - sh);
    }
  }
}

/** Editor wall + cliff front faces — call AFTER ambient; never paints top caps. */
export function paintLanternFaceGlow(
  ctx: CanvasRenderingContext2D,
  map: EmberMap,
  tileset: EmberTileset,
  scale = 1,
  originY = 0,
  wallH = 0,
  glowInfo?: Map<string, LampGlowCell>,
): void {
  const light = resolveMapLight(map);
  const glow = glowInfo ?? computeLanternGlowInfo(map, tileset);
  const faces = computeWallFaceGlow(map, tileset, glow);
  const cliffs = computeCliffFaceGlow(map, tileset, glow);
  const ts = map.tileSize * scale;
  const wH = wallH || WALL_HEIGHT * scale;

  for (const [key, face] of faces) {
    const [tx, ty] = key.split(",").map(Number) as [number, number];
    const elevOff = elevVisualOffset(elevationAt(map, tx, ty)) * scale;
    const px = tx * ts;
    const py = ty * ts + originY - elevOff - wH * face.bands + ts;
    const faceLight = {
      ...light,
      lampFaceColor: face.lampFaceColor,
      lampRange: face.lampRange,
      lampStrength0: face.lampStrength0,
      lampStrengthFalloff: face.lampStrengthFalloff,
    };
    paintFaceGlowBands(
      ctx,
      px,
      py,
      ts,
      wH,
      strengthsWithOptionalBand(
        faceBandStrengths(face.bands, null, face.distLow, faceLight),
        face.onlyBandFromTop,
      ),
      faceLight,
    );
  }

  for (const [key, face] of cliffs) {
    const [tx, ty] = key.split(",").map(Number) as [number, number];
    const elev = elevationAt(map, tx, ty);
    const elevOff = elevVisualOffset(elev) * scale;
    const px = tx * ts;
    const py = ty * ts + originY - elevOff + ts;
    const faceLight = {
      ...light,
      lampFaceColor: face.lampFaceColor,
      lampRange: face.lampRange,
      lampStrength0: face.lampStrength0,
      lampStrengthFalloff: face.lampStrengthFalloff,
    };
    paintFaceGlowBands(
      ctx,
      px,
      py,
      ts,
      wH,
      faceBandStrengths(face.bands, face.distHigh, face.distLow, faceLight),
      faceLight,
    );
  }
}

/** Options for silhouette-correct prop lantern wash. */
export type LanternSpriteTintOpts = {
  /**
   * Light on the placement cell (fallback / primary).
   * Full floor wash from this cell only applies when the sprite top sits at
   * placement elev (`wallStories === 0`); raised tops get soft atmospheric
   * residual instead. Wall faces always sample it (primary + atmos).
   */
  cell?: LampGlowCell;
  /**
   * Soft-sample floor glow by art-pixel X across neighboring tiles.
   * When set with placeX/placeY/tileArtSize, wide props blend tile lights.
   */
  glow?: Map<string, LampGlowCell>;
  placeX?: number;
  placeY?: number;
  /** Floor elevation of the prop — rejects lamps from other elevs. */
  placeElev?: number;
  /** `map.tileSize` — art pixels per tile edge. */
  tileArtSize?: number;
};

/**
 * Best lit floor cell at or next to a prop placement (props often sit on
 * cells that themselves don't receive floor flood — e.g. tight against a wall).
 * Ignores lamps from other elevations so a z2 flood cannot tint a z0 column.
 */
export function pickSpriteLampCell(
  glow: Map<string, LampGlowCell>,
  placeX: number,
  placeY: number,
  placeElev?: number,
): LampGlowCell | undefined {
  const elevOk = (c: LampGlowCell) =>
    placeElev === undefined || c.lampElev === placeElev;
  const direct = glow.get(`${placeX},${placeY}`);
  if (direct && direct.strength > 0 && elevOk(direct)) return direct;
  let best: LampGlowCell | undefined;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const c = glow.get(`${placeX + dx},${placeY + dy}`);
      if (!c || c.strength <= 0) continue;
      if (!elevOk(c)) continue;
      if (!best || c.strength > best.strength) best = c;
    }
  }
  return best;
}

function sampleLampForSpritePixel(
  opts: LanternSpriteTintOpts,
  pixelX: number,
  srcW: number,
): LampGlowCell | undefined {
  const fallback = opts.cell;
  const glow = opts.glow;
  const tileArt = opts.tileArtSize ?? 0;
  if (
    !glow ||
    tileArt <= 0 ||
    opts.placeX === undefined ||
    opts.placeY === undefined
  ) {
    return fallback;
  }

  // World X of this art pixel in tile space (0.5 = center of placement tile).
  const worldX =
    opts.placeX + 0.5 + (pixelX + 0.5 - srcW / 2) / tileArt;
  const worldY = opts.placeY + 0.5;

  let sumW = 0;
  let accStrength = 0;
  let accDist = 0;
  let primary: LampGlowCell | undefined;

  const cx = Math.floor(worldX);
  const cy = Math.floor(worldY);
  // 3×3 neighborhood — narrow props must pick up light from adjacent lit floors.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const c = glow.get(`${cx + dx},${cy + dy}`);
      if (!c || c.strength <= 0) continue;
      if (
        opts.placeElev !== undefined &&
        c.lampElev !== opts.placeElev
      ) {
        continue;
      }
      const ddx = worldX - (cx + dx + 0.5);
      const ddy = worldY - (cy + dy + 0.5);
      const dist2 = ddx * ddx + ddy * ddy;
      const w = 1 / (0.28 + dist2);
      sumW += w;
      accStrength += c.strength * w;
      accDist += c.dist * w;
      if (!primary || c.strength > primary.strength) primary = c;
    }
  }

  if (!primary || sumW <= 0) return fallback;
  const strength = accStrength / sumW;
  const dist = accDist / sumW;
  if (
    Math.abs(strength - primary.strength) < 1e-4 &&
    Math.abs(dist - primary.dist) < 1e-4
  ) {
    return primary;
  }
  return { ...primary, strength, dist };
}

/**
 * Map each art row → face-band index (0 = top of wall face), or -1 for top/floor.
 * Each `wallHeights` entry is one lighting story. Strips ≥ 2× WALL_HEIGHT are
 * subdivided (floor division) like multi-story tile faces — so a decorative
 * 16px strip stays one band, while a 20px strip becomes two.
 */
function spriteRowFaceBands(
  n: Pick<EmberPixelSprite, "topHeight" | "wallHeights">,
  srcH: number,
): { bandOfRow: Int16Array; wallStories: number } {
  const bandOfRow = new Int16Array(srcH);
  bandOfRow.fill(-1);
  const walls = n.wallHeights ?? [];
  let row = Math.max(0, n.topHeight);
  let band = 0;
  for (const h of walls) {
    const stripH = Math.max(0, h);
    // floor — not round — so 16px art (common topHeight-sized walls) ≠ 2 stories
    const stories = Math.max(1, Math.floor(stripH / WALL_HEIGHT));
    for (let s = 0; s < stories; s++) {
      const y0 = row + Math.floor((s * stripH) / stories);
      const y1 = row + Math.floor(((s + 1) * stripH) / stories);
      for (let y = y0; y < y1 && y < srcH; y++) {
        if (y >= 0) bandOfRow[y] = band;
      }
      band++;
    }
    row += stripH;
  }
  return { bandOfRow, wallStories: Math.max(0, band) };
}

/**
 * Continuous height along a prop shaft for lighting (not discrete story bands).
 * `storiesFromFloor` is 0 at the bottom art row and rises toward the top of the
 * wall stack — so light climbs and fades smoothly instead of a hard tile cut.
 */
function spriteHeightSample(
  n: Pick<EmberPixelSprite, "topHeight" | "wallHeights">,
  srcH: number,
  artY: number,
  wallStories: number,
): { isTop: boolean; storiesFromFloor: number } {
  const topH = Math.max(0, Math.min(srcH, n.topHeight));
  if (artY < topH) {
    return { isTop: true, storiesFromFloor: Math.max(0, wallStories) };
  }
  if (wallStories <= 0 || srcH <= topH) {
    return { isTop: false, storiesFromFloor: 0 };
  }
  const wallBottom = srcH - 1;
  const wallTop = topH;
  if (wallBottom <= wallTop) {
    return { isTop: false, storiesFromFloor: 0 };
  }
  const t = (wallBottom - artY) / (wallBottom - wallTop);
  return {
    isTop: false,
    storiesFromFloor: Math.max(0, Math.min(wallStories, t * wallStories)),
  };
}

/**
 * Soft face strength for a prop pixel: distance + continuous height climb.
 * Soft tail past lamp range avoids the hard red/black shelf on tall columns.
 */
function spriteClimbStrength(
  dist: number,
  storiesFromFloor: number,
  light: Pick<
    ResolvedMapLight,
    "lampRange" | "lampStrength0" | "lampStrengthFalloff"
  >,
): number {
  const floorS = lampStrengthAtDist(Math.max(0, dist), light);
  const climb = Math.max(0, dist) + Math.max(0, storiesFromFloor);
  const R = Math.max(1, light.lampRange);
  // Soft reach: full within range, fade over ~1.2 stories past it.
  const over = climb - R;
  const reach =
    over <= 0 ? 1 : Math.max(0, 1 - over / 1.2);
  if (reach <= 0) return 0;
  // Prefer floor flood strength; if we're past hard floor reach, ease from
  // a residual so the soft tail still has color.
  const base =
    floorS > 0.001
      ? floorS
      : light.lampStrengthFalloff * Math.max(0, 1 - Math.max(0, dist) / (R + 1));
  if (base <= 0) return 0;
  // Props read a bit hotter than tile faces so they don't look light-proof.
  const heightFade = Math.pow(0.82, Math.max(0, storiesFromFloor));
  return base * 1.05 * heightFade * reach;
}

/**
 * Soft residual lantern atmosphere for raised tops / high shaft.
 * Uses cell.strength (distance-graded) × glowScale × scale × height^story.
 */
const SPRITE_ATMOS_SCALE = 0.32;
const SPRITE_ATMOS_HEIGHT_FALLOFF = 0.7;
const SPRITE_ATMOS_MIN_ALPHA = 0.006;

function spriteAtmosAlpha(
  strength: number,
  storiesFromFloor: number,
  glowScale: number,
): number {
  if (strength <= 0 || glowScale <= 0) return 0;
  const heightMul = Math.pow(
    SPRITE_ATMOS_HEIGHT_FALLOFF,
    Math.max(0, storiesFromFloor),
  );
  return strength * glowScale * SPRITE_ATMOS_SCALE * heightMul;
}

function spriteAtmosWashAlpha(
  light: Pick<ResolvedMapLight, "ambientAlpha">,
  strength: number,
  storiesFromFloor: number,
  glowScale: number,
): number {
  const raw = spriteAtmosAlpha(strength, storiesFromFloor, glowScale);
  if (raw < SPRITE_ATMOS_MIN_ALPHA) return 0;
  return Math.min(1, raw * lanternNightBoost(light.ambientAlpha));
}

/** Slight rim darkening toward sprite edges (wrap / roundness cue). */
function spriteWrapFactor(pixelX: number, srcW: number): number {
  if (srcW <= 1) return 1;
  const edge = Math.abs((pixelX + 0.5) / srcW - 0.5) * 2;
  return 1 - edge * 0.2;
}

/**
 * Tint opaque prop-sprite pixels with lantern wash (silhouette-correct).
 * Top/floor art uses full floor glow only when the cap sits at the placement
 * floor elevation (`wallStories === 0`). Raised caps get soft atmosphere.
 * Wall pixels use continuous height+distance climb (no hard story shelves).
 * Transparent pixels stay untinted — no AABB rectangle band.
 */
export function paintLanternSpriteTint(
  ctx: CanvasRenderingContext2D,
  light: ResolvedMapLight,
  sprite: EmberPixelSprite,
  left: number,
  top: number,
  width: number,
  height: number,
  opts: LanternSpriteTintOpts,
): void {
  if (width <= 0 || height <= 0) return;
  const n = normalizePixelSprite(sprite);
  const srcW = Math.max(1, n.width);
  const srcH = Math.max(1, spriteTotalHeight(n));
  const x0 = Math.round(left);
  const y0 = Math.round(top);
  const rw = Math.max(1, Math.round(width));
  const rh = Math.max(1, Math.round(height));
  const { wallStories } = spriteRowFaceBands(n, srcH);
  const topGetsFloorWash = wallStories === 0;

  const faceLightFrom = (cell: LampGlowCell): ResolvedMapLight => ({
    ...light,
    lampFaceColor: cell.lampFaceColor,
    lampRange: cell.lampRange,
    lampStrength0: cell.lampStrength0,
    lampStrengthFalloff: cell.lampStrengthFalloff,
  });

  const washForRow = (
    cell: LampGlowCell,
    artY: number,
    pixelX: number,
  ): string | null => {
    const { isTop, storiesFromFloor } = spriteHeightSample(
      n,
      srcH,
      artY,
      wallStories,
    );
    const wrap = spriteWrapFactor(pixelX, srcW);
    if (isTop) {
      const lampRgb =
        parseHexRgb(cell.lampColor) ?? { r: 255, g: 170, b: 70 };
      let a = 0;
      if (topGetsFloorWash) {
        a = lanternFloorWashAlpha(light, cell.strength);
      } else {
        a = spriteAtmosWashAlpha(
          light,
          cell.strength,
          storiesFromFloor,
          light.floorGlowScale,
        );
      }
      a *= wrap;
      if (a < SPRITE_ATMOS_MIN_ALPHA) return null;
      return `rgba(${lampRgb.r}, ${lampRgb.g}, ${lampRgb.b}, ${a})`;
    }

    const faceLight = faceLightFrom(cell);
    const climb = spriteClimbStrength(
      cell.dist,
      storiesFromFloor,
      faceLight,
    );
    const faceRgb =
      parseHexRgb(cell.lampFaceColor) ?? { r: 255, g: 150, b: 60 };
    let a =
      climb > 0.02
        ? lanternFaceWashAlpha(light, climb)
        : spriteAtmosWashAlpha(
            light,
            cell.strength,
            storiesFromFloor,
            light.faceGlowScale,
          );
    // Blend a touch of atmos into primary so height fade stays continuous.
    if (climb > 0.02) {
      a = Math.max(
        a,
        spriteAtmosWashAlpha(
          light,
          cell.strength,
          storiesFromFloor,
          light.faceGlowScale,
        ),
      );
    }
    a *= wrap;
    if (a < SPRITE_ATMOS_MIN_ALPHA) return null;
    return `rgba(${faceRgb.r}, ${faceRgb.g}, ${faceRgb.b}, ${a})`;
  };

  // No pixel art — approximate with per-row continuous wash (still no AABB).
  if (!spriteHasVisual(n)) {
    const cell = opts.cell;
    if (!cell) return;
    const cellH = rh / srcH;
    let lastFill = "";
    for (let y = 0; y < srcH; y++) {
      const fill = washForRow(cell, y, (srcW - 1) / 2);
      if (!fill) continue;
      if (fill !== lastFill) {
        ctx.fillStyle = fill;
        lastFill = fill;
      }
      const fy = y0 + Math.floor(y * cellH);
      const fh = Math.max(1, y0 + Math.floor((y + 1) * cellH) - fy);
      ctx.fillRect(x0, fy, rw, fh);
    }
    return;
  }

  const cellW = rw / srcW;
  const cellH = rh / srcH;
  let lastFill = "";

  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const ink = n.pixels[y * srcW + x];
      if (!ink || ink === "" || ink === "#00000000") continue;
      const cell = sampleLampForSpritePixel(opts, x, srcW);
      if (!cell) continue;
      const fill = washForRow(cell, y, x);
      if (!fill) continue;
      if (fill !== lastFill) {
        ctx.fillStyle = fill;
        lastFill = fill;
      }
      const fx = x0 + Math.floor(x * cellW);
      const fy = y0 + Math.floor(y * cellH);
      const fw = Math.max(1, x0 + Math.floor((x + 1) * cellW) - fx);
      const fh = Math.max(1, y0 + Math.floor((y + 1) * cellH) - fy);
      ctx.fillRect(fx, fy, fw, fh);
    }
  }
}

/**
 * Bake prop art + night ambient + lamp tint into one canvas (editor/runtime parity).
 * Opaque pixels get ambient then silhouette wash; transparent holes stay clear.
 */
export function bakeLanternLitSpriteCanvas(
  spr: EmberPixelSprite,
  light: ResolvedMapLight,
  ambientCss: string,
  tintOpts: LanternSpriteTintOpts,
  scale = 1,
  tileArtSize?: number,
): HTMLCanvasElement | null {
  const n = normalizePixelSprite(spr);
  if (!spriteHasVisual(n)) return null;
  const stackW = Math.max(1, Math.round(n.width * scale));
  const stackH = Math.max(1, Math.round(spriteTotalHeight(n) * scale));
  const tsR = Math.max(
    1,
    Math.round((tileArtSize ?? Math.max(n.width, 1)) * scale),
  );
  const layer = document.createElement("canvas");
  layer.width = stackW;
  layer.height = stackH;
  const lctx = layer.getContext("2d");
  if (!lctx) return null;
  lctx.imageSmoothingEnabled = false;
  // Align wall bottom to canvas bottom (same geometry as map stamp).
  const floorX = stackW / 2 - tsR / 2;
  const floorY = stackH - tsR;
  paintSpriteDecorOnFloor(lctx, spr, floorX, floorY, tsR, scale);
  lctx.globalCompositeOperation = "source-atop";
  lctx.fillStyle = ambientCss;
  lctx.fillRect(0, 0, stackW, stackH);
  lctx.globalCompositeOperation = "source-over";
  paintLanternSpriteTint(lctx, light, n, 0, 0, stackW, stackH, tintOpts);
  return layer;
}

/**
 * Stamp one map prop: base art → ambient on opaque pixels → lamp tint on top.
 * Ambient must not re-multiply the lamp wash (that crushed night lamps).
 * Draw AFTER `paintLanternFaceGlow` so props occlude wall wash behind them.
 */
function paintMapSpriteOccludingGlow(
  ctx: CanvasRenderingContext2D,
  spr: EmberPixelSprite,
  floorX: number,
  floorY: number,
  tsR: number,
  scale: number,
  light: ResolvedMapLight,
  tintOpts: LanternSpriteTintOpts,
  ambientCss: string,
): { cx: number; top: number; stackW: number; stackH: number } {
  const n = normalizePixelSprite(spr);
  const stackW = Math.max(1, Math.round(n.width * scale));
  const stackH = Math.max(1, Math.round(spriteTotalHeight(n) * scale));
  const cx = floorX + tsR / 2;
  const top = floorY + tsR - stackH;
  const left = cx - stackW / 2;

  const baked = bakeLanternLitSpriteCanvas(
    spr,
    light,
    ambientCss,
    tintOpts,
    scale,
    tsR / scale,
  );
  if (baked) {
    ctx.drawImage(baked, Math.round(left), Math.round(top));
  } else {
    paintSpriteDecorOnFloor(ctx, spr, floorX, floorY, tsR, scale);
    paintLanternSpriteTint(ctx, light, n, left, top, stackW, stackH, tintOpts);
  }
  return { cx, top, stackW, stackH };
}

/** @deprecated use paintLanternFloorGlow + paintLanternFaceGlow + paintLanternStairGlow */
export function paintLanternGlow(
  ctx: CanvasRenderingContext2D,
  map: EmberMap,
  tileset: EmberTileset,
  scale = 1,
  originY = 0,
  wallH = 0,
): void {
  paintLanternFloorGlow(ctx, map, tileset, scale, originY, wallH);
  paintLanternFaceGlow(ctx, map, tileset, scale, originY, wallH);
  paintLanternStairGlow(ctx, map, tileset, scale, originY, wallH);
}

export type PaintMapToCanvasOpts = {
  showCollision?: boolean;
  showRegions?: boolean;
  showElevation?: boolean;
  scale?: number;
  viewMode?: MapViewMode;
  /** Pack sprites for map.sprite placements. */
  sprites?: Record<string, EmberPixelSprite>;
  /**
   * Stop after unlit geometry (no ambient / light / props / bloom).
   * Use with {@link paintMapLightPassToCanvas} for a dynamic light overlay.
   */
  geometryOnly?: boolean;
  /**
   * Override vertical pad (editor uses mapVerticalPad; Phaser top uses 0 so
   * entity projection stays aligned).
   */
  padOverride?: number;
};

/** Draw map with extruded walls (editor). Supports top / sideEast / sideWest. */
export function paintMapToCanvas(
  ctx: CanvasRenderingContext2D,
  map: EmberMap,
  tileset: EmberTileset,
  opts?: PaintMapToCanvasOpts,
): void {
  map = ensureMapLayers(map);
  const viewMode = opts?.viewMode ?? "top";
  if (isYawedViewMode(viewMode)) {
    // Side views stay a full composite (projection differs from top light pass).
    paintMapToCanvasSide(ctx, map, tileset, viewMode, opts);
    return;
  }
  paintMapGeometryToCanvas(ctx, map, tileset, opts);
  if (opts?.geometryOnly) return;
  paintMapLightPassToCanvas(ctx, map, tileset, opts);
}

/**
 * Static unlit map art (floors, cliffs, stairs, walls). Shared geom bake for
 * editor cache + Phaser; light is applied separately.
 */
export function paintMapGeometryToCanvas(
  ctx: CanvasRenderingContext2D,
  map: EmberMap,
  tileset: EmberTileset,
  opts?: PaintMapToCanvasOpts,
): void {
  map = ensureMapLayers(map);
  const scale = opts?.scale ?? 1;
  const ts = map.tileSize * scale;
  const wallH = WALL_HEIGHT * scale;
  const pad =
    (opts?.padOverride ?? mapVerticalPad(map)) * scale;
  const width = Math.ceil(map.width * ts);
  const height = Math.ceil(map.height * ts + pad);

  ctx.canvas.width = width;
  ctx.canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  const tileById = new Map(tileset.tiles.map((t) => [t.id, t]));
  const tileOf = (id: number) => tileById.get(id);
  const ground = layerData(map, "ground");
  const decor = layerData(map, "decor");
  const col = layerData(map, "collision");
  const tsR = Math.round(ts);

  ctx.fillStyle = "#0c0a10";
  ctx.fillRect(0, 0, width, height);

  // Ground + decor (elevated floors shift up + slight brighten).
  // Stair/ramp cells are drawn later as stepped extrusions — skip flat tops here.
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const gi = y * map.width + x;
      const h = heightAt(map, x, y);
      const isWall = h >= 1 || (col?.[gi] ?? 0) > 0;
      const elev = elevationAt(map, x, y);
      const elevOff = elevVisualOffset(elev) * scale;
      const px = Math.round(x * ts);
      const py = Math.round(y * ts + pad - elevOff);
      const gId = ground?.[gi] ?? 1;
      const gTile = tileOf(gId);
      const isConnector = Boolean(gTile?.stair || gTile?.ramp);
      if (
        !isConnector &&
        (!isWall || opts?.showCollision) &&
        gTile?.color !== "#00000000"
      ) {
        blitTileFace(ctx, gTile, px, py, tsR);
        const hi = elevationHighlightAlpha(elev);
        if (hi > 0) {
          ctx.fillStyle = `rgba(255, 248, 230, ${hi})`;
          ctx.fillRect(px, py, tsR, tsR);
        }
      }
      if (!isWall && !isConnector) {
        const dId = decor?.[gi] ?? 0;
        if (dId) {
          const dTile = tileOf(dId);
          if (dTile && dTile.color !== "#00000000") {
            blitTileFace(ctx, dTile, px, py, tsR);
          }
        }
      }
      if (opts?.showElevation && !isWall && !isConnector) {
        if (elev > 0) {
          ctx.fillStyle = `rgba(80, 160, 255, ${0.1 + elev * 0.08})`;
          ctx.fillRect(px, py, tsR, tsR);
        }
        ctx.fillStyle = "rgba(220, 230, 255, 0.85)";
        ctx.font = `${Math.max(8, 7 * scale)}px sans-serif`;
        ctx.fillText(String(elev), px + 2, py + Math.max(10, 9 * scale));
      }
    }
  }

  // Wall soft-fall onto lower floors (before tops re-blit)
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const h = heightAt(map, x, y);
      const isWall = h >= 1 || (col?.[y * map.width + x] ?? 0) > 0;
      if (!isWall) continue;
      const raise = wallH * Math.max(1, h);
      if (y + 1 < map.height && canReceiveShadow(map, x, y, x, y + 1)) {
        const se = elevationAt(map, x, y + 1);
        const recvOff = elevVisualOffset(se) * scale;
        ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
        ctx.fillRect(
          Math.round(x * ts),
          Math.round((y + 1) * ts + pad - recvOff),
          Math.round(ts),
          Math.min(ts * 0.4, raise * 0.5 + 2),
        );
      }
    }
  }

  const blitElevatedTop = (x: number, y: number, elev: number) => {
    const gi = y * map.width + x;
    const elevOff = elevVisualOffset(elev) * scale;
    const px = Math.round(x * ts);
    const py = Math.round(y * ts + pad - elevOff);
    const gTile = tileOf(ground?.[gi] ?? 1);
    if (gTile && gTile.color !== "#00000000") {
      blitTileFace(ctx, gTile, px, py, tsR);
      const hi = elevationHighlightAlpha(elev);
      if (hi > 0) {
        ctx.fillStyle = `rgba(255, 248, 230, ${hi})`;
        ctx.fillRect(px, py, tsR, tsR);
      }
    }
    const dId = decor?.[gi] ?? 0;
    if (dId) {
      const dTile = tileOf(dId);
      if (dTile && dTile.color !== "#00000000") {
        blitTileFace(ctx, dTile, px, py, tsR);
      }
    }
    if (opts?.showElevation) {
      if (elev > 0) {
        ctx.fillStyle = `rgba(80, 160, 255, ${0.1 + elev * 0.08})`;
        ctx.fillRect(px, py, tsR, tsR);
      }
      ctx.fillStyle = "rgba(220, 230, 255, 0.85)";
      ctx.font = `${Math.max(8, 7 * scale)}px sans-serif`;
      ctx.fillText(String(elev), px + 2, py + Math.max(10, 9 * scale));
    }
  };

  const paintCliffForCell = (x: number, y: number, elev: number) => {
    if (elev <= 0) return;
    const gTile = tileOf(ground?.[y * map.width + x] ?? 1);
    const elevOff = elevVisualOffset(elev) * scale;
    const px = Math.round(x * ts);
    // Face starts strictly on the pixel below the top cap (avoids wall bleed on floor).
    const pyTop = Math.round(y * ts + pad - elevOff);
    const faceY = pyTop + tsR;

    let hasSouth = false;
    if (y + 1 < map.height) {
      const se = elevationAt(map, x, y + 1);
      const sh = heightAt(map, x, y + 1);
      if (se < elev && sh < 1) {
        hasSouth = true;
        const drop = Math.round((elev - se) * wallH);
        if (drop > 0) {
          paintWallFront(ctx, gTile, px, faceY, tsR, drop);
          ctx.fillStyle = `rgba(0, 0, 0, ${0.2 + (elev - se) * 0.05})`;
          ctx.fillRect(
            px,
            faceY,
            tsR,
            Math.min(drop, Math.max(2, Math.round(drop * 0.32))),
          );
        }
      }
    }
    if (!hasSouth && x + 1 < map.width) {
      const ee = elevationAt(map, x + 1, y);
      const eh = heightAt(map, x + 1, y);
      if (ee < elev && eh < 1) {
        const drop = Math.round((elev - ee) * wallH);
        if (drop > 0) {
          const edgeW = Math.max(2, Math.round(ts * 0.18));
          paintWallFront(ctx, gTile, px + tsR - edgeW, faceY, edgeW, drop);
        }
      }
    }
  };

  /** Stair/ramp cells: stepped extrusion instead of a full cube. */
  const paintConnectorCell = (x: number, y: number): boolean => {
    const gi = y * map.width + x;
    if (heightAt(map, x, y) >= 1 || (col?.[gi] ?? 0) > 0) return false;
    const gTile = tileOf(ground?.[gi] ?? 1);
    const dir = gTile?.stair ?? gTile?.ramp;
    if (!dir || !gTile) return false;
    const band = connectorElevBand(map, tileset, x, y);
    if (!band) return false;
    const story = Math.max(1, band.high - band.low);
    const storyH = Math.round(story * wallH);
    if (storyH <= 0) return false;
    const px = Math.round(x * ts);
    const pyLow = Math.round(y * ts + pad - band.low * wallH);
    const color =
      gTile.color && gTile.color !== "#00000000" ? gTile.color : "#7a6a50";
    paintStairExtrusion(ctx, px, pyLow, tsR, storyH, dir, color);
    if (opts?.showElevation) {
      ctx.fillStyle = "rgba(220, 230, 255, 0.85)";
      ctx.font = `${Math.max(8, 7 * scale)}px sans-serif`;
      ctx.fillText(
        String(elevationAt(map, x, y)),
        px + 2,
        pyLow - storyH + Math.max(10, 9 * scale),
      );
    }
    return true;
  };

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const gi = y * map.width + x;
      if (heightAt(map, x, y) >= 1 || (col?.[gi] ?? 0) > 0) continue;
      if (paintConnectorCell(x, y)) continue;
      const elev = elevationAt(map, x, y);
      if (elev > 0) blitElevatedTop(x, y, elev);
      paintCliffForCell(x, y, elev);
    }
  }

  // Walls first; floor/face lamp washes come after ambient so night does not
  // multiply onto lit pixels (lamps punch through darkness).
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const h = heightAt(map, x, y);
      if (h < 1 && (col?.[y * map.width + x] ?? 0) <= 0) continue;
      const levels = Math.max(1, h || 1);
      const elevOff = elevVisualOffset(elevationAt(map, x, y)) * scale;
      const px = x * ts;
      const py = y * ts + pad - elevOff;
      const gTile = tileOf(ground?.[y * map.width + x] ?? 2);
      const topColor = opts?.showCollision
        ? "#e07050"
        : gTile?.material === "wood"
          ? "#6a4a28"
          : gTile?.color && gTile.color !== "#00000000"
            ? gTile.color
            : "#5a4a40";
      if (opts?.showCollision) ctx.globalAlpha = 0.9;
      fillExtrudedWall(
        ctx,
        px,
        py,
        ts,
        wallH * levels,
        topColor,
        opts?.showCollision ? undefined : (gTile ?? tileOf(2)),
      );
      if (opts?.showCollision) ctx.globalAlpha = 1;
    }
  }
}

/**
 * Dynamic light pass on top of an already-painted unlit geometry canvas.
 * Does not resize the canvas (preserves the geometry bake).
 */
export function paintMapLightPassToCanvas(
  ctx: CanvasRenderingContext2D,
  map: EmberMap,
  tileset: EmberTileset,
  opts?: PaintMapToCanvasOpts,
): void {
  map = ensureMapLayers(map);
  const scale = opts?.scale ?? 1;
  const ts = map.tileSize * scale;
  const wallH = WALL_HEIGHT * scale;
  const pad =
    (opts?.padOverride ?? mapVerticalPad(map)) * scale;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const col = layerData(map, "collision");
  const tsR = Math.round(ts);
  const light = resolveMapLight(map);
  const { lit } = computeLitSurfaces(map, tileset, opts?.sprites);
  const floorGlow = litSurfacesToFloorGlow(lit);

  // Full-canvas ambient (covers elev>0 tops). Lantern overlays + props follow.
  const ambientCss = rgbaFromHex(light.ambientColor, light.ambientAlpha, {
    r: 8,
    g: 6,
    b: 20,
  });
  ctx.fillStyle = ambientCss;
  ctx.fillRect(0, 0, width, height);

  // Dynamic surface light pass (floors / faces / treads). Shared with Phaser.
  // Protect unlit elevated tops: z0 floor washes can overlap them in screen space.
  withProtectedUnlitElevatedTops(
    ctx,
    map,
    tileset,
    { scale, originY: pad, floorGlow },
    () => {
      paintSurfaceLightOverlay(
        ctx,
        map,
        tileset,
        lit,
        scale,
        pad,
        wallH,
        ambientCss,
      );
    },
  );

  // Props on top of tile face glow — opaque pixels occlude shine-through.
  const sprLib = opts?.sprites;
  if (sprLib && map.sprites?.length) {
    for (const place of map.sprites) {
      const spr = sprLib[place.spriteId];
      if (!spr) continue;
      const elev = elevationAt(map, place.x, place.y);
      const elevOff = elevVisualOffset(elev) * scale;
      const floorX = Math.round(place.x * ts);
      const floorY = Math.round(place.y * ts + pad - elevOff);
      const tintOpts: LanternSpriteTintOpts = {
        cell: pickSpriteLampCell(floorGlow, place.x, place.y, elev),
        glow: floorGlow,
        placeX: place.x,
        placeY: place.y,
        placeElev: elev,
        tileArtSize: map.tileSize,
      };
      const { cx, top, stackW, stackH } = paintMapSpriteOccludingGlow(
        ctx,
        spr,
        floorX,
        floorY,
        tsR,
        scale,
        light,
        tintOpts,
        ambientCss,
      );
      const spriteCollider = resolveSpriteInstanceCollider(place, spr);
      if (
        opts?.showCollision &&
        spriteCollider.enabled &&
        spriteCollider.blocksMovement &&
        !spriteCollider.isTrigger
      ) {
        ctx.fillStyle = "rgba(224, 112, 80, 0.35)";
        ctx.strokeStyle = "rgba(255, 140, 100, 0.85)";
        ctx.lineWidth = Math.max(1, scale);
        ctx.fillRect(cx - stackW / 2, top, stackW, stackH);
        ctx.strokeRect(
          cx - stackW / 2 + 0.5,
          top + 0.5,
          stackW - 1,
          stackH - 1,
        );
      }
    }
  }

  if (light.bloomStrength > 0) {
    const emissive = createEmissiveBuffer(width, height);
    if (emissive) {
      paintLanternBloomField(
        emissive.ctx,
        map,
        tileset,
        scale,
        pad,
        floorGlow,
        opts?.sprites,
      );
      paintMapEmissiveField(emissive.ctx, map, tileset, {
        sprites: opts?.sprites,
        scale,
        originY: pad,
        timeSec: 0,
        mode: "bloom",
      });
      // Snapshot tops after props, restore after bloom so soft glow cannot tint them.
      withProtectedUnlitElevatedTops(
        ctx,
        map,
        tileset,
        { scale, originY: pad, floorGlow },
        () => {
          applyLanternBloom(ctx, emissive.canvas, {
            strength: light.bloomStrength,
            occlude: {
              map,
              tileset,
              scale,
              originY: pad,
              floorGlow,
            },
          });
        },
      );
    }
    // Crisp glowing pixels on top of the scene (editor static preview).
    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    paintMapEmissiveField(ctx, map, tileset, {
      sprites: opts?.sprites,
      scale,
      originY: pad,
      timeSec: 0,
      mode: "crisp",
    });
    ctx.globalCompositeOperation = prevComp;
  } else {
    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    paintMapEmissiveField(ctx, map, tileset, {
      sprites: opts?.sprites,
      scale,
      originY: pad,
      timeSec: 0,
      mode: "both",
    });
    ctx.globalCompositeOperation = prevComp;
  }

  if (opts?.showRegions) {
    const isWallAt = (tx: number, ty: number) =>
      heightAt(map, tx, ty) >= 1 || (col?.[(ty * map.width + tx) | 0] ?? 0) > 0;
    for (const r of map.regions) {
      const color =
        r.kind === "player_start"
          ? "#66ff66"
          : r.kind === "spawn"
            ? "#ff8866"
            : r.kind === "chest"
              ? "#ffcc66"
              : r.kind === "teleport"
                ? "#e0a0ff"
                : "#88aaff";
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, scale);
      if (r.kind === "camera_bound") {
        ctx.strokeRect(
          r.x * ts + 0.5,
          r.y * ts + pad + 0.5,
          r.w * ts - 1,
          r.h * ts - 1,
        );
      } else {
        for (let i = 0; i < r.w; i++) {
          for (let j = 0; j < r.h; j++) {
            const tx = r.x + i;
            const ty = r.y + j;
            if (isWallAt(tx, ty)) continue;
            const elevOff = elevVisualOffset(elevationAt(map, tx, ty)) * scale;
            ctx.strokeRect(
              tx * ts + 0.5,
              ty * ts + pad - elevOff + 0.5,
              ts - 1,
              ts - 1,
            );
          }
        }
      }
      ctx.fillStyle = color;
      ctx.font = `${Math.max(10, 9 * scale)}px sans-serif`;
      ctx.fillText(
        r.id,
        r.x * ts + 2,
        r.y * ts + pad + Math.max(12, 10 * scale),
      );
    }
  }

  // Global color grade after ambient + lantern overlays.
  applyMapColorGrade(ctx, width, height, light.grade);
}

/**
 * Side view = 90° yaw of the top extruded camera (not a flat profile strip).
 * screenX←tileY, screenY←tileX (+ elev), near = east/west.
 */
function paintMapToCanvasSide(
  ctx: CanvasRenderingContext2D,
  map: EmberMap,
  tileset: EmberTileset,
  mode: "sideEast" | "sideWest" | "sideNorth",
  opts?: {
    showCollision?: boolean;
    showRegions?: boolean;
    showElevation?: boolean;
    scale?: number;
    sprites?: Record<string, EmberPixelSprite>;
  },
): void {
  const scale = opts?.scale ?? 1;
  const { width, height, ts } = mapCanvasSize(mode, map, scale);
  const wallH = WALL_HEIGHT * scale;
  const tsR = Math.round(ts);
  const { dx: camDx, dy: camDy } = towardCameraDelta(mode);

  ctx.canvas.width = width;
  ctx.canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  const tileById = new Map(tileset.tiles.map((t) => [t.id, t]));
  const tileOf = (id: number) => tileById.get(id);
  const ground = layerData(map, "ground");
  const decor = layerData(map, "decor");
  const col = layerData(map, "collision");

  ctx.fillStyle = "#0c0a10";
  ctx.fillRect(0, 0, width, height);

  type Cell = { x: number; y: number; elev: number; depth: number };
  const cells: Cell[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const elev = elevationAt(map, x, y);
      cells.push({
        x,
        y,
        elev,
        depth: projectCell(mode, map, x, y, elev, scale).depth,
      });
    }
  }
  cells.sort((a, b) => a.depth - b.depth);

  for (const { x, y, elev } of cells) {
    const gi = y * map.width + x;
    const h = heightAt(map, x, y);
    const isWall = h >= 1 || (col?.[gi] ?? 0) > 0;
    const gTile = tileOf(ground?.[gi] ?? 1);
    const isConnector = Boolean(gTile?.stair || gTile?.ramp);
    if (isConnector) continue;
    const p = projectCell(mode, map, x, y, elev, scale);
    const px = Math.round(p.px);
    const py = Math.round(p.py);
    if ((!isWall || opts?.showCollision) && gTile?.color !== "#00000000") {
      blitTileFace(ctx, gTile, px, py, tsR);
      const hi = elevationHighlightAlpha(elev);
      if (hi > 0) {
        ctx.fillStyle = `rgba(255, 248, 230, ${hi})`;
        ctx.fillRect(px, py, tsR, tsR);
      }
    }
    if (!isWall) {
      const dId = decor?.[gi] ?? 0;
      if (dId) {
        const dTile = tileOf(dId);
        if (dTile && dTile.color !== "#00000000") {
          blitTileFace(ctx, dTile, px, py, tsR);
        }
      }
    }
    if (opts?.showElevation && !isWall) {
      if (elev > 0) {
        ctx.fillStyle = `rgba(80, 160, 255, ${0.1 + elev * 0.08})`;
        ctx.fillRect(px, py, tsR, tsR);
      }
      ctx.fillStyle = "rgba(220, 230, 255, 0.85)";
      ctx.font = `${Math.max(8, 7 * scale)}px sans-serif`;
      ctx.fillText(String(elev), px + 2, py + Math.max(10, 9 * scale));
    }
  }

  // Soft-fall onto the tile toward the camera
  for (const { x, y } of cells) {
    const h = heightAt(map, x, y);
    const isWall = h >= 1 || (col?.[y * map.width + x] ?? 0) > 0;
    if (!isWall) continue;
    const raise = wallH * Math.max(1, h);
    const nx = x + camDx;
    const ny = y + camDy;
    if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;
    if (!canReceiveShadow(map, x, y, nx, ny)) continue;
    const se = elevationAt(map, nx, ny);
    const recv = projectCell(mode, map, nx, ny, se, scale);
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.fillRect(
      Math.round(recv.px),
      Math.round(recv.py),
      tsR,
      Math.min(ts * 0.4, raise * 0.5 + 2),
    );
  }

  const blitElevatedTop = (x: number, y: number, elev: number) => {
    const gi = y * map.width + x;
    const p = projectCell(mode, map, x, y, elev, scale);
    const px = Math.round(p.px);
    const py = Math.round(p.py);
    const gTile = tileOf(ground?.[gi] ?? 1);
    if (gTile && gTile.color !== "#00000000") {
      blitTileFace(ctx, gTile, px, py, tsR);
      const hi = elevationHighlightAlpha(elev);
      if (hi > 0) {
        ctx.fillStyle = `rgba(255, 248, 230, ${hi})`;
        ctx.fillRect(px, py, tsR, tsR);
      }
    }
    const dId = decor?.[gi] ?? 0;
    if (dId) {
      const dTile = tileOf(dId);
      if (dTile && dTile.color !== "#00000000") {
        blitTileFace(ctx, dTile, px, py, tsR);
      }
    }
    if (opts?.showElevation) {
      if (elev > 0) {
        ctx.fillStyle = `rgba(80, 160, 255, ${0.1 + elev * 0.08})`;
        ctx.fillRect(px, py, tsR, tsR);
      }
      ctx.fillStyle = "rgba(220, 230, 255, 0.85)";
      ctx.font = `${Math.max(8, 7 * scale)}px sans-serif`;
      ctx.fillText(String(elev), px + 2, py + Math.max(10, 9 * scale));
    }
  };

  const paintCliffForCell = (x: number, y: number, elev: number) => {
    if (elev <= 0) return;
    const gTile = tileOf(ground?.[y * map.width + x] ?? 1);
    const p = projectCell(mode, map, x, y, elev, scale);
    const px = Math.round(p.px);
    const faceY = Math.round(p.py) + tsR;
    const nx = x + camDx;
    const ny = y + camDy;
    if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) return;
    const ne = elevationAt(map, nx, ny);
    const nh = heightAt(map, nx, ny);
    if (ne >= elev || nh >= 1) return;
    const drop = Math.round((elev - ne) * wallH);
    if (drop <= 0) return;
    paintWallFront(ctx, gTile, px, faceY, tsR, drop);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.2 + (elev - ne) * 0.05})`;
    ctx.fillRect(
      px,
      faceY,
      tsR,
      Math.min(drop, Math.max(2, Math.round(drop * 0.32))),
    );
  };

  const paintConnectorCell = (x: number, y: number): boolean => {
    const gi = y * map.width + x;
    if (heightAt(map, x, y) >= 1 || (col?.[gi] ?? 0) > 0) return false;
    const gTile = tileOf(ground?.[gi] ?? 1);
    const dir = gTile?.stair ?? gTile?.ramp;
    if (!dir || !gTile) return false;
    const band = connectorElevBand(map, tileset, x, y);
    if (!band) return false;
    const story = Math.max(1, band.high - band.low);
    const storyH = Math.round(story * wallH);
    if (storyH <= 0) return false;
    const pLow = projectCell(mode, map, x, y, band.low, scale);
    const color =
      gTile.color && gTile.color !== "#00000000" ? gTile.color : "#7a6a50";
    paintStairExtrusion(
      ctx,
      Math.round(pLow.px),
      Math.round(pLow.py),
      tsR,
      storyH,
      sideVisualStairDir(mode, dir),
      color,
    );
    if (opts?.showElevation) {
      ctx.fillStyle = "rgba(220, 230, 255, 0.85)";
      ctx.font = `${Math.max(8, 7 * scale)}px sans-serif`;
      ctx.fillText(
        String(elevationAt(map, x, y)),
        Math.round(pLow.px) + 2,
        Math.round(pLow.py) - storyH + Math.max(10, 9 * scale),
      );
    }
    return true;
  };

  const light = resolveMapLight(map);
  const { lit } = computeLitSurfaces(map, tileset, opts?.sprites);
  const floorGlow = litSurfacesToFloorGlow(lit);
  const ambientCss = rgbaFromHex(light.ambientColor, light.ambientAlpha, {
    r: 8,
    g: 6,
    b: 20,
  });

  /** Glow after ambient; depth order so nearer floors occlude far washes. */
  const paintFloorGlowAt = (
    target: CanvasRenderingContext2D,
    x: number,
    y: number,
  ) => {
    if (isSolidAt(map, tileset, x, y)) return;
    if (connectorDirAt(map, tileset, x, y)) return;
    const cell = floorGlow.get(`${x},${y}`);
    if (!cell) return;
    const elev = elevationAt(map, x, y);
    const p = projectCell(mode, map, x, y, elev, scale);
    let h = tsR;
    const nx = x + camDx;
    const ny = y + camDy;
    if (
      nx >= 0 &&
      nx < map.width &&
      ny >= 0 &&
      ny < map.height &&
      isSolidAt(map, tileset, nx, ny)
    ) {
      const levels = Math.max(1, heightAt(map, nx, ny) || 1);
      h = Math.max(0, tsR - Math.round(wallH * levels));
    }
    if (h <= 0) return;
    const a = lanternFloorWashAlpha(light, cell.strength);
    if (a < 0.005) return;
    const rgb = parseHexRgb(cell.lampColor) ?? { r: 255, g: 170, b: 70 };
    target.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
    target.fillRect(Math.round(p.px), Math.round(p.py), tsR, h);
  };

  const paintStairGlowAt = (x: number, y: number) => {
    if (isSolidAt(map, tileset, x, y)) return;
    const conn = connectorDirAt(map, tileset, x, y);
    if (!conn) return;
    const band = connectorElevBand(map, tileset, x, y);
    if (!band) return;
    const gTile = tileOf(ground?.[y * map.width + x] ?? 1);
    if (!gTile) return;
    const washFill = (c: { strength: number; lampColor: string }): string => {
      const a = lanternFloorWashAlpha(light, c.strength);
      const rgb = parseHexRgb(c.lampColor) ?? { r: 255, g: 170, b: 70 };
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
    };
    const tread = lit.get(`tread:${x},${y}`);
    let lowFill = "rgba(0,0,0,0)";
    let highFill = "rgba(0,0,0,0)";
    let lowSpill = false;
    let hasWash = false;
    if (tread && tread.kind === "tread") {
      const fill = washFill(tread);
      const modeWash = tread.treadMode ?? "full";
      if (modeWash === "full") {
        lowFill = fill;
        highFill = fill;
        hasWash = true;
      } else if (modeWash === "highSoft") {
        highFill = fill;
        hasWash = true;
      } else {
        lowFill = fill;
        lowSpill = true;
        hasWash = true;
      }
    }
    const story = Math.max(1, band.high - band.low);
    const storyH = Math.round(story * wallH);
    if (storyH <= 0) return;
    const visDir = sideVisualStairDir(mode, conn);
    const pLow = projectCell(mode, map, x, y, band.low, scale);
    const s = tsR;
    const sh = Math.max(1, storyH);
    const tmp = document.createElement("canvas");
    tmp.width = s;
    tmp.height = sh + s;
    const tctx = tmp.getContext("2d");
    if (!tctx) return;
    tctx.imageSmoothingEnabled = false;
    const color =
      gTile.color && gTile.color !== "#00000000" ? gTile.color : "#7a6a50";
    paintStairExtrusion(tctx, 0, sh, s, sh, visDir, color);
    tctx.globalCompositeOperation = "source-atop";
    tctx.fillStyle = ambientCss;
    tctx.fillRect(0, 0, tmp.width, tmp.height);
    if (hasWash) {
      paintStairLanternWashClipped(
        tctx,
        0,
        sh,
        s,
        sh,
        visDir,
        lowFill,
        highFill,
        { lowSpill },
      );
    }
    tctx.globalCompositeOperation = "source-over";
    ctx.drawImage(tmp, Math.round(pLow.px), Math.round(pLow.py) - sh);
  };

  const paintWallAt = (x: number, y: number, elev: number) => {
    const h = heightAt(map, x, y);
    if (h < 1 && (col?.[y * map.width + x] ?? 0) <= 0) return;
    const levels = Math.max(1, h || 1);
    const p = projectCell(mode, map, x, y, elev, scale);
    const gTile = tileOf(ground?.[y * map.width + x] ?? 2);
    const topColor = opts?.showCollision
      ? "#e07050"
      : gTile?.material === "wood"
        ? "#6a4a28"
        : gTile?.color && gTile.color !== "#00000000"
          ? gTile.color
          : "#5a4a40";
    const raise = wallH * levels;
    const ox = Math.floor(p.px);
    const oy = Math.floor(p.py - raise);
    const lw = Math.ceil(ts) + 2;
    const lh = Math.ceil(ts + raise) + 2;
    const layer = document.createElement("canvas");
    layer.width = Math.max(1, lw);
    layer.height = Math.max(1, lh);
    const lctx = layer.getContext("2d");
    if (!lctx) {
      if (opts?.showCollision) ctx.globalAlpha = 0.9;
      fillExtrudedWall(
        ctx,
        p.px,
        p.py,
        ts,
        raise,
        topColor,
        opts?.showCollision ? undefined : (gTile ?? tileOf(2)),
      );
      if (opts?.showCollision) ctx.globalAlpha = 1;
      return;
    }
    lctx.imageSmoothingEnabled = false;
    if (opts?.showCollision) lctx.globalAlpha = 0.9;
    fillExtrudedWall(
      lctx,
      p.px - ox,
      p.py - oy,
      ts,
      raise,
      topColor,
      opts?.showCollision ? undefined : (gTile ?? tileOf(2)),
    );
    if (opts?.showCollision) lctx.globalAlpha = 1;
    // Bake night onto the wall only so a second wall pass can occlude far lamps
    // without undoing the full-canvas ambient on floors behind.
    lctx.globalCompositeOperation = "source-atop";
    lctx.fillStyle = ambientCss;
    lctx.fillRect(0, 0, layer.width, layer.height);
    lctx.globalCompositeOperation = "source-over";
    ctx.drawImage(layer, ox, oy);
  };

  for (const { x, y, elev } of cells) {
    const gi = y * map.width + x;
    if (heightAt(map, x, y) >= 1 || (col?.[gi] ?? 0) > 0) continue;
    if (paintConnectorCell(x, y)) continue;
    if (elev > 0) blitElevatedTop(x, y, elev);
    paintCliffForCell(x, y, elev);
  }

  // Night over floors/cliffs first; lanterns + occluding walls/props follow.
  ctx.fillStyle = ambientCss;
  ctx.fillRect(0, 0, width, height);

  const emissive =
    light.bloomStrength > 0 ? createEmissiveBuffer(width, height) : null;

  for (const { x, y } of cells) {
    paintFloorGlowAt(ctx, x, y);
  }

  // Soft bloom field (not hard rect copies) — painted once for the whole view.
  if (emissive) {
    paintLanternBloomField(
      emissive.ctx,
      map,
      tileset,
      scale,
      0,
      floorGlow,
      opts?.sprites,
    );
    paintMapEmissiveField(emissive.ctx, map, tileset, {
      sprites: opts?.sprites,
      scale,
      originY: 0,
      timeSec: 0,
      mode: "bloom",
    });
  }

  // Walls after floor glow (near walls occlude far washes) with night baked in.
  for (const { x, y, elev } of cells) {
    paintWallAt(x, y, elev);
  }

  // Stairs after walls so extrusion occludes wall/cliff shine-through.
  for (const { x, y } of cells) {
    paintStairGlowAt(x, y);
  }

  const sprLib = opts?.sprites;
  if (sprLib && map.sprites?.length) {
    const sortedSpr = [...map.sprites].sort((a, b) => {
      const da = projectCell(
        mode,
        map,
        a.x,
        a.y,
        elevationAt(map, a.x, a.y),
        scale,
      ).depth;
      const db = projectCell(
        mode,
        map,
        b.x,
        b.y,
        elevationAt(map, b.x, b.y),
        scale,
      ).depth;
      return da - db;
    });
    for (const place of sortedSpr) {
      const spr = sprLib[place.spriteId];
      if (!spr) continue;
      const elev = elevationAt(map, place.x, place.y);
      const p = projectCell(mode, map, place.x, place.y, elev, scale);
      const floorX = Math.round(p.px);
      const floorY = Math.round(p.py);
      const tintOpts: LanternSpriteTintOpts = {
        cell: pickSpriteLampCell(floorGlow, place.x, place.y, elev),
        glow: floorGlow,
        placeX: place.x,
        placeY: place.y,
        placeElev: elev,
        tileArtSize: map.tileSize,
      };
      const { cx, top, stackW, stackH } = paintMapSpriteOccludingGlow(
        ctx,
        spr,
        floorX,
        floorY,
        tsR,
        scale,
        light,
        tintOpts,
        ambientCss,
      );
      const spriteCollider = resolveSpriteInstanceCollider(place, spr);
      if (
        opts?.showCollision &&
        spriteCollider.enabled &&
        spriteCollider.blocksMovement &&
        !spriteCollider.isTrigger
      ) {
        ctx.fillStyle = "rgba(224, 112, 80, 0.35)";
        ctx.strokeStyle = "rgba(255, 140, 100, 0.85)";
        ctx.lineWidth = Math.max(1, scale);
        ctx.fillRect(cx - stackW / 2, top, stackW, stackH);
        ctx.strokeRect(
          cx - stackW / 2 + 0.5,
          top + 0.5,
          stackW - 1,
          stackH - 1,
        );
      }
    }
  }

  if (emissive && light.bloomStrength > 0) {
    applyLanternBloom(ctx, emissive.canvas, {
      strength: light.bloomStrength,
    });
  }
  {
    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    paintMapEmissiveField(ctx, map, tileset, {
      sprites: opts?.sprites,
      scale,
      originY: 0,
      timeSec: 0,
      mode: emissive ? "crisp" : "both",
    });
    ctx.globalCompositeOperation = prevComp;
  }

  if (opts?.showRegions) {
    const isWallAt = (tx: number, ty: number) =>
      heightAt(map, tx, ty) >= 1 || (col?.[(ty * map.width + tx) | 0] ?? 0) > 0;
    for (const r of map.regions) {
      const color =
        r.kind === "player_start"
          ? "#66ff66"
          : r.kind === "spawn"
            ? "#ff8866"
            : r.kind === "chest"
              ? "#ffcc66"
              : r.kind === "teleport"
                ? "#e0a0ff"
                : "#88aaff";
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, scale);
      if (r.kind === "camera_bound") {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < r.w; i++) {
          for (let j = 0; j < r.h; j++) {
            const p = projectCell(mode, map, r.x + i, r.y + j, 0, scale);
            minX = Math.min(minX, p.px);
            minY = Math.min(minY, p.py);
            maxX = Math.max(maxX, p.px + p.ts);
            maxY = Math.max(maxY, p.py + p.ts);
          }
        }
        if (Number.isFinite(minX)) {
          ctx.strokeRect(
            minX + 0.5,
            minY + 0.5,
            maxX - minX - 1,
            maxY - minY - 1,
          );
        }
      } else {
        for (let i = 0; i < r.w; i++) {
          for (let j = 0; j < r.h; j++) {
            const tx = r.x + i;
            const ty = r.y + j;
            if (isWallAt(tx, ty)) continue;
            const elev = elevationAt(map, tx, ty);
            const p = projectCell(mode, map, tx, ty, elev, scale);
            ctx.strokeRect(p.px + 0.5, p.py + 0.5, p.ts - 1, p.ts - 1);
          }
        }
      }
      const label = projectCell(mode, map, r.x, r.y, 0, scale);
      ctx.fillStyle = color;
      ctx.font = `${Math.max(10, 9 * scale)}px sans-serif`;
      ctx.fillText(
        r.id,
        label.px + 2,
        label.py + Math.max(12, 10 * scale),
      );
    }
  }

  applyMapColorGrade(ctx, width, height, light.grade);
}

export function createEmptyMap(
  id: string,
  width: number,
  height: number,
  tilesetId: string,
  tileSize = 16,
): EmberMap {
  const n = width * height;
  const ground = new Array<number>(n).fill(1);
  const decor = new Array<number>(n).fill(0);
  const collision = new Array<number>(n).fill(0);
  const heightL = new Array<number>(n).fill(0);
  const elevationL = new Array<number>(n).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        const i = y * width + x;
        ground[i] = 2;
        collision[i] = 1;
        heightL[i] = tileSize;
      }
    }
  }
  const cx = Math.floor(width / 2) - 1;
  const cy = Math.floor(height / 2) - 1;
  return {
    id,
    nameRu: id,
    tileSize,
    width,
    height,
    tilesetId,
    worldPhysicsVersion: 2,
    terrainHeightUnit: "voxels",
    layers: [
      { name: "ground", type: "tile", data: ground },
      { name: "decor", type: "tile", data: decor },
      { name: "collision", type: "tile", data: collision },
      { name: "height", type: "tile", data: heightL },
      { name: "elevation", type: "tile", data: elevationL },
    ],
    regions: [
      {
        id: "start",
        kind: "player_start",
        x: cx,
        y: cy,
        w: 2,
        h: 2,
      },
    ],
  };
}
