import * as THREE from "three";
import type { EmberMap, EmberTileset } from "../content/types";
import { elevationSteps } from "../content/types";
import { elevTileIdAt } from "../tile/elevGroundLayers";
import { mapNeedsInteriorCutawayMeshes } from "../tile/buildingInterior";
import { blockStoryHeight } from "../tile/extruded";
import { ensureMapLayers, heightVoxelsAt } from "../tile/mapUtils";
import {
  buildVoxelMesh,
  disposeVoxelMesh,
  type VoxelMeshRegion,
} from "./voxelMesh";
import { TerrainMesherWorkerClient } from "./terrainMesherWorkerClient";
import { materializeTerrainWorkerChunk } from "./terrainWorkerMaterialize";

export const DEFAULT_TERRAIN_CHUNK_SIZE = 16;

export type TerrainChunkDescriptor = VoxelMeshRegion & {
  key: string;
  chunkX: number;
  chunkY: number;
};

export function terrainChunkDescriptors(
  width: number,
  height: number,
  chunkSize = DEFAULT_TERRAIN_CHUNK_SIZE,
): TerrainChunkDescriptor[] {
  const size = Math.max(1, Math.round(chunkSize));
  const result: TerrainChunkDescriptor[] = [];
  for (let y0 = 0, chunkY = 0; y0 < height; y0 += size, chunkY++) {
    for (let x0 = 0, chunkX = 0; x0 < width; x0 += size, chunkX++) {
      result.push({
        key: `${chunkX}:${chunkY}`,
        chunkX,
        chunkY,
        x0,
        y0,
        x1: Math.min(width, x0 + size),
        y1: Math.min(height, y0 + size),
      });
    }
  }
  return result;
}

export type TerrainChunkWindow = Readonly<{
  focusChunkX: number;
  focusChunkY: number;
  load: readonly TerrainChunkDescriptor[];
  retainKeys: ReadonlySet<string>;
}>;

/** Stable id for a streaming window so play can skip no-op rebuilds. */
export function terrainChunkKeySignature(keys: Iterable<string>): string {
  return [...keys].sort().join("|");
}

/**
 * Chunks close enough to render plus a wider hysteresis ring to retain.
 * The load list is nearest-first so the ground under the player appears first.
 */
export function terrainChunkWindow(
  descriptors: readonly TerrainChunkDescriptor[],
  focusTileX: number,
  focusTileY: number,
  loadRadiusChunks: number,
  unloadRadiusChunks: number,
  chunkSize = DEFAULT_TERRAIN_CHUNK_SIZE,
): TerrainChunkWindow {
  const focusChunkX = Math.max(0, Math.floor(focusTileX / chunkSize));
  const focusChunkY = Math.max(0, Math.floor(focusTileY / chunkSize));
  const loadRadius = Math.max(0, Math.round(loadRadiusChunks));
  const retainRadius = Math.max(loadRadius, Math.round(unloadRadiusChunks));
  const distance = (descriptor: TerrainChunkDescriptor) =>
    Math.max(
      Math.abs(descriptor.chunkX - focusChunkX),
      Math.abs(descriptor.chunkY - focusChunkY),
    );
  const load = descriptors
    .filter((descriptor) => distance(descriptor) <= loadRadius)
    .sort((a, b) => {
      const adx = a.chunkX - focusChunkX;
      const ady = a.chunkY - focusChunkY;
      const bdx = b.chunkX - focusChunkX;
      const bdy = b.chunkY - focusChunkY;
      return adx * adx + ady * ady - (bdx * bdx + bdy * bdy);
    });
  const retainKeys = new Set(
    descriptors
      .filter((descriptor) => distance(descriptor) <= retainRadius)
      .map((descriptor) => descriptor.key),
  );
  return { focusChunkX, focusChunkY, load, retainKeys };
}

function mixHash(hash: number, value: number): number {
  hash ^= value | 0;
  return Math.imul(hash, 0x01000193) >>> 0;
}

/**
 * Fingerprint a chunk plus a one-cell halo. Water shore faces are the only
 * terrain geometry that reads neighboring cells; the halo invalidates the
 * adjacent chunk when a border cell changes.
 */
export function terrainChunkSignature(
  mapIn: EmberMap,
  descriptor: VoxelMeshRegion,
): string {
  const map = ensureMapLayers(mapIn);
  let hash = 0x811c9dc5;
  const x0 = Math.max(0, descriptor.x0 - 1);
  const y0 = Math.max(0, descriptor.y0 - 1);
  const x1 = Math.min(map.width, descriptor.x1 + 1);
  const y1 = Math.min(map.height, descriptor.y1 + 1);
  hash = mixHash(hash, map.width);
  hash = mixHash(hash, map.height);
  hash = mixHash(hash, map.tileSize);
  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      hash = mixHash(hash, heightVoxelsAt(map, tx, ty));
      for (const elev of elevationSteps()) {
        hash = mixHash(hash, elevTileIdAt(map, tx, ty, elev));
      }
    }
  }
  return hash.toString(36);
}

export type TerrainChunkUpdate = Readonly<{
  rebuiltChunks: number;
  totalChunks: number;
  rebuiltKeys: readonly string[];
}>;

export type TerrainStreamingStats = Readonly<{
  loadedChunks: number;
  desiredChunks: number;
  pendingChunks: number;
  totalChunks: number;
  workerCount: number;
  workerJobs: number;
}>;

export type ChunkedVoxelTerrain = Readonly<{
  group: THREE.Group;
  center: THREE.Vector3;
  bounds: THREE.Box3;
  update: (map: EmberMap, tileset: EmberTileset) => TerrainChunkUpdate;
  scheduleUpdate: (
    map: EmberMap,
    tileset: EmberTileset,
    onApplied?: (complete: boolean) => void,
  ) => TerrainChunkUpdate;
  streamAround: (
    map: EmberMap,
    tileset: EmberTileset,
    focusTileX: number,
    focusTileY: number,
    options?: {
      loadRadiusChunks?: number;
      unloadRadiusChunks?: number;
      datasetKey?: string;
    },
    onApplied?: (complete: boolean) => void,
  ) => TerrainChunkUpdate;
  getStreamingStats: () => TerrainStreamingStats;
  dispose: () => void;
}>;

type BuiltChunk = {
  signature: string;
  group: THREE.Group;
};

export function createChunkedVoxelTerrain(
  initialMap: EmberMap,
  initialTileset: EmberTileset,
  options: {
    chunkSize?: number;
    /** Start with an empty stable root and let scheduleUpdate stream chunks. */
    deferInitial?: boolean;
    /** Editor preview does not evaluate player-proximity tile triggers. */
    perCellEmissiveMaterials?: boolean;
  } = {},
): ChunkedVoxelTerrain {
  const chunkSize = options.chunkSize ?? DEFAULT_TERRAIN_CHUNK_SIZE;
  const perCellEmissiveMaterials =
    options.perCellEmissiveMaterials !== false;
  const root = new THREE.Group();
  root.name = "voxelMapChunks";
  const center = new THREE.Vector3();
  const bounds = new THREE.Box3();
  const chunks = new Map<string, BuiltChunk>();
  let layoutKey = "";
  let lastTileset: EmberTileset | null = null;
  let disposed = false;
  const worker = new TerrainMesherWorkerClient();
  let generation = 0;
  let applyFrame = 0;
  let dispatchTimer: ReturnType<typeof setTimeout> | null = null;
  let applyQueue: Array<() => void> = [];
  let desiredChunks = 0;
  let pendingChunks = 0;
  let totalChunks = 0;
  const requestApplyFrame = (callback: FrameRequestCallback): number =>
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(callback)
      : (setTimeout(() => callback(performance.now()), 0) as unknown as number);
  const cancelApplyFrame = (id: number) => {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
    else clearTimeout(id);
  };

  const cancelScheduled = () => {
    generation++;
    applyQueue = [];
    if (dispatchTimer) clearTimeout(dispatchTimer);
    dispatchTimer = null;
    if (applyFrame) cancelApplyFrame(applyFrame);
    applyFrame = 0;
    pendingChunks = 0;
  };

  const updateBounds = (map: EmberMap) => {
    bounds.setFromObject(root);
    const storyH = blockStoryHeight(map.tileSize);
    const maxY = bounds.isEmpty() ? storyH : bounds.max.y;
    center.set(
      (map.width * map.tileSize) / 2,
      Math.max(storyH, maxY * 0.35),
      (map.height * map.tileSize) / 2,
    );
  };

  const update = (mapIn: EmberMap, tileset: EmberTileset): TerrainChunkUpdate => {
    if (disposed) return { rebuiltChunks: 0, totalChunks: 0, rebuiltKeys: [] };
    cancelScheduled();
    const map = ensureMapLayers(mapIn);
    const nextLayoutKey = `${map.width}x${map.height}:${map.tileSize}:${chunkSize}`;
    const forceAll = nextLayoutKey !== layoutKey || tileset !== lastTileset;
    layoutKey = nextLayoutKey;
    lastTileset = tileset;
    const descriptors = terrainChunkDescriptors(
      map.width,
      map.height,
      chunkSize,
    );
    const liveKeys = new Set(descriptors.map((descriptor) => descriptor.key));
    for (const [key, chunk] of chunks) {
      if (liveKeys.has(key)) continue;
      root.remove(chunk.group);
      disposeVoxelMesh(chunk.group);
      chunks.delete(key);
    }

    const rebuiltKeys: string[] = [];
    for (const descriptor of descriptors) {
      const signature = terrainChunkSignature(map, descriptor);
      const current = chunks.get(descriptor.key);
      if (!forceAll && current?.signature === signature) continue;
      const built = buildVoxelMesh(map, tileset, descriptor, {
        perCellEmissiveMaterials,
      });
      built.group.name = `terrainChunk:${descriptor.key}`;
      if (current) {
        root.remove(current.group);
        disposeVoxelMesh(current.group);
      }
      root.add(built.group);
      chunks.set(descriptor.key, { signature, group: built.group });
      rebuiltKeys.push(descriptor.key);
    }
    updateBounds(map);
    return {
      rebuiltChunks: rebuiltKeys.length,
      totalChunks: descriptors.length,
      rebuiltKeys,
    };
  };

  const scheduleDescriptors = (
    mapIn: EmberMap,
    tileset: EmberTileset,
    descriptors: TerrainChunkDescriptor[],
    liveKeys: ReadonlySet<string>,
    allChunkCount: number,
    datasetKey: string | undefined,
    debounceMs: number,
    onApplied?: (complete: boolean) => void,
  ): TerrainChunkUpdate => {
    if (disposed) return { rebuiltChunks: 0, totalChunks: 0, rebuiltKeys: [] };
    cancelScheduled();
    const requestGeneration = generation;
    const map = ensureMapLayers(mapIn);
    const nextLayoutKey = `${map.width}x${map.height}:${map.tileSize}:${chunkSize}`;
    const forceAll = nextLayoutKey !== layoutKey || tileset !== lastTileset;
    layoutKey = nextLayoutKey;
    lastTileset = tileset;
    desiredChunks = descriptors.length;
    totalChunks = allChunkCount;
    for (const [key, chunk] of chunks) {
      if (liveKeys.has(key)) continue;
      root.remove(chunk.group);
      disposeVoxelMesh(chunk.group);
      chunks.delete(key);
    }
    const changed = descriptors
      .map((descriptor) => ({
        descriptor,
        signature: terrainChunkSignature(map, descriptor),
      }))
      .filter(
        ({ descriptor, signature }) =>
          forceAll || chunks.get(descriptor.key)?.signature !== signature,
      );
    const rebuiltKeys = changed.map(({ descriptor }) => descriptor.key);
    if (changed.length === 0) {
      updateBounds(map);
      onApplied?.(true);
      return {
        rebuiltChunks: 0,
        totalChunks: allChunkCount,
        rebuiltKeys,
      };
    }
    pendingChunks = changed.length;

    const enqueue = (jobs: Array<() => void>) => {
      if (disposed || requestGeneration !== generation) return;
      applyQueue = jobs;
      const pump = () => {
        applyFrame = 0;
        if (disposed || requestGeneration !== generation) {
          applyQueue = [];
          return;
        }
        const job = applyQueue.shift();
        job?.();
        if (job) pendingChunks = Math.max(0, pendingChunks - 1);
        updateBounds(map);
        const complete = applyQueue.length === 0;
        onApplied?.(complete);
        if (!complete) applyFrame = requestApplyFrame(pump);
      };
      applyFrame = requestApplyFrame(pump);
    };

    const replaceChunk = (
      key: string,
      signature: string,
      nextGroup: THREE.Group,
    ) => {
      const current = chunks.get(key);
      if (current) {
        root.remove(current.group);
        disposeVoxelMesh(current.group);
      }
      root.add(nextGroup);
      chunks.set(key, { signature, group: nextGroup });
    };

    const syncJobs = () =>
      changed.map(({ descriptor, signature }) => () => {
        const built = buildVoxelMesh(map, tileset, descriptor, {
          perCellEmissiveMaterials,
        });
        built.group.name = `terrainChunk:${descriptor.key}`;
        replaceChunk(descriptor.key, signature, built.group);
      });

    if (!worker.available || mapNeedsInteriorCutawayMeshes(map)) {
      enqueue(syncJobs());
    } else {
      // Brush drags may publish many maps per second. Coalesce them before
      // crossing the structured-clone boundary so the Worker never builds a
      // long queue of already obsolete terrain revisions.
      dispatchTimer = setTimeout(() => {
        dispatchTimer = null;
        if (disposed || requestGeneration !== generation) return;
        void worker
          .mesh({
            map,
            tileset,
            datasetKey,
            perCellEmissiveMaterials,
            chunks: changed.map(({ descriptor }) => ({
              key: descriptor.key,
              region: descriptor,
            })),
          })
          .then((response) => {
            if (disposed || requestGeneration !== generation) return;
            const resultByKey = new Map(
              (response.chunks ?? []).map((result) => [result.key, result]),
            );
            enqueue(
              changed.map(({ descriptor, signature }) => () => {
                const result = resultByKey.get(descriptor.key);
                const transferred = result
                  ? materializeTerrainWorkerChunk(result, map, tileset)
                  : null;
                if (transferred) {
                  replaceChunk(descriptor.key, signature, transferred);
                  return;
                }
                const built = buildVoxelMesh(map, tileset, descriptor, {
                  perCellEmissiveMaterials,
                });
                built.group.name = `terrainChunk:${descriptor.key}`;
                replaceChunk(descriptor.key, signature, built.group);
              }),
            );
          })
          .catch(() => {
            if (disposed || requestGeneration !== generation) return;
            enqueue(syncJobs());
          });
      }, debounceMs);
    }
    return {
      rebuiltChunks: changed.length,
      totalChunks: allChunkCount,
      rebuiltKeys,
    };
  };

  const scheduleUpdate = (
    mapIn: EmberMap,
    tileset: EmberTileset,
    onApplied?: (complete: boolean) => void,
  ): TerrainChunkUpdate => {
    const map = ensureMapLayers(mapIn);
    const descriptors = terrainChunkDescriptors(map.width, map.height, chunkSize);
    return scheduleDescriptors(
      map,
      tileset,
      descriptors,
      new Set(descriptors.map((descriptor) => descriptor.key)),
      descriptors.length,
      undefined,
      32,
      onApplied,
    );
  };

  const streamAround = (
    mapIn: EmberMap,
    tileset: EmberTileset,
    focusTileX: number,
    focusTileY: number,
    streamOptions: {
      loadRadiusChunks?: number;
      unloadRadiusChunks?: number;
      datasetKey?: string;
    } = {},
    onApplied?: (complete: boolean) => void,
  ): TerrainChunkUpdate => {
    const map = ensureMapLayers(mapIn);
    const descriptors = terrainChunkDescriptors(map.width, map.height, chunkSize);
    const window = terrainChunkWindow(
      descriptors,
      focusTileX,
      focusTileY,
      streamOptions.loadRadiusChunks ?? 2,
      streamOptions.unloadRadiusChunks ?? 3,
      chunkSize,
    );
    return scheduleDescriptors(
      map,
      tileset,
      [...window.load],
      window.retainKeys,
      descriptors.length,
      streamOptions.datasetKey,
      0,
      onApplied,
    );
  };

  const getStreamingStats = (): TerrainStreamingStats => ({
    loadedChunks: chunks.size,
    desiredChunks,
    pendingChunks,
    totalChunks,
    workerCount: worker.workerCount,
    workerJobs: worker.pendingJobCount,
  });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelScheduled();
    worker.dispose();
    for (const chunk of chunks.values()) disposeVoxelMesh(chunk.group);
    chunks.clear();
    root.clear();
  };

  const api: ChunkedVoxelTerrain = {
    group: root,
    center,
    bounds,
    update,
    scheduleUpdate,
    streamAround,
    getStreamingStats,
    dispose,
  };
  if (options.deferInitial) updateBounds(ensureMapLayers(initialMap));
  else update(initialMap, initialTileset);
  return api;
}
