import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { layoutPointShadowAtlas } from "./pointShadowAtlas";
import {
  PointShadowAtlasGpu,
  pointShadowLightCacheId,
} from "./pointShadowAtlasGpu";
import { LocalPointShadowMapBank } from "./localPointShadowMapBank";
import { localShadowDebugSourceId } from "./localShadowDebugOverlay";

function requestedLight(id: string): THREE.PointLight {
  const light = new THREE.PointLight(0xffffff, 1, 64);
  light.userData.emberEmissiveSourceId = id;
  light.userData.emberShadowRequested = true;
  return light;
}

describe("point shadow atlas GPU", () => {
  it("matches debug overlay source ids", () => {
    const light = requestedLight("voxel-lamp-3");
    expect(pointShadowLightCacheId(light, 9)).toBe("voxel-lamp-3");
    expect(pointShadowLightCacheId(light, 9)).toBe(
      localShadowDebugSourceId(light, 9),
    );
  });

  it("adopts a Three cube map without disposing it", () => {
    const layout = layoutPointShadowAtlas(8, 64, 2048);
    const gpu = new PointShadowAtlasGpu(layout);
    const baked = new THREE.WebGLRenderTarget(
      layout.tileWidth,
      layout.tileHeight,
    );
    const dispose = vi.spyOn(baked, "dispose");
    gpu.adoptCacheTile("lamp", baked);
    expect(gpu.hasCacheTile("lamp")).toBe(true);
    gpu.dispose();
    expect(dispose).not.toHaveBeenCalled();
    baked.dispose();
  });

  it("disposes owned cache tiles and the atlas", () => {
    const layout = layoutPointShadowAtlas(8, 64, 2048);
    const gpu = new PointShadowAtlasGpu(layout);
    const atlas = gpu.ensureAtlas();
    const tile = gpu.ensureCacheTile("owned");
    const atlasDispose = vi.spyOn(atlas, "dispose");
    const tileDispose = vi.spyOn(tile, "dispose");
    gpu.dispose();
    expect(atlasDispose).toHaveBeenCalledOnce();
    expect(tileDispose).toHaveBeenCalledOnce();
    expect(gpu.atlasTarget()).toBeNull();
  });

  it("clears unfilled atlas texels to far-depth white once", () => {
    const layout = layoutPointShadowAtlas(8, 64, 2048);
    const gpu = new PointShadowAtlasGpu(layout);
    const cleared: number[] = [];
    const renderer = {
      getRenderTarget: () => null,
      setRenderTarget: () => undefined,
      getClearAlpha: () => 1,
      getClearColor: () => undefined,
      setClearColor: (color: number) => {
        cleared.push(color);
      },
      clear: () => undefined,
    } as unknown as THREE.WebGLRenderer;
    gpu.clearAtlas(renderer);
    gpu.clearAtlas(renderer);
    expect(cleared[0]).toBe(0xffffff);
    expect(cleared).toHaveLength(2);
    gpu.dispose();
  });

  it("blits assigned tiles into atlas slots without toggling castShadow", () => {
    const layout = layoutPointShadowAtlas(8, 64, 2048);
    const gpu = new PointShadowAtlasGpu(layout);
    const light = requestedLight("lamp-a");
    gpu.ensureCacheTile("lamp-a");
    const copies: Array<{ destX: number; destY: number }> = [];
    const copied = gpu.blitSlots(["lamp-a", null, "missing"], (_s, _d, x, y) => {
      copies.push({ destX: x, destY: y });
    });
    expect(copied).toBe(1);
    expect(copies).toEqual([{ destX: 0, destY: 0 }]);
    expect(light.castShadow).toBe(false);
    gpu.dispose();
  });
});

describe("shadow bank atlas capture", () => {
  it("marks a self-baked cache tile cached without enabling castShadow", () => {
    const light = requestedLight("street");
    const bank = new LocalPointShadowMapBank(0);
    const layout = layoutPointShadowAtlas(8, 64, 2048);
    const gpu = bank.enableAtlas(layout);
    bank.replaceLights([light]);
    gpu.ensureCacheTile("street");
    bank.prepareStaticBatch([light]);
    bank.captureStaticBatch([light]);

    expect(light.castShadow).toBe(false);
    expect(bank.isCached(light)).toBe(true);
    expect(bank.stats().atlasTiles).toBe(1);
    expect(bank.dirtyLights()).toEqual([]);
    bank.dispose();
  });

  it("never re-enables castShadow while the atlas is on", () => {
    const light = requestedLight("street");
    const bank = new LocalPointShadowMapBank(1);
    bank.enableAtlas(layoutPointShadowAtlas(8, 64, 2048));
    bank.replaceLights([light]);
    bank.prepareStaticBatch([light]);
    bank.applyAssignments([light], [light]);
    expect(light.castShadow).toBe(false);
    bank.dispose();
  });
});
