import { describe, expect, it } from "vitest";
import {
  createEmptyVoxelModel,
  getVoxel,
  getVoxelEmissive,
  setVoxel,
  setVoxelEmissive,
} from "./voxelModel";
import {
  countVoxelPaletteUsage,
  replaceVoxelPaletteIndex,
} from "./voxelPaletteOps";

function sampleModel() {
  let model = createEmptyVoxelModel("pal_test", { x: 1, y: 1, z: 1 }, "t", 8);
  model = setVoxel(model, 1, 1, 1, 1);
  model = setVoxel(model, 2, 1, 1, 1);
  model = setVoxel(model, 4, 1, 1, 2);
  model = setVoxelEmissive(model, 1, 1, 1, 80);
  return model;
}

describe("replaceVoxelPaletteIndex", () => {
  it("remaps every cell of a palette slot and keeps extra channels", () => {
    const src = sampleModel();
    const next = replaceVoxelPaletteIndex(src, 1, 2);
    expect(getVoxel(next, 1, 1, 1)).toBe(2);
    expect(getVoxel(next, 2, 1, 1)).toBe(2);
    expect(getVoxel(next, 4, 1, 1)).toBe(2);
    expect(getVoxelEmissive(next, 1, 1, 1)).toBe(80);
    expect(countVoxelPaletteUsage(next)[1]).toBe(0);
    expect(countVoxelPaletteUsage(next)[2]).toBe(3);
  });

  it("restricts remap to a selection box", () => {
    const src = sampleModel();
    const next = replaceVoxelPaletteIndex(src, 1, 2, [
      { x0: 1, y0: 1, z0: 1, x1: 1, y1: 1, z1: 1 },
    ]);
    expect(getVoxel(next, 1, 1, 1)).toBe(2);
    expect(getVoxel(next, 2, 1, 1)).toBe(1);
    expect(getVoxel(next, 4, 1, 1)).toBe(2);
  });

  it("erases a color when the target slot is 0", () => {
    const src = sampleModel();
    const next = replaceVoxelPaletteIndex(src, 1, 0);
    expect(getVoxel(next, 1, 1, 1)).toBe(0);
    expect(getVoxel(next, 2, 1, 1)).toBe(0);
    expect(getVoxelEmissive(next, 1, 1, 1)).toBe(0);
    expect(getVoxel(next, 4, 1, 1)).toBe(2);
  });
});
