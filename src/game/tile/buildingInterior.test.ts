import { describe, expect, it } from "vitest";
import type { EmberTileset } from "../content/types";
import {
  buildCutawayHideSet,
  cellCutawayKey,
  cutawayRoleForCell,
  cutawayYawSector,
  detectRoofInteriorVolumes,
  isCameraFacingWall,
  occupiedInteriorAt,
  playCutawayCacheKey,
  tileCutawayKey,
} from "./buildingInterior";
import {
  createEmptyMap,
  ensureMapLayers,
  setElevTileId,
} from "./mapUtils";

const tileset: EmberTileset = {
  id: "test",
  tileSize: 16,
  columns: 4,
  tileCount: 3,
  tiles: [
    { id: 1, name: "трава", color: "#3a6a32" },
    { id: 2, name: "сруб", color: "#5a3a20", solid: true, defaultHeight: 1 },
    { id: 14, name: "крыша", color: "#4a2c1c", solid: true, defaultHeight: 1 },
  ],
};

function houseMap() {
  const map = ensureMapLayers(createEmptyMap("house", 12, 12, "test", 16));
  // 5×5 cabin with a south door gap at (5,7).
  for (let ty = 3; ty <= 7; ty++) {
    for (let tx = 3; tx <= 7; tx++) {
      const wall = tx === 3 || tx === 7 || ty === 3 || ty === 7;
      const door = tx === 5 && ty === 7;
      if (wall && !door) {
        setElevTileId(map, tx, ty, 0, 2);
      } else {
        setElevTileId(map, tx, ty, 0, 1);
      }
      setElevTileId(map, tx, ty, 2, 14);
    }
  }
  return map;
}

describe("buildingInterior", () => {
  it("classifies roof vs wall vs floor cells", () => {
    expect(cutawayRoleForCell("крыша", 2, "floor")).toBe("roof");
    expect(cutawayRoleForCell("сруб", 1, "wall")).toBe("wall");
    expect(cutawayRoleForCell("трава", 0, "floor")).toBe("floor");
  });

  it("detects a roof cluster as an interior volume", () => {
    const volumes = detectRoofInteriorVolumes(houseMap());
    expect(volumes.length).toBe(1);
    expect(volumes[0]).toMatchObject({ x: 3, y: 3, w: 5, h: 5 });
  });

  it("occupies the player only under a roof, not in the yard", () => {
    const map = houseMap();
    expect(occupiedInteriorAt(map, 5, 5)?.id).toBeTruthy();
    expect(occupiedInteriorAt(map, 1, 1)).toBeNull();
  });

  it("hides roofs and camera-facing walls while inside", () => {
    const map = houseMap();
    const inside = buildCutawayHideSet(map, tileset, 5, 5, Math.PI / 4);
    expect(inside.roofCells.has(cellCutawayKey(5, 5, 2))).toBe(true);
    expect(inside.roofCells.has(cellCutawayKey(3, 3, 2))).toBe(true);
    expect(inside.wallTiles.has(tileCutawayKey(7, 5))).toBe(true);
    expect(inside.wallTiles.has(tileCutawayKey(6, 7))).toBe(true);
    expect(inside.wallTiles.has(tileCutawayKey(5, 7))).toBe(false);
    expect(inside.wallTiles.has(tileCutawayKey(3, 5))).toBe(false);
    expect(inside.wallTiles.has(tileCutawayKey(5, 3))).toBe(false);
    expect(inside.wallTiles.has(tileCutawayKey(5, 5))).toBe(false);

    const outside = buildCutawayHideSet(map, tileset, 1, 1, Math.PI / 4);
    expect(outside.roofCells.size).toBe(0);
    expect(outside.wallTiles.size).toBe(0);
  });

  it("caches play cutaway on tile outside and tile+sector inside", () => {
    const map = houseMap();
    expect(playCutawayCacheKey(map, 1, 1, 0.01)).toBe("1,1");
    expect(playCutawayCacheKey(map, 1, 1, 1.2)).toBe("1,1");
    const insideA = playCutawayCacheKey(map, 5, 5, Math.PI / 4);
    const insideB = playCutawayCacheKey(map, 5, 5, Math.PI / 4 + 0.02);
    const insideTurn = playCutawayCacheKey(map, 5, 5, Math.PI / 4 + Math.PI / 2);
    expect(insideA).toBe(insideB);
    expect(insideA).not.toBe(insideTurn);
    expect(insideA).toMatch(/^5,5,/);
    expect(cutawayYawSector(0)).toBe(0);
    expect(cutawayYawSector(Math.PI * 2 - 0.01)).toBe(0);
  });

  it("uses authored interiorVolumes instead of roof flood when present", () => {
    const map = houseMap();
    map.interiorVolumes = [{ id: "shop", x: 1, y: 1, w: 2, h: 2 }];
    expect(occupiedInteriorAt(map, 5, 5)).toBeNull();
    expect(occupiedInteriorAt(map, 1, 1)?.id).toBe("shop");
  });

  it("treats east/south walls as camera-facing at default isometric yaw", () => {
    const volume = { id: "v", x: 0, y: 0, w: 4, h: 4 };
    expect(isCameraFacingWall(volume, 3, 2, Math.PI / 4)).toBe(true);
    expect(isCameraFacingWall(volume, 0, 1, Math.PI / 4)).toBe(false);
  });

  it("occupies and hides a story-1 roof slab", () => {
    const map = ensureMapLayers(createEmptyMap("roof1", 8, 8, "test", 16));
    setElevTileId(map, 4, 4, 1, 14);
    expect(occupiedInteriorAt(map, 4, 4)?.id).toBeTruthy();
    expect(occupiedInteriorAt(map, 1, 1)).toBeNull();
    const hide = buildCutawayHideSet(map, tileset, 4, 4, Math.PI / 4);
    expect(hide.roofCells.has(cellCutawayKey(4, 4, 1))).toBe(true);
  });
});
