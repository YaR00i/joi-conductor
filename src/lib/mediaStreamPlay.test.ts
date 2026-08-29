import { describe, expect, it } from "vitest";
import {
  displayMediaUrl,
  downloadMediaUrl,
  mediaStreamsWithoutCache,
  type MediaItem,
} from "./media";

function post(partial: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "gb-1",
    url: "https://video.example/clip.mp4",
    kind: "video",
    source: "gelbooru",
    ...partial,
  };
}

describe("mediaStreamsWithoutCache", () => {
  it("streams remote gelbooru videos without waiting for a full blob", () => {
    const item = post();
    expect(mediaStreamsWithoutCache(item)).toBe(true);
    expect(displayMediaUrl(item)).toContain("clip.mp4");
    expect(downloadMediaUrl(item)).toContain("/api/media-proxy");
  });

  it("proxies videos even in the desktop shell so the player can fan out ranges", () => {
    const item = post();
    const prev = (globalThis as { window?: unknown }).window;
    (globalThis as { window: { joiDesktop: { isDesktop: boolean } } }).window =
      { joiDesktop: { isDesktop: true } };
    try {
      expect(displayMediaUrl(item)).toContain("/api/media-proxy");
      expect(displayMediaUrl(item)).toContain(encodeURIComponent(item.url));
      expect(
        displayMediaUrl(
          post({ kind: "image", url: "https://img.example/a.jpg" }),
        ),
      ).toBe("https://img.example/a.jpg");
      expect(downloadMediaUrl(item)).toContain("/api/media-proxy");
    } finally {
      if (prev === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window: unknown }).window = prev;
      }
    }
  });

  it("does not stream photos, shelf blobs, or local files", () => {
    expect(mediaStreamsWithoutCache(post({ kind: "image" }))).toBe(false);
    expect(
      mediaStreamsWithoutCache(post({ source: "favorites", url: "blob:fav" })),
    ).toBe(false);
    expect(
      mediaStreamsWithoutCache(post({ source: "local", url: "file://clip.mp4" })),
    ).toBe(false);
  });
});
