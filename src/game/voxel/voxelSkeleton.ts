/**
 * Hierarchical FK for voxel scene joints.
 * Parent rotation concatenates to children (torso → head → hair).
 */
import * as THREE from "three";
import type {
  EmberVoxelAnimClip,
  EmberVoxelJointAxis,
  EmberVoxelScene,
  EmberVoxelSceneJoint,
  EmberVoxelSceneObject,
} from "../content/types";
import { normalizeVoxelOffset, sampleJointAngleDeg } from "./voxelScene";

export type JointAngleFn = (jointId: string) => number;

export type Vec3 = { x: number; y: number; z: number };

export type SkeletonNodePose = {
  /** World position of the object's mesh origin. */
  origin: Vec3;
  /** World position of the incoming hinge (mesh origin if the object is a root). */
  hinge: Vec3;
  /** World rotation of the hinged wrapper (identity for roots). */
  quaternion: THREE.Quaternion;
  /** Local inner offset: -childPivot, or 0 for roots. */
  inner: Vec3;
};

const IDENTITY = new THREE.Quaternion();

/** First joint that treats `objectId` as the hinged child. */
export function childJointMap(
  scene: EmberVoxelScene,
): Map<string, EmberVoxelSceneJoint> {
  const map = new Map<string, EmberVoxelSceneJoint>();
  for (const joint of scene.joints ?? []) {
    if (!map.has(joint.childObjectId)) map.set(joint.childObjectId, joint);
  }
  return map;
}

export function jointRotationQuaternion(
  axis: EmberVoxelJointAxis,
  angleDeg: number,
): THREE.Quaternion {
  const rad = THREE.MathUtils.degToRad(angleDeg);
  switch (axis) {
    case "x":
      return new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        rad,
      );
    case "y":
      return new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        rad,
      );
    case "z":
      return new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        rad,
      );
    default: {
      const _n: never = axis;
      return _n;
    }
  }
}

export function applyBoneRotation(
  bone: THREE.Object3D,
  axis: EmberVoxelJointAxis,
  angleDeg: number,
): void {
  const rad = THREE.MathUtils.degToRad(angleDeg);
  switch (axis) {
    case "x":
      bone.rotation.set(rad, 0, 0);
      break;
    case "y":
      bone.rotation.set(0, rad, 0);
      break;
    case "z":
      bone.rotation.set(0, 0, rad);
      break;
    default: {
      const _n: never = axis;
      void _n;
    }
  }
}

export function resolveJointAngleDeg(
  jointId: string,
  opts: {
    selectedJointId?: string | null;
    keyAngleDeg?: number;
    clip?: EmberVoxelAnimClip;
    playhead?: number;
  },
): number {
  if (opts.selectedJointId && jointId === opts.selectedJointId) {
    return opts.keyAngleDeg ?? 0;
  }
  return sampleJointAngleDeg(opts.clip, jointId, opts.playhead ?? 0);
}

function rootPose(obj: EmberVoxelSceneObject, unit: number): SkeletonNodePose {
  const origin = {
    x: obj.offset.x * unit,
    y: obj.offset.y * unit,
    z: obj.offset.z * unit,
  };
  return {
    origin,
    hinge: { ...origin },
    quaternion: IDENTITY.clone(),
    inner: { x: 0, y: 0, z: 0 },
  };
}

function missingPose(): SkeletonNodePose {
  return {
    origin: { x: 0, y: 0, z: 0 },
    hinge: { x: 0, y: 0, z: 0 },
    quaternion: IDENTITY.clone(),
    inner: { x: 0, y: 0, z: 0 },
  };
}

/**
 * World-space hinge/origin/rotation for every object, with parent poses composed.
 */
export function computeSkeletonPoses(
  scene: EmberVoxelScene,
  angleDeg: JointAngleFn,
  unit = 1,
): Map<string, SkeletonNodePose> {
  const cached = new Map<string, SkeletonNodePose>();
  const visiting = new Set<string>();
  const objects = new Map(scene.objects.map((o) => [o.id, o]));
  const joints = childJointMap(scene);
  const hingeLocal = new THREE.Vector3();
  const originWorld = new THREE.Vector3();

  const poseOf = (id: string): SkeletonNodePose => {
    const hit = cached.get(id);
    if (hit) return hit;
    const obj = objects.get(id);
    if (!obj) return missingPose();
    if (visiting.has(id)) {
      const fallback = rootPose(obj, unit);
      cached.set(id, fallback);
      return fallback;
    }
    visiting.add(id);
    const joint = joints.get(id);
    const parent = joint ? objects.get(joint.parentObjectId) : undefined;
    if (!joint || !parent) {
      const pose = rootPose(obj, unit);
      cached.set(id, pose);
      visiting.delete(id);
      return pose;
    }
    const parentPose = poseOf(joint.parentObjectId);
    hingeLocal.set(
      joint.parentPivot.x * unit,
      joint.parentPivot.y * unit,
      joint.parentPivot.z * unit,
    );
    hingeLocal.applyQuaternion(parentPose.quaternion);
    const hinge = {
      x: hingeLocal.x + parentPose.origin.x,
      y: hingeLocal.y + parentPose.origin.y,
      z: hingeLocal.z + parentPose.origin.z,
    };
    const quaternion = parentPose.quaternion
      .clone()
      .multiply(jointRotationQuaternion(joint.axis, angleDeg(joint.id)));
    const inner = {
      x: -joint.childPivot.x * unit,
      y: -joint.childPivot.y * unit,
      z: -joint.childPivot.z * unit,
    };
    originWorld.set(inner.x, inner.y, inner.z).applyQuaternion(quaternion);
    const pose: SkeletonNodePose = {
      origin: {
        x: originWorld.x + hinge.x,
        y: originWorld.y + hinge.y,
        z: originWorld.z + hinge.z,
      },
      hinge,
      quaternion,
      inner,
    };
    cached.set(id, pose);
    visiting.delete(id);
    return pose;
  };

  for (const obj of scene.objects) poseOf(obj.id);
  return cached;
}

/** Posed world location of a joint hinge (parent origin + rotated parentPivot). */
export function jointHingeWorld(
  joint: EmberVoxelSceneJoint,
  poses: Map<string, SkeletonNodePose>,
  unit = 1,
): Vec3 | null {
  const child = poses.get(joint.childObjectId);
  if (child) return { ...child.hinge };
  const parent = poses.get(joint.parentObjectId);
  if (!parent) return null;
  const local = new THREE.Vector3(
    joint.parentPivot.x * unit,
    joint.parentPivot.y * unit,
    joint.parentPivot.z * unit,
  )
    .applyQuaternion(parent.quaternion)
    .add(
      new THREE.Vector3(parent.origin.x, parent.origin.y, parent.origin.z),
    );
  return { x: local.x, y: local.y, z: local.z };
}

export function applySkeletonNodePose(
  wrapper: THREE.Object3D,
  inner: THREE.Object3D | undefined,
  pose: SkeletonNodePose,
  originFrame: Vec3 = { x: 0, y: 0, z: 0 },
): void {
  wrapper.position.set(
    pose.hinge.x - originFrame.x,
    pose.hinge.y - originFrame.y,
    pose.hinge.z - originFrame.z,
  );
  wrapper.quaternion.copy(pose.quaternion);
  if (inner) {
    inner.position.set(pose.inner.x, pose.inner.y, pose.inner.z);
  }
}

/**
 * Parent mesh-origin groups under rotating bones so FK concatenates in the scene graph.
 * Returns bone groups keyed by joint id (for playhead updates).
 */
export function attachSkeletonHierarchy(
  content: THREE.Object3D,
  nodes: Map<string, THREE.Group>,
  scene: EmberVoxelScene,
  angleDeg: JointAngleFn,
  unit: number,
): Map<string, THREE.Group> {
  const bones = new Map<string, THREE.Group>();
  const objects = new Map(scene.objects.map((o) => [o.id, o]));
  const childOf = childJointMap(scene);

  for (const node of nodes.values()) {
    node.removeFromParent();
    node.position.set(0, 0, 0);
    node.quaternion.identity();
  }

  const attached = new Set<string>();

  const attachRoot = (id: string) => {
    const node = nodes.get(id);
    const obj = objects.get(id);
    if (!node || !obj || attached.has(id)) return;
    node.position.set(
      obj.offset.x * unit,
      obj.offset.y * unit,
      obj.offset.z * unit,
    );
    node.quaternion.identity();
    content.add(node);
    attached.add(id);
  };

  for (const obj of scene.objects) {
    if (!nodes.has(obj.id)) continue;
    const joint = childOf.get(obj.id);
    if (
      !joint ||
      !nodes.has(joint.parentObjectId) ||
      !objects.has(joint.parentObjectId)
    ) {
      attachRoot(obj.id);
    }
  }

  let grew = true;
  let guard = 0;
  const jointList = scene.joints ?? [];
  while (grew && guard++ <= scene.objects.length + jointList.length + 2) {
    grew = false;
    for (const joint of jointList) {
      if (attached.has(joint.childObjectId)) continue;
      if (!attached.has(joint.parentObjectId)) continue;
      const parentNode = nodes.get(joint.parentObjectId);
      const childNode = nodes.get(joint.childObjectId);
      if (!parentNode || !childNode) continue;
      const bone = new THREE.Group();
      bone.name = `bone-${joint.id}`;
      bone.position.set(
        joint.parentPivot.x * unit,
        joint.parentPivot.y * unit,
        joint.parentPivot.z * unit,
      );
      applyBoneRotation(bone, joint.axis, angleDeg(joint.id));
      childNode.position.set(
        -joint.childPivot.x * unit,
        -joint.childPivot.y * unit,
        -joint.childPivot.z * unit,
      );
      childNode.quaternion.identity();
      parentNode.add(bone);
      bone.add(childNode);
      bones.set(joint.id, bone);
      attached.add(joint.childObjectId);
      grew = true;
    }
  }

  for (const obj of scene.objects) {
    if (nodes.has(obj.id) && !attached.has(obj.id)) attachRoot(obj.id);
  }

  return bones;
}

/** Direct + nested joint children of `ancestorId` (not including itself). */
export function descendantObjectIds(
  scene: EmberVoxelScene,
  ancestorId: string,
): string[] {
  const kids = new Map<string, string[]>();
  for (const joint of scene.joints ?? []) {
    const list = kids.get(joint.parentObjectId) ?? [];
    list.push(joint.childObjectId);
    kids.set(joint.parentObjectId, list);
  }
  const out: string[] = [];
  const stack = [...(kids.get(ancestorId) ?? [])];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id) || id === ancestorId) continue;
    seen.add(id);
    out.push(id);
    const nested = kids.get(id);
    if (nested) {
      for (const childId of nested) stack.push(childId);
    }
  }
  return out;
}

/**
 * Move a bind-pose bone: incoming parentPivot + this object and descendants' offsets.
 * A root (no incoming joint) only shifts offsets, so the whole character translates.
 */
export function translateSceneBone(
  scene: EmberVoxelScene,
  objectId: string,
  delta: Vec3,
): EmberVoxelScene {
  const d = normalizeVoxelOffset(delta);
  if (d.x === 0 && d.y === 0 && d.z === 0) return scene;
  if (!scene.objects.some((o) => o.id === objectId)) return scene;
  const moveIds = new Set([
    objectId,
    ...descendantObjectIds(scene, objectId),
  ]);
  const incoming = childJointMap(scene).get(objectId);
  const objects = scene.objects.map((o) => {
    if (!moveIds.has(o.id)) return o;
    return {
      ...o,
      offset: {
        x: o.offset.x + d.x,
        y: o.offset.y + d.y,
        z: o.offset.z + d.z,
      },
    };
  });
  const joints = incoming
    ? (scene.joints ?? []).map((j) =>
        j.id === incoming.id
          ? {
              ...j,
              parentPivot: {
                x: j.parentPivot.x + d.x,
                y: j.parentPivot.y + d.y,
                z: j.parentPivot.z + d.z,
              },
            }
          : j,
      )
    : scene.joints;
  return { ...scene, objects, joints };
}
