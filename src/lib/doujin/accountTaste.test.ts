import { describe, expect, it } from "vitest";
import { mergeFavoritePage, type FavoritesSnapshot } from "./accountTaste";
import type { DoujinCard, DoujinListPage } from "./types";

function card(id: number, tagIds: number[] = []): DoujinCard {
  return {
    id,
    mediaId: String(id),
    title: { english: `#${id}`, japanese: "", pretty: `#${id}` },
    numPages: 1,
    coverUrl: "",
    thumbnailUrl: "",
    tags: [],
    tagIds,
  };
}

function page(items: DoujinCard[], numPages = 2, total = 40): DoujinListPage {
  return { items, page: 1, numPages, total };
}

const empty: FavoritesSnapshot = {
  ids: [],
  tagLists: [],
  items: [],
  total: 0,
  numPages: 1,
  pagesLoaded: 0,
  at: 0,
};

describe("mergeFavoritePage", () => {
  it("appends unique ids and tag lists", () => {
    const first = mergeFavoritePage(
      empty,
      page([card(1, [10]), card(2, [20, 21])], 3, 50),
      1,
    );
    expect(first.ids).toEqual([1, 2]);
    expect(first.tagLists).toEqual([[10], [20, 21]]);
    expect(first.items.map((card) => card.id)).toEqual([1, 2]);
    expect(first.pagesLoaded).toBe(1);
    expect(first.total).toBe(50);

    const second = mergeFavoritePage(first, page([card(2, [99]), card(3, [30])]), 2);
    expect(second.ids).toEqual([1, 2, 3]);
    expect(second.tagLists).toEqual([[10], [20, 21], [30]]);
    expect(second.pagesLoaded).toBe(2);
  });

  it("collects artist ids from named tags when tagIds is empty", () => {
    const artistCard: DoujinCard = {
      ...card(8),
      tagIds: undefined,
      tags: [{ type: "artist", name: "muk", id: 77 }],
    };
    const snap = mergeFavoritePage(empty, page([artistCard]), 1);
    expect(snap.tagLists).toEqual([[77]]);
  });
});
