import { describe, expect, it } from "vitest";
import {
  POINT_SHADOW_CUBE_FACE_VIEWPORTS,
  POINT_SHADOW_CUBE_FACES_X,
  POINT_SHADOW_CUBE_FACES_Y,
  POINT_SHADOW_FACE_SIZE,
  POINT_SHADOW_SHADER_SLOTS,
  assignPointShadowAtlasSlots,
  layoutPointShadowAtlas,
  planPointShadowAtlasBlits,
  pointShadowCubeFacePixelRect,
  pointShadowInfluenceScore,
  pointShadowTileInfluenceScore,
  pointShadowSlotPixelRect,
  pointShadowSlotUv,
} from "./pointShadowAtlas";

describe("point shadow atlas layout", () => {
  it("packs eight 256 cubes into a 4×2-face grid that fits 4096", () => {
    const layout = layoutPointShadowAtlas(
      POINT_SHADOW_SHADER_SLOTS,
      POINT_SHADOW_FACE_SIZE,
      4096,
    );
    expect(layout.slotCount).toBe(8);
    expect(layout.faceSize).toBe(256);
    expect(layout.tileWidth).toBe(256 * POINT_SHADOW_CUBE_FACES_X);
    expect(layout.tileHeight).toBe(256 * POINT_SHADOW_CUBE_FACES_Y);
    expect(layout.width).toBeLessThanOrEqual(4096);
    expect(layout.height).toBeLessThanOrEqual(4096);
    expect(layout.columns * layout.rows).toBeGreaterThanOrEqual(8);
  });

  it("fits eight 256 tiles on a 2048 GPU without dropping slots", () => {
    const layout = layoutPointShadowAtlas(8, 256, 2048);
    expect(layout.slotCount).toBe(8);
    expect(layout.faceSize).toBe(256);
    expect(layout.width).toBeLessThanOrEqual(2048);
    expect(layout.height).toBeLessThanOrEqual(2048);
  });

  it("shrinks face size before dropping slots on a 1024 GPU", () => {
    const layout = layoutPointShadowAtlas(8, 256, 1024);
    expect(layout.slotCount).toBe(8);
    expect(layout.faceSize).toBeLessThan(256);
    expect(layout.width).toBeLessThanOrEqual(1024);
    expect(layout.height).toBeLessThanOrEqual(1024);
  });

  it("maps slot 0 and slot 1 to non-overlapping tiles", () => {
    const layout = layoutPointShadowAtlas(8, 256, 4096);
    const a = pointShadowSlotPixelRect(layout, 0);
    const b = pointShadowSlotPixelRect(layout, 1);
    expect(a.x === b.x && a.y === b.y).toBe(false);
    expect(a.width).toBe(layout.tileWidth);
    const uv = pointShadowSlotUv(layout, 0);
    expect(uv.offsetX).toBe(0);
    expect(uv.offsetY).toBe(0);
    expect(uv.scaleX).toBeCloseTo(layout.tileWidth / layout.width);
    expect(uv.scaleY).toBeCloseTo(layout.tileHeight / layout.height);
  });
});

describe("point shadow atlas slots", () => {
  it("scores nearer lights better", () => {
    expect(pointShadowInfluenceScore(8, 16)).toBeLessThan(
      pointShadowInfluenceScore(24, 16),
    );
    expect(
      pointShadowTileInfluenceScore(0, 0, 8, 0, 16, 16),
    ).toBeLessThan(pointShadowTileInfluenceScore(4, 0, 8, 0, 16, 16));
  });

  it("fills empty slots with the nearest candidates and keeps holes sticky", () => {
    const first = assignPointShadowAtlasSlots(
      [],
      [
        { id: "far", score: 4 },
        { id: "near", score: 0.5 },
        { id: "mid", score: 1.2 },
      ],
      3,
    );
    expect(first).toEqual(["near", "mid", "far"]);

    const walked = assignPointShadowAtlasSlots(
      first,
      [
        { id: "far", score: 4.1 },
        { id: "near", score: 0.55 },
        { id: "mid", score: 1.25 },
      ],
      3,
    );
    expect(walked).toEqual(["near", "mid", "far"]);
  });

  it("does not compact a freed slot so remaining indices stay", () => {
    const previous = ["near", "mid", "far"];
    const next = assignPointShadowAtlasSlots(
      previous,
      [
        { id: "near", score: 0.5 },
        { id: "far", score: 4 },
      ],
      3,
    );
    expect(next).toEqual(["near", null, "far"]);
  });

  it("lets a much nearer light steal the worst slot", () => {
    const previous = ["a", "b", "c"];
    const next = assignPointShadowAtlasSlots(
      previous,
      [
        { id: "a", score: 1 },
        { id: "b", score: 1.1 },
        { id: "c", score: 5 },
        { id: "hot", score: 0.2 },
      ],
      3,
      0.8,
    );
    expect(next).toContain("hot");
    expect(next).not.toContain("c");
    expect(next[0]).toBe("a");
    expect(next[1]).toBe("b");
  });

  it("ignores a slightly nearer light so orbiting does not thrash slots", () => {
    const previous = ["a", "b"];
    const next = assignPointShadowAtlasSlots(
      previous,
      [
        { id: "a", score: 1 },
        { id: "b", score: 1.05 },
        { id: "c", score: 0.95 },
      ],
      2,
      0.8,
    );
    expect(next).toEqual(["a", "b"]);
  });
});

describe("point shadow cube packing", () => {
  it("matches Three PointLightShadow 4×2 face viewports", () => {
    expect(POINT_SHADOW_CUBE_FACE_VIEWPORTS).toHaveLength(6);
    const px = pointShadowCubeFacePixelRect(256, 0);
    expect(px).toEqual({ x: 512, y: 256, width: 256, height: 256 });
    const nx = pointShadowCubeFacePixelRect(256, 1);
    expect(nx).toEqual({ x: 0, y: 256, width: 256, height: 256 });
    const ny = pointShadowCubeFacePixelRect(256, 5);
    expect(ny).toEqual({ x: 256, y: 0, width: 256, height: 256 });
  });

  it("plans atlas blits without compacting holes", () => {
    const layout = layoutPointShadowAtlas(8, 256, 4096);
    const jobs = planPointShadowAtlasBlits(layout, ["near", null, "far"]);
    expect(jobs.map((job) => job.slot)).toEqual([0, 2]);
    expect(jobs[0]?.dest).toEqual(pointShadowSlotPixelRect(layout, 0));
    expect(jobs[1]?.dest).toEqual(pointShadowSlotPixelRect(layout, 2));
  });
});
