import { describe, expect, it } from "vitest";
import type { EmberMap, EmberTileset, EmberVoxelModel } from "../content/types";
import { VOXELS_PER_BLOCK } from "../voxel/constants";
import {
  circleHitsSolid,
  createEmptyMap,
  ensureMapLayers,
  layerData,
  setElevTileId,
  tileSurfaceElev,
  tryMoveWithElevation,
} from "./mapUtils";

const tileset: EmberTileset = {
  id: "test",
  tileSize: 16,
  columns: 5,
  tileCount: 5,
  tiles: [
    { id: 1, name: "floor", color: "#808080" },
    { id: 2, name: "wall", color: "#404040", solid: true, defaultHeight: 1 },
    { id: 3, name: "stair-n", color: "#a08060", stair: "n" },
    { id: 4, name: "stair-s", color: "#a08060", stair: "s" },
    { id: 5, name: "stair-e", color: "#a08060", stair: "e" },
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

function stepMany(
  map: EmberMap,
  start: { x: number; y: number; elev: number },
  stepX: number,
  stepY: number,
  n: number,
  voxelModels?: Record<string, EmberVoxelModel>,
) {
  let cur = { ...start };
  let peakElev = cur.elev;
  for (let i = 0; i < n; i++) {
    cur = tryMoveWithElevation(
      map,
      tileset,
      cur.x,
      cur.y,
      cur.x + stepX,
      cur.y + stepY,
      R,
      cur.elev,
      undefined,
      "top",
      voxelModels,
    );
    peakElev = Math.max(peakElev, cur.elev);
  }
  return { ...cur, peakElev };
}

/** 1×1 block footprint; solid column heights vary along +Z (south at rot=0). */
function makeSteppedStairModel(
  id: string,
  columnHeights: number[],
): EmberVoxelModel {
  const sx = VOXELS_PER_BLOCK;
  const sz = VOXELS_PER_BLOCK;
  const sy = Math.max(1, ...columnHeights);
  const voxels = new Array(sx * sy * sz).fill(0);
  const band = Math.floor(sz / columnHeights.length);
  for (let z = 0; z < sz; z++) {
    const h =
      columnHeights[
        Math.min(columnHeights.length - 1, Math.floor(z / band))
      ] ?? 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < sx; x++) {
        voxels[x + z * sx + y * sx * sz] = 1;
      }
    }
  }
  return {
    id,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: sy,
    palette: ["#000", "#fff"],
    voxels,
  };
}

describe("elevation collision: fall + voxel stairs", () => {
  it("can keep walking after falling off a tall wall (>4 voxels)", () => {
    const map = openYard();
    const tallVox = 16 * 2; // 2 stories
    setCell(map, "ground", 4, 4, 2);
    setCell(map, "collision", 4, 4, 1);
    setCell(map, "height", 4, 4, tallVox);

    const ts = map.tileSize;
    const start = {
      x: 4 * ts + ts / 2,
      y: 4 * ts + ts / 2,
      elev: tileSurfaceElev(map, 4, 4),
    };

    const landed = stepMany(map, start, 0, 2, 16);
    expect(landed.elev).toBeLessThan(0.2);
    expect(landed.y).toBeGreaterThan(start.y + 8);

    const further = tryMoveWithElevation(
      map,
      tileset,
      landed.x,
      landed.y,
      landed.x,
      landed.y + 4,
      R,
      landed.elev,
    );
    expect(further.y).toBeGreaterThan(landed.y + 1);
    expect(
      circleHitsSolid(map, tileset, further.x, further.y, R, further.elev),
    ).toBe(false);
  });

  it("can walk away after falling beside a tall solid voxel prop", () => {
    const model = makeSteppedStairModel("pillar", [16]);
    const map = openYard();
    map.voxelProps = [
      { id: "pillar", modelId: "pillar", x: 4, y: 4, rot: 0, elev: 0 },
    ];
    const models = { pillar: model };
    const ts = map.tileSize;
    // Land on floor just south of the prop after a long drop.
    const start = {
      x: 4 * ts + ts / 2,
      y: 4 * ts + ts + 3,
      elev: 0,
    };
    const away = stepMany(map, start, 0, 1.5, 10, models);
    expect(away.y).toBeGreaterThan(start.y + 8);
    expect(away.elev).toBeLessThan(0.2);
  });

  it("blocks walking into tall voxel stair face from the high side at ground", () => {
    // 3/6/9/12 voxel steps — tall face is 12 > auto-step 4
    const model = makeSteppedStairModel("stair", [3, 6, 9, 12]);
    const map = openYard();
    map.voxelProps = [
      { id: "p1", modelId: "stair", x: 3, y: 3, rot: 0, elev: 0 },
    ];
    const models = { stair: model };
    const ts = map.tileSize;
    const start = {
      x: 3 * ts + ts / 2,
      y: 3 * ts + ts + 4,
      elev: 0,
    };
    const after = stepMany(map, start, 0, -1.5, 20, models);
    // Must not tunnel through to the north side of the prop.
    expect(after.y).toBeGreaterThan(3 * ts + 4);
    expect(after.elev).toBeLessThan(0.2);
    expect(after.peakElev).toBeLessThan(0.2);
  });

  it("allows climbing a 4-voxel voxel step from the low side", () => {
    const model = makeSteppedStairModel("block4", [4]);
    const map = openYard();
    map.voxelProps = [
      { id: "p2", modelId: "block4", x: 3, y: 3, rot: 0, elev: 0 },
    ];
    const models = { block4: model };
    const ts = map.tileSize;
    const start = {
      x: 3 * ts + ts / 2,
      y: 3 * ts - 3,
      elev: 0,
    };
    const onTop = stepMany(map, start, 0, 1.5, 8, models);
    expect(onTop.peakElev).toBeGreaterThan(0.2);
    expect(onTop.y).toBeGreaterThan(3 * ts);
    expect(onTop.y).toBeLessThan(3 * ts + ts);
  });

  it("allows climbing short stairs (4vx steps) without wall-lock", () => {
    const model = makeSteppedStairModel("shortSteps", [4, 8]);
    const map = openYard();
    map.voxelProps = [
      { id: "p3", modelId: "shortSteps", x: 3, y: 3, rot: 0, elev: 0 },
    ];
    const models = { shortSteps: model };
    const ts = map.tileSize;
    const start = {
      x: 3 * ts + ts / 2,
      y: 3 * ts - 3,
      elev: 0,
    };
    const top = stepMany(map, start, 0, 1.5, 16, models);
    expect(top.peakElev).toBeGreaterThan(0.4);
  });

  it("climbs multi-step voxel stairs from the low (north) side", () => {
    const model = makeSteppedStairModel("flight", [3, 6, 9, 12]);
    const map = openYard();
    map.voxelProps = [
      { id: "p4", modelId: "flight", x: 3, y: 3, rot: 0, elev: 0 },
    ];
    const models = { flight: model };
    const ts = map.tileSize;
    const start = {
      x: 3 * ts + ts / 2,
      y: 3 * ts - 3,
      elev: 0,
    };
    const top = stepMany(map, start, 0, 1.0, 40, models);
    expect(top.peakElev).toBeGreaterThan(0.5);
    expect(top.y).toBeGreaterThan(3 * ts + 8);
  });

  it("climbs 2-voxel sculpted stairs from the low side (radius reaches ahead)", () => {
    // User stairs: 2vx risers. Player R=2.5 reaches ~2 steps ahead.
    const model = makeSteppedStairModel(
      "fine",
      [2, 4, 6, 8, 10, 12, 14, 16],
    );
    const map = openYard();
    map.voxelProps = [
      { id: "p5", modelId: "fine", x: 3, y: 3, rot: 0, elev: 0 },
    ];
    const models = { fine: model };
    const ts = map.tileSize;
    const start = {
      x: 3 * ts + ts / 2,
      y: 3 * ts - 3,
      elev: 0,
    };
    const top = stepMany(map, start, 0, 0.8, 50, models);
    expect(top.peakElev).toBeGreaterThan(0.7);
    expect(top.y).toBeGreaterThan(3 * ts + 10);
  });

  it("does not phase through voxel stairs at ground elev from the low side", () => {
    const model = makeSteppedStairModel("flight", [3, 6, 9, 12]);
    const map = openYard();
    map.voxelProps = [
      { id: "p6", modelId: "flight", x: 3, y: 3, rot: 0, elev: 0 },
    ];
    const models = { flight: model };
    const ts = map.tileSize;
    const start = {
      x: 3 * ts + ts / 2,
      y: 3 * ts - 3,
      elev: 0,
    };
    const after = stepMany(map, start, 0, 1.5, 30, models);
    const crossedAtGround =
      after.y > 3 * ts + ts && after.elev < 0.2 && after.peakElev < 0.2;
    expect(crossedAtGround).toBe(false);
  });

  it("climbs rotated (rot=1) voxel stairs from the correct low end", () => {
    // rot=1: model +Z → world +X, so low (z=0) is west, high is east.
    const model = makeSteppedStairModel("rotFlight", [2, 4, 6, 8]);
    const map = openYard();
    map.voxelProps = [
      { id: "p7", modelId: "rotFlight", x: 3, y: 3, rot: 1, elev: 0 },
    ];
    const models = { rotFlight: model };
    const ts = map.tileSize;
    const start = {
      x: 3 * ts - 3,
      y: 3 * ts + ts / 2,
      elev: 0,
    };
    const top = stepMany(map, start, 1.0, 0, 40, models);
    expect(top.peakElev).toBeGreaterThan(0.35);
    expect(top.x).toBeGreaterThan(3 * ts + 6);
  });

  it("blocks rotated stair high-side approach at ground", () => {
    const model = makeSteppedStairModel("rotFlight", [2, 4, 6, 8]);
    const map = openYard();
    map.voxelProps = [
      { id: "p8", modelId: "rotFlight", x: 3, y: 3, rot: 1, elev: 0 },
    ];
    const models = { rotFlight: model };
    const ts = map.tileSize;
    // High end is east — approach from east at Z0.
    const start = {
      x: 3 * ts + ts + 4,
      y: 3 * ts + ts / 2,
      elev: 0,
    };
    const after = stepMany(map, start, -1.5, 0, 20, models);
    expect(after.x).toBeGreaterThan(3 * ts + 4);
    expect(after.peakElev).toBeLessThan(0.2);
  });
});

/** Stair-n at (4,4) Z0 + filled landing column at (4,3) up to Z1. */
function placeNorthStairFlight(map: EmberMap) {
  setElevTileId(map, 4, 4, 0, 3); // stair-n
  setElevTileId(map, 4, 3, 0, 1); // filled column under landing
  setElevTileId(map, 4, 3, 1, 1); // high landing
}

describe("elevation collision: connector stairs", () => {
  it("climbs connector stair from the low end along climb dir", () => {
    // Stair-n: climb toward north. Low end is south neighbor.
    const map = openYard();
    placeNorthStairFlight(map);
    const ts = map.tileSize;
    const start = {
      x: 4 * ts + ts / 2,
      y: 4 * ts + ts + 2,
      elev: 0,
    };
    const top = stepMany(map, start, 0, -1.0, 30);
    expect(top.peakElev).toBeGreaterThan(0.7);
    expect(top.y).toBeLessThan(4 * ts);
  });

  it("blocks connector stair entry from the side (not climb axis)", () => {
    const map = openYard();
    placeNorthStairFlight(map);
    const ts = map.tileSize;
    const start = {
      x: 4 * ts - 3,
      y: 4 * ts + ts / 2,
      elev: 0,
    };
    const after = stepMany(map, start, 1.2, 0, 20);
    expect(after.x).toBeLessThan(4 * ts + 2);
    expect(after.elev).toBeLessThan(0.2);
  });

  it("blocks walking under connector stair from the high-side at Z0", () => {
    // High landing north at Z1 (filled column). Stand beside it at Z0 and
    // walk south into the flight — must not phase through at ground elev.
    const map = openYard();
    placeNorthStairFlight(map);
    const ts = map.tileSize;
    const start = {
      x: 5 * ts + ts / 2,
      y: 3 * ts + ts / 2,
      elev: 0,
    };
    const after = stepMany(map, start, -1.0, 1.0, 24);
    const enteredStair =
      after.y >= 4 * ts && after.y < 4 * ts + ts;
    const phasedSouth =
      after.y > 4 * ts + ts / 2 && after.peakElev < 0.25;
    expect(enteredStair && after.peakElev < 0.25).toBe(false);
    expect(phasedSouth).toBe(false);
  });

  it("allows walking down connector stair from the high landing", () => {
    const map = openYard();
    placeNorthStairFlight(map);
    const ts = map.tileSize;
    const start = {
      x: 4 * ts + ts / 2,
      y: 3 * ts + ts / 2,
      elev: 1,
    };
    const bottom = stepMany(map, start, 0, 1.0, 30);
    expect(bottom.elev).toBeLessThan(0.3);
    expect(bottom.y).toBeGreaterThan(4 * ts);
  });
});

describe("elevation collision: walk under floating solids", () => {
  it("walks on a Z0 floor under an independent Z3 ceiling", () => {
    const map = openYard();
    setElevTileId(map, 4, 4, 0, 1);
    setElevTileId(map, 4, 4, 3, 1);
    const ts = map.tileSize;
    const through = stepMany(
      map,
      { x: 3 * ts + ts / 2, y: 4 * ts + ts / 2, elev: 0 },
      1.5,
      0,
      12,
    );
    expect(through.x).toBeGreaterThan(4 * ts + 2);
    expect(through.elev).toBeLessThan(0.2);
  });

  it("blocks a low Z1 ceiling because it intersects the actor body", () => {
    const map = openYard();
    setElevTileId(map, 4, 4, 0, 1);
    setElevTileId(map, 4, 4, 1, 1);
    const ts = map.tileSize;
    const through = stepMany(
      map,
      { x: 3 * ts + ts / 2, y: 4 * ts + ts / 2, elev: 0 },
      1.5,
      0,
      12,
    );
    expect(through.x).toBeLessThan(4 * ts);
  });

  it("keeps an explicitly filled Z0-Z3 column solid", () => {
    const map = openYard();
    for (let z = 0; z <= 3; z++) setElevTileId(map, 4, 4, z, 1);
    const ts = map.tileSize;
    const through = stepMany(
      map,
      { x: 3 * ts + ts / 2, y: 4 * ts + ts / 2, elev: 0 },
      1.5,
      0,
      12,
    );
    expect(through.x).toBeLessThan(4 * ts);
  });

  it("uses stage body height for ceiling clearance", () => {
    const map = openYard();
    setElevTileId(map, 4, 4, 0, 1);
    setElevTileId(map, 4, 4, 3, 1);
    const ts = map.tileSize;
    const blocked = tryMoveWithElevation(
      map,
      tileset,
      3 * ts + ts / 2,
      4 * ts + ts / 2,
      4 * ts + ts / 2,
      4 * ts + ts / 2,
      R,
      0,
      undefined,
      "top",
      undefined,
      undefined,
      { heightVoxels: 34 },
    );
    expect(blocked.x).toBeLessThan(4 * ts);
  });

  it("allows walking under a floating ground_z3 slab at elev 0", () => {
    const map = openYard();
    // Clear z0 under the target cell, place only a high slab.
    setCell(map, "ground", 4, 4, 0);
    setElevTileId(map, 4, 4, 0, 0);
    setElevTileId(map, 4, 4, 3, 1);
    const ts = map.tileSize;
    const start = {
      x: 3 * ts + ts / 2,
      y: 4 * ts + ts / 2,
      elev: 0,
    };
    const through = stepMany(map, start, 1.5, 0, 12);
    expect(through.x).toBeGreaterThan(4 * ts + 2);
    expect(through.elev).toBeLessThan(0.2);
    expect(
      circleHitsSolid(map, tileset, 4 * ts + ts / 2, 4 * ts + ts / 2, R, 0),
    ).toBe(false);
  });

  it("allows walking under a voxel overhang (solids only high in the grid)", () => {
    const sx = VOXELS_PER_BLOCK;
    const sz = VOXELS_PER_BLOCK;
    const sy = VOXELS_PER_BLOCK * 2;
    const voxels = new Array(sx * sy * sz).fill(0);
    // Solid only in the top half of the column (elev ~1 story when placed at 0).
    for (let y = VOXELS_PER_BLOCK; y < sy; y++) {
      for (let z = 0; z < sz; z++) {
        for (let x = 0; x < sx; x++) {
          voxels[x + z * sx + y * sx * sz] = 1;
        }
      }
    }
    const model: EmberVoxelModel = {
      id: "overhang",
      sizeBlocks: { x: 1, y: 2, z: 1 },
      heightVoxels: sy,
      palette: ["#000", "#fff"],
      voxels,
    };
    const map = openYard();
    map.voxelProps = [
      { id: "oh", modelId: "overhang", x: 4, y: 4, rot: 0, elev: 0 },
    ];
    const models = { overhang: model };
    const ts = map.tileSize;
    const start = {
      x: 3 * ts + ts / 2,
      y: 4 * ts + ts / 2,
      elev: 0,
    };
    const through = stepMany(map, start, 1.5, 0, 12, models);
    expect(through.x).toBeGreaterThan(4 * ts + 2);
    expect(through.elev).toBeLessThan(0.2);
  });
});
