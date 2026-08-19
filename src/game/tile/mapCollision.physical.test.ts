import { describe, expect, it } from "vitest";
import type {
  EmberMap,
  EmberMapRegion,
  EmberPixelSprite,
  EmberTileset,
  EmberVoxelModel,
} from "../content/types";
import { VOXELS_PER_BLOCK } from "../voxel/constants";
import { isVoxelModelPhysical } from "../voxel/voxelModel";
import {
  circleHitsSolid,
  clearElevTile,
  createEmptyMap,
  ensureMapLayers,
  layerData,
  moveElevTile,
  setElevTileId,
  tryMoveWithElevation,
} from "./mapUtils";

const tileset: EmberTileset = {
  id: "test",
  tileSize: 16,
  columns: 2,
  tileCount: 2,
  tiles: [
    { id: 1, name: "floor", color: "#808080" },
    { id: 2, name: "wall", color: "#404040", solid: true, defaultHeight: 1 },
  ],
};

const R = 2.5;

function setCell(
  map: EmberMap,
  layer: string,
  x: number,
  y: number,
  value: number,
) {
  const data = layerData(map, layer);
  if (!data) throw new Error(`missing ${layer}`);
  data[y * map.width + x] = value;
}

function openYard(): EmberMap {
  const map = ensureMapLayers(createEmptyMap("yard", 9, 9, "test", 16));
  for (let y = 1; y < 8; y++) {
    for (let x = 1; x < 8; x++) {
      setCell(map, "ground", x, y, 1);
      setCell(map, "collision", x, y, 0);
      setCell(map, "height", x, y, 0);
      setCell(map, "elevation", x, y, 0);
    }
  }
  return map;
}

function solidCube(id: string, physical?: boolean): EmberVoxelModel {
  const sx = VOXELS_PER_BLOCK;
  const sy = VOXELS_PER_BLOCK;
  const sz = VOXELS_PER_BLOCK;
  const voxels = new Array(sx * sy * sz).fill(1);
  return {
    id,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: sy,
    palette: ["", "#ccc"],
    voxels,
    physical,
  };
}

describe("voxel model physicality", () => {
  it("defaults to physical when flag omitted", () => {
    expect(isVoxelModelPhysical(solidCube("a"))).toBe(true);
    expect(isVoxelModelPhysical(solidCube("b", true))).toBe(true);
    expect(isVoxelModelPhysical(solidCube("c", false))).toBe(false);
  });

  it("non-physical map voxel props are walk-through", () => {
    const model = solidCube("ghost", false);
    const map = openYard();
    map.voxelProps = [
      { id: "p", modelId: "ghost", x: 4, y: 4, elev: 0 },
    ];
    const models = { ghost: model };
    const ts = map.tileSize;
    const x = 4 * ts + ts / 2;
    const y = 4 * ts + ts / 2;
    expect(circleHitsSolid(map, tileset, x, y, R, 0, undefined, "top", models)).toBe(
      false,
    );
    const moved = tryMoveWithElevation(
      map,
      tileset,
      x - 6,
      y,
      x + 6,
      y,
      R,
      0,
      undefined,
      "top",
      models,
    );
    expect(moved.x).toBeGreaterThan(x);
  });

  it("physical map voxel props still block", () => {
    const model = solidCube("crate");
    const map = openYard();
    map.voxelProps = [
      { id: "p", modelId: "crate", x: 4, y: 4, elev: 0 },
    ];
    const models = { crate: model };
    const ts = map.tileSize;
    const x = 4 * ts + ts / 2;
    const y = 4 * ts + ts / 2;
    expect(circleHitsSolid(map, tileset, x, y, R, 0, undefined, "top", models)).toBe(
      true,
    );
  });

  it("zone chest with non-physical model stays walk-through", () => {
    const model = solidCube("chest", false);
    const map = openYard();
    const region: EmberMapRegion = {
      id: "chest_a",
      kind: "chest",
      x: 4,
      y: 4,
      w: 1,
      h: 1,
      closedModelId: "chest",
    };
    map.regions = [region];
    const models = { chest: model };
    const ts = map.tileSize;
    const x = 4 * ts + ts / 2;
    const y = 4 * ts + ts / 2;
    expect(
      circleHitsSolid(
        map,
        tileset,
        x,
        y,
        R,
        0,
        undefined,
        "top",
        models,
      ),
    ).toBe(false);
  });

  it("zone chest with physical model blocks", () => {
    const model = solidCube("chest", true);
    const map = openYard();
    map.regions = [
      {
        id: "chest_a",
        kind: "chest",
        x: 4,
        y: 4,
        w: 1,
        h: 1,
        closedModelId: "chest",
      },
    ];
    const models = { chest: model };
    const ts = map.tileSize;
    const x = 4 * ts + ts / 2;
    const y = 4 * ts + ts / 2;
    expect(
      circleHitsSolid(
        map,
        tileset,
        x,
        y,
        R,
        0,
        undefined,
        "top",
        models,
      ),
    ).toBe(true);
  });
});

describe("sprite and tile instance collider overrides", () => {
  const sprite = (id: string, solid: boolean): EmberPixelSprite => ({
    id,
    width: 16,
    topHeight: 16,
    wallHeights: [],
    pixels: new Array(16 * 16).fill("#fff"),
    color: "#fff",
    solid,
  });

  it("can disable an asset Collider on one sprite placement", () => {
    const map = openYard();
    map.sprites = [
      {
        id: "barrel-1",
        spriteId: "barrel",
        x: 4,
        y: 4,
        componentStates: { collider: false },
      },
    ];
    const ts = map.tileSize;
    expect(
      circleHitsSolid(
        map,
        tileset,
        4 * ts + ts / 2,
        4 * ts + ts / 2,
        R,
        0,
        { barrel: sprite("barrel", true) },
      ),
    ).toBe(false);
  });

  it("can add a Collider to one non-solid sprite placement", () => {
    const map = openYard();
    map.sprites = [
      {
        id: "banner-1",
        spriteId: "banner",
        x: 4,
        y: 4,
        componentStates: { collider: true },
      },
    ];
    const ts = map.tileSize;
    expect(
      circleHitsSolid(
        map,
        tileset,
        4 * ts + ts / 2,
        4 * ts + ts / 2,
        R,
        0,
        { banner: sprite("banner", false) },
      ),
    ).toBe(true);
  });

  it("can disable one solid tile without changing its asset", () => {
    const map = openYard();
    setCell(map, "ground", 4, 4, 2);
    setCell(map, "collision", 4, 4, 1);
    setElevTileId(map, 4, 4, 0, 2);
    const ts = map.tileSize;
    expect(
      circleHitsSolid(
        map,
        tileset,
        4 * ts + ts / 2,
        4 * ts + ts / 2,
        R,
      ),
    ).toBe(true);
    map.tileModifiers = [
      {
        x: 4,
        y: 4,
        elev: 0,
        componentStates: { collider: false },
      },
    ];
    expect(
      circleHitsSolid(
        map,
        tileset,
        4 * ts + ts / 2,
        4 * ts + ts / 2,
        R,
      ),
    ).toBe(false);
    expect(tileset.tiles[1].solid).toBe(true);
  });

  it("moves and clears tile overrides together with their block", () => {
    const map = openYard();
    setElevTileId(map, 4, 4, 0, 2);
    map.tileModifiers = [
      {
        x: 4,
        y: 4,
        elev: 0,
        collider: { offsetVoxels: 3 },
      },
    ];
    expect(moveElevTile(map, 4, 4, 0, 1)).toBe(true);
    expect(map.tileModifiers?.[0]).toMatchObject({ elev: 1 });
    clearElevTile(map, 4, 4, 1);
    expect(map.tileModifiers).toEqual([]);
  });
});
