/**
 * World pose for a chest region's voxel model (editor preview + play).
 * Zone footprint (`x,y,w,h`) stays independent of visual offset / rot / elev.
 */
import type { EmberMap, EmberMapRegion } from "../content/types";
import {
  elevationAt,
  regionCenter,
  tileSurfaceElev,
  worldToTile,
} from "../tile/mapUtils";
import { normalizeVoxelRot } from "./voxelPlacement";

export type ChestModelPose = {
  /** World X (logic / Three X). */
  x: number;
  /** World Y on map plane (Three Z). */
  y: number;
  elev: number;
  /** Surface elev under the model (for UI hints). */
  surfaceElev: number;
  /** Floor elev of the anchor tile. */
  floorElev: number;
  /** Anchor tile under the model. */
  tx: number;
  ty: number;
  rot: number;
  scale: number;
  directLightScale: number | undefined;
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function clampChestModelScale(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return 1;
  return clamp(raw, 0.25, 3);
}

export function clampChestModelOffset(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return 0;
  return clamp(raw, -4, 4);
}

export function resolveChestModelPose(
  map: EmberMap,
  region: EmberMapRegion,
): ChestModelPose {
  const center = regionCenter(map, region);
  const ox = clampChestModelOffset(region.modelOffsetX) * map.tileSize;
  const oy = clampChestModelOffset(region.modelOffsetY) * map.tileSize;
  const x = center.x + ox;
  const y = center.y + oy;
  const { tx, ty } = worldToTile(map, x, y);
  const ctx = Math.min(map.width - 1, Math.max(0, tx));
  const cty = Math.min(map.height - 1, Math.max(0, ty));
  const floorElev = elevationAt(map, ctx, cty);
  const surfaceElev = tileSurfaceElev(map, ctx, cty);
  const elev =
    region.modelElev != null && Number.isFinite(region.modelElev)
      ? clamp(Math.round(region.modelElev), 0, 8)
      : surfaceElev;
  return {
    x,
    y,
    elev,
    surfaceElev,
    floorElev,
    tx: ctx,
    ty: cty,
    rot: normalizeVoxelRot(region.modelRot),
    scale: clampChestModelScale(region.modelScale),
    directLightScale: region.modelDirectLightScale,
  };
}
