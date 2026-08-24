import type { PixelArtChannels, PixelClipboard } from "./pixelClipboard";

export type PixelPoint = { x: number; y: number };
export type PixelRect = { x: number; y: number; w: number; h: number };
export type PixelSelectionShape = { rect: PixelRect; mask?: boolean[] };
export type PixelSelectionCombineMode = "replace" | "add" | "subtract" | "intersect";
export type PixelTransform = "flip_x" | "flip_y" | "rotate_cw";
export type PixelScaleHandle = "nw" | "ne" | "se" | "sw";

export function pixelRectFromPoints(
  a: PixelPoint,
  b: PixelPoint,
  width: number,
  height: number,
): PixelRect {
  const ax = Math.max(0, Math.min(width - 1, Math.floor(a.x)));
  const ay = Math.max(0, Math.min(height - 1, Math.floor(a.y)));
  const bx = Math.max(0, Math.min(width - 1, Math.floor(b.x)));
  const by = Math.max(0, Math.min(height - 1, Math.floor(b.y)));
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(ax - bx) + 1,
    h: Math.abs(ay - by) + 1,
  };
}

export function pixelRectContains(rect: PixelRect, point: PixelPoint): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.w &&
    point.y < rect.y + rect.h
  );
}

export function pixelSelectionContains(
  rect: PixelRect,
  mask: boolean[] | undefined,
  point: PixelPoint,
): boolean {
  if (!pixelRectContains(rect, point)) return false;
  if (!mask) return true;
  return mask[(point.y - rect.y) * rect.w + point.x - rect.x] === true;
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

function pointInPolygon(x: number, y: number, points: PixelPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    const ax = a.x + 0.5;
    const ay = a.y + 0.5;
    const bx = b.x + 0.5;
    const by = b.y + 0.5;
    if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
      inside = !inside;
    }
  }
  return inside;
}

export function pixelSelectionFromPolygon(
  rawPoints: PixelPoint[],
  width: number,
  height: number,
): PixelSelectionShape | null {
  const points: PixelPoint[] = [];
  for (const point of rawPoints) {
    const next = {
      x: Math.max(0, Math.min(width - 1, Math.floor(point.x))),
      y: Math.max(0, Math.min(height - 1, Math.floor(point.y))),
    };
    const previous = points[points.length - 1];
    if (!previous || previous.x !== next.x || previous.y !== next.y) points.push(next);
  }
  if (!points.length) return null;
  const rect = points.reduce<PixelRect>(
    (out, point) => {
      const right = Math.max(out.x + out.w - 1, point.x);
      const bottom = Math.max(out.y + out.h - 1, point.y);
      const x = Math.min(out.x, point.x);
      const y = Math.min(out.y, point.y);
      return { x, y, w: right - x + 1, h: bottom - y + 1 };
    },
    { x: points[0]!.x, y: points[0]!.y, w: 1, h: 1 },
  );
  const mask = new Array(rect.w * rect.h).fill(false) as boolean[];
  const select = (x: number, y: number) => {
    if (pixelRectContains(rect, { x, y })) mask[(y - rect.y) * rect.w + x - rect.x] = true;
  };
  if (points.length >= 3) {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        if (pointInPolygon(x + 0.5, y + 0.5, points)) select(x, y);
      }
    }
  }
  for (let index = 0; index < points.length; index++) {
    rasterLine(points[index]!, points[(index + 1) % points.length]!, select);
  }
  return { rect, mask };
}

function pixelSelectionFromCanvasMask(
  canvasMask: boolean[],
  width: number,
  height: number,
): PixelSelectionShape | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!canvasMask[y * width + x]) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;
  const rect = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  const mask = new Array(rect.w * rect.h).fill(false) as boolean[];
  let allSelected = true;
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const selected = canvasMask[(rect.y + y) * width + rect.x + x] === true;
      mask[y * rect.w + x] = selected;
      if (!selected) allSelected = false;
    }
  }
  return { rect, mask: allSelected ? undefined : mask };
}

function pixelSelectionToCanvasMask(
  selection: PixelSelectionShape | null,
  width: number,
  height: number,
): boolean[] {
  const out = new Array(width * height).fill(false) as boolean[];
  if (!selection) return out;
  const { rect, mask } = selection;
  for (let y = 0; y < rect.h; y++) {
    const dy = rect.y + y;
    if (dy < 0 || dy >= height) continue;
    for (let x = 0; x < rect.w; x++) {
      const dx = rect.x + x;
      if (dx < 0 || dx >= width || (mask && !mask[y * rect.w + x])) continue;
      out[dy * width + dx] = true;
    }
  }
  return out;
}

export function combinePixelSelections(
  current: PixelSelectionShape | null,
  next: PixelSelectionShape | null,
  mode: PixelSelectionCombineMode,
  width: number,
  height: number,
): PixelSelectionShape | null {
  if (mode === "replace") return next;
  const currentMask = pixelSelectionToCanvasMask(current, width, height);
  const nextMask = pixelSelectionToCanvasMask(next, width, height);
  const combined = currentMask.map((selected, index) => {
    if (mode === "add") return selected || nextMask[index]!;
    if (mode === "subtract") return selected && !nextMask[index]!;
    return selected && nextMask[index]!;
  });
  return pixelSelectionFromCanvasMask(combined, width, height);
}

export function invertPixelSelection(
  selection: PixelSelectionShape | null,
  width: number,
  height: number,
): PixelSelectionShape | null {
  const current = pixelSelectionToCanvasMask(selection, width, height);
  return pixelSelectionFromCanvasMask(current.map((selected) => !selected), width, height);
}

type Rgba = [number, number, number, number];

export function parsePixelColor(raw: string | undefined): Rgba {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value || value === "transparent") return [0, 0, 0, 0];
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      return [
        Number.parseInt(hex[0]! + hex[0]!, 16),
        Number.parseInt(hex[1]! + hex[1]!, 16),
        Number.parseInt(hex[2]! + hex[2]!, 16),
        hex.length === 4 ? Number.parseInt(hex[3]! + hex[3]!, 16) : 255,
      ];
    }
    if (hex.length === 6 || hex.length === 8) {
      return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
        hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255,
      ];
    }
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+)%?)?\s*\)$/);
  if (rgb) {
    const alphaRaw = rgb[4] == null ? 1 : Number(rgb[4]);
    const alpha = value.includes("%") ? alphaRaw / 100 : alphaRaw;
    return [
      Math.max(0, Math.min(255, Number(rgb[1]))),
      Math.max(0, Math.min(255, Number(rgb[2]))),
      Math.max(0, Math.min(255, Number(rgb[3]))),
      Math.round(Math.max(0, Math.min(1, alpha)) * 255),
    ];
  }
  return [0, 0, 0, 0];
}

function rgbaDistance(a: Rgba, b: Rgba): number {
  const aAlpha = a[3] / 255;
  const bAlpha = b[3] / 255;
  const dr = a[0] * aAlpha - b[0] * bAlpha;
  const dg = a[1] * aAlpha - b[1] * bAlpha;
  const db = a[2] * aAlpha - b[2] * bAlpha;
  const da = a[3] - b[3];
  return Math.sqrt((dr * dr + dg * dg + db * db + da * da) / 4);
}

export function pixelColorDistance(aRaw: string | undefined, bRaw: string | undefined): number {
  return rgbaDistance(parsePixelColor(aRaw), parsePixelColor(bRaw));
}

export function magicWandSelection(
  pixels: string[],
  width: number,
  height: number,
  start: PixelPoint,
  tolerance: number,
  contiguous = true,
): PixelSelectionShape | null {
  const x = Math.floor(start.x);
  const y = Math.floor(start.y);
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const targetRaw = pixels[y * width + x] ?? "";
  const target = parsePixelColor(targetRaw);
  const colorCache = new Map<string, Rgba>([[targetRaw, target]]);
  const limit = Math.max(0, Math.min(255, tolerance));
  const matches = (index: number) => {
    const raw = pixels[index] ?? "";
    let parsed = colorCache.get(raw);
    if (!parsed) {
      parsed = parsePixelColor(raw);
      colorCache.set(raw, parsed);
    }
    return rgbaDistance(target, parsed) <= limit;
  };
  const selected = new Array(width * height).fill(false) as boolean[];
  if (!contiguous) {
    for (let index = 0; index < selected.length; index++) selected[index] = matches(index);
    return pixelSelectionFromCanvasMask(selected, width, height);
  }

  const visited = new Array(width * height).fill(false) as boolean[];
  const stack = [y * width + x];
  while (stack.length) {
    const index = stack.pop()!;
    if (visited[index]) continue;
    visited[index] = true;
    if (!matches(index)) continue;
    selected[index] = true;
    const px = index % width;
    const py = Math.floor(index / width);
    if (px > 0) stack.push(index - 1);
    if (px + 1 < width) stack.push(index + 1);
    if (py > 0) stack.push(index - width);
    if (py + 1 < height) stack.push(index + width);
  }
  return pixelSelectionFromCanvasMask(selected, width, height);
}

export function resizePixelMask(
  mask: boolean[] | undefined,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): boolean[] | undefined {
  if (!mask) return undefined;
  const out = new Array(targetWidth * targetHeight).fill(false) as boolean[];
  for (let y = 0; y < targetHeight; y++) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / targetHeight));
    for (let x = 0; x < targetWidth; x++) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / targetWidth));
      out[y * targetWidth + x] = mask[sourceY * sourceWidth + sourceX] === true;
    }
  }
  return out;
}

export function pixelMaskSvgPaths(
  mask: boolean[] | undefined,
  width: number,
  height: number,
): { fill: string; outline: string } | null {
  if (!mask) return null;
  const fill: string[] = [];
  const outline: string[] = [];
  const selected = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === true;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!selected(x, y)) continue;
      fill.push(`M${x} ${y}h1v1h-1z`);
      if (!selected(x, y - 1)) outline.push(`M${x} ${y}h1`);
      if (!selected(x + 1, y)) outline.push(`M${x + 1} ${y}v1`);
      if (!selected(x, y + 1)) outline.push(`M${x + 1} ${y + 1}h-1`);
      if (!selected(x - 1, y)) outline.push(`M${x} ${y + 1}v-1`);
    }
  }
  return { fill: fill.join(""), outline: outline.join("") };
}

export function pixelRectFromScaleHandle(
  rect: PixelRect,
  handle: PixelScaleHandle,
  point: PixelPoint,
  width: number,
  height: number,
  preserveAspect = false,
): PixelRect {
  const fixed: PixelPoint = {
    x: handle === "nw" || handle === "sw" ? rect.x + rect.w - 1 : rect.x,
    y: handle === "nw" || handle === "ne" ? rect.y + rect.h - 1 : rect.y,
  };
  const raw = pixelRectFromPoints(fixed, point, width, height);
  if (!preserveAspect) return raw;

  const maxW = handle === "nw" || handle === "sw" ? fixed.x + 1 : width - fixed.x;
  const maxH = handle === "nw" || handle === "ne" ? fixed.y + 1 : height - fixed.y;
  const requestedScale = Math.max(raw.w / rect.w, raw.h / rect.h);
  const availableScale = Math.min(maxW / rect.w, maxH / rect.h);
  const scale = Math.max(Math.min(requestedScale, availableScale), Math.min(1 / rect.w, 1 / rect.h));
  const scaledW = Math.max(1, Math.min(maxW, Math.round(rect.w * scale)));
  const scaledH = Math.max(1, Math.min(maxH, Math.round(rect.h * scale)));

  return {
    x: handle === "nw" || handle === "sw" ? fixed.x - scaledW + 1 : fixed.x,
    y: handle === "nw" || handle === "ne" ? fixed.y - scaledH + 1 : fixed.y,
    w: scaledW,
    h: scaledH,
  };
}

export function clampPixelRect(
  rect: PixelRect,
  width: number,
  height: number,
): PixelRect | null {
  const x = Math.max(0, Math.min(width, Math.floor(rect.x)));
  const y = Math.max(0, Math.min(height, Math.floor(rect.y)));
  const right = Math.max(x, Math.min(width, Math.floor(rect.x + rect.w)));
  const bottom = Math.max(y, Math.min(height, Math.floor(rect.y + rect.h)));
  if (right <= x || bottom <= y) return null;
  return { x, y, w: right - x, h: bottom - y };
}

function extractChannel(
  source: string[] | undefined,
  width: number,
  rect: PixelRect,
  mask?: boolean[],
): string[] | undefined {
  if (!source) return undefined;
  const out = new Array(rect.w * rect.h).fill("");
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      if (mask && !mask[y * rect.w + x]) continue;
      out[y * rect.w + x] = source[(rect.y + y) * width + rect.x + x] ?? "";
    }
  }
  return out;
}

export function extractPixelSelection(
  channels: PixelArtChannels,
  width: number,
  height: number,
  rect: PixelRect,
  mask?: boolean[],
): PixelClipboard | null {
  const clipped = clampPixelRect(rect, width, height);
  if (!clipped) return null;
  return {
    width: clipped.w,
    height: clipped.h,
    pixels: extractChannel(channels.pixels, width, clipped, mask) ?? [],
    emissivePixels: extractChannel(channels.emissivePixels, width, clipped, mask),
    shinePixels: extractChannel(channels.shinePixels, width, clipped, mask),
    mask: mask ? [...mask] : undefined,
  };
}

function clearRect(source: string[], width: number, rect: PixelRect, mask?: boolean[]): string[] {
  const next = [...source];
  for (let y = 0; y < rect.h; y++) {
    if (!mask) {
      next.fill("", (rect.y + y) * width + rect.x, (rect.y + y) * width + rect.x + rect.w);
      continue;
    }
    for (let x = 0; x < rect.w; x++) {
      if (mask[y * rect.w + x]) next[(rect.y + y) * width + rect.x + x] = "";
    }
  }
  return next;
}

function blit(
  destination: string[],
  destinationWidth: number,
  destinationHeight: number,
  source: string[] | undefined,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  mask?: boolean[],
): string[] {
  const next = [...destination];
  if (!source) return next;
  for (let sy = 0; sy < sourceHeight; sy++) {
    const dy = y + sy;
    if (dy < 0 || dy >= destinationHeight) continue;
    for (let sx = 0; sx < sourceWidth; sx++) {
      if (mask && !mask[sy * sourceWidth + sx]) continue;
      const dx = x + sx;
      if (dx < 0 || dx >= destinationWidth) continue;
      next[dy * destinationWidth + dx] = source[sy * sourceWidth + sx] ?? "";
    }
  }
  return next;
}

export function pastePixelSelection(
  channels: PixelArtChannels,
  width: number,
  height: number,
  clip: PixelClipboard,
  x: number,
  y: number,
): { channels: PixelArtChannels; rect: PixelRect; mask?: boolean[] } {
  const px = Math.max(0, Math.min(Math.max(0, width - 1), Math.floor(x)));
  const py = Math.max(0, Math.min(Math.max(0, height - 1), Math.floor(y)));
  const rect = {
    x: px,
    y: py,
    w: Math.min(clip.width, width - px),
    h: Math.min(clip.height, height - py),
  };
  return {
    channels: {
      pixels: blit(channels.pixels, width, height, clip.pixels, clip.width, clip.height, px, py, clip.mask),
      emissivePixels: channels.emissivePixels
        ? blit(channels.emissivePixels, width, height, clip.emissivePixels, clip.width, clip.height, px, py, clip.mask)
        : undefined,
      shinePixels: channels.shinePixels
        ? blit(channels.shinePixels, width, height, clip.shinePixels, clip.width, clip.height, px, py, clip.mask)
        : undefined,
    },
    rect,
    mask: clip.mask
      ? Array.from({ length: rect.w * rect.h }, (_, index) =>
          clip.mask![Math.floor(index / rect.w) * clip.width + (index % rect.w)] === true,
        )
      : undefined,
  };
}

export function clearPixelSelection(
  channels: PixelArtChannels,
  width: number,
  height: number,
  rect: PixelRect,
  mask?: boolean[],
): PixelArtChannels {
  const clipped = clampPixelRect(rect, width, height);
  if (!clipped) return channels;
  return {
    pixels: clearRect(channels.pixels, width, clipped, mask),
    emissivePixels: channels.emissivePixels
      ? clearRect(channels.emissivePixels, width, clipped, mask)
      : undefined,
    shinePixels: channels.shinePixels
      ? clearRect(channels.shinePixels, width, clipped, mask)
      : undefined,
  };
}

export function movePixelSelection(
  channels: PixelArtChannels,
  width: number,
  height: number,
  rect: PixelRect,
  dx: number,
  dy: number,
  mask?: boolean[],
): { channels: PixelArtChannels; rect: PixelRect; mask?: boolean[] } {
  const clipped = clampPixelRect(rect, width, height) ?? rect;
  const moveX = Math.max(-clipped.x, Math.min(width - clipped.x - clipped.w, Math.round(dx)));
  const moveY = Math.max(-clipped.y, Math.min(height - clipped.y - clipped.h, Math.round(dy)));
  const clip = extractPixelSelection(channels, width, height, clipped, mask)!;
  const cleared = clearPixelSelection(channels, width, height, clipped, mask);
  return pastePixelSelection(cleared, width, height, clip, clipped.x + moveX, clipped.y + moveY);
}

export function duplicatePixelSelection(
  channels: PixelArtChannels,
  width: number,
  height: number,
  rect: PixelRect,
  dx: number,
  dy: number,
  mask?: boolean[],
): { channels: PixelArtChannels; rect: PixelRect; mask?: boolean[] } {
  const clipped = clampPixelRect(rect, width, height) ?? rect;
  const moveX = Math.max(-clipped.x, Math.min(width - clipped.x - clipped.w, Math.round(dx)));
  const moveY = Math.max(-clipped.y, Math.min(height - clipped.y - clipped.h, Math.round(dy)));
  const clip = extractPixelSelection(channels, width, height, clipped, mask)!;
  return pastePixelSelection(channels, width, height, clip, clipped.x + moveX, clipped.y + moveY);
}

function resizeChannel(
  source: string[] | undefined,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): string[] | undefined {
  if (!source) return undefined;
  const out = new Array(targetWidth * targetHeight).fill("");
  for (let y = 0; y < targetHeight; y++) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / targetHeight));
    for (let x = 0; x < targetWidth; x++) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / targetWidth));
      out[y * targetWidth + x] = source[sourceY * sourceWidth + sourceX] ?? "";
    }
  }
  return out;
}

export function resizePixelSelection(
  channels: PixelArtChannels,
  width: number,
  height: number,
  sourceRect: PixelRect,
  targetRect: PixelRect,
  mask?: boolean[],
): { channels: PixelArtChannels; rect: PixelRect; mask?: boolean[] } {
  const source = clampPixelRect(sourceRect, width, height) ?? sourceRect;
  const target = clampPixelRect(targetRect, width, height) ?? targetRect;
  const clip = extractPixelSelection(channels, width, height, source, mask)!;
  const resized: PixelClipboard = {
    width: target.w,
    height: target.h,
    pixels: resizeChannel(clip.pixels, clip.width, clip.height, target.w, target.h) ?? [],
    emissivePixels: resizeChannel(clip.emissivePixels, clip.width, clip.height, target.w, target.h),
    shinePixels: resizeChannel(clip.shinePixels, clip.width, clip.height, target.w, target.h),
    mask: resizePixelMask(clip.mask, clip.width, clip.height, target.w, target.h),
  };
  const cleared = clearPixelSelection(channels, width, height, source, mask);
  return pastePixelSelection(cleared, width, height, resized, target.x, target.y);
}

function transformChannel(
  source: string[] | undefined,
  width: number,
  height: number,
  transform: PixelTransform,
): { pixels: string[] | undefined; width: number; height: number } {
  if (!source) return { pixels: undefined, width, height };
  const rotate = transform === "rotate_cw";
  const outW = rotate ? height : width;
  const outH = rotate ? width : height;
  const out = new Array(outW * outH).fill("");
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tx = transform === "flip_x" ? width - 1 - x : transform === "rotate_cw" ? height - 1 - y : x;
      const ty = transform === "flip_y" ? height - 1 - y : transform === "rotate_cw" ? x : y;
      out[ty * outW + tx] = source[y * width + x] ?? "";
    }
  }
  return { pixels: out, width: outW, height: outH };
}

export function transformPixelSelection(
  channels: PixelArtChannels,
  width: number,
  height: number,
  rect: PixelRect,
  transform: PixelTransform,
  mask?: boolean[],
): { channels: PixelArtChannels; rect: PixelRect; mask?: boolean[] } {
  const clipped = clampPixelRect(rect, width, height) ?? rect;
  const clip = extractPixelSelection(channels, width, height, clipped, mask)!;
  const color = transformChannel(clip.pixels, clip.width, clip.height, transform);
  const glow = transformChannel(clip.emissivePixels, clip.width, clip.height, transform);
  const shine = transformChannel(clip.shinePixels, clip.width, clip.height, transform);
  const nextClip: PixelClipboard = {
    width: color.width,
    height: color.height,
    pixels: color.pixels ?? [],
    emissivePixels: glow.pixels,
    shinePixels: shine.pixels,
    mask: transformChannel(
      clip.mask?.map((selected) => (selected ? "1" : "")),
      clip.width,
      clip.height,
      transform,
    ).pixels?.map(Boolean),
  };
  const cleared = clearPixelSelection(channels, width, height, clipped, mask);
  const x = Math.min(clipped.x, Math.max(0, width - nextClip.width));
  const y = Math.min(clipped.y, Math.max(0, height - nextClip.height));
  return pastePixelSelection(cleared, width, height, nextClip, x, y);
}
