import type { AchievementId } from "./achievements";

/** Nav targets used by achievement detail CTAs (subset of SideNav). */
export type AchievementActionNav =
  | "roulette"
  | "session"
  | "shop"
  | "contracts"
  | "minigames";

export type AchievementActionCta = {
  nav: AchievementActionNav;
  labelRu: string;
};

/**
 * Suggest a next action for an achievement that still has room to grow.
 * Exhaustive over AchievementId so new defs force a mapping.
 */
export function achievementActionCta(
  id: AchievementId,
): AchievementActionCta {
  switch (id) {
    case "cinders":
      return { nav: "shop", labelRu: "Открыть магазин" };
    case "cage":
    case "denial":
    case "quests":
      return { nav: "contracts", labelRu: "Открыть контракты" };
    case "sessions":
    case "time":
    case "marathon":
    case "edges":
    case "holds":
    case "ruins":
    case "breath":
    case "ladders":
    case "countdowns":
    case "dice":
    case "tease":
    case "unauthorized":
    case "mode_stroke":
    case "mode_anal":
    case "mode_onahole":
    case "mode_prone":
    case "strokes":
    case "anal":
    case "tide":
    case "vibe":
    case "toys":
    case "cbt":
    case "oral":
    case "finale_cum":
    case "finale_ruin":
    case "finale_deny":
    case "cumplay":
    case "ate_cum":
    case "smear":
    case "girl_hu_tao":
    case "girl_furina":
    case "girl_sunna":
    case "girl_sparkle":
    case "harem":
    case "prompts":
    case "dares":
    case "promises":
      return { nav: "roulette", labelRu: "Открыть рулетку" };
    case "runner_boss":
    case "runner_wins":
    case "runner_clean":
    case "runner_crowd":
    case "puzzle_clears":
    case "memory_clears":
    case "farm_rounds":
    case "doodle_climbs":
      return { nav: "minigames", labelRu: "Открыть мини-игры" };
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}
