import type {
  EmberMap,
  EmberMapPlayProfile,
  EmberPack,
  EmberStage,
} from "./types";
import { createEmptyMap, ensureMapLayers } from "../tile/mapUtils";

const MAP_SIZE_MIN = 8;
const MAP_SIZE_MAX = 96;

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function uniqueId(used: Record<string, unknown>, base: string): string {
  if (!used[base]) return base;
  let i = 2;
  while (used[`${base}_${i}`]) i += 1;
  return `${base}_${i}`;
}

export function clampMapSize(n: number): number {
  if (!Number.isFinite(n)) return 24;
  return Math.max(MAP_SIZE_MIN, Math.min(MAP_SIZE_MAX, Math.round(n)));
}

export type CreateBlankEmberMapOpts = {
  nameRu: string;
  width: number;
  height: number;
  tilesetId: string;
  tileSize?: number;
  playProfile?: EmberMapPlayProfile;
  /** Copy night/lamps/grade so a new village isn't a blank day box. */
  lightTemplate?: EmberMap | null;
  usedMapIds?: Record<string, unknown>;
};

/** Empty bordered map ready to save as `maps/<id>.json`. */
export function createBlankEmberMap(opts: CreateBlankEmberMapOpts): EmberMap {
  const width = clampMapSize(opts.width);
  const height = clampMapSize(opts.height);
  const id = uniqueId(opts.usedMapIds ?? {}, uid("map"));
  const nameRu = opts.nameRu.trim() || "Новая карта";
  const tileSize = opts.tileSize && opts.tileSize > 0 ? opts.tileSize : 16;
  const map = ensureMapLayers(
    createEmptyMap(id, width, height, opts.tilesetId, tileSize),
  );
  map.nameRu = nameRu;
  if (opts.playProfile === "explore" || opts.playProfile === "arena") {
    map.playProfile = opts.playProfile;
  }
  const light = opts.lightTemplate?.light;
  if (light) {
    map.light = {
      ...light,
      atmosphere: light.atmosphere ? { ...light.atmosphere } : undefined,
      grade: light.grade ? { ...light.grade } : undefined,
    };
  }
  return map;
}

/** Stage that points at the new map, inheriting pools from a matching template. */
export function createStageForMap(pack: EmberPack, map: EmberMap): EmberStage {
  const stages = Object.values(pack.stages);
  const profile = map.playProfile;
  const byProfile = stages.find((stage) => {
    const host = pack.maps[stage.mapId];
    return host?.playProfile === profile;
  });
  const template =
    byProfile ??
    pack.stages[pack.meta.defaultStageId] ??
    stages[0];
  if (!template) {
    throw new Error("В паке нет стадии-шаблона для новой карты");
  }
  const id = uniqueId(pack.stages, `st_${map.id}`);
  return {
    ...template,
    id,
    nameRu: map.nameRu?.trim() || map.id,
    mapId: map.id,
    playerBody: template.playerBody
      ? { ...template.playerBody }
      : undefined,
  };
}
