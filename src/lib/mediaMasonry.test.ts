import { describe, expect, it } from "vitest";
import {
  masonryPreviewSrc,
  masonryStillUrl,
  masonryUpgradeCandidates,
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

  it("falls back to a still original when the sample 404s", () => {
    const item = post();
    expect(masonryUpgradeCandidates(item)).toEqual([
      expect.stringContaining(encodeURIComponent(item.sampleUrl!)),
      expect.stringContaining(encodeURIComponent("original.jpg")),
    ]);
    expect(masonryUpgradeSrc(item)).not.toContain("original.jpg");
  });

  it("does not pull a video original after a missing sample", () => {
    const item = post({
      kind: "video",
      url: "https://video.example/clip.webm",
      previewUrl: "https://img.example/thumb.jpg",
      sampleUrl: "https://img.example/poster.jpg",
    });
    const candidates = masonryUpgradeCandidates(item);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toContain(encodeURIComponent("poster.jpg"));
    expect(candidates[0]).not.toContain("clip.webm");
  });

  it("skips upgrade when sample matches preview or is missing", () => {
    expect(
      masonryUpgradeSrc(post({ sampleUrl: "https://img.example/preview.jpg" })),
    ).toBeNull();
    expect(masonryUpgradeSrc(post({ sampleUrl: undefined }))).toBeNull();
  });

  it("does not upgrade local shelf or blobs", () => {
    expect(
      masonryUpgradeSrc(post({ source: "favorites", url: "blob:fav" })),
    ).toBeNull();
  });

  it("paints a still jpeg on video cards, not the webm/mp4", () => {
    const item = post({
      kind: "video",
      url: "https://video.example/clip.mp4",
      previewUrl: "https://img.example/thumb.jpg",
      sampleUrl: "https://img.example/sample.jpg",
    });
    expect(masonryStillUrl(item)).toBe(item.previewUrl);
    expect(masonryPreviewSrc(item)).toContain(encodeURIComponent("thumb.jpg"));
    expect(masonryPreviewSrc(item)).not.toContain("clip.mp4");
    expect(masonryUpgradeSrc(item)).toContain(encodeURIComponent("sample.jpg"));
  });

  it("does not put a sample video on the wall", () => {
    const item = post({
      kind: "video",
      url: "https://video.example/clip.webm",
      previewUrl: "https://img.example/thumb.jpg",
      sampleUrl: "https://video.example/sample.webm",
    });
    expect(masonryUpgradeSrc(item)).toBeNull();
    expect(masonryPreviewSrc(item)).toContain("thumb.jpg");
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
