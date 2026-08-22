import { describe, expect, it } from "vitest";
import type { EmberVoxelModel, EmberVoxelScene } from "../content/types";
import {
  assignVoxelAssetRel,
  formatVoxelShardLabel,
  isVoxelLibraryRel,
  mergeVoxelLibrarySave,
  parseVoxelLibraryDocument,
  pickVoxelLibraryText,
  serializeVoxelAssetFile,
  shouldIgnoreVoxelOverride,
  voxelFileLooksEmpty,
  voxelModelRel,
} from "./voxelLibrary";

function model(id: string, mark = 1): EmberVoxelModel {
  return {
    id,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    palette: ["", "#fff"],
    voxels: [mark],
  };
}

function scene(id: string, modelId: string): EmberVoxelScene {
  return {
    id,
    objects: [
      {
        id: `${id}_obj`,
        modelId,
        offset: { x: 0, y: 0, z: 0 },
      },
    ],
  };
}

describe("voxel prefab files", () => {
  it("treats models/ and leftover shards as library files", () => {
    expect(isVoxelLibraryRel("voxels/registry.json")).toBe(true);
    expect(isVoxelLibraryRel("voxels/models/vox_vil_lamp.json")).toBe(true);
    expect(isVoxelLibraryRel("voxels/scenes/vscn_1.json")).toBe(true);
    expect(isVoxelLibraryRel("voxels/registry.json.bak")).toBe(false);
    expect(isVoxelLibraryRel("sprites/registry.json")).toBe(false);
    expect(isVoxelLibraryRel("voxels/_legacy/registry.json")).toBe(false);
  });

  it("assigns a per-model path like a Unity prefab", () => {
    expect(assignVoxelAssetRel("vox_vil_lamp", {})).toBe(
      "voxels/models/vox_vil_lamp.json",
    );
    expect(
      assignVoxelAssetRel("vox_vil_lamp", {
        vox_vil_lamp: "voxels/models/custom.json",
      }),
    ).toBe("voxels/models/custom.json");
    expect(
      assignVoxelAssetRel("vox_vil_lamp", {
        vox_vil_lamp: "voxels/village.json",
      }),
    ).toBe("voxels/models/vox_vil_lamp.json");
    expect(formatVoxelShardLabel(voxelModelRel("vox_fan_sword"))).toBe(
      "models/vox_fan_sword.json + .vox",
    );
  });

  it("parses wrapped prefab, bare model, and legacy shard", () => {
    expect(
      parseVoxelLibraryDocument({
        id: "lamp",
        model: model("lamp", 3),
      }).models[0]?.voxels[0],
    ).toBe(3);
    expect(
      parseVoxelLibraryDocument(model("bare", 4)).models[0]?.voxels[0],
    ).toBe(4);
    expect(
      parseVoxelLibraryDocument({ models: [model("a"), model("b")] }).models,
    ).toHaveLength(2);
    expect(
      parseVoxelLibraryDocument({
        id: "lamp",
        tags: ["Village", "street"],
        model: model("lamp", 1),
      }).models[0]?.tags,
    ).toEqual(["Village", "street"]);
    expect(serializeVoxelAssetFile({ ...model("lamp"), tags: ["light"] }).tags).toEqual(
      ["light"],
    );
  });

  it("omits a trivial one-object scene from the prefab file", () => {
    const file = serializeVoxelAssetFile(model("lamp"), scene("lamp", "lamp"));
    expect(file.scene).toBeUndefined();
    expect(file.id).toBe("lamp");
    expect(file.mesh).toEqual({
      kind: "vox",
      file: "voxels/models/lamp.vox",
    });
    expect(file.model.voxels).toEqual([]);
  });
});

describe("voxel override / empty guards", () => {
  it("ignores empty shard or empty prefab overrides", () => {
    expect(shouldIgnoreVoxelOverride("")).toBe(true);
    expect(shouldIgnoreVoxelOverride(JSON.stringify({ models: [] }))).toBe(true);
    expect(shouldIgnoreVoxelOverride(JSON.stringify({ id: "x" }))).toBe(true);
    expect(
      shouldIgnoreVoxelOverride(JSON.stringify({ id: "a", model: model("a") })),
    ).toBe(false);
    expect(voxelFileLooksEmpty({ models: [] })).toBe(true);
    expect(voxelFileLooksEmpty({ id: "a", model: model("a") })).toBe(false);
  });

  it("skips an empty prefab override and uses disk", () => {
    const picked = pickVoxelLibraryText({
      overrideText: JSON.stringify({ id: "lamp" }),
      diskText: JSON.stringify({ id: "lamp", model: model("lamp", 8) }),
    });
    expect(picked?.source).toBe("disk");
  });

  it("skips a thin shard override that would hide the catalog", () => {
    const diskModels = Array.from({ length: 10 }, (_, i) => model(`m${i}`));
    const picked = pickVoxelLibraryText({
      overrideText: JSON.stringify({ models: [model("only")] }),
      diskText: JSON.stringify({ models: diskModels }),
    });
    expect(picked?.source).toBe("disk");
  });
});

describe("mergeVoxelLibrarySave", () => {
  it("does not drop disk prefabs that are missing from memory", () => {
    const result = mergeVoxelLibrarySave({
      diskAssets: {
        core: { rel: voxelModelRel("core"), model: model("core", 1) },
        vox_vil_lamp: {
          rel: voxelModelRel("vox_vil_lamp"),
          model: model("vox_vil_lamp", 1),
        },
      },
      incomingModels: { vox_new: model("vox_new", 7) },
      incomingScenes: {},
    });
    expect(result.sources.core).toBe(voxelModelRel("core"));
    expect(result.writeRels.vox_new).toBe(voxelModelRel("vox_new"));
    expect(result.writeAssets.core).toBeUndefined();
    expect(result.writeAssets.vox_new?.model.voxels).toEqual([]);
    expect(result.writeAssets.vox_new?.mesh?.file).toBe(
      "voxels/models/vox_new.vox",
    );
  });

  it("upserts only dirty ids onto their prefab files", () => {
    const result = mergeVoxelLibrarySave({
      diskAssets: {
        vox_vil_lamp: {
          rel: voxelModelRel("vox_vil_lamp"),
          model: model("vox_vil_lamp", 1),
        },
        keep: { rel: voxelModelRel("keep"), model: model("keep", 1) },
      },
      incomingModels: {
        vox_vil_lamp: model("vox_vil_lamp", 9),
        keep: model("keep", 99),
      },
      incomingScenes: {},
      dirtyIds: ["vox_vil_lamp"],
    });
    expect(result.writeAssets.vox_vil_lamp?.model.voxels).toEqual([]);
    expect(result.writeAssets.vox_vil_lamp?.mesh?.file).toBe(
      "voxels/models/vox_vil_lamp.vox",
    );
    expect(result.writeAssets.keep).toBeUndefined();
  });

  it("removes only deletedIds", () => {
    const result = mergeVoxelLibrarySave({
      diskAssets: {
        keep: { rel: voxelModelRel("keep"), model: model("keep") },
        gone: { rel: voxelModelRel("gone"), model: model("gone") },
      },
      incomingModels: {},
      incomingScenes: {},
      deletedIds: ["gone"],
    });
    expect(result.sources.keep).toBe(voxelModelRel("keep"));
    expect(result.sources.gone).toBeUndefined();
    expect(result.deleteRels).toContain(voxelModelRel("gone"));
    expect(result.deleteRels).toContain("voxels/models/gone.vox");
  });
});
