import { describe, expect, it } from "vitest";
import { clampScrubPreviewLeft, pageIndexFromScrub, scrubThumbRatio } from "./readerScrub";

describe("pageIndexFromScrub", () => {
  it("maps a click at the thumb of page 1 back to the first page", () => {
    const width = 200;
    const left = 10;
    const x = left + scrubThumbRatio(0, 10) * width;
    expect(pageIndexFromScrub(x, left, width, 10)).toBe(0);
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

describe("scrubThumbRatio", () => {
  it("puts page 1 at the start and the last page at the end", () => {
    expect(scrubThumbRatio(0, 10)).toBe(0);
    expect(scrubThumbRatio(9, 10)).toBe(1);
    expect(scrubThumbRatio(4, 9)).toBe(0.5);
    expect(scrubThumbRatio(0, 1)).toBe(0);
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
