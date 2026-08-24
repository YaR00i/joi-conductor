import type { PixelPoint } from "./pixelSelection";

export type PixelSymmetry = {
  horizontal: boolean;
  vertical: boolean;
};

export const NO_PIXEL_SYMMETRY: PixelSymmetry = {
  horizontal: false,
  vertical: false,
};

export function mirroredPixelPoints(
  point: PixelPoint,
  width: number,
  height: number,
  symmetry: PixelSymmetry = NO_PIXEL_SYMMETRY,
): PixelPoint[] {
  const xs = symmetry.horizontal ? [point.x, width - 1 - point.x] : [point.x];
  const ys = symmetry.vertical ? [point.y, height - 1 - point.y] : [point.y];
  const points: PixelPoint[] = [];
  const seen = new Set<string>();
  for (const y of ys) {
    for (const x of xs) {
      const key = `${x}:${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points.push({ x, y });
    }
  }
  return points;
}

export function mirroredPixelSegments(
  start: PixelPoint,
  end: PixelPoint,
  width: number,
  height: number,
  symmetry: PixelSymmetry = NO_PIXEL_SYMMETRY,
): Array<{ start: PixelPoint; end: PixelPoint }> {
  const variants: Array<{ start: PixelPoint; end: PixelPoint }> = [];
  const seen = new Set<string>();
  for (const horizontal of symmetry.horizontal ? [false, true] : [false]) {
    for (const vertical of symmetry.vertical ? [false, true] : [false]) {
      const mirror = (point: PixelPoint): PixelPoint => ({
        x: horizontal ? width - 1 - point.x : point.x,
        y: vertical ? height - 1 - point.y : point.y,
      });
      const segment = { start: mirror(start), end: mirror(end) };
      const key = `${segment.start.x}:${segment.start.y}:${segment.end.x}:${segment.end.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      variants.push(segment);
    }
  }
  return variants;
}
