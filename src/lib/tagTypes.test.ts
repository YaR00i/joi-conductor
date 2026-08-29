import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../test/localStorageMock";
import { normalizeGelbooruTagIndex } from "./media";
import {
  gelbooruCategoryToTagType,
  gelbooruChipCategory,
  getNativeTagType,
  getTagType,
  groupTagsByType,
  loadTagTypeMap,
  parseGelbooruTagCategory,
  rememberGelbooruNativeTypes,
  setTagType,
  suggestTagType,
} from "./tagTypes";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

describe("parseGelbooruTagCategory", () => {
  it("reads autocomplete labels and dapi numbers", () => {
    expect(parseGelbooruTagCategory("character")).toBe("character");
    expect(parseGelbooruTagCategory("tag")).toBe("general");
    expect(parseGelbooruTagCategory("copyright")).toBe("copyright");
    expect(parseGelbooruTagCategory("artist")).toBe("artist");
    expect(parseGelbooruTagCategory("metadata")).toBe("metadata");
    expect(parseGelbooruTagCategory(4)).toBe("character");
    expect(parseGelbooruTagCategory(0)).toBe("general");
    expect(parseGelbooruTagCategory(1)).toBe("artist");
    expect(parseGelbooruTagCategory(3)).toBe("copyright");
    expect(parseGelbooruTagCategory(5)).toBe("metadata");
    expect(parseGelbooruTagCategory("nope")).toBeNull();
  });
});

describe("getTagType + native Gelbooru groups", () => {
  it("uses site groups before the local heuristic", () => {
    rememberGelbooruNativeTypes([
      { tag: "hu_tao_(genshin_impact)", category: "character" },
      { tag: "wanke", category: "artist" },
      { tag: "genshin_impact", category: "copyright" },
      { tag: "highres", category: "metadata" },
    ]);
    expect(getTagType("hu_tao_(genshin_impact)")).toBe("character");
    expect(getTagType("wanke")).toBe("artist");
    expect(getTagType("genshin_impact")).toBe("lore");
    expect(getTagType("highres")).toBe("meta");
  });

  it("keeps Фавориты as a pin and restores the site department when unpinned", () => {
    rememberGelbooruNativeTypes([
      { tag: "wanke", category: "artist" },
    ]);
    setTagType("wanke", "fetish");
    expect(getTagType("wanke")).toBe("fetish");
    expect(getNativeTagType("wanke")).toBe("artist");
    expect(gelbooruChipCategory("wanke")).toBe("artist");

    setTagType("wanke", "artist");
    expect(getTagType("wanke")).toBe("artist");
  });

  it("returns a new map object after each manual move", () => {
    const first = setTagType("smile", "fetish");
    const second = setTagType("smile", "clothing");
    expect(first).not.toBe(second);
    expect(first).not.toBe(loadTagTypeMap());
    expect(getTagType("smile")).toBe("clothing");
  });

  it("lets a manual override win over the site group", () => {
    rememberGelbooruNativeTypes([
      { tag: "hu_tao_(genshin_impact)", category: "character" },
    ]);
    setTagType("hu_tao_(genshin_impact)", "clothing");
    expect(getTagType("hu_tao_(genshin_impact)")).toBe("clothing");
  });

  it("does not auto-dump acts into Фавориты", () => {
    expect(suggestTagType("bondage")).toBe("action");
    expect(getTagType("bondage")).toBe("action");
  });

  it("splits leftover general tags by token, not substring", () => {
    expect(suggestTagType("blue_bikini")).toBe("clothing");
    expect(suggestTagType("open_jacket")).toBe("clothing");
    expect(suggestTagType("fox_girl")).toBe("appearance");
    expect(suggestTagType("cat_ears")).toBe("appearance");
    expect(suggestTagType("aqua_halo")).toBe("appearance");
    expect(suggestTagType("4girls")).toBe("meta");
    expect(suggestTagType("2koma")).toBe("meta");
    expect(suggestTagType("2015")).toBe("meta");
    expect(suggestTagType("black_background")).toBe("meta");
    expect(suggestTagType("pants_pull")).toBe("action");
    expect(suggestTagType("angry")).toBe("appearance");
    expect(suggestTagType("alley")).toBe("setting");
    expect(suggestTagType("blue_corset")).toBe("clothing");
    expect(suggestTagType("bear_ears")).toBe("appearance");
    expect(suggestTagType("anal_fisting")).toBe("action");
    expect(suggestTagType("twitter_username")).toBe("meta");
    expect(suggestTagType("female_pov")).toBe("meta");
    expect(suggestTagType("sad")).toBe("appearance");
    expect(suggestTagType("public_nudity")).toBe("action");
    expect(suggestTagType("one-eyed")).toBe("appearance");
    expect(suggestTagType("that")).toBe("other");
    expect(suggestTagType("great_ball")).toBe("other");
    expect(suggestTagType("anal_tail")).toBe("other");
    expect(suggestTagType("magical_girl")).toBe("other");
  });

  it("lets general tags keep the local heuristic", () => {
    rememberGelbooruNativeTypes([{ tag: "smile", category: "tag" }]);
    expect(gelbooruCategoryToTagType("general")).toBeNull();
    expect(getTagType("smile")).toBe("appearance");
    expect(gelbooruChipCategory("smile")).toBe("general");
  });

  it("forgets cached Gelbooru groups after storage reset", () => {
    rememberGelbooruNativeTypes([{ tag: "wanke", category: "artist" }]);
    expect(getTagType("wanke")).toBe("artist");
    resetLocalStorage();
    expect(getTagType("wanke")).toBe("other");
  });

  it("groups pinned favorites separately from their site department", () => {
    rememberGelbooruNativeTypes([
      { tag: "wanke", category: "artist" },
      { tag: "hu_tao_(genshin_impact)", category: "character" },
    ]);
    setTagType("wanke", "fetish");
    const groups = groupTagsByType([
      { tag: "wanke" },
      { tag: "hu_tao_(genshin_impact)" },
    ]);
    expect(groups.map((g) => g.type)).toEqual(["fetish", "character"]);
    expect(groups[0]?.items.map((i) => i.tag)).toEqual(["wanke"]);
    expect(groups[1]?.items.map((i) => i.tag)).toEqual([
      "hu_tao_(genshin_impact)",
    ]);
  });
});

describe("normalizeGelbooruTagIndex", () => {
  it("reads a dapi array and a wrapped tag object", () => {
    expect(
      normalizeGelbooruTagIndex([
        { name: "wanke", type: 1 },
        { name: "highres", type: 5 },
      ]),
    ).toEqual([
      { tag: "wanke", category: 1 },
      { tag: "highres", category: 5 },
    ]);
    expect(
      normalizeGelbooruTagIndex({
        tag: { name: "hu_tao_(genshin_impact)", type: 4 },
      }),
    ).toEqual([{ tag: "hu_tao_(genshin_impact)", category: 4 }]);
  });
});
