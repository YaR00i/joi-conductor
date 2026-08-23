import { describe, expect, it } from "vitest";
import type {
  EmberMap,
  EmberPack,
  EmberTileset,
} from "../../../game/content/types";
import {
  checkMapLibraryPlacement,
  effectiveMapLibraryPlacementMode,
  resolveMapLibraryPlacementTarget,
} from "./mapLibraryPlacement";

const map = {
  id: "map",
  width: 8,
  height: 8,
  tileSize: 16,
  tilesetId: "tiles",
  layers: [],
  regions: [],
  sprites: [{ id: "s1", spriteId: "tree", x: 2, y: 3 }],
  voxelProps: [{ id: "v1", modelId: "crate", x: 2, y: 3 }],
  lights: [{ id: "l1", x: 4, y: 4 }],
} as unknown as EmberMap;

const pack = {
  sprites: { tree: {} },
  voxelModels: { crate: {} },
} as unknown as EmberPack;

const tileset = {
  id: "tiles",
  tiles: [{ id: 7 }],
} as unknown as EmberTileset;

describe("checkMapLibraryPlacement", () => {
  it("allows different scene objects to share a cell", () => {
    expect(
      checkMapLibraryPlacement(
        { kind: "sprite", spriteId: "tree" },
        { x: 4, y: 4, elev: 0 },
        map,
        pack,
        tileset,
      ).valid,
    ).toBe(true);
  });

  it("rejects exact duplicates instead of silently replacing them", () => {
    expect(
      checkMapLibraryPlacement(
        { kind: "voxel", modelId: "crate" },
        { x: 2, y: 3, elev: 0 },
        map,
        pack,
        tileset,
      ),
    ).toEqual({
      valid: false,
      reason: "Такой объект уже стоит в этой позиции",
    });
  });

  it("rejects missing assets and out-of-map positions", () => {
    expect(
      checkMapLibraryPlacement(
        { kind: "tile", tileId: 99 },
        { x: 1, y: 1, elev: 0 },
        map,
        pack,
        tileset,
      ).valid,
    ).toBe(false);
    expect(
      checkMapLibraryPlacement(
        { kind: "voxel", modelId: "crate" },
        { x: -1, y: 1, elev: 0 },
        map,
        pack,
        tileset,
      ).valid,
    ).toBe(false);
  });

  it("allows the same voxel model on another vertical level", () => {
    expect(
      checkMapLibraryPlacement(
        { kind: "voxel", modelId: "crate" },
        { x: 2, y: 3, elev: 2 },
        map,
        pack,
        tileset,
      ).valid,
    ).toBe(true);
  });

  it("resolves surface, floor and locked-grid targets through one contract", () => {
    const surface = { x: 3, y: 4, elev: 2 };
    expect(
      resolveMapLibraryPlacementTarget(map, "surface", { x: 1, y: 1 }, surface, 1),
    ).toEqual(surface);
    expect(
      resolveMapLibraryPlacementTarget(map, "grid", { x: 1, y: 1 }, surface, 3),
    ).toEqual({ x: 1, y: 1, elev: 3 });
    expect(
      resolveMapLibraryPlacementTarget(map, "floor", { x: 1, y: 1 }, surface, 3),
    ).toEqual({ x: 1, y: 1, elev: 0 });
  });

  it("maps region surface placement onto the locked grid like blocks", () => {
    expect(effectiveMapLibraryPlacementMode("region", "surface")).toBe("grid");
    expect(effectiveMapLibraryPlacementMode("region", "floor")).toBe("floor");
    expect(effectiveMapLibraryPlacementMode("light", "surface")).toBe("floor");
    expect(effectiveMapLibraryPlacementMode("voxel", "surface")).toBe(
      "surface",
    );
  });
});
