import { describe, expect, it } from "vitest";
import { SPARKLE_PACK } from "./mistress/packs";
import { listMistressPresets } from "./presets";
import {
  SPARKLE_MOOD_AVATAR,
  SPARKLE_MOOD_PORTRAIT,
} from "./sparkleArt";

describe("sparkle assets", () => {
  it("uses square PNG thumbs that swap Искорка / Искра by mood", () => {
    expect(SPARKLE_PACK.assets.moodPortrait).toEqual(SPARKLE_MOOD_PORTRAIT);
    expect(SPARKLE_MOOD_PORTRAIT.sweet.labelRu).toBe("Искорка");
    expect(SPARKLE_MOOD_PORTRAIT.cruel.labelRu).toBe("Искра");
    expect(SPARKLE_MOOD_AVATAR.chaotic).toContain("/sparkle/mood/full/chaotic.png");
    expect(SPARKLE_PACK.assets.shopAvatar).toContain("/sparkle/shop-avatar.png");
  });
});

describe("sparkle presets", () => {
  it("includes Безумие among her taste chips", () => {
    const ids = listMistressPresets("sparkle").map((p) => p.id);
    expect(ids).toContain("madness");
    expect(ids).toContain("anal_locked");
  });
});
