import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  buildVoxelModelMesh,
  disposeVoxelModelMesh,
  previewVoxelPaletteColor,
} from "./voxelMesher";
import {
  createEmptyVoxelModel,
  getVoxelTransmittance,
  normalizeVoxelModel,
  setVoxel,
  setVoxelTransmittance,
  setVoxelTransparency,
  voxelTransmittanceLeak,
  voxelTransmittanceShadowParams,
} from "./voxelModel";

vi.mock("../three/envMap", () => ({
  getEmberEnvMap: () => null,
}));

vi.mock("../three/toonMaterials", () => ({
  getToonGradientMap: () => null,
}));

function taggedMaterial(
  paletteIndex: number,
  color: string,
  emissive = false,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: emissive ? color : "#000000",
  });
  material.userData.emberVoxelPaletteIndex = paletteIndex;
  material.userData.emberVoxelHasEmissiveColor = emissive;
  return material;
}

describe("previewVoxelPaletteColor", () => {
  it("updates only materials belonging to the requested palette slot", () => {
    const root = new THREE.Group();
    const target = taggedMaterial(1, "#112233");
    const untouched = taggedMaterial(2, "#445566");
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), target));
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), untouched));

    previewVoxelPaletteColor(root, 1, "#abcdef");

    expect(target.color.r).toBeCloseTo(0xab / 255);
    expect(target.color.g).toBeCloseTo(0xcd / 255);
    expect(target.color.b).toBeCloseTo(0xef / 255);
    expect(untouched.color.getHexString()).toBe("445566");
  });

  it("keeps emissive ink aligned with its previewed base color", () => {
    const root = new THREE.Group();
    const target = taggedMaterial(3, "#220000", true);
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), target));

    previewVoxelPaletteColor(root, 3, "#33cc77");

    expect(target.color.r).toBeCloseTo(0x33 / 255);
    expect(target.color.g).toBeCloseTo(0xcc / 255);
    expect(target.color.b).toBeCloseTo(0x77 / 255);
    expect(target.emissive.r).toBeCloseTo(0x33 / 255);
    expect(target.emissive.g).toBeCloseTo(0xcc / 255);
    expect(target.emissive.b).toBeCloseTo(0x77 / 255);
  });
});

function voxelMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) out.push(obj);
  });
  return out;
}

function faceCount(mesh: THREE.Mesh): number {
  const idx = mesh.geometry.getIndex();
  return idx ? idx.count / 6 : 0;
}

describe("voxel transmittance", () => {
  it("looks opaque but does not cast shadow", () => {
    let model = createEmptyVoxelModel("tx", { x: 1, y: 1, z: 1 }, "t", 2);
    model = setVoxel(model, 1, 0, 1, 1);
    model = setVoxelTransmittance(model, 1, 0, 1, 255);
    const { group } = buildVoxelModelMesh(model, 1);
    const meshes = voxelMeshes(group);
    expect(meshes).toHaveLength(1);
    const mesh = meshes[0]!;
    const mat = mesh.material as THREE.MeshToonMaterial;
    expect(mesh.castShadow).toBe(false);
    expect(mesh.customDepthMaterial).toBeUndefined();
    expect(mat.transparent).toBe(false);
    expect(mat.opacity).toBe(1);
    disposeVoxelModelMesh(group);
  });

  it("keeps neighboring solid cells casting full shadows", () => {
    let model = createEmptyVoxelModel("tx2", { x: 1, y: 1, z: 1 }, "t", 2);
    model = setVoxel(model, 1, 0, 1, 1);
    model = setVoxelTransmittance(model, 1, 0, 1, 128);
    model = setVoxel(model, 4, 0, 1, 2);
    const { group } = buildVoxelModelMesh(model, 1);
    const meshes = voxelMeshes(group);
    expect(meshes).toHaveLength(2);
    expect(meshes.every((m) => m.castShadow)).toBe(true);
    expect(meshes.every((m) => m.customDistanceMaterial == null)).toBe(true);
    disposeVoxelModelMesh(group);
  });

  it("still seals neighbor faces like an opaque cell", () => {
    let model = createEmptyVoxelModel("tx3", { x: 1, y: 1, z: 1 }, "t", 2);
    model = setVoxel(model, 1, 0, 1, 1);
    model = setVoxelTransmittance(model, 1, 0, 1, 255);
    model = setVoxel(model, 2, 0, 1, 1);
    const { group } = buildVoxelModelMesh(model, 1);
    const meshes = voxelMeshes(group);
    const faces = meshes.reduce((n, m) => n + faceCount(m), 0);
    expect(faces).toBe(10);
    disposeVoxelModelMesh(group);
  });

  it("is not the same as glass transparency", () => {
    let model = createEmptyVoxelModel("tx4", { x: 1, y: 1, z: 1 }, "t", 2);
    model = setVoxel(model, 1, 0, 1, 1);
    model = setVoxelTransparency(model, 1, 0, 1, 200);
    const { group } = buildVoxelModelMesh(model, 1);
    const mesh = voxelMeshes(group)[0]!;
    const mat = mesh.material as THREE.MeshToonMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeLessThan(1);
    expect(mesh.castShadow).toBe(false);
    disposeVoxelModelMesh(group);
  });

  it("round-trips through normalizeVoxelModel", () => {
    let model = createEmptyVoxelModel("tx5", { x: 1, y: 1, z: 1 }, "t", 2);
    model = setVoxel(model, 0, 0, 0, 1);
    model = setVoxelTransmittance(model, 0, 0, 0, 180);
    const next = normalizeVoxelModel(model);
    expect(getVoxelTransmittance(next, 0, 0, 0)).toBe(180);
  });

  it("leaks analog shadow from transmitting cells only", () => {
    let model = createEmptyVoxelModel("txLeak", { x: 1, y: 1, z: 1 }, "t", 2);
    expect(voxelTransmittanceLeak(model)).toBe(0);
    model = setVoxel(model, 0, 0, 0, 1);
    model = setVoxel(model, 1, 0, 0, 1);
    model = setVoxelTransmittance(model, 0, 0, 0, 128);
    expect(voxelTransmittanceLeak(model)).toBeCloseTo(128 / 255, 5);
    const soft = voxelTransmittanceShadowParams(voxelTransmittanceLeak(model));
    expect(soft.radius).toBeGreaterThan(0);
    expect(soft.intensity).toBeLessThan(1);
    expect(soft.intensity).toBeGreaterThan(0.12);
  });

  it("keeps hard umbra when leak is ~0", () => {
    expect(voxelTransmittanceShadowParams(0)).toEqual({
      radius: 0,
      intensity: 1,
    });
  });

  it("force-soft penumbra keeps a dark umbra", () => {
    const soft = voxelTransmittanceShadowParams(0, true);
    expect(soft.radius).toBeGreaterThanOrEqual(4.4);
    expect(soft.intensity).toBe(1);
  });

  it("persists per-lamp soft ring / soft shadow flags", () => {
    const model = createEmptyVoxelModel("softFlags", { x: 1, y: 1, z: 1 }, "t", 2);
    const next = normalizeVoxelModel({
      ...model,
      emissiveCastsLight: true,
      emissiveLightSoftRings: true,
      emissiveLightSoftShadows: true,
    });
    expect(next.emissiveLightSoftRings).toBe(true);
    expect(next.emissiveLightSoftShadows).toBe(true);
  });

  it("mid transmittance still casts without dither holes", () => {
    let model = createEmptyVoxelModel("tx6", { x: 1, y: 1, z: 1 }, "t", 2);
    model = setVoxel(model, 0, 0, 0, 1);
    model = setVoxelTransmittance(model, 0, 0, 0, 64);
    model = setVoxel(model, 3, 0, 0, 1);
    model = setVoxelTransmittance(model, 3, 0, 0, 192);
    const { group } = buildVoxelModelMesh(model, 1);
    const meshes = voxelMeshes(group);
    expect(meshes).toHaveLength(1);
    expect(meshes[0]!.castShadow).toBe(true);
    expect(meshes[0]!.customDistanceMaterial).toBeUndefined();
    disposeVoxelModelMesh(group);
  });
});
