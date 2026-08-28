/**
 * Convert a parsed Aseprite document into EmberPixelSprite pixels / layers / frames.
 * Gameplay fields (collider, emissive anim, tags) stay on the existing sprite.
 */

import { parseAseprite, type AseCel, type AseDocument, type AseLayer } from "./asepriteFile";
import {
  SPRITE_DIM_MAX,
  SPRITE_DIM_MIN,
  emptySpritePixels,
  serializePixelSprite,
} from "./pixelSprite";
import {
  MAX_SPRITE_ART_LAYERS,
  compositeArtLayers,
  newArtLayerId,
  packArtLayers,
} from "./spriteArtLayers";
import {
  DEFAULT_SPRITE_FRAME_MS,
  MAX_SPRITE_ANIM_FRAMES,
  clampSpriteFrameDuration,
  newSpriteFrameId,
} from "./spriteAnimFrames";
import type {
  EmberPixelSprite,
  EmberSpriteArtLayerBlendMode,
  EmberSpriteCardExtraView,
  EmberSpriteCardFace,
  EmberSpriteAnimFrame,
} from "./types";
import { EMBER_SPRITE_CARD_EXTRA_VIEWS } from "./types";

export const ASEPRITE_BLEND_MULTIPLY = 1;
export const ASEPRITE_BLEND_SCREEN = 2;
export const ASEPRITE_BLEND_ADD = 16;

export type AsepriteImportOk = {
  ok: true;
  sprite: EmberPixelSprite;
  warnings: string[];
};

export type AsepriteImportErr = {
  ok: false;
  error: string;
};

export type AsepriteImportResult = AsepriteImportOk | AsepriteImportErr;

export type AsepriteImportOptions = {
  id: string;
  nameRu?: string;
  existing?: EmberPixelSprite;
};

type LayerRole =
  | { kind: "art"; view: EmberSpriteCardExtraView | "front" }
  | { kind: "emissive"; view: EmberSpriteCardExtraView | "front" }
  | { kind: "shine"; view: EmberSpriteCardExtraView | "front" }
  | { kind: "skip" };

function hexByte(v: number): string {
  return Math.max(0, Math.min(255, v | 0))
    .toString(16)
    .padStart(2, "0");
}

function rgbaToHex(r: number, g: number, b: number, a: number): string {
  if (a <= 0) return "";
  const rgb = `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
  return a >= 255 ? rgb : `${rgb}${hexByte(a)}`;
}

function normalizeLayerKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function viewFromKey(key: string): EmberSpriteCardExtraView | "front" | null {
  if (
    key === "front" ||
    key === "анфас" ||
    key === "вид" ||
    key === "forward"
  ) {
    return "front";
  }
  if (key === "back" || key === "rear" || key === "затылок") return "back";
  if (
    key === "side_l" ||
    key === "sidel" ||
    key === "left" ||
    key === "бок_л" ||
    key === "side_left"
  ) {
    return "side_l";
  }
  if (
    key === "side_r" ||
    key === "sider" ||
    key === "right" ||
    key === "side" ||
    key === "бок" ||
    key === "бок_п" ||
    key === "side_right"
  ) {
    return "side_r";
  }
  return null;
}

function channelFromKey(key: string): "emissive" | "shine" | null {
  if (
    key === "emissive" ||
    key === "glow" ||
    key === "emission" ||
    key === "свечение"
  ) {
    return "emissive";
  }
  if (
    key === "shine" ||
    key === "specular" ||
    key === "metal" ||
    key === "блеск"
  ) {
    return "shine";
  }
  return null;
}

function parentIndex(layers: AseLayer[], index: number): number {
  const child = layers[index]?.childLevel ?? 0;
  if (child <= 0) return -1;
  for (let i = index - 1; i >= 0; i--) {
    if ((layers[i]?.childLevel ?? 0) === child - 1) return i;
  }
  return -1;
}

function roleForLayer(layers: AseLayer[], index: number): LayerRole {
  const layer = layers[index];
  if (!layer || layer.type !== 0 || layer.reference) return { kind: "skip" };
  let view: EmberSpriteCardExtraView | "front" = "front";
  let channel: "emissive" | "shine" | null = null;
  let cursor = index;
  const seen = new Set<number>();
  while (cursor >= 0 && !seen.has(cursor)) {
    seen.add(cursor);
    const key = normalizeLayerKey(layers[cursor]?.name ?? "");
    const asView = viewFromKey(key);
    const asChannel = channelFromKey(key);
    if (asChannel && !channel) channel = asChannel;
    if (asView && view === "front" && asView !== "front") view = asView;
    cursor = parentIndex(layers, cursor);
  }
  if (channel === "emissive") return { kind: "emissive", view };
  if (channel === "shine") return { kind: "shine", view };
  return { kind: "art", view };
}

function blendModeFromAse(
  blend: number,
): EmberSpriteArtLayerBlendMode | undefined {
  if (blend === ASEPRITE_BLEND_MULTIPLY) return "multiply";
  if (blend === ASEPRITE_BLEND_SCREEN) return "screen";
  if (blend === ASEPRITE_BLEND_ADD) return "add";
  return undefined;
}

function pixelBytes(depth: AseDocument["colorDepth"]): number {
  if (depth === 8) return 1;
  if (depth === 16) return 2;
  return 4;
}

function samplePixel(
  doc: AseDocument,
  layer: AseLayer,
  src: Uint8Array,
  index: number,
): string {
  const bpp = pixelBytes(doc.colorDepth);
  const o = index * bpp;
  if (doc.colorDepth === 32) {
    return rgbaToHex(
      src[o] ?? 0,
      src[o + 1] ?? 0,
      src[o + 2] ?? 0,
      src[o + 3] ?? 0,
    );
  }
  if (doc.colorDepth === 16) {
    const v = src[o] ?? 0;
    const a = src[o + 1] ?? 0;
    return rgbaToHex(v, v, v, a);
  }
  const palIndex = src[o] ?? 0;
  if (!layer.background && palIndex === doc.transparentIndex) return "";
  const p = palIndex * 4;
  return rgbaToHex(
    doc.palette[p] ?? 0,
    doc.palette[p + 1] ?? 0,
    doc.palette[p + 2] ?? 0,
    doc.palette[p + 3] ?? 255,
  );
}

function blitCel(
  dest: string[],
  canvasW: number,
  canvasH: number,
  doc: AseDocument,
  layer: AseLayer,
  cel: AseCel,
): void {
  if (cel.width <= 0 || cel.height <= 0 || cel.pixels.length === 0) return;
  const celA = Math.max(0, Math.min(1, cel.opacity / 255));
  for (let y = 0; y < cel.height; y++) {
    const dy = cel.y + y;
    if (dy < 0 || dy >= canvasH) continue;
    for (let x = 0; x < cel.width; x++) {
      const dx = cel.x + x;
      if (dx < 0 || dx >= canvasW) continue;
      let hex = samplePixel(doc, layer, cel.pixels, y * cel.width + x);
      if (!hex) continue;
      if (celA < 0.999) {
        const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
        if (!m) continue;
        const rgb = Number.parseInt(m[1]!, 16);
        const srcA = m[2] ? Number.parseInt(m[2], 16) : 255;
        hex = rgbaToHex(
          (rgb >> 16) & 255,
          (rgb >> 8) & 255,
          rgb & 255,
          Math.round(srcA * celA),
        );
        if (!hex) continue;
      }
      dest[dy * canvasW + dx] = hex;
    }
  }
}

function emptyFace(width: number, height: number): EmberSpriteCardFace {
  return {
    pixels: emptySpritePixels(width, height),
    emissivePixels: emptySpritePixels(width, height),
    shinePixels: emptySpritePixels(width, height),
    artLayers: [],
  };
}

function layerOpacity(layer: AseLayer): number {
  return Math.max(0, Math.min(1, layer.opacity / 255));
}

function padPixels(
  pixels: string[],
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): string[] {
  if (srcW === dstW && srcH === dstH) return [...pixels];
  const next = emptySpritePixels(dstW, dstH);
  const cw = Math.min(srcW, dstW);
  const ch = Math.min(srcH, dstH);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      next[y * dstW + x] = pixels[y * srcW + x] ?? "";
    }
  }
  return next;
}

function padFace(
  face: EmberSpriteCardFace,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): EmberSpriteCardFace {
  return {
    pixels: padPixels(face.pixels, srcW, srcH, dstW, dstH),
    emissivePixels: face.emissivePixels
      ? padPixels(face.emissivePixels, srcW, srcH, dstW, dstH)
      : undefined,
    shinePixels: face.shinePixels
      ? padPixels(face.shinePixels, srcW, srcH, dstW, dstH)
      : undefined,
    artLayers: face.artLayers?.map((layer) => ({
      ...layer,
      pixels: padPixels(layer.pixels, srcW, srcH, dstW, dstH),
    })),
  };
}

export function spriteIdFromAsepriteName(filename: string): string {
  const base = filename.replace(/\.(aseprite|ase)$/i, "");
  const slug = base
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const id = slug || "sprite";
  return id.startsWith("spr_") ? id : `spr_${id}`;
}

function channelHasInk(pixels: string[] | undefined): boolean {
  return !!pixels?.some((c) => !!c);
}

function finalizeFace(
  face: EmberSpriteCardFace,
  width: number,
  height: number,
): EmberSpriteCardFace {
  const pixels = face.artLayers?.length
    ? compositeArtLayers(face.artLayers, width, height)
    : face.pixels;
  const artLayers = packArtLayers(face.artLayers);
  return {
    pixels,
    emissivePixels: channelHasInk(face.emissivePixels)
      ? face.emissivePixels
      : undefined,
    shinePixels: channelHasInk(face.shinePixels) ? face.shinePixels : undefined,
    artLayers,
  };
}

function pushArtLayer(
  face: EmberSpriteCardFace,
  doc: AseDocument,
  layer: AseLayer,
  cel: AseCel | undefined,
): void {
  const pixels = emptySpritePixels(doc.width, doc.height);
  if (cel) blitCel(pixels, doc.width, doc.height, doc, layer, cel);
  face.artLayers!.push({
    id: newArtLayerId(),
    nameRu: layer.name || "Слой",
    visible: layer.visible ? undefined : false,
    opacity: layerOpacity(layer) < 0.999 ? layerOpacity(layer) : undefined,
    blendMode: blendModeFromAse(layer.blend),
    pixels,
  });
}

function buildFrame(
  doc: AseDocument,
  frame: AseDocument["frames"][number],
  warnings: string[],
): {
  front: EmberSpriteCardFace;
  views: Partial<Record<EmberSpriteCardExtraView, EmberSpriteCardFace>>;
} {
  const faces = new Map<EmberSpriteCardExtraView | "front", EmberSpriteCardFace>();
  faces.set("front", emptyFace(doc.width, doc.height));

  const artByView = new Map<
    EmberSpriteCardExtraView | "front",
    { layer: AseLayer; cel: AseCel | undefined }[]
  >();

  for (let i = 0; i < doc.layers.length; i++) {
    const layer = doc.layers[i]!;
    const role = roleForLayer(doc.layers, i);
    if (role.kind === "skip") continue;
    const cel = frame.cels.find((c) => c.layerIndex === i);
    if (role.kind === "emissive" || role.kind === "shine") {
      if (!faces.has(role.view)) {
        faces.set(role.view, emptyFace(doc.width, doc.height));
      }
      const face = faces.get(role.view)!;
      const dest =
        role.kind === "emissive" ? face.emissivePixels! : face.shinePixels!;
      if (cel) blitCel(dest, doc.width, doc.height, doc, layer, cel);
      continue;
    }
    const list = artByView.get(role.view) ?? [];
    list.push({ layer, cel });
    artByView.set(role.view, list);
  }

  for (const [view, list] of artByView) {
    if (!faces.has(view)) faces.set(view, emptyFace(doc.width, doc.height));
    const face = faces.get(view)!;
    const kept = list.slice(0, MAX_SPRITE_ART_LAYERS);
    if (list.length > MAX_SPRITE_ART_LAYERS) {
      warnings.push(
        `Слоёв больше ${MAX_SPRITE_ART_LAYERS} на виде ${view} — лишние схлопнуты`,
      );
    }
    for (const item of kept) {
      pushArtLayer(face, doc, item.layer, item.cel);
    }
    if (list.length > MAX_SPRITE_ART_LAYERS) {
      const last = face.artLayers![face.artLayers!.length - 1];
      if (last) {
        for (const item of list.slice(MAX_SPRITE_ART_LAYERS)) {
          if (item.cel) {
            blitCel(
              last.pixels,
              doc.width,
              doc.height,
              doc,
              item.layer,
              item.cel,
            );
          }
        }
        last.nameRu = "Прочие";
      }
    }
  }

  const front = finalizeFace(faces.get("front")!, doc.width, doc.height);
  const views: Partial<Record<EmberSpriteCardExtraView, EmberSpriteCardFace>> =
    {};
  for (const key of EMBER_SPRITE_CARD_EXTRA_VIEWS) {
    const face = faces.get(key);
    if (!face) continue;
    const packed = finalizeFace(face, doc.width, doc.height);
    if (
      packed.pixels.some((c) => !!c) ||
      packed.artLayers?.length ||
      packed.emissivePixels ||
      packed.shinePixels
    ) {
      views[key] = packed;
    }
  }
  return { front, views };
}

function mergeExisting(
  imported: EmberPixelSprite,
  existing: EmberPixelSprite | undefined,
): EmberPixelSprite {
  if (!existing) return imported;
  return {
    ...imported,
    id: existing.id,
    nameRu: existing.nameRu ?? imported.nameRu,
    tags: existing.tags,
    worldOffsetVoxels: existing.worldOffsetVoxels,
    componentStates: existing.componentStates,
    color: existing.color || imported.color,
    roles: existing.roles,
    solid: existing.solid,
    collider: existing.collider,
    glow: existing.glow,
    material: existing.material,
    emissiveAnim: existing.emissiveAnim,
    emissiveStrength: existing.emissiveStrength,
    emissiveBloomColor: existing.emissiveBloomColor,
    emissiveCastsLight: existing.emissiveCastsLight,
    emissiveLightRange: existing.emissiveLightRange,
    emissiveLightShadows: existing.emissiveLightShadows,
    emissiveAnimPeriod: existing.emissiveAnimPeriod,
    emissiveAnimPeriodMin: existing.emissiveAnimPeriodMin,
    emissiveAnimPeriodMax: existing.emissiveAnimPeriodMax,
    emissiveTriggerRadius: existing.emissiveTriggerRadius,
    emissiveTriggerWhen: existing.emissiveTriggerWhen,
    emissiveTriggerEventId: existing.emissiveTriggerEventId,
  };
}

export function importAsepriteDocument(
  doc: AseDocument,
  options: AsepriteImportOptions,
): AsepriteImportResult {
  const warnings: string[] = [];
  if (doc.width > SPRITE_DIM_MAX || doc.height > SPRITE_DIM_MAX) {
    return {
      ok: false,
      error: `Холст Aseprite ${doc.width}×${doc.height} больше ${SPRITE_DIM_MAX} px. Уменьшите в Aseprite.`,
    };
  }
  if (doc.width <= 0 || doc.height <= 0) {
    return { ok: false, error: "Пустой холст Aseprite" };
  }
  if (doc.width < SPRITE_DIM_MIN || doc.height < SPRITE_DIM_MIN) {
    warnings.push(
      `Холст ${doc.width}×${doc.height} дополнен до ${SPRITE_DIM_MIN} px`,
    );
  }
  if (!doc.frames.length) {
    return { ok: false, error: "В файле Aseprite нет кадров" };
  }

  const usedFrames = doc.frames.slice(0, MAX_SPRITE_ANIM_FRAMES);
  if (doc.frames.length > MAX_SPRITE_ANIM_FRAMES) {
    warnings.push(
      `Кадров ${doc.frames.length}, взяты первые ${MAX_SPRITE_ANIM_FRAMES}`,
    );
  }

  const built = usedFrames.map((frame) => buildFrame(doc, frame, warnings));
  const padW = Math.max(SPRITE_DIM_MIN, doc.width);
  const padH = Math.max(SPRITE_DIM_MIN, doc.height);
  const padded = built.map((item) => ({
    front: padFace(item.front, doc.width, doc.height, padW, padH),
    views: Object.fromEntries(
      EMBER_SPRITE_CARD_EXTRA_VIEWS.filter((key) => item.views[key]).map(
        (key) => [
          key,
          padFace(item.views[key]!, doc.width, doc.height, padW, padH),
        ],
      ),
    ) as Partial<Record<EmberSpriteCardExtraView, EmberSpriteCardFace>>,
  }));

  const first = padded[0]!;
  const frames: EmberSpriteAnimFrame[] | undefined =
    padded.length >= 2
      ? padded.map((item, index) => ({
          id: newSpriteFrameId(),
          durationMs: clampSpriteFrameDuration(
            usedFrames[index]?.durationMs ?? DEFAULT_SPRITE_FRAME_MS,
          ),
          pixels: item.front.pixels,
          emissivePixels: item.front.emissivePixels,
          shinePixels: item.front.shinePixels,
          artLayers: item.front.artLayers,
          views: Object.keys(item.views).length ? item.views : undefined,
        }))
      : undefined;

  const imported = serializePixelSprite(
    mergeExisting(
      {
        id: options.id,
        nameRu: options.nameRu,
        width: padW,
        topHeight: padH,
        wallHeights: [],
        pixels: first.front.pixels,
        emissivePixels: first.front.emissivePixels,
        shinePixels: first.front.shinePixels,
        artLayers: first.front.artLayers,
        views: Object.keys(first.views).length ? first.views : undefined,
        frames,
        color: options.existing?.color || "#c45c26",
        roles: options.existing?.roles ?? ["decor"],
      },
      options.existing,
    ),
  );

  return { ok: true, sprite: imported, warnings };
}

export async function importAsepriteBytes(
  bytes: Uint8Array,
  options: AsepriteImportOptions,
): Promise<AsepriteImportResult> {
  try {
    const doc = await parseAseprite(bytes);
    return importAsepriteDocument(doc, options);
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Не удалось прочитать Aseprite",
    };
  }
}
