import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { EmberVoxelModel, EmberVoxelPlacement } from "../content/types";

vi.mock("./envMap", () => ({ getEmberEnvMap: () => null }));

import { createEditorVoxelInstanceBatch } from "./editorVoxelInstancing";
import { findPickRoot, findPropByPick } from "./selectionOutline";

const model: EmberVoxelModel = {
  id: "crate",
  nameRu: "Ящик",
  sizeBlocks: { x: 1, y: 1, z: 1 },
  palette: ["", "#886644"],
  voxels: [1],
};

function placement(id: string, x: number): EmberVoxelPlacement {
  return { id, modelId: model.id, x, y: 0, elev: 0 };
}

describe("editor voxel instancing", () => {
  it("keeps per-instance picks, bounds and editable transforms", () => {
    const a = placement("a", 0);
    const b = placement("b", 2);
    const batch = createEditorVoxelInstanceBatch(model, 16, [
      { placement: a, elev: 0 },
      { placement: b, elev: 0 },
    ]);

    expect(batch).not.toBeNull();
    const mesh = batch!.root.children[0] as THREE.InstancedMesh;
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(mesh.count).toBe(2);
    expect(findPickRoot(mesh, 1)).toEqual({ kind: "voxel", id: "b" });

    const matrixBefore = new THREE.Matrix4();
    mesh.getMatrixAt(1, matrixBefore);
    const before = new THREE.Vector3().setFromMatrixPosition(matrixBefore);
    expect(before.x).toBeCloseTo(31.95);

    const moved = { ...b, x: 3 };
    expect(
      batch!.sync([
        { placement: a, elev: 0 },
        { placement: moved, elev: 0 },
      ]),
    ).toBe(true);
    const matrixAfter = new THREE.Matrix4();
    mesh.getMatrixAt(1, matrixAfter);
    const after = new THREE.Vector3().setFromMatrixPosition(matrixAfter);
    expect(after.x - before.x).toBeCloseTo(16);

    const proxy = findPropByPick(batch!.root, { kind: "voxel", id: "b" });
    expect(proxy?.userData.editorWorldBounds).toBeInstanceOf(THREE.Box3);
    expect(
      (proxy!.userData.editorWorldBounds as THREE.Box3).getCenter(
        new THREE.Vector3(),
      ).x,
    ).toBeGreaterThan(48);
  });

  it("slightly overlaps adjacent full-block meshes so no raster seam opens", () => {
    const full: EmberVoxelModel = {
      ...model,
      id: "full-block",
      voxels: Array(16 * 16 * 16).fill(1),
    };
    const a: EmberVoxelPlacement = {
      id: "left",
      modelId: full.id,
      x: 0,
      y: 0,
      elev: 0,
    };
    const b: EmberVoxelPlacement = { ...a, id: "right", x: 1 };
    const batch = createEditorVoxelInstanceBatch(full, 16, [
      { placement: a, elev: 0 },
      { placement: b, elev: 0 },
    ]);
    const bounds = batch!.root.userData.editorInstanceBoundsById as Map<
      string,
      THREE.Box3
    >;

    expect(bounds.get("left")!.max.x - bounds.get("right")!.min.x).toBeCloseTo(
      0.1,
    );
  });
});
