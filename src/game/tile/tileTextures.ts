import {
  normalizePixelSprite,
  sliceSpriteTop,
  sliceSpriteWall,
  spriteFaceHasInk,
  spriteHasVisual,
  spriteTotalHeight,
  spriteWallHeight,
} from "../content/pixelSprite";
import type {
  EmberPixelSprite,
  EmberTilesetTile,
  RampDir,
} from "../content/types";

export {
  spriteFaceHasInk,
  spriteHasVisual,
  spriteTotalHeight,
  spriteWallHeight,
} from "../content/pixelSprite";

/** Cache painted top faces — map editor paints the same tile many times per frame. */
const tileFaceCache = new WeakMap<
  EmberTilesetTile,
  Map<number, HTMLCanvasElement>
>();

/** Draw tile face via cache (integer size). Falls back to direct paint. */
export function blitTileFace(
  ctx: CanvasRenderingContext2D,
  tile: EmberTilesetTile | undefined,
  px: number,
  py: number,
  size: number,
  fallbackColor = "#2a3d28",
): void {
  const s = Math.max(1, Math.round(size));
  if (!tile || tile.name === "empty" || tile.color === "#00000000") {
    return;
  }
  let bySize = tileFaceCache.get(tile);
  if (!bySize) {
    bySize = new Map();
    tileFaceCache.set(tile, bySize);
  }
  let face = bySize.get(s);
  if (!face) {
    face = document.createElement("canvas");
    face.width = s;
    face.height = s;
    const fctx = face.getContext("2d");
    if (fctx) {
      fctx.imageSmoothingEnabled = false;
      paintTileFace(fctx, tile, 0, 0, s, fallbackColor);
    }
    bySize.set(s, face);
  }
  ctx.drawImage(face, Math.round(px), Math.round(py));
}

/** Procedural detail for ground / wall tops (canvas). */
export function paintTileFace(
  ctx: CanvasRenderingContext2D,
  tile: EmberTilesetTile | undefined,
  px: number,
  py: number,
  size: number,
  fallbackColor = "#2a3d28",
): void {
  const color = tile?.color && tile.color !== "#00000000" ? tile.color : fallbackColor;
  const name = tile?.name ?? "grass";
  const material = tile?.material;

  if (name === "empty") return;

  // Custom pixel art from tile editor
  if (tile?.pixels && tile.pixels.length > 0) {
    paintPixels(ctx, tile.pixels, px, py, size);
    return;
  }

  ctx.fillStyle = color;
  ctx.fillRect(px, py, size, size);

  if (tile?.ramp) {
    paintRampFace(ctx, px, py, size, tile.ramp, color);
    return;
  }
  if (tile?.stair) {
    paintStairFace(ctx, px, py, size, tile.stair, color);
    return;
  }

  if (name.includes("water")) {
    paintWater(ctx, px, py, size, color);
    return;
  }
  if (name.includes("grass") || material === "grass" || name === "grass") {
    paintGrass(ctx, px, py, size, color);
    return;
  }
  if (name.includes("path") || material === "path") {
    paintPath(ctx, px, py, size, color);
    return;
  }
  if (material === "metal" || name.includes("metal") || name.includes("iron")) {
    paintMetal(ctx, px, py, size, color);
    return;
  }
  if (
    material === "cloth" ||
    name.includes("cloth") ||
    name.includes("fabric") ||
    name.includes("curtain")
  ) {
    paintCloth(ctx, px, py, size, color);
    return;
  }
  if (material === "stone" || name.includes("stone") || name === "wall") {
    paintStone(ctx, px, py, size, color);
    return;
  }
  if (material === "wood" || name.includes("wood")) {
    paintWood(ctx, px, py, size, color);
    return;
  }
  if (name === "lantern" || tile?.glow) {
    paintLanternPad(ctx, px, py, size, color);
    return;
  }
  // generic noise
  paintNoise(ctx, px, py, size, 0.08);
}

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function paintNoise(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  amp: number,
): void {
  const step = Math.max(1, Math.floor(size / 8));
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const h = hash(px + x, py + y);
      if (h > 0.55) {
        ctx.fillStyle = `rgba(255,255,255,${amp * h})`;
        ctx.fillRect(px + x, py + y, step, step);
      } else if (h < 0.2) {
        ctx.fillStyle = `rgba(0,0,0,${amp * 1.4})`;
        ctx.fillRect(px + x, py + y, step, step);
      }
    }
  }
}

function paintWater(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  base: string,
): void {
  ctx.fillStyle = base;
  ctx.fillRect(px, py, size, size);
  ctx.fillStyle = "rgba(185, 245, 255, 0.16)";
  const step = Math.max(2, Math.floor(size / 5));
  for (let y = 0; y < size; y += step) {
    const offset = Math.floor(hash(px + y, py) * step);
    ctx.fillRect(
      px + offset,
      py + y,
      Math.max(2, Math.floor(size * 0.72) - offset),
      1,
    );
  }
  ctx.fillStyle = "rgba(245, 255, 255, 0.26)";
  ctx.fillRect(px + 1, py + 1, Math.max(1, Math.floor(size * 0.32)), 1);
  if (size >= 8) {
    ctx.fillRect(
      px + Math.floor(size * 0.62),
      py + Math.floor(size * 0.36),
      2,
      1,
    );
  }
  ctx.fillStyle = "rgba(0, 45, 85, 0.08)";
  ctx.fillRect(px, py + size - 2, size, 2);
}

/** Soft 2–3 tone grass — low detail. */
function paintGrass(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  base: string,
): void {
  ctx.fillStyle = base;
  ctx.fillRect(px, py, size, size);
  // Two large soft patches only
  const a = hash(px, py);
  const b = hash(py, px + 3);
  ctx.fillStyle = "rgba(0,0,0,0.1)";
  ctx.fillRect(px, py, size, size);
  ctx.fillStyle = "rgba(70, 110, 60, 0.35)";
  ctx.fillRect(
    px + Math.floor(a * size * 0.4),
    py + Math.floor(b * size * 0.4),
    Math.max(2, Math.floor(size * 0.45)),
    Math.max(2, Math.floor(size * 0.4)),
  );
  ctx.fillStyle = "rgba(40, 70, 38, 0.25)";
  ctx.fillRect(
    px + Math.floor((1 - a) * size * 0.35),
    py + Math.floor((1 - b) * size * 0.35),
    Math.max(2, Math.floor(size * 0.4)),
    Math.max(2, Math.floor(size * 0.35)),
  );
}

export function paintPixels(
  ctx: CanvasRenderingContext2D,
  pixels: string[],
  px: number,
  py: number,
  drawSize: number,
): void {
  paintPixelsRect(ctx, pixels, px, py, drawSize, drawSize);
}

/** Stretch n×n pixel art into a w×h rectangle. */
export function paintPixelsRect(
  ctx: CanvasRenderingContext2D,
  pixels: string[],
  px: number,
  py: number,
  w: number,
  h: number,
): void {
  const n = Math.round(Math.sqrt(pixels.length));
  if (n < 1 || w <= 0 || h <= 0) return;
  const x0 = Math.round(px);
  const y0 = Math.round(py);
  const rw = Math.max(1, Math.round(w));
  const rh = Math.max(1, Math.round(h));
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, rw, rh);
  ctx.clip();
  const cellW = rw / n;
  const cellH = rh / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const c = pixels[y * n + x];
      if (!c || c === "" || c === "#00000000") continue;
      ctx.fillStyle = c;
      const fx = x0 + Math.floor(x * cellW);
      const fy = y0 + Math.floor(y * cellH);
      const fw = Math.max(1, x0 + Math.floor((x + 1) * cellW) - fx);
      const fh = Math.max(1, y0 + Math.floor((y + 1) * cellH) - fy);
      ctx.fillRect(fx, fy, fw, fh);
    }
  }
  ctx.restore();
}

/**
 * Tile n×n pixel art across a w×h rect without stretching.
 * Each repeat is a square of side `w` (face width), stacked vertically.
 */
export function paintPixelsTiled(
  ctx: CanvasRenderingContext2D,
  pixels: string[],
  px: number,
  py: number,
  w: number,
  h: number,
): void {
  const n = Math.round(Math.sqrt(pixels.length));
  if (n < 1 || w <= 0 || h <= 0) return;
  const x0 = Math.round(px);
  const y0 = Math.round(py);
  const rw = Math.max(1, Math.round(w));
  const rh = Math.max(1, Math.round(h));
  const unit = rw; // one wall-art cell = face width × face width
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, rw, rh);
  ctx.clip();
  for (let oy = 0; oy < rh; oy += unit) {
    paintPixelsRect(ctx, pixels, x0, y0 + oy, rw, unit);
  }
  ctx.restore();
}

function paintPath(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  base: string,
): void {
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(px, py, size, size);
  const cell = Math.max(2, Math.floor(size / 4));
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const h = hash(px + x * 2, py + y * 2);
      ctx.fillStyle = `rgba(${40 + h * 30},${35 + h * 20},${28 + h * 15},${0.25 + h * 0.25})`;
      ctx.fillRect(px + x + 0.5, py + y + 0.5, cell - 1, cell - 1);
    }
  }
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
  void base;
}

function paintStone(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  base: string,
): void {
  paintNoise(ctx, px, py, size, 0.12);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  // brick-ish lines
  const rowH = Math.max(3, Math.floor(size / 3));
  for (let row = 0; row < 3; row++) {
    const y = py + row * rowH;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px + size, y);
    ctx.stroke();
    const offset = row % 2 === 0 ? 0 : size / 2;
    ctx.beginPath();
    ctx.moveTo(px + offset, y);
    ctx.lineTo(px + offset, y + rowH);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(px + 1, py + 1, size * 0.35, size * 0.2);
  void base;
}

function paintWood(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  base: string,
): void {
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(px, py, size, size);
  const lines = Math.max(3, Math.floor(size / 3));
  for (let i = 0; i < lines; i++) {
    const y = py + ((i + 0.5) * size) / lines;
    ctx.strokeStyle = `rgba(60,35,18,${0.35 + hash(px, i) * 0.3})`;
    ctx.lineWidth = Math.max(1, size / 14);
    ctx.beginPath();
    ctx.moveTo(px + 1, y);
    ctx.bezierCurveTo(
      px + size * 0.35,
      y + (hash(i, py) - 0.5) * 2,
      px + size * 0.65,
      y - (hash(py, i) - 0.5) * 2,
      px + size - 1,
      y,
    );
    ctx.stroke();
  }
  void base;
}

/** Brushed plates + cool specular flecks. */
function paintMetal(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  base: string,
): void {
  paintNoise(ctx, px, py, size, 0.06);
  const bands = Math.max(4, Math.floor(size / 3));
  for (let i = 0; i < bands; i++) {
    const y = py + Math.floor(((i + 0.15) * size) / bands);
    ctx.fillStyle = `rgba(255,255,255,${0.04 + hash(px, i) * 0.08})`;
    ctx.fillRect(px, y, size, Math.max(1, Math.floor(size / 18)));
    if (hash(i, py) > 0.55) {
      ctx.fillStyle = `rgba(0,0,0,${0.12 + hash(py, i) * 0.18})`;
      ctx.fillRect(
        px + Math.floor(hash(i, px) * size * 0.4),
        y,
        Math.max(2, Math.floor(size * 0.35)),
        Math.max(1, Math.floor(size / 16)),
      );
    }
  }
  // Cool edge highlight
  ctx.fillStyle = "rgba(200,220,240,0.18)";
  ctx.fillRect(px + 1, py + 1, Math.max(1, Math.floor(size * 0.22)), Math.max(1, Math.floor(size * 0.12)));
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(px, py + size - 2, size, 2);
  void base;
}

/** Soft weave / folds — matte absorb look. */
function paintCloth(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  base: string,
): void {
  ctx.fillStyle = "rgba(0,0,0,0.1)";
  ctx.fillRect(px, py, size, size);
  const folds = Math.max(3, Math.floor(size / 4));
  for (let i = 0; i < folds; i++) {
    const x = px + ((i + 0.5) * size) / folds;
    ctx.strokeStyle = `rgba(0,0,0,${0.12 + hash(i, px) * 0.2})`;
    ctx.lineWidth = Math.max(1, size / 12);
    ctx.beginPath();
    ctx.moveTo(x, py + 1);
    ctx.bezierCurveTo(
      x + (hash(i, py) - 0.5) * size * 0.15,
      py + size * 0.35,
      x - (hash(py, i) - 0.5) * size * 0.15,
      py + size * 0.7,
      x + (hash(px, i) - 0.5) * 2,
      py + size - 1,
    );
    ctx.stroke();
  }
  // Soft cross-weave dots
  const step = Math.max(2, Math.floor(size / 6));
  for (let y = step; y < size; y += step) {
    for (let x = step; x < size; x += step) {
      if (hash(px + x, py + y) > 0.62) {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(px + x, py + y, 1, 1);
      }
    }
  }
  void base;
}

function paintLanternPad(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  base: string,
): void {
  paintPath(ctx, px, py, size, base);
  const cx = px + size / 2;
  const cy = py + size / 2;
  const r = size * 0.22;
  ctx.fillStyle = "#2a1810";
  ctx.fillRect(cx - r * 0.35, cy - r * 0.2, r * 0.7, r * 1.1);
  ctx.fillStyle = "#ffb060";
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.15, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,200,80,0.35)";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.2, 0, Math.PI * 2);
  ctx.fill();
}

export function paintRampFace(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  dir: RampDir,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(px, py, size, size);
  paintStone(ctx, px, py, size, color);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  switch (dir) {
    case "n":
      ctx.moveTo(px, py + size);
      ctx.lineTo(px + size, py + size);
      ctx.lineTo(px + size / 2, py);
      break;
    case "s":
      ctx.moveTo(px, py);
      ctx.lineTo(px + size, py);
      ctx.lineTo(px + size / 2, py + size);
      break;
    case "e":
      ctx.moveTo(px, py);
      ctx.lineTo(px, py + size);
      ctx.lineTo(px + size, py + size / 2);
      break;
    case "w":
      ctx.moveTo(px + size, py);
      ctx.lineTo(px + size, py + size);
      ctx.lineTo(px, py + size / 2);
      break;
    default: {
      const _n: never = dir;
      void _n;
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(px + size * 0.15, py + size * 0.15, size * 0.25, size * 0.12);
  // step lines
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 2; i++) {
    const t = i / 3;
    ctx.beginPath();
    if (dir === "n" || dir === "s") {
      const y = dir === "s" ? py + size * t : py + size * (1 - t);
      ctx.moveTo(px + size * 0.15, y);
      ctx.lineTo(px + size * 0.85, y);
    } else {
      const x = dir === "e" ? px + size * t : px + size * (1 - t);
      ctx.moveTo(x, py + size * 0.15);
      ctx.lineTo(x, py + size * 0.85);
    }
    ctx.stroke();
  }
}

export const STAIR_STEPS = 4;

/**
 * Flat top-down stair glyph for the tile-face cache / tiny thumbs.
 * Map & Phaser use {@link paintStairExtrusion} for the real stepped block.
 */
export function paintStairFace(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  dir: RampDir,
  color: string,
): void {
  const steps = STAIR_STEPS;
  const cheekW = Math.max(1, Math.round(size * 0.12));
  const inset = Math.max(1, Math.round(size * 0.06));
  const riserT = Math.max(1, Math.round(size * 0.07));

  ctx.fillStyle = shadeHexLocal(color, 0.62);
  ctx.fillRect(px, py, size, size);

  ctx.fillStyle = shadeHexLocal(color, 0.48);
  if (dir === "n" || dir === "s") {
    ctx.fillRect(px, py, cheekW, size);
    ctx.fillRect(px + size - cheekW, py, cheekW, size);
  } else {
    ctx.fillRect(px, py, size, cheekW);
    ctx.fillRect(px, py + size - cheekW, size, cheekW);
  }

  const inner0 = inset;
  const span = size - inset * 2;

  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const tread = shadeHexLocal(
      color,
      0.78 + (i / Math.max(1, steps - 1)) * 0.32,
    );
    const riser = shadeHexLocal(color, 0.4 + i * 0.04);

    let x = 0;
    let y = 0;
    let w = 0;
    let h = 0;
    let rx = 0;
    let ry = 0;
    let rw = 0;
    let rh = 0;

    switch (dir) {
      case "n": {
        y = py + inner0 + span * (1 - t1);
        h = Math.max(1, span * (t1 - t0));
        x = px + cheekW;
        w = size - cheekW * 2;
        rx = x;
        ry = y;
        rw = w;
        rh = riserT;
        break;
      }
      case "s": {
        y = py + inner0 + span * t0;
        h = Math.max(1, span * (t1 - t0));
        x = px + cheekW;
        w = size - cheekW * 2;
        rx = x;
        ry = y + h - riserT;
        rw = w;
        rh = riserT;
        break;
      }
      case "e": {
        x = px + inner0 + span * t0;
        w = Math.max(1, span * (t1 - t0));
        y = py + cheekW;
        h = size - cheekW * 2;
        rx = x + w - riserT;
        ry = y;
        rw = riserT;
        rh = h;
        break;
      }
      case "w": {
        x = px + inner0 + span * (1 - t1);
        w = Math.max(1, span * (t1 - t0));
        y = py + cheekW;
        h = size - cheekW * 2;
        rx = x;
        ry = y;
        rw = riserT;
        rh = h;
        break;
      }
      default: {
        const _n: never = dir;
        void _n;
        return;
      }
    }

    ctx.fillStyle = tread;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    ctx.fillStyle = riser;
    ctx.fillRect(Math.round(rx), Math.round(ry), Math.round(rw), Math.round(rh));
  }
}

/**
 * One-story 2.5D staircase: tread strips at rising height + short risers.
 * `pyLow` = screen Y of the low landing top; climbs `storyH` toward `dir`.
 *
 * No solid bounding underfill (that read as black side squares). N/S share the
 * elevation axis with map Y, so treads are horizontal bands shifted up by elev.
 */
export function paintStairExtrusion(
  ctx: CanvasRenderingContext2D,
  px: number,
  pyLow: number,
  size: number,
  storyH: number,
  dir: RampDir,
  color: string,
): void {
  const s = Math.max(4, Math.round(size));
  const sh = Math.max(STAIR_STEPS, Math.round(storyH));
  const steps = STAIR_STEPS;
  const cheek = Math.max(1, Math.round(s * 0.1));
  const x0 = Math.round(px);
  const yLow = Math.round(pyLow);
  const dark = shadeHexLocal(color, 0.4);
  const treadHi = shadeHexLocal(color, 1.08);
  const treadMid = shadeHexLocal(color, 0.88);
  const riserCol = shadeHexLocal(color, 0.52);
  const edge = "rgba(0,0,0,0.4)";
  const gloss = "rgba(255,230,180,0.14)";

  const elevY = (t1: number) => yLow - Math.round(t1 * sh);
  const riseAt = (i: number) => {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    return Math.max(1, Math.round(t1 * sh) - Math.round(t0 * sh));
  };
  const stripAt = (i: number) => {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    return Math.max(1, Math.round(s * t1) - Math.round(s * t0));
  };

  const paintTread = (
    x: number,
    y: number,
    w: number,
    h: number,
    high: boolean,
  ) => {
    ctx.fillStyle = high ? treadHi : treadMid;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = gloss;
    ctx.fillRect(x + 1, y + 1, Math.max(1, w - 2), Math.max(1, Math.floor(h * 0.2)));
    ctx.fillStyle = edge;
    ctx.fillRect(x, y + h - 1, w, 1);
  };

  const paintRiser = (x: number, y: number, w: number, h: number) => {
    if (h <= 0 || w <= 0) return;
    ctx.fillStyle = riserCol;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(x, y, w, Math.max(1, Math.floor(h * 0.4)));
  };

  /** Thin cheek along the visible stair silhouette (not a full black slab). */
  const paintCheek = (
    x: number,
    y0: number,
    y1: number,
    w: number,
  ) => {
    const top = Math.min(y0, y1);
    const bot = Math.max(y0, y1);
    ctx.fillStyle = dark;
    ctx.fillRect(x, top, w, Math.max(1, bot - top));
  };

  if (dir === "e" || dir === "w") {
    // Side stringers follow the step diagonal (low → high).
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const yTop = elevY(t1);
      const yBot = elevY(t0) + s;
      const sx =
        dir === "e"
          ? x0 + Math.round(s * t0)
          : x0 + Math.round(s * (1 - t1));
      const sw = stripAt(i);
      paintCheek(sx, yTop, yBot, Math.min(cheek, sw));
      paintCheek(
        sx + Math.max(0, sw - cheek),
        yTop,
        yBot,
        Math.min(cheek, sw),
      );
    }

    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const yTop = elevY(t1);
      const rise = riseAt(i);
      const sw = stripAt(i);
      const treadX =
        dir === "e"
          ? x0 + Math.round(s * t0)
          : x0 + Math.round(s * (1 - t1));
      // Short south riser only — no column fill (avoids side black squares).
      paintRiser(treadX, yTop + s, sw, rise);
      paintTread(treadX, yTop, sw, s, i === steps - 1);
    }
    return;
  }

  if (dir === "n") {
    // low south → high north: horizontal bands, each lifted by elev
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const yTop = elevY(t1);
      const rise = riseAt(i);
      // Band within the tile footprint (0 = north edge, 1 = south edge)
      const band0 = Math.round(s * (1 - t1));
      const band1 = Math.round(s * (1 - t0));
      const treadH = Math.max(1, band1 - band0);
      const treadY = yTop + band0;
      const treadX = x0 + cheek;
      const treadW = s - cheek * 2;

      // Side cheeks for this band only
      paintCheek(x0, treadY, treadY + treadH + rise, cheek);
      paintCheek(x0 + s - cheek, treadY, treadY + treadH + rise, cheek);

      // Riser on the south edge of this tread (facing camera)
      paintRiser(treadX, treadY + treadH, treadW, rise);
      paintTread(treadX, treadY, treadW, treadH, i === steps - 1);
    }
    return;
  }

  // dir === "s": low north → high south
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const yTop = elevY(t1);
    const rise = riseAt(i);
    const band0 = Math.round(s * t0);
    const band1 = Math.round(s * t1);
    const treadH = Math.max(1, band1 - band0);
    const treadY = yTop + band0;
    const treadX = x0 + cheek;
    const treadW = s - cheek * 2;

    paintCheek(x0, treadY, treadY + treadH + rise, cheek);
    paintCheek(x0 + s - cheek, treadY, treadY + treadH + rise, cheek);

    paintRiser(treadX, treadY + treadH, treadW, rise);
    paintTread(treadX, treadY, treadW, treadH, i === steps - 1);
  }
}

function parseCssRgba(
  fill: string,
): { r: number; g: number; b: number; a: number } | null {
  const m = fill.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i,
  );
  if (!m) return null;
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] !== undefined ? Number(m[4]) : 1,
  };
}

function withCssRgbaAlpha(fill: string, alpha: number): string {
  const p = parseCssRgba(fill);
  if (!p) return fill;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${p.r}, ${p.g}, ${p.b}, ${a})`;
}

export type StairLanternWashOpts = {
  /**
   * Low wash is spill from the prior flight step only — soft bottom ~2 steps.
   * Direct lamp-on-low-band wash uses full cover instead.
   */
  lowSpill?: boolean;
};

/**
 * Lantern wash along a stair climb. Call with `source-atop` on an already
 * painted stair extrusion. Light hits tread tops only — camera-facing risers
 * (the small step walls) stay ambient-dark.
 */
export function paintStairLanternWashClipped(
  ctx: CanvasRenderingContext2D,
  px: number,
  pyLow: number,
  size: number,
  storyH: number,
  dir: RampDir,
  lowFill: string,
  highFill: string,
  opts?: StairLanternWashOpts,
): void {
  const s = Math.max(4, Math.round(size));
  const sh = Math.max(STAIR_STEPS, Math.round(storyH));
  const x = Math.round(px);
  const y = Math.round(pyLow) - sh;
  const lowSpill = opts?.lowSpill === true;
  const steps = STAIR_STEPS;
  const cheek = Math.max(1, Math.round(s * 0.1));

  // Offscreen: tread-only mask × climb gradient (same stops as before).
  const tmp = document.createElement("canvas");
  tmp.width = s;
  tmp.height = sh + s;
  const tctx = tmp.getContext("2d");
  if (!tctx) return;
  tctx.imageSmoothingEnabled = false;

  const x0 = 0;
  const yLow = sh;
  const elevY = (t1: number) => yLow - Math.round(t1 * sh);
  const riseAt = (i: number) => {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    return Math.max(1, Math.round(t1 * sh) - Math.round(t0 * sh));
  };
  const stripAt = (i: number) => {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    return Math.max(1, Math.round(s * t1) - Math.round(s * t0));
  };

  // 1) Opaque tread tops — same rects as paintStairExtrusion treads.
  tctx.fillStyle = "#ffffff";
  if (dir === "e" || dir === "w") {
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const yTop = elevY(t1);
      const sw = stripAt(i);
      const treadX =
        dir === "e"
          ? x0 + Math.round(s * t0)
          : x0 + Math.round(s * (1 - t1));
      tctx.fillRect(treadX, yTop, sw, s);
    }
  } else if (dir === "n") {
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const yTop = elevY(t1);
      const band0 = Math.round(s * (1 - t1));
      const band1 = Math.round(s * (1 - t0));
      const treadH = Math.max(1, band1 - band0);
      tctx.fillRect(x0 + cheek, yTop + band0, s - cheek * 2, treadH);
    }
  } else {
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const yTop = elevY(t1);
      const band0 = Math.round(s * t0);
      const band1 = Math.round(s * t1);
      const treadH = Math.max(1, band1 - band0);
      tctx.fillRect(x0 + cheek, yTop + band0, s - cheek * 2, treadH);
    }
  }

  // 2) Punch camera-facing risers out (must not receive wash).
  tctx.globalCompositeOperation = "destination-out";
  tctx.fillStyle = "#000";
  if (dir === "e" || dir === "w") {
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const yTop = elevY(t1);
      const rise = riseAt(i);
      const sw = stripAt(i);
      const treadX =
        dir === "e"
          ? x0 + Math.round(s * t0)
          : x0 + Math.round(s * (1 - t1));
      tctx.fillRect(treadX, yTop + s, sw, rise);
    }
  } else if (dir === "n") {
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const yTop = elevY(t1);
      const rise = riseAt(i);
      const band0 = Math.round(s * (1 - t1));
      const band1 = Math.round(s * (1 - t0));
      const treadH = Math.max(1, band1 - band0);
      tctx.fillRect(
        x0 + cheek,
        yTop + band0 + treadH,
        s - cheek * 2,
        rise,
      );
    }
  } else {
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const yTop = elevY(t1);
      const rise = riseAt(i);
      const band0 = Math.round(s * t0);
      const band1 = Math.round(s * t1);
      const treadH = Math.max(1, band1 - band0);
      tctx.fillRect(
        x0 + cheek,
        yTop + band0 + treadH,
        s - cheek * 2,
        rise,
      );
    }
  }

  // 3) Color the tread mask with the same climb gradient as before.
  tctx.globalCompositeOperation = "source-in";
  let grad: CanvasGradient;
  switch (dir) {
    case "e":
      grad = tctx.createLinearGradient(0, 0, s, 0);
      break;
    case "w":
      grad = tctx.createLinearGradient(s, 0, 0, 0);
      break;
    case "n":
      grad = tctx.createLinearGradient(0, sh + s, 0, 0);
      break;
    case "s":
      grad = tctx.createLinearGradient(0, 0, 0, sh + s);
      break;
    default: {
      const _n: never = dir;
      void _n;
      return;
    }
  }
  const lowA = parseCssRgba(lowFill)?.a ?? 0;
  const highA = parseCssRgba(highFill)?.a ?? 0;
  const softHigh = withCssRgbaAlpha(highFill, (highA || 0) * 0.72);
  const softLow = withCssRgbaAlpha(lowFill, (lowA || 0) * 0.72);
  const clear = "rgba(0,0,0,0)";
  if (lowA < 0.02 && highA >= 0.02) {
    grad.addColorStop(0, clear);
    grad.addColorStop(0.48, clear);
    grad.addColorStop(0.68, softHigh);
    grad.addColorStop(1, highFill);
  } else if (highA < 0.02 && lowA >= 0.02) {
    if (lowSpill) {
      grad.addColorStop(0, softLow);
      grad.addColorStop(0.35, softLow);
      grad.addColorStop(0.55, clear);
      grad.addColorStop(1, clear);
    } else {
      grad.addColorStop(0, lowFill);
      grad.addColorStop(1, lowFill);
    }
  } else {
    grad.addColorStop(0, lowFill);
    grad.addColorStop(1, highFill);
  }
  tctx.fillStyle = grad;
  tctx.fillRect(0, 0, s, sh + s);

  ctx.drawImage(tmp, x, y);
}

function shadeHexLocal(hex: string, mul: number): string {
  if (!hex.startsWith("#") || hex.length < 7) return hex;
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * mul));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * mul));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * mul));
  return `rgb(${r},${g},${b})`;
}

/** Darker textured south face of an extruded wall / cliff. */
export function paintWallFront(
  ctx: CanvasRenderingContext2D,
  tile: EmberTilesetTile | undefined,
  px: number,
  py: number,
  width: number,
  height: number,
): void {
  const x0 = Math.round(px);
  const y0 = Math.round(py);
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (w <= 0 || h <= 0) return;

  // Hard clip — canvas strokes are centered and otherwise bleed onto floor tops.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();

  const wallN = tile?.wallPixels
    ? Math.round(Math.sqrt(tile.wallPixels.length))
    : 0;
  if (tile?.wallPixels && wallN * wallN === tile.wallPixels.length && wallN > 0) {
    const base =
      tile.color && tile.color !== "#00000000" ? tile.color : "#5a4a40";
    ctx.fillStyle = shadeHexLocal(base, 0.45);
    ctx.fillRect(x0, y0, w, h);
    // Tile (don't stretch) so tall cliffs keep native wall-pixel scale
    paintPixelsTiled(ctx, tile.wallPixels, x0, y0, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(x0, y0, w, Math.max(1, Math.floor(Math.min(h, w) * 0.12)));
    ctx.restore();
    return;
  }

  const material = tile?.material;
  const name = tile?.name ?? "stone";
  const base =
    tile?.color && tile.color !== "#00000000" ? tile.color : "#5a4a40";
  const dark = shadeHexLocal(base, 0.5);
  ctx.fillStyle = dark;
  ctx.fillRect(x0, y0, w, h);

  const isWood = material === "wood" || name.includes("wood");
  const isMetal =
    material === "metal" || name.includes("metal") || name.includes("iron");
  const isCloth =
    material === "cloth" ||
    name.includes("cloth") ||
    name.includes("fabric") ||
    name.includes("curtain");
  if (isMetal) {
    const bands = Math.max(4, Math.floor(w / 5));
    for (let i = 0; i < bands; i++) {
      const y = y0 + Math.floor(((i + 0.2) * h) / bands);
      ctx.fillStyle = `rgba(220,230,245,${0.05 + hash(i, y0) * 0.08})`;
      ctx.fillRect(x0, y, w, Math.max(1, Math.floor(w / 20)));
      if (hash(x0, i) > 0.5) {
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fillRect(
          x0 + Math.floor(hash(i, x0) * w * 0.5),
          y,
          Math.max(2, Math.floor(w * 0.3)),
          Math.max(1, Math.floor(w / 18)),
        );
      }
    }
  } else if (isCloth) {
    const folds = Math.max(3, Math.floor(w / 4));
    for (let i = 0; i < folds; i++) {
      const x = x0 + Math.floor(((i + 0.5) * w) / folds);
      ctx.fillStyle = `rgba(0,0,0,${0.14 + hash(i, y0) * 0.2})`;
      ctx.fillRect(x, y0 + 1, Math.max(1, Math.floor(w / 16)), h - 2);
    }
    const seam = Math.max(4, Math.floor(w / 3));
    for (let y = seam; y < h; y += seam) {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(x0, y0 + y, w, 1);
    }
  } else if (isWood) {
    const planks = Math.max(3, Math.floor(w / 4));
    const plankW = Math.max(1, Math.floor(w / planks));
    for (let i = 0; i < planks; i++) {
      const x = x0 + i * plankW + Math.floor(plankW / 2);
      ctx.fillStyle = `rgba(30,18,10,${0.35 + hash(i, y0) * 0.35})`;
      ctx.fillRect(x, y0 + 1, Math.max(1, Math.floor(w / 18)), h - 2);
    }
    // Fixed seam spacing from face width (not total height — avoids stretch)
    const seam = Math.max(3, Math.floor(w / 3));
    for (let y = seam; y < h; y += seam) {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(x0, y0 + y, w, 1);
    }
  } else {
    // Fixed brick course height from face width — repeats down tall cliffs
    const rowH = Math.max(3, Math.floor(w / 4));
    for (let row = 0; row * rowH < h; row++) {
      const y = y0 + row * rowH;
      if (row > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(x0, y, w, 1);
      }
      const brickW = Math.max(4, Math.floor(w / 2));
      const offset = row % 2 === 0 ? 0 : Math.floor(brickW / 2);
      for (let x = x0 + offset; x < x0 + w; x += brickW) {
        if (x <= x0) continue;
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(x, y, 1, Math.min(rowH, y0 + h - y));
      }
      if (hash(x0 + row, y0) > 0.55) {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(
          x0 + offset + 1,
          y + 1,
          Math.max(1, brickW * 0.4),
          Math.max(1, rowH * 0.35),
        );
      }
    }
  }
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(x0, y0, w, Math.max(1, Math.floor(Math.min(h, w) * 0.15)));
  if (h >= 2) {
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(x0, y0 + h - 2, w, 2);
  }
  ctx.restore();
}

/** Generate a Phaser texture key for a tile (call once per tile id). */
export function generatePhaserTileTexture(
  scene: {
    textures: {
      exists: (k: string) => boolean;
      remove: (k: string) => void;
      addCanvas: (k: string, c: HTMLCanvasElement) => void;
    };
  },
  tile: EmberTilesetTile,
  size = 16,
): string {
  const key = `ember_tile_${tile.id}`;
  // Reuse — never remove while sprites may hold the GL texture
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return key;
  paintTileFace(ctx, tile, 0, 0, size);
  scene.textures.addCanvas(key, canvas);
  return key;
}

/**
 * Paint a width×height pixel buffer into a dest rect (1 cell → stretch).
 */
export function paintPixelGrid(
  ctx: CanvasRenderingContext2D,
  pixels: string[],
  srcW: number,
  srcH: number,
  px: number,
  py: number,
  destW: number,
  destH: number,
): void {
  if (srcW < 1 || srcH < 1 || destW <= 0 || destH <= 0) return;
  if (pixels.length < srcW * srcH) return;
  const x0 = Math.round(px);
  const y0 = Math.round(py);
  const rw = Math.max(1, Math.round(destW));
  const rh = Math.max(1, Math.round(destH));
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, rw, rh);
  ctx.clip();
  const cellW = rw / srcW;
  const cellH = rh / srcH;
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const c = pixels[y * srcW + x];
      if (!c || c === "" || c === "#00000000") continue;
      ctx.fillStyle = c;
      const fx = x0 + Math.floor(x * cellW);
      const fy = y0 + Math.floor(y * cellH);
      const fw = Math.max(1, x0 + Math.floor((x + 1) * cellW) - fx);
      const fh = Math.max(1, y0 + Math.floor((y + 1) * cellH) - fy);
      ctx.fillRect(fx, fy, fw, fh);
    }
  }
  ctx.restore();
}

/** Full stack texture (top + walls) — key `ember_sprite_${id}`. */
export function generatePhaserSpriteTexture(
  scene: {
    textures: {
      exists: (k: string) => boolean;
      addCanvas: (k: string, c: HTMLCanvasElement) => void;
    };
  },
  sprite: EmberPixelSprite,
): string {
  const s = normalizePixelSprite(sprite);
  const key = `ember_sprite_${s.id}`;
  if (scene.textures.exists(key)) return key;
  const w = s.width;
  const h = Math.max(1, spriteTotalHeight(s));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return key;
  ctx.imageSmoothingEnabled = false;
  if (spriteHasVisual(s)) {
    paintPixelGrid(ctx, s.pixels, w, h, 0, 0, w, h);
  } else {
    ctx.fillStyle = s.color || "#c45c26";
    ctx.fillRect(0, 0, w, Math.max(1, s.topHeight));
  }
  scene.textures.addCanvas(key, canvas);
  return key;
}

/**
 * Draw sprite top + wall strips. `(cx, cy)` is the center of the top face.
 * `scale` maps art px → screen/world px.
 */
export function paintSpriteDecor(
  ctx: CanvasRenderingContext2D,
  sprite: EmberPixelSprite,
  cx: number,
  cy: number,
  scale = 1,
): void {
  const s = normalizePixelSprite(sprite);
  if (!spriteHasVisual(s)) return;
  const sc = Math.max(0.01, scale);
  const tw = Math.max(1, Math.round(s.width * sc));
  const th = Math.max(1, Math.round(s.topHeight * sc));
  const x = Math.round(cx - tw / 2);
  const y = Math.round(cy - th / 2);
  const top = sliceSpriteTop(s);
  if (spriteFaceHasInk(top)) {
    paintPixelGrid(ctx, top, s.width, s.topHeight, x, y, tw, th);
  }
  let yCursor = y + th;
  for (let i = 0; i < s.wallHeights.length; i++) {
    const srcH = s.wallHeights[i]!;
    const dh = Math.max(1, Math.round(srcH * sc));
    const band = sliceSpriteWall(s, i);
    if (spriteFaceHasInk(band)) {
      paintPixelGrid(ctx, band, s.width, srcH, x, yCursor, tw, dh);
    }
    yCursor += dh;
  }
}

/**
 * Stamp sprite on a floor tile (map editor / preview).
 * With walls — extruded block; wall bottom aligns to floor tile bottom
 * when top width ≈ floor size. Without walls — top centered on floor.
 */
export function paintSpriteDecorOnFloor(
  ctx: CanvasRenderingContext2D,
  sprite: EmberPixelSprite,
  floorX: number,
  floorY: number,
  floorSize: number,
  scale = 1,
): void {
  const s = normalizePixelSprite(sprite);
  if (!spriteHasVisual(s)) return;
  const sc = Math.max(0.01, scale);
  const floor = Math.max(1, Math.round(floorSize));
  const wallH = Math.round(spriteWallHeight(s) * sc);
  const topH = Math.max(1, Math.round(s.topHeight * sc));
  const cx = floorX + floor / 2;
  const cy =
    wallH > 0
      ? floorY + floor - wallH - topH / 2
      : floorY + floor / 2;
  paintSpriteDecor(ctx, s, cx, cy, sc);
}

/** Front-face strip texture for extruded walls / cliffs (width × faceH). */
export function generatePhaserWallFrontTexture(
  scene: {
    textures: {
      exists: (k: string) => boolean;
      remove: (k: string) => void;
      addCanvas: (k: string, c: HTMLCanvasElement) => void;
    };
  },
  tile: EmberTilesetTile,
  width: number,
  faceH: number,
): string {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(faceH));
  let wallHash = 0;
  if (tile.wallPixels) {
    for (let i = 0; i < tile.wallPixels.length; i += 7) {
      const c = tile.wallPixels[i] ?? "";
      wallHash = (wallHash * 33 + c.length * 17 + (c.charCodeAt(1) || 0)) | 0;
    }
  }
  const key = `ember_wall_front_${tile.id}_${w}x${h}_${wallHash}`;
  // Reuse cached strip — remove+recreate invalidates live cliff/wall sprites (glTexture null)
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return key;
  paintWallFront(ctx, tile, 0, 0, w, h);
  scene.textures.addCanvas(key, canvas);
  return key;
}

/** Phaser texture for a one-story stair/ramp extrusion (size × storyH tall). */
export function generatePhaserStairTexture(
  scene: {
    textures: {
      exists: (k: string) => boolean;
      addCanvas: (k: string, c: HTMLCanvasElement) => void;
    };
  },
  tile: EmberTilesetTile,
  dir: RampDir,
  size: number,
  storyH: number,
): string {
  const s = Math.max(4, Math.round(size));
  const sh = Math.max(STAIR_STEPS, Math.round(storyH));
  const key = `ember_stair_${tile.id}_${dir}_${s}x${sh}`;
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = sh + s;
  const ctx = canvas.getContext("2d");
  if (!ctx) return key;
  ctx.imageSmoothingEnabled = false;
  const color =
    tile.color && tile.color !== "#00000000" ? tile.color : "#7a6a50";
  // pyLow = sh → high tread at y=0, low tread at y=sh
  paintStairExtrusion(ctx, 0, sh, s, sh, dir, color);
  scene.textures.addCanvas(key, canvas);
  return key;
}

/** Phaser texture: lantern wash following stair silhouette (low→high gradient). */
export function generatePhaserStairWashTexture(
  scene: {
    textures: {
      exists: (k: string) => boolean;
      addCanvas: (k: string, c: HTMLCanvasElement) => void;
    };
  },
  dir: RampDir,
  size: number,
  storyH: number,
  lowFill: string,
  highFill: string,
  cacheKey: string,
): string {
  const s = Math.max(4, Math.round(size));
  const sh = Math.max(STAIR_STEPS, Math.round(storyH));
  const key = `ember_stair_wash_v12_${dir}_${s}x${sh}_${cacheKey}`;
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = sh + s;
  const ctx = canvas.getContext("2d");
  if (!ctx) return key;
  ctx.imageSmoothingEnabled = false;
  paintStairLanternWashClipped(ctx, 0, sh, s, sh, dir, lowFill, highFill);
  // Clip gradient to stair silhouette.
  const mask = document.createElement("canvas");
  mask.width = s;
  mask.height = sh + s;
  const mctx = mask.getContext("2d");
  if (mctx) {
    mctx.imageSmoothingEnabled = false;
    paintStairExtrusion(mctx, 0, sh, s, sh, dir, "#ffffff");
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }
  scene.textures.addCanvas(key, canvas);
  return key;
}

/**
 * Phaser texture: stair art + night + lamp wash. Drawn above face glow so
 * opaque stair pixels occlude wall/cliff shine-through under the flight.
 */
export function generatePhaserStairLitTexture(
  scene: {
    textures: {
      exists: (k: string) => boolean;
      addCanvas: (k: string, c: HTMLCanvasElement) => void;
    };
  },
  tile: EmberTilesetTile,
  dir: RampDir,
  size: number,
  storyH: number,
  ambientCss: string,
  lowFill: string | null,
  highFill: string | null,
  cacheKey: string,
  lowSpill = false,
): string {
  const s = Math.max(4, Math.round(size));
  const sh = Math.max(STAIR_STEPS, Math.round(storyH));
  const key = `ember_stair_lit_v12_${tile.id}_${dir}_${s}x${sh}_${cacheKey}`;
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = sh + s;
  const ctx = canvas.getContext("2d");
  if (!ctx) return key;
  ctx.imageSmoothingEnabled = false;
  const color =
    tile.color && tile.color !== "#00000000" ? tile.color : "#7a6a50";
  paintStairExtrusion(ctx, 0, sh, s, sh, dir, color);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = ambientCss;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (lowFill || highFill) {
    paintStairLanternWashClipped(
      ctx,
      0,
      sh,
      s,
      sh,
      dir,
      lowFill ?? "rgba(0,0,0,0)",
      highFill ?? "rgba(0,0,0,0)",
      { lowSpill },
    );
  }
  ctx.globalCompositeOperation = "source-over";
  scene.textures.addCanvas(key, canvas);
  return key;
}
