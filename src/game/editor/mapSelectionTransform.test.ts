import { describe, expect, it } from "vitest";
import { getEmberWorldObject } from "./world";
import {
  clearElevTile,
  createEmptyMap,
  elevTileIdAt,
  ensureMapLayers,
  heightVoxelsAt,
  setElevTileId,
} from "../tile/mapUtils";
import { translateEmberWorldSelection } from "./mapSelectionTransform";

describe("translateEmberWorldSelection", () => {
  it("moves selected tile stories atomically with their wall and modifier", () => {
    const map = ensureMapLayers(createEmptyMap("selection-move", 5, 5, "test", 16));
    clearElevTile(map, 1, 1, 0);
    clearElevTile(map, 1, 1, 2);
    clearElevTile(map, 2, 1, 0);
    clearElevTile(map, 2, 1, 2);
    setElevTileId(map, 1, 1, 0, 4);
    setElevTileId(map, 1, 1, 2, 7);
    const index = 1 * map.width + 1;
    map.layers.find((layer) => layer.name === "height")!.data[index] = 12;
    map.layers.find((layer) => layer.name === "collision")!.data[index] = 1;
    map.tileModifiers = [{ x: 1, y: 1, elev: 2, collider: { enabled: true } }];
    const objects = [0, 2].map((elev) =>
      getEmberWorldObject(map, { kind: "tile", tx: 1, ty: 1, elev }),
    );
    expect(objects.every(Boolean)).toBe(true);

    const moved = translateEmberWorldSelection(
      map,
      objects.filter((object): object is NonNullable<typeof object> => object != null),
      1,
      0,
    );

    expect(elevTileIdAt(moved, 1, 1, 0)).toBe(0);
    expect(elevTileIdAt(moved, 1, 1, 2)).toBe(0);
    expect(elevTileIdAt(moved, 2, 1, 0)).toBe(4);
    expect(elevTileIdAt(moved, 2, 1, 2)).toBe(7);
    expect(heightVoxelsAt(moved, 1, 1)).toBe(0);
    expect(heightVoxelsAt(moved, 2, 1)).toBe(12);
    expect(moved.tileModifiers).toEqual([
      { x: 2, y: 1, elev: 2, collider: { enabled: true } },
    ]);
  });
});
