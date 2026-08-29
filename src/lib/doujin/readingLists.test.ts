import { afterEach, describe, expect, it, vi } from "vitest";
import { languageBadge } from "./normalize";
import {
  cardToListItem,
  createReadingList,
  DEFAULT_READING_LIST_NAME,
  listedGalleryIds,
  listCanResume,
  listItemToCard,
  listResumeIndex,
  listReadingLists,
  bumpReadingListPlayStats,
  moveListItem,
  parseReadingListsJson,
  READING_LISTS_KEY,
  readingFeedTakeCounts,
  setReadingListNote,
  sliceDoujinFeedFrom,
} from "./readingLists";
import type { DoujinCard, DoujinGallery, DoujinReadingList } from "./types";

const card: DoujinCard = {
  id: 42,
  mediaId: "9",
  title: { english: "Hello", japanese: "", pretty: "Hello" },
  numPages: 12,
  coverUrl: "https://t.example/cover.jpg",
  thumbnailUrl: "https://t.example/thumb.jpg",
  tags: [{ type: "tag", name: "sole female" }, { type: "artist", name: "mishima" }],
  language: "english",
  uploadedAt: 1_700_000_000,
  numFavorites: 88,
};

describe("moveListItem", () => {
  it("reorders without mutating the source", () => {
    const src = ["a", "b", "c", "d"];
    expect(moveListItem(src, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(src).toEqual(["a", "b", "c", "d"]);
    expect(moveListItem(src, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("ignores out-of-range indexes", () => {
    const src = [1, 2, 3];
    expect(moveListItem(src, -1, 1)).toBe(src);
    expect(moveListItem(src, 1, 9)).toBe(src);
    expect(moveListItem(src, 1, 1)).toBe(src);
  });
});

describe("cardToListItem", () => {
  it("snapshots the card for offline list rows", () => {
    const item = cardToListItem(card);
    expect(item.galleryId).toBe(42);
    expect(item.coverUrl).toContain("thumb.jpg");
    expect(item.language).toBe("english");
    expect(item.languages).toEqual(["english"]);
    expect(item.numPages).toBe(12);
    expect(item.tags?.map((tag) => tag.name)).toEqual(["sole female", "mishima"]);
    expect(item.uploadedAt).toBe(1_700_000_000);
  });

  it("keeps page preview urls from a gallery", () => {
    const gallery: DoujinGallery = {
      ...card,
      pages: [
        { url: "https://i.example/1.jpg", previewUrl: "https://t.example/1t.jpg" },
        { url: "https://i.example/2.jpg", previewUrl: "https://t.example/2t.jpg" },
      ],
      related: [],
    };
    expect(cardToListItem(gallery).pagePreviews).toEqual([
      "https://t.example/1t.jpg",
      "https://t.example/2t.jpg",
    ]);
  });

  it("round-trips a list row back to a card for account favorite", () => {
    const item = cardToListItem(card);
    const back = listItemToCard(item);
    expect(back.id).toBe(42);
    expect(back.title.pretty).toBe("Hello");
    expect(back.tags.map((tag) => tag.name)).toEqual(["sole female", "mishima"]);
  });
});

describe("listedGalleryIds", () => {
  it("unions ids across lists", () => {
    const lists: DoujinReadingList[] = [
      {
        id: "a",
        name: "A",
        createdAt: 1,
        updatedAt: 1,
        cursorIndex: 0,
        items: [{ ...cardToListItem(card), galleryId: 1 }],
      },
      {
        id: "b",
        name: "B",
        createdAt: 1,
        updatedAt: 1,
        cursorIndex: 0,
        items: [
          { ...cardToListItem(card), galleryId: 1 },
          { ...cardToListItem(card), galleryId: 7 },
        ],
      },
    ];
    expect([...listedGalleryIds(lists)].sort()).toEqual([1, 7]);
  });
});

describe("parseReadingListsJson", () => {
  it("reads a saved queue and drops junk", () => {
    const raw = JSON.stringify([
      {
        id: "x",
        name: "Ночное",
        createdAt: 2,
        updatedAt: 9,
        cursorIndex: 0,
        items: [{ galleryId: 5, title: { pretty: "A" }, coverUrl: "", numPages: 3, tags: [{ type: "tag", name: "glasses" }], pagePreviews: ["https://t.example/1.jpg"] }],
      },
      { id: "", name: "bad" },
    ]);
    const lists = parseReadingListsJson(raw);
    expect(lists).toHaveLength(1);
    expect(lists[0]?.name).toBe("Ночное");
    expect(lists[0]?.items[0]?.galleryId).toBe(5);
    expect(lists[0]?.items[0]?.tags?.[0]?.name).toBe("glasses");
    expect(lists[0]?.items[0]?.pagePreviews).toEqual(["https://t.example/1.jpg"]);
    expect(lists[0]?.origin).toBe("user");
    expect(lists[0]?.note).toBe("");
    expect(lists[0]?.playStats).toEqual({ edges: 0, ruins: 0, orgasms: 0 });
  });

  it("reads a note and legacy description", () => {
    const lists = parseReadingListsJson(
      JSON.stringify([
        {
          id: "n",
          name: "Ночное",
          createdAt: 1,
          updatedAt: 1,
          cursorIndex: 0,
          note: "руками",
          items: [],
        },
        {
          id: "legacy",
          name: "Старый",
          createdAt: 1,
          updatedAt: 1,
          cursorIndex: 0,
          description: "из description",
          items: [],
        },
      ]),
    );
    expect(lists[0]?.note).toBe("руками");
    expect(lists[1]?.note).toBe("из description");
  });

  it("keeps mistress origin", () => {
    const lists = parseReadingListsJson(
      JSON.stringify([
        {
          id: "m",
          name: "Госпожа",
          createdAt: 1,
          updatedAt: 1,
          cursorIndex: 0,
          origin: "mistress",
          items: [],
        },
      ]),
    );
    expect(lists[0]?.origin).toBe("mistress");
  });

  it("keeps saved order instead of sorting by updatedAt", () => {
    const raw = JSON.stringify([
      { id: "old", name: "Старая", createdAt: 1, updatedAt: 1, cursorIndex: 0, items: [] },
      { id: "new", name: "Новая", createdAt: 9, updatedAt: 9, cursorIndex: 0, items: [] },
    ]);
    expect(parseReadingListsJson(raw).map((list) => list.id)).toEqual([
      "old",
      "new",
    ]);
  });
});

describe("languageBadge", () => {
  it("maps spoken languages and skips translated", () => {
    expect(languageBadge("japanese")?.code).toBe("JP");
    expect(languageBadge("english")?.kind).toBe("en");
    expect(languageBadge("chinese")?.kind).toBe("zh");
    expect(languageBadge("translated")).toBeNull();
    expect(languageBadge("")).toBeNull();
  });
});

describe("createReadingList", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubStorage() {
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
      removeItem: (key: string) => {
        mem.delete(key);
      },
    });
    return mem;
  }

  it("persists a named queue", async () => {
    const mem = stubStorage();
    const created = await createReadingList("  Ночное  ");
    expect(created.name).toBe("Ночное");
    expect(JSON.parse(mem.get(READING_LISTS_KEY) ?? "[]")).toHaveLength(1);
    const all = await listReadingLists();
    expect(all[0]?.id).toBe(created.id);
  });

  it("accumulates play stats on the queue", async () => {
    stubStorage();
    const created = await createReadingList("Ночное");
    expect(created.playStats).toEqual({ edges: 0, ruins: 0, orgasms: 0 });
    const bumped = await bumpReadingListPlayStats(created.id, {
      edges: 2,
      ruins: 1,
      orgasms: 1,
    });
    expect(bumped?.playStats).toEqual({ edges: 2, ruins: 1, orgasms: 1 });
    const again = await bumpReadingListPlayStats(created.id, {
      edges: 1,
      ruins: 0,
      orgasms: 0,
    });
    expect(again?.playStats).toEqual({ edges: 3, ruins: 1, orgasms: 1 });
  });

  it("falls back to the default name", async () => {
    stubStorage();
    const created = await createReadingList("   ");
    expect(created.name).toBe(DEFAULT_READING_LIST_NAME);
  });

  it("appends a new queue after existing ones", async () => {
    stubStorage();
    const first = await createReadingList("Первая");
    const second = await createReadingList("Вторая");
    const all = await listReadingLists();
    expect(all.map((list) => list.id)).toEqual([first.id, second.id]);
  });

  it("stores a note and packed cards", async () => {
    stubStorage();
    const created = await createReadingList("Пачка", {
      note: "из поиска",
      items: [card, { ...card, id: 99 }],
    });
    expect(created.note).toBe("из поиска");
    expect(created.items.map((row) => row.galleryId)).toEqual([42, 99]);
    const next = await setReadingListNote(created.id, "foot_focus");
    expect(next?.note).toBe("foot_focus");
  });
});

describe("sliceDoujinFeedFrom", () => {
  it("takes from the start id and includes remainder marks", () => {
    const pool = [1, 2, 3, 4, 5, 6].map((id) => ({ ...card, id }));
    expect(sliceDoujinFeedFrom(pool, 1, 3).map((row) => row.id)).toEqual([
      1, 2, 3,
    ]);
    expect(readingFeedTakeCounts(6)).toEqual([1, 5, 6]);
    expect(sliceDoujinFeedFrom(pool, 99, 3)).toEqual([]);
  });
});

describe("listCanResume", () => {
  const empty: DoujinReadingList = {
    id: "a",
    name: "A",
    createdAt: 1,
    updatedAt: 1,
    cursorIndex: 0,
    items: [],
  };

  it("is false for an empty queue", () => {
    expect(listCanResume(empty, { 42: 4 })).toBe(false);
  });

  it("is true when the cursor is past the first work", () => {
    expect(
      listCanResume(
        {
          ...empty,
          cursorIndex: 2,
          items: [
            { ...cardToListItem(card), galleryId: 1 },
            { ...cardToListItem(card), galleryId: 2 },
            { ...cardToListItem(card), galleryId: 3 },
          ],
        },
        {},
      ),
    ).toBe(true);
  });

  it("is true when the first work is mid-read", () => {
    expect(
      listCanResume(
        {
          ...empty,
          items: [{ ...cardToListItem(card), galleryId: 7, numPages: 20 }],
        },
        { 7: 8 },
      ),
    ).toBe(true);
  });

  it("is false at the start or after the last page", () => {
    const list = {
      ...empty,
      items: [{ ...cardToListItem(card), galleryId: 7, numPages: 20 }],
    };
    expect(listCanResume(list, {})).toBe(false);
    expect(listCanResume(list, { 7: 0 })).toBe(false);
    expect(listCanResume(list, { 7: 19 })).toBe(false);
  });

  it("clamps the resume index to the queue", () => {
    expect(listResumeIndex(empty)).toBe(0);
    expect(
      listResumeIndex({
        ...empty,
        cursorIndex: 9,
        items: [
          { ...cardToListItem(card), galleryId: 1 },
          { ...cardToListItem(card), galleryId: 2 },
        ],
      }),
    ).toBe(1);
  });
});
