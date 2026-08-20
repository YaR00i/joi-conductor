import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { RuntimeBillboardBatches } from "./runtimeBillboardInstancing";

function template(): THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  const texture = new THREE.Texture();
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  mesh.scale.set(8, 12, 1);
  mesh.castShadow = true;
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial();
  mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial({ map: texture });
  return mesh;
}

describe("RuntimeBillboardBatches", () => {
  it("renders equal visual keys in one dense InstancedMesh", () => {
    const root = new THREE.Group();
    const batches = new RuntimeBillboardBatches(root, 8);
    const a = new THREE.Object3D();
    const b = new THREE.Object3D();
    a.position.set(1, 2, 3);
    b.position.set(4, 5, 6);

    const ha = batches.add("walker", a, template);
    const hb = batches.add("walker", b, template);
    expect(root.children).toHaveLength(1);

    expect(batches.sync(new THREE.PerspectiveCamera())).toBe(true);
    const mesh = root.children[0] as THREE.InstancedMesh;
    expect(mesh.count).toBe(2);
    expect(batches.stats()).toEqual({ batches: 1, instances: 2 });
    batches.remove(ha);
    expect(hb.slot).toBe(0);
    expect(mesh.count).toBe(1);
    expect(batches.stats().instances).toBe(1);
    batches.dispose();
    expect(root.children).toHaveLength(0);
  });

  it("creates one batch per visual key", () => {
    const root = new THREE.Group();
    const batches = new RuntimeBillboardBatches(root, 8);
    batches.add("walker", new THREE.Object3D(), template);
    batches.add("runner", new THREE.Object3D(), template);

    expect(root.children).toHaveLength(2);
    expect(batches.stats()).toEqual({ batches: 2, instances: 2 });
    batches.dispose();
  });
});
