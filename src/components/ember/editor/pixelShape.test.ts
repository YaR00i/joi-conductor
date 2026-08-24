import { describe, expect, it } from "vitest";
import {
  constrainPixelShapeEnd,
  paintPixelShape,
  rasterPixelShape,
} from "./pixelShape";

describe("pixelShape", () => {
  it("rasterizes a one-pixel Bresenham line", () => {
    expect(rasterPixelShape("line", { x: 0, y: 0 }, { x: 3, y: 2 }, 4, 3)).toEqual([
      true, false, false, false,
      false, true, true, false,
      false, false, false, true,
    ]);
  });

  it("draws outline and filled rectangles", () => {
    expect(rasterPixelShape("rect", { x: 0, y: 0 }, { x: 2, y: 2 }, 3, 3)).toEqual([
      true, true, true,
      true, false, true,
      true, true, true,
    ]);
    expect(rasterPixelShape("rect", { x: 0, y: 0 }, { x: 2, y: 2 }, 3, 3, 1, true)).toEqual(
      new Array(9).fill(true),
    );
  });

  it("creates a symmetric pixel ellipse", () => {
    expect(rasterPixelShape("ellipse", { x: 0, y: 0 }, { x: 4, y: 4 }, 5, 5)).toEqual([
      false, false, true, false, false,
      false, true, false, true, false,
      true, false, false, false, true,
      false, true, false, true, false,
      false, false, true, false, false,
    ]);
  });

  it("snaps lines to eight directions and boxes to squares", () => {
    expect(constrainPixelShapeEnd("line", { x: 2, y: 2 }, { x: 6, y: 3 }, true)).toEqual({ x: 6, y: 2 });
    expect(constrainPixelShapeEnd("line", { x: 2, y: 2 }, { x: 5, y: 4 }, true)).toEqual({ x: 5, y: 5 });
    expect(constrainPixelShapeEnd("rect", { x: 2, y: 2 }, { x: 5, y: 4 }, true)).toEqual({ x: 5, y: 5 });
  });

  it("paints only the shape and reports no-op previews", () => {
    const first = paintPixelShape(new Array(4).fill(""), 2, 2, "line", { x: 0, y: 0 }, { x: 1, y: 1 }, "x");
    expect(first).toEqual({ pixels: ["x", "", "", "x"], changed: true });
    expect(paintPixelShape(first.pixels, 2, 2, "line", { x: 0, y: 0 }, { x: 1, y: 1 }, "x").changed).toBe(false);
  });

  it("mirrors complete shapes across the canvas", () => {
    expect(
      paintPixelShape(
        new Array(5).fill(""),
        5,
        1,
        "line",
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        "x",
        1,
        false,
        { horizontal: true, vertical: false },
      ).pixels,
    ).toEqual(["x", "x", "", "x", "x"]);
  });

  it("keeps mirrored shapes symmetric with an even thickness", () => {
    expect(
      paintPixelShape(
        new Array(6).fill(""),
        6,
        1,
        "line",
        { x: 1, y: 0 },
        { x: 1, y: 0 },
        "x",
        2,
        false,
        { horizontal: true, vertical: false },
      ).pixels,
    ).toEqual(["", "x", "x", "x", "x", ""]);
  });
});
