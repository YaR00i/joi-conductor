import { describe, expect, it } from "vitest";
import { combineDirCascadeShadowExpr, patchedShadowmapParsFragment } from "./voxelLightSnap";

describe("voxel light snap sun shadows", () => {
  it("samples only the cached key light so one sun compiles in editor and play", () => {
    const expr = combineDirCascadeShadowExpr();
    expect(expr).toContain("directionalShadowMap[ 0 ]");
    expect(expr).not.toContain("directionalShadowMap[ 1 ]");
    expect(expr).not.toContain("directionalShadowMap[ 2 ]");
    expect(expr).not.toContain("emberDirShadowInFrustum");
    expect(expr).not.toContain("min( min(");
  });
});

describe("point shadow penumbra", () => {
  it("replaces stock getPointShadow with distance-scaled PCF", () => {
    const chunk = patchedShadowmapParsFragment();
    expect(chunk).toContain("emberPointPenumbra");
    expect(chunk).toContain("1.0 / 9.0");
    expect(chunk).toContain("shadowRadius < 0.05");
    expect(chunk).toContain("float getPointShadow(");
  });
});
