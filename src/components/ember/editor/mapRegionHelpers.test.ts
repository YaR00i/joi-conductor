import { describe, expect, it } from "vitest";
import {
  createEmptyMap,
  ensureMapLayers,
  regionVolumeElev,
  setElevTileId,
} from "../../../game/tile/mapUtils";
import {
  MAP_REGION_KIND_LABEL,
  makeRegionAt,
  regionFootprintCenter,
  regionOriginFromCenter,
  regionsLayoutSignature,
} from "./mapRegionHelpers";

describe("makeRegionAt", () => {
  it("does not stub a teleport onto its own cell", () => {
    const map = ensureMapLayers(createEmptyMap("m", 16, 16, "test", 16));
    const region = makeRegionAt(map, "teleport", 4, 5);
    expect(region.kind).toBe("teleport");
    expect(region.targetX).toBeUndefined();
    expect(region.targetY).toBeUndefined();
    expect(region.targetRegionId).toBeUndefined();
    expect(region.x).toBe(4);
    expect(region.y).toBe(5);
  });

  it("keeps the camera label short enough for the library strip", () => {
    expect(MAP_REGION_KIND_LABEL.camera_bound).toBe("Камера");
    expect(MAP_REGION_KIND_LABEL.camera_bound.length).toBeLessThanOrEqual(8);
  });

  it("stubs loot ids on a new chest region", () => {
    const map = ensureMapLayers(createEmptyMap("m", 16, 16, "test", 16));
    const region = makeRegionAt(map, "chest", 3, 4);
    expect(region.kind).toBe("chest");
    expect(region.lootIds).toEqual(["coin"]);
    expect(region.w).toBe(1);
    expect(region.h).toBe(1);
  });
});

describe("region footprint", () => {
  it("puts the gizmo center in the middle of a 2×3 trigger", () => {
    const region = {
      id: "t",
      kind: "trigger" as const,
      x: 4,
      y: 5,
      w: 2,
      h: 3,
    };
    expect(regionFootprintCenter(region)).toEqual({ cx: 5, cy: 6.5 });
    expect(regionOriginFromCenter(region, 10.5, 8, 32, 32)).toEqual({
      x: 10,
      y: 7,
    });
  });

  it("clamps a moved origin so the rect stays on the map", () => {
    const region = {
      id: "t",
      kind: "trigger" as const,
      x: 0,
      y: 0,
      w: 3,
      h: 2,
    };
    expect(regionOriginFromCenter(region, 0, 0, 8, 8)).toEqual({ x: 0, y: 0 });
    expect(regionOriginFromCenter(region, 20, 20, 8, 8)).toEqual({ x: 5, y: 6 });
  });

  it("changes layout signature when a zone moves or changes floor", () => {
    const a = [{ id: "t", kind: "trigger" as const, x: 1, y: 1, w: 2, h: 2 }];
    const b = [{ ...a[0]!, x: 3, y: 1 }];
    const c = [{ ...a[0]!, elev: 0 }];
    expect(regionsLayoutSignature(a)).not.toBe(regionsLayoutSignature(b));
    expect(regionsLayoutSignature(a)).not.toBe(regionsLayoutSignature(c));
  });

  it("keeps an authored floor under a ceiling instead of the column roof", () => {
    const map = ensureMapLayers(createEmptyMap("m", 8, 8, "test", 16));
    setElevTileId(map, 2, 2, 0, 1);
    setElevTileId(map, 2, 2, 2, 1);
    const region = {
      id: "t",
      kind: "trigger" as const,
      x: 2,
      y: 2,
      w: 2,
      h: 2,
      elev: 0,
    };
    expect(regionVolumeElev(map, region)).toBe(0);
    expect(regionVolumeElev(map, { ...region, elev: undefined })).toBe(2);
  });
});
