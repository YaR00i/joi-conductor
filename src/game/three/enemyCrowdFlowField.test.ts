import { describe, expect, it } from "vitest";
import type {
  EmberMap,
  EmberTileset,
  EmberVoxelModel,
} from "../content/types";
import { buildEnemyCrowdOpenField } from "./enemyCrowdOpenField";
import { moveWithVoxels } from "./voxelCollision";
import type { EnemyCrowdOpenField } from "./enemyCrowdOpenField";
import {
  ENEMY_FLOW_GUIDED,
  createEnemyCrowdFlowField,
  enemyCrowdFlowDirection,
  updateEnemyCrowdFlowField,
} from "./enemyCrowdFlowField";

function openField(
  width: number,
  height: number,
  blocked: Array<[number, number]> = [],
): EnemyCrowdOpenField {
  const open = new Uint8Array(width * height);
  open.fill(1);
  for (const [x, y] of blocked) open[x + y * width] = 0;
  const moveMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = x + y * width;
      if (open[index] === 0) continue;
      if (x + 1 < width && open[index + 1]) moveMask[index] |= 1 << 0;
      if (x > 0 && open[index - 1]) moveMask[index] |= 1 << 1;
      if (y + 1 < height && open[index + width]) moveMask[index] |= 1 << 2;
      if (y > 0 && open[index - width]) moveMask[index] |= 1 << 3;
    }
  }
  return {
    width,
    height,
    mapTileSize: 16,
    subdivisions: 1,
    tileSize: 16,
    open,
    collisionOpen: open.slice(),
    surfaceElev: new Float32Array(width * height),
    surfaceMin: new Float32Array(width * height),
    surfaceMax: new Float32Array(width * height),
    edgeEastElev: new Float32Array(width * height),
    edgeWestElev: new Float32Array(width * height),
    edgeSouthElev: new Float32Array(width * height),
    edgeNorthElev: new Float32Array(width * height),
    moveMask,
    heightAware: new Uint8Array(width * height),
    transitionCount: 0,
    connectorDx: new Int8Array(width * height),
    connectorDy: new Int8Array(width * height),
    connectorLow: new Float32Array(width * height),
    connectorHigh: new Float32Array(width * height),
  };
}

function voxelStairModel(): EmberVoxelModel {
  const size = 16;
  const voxels = new Array<number>(size * size * size).fill(0);
  for (let z = 0; z < size; z++) {
    const height = Math.min(size, 2 + Math.floor(z / 2) * 2);
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < height; y++) {
        voxels[x + z * size + y * size * size] = 1;
      }
    }
  }
  return {
    id: "voxel-stair",
    nameRu: "Лестница",
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: 16,
    palette: ["", "#777777"],
    voxels,
    physical: true,
  };
}

describe("enemy crowd flow field", () => {
  it("routes the crowd toward a gap instead of into a wall", () => {
    const source = openField(7, 7, [
      [3, 0],
      [3, 1],
      [3, 2],
      [3, 3],
      [3, 4],
      [3, 6],
    ]);
    const flow = createEnemyCrowdFlowField(source);
    expect(updateEnemyCrowdFlowField(flow, 5.5 * 16, 2.5 * 16, 0)).toBe(true);
    const direction = { x: 0, y: 0 };
    expect(
      enemyCrowdFlowDirection(flow, 1.5 * 16, 2.5 * 16, 0, direction),
    ).toBe(ENEMY_FLOW_GUIDED);
    expect(direction.y).toBeGreaterThan(0);
  });

  it("distributes stable crowd groups across near-optimal downhill lanes", () => {
    const flow = createEnemyCrowdFlowField(openField(9, 9));
    updateEnemyCrowdFlowField(flow, 7.5 * 16, 7.5 * 16, 0);
    const lanes = new Set<string>();
    for (let routeKey = 0; routeKey < 6; routeKey++) {
      const direction = { x: 0, y: 0 };
      expect(
        enemyCrowdFlowDirection(
          flow,
          1.5 * 16,
          1.5 * 16,
          0,
          direction,
          routeKey,
        ),
      ).toBe(ENEMY_FLOW_GUIDED);
      lanes.add(`${Math.sign(direction.x)},${Math.sign(direction.y)}`);
    }
    expect(lanes.size).toBeGreaterThanOrEqual(3);
  });

  it("does not rebuild while the player remains in the same tile", () => {
    const flow = createEnemyCrowdFlowField(openField(5, 5));
    expect(updateEnemyCrowdFlowField(flow, 34, 34, 0)).toBe(true);
    expect(updateEnemyCrowdFlowField(flow, 39, 38, 0.4)).toBe(false);
    expect(flow.rebuilds).toBe(1);
    expect(updateEnemyCrowdFlowField(flow, 50, 38, 0)).toBe(true);
    expect(flow.rebuilds).toBe(2);
  });

  it("keeps different elevations disconnected but seeds every isolated island", () => {
    const source = openField(5, 3, [
      [2, 0],
      [2, 1],
      [2, 2],
    ]);
    source.surfaceElev[0] = 2;
    const flow = createEnemyCrowdFlowField(source);
    updateEnemyCrowdFlowField(flow, 4.5 * 16, 1.5 * 16, 0);
    const direction = { x: 0, y: 0 };
    expect(
      enemyCrowdFlowDirection(flow, 0.5 * 16, 0.5 * 16, 2, direction),
    ).toBe(2);
    expect(enemyCrowdFlowDirection(flow, 0.5 * 16, 1.5 * 16, 0, direction)).toBe(
      ENEMY_FLOW_GUIDED,
    );
    expect(direction.x).toBeGreaterThan(0);
    expect(flow.targetCount).toBe(3);
  });

  it("connects lower and upper stories only through a stair axis", () => {
    const source = openField(3, 1);
    source.surfaceElev[1] = 0.5;
    source.surfaceElev[2] = 1;
    source.collisionOpen[1] = 0;
    source.connectorDx[1] = 1;
    source.connectorLow[1] = 0;
    source.connectorHigh[1] = 1;
    const flow = createEnemyCrowdFlowField(source);
    updateEnemyCrowdFlowField(flow, 2.5 * 16, 0.5 * 16, 1);

    const direction = { x: 0, y: 0 };
    expect(
      enemyCrowdFlowDirection(flow, 0.5 * 16, 0.5 * 16, 0, direction),
    ).toBe(ENEMY_FLOW_GUIDED);
    expect(direction.x).toBeGreaterThan(0);
    expect(
      enemyCrowdFlowDirection(flow, 1.5 * 16, 0.5 * 16, 0.5, direction),
    ).toBe(ENEMY_FLOW_GUIDED);
    expect(direction.x).toBeGreaterThan(0);
    expect(flow.componentCount).toBe(1);
    expect(flow.targetFallbackDistanceCells).toBe(0);
    expect(flow.reachableCells).toBe(3);
  });

  it("keeps climbing when the player target is inside the connector cell", () => {
    const source = openField(3, 1);
    source.surfaceElev[1] = 0.5;
    source.surfaceElev[2] = 1;
    source.collisionOpen[1] = 0;
    source.connectorDx[1] = 1;
    source.connectorLow[1] = 0;
    source.connectorHigh[1] = 1;
    const flow = createEnemyCrowdFlowField(source);
    updateEnemyCrowdFlowField(flow, 1.75 * 16, 0.5 * 16, 1);
    const direction = { x: 0, y: 0, heightTransition: false };
    expect(
      enemyCrowdFlowDirection(
        flow,
        1.25 * 16,
        0.5 * 16,
        0.25,
        direction,
      ),
    ).toBe(ENEMY_FLOW_GUIDED);
    expect(direction.x).toBe(1);
    expect(direction.y).toBe(0);
    expect(direction.heightTransition).toBe(true);
  });

  it("assigns each group to the nearer independent staircase", () => {
    const blocked: Array<[number, number]> = [];
    for (let x = 0; x < 7; x++) {
      if (x !== 1 && x !== 5) blocked.push([x, 1]);
    }
    const source = openField(7, 3, blocked);
    for (let x = 0; x < 7; x++) source.surfaceElev[x] = 1;
    for (const x of [1, 5]) {
      const index = x + 7;
      source.surfaceElev[index] = 0.5;
      source.collisionOpen[index] = 0;
      source.connectorDy[index] = -1;
      source.connectorLow[index] = 0;
      source.connectorHigh[index] = 1;
    }
    const flow = createEnemyCrowdFlowField(source);
    updateEnemyCrowdFlowField(flow, 3.5 * 16, 0.5 * 16, 1);
    expect(flow.connectorGroupCount).toBe(2);

    const left = { x: 0, y: 0, routeGroup: -1 };
    const right = { x: 0, y: 0, routeGroup: -1 };
    expect(
      enemyCrowdFlowDirection(
        flow,
        1.5 * 16,
        2.5 * 16,
        0,
        left,
        7,
      ),
    ).toBe(ENEMY_FLOW_GUIDED);
    expect(
      enemyCrowdFlowDirection(
        flow,
        5.5 * 16,
        2.5 * 16,
        0,
        right,
        7,
      ),
    ).toBe(ENEMY_FLOW_GUIDED);
    expect(left.routeGroup).not.toBe(right.routeGroup);
    expect(left.x).toBe(0);
    expect(left.y).toBeLessThan(0);
    expect(right.x).toBe(0);
    expect(right.y).toBeLessThan(0);
  });

  it("guides exact enemy movement up an authored stair to the player story", () => {
    const tileset: EmberTileset = {
      id: "height-flow",
      tileSize: 16,
      columns: 2,
      tileCount: 2,
      tiles: [
        { id: 1, name: "Пол", color: "#222222" },
        { id: 2, name: "Лестница", color: "#777777", stair: "e" },
      ],
    };
    const map: EmberMap = {
      id: "height-flow",
      nameRu: "Height flow",
      width: 5,
      height: 3,
      tileSize: 16,
      tilesetId: tileset.id,
      layers: [
        {
          name: "ground",
          type: "tile",
          data: [1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1],
        },
        {
          name: "elevation",
          type: "tile",
          data: [0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1],
        },
      ],
      regions: [],
    };
    const source = buildEnemyCrowdOpenField(map, tileset);
    const flow = createEnemyCrowdFlowField(source);
    updateEnemyCrowdFlowField(flow, 4.5 * 16, 1.5 * 16, 1);
    const direction = { x: 0, y: 0 };
    let actor = { x: 0.5 * 16, y: 1.5 * 16, elev: 0 };

    for (let step = 0; step < 120; step++) {
      const result = enemyCrowdFlowDirection(
        flow,
        actor.x,
        actor.y,
        actor.elev,
        direction,
      );
      if (result !== ENEMY_FLOW_GUIDED) break;
      actor = moveWithVoxels(
        map,
        tileset,
        actor.x,
        actor.y,
        actor.x + direction.x * 1.5,
        actor.y + direction.y * 1.5,
        3,
        actor.elev,
      );
    }

    expect(actor.x).toBeGreaterThan(4 * 16);
    expect(actor.elev).toBeCloseTo(1, 1);
  });

  it("detects and climbs a sculpted voxel staircase without authored stair tiles", () => {
    const flatTileset: EmberTileset = {
      id: "voxel-height-flow",
      tileSize: 16,
      columns: 1,
      tileCount: 1,
      tiles: [{ id: 1, name: "Пол", color: "#222222" }],
    };
    const map: EmberMap = {
      id: "voxel-height-flow",
      nameRu: "Voxel height flow",
      width: 3,
      height: 3,
      tileSize: 16,
      tilesetId: flatTileset.id,
      layers: [
        { name: "ground", type: "tile", data: Array(9).fill(1) },
        { name: "elevation", type: "tile", data: [0, 0, 0, 0, 0, 0, 1, 1, 1] },
      ],
      voxelProps: [
        { id: "stair", modelId: "voxel-stair", x: 1, y: 1, elev: 0 },
      ],
      regions: [],
    };
    const models = { "voxel-stair": voxelStairModel() };
    const source = buildEnemyCrowdOpenField(
      map,
      flatTileset,
      undefined,
      models,
    );
    expect(source.subdivisions).toBe(2);
    const stairIndex = 3 + 2 * source.width;
    expect(source.heightAware[stairIndex]).toBe(1);
    expect(source.surfaceMin[stairIndex]).toBeLessThan(
      source.surfaceMax[stairIndex]!,
    );
    expect(source.moveMask[stairIndex] & (1 << 2)).not.toBe(0);

    const flow = createEnemyCrowdFlowField(source);
    updateEnemyCrowdFlowField(flow, 1.5 * 16, 2.5 * 16, 1);
    const direction = { x: 0, y: 0 };
    let actor = { x: 1.5 * 16, y: 0.5 * 16, elev: 0 };
    for (let step = 0; step < 100; step++) {
      const result = enemyCrowdFlowDirection(
        flow,
        actor.x,
        actor.y,
        actor.elev,
        direction,
      );
      if (result !== ENEMY_FLOW_GUIDED) break;
      actor = moveWithVoxels(
        map,
        flatTileset,
        actor.x,
        actor.y,
        actor.x + direction.x,
        actor.y + direction.y,
        3,
        actor.elev,
        undefined,
        models,
      );
    }
    expect(actor.y).toBeGreaterThanOrEqual(2 * 16);
    expect(actor.elev).toBeCloseTo(1, 1);
  });

  it("uses a nearby open target when the player cell is conservative-blocked", () => {
    const source = openField(5, 5, [[2, 2]]);
    const flow = createEnemyCrowdFlowField(source);
    updateEnemyCrowdFlowField(flow, 2.5 * 16, 2.5 * 16, 0);
    expect(flow.targetIndex).toBeGreaterThanOrEqual(0);
    expect(flow.reachableCells).toBe(24);
    expect(flow.targetCount).toBe(1);
    expect(flow.targetFallbackDistanceCells).toBeGreaterThan(0);
  });

  it("finds goals beyond the old four-cell fallback radius", () => {
    const blocked: Array<[number, number]> = [];
    for (let y = 0; y < 3; y++) {
      for (let x = 2; x <= 10; x++) blocked.push([x, y]);
    }
    const flow = createEnemyCrowdFlowField(openField(15, 3, blocked));
    updateEnemyCrowdFlowField(flow, 6.5 * 16, 1.5 * 16, 0);
    expect(flow.targetCount).toBe(2);
    expect(flow.reachableCells).toBe(18);
    expect(flow.targetFallbackDistanceCells).toBe(5);
  });
});
