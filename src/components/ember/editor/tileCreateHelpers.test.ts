import { describe, expect, it } from "vitest";
import type { EmberTileset } from "../../../game/content/types";
import {
  appendBlankTile,
  removeTileFromTileset,
} from "./tileCreateHelpers";

function tileset(ids: number[]): EmberTileset {
  return {
    id: "test",
    tileSize: 16,
    columns: 4,
    tileCount: ids.length,
    tiles: ids.map((id) => ({
      id,
      name: `t${id}`,
      color: "#333",
      material: "stone",
    })),
  };
}

describe("removeTileFromTileset", () => {
  it("refuses empty / id 0 / last remaining tile", () => {
    expect(removeTileFromTileset(tileset([0]), 0)).toBeNull();
    expect(removeTileFromTileset(tileset([1]), 1)).toBeNull();
    expect(removeTileFromTileset(tileset([0, 2]), 0)).toBeNull();
    expect(removeTileFromTileset(tileset([0, 2]), 9)).toBeNull();
  });

  it("drops the tile and picks another id", () => {
    const start = appendBlankTile(tileset([0, 1]));
    expect(start.tileId).toBe(2);
    const removed = removeTileFromTileset(start.tileset, 2);
    expect(removed).not.toBeNull();
    expect(removed!.tileset.tiles.map((t) => t.id)).toEqual([0, 1]);
    expect(removed!.tileset.tileCount).toBe(2);
    expect(removed!.nextTileId).toBe(1);
  });
});
