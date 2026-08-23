/**
 * Assemble an EmberVoxelScene into a Three.js group with joint poses.
 * Shared by map preview and EmberThreeWorld chest playback.
 */
import * as THREE from "three";
import type {
  EmberVoxelAnimClip,
  EmberVoxelModel,
  EmberVoxelScene,
} from "../content/types";
import { VOXELS_PER_BLOCK } from "./constants";
import { sceneFootprintVoxels } from "./voxelModelApply";
import { sampleJointAngleDeg } from "./voxelScene";
import {
  applyBoneRotation,
  attachSkeletonHierarchy,
} from "./voxelSkeleton";
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

export type VoxelSceneMesh = {
  root: THREE.Group;
  /** Update joint angles from clip (or 0 if no clip). */
  setPlayhead: (t: number, clipId?: string | null) => void;
  dispose: () => void;
};

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

  const nodes = new Map<string, THREE.Group>();
  let meshCount = 0;

  for (const obj of scene.objects) {
    const wrapper = new THREE.Group();
    wrapper.name = `scene-obj-${obj.id}`;
    if (obj.visible !== false) {
      const model = models[obj.modelId];
      if (model) {
        const built = buildVoxelModelMesh(model, tileSize, {
          directLightScale: opts.directLightScale,
          suppressCastShadow: model.emissiveSuppressHostShadow === true,
        });
        const inner = new THREE.Group();
        while (built.group.children.length) {
          inner.add(built.group.children[0]!);
        }
        wrapper.add(inner);
        meshCount += 1;
      }
    }
    nodes.set(obj.id, wrapper);
  }

  if (meshCount === 0) {
    return null;
  }

  const angleAt = (jointId: string) =>
    clip ? sampleJointAngleDeg(clip, jointId, playhead) : 0;
  const bones = attachSkeletonHierarchy(content, nodes, scene, angleAt, vw);
  const jointsById = new Map((scene.joints ?? []).map((j) => [j.id, j]));

  const setPlayhead = (t: number, clipId?: string | null) => {
    const c =
      (clipId
        ? scene.animations?.find((a) => a.id === clipId)
        : clip) ?? clip;
    for (const [jointId, bone] of bones) {
      const joint = jointsById.get(jointId);
      if (!joint) continue;
      const angle = c ? sampleJointAngleDeg(c, jointId, t) : 0;
      applyBoneRotation(bone, joint.axis, angle);
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
