import { describe, expect, it } from "vitest";
import {
  favoriteMatchesKindFilter,
  favoriteMatchesTagFilter,
  favoriteMediaKind,
  filterFavoriteMetadata,
  type FavoriteMetadata,
} from "./mediaFavorites";

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
