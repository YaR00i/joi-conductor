import { describe, expect, it } from "vitest";
import {
  adjustPixelColors,
  outlinePixelColors,
  quantizePixelColors,
} from "./pixelColorOperations";

describe("pixel color operations", () => {
  it("adjusts only opaque pixels inside the selection", () => {
    const result = adjustPixelColors(
      ["#ff0000", "#00ff00", "", "#0000ff"],
      2,
      2,
      { hue: 120, saturation: 0, brightness: 0, contrast: 0 },
      { rect: { x: 0, y: 0, w: 1, h: 2 } },
    );
    expect(result.pixels).toEqual(["#00ff00", "#00ff00", "", "#0000ff"]);
    expect(result.count).toBe(1);
  });

  it("reduces colors and preserves alpha and pixels outside the selection", () => {
    const result = quantizePixelColors(
      ["#100000", "#500000", "#a0000080", "#f00000"],
      4,
      1,
      2,
      "none",
      0,
      { rect: { x: 0, y: 0, w: 3, h: 1 } },
    );
    expect(new Set(result.pixels.slice(0, 3).map((color) => color.slice(0, 7))).size).toBeLessThanOrEqual(2);
    expect(result.pixels[2]).toMatch(/80$/);
    expect(result.pixels[3]).toBe("#f00000");
  });

  it("makes deterministic ordered and Floyd-Steinberg dithering", () => {
    const pixels = ["#111111", "#555555", "#999999", "#eeeeee"];
    const ordered = quantizePixelColors(pixels, 4, 1, 2, "ordered", 70);
    const floyd = quantizePixelColors(pixels, 4, 1, 2, "floyd", 70);
    expect(ordered.palette).toHaveLength(2);
    expect(floyd.palette).toEqual(ordered.palette);
    expect(quantizePixelColors(pixels, 4, 1, 2, "ordered", 70).pixels).toEqual(ordered.pixels);
    expect(quantizePixelColors(pixels, 4, 1, 2, "floyd", 70).pixels).toEqual(floyd.pixels);
  });

  it("adds a bounded outside outline and respects selection masks", () => {
    const pixels = new Array(9).fill("") as string[];
    pixels[4] = "#ffffff";
    const result = outlinePixelColors(
      pixels,
      3,
      3,
      "#ff0000",
      1,
      false,
      { rect: { x: 0, y: 0, w: 3, h: 3 }, mask: [false, true, false, true, true, true, false, false, false] },
    );
    expect(result.count).toBe(3);
    expect(result.pixels).toEqual(["", "#ff0000", "", "#ff0000", "#ffffff", "#ff0000", "", "", ""]);
  });

  it("treats explicit transparent colors as empty outline targets", () => {
    const result = outlinePixelColors(
      ["#00000000", "#ffffff", "#00000000"],
      3,
      1,
      "#123456",
    );
    expect(result.pixels).toEqual(["#123456", "#ffffff", "#123456"]);
    expect(result.count).toBe(2);
  });
});
