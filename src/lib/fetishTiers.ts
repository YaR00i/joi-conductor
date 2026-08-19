import {
  canEscalateFetishTo,
  loadRouletteSettings,
  resolvedFetishesForTier,
  type RouletteSettings,
} from "./rouletteSettings";
import {
  isFetishUnlocked,
  type ContentUnlockLists,
} from "./contentUnlocks";
import type { FetishTier } from "./fetishCatalog";

export type { FetishEntry, FetishTier } from "./fetishCatalog";
export {
  FETISH_HARD,
  FETISH_LIGHT,
  FETISH_MEDIUM,
  FETISH_SADISTIC,
} from "./fetishCatalog";

export type FetishTagStepId =
  | "tags"
  | "tags_medium"
  | "tags_hard"
  | "tags_sadistic";

export type FetishTierOption = {
  id: string;
  labelRu: string;
  weight?: number;
  color?: string;
  payload?: Record<string, unknown>;
  unlocked?: boolean;
};

export type FetishTierStep = {
  id: FetishTagStepId;
  titleRu: string;
  speakEn: string;
  options: FetishTierOption[];
};

const EMPTY_UNLOCKS: ContentUnlockLists = {
  fetishIds: [],
  characterIds: [],
  mediaTypeIds: [],
  modeIds: [],
  moodIds: [],
  unlockedTags: [],
};

export const FETISH_TIER_META: Record<
  FetishTier,
  { titleRu: string; speakEn: string; stepId: FetishTagStepId }
> = {
  light: {
    titleRu: "Фетиши · лёгкие",
    speakEn: "Soft start — pretty things… or do we go deeper?",
    stepId: "tags",
  },
  medium: {
    titleRu: "Фетиши · средние",
    speakEn: "Getting warmer. Act or escalate?",
    stepId: "tags_medium",
  },
  hard: {
    titleRu: "Фетиши · тяжёлые",
    speakEn: "Specific. Sweaty. Not the pretty default.",
    stepId: "tags_hard",
  },
  sadistic: {
    titleRu: "Фетиши · садистские",
    speakEn: "Clothed tease, dirt, denial… my kind of cruelty.",
    stepId: "tags_sadistic",
  },
};

export const FETISH_TAG_STEP_IDS: FetishTagStepId[] = [
  "tags",
  "tags_medium",
  "tags_hard",
  "tags_sadistic",
];

const NEXT_TIER: Partial<Record<FetishTier, FetishTier>> = {
  light: "medium",
  medium: "hard",
  hard: "sadistic",
};

const ESCALATE_LABEL: Record<Exclude<FetishTier, "sadistic">, string> = {
  light: "→ Средние",
  medium: "→ Тяжёлые",
  hard: "→ Садистские",
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
  "#f59e0b",
];

function colorAt(i: number): string {
  return COLORS[i % COLORS.length]!;
}

export function isFetishTagStepId(id: string): id is FetishTagStepId {
  return (FETISH_TAG_STEP_IDS as string[]).includes(id);
}

export function nextFetishTier(tier: FetishTier): FetishTier | null {
  return NEXT_TIER[tier] ?? null;
}

export function tierFromTagStepId(id: FetishTagStepId): FetishTier {
  switch (id) {
    case "tags":
      return "light";
    case "tags_medium":
      return "medium";
    case "tags_hard":
      return "hard";
    case "tags_sadistic":
      return "sadistic";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

/** Build one fetish wheel for a tier (≤15+ slices including escalate). */
export function buildFetishTierStep(
  tier: FetishTier,
  settings: RouletteSettings = loadRouletteSettings(),
  unlocks: ContentUnlockLists = EMPTY_UNLOCKS,
): FetishTierStep {
  const meta = FETISH_TIER_META[tier];
  const pool = resolvedFetishesForTier(tier, settings);
  const options: FetishTierOption[] = pool.map((f, i) => {
    const unlocked = isFetishUnlocked(f.id, unlocks);
    return {
      id: f.id,
      labelRu: unlocked ? f.labelRu : `${f.labelRu} · закрыто`,
      weight: f.weight ?? 1,
      color: unlocked ? colorAt(i) : "#3a3a3a",
      payload: { tags: f.tags, preferKey: f.id, fetishTier: tier },
      unlocked,
    };
  });

  const next = nextFetishTier(tier);
  const nextHasUnlocked =
    next != null &&
    resolvedFetishesForTier(next, settings).some((f) =>
      isFetishUnlocked(f.id, unlocks),
    );
  if (
    next &&
    nextHasUnlocked &&
    canEscalateFetishTo(settings, next) &&
    options.some((o) => o.unlocked !== false)
  ) {
    options.push({
      id: `escalate_${tier}`,
      labelRu: ESCALATE_LABEL[tier as Exclude<FetishTier, "sadistic">],
      weight: settings.fetishEscalate.weight,
      color: "#1a1a1a",
      payload: { nextTier: next, fetishTier: tier },
      unlocked: true,
    });
  }

  // Safety: never return an empty wheel
  if (options.length === 0) {
    options.push({
      id: `fallback_${tier}`,
      labelRu: "Фетиш (fallback)",
      weight: 1,
      color: colorAt(0),
      payload: {
        tags: "looking_at_viewer",
        preferKey: `fallback_${tier}`,
        fetishTier: tier,
      },
      unlocked: true,
    });
  }

  return {
    id: meta.stepId,
    titleRu: meta.titleRu,
    speakEn: meta.speakEn,
    options,
  };
}

/** Resolve final tags pick from multi-tier rolls (deepest concrete tags wins). */
export function resolveFetishTagPick(
  picks: Partial<
    Record<string, { payload?: Record<string, unknown>; labelRu?: string }>
  >,
): { payload?: Record<string, unknown>; labelRu?: string } | null {
  for (const id of [...FETISH_TAG_STEP_IDS].reverse()) {
    const p = picks[id];
    const tags = p?.payload?.tags;
    if (p && typeof tags === "string" && tags.trim()) {
      return p;
    }
  }
  return null;
}
