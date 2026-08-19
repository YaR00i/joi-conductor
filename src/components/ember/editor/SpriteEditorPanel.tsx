import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { writeEmberJson, type EmberPack } from "../../../game";
import {
  clampSpriteDim,
  emptySpritePixels,
  joinSpriteBands,
  normalizePixelSprite,
  resizeSpriteGeometry,
  serializePixelSprite,
  SPRITE_DIM_MAX,
  SPRITE_DIM_MIN,
  SPRITE_WALL_H_MAX,
  SPRITE_WALL_H_MIN,
  SPRITE_WALL_MAX_STRIPS,
  spriteTotalHeight,
  spriteWallHeight,
} from "../../../game/content/pixelSprite";
import type {
  EmberEmissiveAnim,
  EmberEmissiveTriggerWhen,
  EmberEnemyDef,
  EmberMaterialKind,
  EmberPixelSprite,
  EmberSpriteRole,
  EmberTileset,
} from "../../../game/content/types";
import { MAX_ELEVATION } from "../../../game/content/types";
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
  paintSpriteDecorOnFloor,
  paintTileFace,
  spriteHasVisual,
} from "../../../game/tile/tileTextures";
import { EmberSpriteThumb, EmberThumbGrid } from "./EmberThumbGrid";
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

type Props = {
  pack: EmberPack;
  onChangePack: (pack: EmberPack) => void;
  onSaved: (msg: string) => void;
  /** Focus a sprite when navigating from the library hub. */
  initialSpriteId?: string | null;
};

type DrawTool = "paint" | "eyedrop" | "glow" | "shine";

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

function bandBoundaries(
  topHeight: number,
  wallHeights: number[],
): number[] {
  const rows = [0, topHeight];
  let y = topHeight;
  for (const h of wallHeights) {
    y += h;
    rows.push(y);
  }
  return rows;
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
  const topHeight = sprite?.topHeight ?? 16;
  const wallHeights = sprite?.wallHeights ?? [];
  const totalH = sprite ? spriteTotalHeight(sprite) : 16;

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
  const [favDraft, setFavDraft] = useState("#ff8866");
  const [enemyBind, setEnemyBind] = useState("");
  /** Floor elevation for on-tile preview (0 = flat). */
  const [previewElev, setPreviewElev] = useState(0);
  const [widthDraft, setWidthDraft] = useState(16);
  const [topHDraft, setTopHDraft] = useState(16);

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
  const geomRef = useRef({ width, topHeight, wallHeights, totalH });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  type PaintSnapshot = {
    pixels: string[];
    emissive: string[];
    shine: string[];
  };
  const undoRef = useRef<PaintSnapshot[]>([]);
  const redoRef = useRef<PaintSnapshot[]>([]);
  const [historyLen, setHistoryLen] = useState(0);
  const [redoLen, setRedoLen] = useState(0);
  const [clipReady, setClipReady] = useState(() => hasPixelClipboard());
  const [cellScale, setCellScale] = useState(14);

  toolRef.current = tool;
  brushSizeRef.current = brushSize;
  pixelsRef.current = pixels;
  emissiveRef.current = emissivePixels;
  shineRef.current = shinePixels;
  geomRef.current = { width, topHeight, wallHeights, totalH };
  const cellScaleRef = useRef(cellScale);
  cellScaleRef.current = cellScale;

  const favorites = pack.paletteFavorites ?? [];
  const palette = useMemo(() => {
    const extra = favorites.filter((c) => !BASE_PALETTE.includes(c));
    return [...BASE_PALETTE, ...extra];
  }, [favorites]);

  // Fit pixel scale to the available artboard (canvas is the focus).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const rect = el.getBoundingClientRect();
      const padX = 88;
      const padY = 56;
      const sx = Math.floor((rect.width - padX) / Math.max(1, width));
      const sy = Math.floor((rect.height - padY) / Math.max(1, totalH));
      setCellScale(Math.max(8, Math.min(28, Math.min(sx, sy) || 8)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, totalH, spriteId]);

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
      setTopHDraft(16);
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
    setTopHDraft(sprite.topHeight);
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

  // Paint unified canvas + band dividers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = bandBoundaries(topHeight, wallHeights);
    canvas.width = width * cellScale;
    canvas.height = totalH * cellScale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < totalH; y++) {
      for (let x = 0; x < width; x++) {
        const c = pixels[y * width + x];
        const px = x * cellScale;
        const py = y * cellScale;
        if (!c || c === "#00000000") {
          ctx.fillStyle = (x + y) % 2 === 0 ? "#1a120e" : "#241810";
          ctx.fillRect(px, py, cellScale, cellScale);
        } else {
          ctx.fillStyle = c;
          ctx.fillRect(px, py, cellScale, cellScale);
        }
        const em = emissivePixels[y * width + x];
        if (em && em !== "#00000000") {
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
        if (sh && sh !== "#00000000") {
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
    // Soft band separators (top / walls) — labels live in the side gutter HUD.
    ctx.strokeStyle = "rgba(255, 190, 110, 0.55)";
    ctx.lineWidth = Math.max(1, Math.round(cellScale * 0.12));
    for (let i = 1; i < bounds.length - 1; i++) {
      const row = bounds[i]!;
      const y = row * cellScale + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }, [
    pixels,
    emissivePixels,
    shinePixels,
    emissiveStrength,
    width,
    topHeight,
    wallHeights,
    totalH,
    cellScale,
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
    const storyHSrc = spriteWallHeight(sprite);
    const maxBox = 88;
    const roughH =
      tilePx +
      elev * WALL_HEIGHT +
      (storyHSrc > 0 ? storyHSrc + topHeight : Math.max(topHeight, tilePx));
    const viewScale = Math.max(
      2,
      Math.min(6, Math.floor(maxBox / Math.max(tilePx, roughH * 0.45))),
    );
    const tileDraw = tilePx * viewScale;
    const storyH = Math.round(storyHSrc * viewScale);
    const topDrawH = Math.round(topHeight * viewScale);
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
    const live: EmberPixelSprite = { ...sprite, pixels };
    if (hasVisual) {
      paintSpriteDecorOnFloor(ctx, live, padX, floorY, tileDraw, viewScale);
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
    width,
    topHeight,
    totalH,
    wallHeights,
    tileset,
    previewTileId,
    sprite,
    previewElev,
  ]);

  const capturePaintSnapshot = (): PaintSnapshot => ({
    pixels: [...pixelsRef.current],
    emissive: [...emissiveRef.current],
    shine: [...shineRef.current],
  });

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
      const need = g.width * g.totalH;
      const px =
        nextPixels.length === need
          ? nextPixels
          : emptySpritePixels(g.width, g.totalH);
      const emRaw = emissiveRef.current;
      const em =
        emRaw.length === need
          ? emRaw
          : emptySpritePixels(g.width, g.totalH);
      const shRaw = shineRef.current;
      const sh =
        shRaw.length === need
          ? shRaw
          : emptySpritePixels(g.width, g.totalH);
      const colorDom = dominantColor(px) || color;
      const hasEm = em.some((c) => c && c !== "#00000000");
      const hasShine = sh.some((c) => c && c !== "#00000000");
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
      const nextSpr: EmberPixelSprite = serializePixelSprite({
        ...sprite,
        nameRu: nameRu.trim() || sprite.nameRu,
        color: colorDom,
        width: g.width,
        topHeight: g.topHeight,
        wallHeights: [...g.wallHeights],
        pixels: [...px],
        emissivePixels: hasEm ? [...em] : undefined,
        shinePixels: hasShine ? [...sh] : undefined,
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
        solid,
        glow,
        material: material || undefined,
        ...overrides,
      });
      onChangePack({
        ...pack,
        sprites: { ...pack.sprites, [spriteId]: nextSpr },
      });
    },
    [
      spriteId,
      sprite,
      nameRu,
      color,
      roles,
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
    if (!spriteId || !sprite) return;
    onChangePack({
      ...pack,
      sprites: {
        ...pack.sprites,
        [spriteId]: serializePixelSprite({
          ...sprite,
          pixels: pixelsRef.current,
          roles: [...roles],
          solid: next,
          glow,
        }),
      },
    });
  };

  const toggleGlow = () => {
    const next = !glow;
    setGlow(next);
    if (!spriteId || !sprite) return;
    onChangePack({
      ...pack,
      sprites: {
        ...pack.sprites,
        [spriteId]: serializePixelSprite({
          ...sprite,
          pixels: pixelsRef.current,
          roles: [...roles],
          solid,
          glow: next,
        }),
      },
    });
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

  const restorePaintSnapshot = (snap: PaintSnapshot) => {
    applyLive([...snap.pixels], [...snap.emissive], [...snap.shine]);
  };

  const applyGeometry = (next: EmberPixelSprite) => {
    const n = serializePixelSprite(next);
    pushHistory();
    const totalH = n.topHeight + n.wallHeights.reduce((a, h) => a + h, 0);
    const emSized =
      n.emissivePixels && n.emissivePixels.length === n.width * totalH
        ? [...n.emissivePixels]
        : emptySpritePixels(n.width, totalH);
    const shSized =
      n.shinePixels && n.shinePixels.length === n.width * totalH
        ? [...n.shinePixels]
        : emptySpritePixels(n.width, totalH);
    setPixels([...n.pixels]);
    pixelsRef.current = [...n.pixels];
    emissiveRef.current = emSized;
    setEmissivePixels(emSized);
    shineRef.current = shSized;
    setShinePixels(shSized);
    setWidthDraft(n.width);
    setTopHDraft(n.topHeight);
    onChangePack({
      ...pack,
      sprites: { ...pack.sprites, [n.id]: n },
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
    if (x < 0 || y < 0 || x >= g.width || y >= g.totalH) return null;
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
    const pos = pixelFromEvent(clientX, clientY);
    if (!pos) return;
    const g = geomRef.current;
    const paintColor = color === "#00000000" ? "" : color;
    const glowMode = toolRef.current === "glow";
    const shineMode = toolRef.current === "shine";
    const prev = glowMode
      ? emissiveRef.current
      : shineMode
        ? shineRef.current
        : pixelsRef.current;
    const b = Math.max(1, Math.min(4, brushSizeRef.current));
    const origin = Math.floor((b - 1) / 2);
    let changed = false;
    const next = [...prev];
    for (let dy = 0; dy < b; dy++) {
      for (let dx = 0; dx < b; dx++) {
        const x = pos.x - origin + dx;
        const y = pos.y - origin + dy;
        if (x < 0 || y < 0 || x >= g.width || y >= g.totalH) continue;
        const idx = y * g.width + x;
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
      emissiveRef.current = next;
      setEmissivePixels(next);
    } else if (shineMode) {
      shineRef.current = next;
      setShinePixels(next);
    } else {
      pixelsRef.current = next;
      setPixels(next);
    }
  };

  const createSprite = () => {
    const id = `spr_${Date.now().toString(36)}`;
    const spr = serializePixelSprite({
      id,
      nameRu: `Спрайт ${spriteList.length + 1}`,
      width: 16,
      topHeight: 16,
      wallHeights: [10],
      pixels: emptySpritePixels(16, 26),
      color: "#c45c26",
      roles: ["decor"],
    });
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

  const commitWidthTop = () => {
    if (!sprite) return;
    const w = clampSpriteDim(widthDraft, SPRITE_DIM_MIN, SPRITE_DIM_MAX, width);
    const th = clampSpriteDim(
      topHDraft,
      SPRITE_DIM_MIN,
      SPRITE_DIM_MAX,
      topHeight,
    );
    if (w === width && th === topHeight) return;
    applyGeometry(
      resizeSpriteGeometry(
        { ...sprite, pixels: pixelsRef.current },
        w,
        th,
        wallHeights,
      ),
    );
  };

  const setWallHeightAt = (index: number, h: number) => {
    if (!sprite) return;
    const next = [...wallHeights];
    next[index] = clampSpriteDim(
      h,
      SPRITE_WALL_H_MIN,
      SPRITE_WALL_H_MAX,
      next[index] ?? 8,
    );
    applyGeometry(
      resizeSpriteGeometry(
        { ...sprite, pixels: pixelsRef.current },
        width,
        topHeight,
        next,
      ),
    );
  };

  const addWallStrip = () => {
    if (!sprite || wallHeights.length >= SPRITE_WALL_MAX_STRIPS) return;
    applyGeometry(
      resizeSpriteGeometry(
        { ...sprite, pixels: pixelsRef.current },
        width,
        topHeight,
        [...wallHeights, 10],
      ),
    );
  };

  const removeWallStrip = (index: number) => {
    if (!sprite) return;
    const next = wallHeights.filter((_, i) => i !== index);
    applyGeometry(
      resizeSpriteGeometry(
        { ...sprite, pixels: pixelsRef.current },
        width,
        topHeight,
        next,
      ),
    );
  };

  const moveWallStrip = (index: number, dir: -1 | 1) => {
    if (!sprite) return;
    const j = index + dir;
    if (j < 0 || j >= wallHeights.length) return;
    const nextH = [...wallHeights];
    const tmpH = nextH[index]!;
    nextH[index] = nextH[j]!;
    nextH[j] = tmpH;
    const bands = wallHeights.map((_, i) => {
      let row = topHeight;
      for (let k = 0; k < i; k++) row += wallHeights[k]!;
      const h = wallHeights[i]!;
      const band: string[] = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < width; x++) {
          band.push(pixelsRef.current[(row + y) * width + x] ?? "");
        }
      }
      return band;
    });
    const swapped = [...bands];
    const tb = swapped[index]!;
    swapped[index] = swapped[j]!;
    swapped[j] = tb;
    const top: string[] = [];
    for (let y = 0; y < topHeight; y++) {
      for (let x = 0; x < width; x++) {
        top.push(pixelsRef.current[y * width + x] ?? "");
      }
    }
    applyGeometry({
      ...sprite,
      wallHeights: nextH,
      pixels: joinSpriteBands(width, top, topHeight, swapped, nextH),
    });
  };

  const addFavorite = (hex: string) => {
    const n = hex.toLowerCase();
    if (!n.startsWith("#") || (n.length !== 7 && n !== "#00000000")) return;
    if (favorites.includes(n) || BASE_PALETTE.includes(n)) return;
    onChangePack({
      ...pack,
      paletteFavorites: [...favorites, n],
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
    const sprites = {
      ...pack.sprites,
      [spriteId]: {
        ...serializePixelSprite({
          ...sprite!,
          pixels: pixelsRef.current,
          roles: nextRoles,
        }),
      },
    };
    onChangePack({ ...pack, enemies, sprites });
  };

  const addAsDecorTile = () => {
    if (!sprite || !spriteId) return;
    const tilesetId = Object.keys(pack.tilesets)[0];
    if (!tilesetId) return;
    const ts = pack.tilesets[tilesetId]!;
    if (width !== ts.tileSize || topHeight !== ts.tileSize) {
      onSaved(
        `Для декора в тайлы нужен квадрат ${ts.tileSize}×${ts.tileSize} (сейчас ${width}×${topHeight})`,
      );
      return;
    }
    const maxId = Math.max(0, ...ts.tiles.map((t) => t.id));
    const id = maxId + 1;
    const topPx = pixelsRef.current.slice(0, width * topHeight);
    const wallH = wallHeights[0] ?? 0;
    const wallPx =
      wallH > 0
        ? pixelsRef.current.slice(
            width * topHeight,
            width * topHeight + width * wallH,
          )
        : undefined;
    // Resize first wall band to tileSize square if needed
    let wallOut: string[] | undefined;
    if (wallPx && wallH === ts.tileSize) {
      wallOut = wallPx;
    } else if (wallPx && wallH > 0) {
      wallOut = emptySpritePixels(ts.tileSize, ts.tileSize);
      const ch = Math.min(wallH, ts.tileSize);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < ts.tileSize; x++) {
          wallOut[y * ts.tileSize + x] = wallPx[y * width + x] ?? "";
        }
      }
    }
    const nextTile = {
      id,
      name: nameRu.trim() || sprite.nameRu || `decor_${id}`,
      color: dominantColor(topPx) || sprite.color,
      pixels: [...topPx],
      wallPixels: wallOut,
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
        [spriteId]: serializePixelSprite({
          ...sprite,
          pixels: pixelsRef.current,
          roles: roles.includes("decor") ? roles : [...roles, "decor"],
        }),
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
    if (spriteId && sprite) {
      commitToPack(pixelsRef.current, {
        nameRu: nameRu.trim() || sprite.nameRu,
        roles: [...roles],
      });
    }
    const spritesMap =
      spriteId && sprite
        ? {
            ...pack.sprites,
            [spriteId]: serializePixelSprite({
              ...sprite,
              nameRu: nameRu.trim() || sprite.nameRu,
              pixels: [...pixelsRef.current],
              color: dominantColor(pixelsRef.current) || color,
              roles: [...roles],
              solid,
              glow,
            }),
          }
        : pack.sprites;
    const file = {
      paletteFavorites: pack.paletteFavorites ?? [],
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
    setRoles((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
    );
  };

  const spritePickerItems = useMemo(
    () =>
      spriteList.map((s) => {
        const badges: string[] = [`${s.width}×${s.topHeight}`];
        if (s.wallHeights.length) badges.push(`+${s.wallHeights.length}ст`);
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
              <button
                type="button"
                className="primary ember-ed-open-picker__create"
                onClick={createSprite}
              >
                Создать новый
              </button>
            </header>
            <div className="ember-ed-open-picker__scroll">
              <EmberThumbGrid
                size="md"
                className="ember-ed-open-picker__thumbs"
                selectedId={null}
                onSelect={selectSprite}
                items={spritePickerItems}
              />
            </div>
          </div>
        </div>
      ) : null}
      <div className="ember-sprite-workspace">
        <aside className="ember-sprite-list">
          <div className="ember-sprite-list__head">
            <h3 className="ember-sprite-list__title">Ассеты</h3>
            <button
              type="button"
              className="ember-chip ember-chip--sm"
              onClick={createSprite}
              title="Создать спрайт"
            >
              +
            </button>
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
                <label className="ember-sprite-chrome__name">
                  <span className="muted">Имя</span>
                  <input
                    value={nameRu}
                    onChange={(e) => setNameRu(e.target.value)}
                    onBlur={() => commitToPack(pixelsRef.current)}
                  />
                </label>
                <label className="ember-sprite-chrome__num">
                  <span className="muted">W</span>
                  <input
                    type="number"
                    min={SPRITE_DIM_MIN}
                    max={SPRITE_DIM_MAX}
                    value={widthDraft}
                    onChange={(e) => setWidthDraft(Number(e.target.value) || 0)}
                    onBlur={commitWidthTop}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitWidthTop();
                    }}
                    title="Ширина"
                  />
                </label>
                <label className="ember-sprite-chrome__num">
                  <span className="muted">H↑</span>
                  <input
                    type="number"
                    min={SPRITE_DIM_MIN}
                    max={SPRITE_DIM_MAX}
                    value={topHDraft}
                    onChange={(e) => setTopHDraft(Number(e.target.value) || 0)}
                    onBlur={commitWidthTop}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitWidthTop();
                    }}
                    title="Высота верха"
                  />
                </label>
                <span className="muted ember-sprite-chrome__dim">
                  {width}×{totalH}
                  {wallHeights.length
                    ? ` · ст.${spriteWallHeight(sprite)}`
                    : ""}
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
                className="ember-sprite-toolstrip"
                role="toolbar"
                aria-label="Кисть и правки"
              >
                <div className="ember-chip-row">
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${tool === "paint" ? "is-active" : ""}`}
                    onClick={() => setTool("paint")}
                    title="Кисть · ЛКМ"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${tool === "glow" ? "is-active" : ""}`}
                    onClick={() => setTool("glow")}
                    title="Светящиеся пиксели · bloom"
                  >
                    ✦
                  </button>
                  <button
                    type="button"
                    className={`ember-chip ember-chip--sm ${tool === "shine" ? "is-active" : ""}`}
                    onClick={() => setTool("shine")}
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
                </div>
                <div className="ember-chip-row ember-sprite-toolstrip__sizes">
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
                <div className="ember-chip-row">
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
                    title="Копировать холст"
                    onClick={() => {
                      copyPixelArt(pixelsRef.current, width, totalH);
                      setClipReady(true);
                    }}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    disabled={!clipReady}
                    title="Вставить"
                    onClick={() => {
                      const next = pastePixelArt(width, totalH);
                      if (!next) return;
                      pushHistory();
                      applyLive(next);
                    }}
                  >
                    Paste
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    title="Залить цветом"
                    onClick={() => {
                      pushHistory();
                      const fill = color === "#00000000" ? "" : color;
                      applyLive(
                        emptySpritePixels(width, totalH).map(() => fill),
                      );
                    }}
                  >
                    Fill
                  </button>
                  <button
                    type="button"
                    className="ghost ember-danger ember-chip--sm"
                    title="Очистить"
                    onClick={() => {
                      pushHistory();
                      const blank = emptySpritePixels(width, totalH);
                      applyLive(blank, blank, blank);
                    }}
                  >
                    Clear
                  </button>
                </div>
                <div className="ember-chip-row ember-sprite-toolstrip__flags">
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
                  <label
                    className="ember-chip ember-chip--sm"
                    title="Материал (на lit-спрайтах / будущий свет)"
                  >
                    <select
                      value={material}
                      onChange={(e) => {
                        const v = e.target.value as EmberMaterialKind | "";
                        setMaterial(v);
                        if (!spriteId || !sprite) return;
                        onChangePack({
                          ...pack,
                          sprites: {
                            ...pack.sprites,
                            [spriteId]: serializePixelSprite({
                              ...sprite,
                              pixels: pixelsRef.current,
                              roles: [...roles],
                              solid,
                              glow,
                              material: v || undefined,
                            }),
                          },
                        });
                      }}
                    >
                      <option value="">Материал</option>
                      {EMBER_MATERIAL_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {EMBER_MATERIAL_LABELS_RU[kind]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {tool === "glow" ||
                  emissivePixels.some((c) => c && c !== "#00000000") ? (
                    <>
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
                    </>
                  ) : null}
                </div>
              </div>

              <div className="ember-sprite-stage" ref={stageRef}>
                <div className="ember-sprite-stage__center">
                  <div
                    className="ember-sprite-artboard"
                    style={{
                      height: totalH * cellScale,
                    }}
                  >
                    <div
                      className="ember-sprite-bands"
                      aria-label="Полосы спрайта"
                    >
                      <div
                        className="ember-sprite-bands__band ember-sprite-bands__band--top"
                        style={{ height: topHeight * cellScale }}
                      >
                        <span className="ember-sprite-bands__name">Верх</span>
                        <span className="ember-sprite-bands__px muted">
                          {topHeight}px
                        </span>
                        {wallHeights.length === 0 ? (
                          <button
                            type="button"
                            className="ember-sprite-bands__add"
                            disabled={
                              wallHeights.length >= SPRITE_WALL_MAX_STRIPS
                            }
                            onClick={addWallStrip}
                            title="Добавить полосу стены снизу"
                          >
                            + стена
                          </button>
                        ) : null}
                      </div>
                      {wallHeights.map((h, i) => {
                        const isLast = i === wallHeights.length - 1;
                        return (
                          <div
                            key={`band-${i}-${h}`}
                            className={`ember-sprite-bands__band ${isLast ? "ember-sprite-bands__band--last" : ""}`}
                            style={{ height: h * cellScale }}
                          >
                            <span className="ember-sprite-bands__name">
                              Стена {i + 1}
                            </span>
                            <label className="ember-sprite-bands__edit">
                              <input
                                type="number"
                                min={SPRITE_WALL_H_MIN}
                                max={SPRITE_WALL_H_MAX}
                                defaultValue={h}
                                title={`Высота стены ${i + 1}`}
                                onBlur={(e) =>
                                  setWallHeightAt(
                                    i,
                                    Number(e.target.value) || 1,
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }}
                              />
                            </label>
                            <div className="ember-sprite-bands__ops">
                              <button
                                type="button"
                                className="ghost"
                                disabled={i === 0}
                                onClick={() => moveWallStrip(i, -1)}
                                title="Выше"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="ghost"
                                disabled={i >= wallHeights.length - 1}
                                onClick={() => moveWallStrip(i, 1)}
                                title="Ниже"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className="ghost ember-danger"
                                onClick={() => removeWallStrip(i)}
                                title="Убрать полосу"
                              >
                                ×
                              </button>
                            </div>
                            {isLast ? (
                              <button
                                type="button"
                                className="ember-sprite-bands__add"
                                disabled={
                                  wallHeights.length >= SPRITE_WALL_MAX_STRIPS
                                }
                                onClick={addWallStrip}
                                title="Добавить полосу стены снизу"
                              >
                                + стена
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <canvas
                      ref={canvasRef}
                      className="ember-sprite-paint__canvas"
                      style={{
                        width: width * cellScale,
                        height: totalH * cellScale,
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
                        commitToPack(pixelsRef.current);
                      }}
                      onMouseLeave={() => {
                        if (painting.current) {
                          painting.current = false;
                          strokeSaved.current = false;
                          commitToPack(pixelsRef.current);
                        }
                      }}
                    />
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
          {favorites.length > 0 ? (
            <div className="ember-tile-palette-grid ember-tile-palette-grid--fav">
              {favorites.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`ember-palette-swatch ${color === c ? "is-active" : ""}`}
                  style={{ background: c }}
                  title={`${c} · ПКМ убрать`}
                  onClick={() => setColor(c)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    removeFavorite(c);
                  }}
                />
              ))}
            </div>
          ) : null}
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
                title={c === "#00000000" ? "Прозрачный" : c}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <div className="ember-sprite-palette__extras">
            <input
              type="color"
              value={
                color.startsWith("#") && color.length === 7 ? color : "#c45c26"
              }
              onChange={(e) => setColor(e.target.value)}
              title="Свой цвет"
            />
            <button
              type="button"
              className="ghost ember-chip--sm"
              title="Текущий в избранное"
              onClick={() => {
                if (color.startsWith("#") && color.length === 7) {
                  addFavorite(color);
                }
              }}
            >
              ★
            </button>
            <input
              type="color"
              value={favDraft}
              onChange={(e) => setFavDraft(e.target.value)}
              title="Новый для избранного"
            />
            <button
              type="button"
              className="ghost ember-chip--sm"
              onClick={() => addFavorite(favDraft)}
              title="Добавить цвет в избранное"
            >
              +★
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
