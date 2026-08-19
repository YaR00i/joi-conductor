/**
 * Blender-like hinge rotation gizmo: axis stem + toroidal ring to drag angle.
 */
import * as THREE from "three";
import type { EmberVoxelJointAxis } from "../content/types";

const AXIS_COLOR: Record<EmberVoxelJointAxis, number> = {
  x: 0xe05050,
  y: 0x50c060,
  z: 0x5090e0,
};

const RING_SEGMENTS = 64;

export type HingeGizmoHit = "ring" | "axis";

export type HingeGizmoApi = {
  root: THREE.Group;
  /** Place/orient gizmo at the hinge; scale in world units. */
  setPose: (
    worldPos: { x: number; y: number; z: number },
    axis: EmberVoxelJointAxis,
    scale: number,
  ) => void;
  setVisible: (v: boolean) => void;
  setHighlight: (on: boolean) => void;
  /** Raycast gizmo parts; returns which handle was hit. */
  pick: (raycaster: THREE.Raycaster) => HingeGizmoHit | null;
  /**
   * Angle (radians) of a world point around the hinge axis, in the joint plane.
   * Used for drag: delta = angleAt(p1) - angleAt(p0).
   */
  planeAngleAt: (worldPoint: THREE.Vector3) => number;
  /** Intersect camera ray with the hinge rotation plane. */
  intersectPlane: (raycaster: THREE.Raycaster) => THREE.Vector3 | null;
  dispose: () => void;
};

function axisBasis(axis: EmberVoxelJointAxis): {
  axis: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
} {
  switch (axis) {
    case "x":
      return {
        axis: new THREE.Vector3(1, 0, 0),
        u: new THREE.Vector3(0, 1, 0),
        v: new THREE.Vector3(0, 0, 1),
      };
    case "y":
      return {
        axis: new THREE.Vector3(0, 1, 0),
        u: new THREE.Vector3(1, 0, 0),
        v: new THREE.Vector3(0, 0, 1),
      };
    case "z":
      return {
        axis: new THREE.Vector3(0, 0, 1),
        u: new THREE.Vector3(1, 0, 0),
        v: new THREE.Vector3(0, 1, 0),
      };
    default: {
      const _n: never = axis;
      return _n;
    }
  }
}

export function createHingeGizmo(): HingeGizmoApi {
  const root = new THREE.Group();
  root.name = "vox-hinge-gizmo";
  root.visible = false;

  const stemMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.88,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const tipMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const arrowMatA = new THREE.MeshBasicMaterial({
    color: 0xf0c060,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const arrowMatB = new THREE.MeshBasicMaterial({
    color: 0xc080e0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  // Local Y = joint axis after quaternion. Torus in XZ (= rotation plane).
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8),
    stemMat,
  );
  stem.renderOrder = 30;
  stem.userData.hingeGizmo = "axis";
  root.add(stem);

  const tipGeo = new THREE.ConeGeometry(0.11, 0.3, 10);
  const tipPos = new THREE.Mesh(tipGeo, tipMat);
  tipPos.position.y = 1.3;
  tipPos.renderOrder = 31;
  tipPos.userData.hingeGizmo = "axis";
  root.add(tipPos);
  const tipNeg = new THREE.Mesh(tipGeo, tipMat);
  tipNeg.position.y = -1.3;
  tipNeg.rotation.x = Math.PI;
  tipNeg.renderOrder = 31;
  tipNeg.userData.hingeGizmo = "axis";
  root.add(tipNeg);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.06, 10, RING_SEGMENTS),
    ringMat,
  );
  // Torus default lies in XY; rotate to XZ so plane ⊥ local Y (joint axis).
  ring.rotation.x = Math.PI / 2;
  ring.renderOrder = 32;
  ring.userData.hingeGizmo = "ring";
  root.add(ring);

  const circlePts: THREE.Vector3[] = [];
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    const a = (i / RING_SEGMENTS) * Math.PI * 2;
    circlePts.push(new THREE.Vector3(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1));
  }
  const circle = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(circlePts),
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
      toneMapped: false,
    }),
  );
  circle.renderOrder = 33;
  circle.raycast = () => {};
  root.add(circle);

  const shaftGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6);
  const headGeo = new THREE.ConeGeometry(0.09, 0.22, 8);

  const addArrow = (dir: THREE.Vector3, mat: THREE.Material) => {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(shaftGeo, mat);
    shaft.position.y = 0.45;
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 1.0;
    g.add(shaft, head);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.traverse((o) => {
      o.renderOrder = 34;
      o.userData.hingeGizmo = "ring";
    });
    root.add(g);
    return g;
  };

  // Tangential arrows in the rotation plane (local X / Z).
  addArrow(new THREE.Vector3(1, 0, 0), arrowMatA);
  addArrow(new THREE.Vector3(0, 0, 1), arrowMatB);
  addArrow(new THREE.Vector3(-1, 0, 0), arrowMatA);
  addArrow(new THREE.Vector3(0, 0, -1), arrowMatB);

  let currentAxis: EmberVoxelJointAxis = "x";
  const hingePos = new THREE.Vector3();
  const plane = new THREE.Plane();
  const hitPoint = new THREE.Vector3();

  const orientRoot = (axis: EmberVoxelJointAxis) => {
    const { axis: a } = axisBasis(axis);
    root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a);
  };

  const api: HingeGizmoApi = {
    root,
    setPose(worldPos, axis, scale) {
      currentAxis = axis;
      hingePos.set(worldPos.x, worldPos.y, worldPos.z);
      root.position.copy(hingePos);
      orientRoot(axis);
      root.scale.setScalar(Math.max(0.55, scale));
      const col = AXIS_COLOR[axis];
      stemMat.color.setHex(col);
      tipMat.color.setHex(col);
      ringMat.color.setHex(col);
      (circle.material as THREE.LineBasicMaterial).color.setHex(col);
      const { axis: a } = axisBasis(axis);
      plane.setFromNormalAndCoplanarPoint(a, hingePos);
    },
    setVisible(v) {
      root.visible = v;
    },
    setHighlight(on) {
      ringMat.opacity = on ? 1 : 0.75;
    },
    pick(raycaster) {
      if (!root.visible) return null;
      const hits = raycaster.intersectObject(root, true);
      for (const h of hits) {
        const kind = h.object.userData.hingeGizmo as HingeGizmoHit | undefined;
        if (kind === "ring" || kind === "axis") return kind;
      }
      return null;
    },
    planeAngleAt(worldPoint) {
      const { u, v } = axisBasis(currentAxis);
      const d = worldPoint.clone().sub(hingePos);
      return Math.atan2(d.dot(v), d.dot(u));
    },
    intersectPlane(raycaster) {
      const hit = raycaster.ray.intersectPlane(plane, hitPoint);
      return hit ? hitPoint.clone() : null;
    },
    dispose() {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
        }
      });
      stemMat.dispose();
      ringMat.dispose();
      tipMat.dispose();
      arrowMatA.dispose();
      arrowMatB.dispose();
      (circle.material as THREE.Material).dispose();
    },
  };

  return api;
}
