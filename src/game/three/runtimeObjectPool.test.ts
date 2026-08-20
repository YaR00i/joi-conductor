import { describe, expect, it } from "vitest";
import { RuntimeObjectPool } from "./runtimeObjectPool";

describe("RuntimeObjectPool", () => {
  it("reuses released objects without invoking the factory again", () => {
    let nextId = 1;
    const pool = new RuntimeObjectPool(() => ({ id: nextId++ }));
    const first = pool.acquire();
    pool.release(first);
    const reused = pool.acquire();
    expect(reused).toBe(first);
    expect(pool.stats()).toEqual({ created: 1, active: 1, available: 0 });
  });

  it("reports active and available capacity", () => {
    const pool = new RuntimeObjectPool(() => ({}));
    const a = pool.acquire();
    const b = pool.acquire();
    pool.release(a);
    pool.release(b);
    expect(pool.stats()).toEqual({ created: 2, active: 0, available: 2 });
    pool.clear();
    expect(pool.stats().available).toBe(0);
  });
});
