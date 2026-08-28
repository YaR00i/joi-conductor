import { describe, expect, it } from "vitest";
import {
  FOG_EXP2_DENSITY_AT_ONE,
  fogExp2Density,
} from "./fogDensity";

describe("fogExp2Density", () => {
  it("is off at zero", () => {
    expect(fogExp2Density(0)).toBe(0);
    expect(fogExp2Density(0, 0)).toBe(0);
  });

  it("has no density floor so 0.02 stays light aerial haze", () => {
    const light = fogExp2Density(0.02);
    expect(light).toBeCloseTo(0.0004, 6);
    // Previous mapping was `0.002 + fog * 0.018` ≈ 0.00236.
    expect(light).toBeLessThan(0.0005);
    expect(light * 5).toBeLessThan(0.00236);
  });

  it("keeps fog=1 at the previous max density", () => {
    expect(fogExp2Density(1)).toBeCloseTo(FOG_EXP2_DENSITY_AT_ONE, 6);
  });

  it("scales linearly through the origin", () => {
    expect(fogExp2Density(0.001)).toBeCloseTo(0.00002, 8);
    expect(fogExp2Density(0.05)).toBeCloseTo(0.001, 6);
    expect(fogExp2Density(0.5)).toBeCloseTo(0.01, 6);
  });

  it("lets haze add a little density without a floor", () => {
    const hazeOnly = fogExp2Density(0, 0.5);
    expect(hazeOnly).toBeGreaterThan(0);
    expect(hazeOnly).toBeLessThan(fogExp2Density(0.5));
  });
});
