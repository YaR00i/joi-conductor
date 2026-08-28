import { Object3D } from "three";
import { describe, expect, it } from "vitest";
import { cellCutawayKey, tileCutawayKey } from "../tile/buildingInterior";
import {
  applyInteriorCutaway,
  applyInteriorCutawayTagged,
  collectCutawayTagged,
  tagCutawayObject,
  withCutawayCastersVisible,
} from "./interiorCutaway";

describe("interiorCutaway", () => {
  it("hides tagged roofs and camera-facing wall props, then restores them", () => {
    const root = new Object3D();
    const roof = new Object3D();
    const wallProp = new Object3D();
    const floor = new Object3D();
    tagCutawayObject(roof, 2, 3, 1, "roof");
    tagCutawayObject(wallProp, 4, 5, 0, "prop");
    tagCutawayObject(floor, 2, 3, 0, "floor");
    root.add(roof);
    root.add(wallProp);
    root.add(floor);

    applyInteriorCutaway(root, {
      roofCells: new Set([cellCutawayKey(2, 3, 1)]),
      wallTiles: new Set([tileCutawayKey(4, 5)]),
    });
    expect(roof.visible).toBe(false);
    expect(wallProp.visible).toBe(false);
    expect(floor.visible).toBe(true);

    applyInteriorCutaway(root, { roofCells: new Set(), wallTiles: new Set() });
    expect(roof.visible).toBe(true);
    expect(wallProp.visible).toBe(true);
    expect(floor.visible).toBe(true);
  });

  it("applies hide to a cached tagged list without walking untagged meshes", () => {
    const root = new Object3D();
    const roof = new Object3D();
    const extra = new Object3D();
    tagCutawayObject(roof, 1, 1, 2, "roof");
    root.add(roof);
    root.add(extra);
    const tagged = collectCutawayTagged(root);
    expect(tagged).toEqual([roof]);
    applyInteriorCutawayTagged(tagged, {
      roofCells: new Set([cellCutawayKey(1, 1, 2)]),
      wallTiles: new Set(),
    });
    expect(roof.visible).toBe(false);
    expect(extra.visible).toBe(true);
  });

  it("reveals tagged casters for a bake then restores the occupancy hide", () => {
    const roof = new Object3D();
    tagCutawayObject(roof, 1, 1, 2, "roof");
    roof.visible = false;
    const seen: boolean[] = [];
    const result = withCutawayCastersVisible([roof], () => {
      seen.push(roof.visible);
      return "baked";
    });
    expect(result).toBe("baked");
    expect(seen).toEqual([true]);
    expect(roof.visible).toBe(false);
  });

  it("restores hide even when the bake throws", () => {
    const wall = new Object3D();
    tagCutawayObject(wall, 2, 2, 1, "wall");
    wall.visible = false;
    expect(() =>
      withCutawayCastersVisible([wall], () => {
        throw new Error("bake failed");
      }),
    ).toThrow("bake failed");
    expect(wall.visible).toBe(false);
  });
});
