import { describe, expect, it } from "vitest";
import { lanternShadowShare, resolveEmberRenderBudget } from "./renderBudget";

describe("Ember WebGL render budget", () => {
  it("keeps a 16-sampler GPU below the point-shadow sampler cliff", () => {
    const budget = resolveEmberRenderBudget(
      {
        maxFragmentUniforms: 224,
        maxTextures: 16,
        maxTextureSize: 4096,
        maxCubemapSize: 2048,
      },
      "play",
    );

    expect(budget.maxPointLights).toBe(28);
    expect(budget.maxPointShadows).toBe(4);
    expect(lanternShadowShare(budget)).toBe(2);
    expect(budget.pointShadowMapSize).toBe(512);
  });

  it("scales down unusually small uniform and texture limits safely", () => {
    const budget = resolveEmberRenderBudget(
      {
        maxFragmentUniforms: 128,
        maxTextures: 8,
        maxTextureSize: 256,
        maxCubemapSize: 256,
      },
      "editor",
    );

    expect(budget.maxPointLights).toBe(8);
    expect(budget.maxPointShadows).toBe(0);
    expect(budget.pointShadowMapSize).toBe(256);
    expect(budget.directionalShadowMapSize).toBe(256);
  });

  it("caps high-end GPUs so shader size remains predictable", () => {
    const budget = resolveEmberRenderBudget(
      {
        maxFragmentUniforms: 4096,
        maxTextures: 64,
        maxTextureSize: 16384,
        maxCubemapSize: 16384,
      },
      "editor",
    );

    expect(budget.maxPointLights).toBe(24);
    expect(budget.maxPointShadows).toBe(4);
    expect(budget.directionalShadowMapSize).toBe(512);
  });
});
