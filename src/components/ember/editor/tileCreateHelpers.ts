import type { EmberTileset, EmberTilesetTile } from "../../../game/content/types";

function emptyPixels(n: number, fill = ""): string[] {
  return new Array(n * n).fill(fill);
}

/** Append a blank tile (top + wall faces) and bump tileCount. */
export function appendBlankTile(tileset: EmberTileset): {
  tileset: EmberTileset;
  tileId: number;
} {
  const maxId = Math.max(0, ...tileset.tiles.map((t) => t.id));
  const tileId = maxId + 1;
  const size = tileset.tileSize;
  const blank = emptyPixels(size);
  const nextTile: EmberTilesetTile = {
    id: tileId,
    name: `Тайл ${tileId}`,
    color: "#2f4a30",
    material: "stone",
    pixels: [...blank],
    wallPixels: [...blank],
  };
  return {
    tileId,
    tileset: {
      ...tileset,
      tiles: [...tileset.tiles, nextTile],
      tileCount: tileset.tiles.length + 1,
    },
  };
}

/** Clone an existing tile (new id). Returns null if source missing. */
export function appendClonedTile(
  tileset: EmberTileset,
  sourceId: number,
): { tileset: EmberTileset; tileId: number } | null {
  const src = tileset.tiles.find((t) => t.id === sourceId);
  if (!src) return null;
  const maxId = Math.max(0, ...tileset.tiles.map((t) => t.id));
  const tileId = maxId + 1;
  const nextTile: EmberTilesetTile = {
    ...src,
    id: tileId,
    name: `${src.name || `Тайл ${src.id}`} копия`,
    pixels: src.pixels ? [...src.pixels] : undefined,
    wallPixels: src.wallPixels ? [...src.wallPixels] : undefined,
    emissivePixels: src.emissivePixels ? [...src.emissivePixels] : undefined,
    emissiveWallPixels: src.emissiveWallPixels
      ? [...src.emissiveWallPixels]
      : undefined,
    shinePixels: src.shinePixels ? [...src.shinePixels] : undefined,
    shineWallPixels: src.shineWallPixels ? [...src.shineWallPixels] : undefined,
  };
  return {
    tileId,
    tileset: {
      ...tileset,
      tiles: [...tileset.tiles, nextTile],
      tileCount: tileset.tiles.length + 1,
    },
  };
}
