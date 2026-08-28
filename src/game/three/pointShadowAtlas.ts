/**
 * Point-shadow atlas layout and sticky slot assignment.
 *
 * Three.js packs one point cube into a 2D map as 4×2 faces (`cubeToUV`).
 * Ember will sample a grid of those tiles from one texture so
 * `NUM_POINT_LIGHT_SHADOWS` can stay 0. GPU cache/blit: `pointShadowAtlasGpu.ts`.
 * Wave D samples the atlas from voxelLightSnap so point cubes stay off.
 * Sticky slot hysteresis lives in assignPointShadowAtlasSlots.
 *
 * See docs/EMBER_AI_HANDOFF.md §9.1.
 */

/** Faces per cube in Three's 2D point-shadow packing. */
export const POINT_SHADOW_CUBE_FACES_X = 4;
export const POINT_SHADOW_CUBE_FACES_Y = 2;

/**
 * Viewport origin+size in face units, same order as Three `PointLightShadow`:
 * +X, −X, +Z, −Z, +Y, −Y. Layout:
 * `xzXZ` / ` y Y`
 */
export const POINT_SHADOW_CUBE_FACE_VIEWPORTS = [
  { x: 2, y: 1, w: 1, h: 1 },
  { x: 0, y: 1, w: 1, h: 1 },
  { x: 3, y: 1, w: 1, h: 1 },
  { x: 1, y: 1, w: 1, h: 1 },
  { x: 3, y: 0, w: 1, h: 1 },
  { x: 1, y: 0, w: 1, h: 1 },
] as const;

/** Compile-time shader loop. Never change at runtime (relink). */
export const POINT_SHADOW_SHADER_SLOTS = 8;

/** Default face resolution; one tile is face×4 by face×2. */
export const POINT_SHADOW_FACE_SIZE = 256;

/** Challenger must be this fraction of the occupant's score to steal a slot. */
export const POINT_SHADOW_SLOT_ENTER_SCALE = 0.8;

export type PointShadowAtlasLayout = {
  faceSize: number;
  slotCount: number;
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  width: number;
  height: number;
};

export type PointShadowSlotRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PointShadowSlotUv = {
  /** Multiply cubeToUV by this to land in the slot tile. */
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
};

export type PointShadowSlotCandidate = {
  id: string;
  /**
   * Lower is better. Typical: groundDistance / reach.
   * Only finite non-negative scores are eligible.
   */
  score: number;
};

function tileSize(faceSize: number): { tileWidth: number; tileHeight: number } {
  const face = Math.max(1, Math.floor(faceSize));
  return {
    tileWidth: face * POINT_SHADOW_CUBE_FACES_X,
    tileHeight: face * POINT_SHADOW_CUBE_FACES_Y,
  };
}

function pickGrid(
  slotCount: number,
  tileWidth: number,
  tileHeight: number,
  maxTextureSize: number,
): { columns: number; rows: number; width: number; height: number } | null {
  const n = Math.max(0, Math.floor(slotCount));
  if (n <= 0) {
    return { columns: 1, rows: 1, width: tileWidth, height: tileHeight };
  }
  if (tileWidth > maxTextureSize || tileHeight > maxTextureSize) return null;

  let best: {
    columns: number;
    rows: number;
    width: number;
    height: number;
    area: number;
    aspect: number;
  } | null = null;

  for (let columns = 1; columns <= n; columns += 1) {
    const rows = Math.ceil(n / columns);
    const width = columns * tileWidth;
    const height = rows * tileHeight;
    if (width > maxTextureSize || height > maxTextureSize) continue;
    const area = width * height;
    const aspect = Math.max(width, height) / Math.max(1, Math.min(width, height));
    if (
      !best ||
      area < best.area ||
      (area === best.area && aspect < best.aspect)
    ) {
      best = { columns, rows, width, height, area, aspect };
    }
  }
  return best
    ? {
        columns: best.columns,
        rows: best.rows,
        width: best.width,
        height: best.height,
      }
    : null;
}

/**
 * Pack `slotCount` Three-style 4×2 tiles into one 2D atlas that fits
 * `maxTextureSize`. Drops face size (halving) then slots if needed.
 */
export function layoutPointShadowAtlas(
  slotCount = POINT_SHADOW_SHADER_SLOTS,
  faceSize = POINT_SHADOW_FACE_SIZE,
  maxTextureSize = 4096,
): PointShadowAtlasLayout {
  const wantedSlots = Math.max(0, Math.floor(slotCount));
  const maxTex = Math.max(64, Math.floor(maxTextureSize));
  const faces: number[] = [];
  for (
    let face = Math.max(16, Math.floor(faceSize));
    face >= 16;
    face = Math.floor(face / 2)
  ) {
    faces.push(face);
  }

  const tryLayout = (
    slots: number,
    face: number,
  ): PointShadowAtlasLayout | null => {
    const { tileWidth, tileHeight } = tileSize(face);
    const grid = pickGrid(slots, tileWidth, tileHeight, maxTex);
    if (!grid) return null;
    return {
      faceSize: face,
      slotCount: slots,
      columns: grid.columns,
      rows: grid.rows,
      tileWidth,
      tileHeight,
      width: grid.width,
      height: grid.height,
    };
  };

  for (const face of faces) {
    const fitted = tryLayout(wantedSlots, face);
    if (fitted) return fitted;
  }
  for (let slots = wantedSlots - 1; slots >= 0; slots -= 1) {
    for (const face of faces) {
      const fitted = tryLayout(slots, face);
      if (fitted) return fitted;
    }
  }

  const { tileWidth, tileHeight } = tileSize(16);
  return {
    faceSize: 16,
    slotCount: 0,
    columns: 1,
    rows: 1,
    tileWidth,
    tileHeight,
    width: tileWidth,
    height: tileHeight,
  };
}

export function pointShadowSlotPixelRect(
  layout: PointShadowAtlasLayout,
  slot: number,
): PointShadowSlotRect {
  const index = Math.max(0, Math.floor(slot));
  const col = index % layout.columns;
  const row = Math.floor(index / layout.columns);
  return {
    x: col * layout.tileWidth,
    y: row * layout.tileHeight,
    width: layout.tileWidth,
    height: layout.tileHeight,
  };
}

/** UV scale/offset so cubeToUV in 0..1 maps into this slot's 4×2 tile. */
export function pointShadowSlotUv(
  layout: PointShadowAtlasLayout,
  slot: number,
): PointShadowSlotUv {
  const rect = pointShadowSlotPixelRect(layout, slot);
  return {
    scaleX: rect.width / layout.width,
    scaleY: rect.height / layout.height,
    offsetX: rect.x / layout.width,
    offsetY: rect.y / layout.height,
  };
}

export function pointShadowInfluenceScore(
  groundDistance: number,
  reach: number,
): number {
  const dist = Number.isFinite(groundDistance)
    ? Math.max(0, groundDistance)
    : Number.POSITIVE_INFINITY;
  const rad = Number.isFinite(reach) && reach > 0 ? reach : 1;
  return dist / rad;
}

/** Influence from a lamp's map tile to a world-space ground focus. */
export function pointShadowTileInfluenceScore(
  lampTx: number,
  lampTy: number,
  focusX: number,
  focusZ: number,
  tileSize: number,
  reach: number,
): number {
  const ts = Math.max(1, tileSize);
  const dx = (lampTx + 0.5) * ts - focusX;
  const dz = (lampTy + 0.5) * ts - focusZ;
  return pointShadowInfluenceScore(Math.hypot(dx, dz), reach);
}

function eligibleCandidates(
  candidates: readonly PointShadowSlotCandidate[],
): PointShadowSlotCandidate[] {
  const seen = new Set<string>();
  const out: PointShadowSlotCandidate[] = [];
  for (const candidate of candidates) {
    if (!candidate.id || seen.has(candidate.id)) continue;
    if (!Number.isFinite(candidate.score) || candidate.score < 0) continue;
    seen.add(candidate.id);
    out.push(candidate);
  }
  return out;
}

/**
 * Keep previous slot indices when the same lights are still competitive.
 * Empty slots stay holes (no compact) so a later blit can reuse the tile.
 */
export function assignPointShadowAtlasSlots(
  previous: readonly (string | null)[],
  candidates: readonly PointShadowSlotCandidate[],
  slotCount = POINT_SHADOW_SHADER_SLOTS,
  enterScale = POINT_SHADOW_SLOT_ENTER_SCALE,
): (string | null)[] {
  const limit = Math.max(0, Math.floor(slotCount));
  const next: (string | null)[] = Array.from({ length: limit }, () => null);
  if (limit === 0) return next;

  const pool = eligibleCandidates(candidates);
  const byId = new Map(pool.map((entry) => [entry.id, entry]));
  const used = new Set<string>();
  const stealScale = Math.max(0.05, Math.min(1, enterScale));

  const prev = previous.length >= limit ? previous : [...previous];
  for (let i = 0; i < limit; i += 1) {
    const id = prev[i];
    if (typeof id !== "string" || !byId.has(id) || used.has(id)) continue;
    next[i] = id;
    used.add(id);
  }

  const unused = pool
    .filter((entry) => !used.has(entry.id))
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));

  for (let i = 0; i < limit && unused.length > 0; i += 1) {
    if (next[i] != null) continue;
    const take = unused.shift();
    if (!take) break;
    next[i] = take.id;
    used.add(take.id);
  }

  while (unused.length > 0) {
    const challenger = unused[0]!;
    let worstIndex = -1;
    let worstScore = -1;
    for (let i = 0; i < limit; i += 1) {
      const id = next[i];
      if (id == null) continue;
      const occupant = byId.get(id);
      const score = occupant?.score ?? Number.POSITIVE_INFINITY;
      if (score > worstScore) {
        worstScore = score;
        worstIndex = i;
      }
    }
    if (worstIndex < 0) break;
    if (challenger.score > worstScore * stealScale) break;
    unused.shift();
    next[worstIndex] = challenger.id;
  }

  return next;
}

export type PointShadowAtlasBlitJob = {
  cacheId: string;
  slot: number;
  dest: PointShadowSlotRect;
};

/** Copy jobs from cache tiles into atlas slots. Holes are skipped. */
export function planPointShadowAtlasBlits(
  layout: PointShadowAtlasLayout,
  slotIds: readonly (string | null)[],
): PointShadowAtlasBlitJob[] {
  const jobs: PointShadowAtlasBlitJob[] = [];
  const limit = Math.min(layout.slotCount, slotIds.length);
  for (let slot = 0; slot < limit; slot += 1) {
    const cacheId = slotIds[slot];
    if (typeof cacheId !== "string" || cacheId.length === 0) continue;
    jobs.push({
      cacheId,
      slot,
      dest: pointShadowSlotPixelRect(layout, slot),
    });
  }
  return jobs;
}

export function pointShadowCubeFacePixelRect(
  faceSize: number,
  faceIndex: number,
): PointShadowSlotRect {
  const face = Math.max(1, Math.floor(faceSize));
  const index = Math.max(
    0,
    Math.min(POINT_SHADOW_CUBE_FACE_VIEWPORTS.length - 1, Math.floor(faceIndex)),
  );
  const vp = POINT_SHADOW_CUBE_FACE_VIEWPORTS[index]!;
  return {
    x: vp.x * face,
    y: vp.y * face,
    width: vp.w * face,
    height: vp.h * face,
  };
}
