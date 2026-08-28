import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { writeEmberBytes, writeEmberJson } from "../../../game/content/io";
import { asepriteSourceRel } from "../../../game/content/asepriteFile";
import {
  importAsepriteBytes,
  spriteIdFromAsepriteName,
} from "../../../game/content/asepriteImport";
import { EmberAsepriteImportButton } from "./EmberAsepriteImportButton";
import { createSlasherCharacterSprite } from "../../../game/content/slasherCharacterPreset";
import {
  formatEmberLibraryTags,
  libraryAssetMatchesQuery,
  normalizeEmberLibraryTags,
} from "../../../game/content/libraryTags";
import {
  emptySpritePixels,
  flattenSpriteForEditor,
  matchChannelSize,
  normalizePixelSprite,
  normalizeSpriteWorldOffsetVoxels,
  prunePaletteFavorites,
  resolveSpriteWorldOffsetVoxels,
  resizeSpriteCanvas,
  serializePixelSprite,
  spriteFaceHasInk,
  spriteTotalHeight,
  spriteWallHeight,
  SPRITE_BLANK_HEIGHT,
  SPRITE_BLANK_WIDTH,
  SPRITE_DECOR_SIZE,
  SPRITE_DIM_MAX,
  SPRITE_DIM_MIN,
  clampSpriteDim,
} from "../../../game/content/pixelSprite";
import {
  MAX_SPRITE_ART_LAYERS,
  SPRITE_ART_LAYER_BLEND_MODES,
  cloneArtLayers,
  compositeArtLayers,
  constrainArtLayerPixels,
  ensureArtLayerStack,
  makeEmptyArtLayer,
  newArtLayerId,
  packArtLayers,
  resizeArtLayers,
} from "../../../game/content/spriteArtLayers";
import {
  DEFAULT_SPRITE_FRAME_MS,
  MAX_SPRITE_ANIM_FRAMES,
  MAX_SPRITE_FRAME_MS,
  MIN_SPRITE_FRAME_MS,
  clampSpriteFrameDuration,
  newSpriteFrameId,
  nextSpritePreviewIndex,
  normalizeSpriteFrameRange,
} from "../../../game/content/spriteAnimFrames";
import {
  isArtBrushTool,
  stampArtBrush,
  type SpriteArtBrushKind,
} from "../../../game/content/spriteArtBrushes";
import type {
  EmberCharacterCardView,
  EmberEmissiveAnim,
  EmberEmissiveTriggerWhen,
  EmberEnemyDef,
  EmberMaterialKind,
  EmberPack,
  EmberPixelSprite,
  EmberSpriteAnimFrame,
  EmberSpriteArtLayer,
  EmberSpriteArtLayerBlendMode,
  EmberSpriteCardExtraView,
  EmberSpriteCardFace,
  EmberSpriteRole,
  EmberTileset,
} from "../../../game/content/types";
import {
  EMBER_CHARACTER_CARD_VIEWS,
  EMBER_SPRITE_CARD_EXTRA_VIEWS,
  MAX_ELEVATION,
} from "../../../game/content/types";
import { EMBER_CHARACTER_CARD_VIEW_LABEL_RU } from "../../../game/voxel/characterView";
import {
  EMBER_MATERIAL_KINDS,
  EMBER_MATERIAL_LABELS_RU,
} from "../../../game/three/materialPresets";
import {
  DEFAULT_EMISSIVE_FLICKER_PERIOD_MAX,
  DEFAULT_EMISSIVE_FLICKER_PERIOD_MIN,
  DEFAULT_EMISSIVE_LIGHT_RANGE,
  DEFAULT_EMISSIVE_PULSE_PERIOD,
  MAX_EMISSIVE_ANIM_PERIOD,
  MAX_EMISSIVE_FLICKER_WAIT_MAX,
  MAX_EMISSIVE_FLICKER_WAIT_MIN,
  MAX_EMISSIVE_LIGHT_RANGE,
  MIN_EMISSIVE_LIGHT_RANGE,
  formatFlickerWait,
  normalizeEmissiveBloomColor,
  resolveEmissiveAnimPeriod,
  resolveEmissiveFlickerPeriodRange,
  resolveEmissiveLightRange,
  resolveEmissiveTriggerRadius,
  resolveEmissiveTriggerWhen,
} from "../../../game/tile/emissivePaint";
import { WALL_HEIGHT } from "../../../game/tile/extruded";
import {
  paintPixelGrid,
  paintSpriteDecorOnFloor,
  paintTileFace,
  spriteHasVisual,
} from "../../../game/tile/tileTextures";
import { EmberSpriteThumb, EmberThumbGrid } from "./EmberThumbGrid";
import {
  PixelCanvasOverlays,
  PixelCanvasReferenceLayer,
} from "./PixelCanvasOverlays";
import { PixelCanvasNavigator } from "./PixelCanvasNavigator";
import { PixelCanvasViewPanel } from "./PixelCanvasViewPanel";
import { PixelPalettePanel } from "./PixelPalettePanel";
import { PixelToolIcon } from "./PixelToolIcon";
import {
  copyPixelArtChannels,
  hasPixelClipboard,
  peekPixelClipboard,
  pastePixelArtChannels,
} from "./pixelClipboard";
import {
  clearPixelSelection,
  combinePixelSelections,
  duplicatePixelSelection,
  extractPixelSelection,
  invertPixelSelection,
  magicWandSelection,
  movePixelSelection,
  pastePixelSelection,
  pixelMaskSvgPaths,
  pixelRectFromPoints,
  pixelRectFromScaleHandle,
  pixelSelectionContains,
  pixelSelectionFromPolygon,
  resizePixelMask,
  resizePixelSelection,
  transformPixelSelection,
  type PixelPoint,
  type PixelRect,
  type PixelScaleHandle,
  type PixelSelectionCombineMode,
  type PixelTransform,
} from "./pixelSelection";
import {
  constrainPixelShapeEnd,
  paintPixelShape,
  type PixelShapeKind,
} from "./pixelShape";
import {
  extendPixelStroke,
  paintPixelBrushStroke,
  paintPixelFill,
  type PixelDitherCoverage,
  type PixelStrokePath,
} from "./pixelPaint";
import type { PixelSymmetry } from "./pixelSymmetry";
import {
  pushRecentPixelColor,
  replacePixelPaletteColor,
} from "./pixelPalette";
import {
  adjustPixelColors,
  outlinePixelColors,
  quantizePixelColors,
  type PixelColorAdjustments,
  type PixelColorDitherMode,
  type PixelColorOperationResult,
} from "./pixelColorOperations";
import {
  getLastOpenedId,
  hasOpenedEditor,
  markEditorOpened,
} from "./editorOpenSession";
import { usePixelCanvasView } from "./usePixelCanvasView";
import { usePixelCanvasNavigation } from "./usePixelCanvasNavigation";

type Props = {
  pack: EmberPack;
  onChangePack: (pack: EmberPack) => void;
  onSaved: (msg: string) => void;
  /** Focus a sprite when navigating from the library hub. */
  initialSpriteId?: string | null;
};

type DrawTool =
  | "paint"
  | "eyedrop"
  | "glow"
  | "shine"
  | "fill"
  | "select"
  | "lasso"
  | "wand"
  | PixelShapeKind
  | SpriteArtBrushKind;
type DrawLayer = "color" | "glow" | "shine";

function pixelShapeKind(tool: DrawTool): PixelShapeKind | null {
  return tool === "line" || tool === "rect" || tool === "ellipse" ? tool : null;
}

const ART_BRUSH_TOOLS: Array<{
  id: SpriteArtBrushKind;
  label: string;
  title: string;
}> = [
  { id: "soften", label: "См", title: "Смягчение · без смены hue" },
  { id: "burn", label: "Тн", title: "Затемнение по тону" },
  { id: "dodge", label: "Св", title: "Осветление по тону" },
  { id: "smudge", label: "Рз", title: "Размазывание" },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable;
}

function channelForTool(tool: DrawTool): DrawLayer {
  switch (tool) {
    case "paint":
    case "eyedrop":
    case "select":
    case "lasso":
    case "wand":
    case "fill":
    case "line":
    case "rect":
    case "ellipse":
    case "soften":
    case "burn":
    case "dodge":
    case "smudge":
      return "color";
    case "glow":
      return "glow";
    case "shine":
      return "shine";
    default: {
      const _never: never = tool;
      return _never;
    }
  }
}

const EMISSIVE_ANIM_OPTS: Array<{ id: EmberEmissiveAnim; label: string }> = [
  { id: "always", label: "Всегда" },
  { id: "pulse", label: "Пульс" },
  { id: "flicker", label: "Мерцание" },
  { id: "trigger", label: "Триггер" },
];

const EMISSIVE_TRIGGER_WHEN_OPTS: Array<{
  id: EmberEmissiveTriggerWhen;
  label: string;
}> = [
  { id: "player", label: "Игрок рядом" },
  { id: "enemy", label: "Враг рядом" },
  { id: "either", label: "Игрок или враг" },
  { id: "event", label: "Ивент" },
];

const ROLES: Array<{ id: EmberSpriteRole; label: string }> = [
  { id: "decor", label: "Декор" },
  { id: "enemy", label: "Враг" },
  { id: "player", label: "Герой" },
  { id: "prop", label: "Проп" },
  { id: "npc", label: "NPC" },
];

const BASE_PALETTE = [
  "#00000000",
  "#1a2018",
  "#2f4a30",
  "#3d5c38",
  "#5a4a40",
  "#6a5a48",
  "#4a4540",
  "#5a5045",
  "#6a4a28",
  "#5a4030",
  "#c45c26",
  "#e8a060",
  "#ffe0a0",
  "#2a1810",
  "#887060",
  "#f2e6d8",
  "#3a2a22",
  "#1a120e",
  "#6080a0",
  "#e07070",
];

function dominantColor(pixels: string[]): string | null {
  const counts = new Map<string, number>();
  for (const c of pixels) {
    if (!c || c === "#00000000") continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  for (const [c, k] of counts) {
    if (k > n) {
      best = c;
      n = k;
    }
  }
  return best;
}

type SpriteCardBuf = {
  pixels: string[];
  emissive: string[];
  shine: string[];
  artLayers?: EmberSpriteArtLayer[];
  activeLayerId?: string;
};

type ExtraCardViews = Partial<Record<EmberSpriteCardExtraView, SpriteCardBuf>>;

function emptyCardBuf(width: number, height: number): SpriteCardBuf {
  return {
    pixels: emptySpritePixels(width, height),
    emissive: emptySpritePixels(width, height),
    shine: emptySpritePixels(width, height),
  };
}

function cardBufHasInk(buf: SpriteCardBuf): boolean {
  return (
    spriteFaceHasInk(buf.pixels) ||
    spriteFaceHasInk(buf.emissive) ||
    spriteFaceHasInk(buf.shine) ||
    Boolean(buf.artLayers?.some((layer) => spriteFaceHasInk(layer.pixels)))
  );
}

function bufFromFace(
  face: EmberSpriteCardFace | undefined,
  width: number,
  height: number,
): SpriteCardBuf | undefined {
  if (!face) return undefined;
  return {
    pixels: matchChannelSize(face.pixels, width, height, width, height),
    emissive: matchChannelSize(
      face.emissivePixels,
      width,
      height,
      width,
      height,
    ),
    shine: matchChannelSize(face.shinePixels, width, height, width, height),
    artLayers: cloneArtLayers(face.artLayers),
    activeLayerId: face.artLayers?.at(-1)?.id,
  };
}

function extrasFromSprite(
  sprite: EmberPixelSprite,
  width: number,
  height: number,
): ExtraCardViews {
  const extras: ExtraCardViews = {};
  for (const key of EMBER_SPRITE_CARD_EXTRA_VIEWS) {
    const buf = bufFromFace(sprite.views?.[key], width, height);
    if (buf) extras[key] = buf;
  }
  return extras;
}

function resizeCardBuf(
  buf: SpriteCardBuf | undefined,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): SpriteCardBuf | undefined {
  if (!buf) return undefined;
  const artLayers = resizeArtLayers(
    buf.artLayers,
    srcW,
    srcH,
    dstW,
    dstH,
  );
  return {
    pixels: artLayers?.length
      ? compositeArtLayers(artLayers, dstW, dstH)
      : matchChannelSize(buf.pixels, srcW, srcH, dstW, dstH),
    emissive: matchChannelSize(buf.emissive, srcW, srcH, dstW, dstH),
    shine: matchChannelSize(buf.shine, srcW, srcH, dstW, dstH),
    artLayers,
    activeLayerId: buf.activeLayerId,
  };
}

function packCardViews(
  extras: ExtraCardViews,
): EmberPixelSprite["views"] {
  const views: NonNullable<EmberPixelSprite["views"]> = {};
  for (const key of EMBER_SPRITE_CARD_EXTRA_VIEWS) {
    const buf = extras[key];
    if (!buf || !cardBufHasInk(buf)) continue;
    views[key] = {
      pixels: [...buf.pixels],
      emissivePixels: spriteFaceHasInk(buf.emissive)
        ? [...buf.emissive]
        : undefined,
      shinePixels: spriteFaceHasInk(buf.shine) ? [...buf.shine] : undefined,
      artLayers: packArtLayers(buf.artLayers),
    };
  }
  return Object.keys(views).length ? views : undefined;
}

function cloneCardBuf(buf: SpriteCardBuf): SpriteCardBuf {
  return {
    pixels: [...buf.pixels],
    emissive: [...buf.emissive],
    shine: [...buf.shine],
    artLayers: cloneArtLayers(buf.artLayers),
    activeLayerId: buf.activeLayerId,
  };
}

function cloneExtras(extras: ExtraCardViews): ExtraCardViews {
  const next: ExtraCardViews = {};
  for (const key of EMBER_SPRITE_CARD_EXTRA_VIEWS) {
    const buf = extras[key];
    if (buf) next[key] = cloneCardBuf(buf);
  }
  return next;
}

type SpriteFrameBuf = {
  id: string;
  durationMs: number;
  front: SpriteCardBuf;
  extras: ExtraCardViews;
};

function cloneFrameBuf(frame: SpriteFrameBuf): SpriteFrameBuf {
  return {
    id: frame.id,
    durationMs: frame.durationMs,
    front: cloneCardBuf(frame.front),
    extras: cloneExtras(frame.extras),
  };
}

function frameBufFromAnim(
  frame: EmberSpriteAnimFrame,
  width: number,
  height: number,
): SpriteFrameBuf {
  return {
    id: frame.id,
    durationMs: clampSpriteFrameDuration(frame.durationMs),
    front: {
      pixels: matchChannelSize(frame.pixels, width, height, width, height),
      emissive: matchChannelSize(
        frame.emissivePixels,
        width,
        height,
        width,
        height,
      ),
      shine: matchChannelSize(
        frame.shinePixels,
        width,
        height,
        width,
        height,
      ),
      artLayers: cloneArtLayers(frame.artLayers),
      activeLayerId: frame.artLayers?.at(-1)?.id,
    },
    extras: extrasFromSprite(
      { views: frame.views } as EmberPixelSprite,
      width,
      height,
    ),
  };
}

function animFrameFromBuf(frame: SpriteFrameBuf): EmberSpriteAnimFrame {
  return {
    id: frame.id,
    durationMs: frame.durationMs,
    pixels: [...frame.front.pixels],
    emissivePixels: spriteFaceHasInk(frame.front.emissive)
      ? [...frame.front.emissive]
      : undefined,
    shinePixels: spriteFaceHasInk(frame.front.shine)
      ? [...frame.front.shine]
      : undefined,
    artLayers: cloneArtLayers(frame.front.artLayers),
    views: packCardViews(frame.extras),
  };
}

function packEditorFrames(
  frames: SpriteFrameBuf[] | undefined,
): EmberSpriteAnimFrame[] | undefined {
  if (!frames || frames.length < 2) return undefined;
  return frames.slice(0, MAX_SPRITE_ANIM_FRAMES).map(animFrameFromBuf);
}

function SpriteFrameThumb({
  pixels,
  width,
  height,
}: {
  pixels: string[] | undefined;
  width: number;
  height: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const size = canvas.width;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        ctx.fillStyle = (x / 4 + y / 4) % 2 === 0 ? "#17120f" : "#261c17";
        ctx.fillRect(x, y, 4, 4);
      }
    }
    if (!pixels?.length || width <= 0 || height <= 0) return;
    const scale = Math.min(size / width, size / height);
    const drawW = width * scale;
    const drawH = height * scale;
    const offsetX = (size - drawW) / 2;
    const offsetY = (size - drawH) / 2;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const color = pixels[y * width + x];
        if (!color || color === "#00000000") continue;
        ctx.fillStyle = color;
        ctx.fillRect(
          offsetX + x * scale,
          offsetY + y * scale,
          Math.max(1, scale),
          Math.max(1, scale),
        );
      }
    }
  }, [height, pixels, width]);
  return <canvas ref={ref} width={38} height={38} aria-hidden="true" />;
}

export function SpriteEditorPanel({
  pack,
  onChangePack,
  onSaved,
  initialSpriteId = null,
}: Props) {
  const spriteList = useMemo(
    () =>
      Object.values(pack.sprites)
        .map((s) => normalizePixelSprite(s))
        .sort((a, b) => a.id.localeCompare(b.id)),
    [pack.sprites],
  );
  const [spriteId, setSpriteId] = useState<string | null>(() => {
    if (initialSpriteId && pack.sprites[initialSpriteId]) {
      return initialSpriteId;
    }
    if (hasOpenedEditor("sprite")) {
      const last = getLastOpenedId("sprite");
      if (last && pack.sprites[last]) return last;
    }
    // Defer to picker on first open; keep null so workspace stays empty.
    if (!hasOpenedEditor("sprite") && !initialSpriteId) {
      return null;
    }
    return spriteList[0]?.id ?? null;
  });
  const [showOpenPicker, setShowOpenPicker] = useState(() => {
    if (initialSpriteId) return false;
    return !hasOpenedEditor("sprite");
  });
  const [editorLoadNonce, setEditorLoadNonce] = useState(0);
  const canvasView = usePixelCanvasView({
    referenceKey: spriteId ? `${pack.meta.id}:sprite:${spriteId}` : null,
  });

  const selectSprite = useCallback((id: string) => {
    setSpriteId(id);
    setShowOpenPicker(false);
    markEditorOpened("sprite", id);
  }, []);

  useEffect(() => {
    if (!initialSpriteId) return;
    if (pack.sprites[initialSpriteId]) {
      selectSprite(initialSpriteId);
    }
  }, [initialSpriteId, pack.sprites, selectSprite]);
  const sprite = spriteId
    ? normalizePixelSprite(pack.sprites[spriteId] ?? { id: spriteId, width: 16, topHeight: 16, wallHeights: [], pixels: [], color: "#c45c26" })
    : undefined;

  const width = sprite?.width ?? 16;
  const canvasH = sprite ? spriteTotalHeight(sprite) : 16;
  useEffect(() => {
    canvasView.clampGuides(width, canvasH);
  }, [canvasH, canvasView.clampGuides, width]);

  const [nameRu, setNameRu] = useState("");
  const [color, setColor] = useState("#c45c26");
  const [backgroundColor, setBackgroundColor] = useState("#1a120e");
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [tool, setTool] = useState<DrawTool>("paint");
  const [selection, setSelection] = useState<PixelRect | null>(null);
  const [selectionMask, setSelectionMask] = useState<boolean[] | null>(null);
  const [wandTolerance, setWandTolerance] = useState(0);
  const [wandContiguous, setWandContiguous] = useState(true);
  const [wandCombineMode, setWandCombineMode] = useState<PixelSelectionCombineMode>("replace");
  const [shapeChannel, setShapeChannel] = useState<DrawLayer>("color");
  const [shapeFilled, setShapeFilled] = useState(false);
  const [fillTolerance, setFillTolerance] = useState(0);
  const [fillContiguous, setFillContiguous] = useState(true);
  const [symmetryHorizontal, setSymmetryHorizontal] = useState(false);
  const [symmetryVertical, setSymmetryVertical] = useState(false);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [brushDither, setBrushDither] = useState<PixelDitherCoverage>(100);
  const [brushSpacing, setBrushSpacing] = useState(1);
  const [brushPixelPerfect, setBrushPixelPerfect] = useState(true);
  const selectionPaths = useMemo(
    () =>
      selection
        ? pixelMaskSvgPaths(selectionMask ?? undefined, selection.w, selection.h)
        : null,
    [selection, selectionMask],
  );
  const [brushSize, setBrushSize] = useState(1);
  const [roles, setRoles] = useState<EmberSpriteRole[]>(["decor"]);
  const [solid, setSolid] = useState(false);
  const [glow, setGlow] = useState(false);
  const [material, setMaterial] = useState<EmberMaterialKind | "">("");
  const [pixels, setPixels] = useState<string[]>(() => emptySpritePixels(16, 16));
  const [emissivePixels, setEmissivePixels] = useState<string[]>(() =>
    emptySpritePixels(16, 16),
  );
  const [shinePixels, setShinePixels] = useState<string[]>(() =>
    emptySpritePixels(16, 16),
  );
  const [emissiveAnim, setEmissiveAnim] =
    useState<EmberEmissiveAnim>("always");
  const [emissiveStrength, setEmissiveStrength] = useState(0.75);
  const [emissiveBloomColor, setEmissiveBloomColor] = useState("#88ccff");
  const [emissiveBloomCustom, setEmissiveBloomCustom] = useState(false);
  const [emissiveCastsLight, setEmissiveCastsLight] = useState(false);
  const [emissiveLightRange, setEmissiveLightRange] = useState(
    DEFAULT_EMISSIVE_LIGHT_RANGE,
  );
  const [emissiveLightShadows, setEmissiveLightShadows] = useState(false);
  const [emissiveAnimPeriod, setEmissiveAnimPeriod] = useState(
    DEFAULT_EMISSIVE_PULSE_PERIOD,
  );
  const [emissiveAnimPeriodMin, setEmissiveAnimPeriodMin] = useState(
    DEFAULT_EMISSIVE_FLICKER_PERIOD_MIN,
  );
  const [emissiveAnimPeriodMax, setEmissiveAnimPeriodMax] = useState(
    DEFAULT_EMISSIVE_FLICKER_PERIOD_MAX,
  );
  const [emissiveTriggerWhen, setEmissiveTriggerWhen] =
    useState<EmberEmissiveTriggerWhen>("player");
  const [emissiveTriggerRadius, setEmissiveTriggerRadius] = useState(3);
  const [emissiveTriggerEventId, setEmissiveTriggerEventId] = useState("");
  const [enemyBind, setEnemyBind] = useState("");
  /** Floor elevation for on-tile preview (0 = flat). */
  const [previewElev, setPreviewElev] = useState(0);
  const [widthDraft, setWidthDraft] = useState(16);
  const [heightDraft, setHeightDraft] = useState(16);
  const [cardView, setCardView] = useState<EmberCharacterCardView>("front");

  const tileset = useMemo(() => {
    const id = Object.keys(pack.tilesets)[0];
    return id ? pack.tilesets[id] : undefined;
  }, [pack.tilesets]);
  const previewTiles = useMemo(
    () =>
      (tileset?.tiles ?? []).filter(
        (t) => t.id !== 0 && t.color !== "#00000000",
      ),
    [tileset],
  );
  const [previewTileId, setPreviewTileId] = useState<number>(() => {
    const ts = Object.values(pack.tilesets)[0];
    const grass = ts?.tiles.find((t) => t.id === 1);
    return grass?.id ?? ts?.tiles.find((t) => t.id !== 0)?.id ?? 1;
  });

  useEffect(() => {
    if (
      previewTiles.length > 0 &&
      !previewTiles.some((t) => t.id === previewTileId)
    ) {
      setPreviewTileId(previewTiles[0]!.id);
    }
  }, [previewTiles, previewTileId]);

  const pixelsRef = useRef(pixels);
  const emissiveRef = useRef(emissivePixels);
  const shineRef = useRef(shinePixels);
  const painting = useRef(false);
  const strokeSaved = useRef(false);
  const toolRef = useRef(tool);
  const brushSizeRef = useRef(brushSize);
  const symmetryRef = useRef<PixelSymmetry>({ horizontal: false, vertical: false });
  const geomRef = useRef({ width, height: canvasH });
  const cardViewRef = useRef<EmberCharacterCardView>("front");
  const frontBufRef = useRef<SpriteCardBuf | null>(null);
  const extraViewsRef = useRef<ExtraCardViews>({});
  const artLayersRef = useRef<EmberSpriteArtLayer[] | undefined>(undefined);
  const activeLayerIdRef = useRef<string | undefined>(undefined);
  const framesRef = useRef<SpriteFrameBuf[] | undefined>(undefined);
  const activeFrameIdRef = useRef<string | undefined>(undefined);
  const showFrameRef = useRef<(frame: SpriteFrameBuf) => void>(() => {});
  const smudgePrevRef = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorStatusRef = useRef<HTMLSpanElement>(null);
  const selectionOverlayRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<PixelRect | null>(selection);
  const selectionMaskRef = useRef<boolean[] | null>(selectionMask);
  const selectionAnchorRef = useRef<PixelPoint | null>(null);
  const lassoPointsRef = useRef<PixelPoint[] | null>(null);
  const selectionMoveRef = useRef<{
    start: PixelPoint;
    rect: PixelRect;
    dx: number;
    dy: number;
  } | null>(null);
  const selectionScaleRef = useRef<{
    handle: PixelScaleHandle;
    source: PixelRect;
    target: PixelRect;
    mask?: boolean[];
  } | null>(null);
  selectionRef.current = selection;
  selectionMaskRef.current = selectionMask;
  type PaintSnapshot = {
    pixels: string[];
    emissive: string[];
    shine: string[];
    artLayers?: EmberSpriteArtLayer[];
    activeLayerId?: string;
    frames?: SpriteFrameBuf[];
    activeFrameId?: string;
    width: number;
    height: number;
  };
  const undoRef = useRef<PaintSnapshot[]>([]);
  const redoRef = useRef<PaintSnapshot[]>([]);
  const shapeDragRef = useRef<{
    start: PixelPoint;
    snapshot: PaintSnapshot;
    base: string[];
    kind: PixelShapeKind;
    channel: DrawLayer;
    color: string;
    thickness: number;
    filled: boolean;
    symmetry: PixelSymmetry;
    changed: boolean;
  } | null>(null);
  const brushStrokeRef = useRef<{
    snapshot: PaintSnapshot;
    base: string[];
    channel: DrawLayer;
    color: string;
    size: number;
    symmetry: PixelSymmetry;
    opacity: number;
    dither: PixelDitherCoverage;
    spacing: number;
    pixelPerfect: boolean;
    path: PixelStrokePath;
    changed: boolean;
  } | null>(null);
  const layerOpacityGestureRef = useRef<{
    snapshot: PaintSnapshot;
    changed: boolean;
  } | null>(null);
  const frameDurationGestureRef = useRef<{
    snapshot: PaintSnapshot;
    changed: boolean;
  } | null>(null);
  const [historyLen, setHistoryLen] = useState(0);
  const [redoLen, setRedoLen] = useState(0);
  const [clipReady, setClipReady] = useState(() => hasPixelClipboard());
  const [cellScale, setCellScale] = useState(14);
  const canvasNavigation = usePixelCanvasNavigation({
    stageRef,
    canvasRef,
    scale: cellScale,
    setScale: setCellScale,
    width,
    height: canvasH,
    maxScale: 40,
    fitPaddingX: 170,
    fitPaddingY: 40,
  });
  const [tagsDraft, setTagsDraft] = useState("");
  const [worldOffsetVoxels, setWorldOffsetVoxels] = useState({
    x: 0,
    y: 0,
    z: 0,
  });
  const [pickerQuery, setPickerQuery] = useState("");
  const [showColor, setShowColor] = useState(true);
  const [showGlow, setShowGlow] = useState(true);
  const [showShine, setShowShine] = useState(true);
  const [artLayers, setArtLayers] = useState<EmberSpriteArtLayer[] | undefined>();
  const [activeLayerId, setActiveLayerId] = useState<string | undefined>();
  const [frames, setFrames] = useState<SpriteFrameBuf[] | undefined>();
  const [activeFrameId, setActiveFrameId] = useState<string | undefined>();
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewLoop, setPreviewLoop] = useState(true);
  const [previewRangeStart, setPreviewRangeStart] = useState(0);
  const [previewRangeEnd, setPreviewRangeEnd] = useState(
    MAX_SPRITE_ANIM_FRAMES - 1,
  );
  const [onionSkin, setOnionSkin] = useState(false);
  const [onionSkinOpacity, setOnionSkinOpacity] = useState(28);
  useEffect(() => {
    setSelection(null);
    setSelectionMask(null);
    selectionAnchorRef.current = null;
    lassoPointsRef.current = null;
    selectionMoveRef.current = null;
    selectionScaleRef.current = null;
    shapeDragRef.current = null;
    brushStrokeRef.current = null;
  }, [spriteId, cardView, activeLayerId, activeFrameId]);

  toolRef.current = tool;
  brushSizeRef.current = brushSize;
  symmetryRef.current = {
    horizontal: symmetryHorizontal,
    vertical: symmetryVertical,
  };
  pixelsRef.current = pixels;
  emissiveRef.current = emissivePixels;
  shineRef.current = shinePixels;
  artLayersRef.current = artLayers;
  activeLayerIdRef.current = activeLayerId;
  geomRef.current = { width, height: canvasH };
  const selectedArtLayer =
    artLayers?.find((layer) => layer.id === activeLayerId) ?? artLayers?.at(-1);
  const selectedFrame =
    frames?.find((frame) => frame.id === activeFrameId) ?? frames?.[0];
  const selectedFrameIndex = selectedFrame
    ? (frames?.findIndex((frame) => frame.id === selectedFrame.id) ?? -1)
    : -1;
  const colorRef = useRef(color);
  const backgroundColorRef = useRef(backgroundColor);
  colorRef.current = color;
  backgroundColorRef.current = backgroundColor;
  const cellScaleRef = useRef(cellScale);
  cellScaleRef.current = cellScale;

  const favorites = pack.paletteFavorites ?? [];
  const packRef = useRef(pack);
  packRef.current = pack;
  useEffect(() => {
    const pruned = prunePaletteFavorites(favorites);
    if (
      pruned.length === favorites.length &&
      pruned.every((c, i) => c === favorites[i])
    ) {
      return;
    }
    onChangePack({ ...packRef.current, paletteFavorites: pruned });
  }, [favorites, onChangePack]);

  const chooseForegroundColor = (next: string) => {
    setColor(next);
    setRecentColors((recent) => pushRecentPixelColor(recent, next));
  };

  const chooseBackgroundColor = (next: string) => {
    setBackgroundColor(next);
    setRecentColors((recent) => pushRecentPixelColor(recent, next));
  };

  const swapPaletteColors = () => {
    const foreground = colorRef.current;
    setColor(backgroundColorRef.current);
    setBackgroundColor(foreground);
  };

  const resetPaletteColors = () => {
    setColor("#1a120e");
    setBackgroundColor("#f2e6d8");
  };

  const setPaletteFavorites = (colors: string[]) => {
    onChangePack({
      ...packRef.current,
      paletteFavorites: prunePaletteFavorites(colors),
    });
  };

  // Load sprite into editor
  useEffect(() => {
    if (!sprite) {
      setNameRu("");
      setPixels(emptySpritePixels(16, 16));
      setEmissivePixels(emptySpritePixels(16, 16));
      setShinePixels(emptySpritePixels(16, 16));
      setEmissiveAnim("always");
      setEmissiveStrength(0.75);
      setRoles(["decor"]);
      setSolid(false);
      setGlow(false);
      setMaterial("");
      setWidthDraft(16);
      setHeightDraft(16);
      setTagsDraft("");
      setWorldOffsetVoxels({ x: 0, y: 0, z: 0 });
      cardViewRef.current = "front";
      setCardView("front");
      frontBufRef.current = null;
      extraViewsRef.current = {};
      artLayersRef.current = undefined;
      activeLayerIdRef.current = undefined;
      setArtLayers(undefined);
      setActiveLayerId(undefined);
      framesRef.current = undefined;
      activeFrameIdRef.current = undefined;
      setFrames(undefined);
      setActiveFrameId(undefined);
      setPreviewPlaying(false);
      setPreviewRangeStart(0);
      setPreviewRangeEnd(MAX_SPRITE_ANIM_FRAMES - 1);
      setOnionSkin(false);
      return;
    }
    setNameRu(sprite.nameRu ?? "");
    setColor(sprite.color || "#c45c26");
    setRoles(sprite.roles?.length ? [...sprite.roles] : ["decor"]);
    setSolid(Boolean(sprite.solid));
    setGlow(Boolean(sprite.glow));
    setMaterial(sprite.material ?? "");
    setPixels([...sprite.pixels]);
    const need = sprite.width * spriteTotalHeight(sprite);
    setEmissivePixels(
      sprite.emissivePixels && sprite.emissivePixels.length === need
        ? [...sprite.emissivePixels]
        : emptySpritePixels(sprite.width, spriteTotalHeight(sprite)),
    );
    setShinePixels(
      sprite.shinePixels && sprite.shinePixels.length === need
        ? [...sprite.shinePixels]
        : emptySpritePixels(sprite.width, spriteTotalHeight(sprite)),
    );
    {
      const h = spriteTotalHeight(sprite);
      const em =
        sprite.emissivePixels && sprite.emissivePixels.length === need
          ? [...sprite.emissivePixels]
          : emptySpritePixels(sprite.width, h);
      const sh =
        sprite.shinePixels && sprite.shinePixels.length === need
          ? [...sprite.shinePixels]
          : emptySpritePixels(sprite.width, h);
      const layers = cloneArtLayers(sprite.artLayers);
      const activeId = layers?.at(-1)?.id;
      frontBufRef.current = {
        pixels: [...sprite.pixels],
        emissive: em,
        shine: sh,
        artLayers: layers,
        activeLayerId: activeId,
      };
      extraViewsRef.current = extrasFromSprite(sprite, sprite.width, h);
      cardViewRef.current = "front";
      setCardView("front");
      artLayersRef.current = layers;
      activeLayerIdRef.current = activeId;
      setArtLayers(layers);
      setActiveLayerId(activeId);
      const loadedFrames =
        sprite.frames && sprite.frames.length >= 2
          ? sprite.frames.map((frame) =>
              frameBufFromAnim(frame, sprite.width, h),
            )
          : undefined;
      framesRef.current = loadedFrames;
      activeFrameIdRef.current = loadedFrames?.[0]?.id;
      setFrames(loadedFrames);
      setActiveFrameId(loadedFrames?.[0]?.id);
      setPreviewPlaying(false);
      setPreviewRangeStart(0);
      setPreviewRangeEnd(MAX_SPRITE_ANIM_FRAMES - 1);
      setOnionSkin(false);
    }
    setEmissiveAnim(sprite.emissiveAnim ?? "always");
    setEmissiveStrength(
      Number.isFinite(sprite.emissiveStrength)
        ? (sprite.emissiveStrength as number)
        : 0.75,
    );
    {
      const bloom = normalizeEmissiveBloomColor(sprite.emissiveBloomColor);
      setEmissiveBloomCustom(!!bloom);
      setEmissiveBloomColor(bloom ?? "#88ccff");
    }
    setEmissiveCastsLight(sprite.emissiveCastsLight === true);
    setEmissiveLightRange(resolveEmissiveLightRange(sprite.emissiveLightRange));
    setEmissiveLightShadows(sprite.emissiveLightShadows === true);
    setEmissiveAnimPeriod(
      resolveEmissiveAnimPeriod(sprite.emissiveAnimPeriod, "pulse"),
    );
    {
      const range = resolveEmissiveFlickerPeriodRange(
        sprite.emissiveAnimPeriodMin,
        sprite.emissiveAnimPeriodMax,
        sprite.emissiveAnimPeriod,
      );
      setEmissiveAnimPeriodMin(range.min);
      setEmissiveAnimPeriodMax(range.max);
    }
    setEmissiveTriggerWhen(
      resolveEmissiveTriggerWhen(sprite.emissiveTriggerWhen),
    );
    setEmissiveTriggerRadius(
      resolveEmissiveTriggerRadius(sprite.emissiveTriggerRadius),
    );
    setEmissiveTriggerEventId(sprite.emissiveTriggerEventId ?? "");
    setWidthDraft(sprite.width);
    setHeightDraft(spriteTotalHeight(sprite));
    setTagsDraft(formatEmberLibraryTags(sprite.tags));
    setWorldOffsetVoxels(resolveSpriteWorldOffsetVoxels(sprite));
    undoRef.current = [];
    redoRef.current = [];
    setHistoryLen(0);
    setRedoLen(0);
  }, [spriteId, sprite?.id, editorLoadNonce]);

  useEffect(() => {
    if (spriteId && !pack.sprites[spriteId]) {
      setSpriteId(spriteList[0]?.id ?? null);
    }
  }, [pack.sprites, spriteId, spriteList]);

  const onionNeighbors = useMemo(() => {
    if (!onionSkin || previewPlaying || !frames?.length || !activeFrameId) {
      return null;
    }
    const index = frames.findIndex((frame) => frame.id === activeFrameId);
    if (index < 0) return null;
    const pixelsForView = (frame: SpriteFrameBuf | undefined) => {
      if (!frame) return undefined;
      return cardView === "front"
        ? frame.front.pixels
        : frame.extras[cardView]?.pixels;
    };
    return {
      previous: pixelsForView(frames[index - 1]),
      next: pixelsForView(frames[index + 1]),
    };
  }, [activeFrameId, cardView, frames, onionSkin, previewPlaying]);

  // Paint unified canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width * cellScale;
    canvas.height = canvasH * cellScale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < canvasH; y++) {
      for (let x = 0; x < width; x++) {
        const c = pixels[y * width + x];
        const px = x * cellScale;
        const py = y * cellScale;
        const previous = onionNeighbors?.previous?.[y * width + x];
        const next = onionNeighbors?.next?.[y * width + x];
        const previousVisible =
          !!previous && !(previous.length === 9 && previous.endsWith("00"));
        const nextVisible = !!next && !(next.length === 9 && next.endsWith("00"));
        if (previousVisible) {
          ctx.fillStyle = "#ff5a54";
          ctx.globalAlpha = onionSkinOpacity / 100;
          ctx.fillRect(px, py, cellScale, cellScale);
          ctx.globalAlpha = 1;
        }
        if (nextVisible) {
          ctx.fillStyle = "#63d98b";
          ctx.globalAlpha = onionSkinOpacity / 100;
          ctx.fillRect(px, py, cellScale, cellScale);
          ctx.globalAlpha = 1;
        }
        if (showColor && c && c !== "#00000000") {
          ctx.fillStyle = c;
          ctx.fillRect(px, py, cellScale, cellScale);
        }
        const em = emissivePixels[y * width + x];
        if (showGlow && em && em !== "#00000000") {
          ctx.fillStyle = em;
          ctx.globalAlpha = 0.55 + emissiveStrength * 0.35;
          ctx.fillRect(px, py, cellScale, cellScale);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "rgba(255, 230, 140, 0.85)";
          ctx.lineWidth = Math.max(1, cellScale * 0.08);
          ctx.strokeRect(
            px + 0.5,
            py + 0.5,
            cellScale - 1,
            cellScale - 1,
          );
        }
        const sh = shinePixels[y * width + x];
        if (showShine && sh && sh !== "#00000000") {
          ctx.fillStyle = sh;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(px, py, cellScale, cellScale);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "rgba(180, 220, 240, 0.9)";
          ctx.lineWidth = Math.max(1, cellScale * 0.08);
          ctx.strokeRect(
            px + 0.5,
            py + 0.5,
            cellScale - 1,
            cellScale - 1,
          );
        }
      }
    }
  }, [
    pixels,
    emissivePixels,
    shinePixels,
    emissiveStrength,
    width,
    canvasH,
    cellScale,
    showColor,
    showGlow,
    showShine,
    onionNeighbors,
    onionSkinOpacity,
  ]);

  // On-tile preview (compact; elevation Z0…MAX)
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !tileset || !sprite) return;
    const tile =
      tileset.tiles.find((t) => t.id === previewTileId) ??
      tileset.tiles.find((t) => t.id !== 0);
    const tilePx = tileset.tileSize;
    const elev = Math.max(0, Math.min(MAX_ELEVATION, previewElev));
    const live: EmberPixelSprite = {
      ...sprite,
      worldOffsetVoxels: normalizeSpriteWorldOffsetVoxels(worldOffsetVoxels),
      pixels,
      emissivePixels,
      shinePixels,
      width,
      topHeight: canvasH,
      wallHeights: [],
    };
    const storyHSrc = spriteWallHeight(live);
    const maxBox = 88;
    const roughH =
      tilePx +
      elev * WALL_HEIGHT +
      (storyHSrc > 0 ? storyHSrc + canvasH : Math.max(canvasH, tilePx));
    const viewScale = Math.max(
      2,
      Math.min(6, Math.floor(maxBox / Math.max(tilePx, roughH * 0.45))),
    );
    const tileDraw = tilePx * viewScale;
    const storyH = Math.round(storyHSrc * viewScale);
    const topDrawH = Math.round(canvasH * viewScale);
    const elevOff = elev * Math.round(WALL_HEIGHT * viewScale);
    const hasVisual = spriteHasVisual({ ...sprite, pixels });
    const stackRaise =
      hasVisual && storyH > 0
        ? storyH
        : hasVisual
          ? Math.max(0, topDrawH - tileDraw)
          : 0;
    const padX = Math.max(4, Math.ceil((width * viewScale - tileDraw) / 2) + 4);
    const padTop = 4 + stackRaise;
    const padBot = 4;
    const floorY = padTop;
    const w = tileDraw + padX * 2;
    const h = floorY + tileDraw + elevOff + padBot;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0c0a10";
    ctx.fillRect(0, 0, w, h);

    // Cliff under raised floor
    if (elevOff > 0) {
      const cliffTop = floorY + tileDraw;
      ctx.fillStyle = "rgba(40, 28, 22, 0.95)";
      ctx.fillRect(padX + 2, cliffTop, tileDraw - 4, elevOff);
      ctx.fillStyle = "rgba(70, 48, 36, 0.85)";
      ctx.fillRect(padX, cliffTop, tileDraw, Math.min(3, elevOff));
      for (let e = 1; e <= elev; e++) {
        const y = cliffTop + Math.round((elevOff * e) / elev) - 1;
        ctx.strokeStyle = "rgba(255, 200, 120, 0.2)";
        ctx.beginPath();
        ctx.moveTo(padX + 2, y);
        ctx.lineTo(padX + tileDraw - 2, y);
        ctx.stroke();
      }
    }

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(padX - 2, floorY + tileDraw - 3, tileDraw + 4, 6);
    if (tile) {
      paintTileFace(ctx, tile, padX, floorY, tileDraw);
    } else {
      ctx.fillStyle = "#2f4a30";
      ctx.fillRect(padX, floorY, tileDraw, tileDraw);
    }
    if (hasVisual) {
      paintSpriteDecorOnFloor(ctx, live, padX, floorY, tileDraw, viewScale);
    }
    const wallH = Math.round(storyHSrc * viewScale);
    const topH = Math.max(1, Math.round(canvasH * viewScale));
    const tw = Math.max(1, Math.round(width * viewScale));
    const cx = padX + tileDraw / 2;
    const cy =
      wallH > 0
        ? floorY + tileDraw - wallH - topH / 2
        : floorY + tileDraw / 2;
    const visualOffset = resolveSpriteWorldOffsetVoxels(live);
    const voxelPx = tileDraw / 16;
    const overlayX = Math.round(cx - tw / 2 + visualOffset.x * voxelPx);
    const overlayY = Math.round(
      cy - topH / 2 + (visualOffset.y - visualOffset.z) * voxelPx,
    );
    if (spriteFaceHasInk(emissivePixels)) {
      ctx.save();
      ctx.globalAlpha = 0.55 + emissiveStrength * 0.35;
      paintPixelGrid(
        ctx,
        emissivePixels,
        width,
        canvasH,
        overlayX,
        overlayY,
        tw,
        topH,
      );
      ctx.restore();
    }
    if (spriteFaceHasInk(shinePixels)) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      paintPixelGrid(
        ctx,
        shinePixels,
        width,
        canvasH,
        overlayX,
        overlayY,
        tw,
        topH,
      );
      ctx.restore();
    }
    ctx.strokeStyle = "rgba(255, 220, 160, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(padX + 0.5, floorY + 0.5, tileDraw - 1, tileDraw - 1);
    if (elev > 0) {
      ctx.font = "9px sans-serif";
      ctx.fillStyle = "rgba(220, 230, 255, 0.85)";
      ctx.fillText(`Z${elev}`, padX + 2, floorY + 10);
    }
  }, [
    pixels,
    emissivePixels,
    shinePixels,
    emissiveStrength,
    width,
    canvasH,
    tileset,
    previewTileId,
    sprite,
    previewElev,
    worldOffsetVoxels,
  ]);

  const capturePaintSnapshot = (): PaintSnapshot => {
    const g = geomRef.current;
    return {
      pixels: [...pixelsRef.current],
      emissive: [...emissiveRef.current],
      shine: [...shineRef.current],
      artLayers: cloneArtLayers(artLayersRef.current),
      activeLayerId: activeLayerIdRef.current,
      frames: framesRef.current?.map(cloneFrameBuf),
      activeFrameId: activeFrameIdRef.current,
      width: g.width,
      height: g.height,
    };
  };

  const pushPaintSnapshot = (snapshot: PaintSnapshot) => {
    undoRef.current = [
      ...undoRef.current.slice(-40),
      snapshot,
    ];
    redoRef.current = [];
    setHistoryLen(undoRef.current.length);
    setRedoLen(0);
  };

  const pushHistory = () => {
    pushPaintSnapshot(capturePaintSnapshot());
  };

  const commitToPack = useCallback(
    (nextPixels: string[], overrides?: Partial<EmberPixelSprite>) => {
      if (!spriteId || !sprite) return;
      const g = geomRef.current;
      const widthOut = overrides?.width ?? g.width;
      const heightOut = overrides?.topHeight ?? g.height;
      const pxSrc = overrides?.pixels ?? nextPixels;
      const px = matchChannelSize(pxSrc, g.width, g.height, widthOut, heightOut);
      const emRaw = overrides?.emissivePixels ?? emissiveRef.current;
      const em = matchChannelSize(emRaw, g.width, g.height, widthOut, heightOut);
      const shRaw = overrides?.shinePixels ?? shineRef.current;
      const sh = matchChannelSize(shRaw, g.width, g.height, widthOut, heightOut);
      const colorDom = dominantColor(px) || color;
      const view = cardViewRef.current;
      const currentBuf: SpriteCardBuf = {
        pixels: [...px],
        emissive: [...em],
        shine: [...sh],
        artLayers: cloneArtLayers(artLayersRef.current),
        activeLayerId: activeLayerIdRef.current,
      };
      if (view === "front") {
        frontBufRef.current = currentBuf;
      } else {
        extraViewsRef.current = {
          ...extraViewsRef.current,
          [view]: currentBuf,
        };
      }
      let timeline = framesRef.current;
      if (timeline?.length) {
        const fid = activeFrameIdRef.current ?? timeline[0]!.id;
        timeline = timeline.map((frame) =>
          frame.id !== fid
            ? frame
            : {
                ...frame,
                front:
                  view === "front"
                    ? currentBuf
                    : (frontBufRef.current ?? currentBuf),
                extras: extraViewsRef.current,
              },
        );
        framesRef.current = timeline;
        setFrames(timeline);
      }
      const packedFrames = packEditorFrames(timeline);
      const frame0 = timeline?.[0];
      const frontBuf = frame0?.front
        ?? (view === "front" ? currentBuf : (frontBufRef.current ?? currentBuf));
      const extras = frame0?.extras ?? extraViewsRef.current;
      const views = packCardViews(extras);
      const channelHasInk = (buf: SpriteCardBuf, kind: "emissive" | "shine") =>
        buf[kind].some((c) => c && c !== "#00000000");
      const extrasHave = (
        bag: ExtraCardViews,
        kind: "emissive" | "shine",
      ) =>
        EMBER_SPRITE_CARD_EXTRA_VIEWS.some((key) => {
          const buf = bag[key];
          return buf ? channelHasInk(buf, kind) : false;
        });
      const hasEm = timeline?.length
        ? timeline.some(
            (frame) =>
              channelHasInk(frame.front, "emissive") ||
              extrasHave(frame.extras, "emissive"),
          )
        : channelHasInk(frontBuf, "emissive") || extrasHave(extras, "emissive");
      const hasShine = timeline?.length
        ? timeline.some(
            (frame) =>
              channelHasInk(frame.front, "shine") ||
              extrasHave(frame.extras, "shine"),
          )
        : channelHasInk(frontBuf, "shine") || extrasHave(extras, "shine");
      const anim = hasEm ? emissiveAnim : undefined;
      const isTrig = anim === "trigger";
      const isPulse = anim === "pulse";
      const isFlicker = anim === "flicker";
      const flickerRange = isFlicker
        ? resolveEmissiveFlickerPeriodRange(
            emissiveAnimPeriodMin,
            emissiveAnimPeriodMax,
          )
        : null;
      const nextSpr: EmberPixelSprite = serializePixelSprite(
        flattenSpriteForEditor({
          ...sprite,
          nameRu: nameRu.trim() || sprite.nameRu,
          color: colorDom,
          emissiveAnim: anim,
          emissiveStrength: hasEm ? emissiveStrength : undefined,
          emissiveBloomColor:
            hasEm && emissiveBloomCustom
              ? normalizeEmissiveBloomColor(emissiveBloomColor)
              : undefined,
          emissiveCastsLight: hasEm && emissiveCastsLight ? true : undefined,
          emissiveLightRange:
            hasEm && emissiveCastsLight
              ? resolveEmissiveLightRange(emissiveLightRange)
              : undefined,
          emissiveLightShadows:
            hasEm && emissiveCastsLight && emissiveLightShadows
              ? true
              : undefined,
          emissiveAnimPeriod: isPulse ? emissiveAnimPeriod : undefined,
          emissiveAnimPeriodMin: flickerRange?.min,
          emissiveAnimPeriodMax: flickerRange?.max,
          emissiveTriggerWhen: isTrig ? emissiveTriggerWhen : undefined,
          emissiveTriggerRadius: isTrig ? emissiveTriggerRadius : undefined,
          emissiveTriggerEventId:
            isTrig && emissiveTriggerWhen === "event"
              ? emissiveTriggerEventId || undefined
              : undefined,
          roles: [...roles],
          tags: normalizeEmberLibraryTags(tagsDraft),
          worldOffsetVoxels: normalizeSpriteWorldOffsetVoxels(
            worldOffsetVoxels,
          ),
          solid,
          glow,
          material: material || undefined,
          ...overrides,
          width: widthOut,
          topHeight: heightOut,
          wallHeights: [],
          pixels: [...frontBuf.pixels],
          emissivePixels: hasEm ? [...frontBuf.emissive] : undefined,
          shinePixels: hasShine ? [...frontBuf.shine] : undefined,
          artLayers: packArtLayers(frontBuf.artLayers),
          views,
          frames: packedFrames,
        }),
      );
      onChangePack({
        ...pack,
        sprites: { ...pack.sprites, [spriteId]: nextSpr },
      });
      return nextSpr;
    },
    [
      spriteId,
      sprite,
      nameRu,
      color,
      roles,
      tagsDraft,
      worldOffsetVoxels,
      solid,
      glow,
      material,
      emissiveAnim,
      emissiveStrength,
      emissiveBloomColor,
      emissiveBloomCustom,
      emissiveCastsLight,
      emissiveLightRange,
      emissiveLightShadows,
      emissiveAnimPeriod,
      emissiveAnimPeriodMin,
      emissiveAnimPeriodMax,
      emissiveTriggerWhen,
      emissiveTriggerRadius,
      emissiveTriggerEventId,
      pack,
      onChangePack,
    ],
  );

  const toggleSolid = () => {
    const next = !solid;
    setSolid(next);
    commitToPack(pixelsRef.current, { solid: next });
  };

  const toggleGlow = () => {
    const next = !glow;
    setGlow(next);
    commitToPack(pixelsRef.current, { glow: next });
  };

  const applyLive = (
    next: string[],
    nextEmissive?: string[],
    nextShine?: string[],
    save = true,
  ) => {
    pixelsRef.current = next;
    setPixels(next);
    if (nextEmissive) {
      emissiveRef.current = nextEmissive;
      setEmissivePixels(nextEmissive);
    }
    if (nextShine) {
      shineRef.current = nextShine;
      setShinePixels(nextShine);
    }
    if (save) commitToPack(next);
  };

  const applyLayers = (
    layers: EmberSpriteArtLayer[] | undefined,
    activeId?: string,
  ) => {
    artLayersRef.current = layers;
    activeLayerIdRef.current = activeId ?? layers?.at(-1)?.id;
    setArtLayers(layers);
    setActiveLayerId(activeLayerIdRef.current);
  };

  const activeArtLayer = (): EmberSpriteArtLayer | undefined => {
    const layers = artLayersRef.current;
    if (!layers?.length) return undefined;
    const id = activeLayerIdRef.current;
    return layers.find((layer) => layer.id === id) ?? layers[layers.length - 1];
  };

  const activeColorLayerLocked = () => activeArtLayer()?.locked === true;

  const applyLayerStack = (
    layers: EmberSpriteArtLayer[],
    activeId = activeLayerIdRef.current,
    save = true,
  ) => {
    const g = geomRef.current;
    const composed = compositeArtLayers(layers, g.width, g.height);
    applyLayers(layers, activeId);
    pixelsRef.current = composed;
    setPixels(composed);
    if (save) commitToPack(composed);
  };

  const writeColorPixels = (nextLayerPixels: string[]) => {
    const layers = artLayersRef.current;
    if (layers?.length) {
      const id = activeLayerIdRef.current ?? layers[layers.length - 1]!.id;
      const active = layers.find((layer) => layer.id === id) ?? layers[layers.length - 1]!;
      const constrained = constrainArtLayerPixels(active, nextLayerPixels);
      if (constrained === active.pixels) return;
      const nextLayers = layers.map((layer) =>
        layer.id === id ? { ...layer, pixels: constrained } : layer,
      );
      applyLayerStack(nextLayers, id);
      return;
    }
    pixelsRef.current = nextLayerPixels;
    setPixels(nextLayerPixels);
    commitToPack(nextLayerPixels);
  };

  const colorTargetPixels = (): string[] => {
    const layers = artLayersRef.current;
    if (!layers?.length) return pixelsRef.current;
    const id = activeLayerIdRef.current;
    const layer =
      layers.find((item) => item.id === id) ?? layers[layers.length - 1]!;
    return layer.pixels;
  };

  const flushCurrentView = () => {
    const buf: SpriteCardBuf = {
      pixels: [...pixelsRef.current],
      emissive: [...emissiveRef.current],
      shine: [...shineRef.current],
      artLayers: cloneArtLayers(artLayersRef.current),
      activeLayerId: activeLayerIdRef.current,
    };
    if (cardViewRef.current === "front") frontBufRef.current = buf;
    else extraViewsRef.current[cardViewRef.current] = buf;
    return buf;
  };

  const switchCardView = (next: EmberCharacterCardView) => {
    const prev = cardViewRef.current;
    if (next === prev) return;
    flushCurrentView();
    const g = geomRef.current;
    const incoming =
      next === "front"
        ? (frontBufRef.current ?? emptyCardBuf(g.width, g.height))
        : (extraViewsRef.current[next] ?? emptyCardBuf(g.width, g.height));
    if (next !== "front" && !extraViewsRef.current[next]) {
      extraViewsRef.current[next] = incoming;
    }
    cardViewRef.current = next;
    setCardView(next);
    applyLayers(cloneArtLayers(incoming.artLayers), incoming.activeLayerId);
    applyLive(incoming.pixels, incoming.emissive, incoming.shine, false);
  };

  const syncActiveFrameFromLive = () => {
    flushCurrentView();
    const timeline = framesRef.current;
    if (!timeline?.length) return;
    const view = cardViewRef.current;
    const currentBuf: SpriteCardBuf = {
      pixels: [...pixelsRef.current],
      emissive: [...emissiveRef.current],
      shine: [...shineRef.current],
      artLayers: cloneArtLayers(artLayersRef.current),
      activeLayerId: activeLayerIdRef.current,
    };
    if (view === "front") frontBufRef.current = currentBuf;
    else extraViewsRef.current[view] = currentBuf;
    const fid = activeFrameIdRef.current ?? timeline[0]!.id;
    const next = timeline.map((frame) =>
      frame.id !== fid
        ? frame
        : {
            ...frame,
            front:
              view === "front"
                ? currentBuf
                : (frontBufRef.current ?? currentBuf),
            extras: extraViewsRef.current,
          },
    );
    framesRef.current = next;
    setFrames(next);
  };

  const showFrame = (frame: SpriteFrameBuf) => {
    frontBufRef.current = cloneCardBuf(frame.front);
    extraViewsRef.current = cloneExtras(frame.extras);
    activeFrameIdRef.current = frame.id;
    setActiveFrameId(frame.id);
    const g = geomRef.current;
    const view = cardViewRef.current;
    const incoming =
      view === "front"
        ? frontBufRef.current
        : (extraViewsRef.current[view] ?? emptyCardBuf(g.width, g.height));
    if (view !== "front" && !extraViewsRef.current[view]) {
      extraViewsRef.current[view] = incoming;
    }
    applyLayers(cloneArtLayers(incoming.artLayers), incoming.activeLayerId);
    applyLive(incoming.pixels, incoming.emissive, incoming.shine, false);
  };
  showFrameRef.current = showFrame;

  const restorePaintSnapshot = (snap: PaintSnapshot) => {
    geomRef.current = { width: snap.width, height: snap.height };
    const restoredFrames = snap.frames?.map(cloneFrameBuf);
    framesRef.current = restoredFrames;
    setFrames(restoredFrames);
    const fid =
      snap.activeFrameId &&
      restoredFrames?.some((frame) => frame.id === snap.activeFrameId)
        ? snap.activeFrameId
        : restoredFrames?.[0]?.id;
    activeFrameIdRef.current = fid;
    setActiveFrameId(fid);
    if (fid && restoredFrames) {
      const frame =
        restoredFrames.find((item) => item.id === fid) ?? restoredFrames[0]!;
      frontBufRef.current = cloneCardBuf(frame.front);
      extraViewsRef.current = cloneExtras(frame.extras);
    }
    pixelsRef.current = [...snap.pixels];
    emissiveRef.current = [...snap.emissive];
    shineRef.current = [...snap.shine];
    geomRef.current = { width: snap.width, height: snap.height };
    applyLayers(cloneArtLayers(snap.artLayers), snap.activeLayerId);
    setPixels(pixelsRef.current);
    setEmissivePixels(emissiveRef.current);
    setShinePixels(shineRef.current);
    setWidthDraft(snap.width);
    setHeightDraft(snap.height);
    commitToPack(snap.pixels, {
      width: snap.width,
      topHeight: snap.height,
      wallHeights: [],
      emissivePixels: snap.emissive,
      shinePixels: snap.shine,
    });
  };

  const applyGeometry = (next: EmberPixelSprite) => {
    pushHistory();
    const prevG = geomRef.current;
    syncActiveFrameFromLive();

    const flushedFront = frontBufRef.current;
    const n = flattenSpriteForEditor(serializePixelSprite(next));
    const h = spriteTotalHeight(n);
    geomRef.current = { width: n.width, height: h };
    const loadedFrames =
      n.frames && n.frames.length >= 2
        ? n.frames.map((frame) => frameBufFromAnim(frame, n.width, h))
        : undefined;
    framesRef.current = loadedFrames;
    setFrames(loadedFrames);
    if (loadedFrames?.length) {
      const frame =
        loadedFrames.find((item) => item.id === activeFrameIdRef.current) ??
        loadedFrames[0]!;
      showFrame(frame);
      setWidthDraft(n.width);
      setHeightDraft(h);
      return;
    }
    const emSized =
      n.emissivePixels && n.emissivePixels.length === n.width * h
        ? [...n.emissivePixels]
        : emptySpritePixels(n.width, h);
    const shSized =
      n.shinePixels && n.shinePixels.length === n.width * h
        ? [...n.shinePixels]
        : emptySpritePixels(n.width, h);
    const resizedFrontLayers =
      cloneArtLayers(n.artLayers) ??
      resizeArtLayers(
        flushedFront?.artLayers,
        prevG.width,
        prevG.height,
        n.width,
        h,
      );
    frontBufRef.current = {
      pixels: [...n.pixels],
      emissive: emSized,
      shine: shSized,
      artLayers: resizedFrontLayers,
      activeLayerId:
        flushedFront?.activeLayerId &&
        resizedFrontLayers?.some((layer) => layer.id === flushedFront.activeLayerId)
          ? flushedFront.activeLayerId
          : resizedFrontLayers?.at(-1)?.id,
    };
    const nextExtras: ExtraCardViews = {};
    for (const key of EMBER_SPRITE_CARD_EXTRA_VIEWS) {
      const resized = resizeCardBuf(
        extraViewsRef.current[key],
        prevG.width,
        prevG.height,
        n.width,
        h,
      );
      if (resized) nextExtras[key] = resized;
    }
    extraViewsRef.current = nextExtras;
    const view = cardViewRef.current;
    const show =
      view === "front"
        ? frontBufRef.current
        : (extraViewsRef.current[view] ?? emptyCardBuf(n.width, h));
    pixelsRef.current = [...show.pixels];
    emissiveRef.current = [...show.emissive];
    shineRef.current = [...show.shine];
    applyLayers(cloneArtLayers(show.artLayers), show.activeLayerId);
    geomRef.current = { width: n.width, height: h };
    setPixels(pixelsRef.current);
    setEmissivePixels(emissiveRef.current);
    setShinePixels(shineRef.current);
    setWidthDraft(n.width);
    setHeightDraft(h);
    commitToPack(show.pixels, {
      width: n.width,
      topHeight: h,
      wallHeights: [],
      emissivePixels: show.emissive,
      shinePixels: show.shine,
    });
  };

  const undo = useCallback(() => {
    const h = undoRef.current;
    if (!h.length) return;
    const prev = h[h.length - 1]!;
    undoRef.current = h.slice(0, -1);
    redoRef.current = [...redoRef.current, capturePaintSnapshot()];
    setHistoryLen(undoRef.current.length);
    setRedoLen(redoRef.current.length);
    restorePaintSnapshot(prev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitToPack]);

  const redo = useCallback(() => {
    const h = redoRef.current;
    if (!h.length) return;
    const next = h[h.length - 1]!;
    redoRef.current = h.slice(0, -1);
    undoRef.current = [...undoRef.current, capturePaintSnapshot()];
    setHistoryLen(undoRef.current.length);
    setRedoLen(redoRef.current.length);
    restorePaintSnapshot(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitToPack]);

  const currentSelectionChannels = () => ({
    pixels: colorTargetPixels(),
    emissivePixels: emissiveRef.current,
    shinePixels: shineRef.current,
  });

  const applySelectionChannels = (channels: {
    pixels: string[];
    emissivePixels?: string[];
    shinePixels?: string[];
  }) => {
    writeColorPixels(channels.pixels);
    applyLive(
      pixelsRef.current,
      channels.emissivePixels ?? emissiveRef.current,
      channels.shinePixels ?? shineRef.current,
    );
  };

  const transformSelection = (transform: PixelTransform) => {
    const active = selectionRef.current;
    if (!active || activeColorLayerLocked()) return;
    const g = geomRef.current;
    pushHistory();
    const next = transformPixelSelection(
      currentSelectionChannels(),
      g.width,
      g.height,
      active,
      transform,
      selectionMaskRef.current ?? undefined,
    );
    applySelectionChannels(next.channels);
    setSelection(next.rect);
    setSelectionMask(next.mask ?? null);
    commitToPack(pixelsRef.current);
  };

  const deleteSelection = () => {
    const active = selectionRef.current;
    if (!active || activeColorLayerLocked()) return;
    const g = geomRef.current;
    pushHistory();
    applySelectionChannels(
      clearPixelSelection(
        currentSelectionChannels(),
        g.width,
        g.height,
        active,
        selectionMaskRef.current ?? undefined,
      ),
    );
    commitToPack(pixelsRef.current);
  };

  const copyCanvas = useCallback(() => {
    const g = geomRef.current;
    const active = selectionRef.current;
    const clip = active
      ? extractPixelSelection(
          currentSelectionChannels(),
          g.width,
          g.height,
          active,
          selectionMaskRef.current ?? undefined,
        )
      : null;
    copyPixelArtChannels(
      clip?.width ?? g.width,
      clip?.height ?? g.height,
      clip ?? currentSelectionChannels(),
      clip?.mask,
    );
    setClipReady(true);
  }, []);

  const selectAllPixels = () => {
    const g = geomRef.current;
    setSelection({ x: 0, y: 0, w: g.width, h: g.height });
    setSelectionMask(null);
    setTool("select");
    setPreviewPlaying(false);
  };

  const invertSelection = () => {
    const g = geomRef.current;
    const current = selectionRef.current
      ? { rect: selectionRef.current, mask: selectionMaskRef.current ?? undefined }
      : null;
    const inverted = invertPixelSelection(current, g.width, g.height);
    setSelection(inverted?.rect ?? null);
    setSelectionMask(inverted?.mask ?? null);
    setPreviewPlaying(false);
  };

  const cutSelection = () => {
    const active = selectionRef.current;
    if (!active || activeColorLayerLocked()) return;
    const g = geomRef.current;
    copyCanvas();
    pushHistory();
    applySelectionChannels(
      clearPixelSelection(
        currentSelectionChannels(),
        g.width,
        g.height,
        active,
        selectionMaskRef.current ?? undefined,
      ),
    );
    commitToPack(pixelsRef.current);
  };

  const duplicateSelection = () => {
    const active = selectionRef.current;
    if (!active || activeColorLayerLocked()) return;
    const g = geomRef.current;
    const dx = active.x + active.w < g.width ? 1 : active.x > 0 ? -1 : 0;
    const dy = active.y + active.h < g.height ? 1 : active.y > 0 ? -1 : 0;
    if (dx === 0 && dy === 0) return;
    pushHistory();
    const duplicated = duplicatePixelSelection(
      currentSelectionChannels(),
      g.width,
      g.height,
      active,
      dx,
      dy,
      selectionMaskRef.current ?? undefined,
    );
    applySelectionChannels(duplicated.channels);
    setSelection(duplicated.rect);
    setSelectionMask(duplicated.mask ?? null);
    setTool("select");
    setPreviewPlaying(false);
    commitToPack(pixelsRef.current);
  };

  const pasteCanvas = useCallback(() => {
    if (activeColorLayerLocked()) return;
    const g = geomRef.current;
    const active = selectionRef.current;
    const clip = peekPixelClipboard();
    if (
      (active || toolRef.current === "select" || toolRef.current === "lasso" || toolRef.current === "wand") &&
      clip
    ) {
      pushHistory();
      const pasted = pastePixelSelection(
        currentSelectionChannels(),
        g.width,
        g.height,
        clip,
        active?.x ?? 0,
        active?.y ?? 0,
      );
      applySelectionChannels(pasted.channels);
      setSelection(pasted.rect);
      setSelectionMask(pasted.mask ?? null);
      setTool("select");
      commitToPack(pixelsRef.current);
      return;
    }
    const next = pastePixelArtChannels(g.width, g.height);
    if (!next) return;
    pushHistory();
    if (artLayersRef.current?.length) {
      writeColorPixels(next.pixels);
      applyLive(pixelsRef.current, next.emissivePixels, next.shinePixels);
    } else {
      applyLive(next.pixels, next.emissivePixels, next.shinePixels);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitToPack]);

  const fillCanvas = () => {
    const g = geomRef.current;
    const layer = pixelShapeKind(tool) || tool === "fill" ? shapeChannel : channelForTool(tool);
    if (layer === "color" && activeColorLayerLocked()) return;
    const fill = color === "#00000000" ? "" : color;
    const filled = emptySpritePixels(g.width, g.height).map(() => fill);
    pushHistory();
    switch (layer) {
      case "color":
        writeColorPixels(filled);
        return;
      case "glow":
        applyLive(pixelsRef.current, filled);
        return;
      case "shine":
        applyLive(pixelsRef.current, undefined, filled);
        return;
      default: {
        const _never: never = layer;
        return _never;
      }
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showOpenPicker) {
        if (e.key === "Escape") {
          e.preventDefault();
          setShowOpenPicker(false);
        }
        return;
      }
      if (isTypingTarget(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === "Digit0") {
        e.preventDefault();
        canvasNavigation.fit();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === "Digit1") {
        e.preventDefault();
        canvasNavigation.zoom100();
        return;
      }
      if (!(e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.code === "Escape") {
          const shapeDrag = shapeDragRef.current;
          if (shapeDrag) {
            shapeDragRef.current = null;
            restorePaintSnapshot(shapeDrag.snapshot);
          }
          const brushStroke = brushStrokeRef.current;
          if (brushStroke) {
            brushStrokeRef.current = null;
            restorePaintSnapshot(brushStroke.snapshot);
          }
          setSelection(null);
          setSelectionMask(null);
          selectionAnchorRef.current = null;
          lassoPointsRef.current = null;
          selectionMoveRef.current = null;
          selectionScaleRef.current = null;
          if (selectionOverlayRef.current) selectionOverlayRef.current.style.transform = "";
        } else if (e.code === "KeyM") setTool("select");
        else if (e.code === "KeyL") setTool("lasso");
        else if (e.code === "KeyW") setTool("wand");
        else if (e.code === "KeyF") setTool("fill");
        else if (e.code === "KeyU") {
          setTool((current) => current === "line" ? "rect" : current === "rect" ? "ellipse" : "line");
        }
        else if ((e.code === "Delete" || e.code === "Backspace") && selectionRef.current) {
          deleteSelection();
        } else if (
          e.code.startsWith("Arrow") &&
          selectionRef.current &&
          !activeColorLayerLocked()
        ) {
          const g = geomRef.current;
          const dx = e.code === "ArrowLeft" ? -1 : e.code === "ArrowRight" ? 1 : 0;
          const dy = e.code === "ArrowUp" ? -1 : e.code === "ArrowDown" ? 1 : 0;
          pushHistory();
          const moved = movePixelSelection(
            currentSelectionChannels(),
            g.width,
            g.height,
            selectionRef.current,
            dx,
            dy,
            selectionMaskRef.current ?? undefined,
          );
          applySelectionChannels(moved.channels);
          setSelection(moved.rect);
          setSelectionMask(moved.mask ?? null);
          commitToPack(pixelsRef.current);
        } else if (e.code === "KeyB") setTool("paint");
        else if (e.code === "KeyI") setTool("eyedrop");
        else if (e.code === "KeyG") setTool("glow");
        else if (e.code === "KeyH") setTool("shine");
        else if (e.code === "KeyX") swapPaletteColors();
        else if (e.code === "KeyD") resetPaletteColors();
        else if (/^Digit[1-4]$/.test(e.code)) {
          setBrushSize(Number(e.code.slice(-1)));
        } else if (e.code === "BracketLeft" || e.code === "BracketRight") {
          setBrushSize((value) =>
            Math.max(1, Math.min(4, value + (e.code === "BracketRight" ? 1 : -1))),
          );
        } else {
          return;
        }
        e.preventDefault();
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const isUndo = e.code === "KeyZ" && !e.shiftKey;
      const isRedo =
        e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey);
      const isCopy = e.code === "KeyC";
      const isPaste = e.code === "KeyV";
      const isSelectAll = e.code === "KeyA" && !e.shiftKey;
      const isInvert = e.code === "KeyI" && e.shiftKey;
      const isCut = e.code === "KeyX";
      const isDuplicate = e.code === "KeyJ";
      if (
        !isUndo &&
        !isRedo &&
        !isCopy &&
        !isPaste &&
        !isSelectAll &&
        !isInvert &&
        !isCut &&
        !isDuplicate
      ) return;
      e.preventDefault();
      e.stopPropagation();
      if (isUndo) undo();
      else if (isRedo) redo();
      else if (isSelectAll) selectAllPixels();
      else if (isInvert) invertSelection();
      else if (isCut) cutSelection();
      else if (isDuplicate) duplicateSelection();
      else if (isCopy) copyCanvas();
      else pasteCanvas();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    showOpenPicker,
    undo,
    redo,
    copyCanvas,
    pasteCanvas,
    canvasNavigation.fit,
    canvasNavigation.zoom100,
  ]);

  const pixelFromEvent = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const g = geomRef.current;
    const scale = cellScaleRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(
      ((clientX - rect.left) * canvas.width) / rect.width / scale,
    );
    const y = Math.floor(
      ((clientY - rect.top) * canvas.height) / rect.height / scale,
    );
    if (x < 0 || y < 0 || x >= g.width || y >= g.height) return null;
    return { x, y, idx: y * g.width + x };
  };

  const updateCursorStatus = (clientX: number, clientY: number) => {
    const pos = pixelFromEvent(clientX, clientY);
    if (cursorStatusRef.current) {
      cursorStatusRef.current.textContent = pos ? `X ${pos.x}  Y ${pos.y}` : "X —  Y —";
    }
  };

  const clearCanvas = () => {
    if (activeColorLayerLocked()) return;
    const g = geomRef.current;
    const blank = emptySpritePixels(g.width, g.height);
    pushHistory();
    if (artLayersRef.current?.length) {
      writeColorPixels(blank);
      applyLive(pixelsRef.current, blank, blank);
      return;
    }
    applyLive(blank, blank, blank);
  };

  const resetSelectionDrag = () => {
    selectionAnchorRef.current = null;
    lassoPointsRef.current = null;
    selectionMoveRef.current = null;
    if (selectionOverlayRef.current) selectionOverlayRef.current.style.transform = "";
  };

  const selectWithMagicWand = (point: PixelPoint, shiftKey: boolean, altKey: boolean) => {
    const g = geomRef.current;
    const sampled = magicWandSelection(
      colorTargetPixels(),
      g.width,
      g.height,
      point,
      wandTolerance,
      wandContiguous,
    );
    const current = selectionRef.current
      ? { rect: selectionRef.current, mask: selectionMaskRef.current ?? undefined }
      : null;
    const mode = shiftKey && altKey
      ? "intersect"
      : altKey
        ? "subtract"
        : shiftKey
          ? "add"
          : wandCombineMode;
    const combined = combinePixelSelections(current, sampled, mode, g.width, g.height);
    setSelection(combined?.rect ?? null);
    setSelectionMask(combined?.mask ?? null);
    setPreviewPlaying(false);
  };

  const beginSelection = (point: PixelPoint) => {
    setPreviewPlaying(false);
    const active = selectionRef.current;
    if (active && pixelSelectionContains(active, selectionMaskRef.current ?? undefined, point)) {
      selectionMoveRef.current = { start: point, rect: active, dx: 0, dy: 0 };
      return;
    }
    if (toolRef.current === "lasso") {
      lassoPointsRef.current = [point];
      selectionAnchorRef.current = null;
      setSelection({ x: point.x, y: point.y, w: 1, h: 1 });
      setSelectionMask([true]);
      return;
    }
    selectionAnchorRef.current = point;
    setSelectionMask(null);
    setSelection({ x: point.x, y: point.y, w: 1, h: 1 });
  };

  const updateSelectionDrag = (point: PixelPoint) => {
    const g = geomRef.current;
    const moving = selectionMoveRef.current;
    if (moving) {
      moving.dx = Math.max(
        -moving.rect.x,
        Math.min(g.width - moving.rect.x - moving.rect.w, point.x - moving.start.x),
      );
      moving.dy = Math.max(
        -moving.rect.y,
        Math.min(g.height - moving.rect.y - moving.rect.h, point.y - moving.start.y),
      );
      if (selectionOverlayRef.current) {
        const scale = cellScaleRef.current;
        selectionOverlayRef.current.style.transform = `translate(${moving.dx * scale}px, ${moving.dy * scale}px)`;
      }
      return;
    }
    const lassoPoints = lassoPointsRef.current;
    if (lassoPoints) {
      const previous = lassoPoints[lassoPoints.length - 1];
      if (!previous || previous.x !== point.x || previous.y !== point.y) lassoPoints.push(point);
      const shape = pixelSelectionFromPolygon(lassoPoints, g.width, g.height);
      if (shape) {
        setSelection(shape.rect);
        setSelectionMask(shape.mask ?? null);
      }
      return;
    }
    const anchor = selectionAnchorRef.current;
    if (anchor) setSelection(pixelRectFromPoints(anchor, point, g.width, g.height));
  };

  const finishSelectionDrag = () => {
    const moving = selectionMoveRef.current;
    if (
      moving &&
      !activeColorLayerLocked() &&
      (moving.dx !== 0 || moving.dy !== 0)
    ) {
      const g = geomRef.current;
      pushHistory();
      const moved = movePixelSelection(
        currentSelectionChannels(),
        g.width,
        g.height,
        moving.rect,
        moving.dx,
        moving.dy,
        selectionMaskRef.current ?? undefined,
      );
      applySelectionChannels(moved.channels);
      setSelection(moved.rect);
      setSelectionMask(moved.mask ?? null);
      commitToPack(pixelsRef.current);
    }
    resetSelectionDrag();
  };

  const beginSelectionScale = (
    handle: PixelScaleHandle,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const active = selectionRef.current;
    if (!active || activeColorLayerLocked()) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    selectionScaleRef.current = {
      handle,
      source: active,
      target: active,
      mask: selectionMaskRef.current ? [...selectionMaskRef.current] : undefined,
    };
    setPreviewPlaying(false);
  };

  const updateSelectionScale = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const sizing = selectionScaleRef.current;
    if (!sizing) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pixelFromEvent(event.clientX, event.clientY);
    if (!point) return;
    const g = geomRef.current;
    const target = pixelRectFromScaleHandle(
      sizing.source,
      sizing.handle,
      point,
      g.width,
      g.height,
      event.shiftKey,
    );
    sizing.target = target;
    setSelection(target);
    setSelectionMask(
      resizePixelMask(sizing.mask, sizing.source.w, sizing.source.h, target.w, target.h) ?? null,
    );
  };

  const finishSelectionScale = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const sizing = selectionScaleRef.current;
    if (!sizing) return;
    event.preventDefault();
    event.stopPropagation();
    selectionScaleRef.current = null;
    const { source, target } = sizing;
    if (
      source.x === target.x &&
      source.y === target.y &&
      source.w === target.w &&
      source.h === target.h
    ) return;
    const g = geomRef.current;
    pushHistory();
    const resized = resizePixelSelection(
      currentSelectionChannels(),
      g.width,
      g.height,
      source,
      target,
      sizing.mask,
    );
    applySelectionChannels(resized.channels);
    setSelection(resized.rect);
    setSelectionMask(resized.mask ?? null);
    commitToPack(pixelsRef.current);
  };

  const cancelSelectionScale = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const sizing = selectionScaleRef.current;
    if (!sizing) return;
    event.preventDefault();
    event.stopPropagation();
    selectionScaleRef.current = null;
    setSelection(sizing.source);
    setSelectionMask(sizing.mask ?? null);
  };

  const pickColorAt = (clientX: number, clientY: number) => {
    const pos = pixelFromEvent(clientX, clientY);
    if (!pos) return;
    const fromEm = toolRef.current === "glow";
    const fromShine = toolRef.current === "shine";
    const c = fromEm
      ? (emissiveRef.current[pos.idx] ?? "")
      : fromShine
        ? (shineRef.current[pos.idx] ?? "")
        : (pixelsRef.current[pos.idx] ?? "");
    chooseForegroundColor(c === "" ? "#00000000" : c);
    if (!fromEm && !fromShine) setTool("paint");
  };

  const paintAt = (clientX: number, clientY: number) => {
    if (previewPlaying) setPreviewPlaying(false);
    const pos = pixelFromEvent(clientX, clientY);
    if (!pos) return;
    const g = geomRef.current;
    const kind = toolRef.current;
    if (!isArtBrushTool(kind)) return;
    if (activeColorLayerLocked()) return;
    const target = colorTargetPixels();
    const b = Math.max(1, Math.min(4, brushSizeRef.current));
    let next = [...target];
    const prev = smudgePrevRef.current ?? { x: pos.x, y: pos.y };
    const stamped = stampArtBrush(
      next,
      g.width,
      g.height,
      pos.x,
      pos.y,
      b,
      kind,
      prev.x,
      prev.y,
    );
    next = stamped.pixels;
    smudgePrevRef.current = { x: pos.x, y: pos.y };
    if (!stamped.changed) return;
    if (!strokeSaved.current) {
      pushHistory();
      strokeSaved.current = true;
    }
    writeColorPixels(next);
  };

  const applyShapeTarget = (channel: DrawLayer, next: string[]) => {
    if (channel === "glow") {
      emissiveRef.current = next;
      setEmissivePixels(next);
      return;
    }
    if (channel === "shine") {
      shineRef.current = next;
      setShinePixels(next);
      return;
    }
    const g = geomRef.current;
    const layers = artLayersRef.current;
    if (layers?.length) {
      const id = activeLayerIdRef.current ?? layers[layers.length - 1]!.id;
      const active = layers.find((layer) => layer.id === id) ?? layers[layers.length - 1]!;
      const constrained = constrainArtLayerPixels(active, next);
      if (constrained === active.pixels) return;
      const nextLayers = layers.map((layer) =>
        layer.id === id ? { ...layer, pixels: constrained } : layer,
      );
      const composed = compositeArtLayers(nextLayers, g.width, g.height);
      applyLayers(nextLayers, id);
      pixelsRef.current = composed;
      setPixels(composed);
      return;
    }
    pixelsRef.current = next;
    setPixels(next);
  };

  const updateBrushStroke = (point: PixelPoint) => {
    const stroke = brushStrokeRef.current;
    if (!stroke) return;
    const g = geomRef.current;
    stroke.path = extendPixelStroke(
      stroke.path,
      point,
      stroke.spacing,
      stroke.pixelPerfect && stroke.size === 1,
    );
    const preview = paintPixelBrushStroke(
      stroke.base,
      g.width,
      g.height,
      stroke.path.points,
      stroke.color,
      stroke.size,
      stroke.symmetry,
      {
        opacity: stroke.opacity,
        ditherCoverage: stroke.dither,
      },
    );
    stroke.changed = preview.changed;
    applyShapeTarget(stroke.channel, preview.pixels);
  };

  const beginBrushStroke = (point: PixelPoint) => {
    setPreviewPlaying(false);
    const channel: DrawLayer = toolRef.current === "glow"
      ? "glow"
      : toolRef.current === "shine"
        ? "shine"
        : "color";
    if (channel === "color" && activeColorLayerLocked()) return;
    const base = channel === "glow"
      ? emissiveRef.current
      : channel === "shine"
        ? shineRef.current
        : colorTargetPixels();
    brushStrokeRef.current = {
      snapshot: capturePaintSnapshot(),
      base: [...base],
      channel,
      color: color === "#00000000" ? "" : color,
      size: brushSizeRef.current,
      symmetry: { ...symmetryRef.current },
      opacity: brushOpacity / 100,
      dither: brushDither,
      spacing: brushSpacing,
      pixelPerfect: brushPixelPerfect,
      path: { points: [], last: null, distance: 0 },
      changed: false,
    };
    updateBrushStroke(point);
  };

  const finishBrushStroke = () => {
    const stroke = brushStrokeRef.current;
    if (!stroke) return;
    brushStrokeRef.current = null;
    if (!stroke.changed) return;
    pushPaintSnapshot(stroke.snapshot);
    commitToPack(pixelsRef.current);
  };

  const fillAt = (point: PixelPoint) => {
    setPreviewPlaying(false);
    const g = geomRef.current;
    const channel = shapeChannel;
    if (channel === "color" && activeColorLayerLocked()) return;
    const base = channel === "glow"
      ? emissiveRef.current
      : channel === "shine"
        ? shineRef.current
        : colorTargetPixels();
    const filled = paintPixelFill(
      base,
      g.width,
      g.height,
      point,
      color === "#00000000" ? "" : color,
      fillTolerance,
      fillContiguous,
      symmetryRef.current,
    );
    if (!filled.changed) return;
    pushHistory();
    applyShapeTarget(channel, filled.pixels);
    commitToPack(pixelsRef.current);
  };

  const updateShapeDrag = (point: PixelPoint, constrained: boolean) => {
    const drag = shapeDragRef.current;
    if (!drag) return;
    const g = geomRef.current;
    const rawEnd = constrainPixelShapeEnd(drag.kind, drag.start, point, constrained);
    const end = {
      x: Math.max(0, Math.min(g.width - 1, rawEnd.x)),
      y: Math.max(0, Math.min(g.height - 1, rawEnd.y)),
    };
    const preview = paintPixelShape(
      drag.base,
      g.width,
      g.height,
      drag.kind,
      drag.start,
      end,
      drag.color,
      drag.thickness,
      drag.filled,
      drag.symmetry,
    );
    drag.changed = preview.changed;
    applyShapeTarget(drag.channel, preview.pixels);
  };

  const beginShapeDrag = (point: PixelPoint, constrained: boolean) => {
    const kind = pixelShapeKind(toolRef.current);
    if (!kind) return;
    if (shapeChannel === "color" && activeColorLayerLocked()) return;
    setPreviewPlaying(false);
    const base = shapeChannel === "glow"
      ? emissiveRef.current
      : shapeChannel === "shine"
        ? shineRef.current
        : colorTargetPixels();
    shapeDragRef.current = {
      start: point,
      snapshot: capturePaintSnapshot(),
      base: [...base],
      kind,
      channel: shapeChannel,
      color: color === "#00000000" ? "" : color,
      thickness: brushSizeRef.current,
      filled: shapeFilled && kind !== "line",
      symmetry: { ...symmetryRef.current },
      changed: false,
    };
    updateShapeDrag(point, constrained);
  };

  const finishShapeDrag = () => {
    const drag = shapeDragRef.current;
    if (!drag) return;
    shapeDragRef.current = null;
    if (!drag.changed) return;
    pushPaintSnapshot(drag.snapshot);
    commitToPack(pixelsRef.current);
  };

  const addArtLayer = () => {
    const g = geomRef.current;
    const stack = ensureArtLayerStack(
      pixelsRef.current,
      g.width,
      g.height,
      artLayersRef.current,
    );
    if (stack.length >= MAX_SPRITE_ART_LAYERS) return;
    pushHistory();
    const added = makeEmptyArtLayer(g.width, g.height, stack.length + 1);
    const next = [...stack, added];
    applyLayerStack(next, added.id);
  };

  const duplicateArtLayer = (id = activeLayerIdRef.current) => {
    const g = geomRef.current;
    const stack = ensureArtLayerStack(
      pixelsRef.current,
      g.width,
      g.height,
      artLayersRef.current,
    );
    if (stack.length >= MAX_SPRITE_ART_LAYERS) return;
    const index = Math.max(0, stack.findIndex((layer) => layer.id === id));
    const source = stack[index]!;
    const duplicate: EmberSpriteArtLayer = {
      ...source,
      id: newArtLayerId(),
      nameRu: `${source.nameRu ?? "Слой"} копия`,
      pixels: [...source.pixels],
    };
    pushHistory();
    const next = [...stack];
    next.splice(index + 1, 0, duplicate);
    applyLayerStack(next, duplicate.id);
  };

  const selectFrame = (id: string) => {
    if (id === activeFrameIdRef.current) return;
    setPreviewPlaying(false);
    syncActiveFrameFromLive();
    const frame = framesRef.current?.find((item) => item.id === id);
    if (!frame) return;
    showFrame(frame);
  };

  const addFrame = () => {
    setPreviewPlaying(false);
    const g = geomRef.current;
    syncActiveFrameFromLive();
    let timeline = framesRef.current;
    if (!timeline?.length) {
      timeline = [
        {
          id: newSpriteFrameId(),
          durationMs: DEFAULT_SPRITE_FRAME_MS,
          front: cloneCardBuf(
            frontBufRef.current ?? emptyCardBuf(g.width, g.height),
          ),
          extras: cloneExtras(extraViewsRef.current),
        },
      ];
    }
    if (timeline.length >= MAX_SPRITE_ANIM_FRAMES) return;
    pushHistory();
    const sourceIndex = Math.max(
      0,
      timeline.findIndex((frame) => frame.id === activeFrameIdRef.current),
    );
    const src = timeline[sourceIndex] ?? timeline[timeline.length - 1]!;
    const added: SpriteFrameBuf = {
      ...cloneFrameBuf(src),
      id: newSpriteFrameId(),
    };
    const next = [...timeline];
    next.splice(sourceIndex + 1, 0, added);
    framesRef.current = next;
    setFrames(next);
    showFrame(added);
    commitToPack(pixelsRef.current);
  };

  const addBlankFrame = () => {
    setPreviewPlaying(false);
    const g = geomRef.current;
    syncActiveFrameFromLive();
    let timeline = framesRef.current;
    if (!timeline?.length) {
      timeline = [
        {
          id: newSpriteFrameId(),
          durationMs: DEFAULT_SPRITE_FRAME_MS,
          front: cloneCardBuf(
            frontBufRef.current ?? emptyCardBuf(g.width, g.height),
          ),
          extras: cloneExtras(extraViewsRef.current),
        },
      ];
    }
    if (timeline.length >= MAX_SPRITE_ANIM_FRAMES) return;
    pushHistory();
    const added: SpriteFrameBuf = {
      id: newSpriteFrameId(),
      durationMs: DEFAULT_SPRITE_FRAME_MS,
      front: emptyCardBuf(g.width, g.height),
      extras: {},
    };
    const activeIndex = timeline.findIndex(
      (frame) => frame.id === activeFrameIdRef.current,
    );
    const insertAt = activeIndex >= 0 ? activeIndex + 1 : timeline.length;
    const next = [...timeline];
    next.splice(insertAt, 0, added);
    framesRef.current = next;
    setFrames(next);
    showFrame(added);
    commitToPack(pixelsRef.current);
  };

  const moveFrame = (id: string, direction: -1 | 1) => {
    setPreviewPlaying(false);
    syncActiveFrameFromLive();
    const timeline = framesRef.current;
    if (!timeline?.length) return;
    const index = timeline.findIndex((frame) => frame.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= timeline.length) return;
    pushHistory();
    const next = [...timeline];
    [next[index], next[target]] = [next[target]!, next[index]!];
    framesRef.current = next;
    setFrames(next);
    const active = next.find((frame) => frame.id === id)!;
    showFrame(active);
    commitToPack(pixelsRef.current);
  };

  const removeFrame = (id: string) => {
    let timeline = framesRef.current;
    if (!timeline?.length) return;
    setPreviewPlaying(false);
    syncActiveFrameFromLive();
    timeline = framesRef.current;
    if (!timeline?.length) return;
    pushHistory();
    if (timeline.length <= 2) {
      const keep = timeline.find((frame) => frame.id !== id) ?? timeline[0]!;
      framesRef.current = undefined;
      setFrames(undefined);
      showFrame(keep);
      activeFrameIdRef.current = undefined;
      setActiveFrameId(undefined);
      commitToPack(pixelsRef.current);
      return;
    }
    const next = timeline.filter((frame) => frame.id !== id);
    framesRef.current = next;
    setFrames(next);
    const shown =
      next.find((frame) => frame.id === activeFrameIdRef.current) ?? next[0]!;
    showFrame(shown);
    commitToPack(pixelsRef.current);
  };

  const beginFrameDuration = () => {
    if (frameDurationGestureRef.current) return;
    frameDurationGestureRef.current = {
      snapshot: capturePaintSnapshot(),
      changed: false,
    };
  };

  const previewFrameDurationMs = (id: string, raw: number) => {
    const timeline = framesRef.current;
    if (!timeline) return;
    beginFrameDuration();
    const durationMs = clampSpriteFrameDuration(raw);
    const current = timeline.find((frame) => frame.id === id);
    if (!current || current.durationMs === durationMs) return;
    frameDurationGestureRef.current!.changed = true;
    const next = timeline.map((frame) =>
      frame.id === id ? { ...frame, durationMs } : frame,
    );
    framesRef.current = next;
    setFrames(next);
  };

  const finishFrameDuration = () => {
    const gesture = frameDurationGestureRef.current;
    frameDurationGestureRef.current = null;
    if (!gesture?.changed) return;
    pushPaintSnapshot(gesture.snapshot);
    commitToPack(pixelsRef.current);
  };

  const stepFrame = (direction: -1 | 1) => {
    setPreviewPlaying(false);
    syncActiveFrameFromLive();
    const timeline = framesRef.current;
    if (!timeline?.length) return;
    const index = Math.max(
      0,
      timeline.findIndex((frame) => frame.id === activeFrameIdRef.current),
    );
    const target = Math.max(0, Math.min(timeline.length - 1, index + direction));
    if (target === index) return;
    showFrame(timeline[target]!);
  };

  const toggleFramePreview = () => {
    if (previewPlaying) {
      setPreviewPlaying(false);
      return;
    }
    syncActiveFrameFromLive();
    const timeline = framesRef.current;
    if (!timeline || timeline.length < 2) return;
    const { start, end } = normalizeSpriteFrameRange(
      timeline.length,
      previewRangeStart,
      previewRangeEnd,
    );
    const index = timeline.findIndex(
      (frame) => frame.id === activeFrameIdRef.current,
    );
    if (index < start || index > end) showFrame(timeline[start]!);
    setPreviewPlaying(true);
  };

  useEffect(() => {
    if (!previewPlaying) return;
    const timeline = framesRef.current;
    if (!timeline || timeline.length < 2) {
      setPreviewPlaying(false);
      return;
    }
    let cancelled = false;
    let timer = 0;
    const tick = () => {
      if (cancelled) return;
      const list = framesRef.current;
      if (!list || list.length < 2) {
        setPreviewPlaying(false);
        return;
      }
      const { start, end } = normalizeSpriteFrameRange(
        list.length,
        previewRangeStart,
        previewRangeEnd,
      );
      const fid = activeFrameIdRef.current;
      const found = list.findIndex((frame) => frame.id === fid);
      const i = found >= start && found <= end ? found : start;
      const cur = list[i]!;
      const nextIndex = nextSpritePreviewIndex(
        list.length,
        i,
        start,
        end,
        previewLoop,
      );
      timer = window.setTimeout(() => {
        if (cancelled) return;
        if (nextIndex < 0) {
          setPreviewPlaying(false);
          return;
        }
        showFrameRef.current(list[nextIndex]!);
        tick();
      }, cur.durationMs);
    };
    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [previewLoop, previewPlaying, previewRangeEnd, previewRangeStart]);

  const removeArtLayer = (id: string) => {
    const layers = artLayersRef.current;
    if (!layers?.length) return;
    pushHistory();
    if (layers.length <= 1) {
      applyLayers(undefined, undefined);
      commitToPack(pixelsRef.current);
      return;
    }
    const next = layers.filter((layer) => layer.id !== id);
    const removedIndex = layers.findIndex((layer) => layer.id === id);
    const nextActive = next[Math.min(Math.max(0, removedIndex - 1), next.length - 1)]?.id;
    applyLayerStack(next, nextActive);
  };

  const toggleArtLayerVisible = (id: string) => {
    const layers = artLayersRef.current;
    if (!layers?.length) return;
    pushHistory();
    const next = layers.map((layer) =>
      layer.id === id
        ? { ...layer, visible: layer.visible === false ? undefined : false }
        : layer,
    );
    applyLayerStack(next);
  };

  const updateArtLayer = (
    id: string,
    update: (layer: EmberSpriteArtLayer) => EmberSpriteArtLayer,
    history = true,
    save = true,
  ) => {
    const layers = artLayersRef.current;
    if (!layers?.some((layer) => layer.id === id)) return;
    if (history) pushHistory();
    const next = layers.map((layer) => (layer.id === id ? update(layer) : layer));
    applyLayerStack(next, activeLayerIdRef.current, save);
  };

  const renameArtLayer = (id: string, raw: string) => {
    const nameRu = raw.trim();
    const current = artLayersRef.current?.find((layer) => layer.id === id);
    if (!current || (current.nameRu ?? "Слой") === (nameRu || "Слой")) return;
    updateArtLayer(id, (layer) => ({ ...layer, nameRu: nameRu || undefined }));
  };

  const toggleArtLayerLock = (id: string, kind: "pixels" | "alpha") => {
    updateArtLayer(id, (layer) =>
      kind === "pixels"
        ? { ...layer, locked: layer.locked ? undefined : true }
        : { ...layer, alphaLocked: layer.alphaLocked ? undefined : true },
    );
  };

  const setArtLayerBlendMode = (
    id: string,
    blendMode: EmberSpriteArtLayerBlendMode,
  ) => {
    updateArtLayer(id, (layer) => ({
      ...layer,
      blendMode: blendMode === "normal" ? undefined : blendMode,
    }));
  };

  const moveArtLayer = (id: string, direction: -1 | 1) => {
    const layers = artLayersRef.current;
    if (!layers?.length) return;
    const index = layers.findIndex((layer) => layer.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= layers.length) return;
    pushHistory();
    const next = [...layers];
    [next[index], next[target]] = [next[target]!, next[index]!];
    applyLayerStack(next, id);
  };

  const beginArtLayerOpacity = () => {
    if (layerOpacityGestureRef.current) return;
    layerOpacityGestureRef.current = {
      snapshot: capturePaintSnapshot(),
      changed: false,
    };
  };

  const previewArtLayerOpacity = (id: string, percent: number) => {
    beginArtLayerOpacity();
    const opacity = Math.max(0, Math.min(100, percent)) / 100;
    const current = artLayersRef.current?.find((layer) => layer.id === id);
    if (!current || Math.abs((current.opacity ?? 1) - opacity) < 0.001) return;
    layerOpacityGestureRef.current!.changed = true;
    updateArtLayer(
      id,
      (layer) => ({ ...layer, opacity: opacity >= 0.999 ? undefined : opacity }),
      false,
      false,
    );
  };

  const finishArtLayerOpacity = () => {
    const gesture = layerOpacityGestureRef.current;
    layerOpacityGestureRef.current = null;
    if (!gesture?.changed) return;
    pushPaintSnapshot(gesture.snapshot);
    commitToPack(pixelsRef.current);
  };

  const createBlankSprite = (w: number, h: number, nameRu: string) => {
    const id = `spr_${Date.now().toString(36)}`;
    const spr = serializePixelSprite({
      id,
      nameRu,
      width: w,
      topHeight: h,
      wallHeights: [],
      pixels: emptySpritePixels(w, h),
      color: "#c45c26",
      roles: ["decor"],
    });
    onChangePack({
      ...pack,
      sprites: { ...pack.sprites, [id]: spr },
    });
    selectSprite(id);
  };

  const createSprite = () => {
    createBlankSprite(
      SPRITE_BLANK_WIDTH,
      SPRITE_BLANK_HEIGHT,
      `Спрайт ${spriteList.length + 1}`,
    );
  };

  const createDecorSprite = () => {
    createBlankSprite(
      SPRITE_DECOR_SIZE,
      SPRITE_DECOR_SIZE,
      `Декор ${spriteList.length + 1}`,
    );
  };

  const createSlasherSprite = () => {
    const id = `spr_${Date.now().toString(36)}`;
    const spr = serializePixelSprite(
      createSlasherCharacterSprite(id, "Персонаж Slasher"),
    );
    onChangePack({
      ...pack,
      sprites: { ...pack.sprites, [id]: spr },
    });
    selectSprite(id);
  };

  const importAsepriteFile = async (file: File, replace: boolean) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const replaceId = replace ? spriteId : null;
    const existing = replaceId ? packRef.current.sprites[replaceId] : undefined;
    let id = replaceId ?? spriteIdFromAsepriteName(file.name);
    if (!replaceId && packRef.current.sprites[id]) {
      id = `spr_${Date.now().toString(36)}`;
    }
    const result = await importAsepriteBytes(bytes, {
      id,
      nameRu: existing?.nameRu,
      existing,
    });
    if (!result.ok) {
      onSaved(`Aseprite: ${result.error}`);
      return;
    }
    const current = packRef.current;
    onChangePack({
      ...current,
      sprites: { ...current.sprites, [result.sprite.id]: result.sprite },
    });
    void writeEmberBytes(asepriteSourceRel(result.sprite.id), bytes);
    selectSprite(result.sprite.id);
    setEditorLoadNonce((n) => n + 1);
    const warn = result.warnings.length
      ? ` · ${result.warnings[0]}`
      : "";
    onSaved(`Aseprite → ${result.sprite.id}${warn}`);
  };

  const deleteSprite = () => {
    if (!spriteId) return;
    const sprites = { ...pack.sprites };
    delete sprites[spriteId];
    const enemies = { ...pack.enemies };
    for (const e of Object.values(enemies)) {
      if (e.spriteId === spriteId) {
        enemies[e.id] = { ...e, spriteId: undefined };
      }
    }
    onChangePack({ ...pack, sprites, enemies });
    const nextId = Object.keys(sprites)[0] ?? null;
    if (nextId) selectSprite(nextId);
    else {
      setSpriteId(null);
      setShowOpenPicker(Object.keys(sprites).length > 0);
    }
  };

  const commitSize = () => {
    if (!sprite) return;
    const w = clampSpriteDim(widthDraft, SPRITE_DIM_MIN, SPRITE_DIM_MAX, width);
    const h = clampSpriteDim(
      heightDraft,
      SPRITE_DIM_MIN,
      SPRITE_DIM_MAX,
      canvasH,
    );
    if (w === width && h === canvasH) return;
    syncActiveFrameFromLive();
    const front = frontBufRef.current;
    const timeline = framesRef.current;
    const frame0 = timeline?.[0];
    applyGeometry(
      resizeSpriteCanvas(
        {
          ...sprite,
          pixels: frame0?.front.pixels ?? front?.pixels ?? pixelsRef.current,
          emissivePixels:
            frame0?.front.emissive ?? front?.emissive ?? emissiveRef.current,
          shinePixels: frame0?.front.shine ?? front?.shine ?? shineRef.current,
          artLayers: frame0?.front.artLayers ?? front?.artLayers,
          views: packCardViews(frame0?.extras ?? extraViewsRef.current),
          frames: timeline?.map(animFrameFromBuf),
        },
        w,
        h,
      ),
    );
  };

  const replacePaletteColor = (tolerance: number) => {
    if (activeColorLayerLocked()) return;
    const g = geomRef.current;
    const replaced = replacePixelPaletteColor(
      colorTargetPixels(),
      g.width,
      g.height,
      backgroundColorRef.current,
      colorRef.current,
      tolerance,
      selectionRef.current
        ? {
            rect: selectionRef.current,
            mask: selectionMaskRef.current ?? undefined,
          }
        : undefined,
    );
    if (!replaced.changed) return;
    pushHistory();
    writeColorPixels(replaced.pixels);
  };

  const currentColorSelection = () => selectionRef.current
    ? {
        rect: selectionRef.current,
        mask: selectionMaskRef.current ?? undefined,
      }
    : undefined;

  const commitColorOperation = (result: PixelColorOperationResult) => {
    if (!result.changed || activeColorLayerLocked()) return;
    const active = activeArtLayer();
    if (active && constrainArtLayerPixels(active, result.pixels) === active.pixels) return;
    pushHistory();
    writeColorPixels(result.pixels);
  };

  const adjustActiveColors = (adjustments: PixelColorAdjustments) => {
    if (activeColorLayerLocked()) return;
    const g = geomRef.current;
    commitColorOperation(adjustPixelColors(
      colorTargetPixels(),
      g.width,
      g.height,
      adjustments,
      currentColorSelection(),
    ));
  };

  const quantizeActiveColors = (
    colors: number,
    dither: PixelColorDitherMode,
    strength: number,
  ) => {
    if (activeColorLayerLocked()) return;
    const g = geomRef.current;
    commitColorOperation(quantizePixelColors(
      colorTargetPixels(),
      g.width,
      g.height,
      colors,
      dither,
      strength,
      currentColorSelection(),
    ));
  };

  const outlineActiveColors = (thickness: number, diagonal: boolean) => {
    if (activeColorLayerLocked()) return;
    const g = geomRef.current;
    commitColorOperation(outlinePixelColors(
      colorTargetPixels(),
      g.width,
      g.height,
      colorRef.current,
      thickness,
      diagonal,
      currentColorSelection(),
    ));
  };

  const bindEnemy = () => {
    if (!spriteId || !enemyBind || !pack.enemies[enemyBind]) return;
    const e = pack.enemies[enemyBind]!;
    const enemies: Record<string, EmberEnemyDef> = {
      ...pack.enemies,
      [enemyBind]: { ...e, spriteId },
    };
    const nextRoles = roles.includes("enemy")
      ? roles
      : [...roles, "enemy" as const];
    setRoles(nextRoles);
    flushCurrentView();
    const front = frontBufRef.current;
    const live = serializePixelSprite(
      flattenSpriteForEditor({
        ...sprite!,
        pixels: [...(front?.pixels ?? pixelsRef.current)],
        emissivePixels: [...(front?.emissive ?? emissiveRef.current)],
        shinePixels: [...(front?.shine ?? shineRef.current)],
        views: packCardViews(extraViewsRef.current),
        width,
        topHeight: canvasH,
        wallHeights: [],
        roles: nextRoles,
      }),
    );
    onChangePack({
      ...pack,
      enemies,
      sprites: { ...pack.sprites, [spriteId]: live },
    });
  };

  const addAsDecorTile = () => {
    if (!sprite || !spriteId) return;
    const tilesetId = Object.keys(pack.tilesets)[0];
    if (!tilesetId) return;
    const ts = pack.tilesets[tilesetId]!;
    if (width !== ts.tileSize || canvasH !== ts.tileSize) {
      onSaved(
        `Для декора в тайлы нужен квадрат ${ts.tileSize}×${ts.tileSize} (сейчас ${width}×${canvasH})`,
      );
      return;
    }
    const maxId = Math.max(0, ...ts.tiles.map((t) => t.id));
    const id = maxId + 1;
    const topPx = pixelsRef.current.slice(0, width * canvasH);
    const nextTile = {
      id,
      name: nameRu.trim() || sprite.nameRu || `decor_${id}`,
      color: dominantColor(topPx) || sprite.color,
      pixels: [...topPx],
    };
    const nextTs: EmberTileset = {
      ...ts,
      tiles: [...ts.tiles, nextTile],
      tileCount: ts.tiles.length + 1,
    };
    onChangePack({
      ...pack,
      tilesets: { ...pack.tilesets, [tilesetId]: nextTs },
      sprites: {
        ...pack.sprites,
        [spriteId]: serializePixelSprite(
          flattenSpriteForEditor({
            ...sprite,
            pixels: pixelsRef.current,
            emissivePixels: emissiveRef.current,
            shinePixels: shineRef.current,
            width,
            topHeight: canvasH,
            wallHeights: [],
            roles: roles.includes("decor") ? roles : [...roles, "decor"],
          }),
        ),
      },
    });
    void writeEmberJson(`tilesets/${tilesetId}.json`, nextTs).then((res) => {
      onSaved(
        res.ok
          ? `Тайл #${id} добавлен в декор (${res.source})`
          : `Тайлсет: ${"error" in res ? res.error : "?"}`,
      );
    });
  };

  const save = async () => {
    const live =
      spriteId && sprite
        ? commitToPack(pixelsRef.current, {
            nameRu: nameRu.trim() || sprite.nameRu,
            roles: [...roles],
            tags: normalizeEmberLibraryTags(tagsDraft),
            solid,
            glow,
            material: material || undefined,
            emissivePixels: [...emissiveRef.current],
            shinePixels: [...shineRef.current],
          })
        : undefined;
    const spritesMap =
      live && spriteId
        ? { ...pack.sprites, [spriteId]: live }
        : pack.sprites;
    const file = {
      paletteFavorites: prunePaletteFavorites(pack.paletteFavorites ?? []),
      sprites: Object.values(spritesMap).map((s) =>
        serializePixelSprite(normalizePixelSprite(s)),
      ),
    };
    const res = await writeEmberJson("sprites/registry.json", file);
    const enemiesRes = await writeEmberJson("enemies.json", {
      enemies: Object.values(pack.enemies),
    });
    onSaved(
      res.ok
        ? `Спрайты сохранены (${res.source})${
            enemiesRes.ok ? "" : " · враги не записаны"
          }`
        : `Спрайты: ${"error" in res ? res.error : "?"}`,
    );
  };

  const toggleRole = (r: EmberSpriteRole) => {
    const next = roles.includes(r)
      ? roles.filter((x) => x !== r)
      : [...roles, r];
    setRoles(next);
    commitToPack(pixelsRef.current, { roles: next });
  };

  const spritePickerItems = useMemo(
    () =>
      spriteList
        .filter((s) =>
          libraryAssetMatchesQuery(
            { id: s.id, nameRu: s.nameRu, tags: s.tags },
            pickerQuery,
          ),
        )
        .map((s) => {
        const badges: string[] = [
          `${s.width}×${spriteTotalHeight(s)}`,
        ];
        if (s.solid) badges.push("физ");
        if (s.glow) badges.push("свет");
        return {
          id: s.id,
          label: s.nameRu ?? s.id,
          title: s.nameRu ?? s.id,
          badges,
          thumb: <EmberSpriteThumb sprite={s} size={44} />,
        };
      }),
    [spriteList, pickerQuery],
  );

  const openPickerItems = useMemo(
    () =>
      spriteList
        .filter((s) =>
          libraryAssetMatchesQuery(
            { id: s.id, nameRu: s.nameRu, tags: s.tags },
            pickerQuery,
          ),
        )
        .map((s) => {
          const badges: string[] = [
            `${s.width}×${spriteTotalHeight(s)}`,
          ];
          if (s.solid) badges.push("физ");
          if (s.glow) badges.push("свет");
          return {
            id: s.id,
            label: s.nameRu ?? s.id,
            title: s.nameRu ?? s.id,
            badges,
            thumb: <EmberSpriteThumb sprite={s} size={44} />,
          };
        }),
    [spriteList, pickerQuery],
  );

  return (
    <div className="ember-sprite-root">
      {showOpenPicker && spriteList.length > 0 ? (
        <div className="ember-ed-open-picker ember-ed-open-picker--overlay">
          <div className="ember-ed-open-picker__shell">
            <header className="ember-ed-open-picker__hero">
              <div className="ember-ed-open-picker__hero-text">
                <p className="ember-ed-open-picker__eyebrow">Спрайты</p>
                <h3 className="ember-ed-open-picker__title">Открыть спрайт</h3>
                <p className="muted ember-ed-open-picker__hint">
                  Выберите спрайт для редактирования. В следующий раз откроется
                  последний выбранный.
                </p>
              </div>
              <div className="ember-ed-open-picker__hero-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setShowOpenPicker(false)}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="primary ember-ed-open-picker__create"
                  onClick={createSprite}
                >
                  Создать 32×48
                </button>
                <button
                  type="button"
                  className="ember-ed-open-picker__create"
                  onClick={createDecorSprite}
                >
                  Декор 16×16
                </button>
                <button
                  type="button"
                  className="ember-ed-open-picker__create"
                  onClick={createSlasherSprite}
                >
                  Slasher персонаж
                </button>
                <EmberAsepriteImportButton
                  className="ember-ed-open-picker__create"
                  label="Из Aseprite"
                  title="Новый спрайт из .aseprite"
                  onFile={(file) => void importAsepriteFile(file, false)}
                />
              </div>
            </header>
            <label className="ember-ed-open-picker__search">
              <input
                type="search"
                placeholder="Поиск по имени, id или тегу…"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                autoFocus
                aria-label="Поиск спрайтов"
              />
            </label>
            <div className="ember-ed-open-picker__scroll">
              <EmberThumbGrid
                size="md"
                className="ember-ed-open-picker__thumbs"
                selectedId={null}
                onSelect={selectSprite}
                items={openPickerItems}
                empty={
                  <p className="muted ember-hint">
                    {pickerQuery.trim()
                      ? "Ничего не найдено"
                      : "Библиотека пуста — создайте спрайт"}
                  </p>
                }
              />
            </div>
          </div>
        </div>
      ) : null}
      <div className="ember-sprite-workspace">
        <aside className="ember-sprite-list">
          <div className="ember-sprite-list__head">
            <h3 className="ember-sprite-list__title">Навигатор ассетов</h3>
            <div className="ember-sprite-list__create">
              <button
                type="button"
                className="ember-chip ember-chip--sm"
                onClick={createSprite}
                title="Пустой спрайт 32×48"
              >
                +
              </button>
              <button
                type="button"
                className="ember-chip ember-chip--sm"
                onClick={createDecorSprite}
                title="Декор 16×16"
              >
                16
              </button>
              <button
                type="button"
                className="ember-chip ember-chip--sm"
                onClick={createSlasherSprite}
                title="Персонаж Dungeon Slasher 32×56"
              >
                S
              </button>
              <EmberAsepriteImportButton
                className="ember-chip ember-chip--sm"
                label="Ase"
                title="Новый спрайт из Aseprite"
                onFile={(file) => void importAsepriteFile(file, false)}
              />
            </div>
          </div>
          <label className="ember-studio-search ember-studio-search--dock">
            <span aria-hidden>⌕</span>
            <input
              type="search"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Имя, ID или тег…"
              aria-label="Фильтр спрайтов"
            />
          </label>
          <EmberThumbGrid
            size="sm"
            selectedId={spriteId}
            onSelect={selectSprite}
            items={spritePickerItems}
            empty={
              <p className="muted ember-hint">Пока пусто — нажмите +</p>
            }
          />
        </aside>

        <div className="ember-sprite-editor">
          {!sprite ? (
            <p className="muted ember-sprite-editor__empty">
              Выберите ассет слева или создайте новый.
            </p>
          ) : (
            <>
              <div className="ember-sprite-chrome">
                <span className="muted ember-sprite-chrome__dim">
                  {width}×{canvasH}
                </span>
                <div className="ember-sprite-chrome__actions">
                  <EmberAsepriteImportButton
                    className="ghost"
                    label="Aseprite"
                    title="Заменить пиксели текущего спрайта из .aseprite"
                    disabled={!sprite}
                    onFile={(file) => void importAsepriteFile(file, true)}
                  />
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void save()}
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    className="ghost ember-danger"
                    onClick={deleteSprite}
                    title="Удалить спрайт"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div
                className="ember-chip-row ember-sprite-views"
                role="tablist"
                aria-label="Вид персонажа"
              >
                {EMBER_CHARACTER_CARD_VIEWS.map((view) => (
                  <button
                    key={view}
                    type="button"
                    role="tab"
                    aria-selected={cardView === view}
                    className={`ember-chip ember-chip--sm ${cardView === view ? "is-active" : ""}`}
                    title={EMBER_CHARACTER_CARD_VIEW_LABEL_RU[view]}
                    onClick={() => switchCardView(view)}
                  >
                    {EMBER_CHARACTER_CARD_VIEW_LABEL_RU[view]}
                  </button>
                ))}
              </div>

              <div
                className="ember-sprite-toolstrip"
                role="toolbar"
                aria-label="Кисть и правки"
              >
                <div className="ember-chip-row ember-sprite-toolstrip__group">
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${tool === "select" ? "is-active" : ""}`}
                    onClick={() => setTool("select")}
                    title="Прямоугольное выделение и перемещение · M"
                  >
                    <PixelToolIcon name="marquee" /> Рамка
                  </button>
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${tool === "lasso" ? "is-active" : ""}`}
                    onClick={() => setTool("lasso")}
                    title="Свободное выделение лассо · L"
                  >
                    <PixelToolIcon name="lasso" /> Лассо
                  </button>
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${tool === "wand" ? "is-active" : ""}`}
                    onClick={() => setTool("wand")}
                    title="Выделение похожих цветов · W"
                  >
                    <PixelToolIcon name="wand" /> Палочка
                  </button>
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${tool === "line" ? "is-active" : ""}`}
                    onClick={() => setTool("line")}
                    title="Линия · U · Shift фиксирует 45°"
                  >
                    <PixelToolIcon name="line" /> Линия
                  </button>
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${tool === "rect" ? "is-active" : ""}`}
                    onClick={() => setTool("rect")}
                    title="Прямоугольник · U · Shift рисует квадрат"
                  >
                    <PixelToolIcon name="rect" /> Прямоуг.
                  </button>
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${tool === "ellipse" ? "is-active" : ""}`}
                    onClick={() => setTool("ellipse")}
                    title="Эллипс · U · Shift рисует круг"
                  >
                    <PixelToolIcon name="ellipse" /> Эллипс
                  </button>
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${tool === "fill" ? "is-active" : ""}`}
                    onClick={() => setTool("fill")}
                    title="Локальная заливка · F"
                  >
                    <PixelToolIcon name="fill" /> Заливка
                  </button>
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${tool === "paint" ? "is-active" : ""}`}
                    onClick={() => {
                      setTool("paint");
                      setShowColor(true);
                    }}
                    title="Кисть · ЛКМ"
                  >
                    <PixelToolIcon name="brush" /> Кисть
                  </button>
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${tool === "glow" ? "is-active" : ""}`}
                    onClick={() => {
                      setTool("glow");
                      setShowGlow(true);
                    }}
                    title="Светящиеся пиксели · bloom"
                  >
                    <PixelToolIcon name="glow" /> Свет
                  </button>
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${tool === "shine" ? "is-active" : ""}`}
                    onClick={() => {
                      setTool("shine");
                      setShowShine(true);
                    }}
                    title="Блеск · wet / metal · на полу в 3D даёт зеркало сцены"
                  >
                    <PixelToolIcon name="shine" /> Блеск
                  </button>
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${tool === "eyedrop" ? "is-active" : ""}`}
                    onClick={() => setTool("eyedrop")}
                    title="Пипетка · ПКМ"
                  >
                    <PixelToolIcon name="eyedropper" /> Пипетка
                  </button>
                  {ART_BRUSH_TOOLS.map((brush) => (
                    <button
                      key={brush.id}
                      type="button"
                      className={`ember-chip ember-chip--sm ${tool === brush.id ? "is-active" : ""}`}
                      onClick={() => {
                        setTool(brush.id);
                        setShowColor(true);
                      }}
                      title={brush.title}
                    >
                      {brush.label}
                    </button>
                  ))}
                </div>
                <div className="ember-chip-row ember-sprite-toolstrip__group ember-sprite-toolstrip__sizes">
                  {([1, 2, 3, 4] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`ember-chip ember-chip--sm ${brushSize === n ? "is-active" : ""}`}
                      onClick={() => {
                        setBrushSize(n);
                        if (tool === "eyedrop") setTool("paint");
                      }}
                      title={`Размер кисти ${n}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="ember-chip-row ember-sprite-toolstrip__group ember-pixel-symmetry" role="group" aria-label="Симметрия рисования">
                  <button
                    type="button"
                    className={`ghost ember-chip--sm ${symmetryHorizontal ? "is-active" : ""}`}
                    aria-pressed={symmetryHorizontal}
                    onClick={() => setSymmetryHorizontal((value) => !value)}
                    title="Зеркально рисовать слева и справа"
                  >
                    X↔
                  </button>
                  <button
                    type="button"
                    className={`ghost ember-chip--sm ${symmetryVertical ? "is-active" : ""}`}
                    aria-pressed={symmetryVertical}
                    onClick={() => setSymmetryVertical((value) => !value)}
                    title="Зеркально рисовать сверху и снизу"
                  >
                    Y↕
                  </button>
                </div>
                <div className="ember-chip-row ember-sprite-toolstrip__group">
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    disabled={historyLen === 0}
                    onClick={undo}
                    title="Undo"
                  >
                    <PixelToolIcon name="undo" /> Отмена
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    disabled={redoLen === 0}
                    onClick={redo}
                    title="Redo"
                  >
                    <PixelToolIcon name="redo" /> Повтор
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    title="Копировать холст (цвет + свет + блеск)"
                    onClick={copyCanvas}
                  >
                    <PixelToolIcon name="copy" /> Копия
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    disabled={!clipReady || activeColorLayerLocked()}
                    title="Вставить"
                    onClick={pasteCanvas}
                  >
                    <PixelToolIcon name="paste" /> Вставить
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    title="Залить весь активный слой"
                    onClick={fillCanvas}
                  >
                    <PixelToolIcon name="fill" /> Залить всё
                  </button>
                  <button
                    type="button"
                    className="ghost ember-danger ember-chip--sm"
                    disabled={activeColorLayerLocked()}
                    title="Очистить"
                    onClick={clearCanvas}
                  >
                    <PixelToolIcon name="clear" /> Очистить
                  </button>
                </div>
                <div className="ember-chip-row ember-sprite-toolstrip__group ember-pixel-selection-actions" aria-label="Трансформация выделения">
                  <button type="button" className="ghost ember-chip--sm" disabled={!selection || activeColorLayerLocked()} onClick={() => transformSelection("flip_x")} title="Отразить выделение по горизонтали"><PixelToolIcon name="flipX" /> По X</button>
                  <button type="button" className="ghost ember-chip--sm" disabled={!selection || activeColorLayerLocked()} onClick={() => transformSelection("flip_y")} title="Отразить выделение по вертикали"><PixelToolIcon name="flipY" /> По Y</button>
                  <button type="button" className="ghost ember-chip--sm" disabled={!selection || activeColorLayerLocked()} onClick={() => transformSelection("rotate_cw")} title="Повернуть выделение на 90°"><PixelToolIcon name="rotate" /> 90°</button>
                  <button type="button" className="ghost ember-chip--sm ember-danger" disabled={!selection || activeColorLayerLocked()} onClick={deleteSelection} title="Очистить выделенную область · Delete"><PixelToolIcon name="clear" /> Удалить</button>
                  <button type="button" className="ghost ember-chip--sm" disabled={!selection || activeColorLayerLocked()} onClick={cutSelection} title="Вырезать выделение · Ctrl+X"><PixelToolIcon name="cut" /> Вырезать</button>
                  <button type="button" className="ghost ember-chip--sm" disabled={!selection || activeColorLayerLocked()} onClick={duplicateSelection} title="Дублировать со сдвигом 1 px · Ctrl+J"><PixelToolIcon name="duplicate" /> Дубль</button>
                  <button type="button" className="ghost ember-chip--sm" onClick={selectAllPixels} title="Выделить всё · Ctrl+A"><PixelToolIcon name="selectAll" /> Всё</button>
                  <button type="button" className="ghost ember-chip--sm" onClick={invertSelection} title="Инвертировать выделение · Ctrl+Shift+I"><PixelToolIcon name="invert" /> Инверт.</button>
                  <button type="button" className="ghost ember-chip--sm" disabled={!selection} onClick={() => { setSelection(null); setSelectionMask(null); }} title="Снять выделение · Esc">×</button>
                </div>
                <div
                  className="ember-chip-row ember-sprite-toolstrip__group"
                  role="group"
                  aria-label="Видимость слоёв"
                >
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${showColor ? "is-active" : ""}`}
                    aria-pressed={showColor}
                    onClick={() => setShowColor((v) => !v)}
                    title="Показать цвет"
                  >
                    Цвет
                  </button>
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${showGlow ? "is-active" : ""}`}
                    aria-pressed={showGlow}
                    onClick={() => setShowGlow((v) => !v)}
                    title="Показать свечение"
                  >
                    ✦
                  </button>
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${showShine ? "is-active" : ""}`}
                    aria-pressed={showShine}
                    onClick={() => setShowShine((v) => !v)}
                    title="Показать блеск"
                  >
                    ✧
                  </button>
                </div>
                <div
                  className="ember-sprite-zoom ember-sprite-toolstrip__group"
                  role="group"
                  aria-label="Навигация холста"
                >
                  <button
                    type="button"
                    className={`ghost ember-chip--sm ${canvasNavigation.handMode ? "is-active" : ""}`}
                    aria-pressed={canvasNavigation.handMode}
                    onClick={() => canvasNavigation.setHandMode((value) => !value)}
                    title="Рука · удерживать Space или среднюю кнопку мыши"
                  >
                    <PixelToolIcon name="hand" /> Рука
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    onClick={canvasNavigation.zoomOut}
                    title="Отдалить"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    onClick={canvasNavigation.fit}
                    title="Вписать в окно · Ctrl+0"
                  >
                    <PixelToolIcon name="fit" /> Вписать
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    onClick={canvasNavigation.zoom100}
                    title="Масштаб 100% · Ctrl+1"
                  >
                    100%
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    onClick={canvasNavigation.zoomIn}
                    title="Приблизить"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className={`ghost ember-chip--sm ${canvasNavigation.navigatorVisible ? "is-active" : ""}`}
                    aria-pressed={canvasNavigation.navigatorVisible}
                    onClick={() => canvasNavigation.setNavigatorVisible((value) => !value)}
                    title="Показать или скрыть навигатор"
                  >
                    <PixelToolIcon name="navigator" /> Навигатор
                  </button>
                  <span className="muted ember-sprite-zoom__label">
                    {canvasNavigation.zoomPercent}%
                  </span>
                </div>
                {tool === "wand" ? (
                  <div className="ember-wand-options ember-sprite-toolstrip__group" role="group" aria-label="Параметры волшебной палочки">
                    <div className="ember-wand-options__modes" role="group" aria-label="Режим объединения выделения">
                      {([
                        ["replace", "Новое", "Заменить текущее выделение"],
                        ["add", "+", "Добавить к выделению"],
                        ["subtract", "−", "Вычесть из выделения"],
                        ["intersect", "∩", "Пересечь с выделением"],
                      ] as const).map(([mode, label, title]) => (
                        <button
                          key={mode}
                          type="button"
                          className={`ghost ember-chip--sm ${wandCombineMode === mode ? "is-active" : ""}`}
                          aria-pressed={wandCombineMode === mode}
                          title={title}
                          onClick={() => setWandCombineMode(mode)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="ember-wand-options__tolerance">
                      <span>Допуск</span>
                      <input
                        type="range"
                        min={0}
                        max={255}
                        step={1}
                        value={wandTolerance}
                        onChange={(event) => setWandTolerance(Number(event.target.value))}
                      />
                      <output>{wandTolerance}</output>
                    </label>
                    <label className="ember-wand-options__check" title="Выбирать только связанную область">
                      <input
                        type="checkbox"
                        checked={wandContiguous}
                        onChange={(event) => setWandContiguous(event.target.checked)}
                      />
                      Смежные
                    </label>
                    <span className="muted">Shift добавить · Alt вычесть · Shift+Alt пересечь</span>
                  </div>
                ) : null}
                {pixelShapeKind(tool) ? (
                  <div className="ember-shape-options ember-sprite-toolstrip__group" role="group" aria-label="Параметры геометрической фигуры">
                    <div className="ember-shape-options__channels" role="group" aria-label="Канал рисования">
                      {([[
                        "color",
                        "Цвет",
                      ], [
                        "glow",
                        "Свечение",
                      ], [
                        "shine",
                        "Блеск",
                      ]] as const).map(([channel, label]) => (
                        <button
                          key={channel}
                          type="button"
                          className={`ghost ember-chip--sm ${shapeChannel === channel ? "is-active" : ""}`}
                          aria-pressed={shapeChannel === channel}
                          onClick={() => setShapeChannel(channel)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="ember-shape-options__check" title="Заполнить фигуру текущим цветом">
                      <input
                        type="checkbox"
                        checked={shapeFilled}
                        disabled={tool === "line"}
                        onChange={(event) => setShapeFilled(event.target.checked)}
                      />
                      Заливка
                    </label>
                    <span className="muted">Толщина: {brushSize}px · Shift: 45° / квадрат / круг</span>
                  </div>
                ) : null}
                {tool === "fill" ? (
                  <div className="ember-fill-options ember-sprite-toolstrip__group" role="group" aria-label="Параметры заливки">
                    <div className="ember-shape-options__channels" role="group" aria-label="Канал заливки">
                      {([[
                        "color",
                        "Цвет",
                      ], [
                        "glow",
                        "Свечение",
                      ], [
                        "shine",
                        "Блеск",
                      ]] as const).map(([channel, label]) => (
                        <button
                          key={channel}
                          type="button"
                          className={`ghost ember-chip--sm ${shapeChannel === channel ? "is-active" : ""}`}
                          aria-pressed={shapeChannel === channel}
                          onClick={() => setShapeChannel(channel)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="ember-wand-options__tolerance">
                      <span>Допуск</span>
                      <input
                        type="range"
                        min={0}
                        max={255}
                        step={1}
                        value={fillTolerance}
                        onChange={(event) => setFillTolerance(Number(event.target.value))}
                      />
                      <output>{fillTolerance}</output>
                    </label>
                    <label className="ember-wand-options__check" title="Заливать только связанную область">
                      <input
                        type="checkbox"
                        checked={fillContiguous}
                        onChange={(event) => setFillContiguous(event.target.checked)}
                      />
                      Смежные
                    </label>
                    <span className="muted">X↔ / Y↕ отражают точку заливки</span>
                  </div>
                ) : null}
                {tool === "paint" || tool === "glow" || tool === "shine" ? (
                  <div className="ember-brush-options ember-sprite-toolstrip__group" role="group" aria-label="Параметры кисти">
                    <div className="ember-brush-options__presets" role="group" aria-label="Пресеты кисти">
                      <button type="button" className="ghost ember-chip--sm" onClick={() => { setBrushSize(1); setBrushOpacity(100); setBrushDither(100); setBrushSpacing(1); setBrushPixelPerfect(true); }}>Пиксель</button>
                      <button type="button" className="ghost ember-chip--sm" onClick={() => { setBrushSize(2); setBrushOpacity(35); setBrushDither(100); setBrushSpacing(1); setBrushPixelPerfect(false); }}>Мягкая</button>
                      <button type="button" className="ghost ember-chip--sm" onClick={() => { setBrushSize(1); setBrushOpacity(100); setBrushDither(50); setBrushSpacing(1); setBrushPixelPerfect(true); }}>Дизер</button>
                      <button type="button" className="ghost ember-chip--sm" onClick={() => { setBrushSize(2); setBrushOpacity(100); setBrushDither(100); setBrushSpacing(4); setBrushPixelPerfect(false); }}>Штамп</button>
                    </div>
                    <label className="ember-brush-options__range">
                      <span>Непрозр.</span>
                      <input type="range" min={10} max={100} step={5} value={brushOpacity} onChange={(event) => setBrushOpacity(Number(event.target.value))} />
                      <output>{brushOpacity}%</output>
                    </label>
                    <label className="ember-brush-options__select">
                      <span>Дизер</span>
                      <select value={brushDither} onChange={(event) => setBrushDither(Number(event.target.value) as PixelDitherCoverage)}>
                        <option value={100}>off</option>
                        <option value={75}>75%</option>
                        <option value={50}>50%</option>
                        <option value={25}>25%</option>
                      </select>
                    </label>
                    <label className="ember-brush-options__range">
                      <span>Интервал</span>
                      <input type="range" min={1} max={8} step={1} value={brushSpacing} onChange={(event) => setBrushSpacing(Number(event.target.value))} />
                      <output>{brushSpacing}px</output>
                    </label>
                    <label className="ember-brush-options__check" title="Убирать лишний угловой пиксель у кисти 1 px">
                      <input type="checkbox" checked={brushPixelPerfect} onChange={(event) => setBrushPixelPerfect(event.target.checked)} />
                      Чистый пиксель
                    </label>
                  </div>
                ) : null}
              </div>

              <div className="ember-sprite-body">
              <aside className="ember-sprite-inspector" aria-label="Свойства спрайта">
                <label className="ember-sprite-inspector__field">
                  <span className="muted">Имя</span>
                  <input
                    value={nameRu}
                    onChange={(e) => setNameRu(e.target.value)}
                    onBlur={() => commitToPack(pixelsRef.current)}
                  />
                </label>
                <div className="ember-sprite-inspector__row">
                  <label className="ember-sprite-inspector__num">
                    <span className="muted">W</span>
                    <input
                      type="number"
                      min={SPRITE_DIM_MIN}
                      max={SPRITE_DIM_MAX}
                      value={widthDraft}
                      onChange={(e) =>
                        setWidthDraft(Number(e.target.value) || 0)
                      }
                      onBlur={commitSize}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitSize();
                      }}
                      title="Ширина"
                    />
                  </label>
                  <label className="ember-sprite-inspector__num">
                    <span className="muted">H</span>
                    <input
                      type="number"
                      min={SPRITE_DIM_MIN}
                      max={SPRITE_DIM_MAX}
                      value={heightDraft}
                      onChange={(e) =>
                        setHeightDraft(Number(e.target.value) || 0)
                      }
                      onBlur={commitSize}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitSize();
                      }}
                      title="Высота холста"
                    />
                  </label>
                  <span className="muted">{width}×{canvasH}</span>
                </div>
                <p className="muted ember-sprite-inspector__label">
                  Позиция в мире · воксели
                </p>
                <div
                  className="ember-sprite-inspector__row ember-sprite-inspector__world-offset"
                  title="Визуальный сдвиг относительно клетки. X/Y — плоскость карты, Z — вверх; коллизия остаётся на клетке."
                >
                  {(["x", "y", "z"] as const).map((axis) => (
                    <label key={axis} className="ember-sprite-inspector__num">
                      <span className="muted">{axis.toUpperCase()}</span>
                      <input
                        type="number"
                        min={-128}
                        max={128}
                        step={0.25}
                        value={worldOffsetVoxels[axis]}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          setWorldOffsetVoxels((current) => ({
                            ...current,
                            [axis]: Number.isFinite(value) ? value : 0,
                          }));
                        }}
                        onBlur={() => commitToPack(pixelsRef.current)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                        aria-label={`Сдвиг ${axis.toUpperCase()} в мире`}
                      />
                    </label>
                  ))}
                </div>
                <p className="muted ember-sprite-inspector__hint">
                  X/Y — по карте · Z — вверх · 16 вокселей = 1 клетка
                </p>
                <label className="ember-sprite-inspector__field">
                  <span className="muted">Теги</span>
                  <input
                    value={tagsDraft}
                    placeholder="character, slasher"
                    onChange={(e) => setTagsDraft(e.target.value)}
                    onBlur={() => {
                      const tags = normalizeEmberLibraryTags(tagsDraft);
                      setTagsDraft(formatEmberLibraryTags(tags));
                      commitToPack(pixelsRef.current, { tags });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                </label>
                <p className="muted ember-sprite-inspector__label">Роли</p>
                <div className="ember-sprite-inspector__roles">
                  {ROLES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={`ember-chip ember-chip--sm ${roles.includes(r.id) ? "is-active" : ""}`}
                      onClick={() => toggleRole(r.id)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <div className="ember-sprite-inspector__flags">
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${solid ? "is-active" : ""}`}
                    onClick={toggleSolid}
                    title="Коллизия на карте"
                  >
                    Физ
                  </button>
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${glow ? "is-active" : ""}`}
                    onClick={toggleGlow}
                    title="Источник фонаря (flood), не путать с кистью ✦"
                  >
                      Фонарь
                    </button>
                </div>
                <p className="muted ember-sprite-inspector__label">Слои</p>
                <div className="ember-sprite-layers">
                  <div className="ember-sprite-layers__toolbar" role="toolbar" aria-label="Операции со слоями">
                    <button
                      type="button"
                      className="ghost ember-chip--sm"
                      disabled={(artLayers?.length ?? 1) >= MAX_SPRITE_ART_LAYERS}
                      onClick={addArtLayer}
                      title="Новый пустой слой"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="ghost ember-chip--sm"
                      disabled={(artLayers?.length ?? 1) >= MAX_SPRITE_ART_LAYERS}
                      onClick={() => duplicateArtLayer()}
                      title="Дублировать активный слой"
                    >
                      ⧉
                    </button>
                    <button
                      type="button"
                      className="ghost ember-chip--sm"
                      disabled={!selectedArtLayer || artLayers?.at(-1)?.id === selectedArtLayer.id}
                      onClick={() => selectedArtLayer && moveArtLayer(selectedArtLayer.id, 1)}
                      title="Поднять слой"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="ghost ember-chip--sm"
                      disabled={!selectedArtLayer || artLayers?.[0]?.id === selectedArtLayer.id}
                      onClick={() => selectedArtLayer && moveArtLayer(selectedArtLayer.id, -1)}
                      title="Опустить слой"
                    >
                      ↓
                    </button>
                    <span className="ember-sprite-layers__toolbar-spacer" />
                    <button
                      type="button"
                      className="ghost ember-chip--sm ember-danger"
                      disabled={!selectedArtLayer}
                      onClick={() => selectedArtLayer && removeArtLayer(selectedArtLayer.id)}
                      title="Удалить активный слой"
                    >
                      ×
                    </button>
                  </div>
                  {selectedArtLayer ? (
                    <div className="ember-sprite-layers__controls">
                      <label title="Режим наложения активного слоя">
                        <span>Режим</span>
                        <select
                          value={selectedArtLayer.blendMode ?? "normal"}
                          onChange={(event) =>
                            setArtLayerBlendMode(
                              selectedArtLayer.id,
                              event.target.value as EmberSpriteArtLayerBlendMode,
                            )
                          }
                        >
                          {SPRITE_ART_LAYER_BLEND_MODES.map((mode) => (
                            <option key={mode} value={mode}>
                              {mode === "normal"
                                ? "Обычный"
                                : mode === "multiply"
                                  ? "Умножение"
                                  : mode === "screen"
                                    ? "Экран"
                                    : "Добавление"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="ember-sprite-layers__opacity" title="Непрозрачность активного слоя">
                        <span>Непр.</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round((selectedArtLayer.opacity ?? 1) * 100)}
                          onFocus={beginArtLayerOpacity}
                          onPointerDown={beginArtLayerOpacity}
                          onChange={(event) =>
                            previewArtLayerOpacity(selectedArtLayer.id, Number(event.target.value))
                          }
                          onPointerUp={finishArtLayerOpacity}
                          onPointerCancel={finishArtLayerOpacity}
                          onBlur={finishArtLayerOpacity}
                        />
                        <output>{Math.round((selectedArtLayer.opacity ?? 1) * 100)}%</output>
                      </label>
                    </div>
                  ) : null}
                  {(artLayers?.length
                    ? [...artLayers].reverse()
                    : [
                        {
                          id: "flat",
                          nameRu: "Слой 1",
                          visible: true as boolean | undefined,
                          opacity: undefined,
                          blendMode: undefined,
                          locked: undefined,
                          alphaLocked: undefined,
                        },
                      ]
                  ).map((layer) => {
                    const isFlat = !artLayers?.length;
                    const active = isFlat || layer.id === activeLayerId;
                    const hidden = layer.visible === false;
                    return (
                      <div
                        key={layer.id}
                        className={`ember-sprite-layers__row ${active ? "is-active" : ""}`}
                      >
                        <button
                          type="button"
                          className="ghost ember-chip--sm"
                          title={hidden ? "Показать" : "Скрыть"}
                          disabled={isFlat}
                          onClick={() => toggleArtLayerVisible(layer.id)}
                        >
                          {hidden ? "○" : "●"}
                        </button>
                        <input
                          key={`${layer.id}:${layer.nameRu ?? "Слой"}`}
                          className={`ember-sprite-layers__name ${active ? "is-active" : ""}`}
                          defaultValue={layer.nameRu ?? "Слой"}
                          readOnly={isFlat}
                          aria-label="Название слоя"
                          onFocus={() => {
                            if (isFlat) return;
                            setActiveLayerId(layer.id);
                            activeLayerIdRef.current = layer.id;
                          }}
                          onBlur={(event) => {
                            if (!isFlat) renameArtLayer(layer.id, event.target.value);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                            if (event.key === "Escape") {
                              event.currentTarget.value = layer.nameRu ?? "Слой";
                              event.currentTarget.blur();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className={`ghost ember-chip--sm ${layer.alphaLocked ? "is-active" : ""}`}
                          title={layer.alphaLocked ? "Разблокировать прозрачность" : "Зафиксировать прозрачность"}
                          disabled={isFlat}
                          onClick={() => toggleArtLayerLock(layer.id, "alpha")}
                        >
                          α
                        </button>
                        <button
                          type="button"
                          className={`ghost ember-chip--sm ${layer.locked ? "is-active" : ""}`}
                          title={layer.locked ? "Разблокировать пиксели" : "Заблокировать пиксели"}
                          disabled={isFlat}
                          onClick={() => toggleArtLayerLock(layer.id, "pixels")}
                        >
                          {layer.locked ? "▣" : "□"}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="muted ember-sprite-inspector__label">Кадры</p>
                <div className="ember-sprite-frames">
                  <div className="ember-sprite-frames__toolbar" role="toolbar" aria-label="Операции с кадрами">
                    <button
                      type="button"
                      className="ghost ember-chip--sm"
                      disabled={(frames?.length ?? 1) >= MAX_SPRITE_ANIM_FRAMES}
                      onClick={addBlankFrame}
                      title="Новый пустой кадр после активного"
                      aria-label="Новый пустой кадр"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="ghost ember-chip--sm"
                      disabled={(frames?.length ?? 1) >= MAX_SPRITE_ANIM_FRAMES}
                      onClick={addFrame}
                      title="Дублировать активный кадр"
                      aria-label="Дублировать кадр"
                    >
                      ⧉
                    </button>
                    <button
                      type="button"
                      className="ghost ember-chip--sm"
                      disabled={!selectedFrame || selectedFrameIndex <= 0}
                      onClick={() => selectedFrame && moveFrame(selectedFrame.id, -1)}
                      title="Сдвинуть кадр влево"
                      aria-label="Сдвинуть кадр влево"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="ghost ember-chip--sm"
                      disabled={!selectedFrame || selectedFrameIndex >= (frames?.length ?? 0) - 1}
                      onClick={() => selectedFrame && moveFrame(selectedFrame.id, 1)}
                      title="Сдвинуть кадр вправо"
                      aria-label="Сдвинуть кадр вправо"
                    >
                      →
                    </button>
                    <span className="ember-sprite-frames__toolbar-spacer" />
                    <button
                      type="button"
                      className="ghost ember-chip--sm ember-danger"
                      disabled={!selectedFrame}
                      onClick={() => selectedFrame && removeFrame(selectedFrame.id)}
                      title="Удалить активный кадр"
                      aria-label="Удалить кадр"
                    >
                      ×
                    </button>
                  </div>
                  <div className="ember-sprite-frames__playback" role="toolbar" aria-label="Предпросмотр кадров">
                    <button
                      type="button"
                      className="ghost ember-chip--sm"
                      disabled={(frames?.length ?? 0) < 2 || selectedFrameIndex <= 0}
                      onClick={() => stepFrame(-1)}
                      title="Предыдущий кадр"
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      className={`ember-chip ember-chip--sm ${previewPlaying ? "is-active" : ""}`}
                      disabled={(frames?.length ?? 0) < 2}
                      onClick={toggleFramePreview}
                      title="Проиграть выбранный диапазон"
                    >
                      {previewPlaying ? "■" : "▶"}
                    </button>
                    <button
                      type="button"
                      className="ghost ember-chip--sm"
                      disabled={(frames?.length ?? 0) < 2 || selectedFrameIndex >= (frames?.length ?? 0) - 1}
                      onClick={() => stepFrame(1)}
                      title="Следующий кадр"
                    >
                      ▶|
                    </button>
                    <button
                      type="button"
                      className={`ghost ember-chip--sm ${previewLoop ? "is-active" : ""}`}
                      aria-pressed={previewLoop}
                      onClick={() => setPreviewLoop((value) => !value)}
                      title="Зациклить предпросмотр"
                    >
                      ↻
                    </button>
                    <button
                      type="button"
                      className={`ghost ember-chip--sm ${onionSkin ? "is-active" : ""}`}
                      disabled={(frames?.length ?? 0) < 2}
                      aria-pressed={onionSkin}
                      onClick={() => setOnionSkin((value) => !value)}
                      title="Onion skin: предыдущий кадр красным, следующий зелёным"
                    >
                      ◉
                    </button>
                  </div>
                  {(frames?.length ?? 0) >= 2 ? (
                    <div className="ember-sprite-frames__range">
                      <label title="Первый кадр предпросмотра">
                        <span>От</span>
                        <select
                          value={Math.min(previewRangeStart, frames!.length - 1)}
                          disabled={previewPlaying}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            setPreviewRangeStart(value);
                            setPreviewRangeEnd((end) => Math.max(end, value));
                          }}
                        >
                          {frames!.map((frame, index) => (
                            <option key={frame.id} value={index}>{index + 1}</option>
                          ))}
                        </select>
                      </label>
                      <label title="Последний кадр предпросмотра">
                        <span>До</span>
                        <select
                          value={Math.max(
                            Math.min(previewRangeStart, frames!.length - 1),
                            Math.min(previewRangeEnd, frames!.length - 1),
                          )}
                          disabled={previewPlaying}
                          onChange={(event) => setPreviewRangeEnd(Number(event.target.value))}
                        >
                          {frames!.map((frame, index) => (
                            <option
                              key={frame.id}
                              value={index}
                              disabled={index < Math.min(previewRangeStart, frames!.length - 1)}
                            >
                              {index + 1}
                            </option>
                          ))}
                        </select>
                      </label>
                      <span className="muted">
                        {(frames!.reduce((sum, frame, index) =>
                          index >= Math.min(previewRangeStart, frames!.length - 1) &&
                          index <= Math.min(previewRangeEnd, frames!.length - 1)
                            ? sum + frame.durationMs
                            : sum, 0) / 1000).toFixed(2)} с
                      </span>
                    </div>
                  ) : (
                    <p className="muted ember-sprite-frames__empty">
                      Статичный кадр · + создаёт пустой, ⧉ дублирует текущий
                    </p>
                  )}
                  {onionSkin && (frames?.length ?? 0) >= 2 ? (
                    <label className="ember-sprite-frames__onion-opacity" title="Прозрачность соседних кадров">
                      <span>Onion</span>
                      <input
                        type="range"
                        min={10}
                        max={60}
                        step={2}
                        value={onionSkinOpacity}
                        onChange={(event) => setOnionSkinOpacity(Number(event.target.value))}
                      />
                      <output>{onionSkinOpacity}%</output>
                    </label>
                  ) : null}
                  <div className="ember-sprite-frames__list">
                  {(frames ?? []).map((frame, index) => {
                    const active = frame.id === activeFrameId;
                    const framePixels = cardView === "front"
                      ? frame.front.pixels
                      : frame.extras[cardView]?.pixels;
                    return (
                      <div
                        key={frame.id}
                        className={`ember-sprite-frames__row ${active ? "is-active" : ""}`}
                      >
                        <button
                          type="button"
                          className={`ember-sprite-frames__name ${active ? "is-active" : ""}`}
                          onClick={() => selectFrame(frame.id)}
                          title={`Кадр ${index + 1}`}
                        >
                          <SpriteFrameThumb pixels={framePixels} width={width} height={canvasH} />
                          <span>{index + 1}</span>
                        </button>
                        <input
                          className="ember-sprite-frames__ms"
                          type="number"
                          min={MIN_SPRITE_FRAME_MS}
                          max={MAX_SPRITE_FRAME_MS}
                          step={10}
                          value={frame.durationMs}
                          title="Длительность кадра, мс"
                          aria-label={`Длительность кадра ${index + 1}`}
                          onFocus={beginFrameDuration}
                          onChange={(e) =>
                            previewFrameDurationMs(frame.id, Number(e.target.value))
                          }
                          onBlur={finishFrameDuration}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                          }}
                        />
                      </div>
                    );
                  })}
                  </div>
                </div>
                <label
                  className="ember-sprite-inspector__field"
                  title="Материал (на lit-спрайтах / будущий свет)"
                >
                  <span className="muted">Материал</span>
                  <select
                    className="ember-sprite-inspector__select"
                    value={material}
                    onChange={(e) => {
                      const v = e.target.value as EmberMaterialKind | "";
                      setMaterial(v);
                      commitToPack(pixelsRef.current, {
                        material: v || undefined,
                      });
                    }}
                  >
                    <option value="">Нет</option>
                    {EMBER_MATERIAL_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {EMBER_MATERIAL_LABELS_RU[kind]}
                      </option>
                    ))}
                  </select>
                </label>
                  {tool === "glow" ||
                  emissivePixels.some((c) => c && c !== "#00000000") ? (
                    <div className="ember-chip-row ember-sprite-inspector__emissive">
                      <label
                        className="ember-chip ember-chip--sm ember-sprite-emissive-anim"
                        title="Режим свечения"
                      >
                        <select
                          value={emissiveAnim}
                          onChange={(e) => {
                            const v = e.target.value as EmberEmissiveAnim;
                            setEmissiveAnim(v);
                            let period = emissiveAnimPeriod;
                            let periodMin = emissiveAnimPeriodMin;
                            let periodMax = emissiveAnimPeriodMax;
                            if (v === "pulse") {
                              period = resolveEmissiveAnimPeriod(
                                period,
                                "pulse",
                              );
                              setEmissiveAnimPeriod(period);
                            } else if (v === "flicker") {
                              if (periodMax < 1.5) {
                                periodMin = DEFAULT_EMISSIVE_FLICKER_PERIOD_MIN;
                                periodMax = DEFAULT_EMISSIVE_FLICKER_PERIOD_MAX;
                              }
                              const range = resolveEmissiveFlickerPeriodRange(
                                periodMin,
                                periodMax,
                              );
                              periodMin = range.min;
                              periodMax = range.max;
                              setEmissiveAnimPeriodMin(periodMin);
                              setEmissiveAnimPeriodMax(periodMax);
                            }
                            commitToPack(pixelsRef.current, {
                              emissiveAnim: v,
                              emissiveAnimPeriod:
                                v === "pulse" ? period : undefined,
                              emissiveAnimPeriodMin:
                                v === "flicker" ? periodMin : undefined,
                              emissiveAnimPeriodMax:
                                v === "flicker" ? periodMax : undefined,
                            });
                          }}
                        >
                          {EMISSIVE_ANIM_OPTS.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label
                        className="muted"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          fontSize: "0.68rem",
                        }}
                        title="Сила свечения"
                      >
                        сила
                        <input
                          type="range"
                          min={0.15}
                          max={1}
                          step={0.05}
                          value={emissiveStrength}
                          onChange={(e) =>
                            setEmissiveStrength(Number(e.target.value))
                          }
                          onPointerUp={() =>
                            commitToPack(pixelsRef.current, {
                              emissiveStrength,
                            })
                          }
                          style={{ width: "4rem" }}
                        />
                      </label>
                      <label
                        className="muted"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          fontSize: "0.68rem",
                        }}
                        title="Цвет ореола (bloom). Выкл = как цвет пикселей"
                      >
                        <input
                          type="checkbox"
                          checked={emissiveBloomCustom}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setEmissiveBloomCustom(on);
                            commitToPack(pixelsRef.current, {
                              emissiveBloomColor: on
                                ? normalizeEmissiveBloomColor(
                                    emissiveBloomColor,
                                  )
                                : undefined,
                            });
                          }}
                        />
                        ореол
                        <input
                          type="color"
                          disabled={!emissiveBloomCustom}
                          value={emissiveBloomColor}
                          onChange={(e) =>
                            setEmissiveBloomColor(e.target.value)
                          }
                          onPointerUp={() =>
                            commitToPack(pixelsRef.current, {
                              emissiveBloomColor: emissiveBloomCustom
                                ? normalizeEmissiveBloomColor(
                                    emissiveBloomColor,
                                  )
                                : undefined,
                            })
                          }
                          style={{
                            width: "1.6rem",
                            height: "1.2rem",
                            padding: 0,
                            border: "none",
                            opacity: emissiveBloomCustom ? 1 : 0.35,
                          }}
                          />
                      </label>
                      <label
                        className="muted"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          fontSize: "0.68rem",
                        }}
                        title="Светящиеся пиксели дают слабый локальный свет (~0.5–1 тайл)"
                      >
                        <input
                          type="checkbox"
                          checked={emissiveCastsLight}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setEmissiveCastsLight(on);
                            if (!on) setEmissiveLightShadows(false);
                            commitToPack(pixelsRef.current, {
                              emissiveCastsLight: on ? true : undefined,
                              emissiveLightRange: on
                                ? resolveEmissiveLightRange(emissiveLightRange)
                                : undefined,
                              emissiveLightShadows:
                                on && emissiveLightShadows ? true : undefined,
                            });
                          }}
                        />
                        свет
                        <input
                          type="range"
                          min={MIN_EMISSIVE_LIGHT_RANGE}
                          max={MAX_EMISSIVE_LIGHT_RANGE}
                          step={0.05}
                          disabled={!emissiveCastsLight}
                          value={emissiveLightRange}
                          onChange={(e) =>
                            setEmissiveLightRange(Number(e.target.value))
                          }
                          onPointerUp={() =>
                            commitToPack(pixelsRef.current, {
                              emissiveCastsLight: true,
                              emissiveLightRange:
                                resolveEmissiveLightRange(emissiveLightRange),
                            })
                          }
                          style={{
                            width: "3.5rem",
                            opacity: emissiveCastsLight ? 1 : 0.35,
                          }}
                        />
                        <span style={{ opacity: emissiveCastsLight ? 1 : 0.35 }}>
                          {emissiveLightRange.toFixed(2)}
                        </span>
                        <input
                          type="checkbox"
                          disabled={!emissiveCastsLight}
                          checked={emissiveLightShadows}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setEmissiveLightShadows(on);
                            commitToPack(pixelsRef.current, {
                              emissiveCastsLight: true,
                              emissiveLightShadows: on ? true : undefined,
                            });
                          }}
                          title="Локальный свет отбрасывает тени"
                          style={{ opacity: emissiveCastsLight ? 1 : 0.35 }}
                        />
                        <span style={{ opacity: emissiveCastsLight ? 1 : 0.35 }}>
                          тени
                        </span>
                      </label>
                      {emissiveAnim === "pulse" ? (
                        <label
                          className="muted"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            fontSize: "0.68rem",
                          }}
                          title="Период пульса, секунды"
                        >
                          сек
                          <input
                            type="range"
                            min={0.15}
                            max={MAX_EMISSIVE_ANIM_PERIOD}
                            step={0.05}
                            value={emissiveAnimPeriod}
                            onChange={(e) =>
                              setEmissiveAnimPeriod(Number(e.target.value))
                            }
                            onPointerUp={() =>
                              commitToPack(pixelsRef.current, {
                                emissiveAnimPeriod,
                              })
                            }
                            style={{ width: "4.5rem" }}
                          />
                          <em>{emissiveAnimPeriod.toFixed(2)}</em>
                        </label>
                      ) : null}
                      {emissiveAnim === "flicker" ? (
                        <>
                          <label
                            className="muted"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              fontSize: "0.68rem",
                            }}
                            title="Мин. пауза в темноте между вспышками (до 2 мин)"
                          >
                            от
                            <input
                              type="range"
                              min={0.08}
                              max={MAX_EMISSIVE_FLICKER_WAIT_MIN}
                              step={0.5}
                              value={emissiveAnimPeriodMin}
                              onChange={(e) =>
                                setEmissiveAnimPeriodMin(
                                  Number(e.target.value),
                                )
                              }
                              onPointerUp={() =>
                                commitToPack(pixelsRef.current, {
                                  emissiveAnimPeriodMin,
                                  emissiveAnimPeriodMax,
                                })
                              }
                              style={{ width: "3.5rem" }}
                            />
                            <em>{formatFlickerWait(emissiveAnimPeriodMin)}</em>
                          </label>
                          <label
                            className="muted"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              fontSize: "0.68rem",
                            }}
                            title="Макс. пауза в темноте между вспышками (до 3 мин)"
                          >
                            до
                            <input
                              type="range"
                              min={0.08}
                              max={MAX_EMISSIVE_FLICKER_WAIT_MAX}
                              step={0.5}
                              value={emissiveAnimPeriodMax}
                              onChange={(e) =>
                                setEmissiveAnimPeriodMax(
                                  Number(e.target.value),
                                )
                              }
                              onPointerUp={() =>
                                commitToPack(pixelsRef.current, {
                                  emissiveAnimPeriodMin,
                                  emissiveAnimPeriodMax,
                                })
                              }
                              style={{ width: "3.5rem" }}
                            />
                            <em>{formatFlickerWait(emissiveAnimPeriodMax)}</em>
                          </label>
                        </>
                      ) : null}
                      {emissiveAnim === "trigger" ? (
                        <>
                          <label
                            className="ember-chip ember-chip--sm ember-sprite-emissive-anim"
                            title="Условие триггера"
                          >
                            <select
                              value={emissiveTriggerWhen}
                              onChange={(e) => {
                                const v = e.target
                                  .value as EmberEmissiveTriggerWhen;
                                setEmissiveTriggerWhen(v);
                                commitToPack(pixelsRef.current, {
                                  emissiveTriggerWhen: v,
                                });
                              }}
                            >
                              {EMISSIVE_TRIGGER_WHEN_OPTS.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          {emissiveTriggerWhen !== "event" ? (
                            <label
                              className="muted"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.25rem",
                                fontSize: "0.68rem",
                              }}
                              title="Радиус в тайлах"
                            >
                              R
                              <input
                                type="range"
                                min={1}
                                max={12}
                                step={1}
                                value={emissiveTriggerRadius}
                                onChange={(e) =>
                                  setEmissiveTriggerRadius(
                                    Number(e.target.value),
                                  )
                                }
                                onPointerUp={() =>
                                  commitToPack(pixelsRef.current, {
                                    emissiveTriggerRadius,
                                  })
                                }
                                style={{ width: "3.5rem" }}
                              />
                              <em>{emissiveTriggerRadius}</em>
                            </label>
                          ) : (
                            <label
                              className="ember-chip ember-chip--sm ember-sprite-emissive-anim"
                              title="Ивент, активирующий свечение"
                            >
                              <select
                                value={emissiveTriggerEventId}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setEmissiveTriggerEventId(v);
                                  commitToPack(pixelsRef.current, {
                                    emissiveTriggerEventId: v || undefined,
                                  });
                                }}
                              >
                                <option value="">Ивент…</option>
                                {Object.values(pack.events).map((ev) => (
                                  <option key={ev.id} value={ev.id}>
                                    {ev.nameRu || ev.id}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </>
                      ) : null}
                    </div>
                  ) : null}
              </aside>

              <div className="ember-sprite-draw">
              <div className="ember-sprite-stage">
                <div
                  className={`ember-sprite-stage__scroll ${canvasNavigation.handMode || canvasNavigation.spaceHeld ? "is-hand" : ""} ${canvasNavigation.dragging ? "is-panning" : ""}`}
                  ref={stageRef}
                  onMouseDown={canvasNavigation.beginPan}
                >
                  <div className="ember-sprite-stage__center">
                    <div className="ember-sprite-artboard">
                      <div className={`ember-pixel-canvas-pair ${canvasView.reference?.mode === "side" ? "is-side" : ""}`}>
                      <div
                        className="ember-pixel-canvas-wrap"
                        style={{ backgroundSize: `${cellScale * 2}px ${cellScale * 2}px` }}
                      >
                      <PixelCanvasReferenceLayer
                        reference={canvasView.reference}
                        layer="under"
                        cellScale={cellScale}
                        width={width}
                        height={canvasH}
                      />
                      <canvas
                        ref={canvasRef}
                        className="ember-sprite-paint__canvas"
                        style={{
                          width: width * cellScale,
                          height: canvasH * cellScale,
                          cursor: canvasNavigation.dragging ? "grabbing" : canvasNavigation.handMode || canvasNavigation.spaceHeld ? "grab" : tool === "eyedrop" || tool === "fill" || tool === "select" || tool === "lasso" || tool === "wand" || pixelShapeKind(tool) ? "crosshair" : "cell",
                        }}
                      onContextMenu={(e) => e.preventDefault()}
                      onMouseDown={(e) => {
                        if (canvasNavigation.shouldPan(e.button)) {
                          canvasNavigation.beginPan(e);
                          return;
                        }
                        if (toolRef.current === "wand" && e.button === 0) {
                          const pos = pixelFromEvent(e.clientX, e.clientY);
                          if (pos) selectWithMagicWand(pos, e.shiftKey, e.altKey);
                          return;
                        }
                        if ((toolRef.current === "select" || toolRef.current === "lasso") && e.button === 0) {
                          const pos = pixelFromEvent(e.clientX, e.clientY);
                          if (pos) beginSelection(pos);
                          return;
                        }
                        if (
                          e.button === 2 ||
                          toolRef.current === "eyedrop" ||
                          e.altKey
                        ) {
                          e.preventDefault();
                          pickColorAt(e.clientX, e.clientY);
                          return;
                        }
                        if (e.button !== 0) return;
                        if (toolRef.current === "fill") {
                          const pos = pixelFromEvent(e.clientX, e.clientY);
                          if (pos) fillAt(pos);
                          return;
                        }
                        const shapeKind = pixelShapeKind(toolRef.current);
                        if (shapeKind) {
                          const pos = pixelFromEvent(e.clientX, e.clientY);
                          if (pos) beginShapeDrag(pos, e.shiftKey);
                          return;
                        }
                        if (isArtBrushTool(toolRef.current)) {
                          painting.current = true;
                          strokeSaved.current = false;
                          paintAt(e.clientX, e.clientY);
                        } else {
                          const pos = pixelFromEvent(e.clientX, e.clientY);
                          if (pos) beginBrushStroke(pos);
                        }
                      }}
                      onMouseMove={(e) => {
                        updateCursorStatus(e.clientX, e.clientY);
                        if (toolRef.current === "select" || toolRef.current === "lasso") {
                          const pos = pixelFromEvent(e.clientX, e.clientY);
                          if (pos) updateSelectionDrag(pos);
                          return;
                        }
                        if (shapeDragRef.current) {
                          const pos = pixelFromEvent(e.clientX, e.clientY);
                          if (pos) updateShapeDrag(pos, e.shiftKey);
                          return;
                        }
                        if (brushStrokeRef.current) {
                          const pos = pixelFromEvent(e.clientX, e.clientY);
                          if (pos) updateBrushStroke(pos);
                          return;
                        }
                        if (painting.current) paintAt(e.clientX, e.clientY);
                      }}
                      onMouseUp={() => {
                        if (toolRef.current === "select" || toolRef.current === "lasso") {
                          finishSelectionDrag();
                          return;
                        }
                        if (shapeDragRef.current) {
                          finishShapeDrag();
                          return;
                        }
                        if (brushStrokeRef.current) {
                          finishBrushStroke();
                          return;
                        }
                        if (!painting.current) return;
                        painting.current = false;
                        strokeSaved.current = false;
                        smudgePrevRef.current = null;
                        commitToPack(pixelsRef.current);
                      }}
                      onMouseLeave={() => {
                        if (cursorStatusRef.current) cursorStatusRef.current.textContent = "X —  Y —";
                        if (toolRef.current === "select" || toolRef.current === "lasso") {
                          finishSelectionDrag();
                          return;
                        }
                        if (shapeDragRef.current) {
                          finishShapeDrag();
                          return;
                        }
                        if (brushStrokeRef.current) {
                          finishBrushStroke();
                          return;
                        }
                        if (painting.current) {
                          painting.current = false;
                          strokeSaved.current = false;
                          smudgePrevRef.current = null;
                          commitToPack(pixelsRef.current);
                        }
                      }}
                    />
                    <PixelCanvasReferenceLayer
                      reference={canvasView.reference}
                      layer="over"
                      cellScale={cellScale}
                      width={width}
                      height={canvasH}
                    />
                    <PixelCanvasOverlays
                      width={width}
                      height={canvasH}
                      cellScale={cellScale}
                      gridVisible={canvasView.gridVisible}
                      gridStep={canvasView.gridStep}
                      gridOpacity={canvasView.gridOpacity}
                      guidesVisible={canvasView.guidesVisible}
                      guides={canvasView.guides}
                      onMoveGuide={canvasView.moveGuide}
                      onRemoveGuide={canvasView.removeGuide}
                    />
                    {selection ? (
                      <div
                        ref={selectionOverlayRef}
                        className={`ember-pixel-selection ${selectionPaths ? "is-masked" : ""}`}
                        style={{
                          left: selection.x * cellScale,
                          top: selection.y * cellScale,
                          width: selection.w * cellScale,
                          height: selection.h * cellScale,
                        }}
                        role="group"
                        aria-label={`Выделение ${selection.w} на ${selection.h} пикселей`}
                      >
                        {selectionPaths ? (
                          <svg
                            className="ember-pixel-selection__mask"
                            viewBox={`0 0 ${selection.w} ${selection.h}`}
                            preserveAspectRatio="none"
                            aria-hidden
                          >
                            <path className="ember-pixel-selection__mask-fill" d={selectionPaths.fill} />
                            <path className="ember-pixel-selection__mask-outline" d={selectionPaths.outline} />
                          </svg>
                        ) : null}
                        {(["nw", "ne", "se", "sw"] as const).map((handle) => (
                          <button
                            key={handle}
                            type="button"
                            className={`ember-pixel-selection__handle is-${handle}`}
                            aria-label={`Масштабировать за угол ${handle.toUpperCase()}`}
                            title="Тянуть для масштаба · Shift сохраняет пропорции"
                            onPointerDown={(event) => beginSelectionScale(handle, event)}
                            onPointerMove={updateSelectionScale}
                            onPointerUp={finishSelectionScale}
                            onPointerCancel={cancelSelectionScale}
                          />
                        ))}
                      </div>
                    ) : null}
                    </div>
                    <PixelCanvasReferenceLayer
                      reference={canvasView.reference}
                      layer="side"
                      cellScale={cellScale}
                      width={width}
                      height={canvasH}
                    />
                    </div>
                    </div>
                  </div>
                </div>

                <PixelCanvasNavigator
                  stageRef={stageRef}
                  sourceCanvasRef={canvasRef}
                  width={width}
                  height={canvasH}
                  scale={cellScale}
                  visible={canvasNavigation.navigatorVisible}
                  onClose={() => canvasNavigation.setNavigatorVisible(false)}
                  revisionA={pixels}
                  revisionB={emissivePixels}
                  revisionC={shinePixels}
                />
                <aside className="ember-sprite-hud" aria-label="Превью на тайле">
                  <div className="ember-sprite-hud__frame">
                    <canvas
                      ref={previewRef}
                      className="ember-sprite-hud__canvas"
                    />
                  </div>
                  <div
                    className="ember-seg ember-seg--sm ember-sprite-hud__elev"
                    role="group"
                    aria-label="Высота пола"
                  >
                    {Array.from({ length: MAX_ELEVATION + 1 }, (_, z) => (
                      <button
                        key={z}
                        type="button"
                        className={`ember-seg__btn ${previewElev === z ? "is-active" : ""}`}
                        onClick={() => setPreviewElev(z)}
                        title={z === 0 ? "Плоский пол" : `Elevation ${z}`}
                      >
                        Z{z}
                      </button>
                    ))}
                  </div>
                  <select
                    className="ember-sprite-hud__bg"
                    value={previewTileId}
                    onChange={(e) =>
                      setPreviewTileId(Number(e.target.value) || 1)
                    }
                    title="Фон тайла"
                  >
                    {previewTiles.map((t) => (
                      <option key={t.id} value={t.id}>
                        #{t.id} {t.name}
                      </option>
                    ))}
                  </select>
                </aside>
              </div>

              <div className="ember-sprite-actions">
                <button
                  type="button"
                  className="ghost ember-chip--sm"
                  onClick={addAsDecorTile}
                >
                  → тайлы
                </button>
                <label className="ember-inline-field ember-sprite-actions__bind">
                  Враг
                  <select
                    value={enemyBind}
                    onChange={(e) => setEnemyBind(e.target.value)}
                  >
                    <option value="">—</option>
                    {Object.values(pack.enemies).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nameRu}
                        {e.spriteId ? ` (${e.spriteId})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="ghost ember-chip--sm"
                  disabled={!enemyBind}
                  onClick={bindEnemy}
                >
                  Привязать
                </button>
              </div>
              <footer className="ember-studio-status" aria-label="Состояние холста">
                <span className="ember-studio-status__primary">
                  {tool === "select" ? "Выделение" : tool === "lasso" ? "Лассо" : tool === "wand" ? "Палочка" : tool === "fill" ? "Заливка" : tool === "line" ? "Линия" : tool === "rect" ? "Прямоугольник" : tool === "ellipse" ? "Эллипс" : tool === "paint" ? "Кисть" : tool === "eyedrop" ? "Пипетка" : tool === "glow" ? "Свечение" : tool === "shine" ? "Блеск" : ART_BRUSH_TOOLS.find((item) => item.id === tool)?.label ?? tool}
                  <b>{selection && (tool === "select" || tool === "lasso" || tool === "wand") ? `${selection.w}×${selection.h}` : `${brushSize}px`}</b>
                </span>
                <span ref={cursorStatusRef}>X —  Y —</span>
                <span>{width}×{canvasH} · {canvasNavigation.zoomPercent}%</span>
                <span className="ember-studio-status__hint"><kbd>M</kbd> рамка <kbd>L</kbd> лассо <kbd>W</kbd> цвет <kbd>F</kbd> заливка <kbd>U</kbd> фигуры <kbd>B</kbd> кисть <kbd>I</kbd> пипетка</span>
              </footer>
              </div>
              </div>
            </>
          )}
        </div>

        <PixelPalettePanel
          className="ember-sprite-palette"
          foreground={color}
          background={backgroundColor}
          baseColors={BASE_PALETTE}
          favorites={favorites}
          recentColors={recentColors}
          onForegroundChange={chooseForegroundColor}
          onForegroundPreview={setColor}
          onBackgroundChange={chooseBackgroundColor}
          onFavoritesChange={setPaletteFavorites}
          onSwap={swapPaletteColors}
          onReset={resetPaletteColors}
          onReplace={replacePaletteColor}
          replaceDisabled={activeColorLayerLocked()}
          onAdjust={adjustActiveColors}
          onQuantize={quantizeActiveColors}
          onOutline={outlineActiveColors}
          outlineDisabled={activeArtLayer()?.alphaLocked === true}
          canvasView={(
            <PixelCanvasViewPanel
              width={width}
              height={canvasH}
              gridVisible={canvasView.gridVisible}
              gridStep={canvasView.gridStep}
              gridOpacity={canvasView.gridOpacity}
              guidesVisible={canvasView.guidesVisible}
              guides={canvasView.guides}
              reference={canvasView.reference}
              onGridVisibleChange={canvasView.setGridVisible}
              onGridStepChange={canvasView.setGridStep}
              onGridOpacityChange={canvasView.setGridOpacity}
              onGuidesVisibleChange={canvasView.setGuidesVisible}
              onAddGuide={canvasView.addGuide}
              onRemoveGuide={canvasView.removeGuide}
              onClearGuides={() => canvasView.setGuides([])}
              onReferenceFile={canvasView.setReferenceFile}
              onRemoveReference={canvasView.removeReference}
              onReferenceChange={canvasView.updateReference}
              onReferenceModeChange={canvasView.setReferenceMode}
            />
          )}
        />
      </div>
    </div>
  );
}
