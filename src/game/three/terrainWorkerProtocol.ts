import type { EmberMap, EmberTileset } from "../content/types";
import type { VoxelMeshRegion } from "./voxelMesh";

export type TerrainWorkerBatch = {
  tileId: number;
  face: "top" | "wall";
  tx?: number;
  ty?: number;
  transparent: boolean;
  positions: ArrayBuffer;
  normals: ArrayBuffer;
  uvs: ArrayBuffer;
};

export type TerrainWorkerChunkResult = {
  key: string;
  requiresSync: boolean;
  batches: TerrainWorkerBatch[];
};

export type TerrainWorkerRequest = {
  id: number;
  /** Stable static-runtime dataset. Workers cache it after the first request. */
  datasetKey?: string;
  map?: EmberMap;
  tileset?: EmberTileset;
  perCellEmissiveMaterials?: boolean;
  chunks: Array<{ key: string; region: VoxelMeshRegion }>;
};

export type TerrainWorkerResponse = {
  id: number;
  chunks?: TerrainWorkerChunkResult[];
  error?: string;
};
