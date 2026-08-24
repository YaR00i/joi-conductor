import { describe, expect, it } from "vitest";
import type {
  EmberMap,
  EmberPixelSprite,
  EmberTileset,
  EmberVoxelModel,
} from "../content/types";
import { WALL_HEIGHT } from "../tile/mapUtils";
import { VOXELS_PER_BLOCK } from "../voxel/constants";
import { listEmissiveLocalLights } from "./emissiveLocalLights";

const tileset: EmberTileset = {
  id: "test",
  tileSize: 16,
  columns: 1,
  tileCount: 1,
  tiles: [{ id: 1, name: "floor", color: "#777777" }],
};

function mapWith(overrides: Partial<EmberMap>): EmberMap {
  return {
    id: "lights-z",
    width: 4,
    height: 4,
    tileSize: 16,
    tilesetId: tileset.id,
    layers: [{ name: "ground", data: new Array(16).fill(1) }],
    regions: [],
    sprites: [],
    voxelProps: [],
    ...overrides,
  } as EmberMap;
}

const sprite: EmberPixelSprite = {
  id: "window",
  width: 4,
  topHeight: 4,
  wallHeights: [],
  pixels: new Array(16).fill("#ffffff"),
  emissivePixels: new Array(16).fill("#ffcc66"),
  color: "#ffffff",
  emissiveCastsLight: true,
  emissiveLightShadows: true,
};

describe("emissive local light placement", () => {
  it("keeps sprite light and shadows on the authored Z plane", () => {
    const ground = listEmissiveLocalLights(
      mapWith({
        sprites: [{ id: "s0", spriteId: sprite.id, x: 1, y: 1, elev: 0 }],
      }),
      tileset,
      { [sprite.id]: sprite },
    )[0]!;
    const high = listEmissiveLocalLights(
      mapWith({
        sprites: [{ id: "s3", spriteId: sprite.id, x: 1, y: 1, elev: 3 }],
      }),
      tileset,
      { [sprite.id]: sprite },
    )[0]!;

    expect(high.heightAboveFloor - ground.heightAboveFloor).toBeCloseTo(
      3 * WALL_HEIGHT,
    );
    expect(high.castShadows).toBe(true);
  });

  it("applies vertical Transform scale to sprite light height", () => {
    const normal = listEmissiveLocalLights(
      mapWith({
        sprites: [{ id: "s1", spriteId: sprite.id, x: 1, y: 1, elev: 1 }],
      }),
      tileset,
      { [sprite.id]: sprite },
    )[0]!;
    const tall = listEmissiveLocalLights(
      mapWith({
        sprites: [
          {
            id: "s2",
            spriteId: sprite.id,
            x: 1,
            y: 1,
            elev: 1,
            scale: { x: 1, y: 1, z: 2 },
          },
        ],
      }),
      tileset,
      { [sprite.id]: sprite },
    )[0]!;

    expect(tall.heightAboveFloor - WALL_HEIGHT).toBeCloseTo(
      2 * (normal.heightAboveFloor - WALL_HEIGHT),
    );
  });

  it("keeps a scaled voxel lamp origin on its authored Z plane", () => {
    const voxels = new Array(VOXELS_PER_BLOCK ** 3).fill(0);
    const emissive = new Array(voxels.length).fill(0);
    const index = 8 + 8 * VOXELS_PER_BLOCK + 8 * VOXELS_PER_BLOCK ** 2;
    voxels[index] = 1;
    emissive[index] = 255;
    const model: EmberVoxelModel = {
      id: "lamp",
      sizeBlocks: { x: 1, y: 1, z: 1 },
      palette: ["", "#ffffff"],
      voxels,
      emissive,
      emissiveCastsLight: true,
      emissiveLightOrigin: { x: 8.5, y: 8.5, z: 8.5 },
      emissiveLightShadows: true,
    };
    const light = listEmissiveLocalLights(
      mapWith({
        voxelProps: [
          {
            id: "v",
            modelId: model.id,
            x: 1,
            y: 1,
            elev: 2,
            scale: { x: 1, y: 1, z: 2 },
          },
        ],
      }),
      tileset,
      undefined,
      { [model.id]: model },
    )[0]!;

    // Explicit origins address a voxel cell; the resolver places the light at
    // that cell's centre before applying the placement's 2x vertical scale.
    expect(light.worldPosition?.y).toBeCloseTo(2 * WALL_HEIGHT + 18);
    expect(light.castShadows).toBe(true);
  });
});
