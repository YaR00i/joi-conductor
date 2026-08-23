import { describe, expect, it } from "vitest";
import { emberWorldLoadProgress } from "./emberLoadProgress";

describe("emberWorldLoadProgress", () => {
  it("starts on terrain and finishes only after warmup", () => {
    expect(
      emberWorldLoadProgress({
        terrainSettled: false,
        staticPropsSettled: false,
        lightsReady: false,
        shadowCached: 0,
        shadowTotal: 12,
        warmupComplete: false,
      }).labelRu,
    ).toBe("Местность…");

    const mid = emberWorldLoadProgress({
      terrainSettled: true,
      staticPropsSettled: true,
      lightsReady: true,
      shadowCached: 6,
      shadowTotal: 12,
      warmupComplete: false,
    });
    expect(mid.labelRu).toBe("Свет и тени…");
    expect(mid.ratio).toBeGreaterThan(0.5);
    expect(mid.ratio).toBeLessThan(1);

    const midFrac = emberWorldLoadProgress({
      terrainSettled: false,
      staticPropsSettled: false,
      lightsReady: false,
      shadowCached: 0,
      shadowTotal: 12,
      warmupComplete: false,
      terrainFrac: 0.5,
      propsFrac: 0.25,
    });
    expect(midFrac.labelRu).toBe("Местность…");
    expect(midFrac.ratio).toBeGreaterThan(0.1);
    expect(midFrac.ratio).toBeLessThan(0.5);

    expect(
      emberWorldLoadProgress({
        terrainSettled: true,
        staticPropsSettled: true,
        lightsReady: true,
        shadowCached: 12,
        shadowTotal: 12,
        warmupComplete: true,
      }),
    ).toEqual({ ratio: 1, labelRu: "Готово" });
  });
});
