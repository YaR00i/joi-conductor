import { describe, expect, it } from "vitest";
import {
  formatPageCacheProgress,
  readingListIsCached,
  type PageCacheProgress,
} from "./pageCache";
import type { DoujinReadingListItem } from "./types";

function progress(
  over: Partial<PageCacheProgress> = {},
): PageCacheProgress {
  return {
    listId: "l1",
    galleriesDone: 0,
    galleriesTotal: 22,
    pagesDone: 0,
    pagesTotal: 400,
    status: "running",
    ...over,
  };
}

describe("formatPageCacheProgress", () => {
  it("is empty while idle", () => {
    expect(formatPageCacheProgress(null)).toBe("");
    expect(formatPageCacheProgress(progress({ status: "idle" }))).toBe("");
  });

  it("counts works and pages while caching a list", () => {
    expect(
      formatPageCacheProgress(
        progress({ galleriesDone: 3, pagesDone: 40 }),
      ),
    ).toBe("3 / 22 работ · 40 / 400 стр.");
  });

  it("keeps the done line after the last page", () => {
    expect(
      formatPageCacheProgress(
        progress({
          status: "done",
          galleriesDone: 22,
          pagesDone: 400,
        }),
      ),
    ).toBe("Скачано · 22 работ");
  });

  it("surfaces a download error", () => {
    expect(
      formatPageCacheProgress(
        progress({ status: "error", error: "429" }),
      ),
    ).toBe("429");
  });
});

function listItem(
  galleryId: number,
  numPages: number,
): DoujinReadingListItem {
  return {
    galleryId,
    addedAt: 1,
    mediaId: String(galleryId),
    title: { english: "", japanese: "", pretty: `g${galleryId}` },
    coverUrl: "",
    numPages,
  };
}

describe("readingListIsCached", () => {
  it("needs every work to have at least its page count", () => {
    const list = {
      items: [listItem(1, 12), listItem(2, 8)],
    };
    expect(readingListIsCached(list, new Map([[1, 12], [2, 7]]))).toBe(
      false,
    );
    expect(readingListIsCached(list, new Map([[1, 12], [2, 8]]))).toBe(
      true,
    );
  });

  it("treats an empty queue as not cached", () => {
    expect(readingListIsCached({ items: [] }, new Map([[1, 20]]))).toBe(
      false,
    );
  });

  it("asks for at least one page when numPages is missing", () => {
    expect(
      readingListIsCached({ items: [listItem(9, 0)] }, new Map()),
    ).toBe(false);
    expect(
      readingListIsCached({ items: [listItem(9, 0)] }, new Map([[9, 1]])),
    ).toBe(true);
  });
});
