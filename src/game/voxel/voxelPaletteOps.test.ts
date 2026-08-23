import { describe, expect, it } from "vitest";
import {
  createEmptyVoxelModel,
  getVoxel,
  getVoxelEmissive,
  getVoxelTransmittance,
  listPaletteGroupFamilies,
  setPaletteGroupChannel,
  setVoxel,
  setVoxelEmissive,
  setVoxelTransmittance,
} from "./voxelModel";
import {
  countVoxelPaletteUsage,
  fitVoxelPalette,
  replaceVoxelPaletteIndex,
  trimVoxelPalette,
  compactVoxelPaletteToUsed,
} from "./voxelPaletteOps";

function sampleModel() {
  let model = createEmptyVoxelModel("pal_test", { x: 1, y: 1, z: 1 }, "t", 8);
  model = setVoxel(model, 1, 1, 1, 1);
  model = setVoxel(model, 2, 1, 1, 1);
  model = setVoxel(model, 4, 1, 1, 2);
  model = setVoxelEmissive(model, 1, 1, 1, 80);
  model = setVoxelTransmittance(model, 1, 1, 1, 255);
  return model;
}

describe("replaceVoxelPaletteIndex", () => {
  it("remaps every cell of a palette slot and keeps extra channels", () => {
    const src = sampleModel();
    const next = replaceVoxelPaletteIndex(src, 1, 2);
    expect(getVoxel(next, 1, 1, 1)).toBe(2);
    expect(getVoxel(next, 2, 1, 1)).toBe(2);
    expect(getVoxel(next, 4, 1, 1)).toBe(2);
    expect(getVoxelEmissive(next, 1, 1, 1)).toBe(80);
    expect(getVoxelTransmittance(next, 1, 1, 1)).toBe(255);
    expect(countVoxelPaletteUsage(next)[1]).toBe(0);
    expect(countVoxelPaletteUsage(next)[2]).toBe(3);
  });

  it("restricts remap to a selection box", () => {
    const src = sampleModel();
    const next = replaceVoxelPaletteIndex(src, 1, 2, [
      { x0: 1, y0: 1, z0: 1, x1: 1, y1: 1, z1: 1 },
    ]);
    expect(getVoxel(next, 1, 1, 1)).toBe(2);
    expect(getVoxel(next, 2, 1, 1)).toBe(1);
    expect(getVoxel(next, 4, 1, 1)).toBe(2);
  });

  it("erases a color when the target slot is 0", () => {
    const src = sampleModel();
    const next = replaceVoxelPaletteIndex(src, 1, 0);
    expect(getVoxel(next, 1, 1, 1)).toBe(0);
    expect(getVoxel(next, 2, 1, 1)).toBe(0);
    expect(getVoxelEmissive(next, 1, 1, 1)).toBe(0);
    expect(getVoxelTransmittance(next, 1, 1, 1)).toBe(0);
    expect(getVoxel(next, 4, 1, 1)).toBe(2);
  });
});

describe("voxel palette size", () => {
  it("starts a new model with 8 color slots plus air", () => {
    const model = createEmptyVoxelModel("p8", { x: 1, y: 1, z: 1 });
    expect(model.palette).toHaveLength(9);
    expect(model.palette[0]).toBe("");
  });

  it("trims trailing unused MagicaVoxel placeholders", () => {
    const src = sampleModel();
    src.palette = [
      "",
      "#6a7a50",
      "#5a4a40",
      ...Array.from({ length: 253 }, () => "#888888"),
    ];
    const next = trimVoxelPalette(src);
    expect(next.palette.length).toBe(3);
    expect(getVoxel(next, 1, 1, 1)).toBe(1);
    expect(getVoxel(next, 4, 1, 1)).toBe(2);
  });

  it("keeps unused authored colors added with +", () => {
    const src = sampleModel();
    src.palette = [...src.palette, "#ffb060"];
    expect(trimVoxelPalette(src).palette.at(-1)).toBe("#ffb060");
  });

  it("compacts a 256-slot dump to colors actually used on the model", () => {
    const src = sampleModel();
    src.palette = ["", ...Array.from({ length: 255 }, () => "#888888")];
    src.palette[1] = "#aabbcc";
    src.palette[40] = "#112233";
    src.voxels = src.voxels.map((pi) => (pi === 2 ? 40 : pi));
    const next = compactVoxelPaletteToUsed(src);
    expect(next.palette.length).toBe(3);
    expect(next.palette[1]?.toLowerCase()).toBe("#aabbcc");
    expect(next.palette[2]?.toLowerCase()).toBe("#112233");
    expect(fitVoxelPalette(src).palette.length).toBe(3);
  });
});

describe("palette subgroups", () => {
  it("splits a partial selection onto a cloned slot of the same color", () => {
    let model = createEmptyVoxelModel("sub", { x: 1, y: 1, z: 1 }, "t", 4);
    model = setVoxel(model, 0, 0, 0, 1);
    model = setVoxel(model, 1, 0, 0, 1);
    model = setVoxel(model, 2, 0, 0, 1);
    const hex = model.palette[1];
    const next = setPaletteGroupChannel(
      model,
      1,
      "transmittance",
      200,
      [{ x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 }],
    );
    expect(getVoxel(next, 0, 0, 0)).not.toBe(1);
    expect(getVoxel(next, 1, 0, 0)).toBe(1);
    expect(getVoxel(next, 2, 0, 0)).toBe(1);
    expect(next.palette[getVoxel(next, 0, 0, 0)]).toBe(hex);
    expect(getVoxelTransmittance(next, 0, 0, 0)).toBe(200);
    expect(getVoxelTransmittance(next, 1, 0, 0)).toBe(0);
    const families = listPaletteGroupFamilies(next);
    const family = families.find((f) => f.groups.length > 1);
    expect(family?.groups).toHaveLength(2);
    expect(family?.count).toBe(3);
  });

  it("does not clone when the whole color slot is selected", () => {
    let model = createEmptyVoxelModel("sub2", { x: 1, y: 1, z: 1 }, "t", 4);
    model = setVoxel(model, 0, 0, 0, 1);
    model = setVoxel(model, 1, 0, 0, 1);
    const palLen = model.palette.length;
    const next = setPaletteGroupChannel(
      model,
      1,
      "transmittance",
      80,
      [{ x0: 0, y0: 0, z0: 0, x1: 1, y1: 0, z1: 0 }],
    );
    expect(next.palette).toHaveLength(palLen);
    expect(getVoxel(next, 0, 0, 0)).toBe(1);
    expect(getVoxelTransmittance(next, 0, 0, 0)).toBe(80);
    expect(getVoxelTransmittance(next, 1, 0, 0)).toBe(80);
  });

  it("reuses an existing subgroup with the same color and channel", () => {
    let model = createEmptyVoxelModel("sub3", { x: 1, y: 1, z: 1 }, "t", 4);
    model = setVoxel(model, 0, 0, 0, 1);
    model = setVoxel(model, 1, 0, 0, 1);
    model = setVoxel(model, 2, 0, 0, 1);
    model = setPaletteGroupChannel(
      model,
      1,
      "transmittance",
      255,
      [{ x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 }],
    );
    const dest = getVoxel(model, 0, 0, 0);
    const again = setPaletteGroupChannel(
      model,
      1,
      "transmittance",
      255,
      [{ x0: 1, y0: 0, z0: 0, x1: 1, y1: 0, z1: 0 }],
    );
    expect(getVoxel(again, 1, 0, 0)).toBe(dest);
    expect(getVoxel(again, 2, 0, 0)).toBe(1);
  });
});
