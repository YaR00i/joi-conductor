import { describe, expect, it } from "vitest";
import { createEmptyMap, ensureMapLayers, regionCenter } from "../tile/mapUtils";
import type { EmberMap } from "./types";
import {
  mapChangeRegionAt,
  mapChangeRequestFromRegion,
  resolveMapChangeArrival,
} from "./mapChange";

function tinyMap(
  id: string,
  regions: EmberMap["regions"],
): EmberMap {
  const map = ensureMapLayers(createEmptyMap(id, 8, 8, "test", 16));
  map.playProfile = "explore";
  map.regions = regions;
  return map;
}

describe("resolveMapChangeArrival", () => {
  it("lands on targetRegionId of the destination map", () => {
    const dest = tinyMap("inside", [
      {
        id: "start",
        kind: "player_start",
        x: 2,
        y: 2,
        w: 2,
        h: 2,
      },
      {
        id: "doorstep",
        kind: "trigger",
        x: 5,
        y: 5,
        w: 1,
        h: 1,
      },
    ]);
    const arrival = resolveMapChangeArrival(
      { inside: dest },
      {
        targetMapId: "inside",
        targetRegionId: "doorstep",
      },
    );
    expect(arrival?.mapId).toBe("inside");
    expect(arrival?.regionId).toBe("doorstep");
    const c = regionCenter(dest, dest.regions[1]!);
    expect(arrival?.x).toBeCloseTo(c.x);
    expect(arrival?.y).toBeCloseTo(c.y);
    expect(arrival?.occupyId).toBe("doorstep");
  });

  it("falls back to player_start when the region id is missing", () => {
    const dest = tinyMap("inside", [
      {
        id: "start",
        kind: "player_start",
        x: 3,
        y: 4,
        w: 1,
        h: 1,
      },
    ]);
    const arrival = resolveMapChangeArrival(
      { inside: dest },
      { targetMapId: "inside", targetRegionId: "nope" },
    );
    expect(arrival?.regionId).toBe("start");
    const c = regionCenter(dest, dest.regions[0]!);
    expect(arrival?.x).toBeCloseTo(c.x);
    expect(arrival?.y).toBeCloseTo(c.y);
  });

  it("uses targetX/Y when no region is named", () => {
    const dest = tinyMap("inside", [
      {
        id: "start",
        kind: "player_start",
        x: 1,
        y: 1,
        w: 1,
        h: 1,
      },
    ]);
    const arrival = resolveMapChangeArrival(
      { inside: dest },
      {
        targetMapId: "inside",
        targetRegionId: null,
        targetX: 6,
        targetY: 4,
      },
    );
    expect(arrival?.x).toBe(6 * 16 + 8);
    expect(arrival?.y).toBe(4 * 16 + 8);
  });

  it("returns null when the dest map is absent", () => {
    expect(
      resolveMapChangeArrival(
        {},
        { targetMapId: "missing", targetRegionId: "start" },
      ),
    ).toBeNull();
  });

  it("reads a trigger region into a request", () => {
    expect(
      mapChangeRequestFromRegion({
        id: "enter",
        kind: "trigger",
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        targetMapId: "inside",
        targetRegionId: "start",
      }),
    ).toEqual({
      targetMapId: "inside",
      targetRegionId: "start",
      targetX: undefined,
      targetY: undefined,
      targetElevation: undefined,
    });
    expect(
      mapChangeRequestFromRegion({
        id: "notice",
        kind: "trigger",
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        scriptId: "hi",
      }),
    ).toBeNull();
  });

  it("does not let an overlapping script-only trigger mask a map exit", () => {
    const map = tinyMap("outside", [
      {
        id: "notice",
        kind: "trigger",
        x: 2,
        y: 2,
        w: 1,
        h: 1,
        scriptId: "hello",
      },
      {
        id: "exit",
        kind: "trigger",
        x: 2,
        y: 2,
        w: 1,
        h: 1,
        targetMapId: "inside",
        targetRegionId: "start",
      },
    ]);
    expect(mapChangeRegionAt(map, 2 * 16 + 8, 2 * 16 + 8, 0)?.id).toBe(
      "exit",
    );
  });
});
