import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { EmberVoxelModel } from "../content/types";
import { applyVoxelPlacementTransform } from "./voxelPlacement";

const model: EmberVoxelModel = {
  id: "cube",
  sizeBlocks: { x: 1, y: 1, z: 1 },
  palette: ["", "#fff"],
  voxels: [1],
};

describe("applyVoxelPlacementTransform", () => {
  it("maps Ember X/Y-ground + Z-up scale onto Three X/Z + Y-up", () => {
    const group = new THREE.Group();
    group.add(new THREE.Object3D());
    applyVoxelPlacementTransform(
      group,
      {
        x: 2,
        y: 3,
        elev: 1,
        rot: 1,
        scale: { x: 2, y: 0.5, z: 1.5 },
      },
      model,
      16,
      1,
    );
    expect(group.scale.toArray()).toEqual([2, 1.5, 0.5]);
    expect(group.rotation.y).toBeCloseTo(Math.PI / 2);

    applyVoxelPlacementTransform(
      group,
      { x: 2, y: 3, elev: 1, rot: 0 },
      model,
      16,
      1,
    );
    expect(group.scale.toArray()).toEqual([1, 1, 1]);
  });
});
