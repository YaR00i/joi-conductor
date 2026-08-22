import { describe, expect, it } from "vitest";
import { isWagerOption, wagerVerdict, WAGER_OPTIONS } from "./runnerWager";

describe("wagerVerdict", () => {
  it("doubles the stake on a survived run", () => {
    expect(wagerVerdict(10, true)).toEqual({ stake: 10, won: true, payout: 20 });
  });

  it("burns the stake on a wipe", () => {
    expect(wagerVerdict(10, false)).toEqual({ stake: 10, won: false, payout: 0 });
  });

  it("zero stake is a no-op", () => {
    expect(wagerVerdict(0, true)).toEqual({ stake: 0, won: false, payout: 0 });
    expect(wagerVerdict(-5, true).payout).toBe(0);
  });

  it("option list validation", () => {
    for (const n of WAGER_OPTIONS) expect(isWagerOption(n)).toBe(true);
    expect(isWagerOption(7)).toBe(false);
    expect(isWagerOption("10")).toBe(false);
  });
});
