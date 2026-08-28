import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { layoutPointShadowAtlas } from "./pointShadowAtlas";
import { LocalPointShadowMapBank } from "./localPointShadowMapBank";

function requestedLight(): THREE.PointLight {
  const light = new THREE.PointLight(0xffffff, 1, 64);
  light.userData.emberShadowRequested = true;
  light.userData.emberShadowGranted = true;
  return light;
}

function atlasBank(dynamicLimit = 0): LocalPointShadowMapBank {
  const bank = new LocalPointShadowMapBank(dynamicLimit);
  bank.enableAtlas(layoutPointShadowAtlas(8, 64, 2048));
  return bank;
}

describe("LocalPointShadowMapBank", () => {
  it("never enables PointLight.castShadow on the atlas path", () => {
    const light = requestedLight();
    const bank = atlasBank(1);
    bank.replaceLights([light]);
    bank.prepareStaticBatch([light]);
    bank.applyAssignments([light], [light]);
    expect(light.castShadow).toBe(false);
    expect(light.shadow.map).toBeNull();
    bank.dispose();
  });

  it("marks a light cached only after its atlas tile exists", () => {
    const light = requestedLight();
    const bank = atlasBank();
    const gpu = bank.atlas()!;
    bank.replaceLights([light]);
    bank.prepareStaticBatch([light]);
    bank.captureStaticBatch([light]);
    expect(bank.isCached(light)).toBe(false);
    expect(bank.dirtyLights()).toEqual([light]);

    gpu.ensureCacheTile(bank.cacheIdFor(light));
    bank.captureStaticBatch([light]);
    expect(bank.isCached(light)).toBe(true);
    expect(bank.dirtyLights()).toEqual([]);
    expect(light.castShadow).toBe(false);
    bank.dispose();
  });

  it("tracks the actor-aware recook set without swapping cube maps", () => {
    const first = requestedLight();
    const second = requestedLight();
    const bank = atlasBank(1);
    bank.replaceLights([first, second]);
    bank.applyAssignments([first, second], [first]);
    expect(bank.isDynamic(first)).toBe(true);
    expect(bank.isDynamic(second)).toBe(false);

    bank.applyAssignments([first, second], [second]);
    expect(bank.isDynamic(first)).toBe(false);
    expect(bank.isDynamic(second)).toBe(true);
    expect(first.castShadow).toBe(false);
    expect(second.castShadow).toBe(false);
    expect(first.shadow.map).toBeNull();
    expect(second.shadow.map).toBeNull();
    bank.dispose();
  });

  it("disposes atlas tiles on reset and keeps lights registered dirty", () => {
    const light = requestedLight();
    const bank = atlasBank();
    const gpu = bank.atlas()!;
    bank.replaceLights([light]);
    const tile = gpu.ensureCacheTile(bank.cacheIdFor(light));
    const tileDispose = vi.spyOn(tile, "dispose");
    bank.captureStaticBatch([light]);
    expect(bank.isCached(light)).toBe(true);

    bank.resetGpuResources();
    expect(tileDispose).toHaveBeenCalledOnce();
    expect(light.castShadow).toBe(false);
    expect(light.shadow.map).toBeNull();
    expect(bank.stats()).toMatchObject({ cached: 0, dirty: 1, atlasTiles: 0 });
    expect(bank.dirtyLights()).toEqual([light]);
    bank.dispose();
  });
});
