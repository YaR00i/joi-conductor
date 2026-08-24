import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { writeEmberJson } from "../../../game/content/io";
import { prunePaletteFavorites } from "../../../game/content/pixelSprite";
import type {
  EmberEmissiveAnim,
  EmberEmissiveTriggerWhen,
  EmberMaterialKind,
  EmberPack,
  EmberTilePreset,
  EmberTileset,
  EmberTilesetTile,
} from "../../../game/content/types";
import {
  EMBER_MATERIAL_KINDS,
  EMBER_MATERIAL_LABELS_RU,
  resolveTileMaterialKind,
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
  paintEmissivePixels,
  resolveEmissiveAnimPeriod,
  resolveEmissiveFlickerPeriodRange,
  resolveEmissiveLightRange,
  resolveEmissiveGlowStrength,
  resolveEmissiveStrength,
  resolveEmissiveTriggerRadius,
  resolveEmissiveTriggerWhen,
  stampEmissiveBloomField,
} from "../../../game/tile/emissivePaint";
import { paintTileFace, paintWallFront } from "../../../game/tile/tileTextures";
import {
  DEFAULT_WATER_REFLECT_MULT,
  EMBER_ENV_VOXEL_MULTS,
  resolveWaterReflectMult,
  type EmberEnvVoxelMult,
} from "../../../game/three/envMap";
import {
  isWaterTile,
  resolveWaterGlintBright,
  resolveWaterWarpSpeed,
  resolveWaterWarpStrength,
} from "../../../game/three/waterMaterial";
import { EmberThumbGrid } from "./EmberThumbGrid";
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
  pastePixelArt,
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
import {
  appendBlankTile,
  appendClonedTile,
  removeTileFromTileset,
} from "./tileCreateHelpers";

type Props = {
  pack: EmberPack;
  tileset: EmberTileset;
  favorites?: string[];
  onFavoritesChange?: (favorites: string[]) => void;
  onChange: (tileset: EmberTileset) => void;
  onSaved: (msg: string) => void;
  /** Focus a tile when navigating from the library hub. */
  initialTileId?: number | null;
};

type DrawTool = "paint" | "eyedrop" | "glow" | "shine" | "fill" | "select" | "lasso" | "wand" | PixelShapeKind;
type ShapeChannel = "color" | "glow" | "shine";

function pixelShapeKind(tool: DrawTool): PixelShapeKind | null {
  return tool === "line" || tool === "rect" || tool === "ellipse" ? tool : null;
}
type EditFace = "top" | "wall";

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

const PALETTE = [
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

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable;
}

function emptyPixels(n: number, fill = ""): string[] {
  return new Array(n * n).fill(fill);
}

function clampTileOpacity(value: unknown): number {
  return Math.max(
    0,
    Math.min(1, typeof value === "number" && Number.isFinite(value) ? value : 1),
  );
}

function readCanvasPixels(
  ctx: CanvasRenderingContext2D,
  size: number,
): string[] {
  const img = ctx.getImageData(0, 0, size, size).data;
  const out: string[] = [];
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    const a = img[o + 3] ?? 0;
    if (a < 16) {
      out.push("");
      continue;
    }
    const r = img[o]!.toString(16).padStart(2, "0");
    const g = img[o + 1]!.toString(16).padStart(2, "0");
    const b = img[o + 2]!.toString(16).padStart(2, "0");
    out.push(`#${r}${g}${b}`);
  }
  return out;
}

function bakeProceduralPixels(tile: EmberTilesetTile, size: number): string[] {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return emptyPixels(size, tile.color === "#00000000" ? "" : tile.color);
  paintTileFace(ctx, { ...tile, pixels: undefined }, 0, 0, size);
  return readCanvasPixels(ctx, size);
}

function bakeWallProceduralPixels(
  tile: EmberTilesetTile,
  size: number,
): string[] {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return emptyPixels(size, tile.color === "#00000000" ? "" : tile.color);
  paintWallFront(ctx, { ...tile, wallPixels: undefined }, 0, 0, size, size);
  return readCanvasPixels(ctx, size);
}

function presetFaceOf(p: EmberTilePreset): EditFace {
  return p.face === "wall" ? "wall" : "top";
}

function PixelThumb({
  pixels,
  color,
  face = "top",
  size = 32,
  className = "ember-thumb-pixel",
}: {
  pixels: string[];
  color: string;
  face?: EditFace;
  size?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0e0a08";
    ctx.fillRect(0, 0, size, size);
    const need = size * size;
    const px =
      pixels.length === need
        ? pixels
        : emptyPixels(size, color === "#00000000" ? "" : color);
    const tile = { id: 0, name: "preset", color, pixels: px, wallPixels: px };
    if (face === "wall") {
      paintWallFront(ctx, tile, 0, 0, size, size);
    } else {
      paintTileFace(ctx, tile, 0, 0, size);
    }
  }, [pixels, color, face, size]);
  return (
    <canvas ref={ref} className={className} width={size} height={size} />
  );
}

function newPresetId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function TileEditorPanel({
  pack,
  tileset,
  favorites = [],
  onFavoritesChange,
  onChange,
  onSaved,
  initialTileId = null,
}: Props) {
  const canvasView = usePixelCanvasView();
  const size = tileset.tileSize;
  useEffect(() => {
    canvasView.clampGuides(size, size);
  }, [canvasView.clampGuides, size]);
  const [showOpenPicker, setShowOpenPicker] = useState(() => {
    if (initialTileId != null) return false;
    return !hasOpenedEditor("tile");
  });
  const [tileId, setTileId] = useState(() => {
    if (
      initialTileId != null &&
      tileset.tiles.some((t) => t.id === initialTileId)
    ) {
      return initialTileId;
    }
    if (hasOpenedEditor("tile")) {
      const last = Number(getLastOpenedId("tile"));
      if (
        Number.isFinite(last) &&
        tileset.tiles.some((t) => t.id === last)
      ) {
        return last;
      }
    }
    return tileset.tiles.find((t) => t.id !== 0)?.id ?? 1;
  });

  const selectTile = useCallback((id: number) => {
    setTileId(id);
    setShowOpenPicker(false);
    markEditorOpened("tile", String(id));
  }, []);

  const createBlankTile = useCallback(() => {
    const { tileset: nextTs, tileId: newId } = appendBlankTile(tileset);
    onChange(nextTs);
    selectTile(newId);
    void writeEmberJson(`tilesets/${nextTs.id}.json`, nextTs).then((res) => {
      onSaved(
        res.ok
          ? `Создан тайл #${newId}`
          : `Тайл #${newId} в паке; запись: ${"error" in res ? res.error : "?"}`,
      );
    });
  }, [tileset, onChange, selectTile, onSaved]);

  const cloneCurrentTile = useCallback(() => {
    const cloned = appendClonedTile(tileset, tileId);
    if (!cloned) {
      onSaved("Нечего клонировать — тайл не найден.");
      return;
    }
    const { tileset: nextTs, tileId: newId } = cloned;
    onChange(nextTs);
    selectTile(newId);
    void writeEmberJson(`tilesets/${nextTs.id}.json`, nextTs).then((res) => {
      onSaved(
        res.ok
          ? `Клон тайла #${newId}`
          : `Клон #${newId} в паке; запись: ${"error" in res ? res.error : "?"}`,
      );
    });
  }, [tileset, tileId, onChange, selectTile, onSaved]);

  const deleteCurrentTile = useCallback(() => {
    const tile = tileset.tiles.find((item) => item.id === tileId);
    const removed = removeTileFromTileset(tileset, tileId);
    if (!removed) {
      onSaved("Этот тайл нельзя удалить (пусто, id 0 или последний в наборе).");
      return;
    }
    if (
      !window.confirm(
        `Удалить тайл #${tileId}${tile?.name ? ` «${tile.name}»` : ""} из тайлсета? Это нельзя отменить Undo карты.`,
      )
    ) {
      return;
    }
    onChange(removed.tileset);
    selectTile(removed.nextTileId);
    void writeEmberJson(`tilesets/${removed.tileset.id}.json`, removed.tileset).then(
      (res) => {
        onSaved(
          res.ok
            ? `Тайл #${tileId} удалён из тайлсета`
            : `Удалён в паке; запись: ${"error" in res ? res.error : "?"}`,
        );
      },
    );
  }, [tileset, tileId, onChange, selectTile, onSaved]);

  useEffect(() => {
    if (initialTileId == null) return;
    if (tileset.tiles.some((t) => t.id === initialTileId)) {
      selectTile(initialTileId);
    }
  }, [initialTileId, tileset.id, tileset.tiles, selectTile]);
  const [tileQuery, setTileQuery] = useState("");
  const [color, setColor] = useState("#2f4a30");
  const [backgroundColor, setBackgroundColor] = useState("#1a120e");
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const colorRef = useRef(color);
  const backgroundColorRef = useRef(backgroundColor);
  colorRef.current = color;
  backgroundColorRef.current = backgroundColor;
  const [tool, setTool] = useState<DrawTool>("paint");
  const [selection, setSelection] = useState<PixelRect | null>(null);
  const [selectionMask, setSelectionMask] = useState<boolean[] | null>(null);
  const [wandTolerance, setWandTolerance] = useState(0);
  const [wandContiguous, setWandContiguous] = useState(true);
  const [wandCombineMode, setWandCombineMode] = useState<PixelSelectionCombineMode>("replace");
  const [shapeChannel, setShapeChannel] = useState<ShapeChannel>("color");
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
  const [editFace, setEditFace] = useState<EditFace>("top");
  const [pixels, setPixels] = useState<string[]>(() => emptyPixels(size));
  const pixelsRef = useRef(pixels);
  const topPixelsRef = useRef<string[]>(emptyPixels(size));
  const wallPixelsRef = useRef<string[]>(emptyPixels(size));
  const emissiveTopRef = useRef<string[]>(emptyPixels(size));
  const emissiveWallRef = useRef<string[]>(emptyPixels(size));
  const shineTopRef = useRef<string[]>(emptyPixels(size));
  const shineWallRef = useRef<string[]>(emptyPixels(size));
  const [emissivePixels, setEmissivePixels] = useState<string[]>(() =>
    emptyPixels(size),
  );
  const [shinePixels, setShinePixels] = useState<string[]>(() =>
    emptyPixels(size),
  );
  const [emissiveEnabled, setEmissiveEnabled] = useState(true);
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
  const [material, setMaterial] = useState<EmberMaterialKind>("stone");
  const [transparentTile, setTransparentTile] = useState(false);
  const [tileOpacity, setTileOpacity] = useState(1);
  const [waterReflectMult, setWaterReflectMult] = useState<EmberEnvVoxelMult>(
    DEFAULT_WATER_REFLECT_MULT,
  );
  const [waterStripeAxis, setWaterStripeAxis] = useState<"x" | "z">("x");
  const [waterGlintBright, setWaterGlintBright] = useState(1);
  const [waterWarpStrength, setWaterWarpStrength] = useState(1);
  const [waterWarpSpeed, setWaterWarpSpeed] = useState(1);
  const emissiveEnabledRef = useRef(emissiveEnabled);
  const emissiveAnimRef = useRef(emissiveAnim);
  const emissiveStrengthRef = useRef(emissiveStrength);
  const emissiveBloomColorRef = useRef(emissiveBloomColor);
  const emissiveBloomCustomRef = useRef(emissiveBloomCustom);
  const emissiveCastsLightRef = useRef(emissiveCastsLight);
  const emissiveLightRangeRef = useRef(emissiveLightRange);
  const emissiveLightShadowsRef = useRef(emissiveLightShadows);
  const emissiveAnimPeriodRef = useRef(emissiveAnimPeriod);
  const emissiveAnimPeriodMinRef = useRef(emissiveAnimPeriodMin);
  const emissiveAnimPeriodMaxRef = useRef(emissiveAnimPeriodMax);
  const emissiveTriggerWhenRef = useRef(emissiveTriggerWhen);
  const emissiveTriggerRadiusRef = useRef(emissiveTriggerRadius);
  const emissiveTriggerEventIdRef = useRef(emissiveTriggerEventId);
  const materialRef = useRef(material);
  const transparentTileRef = useRef(transparentTile);
  const tileOpacityRef = useRef(tileOpacity);
  const waterReflectMultRef = useRef(waterReflectMult);
  const waterStripeAxisRef = useRef(waterStripeAxis);
  const waterGlintBrightRef = useRef(waterGlintBright);
  const waterWarpStrengthRef = useRef(waterWarpStrength);
  const waterWarpSpeedRef = useRef(waterWarpSpeed);
  emissiveEnabledRef.current = emissiveEnabled;
  emissiveAnimRef.current = emissiveAnim;
  emissiveStrengthRef.current = emissiveStrength;
  emissiveBloomColorRef.current = emissiveBloomColor;
  emissiveBloomCustomRef.current = emissiveBloomCustom;
  emissiveCastsLightRef.current = emissiveCastsLight;
  emissiveLightRangeRef.current = emissiveLightRange;
  emissiveLightShadowsRef.current = emissiveLightShadows;
  emissiveAnimPeriodRef.current = emissiveAnimPeriod;
  emissiveAnimPeriodMinRef.current = emissiveAnimPeriodMin;
  emissiveAnimPeriodMaxRef.current = emissiveAnimPeriodMax;
  emissiveTriggerWhenRef.current = emissiveTriggerWhen;
  emissiveTriggerRadiusRef.current = emissiveTriggerRadius;
  emissiveTriggerEventIdRef.current = emissiveTriggerEventId;
  materialRef.current = material;
  transparentTileRef.current = transparentTile;
  tileOpacityRef.current = tileOpacity;
  waterReflectMultRef.current = waterReflectMult;
  waterStripeAxisRef.current = waterStripeAxis;
  waterGlintBrightRef.current = waterGlintBright;
  waterWarpStrengthRef.current = waterWarpStrength;
  waterWarpSpeedRef.current = waterWarpSpeed;
  const toolRef = useRef(tool);
  const brushSizeRef = useRef(brushSize);
  const symmetryRef = useRef<PixelSymmetry>({ horizontal: false, vertical: false });
  const editFaceRef = useRef<EditFace>(editFace);
  toolRef.current = tool;
  brushSizeRef.current = brushSize;
  symmetryRef.current = {
    horizontal: symmetryHorizontal,
    vertical: symmetryVertical,
  };
  editFaceRef.current = editFace;

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
  type PaintSnapshot = {
    pixels: string[];
    emissive: string[];
    shine: string[];
  };
  const undoRef = useRef<PaintSnapshot[]>([]);
  const redoRef = useRef<PaintSnapshot[]>([]);
  const shapeDragRef = useRef<{
    start: PixelPoint;
    snapshot: PaintSnapshot;
    base: string[];
    kind: PixelShapeKind;
    channel: ShapeChannel;
    color: string;
    thickness: number;
    filled: boolean;
    symmetry: PixelSymmetry;
    changed: boolean;
  } | null>(null);
  const brushStrokeRef = useRef<{
    snapshot: PaintSnapshot;
    base: string[];
    channel: ShapeChannel;
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
  useEffect(() => {
    setSelection(null);
    setSelectionMask(null);
    selectionAnchorRef.current = null;
    lassoPointsRef.current = null;
    selectionMoveRef.current = null;
    selectionScaleRef.current = null;
    shapeDragRef.current = null;
    brushStrokeRef.current = null;
  }, [tileId, editFace]);
  const tilesetRef = useRef(tileset);
  const tileIdRef = useRef(tileId);
  const onChangeRef = useRef(onChange);
  const [scale, setScale] = useState(16);
  const canvasNavigation = usePixelCanvasNavigation({
    stageRef,
    canvasRef,
    scale,
    setScale,
    width: size,
    height: size,
    fitPaddingX: 150,
    fitPaddingY: 40,
  });
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const [historyLen, setHistoryLen] = useState(0);
  const [redoLen, setRedoLen] = useState(0);
  const [presetName, setPresetName] = useState("");
  const [clipReady, setClipReady] = useState(() => hasPixelClipboard());
  pixelsRef.current = pixels;
  const emissivePixelsRef = useRef(emissivePixels);
  emissivePixelsRef.current = emissivePixels;
  const shinePixelsRef = useRef(shinePixels);
  shinePixelsRef.current = shinePixels;
  tilesetRef.current = tileset;
  tileIdRef.current = tileId;
  onChangeRef.current = onChange;

  useEffect(() => {
    const frame = requestAnimationFrame(canvasNavigation.fit);
    return () => cancelAnimationFrame(frame);
  }, [canvasNavigation.fit, size, tileId]);

  const tile = useMemo(
    () => tileset.tiles.find((t) => t.id === tileId),
    [tileset.tiles, tileId],
  );
  const allPresets = tile?.presets ?? [];
  const facePresets = useMemo(
    () => allPresets.filter((p) => presetFaceOf(p) === editFace),
    [allPresets, editFace],
  );
  const topPresetCount = useMemo(
    () => allPresets.filter((p) => presetFaceOf(p) === "top").length,
    [allPresets],
  );
  const wallPresetCount = useMemo(
    () => allPresets.filter((p) => presetFaceOf(p) === "wall").length,
    [allPresets],
  );

  const clearHistory = () => {
    undoRef.current = [];
    redoRef.current = [];
    setHistoryLen(0);
    setRedoLen(0);
  };

  const capturePaintSnapshot = useCallback(
    (): PaintSnapshot => ({
      pixels: [...pixelsRef.current],
      emissive: [...emissivePixelsRef.current],
      shine: [...shinePixelsRef.current],
    }),
    [],
  );

  const pushPaintSnapshot = useCallback((snapshot: PaintSnapshot) => {
    undoRef.current = [
      ...undoRef.current.slice(-40),
      snapshot,
    ];
    redoRef.current = [];
    setHistoryLen(undoRef.current.length);
    setRedoLen(0);
  }, []);

  const pushHistory = useCallback(() => {
    pushPaintSnapshot(capturePaintSnapshot());
  }, [capturePaintSnapshot, pushPaintSnapshot]);

  // Load top + wall pixels when switching tile / tileset
  useEffect(() => {
    const t = tileset.tiles.find((x) => x.id === tileId);
    if (!t) return;
    clearHistory();
    brushStrokeRef.current = null;
    setEditFace("top");
    editFaceRef.current = "top";
    const top =
      t.pixels && t.pixels.length === size * size
        ? [...t.pixels]
        : bakeProceduralPixels(t, size);
    const wall =
      t.wallPixels && t.wallPixels.length === size * size
        ? [...t.wallPixels]
        : bakeWallProceduralPixels(t, size);
    topPixelsRef.current = top;
    wallPixelsRef.current = wall;
    const emTop =
      t.emissivePixels && t.emissivePixels.length === size * size
        ? [...t.emissivePixels]
        : emptyPixels(size);
    const emWall =
      t.emissiveWallPixels && t.emissiveWallPixels.length === size * size
        ? [...t.emissiveWallPixels]
        : emptyPixels(size);
    const shTop =
      t.shinePixels && t.shinePixels.length === size * size
        ? [...t.shinePixels]
        : emptyPixels(size);
    const shWall =
      t.shineWallPixels && t.shineWallPixels.length === size * size
        ? [...t.shineWallPixels]
        : emptyPixels(size);
    emissiveTopRef.current = emTop;
    emissiveWallRef.current = emWall;
    shineTopRef.current = shTop;
    shineWallRef.current = shWall;
    setPixels(top);
    setEmissivePixels(emTop);
    setShinePixels(shTop);
    setEmissiveEnabled(t.emissiveEnabled !== false);
    emissiveEnabledRef.current = t.emissiveEnabled !== false;
    setEmissiveAnim(t.emissiveAnim ?? "always");
    setEmissiveStrength(resolveEmissiveStrength(t.emissiveStrength));
    {
      const bloom = normalizeEmissiveBloomColor(t.emissiveBloomColor);
      setEmissiveBloomCustom(!!bloom);
      setEmissiveBloomColor(bloom ?? "#88ccff");
      emissiveBloomCustomRef.current = !!bloom;
      emissiveBloomColorRef.current = bloom ?? "#88ccff";
    }
    setEmissiveCastsLight(t.emissiveCastsLight === true);
    emissiveCastsLightRef.current = t.emissiveCastsLight === true;
    {
      const range = resolveEmissiveLightRange(t.emissiveLightRange);
      setEmissiveLightRange(range);
      emissiveLightRangeRef.current = range;
    }
    setEmissiveLightShadows(t.emissiveLightShadows === true);
    emissiveLightShadowsRef.current = t.emissiveLightShadows === true;
    setEmissiveAnimPeriod(
      resolveEmissiveAnimPeriod(t.emissiveAnimPeriod, "pulse"),
    );
    {
      const range = resolveEmissiveFlickerPeriodRange(
        t.emissiveAnimPeriodMin,
        t.emissiveAnimPeriodMax,
        t.emissiveAnimPeriod,
      );
      setEmissiveAnimPeriodMin(range.min);
      setEmissiveAnimPeriodMax(range.max);
      emissiveAnimPeriodMinRef.current = range.min;
      emissiveAnimPeriodMaxRef.current = range.max;
    }
    setEmissiveTriggerWhen(resolveEmissiveTriggerWhen(t.emissiveTriggerWhen));
    setEmissiveTriggerRadius(
      resolveEmissiveTriggerRadius(t.emissiveTriggerRadius),
    );
    setEmissiveTriggerEventId(t.emissiveTriggerEventId ?? "");
    {
      const kind = resolveTileMaterialKind(t);
      setMaterial(kind);
      materialRef.current = kind;
    }
    {
      const opacity = clampTileOpacity(t.opacity);
      const transparent = t.transparent === true || opacity < 0.999;
      setTransparentTile(transparent);
      setTileOpacity(opacity);
      transparentTileRef.current = transparent;
      tileOpacityRef.current = opacity;
      const reflect = resolveWaterReflectMult(t.waterReflectMult);
      setWaterReflectMult(reflect);
      waterReflectMultRef.current = reflect;
      const axis = t.waterStripeAxis === "z" ? "z" : "x";
      setWaterStripeAxis(axis);
      waterStripeAxisRef.current = axis;
      const glint = resolveWaterGlintBright(t.waterGlintBright);
      setWaterGlintBright(glint);
      waterGlintBrightRef.current = glint;
      const warpStr = resolveWaterWarpStrength(t.waterWarpStrength);
      setWaterWarpStrength(warpStr);
      waterWarpStrengthRef.current = warpStr;
      const warpSpd = resolveWaterWarpSpeed(t.waterWarpSpeed);
      setWaterWarpSpeed(warpSpd);
      waterWarpSpeedRef.current = warpSpd;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: tileId/tileset.id/size only
  }, [tileId, tileset.id, size]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = size * scale;
    canvas.height = size * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    // checkerboard for transparent
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = pixels[y * size + x];
        const px = x * scale;
        const py = y * scale;
        if (c && c !== "#00000000") {
          ctx.fillStyle = c;
          ctx.fillRect(px, py, scale, scale);
        }
        const em = emissivePixels[y * size + x];
        if (em && em !== "#00000000") {
          ctx.fillStyle = em;
          ctx.globalAlpha = emissiveEnabled ? 0.7 : 0.28;
          ctx.fillRect(px, py, scale, scale);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = emissiveEnabled
            ? "rgba(255, 230, 140, 0.8)"
            : "rgba(160, 140, 100, 0.45)";
          ctx.strokeRect(px + 0.5, py + 0.5, scale - 1, scale - 1);
        }
        const sh = shinePixels[y * size + x];
        if (sh && sh !== "#00000000") {
          ctx.fillStyle = sh;
          ctx.globalAlpha = 0.55;
          ctx.fillRect(px, py, scale, scale);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "rgba(180, 220, 240, 0.9)";
          ctx.strokeRect(px + 0.5, py + 0.5, scale - 1, scale - 1);
        }
      }
    }
  }, [pixels, emissivePixels, shinePixels, emissiveEnabled, size, scale]);

  // Compact 3×3 top + wall strip preview
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !tile) return;
    const cell = Math.max(16, Math.min(24, Math.floor(72 / 3)));
    const wallH = Math.max(6, Math.floor(cell * 0.5));
    const dim = cell * 3;
    canvas.width = dim;
    canvas.height = dim + wallH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0e0a08";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const topPx = editFace === "top" ? pixels : topPixelsRef.current;
    const wallPx = editFace === "wall" ? pixels : wallPixelsRef.current;
    const emTop =
      editFace === "top" ? emissivePixels : emissiveTopRef.current;
    const emWall =
      editFace === "wall" ? emissivePixels : emissiveWallRef.current;
    const liveTile: EmberTilesetTile = {
      ...tile,
      pixels: topPx,
      wallPixels: wallPx,
      emissivePixels: emTop,
      emissiveWallPixels: emWall,
      emissiveEnabled,
      emissiveStrength,
      emissiveBloomColor: emissiveBloomCustom ? emissiveBloomColor : undefined,
      color: dominantColor(topPx) || tile.color,
    };
    for (let gy = 0; gy < 3; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        paintTileFace(ctx, liveTile, gx * cell, gy * cell, cell);
      }
    }
    for (let gx = 0; gx < 3; gx++) {
      paintWallFront(ctx, liveTile, gx * cell, dim, cell, wallH);
    }
    const glowA = emissiveEnabled
      ? resolveEmissiveGlowStrength(emissiveStrength)
      : 0;
    const bloomHex = emissiveBloomCustom ? emissiveBloomColor : undefined;
    if (glowA > 0.01) {
      const prev = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "lighter";
      for (let gy = 0; gy < 3; gy++) {
        for (let gx = 0; gx < 3; gx++) {
          stampEmissiveBloomField(
            ctx,
            emTop,
            size,
            size,
            gx * cell,
            gy * cell,
            cell,
            cell,
            glowA * 0.75,
            bloomHex,
          );
          paintEmissivePixels(
            ctx,
            emTop,
            size,
            size,
            gx * cell,
            gy * cell,
            cell,
            cell,
            glowA,
          );
        }
      }
      for (let gx = 0; gx < 3; gx++) {
        stampEmissiveBloomField(
          ctx,
          emWall,
          size,
          size,
          gx * cell,
          dim,
          cell,
          wallH,
          glowA * 0.65,
          bloomHex,
        );
        paintEmissivePixels(
          ctx,
          emWall,
          size,
          size,
          gx * cell,
          dim,
          cell,
          wallH,
          glowA * 0.85,
        );
      }
      ctx.globalCompositeOperation = prev;
    }
  }, [
    pixels,
    emissivePixels,
    emissiveEnabled,
    emissiveStrength,
    emissiveBloomColor,
    emissiveBloomCustom,
    tile,
    size,
    editFace,
  ]);

  const applyToTileset = (
    nextPixels: string[],
    nextEmissive?: string[],
    nextShine?: string[],
  ) => {
    const ts = tilesetRef.current;
    const id = tileIdRef.current;
    const face = editFaceRef.current;
    const em = nextEmissive ?? emissivePixelsRef.current;
    const sh = nextShine ?? shinePixelsRef.current;
    if (face === "wall") {
      wallPixelsRef.current = [...nextPixels];
      emissiveWallRef.current = [...em];
      shineWallRef.current = [...sh];
    } else {
      topPixelsRef.current = [...nextPixels];
      emissiveTopRef.current = [...em];
      shineTopRef.current = [...sh];
    }
    const hasEmFace = em.some((c) => c && c !== "#00000000");
    const hasShine = sh.some((c) => c && c !== "#00000000");
    const tiles = ts.tiles.map((t) => {
      if (t.id !== id) return t;
      const hasEmTop =
        face === "top"
          ? hasEmFace
          : (t.emissivePixels?.some((c) => c && c !== "#00000000") ?? false);
      const hasEmWall =
        face === "wall"
          ? hasEmFace
          : (t.emissiveWallPixels?.some((c) => c && c !== "#00000000") ??
            false);
      const hasAnyEm = hasEmTop || hasEmWall;
      const anim = hasAnyEm ? emissiveAnimRef.current : undefined;
      const isTrig = anim === "trigger";
      const isPulse = anim === "pulse";
      const isFlicker = anim === "flicker";
      const flickerRange = isFlicker
        ? resolveEmissiveFlickerPeriodRange(
            emissiveAnimPeriodMinRef.current,
            emissiveAnimPeriodMaxRef.current,
          )
        : null;
      const base = {
        ...t,
        material: materialRef.current,
        transparent: transparentTileRef.current ? true : undefined,
        opacity: transparentTileRef.current
          ? clampTileOpacity(tileOpacityRef.current)
          : undefined,
        waterReflectMult: isWaterTile(t)
          ? waterReflectMultRef.current
          : undefined,
        waterStripeAxis: isWaterTile(t)
          ? waterStripeAxisRef.current
          : undefined,
        waterGlintBright: isWaterTile(t)
          ? waterGlintBrightRef.current
          : undefined,
        waterWarpStrength: isWaterTile(t)
          ? waterWarpStrengthRef.current
          : undefined,
        waterWarpSpeed: isWaterTile(t)
          ? waterWarpSpeedRef.current
          : undefined,
        emissiveAnim: anim,
        emissiveEnabled: hasAnyEm
          ? emissiveEnabledRef.current
            ? undefined
            : false
          : undefined,
        emissiveStrength: hasAnyEm
          ? emissiveStrengthRef.current
          : undefined,
        emissiveBloomColor:
          hasAnyEm && emissiveBloomCustomRef.current
            ? normalizeEmissiveBloomColor(emissiveBloomColorRef.current)
            : undefined,
        emissiveCastsLight:
          hasAnyEm &&
          emissiveEnabledRef.current &&
          emissiveCastsLightRef.current
            ? true
            : undefined,
        emissiveLightRange:
          hasAnyEm &&
          emissiveEnabledRef.current &&
          emissiveCastsLightRef.current
            ? resolveEmissiveLightRange(emissiveLightRangeRef.current)
            : undefined,
        emissiveLightShadows:
          hasAnyEm &&
          emissiveEnabledRef.current &&
          emissiveCastsLightRef.current &&
          emissiveLightShadowsRef.current
            ? true
            : undefined,
        emissiveAnimPeriod: isPulse
          ? emissiveAnimPeriodRef.current
          : undefined,
        emissiveAnimPeriodMin: flickerRange?.min,
        emissiveAnimPeriodMax: flickerRange?.max,
        emissiveTriggerWhen: isTrig
          ? emissiveTriggerWhenRef.current
          : undefined,
        emissiveTriggerRadius: isTrig
          ? emissiveTriggerRadiusRef.current
          : undefined,
        emissiveTriggerEventId:
          isTrig && emissiveTriggerWhenRef.current === "event"
            ? emissiveTriggerEventIdRef.current || undefined
            : undefined,
      };
      if (face === "wall") {
        return {
          ...base,
          wallPixels: [...nextPixels],
          emissiveWallPixels: hasEmFace ? [...em] : undefined,
          shineWallPixels: hasShine ? [...sh] : undefined,
        };
      }
      return {
        ...base,
        pixels: nextPixels,
        color: dominantColor(nextPixels) || t.color,
        emissivePixels: hasEmFace ? [...em] : undefined,
        shinePixels: hasShine ? [...sh] : undefined,
      };
    });
    onChangeRef.current({ ...ts, tiles, tileCount: tiles.length });
  };

  const restorePaintSnapshot = useCallback((snap: PaintSnapshot) => {
    const px = [...snap.pixels];
    const em = [...snap.emissive];
    const sh = [...snap.shine];
    pixelsRef.current = px;
    emissivePixelsRef.current = em;
    shinePixelsRef.current = sh;
    setPixels(px);
    setEmissivePixels(em);
    setShinePixels(sh);
    applyToTileset(px, em, sh);
  }, []);

  const switchEditFace = (face: EditFace) => {
    if (face === editFaceRef.current) return;
    applyToTileset(
      pixelsRef.current,
      emissivePixelsRef.current,
      shinePixelsRef.current,
    );
    clearHistory();
    brushStrokeRef.current = null;
    setEditFace(face);
    editFaceRef.current = face;
    setPixels(
      face === "top"
        ? [...topPixelsRef.current]
        : [...wallPixelsRef.current],
    );
    setEmissivePixels(
      face === "top"
        ? [...emissiveTopRef.current]
        : [...emissiveWallRef.current],
    );
    setShinePixels(
      face === "top"
        ? [...shineTopRef.current]
        : [...shineWallRef.current],
    );
  };

  const undo = useCallback(() => {
    const h = undoRef.current;
    if (h.length === 0) return;
    const prev = h[h.length - 1]!;
    undoRef.current = h.slice(0, -1);
    redoRef.current = [...redoRef.current.slice(-40), capturePaintSnapshot()];
    setHistoryLen(undoRef.current.length);
    setRedoLen(redoRef.current.length);
    restorePaintSnapshot(prev);
  }, [capturePaintSnapshot, restorePaintSnapshot]);

  const redo = useCallback(() => {
    const r = redoRef.current;
    if (r.length === 0) return;
    const next = r[r.length - 1]!;
    redoRef.current = r.slice(0, -1);
    undoRef.current = [...undoRef.current.slice(-40), capturePaintSnapshot()];
    setHistoryLen(undoRef.current.length);
    setRedoLen(redoRef.current.length);
    restorePaintSnapshot(next);
  }, [capturePaintSnapshot, restorePaintSnapshot]);

  const pixelFromEvent = (
    clientX: number,
    clientY: number,
  ): { x: number; y: number; idx: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const sc = scaleRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(
      ((clientX - rect.left) * canvas.width) / rect.width / sc,
    );
    const y = Math.floor(
      ((clientY - rect.top) * canvas.height) / rect.height / sc,
    );
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    return { x, y, idx: y * size + x };
  };

  const updateCursorStatus = (clientX: number, clientY: number) => {
    const pos = pixelFromEvent(clientX, clientY);
    if (cursorStatusRef.current) {
      cursorStatusRef.current.textContent = pos ? `X ${pos.x}  Y ${pos.y}` : "X —  Y —";
    }
  };

  const currentPaintChannels = () => ({
    pixels: pixelsRef.current,
    emissivePixels: emissivePixelsRef.current,
    shinePixels: shinePixelsRef.current,
  });

  const applyPaintChannels = (channels: {
    pixels: string[];
    emissivePixels?: string[];
    shinePixels?: string[];
  }) => {
    const px = channels.pixels;
    const em = channels.emissivePixels ?? emissivePixelsRef.current;
    const sh = channels.shinePixels ?? shinePixelsRef.current;
    pixelsRef.current = px;
    emissivePixelsRef.current = em;
    shinePixelsRef.current = sh;
    setPixels(px);
    setEmissivePixels(em);
    setShinePixels(sh);
    applyToTileset(px, em, sh);
  };

  const resetSelectionDrag = () => {
    selectionAnchorRef.current = null;
    lassoPointsRef.current = null;
    selectionMoveRef.current = null;
    if (selectionOverlayRef.current) selectionOverlayRef.current.style.transform = "";
  };

  const selectWithMagicWand = (point: PixelPoint, shiftKey: boolean, altKey: boolean) => {
    const sampled = magicWandSelection(
      pixelsRef.current,
      size,
      size,
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
    const combined = combinePixelSelections(current, sampled, mode, size, size);
    setSelection(combined?.rect ?? null);
    setSelectionMask(combined?.mask ?? null);
  };

  const beginSelection = (point: PixelPoint) => {
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
    const moving = selectionMoveRef.current;
    if (moving) {
      moving.dx = Math.max(
        -moving.rect.x,
        Math.min(size - moving.rect.x - moving.rect.w, point.x - moving.start.x),
      );
      moving.dy = Math.max(
        -moving.rect.y,
        Math.min(size - moving.rect.y - moving.rect.h, point.y - moving.start.y),
      );
      if (selectionOverlayRef.current) {
        selectionOverlayRef.current.style.transform = `translate(${moving.dx * scaleRef.current}px, ${moving.dy * scaleRef.current}px)`;
      }
      return;
    }
    const lassoPoints = lassoPointsRef.current;
    if (lassoPoints) {
      const previous = lassoPoints[lassoPoints.length - 1];
      if (!previous || previous.x !== point.x || previous.y !== point.y) lassoPoints.push(point);
      const shape = pixelSelectionFromPolygon(lassoPoints, size, size);
      if (shape) {
        setSelection(shape.rect);
        setSelectionMask(shape.mask ?? null);
      }
      return;
    }
    const anchor = selectionAnchorRef.current;
    if (anchor) setSelection(pixelRectFromPoints(anchor, point, size, size));
  };

  const finishSelectionDrag = () => {
    const moving = selectionMoveRef.current;
    if (moving && (moving.dx !== 0 || moving.dy !== 0)) {
      pushHistory();
      const moved = movePixelSelection(
        currentPaintChannels(),
        size,
        size,
        moving.rect,
        moving.dx,
        moving.dy,
        selectionMaskRef.current ?? undefined,
      );
      applyPaintChannels(moved.channels);
      setSelection(moved.rect);
      setSelectionMask(moved.mask ?? null);
    }
    resetSelectionDrag();
  };

  const beginSelectionScale = (
    handle: PixelScaleHandle,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const active = selectionRef.current;
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    selectionScaleRef.current = {
      handle,
      source: active,
      target: active,
      mask: selectionMaskRef.current ? [...selectionMaskRef.current] : undefined,
    };
  };

  const updateSelectionScale = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const sizing = selectionScaleRef.current;
    if (!sizing) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pixelFromEvent(event.clientX, event.clientY);
    if (!point) return;
    const target = pixelRectFromScaleHandle(
      sizing.source,
      sizing.handle,
      point,
      size,
      size,
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
    pushHistory();
    const resized = resizePixelSelection(
      currentPaintChannels(),
      size,
      size,
      source,
      target,
      sizing.mask,
    );
    applyPaintChannels(resized.channels);
    setSelection(resized.rect);
    setSelectionMask(resized.mask ?? null);
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

  const transformSelection = (transform: PixelTransform) => {
    const active = selectionRef.current;
    if (!active) return;
    pushHistory();
    const next = transformPixelSelection(
      currentPaintChannels(),
      size,
      size,
      active,
      transform,
      selectionMaskRef.current ?? undefined,
    );
    applyPaintChannels(next.channels);
    setSelection(next.rect);
    setSelectionMask(next.mask ?? null);
  };

  const deleteSelection = () => {
    const active = selectionRef.current;
    if (!active) return;
    pushHistory();
    applyPaintChannels(
      clearPixelSelection(
        currentPaintChannels(),
        size,
        size,
        active,
        selectionMaskRef.current ?? undefined,
      ),
    );
  };

  const pickColorAt = (clientX: number, clientY: number) => {
    const pos = pixelFromEvent(clientX, clientY);
    if (!pos) return;
    const c = pixelsRef.current[pos.idx] ?? "";
    chooseForegroundColor(c === "" ? "#00000000" : c);
    setTool("paint");
  };

  const applyShapeTarget = (channel: ShapeChannel, next: string[]) => {
    if (channel === "glow") {
      emissivePixelsRef.current = next;
      setEmissivePixels(next);
    } else if (channel === "shine") {
      shinePixelsRef.current = next;
      setShinePixels(next);
    } else {
      pixelsRef.current = next;
      setPixels(next);
    }
  };

  const updateBrushStroke = (point: PixelPoint) => {
    const stroke = brushStrokeRef.current;
    if (!stroke) return;
    stroke.path = extendPixelStroke(
      stroke.path,
      point,
      stroke.spacing,
      stroke.pixelPerfect && stroke.size === 1,
    );
    const preview = paintPixelBrushStroke(
      stroke.base,
      size,
      size,
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
    const channel: ShapeChannel = toolRef.current === "glow"
      ? "glow"
      : toolRef.current === "shine"
        ? "shine"
        : "color";
    const base = channel === "glow"
      ? emissivePixelsRef.current
      : channel === "shine"
        ? shinePixelsRef.current
        : pixelsRef.current;
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
    applyToTileset(
      pixelsRef.current,
      emissivePixelsRef.current,
      shinePixelsRef.current,
    );
  };

  const cancelBrushStroke = () => {
    const stroke = brushStrokeRef.current;
    if (!stroke) return;
    brushStrokeRef.current = null;
    restorePaintSnapshot(stroke.snapshot);
  };

  const fillAt = (point: PixelPoint) => {
    const channel = shapeChannel;
    const base = channel === "glow"
      ? emissivePixelsRef.current
      : channel === "shine"
        ? shinePixelsRef.current
        : pixelsRef.current;
    const filled = paintPixelFill(
      base,
      size,
      size,
      point,
      color === "#00000000" ? "" : color,
      fillTolerance,
      fillContiguous,
      symmetryRef.current,
    );
    if (!filled.changed) return;
    pushHistory();
    applyShapeTarget(channel, filled.pixels);
    applyToTileset(
      pixelsRef.current,
      emissivePixelsRef.current,
      shinePixelsRef.current,
    );
  };

  const updateShapeDrag = (point: PixelPoint, constrained: boolean) => {
    const drag = shapeDragRef.current;
    if (!drag) return;
    const rawEnd = constrainPixelShapeEnd(drag.kind, drag.start, point, constrained);
    const end = {
      x: Math.max(0, Math.min(size - 1, rawEnd.x)),
      y: Math.max(0, Math.min(size - 1, rawEnd.y)),
    };
    const preview = paintPixelShape(
      drag.base,
      size,
      size,
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
    const base = shapeChannel === "glow"
      ? emissivePixelsRef.current
      : shapeChannel === "shine"
        ? shinePixelsRef.current
        : pixelsRef.current;
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
    applyToTileset(
      pixelsRef.current,
      emissivePixelsRef.current,
      shinePixelsRef.current,
    );
  };

  const cancelShapeDrag = () => {
    const drag = shapeDragRef.current;
    if (!drag) return;
    shapeDragRef.current = null;
    restorePaintSnapshot(drag.snapshot);
  };

  const commitPixels = (next: string[]) => {
    pushHistory();
    pixelsRef.current = next;
    setPixels(next);
    applyToTileset(next, emissivePixelsRef.current, shinePixelsRef.current);
  };

  const copyPixels = useCallback(() => {
    const active = selectionRef.current;
    const clip = active
      ? extractPixelSelection(
          currentPaintChannels(),
          size,
          size,
          active,
          selectionMaskRef.current ?? undefined,
        )
      : null;
    copyPixelArtChannels(
      clip?.width ?? size,
      clip?.height ?? size,
      clip ?? currentPaintChannels(),
      clip?.mask,
    );
    setClipReady(true);
  }, [size]);

  const selectAllPixels = () => {
    setSelection({ x: 0, y: 0, w: size, h: size });
    setSelectionMask(null);
    setTool("select");
  };

  const invertSelection = () => {
    const current = selectionRef.current
      ? { rect: selectionRef.current, mask: selectionMaskRef.current ?? undefined }
      : null;
    const inverted = invertPixelSelection(current, size, size);
    setSelection(inverted?.rect ?? null);
    setSelectionMask(inverted?.mask ?? null);
  };

  const cutSelection = () => {
    const active = selectionRef.current;
    if (!active) return;
    copyPixels();
    pushHistory();
    applyPaintChannels(
      clearPixelSelection(
        currentPaintChannels(),
        size,
        size,
        active,
        selectionMaskRef.current ?? undefined,
      ),
    );
  };

  const duplicateSelection = () => {
    const active = selectionRef.current;
    if (!active) return;
    const dx = active.x + active.w < size ? 1 : active.x > 0 ? -1 : 0;
    const dy = active.y + active.h < size ? 1 : active.y > 0 ? -1 : 0;
    if (dx === 0 && dy === 0) return;
    pushHistory();
    const duplicated = duplicatePixelSelection(
      currentPaintChannels(),
      size,
      size,
      active,
      dx,
      dy,
      selectionMaskRef.current ?? undefined,
    );
    applyPaintChannels(duplicated.channels);
    setSelection(duplicated.rect);
    setSelectionMask(duplicated.mask ?? null);
    setTool("select");
  };

  const pastePixels = useCallback(() => {
    const active = selectionRef.current;
    const clip = peekPixelClipboard();
    if (
      (active || toolRef.current === "select" || toolRef.current === "lasso" || toolRef.current === "wand") &&
      clip
    ) {
      pushHistory();
      const pasted = pastePixelSelection(
        currentPaintChannels(),
        size,
        size,
        clip,
        active?.x ?? 0,
        active?.y ?? 0,
      );
      applyPaintChannels(pasted.channels);
      setSelection(pasted.rect);
      setSelectionMask(pasted.mask ?? null);
      setTool("select");
      return;
    }
    const next = pastePixelArt(size);
    if (!next) return;
    pushHistory();
    pixelsRef.current = next;
    setPixels(next);
    applyToTileset(next, emissivePixelsRef.current, shinePixelsRef.current);
  }, [pushHistory, size]);

  const replacePaletteColor = (tolerance: number) => {
    const replaced = replacePixelPaletteColor(
      pixelsRef.current,
      size,
      size,
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
    pixelsRef.current = replaced.pixels;
    setPixels(replaced.pixels);
    applyToTileset(
      replaced.pixels,
      emissivePixelsRef.current,
      shinePixelsRef.current,
    );
  };

  const currentColorSelection = () => selectionRef.current
    ? {
        rect: selectionRef.current,
        mask: selectionMaskRef.current ?? undefined,
      }
    : undefined;

  const commitColorOperation = (result: PixelColorOperationResult) => {
    if (!result.changed) return;
    pushHistory();
    pixelsRef.current = result.pixels;
    setPixels(result.pixels);
    applyToTileset(
      result.pixels,
      emissivePixelsRef.current,
      shinePixelsRef.current,
    );
  };

  const adjustActiveColors = (adjustments: PixelColorAdjustments) => {
    commitColorOperation(adjustPixelColors(
      pixelsRef.current,
      size,
      size,
      adjustments,
      currentColorSelection(),
    ));
  };

  const quantizeActiveColors = (
    colors: number,
    dither: PixelColorDitherMode,
    strength: number,
  ) => {
    commitColorOperation(quantizePixelColors(
      pixelsRef.current,
      size,
      size,
      colors,
      dither,
      strength,
      currentColorSelection(),
    ));
  };

  const outlineActiveColors = (thickness: number, diagonal: boolean) => {
    commitColorOperation(outlinePixelColors(
      pixelsRef.current,
      size,
      size,
      colorRef.current,
      thickness,
      diagonal,
      currentColorSelection(),
    ));
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
          cancelShapeDrag();
          cancelBrushStroke();
          setSelection(null);
          setSelectionMask(null);
          resetSelectionDrag();
          selectionScaleRef.current = null;
        } else if (e.code === "KeyM") setTool("select");
        else if (e.code === "KeyL") setTool("lasso");
        else if (e.code === "KeyW") setTool("wand");
        else if (e.code === "KeyF") setTool("fill");
        else if (e.code === "KeyU") {
          setTool((current) => current === "line" ? "rect" : current === "rect" ? "ellipse" : "line");
        }
        else if ((e.code === "Delete" || e.code === "Backspace") && selectionRef.current) {
          deleteSelection();
        } else if (e.code.startsWith("Arrow") && selectionRef.current) {
          const dx = e.code === "ArrowLeft" ? -1 : e.code === "ArrowRight" ? 1 : 0;
          const dy = e.code === "ArrowUp" ? -1 : e.code === "ArrowDown" ? 1 : 0;
          pushHistory();
          const moved = movePixelSelection(
            currentPaintChannels(),
            size,
            size,
            selectionRef.current,
            dx,
            dy,
            selectionMaskRef.current ?? undefined,
          );
          applyPaintChannels(moved.channels);
          setSelection(moved.rect);
          setSelectionMask(moved.mask ?? null);
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
      else if (isCopy) copyPixels();
      else pastePixels();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    undo,
    redo,
    copyPixels,
    pastePixels,
    canvasNavigation.fit,
    canvasNavigation.zoom100,
  ]);

  const patchCurrentTile = (patch: Partial<EmberTilesetTile>) => {
    const ts = tilesetRef.current;
    const id = tileIdRef.current;
    const tiles = ts.tiles.map((t) => {
      if (t.id !== id) return t;
      const next = { ...t, ...patch };
      if (patch.pixels) {
        topPixelsRef.current = [...patch.pixels];
        next.color =
          patch.color ?? dominantColor(patch.pixels) ?? t.color;
      }
      if (patch.wallPixels) {
        wallPixelsRef.current = [...patch.wallPixels];
      }
      return next;
    });
    onChangeRef.current({ ...ts, tiles, tileCount: tiles.length });
  };

  const savePreset = () => {
    const face = editFaceRef.current;
    const faceList = allPresets.filter((p) => presetFaceOf(p) === face);
    const name =
      presetName.trim() ||
      `${face === "wall" ? "Стена" : "Верх"} ${faceList.length + 1}`;
    const color = dominantColor(pixelsRef.current) || tile?.color || "#2f4a30";
    const entry: EmberTilePreset = {
      id: newPresetId(),
      name,
      pixels: [...pixelsRef.current],
      color,
      face,
    };
    const existingIdx = allPresets.findIndex(
      (p) =>
        presetFaceOf(p) === face &&
        p.name.toLowerCase() === name.toLowerCase(),
    );
    const nextPresets =
      existingIdx >= 0
        ? allPresets.map((p, i) =>
            i === existingIdx ? { ...entry, id: p.id } : p,
          )
        : [...allPresets, entry];
    if (face === "wall") {
      patchCurrentTile({
        wallPixels: [...pixelsRef.current],
        presets: nextPresets,
      });
    } else {
      patchCurrentTile({
        pixels: [...pixelsRef.current],
        color,
        presets: nextPresets,
      });
    }
    setPresetName("");
    onSaved(
      existingIdx >= 0
        ? `Пресет «${name}» (${face === "wall" ? "стена" : "верх"}) обновлён`
        : `Пресет «${name}» (${face === "wall" ? "стена" : "верх"}) добавлен`,
    );
  };

  const loadPreset = (preset: EmberTilePreset) => {
    if (preset.pixels.length !== size * size) return;
    const face = presetFaceOf(preset);
    if (editFaceRef.current !== face) {
      applyToTileset(pixelsRef.current);
      clearHistory();
      brushStrokeRef.current = null;
      setEditFace(face);
      editFaceRef.current = face;
    }
    commitPixels([...preset.pixels]);
  };

  const overwritePreset = (preset: EmberTilePreset) => {
    const face = presetFaceOf(preset);
    if (editFaceRef.current !== face) {
      onSaved(
        face === "wall"
          ? "Переключись на «Стена», чтобы перезаписать этот пресет"
          : "Переключись на «Верх», чтобы перезаписать этот пресет",
      );
      return;
    }
    const color = dominantColor(pixelsRef.current) || preset.color;
    const nextPresets = allPresets.map((p) =>
      p.id === preset.id
        ? {
            ...p,
            pixels: [...pixelsRef.current],
            color,
            face,
          }
        : p,
    );
    if (face === "wall") {
      patchCurrentTile({
        wallPixels: [...pixelsRef.current],
        presets: nextPresets,
      });
    } else {
      patchCurrentTile({
        pixels: [...pixelsRef.current],
        color,
        presets: nextPresets,
      });
    }
    onSaved(`Пресет «${preset.name}» перезаписан`);
  };

  const deletePreset = (presetId: string) => {
    patchCurrentTile({
      presets: allPresets.filter((p) => p.id !== presetId),
    });
  };

  const save = async () => {
    applyToTileset(
      pixelsRef.current,
      emissivePixelsRef.current,
      shinePixelsRef.current,
    );
    const emTop = emissiveTopRef.current;
    const emWall = emissiveWallRef.current;
    const shTop = shineTopRef.current;
    const shWall = shineWallRef.current;
    const hasEmTop = emTop.some((c) => c && c !== "#00000000");
    const hasEmWall = emWall.some((c) => c && c !== "#00000000");
    const hasShTop = shTop.some((c) => c && c !== "#00000000");
    const hasShWall = shWall.some((c) => c && c !== "#00000000");
    const hasAnyEm = hasEmTop || hasEmWall;
    const anim = hasAnyEm ? emissiveAnimRef.current : undefined;
    const isTrig = anim === "trigger";
    const isPulse = anim === "pulse";
    const isFlicker = anim === "flicker";
    const flickerRange = isFlicker
      ? resolveEmissiveFlickerPeriodRange(
          emissiveAnimPeriodMinRef.current,
          emissiveAnimPeriodMaxRef.current,
        )
      : null;
    const next: EmberTileset = {
      ...tilesetRef.current,
      tiles: tilesetRef.current.tiles.map((t) =>
        t.id === tileId
          ? {
              ...t,
              pixels: [...topPixelsRef.current],
              wallPixels: [...wallPixelsRef.current],
              color:
                dominantColor(topPixelsRef.current) || t.color,
              transparent: transparentTileRef.current ? true : undefined,
              opacity: transparentTileRef.current
                ? clampTileOpacity(tileOpacityRef.current)
                : undefined,
              waterReflectMult: isWaterTile(t)
                ? waterReflectMultRef.current
                : undefined,
              waterStripeAxis: isWaterTile(t)
                ? waterStripeAxisRef.current
                : undefined,
              waterGlintBright: isWaterTile(t)
                ? waterGlintBrightRef.current
                : undefined,
              waterWarpStrength: isWaterTile(t)
                ? waterWarpStrengthRef.current
                : undefined,
              waterWarpSpeed: isWaterTile(t)
                ? waterWarpSpeedRef.current
                : undefined,
              emissivePixels: hasEmTop ? [...emTop] : undefined,
              emissiveWallPixels: hasEmWall ? [...emWall] : undefined,
              shinePixels: hasShTop ? [...shTop] : undefined,
              shineWallPixels: hasShWall ? [...shWall] : undefined,
              emissiveAnim: anim,
              emissiveEnabled: hasAnyEm
                ? emissiveEnabledRef.current
                  ? undefined
                  : false
                : undefined,
              emissiveStrength: hasAnyEm
                ? emissiveStrengthRef.current
                : undefined,
              emissiveBloomColor:
                hasAnyEm && emissiveBloomCustomRef.current
                  ? normalizeEmissiveBloomColor(emissiveBloomColorRef.current)
                  : undefined,
              emissiveCastsLight:
                hasAnyEm &&
                emissiveEnabledRef.current &&
                emissiveCastsLightRef.current
                  ? true
                  : undefined,
              emissiveLightRange:
                hasAnyEm &&
                emissiveEnabledRef.current &&
                emissiveCastsLightRef.current
                  ? resolveEmissiveLightRange(emissiveLightRangeRef.current)
                  : undefined,
              emissiveLightShadows:
                hasAnyEm &&
                emissiveEnabledRef.current &&
                emissiveCastsLightRef.current &&
                emissiveLightShadowsRef.current
                  ? true
                  : undefined,
              emissiveAnimPeriod: isPulse
                ? emissiveAnimPeriodRef.current
                : undefined,
              emissiveAnimPeriodMin: flickerRange?.min,
              emissiveAnimPeriodMax: flickerRange?.max,
              emissiveTriggerWhen: isTrig
                ? emissiveTriggerWhenRef.current
                : undefined,
              emissiveTriggerRadius: isTrig
                ? emissiveTriggerRadiusRef.current
                : undefined,
              emissiveTriggerEventId:
                isTrig && emissiveTriggerWhenRef.current === "event"
                  ? emissiveTriggerEventIdRef.current || undefined
                  : undefined,
            }
          : t,
      ),
    };
    onChange(next);
    const res = await writeEmberJson(`tilesets/${tileset.id}.json`, next);
    onSaved(
      res.ok
        ? `Тайлсет сохранён (${res.source})`
        : `Ошибка: ${"error" in res ? res.error : "?"}`,
    );
  };

  const faceLabel = editFace === "wall" ? "Стена" : "Верх";
  const hasEmissiveInk =
    emissivePixels.some((c) => c && c !== "#00000000") ||
    emissiveTopRef.current.some((c) => c && c !== "#00000000") ||
    emissiveWallRef.current.some((c) => c && c !== "#00000000");
  const showEmissivePanel = tool === "glow" || hasEmissiveInk;

  const presetPickerItems = useMemo(
    () =>
      facePresets.map((p) => ({
        id: p.id,
        label: p.name,
        title: p.name,
        thumb: (
          <PixelThumb
            pixels={p.pixels}
            color={p.color}
            face={presetFaceOf(p)}
            size={48}
            className="ember-thumb-pixel"
          />
        ),
        footer: (
          <>
            <button
              type="button"
              className="ember-tile-preset__btn"
              title="Заменить пресет текущим рисунком"
              onClick={(e) => {
                e.stopPropagation();
                overwritePreset(p);
              }}
            >
              ↑
            </button>
            <button
              type="button"
              className="ember-tile-preset__btn ember-tile-preset__btn--danger"
              title="Удалить пресет"
              onClick={(e) => {
                e.stopPropagation();
                deletePreset(p.id);
              }}
            >
              ×
            </button>
          </>
        ),
      })),
    // overwrite/delete close over latest via refs inside those fns
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facePresets],
  );

  return (
    <div className="ember-tile-root">
      {showOpenPicker ? (
        <div className="ember-ed-open-picker ember-ed-open-picker--overlay">
          <div className="ember-ed-open-picker__shell">
            <header className="ember-ed-open-picker__hero">
              <div className="ember-ed-open-picker__hero-text">
                <p className="ember-ed-open-picker__eyebrow">Тайлы</p>
                <h3 className="ember-ed-open-picker__title">Открыть тайл</h3>
                <p className="muted ember-ed-open-picker__hint">
                  Выберите тайл для редактирования. В следующий раз откроется
                  последний выбранный.
                </p>
              </div>
            </header>
            <label className="ember-studio-search">
              <span aria-hidden>⌕</span>
              <input
                type="search"
                value={tileQuery}
                onChange={(e) => setTileQuery(e.target.value)}
                placeholder="Имя или ID тайла"
                aria-label="Поиск тайлов"
              />
            </label>
            <div className="ember-ed-open-picker__scroll">
              <div className="ember-ed-open-picker__grid" role="listbox">
                {tileset.tiles
                  .filter((t) => {
                    const q = tileQuery.trim().toLocaleLowerCase("ru");
                    return !q || `${t.id} ${t.name}`.toLocaleLowerCase("ru").includes(q);
                  })
                  .map((t) => {
                  const topPx =
                    t.pixels && t.pixels.length === size * size
                      ? t.pixels
                      : emptyPixels(
                          size,
                          t.color === "#00000000" ? "" : t.color,
                        );
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="option"
                      className="ember-ed-open-picker__swatch"
                      title={`#${t.id} ${t.name}`}
                      onClick={() => selectTile(t.id)}
                    >
                      <PixelThumb
                        pixels={topPx}
                        color={t.color}
                        size={56}
                        className="ember-thumb-pixel"
                      />
                      <span>
                        #{t.id} {t.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="ember-tile-editor">
        <aside className="ember-tile-list">
          <div className="ember-tile-list__head">
            <h3 className="ember-tile-list__title">Навигатор тайлов</h3>
            <div className="ember-chip-row" role="group" aria-label="Создать">
              <button
                type="button"
                className="ember-chip ember-chip--sm"
                title="Пустой тайл с новым id"
                onClick={createBlankTile}
              >
                +
              </button>
              <button
                type="button"
                className="ember-chip ember-chip--sm"
                title="Клон текущего тайла"
                onClick={cloneCurrentTile}
              >
                ⧉
              </button>
              <button
                type="button"
                className="ember-chip ember-chip--sm ember-danger"
                title="Удалить тайл из тайлсета (не клетку на карте)"
                onClick={deleteCurrentTile}
              >
                ×
              </button>
            </div>
          </div>
          <label className="ember-studio-search ember-studio-search--dock">
            <span aria-hidden>⌕</span>
            <input
              type="search"
              value={tileQuery}
              onChange={(e) => setTileQuery(e.target.value)}
              placeholder="Фильтр…"
              aria-label="Фильтр тайлов"
            />
          </label>
          <div
            className="ember-tile-pick"
            role="listbox"
            aria-label="Тайлы"
          >
            {tileset.tiles
              .filter((t) => {
                const q = tileQuery.trim().toLocaleLowerCase("ru");
                return !q || `${t.id} ${t.name}`.toLocaleLowerCase("ru").includes(q);
              })
              .map((t) => {
              const topPx =
                t.pixels && t.pixels.length === size * size
                  ? t.pixels
                  : emptyPixels(
                      size,
                      t.color === "#00000000" ? "" : t.color,
                    );
              const active = t.id === tileId;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`ember-tile-pick__cell ${active ? "is-active" : ""}`}
                  title={`#${t.id} ${t.name}`}
                  onClick={() => selectTile(t.id)}
                >
                  <span className="ember-tile-pick__face">
                    <PixelThumb
                      pixels={topPx}
                      color={t.color}
                      face="top"
                      size={64}
                      className="ember-tile-pick__canvas"
                    />
                  </span>
                  <span className="ember-tile-pick__name">{t.name}</span>
                </button>
              );
            })}
          </div>

          <div className="ember-tile-presets">
            <div className="ember-tile-presets__head">
              <h3 className="ember-tile-list__title">Пресеты</h3>
              <div
                className="ember-seg ember-seg--sm"
                role="group"
                aria-label="Грань пресетов"
              >
                <button
                  type="button"
                  className={`ember-seg__btn ${editFace === "top" ? "is-active" : ""}`}
                  onClick={() => switchEditFace("top")}
                >
                  ↑
                  {topPresetCount > 0 ? (
                    <span className="ember-seg__count">{topPresetCount}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className={`ember-seg__btn ${editFace === "wall" ? "is-active" : ""}`}
                  onClick={() => switchEditFace("wall")}
                >
                  ║
                  {wallPresetCount > 0 ? (
                    <span className="ember-seg__count">{wallPresetCount}</span>
                  ) : null}
                </button>
              </div>
            </div>
            <div className="ember-tile-presets__save">
              <input
                type="text"
                className="ember-tile-presets__input"
                placeholder={faceLabel}
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    savePreset();
                  }
                }}
              />
              <button
                type="button"
                className="ember-chip ember-chip--sm"
                onClick={savePreset}
                title="Сохранить пресет грани"
              >
                +
              </button>
            </div>
            <EmberThumbGrid
              size="sm"
              selectedId={null}
              onSelect={(id) => {
                const p = facePresets.find((x) => x.id === id);
                if (p) loadPreset(p);
              }}
              items={presetPickerItems}
              empty={
                <p className="muted ember-hint">Нет пресетов «{faceLabel}»</p>
              }
            />
          </div>
        </aside>

        <div className="ember-tile-main">
          <div className="ember-tile-chrome">
            <div
              className="ember-seg ember-seg--sm"
              role="group"
              aria-label="Грань"
            >
              <button
                type="button"
                className={`ember-seg__btn ${editFace === "top" ? "is-active" : ""}`}
                onClick={() => switchEditFace("top")}
                title="Верхняя грань"
              >
                Верх
              </button>
              <button
                type="button"
                className={`ember-seg__btn ${editFace === "wall" ? "is-active" : ""}`}
                onClick={() => switchEditFace("wall")}
                title="Боковая грань / обрыв"
              >
                Стена
              </button>
            </div>
            <span className="ember-tile-chrome__name">
              {tile?.name ?? "?"}
              <span className="muted"> · {size}×{size}</span>
            </span>
            <div
              className="ember-chip-row"
              role="group"
              aria-label="Материал"
              title="Как поверхность ловит фонарь (камень тусклый, металл блестит, ткань гасит)"
            >
              {EMBER_MATERIAL_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`ember-chip ember-chip--sm ${material === kind ? "is-active" : ""}`}
                  onClick={() => {
                    setMaterial(kind);
                    materialRef.current = kind;
                    applyToTileset(
                      pixelsRef.current,
                      emissivePixelsRef.current,
                      shinePixelsRef.current,
                    );
                  }}
                >
                  {EMBER_MATERIAL_LABELS_RU[kind]}
                </button>
              ))}
            </div>
            <label
              className="muted"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
                fontSize: "0.68rem",
              }}
              title="Включить alpha blending для тайла в Three preview/play"
            >
              <input
                type="checkbox"
                checked={transparentTile}
                onChange={(e) => {
                  const on = e.target.checked;
                  setTransparentTile(on);
                  transparentTileRef.current = on;
                  if (on && tileOpacityRef.current >= 0.999) {
                    setTileOpacity(0.7);
                    tileOpacityRef.current = 0.7;
                  }
                  applyToTileset(
                    pixelsRef.current,
                    emissivePixelsRef.current,
                    shinePixelsRef.current,
                  );
                }}
              />
              прозр.
              <input
                type="range"
                min={0.15}
                max={1}
                step={0.01}
                disabled={!transparentTile}
                value={tileOpacity}
                onChange={(e) => {
                  const v = clampTileOpacity(Number(e.target.value));
                  setTileOpacity(v);
                  tileOpacityRef.current = v;
                }}
                onPointerUp={() =>
                  applyToTileset(
                    pixelsRef.current,
                    emissivePixelsRef.current,
                    shinePixelsRef.current,
                  )
                }
                style={{
                  width: "4rem",
                  opacity: transparentTile ? 1 : 0.35,
                }}
              />
              <span style={{ opacity: transparentTile ? 1 : 0.35 }}>
                {tileOpacity.toFixed(2)}
              </span>
            </label>
            {tile && isWaterTile(tile) ? (
              <label
                className="muted"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  fontSize: "0.68rem",
                }}
                title="Разрешение планарного зеркала воды (NearestFilter): 1× ≈ 1/5 экрана, 8× ≈ почти полный кадр"
              >
                отраж. рез.
                <input
                  type="range"
                  min={0}
                  max={EMBER_ENV_VOXEL_MULTS.length - 1}
                  step={1}
                  value={Math.max(
                    0,
                    EMBER_ENV_VOXEL_MULTS.indexOf(waterReflectMult),
                  )}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    const next =
                      EMBER_ENV_VOXEL_MULTS[idx] ?? DEFAULT_WATER_REFLECT_MULT;
                    setWaterReflectMult(next);
                    waterReflectMultRef.current = next;
                  }}
                  onPointerUp={() =>
                    applyToTileset(
                      pixelsRef.current,
                      emissivePixelsRef.current,
                      shinePixelsRef.current,
                    )
                  }
                  style={{ width: "4.5rem" }}
                />
                <span>×{waterReflectMult}</span>
              </label>
            ) : null}
            {tile && isWaterTile(tile) ? (
              <label
                className="muted"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  fontSize: "0.68rem",
                }}
                title="Ось полос на спокойной воде: верт. = по X, гориз. = по Z"
              >
                полосы
                <select
                  value={waterStripeAxis}
                  onChange={(e) => {
                    const next = e.target.value === "z" ? "z" : "x";
                    setWaterStripeAxis(next);
                    waterStripeAxisRef.current = next;
                    applyToTileset(
                      pixelsRef.current,
                      emissivePixelsRef.current,
                      shinePixelsRef.current,
                    );
                  }}
                  style={{ fontSize: "0.68rem" }}
                >
                  <option value="x">верт.</option>
                  <option value="z">гориз.</option>
                </select>
              </label>
            ) : null}
            {tile && isWaterTile(tile) ? (
              <label
                className="muted"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  fontSize: "0.68rem",
                }}
                title="Общая яркость бликов на воде (0 = выкл, 1 = норма, 2 = ярко). Под лампами всё ещё сильнее."
              >
                блики
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={waterGlintBright}
                  onChange={(e) => {
                    const next = resolveWaterGlintBright(Number(e.target.value));
                    setWaterGlintBright(next);
                    waterGlintBrightRef.current = next;
                  }}
                  onPointerUp={() =>
                    applyToTileset(
                      pixelsRef.current,
                      emissivePixelsRef.current,
                      shinePixelsRef.current,
                    )
                  }
                  style={{ width: "4.5rem" }}
                />
                <span>×{waterGlintBright.toFixed(2)}</span>
              </label>
            ) : null}
            {tile && isWaterTile(tile) ? (
              <label
                className="muted"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  fontSize: "0.68rem",
                }}
                title="Сила искажения отражения в пикселях зеркала (0 = ровно, 1 = норма, 3 = сильно)"
              >
                искаж.
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.05}
                  value={waterWarpStrength}
                  onChange={(e) => {
                    const next = resolveWaterWarpStrength(Number(e.target.value));
                    setWaterWarpStrength(next);
                    waterWarpStrengthRef.current = next;
                  }}
                  onPointerUp={() =>
                    applyToTileset(
                      pixelsRef.current,
                      emissivePixelsRef.current,
                      shinePixelsRef.current,
                    )
                  }
                  style={{ width: "4.5rem" }}
                />
                <span>×{waterWarpStrength.toFixed(2)}</span>
              </label>
            ) : null}
            {tile && isWaterTile(tile) ? (
              <label
                className="muted"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  fontSize: "0.68rem",
                }}
                title="Скорость пульсации искажений отражения (0 = заморожено, 1 = норма, 3 = быстро)"
              >
                искаж. скор.
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.05}
                  value={waterWarpSpeed}
                  onChange={(e) => {
                    const next = resolveWaterWarpSpeed(Number(e.target.value));
                    setWaterWarpSpeed(next);
                    waterWarpSpeedRef.current = next;
                  }}
                  onPointerUp={() =>
                    applyToTileset(
                      pixelsRef.current,
                      emissivePixelsRef.current,
                      shinePixelsRef.current,
                    )
                  }
                  style={{ width: "4.5rem" }}
                />
                <span>×{waterWarpSpeed.toFixed(2)}</span>
              </label>
            ) : null}
            <button
              type="button"
              className="primary"
              onClick={() => void save()}
            >
              Сохранить
            </button>
          </div>

          <div
            className="ember-tile-toolstrip"
            role="toolbar"
            aria-label="Кисть и правки"
          >
            <div className="ember-tile-toolstrip__row ember-tile-toolstrip__row--tools">
              <span className="ember-tile-toolstrip__label">Кисть</span>
              <div className="ember-chip-row">
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
                  onClick={() => setTool("paint")}
                  title="Обычные пиксели · B / ЛКМ"
                >
                  <PixelToolIcon name="brush" /> Кисть
                </button>
                <button
                  type="button"
                  className={`ember-chip ember-chip--sm ${tool === "glow" ? "is-active" : ""}`}
                  onClick={() => setTool("glow")}
                  title="Светящиеся пиксели · ✦"
                >
                  <PixelToolIcon name="glow" /> Свечение
                </button>
                <button
                  type="button"
                  className={`ember-chip ember-chip--sm ${tool === "shine" ? "is-active" : ""}`}
                  onClick={() => setTool("shine")}
                  title="Блеск · wet / metal · яркий = зеркало на полу"
                >
                  <PixelToolIcon name="shine" /> Блеск
                </button>
                <button
                  type="button"
                  className={`ember-chip ember-chip--sm ${tool === "eyedrop" ? "is-active" : ""}`}
                  onClick={() => setTool("eyedrop")}
                  title="Пипетка · I / ПКМ"
                >
                  <PixelToolIcon name="eyedropper" /> Пипетка
                </button>
              </div>
              <div className="ember-chip-row ember-tile-toolstrip__sizes">
                {([1, 2, 3, 4] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`ember-chip ember-chip--sm ${brushSize === n ? "is-active" : ""}`}
                    onClick={() => {
                      setBrushSize(n);
                      if (!pixelShapeKind(tool)) setTool("paint");
                    }}
                    title={`Размер ${n}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="ember-chip-row ember-pixel-symmetry" role="group" aria-label="Симметрия рисования">
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
              <div className="ember-chip-row ember-pixel-navigation-controls" role="group" aria-label="Навигация холста">
                <button
                  type="button"
                  className={`ghost ember-chip--sm ${canvasNavigation.handMode ? "is-active" : ""}`}
                  aria-pressed={canvasNavigation.handMode}
                  onClick={() => canvasNavigation.setHandMode((value) => !value)}
                  title="Рука · удерживать Space или среднюю кнопку мыши"
                >
                  <PixelToolIcon name="hand" /> Рука
                </button>
                <button type="button" className="ghost ember-chip--sm" onClick={canvasNavigation.zoomOut} title="Отдалить">−</button>
                <button type="button" className="ghost ember-chip--sm" onClick={canvasNavigation.fit} title="Вписать в окно · Ctrl+0"><PixelToolIcon name="fit" /> Вписать</button>
                <button type="button" className="ghost ember-chip--sm" onClick={canvasNavigation.zoom100} title="Масштаб 100% · Ctrl+1">100%</button>
                <button type="button" className="ghost ember-chip--sm" onClick={canvasNavigation.zoomIn} title="Приблизить">+</button>
                <button
                  type="button"
                  className={`ghost ember-chip--sm ${canvasNavigation.navigatorVisible ? "is-active" : ""}`}
                  aria-pressed={canvasNavigation.navigatorVisible}
                  onClick={() => canvasNavigation.setNavigatorVisible((value) => !value)}
                  title="Показать или скрыть навигатор"
                >
                  <PixelToolIcon name="navigator" /> Навигатор
                </button>
                <span className="muted ember-pixel-navigation-controls__zoom">{canvasNavigation.zoomPercent}%</span>
              </div>
              <div className="ember-chip-row ember-tile-toolstrip__edits">
                <button
                  type="button"
                  className="ghost ember-chip--sm"
                  onClick={undo}
                  disabled={historyLen === 0}
                  title="Undo"
                >
                  <PixelToolIcon name="undo" /> Отмена
                </button>
                <button
                  type="button"
                  className="ghost ember-chip--sm"
                  onClick={redo}
                  disabled={redoLen === 0}
                  title="Redo"
                >
                  <PixelToolIcon name="redo" /> Повтор
                </button>
                <button
                  type="button"
                  className="ghost ember-chip--sm"
                  onClick={copyPixels}
                  title="Копировать"
                >
                  <PixelToolIcon name="copy" /> Копия
                </button>
                <button
                  type="button"
                  className="ghost ember-chip--sm"
                  onClick={pastePixels}
                  disabled={!clipReady}
                  title="Вставить"
                >
                  <PixelToolIcon name="paste" /> Вставить
                </button>
                <button
                  type="button"
                  className="ghost ember-chip--sm"
                  title="Сгенерировать"
                  onClick={() => {
                    if (!tile) return;
                    commitPixels(
                      editFace === "wall"
                        ? bakeWallProceduralPixels(tile, size)
                        : bakeProceduralPixels(tile, size),
                    );
                  }}
                >
                  Создать
                </button>
                <button
                  type="button"
                  className="ghost ember-chip--sm"
                  title="Залить весь цветовой слой"
                  onClick={() =>
                    commitPixels(
                      emptyPixels(size, color === "#00000000" ? "" : color),
                    )
                  }
                >
                  <PixelToolIcon name="fill" /> Залить всё
                </button>
                <button
                  type="button"
                  className="ghost ember-danger ember-chip--sm"
                  title="Очистить"
                  onClick={() => commitPixels(emptyPixels(size))}
                >
                  <PixelToolIcon name="clear" /> Очистить
                </button>
              </div>
              <div className="ember-chip-row ember-pixel-selection-actions" aria-label="Трансформация выделения">
                <button type="button" className="ghost ember-chip--sm" disabled={!selection} onClick={() => transformSelection("flip_x")} title="Отразить выделение по горизонтали"><PixelToolIcon name="flipX" /> По X</button>
                <button type="button" className="ghost ember-chip--sm" disabled={!selection} onClick={() => transformSelection("flip_y")} title="Отразить выделение по вертикали"><PixelToolIcon name="flipY" /> По Y</button>
                <button type="button" className="ghost ember-chip--sm" disabled={!selection} onClick={() => transformSelection("rotate_cw")} title="Повернуть выделение на 90°"><PixelToolIcon name="rotate" /> 90°</button>
                <button type="button" className="ghost ember-chip--sm ember-danger" disabled={!selection} onClick={deleteSelection} title="Очистить выделенную область · Delete"><PixelToolIcon name="clear" /> Удалить</button>
                <button type="button" className="ghost ember-chip--sm" disabled={!selection} onClick={cutSelection} title="Вырезать выделение · Ctrl+X"><PixelToolIcon name="cut" /> Вырезать</button>
                <button type="button" className="ghost ember-chip--sm" disabled={!selection} onClick={duplicateSelection} title="Дублировать со сдвигом 1 px · Ctrl+J"><PixelToolIcon name="duplicate" /> Дубль</button>
                <button type="button" className="ghost ember-chip--sm" onClick={selectAllPixels} title="Выделить всё · Ctrl+A"><PixelToolIcon name="selectAll" /> Всё</button>
                <button type="button" className="ghost ember-chip--sm" onClick={invertSelection} title="Инвертировать выделение · Ctrl+Shift+I"><PixelToolIcon name="invert" /> Инверт.</button>
                <button type="button" className="ghost ember-chip--sm" disabled={!selection} onClick={() => { setSelection(null); setSelectionMask(null); }} title="Снять выделение · Esc">×</button>
              </div>
            </div>

            {tool === "wand" ? (
              <div className="ember-wand-options" role="group" aria-label="Параметры волшебной палочки">
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
              <div className="ember-shape-options" role="group" aria-label="Параметры геометрической фигуры">
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
              <div className="ember-fill-options" role="group" aria-label="Параметры заливки">
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
              <div className="ember-brush-options" role="group" aria-label="Параметры кисти">
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

            {showEmissivePanel ? (
              <div
                className={`ember-tile-emissive ${emissiveEnabled ? "" : "is-off"}`}
                role="group"
                aria-label="Светящиеся пиксели"
              >
                <label
                  className="ember-tile-emissive__master"
                  title="Выкл — пиксели остаются, но не светятся на карте и в игре"
                >
                  <input
                    type="checkbox"
                    checked={emissiveEnabled}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setEmissiveEnabled(on);
                      emissiveEnabledRef.current = on;
                      applyToTileset(
                        pixelsRef.current,
                        emissivePixelsRef.current,
                        shinePixelsRef.current,
                      );
                    }}
                  />
                  <span>Светящиеся пиксели</span>
                </label>
                {emissiveEnabled ? (
                  <div className="ember-tile-emissive__controls">
                    <label
                      className="ember-chip ember-chip--sm ember-sprite-emissive-anim"
                      title="Режим свечения (на карте / в игре)"
                    >
                      <select
                        value={emissiveAnim}
                        onChange={(e) => {
                          const v = e.target.value as EmberEmissiveAnim;
                          setEmissiveAnim(v);
                          emissiveAnimRef.current = v;
                          if (v === "pulse") {
                            const p = resolveEmissiveAnimPeriod(
                              emissiveAnimPeriodRef.current,
                              "pulse",
                            );
                            setEmissiveAnimPeriod(p);
                            emissiveAnimPeriodRef.current = p;
                          } else if (v === "flicker") {
                            let lo = emissiveAnimPeriodMinRef.current;
                            let hi = emissiveAnimPeriodMaxRef.current;
                            if (hi < 1.5) {
                              lo = DEFAULT_EMISSIVE_FLICKER_PERIOD_MIN;
                              hi = DEFAULT_EMISSIVE_FLICKER_PERIOD_MAX;
                            }
                            const range = resolveEmissiveFlickerPeriodRange(
                              lo,
                              hi,
                            );
                            setEmissiveAnimPeriodMin(range.min);
                            setEmissiveAnimPeriodMax(range.max);
                            emissiveAnimPeriodMinRef.current = range.min;
                            emissiveAnimPeriodMaxRef.current = range.max;
                          }
                          applyToTileset(
                            pixelsRef.current,
                            emissivePixelsRef.current,
                            shinePixelsRef.current,
                          );
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
                      className="ember-tile-emissive__field"
                      title="Сила свечения"
                    >
                      сила
                      <input
                        type="range"
                        min={0.15}
                        max={1}
                        step={0.05}
                        value={emissiveStrength}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setEmissiveStrength(v);
                          emissiveStrengthRef.current = v;
                        }}
                        onPointerUp={() =>
                          applyToTileset(
                            pixelsRef.current,
                            emissivePixelsRef.current,
                            shinePixelsRef.current,
                          )
                        }
                      />
                    </label>
                    <label
                      className="ember-tile-emissive__field"
                      title="Цвет ореола (bloom). Выкл = как цвет пикселей"
                    >
                      <input
                        type="checkbox"
                        checked={emissiveBloomCustom}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setEmissiveBloomCustom(on);
                          emissiveBloomCustomRef.current = on;
                          applyToTileset(
                            pixelsRef.current,
                            emissivePixelsRef.current,
                            shinePixelsRef.current,
                          );
                        }}
                      />
                      ореол
                      <input
                        type="color"
                        disabled={!emissiveBloomCustom}
                        value={emissiveBloomColor}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEmissiveBloomColor(v);
                          emissiveBloomColorRef.current = v;
                        }}
                        onPointerUp={() =>
                          applyToTileset(
                            pixelsRef.current,
                            emissivePixelsRef.current,
                            shinePixelsRef.current,
                          )
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
                      className="ember-tile-emissive__field"
                      title="Светящиеся пиксели дают слабый локальный свет (~0.5–1 тайл)"
                    >
                      <input
                        type="checkbox"
                        checked={emissiveCastsLight}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setEmissiveCastsLight(on);
                          emissiveCastsLightRef.current = on;
                          if (!on) {
                            setEmissiveLightShadows(false);
                            emissiveLightShadowsRef.current = false;
                          }
                          applyToTileset(
                            pixelsRef.current,
                            emissivePixelsRef.current,
                            shinePixelsRef.current,
                          );
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
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setEmissiveLightRange(v);
                          emissiveLightRangeRef.current = v;
                        }}
                        onPointerUp={() =>
                          applyToTileset(
                            pixelsRef.current,
                            emissivePixelsRef.current,
                            shinePixelsRef.current,
                          )
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
                          emissiveLightShadowsRef.current = on;
                          applyToTileset(
                            pixelsRef.current,
                            emissivePixelsRef.current,
                            shinePixelsRef.current,
                          );
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
                        className="ember-tile-emissive__field"
                        title="Период пульса, секунды"
                      >
                        сек
                        <input
                          type="range"
                          min={0.15}
                          max={MAX_EMISSIVE_ANIM_PERIOD}
                          step={0.05}
                          value={emissiveAnimPeriod}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setEmissiveAnimPeriod(v);
                            emissiveAnimPeriodRef.current = v;
                          }}
                          onPointerUp={() =>
                            applyToTileset(
                              pixelsRef.current,
                              emissivePixelsRef.current,
                              shinePixelsRef.current,
                            )
                          }
                          style={{ width: "4.5rem" }}
                        />
                        <em>{emissiveAnimPeriod.toFixed(2)}</em>
                      </label>
                    ) : null}
                    {emissiveAnim === "flicker" ? (
                      <>
                        <label
                          className="ember-tile-emissive__field"
                          title="Пауза до вспышки · от"
                        >
                          от
                          <input
                            type="range"
                            min={0.08}
                            max={MAX_EMISSIVE_FLICKER_WAIT_MIN}
                            step={0.05}
                            value={emissiveAnimPeriodMin}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setEmissiveAnimPeriodMin(v);
                              emissiveAnimPeriodMinRef.current = v;
                            }}
                            onPointerUp={() =>
                              applyToTileset(
                                pixelsRef.current,
                                emissivePixelsRef.current,
                                shinePixelsRef.current,
                              )
                            }
                            style={{ width: "4.5rem" }}
                          />
                          <em>{formatFlickerWait(emissiveAnimPeriodMin)}</em>
                        </label>
                        <label
                          className="ember-tile-emissive__field"
                          title="Пауза до вспышки · до"
                        >
                          до
                          <input
                            type="range"
                            min={0.08}
                            max={MAX_EMISSIVE_FLICKER_WAIT_MAX}
                            step={0.05}
                            value={emissiveAnimPeriodMax}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setEmissiveAnimPeriodMax(v);
                              emissiveAnimPeriodMaxRef.current = v;
                            }}
                            onPointerUp={() =>
                              applyToTileset(
                                pixelsRef.current,
                                emissivePixelsRef.current,
                                shinePixelsRef.current,
                              )
                            }
                            style={{ width: "4.5rem" }}
                          />
                          <em>{formatFlickerWait(emissiveAnimPeriodMax)}</em>
                        </label>
                      </>
                    ) : null}
                    {emissiveAnim === "trigger" ? (
                      <>
                        <label
                          className="ember-chip ember-chip--sm ember-sprite-emissive-anim"
                          title="Когда включать свечение"
                        >
                          <select
                            value={emissiveTriggerWhen}
                            onChange={(e) => {
                              const v = e.target
                                .value as EmberEmissiveTriggerWhen;
                              setEmissiveTriggerWhen(v);
                              emissiveTriggerWhenRef.current = v;
                              applyToTileset(
                                pixelsRef.current,
                                emissivePixelsRef.current,
                                shinePixelsRef.current,
                              );
                            }}
                          >
                            {EMISSIVE_TRIGGER_WHEN_OPTS.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label
                          className="ember-tile-emissive__field"
                          title="Радиус триггера в тайлах"
                        >
                          R
                          <input
                            type="range"
                            min={1}
                            max={12}
                            step={1}
                            value={emissiveTriggerRadius}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setEmissiveTriggerRadius(v);
                              emissiveTriggerRadiusRef.current = v;
                            }}
                            onPointerUp={() =>
                              applyToTileset(
                                pixelsRef.current,
                                emissivePixelsRef.current,
                                shinePixelsRef.current,
                              )
                            }
                            style={{ width: "3.5rem" }}
                          />
                          <em>{emissiveTriggerRadius}</em>
                        </label>
                        {emissiveTriggerWhen === "event" ? (
                          <label
                            className="ember-chip ember-chip--sm ember-sprite-emissive-anim"
                            title="Ивент Ember"
                          >
                            <select
                              value={emissiveTriggerEventId}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEmissiveTriggerEventId(v);
                                emissiveTriggerEventIdRef.current = v;
                                applyToTileset(
                                  pixelsRef.current,
                                  emissivePixelsRef.current,
                                  shinePixelsRef.current,
                                );
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
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : (
                  <p className="muted ember-tile-emissive__hint">
                    Пиксели сохранены · свечение выкл на карте и в игре
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className={`ember-tile-stage ${editFace === "wall" ? "is-wall" : "is-top"}`}>
            <div
              ref={stageRef}
              className={`ember-tile-stage__scroll ${canvasNavigation.handMode || canvasNavigation.spaceHeld ? "is-hand" : ""} ${canvasNavigation.dragging ? "is-panning" : ""}`}
              onMouseDown={canvasNavigation.beginPan}
            >
              <div className="ember-tile-stage__center">
              <div className="ember-tile-artboard">
                <div className="ember-tile-bands" aria-hidden>
                  <div className="ember-tile-bands__band">
                    <span className="ember-tile-bands__name">{faceLabel}</span>
                    <span className="ember-tile-bands__px muted">
                      {size}px
                    </span>
                  </div>
                </div>
                <div className={`ember-pixel-canvas-pair ${canvasView.reference?.mode === "side" ? "is-side" : ""}`}>
                <div
                  className="ember-pixel-canvas-wrap"
                  style={{ backgroundSize: `${scale * 2}px ${scale * 2}px` }}
                >
                <PixelCanvasReferenceLayer
                  reference={canvasView.reference}
                  layer="under"
                  cellScale={scale}
                  width={size}
                  height={size}
                />
                <canvas
                  ref={canvasRef}
                  className="ember-tile-paint__canvas"
                  style={{
                    width: size * scale,
                    height: size * scale,
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
                    const pos = pixelFromEvent(e.clientX, e.clientY);
                    if (pos) beginBrushStroke(pos);
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
                    }
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
                    finishBrushStroke();
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
                    finishBrushStroke();
                  }}
                />
                <PixelCanvasReferenceLayer
                  reference={canvasView.reference}
                  layer="over"
                  cellScale={scale}
                  width={size}
                  height={size}
                />
                <PixelCanvasOverlays
                  width={size}
                  height={size}
                  cellScale={scale}
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
                      left: selection.x * scale,
                      top: selection.y * scale,
                      width: selection.w * scale,
                      height: selection.h * scale,
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
                  cellScale={scale}
                  width={size}
                  height={size}
                />
                </div>
              </div>
            </div>
            </div>

            <PixelCanvasNavigator
              stageRef={stageRef}
              sourceCanvasRef={canvasRef}
              width={size}
              height={size}
              scale={scale}
              visible={canvasNavigation.navigatorVisible}
              onClose={() => canvasNavigation.setNavigatorVisible(false)}
              revisionA={pixels}
              revisionB={emissivePixels}
              revisionC={shinePixels}
            />
            <aside className="ember-tile-hud" aria-label="Превью тайла">
              <div className="ember-tile-hud__frame">
                <canvas
                  ref={previewRef}
                  className="ember-tile-hud__canvas"
                  title="3×3 верх + полоса стены"
                />
              </div>
              <span className="ember-tile-hud__caption muted">На карте</span>
            </aside>
          </div>
          <footer className="ember-studio-status" aria-label="Состояние холста">
            <span className="ember-studio-status__primary">
              {tool === "select" ? "Выделение" : tool === "lasso" ? "Лассо" : tool === "wand" ? "Палочка" : tool === "fill" ? "Заливка" : tool === "line" ? "Линия" : tool === "rect" ? "Прямоугольник" : tool === "ellipse" ? "Эллипс" : tool === "paint" ? "Кисть" : tool === "eyedrop" ? "Пипетка" : tool === "glow" ? "Свечение" : "Блеск"}
              <b>{selection && (tool === "select" || tool === "lasso" || tool === "wand") ? `${selection.w}×${selection.h}` : `${brushSize}px`}</b>
            </span>
            <span ref={cursorStatusRef}>X —  Y —</span>
            <span>{editFace === "top" ? "Верх" : "Стена"} · {size}×{size} · {canvasNavigation.zoomPercent}%</span>
            <span className="ember-studio-status__hint"><kbd>M</kbd> рамка <kbd>L</kbd> лассо <kbd>W</kbd> цвет <kbd>F</kbd> заливка <kbd>U</kbd> фигуры <kbd>B</kbd> кисть <kbd>I</kbd> пипетка</span>
          </footer>
        </div>

        <PixelPalettePanel
          className="ember-tile-palette"
          foreground={color}
          background={backgroundColor}
          baseColors={PALETTE}
          favorites={favorites}
          recentColors={recentColors}
          onForegroundChange={chooseForegroundColor}
          onForegroundPreview={setColor}
          onBackgroundChange={chooseBackgroundColor}
          onFavoritesChange={(colors) =>
            onFavoritesChange?.(prunePaletteFavorites(colors))
          }
          onSwap={swapPaletteColors}
          onReset={resetPaletteColors}
          onReplace={replacePaletteColor}
          onAdjust={adjustActiveColors}
          onQuantize={quantizeActiveColors}
          onOutline={outlineActiveColors}
          canvasView={(
            <PixelCanvasViewPanel
              width={size}
              height={size}
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

function dominantColor(pixels: string[]): string | null {
  const counts = new Map<string, number>();
  for (const c of pixels) {
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  for (const [c, k] of counts) {
    if (k > n) {
      n = k;
      best = c;
    }
  }
  return best;
}
