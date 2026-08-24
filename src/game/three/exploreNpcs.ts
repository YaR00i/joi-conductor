import type {
  EmberMap,
  EmberMapRegion,
  EmberPixelSprite,
  EmberSpritePlacement,
} from "../content/types";
import {
  pointInRegion,
  regionCenter,
  regionVolumeElev,
  tileSurfaceElev,
} from "../tile/mapUtils";
import { clampCoordToMap } from "./enemyAiLod";
import { EXPLORE_NPC_CAP } from "./renderBudget";

export type ExploreNpcMode = "idle" | "wander";

export type ExploreNpcWanderBounds = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type ExploreNpcSpawn = {
  spriteId: string;
  x: number;
  y: number;
  elev: number;
  mode: ExploreNpcMode;
  wander?: ExploreNpcWanderBounds;
  placementId?: string;
};

const NPC_WANDER_SPEED = 22;

export function spriteAssetIsNpc(
  sprite: EmberPixelSprite | undefined,
): boolean {
  return Boolean(sprite?.roles?.includes("npc"));
}

export function spritePlacementIsNpc(
  placement: EmberSpritePlacement,
  sprite: EmberPixelSprite | undefined,
): boolean {
  return placement.role === "npc" || spriteAssetIsNpc(sprite);
}

function regionWorldBounds(
  map: EmberMap,
  region: EmberMapRegion,
): ExploreNpcWanderBounds {
  const ts = map.tileSize;
  return {
    x0: region.x * ts,
    y0: region.y * ts,
    x1: (region.x + region.w) * ts,
    y1: (region.y + region.h) * ts,
  };
}

function resolveWanderBounds(
  map: EmberMap,
  region: EmberMapRegion,
): ExploreNpcWanderBounds {
  if (region.wanderRegionId) {
    const named = map.regions.find((item) => item.id === region.wanderRegionId);
    if (named) return regionWorldBounds(map, named);
  }
  return regionWorldBounds(map, region);
}

/**
 * Authored village NPCs: region volumes plus sprite placements tagged npc.
 * Cap is hard — extra authored instances are dropped, not spawned as combat.
 */
export function collectExploreNpcSpawns(
  map: EmberMap,
  sprites: Record<string, EmberPixelSprite>,
  cap = EXPLORE_NPC_CAP,
): ExploreNpcSpawn[] {
  const out: ExploreNpcSpawn[] = [];
  const limit = Math.max(0, Math.floor(cap));

  const push = (spawn: ExploreNpcSpawn): boolean => {
    if (out.length >= limit) return false;
    out.push(spawn);
    return true;
  };

  for (const region of map.regions) {
    if (region.kind !== "npc_idle" && region.kind !== "npc_wander") continue;
    const spriteId = region.spriteId;
    if (!spriteId || !sprites[spriteId]) continue;
    const pos = regionCenter(map, region);
    const mode: ExploreNpcMode =
      region.kind === "npc_wander" ? "wander" : "idle";
    if (
      !push({
        spriteId,
        x: pos.x,
        y: pos.y,
        elev: regionVolumeElev(map, region),
        mode,
        wander: mode === "wander" ? resolveWanderBounds(map, region) : undefined,
      })
    ) {
      return out;
    }
  }

  for (const placement of map.sprites ?? []) {
    const def = sprites[placement.spriteId];
    if (!spritePlacementIsNpc(placement, def)) continue;
    if (!def) continue;
    const x = (placement.x + 0.5) * map.tileSize;
    const y = (placement.y + 0.5) * map.tileSize;
    const elev =
      placement.elev ?? tileSurfaceElev(map, placement.x, placement.y);
    const wanderHost = map.regions.find(
      (region) =>
        region.kind === "npc_wander" &&
        pointInRegion(map, region, x, y, elev),
    );
    if (
      !push({
        spriteId: placement.spriteId,
        x,
        y,
        elev,
        mode: wanderHost ? "wander" : "idle",
        wander: wanderHost ? resolveWanderBounds(map, wanderHost) : undefined,
        placementId: placement.id,
      })
    ) {
      return out;
    }
  }

  return out;
}

export function stepExploreNpcWander(
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  dt: number,
  bounds: ExploreNpcWanderBounds,
  mapWidth: number,
  mapHeight: number,
  tileSize: number,
  radius: number,
  speed = NPC_WANDER_SPEED,
): { x: number; y: number; dirX: number; dirY: number } {
  const len = Math.hypot(dirX, dirY) || 1;
  let nx = dirX / len;
  let ny = dirY / len;
  let nextX = x + nx * speed * dt;
  let nextY = y + ny * speed * dt;
  const pad = Math.max(1, radius);
  const minX = Math.min(bounds.x0, bounds.x1) + pad;
  const maxX = Math.max(bounds.x0, bounds.x1) - pad;
  const minY = Math.min(bounds.y0, bounds.y1) + pad;
  const maxY = Math.max(bounds.y0, bounds.y1) - pad;
  if (minX >= maxX || minY >= maxY) {
    const cx = (bounds.x0 + bounds.x1) / 2;
    const cy = (bounds.y0 + bounds.y1) / 2;
    return {
      x: clampCoordToMap(cx, radius, mapWidth, tileSize),
      y: clampCoordToMap(cy, radius, mapHeight, tileSize),
      dirX: nx,
      dirY: ny,
    };
  }
  if (nextX < minX) {
    nextX = minX;
    nx = Math.abs(nx);
  } else if (nextX > maxX) {
    nextX = maxX;
    nx = -Math.abs(nx);
  }
  if (nextY < minY) {
    nextY = minY;
    ny = Math.abs(ny);
  } else if (nextY > maxY) {
    nextY = maxY;
    ny = -Math.abs(ny);
  }
  return {
    x: clampCoordToMap(nextX, radius, mapWidth, tileSize),
    y: clampCoordToMap(nextY, radius, mapHeight, tileSize),
    dirX: nx,
    dirY: ny,
  };
}
