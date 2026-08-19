import { describe, expect, it } from "vitest";
import type { EmberMap } from "../../content/types";
import { createEmptyMap, ensureMapLayers } from "../../tile/mapUtils";
import {
  assignEmberSceneObjectsToGroup,
  createEmberSceneGroup,
  duplicateEmberSceneGroup,
  emberSceneGroupObjectKeys,
  normalizeEmberSceneHierarchy,
  removeEmberSceneGroup,
  renameEmberSceneGroup,
  rotateEmberSceneGroupTransforms,
  setEmberSceneGroupParent,
  translateEmberSceneGroupTransforms,
} from "./EmberSceneHierarchy";
import {
  removeEmberWorldObjects,
  rotateEmberWorldObjectsAroundPivot,
  translateEmberWorldObjects,
} from "./emberWorldObjectAdapter";

function sceneMap(): EmberMap {
  const map = ensureMapLayers(createEmptyMap("hierarchy", 12, 12, "test", 16));
  map.voxelProps = [
    { id: "a", modelId: "crate", x: 2, y: 4, elev: 2 },
    { id: "b", modelId: "crate", x: 6, y: 8, elev: 0 },
  ];
  map.lights = [{ id: "lamp", x: 4, y: 2, lampHeight: 1 }];
  return map;
}

describe("EmberSceneHierarchy", () => {
  it("creates a persistent group with a world-space pivot", () => {
    const result = createEmberSceneGroup(
      sceneMap(),
      ["voxel:a", "voxel:b"],
      { id: "props", name: "Props" },
    );
    expect(result.group).toMatchObject({
      id: "props",
      name: "Props",
      objectKeys: ["voxel:a", "voxel:b"],
      pivot: { x: 4, y: 6, z: 1 },
    });
    expect(result.map.sceneHierarchy).toMatchObject({ version: 1 });
  });

  it("reparents objects and prevents group-parent cycles", () => {
    const first = createEmberSceneGroup(sceneMap(), ["voxel:a"], { id: "first" }).map;
    const second = createEmberSceneGroup(first, ["voxel:a", "light:lamp"], {
      id: "second",
    }).map;
    expect(second.sceneHierarchy?.groups.find((group) => group.id === "first")?.objectKeys).toEqual([]);
    const nested = setEmberSceneGroupParent(second, "second", "first");
    expect(nested.sceneHierarchy?.groups.find((group) => group.id === "second")?.parentGroupId).toBe("first");
    expect(setEmberSceneGroupParent(nested, "first", "second")).toBe(nested);
    expect(emberSceneGroupObjectKeys(nested.sceneHierarchy, "first")).toEqual([
      "voxel:a",
      "light:lamp",
    ]);
  });

  it("keeps a stable parent pivot while child movement updates local space", () => {
    const grouped = createEmberSceneGroup(
      sceneMap(),
      ["voxel:a", "voxel:b"],
      { id: "props" },
    ).map;
    const moved = translateEmberWorldObjects(
      grouped,
      [{ kind: "voxel", id: "a" }, { kind: "voxel", id: "b" }],
      1,
      -2,
    );
    expect(moved.sceneHierarchy?.groups[0]).toMatchObject({
      pivot: { x: 4, y: 6, z: 1 },
      localTransforms: {
        "voxel:a": { position: { x: -1, y: -4, z: 1 } },
        "voxel:b": { position: { x: 3, y: 0, z: -1 } },
      },
    });
    const removed = removeEmberWorldObjects(moved, [{ kind: "voxel", id: "a" }]);
    expect(removed.sceneHierarchy?.groups[0]).toMatchObject({
      objectKeys: ["voxel:b"],
      pivot: { x: 4, y: 6, z: 1 },
      localTransforms: {
        "voxel:b": { position: { x: 3, y: 0, z: -1 } },
      },
    });
  });

  it("moves a complete branch by updating both children and stable pivots", () => {
    const grouped = createEmberSceneGroup(
      sceneMap(),
      ["voxel:a", "voxel:b"],
      { id: "props" },
    ).map;
    const objectsMoved = translateEmberWorldObjects(
      grouped,
      [{ kind: "voxel", id: "a" }, { kind: "voxel", id: "b" }],
      1,
      -2,
    );
    const branchMoved = translateEmberSceneGroupTransforms(
      objectsMoved,
      "props",
      1,
      -2,
    );
    expect(branchMoved.sceneHierarchy?.groups[0]).toMatchObject({
      pivot: { x: 5, y: 4, z: 1 },
      localTransforms: {
        "voxel:a": { position: { x: -2, y: -2, z: 1 } },
        "voxel:b": { position: { x: 2, y: 2, z: -1 } },
      },
    });
  });

  it("normalizes stale references, duplicate ownership and cycles", () => {
    const map = sceneMap();
    map.sceneHierarchy = {
      version: 1,
      groups: [
        {
          id: "a",
          name: "A",
          parentGroupId: "b",
          objectKeys: ["voxel:a", "missing:x"],
          pivot: { x: 0, y: 0, z: 0 },
        },
        {
          id: "b",
          name: "B",
          parentGroupId: "a",
          objectKeys: ["voxel:a", "voxel:b"],
          pivot: { x: 0, y: 0, z: 0 },
        },
      ],
    };
    const normalized = normalizeEmberSceneHierarchy(map);
    expect(normalized.sceneHierarchy?.groups[0].parentGroupId).toBeUndefined();
    expect(normalized.sceneHierarchy?.groups[0].objectKeys).toEqual(["voxel:a"]);
    expect(normalized.sceneHierarchy?.groups[1].objectKeys).toEqual(["voxel:b"]);
  });

  it("removes only the group node and reparents child groups", () => {
    const first = createEmberSceneGroup(sceneMap(), ["voxel:a"], { id: "parent" }).map;
    const second = createEmberSceneGroup(first, ["voxel:b"], { id: "child" }).map;
    const nested = setEmberSceneGroupParent(second, "child", "parent");
    const ungrouped = removeEmberSceneGroup(nested, "parent");
    expect(ungrouped.voxelProps).toHaveLength(2);
    expect(ungrouped.sceneHierarchy?.groups).toMatchObject([
      { id: "child", parentGroupId: undefined },
    ]);
  });

  it("renames groups and reparents objects between a node and Scene Root", () => {
    const grouped = createEmberSceneGroup(sceneMap(), ["voxel:a"], { id: "props" }).map;
    const renamed = renameEmberSceneGroup(grouped, "props", "Architecture");
    expect(renamed.sceneHierarchy?.groups[0].name).toBe("Architecture");
    const attached = assignEmberSceneObjectsToGroup(renamed, ["light:lamp"], "props");
    expect(attached.sceneHierarchy?.groups[0].objectKeys).toEqual(["voxel:a", "light:lamp"]);
    const detached = assignEmberSceneObjectsToGroup(attached, ["voxel:a"]);
    expect(detached.sceneHierarchy?.groups[0].objectKeys).toEqual(["light:lamp"]);
  });

  it("rotates group children around their shared pivot", () => {
    const grouped = createEmberSceneGroup(
      sceneMap(),
      ["voxel:a", "voxel:b"],
      { id: "props" },
    ).map;
    const pivot = grouped.sceneHierarchy!.groups[0].pivot;
    const objectsRotated = rotateEmberWorldObjectsAroundPivot(
      grouped,
      [{ kind: "voxel", id: "a" }, { kind: "voxel", id: "b" }],
      pivot,
      1,
    );
    const rotated = rotateEmberSceneGroupTransforms(objectsRotated, "props", 1);
    expect(rotated.voxelProps).toMatchObject([
      { id: "a", x: 6, y: 4, rot: 1 },
      { id: "b", x: 2, y: 8, rot: 1 },
    ]);
    expect(rotated.sceneHierarchy?.groups[0].pivot).toMatchObject({ x: 4, y: 6 });
    expect(rotated.sceneHierarchy?.groups[0]).toMatchObject({
      rotationQuarterTurns: 1,
      localTransforms: {
        "voxel:a": { position: { x: -2, y: -2, z: 1 }, rotationQuarterTurns: 0 },
        "voxel:b": { position: { x: 2, y: 2, z: -1 }, rotationQuarterTurns: 0 },
      },
    });
  });

  it("duplicates a complete group branch with independent object ids", () => {
    const parent = createEmberSceneGroup(sceneMap(), ["voxel:a"], { id: "parent" }).map;
    const child = createEmberSceneGroup(parent, ["light:lamp"], { id: "child" }).map;
    const nested = setEmberSceneGroupParent(child, "child", "parent");
    const result = duplicateEmberSceneGroup(nested, "parent", {
      suffix: "_copy",
      offsetX: 1,
      offsetY: 2,
    });
    expect(result.groupId).toBe("parent_copy");
    expect(result.map.sceneHierarchy?.groups).toMatchObject([
      { id: "parent" },
      { id: "child", parentGroupId: "parent" },
      { id: "parent_copy", name: "Группа 1 копия", objectKeys: ["voxel:a_copy"] },
      { id: "child_copy", parentGroupId: "parent_copy", objectKeys: ["light:lamp_copy"] },
    ]);
    expect(result.map.voxelProps?.find((item) => item.id === "a_copy")).toMatchObject({ x: 3, y: 6 });
    expect(result.map.lights?.find((item) => item.id === "lamp_copy")).toMatchObject({ x: 5, y: 4 });
  });
});
