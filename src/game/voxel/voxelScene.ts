/**
 * Voxel editor scenes: multi-object workspaces with offsets, joints, anim clips.
 */
import type {
  EmberPack,
  EmberVoxelAnimClip,
  EmberVoxelAnimKey,
  EmberVoxelJointAxis,
  EmberVoxelScene,
  EmberVoxelSceneJoint,
  EmberVoxelSceneObject,
} from "../content/types";
import { normalizeVoxelRot } from "./voxelPlacement";

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function newVoxelSceneId(): string {
  return `vscn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function newVoxelSceneObjectId(): string {
  return `vobj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function newVoxelJointId(): string {
  return `vjnt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function newVoxelAnimClipId(): string {
  return `vanim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function normalizeVoxelOffset(raw: {
  x?: number;
  y?: number;
  z?: number;
}): { x: number; y: number; z: number } {
  return {
    x: Math.round(Number(raw.x) || 0),
    y: Math.round(Number(raw.y) || 0),
    z: Math.round(Number(raw.z) || 0),
  };
}

export function normalizeVoxelSceneObject(
  raw: Partial<EmberVoxelSceneObject> & { id: string; modelId: string },
): EmberVoxelSceneObject {
  return {
    id: raw.id,
    nameRu: raw.nameRu,
    modelId: raw.modelId,
    offset: normalizeVoxelOffset(raw.offset ?? {}),
    rot: normalizeVoxelRot(raw.rot),
    visible: raw.visible !== false,
  };
}

function normalizeAxis(raw: unknown): EmberVoxelJointAxis {
  if (raw === "x" || raw === "y" || raw === "z") return raw;
  return "x";
}

export function normalizeVoxelSceneJoint(
  raw: Partial<EmberVoxelSceneJoint> & { id: string },
): EmberVoxelSceneJoint | null {
  if (!raw.parentObjectId || !raw.childObjectId) return null;
  return {
    id: raw.id,
    nameRu: raw.nameRu,
    parentObjectId: raw.parentObjectId,
    childObjectId: raw.childObjectId,
    parentPivot: normalizeVoxelOffset(raw.parentPivot ?? {}),
    childPivot: normalizeVoxelOffset(raw.childPivot ?? {}),
    axis: normalizeAxis(raw.axis),
  };
}

function normalizeAnimKey(raw: Partial<EmberVoxelAnimKey>): EmberVoxelAnimKey {
  return {
    t: clamp(Number(raw.t) || 0, 0, 1),
    angleDeg: Number.isFinite(raw.angleDeg) ? Number(raw.angleDeg) : 0,
  };
}

export function normalizeVoxelAnimClip(
  raw: Partial<EmberVoxelAnimClip> & { id: string },
): EmberVoxelAnimClip {
  return {
    id: raw.id,
    nameRu: raw.nameRu,
    durationSec: Math.max(0.05, Number(raw.durationSec) || 0.6),
    tracks: (raw.tracks ?? []).map((tr) => ({
      jointId: tr.jointId,
      keys: (tr.keys ?? [])
        .map(normalizeAnimKey)
        .sort((a, b) => a.t - b.t),
    })),
  };
}

export function normalizeVoxelScene(
  raw: Partial<EmberVoxelScene> & { id: string },
): EmberVoxelScene {
  const objects = (raw.objects ?? [])
    .filter((o): o is EmberVoxelSceneObject => Boolean(o?.id && o?.modelId))
    .map((o) => normalizeVoxelSceneObject(o));
  const joints = (raw.joints ?? [])
    .map((j) => normalizeVoxelSceneJoint({ ...j, id: j.id }))
    .filter((j): j is EmberVoxelSceneJoint => Boolean(j));
  const animations = (raw.animations ?? []).map((a) =>
    normalizeVoxelAnimClip({ ...a, id: a.id }),
  );
  return {
    id: raw.id,
    nameRu: raw.nameRu,
    objects,
    joints,
    animations,
  };
}

/** One-object scene wrapping a lone mesh (migration / create). */
export function sceneFromSingleModel(
  modelId: string,
  nameRu?: string,
  sceneId?: string,
): EmberVoxelScene {
  return normalizeVoxelScene({
    id: sceneId ?? modelId,
    nameRu: nameRu ?? modelId,
    objects: [
      {
        id: "obj0",
        nameRu: nameRu ?? modelId,
        modelId,
        offset: { x: 0, y: 0, z: 0 },
      },
    ],
    joints: [],
    animations: [],
  });
}

/**
 * Ensure every voxel model is reachable from a scene.
 * Existing scenes kept; missing models get a 1-object scene with the same id.
 */
export function ensureVoxelScenes(
  models: EmberPack["voxelModels"],
  scenesIn: Record<string, EmberVoxelScene> | undefined,
): Record<string, EmberVoxelScene> {
  const scenes: Record<string, EmberVoxelScene> = {};
  for (const s of Object.values(scenesIn ?? {})) {
    scenes[s.id] = normalizeVoxelScene(s);
  }
  const covered = new Set<string>();
  for (const s of Object.values(scenes)) {
    for (const o of s.objects) covered.add(o.modelId);
  }
  for (const m of Object.values(models ?? {})) {
    if (covered.has(m.id)) continue;
    if (scenes[m.id]) {
      // Scene id collision with uncovered model — nest under unique scene id.
      const sid = newVoxelSceneId();
      scenes[sid] = sceneFromSingleModel(m.id, m.nameRu, sid);
    } else {
      scenes[m.id] = sceneFromSingleModel(m.id, m.nameRu, m.id);
    }
    covered.add(m.id);
  }
  return scenes;
}

/** Linear angle at normalized time for a joint track. */
export function sampleJointAngleDeg(
  clip: EmberVoxelAnimClip | undefined,
  jointId: string,
  t: number,
): number {
  if (!clip) return 0;
  const track = clip.tracks.find((tr) => tr.jointId === jointId);
  const keys = track?.keys ?? [];
  if (keys.length === 0) return 0;
  const u = clamp(t, 0, 1);
  if (keys.length === 1) return keys[0]!.angleDeg;
  if (u <= keys[0]!.t) return keys[0]!.angleDeg;
  const last = keys[keys.length - 1]!;
  if (u >= last.t) return last.angleDeg;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (u >= a.t && u <= b.t) {
      const span = Math.max(1e-6, b.t - a.t);
      const k = (u - a.t) / span;
      return a.angleDeg + (b.angleDeg - a.angleDeg) * k;
    }
  }
  return last.angleDeg;
}

export function upsertSceneObject(
  scene: EmberVoxelScene,
  obj: EmberVoxelSceneObject,
): EmberVoxelScene {
  const objects = [...scene.objects];
  const i = objects.findIndex((o) => o.id === obj.id);
  if (i >= 0) objects[i] = normalizeVoxelSceneObject(obj);
  else objects.push(normalizeVoxelSceneObject(obj));
  return { ...scene, objects };
}

export function patchSceneObject(
  scene: EmberVoxelScene,
  objectId: string,
  patch: Partial<EmberVoxelSceneObject>,
): EmberVoxelScene {
  return {
    ...scene,
    objects: scene.objects.map((o) =>
      o.id === objectId
        ? normalizeVoxelSceneObject({ ...o, ...patch, id: o.id, modelId: patch.modelId ?? o.modelId })
        : o,
    ),
  };
}

export function upsertSceneJoint(
  scene: EmberVoxelScene,
  joint: EmberVoxelSceneJoint,
): EmberVoxelScene {
  const normalized = normalizeVoxelSceneJoint(joint);
  if (!normalized) return scene;
  const joints = [...(scene.joints ?? [])];
  const i = joints.findIndex((j) => j.id === normalized.id);
  if (i >= 0) joints[i] = normalized;
  else joints.push(normalized);
  return { ...scene, joints };
}

export function removeSceneJoint(
  scene: EmberVoxelScene,
  jointId: string,
): EmberVoxelScene {
  return {
    ...scene,
    joints: (scene.joints ?? []).filter((j) => j.id !== jointId),
    animations: (scene.animations ?? []).map((clip) => ({
      ...clip,
      tracks: clip.tracks.filter((tr) => tr.jointId !== jointId),
    })),
  };
}

export function clearSceneJoints(scene: EmberVoxelScene): EmberVoxelScene {
  return {
    ...scene,
    joints: [],
    animations: (scene.animations ?? []).map((clip) => ({
      ...clip,
      tracks: [],
    })),
  };
}

export function upsertAnimClip(
  scene: EmberVoxelScene,
  clip: EmberVoxelAnimClip,
): EmberVoxelScene {
  const normalized = normalizeVoxelAnimClip(clip);
  const animations = [...(scene.animations ?? [])];
  const i = animations.findIndex((a) => a.id === normalized.id);
  if (i >= 0) animations[i] = normalized;
  else animations.push(normalized);
  return { ...scene, animations };
}

/** Insert or replace a key on a joint track (matched by nearest t within ε). */
export function upsertAnimKey(
  scene: EmberVoxelScene,
  clipId: string,
  jointId: string,
  key: EmberVoxelAnimKey,
): EmberVoxelScene {
  const animations = (scene.animations ?? []).map((clip) => {
    if (clip.id !== clipId) return clip;
    const tracks = [...clip.tracks];
    let ti = tracks.findIndex((tr) => tr.jointId === jointId);
    if (ti < 0) {
      tracks.push({ jointId, keys: [normalizeAnimKey(key)] });
      return normalizeVoxelAnimClip({ ...clip, tracks });
    }
    const track = tracks[ti]!;
    const keys = [...track.keys];
    const k = normalizeAnimKey(key);
    const near = keys.findIndex((x) => Math.abs(x.t - k.t) < 0.012);
    if (near >= 0) keys[near] = k;
    else keys.push(k);
    keys.sort((a, b) => a.t - b.t);
    tracks[ti] = { jointId, keys };
    return normalizeVoxelAnimClip({ ...clip, tracks });
  });
  return { ...scene, animations };
}

/** Remove keys near normalized time on a joint track. */
export function removeAnimKey(
  scene: EmberVoxelScene,
  clipId: string,
  jointId: string,
  t: number,
  epsilon = 0.012,
): EmberVoxelScene {
  const target = clamp(t, 0, 1);
  const animations = (scene.animations ?? []).map((clip) => {
    if (clip.id !== clipId) return clip;
    const tracks = clip.tracks.map((tr) => {
      if (tr.jointId !== jointId) return tr;
      return {
        ...tr,
        keys: tr.keys.filter((k) => Math.abs(k.t - target) >= epsilon),
      };
    });
    return normalizeVoxelAnimClip({ ...clip, tracks });
  });
  return { ...scene, animations };
}

/** Move a key from one normalized time to another (keeps angle). */
export function moveAnimKey(
  scene: EmberVoxelScene,
  clipId: string,
  jointId: string,
  fromT: number,
  toT: number,
): EmberVoxelScene {
  const clip = (scene.animations ?? []).find((c) => c.id === clipId);
  const track = clip?.tracks.find((tr) => tr.jointId === jointId);
  const from = clamp(fromT, 0, 1);
  const src = track?.keys.find((k) => Math.abs(k.t - from) < 0.012);
  if (!src) return scene;
  const without = removeAnimKey(scene, clipId, jointId, from);
  return upsertAnimKey(without, clipId, jointId, {
    t: toT,
    angleDeg: src.angleDeg,
  });
}

export function patchAnimClip(
  scene: EmberVoxelScene,
  clipId: string,
  patch: Partial<Pick<EmberVoxelAnimClip, "nameRu" | "durationSec">>,
): EmberVoxelScene {
  const animations = (scene.animations ?? []).map((clip) => {
    if (clip.id !== clipId) return clip;
    return normalizeVoxelAnimClip({ ...clip, ...patch, id: clip.id });
  });
  return { ...scene, animations };
}

export function removeSceneObject(
  scene: EmberVoxelScene,
  objectId: string,
): EmberVoxelScene {
  const removedJointIds = new Set(
    (scene.joints ?? [])
      .filter(
        (j) =>
          j.parentObjectId === objectId || j.childObjectId === objectId,
      )
      .map((j) => j.id),
  );
  return {
    ...scene,
    objects: scene.objects.filter((o) => o.id !== objectId),
    joints: (scene.joints ?? []).filter((j) => !removedJointIds.has(j.id)),
    animations: (scene.animations ?? []).map((clip) => ({
      ...clip,
      tracks: clip.tracks.filter((tr) => !removedJointIds.has(tr.jointId)),
    })),
  };
}

/** Joint that treats `objectId` as the hinged child, if any. */
export function findChildJoint(
  scene: EmberVoxelScene,
  objectId: string,
): EmberVoxelSceneJoint | undefined {
  return (scene.joints ?? []).find((j) => j.childObjectId === objectId);
}
