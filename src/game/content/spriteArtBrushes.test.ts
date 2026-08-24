import { describe, expect, it } from "vitest";
import { stampArtBrush } from "./spriteArtBrushes";
import { emptySpritePixels } from "./pixelSprite";

function rgb(hex: string): { r: number; g: number; b: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

describe("sprite art brushes", () => {
  it("keeps hue when softening into a different neighbor", () => {
    const width = 3;
    const height = 3;
    const pixels = emptySpritePixels(width, height);
    for (let i = 0; i < pixels.length; i++) pixels[i] = "#3344cc";
    pixels[4] = "#cc3333";
    const { pixels: next, changed } = stampArtBrush(
      pixels,
      width,
      height,
      1,
      1,
      1,
      "soften",
    );
    expect(changed).toBe(true);
    const c = rgb(next[4]!);
    expect(c.r).toBeGreaterThan(c.b);
  });

  it("darkens burn and lightens dodge without emptying the cell", () => {
    const width = 2;
    const height = 1;
    const pixels = ["#c08080", "#c08080"];
    const burned = stampArtBrush(pixels, width, height, 0, 0, 1, "burn");
    const dodged = stampArtBrush(pixels, width, height, 0, 0, 1, "dodge");
    expect(burned.changed).toBe(true);
    expect(dodged.changed).toBe(true);
    const src = rgb("#c08080");
    const dark = rgb(burned.pixels[0]!);
    const light = rgb(dodged.pixels[0]!);
    expect(dark.r + dark.g + dark.b).toBeLessThan(src.r + src.g + src.b);
    expect(light.r + light.g + light.b).toBeGreaterThan(src.r + src.g + src.b);
  });

  it("pulls neighbor color when smudging into an empty cell", () => {
    const width = 2;
    const height = 1;
    const pixels = ["#ff4400", ""];
    const { pixels: next, changed } = stampArtBrush(
      pixels,
      width,
      height,
      1,
      0,
      1,
      "smudge",
      0,
      0,
    );
    expect(changed).toBe(true);
    expect(next[1]).toBe("#ff4400");
  });
});
