import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { EmberVoxelModel } from "../content/types";
import {
  createEmptyMap,
  ensureMapLayers,
} from "../tile/mapUtils";
import {
  captureEmissiveLightRuntimeStates,
  restoreEmissiveLightRuntimeStates,
  tagEmissiveLight,
  tickEmissiveLights,
} from "./emissiveAnimTick";
import { updateYawBillboards } from "./billboards";
import { addThreeEmissiveLocalLights, countMapLocalLightObjects } from "./emissiveLocalLights";
import { tickTorchFlicker } from "./torchFlickerTick";

function taggedLight(id: string): THREE.PointLight {
  const light = new THREE.PointLight(0xffffff, 0, 12, 2);
  light.userData.emberEmissiveSourceId = id;
  tagEmissiveLight(light, {
    anim: "always",
    seed: 42,
    baseIntensity: 6,
    baseDistance: 12,
    torchFlicker: true,
    kind: "light",
  });
  return light;
}

describe("emissive local-light stability", () => {
  it("invalidates a billboard shadow only when its rendered pose changes", () => {
    const root = new THREE.Group();
    const actor = new THREE.Object3D();
    actor.userData.yawBillboard = true;
    root.add(actor);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(10, 8, 10);

    expect(updateYawBillboards(root, camera)).toBe(true);
    expect(updateYawBillboards(root, camera)).toBe(false);
    actor.position.x = 3;
    expect(updateYawBillboards(root, camera)).toBe(true);
  });

  it("keeps retained animation state across streamed-light rebuilds", () => {
    const previous = taggedLight("emvox:lamp-1");
    tickEmissiveLights([previous], {
      timeSec: 1.25,
      dt: 0.5,
      torchFlickerAmount: 0.8,
    });
    expect(previous.intensity).toBeGreaterThan(0);

    const states = captureEmissiveLightRuntimeStates([previous]);
    const rebuilt = taggedLight("emvox:lamp-1");
    expect(rebuilt.intensity).toBe(0);

    expect(restoreEmissiveLightRuntimeStates([rebuilt], states)).toBe(1);
    expect(rebuilt.intensity).toBe(previous.intensity);
    expect(rebuilt.distance).toBe(previous.distance);
  });

  it("keeps the cached cube projection stable during radius flicker", () => {
    const light = new THREE.PointLight(0xffffff, 5, 12, 2);
    light.castShadow = true;
    light.shadow.camera.far = 30;
    light.userData.emberLamp = {
      intensity: 5,
      distance: 12,
      torchFlicker: true,
      seed: 123,
    };

    tickTorchFlicker([light], { timeSec: 0.73, amount: 1, speed: 1 });
    expect(light.shadow.camera.far).toBe(30);
  });

  it("uses voxel-scale bias and a fixed shadow volume for emissive props", () => {
    const map = ensureMapLayers(createEmptyMap("light", 4, 4, "tiles", 16));
    map.voxelProps = [
      { id: "lamp-1", modelId: "lamp", x: 1, y: 1 },
      { id: "lamp-2", modelId: "lamp", x: 2, y: 1 },
    ];
    const lamp: EmberVoxelModel = {
      id: "lamp",
      sizeBlocks: { x: 1, y: 1, z: 1 },
      palette: ["", "#ffcc66"],
      voxels: [1],
      emissive: [255],
      emissiveCastsLight: true,
      emissiveLightShadows: true,
      emissiveLightRange: 2,
    };
    const root = new THREE.Group();
    const lights = addThreeEmissiveLocalLights(
      root,
      map,
      { id: "tiles", tileSize: 16, columns: 1, tileCount: 1, tiles: [] },
      undefined,
      {
        voxelModels: { lamp },
        shadows: true,
        maxLights: 4,
        maxShadows: 1,
      },
    );

    expect(lights).toHaveLength(2);
    const light = lights.find(
      (entry) => entry.userData.emberShadowGranted === true,
    )!;
    const budgetedOut = lights.find(
      (entry) => entry.userData.emberShadowGranted !== true,
    )!;
    expect(light.castShadow).toBe(false);
    expect(budgetedOut.castShadow).toBe(false);
    expect(light.userData.emberShadowRequested).toBe(true);
    expect(light.shadow.normalBias).toBeLessThanOrEqual(0.08);
    expect(light.shadow.camera.near).toBeLessThanOrEqual(0.2);
    expect(light.shadow.camera.far).toBeGreaterThanOrEqual(light.distance * 1.5);
    expect(budgetedOut.userData.emberShadowRequested).toBe(true);
  });

  it("keeps explore window fill off the cube budget when only lamps flicker", () => {
    const map = ensureMapLayers(createEmptyMap("flicker-shadows", 4, 4, "tiles", 16));
    map.voxelProps = [
      { id: "window", modelId: "window", x: 1, y: 1 },
      { id: "lamp", modelId: "lamp", x: 2, y: 1 },
    ];
    const windowModel: EmberVoxelModel = {
      id: "window",
      sizeBlocks: { x: 1, y: 1, z: 1 },
      palette: ["", "#ffcc66"],
      voxels: [1],
      emissive: [255],
      emissiveCastsLight: true,
      emissiveLightShadows: true,
      emissiveLightRange: 2,
    };
    const lamp: EmberVoxelModel = {
      id: "lamp",
      sizeBlocks: { x: 1, y: 1, z: 1 },
      palette: ["", "#ffcc66"],
      voxels: [1],
      emissive: [255],
      emissiveCastsLight: true,
      emissiveLightShadows: true,
      emissiveTorchFlicker: true,
      emissiveLightRange: 2,
    };
    const root = new THREE.Group();
    const lights = addThreeEmissiveLocalLights(
      root,
      map,
      { id: "tiles", tileSize: 16, columns: 1, tileCount: 1, tiles: [] },
      undefined,
      {
        voxelModels: { window: windowModel, lamp },
        shadows: true,
        maxLights: 4,
        maxShadows: 4,
        lampFlickerShadowsOnly: true,
      },
    );

    const lampLight = lights.find((entry) =>
      String(entry.userData.emberEmissiveSourceId).includes("lamp"),
    )!;
    const windowLight = lights.find((entry) =>
      String(entry.userData.emberEmissiveSourceId).includes("window"),
    )!;
    expect(lampLight.castShadow).toBe(false);
    expect(lampLight.userData.emberShadowGranted).toBe(true);
    expect(windowLight.castShadow).toBe(false);
    expect(windowLight.userData.emberShadowGranted).toBe(false);
    expect(windowLight.userData.emberShadowRequested).toBe(false);
  });

  it("counts authored lanterns and emissive light objects on the map", () => {
    const map = ensureMapLayers(
      createEmptyMap("light-objects", 8, 8, "tiles", 16),
    );
    map.lights = [
      { id: "a", x: 1, y: 1, enabled: true },
      { id: "b", x: 2, y: 2, enabled: true },
    ];
    const lamp: EmberVoxelModel = {
      id: "lamp",
      sizeBlocks: { x: 1, y: 1, z: 1 },
      palette: ["", "#ffcc66"],
      voxels: [1],
      emissive: [255],
      emissiveCastsLight: true,
      emissiveLightShadows: true,
      emissiveLightRange: 2,
    };
    map.voxelProps = [
      { id: "p1", modelId: "lamp", x: 3, y: 3 },
      { id: "p2", modelId: "lamp", x: 4, y: 4 },
    ];

    expect(
      countMapLocalLightObjects(
        map,
        { id: "tiles", tileSize: 16, columns: 1, tileCount: 1, tiles: [] },
        { voxelModels: { lamp } },
      ),
    ).toBe(4);
  });
});
