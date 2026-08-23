/**
 * Shared map-change arrival: trigger `targetMapId` + spawn on the dest map.
 * Used by exploreSim and play. Same pack maps — no second world format.
 */
import type { EmberMap, EmberMapRegion } from "./types";
import {
  ensureMapLayers,
  findRegions,
  pointInRegion,
  regionCenter,
  regionVolumeElev,
  tileSurfaceElev,
} from "../tile/mapUtils";
import type { InteractivityWouldFire } from "./interactivity";

export const MAP_CHANGE_COOLDOWN = 0.45;

export type MapChangeRequest = {
  targetMapId: string;
  targetRegionId: string | null;
  targetX?: number | null;
  targetY?: number | null;
  targetElevation?: number | null;
};

export type MapChangeArrival = {
  map: EmberMap;
  mapId: string;
  x: number;
  y: number;
  elev: number;
  regionId: string | null;
  occupyId: string | null;
};

function optionalText(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text || null;
}

export function mapChangeRequestFromRegion(
  region: EmberMapRegion,
): MapChangeRequest | null {
  const targetMapId = optionalText(region.targetMapId);
  if (!targetMapId) return null;
  return {
    targetMapId,
    targetRegionId: optionalText(region.targetRegionId),
    targetX: region.targetX,
    targetY: region.targetY,
    targetElevation: region.targetElevation,
  };
}

export function mapChangeRequestFromWouldFire(
  wouldFire: InteractivityWouldFire,
  source?: EmberMapRegion | null,
): MapChangeRequest | null {
  if (wouldFire.action !== "change_map") return null;
  return {
    targetMapId: wouldFire.targetMapId,
    targetRegionId: wouldFire.targetRegionId,
    targetX: source?.targetX,
    targetY: source?.targetY,
    targetElevation: source?.targetElevation,
  };
}

function spawnRegionOn(map: EmberMap, id: string | null): EmberMapRegion | null {
  if (!id) return null;
  return map.regions.find((region) => region.id === id) ?? null;
}

function defaultSpawnRegion(map: EmberMap): EmberMapRegion | null {
  return findRegions(map, "player_start")[0] ?? findRegions(map, "spawn")[0] ?? null;
}

function occupyIdAt(
  map: EmberMap,
  x: number,
  y: number,
  elev?: number,
): string | null {
  const trigger = findRegions(map, "trigger").find((region) =>
    pointInRegion(map, region, x, y, elev),
  );
  if (trigger) return trigger.id;
  const pad = findRegions(map, "teleport").find((region) =>
    pointInRegion(map, region, x, y, elev),
  );
  return pad?.id ?? null;
}

/**
 * Resolve where the player lands on the destination map.
 * Priority: targetRegionId → targetX/Y → player_start / spawn.
 */
export function resolveMapChangeArrival(
  maps: Record<string, EmberMap | undefined>,
  request: MapChangeRequest,
): MapChangeArrival | null {
  const raw = maps[request.targetMapId];
  if (!raw) return null;
  const map = ensureMapLayers(raw);
  const named = spawnRegionOn(map, request.targetRegionId);
  const fallback = named ? null : defaultSpawnRegion(map);
  const region = named ?? fallback;
  const ts = map.tileSize;
  let x: number;
  let y: number;
  let elev: number;
  let regionId: string | null = region?.id ?? null;

  if (named) {
    const c = regionCenter(map, named);
    x = c.x;
    y = c.y;
    elev = request.targetElevation ?? regionVolumeElev(map, named);
  } else if (request.targetX != null && request.targetY != null) {
    const tx = request.targetX;
    const ty = request.targetY;
    x = tx * ts + ts / 2;
    y = ty * ts + ts / 2;
    elev =
      request.targetElevation ?? tileSurfaceElev(map, tx, ty);
    regionId = occupyIdAt(map, x, y, elev);
  } else if (fallback) {
    const c = regionCenter(map, fallback);
    x = c.x;
    y = c.y;
    elev =
      request.targetElevation ?? regionVolumeElev(map, fallback);
  } else {
    return null;
  }

  return {
    map,
    mapId: map.id,
    x,
    y,
    elev,
    regionId,
    occupyId: occupyIdAt(map, x, y, elev),
  };
}
