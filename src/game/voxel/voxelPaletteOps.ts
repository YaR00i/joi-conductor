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
    }
    changed = true;
  }
  if (!changed) return model;
  return { ...model, voxels, emissive, shine, transparency };
}
