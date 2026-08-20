/**
 * Blender-like move/rotate gizmo for the map editor (Three TransformControls).
 * Pivot is an independent Object3D — commit snaps back into map data.
 */
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

export type EditorTransformKind =
  | "voxel"
  | "sprite"
  | "light"
  | "tile"
  | "region"
  | "selection"
  | "group";

export type EditorTransformMode = "translate" | "rotate" | "scale";

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
  /** Ember axes: X/Y map plane, Z vertical. */
  scale?: { x: number; y: number; z: number };
  allowRotate: boolean;
  allowScale: boolean;
  scaleAxes?: { x: boolean; y: boolean; z: boolean };
};

export type EditorTransformCommit = {
  kind: EditorTransformKind;
  id?: string;
  tx?: number;
  ty?: number;
  mode: EditorTransformMode;
  position: { x: number; y: number; z: number };
  rotationY: number;
  /** Ember axes: X/Y map plane, Z vertical. */
  scale: { x: number; y: number; z: number };
};

/** Live gizmo pose. It is visual-only and must never enter undo/history. */
export type EditorTransformPreview = EditorTransformCommit;

export type EditorTransformGizmo = {
  root: THREE.Object3D;
  setPointerDom: (el: HTMLElement | null) => void;
  setTarget: (target: EditorTransformTarget | null) => void;
  setMode: (mode: EditorTransformMode) => void;
  getMode: () => EditorTransformMode;
  /** True while hovering a handle or actively dragging. */
  isBusy: () => boolean;
  /** True only while a handle is being dragged. */
  isDragging: () => boolean;
  onCommit: (cb: ((commit: EditorTransformCommit) => void) | null) => void;
  onDraggingChanged: (cb: ((dragging: boolean) => void) | null) => void;
  /** Live visual-only gizmo pose while dragging. */
  onPreview: (
    cb: ((preview: EditorTransformPreview | null) => void) | null,
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
  let mode: EditorTransformMode = "translate";
  let commitCb: ((commit: EditorTransformCommit) => void) | null = null;
  let draggingCb: ((dragging: boolean) => void) | null = null;
  let previewCb: ((preview: EditorTransformPreview | null) => void) | null =
    null;
  let dragging = false;
  let pointerDom: HTMLElement | null = null;

  // TransformControls and the map picker share one transparent overlay.
  // Keep a handle press from bubbling into React's map-selection handler,
  // which would otherwise replace the selected prop/light with its floor tile.
  const stopMapPickerOnHandle = (event: MouseEvent) => {
    if (!dragging && !controls.axis) return;
    event.stopPropagation();
  };

  const emitPreview = () => {
    if (!previewCb) return;
    if (dragging && target) {
      previewCb({
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
        scale: {
          x: pivot.scale.x,
          y: pivot.scale.z,
          z: pivot.scale.y,
        },
      });
      return;
    }
    previewCb(null);
  };

  const applyMode = () => {
    const canRotate = Boolean(target?.allowRotate);
    const canScale = Boolean(target?.allowScale);
    const next =
      mode === "rotate" && canRotate
        ? "rotate"
        : mode === "scale" && canScale
          ? "scale"
          : "translate";
    mode = next;
    controls.setMode(next);
    if (next === "rotate") {
      controls.showX = false;
      controls.showY = true;
      controls.showZ = false;
    } else if (next === "scale") {
      const axes = target?.scaleAxes ?? { x: true, y: true, z: true };
      controls.showX = axes.x;
      // Three Y is Ember vertical Z; Three Z is Ember map-plane Y.
      controls.showY = axes.z;
      controls.showZ = axes.y;
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
    const scale = target.scale ?? { x: 1, y: 1, z: 1 };
    pivot.scale.set(scale.x, scale.z, scale.y);
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
        scale: {
          x: pivot.scale.x,
          y: pivot.scale.z,
          z: pivot.scale.y,
        },
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
      // displayMap changes on every live preview frame. Reconnecting the same
      // element here used to cancel TransformControls in the middle of a drag.
      if (pointerDom === el && controls.domElement === el) return;
      if (pointerDom) {
        pointerDom.removeEventListener("mousedown", stopMapPickerOnHandle);
      }
      if (controls.domElement) controls.disconnect();
      controls.domElement = el;
      if (el) controls.connect();
      pointerDom = el;
      if (pointerDom) {
        pointerDom.addEventListener("mousedown", stopMapPickerOnHandle);
      }
    },
    setTarget(next) {
      // Don't yank the pivot mid-drag.
      if (dragging) return;
      target = next
        ? {
            ...next,
            position: { ...next.position },
            scale: next.scale ? { ...next.scale } : undefined,
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
      if (pointerDom) {
        pointerDom.removeEventListener("mousedown", stopMapPickerOnHandle);
        pointerDom = null;
      }
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
