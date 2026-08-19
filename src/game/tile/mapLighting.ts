/**
 * Geometry-first map lighting: build surfaces, light them, paint washes.
 * Shared by editor canvas and Phaser (dynamic light pass).
 */
import type {
  EmberMap,
  EmberTileset,
  RampDir,
} from "../content/types";
import { WALL_HEIGHT } from "./extruded";
import {
  STAIR_STEPS,
  paintStairExtrusion,
  paintStairLanternWashClipped,
} from "./tileTextures";
import type { EmberSpriteLib, LampGlowCell, LanternSource } from "./mapUtils";
import {
  connectorDirAt,
  connectorElevBand,
  elevationAt,
  elevVisualOffset,
  groundTileAt,
  heightAt,
  isSolidAt,
  lampStrengthAtDist,
  lanternFaceWashAlpha,
  lanternFloorWashAlpha,
  listLanternSources,
  parseHexRgb,
  resolveMapLight,
  rgbaFromHex,
} from "./mapUtils";

export type MapSurfaceKind = "floor" | "face" | "tread";

export type MapSurface = {
  id: string;
  kind: MapSurfaceKind;
  tx: number;
  ty: number;
  /** Floor elev, face z0, or tread band.low */
  z0: number;
  /** Face exclusive top / tread band.high; floor uses z0 */
  z1: number;
  dir?: RampDir;
  /** Stair steps (tread only). */
  steps?: number;
  /** Wall extrusion vs cliff under elevated floor. */
  faceOrigin?: "wall" | "cliff";
};

export type LitSurface = MapSurface & {
  strength: number;
  dist: number;
  lampElev: number;
  lampColor: string;
  lampFaceColor: string;
  lampRange: number;
  lampStrength0: number;
  lampStrengthFalloff: number;
  /**
   * tread wash bias: full = whole stair; highSoft = top steps; lowSoft = bottom steps.
   */
  treadMode?: "full" | "highSoft" | "lowSoft";
  /**
   * Face wash elev range [washZ0, washZ1) in story space.
   * From-below lamps wash the full remaining face upward.
   */
  washZ0?: number;
  washZ1?: number;
};

/** Build explicit lit surfaces from map geometry (no light yet). */
export function buildMapSurfaces(
  map: EmberMap,
  tileset: EmberTileset,
): MapSurface[] {
  const out: MapSurface[] = [];

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (isSolidAt(map, tileset, tx, ty)) {
        const wallElev = elevationAt(map, tx, ty);
        const h = Math.max(1, heightAt(map, tx, ty) || 1);
        out.push({
          id: `face:w:${tx},${ty}`,
          kind: "face",
          tx,
          ty,
          z0: wallElev,
          z1: wallElev + h,
          faceOrigin: "wall",
        });
        continue;
      }

      const conn = connectorDirAt(map, tileset, tx, ty);
      const band = connectorElevBand(map, tileset, tx, ty);
      if (conn && band) {
        out.push({
          id: `tread:${tx},${ty}`,
          kind: "tread",
          tx,
          ty,
          z0: band.low,
          z1: band.high,
          dir: conn,
          steps: STAIR_STEPS,
        });
        continue;
      }

      const elev = elevationAt(map, tx, ty);
      out.push({
        id: `floor:${tx},${ty}`,
        kind: "floor",
        tx,
        ty,
        z0: elev,
        z1: elev,
      });

      // Cliff south face: drop from this floor to lower south cell.
      if (elev > 0 && ty + 1 < map.height) {
        if (!isSolidAt(map, tileset, tx, ty + 1)) {
          if (!connectorDirAt(map, tileset, tx, ty + 1)) {
            const lowE = elevationAt(map, tx, ty + 1);
            if (lowE < elev) {
              out.push({
                id: `face:c:${tx},${ty}`,
                kind: "face",
                tx,
                ty,
                z0: lowE,
                z1: elev,
                faceOrigin: "cliff",
              });
            }
          }
        }
      }
    }
  }

  return out;
}

function lampCanHitWalkSurface(
  surf: MapSurface,
  lampElev: number,
): { ok: boolean; treadMode?: LitSurface["treadMode"] } {
  switch (surf.kind) {
    case "floor":
      return { ok: surf.z0 === lampElev };
    case "tread": {
      if (lampElev === surf.z0) return { ok: true, treadMode: "full" };
      if (lampElev === surf.z1) return { ok: true, treadMode: "highSoft" };
      if (lampElev === surf.z0 - 1) return { ok: true, treadMode: "lowSoft" };
      return { ok: false };
    }
    case "face":
      // Faces are lit in a second pass from the south floor — never by XY alone.
      return { ok: false };
    default: {
      const _n: never = surf.kind;
      void _n;
      return { ok: false };
    }
  }
}

/**
 * LOS occluders: solids, raised earth above the lamp, and optionally stairs.
 * Lower floors stay transparent so same-elev light can cross air gaps.
 * The target cell itself is never tested — only intermediates.
 *
 * `occludeStairs`: true when lighting floors (flights block pierce-through);
 * false when lighting treads so soft spill can reach the next flight.
 */
export function blocksLampLos(
  map: EmberMap,
  tileset: EmberTileset,
  tx: number,
  ty: number,
  lampElev: number,
  occludeStairs = true,
): boolean {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true;
  if (isSolidAt(map, tileset, tx, ty)) return true;
  if (occludeStairs && connectorDirAt(map, tileset, tx, ty)) return true;
  return elevationAt(map, tx, ty) > lampElev;
}

/**
 * Bresenham LOS. Target may be a floor, stair, or face cell; intermediates
 * use {@link blocksLampLos}.
 */
export function hasLampLos(
  map: EmberMap,
  tileset: EmberTileset,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  lampElev: number,
  occludeStairs = true,
): boolean {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (x !== x1 || y !== y1) {
    const e2 = 2 * err;
    let steppedX = false;
    let steppedY = false;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
      steppedX = true;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
      steppedY = true;
    }
    if (steppedX && steppedY) {
      if (
        blocksLampLos(map, tileset, x - sx, y, lampElev, occludeStairs) ||
        blocksLampLos(map, tileset, x, y - sy, lampElev, occludeStairs)
      ) {
        return false;
      }
    }
    if (x === x1 && y === y1) break;
    if (blocksLampLos(map, tileset, x, y, lampElev, occludeStairs)) {
      return false;
    }
  }
  return true;
}

function litWalkAt(
  lit: Map<string, LitSurface>,
  tx: number,
  ty: number,
): LitSurface | undefined {
  return lit.get(`floor:${tx},${ty}`) ?? lit.get(`tread:${tx},${ty}`);
}

function faceWashRange(
  surf: MapSurface,
  lampElev: number,
): { washZ0: number; washZ1: number } {
  if (surf.faceOrigin === "wall") {
    // From at/below the wall base: full face. Mid-story: remaining face upward.
    if (lampElev <= surf.z0) {
      return { washZ0: surf.z0, washZ1: surf.z1 };
    }
    return {
      washZ0: Math.max(surf.z0, lampElev),
      washZ1: surf.z1,
    };
  }
  // Cliff: from the lit story up to the ledge top (never wash downward).
  const litBase = Math.max(surf.z0, Math.min(surf.z1 - 1, lampElev));
  return { washZ0: litBase, washZ1: surf.z1 };
}

/** Walk cell may feed a face when its lamp elev intersects the face stories. */
function walkFeedsFace(
  map: EmberMap,
  tileset: EmberTileset,
  surf: MapSurface,
  walk: LitSurface,
  nx: number,
  ny: number,
  fromSouth: boolean,
): boolean {
  if (surf.faceOrigin === "wall") {
    const wallElev = surf.z0;
    const height = surf.z1 - surf.z0;
    // From-below only from the true south courtyard.
    if (walk.lampElev < wallElev) {
      return fromSouth;
    }
    if (walk.lampElev >= wallElev + height) return false;
    const nE = elevationAt(map, nx, ny);
    const nBand = connectorElevBand(map, tileset, nx, ny);
    return (
      nE === wallElev ||
      nE === walk.lampElev ||
      (nBand != null &&
        (nBand.low === wallElev ||
          nBand.high === wallElev ||
          nBand.low === walk.lampElev ||
          nBand.high === walk.lampElev))
    );
  }
  // Cliff: any lit story along the drop; never from the high top itself.
  const lowE = surf.z0;
  const elev = surf.z1;
  if (walk.lampElev < lowE || walk.lampElev >= elev) return false;
  if (connectorDirAt(map, tileset, nx, ny)) return false;
  return true;
}

/**
 * South-facing wall/cliff washes from lit ortho walk cells.
 * South = primary (courtyard / from-below). East/west = lamp beside the wall.
 * Never from the north (behind the face).
 * From-below / mid lamps wash the remaining face upward.
 */
function lightFacesFromAdjacentWalks(
  map: EmberMap,
  tileset: EmberTileset,
  surfaces: MapSurface[],
  lit: Map<string, LitSurface>,
): void {
  const feeders: Array<[number, number, boolean]> = [
    [0, 1, true], // south
    [1, 0, false], // east
    [-1, 0, false], // west
  ];

  for (const surf of surfaces) {
    if (surf.kind !== "face") continue;

    for (const [dx, dy, fromSouth] of feeders) {
      const nx = surf.tx + dx;
      const ny = surf.ty + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      if (isSolidAt(map, tileset, nx, ny)) continue;

      const walk = litWalkAt(lit, nx, ny);
      if (!walk || walk.strength <= 0) continue;
      if (!walkFeedsFace(map, tileset, surf, walk, nx, ny, fromSouth)) {
        continue;
      }

      const wash = faceWashRange(surf, walk.lampElev);
      if (wash.washZ1 <= wash.washZ0) continue;

      const prev = lit.get(surf.id);
      if (prev && prev.strength >= walk.strength) continue;

      lit.set(surf.id, {
        ...surf,
        strength: walk.strength,
        dist: walk.dist,
        lampElev: walk.lampElev,
        lampColor: walk.lampColor,
        lampFaceColor: walk.lampFaceColor,
        lampRange: walk.lampRange,
        lampStrength0: walk.lampStrength0,
        lampStrengthFalloff: walk.lampStrengthFalloff,
        washZ0: wash.washZ0,
        washZ1: wash.washZ1,
      });
    }
  }
}

function upsertWalkLit(
  lit: Map<string, LitSurface>,
  surf: MapSurface,
  dist: number,
  lampElev: number,
  lamp: LanternSource,
  treadMode?: LitSurface["treadMode"],
): void {
  const strength = lampStrengthAtDist(dist, lamp.params);
  if (strength <= 0) return;
  const prev = lit.get(surf.id);
  if (prev && prev.strength >= strength) return;
  lit.set(surf.id, {
    ...surf,
    strength,
    dist,
    lampElev,
    lampColor: lamp.params.lampColor,
    lampFaceColor: lamp.params.lampFaceColor,
    lampRange: lamp.params.lampRange,
    lampStrength0: lamp.params.lampStrength0,
    lampStrengthFalloff: lamp.params.lampStrengthFalloff,
    treadMode,
  });
}

/**
 * Light all surfaces from lantern sources. Pure data — safe to rerun when
 * lamps move without rebuilding unlit geometry.
 *
 * Pass 1: ortho flood over floors/treads (same-elev crawl + stair bands).
 * Pass 2: faces from lit S/E/W walk cells; wash climbs the remaining face upward.
 */
export function lightSurfaces(
  map: EmberMap,
  tileset: EmberTileset,
  surfaces: MapSurface[],
  lamps: LanternSource[],
): Map<string, LitSurface> {
  const lit = new Map<string, LitSurface>();
  const walkByCell = new Map<string, MapSurface>();
  for (const s of surfaces) {
    if (s.kind === "floor" || s.kind === "tread") {
      walkByCell.set(`${s.tx},${s.ty}`, s);
    }
  }

  const inBounds = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < map.width && y < map.height;

  for (const lamp of lamps) {
    const lampElev = elevationAt(map, lamp.x, lamp.y);
    const maxRange = lamp.params.lampRange;

    const floodFrom = (sx: number, sy: number, startDist: number) => {
      const q: Array<{ x: number; y: number; dist: number }> = [
        { x: sx, y: sy, dist: startDist },
      ];
      const seen = new Set<string>([`${sx},${sy}`]);
      while (q.length) {
        const cur = q.shift()!;
        if (cur.dist > maxRange) continue;
        if (!inBounds(cur.x, cur.y)) continue;
        if (isSolidAt(map, tileset, cur.x, cur.y)) continue;

        const surf = walkByCell.get(`${cur.x},${cur.y}`);
        if (!surf) continue;
        const hit = lampCanHitWalkSurface(surf, lampElev);
        if (!hit.ok) continue;

        // Elev-aware LOS: raised earth / tall blocks occlude even when the
        // ortho crawl went around them. Stairs occlude floors behind them,
        // but not other treads (soft spill along a flight).
        const isOrigin = cur.x === sx && cur.y === sy;
        const occludeStairs = surf.kind !== "tread";
        if (
          !isOrigin &&
          !hasLampLos(
            map,
            tileset,
            sx,
            sy,
            cur.x,
            cur.y,
            lampElev,
            occludeStairs,
          )
        ) {
          continue;
        }

        upsertWalkLit(lit, surf, cur.dist, lampElev, lamp, hit.treadMode);

        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cur.x + dx;
          const ny = cur.y + dy;
          const nk = `${nx},${ny}`;
          if (seen.has(nk)) continue;
          if (cur.dist + 1 > maxRange) continue;
          if (!inBounds(nx, ny)) continue;
          if (isSolidAt(map, tileset, nx, ny)) continue;
          const nSurf = walkByCell.get(nk);
          if (!nSurf) continue;
          if (!lampCanHitWalkSurface(nSurf, lampElev).ok) continue;
          seen.add(nk);
          q.push({ x: nx, y: ny, dist: cur.dist + 1 });
        }
      }
    };

    if (!inBounds(lamp.x, lamp.y) || isSolidAt(map, tileset, lamp.x, lamp.y)) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = lamp.x + dx;
        const ny = lamp.y + dy;
        if (!inBounds(nx, ny)) continue;
        if (isSolidAt(map, tileset, nx, ny)) continue;
        const nSurf = walkByCell.get(`${nx},${ny}`);
        if (!nSurf || !lampCanHitWalkSurface(nSurf, lampElev).ok) continue;
        floodFrom(nx, ny, 1);
      }
    } else {
      floodFrom(lamp.x, lamp.y, 0);
    }

    // Same-elev floors/treads across air gaps (z3 pillar → z3 plateau over z0).
    // Flood only crawls walkable same-elev cells; this stamp uses LOS where
    // pits/lower floors are transparent but solids + raised earth occlude.
    for (
      let ty = Math.max(0, lamp.y - maxRange);
      ty <= Math.min(map.height - 1, lamp.y + maxRange);
      ty++
    ) {
      for (
        let tx = Math.max(0, lamp.x - maxRange);
        tx <= Math.min(map.width - 1, lamp.x + maxRange);
        tx++
      ) {
        const dist = Math.abs(tx - lamp.x) + Math.abs(ty - lamp.y);
        if (dist < 1 || dist > maxRange) continue;
        const surf = walkByCell.get(`${tx},${ty}`);
        if (!surf) continue;
        const hit = lampCanHitWalkSurface(surf, lampElev);
        if (!hit.ok) continue;
        const occludeStairs = surf.kind !== "tread";
        if (
          !hasLampLos(
            map,
            tileset,
            lamp.x,
            lamp.y,
            tx,
            ty,
            lampElev,
            occludeStairs,
          )
        ) {
          continue;
        }
        upsertWalkLit(lit, surf, dist, lampElev, lamp, hit.treadMode);
      }
    }
  }

  lightFacesFromAdjacentWalks(map, tileset, surfaces, lit);
  return lit;
}

/** Compute lit surfaces for a map (convenience). */
export function computeLitSurfaces(
  map: EmberMap,
  tileset: EmberTileset,
  sprites?: EmberSpriteLib,
): { surfaces: MapSurface[]; lit: Map<string, LitSurface> } {
  const surfaces = buildMapSurfaces(map, tileset);
  const lamps = listLanternSources(map, tileset, sprites);
  return { surfaces, lit: lightSurfaces(map, tileset, surfaces, lamps) };
}

/**
 * Compatibility: floor/tread cells as LampGlowCell grid for bloom / sprites.
 * Faces are excluded (sprites sample floors/treads only).
 */
export function litSurfacesToFloorGlow(
  lit: Map<string, LitSurface>,
): Map<string, LampGlowCell> {
  const glow = new Map<string, LampGlowCell>();
  for (const s of lit.values()) {
    if (s.kind === "face") continue;
    const key = `${s.tx},${s.ty}`;
    const prev = glow.get(key);
    if (prev && prev.strength >= s.strength) continue;
    glow.set(key, {
      strength: s.strength,
      dist: s.dist,
      lampElev: s.lampElev,
      lampColor: s.lampColor,
      lampFaceColor: s.lampFaceColor,
      lampRange: s.lampRange,
      lampStrength0: s.lampStrength0,
      lampStrengthFalloff: s.lampStrengthFalloff,
    });
  }
  return glow;
}

function washFillFloor(
  map: EmberMap,
  cell: LitSurface,
): string {
  const light = resolveMapLight(map);
  const a = lanternFloorWashAlpha(light, cell.strength);
  const rgb = parseHexRgb(cell.lampColor) ?? { r: 255, g: 170, b: 70 };
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

/**
 * Paint dynamic light overlay onto an already-drawn (ambient-darkened) map.
 */
export function paintSurfaceLightOverlay(
  ctx: CanvasRenderingContext2D,
  map: EmberMap,
  tileset: EmberTileset,
  lit: Map<string, LitSurface>,
  scale = 1,
  originY = 0,
  wallH = 0,
  ambientCss?: string,
): void {
  const ts = map.tileSize * scale;
  const wH = wallH || WALL_HEIGHT * scale;
  const tsR = Math.round(ts);
  const light = resolveMapLight(map);
  const ambient =
    ambientCss ??
    rgbaFromHex(light.ambientColor, light.ambientAlpha, {
      r: 8,
      g: 6,
      b: 20,
    });

  // Floors first — never cross-elev (z0 lamp must not tint a z3 top).
  for (const s of lit.values()) {
    if (s.kind !== "floor") continue;
    if (s.z0 !== s.lampElev) continue;
    const a = lanternFloorWashAlpha(light, s.strength);
    if (a < 0.005) continue;
    const elevOff = elevVisualOffset(s.z0) * scale;
    const px = Math.round(s.tx * ts);
    const py = Math.round(s.ty * ts + originY - elevOff);
    let h = tsR;
    // Only z0 floors share screen space with a southern wall extrusion.
    // Elevated tops are shifted up — never zero them out next to tall walls
    // (that was wiping same-level z3 wash when a solid sat at ty+1).
    if (
      s.z0 === 0 &&
      s.ty + 1 < map.height &&
      isSolidAt(map, tileset, s.tx, s.ty + 1)
    ) {
      const levels = Math.max(1, heightAt(map, s.tx, s.ty + 1) || 1);
      h = Math.max(0, tsR - Math.round(wH * levels));
    }
    if (h <= 0) continue;
    const rgb = parseHexRgb(s.lampColor) ?? { r: 255, g: 170, b: 70 };
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
    ctx.fillRect(px, py, tsR, h);
  }

  // Faces (walls + cliffs) — from-below wash climbs the face, never the top cap.
  for (const s of lit.values()) {
    if (s.kind !== "face") continue;
    const faceA = lanternFaceWashAlpha(light, s.strength);
    if (faceA < 0.005) continue;
    const rgb =
      parseHexRgb(s.lampFaceColor) ?? { r: 255, g: 150, b: 60 };
    const px = Math.round(s.tx * ts);
    const washZ0 = s.washZ0 ?? s.lampElev;
    const washZ1 = s.washZ1 ?? Math.min(s.z1, washZ0 + 1);
    const bandH = Math.max(1, washZ1 - washZ0);
    let faceTop: number;
    if (s.faceOrigin === "wall") {
      const elevOff = elevVisualOffset(s.z0) * scale;
      const fullH = (s.z1 - s.z0) * wH;
      // Top of wall south face, then offset down to the top of the wash.
      faceTop =
        s.ty * ts +
        originY -
        elevOff -
        fullH +
        tsR +
        (s.z1 - washZ1) * wH;
    } else {
      const elevOff = elevVisualOffset(s.z1) * scale;
      const floorTop = s.ty * ts + originY - elevOff;
      const topCapBottom = floorTop + tsR;
      faceTop =
        floorTop +
        tsR +
        (s.z1 - washZ1) * wH;
      // Never paint into the elevated floor top cap.
      faceTop = Math.max(faceTop, topCapBottom);
    }
    const faceBottom = faceTop + bandH * wH;
    const h = faceBottom - faceTop;
    if (h <= 0) continue;
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${faceA})`;
    ctx.fillRect(px, Math.round(faceTop), tsR, Math.round(h));
  }

  // Stairs: redraw extrusion + ambient + tread wash (occludes face shine-through)
  for (const s of lit.values()) {
    if (s.kind !== "tread" || !s.dir) continue;
    const tile = groundTileAt(map, tileset, s.tx, s.ty);
    if (!tile) continue;
    const story = Math.max(1, s.z1 - s.z0);
    const storyH = Math.round(story * wH);
    if (storyH <= 0) continue;
    const px = Math.round(s.tx * ts);
    const pyLow = Math.round(s.ty * ts + originY - s.z0 * wH);
    const sh = Math.max(1, storyH);
    const tmp = document.createElement("canvas");
    tmp.width = tsR;
    tmp.height = sh + tsR;
    const tctx = tmp.getContext("2d");
    if (!tctx) continue;
    tctx.imageSmoothingEnabled = false;
    const color =
      tile.color && tile.color !== "#00000000" ? tile.color : "#7a6a50";
    paintStairExtrusion(tctx, 0, sh, tsR, sh, s.dir, color);
    tctx.globalCompositeOperation = "source-atop";
    tctx.fillStyle = ambient;
    tctx.fillRect(0, 0, tmp.width, tmp.height);

    const mode = s.treadMode ?? "full";
    const fill = washFillFloor(map, s);
    let lowFill = "rgba(0,0,0,0)";
    let highFill = "rgba(0,0,0,0)";
    let lowSpill = false;
    if (mode === "full") {
      lowFill = fill;
      highFill = fill;
    } else if (mode === "highSoft") {
      highFill = fill;
    } else {
      lowFill = fill;
      lowSpill = true;
    }
    tctx.globalCompositeOperation = "source-atop";
    paintStairLanternWashClipped(
      tctx,
      0,
      sh,
      tsR,
      sh,
      s.dir,
      lowFill,
      highFill,
      { lowSpill },
    );
    tctx.globalCompositeOperation = "source-over";
    ctx.drawImage(tmp, px, pyLow - sh);
  }

  // Unlit stairs still need ambient occlusion redraw so lower elev wash
  // cannot shine through (same as previous paintLanternStairGlow).
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (isSolidAt(map, tileset, tx, ty)) continue;
      const conn = connectorDirAt(map, tileset, tx, ty);
      const band = connectorElevBand(map, tileset, tx, ty);
      if (!conn || !band) continue;
      if (lit.has(`tread:${tx},${ty}`)) continue;
      const tile = groundTileAt(map, tileset, tx, ty);
      if (!tile) continue;
      const story = Math.max(1, band.high - band.low);
      const storyH = Math.round(story * wH);
      if (storyH <= 0) continue;
      const px = Math.round(tx * ts);
      const pyLow = Math.round(ty * ts + originY - band.low * wH);
      const sh = Math.max(1, storyH);
      const tmp = document.createElement("canvas");
      tmp.width = tsR;
      tmp.height = sh + tsR;
      const tctx = tmp.getContext("2d");
      if (!tctx) continue;
      const color =
        tile.color && tile.color !== "#00000000" ? tile.color : "#7a6a50";
      paintStairExtrusion(tctx, 0, sh, tsR, sh, conn, color);
      tctx.globalCompositeOperation = "source-atop";
      tctx.fillStyle = ambient;
      tctx.fillRect(0, 0, tmp.width, tmp.height);
      tctx.globalCompositeOperation = "source-over";
      ctx.drawImage(tmp, px, pyLow - sh);
    }
  }
}
