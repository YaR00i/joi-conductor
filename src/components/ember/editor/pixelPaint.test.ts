import { describe, expect, it } from "vitest";
import {
  blendPixelColor,
  extendPixelStroke,
  paintPixelBrush,
  paintPixelBrushStroke,
} from "./pixelPaint";
import { paintPixelFill } from "./pixelPaint";
import { mirroredPixelPoints, mirroredPixelSegments } from "./pixelSymmetry";

describe("pixel symmetry", () => {
  it("deduplicates points on the symmetry axes", () => {
    expect(mirroredPixelPoints({ x: 2, y: 1 }, 5, 3, { horizontal: true, vertical: true })).toEqual([
      { x: 2, y: 1 },
    ]);
  });

  it("mirrors both ends of a segment", () => {
    expect(mirroredPixelSegments({ x: 0, y: 1 }, { x: 2, y: 2 }, 4, 5, { horizontal: true, vertical: false })).toEqual([
      { start: { x: 0, y: 1 }, end: { x: 2, y: 2 } },
      { start: { x: 3, y: 1 }, end: { x: 1, y: 2 } },
    ]);
  });
});

describe("pixel paint", () => {
  it("stamps a mirrored brush without duplicate side effects", () => {
    expect(paintPixelBrush(new Array(5).fill(""), 5, 1, { x: 1, y: 0 }, "x", 1, { horizontal: true, vertical: false })).toEqual({
      pixels: ["", "x", "", "x", ""],
      changed: true,
    });
  });

  it("keeps even brush sizes exactly symmetric", () => {
    expect(paintPixelBrush(new Array(6).fill(""), 6, 1, { x: 1, y: 0 }, "x", 2, { horizontal: true, vertical: false }).pixels).toEqual([
      "", "x", "x", "x", "x", "",
    ]);
  });

  it("interpolates spacing and removes a redundant pixel-perfect corner", () => {
    const empty = { points: [], last: null, distance: 0 };
    const first = extendPixelStroke(empty, { x: 0, y: 0 }, 1, true);
    const horizontal = extendPixelStroke(first, { x: 1, y: 0 }, 1, true);
    expect(extendPixelStroke(horizontal, { x: 1, y: 1 }, 1, true).points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(extendPixelStroke(empty, { x: 0, y: 0 }, 2, false).points).toEqual([{ x: 0, y: 0 }]);
    expect(extendPixelStroke({ points: [{ x: 0, y: 0 }], last: { x: 0, y: 0 }, distance: 0 }, { x: 4, y: 0 }, 2, false).points).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 4, y: 0 },
    ]);
  });

  it("blends opacity once over the complete stroke mask", () => {
    expect(blendPixelColor("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(blendPixelColor("#ff0000", "", 0.5)).toBe("#ff000080");
    expect(
      paintPixelBrushStroke(["#000000"], 1, 1, [{ x: 0, y: 0 }, { x: 0, y: 0 }], "#ffffff", 1, undefined, { opacity: 0.5 }).pixels,
    ).toEqual(["#808080"]);
  });

  it("applies a stable Bayer dithering pattern", () => {
    expect(
      paintPixelBrushStroke(new Array(16).fill(""), 4, 4, [{ x: 1, y: 1 }], "x", 4, undefined, { ditherCoverage: 50 }).pixels,
    ).toEqual([
      "x", "", "x", "",
      "", "x", "", "x",
      "x", "", "x", "",
      "", "x", "", "x",
    ]);
  });

  it("fills one connected color region", () => {
    expect(paintPixelFill(["#000", "#000", "#fff", "#000", "#fff", "#fff"], 3, 2, { x: 0, y: 0 }, "#f00")).toEqual({
      pixels: ["#f00", "#f00", "#fff", "#f00", "#fff", "#fff"],
      changed: true,
    });
  });

  it("can fill all matching regions and mirrored seeds", () => {
    const source = ["#000", "#fff", "#000", "#f00", "#fff", "#f00"];
    expect(paintPixelFill(source, 3, 2, { x: 0, y: 0 }, "#0f0", 0, false)).toEqual({
      pixels: ["#0f0", "#fff", "#0f0", "#f00", "#fff", "#f00"],
      changed: true,
    });
    expect(paintPixelFill(source, 3, 2, { x: 0, y: 0 }, "#0f0", 0, true, { horizontal: false, vertical: true })).toEqual({
      pixels: ["#0f0", "#fff", "#000", "#0f0", "#fff", "#f00"],
      changed: true,
    });
  });
});
