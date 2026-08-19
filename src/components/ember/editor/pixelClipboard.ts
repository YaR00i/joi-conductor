/** Shared pixel clipboard for tile + sprite editors (square or rect). */

export type PixelClipboard = {
  width: number;
  height: number;
  pixels: string[];
  /** @deprecated legacy square field */
  size?: number;
};

const STORAGE_KEY = "ember-pixel-clipboard-v1";

let memory: PixelClipboard | null = null;

function emptyPixels(w: number, h: number): string[] {
  return new Array(Math.max(0, w) * Math.max(0, h)).fill("");
}

function normalizeClip(raw: PixelClipboard): PixelClipboard | null {
  if (!raw || !Array.isArray(raw.pixels)) return null;
  if (
    Number.isFinite(raw.width) &&
    Number.isFinite(raw.height) &&
    raw.pixels.length === raw.width * raw.height
  ) {
    return {
      width: raw.width,
      height: raw.height,
      pixels: raw.pixels,
    };
  }
  // Legacy square clipboard
  const size = raw.size ?? raw.width;
  if (
    Number.isFinite(size) &&
    raw.pixels.length === size * size
  ) {
    return { width: size, height: size, pixels: raw.pixels, size };
  }
  return null;
}

/** Copy pixel art. Pass height for rectangles; omit for square (`size×size`). */
export function copyPixelArt(
  pixels: string[],
  width: number,
  height?: number,
): void {
  const h = height ?? width;
  memory = { width, height: h, pixels: [...pixels], size: width === h ? width : undefined };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // quota / private mode
  }
}

export function hasPixelClipboard(): boolean {
  return peekPixelClipboard() != null;
}

export function peekPixelClipboard(): PixelClipboard | null {
  if (memory) {
    const n = normalizeClip(memory);
    if (n) {
      memory = n;
      return memory;
    }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = normalizeClip(JSON.parse(raw) as PixelClipboard);
    if (!parsed) return null;
    memory = parsed;
    return memory;
  } catch {
    return null;
  }
}

/** Paste into targetW×targetH (top-left aligned, clipped). Square: omit height. */
export function pastePixelArt(
  targetW: number,
  targetH?: number,
): string[] | null {
  const src = peekPixelClipboard();
  if (!src) return null;
  const th = targetH ?? targetW;
  const next = emptyPixels(targetW, th);
  const cw = Math.min(src.width, targetW);
  const ch = Math.min(src.height, th);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      next[y * targetW + x] = src.pixels[y * src.width + x] ?? "";
    }
  }
  return next;
}
