import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { writeEmberJson } from "../../../game/content/io";
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
  copyPixelArt,
  hasPixelClipboard,
  pastePixelArt,
} from "./pixelClipboard";
import {
  getLastOpenedId,
  hasOpenedEditor,
  markEditorOpened,
} from "./editorOpenSession";
import {
  appendBlankTile,
  appendClonedTile,
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

type DrawTool = "paint" | "eyedrop" | "glow" | "shine";
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
  const size = tileset.tileSize;
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

  useEffect(() => {
    if (initialTileId == null) return;
    if (tileset.tiles.some((t) => t.id === initialTileId)) {
      selectTile(initialTileId);
    }
  }, [initialTileId, tileset.id, tileset.tiles, selectTile]);
  const [color, setColor] = useState("#2f4a30");
  const [tool, setTool] = useState<DrawTool>("paint");
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
  const painting = useRef(false);
  const strokeSaved = useRef(false);
  const toolRef = useRef(tool);
  const brushSizeRef = useRef(brushSize);
  const editFaceRef = useRef<EditFace>(editFace);
  toolRef.current = tool;
  brushSizeRef.current = brushSize;
  editFaceRef.current = editFace;
  type PaintSnapshot = {
    pixels: string[];
    emissive: string[];
    shine: string[];
  };
  const undoRef = useRef<PaintSnapshot[]>([]);
  const redoRef = useRef<PaintSnapshot[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tilesetRef = useRef(tileset);
  const tileIdRef = useRef(tileId);
  const onChangeRef = useRef(onChange);
  const [scale, setScale] = useState(16);
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
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const rect = el.getBoundingClientRect();
      const pad = 56;
      const s = Math.floor(
        Math.min(rect.width - pad, rect.height - pad) / Math.max(1, size),
      );
      setScale(Math.max(10, Math.min(36, s || 10)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size, tileId]);

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

  const pushHistory = useCallback(() => {
    undoRef.current = [
      ...undoRef.current.slice(-40),
      capturePaintSnapshot(),
    ];
    redoRef.current = [];
    setHistoryLen(undoRef.current.length);
    setRedoLen(0);
  }, [capturePaintSnapshot]);

  // Load top + wall pixels when switching tile / tileset
  useEffect(() => {
    const t = tileset.tiles.find((x) => x.id === tileId);
    if (!t) return;
    clearHistory();
    strokeSaved.current = false;
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
        if (!c) {
          ctx.fillStyle = (x + y) % 2 === 0 ? "#1a1512" : "#221c18";
          ctx.fillRect(px, py, scale, scale);
        } else {
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
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    for (let i = 0; i <= size; i++) {
      ctx.beginPath();
      ctx.moveTo(i * scale, 0);
      ctx.lineTo(i * scale, size * scale);
      ctx.moveTo(0, i * scale);
      ctx.lineTo(size * scale, i * scale);
      ctx.stroke();
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
    strokeSaved.current = false;
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

  const pickColorAt = (clientX: number, clientY: number) => {
    const pos = pixelFromEvent(clientX, clientY);
    if (!pos) return;
    const c = pixelsRef.current[pos.idx] ?? "";
    setColor(c === "" ? "#00000000" : c);
    setTool("paint");
  };

  const paintAt = (clientX: number, clientY: number) => {
    const pos = pixelFromEvent(clientX, clientY);
    if (!pos) return;
    const paintColor = color === "#00000000" ? "" : color;
    const glowMode = toolRef.current === "glow";
    const shineMode = toolRef.current === "shine";
    const prev = glowMode
      ? emissivePixelsRef.current
      : shineMode
        ? shinePixelsRef.current
        : pixelsRef.current;
    const b = Math.max(1, Math.min(4, brushSizeRef.current));
    const origin = Math.floor((b - 1) / 2);
    let changed = false;
    const next = [...prev];
    for (let dy = 0; dy < b; dy++) {
      for (let dx = 0; dx < b; dx++) {
        const x = pos.x - origin + dx;
        const y = pos.y - origin + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const idx = y * size + x;
        if (next[idx] === paintColor) continue;
        next[idx] = paintColor;
        changed = true;
      }
    }
    if (!changed) return;
    if (!strokeSaved.current) {
      pushHistory();
      strokeSaved.current = true;
    }
    if (glowMode) {
      emissivePixelsRef.current = next;
      setEmissivePixels(next);
    } else if (shineMode) {
      shinePixelsRef.current = next;
      setShinePixels(next);
    } else {
      pixelsRef.current = next;
      setPixels(next);
    }
  };

  const commitPixels = (next: string[]) => {
    pushHistory();
    pixelsRef.current = next;
    setPixels(next);
    applyToTileset(next, emissivePixelsRef.current, shinePixelsRef.current);
  };

  const copyPixels = useCallback(() => {
    copyPixelArt(pixelsRef.current, size);
    setClipReady(true);
  }, [size]);

  const pastePixels = useCallback(() => {
    const next = pastePixelArt(size);
    if (!next) return;
    pushHistory();
    pixelsRef.current = next;
    setPixels(next);
    applyToTileset(next, emissivePixelsRef.current, shinePixelsRef.current);
  }, [pushHistory]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (isTypingTarget(e.target)) return;
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
      else if (isCopy) copyPixels();
      else pastePixels();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [undo, redo, copyPixels, pastePixels]);

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
      strokeSaved.current = false;
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
            <div className="ember-ed-open-picker__scroll">
              <div className="ember-ed-open-picker__grid" role="listbox">
                {tileset.tiles.map((t) => {
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
            <h3 className="ember-tile-list__title">Тайлы</h3>
            <div className="ember-chip-row" role="group" aria-label="Создать">
              <button
                type="button"
                className="ember-chip ember-chip--sm"
                title="Пустой тайл с новым id"
                onClick={createBlankTile}
              >
                + Новый
              </button>
              <button
                type="button"
                className="ember-chip ember-chip--sm"
                title="Клон текущего тайла"
                onClick={cloneCurrentTile}
              >
                Клон
              </button>
            </div>
          </div>
          <div
            className="ember-tile-pick"
            role="listbox"
            aria-label="Тайлы"
          >
            {tileset.tiles.map((t) => {
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
                  className={`ember-chip ember-chip--sm ${tool === "paint" ? "is-active" : ""}`}
                  onClick={() => setTool("paint")}
                  title="Обычные пиксели · B / ЛКМ"
                >
                  Кисть
                </button>
                <button
                  type="button"
                  className={`ember-chip ember-chip--sm ${tool === "glow" ? "is-active" : ""}`}
                  onClick={() => setTool("glow")}
                  title="Светящиеся пиксели · ✦"
                >
                  Свечение
                </button>
                <button
                  type="button"
                  className={`ember-chip ember-chip--sm ${tool === "shine" ? "is-active" : ""}`}
                  onClick={() => setTool("shine")}
                  title="Блеск · wet / metal · яркий = зеркало на полу"
                >
                  Блеск
                </button>
                <button
                  type="button"
                  className={`ember-chip ember-chip--sm ${tool === "eyedrop" ? "is-active" : ""}`}
                  onClick={() => setTool("eyedrop")}
                  title="Пипетка · I / ПКМ"
                >
                  Пипетка
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
                      setTool("paint");
                    }}
                    title={`Размер ${n}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="ember-chip-row ember-tile-toolstrip__edits">
                <button
                  type="button"
                  className="ghost ember-chip--sm"
                  onClick={undo}
                  disabled={historyLen === 0}
                  title="Undo"
                >
                  ↶
                </button>
                <button
                  type="button"
                  className="ghost ember-chip--sm"
                  onClick={redo}
                  disabled={redoLen === 0}
                  title="Redo"
                >
                  ↷
                </button>
                <button
                  type="button"
                  className="ghost ember-chip--sm"
                  onClick={copyPixels}
                  title="Копировать"
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="ghost ember-chip--sm"
                  onClick={pastePixels}
                  disabled={!clipReady}
                  title="Вставить"
                >
                  Paste
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
                  Gen
                </button>
                <button
                  type="button"
                  className="ghost ember-chip--sm"
                  title="Залить"
                  onClick={() =>
                    commitPixels(
                      emptyPixels(size, color === "#00000000" ? "" : color),
                    )
                  }
                >
                  Fill
                </button>
                <button
                  type="button"
                  className="ghost ember-danger ember-chip--sm"
                  title="Очистить"
                  onClick={() => commitPixels(emptyPixels(size))}
                >
                  Clear
                </button>
              </div>
            </div>

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

          <div
            ref={stageRef}
            className={`ember-tile-stage ${editFace === "wall" ? "is-wall" : "is-top"}`}
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
                <canvas
                  ref={canvasRef}
                  className="ember-tile-paint__canvas"
                  style={{
                    width: size * scale,
                    height: size * scale,
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
                    applyToTileset(
                      pixelsRef.current,
                      emissivePixelsRef.current,
                      shinePixelsRef.current,
                    );
                  }}
                  onMouseLeave={() => {
                    if (painting.current) {
                      painting.current = false;
                      strokeSaved.current = false;
                      applyToTileset(
                        pixelsRef.current,
                        emissivePixelsRef.current,
                        shinePixelsRef.current,
                      );
                    }
                  }}
                />
              </div>
            </div>

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
        </div>

        <aside className="ember-tile-palette">
          <div className="ember-tile-palette__head">
            <h3 className="ember-tile-palette__title">Цвет</h3>
            <span
              className="ember-tile-palette__current"
              style={{
                background:
                  color === "#00000000"
                    ? "repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 8px 8px"
                    : color,
              }}
              title={color}
            />
          </div>
          {favorites.length > 0 ? (
            <div className="ember-tile-palette-grid ember-tile-palette-grid--fav">
              {favorites.map((c) => (
                <button
                  key={`fav-${c}`}
                  type="button"
                  className={`ember-palette-swatch ${color === c ? "is-active" : ""}`}
                  style={{ background: c }}
                  title={`${c} · ПКМ убрать`}
                  onClick={() => setColor(c)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onFavoritesChange?.(favorites.filter((x) => x !== c));
                  }}
                />
              ))}
            </div>
          ) : null}
          <div className="ember-tile-palette-grid">
            {[
              ...PALETTE,
              ...favorites.filter((c) => !PALETTE.includes(c)),
            ].map((c) => (
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
                title={c === "#00000000" ? "Прозрачный" : c}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <div className="ember-tile-palette__extras">
            <input
              type="color"
              value={
                color.startsWith("#") && color.length === 7
                  ? color
                  : "#2f4a30"
              }
              onChange={(e) => setColor(e.target.value)}
              title="Свой цвет"
            />
            <button
              type="button"
              className="ghost ember-chip--sm"
              title="В избранное"
              onClick={() => {
                if (
                  color.startsWith("#") &&
                  color.length === 7 &&
                  !favorites.includes(color) &&
                  !PALETTE.includes(color)
                ) {
                  onFavoritesChange?.([...favorites, color]);
                }
              }}
            >
              ★
            </button>
          </div>
        </aside>
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
