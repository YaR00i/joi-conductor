/** Top-down view with extruded walls (camera slightly lowered). */

import type { EmberTilesetTile } from "../content/types";
import { paintTileFace, paintWallFront } from "./tileTextures";

/**
 * One map-block story in world/canvas units.
 * Matches default tileSize (16) so a 1×1×1 block is a cube.
 */
export const WALL_HEIGHT = 16;

/** Cube story height for a map (always equals tile footprint). */
export function blockStoryHeight(tileSize: number): number {
  return Math.max(1, tileSize || WALL_HEIGHT);
}

/**
 * World Y span for a solid elev story.
 * Top sits at `elev * storyH` so floors align with water slabs / props / lights
 * (which also use elev * storyH as the surface).
 */
export function elevStoryWorldSpan(
  elev: number,
  storyH: number,
): { y0: number; y1: number } {
  const y1 = elev * storyH;
  return { y0: y1 - storyH, y1 };
}

/** Elev story index that contains world Y (solid cube convention). */
export function elevFromWorldY(worldY: number, storyH: number): number {
  const h = Math.max(1e-6, storyH);
  return Math.floor((worldY - 1e-4) / h) + 1;
}

function shadeHex(hex: string, mul: number): string {
  if (!hex.startsWith("#") || hex.length < 7) return hex;
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * mul));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * mul));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * mul));
  return `rgb(${r},${g},${b})`;
}

function shadePhaser(color: number, mul: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * mul));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * mul));
  const b = Math.min(255, Math.round((color & 0xff) * mul));
  return (r << 16) | (g << 8) | b;
}

/** Canvas: wall block at tile pixel top-left (px, py). */
export function fillExtrudedWall(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tileSize: number,
  wallH: number,
  topColor: string,
  tile?: EmberTilesetTile,
): void {
  const top = topColor;
  const side = shadeHex(topColor, 0.7);
  // Top face (raised) — textured when tile provided
  if (tile) {
    paintTileFace(ctx, tile, px, py - wallH, tileSize);
  } else {
    ctx.fillStyle = top;
    ctx.fillRect(px, py - wallH, tileSize, tileSize);
  }
  // South (front) face — brick / wood texture (clipped; no stroke bleed onto top)
  paintWallFront(ctx, tile, px, py - wallH + tileSize, tileSize, wallH);
  // Thin east edge for depth cue (solid, not wall tex)
  ctx.fillStyle = side;
  ctx.fillRect(px + tileSize - 1, py - wallH, 1, tileSize + wallH);
  // Inset border on top only — avoid stroke centered on the top/face seam
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(px, py - wallH, tileSize, 1);
  ctx.fillRect(px, py - wallH, 1, tileSize);
  ctx.fillRect(px + tileSize - 1, py - wallH, 1, tileSize);
  ctx.fillRect(px, py - wallH + tileSize - 1, tileSize, 1);
}

/** Phaser Graphics: solid underlay for extruded wall (textures drawn as images). */
export function phaserExtrudedWall(
  g: {
    fillStyle: (c: number, a?: number) => void;
    fillRect: (x: number, y: number, w: number, h: number) => void;
    lineStyle: (w: number, c: number, a?: number) => void;
    strokeRect: (x: number, y: number, w: number, h: number) => void;
  },
  px: number,
  py: number,
  tileSize: number,
  wallH: number,
  topColor: number,
  alpha = 1,
): void {
  g.fillStyle(shadePhaser(topColor, 0.85), alpha);
  g.fillRect(px, py - wallH, tileSize, tileSize);
  g.fillStyle(shadePhaser(topColor, 0.45), alpha);
  g.fillRect(px, py - wallH + tileSize, tileSize, wallH);
  g.fillStyle(shadePhaser(topColor, 0.65), alpha);
  g.fillRect(px + tileSize - 1, py - wallH, 1, tileSize + wallH);
  g.lineStyle(1, 0x000000, 0.3 * alpha);
  g.strokeRect(px, py - wallH, tileSize, tileSize);
}
