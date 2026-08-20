import { describe, expect, it } from "vitest";
import {
  addCrowdSeparation,
  resolveCrowdSteering,
  type CrowdSeparationAccumulator,
} from "./enemyCrowdAvoidance";

describe("enemy crowd avoidance", () => {
  it("pushes overlapping neighbors in opposite directions", () => {
    const a: CrowdSeparationAccumulator = { x: 0, y: 0, weight: 0 };
    const b: CrowdSeparationAccumulator = { x: 0, y: 0, weight: 0 };
    const left = { lx: 10, ly: 10, radius: 4, uid: 2 };
    const right = { lx: 10, ly: 10, radius: 4, uid: 7 };
    expect(addCrowdSeparation(a, left, right)).toBe(true);
    expect(addCrowdSeparation(b, right, left)).toBe(true);
    expect(a.x).toBeCloseTo(-b.x, 6);
    expect(a.y).toBeCloseTo(-b.y, 6);
  });

  it("ignores separated neighbors", () => {
    const out = { x: 0, y: 0, weight: 0 };
    expect(
      addCrowdSeparation(
        out,
        { lx: 0, ly: 0, radius: 3 },
        { lx: 20, ly: 0, radius: 3 },
      ),
    ).toBe(false);
    expect(out.weight).toBe(0);
  });

  it("keeps a normalized pursuit component under pressure", () => {
    const out = { x: 0, y: 0 };
    resolveCrowdSteering(out, 1, 0, { x: 0, y: 3, weight: 3 });
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 6);
    expect(out.x).toBeGreaterThan(0);
    expect(out.y).toBeGreaterThan(0);
  });
});
