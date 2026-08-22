import { describe, expect, it } from "vitest";
import type { EmberVoxelModel } from "../content/types";
import { getVoxel, voxelGridSize } from "./voxelModel";
import {
  cellsForVoxelShape,
  duplicateVoxelSelection,
  rotateVoxelSelection,
  stampVoxelShape,
} from "./voxelShapeBrush";

function emptyGrid(): EmberVoxelModel {
  const sx = 8;
  const sy = 8;
  const sz = 8;
  const n = sx * sy * sz;
  return {
    id: "shape_test",
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: sy,
    palette: ["", "#fff", "#f80"],
    voxels: new Array(n).fill(0),
  };
}

describe("voxel shape brushes", () => {
  it("traces a 3D line through every step", () => {
    const cells = cellsForVoxelShape(
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      "line",
    );
    expect(cells).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
    ]);
  });

  it("fills a box and an inscribed sphere", () => {
    expect(
      cellsForVoxelShape({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, "box"),
    ).toHaveLength(8);
    const sphere = cellsForVoxelShape(
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 4, z: 4 },
      "sphere",
    );
    expect(sphere.length).toBeGreaterThan(8);
    expect(sphere.length).toBeLessThan(5 * 5 * 5);
  });

  it("stamps a line with palette and can erase it", () => {
    const src = emptyGrid();
    const painted = stampVoxelShape(
      src,
      { x: 1, y: 2, z: 1 },
      { x: 4, y: 2, z: 1 },
      "line",
      { paletteIndex: 2 },
    );
    expect(getVoxel(painted, 1, 2, 1)).toBe(2);
    expect(getVoxel(painted, 4, 2, 1)).toBe(2);
    const erased = stampVoxelShape(
      painted,
      { x: 1, y: 2, z: 1 },
      { x: 4, y: 2, z: 1 },
      "line",
      { paletteIndex: 1, erase: true },
    );
    expect(getVoxel(erased, 2, 2, 1)).toBe(0);
  });
});

describe("voxel selection rotate / duplicate", () => {
  it("rotates a 2×1 stick 90° around Y", () => {
    let model = emptyGrid();
    model = stampVoxelShape(
      model,
      { x: 1, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
      "line",
      { paletteIndex: 1 },
    );
    const rotated = rotateVoxelSelection(
      model,
      [{ x0: 1, y0: 0, z0: 1, x1: 2, y1: 0, z1: 1 }],
      "y",
    );
    expect(rotated).not.toBeNull();
    expect(getVoxel(rotated!.model, 1, 0, 1)).toBeGreaterThan(0);
    expect(getVoxel(rotated!.model, 1, 0, 2)).toBeGreaterThan(0);
    expect(getVoxel(rotated!.model, 2, 0, 1)).toBe(0);
  });

  it("duplicates a cell in +X and keeps the original", () => {
    let model = emptyGrid();
    model = stampVoxelShape(
      model,
      { x: 1, y: 1, z: 1 },
      { x: 1, y: 1, z: 1 },
      "box",
      { paletteIndex: 1 },
    );
    const copied = duplicateVoxelSelection(
      model,
      [{ x0: 1, y0: 1, z0: 1, x1: 1, y1: 1, z1: 1 }],
      { x: 2, y: 0, z: 0 },
    );
    expect(copied).not.toBeNull();
    expect(getVoxel(copied!.model, 1, 1, 1)).toBe(1);
    expect(getVoxel(copied!.model, 3, 1, 1)).toBe(1);
    expect(voxelGridSize(copied!.model)).toEqual(voxelGridSize(model));
  });
});
