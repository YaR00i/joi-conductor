import { describe, expect, it } from "vitest";
import {
  addVoxelEmissiveLamp,
  clusterVoxelEmissive,
  clusterVoxelEmissiveLamps,
  LEGACY_VOXEL_LAMP_ID,
  listVoxelEmissiveLamps,
  patchVoxelEmissiveLamp,
  removeVoxelEmissiveLamp,
  summarizeVoxelEmissiveForLamp,
} from "./voxelEmissiveLight";
import { createEmptyVoxelModel, setVoxel, setVoxelEmissive } from "./voxelModel";

function paintEmit(
  model: ReturnType<typeof createEmptyVoxelModel>,
  cells: Array<[number, number, number]>,
) {
  let next = model;
  for (const [x, y, z] of cells) {
    next = setVoxel(next, x, y, z, 1);
    next = setVoxelEmissive(next, x, y, z, 255);
  }
  return next;
}

describe("voxel emissive lamps", () => {
  it("falls back to one legacy lamp", () => {
    const model = createEmptyVoxelModel("one", { x: 1, y: 1, z: 1 }, "t", 2);
    const lamps = listVoxelEmissiveLamps(model);
    expect(lamps).toHaveLength(1);
    expect(lamps[0]!.id).toBe(LEGACY_VOXEL_LAMP_ID);
  });

  it("adds and removes extra lamps", () => {
    let model = createEmptyVoxelModel("two", { x: 1, y: 1, z: 1 }, "t", 2);
    model = addVoxelEmissiveLamp(model, { x: 1, y: 2, z: 3 });
    expect(model.emissiveLights).toHaveLength(2);
    expect(model.emissiveCastsLight).toBe(true);
    const extra = model.emissiveLights![1]!;
    model = removeVoxelEmissiveLamp(model, extra.id);
    expect(model.emissiveLights).toHaveLength(1);
  });

  it("clusters disconnected emissive islands", () => {
    let model = createEmptyVoxelModel("islands", { x: 1, y: 1, z: 1 }, "t", 8);
    model = paintEmit(model, [
      [0, 0, 0],
      [1, 0, 0],
      [6, 0, 6],
    ]);
    const clusters = clusterVoxelEmissive(model);
    expect(clusters).toHaveLength(2);
    const next = clusterVoxelEmissiveLamps(model);
    expect(next.emissiveLights).toHaveLength(2);
    expect(next.emissiveCastsLight).toBe(true);
  });

  it("splits emissive weight between nearby lamps", () => {
    let model = createEmptyVoxelModel("split", { x: 1, y: 1, z: 1 }, "t", 8);
    model = paintEmit(model, [
      [0, 0, 0],
      [7, 0, 0],
    ]);
    model = {
      ...model,
      emissiveLights: [
        { id: "a", origin: { x: 0, y: 0, z: 0 } },
        { id: "b", origin: { x: 7, y: 0, z: 0 } },
      ],
    };
    const lamps = listVoxelEmissiveLamps(model);
    const left = summarizeVoxelEmissiveForLamp(model, lamps, 0);
    const right = summarizeVoxelEmissiveForLamp(model, lamps, 1);
    expect(left?.count).toBe(1);
    expect(right?.count).toBe(1);
  });

  it("patches a lamp origin", () => {
    let model = createEmptyVoxelModel("patch", { x: 1, y: 1, z: 1 }, "t", 8);
    model = addVoxelEmissiveLamp(model, { x: 1, y: 1, z: 1 });
    const id = model.emissiveLights![1]!.id;
    model = patchVoxelEmissiveLamp(model, id, { origin: { x: 4, y: 2, z: 3 } });
    expect(model.emissiveLights![1]!.origin).toEqual({ x: 4, y: 2, z: 3 });
  });
});
