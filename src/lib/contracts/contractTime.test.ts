import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../test/localStorageMock";
import {
  addLocalDays,
  contractRng,
  contractsTodayKey,
  endOfLocalDayMs,
  localCalendarDayDiff,
} from "./contractTime";

installLocalStorageMock();

describe("contractTime calendar", () => {
  beforeEach(() => {
    resetLocalStorage();
  });

  it("adds local calendar days across month and year", () => {
    expect(addLocalDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addLocalDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addLocalDays("2026-07-22", 7)).toBe("2026-07-29");
  });

  it("diffs whole calendar days without using local midnight + 86400000", () => {
    expect(localCalendarDayDiff("2026-07-22", "2026-07-22")).toBe(0);
    expect(localCalendarDayDiff("2026-07-22", "2026-07-25")).toBe(3);
    expect(localCalendarDayDiff("2026-07-25", "2026-07-22")).toBe(-3);
    expect(localCalendarDayDiff("2026-12-31", "2027-01-02")).toBe(2);
  });

  it("endOfLocalDayMs stays on the same civil date", () => {
    const key = "2026-03-08";
    const end = endOfLocalDayMs(key);
    expect(contractsTodayKey(new Date(end))).toBe(key);
  });

  it("addLocalDays matches Date#setDate, not a raw millisecond hop", () => {
    const key = "2026-03-08";
    const [y, m, d] = key.split("-").map(Number);
    const viaDate = new Date(y!, m! - 1, d);
    viaDate.setDate(viaDate.getDate() + 1);
    expect(addLocalDays(key, 1)).toBe(contractsTodayKey(viaDate));
    expect(addLocalDays(key, 1)).toBe("2026-03-09");
  });

  it("contractRng is deterministic", () => {
    const a = contractRng("ser|d0")();
    const b = contractRng("ser|d0")();
    expect(a).toBe(b);
    expect(contractRng("ser|d1")()).not.toBe(a);
  });
});
