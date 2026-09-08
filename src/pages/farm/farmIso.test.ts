import { describe, expect, it } from "vitest";
import {
  FIELD_OX,
  FIELD_OY,
  fieldToWorld,
  isoActorDepth,
  isoFloorDepth,
  isoOrigin,
  isoToScreen,
  screenToIso,
  worldToField,
} from "./farmIso";

describe("farm isometric projection", () => {
  it("round-trips tile centers", () => {
    const origin = isoOrigin(20, 16);
    for (const [col, row] of [
      [0, 0],
      [3, 5],
      [9.25, 2.5],
    ] as const) {
      const s = isoToScreen(col, row, origin.x, origin.y);
      const back = screenToIso(s.x, s.y, origin.x, origin.y);
      expect(back.col).toBeCloseTo(col, 6);
      expect(back.row).toBeCloseTo(row, 6);
    }
  });

  it("maps field tiles onto the decorative map", () => {
    const w = fieldToWorld(2, 4);
    expect(w.col).toBe(2 + FIELD_OX);
    expect(w.row).toBe(4 + FIELD_OY);
    expect(worldToField(w.col, w.row)).toEqual({ tx: 2, ty: 4 });
  });

  it("keeps actors above every floor cube", () => {
    expect(isoActorDepth(0, 0, 0)).toBeGreaterThan(isoFloorDepth(40, 40));
  });
});
