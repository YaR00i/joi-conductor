import { pixelHasInk } from "./spriteArtLayers";

export type SpriteArtBrushKind = "soften" | "burn" | "dodge" | "smudge";

function parseRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbHex(r: number, g: number, b: number): string {
  const h = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return { h: h / 6, s, l };
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  if (s <= 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

function keepHue(
  src: { r: number; g: number; b: number },
  dst: { r: number; g: number; b: number },
): { r: number; g: number; b: number } {
  const srcH = rgbToHsl(src.r, src.g, src.b);
  const dstH = rgbToHsl(dst.r, dst.g, dst.b);
  return hslToRgb(srcH.h, srcH.s, dstH.l);
}

function neighborAverage(
  pixels: string[],
  width: number,
  height: number,
  x: number,
  y: number,
): { r: number; g: number; b: number } | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const rgb = parseRgb(pixels[yy * width + xx] ?? "");
      if (!rgb) continue;
      r += rgb.r;
      g += rgb.g;
      b += rgb.b;
      n++;
    }
  }
  if (!n) return null;
  return { r: r / n, g: g / n, b: b / n };
}

function stampCell(
  pixels: string[],
  width: number,
  height: number,
  x: number,
  y: number,
  kind: SpriteArtBrushKind,
  prevX: number,
  prevY: number,
): string | null {
  const idx = y * width + x;
  const cur = pixels[idx] ?? "";
  const curRgb = parseRgb(cur);
  switch (kind) {
    case "soften": {
      if (!curRgb) return null;
      const avg = neighborAverage(pixels, width, height, x, y);
      if (!avg) return null;
      const mixed = {
        r: curRgb.r * 0.55 + avg.r * 0.45,
        g: curRgb.g * 0.55 + avg.g * 0.45,
        b: curRgb.b * 0.55 + avg.b * 0.45,
      };
      const kept = keepHue(curRgb, mixed);
      return rgbHex(kept.r, kept.g, kept.b);
    }
    case "burn": {
      if (!curRgb) return null;
      const hsl = rgbToHsl(curRgb.r, curRgb.g, curRgb.b);
      const next = hslToRgb(hsl.h, hsl.s, Math.max(0, hsl.l * 0.82));
      return rgbHex(next.r, next.g, next.b);
    }
    case "dodge": {
      if (!curRgb) return null;
      const hsl = rgbToHsl(curRgb.r, curRgb.g, curRgb.b);
      const next = hslToRgb(
        hsl.h,
        hsl.s,
        Math.min(1, hsl.l + (1 - hsl.l) * 0.22),
      );
      return rgbHex(next.r, next.g, next.b);
    }
    case "smudge": {
      const dx = Math.sign(x - prevX) || (prevX === x ? 0 : 0);
      const dy = Math.sign(y - prevY) || (prevY === y ? 0 : 0);
      const sx = x - (dx || (x > 0 ? 1 : 0));
      const sy = y - (dy || (y > 0 ? 1 : 0));
      const src = pixels[sy * width + sx] ?? "";
      const srcRgb = parseRgb(src);
      if (!srcRgb) return null;
      if (!curRgb) return src.toLowerCase();
      const mixed = {
        r: curRgb.r * 0.42 + srcRgb.r * 0.58,
        g: curRgb.g * 0.42 + srcRgb.g * 0.58,
        b: curRgb.b * 0.42 + srcRgb.b * 0.58,
      };
      return rgbHex(mixed.r, mixed.g, mixed.b);
    }
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

export function stampArtBrush(
  pixels: string[],
  width: number,
  height: number,
  x: number,
  y: number,
  size: number,
  kind: SpriteArtBrushKind,
  prevX = x,
  prevY = y,
): { pixels: string[]; changed: boolean } {
  const next = [...pixels];
  const b = Math.max(1, Math.min(4, size));
  const origin = Math.floor((b - 1) / 2);
  let changed = false;
  for (let dy = 0; dy < b; dy++) {
    for (let dx = 0; dx < b; dx++) {
      const px = x - origin + dx;
      const py = y - origin + dy;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const ink = stampCell(next, width, height, px, py, kind, prevX, prevY);
      if (ink == null) continue;
      const idx = py * width + px;
      if (next[idx] === ink) continue;
      next[idx] = ink;
      changed = true;
    }
  }
  return { pixels: next, changed };
}

export function isArtBrushTool(
  tool: string,
): tool is SpriteArtBrushKind {
  return (
    tool === "soften" ||
    tool === "burn" ||
    tool === "dodge" ||
    tool === "smudge"
  );
}

export { pixelHasInk };
