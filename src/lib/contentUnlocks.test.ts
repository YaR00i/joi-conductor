import { describe, expect, it } from "vitest";
import {
  BASE_FETISH_IDS,
  BASE_MODE_IDS,
  BASE_MOOD_IDS,
  isCharacterUnlocked,
  isFetishUnlocked,
  isModeUnlocked,
  isMoodUnlocked,
  sanitizeMediaTagsForUnlocks,
  sanitizeModeForUnlocks,
  sanitizeMoodForUnlocks,
  tagPurchaseStatus,
  type ContentUnlockLists,
} from "./contentUnlocks";

function emptyUnlocks(
  over: Partial<ContentUnlockLists> = {},
): ContentUnlockLists {
  return {
    fetishIds: [],
    characterIds: [],
    mediaTypeIds: [],
    modeIds: [],
    moodIds: [],
    unlockedTags: [],
    ...over,
  };
}

describe("content unlock gates", () => {
  it("treats base fetish / mode / mood as unlocked", () => {
    const u = emptyUnlocks();
    expect(isFetishUnlocked(BASE_FETISH_IDS[0]!, u)).toBe(true);
    expect(isModeUnlocked(BASE_MODE_IDS[0]!, u)).toBe(true);
    expect(isMoodUnlocked(BASE_MOOD_IDS[0]!, u)).toBe(true);
    expect(isCharacterUnlocked("girl", u)).toBe(true);
  });

  it("locks non-base fetish / character until listed", () => {
    const u = emptyUnlocks();
    expect(isFetishUnlocked("med_ahegao", u)).toBe(false);
    expect(isCharacterUnlocked("trap", u)).toBe(false);
    expect(
      isFetishUnlocked("med_ahegao", emptyUnlocks({ fetishIds: ["med_ahegao"] })),
    ).toBe(true);
    expect(
      isCharacterUnlocked("trap", emptyUnlocks({ characterIds: ["trap"] })),
    ).toBe(true);
  });
});

describe("sanitizeMediaTagsForUnlocks", () => {
  it("keeps rating / exclude tokens and free unknown tags", () => {
    const r = sanitizeMediaTagsForUnlocks(
      "rating:questionable -comic score:>10",
      emptyUnlocks(),
    );
    expect(r.tags).toContain("rating:questionable");
    expect(r.tags).toContain("-comic");
    expect(r.tags).toContain("score:>10");
    expect(r.replaced).toEqual([]);
  });

  it("replaces locked fetish tags with a base stand-in", () => {
    const r = sanitizeMediaTagsForUnlocks("ahegao breasts", emptyUnlocks());
    expect(r.tags.split(/\s+/)).toContain("breasts");
    expect(r.tags.split(/\s+/)).not.toContain("ahegao");
    expect(r.replaced.some((x) => x.from === "ahegao")).toBe(true);
  });

  it("keeps fetish tags once unlocked", () => {
    const r = sanitizeMediaTagsForUnlocks(
      "ahegao",
      emptyUnlocks({ fetishIds: ["med_ahegao"] }),
    );
    expect(r.tags).toBe("ahegao");
    expect(r.replaced).toEqual([]);
  });

  it("replaces locked character tokens with 1girl", () => {
    const r = sanitizeMediaTagsForUnlocks("futanari", emptyUnlocks());
    expect(r.tags.split(/\s+/)).toContain("1girl");
    expect(r.replaced.some((x) => x.from === "futanari" && x.to === "1girl")).toBe(
      true,
    );
  });

  it("locks pending shop-shelf tags until purchased", () => {
    const locked = tagPurchaseStatus(
      "custom_shelf_tag",
      emptyUnlocks({ pendingShopTags: ["custom_shelf_tag"] }),
    );
    expect(locked).toBe("locked");
    const r = sanitizeMediaTagsForUnlocks(
      "custom_shelf_tag",
      emptyUnlocks({ pendingShopTags: ["custom_shelf_tag"] }),
    );
    expect(r.replaced.length).toBeGreaterThan(0);
    expect(r.tags).not.toContain("custom_shelf_tag");
  });

  it("marks dynamically purchased tags unlocked", () => {
    expect(
      tagPurchaseStatus(
        "custom_shelf_tag",
        emptyUnlocks({ unlockedTags: ["custom_shelf_tag"] }),
      ),
    ).toBe("unlocked");
  });
});

describe("sanitizeModeForUnlocks / sanitizeMoodForUnlocks", () => {
  it("falls back locked mode to stroke", () => {
    expect(sanitizeModeForUnlocks("anal", emptyUnlocks())).toEqual({
      mode: "stroke",
      fixed: true,
    });
    expect(
      sanitizeModeForUnlocks("anal", emptyUnlocks({ modeIds: ["anal"] })),
    ).toEqual({ mode: "anal", fixed: false });
  });

  it("falls back locked mood to sweet", () => {
    expect(sanitizeMoodForUnlocks("cruel", emptyUnlocks())).toEqual({
      mood: "sweet",
      fixed: true,
    });
    expect(
      sanitizeMoodForUnlocks("cruel", emptyUnlocks({ moodIds: ["cruel"] })),
    ).toEqual({ mood: "cruel", fixed: false });
  });

  it("does not fix already-unlocked base values", () => {
    expect(sanitizeModeForUnlocks("stroke", emptyUnlocks()).fixed).toBe(false);
    expect(sanitizeMoodForUnlocks("calm", emptyUnlocks()).fixed).toBe(false);
  });
});
