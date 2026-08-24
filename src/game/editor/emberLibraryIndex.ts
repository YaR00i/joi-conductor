/**
 * Library search, tags, and Find References across Ember maps / scenes.
 */
import type { EmberPack } from "../content/types";
import {
  inferredLibraryTags,
  libraryAssetMatchesQuery,
  normalizeEmberLibraryTags,
} from "../content/libraryTags";

export type EmberLibraryAssetKind = "voxel" | "sprite";

export type EmberLibraryReferenceCountIndex = {
  voxel: ReadonlyMap<string, number>;
  sprite: ReadonlyMap<string, number>;
};

export type EmberAssetReference = {
  mapId?: string;
  mapNameRu?: string;
  sceneId?: string;
  kind: "voxelProp" | "sprite" | "chestModel" | "chestScene" | "sceneObject";
  objectId: string;
  x?: number;
  y?: number;
};

function collectAssetTags(
  id: string,
  tags: ReadonlyArray<string> | undefined,
  into: Set<string>,
): void {
  for (const tag of tags ?? []) into.add(tag);
  for (const tag of inferredLibraryTags(id)) into.add(tag);
}

export function uniqueLibraryTags(pack: EmberPack): string[] {
  const seen = new Set<string>();
  for (const model of Object.values(pack.voxelModels ?? {})) {
    collectAssetTags(model.id, model.tags, seen);
  }
  for (const sprite of Object.values(pack.sprites ?? {})) {
    collectAssetTags(sprite.id, sprite.tags, seen);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "en"));
}

/** Build all library reference counts in one pass over maps and voxel scenes. */
export function buildLibraryReferenceCountIndex(
  pack: EmberPack,
): EmberLibraryReferenceCountIndex {
  const voxel = new Map<string, number>();
  const sprite = new Map<string, number>();
  const add = (into: Map<string, number>, id: string | undefined) => {
    if (!id) return;
    into.set(id, (into.get(id) ?? 0) + 1);
  };
  for (const map of Object.values(pack.maps ?? {})) {
    for (const place of map.voxelProps ?? []) add(voxel, place.modelId);
    for (const place of map.sprites ?? []) add(sprite, place.spriteId);
    for (const region of map.regions ?? []) {
      add(voxel, region.closedModelId);
      add(voxel, region.sceneId);
    }
  }
  for (const scene of Object.values(pack.voxelScenes ?? {})) {
    for (const object of scene.objects ?? []) {
      if (object.modelId !== scene.id) add(voxel, object.modelId);
    }
  }
  return { voxel, sprite };
}

export function assetHasLibraryTag(
  tags: ReadonlyArray<string> | undefined,
  id: string,
  tag: string,
): boolean {
  const want = tag.trim().toLowerCase();
  if (!want) return true;
  const seen = new Set<string>();
  collectAssetTags(id, tags, seen);
  return seen.has(want);
}

export function filterLibraryAssets<
  T extends { id: string; nameRu?: string; tags?: ReadonlyArray<string> },
>(
  assets: ReadonlyArray<T>,
  query: string,
  tag: string | null,
): T[] {
  return assets.filter((asset) => {
    if (tag && !assetHasLibraryTag(asset.tags, asset.id, tag)) return false;
    return libraryAssetMatchesQuery(asset, query);
  });
}

export function findVoxelModelReferences(
  pack: EmberPack,
  modelId: string,
): EmberAssetReference[] {
  if (!modelId) return [];
  const out: EmberAssetReference[] = [];
  for (const map of Object.values(pack.maps ?? {})) {
    for (const place of map.voxelProps ?? []) {
      if (place.modelId !== modelId) continue;
      out.push({
        mapId: map.id,
        mapNameRu: map.nameRu,
        kind: "voxelProp",
        objectId: place.id,
        x: place.x,
        y: place.y,
      });
    }
    for (const region of map.regions ?? []) {
      if (region.closedModelId === modelId) {
        out.push({
          mapId: map.id,
          mapNameRu: map.nameRu,
          kind: "chestModel",
          objectId: region.id,
          x: region.x,
          y: region.y,
        });
      }
      if (region.sceneId === modelId) {
        out.push({
          mapId: map.id,
          mapNameRu: map.nameRu,
          kind: "chestScene",
          objectId: region.id,
          x: region.x,
          y: region.y,
        });
      }
    }
  }
  for (const scene of Object.values(pack.voxelScenes ?? {})) {
    if (scene.id === modelId) continue;
    for (const obj of scene.objects ?? []) {
      if (obj.modelId !== modelId) continue;
      out.push({
        sceneId: scene.id,
        mapNameRu: scene.nameRu,
        kind: "sceneObject",
        objectId: obj.id,
      });
    }
  }
  return out;
}

export function findSpriteReferences(
  pack: EmberPack,
  spriteId: string,
): EmberAssetReference[] {
  if (!spriteId) return [];
  const out: EmberAssetReference[] = [];
  for (const map of Object.values(pack.maps ?? {})) {
    for (const place of map.sprites ?? []) {
      if (place.spriteId !== spriteId) continue;
      out.push({
        mapId: map.id,
        mapNameRu: map.nameRu,
        kind: "sprite",
        objectId: place.id,
        x: place.x,
        y: place.y,
      });
    }
  }
  return out;
}

export function findLibraryAssetReferences(
  pack: EmberPack,
  kind: EmberLibraryAssetKind,
  id: string,
): EmberAssetReference[] {
  switch (kind) {
    case "voxel":
      return findVoxelModelReferences(pack, id);
    case "sprite":
      return findSpriteReferences(pack, id);
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

export function countLibraryAssetReferences(
  pack: EmberPack,
  kind: EmberLibraryAssetKind,
  id: string,
): number {
  return findLibraryAssetReferences(pack, kind, id).length;
}

export function summarizeLibraryReferences(
  refs: ReadonlyArray<EmberAssetReference>,
  currentMapId?: string,
): { total: number; onCurrent: number; otherMaps: string[] } {
  const other = new Set<string>();
  let onCurrent = 0;
  for (const ref of refs) {
    if (currentMapId && ref.mapId === currentMapId) {
      onCurrent += 1;
      continue;
    }
    if (ref.mapId) {
      other.add(ref.mapNameRu?.trim() || ref.mapId);
      continue;
    }
    if (ref.sceneId) {
      other.add(`сцена ${ref.mapNameRu?.trim() || ref.sceneId}`);
    }
  }
  return {
    total: refs.length,
    onCurrent,
    otherMaps: [...other].sort((a, b) => a.localeCompare(b, "ru")),
  };
}

export { normalizeEmberLibraryTags };
