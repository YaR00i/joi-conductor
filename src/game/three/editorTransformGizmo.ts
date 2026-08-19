/**
 * Blender-like move/rotate gizmo for the map editor (Three TransformControls).
 * Pivot is an independent Object3D — commit snaps back into map data.
 */
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

export type EditorTransformKind = "voxel" | "sprite" | "light" | "tile" | "group";

export type EditorTransformTarget = {
  kind: EditorTransformKind;
  /** Placement / light id (voxel, sprite, light). */
  id?: string;
  /** Tile cell (tile kind, and optional seed for lights). */
  tx?: number;
  ty?: number;
  position: { x: number; y: number; z: number };
  /** Yaw in radians (voxel). */
  rotationY?: number;
  allowRotate: boolean;
};

export type EditorTransformCommit = {
  kind: EditorTransformKind;
  id?: string;
  tx?: number;
  ty?: number;
  mode: "translate" | "rotate";
  position: { x: number; y: number; z: number };
  rotationY: number;
};

export type EditorTransformGizmo = {
  root: THREE.Object3D;
  setPointerDom: (el: HTMLElement | null) => void;
  setTarget: (target: EditorTransformTarget | null) => void;
  setMode: (mode: "translate" | "rotate") => void;
  getMode: () => "translate" | "rotate";
  /** True while hovering a handle or actively dragging. */
  isBusy: () => boolean;
  /** True only while a handle is being dragged. */
  isDragging: () => boolean;
  onCommit: (cb: ((commit: EditorTransformCommit) => void) | null) => void;
  onDraggingChanged: (cb: ((dragging: boolean) => void) | null) => void;
  /**
   * Live world position while translating (null when not dragging).
   * Used for snap-cell preview outlines.
   */
  onPreview: (
    cb: ((pos: { x: number; y: number; z: number } | null) => void) | null,
  ) => void;
  dispose: () => void;
};

export function createEditorTransformGizmo(
  camera: THREE.Camera,
  scene: THREE.Scene,
  onChange: () => void,
): EditorTransformGizmo {
  const pivot = new THREE.Object3D();
  pivot.name = "editor-transform-pivot";
  scene.add(pivot);

  const controls = new TransformControls(camera);
  controls.setSize(0.85);
  controls.setSpace("world");
  controls.enabled = false;
  scene.add(controls.getHelper());

  let target: EditorTransformTarget | null = null;
  let mode: "translate" | "rotate" = "translate";
  let commitCb: ((commit: EditorTransformCommit) => void) | null = null;
  let draggingCb: ((dragging: boolean) => void) | null = null;
  let previewCb:
    | ((pos: { x: number; y: number; z: number } | null) => void)
    | null = null;
  let dragging = false;

  const emitPreview = () => {
    if (!previewCb) return;
    if (dragging && mode === "translate" && target) {
      previewCb({
        x: pivot.position.x,
        y: pivot.position.y,
        z: pivot.position.z,
      });
      return;
    }
    previewCb(null);
  };

  const applyMode = () => {
    const canRotate = Boolean(target?.allowRotate);
    const next = mode === "rotate" && canRotate ? "rotate" : "translate";
    mode = next;
    controls.setMode(next);
    if (next === "rotate") {
      controls.showX = false;
      controls.showY = true;
      controls.showZ = false;
    } else {
      controls.showX = true;
      controls.showY = true;
      controls.showZ = true;
    }
  };

  const syncPivotFromTarget = () => {
    if (!target) {
      controls.detach();
      controls.enabled = false;
      pivot.visible = false;
      return;
    }
    pivot.position.set(target.position.x, target.position.y, target.position.z);
    pivot.rotation.set(0, target.rotationY ?? 0, 0);
    pivot.visible = true;
    controls.attach(pivot);
    controls.enabled = true;
    applyMode();
  };

  const onControlsChange = () => {
    onChange();
    if (dragging) emitPreview();
  };

  const onDragging = (event: { value?: boolean }) => {
    const next = Boolean(event.value);
    // On release: snapshot pose *before* draggingCb/sync can reset the pivot
    // back to the pre-drag selection (that was why blocks never moved).
    if (!next && dragging && target) {
      const commit: EditorTransformCommit = {
        kind: target.kind,
        id: target.id,
        tx: target.tx,
        ty: target.ty,
        mode,
        position: {
          x: pivot.position.x,
          y: pivot.position.y,
          z: pivot.position.z,
        },
        rotationY: pivot.rotation.y,
      };
      dragging = false;
      draggingCb?.(false);
      emitPreview();
      onChange();
      commitCb?.(commit);
      return;
    }
    dragging = next;
    draggingCb?.(dragging);
    emitPreview();
    onChange();
  };

  controls.addEventListener("change", onControlsChange);
  controls.addEventListener("dragging-changed", onDragging as () => void);

  return {
    root: pivot,
    setPointerDom(el) {
      if (controls.domElement) controls.disconnect();
      controls.domElement = el;
      if (el) controls.connect();
    },
    setTarget(next) {
      // Don't yank the pivot mid-drag.
      if (dragging) return;
      target = next
        ? {
            ...next,
            position: { ...next.position },
          }
        : null;
      syncPivotFromTarget();
      onChange();
    },
    setMode(next) {
      mode = next;
      applyMode();
      onChange();
    },
    getMode() {
      return mode;
    },
    isBusy() {
      return dragging || Boolean(controls.axis);
    },
    isDragging() {
      return dragging;
    },
    onCommit(cb) {
      commitCb = cb;
    },
    onDraggingChanged(cb) {
      draggingCb = cb;
    },
    onPreview(cb) {
      previewCb = cb;
    },
    dispose() {
      controls.removeEventListener("change", onControlsChange);
      controls.removeEventListener(
        "dragging-changed",
        onDragging as () => void,
      );
      controls.detach();
      if (controls.domElement) controls.disconnect();
      controls.dispose();
      scene.remove(controls.getHelper());
      scene.remove(pivot);
      commitCb = null;
      draggingCb = null;
      previewCb = null;
      target = null;
    },
  };
}
