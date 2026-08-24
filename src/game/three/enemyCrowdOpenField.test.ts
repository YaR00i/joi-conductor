import { describe, expect, it } from "vitest";
import type { EmberMap, EmberTileset } from "../content/types";
import {
  buildEnemyCrowdOpenField,
  enemyCrowdOpenFieldAllowsDirectPath,
  enemyCrowdOpenFieldAllowsMove,
  enemyCrowdTryConnectorMove,
} from "./enemyCrowdOpenField";

const tileset: EmberTileset = {
  id: "test",
  tileSize: 16,
  columns: 2,
  tileCount: 2,
  tiles: [
    { id: 1, name: "Пол", color: "#222222" },
    { id: 2, name: "Стена", color: "#444444", solid: true },
  ],
};

function mapWith(data: number[]): EmberMap {
  return {
    id: "crowd-grid",
    nameRu: "Crowd grid",
    width: 4,
    height: 4,
    tileSize: 16,
    tilesetId: tileset.id,
    layers: [{ name: "ground", type: "tile", data }],
    regions: [],
  };
}

describe("enemy crowd open field", () => {
  it("accepts a swept circle across flat floor cells", () => {
    const map = mapWith(Array(16).fill(1));
    const field = buildEnemyCrowdOpenField(map, tileset);
    expect(enemyCrowdOpenFieldAllowsMove(field, 20, 20, 30, 20, 3, 0)).toBe(
      true,
    );
  });

  it("falls back near terrain walls and map bounds", () => {
    const data = Array(16).fill(1);
    data[2 + 1 * 4] = 2;
    const field = buildEnemyCrowdOpenField(mapWith(data), tileset);
    expect(enemyCrowdOpenFieldAllowsMove(field, 20, 20, 30, 20, 3, 0)).toBe(
      false,
    );
    expect(enemyCrowdOpenFieldAllowsMove(field, 3, 3, 4, 3, 3, 0)).toBe(
      true,
    );
    expect(enemyCrowdOpenFieldAllowsMove(field, 2, 2, 1, 2, 3, 0)).toBe(
      false,
    );
  });

  it("uses direct pursuit only when the entire flat corridor is open", () => {
    const open = buildEnemyCrowdOpenField(
      mapWith(Array(16).fill(1)),
      tileset,
    );
    expect(
      enemyCrowdOpenFieldAllowsDirectPath(open, 8, 24, 56, 24, 3, 0),
    ).toBe(true);

    const data = Array(16).fill(1);
    data[2 + 1 * 4] = 2;
    const blocked = buildEnemyCrowdOpenField(mapWith(data), tileset);
    expect(
      enemyCrowdOpenFieldAllowsDirectPath(blocked, 8, 24, 56, 24, 3, 0),
    ).toBe(false);
  });

  it("falls back when authored solid sprites overlap a cell", () => {
    const map = mapWith(Array(16).fill(1));
    map.sprites = [{ id: "placed", spriteId: "crate", x: 1, y: 1 }];
    const field = buildEnemyCrowdOpenField(map, tileset, {
      crate: {
        id: "crate",
        nameRu: "Ящик",
        width: 8,
        topHeight: 0,
        wallHeights: [8],
        color: "#ffffff",
        pixels: Array(64).fill("#ffffff"),
        solid: true,
      },
    });
    expect(enemyCrowdOpenFieldAllowsMove(field, 20, 20, 22, 20, 3, 0)).toBe(
      false,
    );
  });

  it("bakes a height-aware stair between flat stories", () => {
    const stairTileset: EmberTileset = {
      ...tileset,
      tileCount: 3,
      tiles: [
        ...tileset.tiles,
        { id: 3, name: "Лестница", color: "#777777", stair: "e" },
      ],
    };
    const map: EmberMap = {
      id: "stair-grid",
      nameRu: "Stair grid",
      width: 3,
      height: 1,
      tileSize: 16,
      tilesetId: stairTileset.id,
      layers: [
        { name: "ground", type: "tile", data: [1, 3, 1] },
        { name: "elevation", type: "tile", data: [0, 0, 1] },
      ],
      regions: [],
    };
    const field = buildEnemyCrowdOpenField(map, stairTileset);

    expect(field.subdivisions).toBe(2);
    expect(field.width).toBe(6);
    expect(field.height).toBe(2);
    const row = 1;
    const stairLow = 2 + row * field.width;
    const stairHigh = 3 + row * field.width;
    expect(field.open[stairLow]).toBe(1);
    expect(field.open[stairHigh]).toBe(1);
    expect(field.collisionOpen[stairLow]).toBe(0);
    expect(field.collisionOpen[stairHigh]).toBe(0);
    expect(field.surfaceElev[stairLow]).toBeCloseTo(0.25);
    expect(field.surfaceElev[stairHigh]).toBeCloseTo(0.75);
    expect(field.heightAware[stairLow]).toBe(1);
    expect(field.moveMask[stairLow] & 1).not.toBe(0);
    expect(
      enemyCrowdOpenFieldAllowsMove(field, 38, 8, 44, 8, 3, 1),
    ).toBe(true);

    const moved = { x: 0, y: 0, elev: 0 };
    expect(
      enemyCrowdTryConnectorMove(field, 20, 8, 22, 8, 3, 0.25, moved),
    ).toBe(true);
    expect(moved.x).toBe(22);
    expect(moved.y).toBe(8);
    expect(moved.elev).toBeCloseTo(0.37, 1);
  });
});
