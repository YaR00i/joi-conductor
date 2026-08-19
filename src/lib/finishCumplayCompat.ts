import type { CumplayDef } from "./types";

/**
 * Cumplay options allowed after a given «Куда кончить» result.
 * Finish-specific acts (food / drink / toy / feet) stay on their finish only.
 */
export const CUMPLAY_BY_FINISH: Record<string, readonly string[]> = {
  hand: [
    "none",
    "hold",
    "hold_then_wipe",
    "smell",
    "smear_lips",
    "smear_chest",
    "smear_nose",
    "kiss_palm",
    "taste",
    "lick_fingers",
    "swallow",
    "tongue_hold",
    "chew",
    "spit_catch",
    "snowball_solo",
    "rub_gums",
    "ruin_inspect",
  ],
  glass: [
    "none",
    "hold",
    "smell",
    "taste",
    "swallow",
    "tongue_hold",
    "chew",
    "spit_catch",
    "snowball_solo",
    "rub_gums",
    "ruin_inspect",
  ],
  /** Into a beverage — parallel to food. */
  drink: ["none", "smell", "on_drink", "ruin_inspect"],
  /** User-facing set for «На еду». */
  food: ["none", "smell", "on_food_eat", "ruin_inspect"],
  feet: ["none", "smell", "feet_lick", "ruin_inspect"],
  face: [
    "none",
    "hold",
    "smell",
    "smear_lips",
    "smear_nose",
    "taste",
    "lick_fingers",
    "ruin_inspect",
  ],
  chest: [
    "none",
    "smear_chest",
    "hold",
    "smell",
    "lick_fingers",
    "ruin_inspect",
  ],
  toy: [
    "none",
    "lick_toy",
    "hold",
    "smell",
    "taste",
    "swallow",
    "ruin_inspect",
  ],
  floor: ["none", "smell", "ruin_inspect"],
};

const FALLBACK_CUMPLAY = "none";

export function cumplayAllowlistForFinish(
  finishId: string,
): ReadonlySet<string> | null {
  const list = CUMPLAY_BY_FINISH[finishId];
  if (!list) return null;
  return new Set(list);
}

export function isCumplayAllowedForFinish(
  cumplayId: string,
  finishId: string,
): boolean {
  const allow = cumplayAllowlistForFinish(finishId);
  if (!allow) return true;
  return allow.has(cumplayId);
}

export function filterCumplaysForFinish(
  items: readonly CumplayDef[],
  finishId: string,
): CumplayDef[] {
  const allow = cumplayAllowlistForFinish(finishId);
  if (!allow) return [...items];
  return items.filter((c) => allow.has(c.id));
}

export function coerceCumplayForFinish(
  cumplayId: string,
  finishId: string,
): string {
  if (isCumplayAllowedForFinish(cumplayId, finishId)) return cumplayId;
  const list = CUMPLAY_BY_FINISH[finishId];
  if (!list || list.length === 0) return cumplayId;
  if (list.includes(FALLBACK_CUMPLAY)) return FALLBACK_CUMPLAY;
  return list[0]!;
}
