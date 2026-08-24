import { describe, expect, it } from "vitest";
import {
  compositeArtLayers,
  constrainArtLayerPixels,
  packArtLayers,
  parseArtLayers,
} from "./spriteArtLayers";
import type { EmberSpriteArtLayer } from "./types";

function layer(
  id: string,
  pixels: string[],
  extra: Partial<EmberSpriteArtLayer> = {},
): EmberSpriteArtLayer {
  return { id, pixels, ...extra };
}

describe("sprite art layers", () => {
  it("composites opacity with alpha instead of darkening transparent pixels", () => {
    expect(
      compositeArtLayers([layer("top", ["#ff0000"], { opacity: 0.5 })], 1, 1),
    ).toEqual(["#ff000080"]);
    expect(
      compositeArtLayers(
        [layer("bottom", ["#0000ff"]), layer("top", ["#ff0000"], { opacity: 0.5 })],
        1,
        1,
      ),
    ).toEqual(["#800080"]);
  });

  it("supports multiply, screen and additive layer modes", () => {
    const bottom = layer("bottom", ["#804020"]);
    expect(
      compositeArtLayers([bottom, layer("top", ["#808080"], { blendMode: "multiply" })], 1, 1),
    ).toEqual(["#402010"]);
    expect(
      compositeArtLayers([bottom, layer("top", ["#808080"], { blendMode: "screen" })], 1, 1),
    ).toEqual(["#c0a090"]);
    expect(
      compositeArtLayers([bottom, layer("top", ["#808080"], { blendMode: "add" })], 1, 1),
    ).toEqual(["#ffc0a0"]);
  });

  it("round-trips optional layer controls and rejects unknown blend modes", () => {
    const parsed = parseArtLayers(
      [
        {
          id: "fx",
          pixels: ["#abcdef"],
          visible: false,
          opacity: 0.4,
          blendMode: "screen",
          locked: true,
          alphaLocked: true,
        },
        { id: "bad", pixels: ["#123456"], blendMode: "difference" },
      ],
      1,
      1,
    );
    expect(parsed?.[0]).toMatchObject({
      visible: false,
      opacity: 0.4,
      blendMode: "screen",
      locked: true,
      alphaLocked: true,
    });
    expect(parsed?.[1]?.blendMode).toBeUndefined();
    expect(packArtLayers(parsed)?.[0]).toMatchObject({
      blendMode: "screen",
      locked: true,
      alphaLocked: true,
    });
  });

  it("blocks a locked layer and preserves alpha for alpha lock", () => {
    const locked = layer("locked", ["#112233", ""], { locked: true });
    expect(constrainArtLayerPixels(locked, ["#ffffff", "#ffffff"])).toBe(
      locked.pixels,
    );

    const alphaLocked = layer("alpha", ["#11223380", ""], {
      alphaLocked: true,
    });
    expect(
      constrainArtLayerPixels(alphaLocked, ["#abcdef", "#ffffff"]),
    ).toEqual(["#abcdef80", ""]);
    expect(constrainArtLayerPixels(alphaLocked, ["", ""])).toBe(
      alphaLocked.pixels,
    );
  });
});
