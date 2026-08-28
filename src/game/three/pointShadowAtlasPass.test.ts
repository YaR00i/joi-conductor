import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { POINT_SHADOW_SHADER_SLOTS } from "./pointShadowAtlas";
import { pointShadowDynamicCacheId } from "./pointShadowAtlasGpu";
import {
  hideNonShadowCasterMeshes,
  lightsByPointShadowCacheId,
  advancePointShadowAtlasSlots,
  assignPointShadowBakeMaterials,
  pointShadowAtlasCandidatesFor,
  restoreHiddenMeshes,
  suspendSceneForPointShadowBake,
} from "./pointShadowAtlasPass";

describe("point shadow atlas pass", () => {
  it("ranks closer lamps with a lower influence score", () => {
    const near = new THREE.PointLight(0xffffff, 1, 32);
    near.userData.emberEmissiveSourceId = "near";
    near.position.set(2, 4, 0);
    const far = new THREE.PointLight(0xffffff, 1, 32);
    far.userData.emberEmissiveSourceId = "far";
    far.position.set(80, 4, 0);
    const focus = new THREE.Vector3(0, 0, 0);
    const ranked = pointShadowAtlasCandidatesFor([far, near], focus);
    expect(ranked[0]?.id).toBe("far");
    expect(ranked[1]?.id).toBe("near");
    expect(ranked[1]!.score).toBeLessThan(ranked[0]!.score);
  });

  it("assigns the same sticky slots for the same lights and focus", () => {
    const near = new THREE.PointLight(0xffffff, 1, 32);
    near.userData.emberEmissiveSourceId = "near";
    near.position.set(2, 4, 0);
    const far = new THREE.PointLight(0xffffff, 1, 32);
    far.userData.emberEmissiveSourceId = "far";
    far.position.set(80, 4, 0);
    const focus = new THREE.Vector3(0, 0, 0);
    const first = advancePointShadowAtlasSlots([], [far, near], focus, 2);
    const again = advancePointShadowAtlasSlots(first, [far, near], focus, 2);
    expect(first[0]).toBe("near");
    expect(first[1]).toBe("far");
    expect(again).toEqual(first);
  });

  it("maps lights by the same cache id the bank uses", () => {
    const light = new THREE.PointLight();
    light.userData.emberLamp = { sourceId: "lamp-a" };
    const map = lightsByPointShadowCacheId([light]);
    expect(map.get("lamp-a")).toBe(light);
    expect(pointShadowDynamicCacheId("lamp-a")).toBe("lamp-a#dyn");
  });

  it("hides meshes that do not cast shadows and restores them", () => {
    const scene = new THREE.Scene();
    const caster = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    caster.castShadow = true;
    const filler = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    filler.castShadow = false;
    scene.add(caster, filler);
    const hidden = hideNonShadowCasterMeshes(scene);
    expect(filler.visible).toBe(false);
    expect(caster.visible).toBe(true);
    restoreHiddenMeshes(hidden);
    expect(filler.visible).toBe(true);
  });

  it("keeps shader slot count at compile-time 8", () => {
    expect(POINT_SHADOW_SHADER_SLOTS).toBe(8);
  });

  it("clears scene background so packed depth is not filled with the sky color", () => {
    const scene = new THREE.Scene();
    const sky = new THREE.Color(0x0c0a10);
    const fog = new THREE.FogExp2(0x0c0a10, 0.02);
    scene.background = sky;
    scene.fog = fog;
    const restore = suspendSceneForPointShadowBake(scene);
    expect(scene.background).toBeNull();
    expect(scene.fog).toBeNull();
    restore();
    expect(scene.background).toBe(sky);
    expect(scene.fog).toBe(fog);
  });

  it("gives InstancedMesh a separate distance material and restores both", () => {
    const scene = new THREE.Scene();
    const meshMat = new THREE.MeshBasicMaterial();
    const instMat = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), meshMat);
    mesh.castShadow = true;
    const inst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      instMat,
      2,
    );
    inst.castShadow = true;
    scene.add(mesh, inst);
    const restore = assignPointShadowBakeMaterials(scene);
    expect(mesh.material).not.toBe(meshMat);
    expect(inst.material).not.toBe(instMat);
    expect(mesh.material).not.toBe(inst.material);
    expect((mesh.material as THREE.Material).type).toBe("MeshDistanceMaterial");
    expect((inst.material as THREE.Material).type).toBe("MeshDistanceMaterial");
    restore();
    expect(mesh.material).toBe(meshMat);
    expect(inst.material).toBe(instMat);
  });
});
