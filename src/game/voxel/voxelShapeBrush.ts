/**
 * MagicaVoxel-style shape stamps and selection transforms
 * (rotate / duplicate / translate).
 */
import type { EmberVoxelModel } from "../content/types";
import {
  asSelectionSet,
  expandCellWithMirror,
  getVoxel,
  getVoxelEmissive,
  getVoxelShine,
  getVoxelTransparency,
  getVoxelTransmittance,
  voxelGridSize,
  voxelIndex,
  type VoxelMirrorAxes,
  type VoxelSelection,
  type VoxelSelectionSet,
  VOXEL_MIRROR_OFF,
} from "./voxelModel";

export type VoxelShapeBrush = "voxel" | "line" | "box" | "sphere";

export type VoxelShapeCell = { x: number; y: number; z: number };

export type VoxelVec3 = { x: number; y: number; z: number };

export type VoxelAxis = "x" | "y" | "z";

export type VoxelRotateAxis = "x" | "y" | "z";

/** Box/sphere: footprint on a plane, then height. Line stays a 3D drag. */
export function usesShapeHeightPhase(kind: VoxelShapeBrush): boolean {
  return kind === "box" || kind === "sphere";
}

export function dominantVoxelAxis(n: VoxelVec3): VoxelAxis {
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  if (ax >= ay && ax >= az && ax > 1e-8) return "x";
  if (ay >= az && ay > 1e-8) return "y";
  if (az > 1e-8) return "z";
  return "y";
}

export function gridExtentAlongAxis(
  grid: { sx: number; sy: number; sz: number },
  axis: VoxelAxis,
): number {
  switch (axis) {
    case "x":
      return grid.sx;
    case "y":
      return grid.sy;
    case "z":
      return grid.sz;
    default: {
      const _never: never = axis;
      return _never;
    }
  }
}

export function shapeFootprintCenter(
  start: VoxelShapeCell,
  planeEnd: VoxelShapeCell,
  heightAxis: VoxelAxis,
): VoxelVec3 {
  const x0 = Math.min(start.x, planeEnd.x);
  const x1 = Math.max(start.x, planeEnd.x);
  const y0 = Math.min(start.y, planeEnd.y);
  const y1 = Math.max(start.y, planeEnd.y);
  const z0 = Math.min(start.z, planeEnd.z);
  const z1 = Math.max(start.z, planeEnd.z);
  return {
    x: heightAxis === "x" ? start.x + 0.5 : (x0 + x1 + 1) / 2,
    y: heightAxis === "y" ? start.y + 0.5 : (y0 + y1 + 1) / 2,
    z: heightAxis === "z" ? start.z + 0.5 : (z0 + z1 + 1) / 2,
  };
}

function axisUnit(axis: VoxelAxis): VoxelVec3 {
  switch (axis) {
    case "x":
      return { x: 1, y: 0, z: 0 };
    case "y":
      return { x: 0, y: 1, z: 0 };
    case "z":
      return { x: 0, y: 0, z: 1 };
    default: {
      const _never: never = axis;
      return _never;
    }
  }
}

function cross3(a: VoxelVec3, b: VoxelVec3): VoxelVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot3(a: VoxelVec3, b: VoxelVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function sub3(a: VoxelVec3, b: VoxelVec3): VoxelVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function addScaled3(a: VoxelVec3, b: VoxelVec3, t: number): VoxelVec3 {
  return { x: a.x + b.x * t, y: a.y + b.y * t, z: a.z + b.z * t };
}

function lengthSq3(a: VoxelVec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

function normalize3(a: VoxelVec3): VoxelVec3 | null {
  const ls = lengthSq3(a);
  if (ls < 1e-12) return null;
  const inv = 1 / Math.sqrt(ls);
  return { x: a.x * inv, y: a.y * inv, z: a.z * inv };
}

export function cellOnShapePlane(
  start: VoxelShapeCell,
  sample: VoxelShapeCell,
  heightAxis: VoxelAxis = "y",
): VoxelShapeCell {
  switch (heightAxis) {
    case "x":
      return { x: start.x, y: sample.y, z: sample.z };
    case "y":
      return { x: sample.x, y: start.y, z: sample.z };
    case "z":
      return { x: sample.x, y: sample.y, z: start.z };
    default: {
      const _never: never = heightAxis;
      return _never;
    }
  }
}

export function cellWithShapeHeight(
  planeCell: VoxelShapeCell,
  height: number,
  heightAxis: VoxelAxis = "y",
): VoxelShapeCell {
  const h = height | 0;
  switch (heightAxis) {
    case "x":
      return { x: h, y: planeCell.y, z: planeCell.z };
    case "y":
      return { x: planeCell.x, y: h, z: planeCell.z };
    case "z":
      return { x: planeCell.x, y: planeCell.y, z: h };
    default: {
      const _never: never = heightAxis;
      return _never;
    }
  }
}

export function clampShapeCellToGrid(
  cell: VoxelShapeCell,
  grid: { sx: number; sy: number; sz: number },
): VoxelShapeCell {
  return {
    x: Math.max(0, Math.min(grid.sx - 1, cell.x | 0)),
    y: Math.max(0, Math.min(grid.sy - 1, cell.y | 0)),
    z: Math.max(0, Math.min(grid.sz - 1, cell.z | 0)),
  };
}

export function intersectAxisAlignedPlane(
  origin: VoxelVec3,
  dir: VoxelVec3,
  axis: VoxelAxis,
  plane: number,
): VoxelVec3 | null {
  const d = dir[axis];
  if (Math.abs(d) < 1e-8) return null;
  const t = (plane - origin[axis]) / d;
  if (t < -1e-4) return null;
  return addScaled3(origin, dir, t);
}

export function cellFromShapePlaneHit(
  hit: VoxelVec3,
  start: VoxelShapeCell,
  heightAxis: VoxelAxis,
  grid: { sx: number; sy: number; sz: number },
): VoxelShapeCell {
  const sample: VoxelShapeCell = {
    x: Math.floor(hit.x),
    y: Math.floor(hit.y),
    z: Math.floor(hit.z),
  };
  return clampShapeCellToGrid(
    cellOnShapePlane(start, sample, heightAxis),
    grid,
  );
}

/**
 * Ray × vertical plane through `planeOrigin` facing the camera.
 * Returns the integer cell coordinate along `axis` (Y = height).
 */
export function intersectHeightAlongAxis(
  origin: VoxelVec3,
  dir: VoxelVec3,
  planeOrigin: VoxelVec3,
  axis: VoxelAxis,
  camPos: VoxelVec3,
  camRight: VoxelVec3,
): number | null {
  const axisVec = axisUnit(axis);
  let side = cross3(sub3(camPos, planeOrigin), axisVec);
  if (lengthSq3(side) < 1e-8) {
    side = cross3(camRight, axisVec);
  }
  const n = normalize3(cross3(side, axisVec));
  if (!n) return null;
  const denom = dot3(dir, n);
  if (Math.abs(denom) < 1e-8) return null;
  const t = dot3(sub3(planeOrigin, origin), n) / denom;
  const hit = addScaled3(origin, dir, t);
  return Math.floor(hit[axis]);
}

export function unionVoxelSelection(
  sel: VoxelSelection | VoxelSelectionSet | null | undefined,
): VoxelSelection | null {
  const boxes = asSelectionSet(sel);
  if (!boxes.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  for (const box of boxes) {
    x0 = Math.min(x0, box.x0);
    y0 = Math.min(y0, box.y0);
    z0 = Math.min(z0, box.z0);
    x1 = Math.max(x1, box.x1);
    y1 = Math.max(y1, box.y1);
    z1 = Math.max(z1, box.z1);
  }
  if (!Number.isFinite(x0)) return null;
  return { x0, y0, z0, x1, y1, z1 };
}

/** Inclusive AABB center in voxel units (cell edges, not integer indices). */
export function voxelSelectionCenter(
  sel: VoxelSelection | VoxelSelectionSet | null | undefined,
): VoxelVec3 | null {
  const b = unionVoxelSelection(sel);
  if (!b) return null;
  return {
    x: (b.x0 + b.x1 + 1) * 0.5,
    y: (b.y0 + b.y1 + 1) * 0.5,
    z: (b.z0 + b.z1 + 1) * 0.5,
  };
}

export function selectionHasSolidVoxels(
  model: EmberVoxelModel,
  sel: VoxelSelectionSet | null | undefined,
): boolean {
  if (!sel?.length) return false;
  return solidsInSelection(model, sel).length > 0;
}

export function cellsToUnitSelection(
  cells: ReadonlyArray<VoxelShapeCell>,
): VoxelSelectionSet {
  return cells.map((cell) => ({
    x0: cell.x,
    y0: cell.y,
    z0: cell.z,
    x1: cell.x,
    y1: cell.y,
    z1: cell.z,
  }));
}

function lineCells(a: VoxelShapeCell, b: VoxelShapeCell): VoxelShapeCell[] {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const dz = Math.abs(b.z - a.z);
  const n = Math.max(dx, dy, dz);
  if (n === 0) return [{ x: a.x, y: a.y, z: a.z }];
  const out: VoxelShapeCell[] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= n; i++) {
    const x = Math.round(a.x + ((b.x - a.x) * i) / n);
    const y = Math.round(a.y + ((b.y - a.y) * i) / n);
    const z = Math.round(a.z + ((b.z - a.z) * i) / n);
    const key = `${x},${y},${z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x, y, z });
  }
  return out;
}

function boxCells(a: VoxelShapeCell, b: VoxelShapeCell): VoxelShapeCell[] {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const z0 = Math.min(a.z, b.z);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const z1 = Math.max(a.z, b.z);
  const out: VoxelShapeCell[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        out.push({ x, y, z });
      }
    }
  }
  return out;
}

function sphereCells(a: VoxelShapeCell, b: VoxelShapeCell): VoxelShapeCell[] {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const z0 = Math.min(a.z, b.z);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const z1 = Math.max(a.z, b.z);
  const cx = (x0 + x1 + 1) / 2;
  const cy = (y0 + y1 + 1) / 2;
  const cz = (z0 + z1 + 1) / 2;
  const rx = Math.max(0.5, (x1 - x0 + 1) / 2);
  const ry = Math.max(0.5, (y1 - y0 + 1) / 2);
  const rz = Math.max(0.5, (z1 - z0 + 1) / 2);
  const out: VoxelShapeCell[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        const nz = (z + 0.5 - cz) / rz;
        if (nx * nx + ny * ny + nz * nz <= 1.0001) out.push({ x, y, z });
      }
    }
  }
  return out.length ? out : [{ x: a.x, y: a.y, z: a.z }];
}

export function cellsForVoxelShape(
  a: VoxelShapeCell,
  b: VoxelShapeCell,
  kind: VoxelShapeBrush,
): VoxelShapeCell[] {
  switch (kind) {
    case "voxel":
      return [{ x: b.x, y: b.y, z: b.z }];
    case "line":
      return lineCells(a, b);
    case "box":
      return boxCells(a, b);
    case "sphere":
      return sphereCells(a, b);
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

export function stampVoxelShape(
  model: EmberVoxelModel,
  a: VoxelShapeCell,
  b: VoxelShapeCell,
  kind: VoxelShapeBrush,
  options: {
    paletteIndex: number;
    erase?: boolean;
    mirror?: VoxelMirrorAxes;
  },
): EmberVoxelModel {
  const seeds = cellsForVoxelShape(a, b, kind);
  const cells: VoxelShapeCell[] = [];
  const seen = new Set<string>();
  const mirror = options.mirror ?? VOXEL_MIRROR_OFF;
  for (const seed of seeds) {
    for (const cell of expandCellWithMirror(model, seed, mirror)) {
      const key = `${cell.x},${cell.y},${cell.z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cells.push(cell);
    }
  }
  if (!cells.length) return model;

  const voxels = [...model.voxels];
  const emissive = [...(model.emissive ?? model.voxels.map(() => 0))];
  const shine = [...(model.shine ?? model.voxels.map(() => 0))];
  const transparency = [...(model.transparency ?? model.voxels.map(() => 0))];
  const transmittance = [
    ...(model.transmittance ?? model.voxels.map(() => 0)),
  ];
  const pi = options.erase
    ? 0
    : Math.max(1, Math.min(model.palette.length - 1, options.paletteIndex | 0));
  let changed = false;
  for (const cell of cells) {
    const i = voxelIndex(model, cell.x, cell.y, cell.z);
    if (i < 0) continue;
    if ((voxels[i] ?? 0) === pi) continue;
    voxels[i] = pi;
    if (pi === 0) {
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

type PackedCell = VoxelShapeCell & {
  pi: number;
  emit: number;
  shine: number;
  trans: number;
  tx: number;
};

function solidsInSelection(
  model: EmberVoxelModel,
  sel: VoxelSelectionSet,
): PackedCell[] {
  const out: PackedCell[] = [];
  for (const box of asSelectionSet(sel)) {
    for (let y = box.y0; y <= box.y1; y++) {
      for (let z = box.z0; z <= box.z1; z++) {
        for (let x = box.x0; x <= box.x1; x++) {
          const pi = getVoxel(model, x, y, z);
          if (pi <= 0) continue;
          out.push({
            x,
            y,
            z,
            pi,
            emit: getVoxelEmissive(model, x, y, z),
            shine: getVoxelShine(model, x, y, z),
            trans: getVoxelTransparency(model, x, y, z),
            tx: getVoxelTransmittance(model, x, y, z),
          });
        }
      }
    }
  }
  return out;
}

function writePackedCell(
  voxels: number[],
  emissive: number[],
  shine: number[],
  transparency: number[],
  transmittance: number[],
  model: EmberVoxelModel,
  cell: PackedCell,
): boolean {
  const i = voxelIndex(model, cell.x, cell.y, cell.z);
  if (i < 0) return false;
  voxels[i] = cell.pi;
  emissive[i] = cell.emit;
  shine[i] = cell.shine;
  transparency[i] = cell.trans;
  transmittance[i] = cell.tx;
  return true;
}

function clearPackedCell(
  voxels: number[],
  emissive: number[],
  shine: number[],
  transparency: number[],
  transmittance: number[],
  model: EmberVoxelModel,
  x: number,
  y: number,
  z: number,
): void {
  const i = voxelIndex(model, x, y, z);
  if (i < 0) return;
  voxels[i] = 0;
  emissive[i] = 0;
  shine[i] = 0;
  transparency[i] = 0;
  transmittance[i] = 0;
}

function rotateCell(
  cell: VoxelShapeCell,
  bounds: VoxelSelection,
  axis: VoxelRotateAxis,
): VoxelShapeCell {
  const relX = cell.x - bounds.x0;
  const relY = cell.y - bounds.y0;
  const relZ = cell.z - bounds.z0;
  const w = bounds.x1 - bounds.x0;
  const h = bounds.y1 - bounds.y0;
  switch (axis) {
    case "y":
      return {
        x: bounds.x0 + relZ,
        y: cell.y,
        z: bounds.z0 + (w - relX),
      };
    case "x":
      return {
        x: cell.x,
        y: bounds.y0 + relZ,
        z: bounds.z0 + (h - relY),
      };
    case "z":
      return {
        x: bounds.x0 + (h - relY),
        y: bounds.y0 + relX,
        z: cell.z,
      };
    default: {
      const _never: never = axis;
      return _never;
    }
  }
}

function rotateBounds(
  bounds: VoxelSelection,
  axis: VoxelRotateAxis,
): VoxelSelection {
  const w = bounds.x1 - bounds.x0;
  const h = bounds.y1 - bounds.y0;
  const d = bounds.z1 - bounds.z0;
  switch (axis) {
    case "y":
      return {
        x0: bounds.x0,
        y0: bounds.y0,
        z0: bounds.z0,
        x1: bounds.x0 + d,
        y1: bounds.y1,
        z1: bounds.z0 + w,
      };
    case "x":
      return {
        x0: bounds.x0,
        y0: bounds.y0,
        z0: bounds.z0,
        x1: bounds.x1,
        y1: bounds.y0 + d,
        z1: bounds.z0 + h,
      };
    case "z":
      return {
        x0: bounds.x0,
        y0: bounds.y0,
        z0: bounds.z0,
        x1: bounds.x0 + h,
        y1: bounds.y0 + w,
        z1: bounds.z1,
      };
    default: {
      const _never: never = axis;
      return _never;
    }
  }
}

function clampSelectionToGrid(
  model: EmberVoxelModel,
  box: VoxelSelection,
): VoxelSelection | null {
  const { sx, sy, sz } = voxelGridSize(model);
  const x0 = Math.max(0, box.x0);
  const y0 = Math.max(0, box.y0);
  const z0 = Math.max(0, box.z0);
  const x1 = Math.min(sx - 1, box.x1);
  const y1 = Math.min(sy - 1, box.y1);
  const z1 = Math.min(sz - 1, box.z1);
  if (x1 < x0 || y1 < y0 || z1 < z0) return null;
  return { x0, y0, z0, x1, y1, z1 };
}

export function rotateVoxelSelection(
  model: EmberVoxelModel,
  sel: VoxelSelectionSet,
  axis: VoxelRotateAxis,
): { model: EmberVoxelModel; selection: VoxelSelectionSet } | null {
  const bounds = unionVoxelSelection(sel);
  if (!bounds) return null;
  const solids = solidsInSelection(model, sel);
  if (!solids.length) return null;
  const voxels = [...model.voxels];
  const emissive = [...(model.emissive ?? model.voxels.map(() => 0))];
  const shine = [...(model.shine ?? model.voxels.map(() => 0))];
  const transparency = [...(model.transparency ?? model.voxels.map(() => 0))];
  const transmittance = [
    ...(model.transmittance ?? model.voxels.map(() => 0)),
  ];
  for (const cell of solids) {
    clearPackedCell(
      voxels,
      emissive,
      shine,
      transparency,
      transmittance,
      model,
      cell.x,
      cell.y,
      cell.z,
    );
  }
  let wrote = 0;
  for (const cell of solids) {
    const dest = rotateCell(cell, bounds, axis);
    if (
      writePackedCell(
        voxels,
        emissive,
        shine,
        transparency,
        transmittance,
        model,
        {
          ...cell,
          ...dest,
        },
      )
    ) {
      wrote += 1;
    }
  }
  if (!wrote) return null;
  const nextSel = clampSelectionToGrid(model, rotateBounds(bounds, axis));
  return {
    model: { ...model, voxels, emissive, shine, transparency, transmittance },
    selection: nextSel ? [nextSel] : sel,
  };
}

export function duplicateVoxelSelection(
  model: EmberVoxelModel,
  sel: VoxelSelectionSet,
  offset?: VoxelShapeCell,
): { model: EmberVoxelModel; selection: VoxelSelectionSet } | null {
  const bounds = unionVoxelSelection(sel);
  if (!bounds) return null;
  const delta = offset ?? {
    x: bounds.x1 - bounds.x0 + 1,
    y: 0,
    z: 0,
  };
  if (delta.x === 0 && delta.y === 0 && delta.z === 0) return null;
  const solids = solidsInSelection(model, sel);
  if (!solids.length) return null;
  const voxels = [...model.voxels];
  const emissive = [...(model.emissive ?? model.voxels.map(() => 0))];
  const shine = [...(model.shine ?? model.voxels.map(() => 0))];
  const transparency = [...(model.transparency ?? model.voxels.map(() => 0))];
  const transmittance = [
    ...(model.transmittance ?? model.voxels.map(() => 0)),
  ];
  let wrote = 0;
  for (const cell of solids) {
    const dest = {
      x: cell.x + delta.x,
      y: cell.y + delta.y,
      z: cell.z + delta.z,
    };
    if (
      writePackedCell(
        voxels,
        emissive,
        shine,
        transparency,
        transmittance,
        model,
        {
          ...cell,
          ...dest,
        },
      )
    ) {
      wrote += 1;
    }
  }
  if (!wrote) return null;
  const moved: VoxelSelectionSet = [];
  for (const box of asSelectionSet(sel)) {
    const next = clampSelectionToGrid(model, {
      x0: box.x0 + delta.x,
      y0: box.y0 + delta.y,
      z0: box.z0 + delta.z,
      x1: box.x1 + delta.x,
      y1: box.y1 + delta.y,
      z1: box.z1 + delta.z,
    });
    if (next) moved.push(next);
  }
  return {
    model: { ...model, voxels, emissive, shine, transparency, transmittance },
    selection: moved.length ? moved : sel,
  };
}

/**
 * Cut selected solids and paste at `delta` (integer cells). Destination
 * cells that were not selected are overwritten. Out-of-grid cells are
 * dropped; if nothing lands, returns null.
 */
export function translateVoxelSelection(
  model: EmberVoxelModel,
  sel: VoxelSelectionSet,
  delta: VoxelShapeCell,
): { model: EmberVoxelModel; selection: VoxelSelectionSet } | null {
  const dx = delta.x | 0;
  const dy = delta.y | 0;
  const dz = delta.z | 0;
  if (dx === 0 && dy === 0 && dz === 0) {
    return { model, selection: sel };
  }
  const solids = solidsInSelection(model, sel);
  if (!solids.length) return null;
  const voxels = [...model.voxels];
  const emissive = [...(model.emissive ?? model.voxels.map(() => 0))];
  const shine = [...(model.shine ?? model.voxels.map(() => 0))];
  const transparency = [...(model.transparency ?? model.voxels.map(() => 0))];
  const transmittance = [
    ...(model.transmittance ?? model.voxels.map(() => 0)),
  ];
  for (const cell of solids) {
    clearPackedCell(
      voxels,
      emissive,
      shine,
      transparency,
      transmittance,
      model,
      cell.x,
      cell.y,
      cell.z,
    );
  }
  let wrote = 0;
  for (const cell of solids) {
    if (
      writePackedCell(
        voxels,
        emissive,
        shine,
        transparency,
        transmittance,
        model,
        {
          ...cell,
          x: cell.x + dx,
          y: cell.y + dy,
          z: cell.z + dz,
        },
      )
    ) {
      wrote += 1;
    }
  }
  if (!wrote) return null;
  const moved: VoxelSelectionSet = [];
  for (const box of asSelectionSet(sel)) {
    const next = clampSelectionToGrid(model, {
      x0: box.x0 + dx,
      y0: box.y0 + dy,
      z0: box.z0 + dz,
      x1: box.x1 + dx,
      y1: box.y1 + dy,
      z1: box.z1 + dz,
    });
    if (next) moved.push(next);
  }
  return {
    model: { ...model, voxels, emissive, shine, transparency, transmittance },
    selection: moved.length ? moved : sel,
  };
}
