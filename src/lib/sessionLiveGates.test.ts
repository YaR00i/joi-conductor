import { describe, expect, it } from "vitest";
import {
  filterOptionsByLiveMode,
  isModeAllowedForLive,
  type LiveWearGate,
} from "./sessionLiveGates";

describe("session live gates", () => {
  const cage: LiveWearGate = { wearKind: "cage", denialOn: false };
  const free: LiveWearGate = { wearKind: null, denialOn: false };

  it("blocks free-access modes while caged", () => {
    expect(isModeAllowedForLive("stroke", cage)).toBe(false);
    expect(isModeAllowedForLive("oral", cage)).toBe(false);
    expect(isModeAllowedForLive("chastity", cage)).toBe(true);
    expect(isModeAllowedForLive("cbt", cage)).toBe(true);
  });

  it("allows every mode when nothing is worn", () => {
    expect(isModeAllowedForLive("stroke", free)).toBe(true);
    expect(isModeAllowedForLive("anal", free)).toBe(true);
  });

  it("filters roulette mode options", () => {
    const opts = [
      { id: "stroke" },
      { id: "chastity" },
      { id: "cbt" },
    ];
    expect(filterOptionsByLiveMode(opts, cage).map((o) => o.id)).toEqual([
      "chastity",
      "cbt",
    ]);
  });
});
