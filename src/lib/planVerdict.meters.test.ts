import { describe, expect, it } from "vitest";
import type { PlanRouletteResult } from "./planRoulette";
import { buildVerdictHeat } from "./planVerdict";
import { DEFAULT_PARAMS } from "./types";

function stub(
  over: Partial<PlanRouletteResult> = {},
): PlanRouletteResult {
  return {
    mood: "sweet",
    moodScore: 0,
    params: { ...DEFAULT_PARAMS },
    seed: 1,
    tags: "",
    tagsLabelRu: "",
    mediaKinds: [],
    mediaTypeId: "all",
    sessionToyIds: [],
    toysResolved: false,
    summary: [],
    ...over,
  };
}

describe("buildVerdictHeat", () => {
  it("attaches a human hint to each meter", () => {
    const meters = buildVerdictHeat(stub());
    expect(meters.map((m) => m.id)).toEqual(["heat", "control", "chaos"]);
    for (const m of meters) {
      expect(m.hint.length).toBeGreaterThan(20);
    }
  });
});
