import { normalizeEmberLibraryTags } from "./libraryTags";
import type {
  EmberCharacterCardView,
  EmberEmissiveAnim,
  EmberEmissiveTriggerWhen,
  EmberMaterialKind,
  EmberPixelSprite,
  EmberSpriteAnimFrame,
  EmberSpriteCardExtraView,
  EmberSpriteCardFace,
  EmberSpriteSize,
} from "./types";
import { EMBER_SPRITE_CARD_EXTRA_VIEWS } from "./types";
import {
  cloneArtLayers,
  compositeArtLayers,
  packArtLayers,
  parseArtLayers,
  resizeArtLayers,
} from "./spriteArtLayers";
import {
  MAX_SPRITE_ANIM_FRAMES,
  clampSpriteFrameDuration,
  newSpriteFrameId,
} from "./spriteAnimFrames";
import {
  DEFAULT_EMISSIVE_LIGHT_RANGE,
  DEFAULT_EMISSIVE_STRENGTH,
  MAX_EMISSIVE_LIGHT_RANGE,
  MAX_EMISSIVE_STRENGTH,
  MIN_EMISSIVE_LIGHT_RANGE,
  MIN_EMISSIVE_STRENGTH,
} from "../tile/lightLimits";

const MATERIAL_KINDS: readonly EmberMaterialKind[] = [
  "stone",
  "wood",
  "path",
  "grass",
  "metal",
  "cloth",
];

function normalizeSpriteMaterial(raw: unknown): EmberMaterialKind | undefined {
  if (typeof raw !== "string") return undefined;
  return (MATERIAL_KINDS as readonly string[]).includes(raw)
    ? (raw as EmberMaterialKind)
    : undefined;
}

const TRIGGER_WHENS: readonly EmberEmissiveTriggerWhen[] = [
  "player",
  "enemy",
  "either",
  "event",
] as const;

function normalizeEmissiveTriggerWhen(
  raw: unknown,
): EmberEmissiveTriggerWhen | undefined {
  if (typeof raw !== "string") return undefined;
  return (TRIGGER_WHENS as readonly string[]).includes(raw)
    ? (raw as EmberEmissiveTriggerWhen)
    : undefined;
}

function normalizeEmissiveAnimPeriod(raw: unknown): number | undefined {
  if (!Number.isFinite(raw as number)) return undefined;
  return Math.max(0.08, Math.min(20, Number(raw)));
}

function normalizeEmissiveFlickerWaitMin(raw: unknown): number | undefined {
  if (!Number.isFinite(raw as number)) return undefined;
  return Math.max(0.08, Math.min(120, Number(raw)));
}

function normalizeEmissiveFlickerWaitMax(raw: unknown): number | undefined {
  if (!Number.isFinite(raw as number)) return undefined;
  return Math.max(0.08, Math.min(180, Number(raw)));
}

const EMISSIVE_ANIMS: readonly EmberEmissiveAnim[] = [
  "always",
  "pulse",
  "flicker",
  "trigger",
] as const;

function normalizeEmissiveAnim(
  raw: unknown,
): EmberEmissiveAnim | undefined {
  if (typeof raw !== "string") return undefined;
  return (EMISSIVE_ANIMS as readonly string[]).includes(raw)
    ? (raw as EmberEmissiveAnim)
    : undefined;
}

function normalizeEmissiveStrength(raw: unknown): number | undefined {
  if (!Number.isFinite(raw as number)) return undefined;
  const v = Math.max(
    MIN_EMISSIVE_STRENGTH,
    Math.min(MAX_EMISSIVE_STRENGTH, Number(raw)),
  );
  return Math.abs(v - DEFAULT_EMISSIVE_STRENGTH) < 0.001 ? undefined : v;
}

function normalizeEmissiveBloomColor(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(raw.trim());
  if (!m) return undefined;
  return `#${m[1]!.toLowerCase()}`;
}

function normalizeEmissiveCastsLight(raw: unknown): boolean | undefined {
  return raw === true ? true : undefined;
}

function normalizeEmissiveLightShadows(raw: unknown): boolean | undefined {
  return raw === true ? true : undefined;
}

function normalizeEmissiveLightRange(raw: unknown): number | undefined {
  if (!Number.isFinite(raw as number)) return undefined;
  const v = Math.max(
    MIN_EMISSIVE_LIGHT_RANGE,
    Math.min(MAX_EMISSIVE_LIGHT_RANGE, Number(raw)),
  );
  // Drop default so JSON stays lean.
  if (Math.abs(v - DEFAULT_EMISSIVE_LIGHT_RANGE) < 0.001) return undefined;
  return Math.round(v * 100) / 100;
}

export const SPRITE_DIM_MIN = 4;
export const SPRITE_DIM_MAX = 64;
export const SPRITE_BLANK_WIDTH = 32;
export const SPRITE_BLANK_HEIGHT = 48;
export const SPRITE_DECOR_SIZE = 16;
export const SPRITE_WALL_H_MIN = 1;
export const SPRITE_WALL_H_MAX = 64;
export const SPRITE_WALL_MAX_STRIPS = 8;

export function clampSpriteDim(
  n: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function spriteWallHeight(
  s: Pick<EmberPixelSprite, "wallHeights">,
): number {
  return (s.wallHeights ?? []).reduce((a, h) => a + h, 0);
}

export function spriteTotalHeight(
  s: Pick<EmberPixelSprite, "topHeight" | "wallHeights">,
): number {
  return Math.max(0, s.topHeight) + spriteWallHeight(s);
}

export function emptySpritePixels(width: number, height: number): string[] {
  const n = Math.max(0, width) * Math.max(0, height);
  return new Array(n).fill("");
}

/** Cap extra swatches; color-picker drag trails collapse into one slot. */
export const MAX_PALETTE_FAVORITES = 24;
const PALETTE_NEAR_RGB = 16;

function parsePaletteRgb(
  hex: string,
): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function paletteRgbDist(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function prunePaletteFavorites(colors: string[]): string[] {
  const kept: string[] = [];
  for (const raw of colors) {
    const hex = raw.trim().toLowerCase();
    if (!hex.startsWith("#") || (hex.length !== 7 && hex !== "#00000000")) {
      continue;
    }
    if (kept.includes(hex)) continue;
    const rgb = parsePaletteRgb(hex);
    if (!rgb) {
      kept.push(hex);
      continue;
    }
    const nearIdx = kept.findIndex((c) => {
      const other = parsePaletteRgb(c);
      return other ? paletteRgbDist(rgb, other) < PALETTE_NEAR_RGB : false;
    });
    if (nearIdx >= 0) {
      kept[nearIdx] = hex;
      continue;
    }
    kept.push(hex);
  }
  return kept.length > MAX_PALETTE_FAVORITES
    ? kept.slice(kept.length - MAX_PALETTE_FAVORITES)
    : kept;
}

export function spriteFaceHasInk(pixels?: string[] | null): boolean {
  return !!pixels?.some((c) => c && c !== "#00000000");
}

function optionalInkChannel(
  pixels: string[] | undefined,
): string[] | undefined {
  return spriteFaceHasInk(pixels) ? pixels : undefined;
}

function parseSpriteCardFace(
  raw: unknown,
  width: number,
  height: number,
): EmberSpriteCardFace | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const artLayers = parseArtLayers(rec.artLayers, width, height);
  const hasPixelBuf =
    Array.isArray(rec.pixels) && rec.pixels.length === width * height;
  if (!hasPixelBuf && !artLayers?.length) return undefined;
  const pixels = artLayers?.length
    ? compositeArtLayers(artLayers, width, height)
    : (rec.pixels as unknown[]).map((c) => (typeof c === "string" ? c : ""));
  const emissivePixels = Array.isArray(rec.emissivePixels)
    ? matchChannelSize(
        rec.emissivePixels as string[],
        width,
        height,
        width,
        height,
      )
    : undefined;
  const shinePixels = Array.isArray(rec.shinePixels)
    ? matchChannelSize(
        rec.shinePixels as string[],
        width,
        height,
        width,
        height,
      )
    : undefined;
  return {
    pixels,
    emissivePixels: optionalInkChannel(emissivePixels),
    shinePixels: optionalInkChannel(shinePixels),
    artLayers,
  };
}

export function parseSpriteCardViews(
  raw: unknown,
  width: number,
  height: number,
): EmberPixelSprite["views"] {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const views: NonNullable<EmberPixelSprite["views"]> = {};
  for (const key of EMBER_SPRITE_CARD_EXTRA_VIEWS) {
    const face = parseSpriteCardFace(rec[key], width, height);
    if (face) views[key] = face;
  }
  return Object.keys(views).length ? views : undefined;
}

function serializeSpriteCardFace(face: EmberSpriteCardFace): EmberSpriteCardFace {
  return {
    pixels: [...face.pixels],
    emissivePixels: face.emissivePixels
      ? [...face.emissivePixels]
      : undefined,
    shinePixels: face.shinePixels ? [...face.shinePixels] : undefined,
    artLayers: packArtLayers(face.artLayers),
  };
}

function serializeSpriteCardViews(
  views: EmberPixelSprite["views"],
): EmberPixelSprite["views"] {
  if (!views) return undefined;
  const next: NonNullable<EmberPixelSprite["views"]> = {};
  for (const key of EMBER_SPRITE_CARD_EXTRA_VIEWS) {
    const face = views[key];
    if (face) next[key] = serializeSpriteCardFace(face);
  }
  return Object.keys(next).length ? next : undefined;
}

function cloneSpriteCardFace(face: EmberSpriteCardFace): EmberSpriteCardFace {
  return {
    pixels: [...face.pixels],
    emissivePixels: face.emissivePixels
      ? [...face.emissivePixels]
      : undefined,
    shinePixels: face.shinePixels ? [...face.shinePixels] : undefined,
    artLayers: cloneArtLayers(face.artLayers),
  };
}

function cloneSpriteCardViews(
  views: EmberPixelSprite["views"],
): EmberPixelSprite["views"] {
  if (!views) return undefined;
  const next: NonNullable<EmberPixelSprite["views"]> = {};
  for (const key of EMBER_SPRITE_CARD_EXTRA_VIEWS) {
    const face = views[key];
    if (face) next[key] = cloneSpriteCardFace(face);
  }
  return Object.keys(next).length ? next : undefined;
}

function parseAnimFrame(
  raw: unknown,
  width: number,
  height: number,
): EmberSpriteAnimFrame | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const artLayers = parseArtLayers(rec.artLayers, width, height);
  const need = width * height;
  const hasPixels = Array.isArray(rec.pixels) && rec.pixels.length === need;
  if (!hasPixels && !artLayers?.length) return undefined;
  const pixels = artLayers?.length
    ? compositeArtLayers(artLayers, width, height)
    : (rec.pixels as unknown[]).map((c) => (typeof c === "string" ? c : ""));
  const emissivePixels = Array.isArray(rec.emissivePixels)
    ? matchChannelSize(
        rec.emissivePixels as string[],
        width,
        height,
        width,
        height,
      )
    : undefined;
  const shinePixels = Array.isArray(rec.shinePixels)
    ? matchChannelSize(rec.shinePixels as string[], width, height, width, height)
    : undefined;
  return {
    id:
      typeof rec.id === "string" && rec.id.trim()
        ? rec.id.trim()
        : newSpriteFrameId(),
    durationMs: clampSpriteFrameDuration(rec.durationMs),
    pixels,
    emissivePixels: optionalInkChannel(emissivePixels),
    shinePixels: optionalInkChannel(shinePixels),
    artLayers,
    views: parseSpriteCardViews(rec.views, width, height),
  };
}

function parseAnimFrames(
  raw: unknown,
  width: number,
  height: number,
): EmberSpriteAnimFrame[] | undefined {
  if (!Array.isArray(raw) || raw.length < 2) return undefined;
  const frames: EmberSpriteAnimFrame[] = [];
  for (const item of raw.slice(0, MAX_SPRITE_ANIM_FRAMES)) {
    const frame = parseAnimFrame(item, width, height);
    if (frame) frames.push(frame);
  }
  return frames.length >= 2 ? frames : undefined;
}

function resizeAnimFrames(
  frames: EmberSpriteAnimFrame[] | undefined,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): EmberSpriteAnimFrame[] | undefined {
  if (!frames?.length) return undefined;
  return frames.map((frame) => {
    const artLayers = resizeArtLayers(
      frame.artLayers,
      srcW,
      srcH,
      dstW,
      dstH,
    );
    return {
      id: frame.id,
      durationMs: frame.durationMs,
      pixels: artLayers?.length
        ? compositeArtLayers(artLayers, dstW, dstH)
        : copyPixelRect(frame.pixels, srcW, srcH, dstW, dstH),
      emissivePixels: fitChannelBuffer(
        frame.emissivePixels,
        srcW,
        srcH,
        dstW,
        dstH,
      ),
      shinePixels: fitChannelBuffer(frame.shinePixels, srcW, srcH, dstW, dstH),
      artLayers,
      views: resizeSpriteCardViews(frame.views, srcW, srcH, dstW, dstH),
    };
  });
}

function serializeAnimFrame(frame: EmberSpriteAnimFrame): EmberSpriteAnimFrame {
  return {
    id: frame.id,
    durationMs: clampSpriteFrameDuration(frame.durationMs),
    pixels: [...frame.pixels],
    emissivePixels: frame.emissivePixels
      ? [...frame.emissivePixels]
      : undefined,
    shinePixels: frame.shinePixels ? [...frame.shinePixels] : undefined,
    artLayers: packArtLayers(frame.artLayers),
    views: serializeSpriteCardViews(frame.views),
  };
}

function packAnimFrames(
  frames: EmberSpriteAnimFrame[] | undefined,
): EmberSpriteAnimFrame[] | undefined {
  if (!frames || frames.length < 2) return undefined;
  return frames.slice(0, MAX_SPRITE_ANIM_FRAMES).map(serializeAnimFrame);
}

function applyAnimFrameToSprite(
  sprite: EmberPixelSprite,
  frame: EmberSpriteAnimFrame,
): EmberPixelSprite {
  return {
    ...sprite,
    pixels: [...frame.pixels],
    emissivePixels: frame.emissivePixels
      ? [...frame.emissivePixels]
      : undefined,
    shinePixels: frame.shinePixels ? [...frame.shinePixels] : undefined,
    artLayers: cloneArtLayers(frame.artLayers),
    views: cloneSpriteCardViews(frame.views),
  };
}

function withAnimFrames(
  sprite: EmberPixelSprite,
  raw: { frames?: unknown } | undefined,
): EmberPixelSprite {
  const frames = parseAnimFrames(
    raw?.frames,
    sprite.width,
    spriteTotalHeight(sprite),
  );
  if (!frames?.length) return sprite;
  return { ...applyAnimFrameToSprite(sprite, frames[0]!), frames };
}

export function spriteHasAnimFrames(sprite: EmberPixelSprite): boolean {
  return (sprite.frames?.length ?? 0) >= 2;
}

/** Overlay a timeline cel onto the sprite for rendering. */
export function composeSpriteForFrame(
  sprite: EmberPixelSprite,
  frameIndex: number,
): EmberPixelSprite {
  const frames = sprite.frames;
  if (!frames || frames.length < 2) return sprite;
  const i = Math.max(0, Math.min(frames.length - 1, frameIndex));
  const frame = frames[i];
  if (!frame) return sprite;
  return applyAnimFrameToSprite(sprite, frame);
}

function resizeSpriteCardViews(
  views: EmberPixelSprite["views"],
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): EmberPixelSprite["views"] {
  if (!views) return undefined;
  const next: NonNullable<EmberPixelSprite["views"]> = {};
  for (const key of EMBER_SPRITE_CARD_EXTRA_VIEWS) {
    const face = views[key];
    if (!face) continue;
    const artLayers = resizeArtLayers(
      face.artLayers,
      srcW,
      srcH,
      dstW,
      dstH,
    );
    next[key] = {
      pixels: artLayers?.length
        ? compositeArtLayers(artLayers, dstW, dstH)
        : copyPixelRect(face.pixels, srcW, srcH, dstW, dstH),
      emissivePixels: fitChannelBuffer(
        face.emissivePixels,
        srcW,
        srcH,
        dstW,
        dstH,
      ),
      shinePixels: fitChannelBuffer(face.shinePixels, srcW, srcH, dstW, dstH),
      artLayers,
    };
  }
  return Object.keys(next).length ? next : undefined;
}

function withCardViews(
  sprite: EmberPixelSprite,
  raw: { views?: unknown },
): EmberPixelSprite {
  const views = parseSpriteCardViews(
    raw.views,
    sprite.width,
    spriteTotalHeight(sprite),
  );
  return views ? { ...sprite, views } : sprite;
}

function withArtLayers(
  sprite: EmberPixelSprite,
  raw: { artLayers?: unknown } | undefined,
): EmberPixelSprite {
  const artLayers = parseArtLayers(
    raw?.artLayers,
    sprite.width,
    spriteTotalHeight(sprite),
  );
  if (!artLayers?.length) return sprite;
  return {
    ...sprite,
    artLayers,
    pixels: compositeArtLayers(
      artLayers,
      sprite.width,
      spriteTotalHeight(sprite),
    ),
  };
}

export function spriteHasExtraCardViews(sprite: EmberPixelSprite): boolean {
  const views = sprite.views;
  if (!views) return false;
  return EMBER_SPRITE_CARD_EXTRA_VIEWS.some((key) => Boolean(views[key]));
}

/** Overlay an extra face onto `pixels` for rendering. Missing face = front. */
export function composeSpriteForView(
  sprite: EmberPixelSprite,
  view: EmberCharacterCardView,
): EmberPixelSprite {
  if (view === "front") return sprite;
  const face = sprite.views?.[view as EmberSpriteCardExtraView];
  if (!face) return sprite;
  return {
    ...sprite,
    pixels: face.pixels,
    emissivePixels: face.emissivePixels,
    shinePixels: face.shinePixels,
  };
}

/** Slice a horizontal band from a width×total buffer. */
export function sliceSpriteBand(
  pixels: string[],
  width: number,
  row0: number,
  bandH: number,
): string[] {
  const w = Math.max(1, width);
  const h = Math.max(0, bandH);
  const out = emptySpritePixels(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[y * w + x] = pixels[(row0 + y) * w + x] ?? "";
    }
  }
  return out;
}

export function sliceSpriteTop(sprite: EmberPixelSprite): string[] {
  return sliceSpriteBand(sprite.pixels, sprite.width, 0, sprite.topHeight);
}

export function sliceSpriteWall(
  sprite: EmberPixelSprite,
  index: number,
): string[] {
  let row = sprite.topHeight;
  for (let i = 0; i < index; i++) {
    row += sprite.wallHeights[i] ?? 0;
  }
  const h = sprite.wallHeights[index] ?? 0;
  return sliceSpriteBand(sprite.pixels, sprite.width, row, h);
}

/**
 * Copy a rectangular region into a new buffer (top-left, clipped).
 */
export function copyPixelRect(
  src: string[],
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): string[] {
  const next = emptySpritePixels(dstW, dstH);
  const cw = Math.min(srcW, dstW);
  const ch = Math.min(srcH, dstH);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      next[y * dstW + x] = src[y * srcW + x] ?? "";
    }
  }
  return next;
}

/**
 * Fit glow/shine (or any channel) from srcW×srcH into dstW×dstH.
 * Uses the same top-left copy as color — never the destination width as srcW.
 */
export function fitChannelBuffer(
  raw: string[] | undefined,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): string[] | undefined {
  if (!Array.isArray(raw) || !spriteFaceHasInk(raw)) return undefined;
  const w = Math.max(1, srcW);
  const inferredH = Math.floor(raw.length / w) || srcH;
  const h = inferredH > 0 ? inferredH : srcH;
  if (w === dstW && h === dstH && raw.length === dstW * dstH) {
    return [...raw];
  }
  return copyPixelRect(raw, w, h, dstW, dstH);
}

/**
 * Always return a dstW×dstH buffer. Same-length copy, otherwise top-left fit
 * from srcW×srcH — never treat the destination width as the source stride.
 */
export function matchChannelSize(
  raw: string[] | undefined,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): string[] {
  const need = Math.max(0, dstW) * Math.max(0, dstH);
  if (Array.isArray(raw) && raw.length === need) return [...raw];
  return (
    fitChannelBuffer(raw, srcW, srcH, dstW, dstH) ??
    emptySpritePixels(dstW, dstH)
  );
}

/** Rebuild unified pixels from top + wall bands. */
export function joinSpriteBands(
  width: number,
  top: string[],
  topHeight: number,
  walls: string[][],
  wallHeights: number[],
): string[] {
  const totalH = topHeight + wallHeights.reduce((a, h) => a + h, 0);
  const out = emptySpritePixels(width, totalH);
  const writeBand = (band: string[], row0: number, bandH: number) => {
    for (let y = 0; y < bandH; y++) {
      for (let x = 0; x < width; x++) {
        out[(row0 + y) * width + x] = band[y * width + x] ?? "";
      }
    }
  };
  writeBand(
    copyPixelRect(top, width, topHeight, width, topHeight),
    0,
    topHeight,
  );
  let row = topHeight;
  for (let i = 0; i < wallHeights.length; i++) {
    const h = wallHeights[i]!;
    writeBand(
      copyPixelRect(
        walls[i] ?? emptySpritePixels(width, h),
        width,
        h,
        width,
        h,
      ),
      row,
      h,
    );
    row += h;
  }
  return out;
}

function spriteWithResizedCanvas(
  sprite: EmberPixelSprite,
  w: number,
  h: number,
  pixels: string[],
  emissivePixels: string[] | undefined,
  shinePixels: string[] | undefined,
): EmberPixelSprite {
  const artLayers = resizeArtLayers(
    sprite.artLayers,
    sprite.width,
    spriteTotalHeight(sprite),
    w,
    h,
  );
  const next: EmberPixelSprite = {
    id: sprite.id,
    nameRu: sprite.nameRu,
    tags: sprite.tags ? [...sprite.tags] : undefined,
    componentStates: sprite.componentStates
      ? { ...sprite.componentStates }
      : undefined,
    width: w,
    topHeight: h,
    wallHeights: [],
    pixels: artLayers?.length
      ? compositeArtLayers(artLayers, w, h)
      : pixels,
    emissivePixels,
    shinePixels,
    artLayers,
    emissiveAnim: normalizeEmissiveAnim(sprite.emissiveAnim),
    emissiveStrength: normalizeEmissiveStrength(sprite.emissiveStrength),
    emissiveBloomColor: normalizeEmissiveBloomColor(sprite.emissiveBloomColor),
    emissiveCastsLight: normalizeEmissiveCastsLight(sprite.emissiveCastsLight),
    emissiveLightRange: normalizeEmissiveLightRange(sprite.emissiveLightRange),
    emissiveLightShadows: normalizeEmissiveLightShadows(
      sprite.emissiveLightShadows,
    ),
    emissiveAnimPeriod: normalizeEmissiveAnimPeriod(sprite.emissiveAnimPeriod),
    emissiveAnimPeriodMin: normalizeEmissiveFlickerWaitMin(
      sprite.emissiveAnimPeriodMin,
    ),
    emissiveAnimPeriodMax: normalizeEmissiveFlickerWaitMax(
      sprite.emissiveAnimPeriodMax,
    ),
    emissiveTriggerRadius:
      Number.isFinite(sprite.emissiveTriggerRadius) &&
      (sprite.emissiveTriggerRadius as number) > 0
        ? Math.max(1, Math.min(12, Math.round(sprite.emissiveTriggerRadius!)))
        : undefined,
    emissiveTriggerWhen: normalizeEmissiveTriggerWhen(
      sprite.emissiveTriggerWhen,
    ),
    emissiveTriggerEventId:
      typeof sprite.emissiveTriggerEventId === "string" &&
      sprite.emissiveTriggerEventId.trim()
        ? sprite.emissiveTriggerEventId.trim()
        : undefined,
    color: sprite.color,
    roles: sprite.roles ? [...sprite.roles] : undefined,
    solid: sprite.solid || undefined,
    collider: sprite.collider ? { ...sprite.collider } : undefined,
    glow: sprite.glow || undefined,
    material: sprite.material,
    views: resizeSpriteCardViews(
      sprite.views,
      sprite.width,
      spriteTotalHeight(sprite),
      w,
      h,
    ),
    frames: resizeAnimFrames(
      sprite.frames,
      sprite.width,
      spriteTotalHeight(sprite),
      w,
      h,
    ),
  };
  return next.frames?.[0]
    ? { ...applyAnimFrameToSprite(next, next.frames[0]), frames: next.frames }
    : next;
}

/**
 * Resize the paintable W×H canvas. Color, glow, and shine share one
 * top-left copy. Result is always flat (`topHeight = H`, `wallHeights = []`).
 */
export function resizeSpriteCanvas(
  sprite: EmberPixelSprite,
  nextWidth: number,
  nextHeight: number,
): EmberPixelSprite {
  const srcW = sprite.width;
  const srcH = spriteTotalHeight(sprite);
  const w = clampSpriteDim(
    nextWidth,
    SPRITE_DIM_MIN,
    SPRITE_DIM_MAX,
    srcW,
  );
  const h = clampSpriteDim(
    nextHeight,
    SPRITE_DIM_MIN,
    SPRITE_DIM_MAX,
    srcH,
  );
  const pixels = copyPixelRect(sprite.pixels, srcW, srcH, w, h);
  const emissivePixels = fitChannelBuffer(
    sprite.emissivePixels,
    srcW,
    srcH,
    w,
    h,
  );
  const shinePixels = fitChannelBuffer(
    sprite.shinePixels,
    srcW,
    srcH,
    w,
    h,
  );
  return spriteWithResizedCanvas(
    sprite,
    w,
    h,
    pixels,
    emissivePixels,
    shinePixels,
  );
}

/**
 * Editor save adapter: one image, `topHeight = H`, no wall strips.
 * Does not change pixel contents besides matching W×H length.
 */
export function flattenSpriteForEditor(
  sprite: EmberPixelSprite,
): EmberPixelSprite {
  const h = spriteTotalHeight(sprite);
  if (sprite.wallHeights.length === 0 && sprite.topHeight === h) {
    return sprite;
  }
  return spriteWithResizedCanvas(
    sprite,
    sprite.width,
    h,
    copyPixelRect(sprite.pixels, sprite.width, h, sprite.width, h),
    fitChannelBuffer(
      sprite.emissivePixels,
      sprite.width,
      h,
      sprite.width,
      h,
    ),
    fitChannelBuffer(
      sprite.shinePixels,
      sprite.width,
      h,
      sprite.width,
      h,
    ),
  );
}

/**
 * Resize geometry. Destination size is a single rectangle (sum of requested
 * bands). Glow/shine follow the same W×H copy as color.
 */
export function resizeSpriteGeometry(
  sprite: EmberPixelSprite,
  nextWidth: number,
  nextTopH: number,
  nextWallHeights: number[],
): EmberPixelSprite {
  const walls = nextWallHeights
    .slice(0, SPRITE_WALL_MAX_STRIPS)
    .map((h) =>
      clampSpriteDim(h, SPRITE_WALL_H_MIN, SPRITE_WALL_H_MAX, 8),
    );
  const topH = clampSpriteDim(
    nextTopH,
    SPRITE_DIM_MIN,
    SPRITE_DIM_MAX,
    sprite.topHeight,
  );
  const nextH = topH + walls.reduce((a, h) => a + h, 0);
  return resizeSpriteCanvas(sprite, nextWidth, nextH);
}

export function spriteHasVisual(sprite: EmberPixelSprite): boolean {
  return spriteFaceHasInk(sprite.pixels);
}

const SPRITE_WORLD_OFFSET_LIMIT = 128;

/** Normalize the asset visual pivot without changing its map cell/collider. */
export function normalizeSpriteWorldOffsetVoxels(
  raw: EmberPixelSprite["worldOffsetVoxels"],
): EmberPixelSprite["worldOffsetVoxels"] {
  if (!raw) return undefined;
  const clean = (value: unknown) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    return Math.max(
      -SPRITE_WORLD_OFFSET_LIMIT,
      Math.min(SPRITE_WORLD_OFFSET_LIMIT, Math.round(value * 100) / 100),
    );
  };
  const next = { x: clean(raw.x), y: clean(raw.y), z: clean(raw.z) };
  return next.x || next.y || next.z ? next : undefined;
}

export function resolveSpriteWorldOffsetVoxels(
  sprite: Pick<EmberPixelSprite, "worldOffsetVoxels">,
): { x: number; y: number; z: number } {
  return normalizeSpriteWorldOffsetVoxels(sprite.worldOffsetVoxels) ?? {
    x: 0,
    y: 0,
    z: 0,
  };
}

/** Strip deprecated fields for save. */
export function serializePixelSprite(sprite: EmberPixelSprite): EmberPixelSprite {
  const n = normalizePixelSprite(sprite);
  return {
    id: n.id,
    nameRu: n.nameRu,
    tags: n.tags,
    worldOffsetVoxels: n.worldOffsetVoxels
      ? { ...n.worldOffsetVoxels }
      : undefined,
    componentStates: n.componentStates
      ? { ...n.componentStates }
      : undefined,
    width: n.width,
    topHeight: n.topHeight,
    wallHeights: [...n.wallHeights],
    pixels: [...n.pixels],
    emissivePixels: n.emissivePixels ? [...n.emissivePixels] : undefined,
    shinePixels: n.shinePixels ? [...n.shinePixels] : undefined,
    emissiveAnim: n.emissiveAnim,
    emissiveStrength: n.emissiveStrength,
    emissiveBloomColor: n.emissiveBloomColor,
    emissiveCastsLight: n.emissiveCastsLight,
    emissiveLightRange: n.emissiveLightRange,
    emissiveLightShadows: n.emissiveLightShadows,
    emissiveAnimPeriod: n.emissiveAnimPeriod,
    emissiveAnimPeriodMin: n.emissiveAnimPeriodMin,
    emissiveAnimPeriodMax: n.emissiveAnimPeriodMax,
    emissiveTriggerRadius: n.emissiveTriggerRadius,
    emissiveTriggerWhen: n.emissiveTriggerWhen,
    emissiveTriggerEventId: n.emissiveTriggerEventId,
    color: n.color,
    roles: n.roles ? [...n.roles] : undefined,
    solid: n.solid || undefined,
    collider: n.collider ? { ...n.collider } : undefined,
    glow: n.glow || undefined,
    material: n.material,
    artLayers: packArtLayers(n.artLayers),
    views: serializeSpriteCardViews(n.views),
    frames: packAnimFrames(n.frames),
  };
}

type LegacySprite = EmberPixelSprite & {
  size?: EmberSpriteSize | number;
  wallPixels?: string[];
};

/**
 * Normalize legacy `size`/`wallPixels` or repair new-format sprites.
 */
export function normalizePixelSprite(raw: LegacySprite): EmberPixelSprite {
  const id = raw.id || "spr_unknown";
  const color = raw.color || "#c45c26";
  const roles = raw.roles?.length ? [...raw.roles] : undefined;
  const nameRu = raw.nameRu;
  const tags = normalizeEmberLibraryTags(raw.tags);
  const worldOffsetVoxels = normalizeSpriteWorldOffsetVoxels(
    raw.worldOffsetVoxels,
  );
  const componentStates = raw.componentStates
    ? { ...raw.componentStates }
    : undefined;
  const solid = raw.solid ? true : undefined;
  const collider = raw.collider ? { ...raw.collider } : undefined;
  const glow = raw.glow ? true : undefined;
  const material = normalizeSpriteMaterial(raw.material);
  const emissiveAnim = normalizeEmissiveAnim(raw.emissiveAnim);
  const emissiveStrength = normalizeEmissiveStrength(raw.emissiveStrength);
  const emissiveBloomColor = normalizeEmissiveBloomColor(raw.emissiveBloomColor);
  const emissiveCastsLight = normalizeEmissiveCastsLight(raw.emissiveCastsLight);
  const emissiveLightRange = normalizeEmissiveLightRange(raw.emissiveLightRange);
  const emissiveLightShadows = normalizeEmissiveLightShadows(
    raw.emissiveLightShadows,
  );
  const emissiveAnimPeriod = normalizeEmissiveAnimPeriod(raw.emissiveAnimPeriod);
  const emissiveAnimPeriodMin = normalizeEmissiveFlickerWaitMin(
    raw.emissiveAnimPeriodMin,
  );
  const emissiveAnimPeriodMax = normalizeEmissiveFlickerWaitMax(
    raw.emissiveAnimPeriodMax,
  );
  const emissiveTriggerRadius =
    Number.isFinite(raw.emissiveTriggerRadius) &&
    (raw.emissiveTriggerRadius as number) > 0
      ? Math.max(1, Math.min(12, Math.round(raw.emissiveTriggerRadius!)))
      : undefined;
  const emissiveTriggerWhen = normalizeEmissiveTriggerWhen(
    raw.emissiveTriggerWhen,
  );
  const emissiveTriggerEventId =
    typeof raw.emissiveTriggerEventId === "string" &&
    raw.emissiveTriggerEventId.trim()
      ? raw.emissiveTriggerEventId.trim()
      : undefined;

  const hasNew =
    Number.isFinite(raw.width) &&
    Number.isFinite(raw.topHeight) &&
    Array.isArray(raw.wallHeights);

  if (hasNew) {
    const width = clampSpriteDim(
      raw.width,
      SPRITE_DIM_MIN,
      SPRITE_DIM_MAX,
      16,
    );
    const topHeight = clampSpriteDim(
      raw.topHeight,
      SPRITE_DIM_MIN,
      SPRITE_DIM_MAX,
      16,
    );
    const wallHeights = (raw.wallHeights ?? [])
      .slice(0, SPRITE_WALL_MAX_STRIPS)
      .map((h) =>
        clampSpriteDim(h, SPRITE_WALL_H_MIN, SPRITE_WALL_H_MAX, 8),
      );
    const totalH = topHeight + wallHeights.reduce((a, h) => a + h, 0);
    const need = width * totalH;
    let pixels = Array.isArray(raw.pixels) ? [...raw.pixels] : [];
    if (pixels.length !== need) {
      pixels = copyPixelRect(
        pixels,
        width,
        Math.floor(pixels.length / Math.max(1, width)) || topHeight,
        width,
        totalH,
      );
    }
    const emissivePixels = fitChannelBuffer(
      raw.emissivePixels,
      width,
      Math.floor((raw.emissivePixels?.length ?? 0) / Math.max(1, width)) ||
        totalH,
      width,
      totalH,
    );
    const shinePixels = fitChannelBuffer(
      raw.shinePixels,
      width,
      Math.floor((raw.shinePixels?.length ?? 0) / Math.max(1, width)) ||
        totalH,
      width,
      totalH,
    );
    return withAnimFrames(withArtLayers(withCardViews({
      id,
      nameRu,
      tags,
      worldOffsetVoxels,
      componentStates,
      width,
      topHeight,
      wallHeights,
      pixels,
      emissivePixels,
      shinePixels,
      emissiveAnim,
      emissiveStrength,
      emissiveBloomColor,
      emissiveCastsLight,
      emissiveLightRange,
      emissiveLightShadows,
      emissiveAnimPeriod,
      emissiveAnimPeriodMin,
      emissiveAnimPeriodMax,
      emissiveTriggerRadius,
      emissiveTriggerWhen,
      emissiveTriggerEventId,
      color,
      roles,
      solid,
      collider,
      glow,
      material,
    }, raw), raw), raw);
  }

  const size = clampSpriteDim(
    Number(raw.size) || 16,
    SPRITE_DIM_MIN,
    SPRITE_DIM_MAX,
    16,
  ) as number;
  const top =
    Array.isArray(raw.pixels) && raw.pixels.length === size * size
      ? [...raw.pixels]
      : emptySpritePixels(size, size);
  const legacyWall =
    Array.isArray(raw.wallPixels) &&
    raw.wallPixels.length === size * size &&
    spriteFaceHasInk(raw.wallPixels)
      ? [...raw.wallPixels]
      : null;

  if (legacyWall) {
    const pixels = [...top, ...legacyWall];
    return withAnimFrames(withArtLayers(withCardViews({
      id,
      nameRu,
      tags,
      worldOffsetVoxels,
      componentStates,
      width: size,
      topHeight: size,
      wallHeights: [size],
      pixels,
      emissivePixels: fitChannelBuffer(
        raw.emissivePixels,
        size,
        Math.floor((raw.emissivePixels?.length ?? 0) / Math.max(1, size)) ||
          size * 2,
        size,
        size * 2,
      ),
      shinePixels: fitChannelBuffer(
        raw.shinePixels,
        size,
        Math.floor((raw.shinePixels?.length ?? 0) / Math.max(1, size)) ||
          size * 2,
        size,
        size * 2,
      ),
      emissiveAnim,
      emissiveStrength,
      emissiveBloomColor,
      emissiveCastsLight,
      emissiveLightRange,
      emissiveLightShadows,
      emissiveAnimPeriod,
      emissiveAnimPeriodMin,
      emissiveAnimPeriodMax,
      emissiveTriggerRadius,
      emissiveTriggerWhen,
      emissiveTriggerEventId,
      color,
      roles,
      solid,
      collider,
      glow,
      material,
    }, raw), raw), raw);
  }

  return withAnimFrames(withArtLayers(withCardViews({
    id,
    nameRu,
    tags,
    worldOffsetVoxels,
    componentStates,
    width: size,
    topHeight: size,
    wallHeights: [],
    pixels: top,
    emissivePixels: fitChannelBuffer(
      raw.emissivePixels,
      size,
      size,
      size,
      size,
    ),
    shinePixels: fitChannelBuffer(raw.shinePixels, size, size, size, size),
    emissiveAnim,
    emissiveStrength,
    emissiveBloomColor,
    emissiveCastsLight,
    emissiveLightRange,
    emissiveLightShadows,
    emissiveAnimPeriod,
    emissiveAnimPeriodMin,
    emissiveAnimPeriodMax,
    emissiveTriggerRadius,
    emissiveTriggerWhen,
    emissiveTriggerEventId,
    color,
    roles,
    solid,
    collider,
    glow,
    material,
  }, raw), raw), raw);
}
