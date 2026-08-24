import type {
  EmberSpriteArtLayer,
  EmberSpriteArtLayerBlendMode,
} from "./types";

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
  return !!hex && !/^#[0-9a-f]{6}00$/i.test(hex);
}

export const SPRITE_ART_LAYER_BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "add",
] as const satisfies readonly EmberSpriteArtLayerBlendMode[];

type Rgba = { r: number; g: number; b: number; a: number };

function parseHexRgba(hex: string): Rgba | null {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
    a: m[2] ? Number.parseInt(m[2], 16) : 255,
  };
}

function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const h = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  const alpha = Math.max(0, Math.min(255, Math.round(a)));
  if (alpha <= 0) return "";
  const rgb = `#${h(r)}${h(g)}${h(b)}`;
  return alpha >= 255 ? rgb : `${rgb}${h(alpha)}`;
}

function blendChannel(
  backdrop: number,
  source: number,
  mode: EmberSpriteArtLayerBlendMode,
): number {
  if (mode === "multiply") return (backdrop * source) / 255;
  if (mode === "screen") return 255 - ((255 - backdrop) * (255 - source)) / 255;
  if (mode === "add") return Math.min(255, backdrop + source);
  return source;
}

function blendOver(
  dst: string,
  src: string,
  opacity: number,
  mode: EmberSpriteArtLayerBlendMode,
): string {
  const s = parseHexRgba(src);
  if (!s || s.a <= 0 || opacity <= 0) return dst;
  const d = parseHexRgba(dst) ?? { r: 0, g: 0, b: 0, a: 0 };
  const sa = (s.a / 255) * Math.max(0, Math.min(1, opacity));
  const da = d.a / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 0) return "";
  const channel = (backdrop: number, source: number) => {
    const mixed = blendChannel(backdrop, source, mode);
    return (
      (1 - sa) * da * backdrop +
      (1 - da) * sa * source +
      da * sa * mixed
    ) / outA;
  };
  return rgbaToHex(
    channel(d.r, s.r),
    channel(d.g, s.g),
    channel(d.b, s.b),
    outA * 255,
  );
}

function parseBlendMode(raw: unknown): EmberSpriteArtLayerBlendMode | undefined {
  return typeof raw === "string" &&
    SPRITE_ART_LAYER_BLEND_MODES.includes(raw as EmberSpriteArtLayerBlendMode) &&
    raw !== "normal"
    ? (raw as EmberSpriteArtLayerBlendMode)
    : undefined;
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
      blendMode: parseBlendMode(rec.blendMode),
      locked: rec.locked === true ? true : undefined,
      alphaLocked: rec.alphaLocked === true ? true : undefined,
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
      if (
        opacity >= 0.999 &&
        (layer.blendMode === undefined || layer.blendMode === "normal") &&
        /^#[0-9a-f]{6}$/i.test(src)
      ) {
        out[i] = src.toLowerCase();
        continue;
      }
      out[i] = blendOver(out[i] ?? "", src, opacity, layer.blendMode ?? "normal");
    }
  }
  return out;
}

export function packArtLayers(
  layers: EmberSpriteArtLayer[] | undefined,
): EmberSpriteArtLayer[] | undefined {
  if (!layers?.length) return undefined;
  const packed = layers
    .filter(
      (layer) =>
        layer.pixels.some((c) => pixelHasInk(c)) ||
        layers.length > 1 ||
        layer.visible === false ||
        (layer.opacity ?? 1) < 0.999 ||
        !!layer.blendMode ||
        !!layer.locked ||
        !!layer.alphaLocked,
    )
    .map((layer) => ({
      id: layer.id,
      nameRu: layer.nameRu,
      visible: layer.visible === false ? false : undefined,
      opacity:
        layer.opacity !== undefined && layer.opacity < 0.999
          ? layer.opacity
          : undefined,
      blendMode:
        layer.blendMode && layer.blendMode !== "normal"
          ? layer.blendMode
          : undefined,
      locked: layer.locked === true ? true : undefined,
      alphaLocked: layer.alphaLocked === true ? true : undefined,
      pixels: [...layer.pixels],
    }));
  if (!packed.length) return undefined;
  if (
    packed.length === 1 &&
    packed[0]!.visible !== false &&
    (packed[0]!.opacity === undefined || packed[0]!.opacity >= 0.999) &&
    !packed[0]!.blendMode &&
    !packed[0]!.locked &&
    !packed[0]!.alphaLocked
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

/** Applies the active layer edit locks without mutating either input buffer. */
export function constrainArtLayerPixels(
  layer: EmberSpriteArtLayer,
  candidate: string[],
): string[] {
  if (layer.locked) return layer.pixels;
  if (!layer.alphaLocked) return candidate;
  let changed = false;
  const next = layer.pixels.map((previous, index) => {
    const before = parseHexRgba(previous);
    if (!before || before.a <= 0) return previous;
    const after = parseHexRgba(candidate[index] ?? "");
    if (!after || after.a <= 0) return previous;
    const value = rgbaToHex(after.r, after.g, after.b, before.a);
    if (value !== previous) changed = true;
    return value;
  });
  return changed ? next : layer.pixels;
}
