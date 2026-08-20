import { describe, expect, it } from "vitest";
import { filterMediaByKinds, inferMediaKind, type MediaItem } from "./media";
import {
  applyMediaTypeQuery,
  isMediaTypeFilterId,
  kindsForMediaType,
} from "./mediaTypeFilter";

function item(
  partial: Pick<MediaItem, "id" | "kind"> & Partial<MediaItem>,
): MediaItem {
  return {
    url: `https://example.test/${partial.id}`,
    source: "gelbooru",
    ...partial,
  };
}

describe("isMediaTypeFilterId", () => {
  it("accepts the roulette catalog ids", () => {
    expect(isMediaTypeFilterId("photo")).toBe(true);
    expect(isMediaTypeFilterId("gifs")).toBe(true);
    expect(isMediaTypeFilterId("video")).toBe(true);
    expect(isMediaTypeFilterId("photo_gifs")).toBe(true);
    expect(isMediaTypeFilterId("all")).toBe(true);
    expect(isMediaTypeFilterId("image")).toBe(false);
  });
});

describe("applyMediaTypeQuery", () => {
  it("adds photo excludes without duplicating user tags", () => {
    expect(applyMediaTypeQuery("rating:explicit 1girl", "photo")).toBe(
      "rating:explicit 1girl -animated -video",
    );
  });

  it("replaces leftover media meta from a previous spin", () => {
    expect(
      applyMediaTypeQuery("rating:explicit animated -video", "photo"),
    ).toBe("rating:explicit -animated -video");
  });

  it("requests gifs as animated minus video", () => {
    expect(applyMediaTypeQuery("1girl", "gifs")).toBe("1girl animated -video");
  });

  it("leaves the query alone for all", () => {
    expect(applyMediaTypeQuery("rating:explicit 1girl", "all")).toBe(
      "rating:explicit 1girl",
    );
  });
});

describe("kindsForMediaType", () => {
  it("maps catalog kinds", () => {
    expect(kindsForMediaType("photo")).toEqual(["image"]);
    expect(kindsForMediaType("gifs")).toEqual(["gif"]);
    expect(kindsForMediaType("video")).toEqual(["video"]);
    expect(kindsForMediaType("photo_gifs")).toEqual(["image", "gif"]);
    expect(kindsForMediaType("all")).toEqual([]);
  });
});

describe("inferMediaKind", () => {
  it("uses file extension", () => {
    expect(inferMediaKind("https://x/a.jpg")).toBe("image");
    expect(inferMediaKind("https://x/a.gif")).toBe("gif");
    expect(inferMediaKind("https://x/a.mp4")).toBe("video");
  });

  it("treats animated without video as gif", () => {
    expect(inferMediaKind("https://x/loop.webm", "animated 1girl")).toBe("gif");
    expect(inferMediaKind("https://x/clip.webm", "video animated")).toBe(
      "video",
    );
  });
});

describe("filterMediaByKinds", () => {
  const deck = [
    item({ id: "p", kind: "image" }),
    item({ id: "g", kind: "gif" }),
    item({ id: "v", kind: "video" }),
  ];

  it("keeps photos only", () => {
    expect(filterMediaByKinds(deck, ["image"]).map((i) => i.id)).toEqual(["p"]);
  });

  it("keeps photo + gifs", () => {
    expect(
      filterMediaByKinds(deck, ["image", "gif"]).map((i) => i.id),
    ).toEqual(["p", "g"]);
  });

  it("skips the filter when kinds are empty", () => {
    expect(filterMediaByKinds(deck, []).map((i) => i.id)).toEqual([
      "p",
      "g",
      "v",
    ]);
  });
});
