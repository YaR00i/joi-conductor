import { describe, expect, it } from "vitest";
import type { EmberMap, EmberMapRegion } from "../content/types";
import {
  createEmptyMap,
  ensureMapLayers,
  findRegions,
  layerData,
  pointInRegion,
  regionCenter,
  resolveTeleportTarget,
  stepTeleport,
} from "./mapUtils";

function tpMap(regions: EmberMapRegion[]): EmberMap {
  const map = ensureMapLayers(createEmptyMap("tp", 12, 8, "test", 16));
  map.regions = regions;
  return map;
}

const padA: EmberMapRegion = {
  id: "pad-a",
  kind: "teleport",
  x: 2,
  y: 2,
  w: 1,
  h: 1,
  targetRegionId: "pad-b",
};

const padB: EmberMapRegion = {
  id: "pad-b",
  kind: "teleport",
  x: 8,
  y: 2,
  w: 1,
  h: 1,
  targetRegionId: "pad-a",
};

describe("resolveTeleportTarget", () => {
  it("lands on the center of the linked region", () => {
    const map = tpMap([padA, padB]);
    const dest = resolveTeleportTarget(map, padA);
    const center = regionCenter(map, padB);
    expect(dest?.x).toBe(center.x);
    expect(dest?.y).toBe(center.y);
  });

  it("returns null when the pad has no destination", () => {
    const orphan: EmberMapRegion = {
      id: "orphan",
      kind: "teleport",
      x: 1,
      y: 1,
      w: 1,
      h: 1,
    };
    expect(resolveTeleportTarget(tpMap([orphan]), orphan)).toBeNull();
  });
});

describe("stepTeleport", () => {
  it("warps A→B once, then ignores B until the player walks off", () => {
    const map = tpMap([padA, padB]);
    const a = regionCenter(map, padA);
    const b = regionCenter(map, padB);

    const enter = stepTeleport(map, a.x, a.y, null, true);
    expect(enter.warp).toMatchObject({ x: b.x, y: b.y, fromId: "pad-a" });
    expect(enter.occupyingId).toBe("pad-b");

    const stay = stepTeleport(map, b.x, b.y, enter.occupyingId, true);
    expect(stay.warp).toBeNull();
    expect(stay.occupyingId).toBe("pad-b");

    const off = stepTeleport(map, 4 * 16, 4 * 16, stay.occupyingId, true);
    expect(off.warp).toBeNull();
    expect(off.occupyingId).toBeNull();

    const back = stepTeleport(map, b.x, b.y, off.occupyingId, true);
    expect(back.warp).toMatchObject({ x: a.x, y: a.y, fromId: "pad-b" });
    expect(back.occupyingId).toBe("pad-a");
  });

  it("does not warp when destination is the same pad", () => {
    const self: EmberMapRegion = {
      id: "self",
      kind: "teleport",
      x: 3,
      y: 3,
      w: 1,
      h: 1,
      targetX: 3,
      targetY: 3,
    };
    const map = tpMap([self]);
    const c = regionCenter(map, self);
    const stepped = stepTeleport(map, c.x, c.y, null, true);
    expect(stepped.warp).toBeNull();
    expect(stepped.occupyingId).toBe("self");
  });

  it("does not fire while warp is disallowed", () => {
    const map = tpMap([padA, padB]);
    const a = regionCenter(map, padA);
    const blocked = stepTeleport(map, a.x, a.y, null, false);
    expect(blocked.warp).toBeNull();
    expect(blocked.occupyingId).toBeNull();
  });

  it("keeps stacked teleport pads on different floors independent", () => {
    const ground: EmberMapRegion = { ...padA, elev: 0 };
    const loft: EmberMapRegion = {
      ...padB,
      id: "pad-loft",
      x: padA.x,
      y: padA.y,
      elev: 2,
      targetRegionId: "pad-a",
    };
    const map = tpMap([ground, { ...padB, elev: 0 }, loft]);
    const pos = regionCenter(map, ground);
    expect(stepTeleport(map, pos.x, pos.y, null, true, 0).warp?.fromId).toBe(
      "pad-a",
    );
    expect(stepTeleport(map, pos.x, pos.y, null, true, 2).warp?.fromId).toBe(
      "pad-loft",
    );
  });

  it("treats an unauthored zone elevation as its visible column surface", () => {
    const raised = { ...padA };
    const map = tpMap([raised, { ...padB, elev: 0 }]);
    const height = layerData(map, "height")!;
    height[raised.y * map.width + raised.x] = map.tileSize * 3;
    const pos = regionCenter(map, raised);

    expect(pointInRegion(map, raised, pos.x, pos.y, 0)).toBe(false);
    expect(pointInRegion(map, raised, pos.x, pos.y, 3)).toBe(true);
    expect(stepTeleport(map, pos.x, pos.y, null, true, 0).warp).toBeNull();
    expect(stepTeleport(map, pos.x, pos.y, null, true, 3).warp?.fromId).toBe(
      "pad-a",
    );
  });

  it("allows a vertical teleport to the same XY on another floor", () => {
    const vertical: EmberMapRegion = {
      id: "vertical",
      kind: "teleport",
      x: 3,
      y: 3,
      w: 1,
      h: 1,
      elev: 3,
      targetX: 3,
      targetY: 3,
      targetElevation: 0,
    };
    const map = tpMap([vertical]);
    const pos = regionCenter(map, vertical);
    expect(stepTeleport(map, pos.x, pos.y, null, true, 0).warp).toBeNull();
    expect(stepTeleport(map, pos.x, pos.y, null, true, 3).warp).toMatchObject({
      x: pos.x,
      y: pos.y,
      elev: 0,
      fromId: "vertical",
    });
  });
});

describe("region groups", () => {
  it("does not leak ungrouped spawns into a requested group", () => {
    const map = tpMap([
      { ...padA, kind: "spawn", id: "north", group: "north" },
      { ...padB, kind: "spawn", id: "south", group: "south" },
      { ...padA, kind: "spawn", id: "ungrouped" },
    ]);
    expect(findRegions(map, "spawn", "north").map((region) => region.id)).toEqual([
      "north",
    ]);
    expect(findRegions(map, "spawn", "any")).toHaveLength(3);
  });
});
