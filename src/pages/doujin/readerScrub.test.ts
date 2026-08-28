import { describe, expect, it } from "vitest";
import { clampScrubPreviewLeft, pageIndexFromScrub } from "./readerScrub";

describe("pageIndexFromScrub", () => {
  it("maps the left edge to the first page", () => {
    expect(pageIndexFromScrub(10, 10, 200, 10)).toBe(0);
  });

  it("maps the right edge to the last page", () => {
    expect(pageIndexFromScrub(209, 10, 200, 10)).toBe(9);
  });

  it("clamps outside the track", () => {
    expect(pageIndexFromScrub(0, 10, 200, 4)).toBe(0);
    expect(pageIndexFromScrub(400, 10, 200, 4)).toBe(3);
  });

  it("returns 0 for an empty track", () => {
    expect(pageIndexFromScrub(50, 0, 0, 12)).toBe(0);
  });
});

describe("clampScrubPreviewLeft", () => {
  it("keeps the preview centered on the pointer in the middle", () => {
    expect(clampScrubPreviewLeft(110, 10, 200, 80)).toBe(100);
  });

  it("does not hang off the left or right", () => {
    expect(clampScrubPreviewLeft(12, 10, 200, 80)).toBe(40);
    expect(clampScrubPreviewLeft(208, 10, 200, 80)).toBe(160);
  });
});
