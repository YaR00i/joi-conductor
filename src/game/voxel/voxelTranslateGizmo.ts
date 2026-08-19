/**
 * XYZ translate gizmo for moving a point in voxel sculpt space.
 * Axis handles constrain drag; center sphere moves on the camera plane.
 */
import * as THREE from "three";

export type TranslateAxis = "x" | "y" | "z";
export type TranslateGizmoHit = TranslateAxis | "center";

const AXIS_COLOR: Record<TranslateAxis, number> = {
  x: 0xe05050,
  y: 0x50c060,
  z: 0x5090e0,
};

const AXIS_DIR: Record<TranslateAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

export type TranslateGizmoApi = {
  root: THREE.Group;
  setPose: (pos: { x: number; y: number; z: number }, scale?: number) => void;
  setVisible: (v: boolean) => void;
  setHighlight: (hit: TranslateGizmoHit | null) => void;
  pick: (raycaster: THREE.Raycaster) => TranslateGizmoHit | null;
  /**
   * Project a pointer ray onto the active drag constraint.
   * `camera` is needed for axis planes and free (center) drag.
   */
  projectDrag: (
    raycaster: THREE.Raycaster,
    camera: THREE.Camera,
    axis: TranslateGizmoHit,
    dragOrigin: THREE.Vector3,
  ) => THREE.Vector3 | null;
  dispose: () => void;
};

export function createVoxelTranslateGizmo(): TranslateGizmoApi {
  const root = new THREE.Group();
  root.name = "vox-translate-gizmo";
  root.visible = false;

  const mats: Record<TranslateAxis, THREE.MeshBasicMaterial> = {
    x: new THREE.MeshBasicMaterial({
      color: AXIS_COLOR.x,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
    y: new THREE.MeshBasicMaterial({
      color: AXIS_COLOR.y,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
    z: new THREE.MeshBasicMaterial({
      color: AXIS_COLOR.z,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  };
  const centerMat = new THREE.MeshBasicMaterial({
    color: 0xffe080,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.95,
    toneMapped: false,
  });

  const shaftGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.05, 8);
  const headGeo = new THREE.ConeGeometry(0.13, 0.32, 10);
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), centerMat);
  center.renderOrder = 40;
  center.userData.translateGizmo = "center" satisfies TranslateGizmoHit;
  root.add(center);

  const addAxis = (axis: TranslateAxis) => {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(shaftGeo, mats[axis]);
    shaft.position.y = 0.55;
    const head = new THREE.Mesh(headGeo, mats[axis]);
    head.position.y = 1.2;
    g.add(shaft, head);
    g.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      AXIS_DIR[axis],
    );
    g.traverse((o) => {
      o.renderOrder = 41;
      o.userData.translateGizmo = axis;
    });
    root.add(g);
  };
  addAxis("x");
  addAxis("y");
  addAxis("z");

  const pos = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();
  const plane = new THREE.Plane();
  const tmp = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  const api: TranslateGizmoApi = {
    root,
    setPose(worldPos, scale = 1) {
      pos.set(worldPos.x, worldPos.y, worldPos.z);
      root.position.copy(pos);
      root.scale.setScalar(Math.max(0.55, scale));
    },
    setVisible(v) {
      root.visible = v;
    },
    setHighlight(hit) {
      centerMat.opacity = hit === "center" ? 1 : 0.85;
      (["x", "y", "z"] as const).forEach((a) => {
        mats[a].color.setHex(
          hit === a
            ? 0xffffff
            : AXIS_COLOR[a],
        );
      });
    },
    pick(raycaster) {
      if (!root.visible) return null;
      const hits = raycaster.intersectObject(root, true);
      for (const h of hits) {
        const kind = h.object.userData.translateGizmo as
          | TranslateGizmoHit
          | undefined;
        if (kind === "center" || kind === "x" || kind === "y" || kind === "z") {
          return kind;
        }
      }
      return null;
    },
    projectDrag(raycaster, camera, axis, dragOrigin) {
      if (axis === "center") {
        camera.getWorldDirection(camDir);
        plane.setFromNormalAndCoplanarPoint(camDir, dragOrigin);
        const hit = raycaster.ray.intersectPlane(plane, hitPoint);
        return hit ? hitPoint.clone() : null;
      }
      const dir = AXIS_DIR[axis];
      // Plane contains the axis and faces the camera as much as possible.
      camera.getWorldDirection(camDir);
      tmp.copy(camDir).cross(dir);
      if (tmp.lengthSq() < 1e-8) {
        tmp.set(0, 1, 0).cross(dir);
      }
      if (tmp.lengthSq() < 1e-8) {
        tmp.set(1, 0, 0).cross(dir);
      }
      tmp.normalize();
      const planeN = tmp.cross(dir).normalize();
      plane.setFromNormalAndCoplanarPoint(planeN, dragOrigin);
      const hit = raycaster.ray.intersectPlane(plane, hitPoint);
      if (!hit) return null;
      const t = hitPoint.clone().sub(dragOrigin).dot(dir);
      return dragOrigin.clone().addScaledVector(dir, t);
    },
    dispose() {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      mats.x.dispose();
      mats.y.dispose();
      mats.z.dispose();
      centerMat.dispose();
    },
  };

  return api;
}
