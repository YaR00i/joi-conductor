import { describe, expect, it } from "vitest";
import { farmerPatrol, isoFlipX, isMoving, stepPatrol, walkBobPx } from "./farmSprites";

describe("farm sprite facing", () => {
  it("flips when the iso step goes right on screen", () => {
    expect(isoFlipX(1, 0)).toBe(true);
    expect(isoFlipX(0, 1)).toBe(false);
    expect(isMoving(0, 0)).toBe(false);
    expect(isMoving(0.5, 0)).toBe(true);
  });

  it("bobs only while moving", () => {
    expect(walkBobPx(400, false)).toBe(0);
    expect(walkBobPx(400, true)).toBeGreaterThan(0);
  });

  it("walks the farmer around the field edge", () => {
    const route = farmerPatrol(10, 8);
    expect(route).toHaveLength(4);
    let pos = { ...route[0] };
    let index = 1;
    let moved = false;
    for (let t = 0; t < 4000; t += 50) {
      const next = stepPatrol(pos, route, index, 1.4, 50);
      if (Math.hypot(next.pos.x - pos.x, next.pos.y - pos.y) > 0.01) moved = true;
      pos = next.pos;
      index = next.index;
    }
    expect(moved).toBe(true);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(route.length);
  });
});
