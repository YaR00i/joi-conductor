import type {
  EmberMap,
  EmberPack,
  EmberTileset,
} from "../../../game/content/types";
import { clampElevation } from "../../../game/content/types";
import { elevTileIdAt, tileSurfaceElev } from "../../../game/tile/mapUtils";
import type { MapLibPayload } from "./MapLibraryTray";

export type MapLibraryPlacementCheck =
  | { valid: true; reason: null }
  | { valid: false; reason: string };

type TilePos = { x: number; y: number };

export type MapLibraryPlacementMode = "surface" | "floor" | "grid";

export type MapLibraryPlacementTarget = TilePos & { elev: number };

/**
 * Lights always drop to the column top. Regions treat "surface" as the
 * locked brush plane — iso camera hits the ceiling first, same as blocks.
 */
export function effectiveMapLibraryPlacementMode(
  payloadKind: MapLibPayload["kind"] | undefined,
  requested: MapLibraryPlacementMode,
): MapLibraryPlacementMode {
  if (payloadKind === "light") return "floor";
  if (payloadKind === "region" && requested === "surface") return "grid";
  return requested;
}

/**
 * Resolves one authoritative target shared by ghost, validation and commit.
 * Surface uses the exact face raycast, floor drops vertically onto authored
 * terrain, and grid keeps the current editor Z plane.
 */
export function resolveMapLibraryPlacementTarget(
  map: EmberMap,
  mode: MapLibraryPlacementMode,
  tile: TilePos | null,
  surface: MapLibraryPlacementTarget | null,
  gridElev: number,
): MapLibraryPlacementTarget | null {
  if (mode === "surface" && surface) {
    return { ...surface, elev: clampElevation(surface.elev) };
  }
  const base = tile ?? surface;
  if (!base) return null;
  return {
    x: base.x,
    y: base.y,
    elev:
      mode === "grid"
        ? clampElevation(gridElev)
        : tileSurfaceElev(map, base.x, base.y),
  };
}

/**
 * One validation gate shared by hover ghost, click-place and HTML5 drop.
 * It deliberately permits different objects on the same cell: Ember's world
 * is a scene, not a single-value tile slot. Only an exact accidental duplicate
 * is rejected.
 */
export function checkMapLibraryPlacement(
  payload: MapLibPayload,
  tile: MapLibraryPlacementTarget,
  map: EmberMap,
  pack: EmberPack,
  tileset: EmberTileset | undefined,
): MapLibraryPlacementCheck {
  if (
    tile.x < 0 ||
    tile.y < 0 ||
    tile.x >= map.width ||
    tile.y >= map.height
  ) {
    return { valid: false, reason: "Позиция находится за границей карты" };
  }

  switch (payload.kind) {
    case "sprite":
      if (!pack.sprites[payload.spriteId]) {
        return { valid: false, reason: "Спрайт отсутствует в паке" };
      }
      if (
        (map.sprites ?? []).some(
          (p) =>
            p.spriteId === payload.spriteId &&
            p.x === tile.x &&
            p.y === tile.y &&
            Math.abs(
              (p.elev ?? tileSurfaceElev(map, p.x, p.y)) - tile.elev,
            ) < 0.001,
        )
      ) {
        return { valid: false, reason: "Такой спрайт уже стоит в этой позиции" };
      }
      return { valid: true, reason: null };

    case "voxel":
      if (!pack.voxelModels[payload.modelId]) {
        return { valid: false, reason: "Воксельная модель отсутствует в паке" };
      }
      if (
        (map.voxelProps ?? []).some(
          (p) =>
            p.modelId === payload.modelId &&
            p.x === tile.x &&
            p.y === tile.y &&
            Math.abs(
              (p.elev ?? tileSurfaceElev(map, p.x, p.y)) - tile.elev,
            ) < 0.001,
        )
      ) {
        return { valid: false, reason: "Такой объект уже стоит в этой позиции" };
      }
      return { valid: true, reason: null };

    case "light":
      if (
        (map.lights ?? []).some(
          (light) => light.x === tile.x && light.y === tile.y,
        )
      ) {
        return { valid: false, reason: "В этой клетке уже есть источник света" };
      }
      return { valid: true, reason: null };

    case "region":
      return { valid: true, reason: null };

    case "tile":
      if (!tileset?.tiles.some((candidate) => candidate.id === payload.tileId)) {
        return { valid: false, reason: "Тайл отсутствует в тайлсете карты" };
      }
      if (elevTileIdAt(map, tile.x, tile.y, tile.elev) === payload.tileId) {
        return {
          valid: false,
          reason: `Этот блок уже стоит на Z${tile.elev}`,
        };
      }
      return { valid: true, reason: null };

    default: {
      const exhaustive: never = payload;
      return exhaustive;
    }
  }
}
