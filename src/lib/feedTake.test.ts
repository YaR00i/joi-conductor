import { describe, expect, it } from "vitest";
import {
  defaultFeedTake,
  feedTakeCounts,
  toggleSelectedById,
} from "./feedTake";

describe("feedTakeCounts", () => {
  it("includes remainder marks under the cap", () => {
    expect(feedTakeCounts(6)).toEqual([1, 5, 6]);
    expect(feedTakeCounts(10)).toEqual([1, 5, 10]);
  });
});

describe("defaultFeedTake", () => {
  it("prefers 10 from a long feed and the remainder when packing a selection", () => {
    expect(defaultFeedTake(40)).toBe(10);
    expect(defaultFeedTake(3)).toBe(3);
    expect(defaultFeedTake(40, true)).toBe(40);
  });
});

describe("toggleSelectedById", () => {
  it("appends then removes by id without reshuffling the rest", () => {
    const a = { id: 1 };
    const b = { id: 2 };
    const once = toggleSelectedById([], a);
    expect(toggleSelectedById(once, b).map((row) => row.id)).toEqual([1, 2]);
    expect(toggleSelectedById([a, b], a).map((row) => row.id)).toEqual([2]);
  });
});
