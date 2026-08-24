import { describe, expect, it } from "vitest";
import {
  clearPixelSelection,
  combinePixelSelections,
  duplicatePixelSelection,
  extractPixelSelection,
  invertPixelSelection,
  magicWandSelection,
  movePixelSelection,
  pixelColorDistance,
  pixelRectFromPoints,
  pixelRectFromScaleHandle,
  pixelSelectionFromPolygon,
  resizePixelSelection,
  transformPixelSelection,
} from "./pixelSelection";

describe("pixelSelection", () => {
  it("normalizes a dragged rectangle", () => {
    expect(pixelRectFromPoints({ x: 3, y: 4 }, { x: 1, y: 2 }, 8, 8)).toEqual({
      x: 1,
      y: 2,
      w: 3,
      h: 3,
    });
  });

  it("extracts and clears every pixel channel", () => {
    const channels = {
      pixels: ["a", "b", "c", "d"],
      emissivePixels: ["1", "2", "3", "4"],
      shinePixels: ["x", "y", "z", "w"],
    };
    const rect = { x: 1, y: 0, w: 1, h: 2 };
    expect(extractPixelSelection(channels, 2, 2, rect)).toMatchObject({
      width: 1,
      height: 2,
      pixels: ["b", "d"],
      emissivePixels: ["2", "4"],
      shinePixels: ["y", "w"],
    });
    expect(clearPixelSelection(channels, 2, 2, rect).pixels).toEqual(["a", "", "c", ""]);
  });

  it("moves a selection without destroying overlap", () => {
    const moved = movePixelSelection(
      { pixels: ["a", "b", "c", "d", "e", "f"] },
      3,
      2,
      { x: 0, y: 0, w: 2, h: 1 },
      1,
      1,
    );
    expect(moved.rect).toEqual({ x: 1, y: 1, w: 2, h: 1 });
    expect(moved.channels.pixels).toEqual(["", "", "c", "d", "a", "b"]);
  });

  it("rotates a rectangular selection clockwise", () => {
    const rotated = transformPixelSelection(
      {
        pixels: [
          "a", "b", "c", "",
          "d", "e", "f", "",
          "", "", "", "",
          "", "", "", "",
        ],
      },
      4,
      4,
      { x: 0, y: 0, w: 3, h: 2 },
      "rotate_cw",
    );
    expect(rotated.rect).toEqual({ x: 0, y: 0, w: 2, h: 3 });
    expect(rotated.channels.pixels.slice(0, 12)).toEqual([
      "d", "a", "", "",
      "e", "b", "", "",
      "f", "c", "", "",
    ]);
  });

  it("keeps the opposite corner fixed while sizing from a handle", () => {
    const rect = { x: 2, y: 2, w: 3, h: 2 };
    expect(pixelRectFromScaleHandle(rect, "nw", { x: 1, y: 0 }, 8, 8)).toEqual({
      x: 1,
      y: 0,
      w: 4,
      h: 4,
    });
    expect(pixelRectFromScaleHandle(rect, "se", { x: 6, y: 5 }, 8, 8)).toEqual({
      x: 2,
      y: 2,
      w: 5,
      h: 4,
    });
  });

  it("preserves selection proportions with the aspect modifier", () => {
    expect(
      pixelRectFromScaleHandle({ x: 1, y: 1, w: 2, h: 2 }, "se", { x: 5, y: 3 }, 8, 8, true),
    ).toEqual({ x: 1, y: 1, w: 5, h: 5 });
  });

  it("resizes all channels using nearest-neighbor pixels", () => {
    const resized = resizePixelSelection(
      {
        pixels: ["a", "b", "", "", "c", "d", "", ""],
        emissivePixels: ["1", "2", "", "", "3", "4", "", ""],
        shinePixels: ["x", "y", "", "", "z", "w", "", ""],
      },
      4,
      2,
      { x: 0, y: 0, w: 2, h: 2 },
      { x: 0, y: 0, w: 4, h: 2 },
    );
    expect(resized.channels.pixels).toEqual(["a", "a", "b", "b", "c", "c", "d", "d"]);
    expect(resized.channels.emissivePixels).toEqual(["1", "1", "2", "2", "3", "3", "4", "4"]);
    expect(resized.channels.shinePixels).toEqual(["x", "x", "y", "y", "z", "z", "w", "w"]);
  });

  it("rasterizes a freehand polygon into a local pixel mask", () => {
    const selection = pixelSelectionFromPolygon(
      [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }],
      4,
      4,
    );
    expect(selection?.rect).toEqual({ x: 0, y: 0, w: 3, h: 3 });
    expect(selection?.mask).toEqual([
      true, true, true,
      true, true, false,
      true, false, false,
    ]);
  });

  it("moves only masked pixels and preserves cells outside the lasso", () => {
    const moved = movePixelSelection(
      { pixels: ["a", "b", "x", "y", "c", "d", "z", "w"] },
      4,
      2,
      { x: 0, y: 0, w: 2, h: 2 },
      2,
      0,
      [true, false, false, true],
    );
    expect(moved.channels.pixels).toEqual(["", "b", "a", "y", "c", "", "z", "d"]);
    expect(moved.mask).toEqual([true, false, false, true]);
  });

  it("scales a lasso mask together with its pixel channels", () => {
    const resized = resizePixelSelection(
      { pixels: ["a", "b", "", "", "c", "d", "", ""] },
      4,
      2,
      { x: 0, y: 0, w: 2, h: 2 },
      { x: 0, y: 0, w: 4, h: 2 },
      [true, false, false, true],
    );
    expect(resized.mask).toEqual([true, true, false, false, false, false, true, true]);
    expect(resized.channels.pixels).toEqual(["a", "a", "", "", "c", "", "d", "d"]);
  });

  it("selects only the connected color island by default", () => {
    const pixels = ["#ff0000", "#ff0000", "#0000ff", "#ff0000", "#0000ff", "#ff0000"];
    expect(magicWandSelection(pixels, 3, 2, { x: 0, y: 0 }, 0, true)).toEqual({
      rect: { x: 0, y: 0, w: 2, h: 2 },
      mask: [true, true, true, false],
    });
    expect(magicWandSelection(pixels, 3, 2, { x: 0, y: 0 }, 0, false)).toEqual({
      rect: { x: 0, y: 0, w: 3, h: 2 },
      mask: [true, true, false, true, false, true],
    });
  });

  it("compares transparent pixels by alpha and supports color tolerance", () => {
    expect(pixelColorDistance("", "#ffffff00")).toBe(0);
    const exact = magicWandSelection(["#202020", "#252525"], 2, 1, { x: 0, y: 0 }, 0);
    const tolerant = magicWandSelection(["#202020", "#252525"], 2, 1, { x: 0, y: 0 }, 5);
    expect(exact?.rect).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(tolerant?.rect).toEqual({ x: 0, y: 0, w: 2, h: 1 });
  });

  it("adds and subtracts magic-wand masks", () => {
    const first = { rect: { x: 0, y: 0, w: 2, h: 1 } };
    const second = { rect: { x: 1, y: 0, w: 2, h: 1 } };
    expect(combinePixelSelections(first, second, "add", 3, 1)).toEqual({
      rect: { x: 0, y: 0, w: 3, h: 1 },
      mask: undefined,
    });
    expect(combinePixelSelections(first, second, "subtract", 3, 1)).toEqual({
      rect: { x: 0, y: 0, w: 1, h: 1 },
      mask: undefined,
    });
  });

  it("inverts an arbitrary selection mask", () => {
    expect(
      invertPixelSelection(
        { rect: { x: 1, y: 0, w: 1, h: 1 } },
        3,
        1,
      ),
    ).toEqual({
      rect: { x: 0, y: 0, w: 3, h: 1 },
      mask: [true, false, true],
    });
    expect(invertPixelSelection(null, 2, 2)).toEqual({
      rect: { x: 0, y: 0, w: 2, h: 2 },
      mask: undefined,
    });
  });

  it("duplicates only masked pixels without clearing the source", () => {
    const duplicated = duplicatePixelSelection(
      { pixels: ["a", "b", "x", "y", "c", "d", "z", "w"] },
      4,
      2,
      { x: 0, y: 0, w: 2, h: 2 },
      1,
      0,
      [true, false, false, true],
    );
    expect(duplicated.rect).toEqual({ x: 1, y: 0, w: 2, h: 2 });
    expect(duplicated.mask).toEqual([true, false, false, true]);
    expect(duplicated.channels.pixels).toEqual(["a", "a", "x", "y", "c", "d", "d", "w"]);
  });
});
