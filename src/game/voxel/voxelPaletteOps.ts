/**
 * Palette-index remap: MagicaVoxel-style "this brown everywhere → that slot".
 */
import type { EmberVoxelModel } from "../content/types";
import {
  asSelectionSet,
  clampVoxelSelection,
  voxelGridSize,
  type VoxelSelection,
  type VoxelSelectionSet,
} from "./voxelModel";

function cellInBoxes(
  boxes: ReadonlyArray<VoxelSelection>,
  x: number,
  y: number,
  z: number,
): boolean {
  for (const box of boxes) {
    if (
      x >= box.x0 &&
      x <= box.x1 &&
      y >= box.y0 &&
      y <= box.y1 &&
      z >= box.z0 &&
      z <= box.z1
    ) {
      return true;
    }
  }
  return false;
}

/** Occupied-cell counts per palette index (index 0 unused). */
export function countVoxelPaletteUsage(model: EmberVoxelModel): number[] {
  const counts = new Array(Math.max(1, model.palette.length)).fill(0);
  for (const pi of model.voxels) {
    if (pi > 0 && pi < counts.length) counts[pi] += 1;
  }
  return counts;
}

function isPalettePlaceholder(hex: string | undefined): boolean {
  const c = (hex ?? "").trim().toLowerCase();
  return !c || c === "#888888";
}

/**
 * Drop trailing unused empty/placeholder slots left by MagicaVoxel's 256
 * palette. Keep authored colors the user added with +, even if unpainted.
 */
export function trimVoxelPalette(model: EmberVoxelModel): EmberVoxelModel {
  const palette = model.palette ?? [];
  if (palette.length <= 2) return model;
  const usage = countVoxelPaletteUsage(model);
  let last = 0;
  for (let i = 1; i < palette.length; i++) {
    if (usage[i] > 0 || !isPalettePlaceholder(palette[i])) last = i;
  }
  const keep = Math.max(1, last) + 1;
  if (keep >= palette.length) return model;
  return { ...model, palette: palette.slice(0, keep) };
}

/** Drop unused MagicaVoxel 256 dumps; keep small authored palettes intact. */
export function fitVoxelPalette(model: EmberVoxelModel): EmberVoxelModel {
  if ((model.palette?.length ?? 0) >= 128) {
    return compactVoxelPaletteToUsed(model);
  }
  return trimVoxelPalette(model);
}

/** Remap used colors to 1..N. Import / MagicaVoxel hydrate only. */
export function compactVoxelPaletteToUsed(
  model: EmberVoxelModel,
): EmberVoxelModel {
  const remap = new Map<number, number>();
  let next = 1;
  const voxels = model.voxels.map((pi) => {
    if (pi <= 0) return 0;
    let mapped = remap.get(pi);
    if (mapped == null) {
      mapped = next++;
      remap.set(pi, mapped);
    }
    return mapped;
  });
  const palette = [""];
  for (const [from, to] of remap) {
    palette[to] = model.palette[from] || "#888888";
  }
  if (palette.length <= 1) {
    return { ...model, voxels, palette: ["", "#888888"] };
  }
  return { ...model, voxels, palette };
}

/**
 * Remap every solid cell with palette index `fromIndex` to `toIndex`.
 * Extra channels stay unless the target is empty (0). If `selection` is set,
 * only cells inside those boxes change.
 */
export function replaceVoxelPaletteIndex(
  model: EmberVoxelModel,
  fromIndex: number,
  toIndex: number,
  selection?: VoxelSelectionSet | null,
): EmberVoxelModel {
  const from = fromIndex | 0;
  const to = toIndex | 0;
  if (from <= 0 || from === to) return model;
  const maxPi = model.palette.length - 1;
  if (to < 0 || to > maxPi) return model;

  const boxes = selection?.length
    ? asSelectionSet(selection)
        .map((box) => clampVoxelSelection(model, box))
        .filter((box): box is VoxelSelection => Boolean(box))
    : null;
  if (boxes && !boxes.length) return model;

  const { sx, sz } = voxelGridSize(model);
  const voxels = [...model.voxels];
  const emissive = [...(model.emissive ?? model.voxels.map(() => 0))];
  const shine = [...(model.shine ?? model.voxels.map(() => 0))];
  const transparency = [...(model.transparency ?? model.voxels.map(() => 0))];
  const transmittance = [
    ...(model.transmittance ?? model.voxels.map(() => 0)),
  ];
  const stride = sx * sz;
  let changed = false;

  for (let i = 0; i < voxels.length; i++) {
    if ((voxels[i] ?? 0) !== from) continue;
    if (boxes) {
      const x = i % sx;
      const y = Math.floor(i / stride);
      const z = Math.floor((i % stride) / sx);
      if (!cellInBoxes(boxes, x, y, z)) continue;
    }
    voxels[i] = to;
    if (to === 0) {
      emissive[i] = 0;
      shine[i] = 0;
      transparency[i] = 0;
      transmittance[i] = 0;
    }
    changed = true;
  }
  if (!changed) return model;
  return { ...model, voxels, emissive, shine, transparency, transmittance };
}
