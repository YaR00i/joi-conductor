import type {
  EmberMap,
  EmberPixelSprite,
  EmberTileset,
  EmberVoxelModel,
  EmberVoxelPlacement,
} from "../content/types";
import { elevationSteps } from "../content/types";
import { elevTileIdAt } from "../tile/elevGroundLayers";
import {
  listLanternSources,
  regionVolumeElev,
  tileSurfaceElev,
} from "../tile/mapUtils";
import { footprintTilesFromVoxelModel } from "../voxel/voxelModelApply";
import type { EditorSelectionFilter } from "./EditorSelectionFilter";
import { includeRegionInViewportPick } from "./EditorSelectionFilter";

export type PlanarMarqueeTilePos = Readonly<{ x: number; y: number }>;

export type PlanarMarqueeRect = Readonly<{
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}>;

export type PlanarMarqueeSelection =
  | { kind: "voxel"; id: string }
  | { kind: "sprite"; id: string }
  | { kind: "light"; id: string }
  | { kind: "region"; id: string }
  | { kind: "tile"; tx: number; ty: number; elev: number };

export type PlanarMarqueeMark = PlanarMarqueeRect &
  Readonly<{
    elev: number;
    elevEnd?: number;
  }>;

type SpriteLib = Readonly<Record<string, EmberPixelSprite>>;

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizePlanarMarqueeRect(
  start: PlanarMarqueeTilePos,
  end: PlanarMarqueeTilePos,
  map: Pick<EmberMap, "width" | "height">,
): PlanarMarqueeRect {
  const maxX = Math.max(0, map.width - 1);
  const maxY = Math.max(0, map.height - 1);
  const x0 = clampInt(Math.min(start.x, end.x), 0, maxX);
  const y0 = clampInt(Math.min(start.y, end.y), 0, maxY);
  const x1 = clampInt(Math.max(start.x, end.x), 0, maxX);
  const y1 = clampInt(Math.max(start.y, end.y), 0, maxY);
  return { x0, y0, x1, y1 };
}

function tileRectsOverlap(
  left: PlanarMarqueeRect,
  right: PlanarMarqueeRect,
): boolean {
  return (
    left.x0 <= right.x1 &&
    left.x1 >= right.x0 &&
    left.y0 <= right.y1 &&
    left.y1 >= right.y0
  );
}

function storyMatchesPlane(resolvedZ: number, elev: number): boolean {
  return Math.floor(resolvedZ + 1e-6) === elev;
}

function voxelPlacementTileRect(
  place: EmberVoxelPlacement,
  model: EmberVoxelModel | undefined,
): PlanarMarqueeRect {
  const footprint = model
    ? footprintTilesFromVoxelModel(model)
    : { w: 1, h: 1 };
  const rot = ((place.rot ?? 0) % 4 + 4) % 4;
  const w = rot % 2 === 0 ? footprint.w : footprint.h;
  const h = rot % 2 === 0 ? footprint.h : footprint.w;
  return {
    x0: place.x,
    y0: place.y,
    x1: place.x + Math.max(1, w) - 1,
    y1: place.y + Math.max(1, h) - 1,
  };
}

/**
 * Everything whose tile footprint intersects the dragged rect.
 *
 * `elev` forces one story. `elevRange` creates the editor's normal coordinate
 * volume between the two visible drag surfaces. Omitting both is retained for
 * callers that intentionally need every story under X/Y. Hidden / locked
 * viewport objects are skipped, matching click-select.
 */
export function collectPlanarMarqueeHits(input: {
  map: EmberMap;
  start: PlanarMarqueeTilePos;
  end: PlanarMarqueeTilePos;
  elev?: number;
  elevRange?: Readonly<{ min: number; max: number }>;
  filter: Readonly<EditorSelectionFilter>;
  voxelModels?: Readonly<Record<string, EmberVoxelModel>> | null;
  tileset?: EmberTileset | null;
  sprites?: SpriteLib | null;
  isHidden?: (key: string) => boolean;
  isLocked?: (key: string) => boolean;
}): PlanarMarqueeSelection[] {
  const rect = normalizePlanarMarqueeRect(input.start, input.end, input.map);
  const elev = input.elev;
  const elevRange = input.elevRange
    ? {
        min: Math.min(input.elevRange.min, input.elevRange.max),
        max: Math.max(input.elevRange.min, input.elevRange.max),
      }
    : null;
  const hidden = input.isHidden ?? (() => false);
  const locked = input.isLocked ?? (() => false);
  const hits: PlanarMarqueeSelection[] = [];

  const storyAllowed = (resolvedZ: number) => {
    if (elev != null) return storyMatchesPlane(resolvedZ, elev);
    if (!elevRange) return true;
    const story = Math.floor(resolvedZ + 1e-6);
    return story >= elevRange.min && story <= elevRange.max;
  };

  const skip = (kind: PlanarMarqueeSelection["kind"], id?: string) => {
    if (!input.filter[kind === "tile" ? "tile" : kind]) return true;
    if (id == null) return false;
    const key = `${kind}:${id}`;
    return hidden(key) || locked(key);
  };

  if (input.filter.voxel) {
    for (const place of input.map.voxelProps ?? []) {
      if (skip("voxel", place.id)) continue;
      const resolvedZ = place.elev ?? tileSurfaceElev(input.map, place.x, place.y);
      if (!storyAllowed(resolvedZ)) continue;
      const model = input.voxelModels?.[place.modelId];
      if (!tileRectsOverlap(rect, voxelPlacementTileRect(place, model))) {
        continue;
      }
      hits.push({ kind: "voxel", id: place.id });
    }
  }

  if (input.filter.sprite) {
    for (const place of input.map.sprites ?? []) {
      if (skip("sprite", place.id)) continue;
      const resolvedZ = place.elev ?? tileSurfaceElev(input.map, place.x, place.y);
      if (!storyAllowed(resolvedZ)) continue;
      if (
        !tileRectsOverlap(rect, {
          x0: place.x,
          y0: place.y,
          x1: place.x,
          y1: place.y,
        })
      ) {
        continue;
      }
      hits.push({ kind: "sprite", id: place.id });
    }
  }

  if (input.filter.light) {
    const lamps: ReadonlyArray<{
      id: string;
      x: number;
      y: number;
      elev?: number;
    }> = input.tileset
      ? listLanternSources(input.map, input.tileset, input.sprites ?? undefined)
      : (input.map.lights ?? [])
          .filter((light) => light.enabled !== false)
          .map((light) => ({
            id: light.id,
            x: light.x,
            y: light.y,
          }));
    for (const lamp of lamps) {
      if (skip("light", lamp.id)) continue;
      const resolvedZ =
        lamp.elev ?? tileSurfaceElev(input.map, lamp.x, lamp.y);
      if (!storyAllowed(resolvedZ)) continue;
      if (
        !tileRectsOverlap(rect, {
          x0: lamp.x,
          y0: lamp.y,
          x1: lamp.x,
          y1: lamp.y,
        })
      ) {
        continue;
      }
      hits.push({ kind: "light", id: lamp.id });
    }
  }

  if (input.filter.region) {
    for (const region of input.map.regions) {
      if (!includeRegionInViewportPick(region.kind)) continue;
      if (skip("region", region.id)) continue;
      if (!storyAllowed(regionVolumeElev(input.map, region))) continue;
      const w = Math.max(1, region.w);
      const h = Math.max(1, region.h);
      if (
        !tileRectsOverlap(rect, {
          x0: region.x,
          y0: region.y,
          x1: region.x + w - 1,
          y1: region.y + h - 1,
        })
      ) {
        continue;
      }
      hits.push({ kind: "region", id: region.id });
    }
  }

  if (input.filter.tile) {
    const elevations =
      elev != null
        ? [elev]
        : elevRange
          ? elevationSteps().filter(
              (story) => story >= elevRange.min && story <= elevRange.max,
            )
          : elevationSteps();
    for (let ty = rect.y0; ty <= rect.y1; ty++) {
      for (let tx = rect.x0; tx <= rect.x1; tx++) {
        for (const story of elevations) {
          if (!elevTileIdAt(input.map, tx, ty, story)) continue;
          hits.push({ kind: "tile", tx, ty, elev: story });
        }
      }
    }
  }

  return hits;
}
