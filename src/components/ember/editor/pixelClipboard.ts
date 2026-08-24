/** Shared pixel clipboard for tile + sprite editors (square or rect). */

export type PixelArtChannels = {
  pixels: string[];
  emissivePixels?: string[];
  shinePixels?: string[];
};

export type PixelClipboard = {
  width: number;
  height: number;
  pixels: string[];
  emissivePixels?: string[];
  shinePixels?: string[];
  /** @deprecated legacy square field */
  size?: number;
};

const STORAGE_KEY = "ember-pixel-clipboard-v1";

let memory: PixelClipboard | null = null;

function emptyPixels(w: number, h: number): string[] {
  return new Array(Math.max(0, w) * Math.max(0, h)).fill("");
}

function blitChannel(
  src: string[],
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): string[] {
  const next = emptyPixels(dstW, dstH);
  const cw = Math.min(srcW, dstW);
  const ch = Math.min(srcH, dstH);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      next[y * dstW + x] = src[y * srcW + x] ?? "";
    }
  }
  return next;
}

function optionalChannel(
  raw: string[] | undefined,
  width: number,
  height: number,
): string[] | undefined {
  if (!Array.isArray(raw) || raw.length !== width * height) return undefined;
  return [...raw];
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
      emissivePixels: optionalChannel(
        raw.emissivePixels,
        raw.width,
        raw.height,
      ),
      shinePixels: optionalChannel(raw.shinePixels, raw.width, raw.height),
    };
  }
  // Legacy square clipboard
  const size = raw.size ?? raw.width;
  if (Number.isFinite(size) && raw.pixels.length === size * size) {
    return {
      width: size,
      height: size,
      pixels: raw.pixels,
      emissivePixels: optionalChannel(raw.emissivePixels, size, size),
      shinePixels: optionalChannel(raw.shinePixels, size, size),
      size,
    };
  }
  return null;
}

function persist(next: PixelClipboard): void {
  memory = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // quota / private mode
  }
}

/** Copy pixel art. Pass height for rectangles; omit for square (`size×size`). */
export function copyPixelArt(
  pixels: string[],
  width: number,
  height?: number,
): void {
  const h = height ?? width;
  persist({
    width,
    height: h,
    pixels: [...pixels],
    size: width === h ? width : undefined,
  });
}

/** Copy color + optional glow/shine so sprite paste cannot desync channels. */
export function copyPixelArtChannels(
  width: number,
  height: number,
  channels: PixelArtChannels,
): void {
  persist({
    width,
    height,
    pixels: [...channels.pixels],
    emissivePixels: optionalChannel(channels.emissivePixels, width, height),
    shinePixels: optionalChannel(channels.shinePixels, width, height),
    size: width === height ? width : undefined,
  });
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
  return blitChannel(src.pixels, src.width, src.height, targetW, th);
}

/** Paste color and, when present on the clipboard, glow/shine. */
export function pastePixelArtChannels(
  targetW: number,
  targetH?: number,
): PixelArtChannels | null {
  const src = peekPixelClipboard();
  if (!src) return null;
  const th = targetH ?? targetW;
  const out: PixelArtChannels = {
    pixels: blitChannel(src.pixels, src.width, src.height, targetW, th),
  };
  if (src.emissivePixels) {
    out.emissivePixels = blitChannel(
      src.emissivePixels,
      src.width,
      src.height,
      targetW,
      th,
    );
  }
  if (src.shinePixels) {
    out.shinePixels = blitChannel(
      src.shinePixels,
      src.width,
      src.height,
      targetW,
      th,
    );
  }
  return out;
}
