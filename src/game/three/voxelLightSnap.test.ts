import { describe, expect, it } from "vitest";
import { combineDirCascadeShadowExpr, patchedEmberLightsFragmentBegin, patchedShadowmapParsFragment } from "./voxelLightSnap";

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

describe("point shadow atlas sample", () => {
  it("keeps stock getPointShadow unused and samples the atlas when cubes are off", () => {
    const chunk = patchedShadowmapParsFragment();
    expect(chunk).toContain("emberAtlasShadow");
    expect(chunk).toContain("emberAtlasIntensity[ 7 ]");
    expect(chunk).toContain("mix( 1.0, texture2DCompare");
    expect(chunk).not.toContain("emberPointPenumbra");
    expect(chunk.lastIndexOf("emberAtlasShadow")).toBeLessThan(
      chunk.lastIndexOf("#endif"),
    );

    const lights = patchedEmberLightsFragmentBegin();
    expect(lights).toContain("NUM_POINT_LIGHT_SHADOWS < 1");
    expect(lights).toContain("emberAtlasShadow( pointLight.position");
    expect(lights).toContain("inverseTransformDirection( geometryNormal");
    expect(lights).not.toContain("pointShadowMatrix[ i ]");
  });
});
