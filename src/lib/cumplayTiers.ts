import { cumplayOptions } from "./catalog";
import { filterCumplaysForFinish } from "./finishCumplayCompat";
import {
  filterByEnabled,
  loadRouletteSettings,
  type RouletteSettings,
} from "./rouletteSettings";

export type CumplayTier = "normal" | "heavy";

export type CumplayTierStepId = "cumplay" | "cumplay_heavy";

export type CumplayTierOption = {
  id: string;
  labelRu: string;
  weight?: number;
  color?: string;
  payload?: Record<string, unknown>;
};

export type CumplayTierStep = {
  id: CumplayTierStepId;
  titleRu: string;
  speakEn: string;
  options: CumplayTierOption[];
};

const COLORS = [
  "#c45c26",
  "#2fbf6a",
  "#3d7ea6",
  "#e6b422",
  "#e04545",
  "#8b5cf6",
  "#0d9488",
  "#db2777",
  "#64748b",
];

function colorAt(i: number): string {
  return COLORS[i % COLORS.length]!;
}

/** Soft / show / light CEI */
const NORMAL_IDS = new Set([
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
  "ruin_inspect",
]);

/** Hard swallow / messy / prolonged */
const HEAVY_IDS = new Set([
  "swallow",
  "snowball_solo",
  "on_food_eat",
  "on_drink",
  "lick_toy",
  "tongue_hold",
  "chew",
  "spit_catch",
  "rub_gums",
]);

export const CUMPLAY_TIER_STEP_IDS: CumplayTierStepId[] = [
  "cumplay",
  "cumplay_heavy",
];

export function isCumplayTierStepId(id: string): id is CumplayTierStepId {
  return (CUMPLAY_TIER_STEP_IDS as string[]).includes(id);
}

function enabledCumplays(settings: RouletteSettings) {
  return filterByEnabled(
    cumplayOptions,
    settings,
    "cumplay",
    (c) => c.enabled,
  );
}

export function buildCumplayTierStep(
  tier: CumplayTier,
  settings: RouletteSettings = loadRouletteSettings(),
  finishId?: string,
): CumplayTierStep {
  const enabled = finishId
    ? filterCumplaysForFinish(enabledCumplays(settings), finishId)
    : enabledCumplays(settings);
  const pool =
    tier === "normal"
      ? enabled.filter((c) => NORMAL_IDS.has(c.id))
      : enabled.filter((c) => HEAVY_IDS.has(c.id));

  const options: CumplayTierOption[] = pool.map((c, i) => ({
    id: c.id,
    labelRu: c.nameRu,
    weight: c.id === "none" ? 1.35 : 1,
    color: colorAt(i),
    payload: { cumplayId: c.id, cumplayTier: tier },
  }));

  if (
    tier === "normal" &&
    settings.cumplayEscalate.allowHeavy &&
    options.length > 0
  ) {
    const heavyPool = enabled.filter((c) => HEAVY_IDS.has(c.id));
    if (heavyPool.length > 0) {
      options.push({
        id: "escalate_cumplay",
        labelRu: "→ Тяжёлые",
        weight: settings.cumplayEscalate.weight,
        color: "#1a1a1a",
        payload: { nextCumplayTier: "heavy" },
      });
    }
  }

  if (options.length === 0) {
    options.push({
      id: "none",
      labelRu: "Без cumplay",
      weight: 1,
      color: colorAt(0),
      payload: { cumplayId: "none", cumplayTier: tier },
    });
  }

  return {
    id: tier === "normal" ? "cumplay" : "cumplay_heavy",
    titleRu: tier === "normal" ? "Cumplay · обычные" : "Cumplay · тяжёлые",
    speakEn:
      tier === "normal"
        ? "Soft play… or escalate to the heavy mess?"
        : "Heavy cumplay. No mercy.",
    options,
  };
}

export function resolveCumplayPick(
  picks: Partial<
    Record<string, { id?: string; payload?: Record<string, unknown>; labelRu?: string }>
  >,
): { id: string; labelRu: string } | null {
  for (const stepId of [...CUMPLAY_TIER_STEP_IDS].reverse()) {
    const p = picks[stepId];
    if (!p) continue;
    const fromPayload = p.payload?.cumplayId;
    if (typeof fromPayload === "string" && fromPayload !== "escalate_cumplay") {
      return { id: fromPayload, labelRu: p.labelRu ?? fromPayload };
    }
    if (p.id && p.id !== "escalate_cumplay" && !p.payload?.nextCumplayTier) {
      return { id: p.id, labelRu: p.labelRu ?? p.id };
    }
  }
  return null;
}
