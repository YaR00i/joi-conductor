/**
 * Summarize emissive voxels for PointLight color / origin.
 */
import type { EmberVoxelModel } from "../content/types";
import { voxelGridSize, voxelIndex } from "./voxelModel";

export type VoxelEmissiveSummary = {
  count: number;
  weight: number;
  r: number;
  g: number;
  b: number;
  /** Weighted centroid in voxel-grid coords (cell centers). */
  cx: number;
  cy: number;
  cz: number;
};

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (![r, g, b].every((n) => Number.isFinite(n))) return null;
  return { r: r / 255, g: g / 255, b: b / 255 };
}

/** Weighted average of emissive cells (palette color × emit amount). */
export function summarizeVoxelEmissive(
  model: EmberVoxelModel,
): VoxelEmissiveSummary | null {
  const { sx, sy, sz } = voxelGridSize(model);
  const em = model.emissive;
  if (!em?.length) return null;

  let count = 0;
  let weight = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;

  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const i = voxelIndex(model, x, y, z);
        const pi = model.voxels[i] ?? 0;
        if (pi <= 0) continue;
        const amt = em[i] ?? 0;
        if (amt <= 0) continue;
        const rgb = parseHex(model.palette[pi] || "#888888");
        if (!rgb) continue;
        const w = amt / 255;
        count += 1;
        weight += w;
        r += rgb.r * w;
        g += rgb.g * w;
        b += rgb.b * w;
        cx += (x + 0.5) * w;
        cy += (y + 0.5) * w;
        cz += (z + 0.5) * w;
      }
    }
  }

  if (count <= 0 || weight <= 0) return null;
  return {
    count,
    weight,
    r: r / weight,
    g: g / weight,
    b: b / weight,
    cx: cx / weight,
    cy: cy / weight,
    cz: cz / weight,
  };
}

/** Origin without offset: authored cell center or emissive centroid. */
export function resolveVoxelLightBase(
  model: EmberVoxelModel,
  sum: VoxelEmissiveSummary,
): { x: number; y: number; z: number } {
  const { sx, sy, sz } = voxelGridSize(model);
  const o = model.emissiveLightOrigin;
  if (
    o &&
    Number.isFinite(o.x) &&
    Number.isFinite(o.y) &&
    Number.isFinite(o.z)
  ) {
    return {
      x: Math.max(0, Math.min(sx - 1, o.x)) + 0.5,
      y: Math.max(0, Math.min(sy - 1, o.y)) + 0.5,
      z: Math.max(0, Math.min(sz - 1, o.z)) + 0.5,
    };
  }
  return { x: sum.cx, y: sum.cy, z: sum.cz };
}

export function resolveVoxelLightOrigin(
  model: EmberVoxelModel,
  sum: VoxelEmissiveSummary,
): { x: number; y: number; z: number } {
  const base = resolveVoxelLightBase(model, sum);
  let x = base.x;
  let y = base.y;
  let z = base.z;
  const off = model.emissiveLightOffset;
  if (
    off &&
    (Number.isFinite(off.x) || Number.isFinite(off.y) || Number.isFinite(off.z))
  ) {
    x += Number.isFinite(off.x) ? off.x : 0;
    y += Number.isFinite(off.y) ? off.y : 0;
    z += Number.isFinite(off.z) ? off.z : 0;
  }
  return { x, y, z };
}

/** Clamp authored light offset (voxel units). */
export function normalizeVoxelLightOffset(
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

export function modelHasEmissiveVoxels(model: EmberVoxelModel): boolean {
  const em = model.emissive;
  if (!em?.length) return false;
  for (let i = 0; i < em.length; i++) {
    if ((em[i] ?? 0) > 0 && (model.voxels[i] ?? 0) > 0) return true;
  }
  return false;
}
