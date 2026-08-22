import { normalizeEmberLibraryTags } from "../content/libraryTags";
import type { EmberMaterialKind, EmberVoxelModel } from "../content/types";
import {
  resolveEmissiveLightRange,
  resolveEmissiveStrength,
} from "../tile/emissivePaint";
import { DEFAULT_VOXEL_PALETTE, VOXELS_PER_BLOCK } from "./constants";

const MATERIAL_KINDS: readonly EmberMaterialKind[] = [
  "stone",
  "wood",
  "path",
  "grass",
  "metal",
  "cloth",
];

function normalizeModelMaterial(raw: unknown): EmberMaterialKind | undefined {
  if (typeof raw !== "string") return undefined;
  return (MATERIAL_KINDS as readonly string[]).includes(raw)
    ? (raw as EmberMaterialKind)
    : undefined;
}

function normalizeLightOffset(
  raw: { x?: number; y?: number; z?: number } | undefined | null,
): { x: number; y: number; z: number } | undefined {
  if (!raw) return undefined;
  const clamp = (n: unknown) => {
    if (!Number.isFinite(n as number)) return 0;
    return Math.max(-32, Math.min(32, Math.round(Number(n) * 100) / 100));
  };
  const x = clamp(raw.x);
  const y = clamp(raw.y);
  const z = clamp(raw.z);
  if (x === 0 && y === 0 && z === 0) return undefined;
  return { x, y, z };
}

export function voxelGridSize(
  model: Pick<EmberVoxelModel, "sizeBlocks" | "heightVoxels">,
): {
  sx: number;
  sy: number;
  sz: number;
} {
  const sx = Math.max(1, model.sizeBlocks.x) * VOXELS_PER_BLOCK;
  const sz = Math.max(1, model.sizeBlocks.z) * VOXELS_PER_BLOCK;
  const fromBlocks = Math.max(1, model.sizeBlocks.y) * VOXELS_PER_BLOCK;
  const sy = Number.isFinite(model.heightVoxels)
    ? Math.max(1, Math.min(8 * VOXELS_PER_BLOCK, Math.round(model.heightVoxels!)))
    : fromBlocks;
  return { sx, sy, sz };
}

export function voxelIndex(
  model: Pick<EmberVoxelModel, "sizeBlocks" | "heightVoxels">,
  x: number,
  y: number,
  z: number,
): number {
  const { sx, sy, sz } = voxelGridSize(model);
  if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return -1;
  return x + z * sx + y * sx * sz;
}

export function getVoxel(
  model: EmberVoxelModel,
  x: number,
  y: number,
  z: number,
): number {
  const i = voxelIndex(model, x, y, z);
  if (i < 0) return 0;
  return model.voxels[i] ?? 0;
}

export function getVoxelEmissive(
  model: EmberVoxelModel,
  x: number,
  y: number,
  z: number,
): number {
  const i = voxelIndex(model, x, y, z);
  if (i < 0) return 0;
  return model.emissive?.[i] ?? 0;
}

export function getVoxelShine(
  model: EmberVoxelModel,
  x: number,
  y: number,
  z: number,
): number {
  const i = voxelIndex(model, x, y, z);
  if (i < 0) return 0;
  return model.shine?.[i] ?? 0;
}

export function getVoxelTransparency(
  model: EmberVoxelModel,
  x: number,
  y: number,
  z: number,
): number {
  const i = voxelIndex(model, x, y, z);
  if (i < 0) return 0;
  return model.transparency?.[i] ?? 0;
}

export type VoxelPaintChannel = "emissive" | "shine" | "transparency";

function ensureChannelArray(
  model: EmberVoxelModel,
  key: VoxelPaintChannel,
): number[] {
  const n = model.voxels.length;
  const src = model[key];
  if (Array.isArray(src) && src.length === n) {
    return [...src];
  }
  const out = new Array(n).fill(0);
  if (Array.isArray(src)) {
    for (let i = 0; i < Math.min(n, src.length); i++) {
      out[i] = Math.max(0, Math.min(255, (src[i] as number) | 0));
    }
  }
  return out;
}

function ensureEmissiveArray(model: EmberVoxelModel): number[] {
  return ensureChannelArray(model, "emissive");
}

function ensureShineArray(model: EmberVoxelModel): number[] {
  return ensureChannelArray(model, "shine");
}

function ensureTransparencyArray(model: EmberVoxelModel): number[] {
  return ensureChannelArray(model, "transparency");
}

/** Default true: omitted / undefined means the model collides. */
export function isVoxelModelPhysical(model: EmberVoxelModel): boolean {
  return model.physical !== false;
}

export function createEmptyVoxelModel(
  id: string,
  sizeBlocks: { x: number; y: number; z: number },
  nameRu?: string,
  heightVoxels?: number,
): EmberVoxelModel {
  const size = {
    x: Math.max(1, Math.min(8, Math.round(sizeBlocks.x))),
    y: Math.max(1, Math.min(8, Math.round(sizeBlocks.y))),
    z: Math.max(1, Math.min(8, Math.round(sizeBlocks.z))),
  };
  const hv = Number.isFinite(heightVoxels)
    ? Math.max(1, Math.min(8 * VOXELS_PER_BLOCK, Math.round(heightVoxels!)))
    : size.y * VOXELS_PER_BLOCK;
  const { sx, sy, sz } = voxelGridSize({
    sizeBlocks: size,
    heightVoxels: hv,
  });
  const n = sx * sy * sz;
  return {
    id,
    nameRu: nameRu ?? id,
    sizeBlocks: size,
    heightVoxels: hv,
    palette: [...DEFAULT_VOXEL_PALETTE],
    voxels: new Array(n).fill(0),
    emissive: new Array(n).fill(0),
    shine: new Array(n).fill(0),
    transparency: new Array(n).fill(0),
    // New sculpt models collide unless the author turns physicality off.
    physical: true,
  };
}

/** Deep-ish clone with a new id (and optional display name). */
export function cloneVoxelModel(
  model: EmberVoxelModel,
  newId: string,
  nameRu?: string,
): EmberVoxelModel {
  const prev = normalizeVoxelModel(model);
  return {
    ...prev,
    id: newId,
    nameRu: nameRu ?? prev.nameRu,
    palette: [...prev.palette],
    voxels: [...prev.voxels],
    emissive: [...(prev.emissive ?? [])],
    shine: [...(prev.shine ?? [])],
    transparency: [...(prev.transparency ?? [])],
  };
}

/** Unique id for a placement-specific library variant. */
export function newVoxelVariantId(): string {
  return `vox_var_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Fill a solid block shell so new models are visible immediately. */
export function stampSolidBlock(
  model: EmberVoxelModel,
  paletteIndex = 1,
): EmberVoxelModel {
  const next = {
    ...model,
    voxels: [...model.voxels],
    palette: [...model.palette],
    emissive: ensureEmissiveArray(model),
    shine: ensureShineArray(model),
    transparency: ensureTransparencyArray(model),
  };
  const { sx, sy, sz } = voxelGridSize(next);
  const pi = Math.max(1, Math.min(next.palette.length - 1, paletteIndex));
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const i = voxelIndex(next, x, y, z);
        if (i >= 0) {
          next.voxels[i] = pi;
          next.emissive[i] = 0;
          next.shine[i] = 0;
          next.transparency[i] = 0;
        }
      }
    }
  }
  return next;
}

export function setVoxel(
  model: EmberVoxelModel,
  x: number,
  y: number,
  z: number,
  paletteIndex: number,
): EmberVoxelModel {
  const i = voxelIndex(model, x, y, z);
  if (i < 0) return model;
  const pi = Math.max(0, Math.min(255, paletteIndex | 0));
  if ((model.voxels[i] ?? 0) === pi) return model;
  const voxels = [...model.voxels];
  voxels[i] = pi;
  const emissive = ensureEmissiveArray(model);
  const shine = ensureShineArray(model);
  const transparency = ensureTransparencyArray(model);
  if (pi === 0) {
    emissive[i] = 0;
    shine[i] = 0;
    transparency[i] = 0;
  }
  return { ...model, voxels, emissive, shine, transparency };
}

export function setVoxelEmissive(
  model: EmberVoxelModel,
  x: number,
  y: number,
  z: number,
  amount: number,
): EmberVoxelModel {
  const i = voxelIndex(model, x, y, z);
  if (i < 0) return model;
  if ((model.voxels[i] ?? 0) <= 0) return model;
  const v = Math.max(0, Math.min(255, Math.round(amount)));
  const emissive = ensureEmissiveArray(model);
  if (emissive[i] === v) return model;
  emissive[i] = v;
  return { ...model, emissive };
}

export function setVoxelShine(
  model: EmberVoxelModel,
  x: number,
  y: number,
  z: number,
  amount: number,
): EmberVoxelModel {
  const i = voxelIndex(model, x, y, z);
  if (i < 0) return model;
  if ((model.voxels[i] ?? 0) <= 0) return model;
  const v = Math.max(0, Math.min(255, Math.round(amount)));
  const shine = ensureShineArray(model);
  if (shine[i] === v) return model;
  shine[i] = v;
  return { ...model, shine };
}

export function setVoxelTransparency(
  model: EmberVoxelModel,
  x: number,
  y: number,
  z: number,
  amount: number,
): EmberVoxelModel {
  const i = voxelIndex(model, x, y, z);
  if (i < 0) return model;
  if ((model.voxels[i] ?? 0) <= 0) return model;
  const v = Math.max(0, Math.min(255, Math.round(amount)));
  const transparency = ensureTransparencyArray(model);
  if (transparency[i] === v) return model;
  transparency[i] = v;
  return { ...model, transparency };
}

export type VoxelPaletteGroup = {
  index: number;
  color: string;
  count: number;
  emitAvg: number;
  shineAvg: number;
  transparencyAvg: number;
};

/** Solid cells grouped by palette index (skip air). */
export function listPaletteGroups(model: EmberVoxelModel): VoxelPaletteGroup[] {
  const stats = new Map<
    number,
    { count: number; emit: number; shine: number; transparency: number }
  >();
  const n = model.voxels.length;
  for (let i = 0; i < n; i++) {
    const pi = model.voxels[i] ?? 0;
    if (pi <= 0) continue;
    const cur = stats.get(pi) ?? {
      count: 0,
      emit: 0,
      shine: 0,
      transparency: 0,
    };
    cur.count += 1;
    cur.emit += model.emissive?.[i] ?? 0;
    cur.shine += model.shine?.[i] ?? 0;
    cur.transparency += model.transparency?.[i] ?? 0;
    stats.set(pi, cur);
  }
  return [...stats.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, s]) => ({
      index,
      color: model.palette[index] || "#888888",
      count: s.count,
      emitAvg: s.count ? Math.round(s.emit / s.count) : 0,
      shineAvg: s.count ? Math.round(s.shine / s.count) : 0,
      transparencyAvg: s.count ? Math.round(s.transparency / s.count) : 0,
    }));
}

/** Set emissive / shine / transparency on every solid cell of a palette index. */
export function setPaletteGroupChannel(
  model: EmberVoxelModel,
  paletteIndex: number,
  channel: VoxelPaintChannel,
  amount: number,
): EmberVoxelModel {
  const pi = Math.max(1, paletteIndex | 0);
  const v = Math.max(0, Math.min(255, Math.round(amount)));
  const arr =
    channel === "emissive"
      ? ensureEmissiveArray(model)
      : channel === "shine"
        ? ensureShineArray(model)
        : ensureTransparencyArray(model);
  let changed = false;
  for (let i = 0; i < model.voxels.length; i++) {
    if ((model.voxels[i] ?? 0) !== pi) continue;
    if (arr[i] === v) continue;
    arr[i] = v;
    changed = true;
  }
  if (!changed) return model;
  if (channel === "emissive") return { ...model, emissive: arr };
  if (channel === "shine") return { ...model, shine: arr };
  return { ...model, transparency: arr };
}

/** Paint palette index onto an existing solid cell (no grow/shrink). */
export function paintVoxel(
  model: EmberVoxelModel,
  x: number,
  y: number,
  z: number,
  paletteIndex: number,
): EmberVoxelModel {
  const i = voxelIndex(model, x, y, z);
  if (i < 0) return model;
  if ((model.voxels[i] ?? 0) <= 0) return model;
  return setVoxel(model, x, y, z, Math.max(1, paletteIndex));
}

/**
 * Flood-fill connected solid voxels that share the seed palette index.
 * 6-connected. Empty cells are never filled.
 */
export function floodFillPaint(
  model: EmberVoxelModel,
  x: number,
  y: number,
  z: number,
  paletteIndex: number,
): EmberVoxelModel {
  const { sx, sy, sz } = voxelGridSize(model);
  const start = voxelIndex(model, x, y, z);
  if (start < 0) return model;
  const from = model.voxels[start] ?? 0;
  if (from <= 0) return model;
  const to = Math.max(1, Math.min(model.palette.length - 1, paletteIndex | 0));
  if (from === to) return model;

  const voxels = [...model.voxels];
  const emissive = ensureEmissiveArray(model);
  const stack: number[] = [start];
  const seen = new Uint8Array(voxels.length);
  seen[start] = 1;
  const dirs = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ] as const;

  while (stack.length) {
    const i = stack.pop()!;
    voxels[i] = to;
    const cx = i % sx;
    const cy = Math.floor(i / (sx * sz));
    const cz = Math.floor((i % (sx * sz)) / sx);
    for (const [dx, dy, dz] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      const nz = cz + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz) {
        continue;
      }
      const ni = nx + nz * sx + ny * sx * sz;
      if (seen[ni]) continue;
      if ((voxels[ni] ?? 0) !== from) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  return { ...model, voxels, emissive };
}

/** Mirror voxels across an axis through the grid center. */
export function flipVoxelModel(
  model: EmberVoxelModel,
  axis: "x" | "y" | "z",
): EmberVoxelModel {
  const prev = normalizeVoxelModel(model);
  const { sx, sy, sz } = voxelGridSize(prev);
  const voxels = new Array(sx * sy * sz).fill(0);
  const emissive = new Array(sx * sy * sz).fill(0);
  const shine = new Array(sx * sy * sz).fill(0);
  const transparency = new Array(sx * sy * sz).fill(0);
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const i = voxelIndex(prev, x, y, z);
        if (i < 0) continue;
        const tx = axis === "x" ? sx - 1 - x : x;
        const ty = axis === "y" ? sy - 1 - y : y;
        const tz = axis === "z" ? sz - 1 - z : z;
        const j = voxelIndex(prev, tx, ty, tz);
        if (j < 0) continue;
        voxels[j] = prev.voxels[i] ?? 0;
        emissive[j] = prev.emissive?.[i] ?? 0;
        shine[j] = prev.shine?.[i] ?? 0;
        transparency[j] = prev.transparency?.[i] ?? 0;
      }
    }
  }
  return { ...prev, voxels, emissive, shine, transparency };
}

/** Live sculpt symmetry (Blender-style): mirror edits across grid midplanes. */
export type VoxelMirrorAxes = {
  x: boolean;
  y: boolean;
  z: boolean;
};

export const VOXEL_MIRROR_OFF: VoxelMirrorAxes = {
  x: false,
  y: false,
  z: false,
};

export function anyVoxelMirror(m: VoxelMirrorAxes): boolean {
  return m.x || m.y || m.z;
}

/** All unique cells implied by symmetry toggles (includes the seed). */
export function expandCellWithMirror(
  model: Pick<EmberVoxelModel, "sizeBlocks" | "heightVoxels">,
  cell: { x: number; y: number; z: number },
  mirror: VoxelMirrorAxes,
): Array<{ x: number; y: number; z: number }> {
  const { sx, sy, sz } = voxelGridSize(model);
  const xs = mirror.x ? [cell.x, sx - 1 - cell.x] : [cell.x];
  const ys = mirror.y ? [cell.y, sy - 1 - cell.y] : [cell.y];
  const zs = mirror.z ? [cell.z, sz - 1 - cell.z] : [cell.z];
  const out: Array<{ x: number; y: number; z: number }> = [];
  const seen = new Set<string>();
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) continue;
        const k = `${x},${y},${z}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ x, y, z });
      }
    }
  }
  return out;
}

/** Clear every cell (keep size / palette). */
export function clearVoxelModel(model: EmberVoxelModel): EmberVoxelModel {
  const prev = normalizeVoxelModel(model);
  const n = prev.voxels.length;
  return {
    ...prev,
    voxels: new Array(n).fill(0),
    emissive: new Array(n).fill(0),
    shine: new Array(n).fill(0),
    transparency: new Array(n).fill(0),
  };
}

/** Inclusive AABB in voxel indices. */
export type VoxelSelection = {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
};

/** One or more AABB regions (Shift+click / drag multi-select). */
export type VoxelSelectionSet = VoxelSelection[];

export function normalizeVoxelSelection(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): VoxelSelection {
  return {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    z0: Math.min(a.z, b.z),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
    z1: Math.max(a.z, b.z),
  };
}

export function selectionBoxKey(sel: VoxelSelection): string {
  return `${sel.x0},${sel.y0},${sel.z0},${sel.x1},${sel.y1},${sel.z1}`;
}

export function asSelectionSet(
  sel: VoxelSelection | VoxelSelectionSet | null | undefined,
): VoxelSelectionSet {
  if (!sel) return [];
  return Array.isArray(sel) ? sel : [sel];
}

/** Append a box if not already present (by exact AABB). */
export function addSelectionBox(
  current: VoxelSelectionSet | null | undefined,
  box: VoxelSelection | null | undefined,
): VoxelSelectionSet {
  if (!box) return current?.length ? [...current] : [];
  const cur = current?.length ? [...current] : [];
  const key = selectionBoxKey(box);
  if (cur.some((b) => selectionBoxKey(b) === key)) return cur;
  cur.push(box);
  return cur;
}

export function selectionBoxesIntersect(
  a: VoxelSelection,
  b: VoxelSelection,
): boolean {
  return (
    a.x0 <= b.x1 &&
    a.x1 >= b.x0 &&
    a.y0 <= b.y1 &&
    a.y1 >= b.y0 &&
    a.z0 <= b.z1 &&
    a.z1 >= b.z0
  );
}

/**
 * Remove boxes from a set. `exact` = same AABB key; `intersect` = any overlap
 * (used when RMB-dragging a subtract frame in box mode).
 */
export function removeSelectionBoxes(
  current: VoxelSelectionSet | null | undefined,
  piece: VoxelSelection | null | undefined,
  mode: "exact" | "intersect" = "exact",
): VoxelSelectionSet {
  if (!current?.length || !piece) return current?.length ? [...current] : [];
  if (mode === "exact") {
    const key = selectionBoxKey(piece);
    return current.filter((b) => selectionBoxKey(b) !== key);
  }
  return current.filter((b) => !selectionBoxesIntersect(b, piece));
}

/** Mirror an AABB across enabled midplanes (up to 8 boxes). */
export function expandSelectionWithMirror(
  model: Pick<EmberVoxelModel, "sizeBlocks" | "heightVoxels">,
  sel: VoxelSelection | VoxelSelectionSet | null | undefined,
  mirror: VoxelMirrorAxes,
): VoxelSelectionSet {
  const boxes = asSelectionSet(sel);
  if (!boxes.length) return [];
  if (!anyVoxelMirror(mirror)) return boxes.map((b) => ({ ...b }));
  const { sx, sy, sz } = voxelGridSize(model);
  let out: VoxelSelectionSet = [];
  for (const box of boxes) {
    const xPairs = mirror.x
      ? [
          [box.x0, box.x1],
          [sx - 1 - box.x1, sx - 1 - box.x0],
        ]
      : [[box.x0, box.x1]];
    const yPairs = mirror.y
      ? [
          [box.y0, box.y1],
          [sy - 1 - box.y1, sy - 1 - box.y0],
        ]
      : [[box.y0, box.y1]];
    const zPairs = mirror.z
      ? [
          [box.z0, box.z1],
          [sz - 1 - box.z1, sz - 1 - box.z0],
        ]
      : [[box.z0, box.z1]];
    for (const [x0, x1] of xPairs) {
      for (const [y0, y1] of yPairs) {
        for (const [z0, z1] of zPairs) {
          const next = clampVoxelSelection(model, {
            x0: Math.min(x0!, x1!),
            y0: Math.min(y0!, y1!),
            z0: Math.min(z0!, z1!),
            x1: Math.max(x0!, x1!),
            y1: Math.max(y0!, y1!),
            z1: Math.max(z0!, z1!),
          });
          if (next) out = addSelectionBox(out, next);
        }
      }
    }
  }
  return out;
}

export function clampVoxelSelection(
  model: Pick<EmberVoxelModel, "sizeBlocks" | "heightVoxels">,
  sel: VoxelSelection,
): VoxelSelection | null {
  const { sx, sy, sz } = voxelGridSize(model);
  const x0 = Math.max(0, Math.min(sx - 1, sel.x0));
  const y0 = Math.max(0, Math.min(sy - 1, sel.y0));
  const z0 = Math.max(0, Math.min(sz - 1, sel.z0));
  const x1 = Math.max(0, Math.min(sx - 1, sel.x1));
  const y1 = Math.max(0, Math.min(sy - 1, sel.y1));
  const z1 = Math.max(0, Math.min(sz - 1, sel.z1));
  if (x0 > x1 || y0 > y1 || z0 > z1) return null;
  return { x0, y0, z0, x1, y1, z1 };
}

export function countSelectionCells(
  sel: VoxelSelection | VoxelSelectionSet,
): number {
  let n = 0;
  for (const box of asSelectionSet(sel)) {
    n +=
      (box.x1 - box.x0 + 1) *
      (box.y1 - box.y0 + 1) *
      (box.z1 - box.z0 + 1);
  }
  return n;
}

/** Entire height layer (fixed Y). */
export function selectionLayerY(
  model: Pick<EmberVoxelModel, "sizeBlocks" | "heightVoxels">,
  y: number,
): VoxelSelection | null {
  const { sx, sy, sz } = voxelGridSize(model);
  if (y < 0 || y >= sy) return null;
  return { x0: 0, y0: y, z0: 0, x1: sx - 1, y1: y, z1: sz - 1 };
}

/**
 * Row along X at fixed Y,Z.
 * Solid (default): span covering all non-empty cells.
 * Empty: span covering all air cells on that line.
 */
export function selectionRowX(
  model: EmberVoxelModel,
  y: number,
  z: number,
  opts?: { empty?: boolean },
): VoxelSelection | null {
  const { sx, sy, sz } = voxelGridSize(model);
  if (y < 0 || y >= sy || z < 0 || z >= sz) return null;
  const wantEmpty = Boolean(opts?.empty);
  let x0 = -1;
  let x1 = -1;
  for (let x = 0; x < sx; x++) {
    const isSolid = getVoxel(model, x, y, z) > 0;
    if (wantEmpty ? !isSolid : isSolid) {
      if (x0 < 0) x0 = x;
      x1 = x;
    }
  }
  if (x0 < 0) return null;
  return { x0, y0: y, z0: z, x1, y1: y, z1: z };
}

/**
 * Line along Z at fixed X,Y.
 * Solid (default): span of non-empty cells; empty: span of air.
 */
export function selectionColZ(
  model: EmberVoxelModel,
  x: number,
  y: number,
  opts?: { empty?: boolean },
): VoxelSelection | null {
  const { sx, sy, sz } = voxelGridSize(model);
  if (x < 0 || x >= sx || y < 0 || y >= sy) return null;
  const wantEmpty = Boolean(opts?.empty);
  let z0 = -1;
  let z1 = -1;
  for (let z = 0; z < sz; z++) {
    const isSolid = getVoxel(model, x, y, z) > 0;
    if (wantEmpty ? !isSolid : isSolid) {
      if (z0 < 0) z0 = z;
      z1 = z;
    }
  }
  if (z0 < 0) return null;
  return { x0: x, y0: y, z0, x1: x, y1: y, z1 };
}

/**
 * Vertical column at fixed X,Z from the ground up through `anchorY`
 * (includes empty cells so Fill can build a pillar downward).
 */
export function selectionStackY(
  model: Pick<EmberVoxelModel, "sizeBlocks" | "heightVoxels">,
  x: number,
  z: number,
  anchorY: number,
): VoxelSelection | null {
  const { sx, sy, sz } = voxelGridSize(model);
  if (x < 0 || x >= sx || z < 0 || z >= sz) return null;
  if (anchorY < 0 || anchorY >= sy) return null;
  return { x0: x, y0: 0, z0: z, x1: x, y1: anchorY, z1: z };
}

export function selectionAll(
  model: Pick<EmberVoxelModel, "sizeBlocks" | "heightVoxels">,
): VoxelSelection {
  const { sx, sy, sz } = voxelGridSize(model);
  return { x0: 0, y0: 0, z0: 0, x1: sx - 1, y1: sy - 1, z1: sz - 1 };
}

/**
 * AABB of a 6-connected empty (deleted / air) component containing (x,y,z).
 * Returns null if the seed cell is solid or out of bounds.
 */
export function selectionEmptyFlood(
  model: EmberVoxelModel,
  x: number,
  y: number,
  z: number,
): VoxelSelection | null {
  const { sx, sy, sz } = voxelGridSize(model);
  if (
    x < 0 ||
    y < 0 ||
    z < 0 ||
    x >= sx ||
    y >= sy ||
    z >= sz ||
    getVoxel(model, x, y, z) > 0
  ) {
    return null;
  }
  const seen = new Uint8Array(sx * sy * sz);
  const idx = (cx: number, cy: number, cz: number) =>
    cx + cz * sx + cy * sx * sz;
  const queue: number[] = [x, y, z];
  seen[idx(x, y, z)] = 1;
  let x0 = x;
  let y0 = y;
  let z0 = z;
  let x1 = x;
  let y1 = y;
  let z1 = z;
  const dirs: [number, number, number][] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  while (queue.length) {
    const cz = queue.pop()!;
    const cy = queue.pop()!;
    const cx = queue.pop()!;
    x0 = Math.min(x0, cx);
    y0 = Math.min(y0, cy);
    z0 = Math.min(z0, cz);
    x1 = Math.max(x1, cx);
    y1 = Math.max(y1, cy);
    z1 = Math.max(z1, cz);
    for (const [dx, dy, dz] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      const nz = cz + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz) {
        continue;
      }
      const i = idx(nx, ny, nz);
      if (seen[i]) continue;
      if (getVoxel(model, nx, ny, nz) > 0) continue;
      seen[i] = 1;
      queue.push(nx, ny, nz);
    }
  }
  return { x0, y0, z0, x1, y1, z1 };
}

/**
 * 6-connected voxels of the same palette index as the seed (exact cells).
 * Air seed → connected empty cells. Used by «умный» group select.
 */
export function selectionColorFloodSet(
  model: EmberVoxelModel,
  x: number,
  y: number,
  z: number,
): VoxelSelectionSet {
  const { sx, sy, sz } = voxelGridSize(model);
  if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return [];
  const target = getVoxel(model, x, y, z);
  const seen = new Uint8Array(sx * sy * sz);
  const idx = (cx: number, cy: number, cz: number) =>
    cx + cz * sx + cy * sx * sz;
  const queue: number[] = [x, y, z];
  seen[idx(x, y, z)] = 1;
  const out: VoxelSelectionSet = [];
  const dirs: [number, number, number][] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  while (queue.length) {
    const cz = queue.pop()!;
    const cy = queue.pop()!;
    const cx = queue.pop()!;
    out.push({ x0: cx, y0: cy, z0: cz, x1: cx, y1: cy, z1: cz });
    for (const [dx, dy, dz] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      const nz = cz + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz) {
        continue;
      }
      const i = idx(nx, ny, nz);
      if (seen[i]) continue;
      if (getVoxel(model, nx, ny, nz) !== target) continue;
      seen[i] = 1;
      queue.push(nx, ny, nz);
    }
  }
  return out;
}

/**
 * Bounding box of every empty cell in the grid (null if the model is solid-full).
 */
export function selectionAllEmpty(model: EmberVoxelModel): VoxelSelection | null {
  const { sx, sy, sz } = voxelGridSize(model);
  let x0 = sx;
  let y0 = sy;
  let z0 = sz;
  let x1 = -1;
  let y1 = -1;
  let z1 = -1;
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        if (getVoxel(model, x, y, z) > 0) continue;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        z0 = Math.min(z0, z);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
        z1 = Math.max(z1, z);
      }
    }
  }
  if (x1 < 0) return null;
  return { x0, y0, z0, x1, y1, z1 };
}

export type SelectionEditOp =
  | "paint"
  | "fill"
  | "erase"
  | "emit"
  | "shine"
  | "transparency";

export type ExtractSelectionResult = {
  /** Cropped model containing only selected solids. */
  model: EmberVoxelModel;
  /** AABB min corner in the source grid (scene offset to preserve height). */
  originOffset: { x: number; y: number; z: number };
};

/**
 * Copy selection cells into a new cropped model.
 * Does not mutate `source`. Caller should erase selection on source separately.
 */
export function extractSelectionToModel(
  source: EmberVoxelModel,
  selIn: VoxelSelection | VoxelSelectionSet,
  newId: string,
  nameRu?: string,
): ExtractSelectionResult | null {
  const src = normalizeVoxelModel(source);
  const boxes = asSelectionSet(selIn)
    .map((b) => clampVoxelSelection(src, b))
    .filter((b): b is VoxelSelection => Boolean(b));
  if (!boxes.length) return null;

  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  let any = false;
  for (const box of boxes) {
    for (let y = box.y0; y <= box.y1; y++) {
      for (let z = box.z0; z <= box.z1; z++) {
        for (let x = box.x0; x <= box.x1; x++) {
          if (getVoxel(src, x, y, z) <= 0) continue;
          any = true;
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          z0 = Math.min(z0, z);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
          z1 = Math.max(z1, z);
        }
      }
    }
  }
  if (!any) return null;

  const sx = x1 - x0 + 1;
  const sy = y1 - y0 + 1;
  const sz = z1 - z0 + 1;
  const sizeBlocks = {
    x: Math.max(1, Math.ceil(sx / VOXELS_PER_BLOCK)),
    y: Math.max(1, Math.ceil(sy / VOXELS_PER_BLOCK)),
    z: Math.max(1, Math.ceil(sz / VOXELS_PER_BLOCK)),
  };
  let next = createEmptyVoxelModel(newId, sizeBlocks, nameRu, sy);
  next.palette = [...src.palette];
  next.material = src.material;
  next = {
    ...next,
    voxels: [...next.voxels],
    emissive: ensureEmissiveArray(next),
    shine: ensureShineArray(next),
    transparency: ensureTransparencyArray(next),
  };

  const inSel = (x: number, y: number, z: number) =>
    boxes.some(
      (b) =>
        x >= b.x0 &&
        x <= b.x1 &&
        y >= b.y0 &&
        y <= b.y1 &&
        z >= b.z0 &&
        z <= b.z1,
    );

  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (!inSel(x, y, z)) continue;
        const pi = getVoxel(src, x, y, z);
        if (pi <= 0) continue;
        const lx = x - x0;
        const ly = y - y0;
        const lz = z - z0;
        const i = voxelIndex(next, lx, ly, lz);
        if (i < 0) continue;
        next.voxels[i] = pi;
        next.emissive![i] = getVoxelEmissive(src, x, y, z);
        next.shine![i] = getVoxelShine(src, x, y, z);
        next.transparency![i] = getVoxelTransparency(src, x, y, z);
      }
    }
  }

  return {
    model: normalizeVoxelModel(next),
    originOffset: { x: x0, y: y0, z: z0 },
  };
}

/** Apply paint / solid fill / erase / emissive / shine / transparency inside selection. */
export function editVoxelSelection(
  model: EmberVoxelModel,
  selIn: VoxelSelection | VoxelSelectionSet,
  op: SelectionEditOp,
  paletteIndex: number,
  emitAmount = 0,
): EmberVoxelModel {
  const boxes = asSelectionSet(selIn)
    .map((b) => clampVoxelSelection(model, b))
    .filter((b): b is VoxelSelection => Boolean(b));
  if (!boxes.length) return model;
  const voxels = [...model.voxels];
  const emissive = ensureEmissiveArray(model);
  const shine = ensureShineArray(model);
  const transparency = ensureTransparencyArray(model);
  const pi = Math.max(1, Math.min(model.palette.length - 1, paletteIndex | 0));
  const emit = Math.max(0, Math.min(255, Math.round(emitAmount)));
  let changed = false;

  for (const sel of boxes) {
    for (let y = sel.y0; y <= sel.y1; y++) {
      for (let z = sel.z0; z <= sel.z1; z++) {
        for (let x = sel.x0; x <= sel.x1; x++) {
          const i = voxelIndex(model, x, y, z);
          if (i < 0) continue;
          switch (op) {
            case "erase": {
              if ((voxels[i] ?? 0) !== 0) {
                voxels[i] = 0;
                emissive[i] = 0;
                shine[i] = 0;
                transparency[i] = 0;
                changed = true;
              }
              break;
            }
            case "fill": {
              if ((voxels[i] ?? 0) !== pi) {
                voxels[i] = pi;
                changed = true;
              }
              break;
            }
            case "paint": {
              if ((voxels[i] ?? 0) > 0 && (voxels[i] ?? 0) !== pi) {
                voxels[i] = pi;
                changed = true;
              }
              break;
            }
            case "emit": {
              if ((voxels[i] ?? 0) > 0 && emissive[i] !== emit) {
                emissive[i] = emit;
                changed = true;
              }
              break;
            }
            case "shine": {
              if ((voxels[i] ?? 0) > 0 && shine[i] !== emit) {
                shine[i] = emit;
                changed = true;
              }
              break;
            }
            case "transparency": {
              if ((voxels[i] ?? 0) > 0 && transparency[i] !== emit) {
                transparency[i] = emit;
                changed = true;
              }
              break;
            }
            default: {
              const _n: never = op;
              void _n;
            }
          }
        }
      }
    }
  }
  return changed
    ? { ...model, voxels, emissive, shine, transparency }
    : model;
}

/**
 * Resize grid while copying overlapping voxels (and channels) in place.
 * Keeps material / light / physical metadata from the previous model.
 */
export function resizeVoxelModel(
  model: EmberVoxelModel,
  sizeBlocks: { x: number; y: number; z: number },
  heightVoxels?: number,
): EmberVoxelModel {
  const prev = normalizeVoxelModel(model);
  const size = {
    x: Math.max(1, Math.min(8, Math.round(sizeBlocks.x))),
    y: Math.max(1, Math.min(8, Math.round(sizeBlocks.y))),
    z: Math.max(1, Math.min(8, Math.round(sizeBlocks.z))),
  };
  const hv = Number.isFinite(heightVoxels)
    ? Math.max(1, Math.min(8 * VOXELS_PER_BLOCK, Math.round(heightVoxels!)))
    : size.y * VOXELS_PER_BLOCK;
  const a = voxelGridSize(prev);
  const b = voxelGridSize({ sizeBlocks: size, heightVoxels: hv });
  const n = b.sx * b.sy * b.sz;
  const voxels = new Array(n).fill(0);
  const emissive = new Array(n).fill(0);
  const shine = new Array(n).fill(0);
  const transparency = new Array(n).fill(0);
  const ox = Math.max(0, Math.min(a.sx, b.sx));
  const oy = Math.max(0, Math.min(a.sy, b.sy));
  const oz = Math.max(0, Math.min(a.sz, b.sz));
  for (let y = 0; y < oy; y++) {
    for (let z = 0; z < oz; z++) {
      for (let x = 0; x < ox; x++) {
        const ia = voxelIndex(prev, x, y, z);
        const ib = x + z * b.sx + y * b.sx * b.sz;
        if (ia < 0 || ib < 0 || ib >= n) continue;
        voxels[ib] = prev.voxels[ia] ?? 0;
        emissive[ib] = prev.emissive?.[ia] ?? 0;
        shine[ib] = prev.shine?.[ia] ?? 0;
        transparency[ib] = prev.transparency?.[ia] ?? 0;
      }
    }
  }
  // Preserve light pivot if still inside the new grid.
  let emissiveLightOrigin = prev.emissiveLightOrigin;
  if (emissiveLightOrigin) {
    if (
      emissiveLightOrigin.x >= b.sx ||
      emissiveLightOrigin.y >= b.sy ||
      emissiveLightOrigin.z >= b.sz
    ) {
      emissiveLightOrigin = {
        x: Math.min(emissiveLightOrigin.x, b.sx - 1),
        y: Math.min(emissiveLightOrigin.y, b.sy - 1),
        z: Math.min(emissiveLightOrigin.z, b.sz - 1),
      };
    }
  }
  return {
    ...prev,
    sizeBlocks: size,
    heightVoxels: hv,
    voxels,
    emissive,
    shine,
    transparency,
    emissiveLightOrigin,
  };
}

export function normalizeVoxelModel(raw: EmberVoxelModel): EmberVoxelModel {
  const sizeBlocks = {
    x: Math.max(1, Math.min(8, Math.round(raw.sizeBlocks?.x ?? 1))),
    y: Math.max(1, Math.min(8, Math.round(raw.sizeBlocks?.y ?? 1))),
    z: Math.max(1, Math.min(8, Math.round(raw.sizeBlocks?.z ?? 1))),
  };
  const heightVoxels = Number.isFinite(raw.heightVoxels)
    ? Math.max(
        1,
        Math.min(8 * VOXELS_PER_BLOCK, Math.round(raw.heightVoxels!)),
      )
    : sizeBlocks.y * VOXELS_PER_BLOCK;
  const { sx, sy, sz } = voxelGridSize({ sizeBlocks, heightVoxels });
  const need = sx * sy * sz;
  const src = Array.isArray(raw.voxels) ? raw.voxels : [];
  const voxels = new Array(need).fill(0);
  for (let i = 0; i < Math.min(need, src.length); i++) {
    voxels[i] = Math.max(0, Math.min(255, (src[i] as number) | 0));
  }
  const emSrc = Array.isArray(raw.emissive) ? raw.emissive : [];
  const emissive = new Array(need).fill(0);
  for (let i = 0; i < Math.min(need, emSrc.length); i++) {
    emissive[i] =
      voxels[i]! > 0
        ? Math.max(0, Math.min(255, (emSrc[i] as number) | 0))
        : 0;
  }
  const shSrc = Array.isArray(raw.shine) ? raw.shine : [];
  const shine = new Array(need).fill(0);
  for (let i = 0; i < Math.min(need, shSrc.length); i++) {
    shine[i] =
      voxels[i]! > 0
        ? Math.max(0, Math.min(255, (shSrc[i] as number) | 0))
        : 0;
  }
  const trSrc = Array.isArray(raw.transparency) ? raw.transparency : [];
  const transparency = new Array(need).fill(0);
  for (let i = 0; i < Math.min(need, trSrc.length); i++) {
    transparency[i] =
      voxels[i]! > 0
        ? Math.max(0, Math.min(255, (trSrc[i] as number) | 0))
        : 0;
  }
  const palette =
    Array.isArray(raw.palette) && raw.palette.length > 1
      ? raw.palette.map((c, i) => (i === 0 ? "" : c || "#888888"))
      : [...DEFAULT_VOXEL_PALETTE];
  if (palette[0] !== "") palette[0] = "";

  let emissiveLightOrigin: EmberVoxelModel["emissiveLightOrigin"];
  if (
    raw.emissiveLightOrigin &&
    Number.isFinite(raw.emissiveLightOrigin.x) &&
    Number.isFinite(raw.emissiveLightOrigin.y) &&
    Number.isFinite(raw.emissiveLightOrigin.z)
  ) {
    emissiveLightOrigin = {
      x: Math.max(0, Math.min(sx - 1, Math.round(raw.emissiveLightOrigin.x))),
      y: Math.max(0, Math.min(sy - 1, Math.round(raw.emissiveLightOrigin.y))),
      z: Math.max(0, Math.min(sz - 1, Math.round(raw.emissiveLightOrigin.z))),
    };
  }

  return {
    id: raw.id,
    nameRu: raw.nameRu,
    tags: normalizeEmberLibraryTags(raw.tags),
    componentStates: raw.componentStates
      ? {
          ...(raw.componentStates.collider != null
            ? { collider: raw.componentStates.collider === true }
            : {}),
          ...(raw.componentStates["voxel-light"] != null
            ? { "voxel-light": raw.componentStates["voxel-light"] === true }
            : {}),
        }
      : undefined,
    sizeBlocks,
    heightVoxels,
    palette,
    voxels,
    emissive,
    shine,
    transparency,
    material: normalizeModelMaterial(raw.material),
    emissiveCastsLight: raw.emissiveCastsLight === true ? true : undefined,
    emissiveLightRange: Number.isFinite(raw.emissiveLightRange)
      ? resolveEmissiveLightRange(raw.emissiveLightRange)
      : undefined,
    emissiveLightShadows:
      raw.emissiveLightShadows === true ? true : undefined,
    emissiveLightOrigin,
    emissiveLightOffset: normalizeLightOffset(raw.emissiveLightOffset),
    emissiveStrength: Number.isFinite(raw.emissiveStrength)
      ? resolveEmissiveStrength(raw.emissiveStrength)
      : undefined,
    emissiveTorchFlicker:
      raw.emissiveTorchFlicker === true ? true : undefined,
    emissiveLanternFlicker:
      raw.emissiveLanternFlicker === true ? true : undefined,
    emissiveSuppressHostShadow:
      raw.emissiveSuppressHostShadow === true ? true : undefined,
    // Persist explicit false; omit / true both mean physical (default).
    physical: raw.physical === false ? false : raw.physical === true ? true : undefined,
    collider: raw.collider ? { ...raw.collider } : undefined,
  };
}
