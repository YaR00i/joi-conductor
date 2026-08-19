import { useEffect, useRef, type ReactNode } from "react";
import {
  normalizePixelSprite,
  spriteTotalHeight,
} from "../../../game/content/pixelSprite";
import type {
  EmberPixelSprite,
  EmberVoxelModel,
  EmberVoxelScene,
} from "../../../game/content/types";
import type { RampDir } from "../../../game/content/types";
import {
  paintPixelGrid,
  paintStairExtrusion,
  spriteHasVisual,
} from "../../../game/tile/tileTextures";
import { getVoxel, voxelGridSize } from "../../../game/voxel/voxelModel";

export type EmberThumbItem = {
  id: string;
  label?: string;
  title?: string;
  badges?: string[];
  thumb: ReactNode;
  /** Extra controls under the card (e.g. preset actions). */
  footer?: ReactNode;
};

type VoxelIsoCell = { x: number; y: number; z: number; hex: string };

function paintStudioPlate(
  ctx: CanvasRenderingContext2D,
  size: number,
): void {
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, "#2a1c16");
  g.addColorStop(1, "#120e0c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function paintEmptyThumb(
  ctx: CanvasRenderingContext2D,
  size: number,
): void {
  ctx.fillStyle = "rgba(232,208,176,0.35)";
  ctx.font = `${Math.max(10, Math.round(size * 0.22))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("∅", size / 2, size / 2);
}

/** Painter's algorithm isometric voxel preview into an existing 2d context. */
function paintVoxelIsoCells(
  ctx: CanvasRenderingContext2D,
  cells: VoxelIsoCell[],
  size: number,
): void {
  paintStudioPlate(ctx, size);
  if (cells.length === 0) {
    paintEmptyThumb(ctx, size);
    return;
  }

  cells.sort((a, b) => a.x + a.z + a.y - (b.x + b.z + b.y));

  const isoX = (x: number, z: number) => (x - z) * 0.866;
  const isoY = (x: number, y: number, z: number) => (x + z) * 0.5 - y;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    const px = isoX(c.x, c.z);
    const py = isoY(c.x, c.y, c.z);
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px + 0.866);
    minY = Math.min(minY, py - 1);
    maxY = Math.max(maxY, py + 0.5);
  }
  const spanX = Math.max(0.001, maxX - minX);
  const spanY = Math.max(0.001, maxY - minY);
  const pad = size * 0.12;
  const sc = Math.min((size - pad * 2) / spanX, (size - pad * 2) / spanY);
  const ox = (size - spanX * sc) / 2 - minX * sc;
  const oy = (size - spanY * sc) / 2 - minY * sc;
  const cell = Math.max(1.2, sc * 0.92);

  const shade = (hex: string, mul: number) => {
    const h = hex.replace("#", "");
    if (h.length !== 6) return hex;
    const r = Math.min(255, Math.round(parseInt(h.slice(0, 2), 16) * mul));
    const gch = Math.min(255, Math.round(parseInt(h.slice(2, 4), 16) * mul));
    const b = Math.min(255, Math.round(parseInt(h.slice(4, 6), 16) * mul));
    return `rgb(${r},${gch},${b})`;
  };

  for (const c of cells) {
    const cx = isoX(c.x, c.z) * sc + ox;
    const cy = isoY(c.x, c.y, c.z) * sc + oy;
    const hw = cell * 0.5;
    const hh = cell * 0.29;
    const ht = cell * 0.55;

    ctx.fillStyle = shade(c.hex, 0.62);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + hw, cy - hh);
    ctx.lineTo(cx + hw, cy - hh - ht);
    ctx.lineTo(cx, cy - ht);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shade(c.hex, 0.78);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - hw, cy - hh);
    ctx.lineTo(cx - hw, cy - hh - ht);
    ctx.lineTo(cx, cy - ht);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shade(c.hex, 1.05);
    ctx.beginPath();
    ctx.moveTo(cx, cy - ht);
    ctx.lineTo(cx + hw, cy - hh - ht);
    ctx.lineTo(cx, cy - hh * 2 - ht);
    ctx.lineTo(cx - hw, cy - hh - ht);
    ctx.closePath();
    ctx.fill();
  }
}

function collectModelCells(
  model: EmberVoxelModel,
  ox = 0,
  oy = 0,
  oz = 0,
): VoxelIsoCell[] {
  const { sx, sy, sz } = voxelGridSize(model);
  const step = Math.max(1, Math.ceil(Math.max(sx, sy, sz) / 24));
  const cells: VoxelIsoCell[] = [];
  for (let y = 0; y < sy; y += step) {
    for (let z = 0; z < sz; z += step) {
      for (let x = 0; x < sx; x += step) {
        const pi = getVoxel(model, x, y, z);
        if (pi <= 0) continue;
        const hex = model.palette[pi] || "#888888";
        if (!hex || hex === "#00000000") continue;
        cells.push({ x: x + ox, y: y + oy, z: z + oz, hex });
      }
    }
  }
  return cells;
}

function collectSceneCells(
  scene: EmberVoxelScene,
  models: Record<string, EmberVoxelModel>,
): VoxelIsoCell[] {
  const cells: VoxelIsoCell[] = [];
  let maxSpan = 1;
  for (const obj of scene.objects) {
    if (obj.visible === false) continue;
    const m = models[obj.modelId];
    if (!m) continue;
    const g = voxelGridSize(m);
    maxSpan = Math.max(
      maxSpan,
      obj.offset.x + g.sx,
      obj.offset.y + g.sy,
      obj.offset.z + g.sz,
      Math.abs(obj.offset.x),
      Math.abs(obj.offset.y),
      Math.abs(obj.offset.z),
    );
  }
  // Downsample globally so large multi-object scenes stay light.
  const globalStep = Math.max(1, Math.ceil(maxSpan / 28));
  for (const obj of scene.objects) {
    if (obj.visible === false) continue;
    const m = models[obj.modelId];
    if (!m) continue;
    const { sx, sy, sz } = voxelGridSize(m);
    const step = Math.max(
      globalStep,
      Math.max(1, Math.ceil(Math.max(sx, sy, sz) / 24)),
    );
    for (let y = 0; y < sy; y += step) {
      for (let z = 0; z < sz; z += step) {
        for (let x = 0; x < sx; x += step) {
          const pi = getVoxel(m, x, y, z);
          if (pi <= 0) continue;
          const hex = m.palette[pi] || "#888888";
          if (!hex || hex === "#00000000") continue;
          cells.push({
            x: x + obj.offset.x,
            y: y + obj.offset.y,
            z: z + obj.offset.z,
            hex,
          });
        }
      }
    }
  }
  return cells;
}

type Props = {
  items: EmberThumbItem[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  size?: "sm" | "md";
  empty?: ReactNode;
  className?: string;
};

/** Compact thumbnail grid for tile/sprite pickers (Arts-style). */
export function EmberThumbGrid({
  items,
  selectedId,
  onSelect,
  size = "md",
  empty,
  className,
}: Props) {
  if (items.length === 0) {
    return (
      <div className={`ember-thumb-grid ember-thumb-grid--empty ${className ?? ""}`}>
        {empty ?? <p className="muted ember-hint">Пусто</p>}
      </div>
    );
  }

  return (
    <div
      className={`ember-thumb-grid ember-thumb-grid--${size} ${className ?? ""}`}
      role="listbox"
      aria-label="Выбор ассета"
    >
      {items.map((item) => {
        const active = selectedId != null && String(selectedId) === String(item.id);
        return (
          <div
            key={item.id}
            className={`ember-thumb-card ${active ? "is-active" : ""}`}
            role="option"
            aria-selected={active}
          >
            <button
              type="button"
              className="ember-thumb-card__hit"
              title={item.title ?? item.label ?? item.id}
              onClick={() => onSelect(item.id)}
            >
              <span className="ember-thumb-card__thumb">{item.thumb}</span>
              {item.label ? (
                <span className="ember-thumb-card__label">{item.label}</span>
              ) : null}
              {item.badges && item.badges.length > 0 ? (
                <span className="ember-thumb-card__badges">
                  {item.badges.map((b) => (
                    <span key={b} className="ember-thumb-badge">
                      {b}
                    </span>
                  ))}
                </span>
              ) : null}
            </button>
            {item.footer ? (
              <div className="ember-thumb-card__footer">{item.footer}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Pixel-art sprite preview for stamp / asset grids. */
export function EmberSpriteThumb({
  sprite,
  size = 40,
}: {
  sprite: EmberPixelSprite;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const s = normalizePixelSprite(sprite);
    const totalH = Math.max(1, spriteTotalHeight(s));
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, size, size);
    const sc = Math.min(size / s.width, size / totalH);
    const dw = Math.max(1, Math.round(s.width * sc));
    const dh = Math.max(1, Math.round(totalH * sc));
    const ox = Math.floor((size - dw) / 2);
    const oy = Math.floor((size - dh) / 2);
    if (spriteHasVisual(s)) {
      paintPixelGrid(ctx, s.pixels, s.width, totalH, ox, oy, dw, dh);
    }
  }, [sprite, size]);
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className="ember-sprite-thumb"
    />
  );
}

/**
 * Compact isometric-ish voxel model preview for open-picker / library grids.
 */
export function EmberVoxelThumb({
  model,
  size = 72,
}: {
  model: EmberVoxelModel;
  size?: number;
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
    ctx.clearRect(0, 0, size, size);
    paintVoxelIsoCells(ctx, collectModelCells(model), size);
  }, [model, size]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className="ember-voxel-thumb"
      aria-hidden
    />
  );
}

/**
 * Multi-object voxel scene preview (offsets composed) for library / pickers.
 */
export function EmberVoxelSceneThumb({
  scene,
  models,
  size = 72,
}: {
  scene: EmberVoxelScene;
  models: Record<string, EmberVoxelModel>;
  size?: number;
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
    ctx.clearRect(0, 0, size, size);
    const cells = collectSceneCells(scene, models);
    if (cells.length === 0 && scene.objects[0]) {
      const m = models[scene.objects[0].modelId];
      if (m) {
        paintVoxelIsoCells(ctx, collectModelCells(m), size);
        return;
      }
    }
    paintVoxelIsoCells(ctx, cells, size);
  }, [scene, models, size]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className="ember-voxel-thumb"
      aria-hidden
    />
  );
}

/** Color / empty tile swatch for map palette. */
export function EmberTileSwatch({
  color,
  empty,
  size = 44,
}: {
  color: string;
  empty?: boolean;
  size?: number;
}) {
  return (
    <span
      className="ember-thumb-swatch"
      style={{
        width: size,
        height: size,
        background: empty ? "#1a1512" : color,
      }}
    >
      {empty ? <span className="ember-thumb-swatch__empty">∅</span> : null}
    </span>
  );
}

/** Procedural stair preview for the rotatable staircase palette item. */
export function EmberStairThumb({
  dir,
  color,
  size = 40,
}: {
  dir: RampDir;
  color: string;
  size?: number;
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
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, size, size);
    const storyH = Math.max(8, Math.round(size * 0.42));
    const tread = Math.max(10, Math.round(size * 0.72));
    const ox = Math.floor((size - tread) / 2);
    const pyLow = size - Math.max(2, Math.round(size * 0.08));
    paintStairExtrusion(ctx, ox, pyLow, tread, storyH, dir, color);
  }, [dir, color, size]);
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className="ember-sprite-thumb"
    />
  );
}
