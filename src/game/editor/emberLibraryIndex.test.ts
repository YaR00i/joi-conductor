import { describe, expect, it } from "vitest";
import type { EmberMap, EmberPack, EmberVoxelModel } from "../content/types";
import {
  inferredLibraryTags,
  libraryAssetMatchesQuery,
  normalizeEmberLibraryTags,
} from "../content/libraryTags";
import {
  buildLibraryReferenceCountIndex,
  countLibraryAssetReferences,
  filterLibraryAssets,
  findVoxelModelReferences,
  uniqueLibraryTags,
} from "../editor/emberLibraryIndex";

function model(id: string, tags?: string[]): EmberVoxelModel {
  return {
    id,
    nameRu: id,
    tags,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    palette: ["", "#fff"],
    voxels: [1],
  };
}

function emptyMap(id: string): EmberMap {
  return {
    id,
    nameRu: id,
    tileSize: 16,
    width: 8,
    height: 8,
    tilesetId: "t",
    layers: [],
    regions: [],
  };
}

describe("library tags", () => {
  it("normalizes, dedupes, and drops empty tags", () => {
    expect(normalizeEmberLibraryTags("Village, street;  Village")).toEqual([
      "village",
      "street",
    ]);
    expect(normalizeEmberLibraryTags([" Interior ", ""])).toEqual(["interior"]);
    expect(normalizeEmberLibraryTags([])).toBeUndefined();
  });

  it("matches search haystack including inferred village prefix", () => {
    expect(inferredLibraryTags("vox_vil_lamp")).toEqual(["village"]);
    expect(inferredLibraryTags("vox_chr_hero_head")).toEqual([
      "character",
      "chibi",
    ]);
    expect(
      libraryAssetMatchesQuery(
        { id: "vox_vil_lamp", nameRu: "Фонарь" },
        "village",
      ),
    ).toBe(true);
    expect(
      libraryAssetMatchesQuery({ id: "vox_vil_lamp", nameRu: "Фонарь" }, "фонар"),
    ).toBe(true);
  });
});

describe("Find References", () => {
  it("counts voxel props and chest models per map", () => {
    const mapA = emptyMap("yard");
    mapA.voxelProps = [
      { id: "a", modelId: "lamp", x: 1, y: 2 },
      { id: "b", modelId: "lamp", x: 3, y: 4 },
      { id: "c", modelId: "crate", x: 0, y: 0 },
    ];
    mapA.regions = [
      {
        id: "chest1",
        kind: "chest",
        x: 5,
        y: 5,
        w: 1,
        h: 1,
        closedModelId: "lamp",
      },
    ];
    const pack = {
      voxelModels: { lamp: model("lamp", ["light"]), crate: model("crate") },
      maps: { yard: mapA, other: emptyMap("other") },
      sprites: {},
    } as unknown as EmberPack;
    const refs = findVoxelModelReferences(pack, "lamp");
    expect(refs).toHaveLength(3);
    expect(countLibraryAssetReferences(pack, "voxel", "lamp")).toBe(3);
    expect(buildLibraryReferenceCountIndex(pack).voxel.get("lamp")).toBe(3);
    expect(uniqueLibraryTags(pack)).toEqual(["light"]);
    expect(
      filterLibraryAssets([model("lamp", ["light"])], "", "light"),
    ).toHaveLength(1);
    expect(
      filterLibraryAssets([model("vox_vil_bush")], "", "village"),
    ).toHaveLength(1);
    expect(
      filterLibraryAssets([model("lamp", ["light"])], "", "village"),
    ).toHaveLength(0);
  });
});
