import type * as THREE from "three";

export type EditorReflectionSnapshot = Readonly<{
  updatedThisFrame: boolean;
  ageMs: number;
  sceneDirty: boolean;
  animationDirty: boolean;
}>;

export type EditorReflectionScheduler = Readonly<{
  beginFrame: () => void;
  trackCamera: (camera: THREE.Camera) => boolean;
  markSceneDirty: () => void;
  markAnimationDirty: () => void;
  shouldRender: (nowMs: number) => boolean;
  markRendered: (nowMs: number) => void;
  snapshot: (nowMs: number) => EditorReflectionSnapshot;
}>;

const CAMERA_EPSILON = 1e-7;

/**
 * Event-driven reflection invalidation for the editor. Camera/world edits are
 * immediate; purely animated light/sky changes are capped to a cheaper rate.
 */
export function createEditorReflectionScheduler(
  animatedIntervalMs = 100,
): EditorReflectionScheduler {
  const cameraState = new Float64Array(32);
  let hasCameraState = false;
  let sceneDirty = true;
  let animationDirty = false;
  let updatedThisFrame = false;
  let lastRenderMs = Number.NEGATIVE_INFINITY;
  const animationInterval = Math.max(16, animatedIntervalMs);

  const trackCamera = (camera: THREE.Camera): boolean => {
    const world = camera.matrixWorld.elements;
    const projection = camera.projectionMatrix.elements;
    let changed = !hasCameraState;
    for (let index = 0; index < 16; index++) {
      const worldValue = world[index] ?? 0;
      const projectionValue = projection[index] ?? 0;
      if (
        !changed &&
        (Math.abs(cameraState[index]! - worldValue) > CAMERA_EPSILON ||
          Math.abs(cameraState[index + 16]! - projectionValue) > CAMERA_EPSILON)
      ) {
        changed = true;
      }
      cameraState[index] = worldValue;
      cameraState[index + 16] = projectionValue;
    }
    hasCameraState = true;
    if (changed) sceneDirty = true;
    return changed;
  };

  return {
    beginFrame() {
      updatedThisFrame = false;
    },
    trackCamera,
    markSceneDirty() {
      sceneDirty = true;
    },
    markAnimationDirty() {
      animationDirty = true;
    },
    shouldRender(nowMs) {
      return (
        sceneDirty ||
        (animationDirty && nowMs - lastRenderMs >= animationInterval)
      );
    },
    markRendered(nowMs) {
      lastRenderMs = nowMs;
      sceneDirty = false;
      animationDirty = false;
      updatedThisFrame = true;
    },
    snapshot(nowMs) {
      return {
        updatedThisFrame,
        ageMs: Number.isFinite(lastRenderMs)
          ? Math.max(0, nowMs - lastRenderMs)
          : Number.POSITIVE_INFINITY,
        sceneDirty,
        animationDirty,
      };
    },
  };
}
