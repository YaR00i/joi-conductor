import type { EmberMap, EmberMapRegion, MapRegionKind } from "../../../game/content/types";
import { clampElevation } from "../../../game/content/types";

export const MAP_REGION_KIND_ORDER: MapRegionKind[] = [
  "player_start",
  "spawn",
  "chest",
  "teleport",
  "trigger",
  "camera_bound",
  "npc_idle",
  "npc_wander",
];

export const MAP_REGION_KIND_LABEL: Record<MapRegionKind, string> = {
  player_start: "Старт",
  spawn: "Спавн",
  chest: "Сундук",
  teleport: "Телепорт",
  trigger: "Триггер",
  /** Editor overlay only — not enforced in gameplay yet. */
  camera_bound: "Камера",
  npc_idle: "NPC стоит",
  npc_wander: "NPC гуляет",
};

export const MAP_REGION_KIND_HINT: Record<MapRegionKind, string> = {
  player_start: "Где появляется игрок",
  spawn: "Волны врагов · только арена",
  chest: "Тайник: F открывает. Лут — id из каталога Предметы.",
  teleport: "Поставь два и свяжи в инспекторе",
  trigger: "Вход запускает событие сцены",
  camera_bound: "Рамка камеры в редакторе, в игре пока нет",
  npc_idle: "Стоячий NPC · нужен спрайт",
  npc_wander: "Гуляющий NPC · нужен спрайт, кап 24",
};

export const MAP_REGION_KIND_COLOR: Record<MapRegionKind, string> = {
  player_start: "#66ff66",
  spawn: "#ff8866",
  chest: "#ffcc66",
  teleport: "#e0a0ff",
  trigger: "#88aaff",
  camera_bound: "#88aaff",
  npc_idle: "#9ad4ff",
  npc_wander: "#7ec8e8",
};

export function newRegionId(
  regions: EmberMapRegion[],
  kind: MapRegionKind,
): string {
  const base =
    kind === "player_start"
      ? "start"
      : kind === "camera_bound"
        ? "bound"
        : kind;
  if (!regions.some((r) => r.id === base)) return base;
  let n = 2;
  while (regions.some((r) => r.id === `${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

/** Default footprint for a new region of the given kind. */
export function defaultRegionSize(kind: MapRegionKind): { w: number; h: number } {
  if (kind === "chest" || kind === "teleport" || kind === "player_start") {
    return { w: 1, h: 1 };
  }
  if (kind === "npc_idle") return { w: 1, h: 1 };
  if (kind === "npc_wander") return { w: 4, h: 4 };
  if (kind === "camera_bound") return { w: 6, h: 6 };
  if (kind === "trigger") return { w: 2, h: 2 };
  return { w: 2, h: 2 };
}

export function clampRegionOrigin(
  x: number,
  y: number,
  w: number,
  h: number,
  mapWidth: number,
  mapHeight: number,
): { x: number; y: number } {
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  return {
    x: Math.max(0, Math.min(Math.round(x), Math.max(0, mapWidth - width))),
    y: Math.max(0, Math.min(Math.round(y), Math.max(0, mapHeight - height))),
  };
}

/**
 * Gizmo / AABB center in tile space: NW origin + half size.
 * Even widths land on half-tiles (e.g. 2×2 at (4,5) → center 5, 6).
 */
export function regionFootprintCenter(region: EmberMapRegion): {
  cx: number;
  cy: number;
} {
  return {
    cx: region.x + region.w / 2,
    cy: region.y + region.h / 2,
  };
}

/** Move a region so its AABB center sits on (cx, cy). Origin stays integer. */
export function regionOriginFromCenter(
  region: EmberMapRegion,
  cx: number,
  cy: number,
  mapWidth: number,
  mapHeight: number,
): { x: number; y: number } {
  return clampRegionOrigin(
    cx - region.w / 2,
    cy - region.h / 2,
    region.w,
    region.h,
    mapWidth,
    mapHeight,
  );
}

/** Fingerprint of zone rectangles — editor debug overlay invalidation. */
export function regionsLayoutSignature(
  regions: readonly EmberMapRegion[] | undefined,
): string {
  if (!regions?.length) return "";
  return regions
    .map(
      (region) =>
        `${region.id}:${region.kind}:${region.x},${region.y},${region.w}x${region.h}@${region.elev ?? ""}`,
    )
    .join("|");
}

/** Build a region anchored at tile (x, y), clamped to the map. */
export function makeRegionAt(
  map: EmberMap,
  kind: MapRegionKind,
  x: number,
  y: number,
  elev?: number,
): EmberMapRegion {
  const { w, h } = defaultRegionSize(kind);
  const rx = Math.max(0, Math.min(x, map.width - w));
  const ry = Math.max(0, Math.min(y, map.height - h));
  const id = newRegionId(map.regions, kind);
  const region: EmberMapRegion = {
    id,
    kind,
    x: rx,
    y: ry,
    w,
    h,
  };
  if (elev != null && Number.isFinite(elev)) {
    region.elev = clampElevation(elev);
  }
  if (kind === "spawn") {
    region.group = id;
  }
  if (kind === "teleport") {
    region.note = "Поставь второй телепорт и свяжи пару в инспекторе";
  }
  if (kind === "trigger") {
    // Runtime scripts not wired yet — stub fields for later.
    region.scriptId = "";
    region.note = "Скрипт зоны (заглушка)";
  }
  if (kind === "chest") {
    region.lootIds = ["coin"];
    region.note = "Тайник: F / interact. Лут — id из каталога Предметы.";
  }
  if (kind === "npc_idle" || kind === "npc_wander") {
    region.note =
      kind === "npc_wander"
        ? "Исследование: гуляющий NPC (spriteId)"
        : "Исследование: стоячий NPC (spriteId)";
  }
  return region;
}
