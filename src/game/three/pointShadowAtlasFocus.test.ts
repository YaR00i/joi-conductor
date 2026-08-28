import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createEmptyMap, ensureMapLayers } from "../tile/mapUtils";
import {
  pointShadowAtlasFocusFromMap,
  pointShadowAtlasFocusFromTile,
  pointShadowAtlasSpawnTile,
} from "./pointShadowAtlasFocus";

describe("point shadow atlas focus", () => {
  it("puts spawn at the tile center, not the map center", () => {
    const map = ensureMapLayers(createEmptyMap("focus-spawn", 32, 32, "ts", 16));
    map.regions = [
      {
        id: "start",
        kind: "player_start",
        x: 2,
        y: 4,
        w: 1,
        h: 1,
      },
    ];
    expect(pointShadowAtlasSpawnTile(map)).toEqual({ x: 2, y: 4 });
    const focus = pointShadowAtlasFocusFromMap(map, new THREE.Vector3());
    const spawn = pointShadowAtlasFocusFromTile(2, 4, 16, new THREE.Vector3());
    const center = new THREE.Vector3((32 * 16) / 2, 0, (32 * 16) / 2);
    expect(focus).toEqual(spawn);
    expect(focus.x).not.toBe(center.x);
    expect(focus.z).not.toBe(center.z);
  });

  it("falls back to map center when there is no spawn region", () => {
    const map = ensureMapLayers(createEmptyMap("focus-center", 10, 20, "ts", 8));
    map.regions = [];
    const focus = pointShadowAtlasFocusFromMap(map, new THREE.Vector3());
    expect(focus.x).toBe((10 * 8) / 2);
    expect(focus.z).toBe((20 * 8) / 2);
  });
});
