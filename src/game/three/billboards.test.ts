import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  billboardChannelFingerprint,
  applySpriteWorldPosition,
  disposeYawBillboard,
  trackBillboardTexture,
  transferBillboardTextureLeases,
} from "./billboards";

describe("billboard texture lifetime", () => {
  it("maps authored sprite X/Y/Z voxel offsets onto Three world axes", () => {
    const object = new THREE.Object3D();
    applySpriteWorldPosition(
      object,
      { worldOffsetVoxels: { x: 2, y: -4, z: 8 } },
      16,
      100,
      20,
      200,
    );
    expect(object.position.toArray()).toEqual([102, 28, 196]);
  });

  it("retains one lease per mesh and transfers template ownership", () => {
    const texture = new THREE.Texture();
    const template = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    let releases = 0;
    expect(
      trackBillboardTexture(template, texture, () => {
        releases += 1;
      }),
    ).toBe(true);
    expect(trackBillboardTexture(template, texture, () => undefined)).toBe(
      false,
    );

    const instance = new THREE.InstancedMesh(
      template.geometry,
      template.material,
      4,
    );
    transferBillboardTextureLeases(template, instance);
    disposeYawBillboard(instance);
    expect(releases).toBe(1);
  });

  it("invalidates the sprite cache when the full pixel color changes", () => {
    expect(billboardChannelFingerprint(["#1a0000ff"]))
      .not.toBe(billboardChannelFingerprint(["#1f0000ff"]));
  });
});
