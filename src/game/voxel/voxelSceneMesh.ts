/**
 * Assemble an EmberVoxelScene into a Three.js group with joint poses.
 * Shared by map preview and EmberThreeWorld chest playback.
 */
import * as THREE from "three";
import type {
  EmberVoxelAnimClip,
  EmberVoxelModel,
  EmberVoxelScene,
  EmberVoxelSceneJoint,
  EmberVoxelSceneObject,
} from "../content/types";
import { VOXELS_PER_BLOCK } from "./constants";
import { sceneFootprintVoxels } from "./voxelModelApply";
import {
  findChildJoint,
  sampleJointAngleDeg,
} from "./voxelScene";
import {
  buildVoxelModelMesh,
  disposeVoxelModelMesh,
} from "./voxelMesher";

export type BuildVoxelSceneOpts = {
  tileSize: number;
  directLightScale?: number;
  /** Normalized clip time 0..1. */
  playhead?: number;
  clipId?: string | null;
};

type JointedPart = {
  wrapper: THREE.Group;
  inner: THREE.Group;
  joint: EmberVoxelSceneJoint;
  parent: EmberVoxelSceneObject;
  child: EmberVoxelSceneObject;
};

export type VoxelSceneMesh = {
  root: THREE.Group;
  /** Update joint angles from clip (or 0 if no clip). */
  setPlayhead: (t: number, clipId?: string | null) => void;
  dispose: () => void;
};

function applyJointPose(
  part: JointedPart,
  vw: number,
  angleDeg: number,
): void {
  const { wrapper, inner, joint, parent } = part;
  const hinge = {
    x: (parent.offset.x + joint.parentPivot.x) * vw,
    y: (parent.offset.y + joint.parentPivot.y) * vw,
    z: (parent.offset.z + joint.parentPivot.z) * vw,
  };
  inner.position.set(
    -joint.childPivot.x * vw,
    -joint.childPivot.y * vw,
    -joint.childPivot.z * vw,
  );
  wrapper.position.set(hinge.x, hinge.y, hinge.z);
  const rad = THREE.MathUtils.degToRad(angleDeg);
  if (joint.axis === "x") wrapper.rotation.set(rad, 0, 0);
  else if (joint.axis === "y") wrapper.rotation.set(0, rad, 0);
  else wrapper.rotation.set(0, 0, rad);
}

/**
 * Build a centered scene group (XZ footprint center at origin, Y floor at 0).
 */
export function buildVoxelSceneMesh(
  scene: EmberVoxelScene,
  models: Record<string, EmberVoxelModel>,
  opts: BuildVoxelSceneOpts,
): VoxelSceneMesh | null {
  const tileSize = opts.tileSize;
  const vw = tileSize / VOXELS_PER_BLOCK;
  const playhead = opts.playhead ?? 0;
  const clip: EmberVoxelAnimClip | undefined = opts.clipId
    ? scene.animations?.find((c) => c.id === opts.clipId)
    : scene.animations?.[0];

  const foot = sceneFootprintVoxels(scene, models);
  if (!foot) return null;
  const cx = ((foot.minX + foot.maxX) / 2) * vw;
  const cz = ((foot.minZ + foot.maxZ) / 2) * vw;

  const root = new THREE.Group();
  root.name = `voxel-scene:${scene.id}`;
  const content = new THREE.Group();
  content.name = "voxel-scene-content";
  content.position.set(-cx, 0, -cz);
  root.add(content);

  const jointed: JointedPart[] = [];

  for (const obj of scene.objects) {
    if (obj.visible === false) continue;
    const model = models[obj.modelId];
    if (!model) continue;
    const built = buildVoxelModelMesh(model, tileSize, {
      directLightScale: opts.directLightScale,
      suppressCastShadow: model.emissiveSuppressHostShadow === true,
    });
    const wrapper = new THREE.Group();
    wrapper.name = `scene-obj-${obj.id}`;
    const inner = new THREE.Group();
    while (built.group.children.length) {
      inner.add(built.group.children[0]!);
    }

    const joint = findChildJoint(scene, obj.id);
    const parent = joint
      ? scene.objects.find((o) => o.id === joint.parentObjectId)
      : undefined;

    if (joint && parent) {
      const part: JointedPart = {
        wrapper,
        inner,
        joint,
        parent,
        child: obj,
      };
      jointed.push(part);
      wrapper.add(inner);
      content.add(wrapper);
      const angle = clip
        ? sampleJointAngleDeg(clip, joint.id, playhead)
        : 0;
      applyJointPose(part, vw, angle);
    } else {
      wrapper.add(inner);
      wrapper.position.set(
        obj.offset.x * vw,
        obj.offset.y * vw,
        obj.offset.z * vw,
      );
      content.add(wrapper);
    }
  }

  if (content.children.length === 0) {
    return null;
  }

  const setPlayhead = (t: number, clipId?: string | null) => {
    const c =
      (clipId
        ? scene.animations?.find((a) => a.id === clipId)
        : clip) ?? clip;
    for (const part of jointed) {
      const angle = c ? sampleJointAngleDeg(c, part.joint.id, t) : 0;
      applyJointPose(part, vw, angle);
    }
  };

  return {
    root,
    setPlayhead,
    dispose: () => {
      root.removeFromParent();
      disposeVoxelModelMesh(root);
    },
  };
}
