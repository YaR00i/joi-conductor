import { describe, expect, it } from "vitest";
import {
  copyPixelArt,
  copyPixelArtChannels,
  pastePixelArt,
  pastePixelArtChannels,
} from "./pixelClipboard";

describe("pixelClipboard channels", () => {
  it("copyPixelArt still pastes color only", () => {
    copyPixelArt(["#aa0000", "", "", "#00aa00"], 2, 2);
    expect(pastePixelArt(2, 2)).toEqual(["#aa0000", "", "", "#00aa00"]);
    const ch = pastePixelArtChannels(2, 2);
    expect(ch?.pixels).toEqual(["#aa0000", "", "", "#00aa00"]);
    expect(ch?.emissivePixels).toBeUndefined();
    expect(ch?.shinePixels).toBeUndefined();
  });

  it("copy/paste keeps glow and shine aligned when the canvas grows", () => {
    copyPixelArtChannels(2, 2, {
      pixels: ["#111111", "#222222", "", ""],
      emissivePixels: ["#ffee88", "", "", ""],
      shinePixels: ["", "#88ccff", "", ""],
    });
    const ch = pastePixelArtChannels(4, 3);
    expect(ch).not.toBeNull();
    expect(ch!.pixels[0]).toBe("#111111");
    expect(ch!.pixels[1]).toBe("#222222");
    expect(ch!.pixels[4]).toBe("");
    expect(ch!.emissivePixels?.[0]).toBe("#ffee88");
    expect(ch!.emissivePixels?.[1]).toBe("");
    expect(ch!.shinePixels?.[1]).toBe("#88ccff");
    expect(ch!.emissivePixels).toHaveLength(12);
    expect(ch!.shinePixels).toHaveLength(12);
  });
});
