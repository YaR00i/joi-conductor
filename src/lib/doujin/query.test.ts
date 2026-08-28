import { describe, expect, it } from "vitest";
import {
  appendSearchPrefix,
  buildRecommendPlans,
  buildRecommendSearchQuery,
  pickRecommendPlan,
  buildSearchQuery,
  nameToNhentaiSlug,
  normalizeSearchQuery,
  parseExactTagLookup,
  parseGalleryCode,
  recsPlanAndWindow,
  recsSearchApiPage,
  recsWindowPageCount,
  rankTagIds,
  rankTagIdStats,
  replaceLastSearchToken,
  stripBlockedTokens,
  suggestTagsForSearchQuery,
  tagToQueryTerm,
  tasteWeight,
  toggleLibrarySortTag,
  toggleLovedTag,
  moveLibrarySortTag,
  sortFavoriteIds,
  orderFavoriteCatalogIds,
  buildFavoriteSortUniverse,
  withBlacklistNegatives,
  withCategory,
} from "./query";
import { DEFAULT_BLOCKLIST } from "./safety";

describe("stripBlockedTokens", () => {
  it("removes a typed blocked tag the user typed in", () => {
    const result = stripBlockedTokens("tag:child big breasts", DEFAULT_BLOCKLIST);
    expect(result.stripped).toContain("child");
    expect(result.query).toContain("breasts");
    expect(result.query.toLowerCase()).not.toContain("child");
  });
});

describe("withBlacklistNegatives", () => {
  it("appends negatives for each blacklist tag", () => {
    const q = withBlacklistNegatives("artist:foo", ["lolicon", "shota"]);
    expect(q).toContain("artist:foo");
    expect(q).toContain("-lolicon");
    expect(q).toContain("-shota");
  });

  it("quotes multi-word negatives", () => {
    expect(withBlacklistNegatives("", ["big breasts"])).toBe('-"big breasts"');
  });
});

describe("buildSearchQuery", () => {
  it("adds language and blacklist negatives", () => {
    const built = buildSearchQuery({
      userQuery: "parody:genshin",
      language: "english",
      blacklist: ["lolicon", "femdom"],
    });
    expect(built.query).toContain('parody:"genshin"');
    expect(built.query).toContain("language:english");
    expect(built.query).toContain("-lolicon");
    expect(built.query).toContain("-femdom");
    expect(built.stripped).toEqual([]);
  });

  it("adds category, pages and popularity tokens", () => {
    const built = buildSearchQuery({
      userQuery: "artist:foo",
      language: "all",
      category: "doujinshi",
      pagesBand: "mid",
      minFavorites: "100",
      blacklist: [],
    });
    expect(built.query).toContain('artist:"foo"');
    expect(built.query).toContain("category:doujinshi");
    expect(built.query).toContain("pages:>=20");
    expect(built.query).toContain("pages:<80");
    expect(built.query).toContain("favorites:>=100");
  });

  it("reports stripped blocked tokens from the user query", () => {
    const built = buildSearchQuery({
      userQuery: "child",
      language: "all",
      blacklist: DEFAULT_BLOCKLIST,
    });
    expect(built.stripped).toContain("child");
    expect(built.query).toContain("-child");
    expect(built.query.split(/\s+/).includes("child")).toBe(false);
  });

  it("rewrites artist slugs before sending the search query", () => {
    const built = buildSearchQuery({
      userQuery: 'artist:"mokuyama-hito"',
      language: "all",
      blacklist: [],
    });
    expect(built.query).toContain('artist:"mokuyama hito"');
    expect(built.query).not.toContain("mokuyama-hito");
  });
});

describe("buildRecommendSearchQuery", () => {
  it("picks the two most frequent taste tags", () => {
    const q = buildRecommendSearchQuery(
      [
        { type: "parody", name: "genshin impact" },
        { type: "parody", name: "genshin impact" },
        { type: "tag", name: "sole female" },
        { type: "language", name: "english" },
      ],
      ["lolicon"],
    );
    expect(q).toBeTruthy();
    expect(q).toContain("parody:");
    expect(q).toContain("genshin");
    expect(q).toContain("-lolicon");
  });

  it("returns null when nothing usable is left", () => {
    expect(
      buildRecommendSearchQuery(
        [{ type: "tag", name: "child" }],
        DEFAULT_BLOCKLIST,
      ),
    ).toBeNull();
  });

  it("boosts a starred tag over a more frequent sample tag", () => {
    const q = buildRecommendSearchQuery(
      [
        { type: "parody", name: "genshin impact", count: 8 },
        { type: "tag", name: "sole female", count: 3 },
      ],
      [],
      [{ type: "tag", name: "sole female" }],
    );
    expect(q).toContain("sole female");
    expect(q).toContain("genshin");
  });

  it("can pick a loved tag that was missing from the sample", () => {
    const q = buildRecommendSearchQuery(
      [{ type: "parody", name: "genshin impact", count: 2 }],
      [],
      [{ type: "artist", name: "muk" }],
    );
    expect(q).toContain("artist:");
    expect(q).toContain("muk");
  });
});

describe("recommend plans", () => {
  it("prefers specific+mood pairings and mixes more than the top two tags", () => {
    const plans = buildRecommendPlans(
      [
        { type: "parody", name: "genshin impact", count: 4 },
        { type: "parody", name: "honkai star rail", count: 3 },
        { type: "character", name: "hu tao", count: 3 },
        { type: "tag", name: "sole female", count: 9 },
        { type: "tag", name: "glasses", count: 8 },
        { type: "artist", name: "muk", count: 2 },
      ],
      [],
    );
    const labels = plans.map((p) => p.label);
    expect(labels.some((label) => label.includes("genshin impact"))).toBe(true);
    expect(labels).toContain("hu tao + sole female");
    expect(labels).toContain("muk + genshin impact");
    expect(labels.some((label) => label.includes("glasses"))).toBe(true);
    expect(labels.some((label) => label.includes("honkai star rail"))).toBe(
      true,
    );
    expect(plans.length).toBeGreaterThan(4);
  });

  it("walks every pairing before repeating, then reshuffles", () => {
    const plans = buildRecommendPlans(
      [
        { type: "parody", name: "genshin impact", count: 4 },
        { type: "character", name: "hu tao", count: 3 },
        { type: "tag", name: "sole female", count: 9 },
        { type: "tag", name: "glasses", count: 8 },
        { type: "artist", name: "muk", count: 2 },
      ],
      [],
    );
    const firstPass = new Set<string>();
    for (let t = 0; t < plans.length; t++) {
      const label = pickRecommendPlan(plans, t)?.label;
      expect(label).toBeTruthy();
      expect(firstPass.has(label!)).toBe(false);
      firstPass.add(label!);
    }
    expect(firstPass.size).toBe(plans.length);
    expect(pickRecommendPlan(plans, 0)?.label).toBe(
      pickRecommendPlan(plans, 0)?.label,
    );
    expect(pickRecommendPlan(plans, plans.length)?.query).toBeTruthy();
  });
});

describe("recs window", () => {
  it("maps UI pages onto a 3-page search window", () => {
    expect(recsSearchApiPage(0, 1)).toBe(1);
    expect(recsSearchApiPage(0, 3)).toBe(3);
    expect(recsSearchApiPage(1, 1)).toBe(4);
    expect(recsWindowPageCount(10, 0)).toBe(3);
    expect(recsWindowPageCount(2, 0)).toBe(2);
    expect(recsWindowPageCount(10, 3)).toBe(1);
    expect(recsWindowPageCount(5, 2)).toBe(0);
  });

  it("keeps pairing Obновить on API page 1 when several plans exist", () => {
    expect(recsPlanAndWindow(2, 4)).toEqual({ planTick: 2, windowTick: 0 });
    expect(recsPlanAndWindow(2, 1)).toEqual({ planTick: 0, windowTick: 2 });
    expect(recsSearchApiPage(recsPlanAndWindow(2, 4).windowTick, 1)).toBe(1);
    expect(recsSearchApiPage(recsPlanAndWindow(2, 1).windowTick, 1)).toBe(7);
  });
});

describe("tagToQueryTerm", () => {
  it("quotes artist names so slugs cannot split on hyphen", () => {
    expect(
      tagToQueryTerm({ id: 1, type: "artist", name: "mokuyama hito" }),
    ).toBe('artist:"mokuyama hito"');
  });
});

describe("withCategory", () => {
  it("appends category token", () => {
    expect(withCategory("tag:glasses", "manga")).toBe("tag:glasses category:manga");
  });
});

describe("parseGalleryCode", () => {
  it("reads a 6-digit code, hash, g-path and nhentai url", () => {
    expect(parseGalleryCode("675882")).toBe(675882);
    expect(parseGalleryCode("  #675882  ")).toBe(675882);
    expect(parseGalleryCode("g/675882/")).toBe(675882);
    expect(parseGalleryCode("id:675882")).toBe(675882);
    expect(parseGalleryCode("https://nhentai.net/g/675882")).toBe(675882);
    expect(parseGalleryCode("https://nhentai.net/g/675882/1/")).toBe(675882);
  });

  it("does not steal years or mixed tag queries", () => {
    expect(parseGalleryCode("2024")).toBeNull();
    expect(parseGalleryCode("675882 tag:glasses")).toBeNull();
    expect(parseGalleryCode("tag:675882")).toBeNull();
  });
});

describe("normalizeSearchQuery", () => {
  it("turns artist URL slugs into an exact quoted name", () => {
    expect(normalizeSearchQuery('artist:"mokuyama-hito"')).toBe(
      'artist:"mokuyama hito"',
    );
    expect(normalizeSearchQuery("artist:mokuyama-hito")).toBe(
      'artist:"mokuyama hito"',
    );
    expect(
      normalizeSearchQuery("https://nhentai.net/artist/mokuyama-hito/"),
    ).toBe('artist:"mokuyama hito"');
  });

  it("keeps non-h hyphenated and does not rewrite pages", () => {
    expect(normalizeSearchQuery("category:non-h")).toBe('category:"non-h"');
    expect(normalizeSearchQuery("pages:>=20")).toBe("pages:>=20");
  });
});

describe("parseExactTagLookup", () => {
  it("treats a lone artist token or artist URL as the site tag page", () => {
    expect(parseExactTagLookup("artist:muk")).toEqual({
      type: "artist",
      name: "muk",
      slug: "muk",
    });
    expect(parseExactTagLookup('artist:"muk"')).toEqual({
      type: "artist",
      name: "muk",
      slug: "muk",
    });
    expect(parseExactTagLookup("https://nhentai.net/artist/muk/")).toEqual({
      type: "artist",
      name: "muk",
      slug: "muk",
    });
    expect(nameToNhentaiSlug("mokuyama hito")).toBe("mokuyama-hito");
    expect(parseExactTagLookup("artist:mokuyama-hito")).toEqual({
      type: "artist",
      name: "mokuyama hito",
      slug: "mokuyama-hito",
    });
  });

  it("does not steal mixed queries, negatives or pages", () => {
    expect(parseExactTagLookup("artist:muk tag:glasses")).toBeNull();
    expect(parseExactTagLookup("-artist:muk")).toBeNull();
    expect(parseExactTagLookup("pages:>=20")).toBeNull();
    expect(parseExactTagLookup("675882")).toBeNull();
  });
});

describe("appendSearchPrefix", () => {
  it("inserts a typed prefix into the query", () => {
    expect(appendSearchPrefix("foo", "artist:")).toBe("foo artist:");
    expect(appendSearchPrefix("", 'title:""')).toBe('title:""');
  });
});

describe("rankTagIds", () => {
  it("counts each id once per gallery and sorts by frequency", () => {
    expect(
      rankTagIds([
        [10, 20, 10],
        [20, 30],
        [20],
      ]),
    ).toEqual([20, 10, 30]);
    expect(
      rankTagIdStats([
        [10, 20, 10],
        [20, 30],
        [20],
      ]),
    ).toEqual([
      { id: 20, count: 3 },
      { id: 10, count: 1 },
      { id: 30, count: 1 },
    ]);
  });
});

describe("toggleLovedTag", () => {
  it("stars and unstars by type:name and caps the list", () => {
    const once = toggleLovedTag([], { type: "parody", name: "Genshin Impact" });
    expect(once).toEqual([{ type: "parody", name: "genshin impact" }]);
    expect(toggleLovedTag(once, { type: "parody", name: "genshin impact" })).toEqual(
      [],
    );
    expect(tasteWeight(4, false)).toBe(4);
    expect(tasteWeight(4, true)).toBe(4 * 5 + 15);
  });
});

describe("library sort tags", () => {
  it("pins a tag to the front and removes it on the second click", () => {
    const once = toggleLibrarySortTag([], {
      type: "group",
      name: "Circle Nine",
      id: 9,
    });
    expect(once).toEqual([{ type: "group", name: "circle nine", id: 9 }]);
    const twice = toggleLibrarySortTag(once, {
      type: "tag",
      name: "glasses",
      id: 2,
    });
    expect(twice.map((tag) => tag.name)).toEqual(["glasses", "circle nine"]);
    expect(toggleLibrarySortTag(twice, { type: "tag", name: "glasses" })).toEqual(
      [{ type: "group", name: "circle nine", id: 9 }],
    );
  });

  it("reorders and ranks favorites by earlier sort tags first", () => {
    const tags = [
      { type: "tag" as const, name: "a", id: 1 },
      { type: "tag" as const, name: "b", id: 2 },
    ];
    expect(moveLibrarySortTag(tags, 1, 0).map((tag) => tag.id)).toEqual([2, 1]);
    expect(
      sortFavoriteIds(
        [
          { id: 10, tagIds: [2] },
          { id: 11, tagIds: [1, 2] },
          { id: 12, tagIds: [9] },
        ],
        tags,
      ),
    ).toEqual([11, 10, 12]);
  });

  it("matches an artist by id or by named tags on the card", () => {
    const artist = { type: "artist" as const, name: "muk", id: 77 };
    expect(
      sortFavoriteIds(
        [
          { id: 1, tagIds: [3] },
          { id: 2, tagIds: [77] },
          {
            id: 3,
            tagIds: [],
            tags: [{ type: "artist", name: "Muk" }],
          },
        ],
        [artist],
      ),
    ).toEqual([2, 3, 1]);
  });

  it("can drop non-matching favorites so page counts follow the filter", () => {
    expect(
      sortFavoriteIds(
        [
          { id: 1, tagIds: [3] },
          { id: 2, tagIds: [77] },
          { id: 3, tagIds: [77] },
        ],
        [{ type: "artist", name: "muk", id: 77 }],
        { matchesOnly: true },
      ),
    ).toEqual([2, 3]);
  });

  it("lifts matching ledger galleries that are not in the recent snapshot", () => {
    const ordered = sortFavoriteIds(
      buildFavoriteSortUniverse(
        [
          { id: 1, tagIds: [8] },
          { id: 2, tagIds: [8] },
        ],
        [
          { id: 9, tagIds: [77] },
          { id: 1, tagIds: [8] },
          { id: 2, tagIds: [77] },
        ],
      ),
      [{ type: "artist", name: "muk", id: 77 }],
    );
    expect(ordered.slice(0, 2)).toEqual([2, 9]);
  });

  it("filters tag matches then ranks by catalog order, not match score", () => {
    expect(
      orderFavoriteCatalogIds(
        [
          { id: 1, tagIds: [3], ord: 0, uploadedAt: 900 },
          { id: 2, tagIds: [77], ord: 1, uploadedAt: 100 },
          { id: 3, tagIds: [77], ord: 2, uploadedAt: 400 },
        ],
        [{ type: "artist", name: "muk", id: 77 }],
        "uploaded",
      ),
    ).toEqual([3, 2]);
  });

  it("orders the unsifted catalog by favorites recency by default", () => {
    expect(
      orderFavoriteCatalogIds([
        { id: 9, tagIds: [], ord: 2 },
        { id: 1, tagIds: [], ord: 0 },
        { id: 4, tagIds: [], ord: 1 },
      ]),
    ).toEqual([1, 4, 9]);
  });
});

describe("suggestTagsForSearchQuery", () => {
  const tags = [
    { type: "parody" as const, name: "genshin impact", count: 9 },
    { type: "artist" as const, name: "mokuyama hito", count: 4 },
    { type: "tag" as const, name: "glasses", count: 12 },
  ];

  it("matches the last token and stays quiet after a space", () => {
    expect(suggestTagsForSearchQuery(tags, "glasses ")).toEqual([]);
    expect(
      suggestTagsForSearchQuery(tags, "language:english mok").map(
        (tag) => tag.name,
      ),
    ).toEqual(["mokuyama hito"]);
  });

  it("narrows by typed prefix", () => {
    expect(
      suggestTagsForSearchQuery(tags, "artist:moku").map((tag) => tag.name),
    ).toEqual(["mokuyama hito"]);
    expect(suggestTagsForSearchQuery(tags, "parody:moku")).toEqual([]);
    expect(suggestTagsForSearchQuery(tags, "pages:20")).toEqual([]);
  });

  it("replaces only the last token", () => {
    expect(
      replaceLastSearchToken("language:english mok", 'artist:"mokuyama hito"'),
    ).toBe('language:english artist:"mokuyama hito" ');
  });
});
