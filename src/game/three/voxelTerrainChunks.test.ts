import { describe, expect, it } from "vitest";
import type { EmberMap } from "../content/types";
import { ensureMapLayers } from "../tile/mapUtils";
import { setElevTileId } from "../tile/elevGroundLayers";
import {
  terrainChunkDescriptors,
  terrainChunkKeySignature,
  terrainChunkSignature,
  terrainChunkWindow,
} from "./voxelTerrainChunks";
import { buildSolidTerrainGeometry } from "./solidTerrainGeometry";

function testMap(): EmberMap {
  return ensureMapLayers({
    id: "chunks",
    width: 32,
    height: 16,
    tileSize: 16,
    tilesetId: "tiles",
    layers: [
      {
        name: "ground",
        type: "tile",
        data: new Array(32 * 16).fill(1),
      },
      {
        name: "elevation",
        type: "tile",
        data: new Array(32 * 16).fill(0),
      },
    ],
    regions: [],
  } as EmberMap);
}

describe("voxel terrain chunk invalidation", () => {
  it("creates clipped edge chunks", () => {
    expect(terrainChunkDescriptors(35, 18, 16)).toEqual([
      expect.objectContaining({ key: "0:0", x0: 0, y0: 0, x1: 16, y1: 16 }),
      expect.objectContaining({ key: "1:0", x0: 16, y0: 0, x1: 32, y1: 16 }),
      expect.objectContaining({ key: "2:0", x0: 32, y0: 0, x1: 35, y1: 16 }),
      expect.objectContaining({ key: "0:1", x0: 0, y0: 16, x1: 16, y1: 18 }),
      expect.objectContaining({ key: "1:1", x0: 16, y0: 16, x1: 32, y1: 18 }),
      expect.objectContaining({ key: "2:1", x0: 32, y0: 16, x1: 35, y1: 18 }),
    ]);
  });

  it("invalidates one interior chunk but both chunks at a shared edge", () => {
    const map = testMap();
    const [left, right] = terrainChunkDescriptors(32, 16, 16);
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    const beforeLeft = terrainChunkSignature(map, left!);
    const beforeRight = terrainChunkSignature(map, right!);

    setElevTileId(map, 5, 5, 1, 1);
    expect(terrainChunkSignature(map, left!)).not.toBe(beforeLeft);
    expect(terrainChunkSignature(map, right!)).toBe(beforeRight);

    const edgeLeft = terrainChunkSignature(map, left!);
    const edgeRight = terrainChunkSignature(map, right!);
    setElevTileId(map, 15, 5, 2, 1);
    expect(terrainChunkSignature(map, left!)).not.toBe(edgeLeft);
    expect(terrainChunkSignature(map, right!)).not.toBe(edgeRight);
  });

  it("loads nearest chunks first and retains a wider hysteresis ring", () => {
    const descriptors = terrainChunkDescriptors(128, 128, 16);
    const window = terrainChunkWindow(descriptors, 56, 72, 1, 2, 16);

    expect([window.focusChunkX, window.focusChunkY]).toEqual([3, 4]);
    expect(window.load).toHaveLength(9);
    expect(window.load[0]?.key).toBe("3:4");
    expect(window.retainKeys.size).toBe(25);
    expect(window.retainKeys.has("1:2")).toBe(true);
    expect(window.retainKeys.has("0:2")).toBe(false);
  });

  it("covers a village-sized map from any focus with load radius 2", () => {
    const descriptors = terrainChunkDescriptors(36, 32, 16);
    const corner = terrainChunkWindow(descriptors, 0, 0, 2, 3, 16);
    const far = terrainChunkWindow(descriptors, 35, 31, 2, 3, 16);
    expect(corner.retainKeys.size).toBe(descriptors.length);
    expect(far.retainKeys.size).toBe(descriptors.length);
    expect(terrainChunkKeySignature(corner.retainKeys)).toBe(
      terrainChunkKeySignature(far.retainKeys),
    );
  });

  it("clips a streaming window at map edges", () => {
    const descriptors = terrainChunkDescriptors(48, 48, 16);
    const window = terrainChunkWindow(descriptors, 0, 0, 2, 3, 16);

    expect(window.load.map((chunk) => chunk.key).sort()).toEqual(
      descriptors.map((chunk) => chunk.key).sort(),
    );
    expect(window.retainKeys.size).toBe(9);
  });

  it("produces transferable non-indexed solid geometry", () => {
    const map = testMap();
    const tileset = {
      id: "tiles",
      name: "Tiles",
      tileSize: 16,
      tiles: [
        { id: 0, name: "empty", color: "#00000000" },
        { id: 1, name: "stone", color: "#777777", solid: true },
      ],
    } as never;
    const result = buildSolidTerrainGeometry(
      map,
      tileset,
      { x0: 0, y0: 0, x1: 1, y1: 1 },
      "0:0",
    );
    expect(result.requiresSync).toBe(false);
    expect(result.batches.length).toBeGreaterThanOrEqual(2);
    for (const batch of result.batches) {
      const positions = new Float32Array(batch.positions);
      const normals = new Float32Array(batch.normals);
      const uvs = new Float32Array(batch.uvs);
      expect(positions.length).toBeGreaterThan(0);
      expect(normals.length).toBe(positions.length);
      expect(uvs.length).toBe((positions.length / 3) * 2);
    }
  });

  it("batches per-cell trigger tiles when editor animation is disabled", () => {
    const map = testMap();
    const tileset = {
      id: "tiles",
      name: "Tiles",
      tileSize: 16,
      tiles: [
        { id: 0, name: "empty", color: "#00000000" },
        {
          id: 1,
          name: "trigger-grass",
          color: "#557755",
          emissivePixels: ["#ffffff"],
          emissiveAnim: "trigger",
        },
      ],
    } as never;
    const region = { x0: 0, y0: 0, x1: 2, y1: 2 };
    const runtime = buildSolidTerrainGeometry(
      map,
      tileset,
      region,
      "runtime",
      true,
    );
    const editor = buildSolidTerrainGeometry(
      map,
      tileset,
      region,
      "editor",
      false,
    );

    expect(runtime.batches.length).toBeGreaterThan(editor.batches.length);
    expect(editor.batches).toHaveLength(2);
    expect(editor.batches.every((batch) => batch.tx == null)).toBe(true);
  });

  it("routes water chunks to the feature-complete synchronous fallback", () => {
    const map = testMap();
    const ground = map.layers.find((layer) => layer.name === "ground_z0");
    expect(ground).toBeDefined();
    ground!.data[0] = 2;
    const tileset = {
      id: "tiles",
      name: "Tiles",
      tileSize: 16,
      tiles: [
        { id: 0, name: "empty", color: "#00000000" },
        { id: 1, name: "stone", color: "#777777" },
        { id: 2, name: "water", color: "#3355aa" },
      ],
    } as never;
    expect(
      buildSolidTerrainGeometry(
        map,
        tileset,
        { x0: 0, y0: 0, x1: 1, y1: 1 },
      ).requiresSync,
    ).toBe(true);
  });
});
