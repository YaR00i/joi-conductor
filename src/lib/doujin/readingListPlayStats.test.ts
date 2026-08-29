import { describe, expect, it } from "vitest";
import {
  addReadingListPlayStats,
  EMPTY_READING_LIST_PLAY_STATS,
  formatReadingPlayStats,
  parseReadingListPlayStats,
  readingPlayStatsCaption,
  readingPlayStatsDelta,
  readingPlayStatsHasAny,
} from "./readingListPlayStats";

describe("readingListPlayStats", () => {
  it("treats missing JSON as zeros", () => {
    expect(parseReadingListPlayStats(undefined)).toEqual(
      EMPTY_READING_LIST_PLAY_STATS,
    );
    expect(parseReadingListPlayStats({ edges: -2, ruins: 1.9, orgasms: 3 })).toEqual({
      edges: 0,
      ruins: 1,
      orgasms: 3,
    });
  });

  it("diffs a live run into a collection bump", () => {
    const delta = readingPlayStatsDelta(
      { edgesDone: 1, ruinsDone: 0, orgasmsDone: 0 },
      { edgesDone: 3, ruinsDone: 1, orgasmsDone: 1 },
    );
    expect(delta).toEqual({ edges: 2, ruins: 1, orgasms: 1 });
    expect(readingPlayStatsHasAny(delta)).toBe(true);
    expect(
      addReadingListPlayStats({ edges: 4, ruins: 0, orgasms: 1 }, delta),
    ).toEqual({ edges: 6, ruins: 1, orgasms: 2 });
  });

  it("hides an empty caption and formats a live line", () => {
    expect(readingPlayStatsCaption(undefined)).toBeNull();
    expect(readingPlayStatsCaption({ edges: 2, ruins: 0, orgasms: 1 })).toBe(
      "эдж 2 · руин 0 · орг 1",
    );
    expect(formatReadingPlayStats({ edges: 0, ruins: 0, orgasms: 0 })).toBe(
      "эдж 0 · руин 0 · орг 0",
    );
  });
});
