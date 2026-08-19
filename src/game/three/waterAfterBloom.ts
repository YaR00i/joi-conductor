/**
 * Previously composited water after UnrealBloom to kill lantern smear.
 * That path painted over the bloomed color buffer (depth/composite bugs) and
 * hid the rest of the scene — disabled until a safe selective-bloom exists.
 *
 * Callers keep this hook so we can re-enable without touching play/editor.
 */
import type * as THREE from "three";

export function renderSceneWaterAfterBloom(
  _renderer: THREE.WebGLRenderer,
  _scene: THREE.Scene,
  _camera: THREE.Camera,
  renderPost: () => void,
): void {
  renderPost();
}
