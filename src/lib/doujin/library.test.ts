import { describe, expect, it } from "vitest";
import {
  CONTINUE_SHELF_CAP,
  continueReadingRows,
  isContinueRecord,
  missingDoujinStores,
} from "./library";
import type { DoujinLibraryRecord } from "./types";

function libRow(
  partial: Partial<DoujinLibraryRecord> & { id: number },
): DoujinLibraryRecord {
  return {
    mediaId: String(partial.id),
    title: { english: "", japanese: "", pretty: `#${partial.id}` },
    tags: [],
    numPages: 20,
    coverUrl: "",
    savedAt: 1,
    pageIndex: 0,
    ...partial,
  };
}

describe("missingDoujinStores", () => {
  it("flags taste stores when the db is still the v2 shape", () => {
    const names = new Set(["library", "readingLists"]);
    expect(missingDoujinStores({ contains: (name) => names.has(name) })).toEqual(
      ["tasteMeta", "tasteGalleries", "tasteNames", "pageBlobs"],
    );
  });

  it("is empty when every required store exists", () => {
    const names = new Set([
      "library",
      "readingLists",
      "tasteMeta",
      "tasteGalleries",
      "tasteNames",
      "pageBlobs",
    ]);
    expect(missingDoujinStores({ contains: (name) => names.has(name) })).toEqual(
      [],
    );
  });
});

describe("continue shelf", () => {
  it("skips unopened and finished works", () => {
    expect(isContinueRecord(libRow({ id: 1, pageIndex: 0 }))).toBe(false);
    expect(isContinueRecord(libRow({ id: 2, pageIndex: 5 }))).toBe(true);
    expect(
      isContinueRecord(libRow({ id: 3, pageIndex: 19, numPages: 20 })),
    ).toBe(false);
  });

  it("orders by last read, then saved, and caps the strip", () => {
    const rows = Array.from({ length: CONTINUE_SHELF_CAP + 2 }, (_, i) =>
      libRow({
        id: i + 1,
        pageIndex: 2,
        savedAt: i,
        readAt: i === 3 ? 900 : i,
      }),
    );
    const next = continueReadingRows(rows);
    expect(next).toHaveLength(CONTINUE_SHELF_CAP);
    expect(next[0]?.id).toBe(4);
  });
});
