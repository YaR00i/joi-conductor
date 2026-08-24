import { describe, expect, it } from "vitest";
import {
  parsePixelPaletteText,
  pushRecentPixelColor,
  replacePixelPaletteColor,
  serializePixelPalette,
} from "./pixelPalette";

describe("pixel palette", () => {
  it("imports common text and JSON-like palettes safely", () => {
    expect(parsePixelPaletteText('["#abc", "#112233", transparent, #112233ff, #ffffff80]')).toEqual([
      "#aabbcc",
      "#112233",
      "#00000000",
    ]);
    expect(serializePixelPalette(["#AABBCC", "#00000000"])).toBe(
      "#aabbcc\n#00000000",
    );
  });

  it("keeps recent colors unique and newest first", () => {
    expect(pushRecentPixelColor(["#112233", "#445566"], "#445566", 2)).toEqual([
      "#445566",
      "#112233",
    ]);
  });

  it("replaces only selected pixels and respects tolerance", () => {
    const pixels = ["#111111", "#121212", "#ffffff", "#111111"];
    const result = replacePixelPaletteColor(
      pixels,
      2,
      2,
      "#111111",
      "#abcdef",
      2,
      { rect: { x: 0, y: 0, w: 2, h: 1 } },
    );
    expect(result.count).toBe(2);
    expect(result.pixels).toEqual(["#abcdef", "#abcdef", "#ffffff", "#111111"]);
  });
});
