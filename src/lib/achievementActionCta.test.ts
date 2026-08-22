import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_DEFS } from "./achievements";
import { achievementActionCta } from "./achievementActionCta";

describe("achievementActionCta", () => {
  it("maps every catalog id without throwing", () => {
    for (const def of ACHIEVEMENT_DEFS) {
      const cta = achievementActionCta(def.id);
      expect(cta.labelRu.length).toBeGreaterThan(0);
      expect(["roulette", "session", "shop", "contracts", "minigames"]).toContain(cta.nav);
    }
  });

  it("routes cinders to shop and quests to contracts", () => {
    expect(achievementActionCta("cinders").nav).toBe("shop");
    expect(achievementActionCta("quests").nav).toBe("contracts");
    expect(achievementActionCta("edges").nav).toBe("roulette");
  });
});
