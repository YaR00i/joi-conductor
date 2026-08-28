import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { EmberTileset } from "../content/types";
import {
  createEmptyMap,
  ensureMapLayers,
  resolveMapLight,
} from "../tile/mapUtils";
import { addThreeLanternLights } from "./threeLighting";

const tileset: EmberTileset = {
  id: "stream-light-tiles",
  tileSize: 16,
  columns: 1,
  tileCount: 1,
  tiles: [{ id: 1, name: "floor", color: "#777777" }],
};

describe("runtime local-light streaming", () => {
  it("does not invent an unselectable center light when the map has no sources", () => {
    const map = ensureMapLayers(
      createEmptyMap("no-lights", 32, 32, tileset.id, 16),
    );
    const root = new THREE.Group();
    const lights = addThreeLanternLights(root, {
      map,
      light: resolveMapLight(map),
      center: new THREE.Vector3(256, 0, 256),
      tileset,
      shadows: true,
    });

    expect(lights).toEqual([]);
    expect(root.children).toHaveLength(0);
  });

  it("builds only sources inside the active tile window", () => {
    const map = ensureMapLayers(
      createEmptyMap("stream-lights", 64, 64, tileset.id, 16),
    );
    map.lights = [
      { id: "near", x: 5, y: 6, enabled: true },
      { id: "far", x: 48, y: 50, enabled: true },
    ];
    const root = new THREE.Group();
    const lights = addThreeLanternLights(root, {
      map,
      light: resolveMapLight(map),
      center: new THREE.Vector3(),
      tileset,
      sourceBounds: { x0: 0, y0: 0, x1: 16, y1: 16 },
      shadows: false,
      maxLamps: 8,
    });

    expect(lights).toHaveLength(1);
    expect(lights[0]?.position.x).toBe((5 + 0.5) * map.tileSize);
    expect(lights[0]?.position.z).toBe((6 + 0.5) * map.tileSize);
  });

  it("assigns explore cube slots to the nearest street lanterns", () => {
    const map = ensureMapLayers(
      createEmptyMap("street-lights", 32, 32, tileset.id, 16),
    );
    map.lights = [
      { id: "far", x: 20, y: 20, enabled: true, lampStrength0: 1 },
      { id: "near", x: 4, y: 4, enabled: true, lampStrength0: 0.2 },
    ];
    const root = new THREE.Group();
    const lights = addThreeLanternLights(root, {
      map,
      light: resolveMapLight(map),
      center: new THREE.Vector3(),
      tileset,
      shadows: true,
      maxLamps: 8,
      maxShadows: 1,
      shadowFocus: new THREE.Vector3((4 + 0.5) * map.tileSize, 0, (4 + 0.5) * map.tileSize),
    });

    const shadowed = lights.filter(
      (light) => light.userData.emberShadowGranted === true,
    );
    expect(shadowed).toHaveLength(1);
    expect(shadowed[0]?.position.x).toBe((4 + 0.5) * map.tileSize);
    expect(lights.every((light) => light.castShadow === false)).toBe(true);
    expect(
      lights.filter((light) => light.userData.emberShadowGranted !== true)
        .length,
    ).toBeGreaterThan(0);
  });
});
