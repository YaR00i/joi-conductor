import { describe, expect, it } from "vitest";
import {
  favoriteLookupPlan,
  favoriteMatchesKindFilter,
  favoriteMatchesTagFilter,
  favoriteMediaKind,
  favoriteRecordToListItem,
  filterFavoriteMetadata,
  findMatchingFavorite,
  type FavoriteMetadata,
  type FavoriteRecord,
} from "./mediaFavorites";
import { splitMediaTags, type MediaItem } from "./media";

function meta(
  partial: Partial<FavoriteMetadata> & Pick<FavoriteMetadata, "id">,
): FavoriteMetadata {
  return {
    tags: "",
    savedAt: 1,
    ...partial,
  };
}

describe("favoriteMediaKind", () => {
  it("prefers stored kind", () => {
    expect(favoriteMediaKind({ kind: "video", mime: "image/jpeg" })).toBe(
      "video",
    );
  });

  it("falls back to mime for older rows", () => {
    expect(favoriteMediaKind({ mime: "video/mp4" })).toBe("video");
    expect(favoriteMediaKind({ mime: "image/gif" })).toBe("gif");
    expect(favoriteMediaKind({ mime: "image/jpeg" })).toBe("image");
  });
});

describe("favoriteMatchesKindFilter", () => {
  it("keeps gif on its own filter", () => {
    const gif = meta({ id: "g", kind: "gif" });
    expect(favoriteMatchesKindFilter(gif, "all")).toBe(true);
    expect(favoriteMatchesKindFilter(gif, "gif")).toBe(true);
    expect(favoriteMatchesKindFilter(gif, "image")).toBe(false);
    expect(favoriteMatchesKindFilter(gif, "video")).toBe(false);
  });

  it("keeps stills out of the gif filter", () => {
    const still = meta({ id: "p", kind: "image" });
    expect(favoriteMatchesKindFilter(still, "image")).toBe(true);
    expect(favoriteMatchesKindFilter(still, "gif")).toBe(false);
  });
});

describe("filterFavoriteMetadata", () => {
  const rows: FavoriteMetadata[] = [
    meta({
      id: "a",
      kind: "image",
      tags: "hu_tao solo",
      savedAt: 30,
    }),
    meta({
      id: "b",
      kind: "video",
      tags: "furina oral",
      savedAt: 20,
    }),
    meta({
      id: "c",
      kind: "image",
      tags: "hu_tao oral",
      savedAt: 10,
    }),
  ];

  it("filters the whole library by tag AND, not a loaded page", () => {
    const found = filterFavoriteMetadata(rows, {
      selectedTags: ["oral"],
      search: "",
      kind: "all",
    });
    expect(found.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("combines kind + tags", () => {
    const found = filterFavoriteMetadata(rows, {
      selectedTags: ["hu_tao"],
      search: "",
      kind: "image",
    });
    expect(found.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("keeps newest-first order from the source list", () => {
    const found = filterFavoriteMetadata(rows, {
      selectedTags: [],
      search: "",
      kind: "all",
    });
    expect(found.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("favoriteMatchesTagFilter", () => {
  it("requires every selected tag", () => {
    expect(favoriteMatchesTagFilter("hu_tao oral", ["hu_tao"], "")).toBe(true);
    expect(
      favoriteMatchesTagFilter("hu_tao oral", ["hu_tao", "furina"], ""),
    ).toBe(false);
  });
});

function rec(
  partial: Partial<FavoriteRecord> & Pick<FavoriteRecord, "id">,
): FavoriteRecord {
  return {
    kind: "image",
    mime: "image/jpeg",
    fileName: `${partial.id}.jpg`,
    blob: new Blob(["x"]),
    savedAt: 1,
    ...partial,
  };
}

function item(
  partial: Partial<MediaItem> & Pick<MediaItem, "id" | "url">,
): MediaItem {
  return {
    kind: "image",
    source: "gelbooru",
    ...partial,
  };
}

describe("favoriteLookupPlan", () => {
  it("tries the gb- id when the feed card only has a gelbooruId", () => {
    const plan = favoriteLookupPlan({
      id: "tmp-9",
      url: "https://img.example/a.jpg?x=1",
      gelbooruId: "42",
    });
    expect(plan.ids).toEqual(["tmp-9", "gb-42"]);
    expect(plan.gelbooruId).toBe("42");
    expect(plan.remoteUrls).toContain("https://img.example/a.jpg?x=1");
    expect(plan.remoteUrls).toContain("https://img.example/a.jpg");
  });
});

describe("findMatchingFavorite", () => {
  it("matches a site card to a saved post by gelbooru id", () => {
    const saved = rec({ id: "gb-42", gelbooruId: "42" });
    const feed = item({
      id: "gb-42",
      url: "https://cdn.example/file.jpg",
      gelbooruId: "42",
    });
    expect(findMatchingFavorite(feed, [saved])?.id).toBe("gb-42");
  });
});

describe("favoriteRecordToListItem", () => {
  it("drops blob URLs so lists keep a remote Gelbooru file", () => {
    expect(
      favoriteRecordToListItem(
        rec({ id: "gb-1", gelbooruId: "1", remoteUrl: "blob:http://local/x" }),
      ),
    ).toBeNull();
    expect(
      favoriteRecordToListItem(
        rec({
          id: "gb-1",
          gelbooruId: "1",
          remoteUrl: "https://cdn.example/file.jpg",
        }),
      ),
    ).toMatchObject({
      id: "gb-1",
      source: "gelbooru",
      url: "https://cdn.example/file.jpg",
    });
  });
});

describe("splitMediaTags", () => {
  it("splits space-separated booru tags", () => {
    expect(splitMediaTags("  1girl  hu_tao ")).toEqual(["1girl", "hu_tao"]);
    expect(splitMediaTags("")).toEqual([]);
  });
});
