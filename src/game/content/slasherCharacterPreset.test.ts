import { describe, expect, it } from "vitest";
import { serializePixelSprite } from "./pixelSprite";
import {
  createSlasherCharacterSprite,
  SLASHER_SPRITE_HEIGHT,
  SLASHER_SPRITE_WIDTH,
  slasherSpritePixels,
} from "./slasherCharacterPreset";

describe("slasher character sprite preset", () => {
  it("paints a tall billboard with red hair", () => {
    const sprite = serializePixelSprite(
      createSlasherCharacterSprite("spr_slasher_test"),
    );
    expect(sprite.width).toBe(SLASHER_SPRITE_WIDTH);
    expect(sprite.topHeight).toBe(SLASHER_SPRITE_HEIGHT);
    expect(sprite.wallHeights).toEqual([]);
    expect(sprite.roles).toEqual(["player", "npc"]);
    expect(sprite.tags).toEqual(expect.arrayContaining(["character", "slasher"]));
    expect(slasherSpritePixels().some((px) => px === "#e02824")).toBe(true);
    expect(sprite.pixels.some((px) => px === "#e02824")).toBe(true);
  });
});
