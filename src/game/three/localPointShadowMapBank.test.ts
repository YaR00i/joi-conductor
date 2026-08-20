import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { LocalPointShadowMapBank } from "./localPointShadowMapBank";

function requestedLight(): THREE.PointLight {
  const light = new THREE.PointLight(0xffffff, 1, 64);
  light.userData.emberShadowRequested = true;
  return light;
}

describe("LocalPointShadowMapBank", () => {
  it("restores a saved static map after a light leaves dynamic mode", () => {
    const light = requestedLight();
    const staticMap = new THREE.WebGLRenderTarget(64, 32);
    const dynamicMap = new THREE.WebGLRenderTarget(64, 32);
    const bank = new LocalPointShadowMapBank(1);
    bank.replaceLights([light]);
    bank.prepareStaticBatch([light]);
    light.shadow.map = staticMap;
    bank.captureStaticBatch([light]);

    bank.applyAssignments([light], [light]);
    expect(light.shadow.map).toBeNull();
    light.shadow.map = dynamicMap;
    expect(bank.isDynamic(light)).toBe(true);

    bank.applyAssignments([light], []);
    expect(light.shadow.map).toBe(staticMap);
    expect(bank.stats().pooledDynamic).toBe(1);
    bank.dispose();
  });

  it("reuses a released dynamic target for the next selected light", () => {
    const first = requestedLight();
    const second = requestedLight();
    const firstStatic = new THREE.WebGLRenderTarget(64, 32);
    const secondStatic = new THREE.WebGLRenderTarget(64, 32);
    const dynamicMap = new THREE.WebGLRenderTarget(64, 32);
    const bank = new LocalPointShadowMapBank(1);
    bank.replaceLights([first, second]);
    bank.prepareStaticBatch([first, second]);
    first.shadow.map = firstStatic;
    second.shadow.map = secondStatic;
    bank.captureStaticBatch([first, second]);

    bank.applyAssignments([first, second], [first]);
    first.shadow.map = dynamicMap;
    bank.applyAssignments([first, second], [second]);

    expect(first.shadow.map).toBe(firstStatic);
    expect(second.shadow.map).toBe(dynamicMap);
    bank.dispose();
  });

  it("disposes detached static and pooled dynamic targets", () => {
    const light = requestedLight();
    const staticMap = new THREE.WebGLRenderTarget(64, 32);
    const dynamicMap = new THREE.WebGLRenderTarget(64, 32);
    const staticDispose = vi.spyOn(staticMap, "dispose");
    const dynamicDispose = vi.spyOn(dynamicMap, "dispose");
    const bank = new LocalPointShadowMapBank(1);
    bank.replaceLights([light]);
    bank.prepareStaticBatch([light]);
    light.shadow.map = staticMap;
    bank.captureStaticBatch([light]);
    bank.applyAssignments([light], [light]);
    light.shadow.map = dynamicMap;
    bank.applyAssignments([light], []);

    bank.dispose();
    expect(staticDispose).toHaveBeenCalledOnce();
    expect(dynamicDispose).toHaveBeenCalledOnce();
  });

  it("keeps every registered light sampled even if the active list is a subset", () => {
    const first = requestedLight();
    const second = requestedLight();
    const firstStatic = new THREE.WebGLRenderTarget(64, 32);
    const secondStatic = new THREE.WebGLRenderTarget(64, 32);
    const bank = new LocalPointShadowMapBank(1);
    bank.replaceLights([first, second]);
    bank.prepareStaticBatch([first, second]);
    first.shadow.map = firstStatic;
    second.shadow.map = secondStatic;
    bank.captureStaticBatch([first, second]);

    bank.applyAssignments([first], []);

    expect(first.castShadow).toBe(true);
    expect(second.castShadow).toBe(true);
    expect(first.shadow.map).toBe(firstStatic);
    expect(second.shadow.map).toBe(secondStatic);
    expect(bank.stats().active).toBe(2);
    bank.dispose();
  });

  it("keeps already-cached lights sampled while a later static batch bakes", () => {
    const first = requestedLight();
    const second = requestedLight();
    const firstStatic = new THREE.WebGLRenderTarget(64, 32);
    const bank = new LocalPointShadowMapBank(1);
    bank.replaceLights([first, second]);
    bank.prepareStaticBatch([first]);
    first.shadow.map = firstStatic;
    bank.captureStaticBatch([first]);

    bank.prepareStaticBatch([second]);

    expect(first.castShadow).toBe(true);
    expect(first.shadow.map).toBe(firstStatic);
    expect(first.shadow.needsUpdate).toBe(false);
    expect(second.castShadow).toBe(true);
    expect(second.shadow.needsUpdate).toBe(true);
    bank.dispose();
  });

  it("drops stale GPU targets on context restore and keeps lights registered", () => {
    const light = requestedLight();
    const staticMap = new THREE.WebGLRenderTarget(64, 32);
    const staticDispose = vi.spyOn(staticMap, "dispose");
    const bank = new LocalPointShadowMapBank(1);
    bank.replaceLights([light]);
    bank.prepareStaticBatch([light]);
    light.shadow.map = staticMap;
    bank.captureStaticBatch([light]);
    bank.applyAssignments([light], []);

    bank.resetGpuResources();

    expect(staticDispose).toHaveBeenCalledOnce();
    expect(light.shadow.map).toBeNull();
    expect(light.castShadow).toBe(false);
    expect(bank.stats()).toMatchObject({ cached: 0, dirty: 1, active: 0 });
    expect(bank.dirtyLights()).toEqual([light]);
    bank.dispose();
  });
});
