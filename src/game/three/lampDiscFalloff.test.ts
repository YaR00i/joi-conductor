import { describe, expect, it } from "vitest";
import { LAMP_DISC_SOFT_BIAS, packLampDiscDecay } from "./threeLighting";

describe("lamp disc decay packing", () => {
  it("keeps hard discs below the soft bias", () => {
    const packed = packLampDiscDecay(0.32, 0.62);
    expect(packed).toBeGreaterThan(320);
    expect(packed).toBeLessThan(321);
    expect(packed).toBeLessThan(LAMP_DISC_SOFT_BIAS);
  });

  it("flags soft rings without losing core/mid", () => {
    const hard = packLampDiscDecay(0.32, 0.62, false);
    const soft = packLampDiscDecay(0.32, 0.62, true);
    expect(soft - hard).toBe(LAMP_DISC_SOFT_BIAS);
    expect(soft).toBeGreaterThan(1500);
  });
});
