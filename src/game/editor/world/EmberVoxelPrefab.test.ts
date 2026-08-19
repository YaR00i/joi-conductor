import { describe, expect, it } from "vitest";
import type { EmberVoxelModel, EmberVoxelPlacement } from "../../content/types";
import {
  applyVoxelInstanceComponentToAsset,
  clearVoxelInstanceComponent,
  clearVoxelInstanceField,
  resolveVoxelPrefabState,
  setVoxelAssetComponentPresence,
  setVoxelInstanceComponentPresence,
  voxelOptionalComponentPresent,
} from "./EmberVoxelPrefab";

function model(): EmberVoxelModel {
  return {
    id: "lamp",
    nameRu: "Лампа",
    sizeBlocks: { x: 1, y: 1, z: 1 },
    palette: ["", "#fff"],
    voxels: [1],
    directLightScale: 0.6,
    collider: { enabled: false, walkableTop: true },
    emissiveCastsLight: true,
    emissiveLightRange: 2,
  };
}

function placement(): EmberVoxelPlacement {
  return {
    id: "lamp-1",
    modelId: "lamp",
    x: 2,
    y: 3,
    directLightScale: 0.3,
    collider: { isTrigger: true },
    emissiveCastsLight: false,
  };
}

describe("Ember voxel prefab inheritance", () => {
  it("resolves every field independently across instance and asset", () => {
    const state = resolveVoxelPrefabState(placement(), model());
    expect(state.directLightScale).toEqual({ value: 0.3, source: "instance" });
    expect(state.collider.value).toMatchObject({
      enabled: false,
      isTrigger: true,
      blocksMovement: false,
      walkableTop: true,
    });
    expect(state.collider.sources).toMatchObject({
      enabled: "asset",
      isTrigger: "instance",
      walkableTop: "asset",
      offsetVoxels: "default",
    });
    expect(state.light.emissiveCastsLight).toEqual({
      value: false,
      source: "instance",
    });
    expect(state.light.emissiveLightRange).toEqual({
      value: 2,
      source: "asset",
    });
  });

  it("reverts one field or a whole component without touching the asset", () => {
    const source = placement();
    const oneField = clearVoxelInstanceField(
      source,
      "collider",
      "isTrigger",
    );
    expect(oneField).not.toHaveProperty("collider");
    expect(source.collider).toEqual({ isTrigger: true });

    const allLight = clearVoxelInstanceComponent(source, "voxel-light");
    expect(allLight).not.toHaveProperty("emissiveCastsLight");
    expect(allLight.directLightScale).toBe(0.3);
  });

  it("applies only instance overrides to the shared asset and clears them", () => {
    const sourceModel = model();
    const sourcePlacement = placement();
    const collider = applyVoxelInstanceComponentToAsset(
      sourcePlacement,
      sourceModel,
      "collider",
    );
    expect(collider.changed).toBe(true);
    expect(collider.model.collider).toEqual({
      enabled: false,
      walkableTop: true,
      isTrigger: true,
    });
    expect(collider.placement).not.toHaveProperty("collider");

    const light = applyVoxelInstanceComponentToAsset(
      sourcePlacement,
      sourceModel,
      "voxel-light",
    );
    expect(light.model.emissiveCastsLight).toBe(false);
    expect(light.model.emissiveLightRange).toBe(2);
    expect(light.placement).not.toHaveProperty("emissiveCastsLight");

    const renderer = applyVoxelInstanceComponentToAsset(
      sourcePlacement,
      sourceModel,
      "voxel-renderer",
    );
    expect(renderer.model.directLightScale).toBe(0.3);
    expect(renderer.placement).not.toHaveProperty("directLightScale");
    expect(sourceModel.directLightScale).toBe(0.6);
    expect(sourcePlacement.directLightScale).toBe(0.3);
  });

  it("resolves optional component presence instance → asset → legacy", () => {
    const sourceModel = model();
    const sourcePlacement = placement();
    expect(
      voxelOptionalComponentPresent(sourcePlacement, sourceModel, "collider"),
    ).toBe(true);

    const assetRemoved = setVoxelAssetComponentPresence(
      sourceModel,
      "collider",
      false,
    );
    expect(assetRemoved.componentStates?.collider).toBe(false);
    expect(assetRemoved.physical).toBe(false);
    expect(assetRemoved.collider?.enabled).toBe(false);
    expect(
      voxelOptionalComponentPresent(sourcePlacement, assetRemoved, "collider"),
    ).toBe(false);

    const instanceAdded = setVoxelInstanceComponentPresence(
      sourcePlacement,
      "collider",
      true,
    );
    expect(instanceAdded.componentStates?.collider).toBe(true);
    expect(instanceAdded.collider?.enabled).toBe(true);
    expect(
      voxelOptionalComponentPresent(instanceAdded, assetRemoved, "collider"),
    ).toBe(true);

    const lightRemoved = setVoxelInstanceComponentPresence(
      sourcePlacement,
      "voxel-light",
      false,
    );
    expect(lightRemoved.componentStates?.["voxel-light"]).toBe(false);
    expect(lightRemoved.emissiveCastsLight).toBe(false);
  });
});
