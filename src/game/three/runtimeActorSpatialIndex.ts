export type RuntimeSpatialActor = {
  lx: number;
  ly: number;
  radius: number;
};

type SpatialBucket<T> = {
  key: number;
  items: T[];
};

export type RuntimeActorSpatialStats = {
  actors: number;
  buckets: number;
  maxRadius: number;
  cellSize: number;
};

/**
 * Reusable uniform grid for moving runtime actors. Actors occupy one bucket by
 * their centre; radius queries expand by the largest indexed actor radius.
 */
export class RuntimeActorSpatialIndex<T extends RuntimeSpatialActor> {
  private readonly buckets = new Map<number, SpatialBucket<T>>();
  private readonly activeBuckets: SpatialBucket<T>[] = [];
  private readonly bucketPool: SpatialBucket<T>[] = [];
  private actorCount = 0;
  private maxActorRadius = 0;
  private minCellX = 0;
  private maxCellX = -1;
  private minCellY = 0;
  private maxCellY = -1;

  constructor(readonly cellSize: number) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new Error("RuntimeActorSpatialIndex cellSize must be positive");
    }
  }

  private cell(value: number): number {
    return Math.floor(value / this.cellSize);
  }

  private key(cellX: number, cellY: number): number {
    // Runtime maps are many orders of magnitude smaller than this stride.
    return cellX * 1_048_576 + cellY;
  }

  rebuild(items: readonly T[]): void {
    this.buckets.clear();
    for (const bucket of this.activeBuckets) {
      bucket.items.length = 0;
      this.bucketPool.push(bucket);
    }
    this.activeBuckets.length = 0;
    this.actorCount = items.length;
    this.maxActorRadius = 0;
    this.minCellX = Infinity;
    this.maxCellX = -Infinity;
    this.minCellY = Infinity;
    this.maxCellY = -Infinity;

    for (const item of items) {
      const cellX = this.cell(item.lx);
      const cellY = this.cell(item.ly);
      const key = this.key(cellX, cellY);
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = this.bucketPool.pop() ?? { key, items: [] };
        bucket.key = key;
        this.buckets.set(key, bucket);
        this.activeBuckets.push(bucket);
      }
      bucket.items.push(item);
      this.maxActorRadius = Math.max(this.maxActorRadius, item.radius);
      this.minCellX = Math.min(this.minCellX, cellX);
      this.maxCellX = Math.max(this.maxCellX, cellX);
      this.minCellY = Math.min(this.minCellY, cellY);
      this.maxCellY = Math.max(this.maxCellY, cellY);
    }
  }

  /** Returns true when the visitor requests an early exit. */
  visitRadius(
    x: number,
    y: number,
    radius: number,
    visitor: (item: T) => boolean | void,
  ): boolean {
    if (this.actorCount === 0) return false;
    const broadRadius = Math.max(0, radius) + this.maxActorRadius;
    const minX = this.cell(x - broadRadius);
    const maxX = this.cell(x + broadRadius);
    const minY = this.cell(y - broadRadius);
    const maxY = this.cell(y + broadRadius);
    for (let cellY = minY; cellY <= maxY; cellY++) {
      for (let cellX = minX; cellX <= maxX; cellX++) {
        const bucket = this.buckets.get(this.key(cellX, cellY));
        if (!bucket) continue;
        for (const item of bucket.items) {
          if (visitor(item) === true) return true;
        }
      }
    }
    return false;
  }

  nearest(x: number, y: number, accept?: (item: T) => boolean): T | null {
    if (this.actorCount === 0) return null;
    const centerX = this.cell(x);
    const centerY = this.cell(y);
    const maxRing = Math.max(
      Math.abs(centerX - this.minCellX),
      Math.abs(centerX - this.maxCellX),
      Math.abs(centerY - this.minCellY),
      Math.abs(centerY - this.maxCellY),
    );
    let best: T | null = null;
    let bestDistanceSq = Infinity;
    const visitBucket = (cellX: number, cellY: number) => {
      const bucket = this.buckets.get(this.key(cellX, cellY));
      if (!bucket) return;
      for (const item of bucket.items) {
        if (accept && !accept(item)) continue;
        const dx = item.lx - x;
        const dy = item.ly - y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq < bestDistanceSq) {
          bestDistanceSq = distanceSq;
          best = item;
        }
      }
    };

    for (let ring = 0; ring <= maxRing; ring++) {
      if (ring === 0) {
        visitBucket(centerX, centerY);
      } else {
        const left = centerX - ring;
        const right = centerX + ring;
        const top = centerY - ring;
        const bottom = centerY + ring;
        for (let cellX = left; cellX <= right; cellX++) {
          visitBucket(cellX, top);
          visitBucket(cellX, bottom);
        }
        for (let cellY = top + 1; cellY < bottom; cellY++) {
          visitBucket(left, cellY);
          visitBucket(right, cellY);
        }
      }

      if (best) {
        const left = (centerX - ring) * this.cellSize;
        const right = (centerX + ring + 1) * this.cellSize;
        const top = (centerY - ring) * this.cellSize;
        const bottom = (centerY + ring + 1) * this.cellSize;
        const nearestOutside = Math.min(
          x - left,
          right - x,
          y - top,
          bottom - y,
        );
        if (bestDistanceSq <= nearestOutside * nearestOutside) break;
      }
    }
    return best;
  }

  stats(): RuntimeActorSpatialStats {
    return {
      actors: this.actorCount,
      buckets: this.activeBuckets.length,
      maxRadius: this.maxActorRadius,
      cellSize: this.cellSize,
    };
  }
}
