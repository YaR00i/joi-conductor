import { describe, expect, it } from "vitest";
import type { EmberVoxelModel } from "../content/types";
import { getVoxel, getVoxelTransmittance, setVoxelTransmittance, voxelGridSize } from "./voxelModel";
import {
  cellFromShapePlaneHit,
  cellOnShapePlane,
  cellWithShapeHeight,
  cellsForVoxelShape,
  dominantVoxelAxis,
  duplicateVoxelSelection,
  intersectAxisAlignedPlane,
  intersectHeightAlongAxis,
  rotateVoxelSelection,
  shapeFootprintCenter,
  stampVoxelShape,
  translateVoxelSelection,
  usesShapeHeightPhase,
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

  it("locks box/sphere drags to a plane then lifts height", () => {
    expect(usesShapeHeightPhase("box")).toBe(true);
    expect(usesShapeHeightPhase("sphere")).toBe(true);
    expect(usesShapeHeightPhase("line")).toBe(false);
    expect(
      cellOnShapePlane({ x: 1, y: 4, z: 2 }, { x: 5, y: 9, z: 7 }, "y"),
    ).toEqual({ x: 5, y: 4, z: 7 });
    expect(cellWithShapeHeight({ x: 5, y: 4, z: 7 }, 11, "y")).toEqual({
      x: 5,
      y: 11,
      z: 7,
    });
    const hit = intersectAxisAlignedPlane(
      { x: 0.5, y: 10, z: 0.5 },
      { x: 0, y: -1, z: 0 },
      "y",
      4.5,
    );
    expect(hit).not.toBeNull();
    expect(
      cellFromShapePlaneHit(
        hit!,
        { x: 0, y: 4, z: 0 },
        "y",
        { sx: 16, sy: 16, sz: 16 },
      ),
    ).toEqual({ x: 0, y: 4, z: 0 });
    expect(
      cellOnShapePlane({ x: 1, y: 4, z: 2 }, { x: 5, y: 9, z: 7 }, "x"),
    ).toEqual({ x: 1, y: 9, z: 7 });
    expect(cellWithShapeHeight({ x: 1, y: 9, z: 7 }, 6, "x")).toEqual({
      x: 6,
      y: 9,
      z: 7,
    });
    expect(dominantVoxelAxis({ x: 0.97, y: 0.1, z: -0.2 })).toBe("x");
    expect(dominantVoxelAxis({ x: 0, y: -1, z: 0 })).toBe("y");
    expect(shapeFootprintCenter({ x: 2, y: 4, z: 1 }, { x: 2, y: 7, z: 5 }, "x")).toEqual({
      x: 2.5,
      y: 6,
      z: 3.5,
    });
    const sideHit = intersectAxisAlignedPlane(
      { x: 10, y: 4.5, z: 0.5 },
      { x: -1, y: 0, z: 0 },
      "x",
      2.5,
    );
    expect(sideHit).not.toBeNull();
    expect(
      cellFromShapePlaneHit(
        sideHit!,
        { x: 2, y: 4, z: 0 },
        "x",
        { sx: 16, sy: 16, sz: 16 },
      ),
    ).toEqual({ x: 2, y: 4, z: 0 });
    const height = intersectHeightAlongAxis(
      { x: 0, y: 8, z: 20 },
      { x: 0.2, y: 0, z: -0.8 },
      { x: 4, y: 0.5, z: 4 },
      "y",
      { x: 4, y: 0.5, z: 20 },
      { x: 1, y: 0, z: 0 },
    );
    expect(height).toBe(8);
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

  it("keeps transmittance when rotating a selection", () => {
    let model = emptyGrid();
    model = stampVoxelShape(
      model,
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
      "box",
      { paletteIndex: 1 },
    );
    model = setVoxelTransmittance(model, 1, 0, 1, 255);
    const rotated = rotateVoxelSelection(
      model,
      [{ x0: 1, y0: 0, z0: 1, x1: 1, y1: 0, z1: 1 }],
      "y",
    );
    expect(rotated).not.toBeNull();
    expect(getVoxelTransmittance(rotated!.model, 1, 0, 1)).toBe(255);
  });
});

describe("voxel selection translate", () => {
  it("moves solids and leaves the source empty", () => {
    let model = emptyGrid();
    model = stampVoxelShape(
      model,
      { x: 1, y: 1, z: 1 },
      { x: 1, y: 1, z: 1 },
      "box",
      { paletteIndex: 1 },
    );
    const moved = translateVoxelSelection(
      model,
      [{ x0: 1, y0: 1, z0: 1, x1: 1, y1: 1, z1: 1 }],
      { x: 2, y: 0, z: -1 },
    );
    expect(moved).not.toBeNull();
    expect(getVoxel(moved!.model, 1, 1, 1)).toBe(0);
    expect(getVoxel(moved!.model, 3, 1, 0)).toBe(1);
    expect(moved!.selection).toEqual([
      { x0: 3, y0: 1, z0: 0, x1: 3, y1: 1, z1: 0 },
    ]);
  });

  it("slides a run without eating itself", () => {
    let model = emptyGrid();
    model = stampVoxelShape(
      model,
      { x: 1, y: 0, z: 1 },
      { x: 3, y: 0, z: 1 },
      "line",
      { paletteIndex: 1 },
    );
    const moved = translateVoxelSelection(
      model,
      [{ x0: 1, y0: 0, z0: 1, x1: 3, y1: 0, z1: 1 }],
      { x: 1, y: 0, z: 0 },
    );
    expect(moved).not.toBeNull();
    expect(getVoxel(moved!.model, 1, 0, 1)).toBe(0);
    expect(getVoxel(moved!.model, 2, 0, 1)).toBe(1);
    expect(getVoxel(moved!.model, 3, 0, 1)).toBe(1);
    expect(getVoxel(moved!.model, 4, 0, 1)).toBe(1);
  });

  it("keeps transmittance and overwrites destination", () => {
    let model = emptyGrid();
    model = stampVoxelShape(
      model,
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
      "box",
      { paletteIndex: 1 },
    );
    model = stampVoxelShape(
      model,
      { x: 2, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
      "box",
      { paletteIndex: 2 },
    );
    model = setVoxelTransmittance(model, 1, 0, 1, 180);
    const moved = translateVoxelSelection(
      model,
      [{ x0: 1, y0: 0, z0: 1, x1: 1, y1: 0, z1: 1 }],
      { x: 1, y: 0, z: 0 },
    );
    expect(moved).not.toBeNull();
    expect(getVoxel(moved!.model, 1, 0, 1)).toBe(0);
    expect(getVoxel(moved!.model, 2, 0, 1)).toBe(1);
    expect(getVoxelTransmittance(moved!.model, 2, 0, 1)).toBe(180);
  });

  it("returns null when every cell leaves the grid", () => {
    let model = emptyGrid();
    model = stampVoxelShape(
      model,
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      "box",
      { paletteIndex: 1 },
    );
    expect(
      translateVoxelSelection(
        model,
        [{ x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 }],
        { x: -4, y: 0, z: 0 },
      ),
    ).toBeNull();
  });
});
