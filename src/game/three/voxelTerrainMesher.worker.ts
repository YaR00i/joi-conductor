/// <reference lib="webworker" />
import { buildSolidTerrainGeometry } from "./solidTerrainGeometry";
import type {
  TerrainWorkerRequest,
  TerrainWorkerResponse,
} from "./terrainWorkerProtocol";

const scope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;
const datasets = new Map<
  string,
  {
    map: NonNullable<TerrainWorkerRequest["map"]>;
    tileset: NonNullable<TerrainWorkerRequest["tileset"]>;
  }
>();

scope.onmessage = (event: MessageEvent<TerrainWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.datasetKey && request.map && request.tileset) {
      datasets.set(request.datasetKey, {
        map: request.map,
        tileset: request.tileset,
      });
    }
    const cached = request.datasetKey
      ? datasets.get(request.datasetKey)
      : undefined;
    const map = request.map ?? cached?.map;
    const tileset = request.tileset ?? cached?.tileset;
    if (!map || !tileset) throw new Error("Terrain Worker dataset is missing");
    const chunks = request.chunks.map(({ key, region }) =>
      buildSolidTerrainGeometry(
        map,
        tileset,
        region,
        key,
        request.perCellEmissiveMaterials !== false,
      ),
    );
    const transfer: Transferable[] = [];
    for (const chunk of chunks) {
      for (const batch of chunk.batches) {
        transfer.push(batch.positions, batch.normals, batch.uvs);
      }
    }
    const response: TerrainWorkerResponse = { id: request.id, chunks };
    scope.postMessage(response, transfer);
  } catch (error) {
    const response: TerrainWorkerResponse = {
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    };
    scope.postMessage(response);
  }
};
