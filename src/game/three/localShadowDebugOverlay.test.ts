import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  localShadowDebugSourceId,
  localShadowDebugStatus,
} from "./localShadowDebugOverlay";

describe("local shadow debug overlay", () => {
  it("distinguishes active, cached, warming, and unshadowed lights", () => {
    const dynamic = new THREE.PointLight();
    dynamic.castShadow = true;
    const baked = new THREE.PointLight();
    baked.castShadow = true;
    const cached = new THREE.PointLight();
    cached.userData.emberShadowRequested = true;
    cached.userData.emberStaticShadowCached = true;
    const warming = new THREE.PointLight();
    warming.userData.emberShadowRequested = true;
    const noShadow = new THREE.PointLight();
    const active = new Set([dynamic]);

    expect(localShadowDebugStatus(dynamic, active)).toBe("dynamic");
    expect(localShadowDebugStatus(baked, active)).toBe("baked");
    expect(localShadowDebugStatus(cached, active)).toBe("cached");
    expect(localShadowDebugStatus(warming, active)).toBe("warming");
    expect(localShadowDebugStatus(noShadow, active)).toBe("no-shadow");
  });

  it("uses authored source IDs in marker labels", () => {
    const lamp = new THREE.PointLight();
    lamp.userData.emberLamp = { sourceId: "street-lamp-4" };
    const emissive = new THREE.PointLight();
    emissive.userData.emberEmissiveSourceId = "voxel-window-2";

    expect(localShadowDebugSourceId(lamp, 0)).toBe("street-lamp-4");
    expect(localShadowDebugSourceId(emissive, 1)).toBe("voxel-window-2");
    expect(localShadowDebugSourceId(new THREE.PointLight(), 2)).toBe(
      "local-3",
    );
  });
});
