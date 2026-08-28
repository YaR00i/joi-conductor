import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  localShadowDebugSourceId,
  localShadowDebugStatus,
} from "./localShadowDebugOverlay";

describe("local shadow debug overlay", () => {
  it("distinguishes recook, baked, warming, and fill-only lights", () => {
    const dynamic = new THREE.PointLight();
    dynamic.userData.emberShadowGranted = true;
    const baked = new THREE.PointLight();
    baked.userData.emberShadowGranted = true;
    baked.userData.emberStaticShadowCached = true;
    const warming = new THREE.PointLight();
    warming.userData.emberShadowGranted = true;
    const fill = new THREE.PointLight();
    fill.userData.emberShadowRequested = true;
    const noShadow = new THREE.PointLight();
    const active = new Set([dynamic]);

    expect(localShadowDebugStatus(dynamic, active)).toBe("dynamic");
    expect(localShadowDebugStatus(baked, active)).toBe("baked");
    expect(localShadowDebugStatus(warming, active)).toBe("warming");
    expect(localShadowDebugStatus(fill, active)).toBe("no-shadow");
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
