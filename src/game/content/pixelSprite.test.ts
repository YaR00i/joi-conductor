import { describe, expect, it } from "vitest";
import {
  composeSpriteForFrame,
  composeSpriteForView,
  emptySpritePixels,
  flattenSpriteForEditor,
  matchChannelSize,
  normalizePixelSprite,
  prunePaletteFavorites,
  resizeSpriteCanvas,
  serializePixelSprite,
  spriteHasAnimFrames,
  spriteHasExtraCardViews,
  spriteTotalHeight,
} from "./pixelSprite";
import {
  nextSpritePreviewIndex,
  normalizeSpriteFrameRange,
  spriteFrameIndexAt,
} from "./spriteAnimFrames";
import type { EmberPixelSprite } from "./types";

function paintAt(
  pixels: string[],
  width: number,
  x: number,
  y: number,
  color: string,
): void {
  pixels[y * width + x] = color;
}

function baseSprite(
  partial: Partial<EmberPixelSprite> &
    Pick<EmberPixelSprite, "width" | "topHeight" | "wallHeights" | "pixels">,
): EmberPixelSprite {
  return {
    id: "spr_test",
    color: "#c45c26",
    ...partial,
  };
}

describe("pixelSprite canvas", () => {
  it("keeps emissive and shine aligned when width grows", () => {
    const width = 8;
    const height = 6;
    const pixels = emptySpritePixels(width, height);
    const emissivePixels = emptySpritePixels(width, height);
    const shinePixels = emptySpritePixels(width, height);
    paintAt(pixels, width, 7, 2, "#ffaa00");
    paintAt(emissivePixels, width, 7, 2, "#ffee88");
    paintAt(shinePixels, width, 7, 2, "#88ccff");
    const next = resizeSpriteCanvas(
      baseSprite({
        width,
        topHeight: height,
        wallHeights: [],
        pixels,
        emissivePixels,
        shinePixels,
      }),
      12,
      height,
    );
    expect(next.width).toBe(12);
    expect(next.topHeight).toBe(height);
    expect(next.wallHeights).toEqual([]);
    expect(next.pixels[2 * 12 + 7]).toBe("#ffaa00");
    expect(next.emissivePixels?.[2 * 12 + 7]).toBe("#ffee88");
    expect(next.shinePixels?.[2 * 12 + 7]).toBe("#88ccff");
    expect(next.pixels[2 * 12 + 11]).toBe("");
  });

  it("serializes a flat sprite round-trip with empty walls", () => {
    const width = 16;
    const height = 48;
    const pixels = emptySpritePixels(width, height);
    paintAt(pixels, width, 3, 10, "#112233");
    const saved = serializePixelSprite(
      flattenSpriteForEditor(
        baseSprite({
          width,
          topHeight: height,
          wallHeights: [],
          pixels,
        }),
      ),
    );
    expect(saved.wallHeights).toEqual([]);
    expect(saved.topHeight).toBe(height);
    expect(saved.pixels.length).toBe(width * height);
    const again = normalizePixelSprite(saved);
    expect(again.width).toBe(width);
    expect(again.topHeight).toBe(height);
    expect(again.wallHeights).toEqual([]);
    expect(again.pixels.length).toBe(width * height);
    expect(again.pixels[10 * width + 3]).toBe("#112233");
  });

  it("normalizes legacy top+wall into a paintable total height", () => {
    const width = 8;
    const topHeight = 4;
    const wallHeights = [10];
    const totalH = topHeight + wallHeights[0]!;
    const pixels = emptySpritePixels(width, totalH);
    paintAt(pixels, width, 1, 0, "#aabbcc");
    paintAt(pixels, width, 2, 5, "#445566");
    const n = normalizePixelSprite({
      id: "spr_legacy",
      color: "#c45c26",
      width,
      topHeight,
      wallHeights,
      pixels,
    });
    expect(n.topHeight).toBe(topHeight);
    expect(n.wallHeights).toEqual(wallHeights);
    expect(spriteTotalHeight(n)).toBe(totalH);
    expect(n.pixels.length).toBe(width * totalH);
    expect(n.pixels[0 * width + 1]).toBe("#aabbcc");
    expect(n.pixels[5 * width + 2]).toBe("#445566");
    const flat = flattenSpriteForEditor(n);
    expect(flat.topHeight).toBe(totalH);
    expect(flat.wallHeights).toEqual([]);
    expect(flat.pixels.length).toBe(width * totalH);
    expect(flat.pixels[5 * width + 2]).toBe("#445566");
  });

  it("matchChannelSize fits glow from source stride, not destination width", () => {
    const srcW = 8;
    const srcH = 6;
    const glow = emptySpritePixels(srcW, srcH);
    paintAt(glow, srcW, 7, 2, "#ffee88");
    const next = matchChannelSize(glow, srcW, srcH, 12, srcH);
    expect(next.length).toBe(12 * srcH);
    expect(next[2 * 12 + 7]).toBe("#ffee88");
    expect(next[2 * 12 + 11]).toBe("");
  });

  it("matchChannelSize yields an empty dst buffer when the source has no ink", () => {
    const blank = emptySpritePixels(8, 6);
    const next = matchChannelSize(blank, 8, 6, 10, 8);
    expect(next.length).toBe(80);
    expect(next.every((c) => !c)).toBe(true);
  });

  it("round-trips extra card views and falls back to front when missing", () => {
    const width = 8;
    const height = 8;
    const pixels = emptySpritePixels(width, height);
    const backPixels = emptySpritePixels(width, height);
    paintAt(pixels, width, 1, 1, "#112233");
    paintAt(backPixels, width, 6, 2, "#445566");
    const saved = serializePixelSprite(
      flattenSpriteForEditor(
        baseSprite({
          width,
          topHeight: height,
          wallHeights: [],
          pixels,
          views: {
            back: { pixels: backPixels },
          },
        }),
      ),
    );
    expect(saved.views?.back?.pixels[2 * width + 6]).toBe("#445566");
    const loaded = normalizePixelSprite(saved);
    expect(loaded.views?.back?.pixels[2 * width + 6]).toBe("#445566");
    expect(composeSpriteForView(loaded, "front").pixels[1 * width + 1]).toBe(
      "#112233",
    );
    expect(composeSpriteForView(loaded, "back").pixels[2 * width + 6]).toBe(
      "#445566",
    );
    expect(composeSpriteForView(loaded, "side_l").pixels[1 * width + 1]).toBe(
      "#112233",
    );
    expect(spriteHasExtraCardViews(loaded)).toBe(true);
    const grown = resizeSpriteCanvas(loaded, 12, height);
    expect(grown.views?.back?.pixels[2 * 12 + 6]).toBe("#445566");
  });

  it("collapses a color-picker drag trail into one favorite", () => {
    const trail = [
      "#c45c26",
      "#c55d27",
      "#c65e28",
      "#c75f29",
      "#c8602a",
      "#6080a0",
    ];
    const next = prunePaletteFavorites(trail);
    expect(next).toEqual(["#c8602a", "#6080a0"]);
  });

  it("composites two art layers into pixels and omits a lone opaque layer on save", () => {
    const width = 4;
    const height = 4;
    const bottom = emptySpritePixels(width, height);
    const top = emptySpritePixels(width, height);
    paintAt(bottom, width, 1, 1, "#112233");
    paintAt(top, width, 1, 1, "#445566");
    const saved = serializePixelSprite(
      flattenSpriteForEditor(
        baseSprite({
          width,
          topHeight: height,
          wallHeights: [],
          pixels: emptySpritePixels(width, height),
          artLayers: [
            { id: "lyr_a", nameRu: "Низ", pixels: bottom },
            { id: "lyr_b", nameRu: "Верх", pixels: top },
          ],
        }),
      ),
    );
    expect(saved.artLayers?.length).toBe(2);
    expect(saved.pixels[1 * width + 1]).toBe("#445566");
    const loaded = normalizePixelSprite(saved);
    expect(loaded.pixels[1 * width + 1]).toBe("#445566");
    expect(loaded.artLayers?.length).toBe(2);

    const single = serializePixelSprite(
      flattenSpriteForEditor(
        baseSprite({
          width,
          topHeight: height,
          wallHeights: [],
          pixels: [...bottom],
          artLayers: [{ id: "lyr_only", pixels: [...bottom] }],
        }),
      ),
    );
    expect(single.artLayers).toBeUndefined();
    expect(single.pixels[1 * width + 1]).toBe("#112233");
  });

  it("resizes art layer ink with the canvas", () => {
    const width = 8;
    const height = 6;
    const layerPx = emptySpritePixels(width, height);
    paintAt(layerPx, width, 7, 2, "#ffaa00");
    const next = resizeSpriteCanvas(
      baseSprite({
        width,
        topHeight: height,
        wallHeights: [],
        pixels: emptySpritePixels(width, height),
        artLayers: [{ id: "lyr_ink", pixels: layerPx }],
      }),
      12,
      height,
    );
    expect(next.pixels[2 * 12 + 7]).toBe("#ffaa00");
    expect(next.artLayers?.[0]?.pixels[2 * 12 + 7]).toBe("#ffaa00");
    expect(next.pixels[2 * 12 + 11]).toBe("");
  });
});

describe("pixelSprite frames", () => {
  it("clamps preview ranges and stops or loops at their end", () => {
    expect(normalizeSpriteFrameRange(5, -3, 99)).toEqual({ start: 0, end: 4 });
    expect(normalizeSpriteFrameRange(5, 3, 1)).toEqual({ start: 3, end: 3 });
    expect(nextSpritePreviewIndex(5, 1, 1, 3, true)).toBe(2);
    expect(nextSpritePreviewIndex(5, 3, 1, 3, true)).toBe(1);
    expect(nextSpritePreviewIndex(5, 3, 1, 3, false)).toBe(-1);
    expect(nextSpritePreviewIndex(5, 4, 1, 3, true)).toBe(1);
  });

  it("normalizes and round-trips the visual world offset", () => {
    const sprite = baseSprite({
      width: 8,
      topHeight: 8,
      wallHeights: [],
      pixels: emptySpritePixels(8, 8),
      worldOffsetVoxels: { x: 1.257, y: -2.5, z: 4 },
    });
    const saved = serializePixelSprite(sprite);
    expect(saved.worldOffsetVoxels).toEqual({ x: 1.26, y: -2.5, z: 4 });
    expect(normalizePixelSprite(saved).worldOffsetVoxels).toEqual({
      x: 1.26,
      y: -2.5,
      z: 4,
    });
    expect(normalizePixelSprite({
      ...sprite,
      worldOffsetVoxels: { x: 0, y: 0, z: 0 },
    }).worldOffsetVoxels).toBeUndefined();
  });

  it("wraps spriteFrameIndexAt around the cycle", () => {
    expect(spriteFrameIndexAt([100, 50], 0)).toBe(0);
    expect(spriteFrameIndexAt([100, 50], 99)).toBe(0);
    expect(spriteFrameIndexAt([100, 50], 100)).toBe(1);
    expect(spriteFrameIndexAt([100, 50], 149)).toBe(1);
    expect(spriteFrameIndexAt([100, 50], 150)).toBe(0);
    expect(spriteFrameIndexAt([100, 50], -1)).toBe(1);
  });

  it("omits a lone frame on serialize", () => {
    const width = 4;
    const height = 4;
    const pixels = emptySpritePixels(width, height);
    paintAt(pixels, width, 1, 1, "#112233");
    const saved = serializePixelSprite(
      flattenSpriteForEditor(
        baseSprite({
          width,
          topHeight: height,
          wallHeights: [],
          pixels,
          frames: [
            {
              id: "frm_only",
              durationMs: 120,
              pixels: [...pixels],
            },
          ],
        }),
      ),
    );
    expect(saved.frames).toBeUndefined();
    expect(saved.pixels[1 * width + 1]).toBe("#112233");
  });

  it("round-trips two frames with duration and an extra view", () => {
    const width = 8;
    const height = 8;
    const a = emptySpritePixels(width, height);
    const b = emptySpritePixels(width, height);
    const backB = emptySpritePixels(width, height);
    paintAt(a, width, 1, 1, "#112233");
    paintAt(b, width, 2, 3, "#445566");
    paintAt(backB, width, 6, 2, "#778899");
    const saved = serializePixelSprite(
      flattenSpriteForEditor(
        baseSprite({
          width,
          topHeight: height,
          wallHeights: [],
          pixels: a,
          frames: [
            { id: "frm_a", durationMs: 80, pixels: a },
            {
              id: "frm_b",
              durationMs: 160,
              pixels: b,
              views: { back: { pixels: backB } },
            },
          ],
        }),
      ),
    );
    expect(saved.frames).toHaveLength(2);
    expect(saved.frames?.[1]?.durationMs).toBe(160);
    expect(saved.frames?.[1]?.views?.back?.pixels[2 * width + 6]).toBe(
      "#778899",
    );
    const loaded = normalizePixelSprite(saved);
    expect(spriteHasAnimFrames(loaded)).toBe(true);
    expect(loaded.pixels[1 * width + 1]).toBe("#112233");
    expect(composeSpriteForFrame(loaded, 1).pixels[3 * width + 2]).toBe(
      "#445566",
    );
    expect(
      composeSpriteForView(composeSpriteForFrame(loaded, 1), "back").pixels[
        2 * width + 6
      ],
    ).toBe("#778899");
  });

  it("keeps ink on a later frame when the canvas grows", () => {
    const width = 8;
    const height = 6;
    const a = emptySpritePixels(width, height);
    const b = emptySpritePixels(width, height);
    paintAt(a, width, 1, 1, "#112233");
    paintAt(b, width, 7, 2, "#ffaa00");
    const next = resizeSpriteCanvas(
      baseSprite({
        width,
        topHeight: height,
        wallHeights: [],
        pixels: a,
        frames: [
          { id: "frm_a", pixels: a },
          { id: "frm_b", pixels: b },
        ],
      }),
      12,
      height,
    );
    expect(next.frames?.[1]?.pixels[2 * 12 + 7]).toBe("#ffaa00");
    expect(composeSpriteForFrame(next, 1).pixels[2 * 12 + 7]).toBe("#ffaa00");
  });

  it("composites an art layer on a later cel", () => {
    const width = 4;
    const height = 4;
    const a = emptySpritePixels(width, height);
    const cel = emptySpritePixels(width, height);
    const overlay = emptySpritePixels(width, height);
    paintAt(a, width, 0, 0, "#111111");
    paintAt(cel, width, 1, 1, "#222222");
    paintAt(overlay, width, 1, 1, "#abcdef");
    const loaded = normalizePixelSprite(
      flattenSpriteForEditor(
        baseSprite({
          width,
          topHeight: height,
          wallHeights: [],
          pixels: a,
          frames: [
            { id: "frm_a", pixels: a },
            {
              id: "frm_b",
              pixels: cel,
              artLayers: [{ id: "lyr_cel", pixels: overlay }],
            },
          ],
        }),
      ),
    );
    expect(composeSpriteForFrame(loaded, 1).pixels[1 * width + 1]).toBe(
      "#abcdef",
    );
  });
});
