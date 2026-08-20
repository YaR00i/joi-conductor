import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createInteractiveOutline } from "./interactiveOutline";

describe("interactive voxel outline", () => {
  it("attaches edges to every real mesh instead of drawing one target AABB", () => {
    const parent = new THREE.Group();
    const target = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.7));
    lid.position.set(0, 0.8, 0);
    target.add(base, lid);
    parent.add(target);

    const outline = createInteractiveOutline(
      target,
      { enabled: true, color: "#ff0000" },
      parent,
    );

    expect(outline).not.toBeNull();
    expect(base.children.some((child) => child instanceof THREE.LineSegments)).toBe(true);
    expect(lid.children.some((child) => child instanceof THREE.LineSegments)).toBe(true);
    expect(outline!.root.children).toHaveLength(0);

    outline!.dispose();
    expect(base.children).toHaveLength(0);
    expect(lid.children).toHaveLength(0);
  });

  it("keeps animated object transforms as the parent of their edge geometry", () => {
    const parent = new THREE.Group();
    const target = new THREE.Group();
    const hinge = new THREE.Group();
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 1));
    hinge.add(lid);
    target.add(hinge);
    parent.add(target);
    const outline = createInteractiveOutline(target, { enabled: true }, parent)!;
    const lines = lid.children.find(
      (child): child is THREE.LineSegments => child instanceof THREE.LineSegments,
    );

    hinge.rotation.x = Math.PI / 3;
    target.updateMatrixWorld(true);

    expect(lines).toBeDefined();
    expect(lines!.matrixWorld.equals(lid.matrixWorld)).toBe(true);
    outline.dispose();
  });
});
