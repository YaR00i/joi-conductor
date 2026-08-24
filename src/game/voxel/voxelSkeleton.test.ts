import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { EmberVoxelScene } from "../content/types";
import { createChibi32Character } from "./voxelCharacter";
import {
  attachSkeletonHierarchy,
  computeSkeletonPoses,
  jointHingeWorld,
  translateSceneBone,
} from "./voxelSkeleton";

function chainScene(): EmberVoxelScene {
  return {
    id: "vscn_skel",
    objects: [
      {
        id: "a",
        modelId: "ma",
        offset: { x: 0, y: 0, z: 0 },
      },
      {
        id: "b",
        modelId: "mb",
        offset: { x: 0, y: 10, z: 0 },
      },
      {
        id: "c",
        modelId: "mc",
        offset: { x: 0, y: 20, z: 0 },
      },
    ],
    joints: [
      {
        id: "j_ab",
        parentObjectId: "a",
        childObjectId: "b",
        parentPivot: { x: 0, y: 10, z: 0 },
        childPivot: { x: 0, y: 0, z: 0 },
        axis: "x",
      },
      {
        id: "j_bc",
        parentObjectId: "b",
        childObjectId: "c",
        parentPivot: { x: 0, y: 10, z: 0 },
        childPivot: { x: 0, y: 0, z: 0 },
        axis: "x",
      },
    ],
  };
}

describe("voxel skeleton FK", () => {
  it("keeps rest-pose mesh origins on object offsets", () => {
    const scene = chainScene();
    const poses = computeSkeletonPoses(scene, () => 0, 1);
    expect(poses.get("a")?.origin).toEqual({ x: 0, y: 0, z: 0 });
    expect(poses.get("b")?.origin).toEqual({ x: 0, y: 10, z: 0 });
    expect(poses.get("c")?.origin).toEqual({ x: 0, y: 20, z: 0 });
  });

  it("swings a grandchild when the parent joint rotates", () => {
    const scene = chainScene();
    const rest = computeSkeletonPoses(scene, () => 0, 1);
    const posed = computeSkeletonPoses(
      scene,
      (id) => (id === "j_ab" ? 90 : 0),
      1,
    );
    const grandchild = posed.get("c")!;
    expect(grandchild.origin.x).toBeCloseTo(0, 5);
    expect(grandchild.origin.y).toBeCloseTo(10, 5);
    expect(grandchild.origin.z).toBeCloseTo(10, 5);
    expect(grandchild.origin.z).not.toBeCloseTo(rest.get("c")!.origin.z, 5);
    const hinge = jointHingeWorld(scene.joints![1]!, posed, 1);
    expect(hinge?.y).toBeCloseTo(10, 5);
    expect(hinge?.z).toBeCloseTo(10, 5);
  });

  it("parents Three.js nodes so playhead rotation concatenates", () => {
    const scene = chainScene();
    const content = new THREE.Group();
    const nodes = new Map<string, THREE.Group>();
    for (const obj of scene.objects) {
      const node = new THREE.Group();
      node.name = obj.id;
      nodes.set(obj.id, node);
    }
    const bones = attachSkeletonHierarchy(
      content,
      nodes,
      scene,
      (id) => (id === "j_ab" ? 90 : 0),
      1,
    );
    expect(bones.size).toBe(2);
    content.updateMatrixWorld(true);
    const world = new THREE.Vector3();
    nodes.get("c")!.getWorldPosition(world);
    expect(world.x).toBeCloseTo(0, 5);
    expect(world.y).toBeCloseTo(10, 5);
    expect(world.z).toBeCloseTo(10, 5);
  });

  it("applies persisted root yaw in computed poses and Three hierarchy", () => {
    const scene: EmberVoxelScene = {
      id: "rotated",
      objects: [
        { id: "root", modelId: "m", offset: { x: 2, y: 0, z: 3 }, rot: 1 },
      ],
    };
    const pose = computeSkeletonPoses(scene, () => 0).get("root")!;
    const posedAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(
      pose.quaternion,
    );
    expect(posedAxis.x).toBeCloseTo(0, 5);
    expect(posedAxis.z).toBeCloseTo(-1, 5);

    const content = new THREE.Group();
    const node = new THREE.Group();
    attachSkeletonHierarchy(
      content,
      new Map([["root", node]]),
      scene,
      () => 0,
      1,
    );
    const hierarchyAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(
      node.quaternion,
    );
    expect(hierarchyAxis.x).toBeCloseTo(0, 5);
    expect(hierarchyAxis.z).toBeCloseTo(-1, 5);
  });

  it("carries the chibi head and hair with the torso", () => {
    const { scene } = createChibi32Character("vox_chr_skel", "Скелет");
    const rest = computeSkeletonPoses(scene, () => 0, 1);
    const posed = computeSkeletonPoses(
      scene,
      (id) => (id === "jnt_torso" ? 90 : 0),
      1,
    );
    const headRest = rest.get("obj_head")!;
    const headPosed = posed.get("obj_head")!;
    const hairPosed = posed.get("obj_hair")!;
    expect(headPosed.origin.z).not.toBeCloseTo(headRest.origin.z, 3);
    expect(hairPosed.origin.z).not.toBeCloseTo(rest.get("obj_hair")!.origin.z, 3);
    expect(posed.get("obj_pelvis")!.origin).toEqual(rest.get("obj_pelvis")!.origin);
  });

  it("lowers a jointed child without moving the parent chain", () => {
    const { scene } = createChibi32Character("vox_chr_bone", "Кость");
    const rest = computeSkeletonPoses(scene, () => 0, 1);
    const next = translateSceneBone(scene, "obj_arm_l", { x: 0, y: -2, z: 0 });
    const posed = computeSkeletonPoses(next, () => 0, 1);
    expect(posed.get("obj_arm_l")!.origin.y).toBeCloseTo(
      rest.get("obj_arm_l")!.origin.y - 2,
      5,
    );
    expect(posed.get("obj_torso")!.origin).toEqual(rest.get("obj_torso")!.origin);
    expect(posed.get("obj_head")!.origin).toEqual(rest.get("obj_head")!.origin);
    expect(posed.get("obj_pelvis")!.origin).toEqual(
      rest.get("obj_pelvis")!.origin,
    );
    const armJoint = next.joints?.find((j) => j.childObjectId === "obj_arm_l");
    const restJoint = scene.joints?.find((j) => j.childObjectId === "obj_arm_l");
    expect(armJoint?.parentPivot.y).toBe((restJoint?.parentPivot.y ?? 0) - 2);
  });

  it("shifts descendant offsets with a parent bone and leaves nested pivots local", () => {
    const scene = chainScene();
    const next = translateSceneBone(scene, "b", { x: 0, y: -2, z: 0 });
    const posed = computeSkeletonPoses(next, () => 0, 1);
    expect(posed.get("b")!.origin).toEqual({ x: 0, y: 8, z: 0 });
    expect(posed.get("c")!.origin).toEqual({ x: 0, y: 18, z: 0 });
    expect(posed.get("a")!.origin).toEqual({ x: 0, y: 0, z: 0 });
    expect(next.objects.find((o) => o.id === "c")?.offset.y).toBe(18);
    expect(next.joints?.find((j) => j.id === "j_bc")?.parentPivot.y).toBe(10);
  });
});
