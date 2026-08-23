/**
 * Player collision capsule for editor overlays (same body as play).
 */
import * as THREE from "three";
import { VOXELS_PER_BLOCK } from "../voxel/constants";
import { DEFAULT_WORLD_BODY } from "../world/worldPhysics";

export function playerCapsuleWorldSize(tileSize: number): {
  radius: number;
  height: number;
} {
  const vw = Math.max(1e-6, tileSize / VOXELS_PER_BLOCK);
  return {
    radius: DEFAULT_WORLD_BODY.radiusVoxels * vw,
    height: DEFAULT_WORLD_BODY.heightVoxels * vw,
  };
}

export function createPlayerCapsuleOverlay(
  radius: number,
  height: number,
  color = 0x7cff9a,
): THREE.Group {
  const g = new THREE.Group();
  g.name = "playerCapsuleOverlay";
  g.add(makeCapsuleMesh(radius, height, color));
  g.userData.capsuleRadius = radius;
  g.userData.capsuleHeight = height;
  return g;
}

function makeCapsuleMesh(
  radius: number,
  height: number,
  color: number,
): THREE.Mesh {
  const r = Math.max(0.05, radius);
  const h = Math.max(r * 2 + 0.01, height);
  const cyl = Math.max(0.01, h - 2 * r);
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(r, cyl, 3, 10),
    new THREE.MeshBasicMaterial({
      color,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  mesh.renderOrder = 26;
  mesh.frustumCulled = false;
  return mesh;
}

/** Rebuild geometry in place when the gameplay body size changes. */
export function resizePlayerCapsuleOverlay(
  root: THREE.Group,
  radius: number,
  height: number,
): void {
  if (
    root.userData.capsuleRadius === radius &&
    root.userData.capsuleHeight === height &&
    root.children.length > 0
  ) {
    return;
  }
  const color =
    root.children[0] instanceof THREE.Mesh &&
    root.children[0].material instanceof THREE.MeshBasicMaterial
      ? root.children[0].material.color.getHex()
      : 0x7cff9a;
  disposePlayerCapsuleOverlay(root);
  while (root.children.length) root.remove(root.children[0]!);
  root.add(makeCapsuleMesh(radius, height, color));
  root.userData.capsuleRadius = radius;
  root.userData.capsuleHeight = height;
}

export function disposePlayerCapsuleOverlay(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const mat = child.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
  });
}
