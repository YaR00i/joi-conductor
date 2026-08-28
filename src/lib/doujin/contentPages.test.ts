import { describe, expect, it } from "vitest";
import {
  canSpawnTaskOnPage,
  clipTaskSpan,
  contentPageRange,
  isContentPage,
} from "./contentPages";

describe("contentPageRange", () => {
  it("keeps tiny books almost whole", () => {
    expect(contentPageRange(1)).toEqual({ start: 0, end: 0 });
    expect(contentPageRange(2)).toEqual({ start: 0, end: 1 });
  });

  it("skips only the cover on short volumes", () => {
    expect(contentPageRange(8)).toEqual({ start: 1, end: 7 });
  });

  it("skips 2 front and 1 back on a typical book", () => {
    expect(contentPageRange(20)).toEqual({ start: 2, end: 18 });
  });

  it("uses 3 front and 2 back on a long book, capped at 30%", () => {
    const range = contentPageRange(40);
    expect(range.start).toBe(3);
    expect(range.end).toBe(37);
    const cut = range.start + (39 - range.end);
    expect(cut).toBeLessThanOrEqual(Math.floor(40 * 0.3));
  });

  it("never eats more than 30%", () => {
    for (const n of [9, 12, 16, 24, 48, 80]) {
      const { start, end } = contentPageRange(n);
      const cut = start + (n - 1 - end);
      expect(cut).toBeLessThanOrEqual(Math.floor(n * 0.3));
      expect(end).toBeGreaterThanOrEqual(start);
    }
  });
});

describe("isContentPage / spawn", () => {
  it("does not treat the cover as content on a 20-page book", () => {
    expect(isContentPage(0, 20)).toBe(false);
    expect(isContentPage(2, 20)).toBe(true);
    expect(isContentPage(19, 20)).toBe(false);
  });

  it("never spawns on first or last page", () => {
    expect(canSpawnTaskOnPage(0, 20)).toBe(false);
    expect(canSpawnTaskOnPage(19, 20)).toBe(false);
    expect(canSpawnTaskOnPage(5, 20)).toBe(true);
  });

  it("clips a span away from back matter and the last page", () => {
    const span = clipTaskSpan(16, 4, 20);
    expect(span).toEqual({ start: 16, end: 18 });
  });

  it("refuses to start a task on the cover", () => {
    expect(clipTaskSpan(0, 3, 20)).toBeNull();
  });
});
