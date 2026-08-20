import { describe, expect, it } from "vitest";
import { resolveMapLight } from "./mapUtils";

describe("map dynamic point-shadow settings", () => {
  it("defaults to one actor-aware cube with hysteresis", () => {
    const light = resolveMapLight({});
    expect(light.dynamicPointShadows).toBe(1);
    expect(light.dynamicShadowEnterScale).toBe(0.8);
    expect(light.dynamicShadowExitScale).toBe(1);
  });

  it("clamps actor cubes and keeps exit at or beyond enter", () => {
    const light = resolveMapLight({
      light: {
        dynamicPointShadows: 20,
        dynamicShadowEnterScale: 0.95,
        dynamicShadowExitScale: 0.5,
      },
    });
    expect(light.dynamicPointShadows).toBe(20);
    expect(light.dynamicShadowEnterScale).toBe(0.95);
    expect(light.dynamicShadowExitScale).toBe(0.95);
  });

  it("clamps actor cubes to the map light-object ceiling", () => {
    const light = resolveMapLight({
      light: { dynamicPointShadows: 99 },
    });
    expect(light.dynamicPointShadows).toBe(40);
  });
});
