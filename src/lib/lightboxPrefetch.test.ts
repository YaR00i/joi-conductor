import { describe, expect, it } from "vitest";
import {
  LIGHTBOX_PREFETCH_REMAINING,
  lightboxCanGoNext,
  lightboxShouldPrefetch,
} from "./lightboxPrefetch";

describe("lightboxPrefetch", () => {
  it("prefetches when the viewer is near the end of a page", () => {
    expect(lightboxShouldPrefetch(35, 36, true)).toBe(true);
    expect(
      lightboxShouldPrefetch(36 - LIGHTBOX_PREFETCH_REMAINING, 36, true),
    ).toBe(true);
    expect(lightboxShouldPrefetch(0, 36, true)).toBe(false);
    expect(lightboxShouldPrefetch(35, 36, false)).toBe(false);
    expect(lightboxShouldPrefetch(-1, 36, true)).toBe(false);
  });

  it("keeps next enabled while more pages can still load", () => {
    expect(lightboxCanGoNext(35, 36, true)).toBe(true);
    expect(lightboxCanGoNext(35, 36, false)).toBe(false);
    expect(lightboxCanGoNext(10, 36, false)).toBe(true);
    expect(lightboxCanGoNext(-1, 36, true)).toBe(false);
  });
});
