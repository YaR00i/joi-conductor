import { describe, expect, it } from "vitest";
import {
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
