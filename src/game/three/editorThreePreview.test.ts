import { describe, expect, it } from "vitest";
import type {
  EmberMap,
  EmberPack,
  EmberPixelSprite,
  EmberVoxelModel,
} from "../content/types";
import { packAssetsSignature } from "./editorThreePreview";

const model: EmberVoxelModel = {
  id: "lamp",
  sizeBlocks: { x: 1, y: 1, z: 1 },
  palette: ["", "#ffffff"],
  voxels: [1],
  emissive: [255],
  emissiveCastsLight: true,
};

const map = {
  voxelProps: [{ id: "placed-lamp", modelId: model.id, x: 0, y: 0 }],
  regions: [],
  sprites: [],
} as unknown as EmberMap;

function packWithModel(nextModel: EmberVoxelModel): EmberPack {
  return {
    voxelModels: { [nextModel.id]: nextModel },
    voxelScenes: {},
    sprites: {},
  } as unknown as EmberPack;
}

const sprite: EmberPixelSprite = {
  id: "window",
  width: 2,
  topHeight: 2,
  wallHeights: [],
  pixels: ["#ffffff", "", "", "#ffffff"],
  emissivePixels: ["#ffcc66", "", "", ""],
  color: "#ffffff",
  emissiveCastsLight: true,
};

const spriteMap = {
  voxelProps: [],
  regions: [],
  sprites: [{ id: "placed-window", spriteId: sprite.id, x: 0, y: 0 }],
} as unknown as EmberMap;

function packWithSprite(nextSprite: EmberPixelSprite): EmberPack {
  return {
    voxelModels: {},
    voxelScenes: {},
    sprites: { [nextSprite.id]: nextSprite },
  } as unknown as EmberPack;
}

describe("editor pack asset signature", () => {
  it("invalidates the map preview for voxel light parameter changes", () => {
    const base = packAssetsSignature(map, packWithModel(model));
    const changedModels: EmberVoxelModel[] = [
      { ...model, emissiveLightRange: 4 },
      { ...model, emissiveLightShadows: true },
      { ...model, emissiveLights: [{ id: "el_b", origin: { x: 1, y: 2, z: 3 } }] },
      { ...model, emissiveLightOffset: { x: 0.5, y: 1, z: -0.5 } },
      { ...model, emissiveStrength: 2 },
      { ...model, emissiveTorchFlicker: true },
      { ...model, emissiveLanternFlicker: true },
      { ...model, emissiveSuppressHostShadow: true },
    ];

    for (const changed of changedModels) {
      expect(packAssetsSignature(map, packWithModel(changed))).not.toBe(base);
    }
  });

  it("invalidates for a voxel edit at an index outside the old sample window", () => {
    const voxels = Array.from({ length: 256 }, () => 0);
    const baseModel = { ...model, voxels };
    const changedVoxels = [...voxels];
    changedVoxels[255] = 1;

    expect(
      packAssetsSignature(map, packWithModel({ ...baseModel, voxels: changedVoxels })),
    ).not.toBe(packAssetsSignature(map, packWithModel(baseModel)));
  });

  it("invalidates for same-length sprite paint and local-light edits", () => {
    const base = packAssetsSignature(spriteMap, packWithSprite(sprite));
    const changedPixels = [...sprite.pixels];
    changedPixels[1] = "#222222";

    expect(
      packAssetsSignature(
        spriteMap,
        packWithSprite({ ...sprite, pixels: changedPixels }),
      ),
    ).not.toBe(base);
    expect(
      packAssetsSignature(
        spriteMap,
        packWithSprite({ ...sprite, emissiveLightRange: 4 }),
      ),
    ).not.toBe(base);
    expect(
      packAssetsSignature(
        spriteMap,
        packWithSprite({ ...sprite, emissiveLightShadows: true }),
      ),
    ).not.toBe(base);
  });
});
