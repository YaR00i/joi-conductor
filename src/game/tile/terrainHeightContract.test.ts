import { describe, expect, it } from "vitest";
import type { EmberMap } from "../content/types";
import {
  createEmptyMap,
  elevTileIdAt,
  ensureMapLayers,
  layerData,
  moveElevTile,
  setElevTileId,
  topOccupiedElevAt,
} from "./mapUtils";

function heightAtIndex(map: EmberMap, index: number): number {
  return layerData(map, "height")?.[index] ?? 0;
}

describe("terrain height data contract", () => {
  it("keeps low voxel heights stable across repeated normalization", () => {
    const map = createEmptyMap("voxel-height", 5, 5, "test", 16);
    const index = 2 * map.width + 2;
    layerData(map, "height")![index] = 4;

    const once = ensureMapLayers(map);
    const twice = ensureMapLayers(once);

    expect(once.terrainHeightUnit).toBe("voxels");
    expect(heightAtIndex(once, index)).toBe(4);
    expect(heightAtIndex(twice, index)).toBe(4);
  });

  it("migrates an unversioned story height exactly once", () => {
    const current = createEmptyMap("legacy-height", 5, 5, "test", 16);
    const legacy: EmberMap = {
      ...current,
      worldPhysicsVersion: undefined,
      terrainHeightUnit: undefined,
      layers: current.layers.map((layer) => ({
        ...layer,
        data:
          layer.name === "height"
            ? layer.data.map((value) => (value > 0 ? 1 : 0))
            : [...layer.data],
      })),
    };

    const once = ensureMapLayers(legacy);
    const twice = ensureMapLayers(once);
    const edgeIndex = 1;

    expect(once.worldPhysicsVersion).toBe(2);
    expect(once.terrainHeightUnit).toBe("voxels");
    expect(heightAtIndex(once, edgeIndex)).toBe(16);
    expect(heightAtIndex(twice, edgeIndex)).toBe(16);
  });

  it("moves only the selected block and rejects occupied destinations", () => {
    const map = ensureMapLayers(
      createEmptyMap("block-move", 5, 5, "test", 16),
    );
    setElevTileId(map, 2, 2, 0, 1);
    setElevTileId(map, 2, 2, 3, 2);

    expect(moveElevTile(map, 2, 2, 0, 1)).toBe(true);
    expect(elevTileIdAt(map, 2, 2, 0)).toBe(0);
    expect(elevTileIdAt(map, 2, 2, 1)).toBe(1);
    expect(elevTileIdAt(map, 2, 2, 3)).toBe(2);
    expect(topOccupiedElevAt(map, 2, 2)).toBe(3);

    expect(moveElevTile(map, 2, 2, 1, 3)).toBe(false);
    expect(elevTileIdAt(map, 2, 2, 1)).toBe(1);
    expect(elevTileIdAt(map, 2, 2, 3)).toBe(2);
  });
});
