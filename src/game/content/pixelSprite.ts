import { normalizeEmberLibraryTags } from "./libraryTags";
import type {
  EmberEmissiveAnim,
  EmberEmissiveTriggerWhen,
  EmberMaterialKind,
  EmberPixelSprite,
  EmberSpriteSize,
} from "./types";
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

function fitEmissiveBuffer(
  raw: string[] | undefined,
  need: number,
  width: number,
  height: number,
): string[] | undefined {
  if (!Array.isArray(raw) || !spriteFaceHasInk(raw)) return undefined;
  if (raw.length === need) return [...raw];
  return copyPixelRect(
    raw,
    width,
    Math.floor(raw.length / Math.max(1, width)) || height,
    width,
    height,
  );
}

export const SPRITE_DIM_MIN = 4;
export const SPRITE_DIM_MAX = 64;
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

export function spriteFaceHasInk(pixels?: string[] | null): boolean {
  return !!pixels?.some((c) => c && c !== "#00000000");
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

/**
 * Resize geometry while preserving overlapping pixel content per band.
 */
export function resizeSpriteGeometry(
  sprite: EmberPixelSprite,
  nextWidth: number,
  nextTopH: number,
  nextWallHeights: number[],
): EmberPixelSprite {
  const w = clampSpriteDim(
    nextWidth,
    SPRITE_DIM_MIN,
    SPRITE_DIM_MAX,
    sprite.width,
  );
  const topH = clampSpriteDim(
    nextTopH,
    SPRITE_DIM_MIN,
    SPRITE_DIM_MAX,
    sprite.topHeight,
  );
  const walls = nextWallHeights
    .slice(0, SPRITE_WALL_MAX_STRIPS)
    .map((h) =>
      clampSpriteDim(h, SPRITE_WALL_H_MIN, SPRITE_WALL_H_MAX, 8),
    );
  const top = copyPixelRect(
    sliceSpriteTop(sprite),
    sprite.width,
    sprite.topHeight,
    w,
    topH,
  );
  const wallBands: string[][] = [];
  for (let i = 0; i < walls.length; i++) {
    const h = walls[i]!;
    const prev =
      i < sprite.wallHeights.length
        ? sliceSpriteWall(sprite, i)
        : emptySpritePixels(sprite.width, h);
    const prevH =
      i < sprite.wallHeights.length ? sprite.wallHeights[i]! : h;
    wallBands.push(copyPixelRect(prev, sprite.width, prevH, w, h));
  }
  const pixels = joinSpriteBands(w, top, topH, wallBands, walls);
  const totalH = topH + walls.reduce((a, h) => a + h, 0);
  const emissivePixels = fitEmissiveBuffer(
    sprite.emissivePixels,
    w * totalH,
    w,
    totalH,
  );
  const shinePixels = fitEmissiveBuffer(
    sprite.shinePixels,
    w * totalH,
    w,
    totalH,
  );
  return {
    id: sprite.id,
    nameRu: sprite.nameRu,
    width: w,
    topHeight: topH,
    wallHeights: walls,
    pixels,
    emissivePixels,
    shinePixels,
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
    glow: sprite.glow || undefined,
  };
}

export function spriteHasVisual(sprite: EmberPixelSprite): boolean {
  return spriteFaceHasInk(sprite.pixels);
}

/** Strip deprecated fields for save. */
export function serializePixelSprite(sprite: EmberPixelSprite): EmberPixelSprite {
  const n = normalizePixelSprite(sprite);
  return {
    id: n.id,
    nameRu: n.nameRu,
    tags: n.tags,
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
    const emissivePixels = fitEmissiveBuffer(
      raw.emissivePixels,
      need,
      width,
      totalH,
    );
    const shinePixels = fitEmissiveBuffer(
      raw.shinePixels,
      need,
      width,
      totalH,
    );
    return {
      id,
      nameRu,
      tags,
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
    };
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
    return {
      id,
      nameRu,
      tags,
      componentStates,
      width: size,
      topHeight: size,
      wallHeights: [size],
      pixels,
      emissivePixels: fitEmissiveBuffer(
        raw.emissivePixels,
        pixels.length,
        size,
        size * 2,
      ),
      shinePixels: fitEmissiveBuffer(
        raw.shinePixels,
        pixels.length,
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
    };
  }

  return {
    id,
    nameRu,
    tags,
    componentStates,
    width: size,
    topHeight: size,
    wallHeights: [],
    pixels: top,
    emissivePixels: fitEmissiveBuffer(raw.emissivePixels, size * size, size, size),
    shinePixels: fitEmissiveBuffer(raw.shinePixels, size * size, size, size),
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
  };
}
