import type { EmberMap, EmberMapRegion, MapRegionKind } from "../../../game/content/types";

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
  camera_bound: "Кам (оверлей)",
  npc_idle: "NPC стоит",
  npc_wander: "NPC гуляет",
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
  if (kind === "trigger") return { w: 2, h: 2 };
  return { w: 2, h: 2 };
}

/** Build a region anchored at tile (x, y), clamped to the map. */
export function makeRegionAt(
  map: EmberMap,
  kind: MapRegionKind,
  x: number,
  y: number,
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
  if (kind === "spawn") {
    region.group = id;
  }
  if (kind === "teleport") {
    // Validation requires a destination — stub to the placement cell.
    region.targetX = rx;
    region.targetY = ry;
    region.note = "Укажите цель телепорта";
  }
  if (kind === "trigger") {
    // Runtime scripts not wired yet — stub fields for later.
    region.scriptId = "";
    region.note = "Скрипт зоны (заглушка)";
  }
  if (kind === "npc_idle" || kind === "npc_wander") {
    region.note =
      kind === "npc_wander"
        ? "Исследование: гуляющий NPC (spriteId)"
        : "Исследование: стоячий NPC (spriteId)";
  }
  return region;
}
