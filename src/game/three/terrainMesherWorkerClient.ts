import type {
  TerrainWorkerRequest,
  TerrainWorkerResponse,
} from "./terrainWorkerProtocol";

type WorkerSlot = {
  worker: Worker;
  pendingIds: Set<number>;
  datasets: Set<string>;
};
export type TerrainMeshRequest = {
  map: NonNullable<TerrainWorkerRequest["map"]>;
  tileset: NonNullable<TerrainWorkerRequest["tileset"]>;
  chunks: TerrainWorkerRequest["chunks"];
  /** Avoid cloning an unchanged runtime map on every streamed batch. */
  datasetKey?: string;
  perCellEmissiveMaterials?: boolean;
};
type Pending = {
  resolve: (response: TerrainWorkerResponse) => void;
  reject: (error: Error) => void;
};

/** Small pool: enough parallelism for border edits without saturating the PC. */
export class TerrainMesherWorkerClient {
  private slots: WorkerSlot[] = [];
  private pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    if (typeof Worker === "undefined") return;
    const hardwareThreads =
      typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
    const count = Math.max(1, Math.min(3, hardwareThreads - 1));
    for (let index = 0; index < count; index++) {
      const slot = this.createSlot(index);
      if (slot) this.slots.push(slot);
    }
  }

  private createSlot(index: number): WorkerSlot | null {
    try {
      const worker = new Worker(
        new URL("./voxelTerrainMesher.worker.ts", import.meta.url),
        { type: "module", name: `ember-terrain-mesher-${index + 1}` },
      );
      const slot: WorkerSlot = {
        worker,
        pendingIds: new Set(),
        datasets: new Set(),
      };
      worker.onmessage = (event: MessageEvent<TerrainWorkerResponse>) => {
        const response = event.data;
        slot.pendingIds.delete(response.id);
        const pending = this.pending.get(response.id);
        if (!pending) return;
        this.pending.delete(response.id);
        if (response.error) pending.reject(new Error(response.error));
        else pending.resolve(response);
      };
      worker.onerror = (event) => {
        const error = new Error(event.message || "Terrain Worker failed");
        for (const id of slot.pendingIds) {
          this.pending.get(id)?.reject(error);
          this.pending.delete(id);
        }
        slot.pendingIds.clear();
        worker.terminate();
        this.slots = this.slots.filter((candidate) => candidate !== slot);
      };
      return slot;
    } catch {
      return null;
    }
  }

  get available(): boolean {
    return this.slots.length > 0;
  }

  get workerCount(): number {
    return this.slots.length;
  }

  get pendingJobCount(): number {
    return this.pending.size;
  }

  private meshOnSlot(
    slot: WorkerSlot,
    request: TerrainMeshRequest,
  ): Promise<TerrainWorkerResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      slot.pendingIds.add(id);
      const includeDataset =
        !request.datasetKey || !slot.datasets.has(request.datasetKey);
      const wireRequest: TerrainWorkerRequest = {
        id,
        datasetKey: request.datasetKey,
        map: includeDataset ? request.map : undefined,
        tileset: includeDataset ? request.tileset : undefined,
        perCellEmissiveMaterials: request.perCellEmissiveMaterials,
        chunks: request.chunks,
      };
      if (request.datasetKey && includeDataset) {
        slot.datasets.add(request.datasetKey);
      }
      slot.worker.postMessage(wireRequest);
    });
  }

  async mesh(request: TerrainMeshRequest): Promise<TerrainWorkerResponse> {
    if (this.slots.length === 0) {
      throw new Error("Terrain Worker unavailable");
    }
    const workerCount = Math.min(this.slots.length, request.chunks.length);
    if (workerCount <= 1) return this.meshOnSlot(this.slots[0]!, request);
    const groups = Array.from(
      { length: workerCount },
      () => [] as typeof request.chunks,
    );
    request.chunks.forEach((chunk, index) => {
      groups[index % workerCount]!.push(chunk);
    });
    const responses = await Promise.all(
      groups.map((chunks, index) =>
        this.meshOnSlot(this.slots[index]!, { ...request, chunks }),
      ),
    );
    return {
      id: responses[0]?.id ?? 0,
      chunks: responses.flatMap((response) => response.chunks ?? []),
    };
  }

  dispose(): void {
    for (const slot of this.slots) slot.worker.terminate();
    this.slots = [];
    const error = new Error("Terrain Worker disposed");
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
