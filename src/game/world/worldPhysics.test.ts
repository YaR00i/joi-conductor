import { describe, expect, it } from "vitest";
import {
  advanceWorldFall,
  blockSpanAtElev,
  bodyHasClearance,
  bodyVerticalSpan,
  mergeVerticalSpans,
  resolveWorldBody,
  resolveWorldCollider,
  spanBlocksBody,
} from "./worldPhysics";

describe("unified world physics", () => {
  const body = resolveWorldBody();
  const collider = resolveWorldCollider();

  it("uses feet and head as separate vertical bounds", () => {
    expect(bodyVerticalSpan(0, body).max).toBeCloseTo(0.740625);
  });

  it("walks under a Z3 block but not under a low Z1 block", () => {
    const high = blockSpanAtElev(3, collider)!;
    const low = blockSpanAtElev(1, collider)!;
    expect(spanBlocksBody(high, 0, body)).toBe(false);
    expect(spanBlocksBody(low, 0, body)).toBe(true);
  });

  it("keeps a filled Z0-Z3 column solid", () => {
    const spans = [0, 1, 2, 3].map((z) => blockSpanAtElev(z, collider)!);
    expect(bodyHasClearance(spans, 0, body)).toBe(false);
    expect(mergeVerticalSpans(spans)).toEqual([
      expect.objectContaining({ min: -1, max: 3 }),
    ]);
  });

  it("lets an actor stand on the top face", () => {
    const slab = blockSpanAtElev(3, collider)!;
    expect(spanBlocksBody(slab, 3, body)).toBe(false);
  });

  it("does not block movement with triggers or disabled colliders", () => {
    expect(blockSpanAtElev(1, resolveWorldCollider({ isTrigger: true }))).toBeNull();
    expect(blockSpanAtElev(1, resolveWorldCollider({ enabled: false }))).toBeNull();
  });
});

describe("vertical fall integration", () => {
  it("falls gradually with acceleration and lands exactly on support", () => {
    let state = { feetElev: 3, velocity: 0, grounded: true };
    state = advanceWorldFall(state, 0, 0.1);
    expect(state.feetElev).toBeCloseTo(2.94);
    expect(state.velocity).toBeCloseTo(-1.2);
    expect(state.grounded).toBe(false);

    const firstDrop = 3 - state.feetElev;
    const next = advanceWorldFall(state, 0, 0.1);
    expect(state.feetElev - next.feetElev).toBeGreaterThan(firstDrop);

    state = next;
    for (let i = 0; i < 120 && !state.grounded; i++) {
      state = advanceWorldFall(state, 0, 1 / 60);
    }
    expect(state).toEqual({ feetElev: 0, velocity: 0, grounded: true });
  });

  it("is stable across 30 and 120 fps", () => {
    const simulate = (fps: number) => {
      let state = { feetElev: 4, velocity: 0, grounded: true };
      for (let i = 0; i < Math.round(fps * 0.4); i++) {
        state = advanceWorldFall(state, 0, 1 / fps);
      }
      return state;
    };

    const at30 = simulate(30);
    const at120 = simulate(120);
    expect(at30.feetElev).toBeCloseTo(at120.feetElev, 1);
    expect(at30.velocity).toBeCloseTo(at120.velocity, 1);
  });

  it("snaps upward support changes instead of sinking into stairs", () => {
    expect(
      advanceWorldFall(
        { feetElev: 0, velocity: -2, grounded: false },
        0.25,
        1 / 60,
      ),
    ).toEqual({ feetElev: 0.25, velocity: 0, grounded: true });
  });
});
