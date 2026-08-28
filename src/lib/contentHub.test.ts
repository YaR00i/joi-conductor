import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../test/localStorageMock";
import {
  buildGelbooruRecsPlans,
  gelbooruQueryFromFavoriteFilters,
  gelbooruRecsQuery,
  isContentNav,
  isGelbooruRecsTasteTag,
  loadContentHub,
  rememberFavoritesRedirect,
  saveContentHub,
} from "./contentHub";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

describe("contentHub", () => {
  it("defaults to nhentai newest", () => {
    expect(loadContentHub()).toEqual({
      source: "nhentai",
      tab: "newest",
      searchDockOpen: true,
    });
  });

  it("persists source and tab", () => {
    saveContentHub({ source: "gelbooru", tab: "search" });
    expect(loadContentHub()).toEqual({
      source: "gelbooru",
      tab: "search",
      searchDockOpen: true,
    });
  });

  it("ignores junk stored values", () => {
    localStorage.setItem("joi-content-hub-v1", '{"source":"x","tab":"nope"}');
    expect(loadContentHub()).toEqual({
      source: "nhentai",
      tab: "newest",
      searchDockOpen: true,
    });
  });

  it("maps the old favorites nav onto Content", () => {
    expect(isContentNav("favorites")).toBe(true);
    expect(isContentNav("doujin")).toBe(true);
    expect(isContentNav("shop")).toBe(false);
    rememberFavoritesRedirect();
    expect(loadContentHub()).toEqual({
      source: "gelbooru",
      tab: "library",
      searchDockOpen: true,
    });
  });

  it("keeps search dock collapsed across hub patches", () => {
    saveContentHub({ searchDockOpen: false });
    saveContentHub({ tab: "search" });
    expect(loadContentHub()).toMatchObject({
      tab: "search",
      searchDockOpen: false,
    });
  });
});

describe("gelbooruQueryFromFavoriteFilters", () => {
  it("joins chips then search tokens without duplicates", () => {
    expect(
      gelbooruQueryFromFavoriteFilters({
        selectedTags: ["hu_tao", "1girl"],
        search: "hu_tao  genshin_impact",
      }),
    ).toBe("hu_tao 1girl genshin_impact");
  });

  it("returns empty when nothing is selected", () => {
    expect(
      gelbooruQueryFromFavoriteFilters({ selectedTags: [], search: "  " }),
    ).toBe("");
  });
});

describe("gelbooruRecsQuery", () => {
  it("falls back when the shelf has no taste tags", () => {
    expect(gelbooruRecsQuery([], 0)).toBe("rating:explicit");
  });

  it("pairs character/lore with moods instead of walking neighbors", () => {
    const liked = [
      { tag: "hu_tao_(genshin_impact)" },
      { tag: "genshin_impact" },
      { tag: "bondage" },
      { tag: "handjob" },
    ];
    const map = {
      "hu_tao_(genshin_impact)": "character",
      genshin_impact: "lore",
      bondage: "fetish",
      handjob: "fetish",
    } as const;
    const plans = buildGelbooruRecsPlans(liked, { ...map });
    expect(plans.some((p) => p.includes("hu_tao") && p.includes("bondage"))).toBe(
      true,
    );
    expect(
      plans.some((p) => p.includes("genshin_impact") && p.includes("handjob")),
    ).toBe(true);
    expect(plans.length).toBeGreaterThan(4);
  });

  it("walks every pairing before repeating", () => {
    const liked = [
      { tag: "hu_tao_(genshin_impact)" },
      { tag: "genshin_impact" },
    ];
    const map = {
      "hu_tao_(genshin_impact)": "character",
      genshin_impact: "lore",
    } as const;
    const plans = buildGelbooruRecsPlans(liked, { ...map });
    const firstPass = new Set<string>();
    for (let t = 0; t < plans.length; t++) {
      const q = gelbooruRecsQuery(liked, t, "rating:explicit", { ...map });
      expect(firstPass.has(q)).toBe(false);
      firstPass.add(q);
    }
    expect(firstPass.size).toBe(plans.length);
  });

  it("drops meta, appearance, setting, and other from the random pair", () => {
    const liked = [
      { tag: "solo" },
      { tag: "smile" },
      { tag: "bedroom" },
      { tag: "xyzzy" },
      { tag: "bondage" },
      { tag: "genshin_impact" },
    ];
    expect(isGelbooruRecsTasteTag("solo")).toBe(false);
    expect(isGelbooruRecsTasteTag("smile")).toBe(false);
    expect(isGelbooruRecsTasteTag("bedroom")).toBe(false);
    expect(isGelbooruRecsTasteTag("xyzzy")).toBe(false);
    expect(isGelbooruRecsTasteTag("bondage")).toBe(true);
    const plans = buildGelbooruRecsPlans(liked);
    expect(plans.some((p) => p.includes("bondage"))).toBe(true);
    expect(plans.some((p) => p.includes("genshin_impact"))).toBe(true);
    expect(plans.every((p) => !p.includes("solo"))).toBe(true);
  });

  it("respects the user's tag-type map over heuristics", () => {
    const liked = [
      { tag: "hu_tao" },
      { tag: "smile" },
      { tag: "bondage" },
    ];
    const map = {
      hu_tao: "character",
      smile: "appearance",
      bondage: "other",
    } as const;
    expect(gelbooruRecsQuery(liked, 0, "rating:explicit", { ...map })).toBe(
      "hu_tao rating:explicit",
    );
  });

  it("falls back when every liked tag is in an excluded category", () => {
    expect(
      gelbooruRecsQuery(
        [{ tag: "solo" }, { tag: "bedroom" }],
        0,
        "rating:explicit 1girl",
      ),
    ).toBe("rating:explicit 1girl");
  });
});
