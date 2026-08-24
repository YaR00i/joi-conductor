import { describe, expect, it } from "vitest";
import type { EmberMap, EmberVoxelModel } from "../content/types";
import {
  createEmptyMap,
  ensureMapLayers,
  setElevTileId,
} from "../tile/mapUtils";
import { DEFAULT_EDITOR_SELECTION_FILTER } from "./EditorSelectionFilter";
import { collectPlanarMarqueeHits } from "./mapPlanarMarquee";

function marqueeMap(): EmberMap {
  const map = ensureMapLayers(createEmptyMap("marquee", 8, 8, "test", 16));
  map.voxelProps = [
    { id: "crate-high", modelId: "crate", x: 2, y: 3, elev: 2 },
    { id: "bench", modelId: "wide", x: 4, y: 4, elev: 0, rot: 1 },
  ];
  map.sprites = [{ id: "sign-1", spriteId: "sign", x: 1, y: 1, elev: 0 }];
  map.lights = [{ id: "lamp-1", x: 5, y: 5 }];
  map.regions = [
    { id: "exit-1", kind: "teleport", x: 0, y: 0, w: 2, h: 2 },
    { id: "cam", kind: "camera_bound", x: 0, y: 0, w: 8, h: 8 },
  ];
  setElevTileId(map, 2, 2, 0, 7);
  setElevTileId(map, 2, 3, 2, 7);
  setElevTileId(map, 3, 3, 1, 7);
  return map;
}

const wideModel: EmberVoxelModel = {
  id: "wide",
  sizeBlocks: { x: 3, y: 1, z: 1 },
  palette: ["#000", "#fff"],
  voxels: [1],
};

describe("collectPlanarMarqueeHits", () => {
  it("selects objects and tiles that sit on the dragged Z plane", () => {
    const map = marqueeMap();
    const hits = collectPlanarMarqueeHits({
      map,
      start: { x: 1, y: 1 },
      end: { x: 5, y: 5 },
      elev: 0,
      filter: { ...DEFAULT_EDITOR_SELECTION_FILTER, tile: false },
      voxelModels: { wide: wideModel },
    });
    expect(hits).toEqual([
      { kind: "voxel", id: "bench" },
      { kind: "sprite", id: "sign-1" },
      { kind: "light", id: "lamp-1" },
    ]);
  });

  it("picks occupied tiles on the locked plane, including a 1-cell frame", () => {
    const map = marqueeMap();
    const hits = collectPlanarMarqueeHits({
      map,
      start: { x: 2, y: 2 },
      end: { x: 2, y: 2 },
      elev: 0,
      filter: {
        ...DEFAULT_EDITOR_SELECTION_FILTER,
        voxel: false,
        sprite: false,
        light: false,
        region: false,
      },
    });
    expect(hits).toEqual([{ kind: "tile", tx: 2, ty: 2, elev: 0 }]);
  });

  it("ignores props on another story while still catching tiles on the locked plane", () => {
    const map = marqueeMap();
    const hits = collectPlanarMarqueeHits({
      map,
      start: { x: 2, y: 2 },
      end: { x: 3, y: 3 },
      elev: 2,
      filter: DEFAULT_EDITOR_SELECTION_FILTER,
      voxelModels: { wide: wideModel },
    });
    expect(hits).toEqual([
      { kind: "voxel", id: "crate-high" },
      { kind: "tile", tx: 2, ty: 3, elev: 2 },
    ]);
  });

  it("uses the rotated voxel footprint, not only the anchor cell", () => {
    const map = marqueeMap();
    const hits = collectPlanarMarqueeHits({
      map,
      start: { x: 4, y: 6 },
      end: { x: 4, y: 6 },
      elev: 0,
      filter: { ...DEFAULT_EDITOR_SELECTION_FILTER, tile: false, region: false },
      voxelModels: { wide: wideModel },
    });
    expect(hits).toEqual([{ kind: "voxel", id: "bench" }]);
  });

  it("selects a vertical volume across every occupied story when elev is omitted", () => {
    const map = marqueeMap();
    const hits = collectPlanarMarqueeHits({
      map,
      start: { x: 1, y: 1 },
      end: { x: 3, y: 3 },
      filter: { ...DEFAULT_EDITOR_SELECTION_FILTER, tile: false },
      voxelModels: { wide: wideModel },
    });
    expect(hits).toEqual([
      { kind: "voxel", id: "crate-high" },
      { kind: "sprite", id: "sign-1" },
      { kind: "region", id: "exit-1" },
    ]);
  });

  it("selects every occupied tile story in a vertical column", () => {
    const map = marqueeMap();
    const hits = collectPlanarMarqueeHits({
      map,
      start: { x: 2, y: 3 },
      end: { x: 2, y: 3 },
      filter: {
        ...DEFAULT_EDITOR_SELECTION_FILTER,
        voxel: false,
        sprite: false,
        light: false,
        region: false,
      },
    });
    expect(hits).toEqual([
      { kind: "tile", tx: 2, ty: 3, elev: 0 },
      { kind: "tile", tx: 2, ty: 3, elev: 2 },
    ]);
  });

  it("limits a coordinate volume to the visible endpoint Z range", () => {
    const map = marqueeMap();
    const hits = collectPlanarMarqueeHits({
      map,
      start: { x: 1, y: 1 },
      end: { x: 3, y: 3 },
      elevRange: { min: 1, max: 2 },
      filter: { ...DEFAULT_EDITOR_SELECTION_FILTER, region: false },
      voxelModels: { wide: wideModel },
    });
    expect(hits).toEqual([
      { kind: "voxel", id: "crate-high" },
      { kind: "tile", tx: 2, ty: 3, elev: 2 },
      { kind: "tile", tx: 3, ty: 3, elev: 1 },
    ]);
  });

  it("does not include the story below a same-height wall drag", () => {
    const map = marqueeMap();
    const hits = collectPlanarMarqueeHits({
      map,
      start: { x: 1, y: 1 },
      end: { x: 3, y: 3 },
      elevRange: { min: 1, max: 1 },
      filter: { ...DEFAULT_EDITOR_SELECTION_FILTER, region: false },
      voxelModels: { wide: wideModel },
    });
    expect(hits).toEqual([{ kind: "tile", tx: 3, ty: 3, elev: 1 }]);
  });

  it("respects the viewport filter and skips hidden or locked objects", () => {
    const map = marqueeMap();
    const hits = collectPlanarMarqueeHits({
      map,
      start: { x: 0, y: 0 },
      end: { x: 7, y: 7 },
      elev: 0,
      filter: {
        ...DEFAULT_EDITOR_SELECTION_FILTER,
        sprite: false,
        tile: false,
        region: false,
      },
      voxelModels: { wide: wideModel },
      isHidden: (key) => key === "voxel:bench",
      isLocked: (key) => key === "light:lamp-1",
    });
    expect(hits).toEqual([]);
  });
});
