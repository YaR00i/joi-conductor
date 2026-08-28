import { describe, expect, it } from "vitest";
import {
  masonryPreviewSrc,
  masonryUpgradeSrc,
  type MediaItem,
} from "./media";

function post(partial: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "gb-1",
    url: "https://img.example/original.jpg",
    previewUrl: "https://img.example/preview.jpg",
    sampleUrl: "https://img.example/sample.jpg",
    kind: "image",
    source: "gelbooru",
    ...partial,
  };
}

describe("masonryPreviewSrc / masonryUpgradeSrc", () => {
  it("preview is the tiny thumb; upgrade is the sample, not the original", () => {
    const item = post();
    expect(masonryPreviewSrc(item)).toContain(encodeURIComponent(item.previewUrl!));
    expect(masonryUpgradeSrc(item)).toContain(encodeURIComponent(item.sampleUrl!));
    expect(masonryUpgradeSrc(item)).not.toContain("original.jpg");
  });

  it("skips upgrade when sample matches preview or is missing", () => {
    expect(
      masonryUpgradeSrc(post({ sampleUrl: "https://img.example/preview.jpg" })),
    ).toBeNull();
    expect(masonryUpgradeSrc(post({ sampleUrl: undefined }))).toBeNull();
  });

  it("does not upgrade local shelf, blobs, or video thumbs", () => {
    expect(
      masonryUpgradeSrc(post({ source: "favorites", url: "blob:fav" })),
    ).toBeNull();
    expect(masonryUpgradeSrc(post({ kind: "video" }))).toBeNull();
  });

  it("local shelf wall prefers the stored thumb blob, not the original", () => {
    const item = post({
      source: "favorites",
      url: "blob:original",
      previewUrl: "blob:thumb",
      sampleUrl: undefined,
    });
    expect(masonryPreviewSrc(item)).toBe("blob:thumb");
    expect(masonryUpgradeSrc(item)).toBeNull();
  });
});
