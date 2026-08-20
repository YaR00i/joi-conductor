import { describe, expect, it } from "vitest";
import { combineDirCascadeShadowExpr } from "./voxelLightSnap";

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
