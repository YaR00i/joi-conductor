import type { EmberVoxelScene } from "../content/types";
import {
  newVoxelJointId,
  newVoxelSceneObjectId,
  removeSceneObject,
} from "./voxelScene";
import {
  childJointMap,
  translateSceneBone,
  type Vec3,
} from "./voxelSkeleton";
import { normalizeVoxelRot } from "./voxelPlacement";

function existingSelection(
  scene: EmberVoxelScene,
  objectIds: readonly string[],
): Set<string> {
  const existing = new Set(scene.objects.map((object) => object.id));
  return new Set(objectIds.filter((id) => existing.has(id)));
}

/** Selected hierarchy roots plus every descendant that visually follows them. */
export function voxelSceneSelectionMoveIds(
  scene: EmberVoxelScene,
  objectIds: readonly string[],
): string[] {
  const selected = existingSelection(scene, objectIds);
  if (!selected.size) return [];
  const children = new Map<string, string[]>();
  for (const joint of scene.joints ?? []) {
    const list = children.get(joint.parentObjectId) ?? [];
    list.push(joint.childObjectId);
    children.set(joint.parentObjectId, list);
  }
  const moved = new Set(selected);
  const stack = [...selected];
  while (stack.length) {
    const objectId = stack.pop()!;
    for (const childId of children.get(objectId) ?? []) {
      if (moved.has(childId)) continue;
      moved.add(childId);
      stack.push(childId);
    }
  }
  return scene.objects
    .map((object) => object.id)
    .filter((id) => moved.has(id));
}

/** Blender-like median point of selected object origins in voxel space. */
export function voxelSceneSelectionPivot(
  scene: EmberVoxelScene,
  objectIds: readonly string[],
): Vec3 | null {
  const selected = existingSelection(scene, objectIds);
  const objects = scene.objects.filter((object) => selected.has(object.id));
  if (!objects.length) return null;
  const sum = objects.reduce(
    (acc, object) => ({
      x: acc.x + object.offset.x,
      y: acc.y + object.offset.y,
      z: acc.z + object.offset.z,
    }),
    { x: 0, y: 0, z: 0 },
  );
  return {
    x: sum.x / objects.length,
    y: sum.y / objects.length,
    z: sum.z / objects.length,
  };
}

/**
 * Move selected scene objects as one hierarchy-aware group.
 * Selected descendants of another selected object are omitted from the root
 * pass because translateSceneBone already moves the whole child hierarchy.
 */
export function translateVoxelSceneSelection(
  scene: EmberVoxelScene,
  objectIds: readonly string[],
  delta: Vec3,
): EmberVoxelScene {
  const selected = existingSelection(scene, objectIds);
  if (!selected.size) return scene;
  const incoming = childJointMap(scene);
  const selectedRoots = [...selected].filter((id) => {
    let cursor = incoming.get(id)?.parentObjectId;
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor)) {
      if (selected.has(cursor)) return false;
      visited.add(cursor);
      cursor = incoming.get(cursor)?.parentObjectId;
    }
    return true;
  });
  return selectedRoots.reduce(
    (next, objectId) => translateSceneBone(next, objectId, delta),
    scene,
  );
}

/**
 * Object yaw is deliberately limited to loose scene objects for now. Rotating
 * either end of an authored joint would also require rewriting its two local
 * pivots; silently doing only half of that operation corrupts the rig.
 */
export function canRotateVoxelSceneSelection(
  scene: EmberVoxelScene,
  objectIds: readonly string[],
): boolean {
  const moved = new Set(voxelSceneSelectionMoveIds(scene, objectIds));
  if (!moved.size) return false;
  return !(scene.joints ?? []).some(
    (joint) =>
      moved.has(joint.parentObjectId) || moved.has(joint.childObjectId),
  );
}

/** Rotate loose objects around a shared, integer-grid median pivot. */
export function rotateVoxelSceneSelectionY(
  scene: EmberVoxelScene,
  objectIds: readonly string[],
  quarterTurns: number,
  pivot?: Vec3,
): EmberVoxelScene {
  const turns = normalizeVoxelRot(quarterTurns);
  if (!turns || !canRotateVoxelSceneSelection(scene, objectIds)) return scene;
  const moved = new Set(voxelSceneSelectionMoveIds(scene, objectIds));
  const median = pivot ?? voxelSceneSelectionPivot(scene, objectIds);
  if (!median) return scene;
  const center = {
    x: Math.round(median.x),
    y: Math.round(median.y),
    z: Math.round(median.z),
  };
  const rotateOffset = (x: number, z: number) => {
    const dx = x - center.x;
    const dz = z - center.z;
    if (turns === 1) return { x: center.x + dz, z: center.z - dx };
    if (turns === 2) return { x: center.x - dx, z: center.z - dz };
    return { x: center.x - dz, z: center.z + dx };
  };
  return {
    ...scene,
    objects: scene.objects.map((object) => {
      if (!moved.has(object.id)) return object;
      const offset = rotateOffset(object.offset.x, object.offset.z);
      return {
        ...object,
        offset: { ...object.offset, ...offset },
        rot: normalizeVoxelRot((object.rot ?? 0) + turns),
      };
    }),
  };
}

export function setVoxelSceneSelectionVisible(
  scene: EmberVoxelScene,
  objectIds: readonly string[],
  visible: boolean,
): EmberVoxelScene {
  const selected = existingSelection(scene, objectIds);
  if (!selected.size) return scene;
  return {
    ...scene,
    objects: scene.objects.map((object) =>
      selected.has(object.id) ? { ...object, visible } : object,
    ),
  };
}

export function removeVoxelSceneSelection(
  scene: EmberVoxelScene,
  objectIds: readonly string[],
): EmberVoxelScene {
  const selected = existingSelection(scene, objectIds);
  let next = scene;
  for (const object of scene.objects) {
    if (!selected.has(object.id) || next.objects.length <= 1) continue;
    next = removeSceneObject(next, object.id);
  }
  return next;
}

export type DuplicateVoxelSceneSelectionResult = {
  scene: EmberVoxelScene;
  objectIds: string[];
};

/** Duplicate objects plus internal joints and matching animation tracks. */
export function duplicateVoxelSceneSelection(
  scene: EmberVoxelScene,
  objectIds: readonly string[],
  ids: {
    object?: () => string;
    joint?: () => string;
  } = {},
): DuplicateVoxelSceneSelectionResult {
  const selected = existingSelection(scene, objectIds);
  if (!selected.size) return { scene, objectIds: [] };
  const objectId = ids.object ?? newVoxelSceneObjectId;
  const jointId = ids.joint ?? newVoxelJointId;
  const objectMap = new Map<string, string>();
  const copies = scene.objects
    .filter((object) => selected.has(object.id))
    .map((object) => {
      const nextId = objectId();
      objectMap.set(object.id, nextId);
      return {
        ...object,
        id: nextId,
        nameRu: object.nameRu ? `${object.nameRu} копия` : undefined,
        offset: { ...object.offset, x: object.offset.x + 2 },
        visible: true,
      };
    });
  const jointMap = new Map<string, string>();
  const copiedJoints = (scene.joints ?? [])
    .filter(
      (joint) =>
        selected.has(joint.parentObjectId) &&
        selected.has(joint.childObjectId),
    )
    .map((joint) => {
      const nextId = jointId();
      jointMap.set(joint.id, nextId);
      return {
        ...joint,
        id: nextId,
        parentObjectId: objectMap.get(joint.parentObjectId)!,
        childObjectId: objectMap.get(joint.childObjectId)!,
        parentPivot: { ...joint.parentPivot },
        childPivot: { ...joint.childPivot },
      };
    });
  const animations = scene.animations?.map((clip) => ({
    ...clip,
    tracks: [
      ...clip.tracks,
      ...clip.tracks
        .filter((track) => jointMap.has(track.jointId))
        .map((track) => ({
          jointId: jointMap.get(track.jointId)!,
          keys: track.keys.map((key) => ({ ...key })),
        })),
    ],
  }));
  return {
    scene: {
      ...scene,
      objects: [...scene.objects, ...copies],
      joints: scene.joints ? [...scene.joints, ...copiedJoints] : undefined,
      animations,
    },
    objectIds: copies.map((copy) => copy.id),
  };
}
