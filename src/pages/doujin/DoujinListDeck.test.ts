import { describe, expect, it } from "vitest";
import type { DoujinReadingListItem } from "../../lib/doujin/types";
import { advanceDeckSlot, listDeckPreviewUrls } from "./DoujinListDeck";

function item(
  id: number,
  coverUrl: string,
  pagePreviews?: string[],
): DoujinReadingListItem {
  return {
    galleryId: id,
    addedAt: 1,
    mediaId: String(id),
    title: { english: "", japanese: "", pretty: `g${id}` },
    coverUrl,
    numPages: 4,
    pagePreviews,
  };
}

describe("listDeckPreviewUrls", () => {
  it("uses one cover per work and does not pad with page previews", () => {
    const urls = listDeckPreviewUrls([
      item(1, "https://t.example/a.jpg", ["https://t.example/p1.jpg"]),
      item(2, "https://t.example/b.jpg"),
      item(3, "https://t.example/c.jpg", ["https://t.example/p3.jpg"]),
    ]);
    expect(urls).toEqual([
      "/api/media-proxy?url=" + encodeURIComponent("https://t.example/a.jpg"),
      "/api/media-proxy?url=" + encodeURIComponent("https://t.example/b.jpg"),
      "/api/media-proxy?url=" + encodeURIComponent("https://t.example/c.jpg"),
    ]);
  });

  it("caps the deck and skips blank covers", () => {
    const urls = listDeckPreviewUrls(
      [
        item(1, ""),
        item(2, "https://t.example/a.jpg"),
        item(3, "https://t.example/b.jpg"),
        item(4, "https://t.example/c.jpg"),
        item(5, "https://t.example/d.jpg"),
        item(6, "https://t.example/e.jpg"),
        item(7, "https://t.example/f.jpg"),
        item(8, "https://t.example/g.jpg"),
        item(9, "https://t.example/h.jpg"),
        item(10, "https://t.example/i.jpg"),
      ],
      { 2: "/covers/local.png" },
    );
    expect(urls).toEqual([
      "/covers/local.png",
      "/api/media-proxy?url=" + encodeURIComponent("https://t.example/b.jpg"),
      "/api/media-proxy?url=" + encodeURIComponent("https://t.example/c.jpg"),
      "/api/media-proxy?url=" + encodeURIComponent("https://t.example/d.jpg"),
      "/api/media-proxy?url=" + encodeURIComponent("https://t.example/e.jpg"),
      "/api/media-proxy?url=" + encodeURIComponent("https://t.example/f.jpg"),
      "/api/media-proxy?url=" + encodeURIComponent("https://t.example/g.jpg"),
      "/api/media-proxy?url=" + encodeURIComponent("https://t.example/h.jpg"),
    ]);
  });
});

describe("advanceDeckSlot", () => {
  it("pulls the next cover into a back slot and queues the outgoing one", () => {
    const next = advanceDeckSlot(["a", "b", "c", "d"], ["e", "f", "g", "h"], 0);
    expect(next.slots).toEqual(["e", "b", "c", "d"]);
    expect(next.queue).toEqual(["f", "g", "h", "a"]);
  });

  it("is a no-op when the extra queue is empty", () => {
    const slots = ["a", "b"];
    expect(advanceDeckSlot(slots, [], 1)).toEqual({ slots, queue: [] });
  });
});
