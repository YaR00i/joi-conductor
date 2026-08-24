import { pixelColorDistance, type PixelRect } from "./pixelSelection";

export const MAX_RECENT_PIXEL_COLORS = 8;
export const MAX_IMPORTED_PIXEL_COLORS = 24;

export function normalizePaletteColor(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value === "transparent") return "#00000000";
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{8}$/i.test(value)) {
    if (value.endsWith("00")) return "#00000000";
    if (value.endsWith("ff")) return value.slice(0, 7);
  }
  return null;
}

export function parsePixelPaletteText(
  text: string,
  limit = MAX_IMPORTED_PIXEL_COLORS,
): string[] {
  const matches = text.match(/transparent|#[0-9a-f]{8}|#[0-9a-f]{6}|#[0-9a-f]{3}/gi) ?? [];
  const colors: string[] = [];
  for (const raw of matches) {
    const color = normalizePaletteColor(raw);
    if (!color || colors.includes(color)) continue;
    colors.push(color);
    if (colors.length >= Math.max(0, limit)) break;
  }
  return colors;
}

export function serializePixelPalette(colors: readonly string[]): string {
  return colors.map((color) => normalizePaletteColor(color)).filter(Boolean).join("\n");
}

export function pushRecentPixelColor(
  recent: readonly string[],
  raw: string,
  limit = MAX_RECENT_PIXEL_COLORS,
): string[] {
  const color = normalizePaletteColor(raw);
  if (!color) return [...recent];
  return [color, ...recent.filter((item) => item !== color)].slice(0, Math.max(0, limit));
}

export type PixelPaletteSelection = {
  rect: PixelRect;
  mask?: boolean[];
};

export function replacePixelPaletteColor(
  pixels: readonly string[],
  width: number,
  height: number,
  fromColor: string,
  toColor: string,
  tolerance: number,
  selection?: PixelPaletteSelection,
): { pixels: string[]; changed: boolean; count: number } {
  const next = [...pixels];
  const maxDistance = Math.max(0, Math.min(255, tolerance));
  let count = 0;
  const selected = (x: number, y: number) => {
    if (!selection) return true;
    const { rect, mask } = selection;
    if (x < rect.x || y < rect.y || x >= rect.x + rect.w || y >= rect.y + rect.h) {
      return false;
    }
    return !mask || mask[(y - rect.y) * rect.w + (x - rect.x)] === true;
  };
  const need = Math.min(next.length, Math.max(0, width) * Math.max(0, height));
  for (let index = 0; index < need; index++) {
    const x = index % width;
    const y = Math.floor(index / width);
    if (!selected(x, y)) continue;
    if (pixelColorDistance(next[index], fromColor) > maxDistance) continue;
    if ((next[index] || "") === toColor) continue;
    next[index] = toColor === "#00000000" ? "" : toColor;
    count++;
  }
  return { pixels: count ? next : [...pixels], changed: count > 0, count };
}
