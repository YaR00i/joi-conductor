import { describe, expect, it } from "vitest";
import type {
  EmberMap,
  EmberPack,
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
});
