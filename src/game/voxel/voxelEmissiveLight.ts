/**
 * Summarize emissive voxels for PointLight color / origin.
 */
import type {
  EmberVoxelEmissiveLamp,
  EmberVoxelModel,
} from "../content/types";
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

export const VOXEL_EMISSIVE_LAMPS_MAX = 8;
export const LEGACY_VOXEL_LAMP_ID = "lamp_0";

function clampCell(
  n: number,
  max: number,
): number {
  return Math.max(0, Math.min(max - 1, Math.round(n)));
}

export function newVoxelEmissiveLampId(): string {
  return `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeVoxelEmissiveLamp(
  raw: EmberVoxelEmissiveLamp | undefined | null,
  grid?: { sx: number; sy: number; sz: number },
): EmberVoxelEmissiveLamp | null {
  if (!raw || typeof raw.id !== "string" || !raw.id.trim()) return null;
  const origin =
    raw.origin &&
    Number.isFinite(raw.origin.x) &&
    Number.isFinite(raw.origin.y) &&
    Number.isFinite(raw.origin.z)
      ? {
          x: grid ? clampCell(raw.origin.x, grid.sx) : Math.round(raw.origin.x),
          y: grid ? clampCell(raw.origin.y, grid.sy) : Math.round(raw.origin.y),
          z: grid ? clampCell(raw.origin.z, grid.sz) : Math.round(raw.origin.z),
        }
      : undefined;
  const offset = normalizeVoxelLightOffset(raw.offset);
  const lamp: EmberVoxelEmissiveLamp = {
    id: raw.id.trim(),
    ...(typeof raw.nameRu === "string" && raw.nameRu.trim()
      ? { nameRu: raw.nameRu.trim() }
      : {}),
    ...(origin ? { origin } : {}),
    ...(offset ? { offset } : {}),
  };
  if (Number.isFinite(raw.range)) lamp.range = raw.range;
  if (Number.isFinite(raw.strength)) lamp.strength = raw.strength;
  if (raw.shadows === true) lamp.shadows = true;
  if (raw.softRings === true) lamp.softRings = true;
  if (raw.softShadows === true) lamp.softShadows = true;
  if (raw.torchFlicker === true) lamp.torchFlicker = true;
  if (raw.lanternFlicker === true) lamp.lanternFlicker = true;
  return lamp;
}

/** Authored extra lamps, or a single virtual lamp from legacy model fields. */
export function listVoxelEmissiveLamps(
  model: EmberVoxelModel,
): EmberVoxelEmissiveLamp[] {
  const grid = voxelGridSize(model);
  const authored = Array.isArray(model.emissiveLights)
    ? model.emissiveLights
    : [];
  const seen = new Set<string>();
  const cleaned: EmberVoxelEmissiveLamp[] = [];
  for (const raw of authored) {
    const lamp = normalizeVoxelEmissiveLamp(raw, grid);
    if (!lamp || seen.has(lamp.id)) continue;
    seen.add(lamp.id);
    cleaned.push(lamp);
    if (cleaned.length >= VOXEL_EMISSIVE_LAMPS_MAX) break;
  }
  if (cleaned.length > 0) return cleaned;
  return [
    {
      id: LEGACY_VOXEL_LAMP_ID,
      origin: model.emissiveLightOrigin,
      offset: model.emissiveLightOffset,
    },
  ];
}

function syncLegacyLampFields(
  model: EmberVoxelModel,
  lamps: EmberVoxelEmissiveLamp[],
): EmberVoxelModel {
  const first = lamps[0];
  if (!first) {
    return {
      ...model,
      emissiveLights: undefined,
      emissiveLightOrigin: undefined,
      emissiveLightOffset: undefined,
    };
  }
  return {
    ...model,
    emissiveLights: lamps,
    emissiveLightOrigin: first.origin,
    emissiveLightOffset: first.offset,
    emissiveLightRange: first.range ?? model.emissiveLightRange,
    emissiveStrength: first.strength ?? model.emissiveStrength,
    emissiveLightShadows:
      first.shadows === true ? true : model.emissiveLightShadows,
    emissiveLightSoftRings:
      first.softRings === true ? true : model.emissiveLightSoftRings,
    emissiveLightSoftShadows:
      first.softShadows === true ? true : model.emissiveLightSoftShadows,
    emissiveTorchFlicker:
      first.torchFlicker === true ? true : model.emissiveTorchFlicker,
    emissiveLanternFlicker:
      first.lanternFlicker === true ? true : model.emissiveLanternFlicker,
  };
}

function materializeVoxelEmissiveLamps(
  model: EmberVoxelModel,
): EmberVoxelEmissiveLamp[] {
  const lamps = listVoxelEmissiveLamps(model);
  if (Array.isArray(model.emissiveLights) && model.emissiveLights.length > 0) {
    return lamps.map((lamp) => ({ ...lamp }));
  }
  return lamps.map((lamp, i) => ({
    ...lamp,
    id: i === 0 ? LEGACY_VOXEL_LAMP_ID : lamp.id,
  }));
}

export function resolveVoxelLampOrigin(
  model: EmberVoxelModel,
  lamp: EmberVoxelEmissiveLamp,
  sum: VoxelEmissiveSummary,
): { x: number; y: number; z: number } {
  const { sx, sy, sz } = voxelGridSize(model);
  const o = lamp.origin;
  let x: number;
  let y: number;
  let z: number;
  if (
    o &&
    Number.isFinite(o.x) &&
    Number.isFinite(o.y) &&
    Number.isFinite(o.z)
  ) {
    x = Math.max(0, Math.min(sx - 1, o.x)) + 0.5;
    y = Math.max(0, Math.min(sy - 1, o.y)) + 0.5;
    z = Math.max(0, Math.min(sz - 1, o.z)) + 0.5;
  } else {
    x = sum.cx;
    y = sum.cy;
    z = sum.cz;
  }
  const off = lamp.offset;
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

/** Color / weight of emissive cells nearest this lamp (Voronoi). */
export function summarizeVoxelEmissiveForLamp(
  model: EmberVoxelModel,
  lamps: readonly EmberVoxelEmissiveLamp[],
  lampIndex: number,
): VoxelEmissiveSummary | null {
  const global = summarizeVoxelEmissive(model);
  if (!global) return null;
  if (lamps.length <= 1) return global;
  const lamp = lamps[lampIndex];
  if (!lamp) return global;

  const origins = lamps.map((item) =>
    resolveVoxelLampOrigin(model, item, global),
  );
  const mine = origins[lampIndex]!;
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
        const px = x + 0.5;
        const py = y + 0.5;
        const pz = z + 0.5;
        let best = 0;
        let bestDist = Infinity;
        for (let li = 0; li < origins.length; li++) {
          const o = origins[li]!;
          const d =
            (px - o.x) ** 2 + (py - o.y) ** 2 + (pz - o.z) ** 2;
          if (d < bestDist) {
            bestDist = d;
            best = li;
          }
        }
        if (best !== lampIndex) continue;
        const w = amt / 255;
        count += 1;
        weight += w;
        r += rgb.r * w;
        g += rgb.g * w;
        b += rgb.b * w;
        cx += px * w;
        cy += py * w;
        cz += pz * w;
      }
    }
  }

  if (count <= 0 || weight <= 0) {
    return {
      ...global,
      cx: mine.x,
      cy: mine.y,
      cz: mine.z,
    };
  }
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

export type VoxelEmissiveCluster = VoxelEmissiveSummary;

/** 6-connected emissive islands, heaviest first. */
export function clusterVoxelEmissive(
  model: EmberVoxelModel,
): VoxelEmissiveCluster[] {
  const { sx, sy, sz } = voxelGridSize(model);
  const em = model.emissive;
  if (!em?.length) return [];
  const seen = new Uint8Array(sx * sy * sz);
  const clusters: VoxelEmissiveCluster[] = [];
  const stack: number[] = [];

  const push = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return;
    const i = voxelIndex(model, x, y, z);
    if (i < 0 || seen[i]) return;
    if ((model.voxels[i] ?? 0) <= 0 || (em[i] ?? 0) <= 0) return;
    seen[i] = 1;
    stack.push(i);
  };

  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const start = voxelIndex(model, x, y, z);
        if (start < 0 || seen[start]) continue;
        if ((model.voxels[start] ?? 0) <= 0 || (em[start] ?? 0) <= 0) continue;
        seen[start] = 1;
        stack.length = 0;
        stack.push(start);
        let count = 0;
        let weight = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        let cx = 0;
        let cy = 0;
        let cz = 0;
        while (stack.length) {
          const i = stack.pop()!;
          const pi = model.voxels[i] ?? 0;
          const amt = em[i] ?? 0;
          const rgb = parseHex(model.palette[pi] || "#888888");
          const vx = i % sx;
          const vy = Math.floor(i / (sx * sz));
          const vz = Math.floor(i / sx) % sz;
          if (rgb && amt > 0 && pi > 0) {
            const w = amt / 255;
            count += 1;
            weight += w;
            r += rgb.r * w;
            g += rgb.g * w;
            b += rgb.b * w;
            cx += (vx + 0.5) * w;
            cy += (vy + 0.5) * w;
            cz += (vz + 0.5) * w;
          }
          push(vx + 1, vy, vz);
          push(vx - 1, vy, vz);
          push(vx, vy + 1, vz);
          push(vx, vy - 1, vz);
          push(vx, vy, vz + 1);
          push(vx, vy, vz - 1);
        }
        if (count <= 0 || weight <= 0) continue;
        clusters.push({
          count,
          weight,
          r: r / weight,
          g: g / weight,
          b: b / weight,
          cx: cx / weight,
          cy: cy / weight,
          cz: cz / weight,
        });
      }
    }
  }
  clusters.sort((a, b) => b.weight - a.weight);
  return clusters;
}

export function clusterVoxelEmissiveLamps(
  model: EmberVoxelModel,
): EmberVoxelModel {
  const clusters = clusterVoxelEmissive(model).slice(0, VOXEL_EMISSIVE_LAMPS_MAX);
  if (clusters.length === 0) return model;
  const lamps: EmberVoxelEmissiveLamp[] = clusters.map((cluster, i) => ({
    id: i === 0 ? LEGACY_VOXEL_LAMP_ID : `el_c${i}`,
    nameRu: `Свет ${i + 1}`,
    origin: {
      x: Math.max(0, Math.round(cluster.cx - 0.5)),
      y: Math.max(0, Math.round(cluster.cy - 0.5)),
      z: Math.max(0, Math.round(cluster.cz - 0.5)),
    },
  }));
  return {
    ...syncLegacyLampFields(model, lamps),
    emissiveCastsLight: true,
  };
}

export function addVoxelEmissiveLamp(
  model: EmberVoxelModel,
  origin?: { x: number; y: number; z: number },
): EmberVoxelModel {
  const lamps = materializeVoxelEmissiveLamps(model);
  if (lamps.length >= VOXEL_EMISSIVE_LAMPS_MAX) return model;
  const n = lamps.length + 1;
  lamps.push({
    id: newVoxelEmissiveLampId(),
    nameRu: `Свет ${n}`,
    ...(origin ? { origin } : {}),
  });
  return {
    ...syncLegacyLampFields(model, lamps),
    emissiveCastsLight: true,
  };
}

export function removeVoxelEmissiveLamp(
  model: EmberVoxelModel,
  lampId: string,
): EmberVoxelModel {
  const lamps = materializeVoxelEmissiveLamps(model).filter(
    (lamp) => lamp.id !== lampId,
  );
  if (lamps.length === 0) {
    return {
      ...model,
      emissiveLights: undefined,
      emissiveLightOrigin: undefined,
      emissiveLightOffset: undefined,
    };
  }
  return syncLegacyLampFields(model, lamps);
}

export function patchVoxelEmissiveLamp(
  model: EmberVoxelModel,
  lampId: string,
  patch: Partial<EmberVoxelEmissiveLamp>,
): EmberVoxelModel {
  const lamps = materializeVoxelEmissiveLamps(model);
  const index = lamps.findIndex((lamp) => lamp.id === lampId);
  if (index < 0) return model;
  const grid = voxelGridSize(model);
  const next = normalizeVoxelEmissiveLamp(
    { ...lamps[index]!, ...patch, id: lamps[index]!.id },
    grid,
  );
  if (!next) return model;
  lamps[index] = next;
  return syncLegacyLampFields(model, lamps);
}

