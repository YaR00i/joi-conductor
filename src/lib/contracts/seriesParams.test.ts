import { describe, expect, it } from "vitest";
import { getContractDef } from "./catalog";
import { contractRng } from "./contractTime";
import {
  normalizeParamOverrides,
  resolveSeriesDayParams,
} from "./seriesParams";

describe("seriesParams", () => {
  it("drops unknown keys, NaN and negatives", () => {
    expect(
      normalizeParamOverrides({
        n: 3,
        nope: 1,
        minutes: Number.NaN,
        hours: -2,
        taps: Infinity,
        tag: "slow",
      }),
    ).toEqual({ n: 3, tag: "slow" });
  });

  it("lets overrides beat a random roll", () => {
    const def = getContractDef("edge_count")!;
    const rng = contractRng("override-priority");
    const params = resolveSeriesDayParams(def, { paramOverrides: { n: 3 } }, rng);
    expect(params.n).toBe(3);
  });
});
