import { describe, expect, it } from "vitest";
import {
  buildMistressMediaQuery,
  SECONDARY_BOORU_DEFS,
} from "./secondaryCache";

describe("secondaryCache honesty", () => {
  it("labels bias packs without fake host promises", () => {
    for (const id of Object.keys(SECONDARY_BOORU_DEFS) as Array<
      keyof typeof SECONDARY_BOORU_DEFS
    >) {
      const def = SECONDARY_BOORU_DEFS[id];
      expect(def.biasLabelRu.toLowerCase()).toContain("gelbooru");
      expect(def.biasLabelRu.toLowerCase()).not.toContain("скоро");
      expect(def.biasLabelRu).not.toMatch(/\.booru/i);
      expect(def.gelbooruBiasTags.length).toBeGreaterThan(0);
    }
  });

  it("merges enabled Gelbooru bias tags into the query", () => {
    const q = buildMistressMediaQuery({
      primaryDefaultTags: "1girl",
      focusTags: ["solo"],
      secondaryBooruIds: ["censored", "blacked"],
      enabledSecondary: ["censored"],
    });
    expect(q).toContain("1girl");
    expect(q).toContain("solo");
    expect(q).toContain("censored");
    expect(q).not.toContain("interracial");
  });
});
