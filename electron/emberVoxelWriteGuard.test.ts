import { describe, expect, it } from "vitest";
import {
  shouldRefreshJsonBak,
  voxelLibraryWriteGuard,
} from "./emberVoxelWriteGuard.mjs";

function fileWithModels(count: number): string {
  return JSON.stringify({
    models: Array.from({ length: count }, (_, i) => ({ id: `m${i}` })),
  });
}

describe("voxel library write guard", () => {
  it("allows ordinary map JSON", () => {
    expect(
      voxelLibraryWriteGuard("maps/hu_tao_yard.json", '{"id":"x"}', '{"id":"y"}'),
    ).toEqual({ ok: true });
  });

  it("refuses emptying a large voxel shard", () => {
    const guard = voxelLibraryWriteGuard(
      "voxels/registry.json",
      fileWithModels(0),
      fileWithModels(12),
    );
    expect(guard.ok).toBe(false);
  });

  it("refuses shrinking a large shard by half or more", () => {
    const guard = voxelLibraryWriteGuard(
      "voxels/village.json",
      fileWithModels(3),
      fileWithModels(10),
    );
    expect(guard.ok).toBe(false);
  });

  it("allows deleting one model from a large shard", () => {
    expect(
      voxelLibraryWriteGuard(
        "voxels/registry.json",
        fileWithModels(9),
        fileWithModels(10),
      ).ok,
    ).toBe(true);
  });

  it("does not copy an empty voxel file over bak", () => {
    expect(
      shouldRefreshJsonBak("voxels/registry.json", fileWithModels(0), fileWithModels(20)),
    ).toBe(false);
    expect(
      shouldRefreshJsonBak("voxels/registry.json", fileWithModels(18), fileWithModels(20)),
    ).toBe(true);
    expect(shouldRefreshJsonBak("maps/a.json", "{", null)).toBe(true);
  });

  it("refuses wiping a single prefab file", () => {
    const prev = JSON.stringify({
      id: "lamp",
      model: { id: "lamp", voxels: [1] },
    });
    const next = JSON.stringify({ id: "lamp" });
    expect(
      voxelLibraryWriteGuard("voxels/models/lamp.json", next, prev).ok,
    ).toBe(false);
    expect(
      voxelLibraryWriteGuard("voxels/models/lamp.json", prev, prev).ok,
    ).toBe(true);
  });

  it("allows writing a json+vox prefab with empty occupancy", () => {
    const prev = JSON.stringify({
      id: "lamp",
      model: { id: "lamp", voxels: [1] },
    });
    const next = JSON.stringify({
      id: "lamp",
      mesh: { kind: "vox", file: "voxels/models/lamp.vox" },
      model: { id: "lamp", voxels: [] },
    });
    expect(
      voxelLibraryWriteGuard("voxels/models/lamp.json", next, prev).ok,
    ).toBe(true);
  });
});
