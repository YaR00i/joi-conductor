import type { PixelPoint } from "./pixelSelection";
import {
  mirroredPixelPoints,
  NO_PIXEL_SYMMETRY,
  type PixelSymmetry,
} from "./pixelSymmetry";

export type PixelShapeKind = "line" | "rect" | "ellipse";

export function constrainPixelShapeEnd(
  kind: PixelShapeKind,
  start: PixelPoint,
  end: PixelPoint,
  constrained: boolean,
): PixelPoint {
  if (!constrained) return end;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (kind === "line") {
    const extent = Math.max(Math.abs(dx), Math.abs(dy));
    if (Math.abs(dx) > Math.abs(dy) * 2) return { x: start.x + Math.sign(dx) * extent, y: start.y };
    if (Math.abs(dy) > Math.abs(dx) * 2) return { x: start.x, y: start.y + Math.sign(dy) * extent };
    return {
      x: start.x + (Math.sign(dx) || 1) * extent,
      y: start.y + (Math.sign(dy) || 1) * extent,
    };
  }
  const extent = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: start.x + (Math.sign(dx) || 1) * extent,
    y: start.y + (Math.sign(dy) || 1) * extent,
  };
}

function rasterLine(a: PixelPoint, b: PixelPoint, visit: (x: number, y: number) => void): void {
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const sx = a.x < b.x ? 1 : -1;
  const dy = -Math.abs(b.y - a.y);
  const sy = a.y < b.y ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    visit(x, y);
    if (x === b.x && y === b.y) break;
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
}

function shapeCenters(
  kind: PixelShapeKind,
  start: PixelPoint,
  end: PixelPoint,
  filled: boolean,
): PixelPoint[] {
  const out: PixelPoint[] = [];
  const seen = new Set<string>();
  const visit = (x: number, y: number) => {
    const key = `${x}:${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ x, y });
  };
  if (kind === "line") {
    rasterLine(start, end, visit);
    return out;
  }
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  if (kind === "rect") {
    if (filled) {
      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) visit(x, y);
      }
    } else {
      rasterLine({ x: left, y: top }, { x: right, y: top }, visit);
      rasterLine({ x: right, y: top }, { x: right, y: bottom }, visit);
      rasterLine({ x: right, y: bottom }, { x: left, y: bottom }, visit);
      rasterLine({ x: left, y: bottom }, { x: left, y: top }, visit);
    }
    return out;
  }

  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const radiusX = Math.max(0.5, (right - left) / 2);
  const radiusY = Math.max(0.5, (bottom - top) / 2);
  const inside = (x: number, y: number) => {
    const nx = (x - centerX) / radiusX;
    const ny = (y - centerY) / radiusY;
    return nx * nx + ny * ny <= 1.05;
  };
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (!inside(x, y)) continue;
      if (
        filled ||
        !inside(x - 1, y) ||
        !inside(x + 1, y) ||
        !inside(x, y - 1) ||
        !inside(x, y + 1)
      ) visit(x, y);
    }
  }
  if (!out.length) visit(Math.round(centerX), Math.round(centerY));
  return out;
}

export function rasterPixelShape(
  kind: PixelShapeKind,
  start: PixelPoint,
  end: PixelPoint,
  width: number,
  height: number,
  thickness = 1,
  filled = false,
): boolean[] {
  const mask = new Array(width * height).fill(false) as boolean[];
  const brush = Math.max(1, Math.round(thickness));
  const origin = Math.floor((brush - 1) / 2);
  for (const center of shapeCenters(kind, start, end, filled)) {
    for (let by = 0; by < brush; by++) {
      for (let bx = 0; bx < brush; bx++) {
        const x = center.x - origin + bx;
        const y = center.y - origin + by;
        if (x >= 0 && y >= 0 && x < width && y < height) mask[y * width + x] = true;
      }
    }
  }
  return mask;
}

export function paintPixelShape(
  source: string[],
  width: number,
  height: number,
  kind: PixelShapeKind,
  start: PixelPoint,
  end: PixelPoint,
  color: string,
  thickness = 1,
  filled = false,
  symmetry: PixelSymmetry = NO_PIXEL_SYMMETRY,
): { pixels: string[]; changed: boolean } {
  const mask = rasterPixelShape(kind, start, end, width, height, thickness, filled);
  const pixels = [...source];
  let changed = false;
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) continue;
    const point = { x: index % width, y: Math.floor(index / width) };
    for (const mirrored of mirroredPixelPoints(point, width, height, symmetry)) {
      const target = mirrored.y * width + mirrored.x;
      if (pixels[target] === color) continue;
      pixels[target] = color;
      changed = true;
    }
  }
  return { pixels, changed };
}
