import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../test/localStorageMock";
import type { MediaItem } from "./media";
import {
  addToGelbooruList,
  createGelbooruList,
  DEFAULT_GELBOORU_LIST_NAME,
  gelbooruFeedItemIndex,
  gelbooruFeedTakeCounts,
  gelbooruItemOnShelf,
  gelbooruListCanResume,
  gelbooruListDeckUrls,
  gelbooruListItemLabel,
  gelbooruListOption,
  gelbooruListUnsavedItems,
  itemToGelbooruListItem,
  listedGelbooruIds,
  listGelbooruLists,
  mergeUniqueMedia,
  moveInGelbooruList,
  otherUserGelbooruLists,
  parseGelbooruListsJson,
  setGelbooruListNote,
  sliceGelbooruFeedFrom,
  toggleInGelbooruList,
} from "./gelbooruLists";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

function post(id: string, extra: Partial<MediaItem> = {}): MediaItem {
  return {
    id: `gb-${id}`,
    url: `https://img.example/${id}.jpg`,
    previewUrl: `https://img.example/${id}-p.jpg`,
    sampleUrl: `https://img.example/${id}-s.jpg`,
    kind: "image",
    source: "gelbooru",
    tags: "hu_tao 1girl",
    gelbooruId: id,
    ...extra,
  };
}

describe("itemToGelbooruListItem", () => {
  it("keeps remote gelbooru stills and drops blobs", () => {
    const row = itemToGelbooruListItem(post("12"));
    expect(row?.id).toBe("gb-12");
    expect(row?.sampleUrl).toContain("-s.jpg");
    expect(itemToGelbooruListItem(post("12", { url: "blob:x" }))).toBeNull();
  });
});

describe("gelbooru lists CRUD", () => {
  it("creates, toggles, and reorders", async () => {
    const list = await createGelbooruList("  Ночное  ");
    expect(list.name).toBe("Ночное");
    await addToGelbooruList(list.id, post("1"));
    await addToGelbooruList(list.id, post("2"));
    const toggled = await toggleInGelbooruList(list.id, post("1"));
    expect(toggled?.items.map((row) => row.gelbooruId)).toEqual(["2"]);
    await addToGelbooruList(list.id, post("3"));
    const moved = await moveInGelbooruList(list.id, 1, 0);
    expect(moved?.items.map((row) => row.gelbooruId)).toEqual(["3", "2"]);
    const all = await listGelbooruLists();
    expect(listedGelbooruIds(all).has("gb-2")).toBe(true);
  });

  it("falls back to the default name", async () => {
    const list = await createGelbooruList("   ");
    expect(list.name).toBe(DEFAULT_GELBOORU_LIST_NAME);
  });

  it("stores a note and reads legacy description", async () => {
    const list = await createGelbooruList("Ночное", { note: "руками" });
    expect(list.note).toBe("руками");
    const next = await setGelbooruListNote(list.id, "foot_focus → 20");
    expect(next?.note).toBe("foot_focus → 20");
    expect(
      parseGelbooruListsJson(
        JSON.stringify([
          {
            id: "legacy",
            name: "Старый",
            createdAt: 1,
            updatedAt: 1,
            cursorIndex: 0,
            origin: "user",
            description: "из description",
            items: [],
          },
        ]),
      )[0]?.note,
    ).toBe("из description");
  });

  it("ignores junk JSON", () => {
    expect(parseGelbooruListsJson("{nope")).toEqual([]);
    expect(parseGelbooruListsJson('[{"id":"x"}]')).toEqual([]);
  });
});

describe("labels and resume", () => {
  it("uses tags, then post id", () => {
    expect(gelbooruListItemLabel(itemToGelbooruListItem(post("9"))!)).toBe(
      "hu_tao 1girl",
    );
    expect(
      gelbooruListItemLabel(
        itemToGelbooruListItem(post("9", { tags: "" }))!,
      ),
    ).toBe("#9");
  });

  it("resume only after the cursor moved", async () => {
    const list = await createGelbooruList("A");
    expect(gelbooruListCanResume(list)).toBe(false);
  });

  it("treats raw gelbooru ids and gb- records as already on the shelf", () => {
    const item = itemToGelbooruListItem(post("9"))!;
    expect(gelbooruItemOnShelf(item, new Set(["gb-9"]))).toBe(true);
    expect(gelbooruItemOnShelf(item, new Set(["9"]))).toBe(true);
    expect(gelbooruItemOnShelf(item, new Set(["gb-8"]))).toBe(false);
  });

  it("skips posts already on the shelf, including gb- aliases", async () => {
    const list = await createGelbooruList("Ночное");
    await addToGelbooruList(list.id, post("1"));
    await addToGelbooruList(list.id, post("2"));
    const filled = (await listGelbooruLists())[0]!;
    expect(
      gelbooruListUnsavedItems(filled, new Set(["gb-1"])).map((row) => row.gelbooruId),
    ).toEqual(["2"]);
    expect(
      gelbooruListUnsavedItems(filled, new Set(["1"])).map((row) => row.gelbooruId),
    ).toEqual(["2"]);
    expect(
      gelbooruListUnsavedItems(filled, new Set(), new Set(["gb-2"])).map(
        (row) => row.gelbooruId,
      ),
    ).toEqual(["1"]);
  });

  it("slices the found feed from the clicked post", () => {
    const feed = [post("1"), post("2"), post("3"), post("4")];
    expect(sliceGelbooruFeedFrom(feed, "gb-3", 10).map((row) => row.id)).toEqual([
      "gb-3",
      "gb-4",
    ]);
    expect(sliceGelbooruFeedFrom(feed, "2", 1).map((row) => row.id)).toEqual([
      "gb-2",
    ]);
    expect(gelbooruFeedItemIndex(feed, "missing")).toBe(-1);
    expect(sliceGelbooruFeedFrom(feed, "missing", 3)).toEqual([]);
    expect(gelbooruFeedTakeCounts(1)).toEqual([1]);
    expect(gelbooruFeedTakeCounts(12)).toEqual([1, 5, 10, 12]);
    expect(gelbooruFeedTakeCounts(10)).toEqual([1, 5, 10]);
  });
});

describe("otherUserGelbooruLists", () => {
  it("keeps user queues for the self-end picker", async () => {
    const mine = await createGelbooruList("Моё");
    await createGelbooruList("Её", { origin: "mistress" });
    const extra = await createGelbooruList("Ещё");
    const all = await listGelbooruLists();
    expect(otherUserGelbooruLists(all, mine.id).map((row) => row.id)).toEqual([
      extra.id,
    ]);
  });
});

describe("mergeUniqueMedia / deck urls", () => {
  it("caps unique posts", () => {
    const a = post("1");
    const b = post("2");
    expect(mergeUniqueMedia([a], [a, b, post("3")], 2).map((row) => row.id)).toEqual(
      ["gb-1", "gb-2"],
    );
  });

  it("deck prefers preview urls", () => {
    const urls = gelbooruListDeckUrls([
      itemToGelbooruListItem(post("1"))!,
      itemToGelbooruListItem(post("2"))!,
    ]);
    expect(urls[0]).toContain(encodeURIComponent("https://img.example/1-p.jpg"));
    expect(urls).toHaveLength(2);
  });

  it("option maps name, count, and deck preview urls", () => {
    const item = itemToGelbooruListItem(post("1"))!;
    const opt = gelbooruListOption({
      id: "l1",
      name: "К просмотру",
      createdAt: 1,
      updatedAt: 1,
      cursorIndex: 0,
      origin: "user",
      note: "",
      items: [item],
    });
    expect(opt.id).toBe("l1");
    expect(opt.name).toBe("К просмотру");
    expect(opt.count).toBe(1);
    expect(opt.previewUrls).toEqual(gelbooruListDeckUrls([item]));
  });
});
