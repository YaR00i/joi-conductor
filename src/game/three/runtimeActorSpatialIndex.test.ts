import { describe, expect, it } from "vitest";
import { RuntimeActorSpatialIndex } from "./runtimeActorSpatialIndex";

type TestActor = { id: string; lx: number; ly: number; radius: number };

describe("RuntimeActorSpatialIndex", () => {
  it("visits only nearby buckets and includes actor radius", () => {
    const index = new RuntimeActorSpatialIndex<TestActor>(32);
    const near = { id: "near", lx: 35, ly: 16, radius: 8 };
    const far = { id: "far", lx: 300, ly: 300, radius: 8 };
    index.rebuild([near, far]);
    const seen: string[] = [];
    index.visitRadius(24, 16, 4, (actor) => {
      seen.push(actor.id);
    });
    expect(seen).toEqual(["near"]);
  });

  it("reuses the index after actors move and finds the true nearest", () => {
    const index = new RuntimeActorSpatialIndex<TestActor>(24);
    const a = { id: "a", lx: -70, ly: 0, radius: 4 };
    const b = { id: "b", lx: 40, ly: 0, radius: 4 };
    index.rebuild([a, b]);
    expect(index.nearest(0, 0)?.id).toBe("b");
    a.lx = 3;
    index.rebuild([a, b]);
    expect(index.nearest(0, 0)?.id).toBe("a");
    expect(index.stats()).toMatchObject({ actors: 2, buckets: 2 });
  });

  it("supports early exit without visiting distant candidates", () => {
    const index = new RuntimeActorSpatialIndex<TestActor>(16);
    index.rebuild([
      { id: "first", lx: 1, ly: 1, radius: 2 },
      { id: "second", lx: 2, ly: 2, radius: 2 },
    ]);
    let visits = 0;
    const stopped = index.visitRadius(0, 0, 8, () => {
      visits += 1;
      return true;
    });
    expect(stopped).toBe(true);
    expect(visits).toBe(1);
  });
});
