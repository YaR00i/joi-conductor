import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { writeEmberJson } from "../../../game/content/io";
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
  prunePaletteFavorites,
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
  cloneArtLayers,
  compositeArtLayers,
  ensureArtLayerStack,
  makeEmptyArtLayer,
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
  copyPixelArtChannels,
  hasPixelClipboard,
  pastePixelArtChannels,
} from "./pixelClipboard";
import {
  getLastOpenedId,
  hasOpenedEditor,
  markEditorOpened,
} from "./editorOpenSession";

type Props = {
  pack: EmberPack;
  onChangePack: (pack: EmberPack) => void;
  onSaved: (msg: string) => void;
  /** Focus a sprite when navigating from the library hub. */
  initialSpriteId?: string | null;
};

type DrawTool = "paint" | "eyedrop" | "glow" | "shine" | SpriteArtBrushKind;
type DrawLayer = "color" | "glow" | "shine";

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

const CELL_SCALE_MIN = 4;
const CELL_SCALE_MAX = 40;

function clampCellScale(n: number): number {
  if (!Number.isFinite(n)) return 12;
  return Math.max(CELL_SCALE_MIN, Math.min(CELL_SCALE_MAX, Math.round(n)));
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

  const [nameRu, setNameRu] = useState("");
  const [color, setColor] = useState("#c45c26");
  const [tool, setTool] = useState<DrawTool>("paint");
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
  const [historyLen, setHistoryLen] = useState(0);
  const [redoLen, setRedoLen] = useState(0);
  const [clipReady, setClipReady] = useState(() => hasPixelClipboard());
  const [cellScale, setCellScale] = useState(14);
  const [tagsDraft, setTagsDraft] = useState("");
  const [pickerQuery, setPickerQuery] = useState("");
  const [showColor, setShowColor] = useState(true);
  const [showGlow, setShowGlow] = useState(true);
  const [showShine, setShowShine] = useState(true);
  const [artLayers, setArtLayers] = useState<EmberSpriteArtLayer[] | undefined>();
  const [activeLayerId, setActiveLayerId] = useState<string | undefined>();
  const [frames, setFrames] = useState<SpriteFrameBuf[] | undefined>();
  const [activeFrameId, setActiveFrameId] = useState<string | undefined>();
  const [previewPlaying, setPreviewPlaying] = useState(false);

  toolRef.current = tool;
  brushSizeRef.current = brushSize;
  pixelsRef.current = pixels;
  emissiveRef.current = emissivePixels;
  shineRef.current = shinePixels;
  artLayersRef.current = artLayers;
  activeLayerIdRef.current = activeLayerId;
  geomRef.current = { width, height: canvasH };
  const cellScaleRef = useRef(cellScale);
  cellScaleRef.current = cellScale;

  const favorites = pack.paletteFavorites ?? [];
  const palette = useMemo(() => {
    const extra = favorites.filter((c) => !BASE_PALETTE.includes(c));
    return [...BASE_PALETTE, ...extra];
  }, [favorites]);

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

  const stepZoom = (dir: 1 | -1) => {
    setCellScale((prev) => clampCellScale(prev + dir));
  };

  const fitStage = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const padX = 32;
    const padY = 32;
    const sx = Math.floor((rect.width - padX) / Math.max(1, width));
    const sy = Math.floor((rect.height - padY) / Math.max(1, canvasH));
    setCellScale(clampCellScale(Math.min(sx, sy) || 8));
  }, [width, canvasH]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dir: 1 | -1 = e.deltaY < 0 ? 1 : -1;
      setCellScale((prev) => clampCellScale(prev + dir));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [spriteId]);

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
    undoRef.current = [];
    redoRef.current = [];
    setHistoryLen(0);
    setRedoLen(0);
  }, [spriteId, sprite?.id]);

  useEffect(() => {
    if (spriteId && !pack.sprites[spriteId]) {
      setSpriteId(spriteList[0]?.id ?? null);
    }
  }, [pack.sprites, spriteId, spriteList]);

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
        if (!showColor || !c || c === "#00000000") {
          ctx.fillStyle = (x + y) % 2 === 0 ? "#1a120e" : "#241810";
          ctx.fillRect(px, py, cellScale, cellScale);
        } else {
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
    const overlayX = Math.round(cx - tw / 2);
    const overlayY = Math.round(cy - topH / 2);
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

  const pushHistory = () => {
    undoRef.current = [
      ...undoRef.current.slice(-40),
      capturePaintSnapshot(),
    ];
    redoRef.current = [];
    setHistoryLen(undoRef.current.length);
    setRedoLen(0);
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
    commitToPack(next);
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

  const writeColorPixels = (nextLayerPixels: string[]) => {
    const g = geomRef.current;
    const layers = artLayersRef.current;
    if (layers?.length) {
      const id = activeLayerIdRef.current ?? layers[layers.length - 1]!.id;
      const nextLayers = layers.map((layer) =>
        layer.id === id ? { ...layer, pixels: nextLayerPixels } : layer,
      );
      const composed = compositeArtLayers(nextLayers, g.width, g.height);
      applyLayers(nextLayers, id);
      pixelsRef.current = composed;
      setPixels(composed);
      commitToPack(composed);
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
    applyLive(incoming.pixels, incoming.emissive, incoming.shine);
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
    applyLive(incoming.pixels, incoming.emissive, incoming.shine);
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

  const copyCanvas = useCallback(() => {
    const g = geomRef.current;
    copyPixelArtChannels(g.width, g.height, {
      pixels: pixelsRef.current,
      emissivePixels: emissiveRef.current,
      shinePixels: shineRef.current,
    });
    setClipReady(true);
  }, []);

  const pasteCanvas = useCallback(() => {
    const g = geomRef.current;
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
    const fill = color === "#00000000" ? "" : color;
    const filled = emptySpritePixels(g.width, g.height).map(() => fill);
    pushHistory();
    const layer = channelForTool(tool);
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
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const isUndo = e.code === "KeyZ" && !e.shiftKey;
      const isRedo =
        e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey);
      const isCopy = e.code === "KeyC";
      const isPaste = e.code === "KeyV";
      if (!isUndo && !isRedo && !isCopy && !isPaste) return;
      e.preventDefault();
      e.stopPropagation();
      if (isUndo) undo();
      else if (isRedo) redo();
      else if (isCopy) copyCanvas();
      else pasteCanvas();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [showOpenPicker, undo, redo, copyCanvas, pasteCanvas]);

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
    setColor(c === "" ? "#00000000" : c);
    if (!fromEm && !fromShine) setTool("paint");
  };

  const paintAt = (clientX: number, clientY: number) => {
    if (previewPlaying) setPreviewPlaying(false);
    const pos = pixelFromEvent(clientX, clientY);
    if (!pos) return;
    const g = geomRef.current;
    const paintColor = color === "#00000000" ? "" : color;
    const kind = toolRef.current;
    const glowMode = kind === "glow";
    const shineMode = kind === "shine";
    const target = glowMode
      ? emissiveRef.current
      : shineMode
        ? shineRef.current
        : colorTargetPixels();
    const b = Math.max(1, Math.min(4, brushSizeRef.current));
    let changed = false;
    let next = [...target];
    if (isArtBrushTool(kind)) {
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
      changed = stamped.changed;
      smudgePrevRef.current = { x: pos.x, y: pos.y };
    } else {
      const origin = Math.floor((b - 1) / 2);
      for (let dy = 0; dy < b; dy++) {
        for (let dx = 0; dx < b; dx++) {
          const x = pos.x - origin + dx;
          const y = pos.y - origin + dy;
          if (x < 0 || y < 0 || x >= g.width || y >= g.height) continue;
          const idx = y * g.width + x;
          if (next[idx] === paintColor) continue;
          next[idx] = paintColor;
          changed = true;
        }
      }
    }
    if (!changed) return;
    if (!strokeSaved.current) {
      pushHistory();
      strokeSaved.current = true;
    }
    if (glowMode) {
      emissiveRef.current = next;
      setEmissivePixels(next);
    } else if (shineMode) {
      shineRef.current = next;
      setShinePixels(next);
    } else {
      writeColorPixels(next);
    }
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
    applyLayers(next, added.id);
    writeColorPixels(added.pixels);
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
    const src =
      timeline.find((frame) => frame.id === activeFrameIdRef.current) ??
      timeline[timeline.length - 1]!;
    const added: SpriteFrameBuf = {
      ...cloneFrameBuf(src),
      id: newSpriteFrameId(),
    };
    const next = [...timeline, added];
    framesRef.current = next;
    setFrames(next);
    showFrame(added);
  };

  const removeFrame = (id: string) => {
    const timeline = framesRef.current;
    if (!timeline?.length) return;
    setPreviewPlaying(false);
    pushHistory();
    syncActiveFrameFromLive();
    if (timeline.length <= 2) {
      const keep = timeline.find((frame) => frame.id !== id) ?? timeline[0]!;
      framesRef.current = undefined;
      setFrames(undefined);
      showFrame(keep);
      activeFrameIdRef.current = undefined;
      setActiveFrameId(undefined);
      return;
    }
    const next = timeline.filter((frame) => frame.id !== id);
    framesRef.current = next;
    setFrames(next);
    const shown =
      next.find((frame) => frame.id === activeFrameIdRef.current) ?? next[0]!;
    showFrame(shown);
  };

  const setFrameDurationMs = (id: string, raw: number) => {
    const timeline = framesRef.current;
    if (!timeline) return;
    const durationMs = clampSpriteFrameDuration(raw);
    const next = timeline.map((frame) =>
      frame.id === id ? { ...frame, durationMs } : frame,
    );
    framesRef.current = next;
    setFrames(next);
    commitToPack(pixelsRef.current);
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
      const fid = activeFrameIdRef.current;
      const i = Math.max(
        0,
        list.findIndex((frame) => frame.id === fid),
      );
      const cur = list[i] ?? list[0]!;
      const next = list[(i + 1) % list.length]!;
      timer = window.setTimeout(() => {
        if (cancelled) return;
        showFrameRef.current(next);
        tick();
      }, cur.durationMs);
    };
    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [previewPlaying]);

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
    const g = geomRef.current;
    const composed = compositeArtLayers(next, g.width, g.height);
    applyLayers(next, next[next.length - 1]?.id);
    pixelsRef.current = composed;
    setPixels(composed);
    commitToPack(composed);
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
    const g = geomRef.current;
    const composed = compositeArtLayers(next, g.width, g.height);
    applyLayers(next, activeLayerIdRef.current);
    pixelsRef.current = composed;
    setPixels(composed);
    commitToPack(composed);
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

  const addFavorite = (hex: string) => {
    const n = hex.toLowerCase();
    if (!n.startsWith("#") || (n.length !== 7 && n !== "#00000000")) return;
    if (BASE_PALETTE.includes(n)) return;
    const next = prunePaletteFavorites([...favorites, n]);
    if (
      next.length === favorites.length &&
      next.every((c, i) => c === favorites[i])
    ) {
      return;
    }
    onChangePack({
      ...pack,
      paletteFavorites: next,
    });
  };

  const removeFavorite = (hex: string) => {
    onChangePack({
      ...pack,
      paletteFavorites: favorites.filter((c) => c !== hex),
    });
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
      spriteList.map((s) => {
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
    [spriteList],
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
            <h3 className="ember-sprite-list__title">Ассеты</h3>
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
            </div>
          </div>
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
                    className={`ember-chip ember-chip--sm ${tool === "paint" ? "is-active" : ""}`}
                    onClick={() => {
                      setTool("paint");
                      setShowColor(true);
                    }}
                    title="Кисть · ЛКМ"
                  >
                    B
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
                    ✦
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
                    ✧
                  </button>
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${tool === "eyedrop" ? "is-active" : ""}`}
                    onClick={() => setTool("eyedrop")}
                    title="Пипетка · ПКМ"
                  >
                    I
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
                <div className="ember-chip-row ember-sprite-toolstrip__group">
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    disabled={historyLen === 0}
                    onClick={undo}
                    title="Undo"
                  >
                    ↶
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    disabled={redoLen === 0}
                    onClick={redo}
                    title="Redo"
                  >
                    ↷
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    title="Копировать холст (цвет + свет + блеск)"
                    onClick={copyCanvas}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    disabled={!clipReady}
                    title="Вставить"
                    onClick={pasteCanvas}
                  >
                    Paste
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    title="Залить активный слой"
                    onClick={fillCanvas}
                  >
                    Fill
                  </button>
                  <button
                    type="button"
                    className="ghost ember-danger ember-chip--sm"
                    title="Очистить"
                    onClick={() => {
                      pushHistory();
                      const blank = emptySpritePixels(width, canvasH);
                      applyLive(blank, blank, blank);
                    }}
                  >
                    Clear
                  </button>
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
                  aria-label="Масштаб"
                >
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    onClick={() => stepZoom(-1)}
                    title="Отдалить"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    onClick={fitStage}
                    title="Вписать в окно"
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    onClick={() => stepZoom(1)}
                    title="Приблизить"
                  >
                    +
                  </button>
                  <span className="muted ember-sprite-zoom__label">
                    {cellScale}px
                  </span>
                </div>
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
                  {(artLayers?.length
                    ? [...artLayers].reverse()
                    : [
                        {
                          id: "flat",
                          nameRu: "Слой 1",
                          visible: true as boolean | undefined,
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
                        <button
                          type="button"
                          className={`ember-sprite-layers__name ${active ? "is-active" : ""}`}
                          onClick={() => {
                            if (isFlat) return;
                            setActiveLayerId(layer.id);
                            activeLayerIdRef.current = layer.id;
                          }}
                        >
                          {layer.nameRu ?? "Слой"}
                        </button>
                        <button
                          type="button"
                          className="ghost ember-chip--sm ember-danger"
                          title="Удалить слой"
                          disabled={isFlat}
                          onClick={() => removeArtLayer(layer.id)}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="ember-chip ember-chip--sm"
                    disabled={(artLayers?.length ?? 1) >= MAX_SPRITE_ART_LAYERS}
                    onClick={addArtLayer}
                    title="Добавить слой"
                  >
                    + слой
                  </button>
                </div>
                <p className="muted ember-sprite-inspector__label">Кадры</p>
                <div className="ember-sprite-frames">
                  {(frames ?? []).map((frame, index) => {
                    const active = frame.id === activeFrameId;
                    return (
                      <div
                        key={frame.id}
                        className={`ember-sprite-frames__row ${active ? "is-active" : ""}`}
                      >
                        <button
                          type="button"
                          className={`ember-sprite-frames__name ${active ? "is-active" : ""}`}
                          onClick={() => selectFrame(frame.id)}
                        >
                          {index + 1}
                        </button>
                        <input
                          className="ember-sprite-frames__ms"
                          type="number"
                          min={MIN_SPRITE_FRAME_MS}
                          max={MAX_SPRITE_FRAME_MS}
                          step={10}
                          value={frame.durationMs}
                          title="Длительность кадра, мс"
                          onChange={(e) =>
                            setFrameDurationMs(frame.id, Number(e.target.value))
                          }
                        />
                        <button
                          type="button"
                          className="ghost ember-chip--sm ember-danger"
                          title="Удалить кадр"
                          onClick={() => removeFrame(frame.id)}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                  <div className="ember-sprite-frames__toolbar">
                    <button
                      type="button"
                      className="ember-chip ember-chip--sm"
                      disabled={(frames?.length ?? 1) >= MAX_SPRITE_ANIM_FRAMES}
                      onClick={addFrame}
                      title="Добавить кадр"
                    >
                      + кадр
                    </button>
                    <button
                      type="button"
                      className={`ember-chip ember-chip--sm ${previewPlaying ? "is-active" : ""}`}
                      disabled={(frames?.length ?? 0) < 2}
                      onClick={() => setPreviewPlaying((on) => !on)}
                      title="Проиграть цикл кадров"
                    >
                      {previewPlaying ? "Стоп" : "▶"}
                    </button>
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
                <div className="ember-sprite-stage__scroll" ref={stageRef}>
                  <div className="ember-sprite-stage__center">
                    <div className="ember-sprite-artboard">
                      <canvas
                        ref={canvasRef}
                        className="ember-sprite-paint__canvas"
                        style={{
                          width: width * cellScale,
                          height: canvasH * cellScale,
                          cursor: tool === "eyedrop" ? "crosshair" : "cell",
                        }}
                      onContextMenu={(e) => e.preventDefault()}
                      onMouseDown={(e) => {
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
                        painting.current = true;
                        strokeSaved.current = false;
                        paintAt(e.clientX, e.clientY);
                      }}
                      onMouseMove={(e) => {
                        if (painting.current) paintAt(e.clientX, e.clientY);
                      }}
                      onMouseUp={() => {
                        if (!painting.current) return;
                        painting.current = false;
                        strokeSaved.current = false;
                        smudgePrevRef.current = null;
                        commitToPack(pixelsRef.current);
                      }}
                      onMouseLeave={() => {
                        if (painting.current) {
                          painting.current = false;
                          strokeSaved.current = false;
                          smudgePrevRef.current = null;
                          commitToPack(pixelsRef.current);
                        }
                      }}
                    />
                    </div>
                  </div>
                </div>

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
              </div>
              </div>
            </>
          )}
        </div>

        <aside className="ember-sprite-palette">
          <div className="ember-sprite-palette__head">
            <h3 className="ember-sprite-palette__title">Цвет</h3>
            <span
              className="ember-sprite-palette__current"
              style={{
                background:
                  color === "#00000000"
                    ? "repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 8px 8px"
                    : color,
              }}
              title={color}
            />
          </div>
          <div className="ember-tile-palette-grid">
            {palette.map((c) => (
              <button
                key={c}
                type="button"
                className={`ember-palette-swatch ${color === c ? "is-active" : ""}`}
                style={{
                  background:
                    c === "#00000000"
                      ? "repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 10px 10px"
                      : c,
                }}
                title={
                  c === "#00000000"
                    ? "Прозрачный"
                    : BASE_PALETTE.includes(c)
                      ? c
                      : `${c} · ПКМ убрать`
                }
                onClick={() => setColor(c)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!BASE_PALETTE.includes(c)) removeFavorite(c);
                }}
              />
            ))}
            <label
              className="ember-palette-swatch ember-palette-swatch--add"
              title="Добавить цвет"
            >
              <span aria-hidden>+</span>
              <input
                type="color"
                aria-label="Добавить цвет в палитру"
                value={
                  color.startsWith("#") && color.length === 7
                    ? color
                    : "#c45c26"
                }
                ref={(node) => {
                  if (!node) return;
                  // Native `change` fires when the picker closes.
                  // React onChange is the `input` event and would save every drag step.
                  node.onchange = () => {
                    setColor(node.value);
                    addFavorite(node.value);
                  };
                }}
                onInput={(e) => setColor(e.currentTarget.value)}
              />
            </label>
          </div>
        </aside>
      </div>
    </div>
  );
}
