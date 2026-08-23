import { describe, expect, it } from "vitest";
import type { EmberMap, EmberMapRegion } from "../content/types";
import {
  createEmptyMap,
  ensureMapLayers,
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
});
