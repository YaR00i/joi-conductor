import { describe, expect, it } from "vitest";
import {
  clampCoordToMap,
  enemyCrowdNeighborLimit,
  enemyCrowdSteerEnabled,
  enemyMovementCadence,
  enemySimLod,
  enemyWorldCollisionEnabled,
  noteMovementCadence,
  runsOnStaggeredTick,
} from "./enemyAiLod";

describe("enemy AI movement LOD", () => {
  it("keeps nearby ordinary encounters at the full 30 Hz step", () => {
    expect(enemyMovementCadence(8 * 16, 16, 32)).toBe(1);
    expect(enemyMovementCadence(14 * 16, 16, 32)).toBe(2);
    expect(enemyMovementCadence(24 * 16, 16, 32)).toBe(3);
  });

  it("stagger-loads large crowds regardless of convergence", () => {
    expect(enemyMovementCadence(2 * 16, 16, 64)).toBe(2);
    expect(enemyMovementCadence(12 * 16, 16, 64)).toBe(3);
    expect(enemyMovementCadence(1 * 16, 16, 120)).toBe(3);
    expect(enemyMovementCadence(1 * 16, 16, 180)).toBe(4);
  });

  it("distributes phases evenly across cadence ticks", () => {
    expect([0, 1, 2].map((tick) => runsOnStaggeredTick(tick, 0, 3))).toEqual([
      true,
      false,
      false,
    ]);
    expect([0, 1, 2].map((tick) => runsOnStaggeredTick(tick, 1, 3))).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("turns off world collision for far members of a large crowd", () => {
    expect(enemyWorldCollisionEnabled(4 * 16, 16, 32)).toBe(true);
    expect(enemyWorldCollisionEnabled(20 * 16, 16, 32)).toBe(false);
    expect(enemyWorldCollisionEnabled(10 * 16, 16, 64)).toBe(true);
    expect(enemyWorldCollisionEnabled(14 * 16, 16, 64)).toBe(false);
    expect(enemyWorldCollisionEnabled(8 * 16, 16, 180)).toBe(true);
    expect(enemyWorldCollisionEnabled(9 * 16, 16, 180)).toBe(false);
  });

  it("skips crowd steering off-screen when the horde is already large", () => {
    expect(enemyCrowdSteerEnabled(30 * 16, 16, 32)).toBe(true);
    expect(enemyCrowdSteerEnabled(15 * 16, 16, 64)).toBe(false);
    expect(enemyCrowdSteerEnabled(10 * 16, 16, 180)).toBe(true);
    expect(enemyCrowdSteerEnabled(11 * 16, 16, 180)).toBe(false);
  });

  it("caps neighbor queries as crowd size grows", () => {
    expect(enemyCrowdNeighborLimit(32)).toBe(8);
    expect(enemyCrowdNeighborLimit(64)).toBe(6);
    expect(enemyCrowdNeighborLimit(180)).toBe(4);
  });

  it("packs cadence, collision and steering into one sim LOD", () => {
    const near = enemySimLod(2 * 16, 16, 180);
    expect(near.cadence).toBe(4);
    expect(near.collideWorld).toBe(true);
    expect(near.crowdSteer).toBe(true);
    expect(near.maxNeighbors).toBe(4);

    const far = enemySimLod(20 * 16, 16, 180);
    expect(far.collideWorld).toBe(false);
    expect(far.crowdSteer).toBe(false);
  });

  it("counts cadence buckets exhaustively", () => {
    const counts = { full: 0, half: 0, third: 0, quarter: 0 };
    noteMovementCadence(counts, 1);
    noteMovementCadence(counts, 2);
    noteMovementCadence(counts, 3);
    noteMovementCadence(counts, 4);
    expect(counts).toEqual({ full: 1, half: 1, third: 1, quarter: 1 });
  });

  it("keeps kinematic slides inside the authored map", () => {
    expect(clampCoordToMap(-8, 4, 10, 16)).toBe(4);
    expect(clampCoordToMap(999, 4, 10, 16)).toBe(10 * 16 - 4);
    expect(clampCoordToMap(80, 4, 10, 16)).toBe(80);
  });
});
