import { describe, expect, it } from "vitest";
import {
  applyMapLightBudget,
  lanternShadowShare,
  lanternVisibleShare,
  playPointShadowCap,
  remainingEmissiveShadowSlots,
  resolveEmberRenderBudget,
  resolvePlayProfileBudget,
} from "./renderBudget";

describe("Ember WebGL render budget", () => {
  it("keeps auto atlas bake conservative; authored maps may use the full cache cap", () => {
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
    expect(budget.maxPointShadows).toBe(6);
    expect(budget.maxPointShadowsHard).toBe(40);
    expect(lanternShadowShare(budget)).toBe(6);
    expect(budget.pointShadowMapSize).toBe(256);
    expect(budget.directionalShadowMapSize).toBe(1024);
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
    expect(budget.maxPointShadows).toBe(4);
    expect(budget.maxPointShadowsHard).toBe(40);
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
    expect(budget.maxPointShadowsHard).toBe(40);
    expect(budget.maxPointLightsHard).toBe(40);
    expect(budget.directionalShadowMapSize).toBe(1024);
  });

  it("gives explore more fill lamps without horde or emissive cubes", () => {
    const arena = resolvePlayProfileBudget("arena");
    expect(arena.allowHorde).toBe(true);
    expect(arena.allowNpc).toBe(false);
    expect(arena.emissiveShadows).toBe(true);
    expect(arena.maxPointShadows).toBe(6);

    const explore = resolvePlayProfileBudget("explore");
    expect(explore.allowHorde).toBe(false);
    expect(explore.allowNpc).toBe(true);
    expect(explore.emissiveShadows).toBe(false);
    expect(explore.maxPointLights).toBeGreaterThan(arena.maxPointLights);
    expect(explore.maxPointShadows).toBe(arena.maxPointShadows);
    expect(explore.maxNpcs).toBe(24);

    const hw = resolveEmberRenderBudget(
      {
        maxFragmentUniforms: 4096,
        maxTextures: 64,
        maxTextureSize: 16384,
        maxCubemapSize: 16384,
      },
      "play",
      "explore",
    );
    expect(hw.maxPointLights).toBe(40);
    expect(hw.maxPointShadows).toBe(6);
    expect(hw.maxPointShadowsHard).toBe(40);
  });

  it("does not enable horde waves on explore maps", () => {
    expect(resolvePlayProfileBudget("explore").allowHorde).toBe(false);
    expect(resolvePlayProfileBudget("arena").allowHorde).toBe(true);
  });

  it("applies authored on-screen light and shadow caps under the GPU budget", () => {
    const hardware = resolveEmberRenderBudget(
      {
        maxFragmentUniforms: 4096,
        maxTextures: 64,
        maxTextureSize: 16384,
        maxCubemapSize: 16384,
      },
      "play",
      "explore",
    );
    const capped = applyMapLightBudget(hardware, {
      maxPointLights: 12,
      maxPointShadows: 2,
    });
    expect(capped.maxPointLights).toBe(12);
    expect(capped.maxPointShadows).toBe(2);
    expect(
      applyMapLightBudget(hardware, {
        maxPointLights: null,
        maxPointShadows: 0,
      }).maxPointShadows,
    ).toBe(0);
    expect(
      lanternVisibleShare(capped, { authoredLights: true, explore: true }),
    ).toBe(12);
    expect(
      lanternVisibleShare(hardware, { authoredLights: false, explore: true }),
    ).toBe(Math.ceil(hardware.maxPointLights * 0.7));
    expect(
      applyMapLightBudget(hardware, {
        maxPointLights: null,
        maxPointShadows: 8,
      }).maxPointShadows,
    ).toBe(8);
  });

  it("clamps explore play cube shadows to the profile, not authored 12", () => {
    const hardware = resolveEmberRenderBudget(
      {
        maxFragmentUniforms: 4096,
        maxTextures: 64,
        maxTextureSize: 16384,
        maxCubemapSize: 16384,
      },
      "play",
      "explore",
    );
    const authored = applyMapLightBudget(hardware, {
      maxPointLights: 24,
      maxPointShadows: 12,
    });
    expect(authored.maxPointShadows).toBe(12);
    expect(
      playPointShadowCap(authored, resolvePlayProfileBudget("explore")),
    ).toBe(12);
    expect(remainingEmissiveShadowSlots(6, 2)).toBe(4);
    expect(remainingEmissiveShadowSlots(6, 6)).toBe(0);
    expect(remainingEmissiveShadowSlots(0, 3)).toBe(0);
  });
});
