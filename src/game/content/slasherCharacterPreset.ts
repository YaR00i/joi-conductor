/**
 * Dungeon Slasher–style starter sprite (see docs/EMBER_CHARACTER_STYLE.md).
 * Figure lives on the full W×H canvas (flat billboard).
 */
import type { EmberPixelSprite } from "./types";
import { emptySpritePixels } from "./pixelSprite";

export const SLASHER_SPRITE_WIDTH = 32;
export const SLASHER_SPRITE_HEIGHT = 56;

const C = {
  skin: "#f0c8a4",
  skinD: "#d8a07c",
  hair: "#e02824",
  hairD: "#a01818",
  hairK: "#5c1010",
  white: "#ece8e4",
  gray: "#8a868e",
  dark: "#32303a",
  band: "#1c1a1e",
  eye: "#4a3024",
} as const;

function plot(
  pixels: string[],
  width: number,
  x: number,
  y: number,
  color: string,
): void {
  if (x < 0 || y < 0 || x >= width) return;
  const i = y * width + x;
  if (i < 0 || i >= pixels.length) return;
  pixels[i] = color;
}

function rect(
  pixels: string[],
  width: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      plot(pixels, width, x + dx, y + dy, color);
    }
  }
}

/** 16×48 local figure, centered in the canvas. Origin = top of the image. */
function paintFigure(pixels: string[], width: number, originX: number, originY: number): void {
  const p = (x: number, y: number, color: string) =>
    plot(pixels, width, originX + x, originY + y, color);
  const r = (x: number, y: number, w: number, h: number, color: string) =>
    rect(pixels, width, originX + x, originY + y, w, h, color);

  // Hair mass + ahoge
  r(4, 0, 3, 2, C.hair);
  p(6, 0, C.hairD);
  r(2, 2, 12, 8, C.hair);
  r(1, 4, 14, 10, C.hair);
  r(1, 8, 3, 16, C.hair);
  r(12, 8, 3, 16, C.hair);
  r(2, 22, 3, 10, C.hairD);
  r(11, 22, 3, 10, C.hairD);
  r(3, 2, 10, 3, C.hairD);
  r(4, 3, 8, 1, C.hairK);

  // Head
  r(4, 6, 8, 9, C.skin);
  r(4, 6, 3, 9, C.skinD);
  r(4, 8, 8, 1, C.band);
  p(6, 10, C.eye);
  p(6, 11, C.eye);
  p(9, 10, C.eye);
  p(9, 11, C.eye);
  p(6, 10, C.white);
  p(9, 10, C.white);

  // Torso: pale shoulders, dark chest, lighter corset
  r(4, 15, 8, 3, C.white);
  r(4, 15, 2, 3, C.gray);
  r(5, 18, 6, 4, C.dark);
  r(5, 22, 6, 3, C.gray);

  // Arms + gauntlets
  r(2, 16, 2, 8, C.dark);
  r(12, 16, 2, 8, C.dark);
  r(2, 24, 2, 2, C.skin);
  r(12, 24, 2, 2, C.skin);

  // Skirt
  r(4, 25, 8, 4, C.dark);
  r(3, 27, 10, 2, C.dark);

  // Thigh gap, stockings, boots
  r(5, 29, 3, 4, C.skin);
  r(8, 29, 3, 4, C.skin);
  r(5, 33, 3, 10, C.dark);
  r(8, 33, 3, 10, C.dark);
  r(5, 43, 3, 5, C.band);
  r(8, 43, 3, 5, C.band);
}

export function slasherSpritePixels(): string[] {
  const pixels = emptySpritePixels(SLASHER_SPRITE_WIDTH, SLASHER_SPRITE_HEIGHT);
  const originX = Math.floor((SLASHER_SPRITE_WIDTH - 16) / 2);
  paintFigure(pixels, SLASHER_SPRITE_WIDTH, originX, 2);
  return pixels;
}

export function createSlasherCharacterSprite(
  id: string,
  nameRu = "Персонаж Slasher",
): EmberPixelSprite {
  return {
    id,
    nameRu,
    width: SLASHER_SPRITE_WIDTH,
    topHeight: SLASHER_SPRITE_HEIGHT,
    wallHeights: [],
    pixels: slasherSpritePixels(),
    color: C.hair,
    roles: ["player", "npc"],
    tags: ["character", "slasher"],
  };
}
