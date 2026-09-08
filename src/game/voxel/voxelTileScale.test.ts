import { describe, expect, it } from "vitest";
import {
  createEmptyVoxelModel,
  normalizeVoxelModel,
  voxelGridSize,
} from "./voxelModel";
import { voxelWorldForBlock } from "./voxelMesher";
import { joinEmberVoxelPrefab, splitEmberVoxelPrefab } from "./emberVoxCodec";

function spanOneBlock(density: 16 | 32) {
  const model = createEmptyVoxelModel(
    `density_${density}`,
    { x: 1, y: 1, z: 1 },
    `Density ${density}`,
    density,
    density,
  );
  model.palette[1] = "#ffffff";
  model.voxels[0] = 1;
  model.voxels[density - 1] = 1;
  return model;
}

describe("voxel tile scale", () => {
  it("keeps omitted metadata as legacy 16 and new art as explicit 32", () => {
    const legacy = normalizeVoxelModel({
      ...spanOneBlock(16),
      voxelsPerBlock: undefined,
    });
    const dense = normalizeVoxelModel(spanOneBlock(32));
    expect(legacy.voxelsPerBlock).toBeUndefined();
    expect(voxelGridSize(legacy)).toEqual({ sx: 16, sy: 16, sz: 16 });
    expect(dense.voxelsPerBlock).toBe(32);
    expect(voxelGridSize(dense)).toEqual({ sx: 32, sy: 32, sz: 32 });
  });

  it("meshes both densities into the same one-block footprint", () => {
    for (const density of [16, 32] as const) {
      const model = spanOneBlock(density);
      const voxelWorld = voxelWorldForBlock(model, 1);
      expect(voxelGridSize(model).sx * voxelWorld).toBeCloseTo(1, 8);
      expect(voxelWorld).toBeCloseTo(1 / density, 8);
    }
  });

  it("preserves density through the canonical json + vox pair", () => {
    const source = spanOneBlock(32);
    const { asset, vox } = splitEmberVoxelPrefab(source);
    expect(asset.model.voxelsPerBlock).toBe(32);
    const restored = joinEmberVoxelPrefab(asset, vox);
    expect(restored.voxelsPerBlock).toBe(32);
    expect(restored.sizeBlocks).toEqual({ x: 1, y: 1, z: 1 });
    expect(voxelGridSize(restored)).toEqual({ sx: 32, sy: 32, sz: 32 });
  });
});
