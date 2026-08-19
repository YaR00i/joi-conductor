import { describe, expect, it } from "vitest";
import type { FavoriteTasteProfile } from "./favoriteTagTaste";
import {
  buildTastePassportView,
  favoritesTasteLoopCtas,
  formatLikesCountRu,
  likesWordRu,
  shopDynTagDescRu,
  shopFavoritesShelfEmptyHintRu,
  shopFavoritesShelfEmptyRu,
  shopOfferFromLikesRu,
  shopTasteLoopCtas,
  tasteChipRu,
} from "./tasteLoopDisplay";

function profile(
  partial: Partial<FavoriteTasteProfile> = {},
): FavoriteTasteProfile {
  return {
    liked: [],
    disliked: [],
    prefsSeed: {},
    sampleSize: 0,
    ...partial,
  };
}

describe("likesWordRu / formatLikesCountRu", () => {
  it("plurals for 0,1,2,5,21,22,25", () => {
    expect(likesWordRu(0)).toBe("лайков");
    expect(likesWordRu(1)).toBe("лайк");
    expect(likesWordRu(2)).toBe("лайка");
    expect(likesWordRu(4)).toBe("лайка");
    expect(likesWordRu(5)).toBe("лайков");
    expect(likesWordRu(11)).toBe("лайков");
    expect(likesWordRu(21)).toBe("лайк");
    expect(likesWordRu(22)).toBe("лайка");
    expect(likesWordRu(25)).toBe("лайков");
    expect(formatLikesCountRu(3)).toBe("3 лайка");
  });
});

describe("shop offer copy", () => {
  it("builds from-likes badge and dyn_tag description", () => {
    expect(shopOfferFromLikesRu(1)).toBe("из 1 лайка");
    expect(shopOfferFromLikesRu(2)).toBe("из 2 лайков");
    expect(shopOfferFromLikesRu(7)).toBe("из 7 лайков");
    expect(shopOfferFromLikesRu(21)).toBe("из 21 лайка");
    expect(shopDynTagDescRu("feet", 3)).toBe('Тег «feet» · из 3 лайков.');
  });

  it("empty shelf messaging points to session likes", () => {
    expect(shopFavoritesShelfEmptyRu().length).toBeGreaterThan(0);
    expect(shopFavoritesShelfEmptyHintRu().toLowerCase()).toContain("сесси");
  });
});

describe("buildTastePassportView", () => {
  it("empty profile explains the loop", () => {
    const view = buildTastePassportView(profile());
    expect(view.hasTaste).toBe(false);
    expect(view.likeCount).toBe(0);
    expect(view.topTags).toEqual([]);
    expect(view.explanationRu.toLowerCase()).toMatch(/лайк/);
  });

  it("shows top tags and like count when taste exists", () => {
    const view = buildTastePassportView(
      profile({
        sampleSize: 12,
        liked: [
          { tag: "feet", count: 5 },
          { tag: "soles", count: 3 },
          { tag: "bondage", count: 2 },
        ],
      }),
      { topN: 2 },
    );
    expect(view.hasTaste).toBe(true);
    expect(view.likeCount).toBe(12);
    expect(view.topTags).toEqual([
      { tag: "feet", label: "feet", count: 5 },
      { tag: "soles", label: "soles", count: 3 },
    ]);
    expect(view.explanationRu).toContain("12 лайков");
  });

  it("likes without taste tags stay hasTaste=false", () => {
    const view = buildTastePassportView(profile({ sampleSize: 4, liked: [] }));
    expect(view.hasTaste).toBe(false);
    expect(view.likeCount).toBe(4);
  });
});

describe("cross CTAs", () => {
  it("favorites empty → session first", () => {
    const ctas = favoritesTasteLoopCtas({ likeCount: 0, hasTasteTags: false });
    expect(ctas[0]?.id).toBe("session");
    expect(ctas.some((c) => c.id === "shop")).toBe(false);
  });

  it("favorites with taste → shop + ghost session", () => {
    const ctas = favoritesTasteLoopCtas({ likeCount: 5, hasTasteTags: true });
    expect(ctas.map((c) => c.id)).toEqual(["shop", "session"]);
    expect(ctas[0]?.labelRu.toLowerCase()).toContain("магазин");
  });

  it("shop empty without likes → session", () => {
    const ctas = shopTasteLoopCtas({ shelfEmpty: true, likeCount: 0 });
    expect(ctas[0]?.id).toBe("session");
  });

  it("shop empty with likes → favorites", () => {
    const ctas = shopTasteLoopCtas({ shelfEmpty: true, likeCount: 3 });
    expect(ctas[0]?.id).toBe("favorites");
  });

  it("shop populated → soft favorites link", () => {
    const ctas = shopTasteLoopCtas({ shelfEmpty: false, likeCount: 8 });
    expect(ctas).toEqual([
      { id: "favorites", labelRu: "К избранному", ghost: true },
    ]);
  });
});

describe("tasteChipRu", () => {
  it("null when empty, chip when likes exist", () => {
    expect(tasteChipRu(0)).toBeNull();
    expect(tasteChipRu(9)).toBe("вкус: 9 лайков");
  });
});
