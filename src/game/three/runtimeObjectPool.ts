export type RuntimeObjectPoolStats = {
  created: number;
  active: number;
  available: number;
};

/** Small allocation-free LIFO pool for high-churn gameplay objects. */
export class RuntimeObjectPool<T> {
  private readonly available: T[] = [];
  private created = 0;
  private active = 0;

  constructor(private readonly create: () => T) {}

  acquire(): T {
    const item = this.available.pop();
    this.active += 1;
    if (item) return item;
    this.created += 1;
    return this.create();
  }

  release(item: T): void {
    this.active = Math.max(0, this.active - 1);
    this.available.push(item);
  }

  clear(dispose?: (item: T) => void): void {
    if (dispose) {
      for (const item of this.available) dispose(item);
    }
    this.available.length = 0;
  }

  stats(): RuntimeObjectPoolStats {
    return {
      created: this.created,
      active: this.active,
      available: this.available.length,
    };
  }
}
