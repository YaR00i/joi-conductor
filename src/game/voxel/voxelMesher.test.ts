import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { previewVoxelPaletteColor } from "./voxelMesher";

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
