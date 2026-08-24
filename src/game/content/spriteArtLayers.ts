import type { EmberSpriteArtLayer } from "./types";

export const MAX_SPRITE_ART_LAYERS = 8;

export function newArtLayerId(): string {
  return `lyr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function emptyPixels(width: number, height: number): string[] {
  return new Array(Math.max(0, width) * Math.max(0, height)).fill("");
}

function copyPixelRect(
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

export function pixelHasInk(hex: string | undefined): boolean {
  return !!hex && hex !== "#00000000";
}

function parseHexRgb(
  hex: string,
): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function blendOver(dst: string, src: string, opacity: number): string {
  const s = parseHexRgb(src);
  if (!s || opacity <= 0) return dst;
  const t = Math.max(0, Math.min(1, opacity));
  const d = parseHexRgb(dst);
  if (!d) return t >= 0.97 ? src.toLowerCase() : rgbToHex(s.r * t, s.g * t, s.b * t);
  return rgbToHex(
    d.r + (s.r - d.r) * t,
    d.g + (s.g - d.g) * t,
    d.b + (s.b - d.b) * t,
  );
}

export function parseArtLayers(
  raw: unknown,
  width: number,
  height: number,
): EmberSpriteArtLayer[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const need = width * height;
  if (need <= 0) return undefined;
  const layers: EmberSpriteArtLayer[] = [];
  for (const item of raw.slice(0, MAX_SPRITE_ART_LAYERS)) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (!Array.isArray(rec.pixels)) continue;
    const src = rec.pixels.map((c) => (typeof c === "string" ? c : ""));
    const srcH = Math.floor(src.length / Math.max(1, width)) || height;
    const pixels =
      src.length === need ? [...src] : copyPixelRect(src, width, srcH, width, height);
    const opacityRaw = Number(rec.opacity);
    const opacity = Number.isFinite(opacityRaw)
      ? Math.max(0, Math.min(1, opacityRaw))
      : undefined;
    layers.push({
      id:
        typeof rec.id === "string" && rec.id.trim()
          ? rec.id.trim()
          : newArtLayerId(),
      nameRu:
        typeof rec.nameRu === "string" && rec.nameRu.trim()
          ? rec.nameRu.trim()
          : undefined,
      visible: rec.visible === false ? false : undefined,
      opacity: opacity === undefined || opacity >= 0.999 ? undefined : opacity,
      pixels,
    });
  }
  return layers.length ? layers : undefined;
}

export function cloneArtLayers(
  layers: EmberSpriteArtLayer[] | undefined,
): EmberSpriteArtLayer[] | undefined {
  if (!layers?.length) return undefined;
  return layers.map((layer) => ({
    ...layer,
    pixels: [...layer.pixels],
  }));
}

export function resizeArtLayers(
  layers: EmberSpriteArtLayer[] | undefined,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): EmberSpriteArtLayer[] | undefined {
  if (!layers?.length) return undefined;
  return layers.map((layer) => ({
    ...layer,
    pixels: copyPixelRect(layer.pixels, srcW, srcH, dstW, dstH),
  }));
}

export function compositeArtLayers(
  layers: EmberSpriteArtLayer[],
  width: number,
  height: number,
): string[] {
  const out = emptyPixels(width, height);
  const need = out.length;
  for (const layer of layers) {
    if (layer.visible === false) continue;
    const opacity = layer.opacity ?? 1;
    if (opacity <= 0) continue;
    const px = layer.pixels;
    for (let i = 0; i < need; i++) {
      const src = px[i] ?? "";
      if (!pixelHasInk(src)) continue;
      out[i] = blendOver(out[i] ?? "", src, opacity);
    }
  }
  return out;
}

export function packArtLayers(
  layers: EmberSpriteArtLayer[] | undefined,
): EmberSpriteArtLayer[] | undefined {
  if (!layers?.length) return undefined;
  const packed = layers
    .filter((layer) => layer.pixels.some((c) => pixelHasInk(c)) || layers.length > 1)
    .map((layer) => ({
      id: layer.id,
      nameRu: layer.nameRu,
      visible: layer.visible === false ? false : undefined,
      opacity:
        layer.opacity !== undefined && layer.opacity < 0.999
          ? layer.opacity
          : undefined,
      pixels: [...layer.pixels],
    }));
  if (!packed.length) return undefined;
  if (
    packed.length === 1 &&
    packed[0]!.visible !== false &&
    (packed[0]!.opacity === undefined || packed[0]!.opacity >= 0.999)
  ) {
    return undefined;
  }
  return packed;
}

export function ensureArtLayerStack(
  pixels: string[],
  _width: number,
  _height: number,
  existing: EmberSpriteArtLayer[] | undefined,
): EmberSpriteArtLayer[] {
  if (existing?.length) return existing.map((layer) => ({ ...layer, pixels: [...layer.pixels] }));
  return [
    {
      id: newArtLayerId(),
      nameRu: "Слой 1",
      pixels: [...pixels],
    },
  ];
}

export function makeEmptyArtLayer(
  width: number,
  height: number,
  index: number,
): EmberSpriteArtLayer {
  return {
    id: newArtLayerId(),
    nameRu: `Слой ${index}`,
    pixels: emptyPixels(width, height),
  };
}
