import { describe, expect, it } from "vitest";
import { planMediaPlaySrc } from "./mediaPlaySrc";
import type { MediaItem } from "./media";

function post(partial: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "gb-1",
    url: "https://video.example/clip.mp4",
    kind: "video",
    source: "gelbooru",
    ...partial,
  };
}

describe("planMediaPlaySrc", () => {
  it("plays a shelf or RAM blob instead of the CDN stream", () => {
    const item = post();
    expect(
      planMediaPlaySrc({ item, ramUrl: "blob:ram", shelfUrl: null }),
    ).toEqual({
      src: "blob:ram",
      streamed: false,
      useEnsureCache: false,
    });
    expect(
      planMediaPlaySrc({ item, ramUrl: null, shelfUrl: "blob:shelf" }),
    ).toEqual({
      src: "blob:shelf",
      streamed: false,
      useEnsureCache: false,
    });
  });

  it("streams only when the video is not on disk", () => {
    const item = post();
    const plan = planMediaPlaySrc({
      item,
      ramUrl: null,
      shelfUrl: null,
    });
    expect(plan.streamed).toBe(true);
    expect(plan.src).toContain("clip.mp4");
    expect(plan.useEnsureCache).toBe(false);
  });

  it("keeps photos on the cache path", () => {
    expect(
      planMediaPlaySrc({
        item: post({ kind: "image", url: "https://img.example/a.jpg" }),
        ramUrl: null,
        shelfUrl: null,
      }),
    ).toEqual({ src: null, streamed: false, useEnsureCache: true });
  });

  it("uses the favorite blob URL as-is", () => {
    const item = post({ source: "favorites", url: "blob:fav" });
    expect(
      planMediaPlaySrc({ item, ramUrl: null, shelfUrl: null }),
    ).toEqual({
      src: "blob:fav",
      streamed: false,
      useEnsureCache: false,
    });
  });
});
