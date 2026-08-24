import { describe, expect, it } from "vitest";
import type { EmberVoxelScene } from "../content/types";
import {
  canRotateVoxelSceneSelection,
  duplicateVoxelSceneSelection,
  removeVoxelSceneSelection,
  rotateVoxelSceneSelectionY,
  setVoxelSceneSelectionVisible,
  translateVoxelSceneSelection,
  voxelSceneSelectionMoveIds,
  voxelSceneSelectionPivot,
} from "./voxelSceneSelection";

function sceneFixture(): EmberVoxelScene {
  return {
    id: "scene",
    objects: [
      { id: "root", nameRu: "Корень", modelId: "a", offset: { x: 0, y: 0, z: 0 } },
      { id: "child", nameRu: "Дитя", modelId: "b", offset: { x: 0, y: 4, z: 0 } },
      { id: "loose", modelId: "c", offset: { x: 8, y: 0, z: 0 } },
    ],
    joints: [
      {
        id: "joint",
        parentObjectId: "root",
        childObjectId: "child",
        parentPivot: { x: 0, y: 4, z: 0 },
        childPivot: { x: 0, y: 0, z: 0 },
        axis: "x",
      },
    ],
    animations: [
      {
        id: "idle",
        durationSec: 1,
        tracks: [{ jointId: "joint", keys: [{ t: 0, angleDeg: 10 }] }],
      },
    ],
  };
}

describe("voxel scene multi-selection", () => {
  it("moves selected parents and descendants exactly once", () => {
    const next = translateVoxelSceneSelection(
      sceneFixture(),
      ["root", "child"],
      { x: 3, y: 0, z: -1 },
    );
    expect(next.objects.map((object) => object.offset)).toEqual([
      { x: 3, y: 0, z: -1 },
      { x: 3, y: 4, z: -1 },
      { x: 8, y: 0, z: 0 },
    ]);
  });

  it("resolves visual descendants and the selected-origin median pivot", () => {
    const scene = sceneFixture();
    expect(voxelSceneSelectionMoveIds(scene, ["root", "loose"])).toEqual([
      "root",
      "child",
      "loose",
    ]);
    expect(voxelSceneSelectionPivot(scene, ["root", "loose"])).toEqual({
      x: 4,
      y: 0,
      z: 0,
    });
  });

  it("duplicates internal joints and animation tracks", () => {
    let objectIndex = 0;
    let jointIndex = 0;
    const result = duplicateVoxelSceneSelection(
      sceneFixture(),
      ["root", "child"],
      {
        object: () => `copy-${++objectIndex}`,
        joint: () => `joint-copy-${++jointIndex}`,
      },
    );
    expect(result.objectIds).toEqual(["copy-1", "copy-2"]);
    expect(result.scene.joints?.[1]).toMatchObject({
      id: "joint-copy-1",
      parentObjectId: "copy-1",
      childObjectId: "copy-2",
    });
    expect(result.scene.animations?.[0]?.tracks).toEqual([
      { jointId: "joint", keys: [{ t: 0, angleDeg: 10 }] },
      { jointId: "joint-copy-1", keys: [{ t: 0, angleDeg: 10 }] },
    ]);
  });

  it("hides and removes a selection without deleting the final object", () => {
    const hidden = setVoxelSceneSelectionVisible(
      sceneFixture(),
      ["root", "loose"],
      false,
    );
    expect(hidden.objects.map((object) => object.visible)).toEqual([
      false,
      undefined,
      false,
    ]);
    const removed = removeVoxelSceneSelection(hidden, ["root", "child", "loose"]);
    expect(removed.objects).toHaveLength(1);
    expect(removed.joints).toEqual([]);
    expect(removed.animations?.[0]?.tracks).toEqual([]);
  });

  it("rotates loose objects around an integer median pivot", () => {
    const scene: EmberVoxelScene = {
      id: "loose",
      objects: [
        { id: "a", modelId: "a", offset: { x: 0, y: 2, z: 0 } },
        { id: "b", modelId: "b", offset: { x: 2, y: 2, z: 0 }, rot: 3 },
      ],
    };
    expect(canRotateVoxelSceneSelection(scene, ["a", "b"])).toBe(true);
    const next = rotateVoxelSceneSelectionY(scene, ["a", "b"], 1);
    expect(next.objects).toMatchObject([
      { id: "a", offset: { x: 1, y: 2, z: 1 }, rot: 1 },
      { id: "b", offset: { x: 1, y: 2, z: -1 }, rot: 0 },
    ]);
  });

  it("refuses to rotate a selection that participates in joints", () => {
    const scene = sceneFixture();
    expect(canRotateVoxelSceneSelection(scene, ["root"])).toBe(false);
    expect(rotateVoxelSceneSelectionY(scene, ["root"], 1)).toBe(scene);
    expect(canRotateVoxelSceneSelection(scene, ["loose"])).toBe(true);
  });
});
