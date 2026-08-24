import {
  magicWandSelection,
  parsePixelColor,
  type PixelPoint,
} from "./pixelSelection";
import {
  mirroredPixelPoints,
  NO_PIXEL_SYMMETRY,
  type PixelSymmetry,
} from "./pixelSymmetry";

export type PixelDitherCoverage = 100 | 75 | 50 | 25;

export type PixelBrushOptions = {
  opacity?: number;
  ditherCoverage?: PixelDitherCoverage;
};

export type PixelStrokePath = {
  points: PixelPoint[];
  last: PixelPoint | null;
  distance: number;
};

const BAYER_4X4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
] as const;

function pixelLinePoints(start: PixelPoint, end: PixelPoint): PixelPoint[] {
  const points: PixelPoint[] = [];
  let x = start.x;
  let y = start.y;
  const dx = Math.abs(end.x - start.x);
  const sx = start.x < end.x ? 1 : -1;
  const dy = -Math.abs(end.y - start.y);
  const sy = start.y < end.y ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    points.push({ x, y });
    if (x === end.x && y === end.y) break;
    const twice = error * 2;
    if (twice >= dy) {
      error += dy;
      x += sx;
    }
    if (twice <= dx) {
      error += dx;
      y += sy;
    }
  }
  return points;
}

function appendPixelPerfectPoint(points: PixelPoint[], point: PixelPoint): void {
  const last = points[points.length - 1];
  if (last?.x === point.x && last.y === point.y) return;
  const middle = points[points.length - 1];
  const first = points[points.length - 2];
  if (
    first && middle &&
    Math.abs(first.x - point.x) === 1 &&
    Math.abs(first.y - point.y) === 1 &&
    ((middle.x === first.x && middle.y === point.y) ||
      (middle.x === point.x && middle.y === first.y))
  ) {
    points.pop();
  }
  points.push(point);
}

export function extendPixelStroke(
  path: PixelStrokePath,
  next: PixelPoint,
  spacing = 1,
  pixelPerfect = true,
): PixelStrokePath {
  const points = [...path.points];
  let distance = path.distance;
  const interval = Math.max(1, Math.round(spacing));
  const candidates = path.last ? pixelLinePoints(path.last, next).slice(1) : [next];
  for (const point of candidates) {
    if (!points.length) {
      points.push(point);
      distance = 0;
      continue;
    }
    distance += 1;
    if (distance < interval) continue;
    distance = 0;
    if (pixelPerfect && interval === 1) appendPixelPerfectPoint(points, point);
    else {
      const last = points[points.length - 1];
      if (last?.x !== point.x || last.y !== point.y) points.push(point);
    }
  }
  return { points, last: next, distance };
}

function colorHexPart(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

function serializePixelColor(r: number, g: number, b: number, a: number): string {
  const alpha = Math.max(0, Math.min(255, Math.round(a)));
  if (alpha === 0) return "";
  const rgb = `#${colorHexPart(r)}${colorHexPart(g)}${colorHexPart(b)}`;
  return alpha === 255 ? rgb : `${rgb}${colorHexPart(alpha)}`;
}

export function blendPixelColor(baseRaw: string | undefined, paintRaw: string, opacity: number): string {
  const amount = Math.max(0, Math.min(1, opacity));
  const base = parsePixelColor(baseRaw);
  const paint = parsePixelColor(paintRaw);
  if (amount <= 0) return baseRaw ?? "";
  if (amount >= 1) return paintRaw;
  const baseAlpha = base[3] / 255;
  if (paint[3] === 0) {
    return serializePixelColor(base[0], base[1], base[2], base[3] * (1 - amount));
  }
  const paintAlpha = (paint[3] / 255) * amount;
  const outAlpha = paintAlpha + baseAlpha * (1 - paintAlpha);
  if (outAlpha <= 0) return "";
  const mix = (paintValue: number, baseValue: number) =>
    (paintValue * paintAlpha + baseValue * baseAlpha * (1 - paintAlpha)) / outAlpha;
  return serializePixelColor(
    mix(paint[0], base[0]),
    mix(paint[1], base[1]),
    mix(paint[2], base[2]),
    outAlpha * 255,
  );
}

function ditherAllows(x: number, y: number, coverage: PixelDitherCoverage): boolean {
  if (coverage >= 100) return true;
  const threshold = BAYER_4X4[(y & 3) * 4 + (x & 3)]!;
  return threshold < (coverage / 100) * 16;
}

export function paintPixelBrushStroke(
  source: string[],
  width: number,
  height: number,
  points: PixelPoint[],
  color: string,
  size = 1,
  symmetry: PixelSymmetry = NO_PIXEL_SYMMETRY,
  options: PixelBrushOptions = {},
): { pixels: string[]; changed: boolean } {
  const mask = new Array(width * height).fill(false) as boolean[];
  const brush = Math.max(1, Math.round(size));
  const origin = Math.floor((brush - 1) / 2);
  const coverage = options.ditherCoverage ?? 100;
  for (const point of points) {
    for (let by = 0; by < brush; by++) {
      for (let bx = 0; bx < brush; bx++) {
        const x = point.x - origin + bx;
        const y = point.y - origin + by;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        for (const mirrored of mirroredPixelPoints({ x, y }, width, height, symmetry)) {
          if (ditherAllows(mirrored.x, mirrored.y, coverage)) {
            mask[mirrored.y * width + mirrored.x] = true;
          }
        }
      }
    }
  }
  const pixels = [...source];
  const opacity = options.opacity ?? 1;
  let changed = false;
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) continue;
    const next = blendPixelColor(pixels[index], color, opacity);
    if (next === pixels[index]) continue;
    pixels[index] = next;
    changed = true;
  }
  return { pixels, changed };
}

export function paintPixelBrush(
  source: string[],
  width: number,
  height: number,
  point: PixelPoint,
  color: string,
  size = 1,
  symmetry: PixelSymmetry = NO_PIXEL_SYMMETRY,
  options: PixelBrushOptions = {},
): { pixels: string[]; changed: boolean } {
  return paintPixelBrushStroke(source, width, height, [point], color, size, symmetry, options);
}

export function paintPixelFill(
  source: string[],
  width: number,
  height: number,
  point: PixelPoint,
  color: string,
  tolerance = 0,
  contiguous = true,
  symmetry: PixelSymmetry = NO_PIXEL_SYMMETRY,
): { pixels: string[]; changed: boolean } {
  const selected = new Array(width * height).fill(false) as boolean[];
  for (const seed of mirroredPixelPoints(point, width, height, symmetry)) {
    const shape = magicWandSelection(source, width, height, seed, tolerance, contiguous);
    if (!shape) continue;
    for (let y = 0; y < shape.rect.h; y++) {
      for (let x = 0; x < shape.rect.w; x++) {
        const local = y * shape.rect.w + x;
        if (shape.mask && !shape.mask[local]) continue;
        const index = (shape.rect.y + y) * width + shape.rect.x + x;
        selected[index] = true;
      }
    }
  }
  const pixels = [...source];
  let changed = false;
  for (let index = 0; index < selected.length; index++) {
    if (!selected[index] || pixels[index] === color) continue;
    pixels[index] = color;
    changed = true;
  }
  return { pixels, changed };
}
