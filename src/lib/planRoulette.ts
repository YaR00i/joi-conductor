import {
  isModeUnlocked,
  isMoodUnlocked,
  type ContentUnlockLists,
} from "./contentUnlocks";
import { finishOptions } from "./catalog";
import { coerceCumplayForFinish } from "./finishCumplayCompat";
import {
  buildCharacterStep,
  buildMediaTypeStep,
  composeContentQuery,
} from "./contentRoulette";
import { buildCumplayTierStep, resolveCumplayPick } from "./cumplayTiers";
import type { ContentMediaTypeId } from "./contentCatalog";
import { loadMediaSettings, type MediaKind } from "./media";
import { modeWeightMultiplier } from "./mistress/playBias";
import { mistressAllowsCumFinale } from "./mistress/playBias";
import {
  clampFinaleOddsForMistress,
  enforceRouletteFloors,
} from "./mistress/rouletteBias";
import { getActiveMistress } from "./mistress";
import { isModeAllowedForMistress } from "./mistress/mistressUnlocks";
import { scoreFromMood, moodFromScore, isHarshMood } from "./moodEngine";
import { filterOptionsByLiveMode, readLiveWearGate } from "./sessionLiveGates";
import { loadControlState } from "./soul/control/store";
import {
  DEFAULT_BOORU_RATING,
  type BooruRatingId,
} from "./booruRating";
import type { BooruSiteId } from "./booruSites";
import {
  countBandFromOption,
  filterByEnabled,
  isStepEnabled,
  loadRouletteSettings,
  resolveParamPool,
  rollCountInBand,
  type EditableParamGroup,
  type ParamPoolOption,
  type RouletteSettings,
  type RouletteStepId,
} from "./rouletteSettings";
import {
  buildPlaceholderTagStep,
} from "./tagRoulette";
import {
  buildPlaceholderToysCountStep,
  isToyPickStepId,
} from "./toyRoulette";
import { filterToysForMode, sanitizeSessionToyIdsForMode } from "./toyModeAffinity";
import { coerceAllowedToyIdsForMode } from "./modeToyRules";
import { toys as catalogToys } from "./catalog";
import {
  DEFAULT_PARAMS,
  type SessionMode,
  type SessionMood,
  type SessionParams,
  type ToyDef,
} from "./types";

const EMPTY_UNLOCKS: ContentUnlockLists = {
  fetishIds: [],
  characterIds: [],
  mediaTypeIds: [],
  modeIds: [],
  moodIds: [],
  unlockedTags: [],
};

export type { RouletteStepId };

export type RouletteOption = {
  id: string;
  labelRu: string;
  /** Relative weight (default 1) */
  weight?: number;
  color?: string;
  /** Extra payload for applying the result */
  payload?: Record<string, unknown>;
  /** false = shown inactive, cannot land on spin */
  unlocked?: boolean;
};

export type RouletteStepDef = {
  id: RouletteStepId;
  titleRu: string;
  speakEn: string;
  options: RouletteOption[];
};

export type PlanRouletteResult = {
  mood: SessionMood;
  moodScore: number;
  params: SessionParams;
  seed: number;
  tags: string;
  tagsLabelRu: string;
  /** Preferred media kinds after fetch; empty = all */
  mediaKinds: MediaKind[];
  mediaTypeId: ContentMediaTypeId;
  /** Toys chosen by roulette; use "__none__" gate when empty after a count roll. */
  sessionToyIds: string[];
  /** True when toys_count wheel ran (even if 0). */
  toysResolved: boolean;
  /** Human summary of each spin */
  summary: { stepId: RouletteStepId; labelRu: string }[];
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
];

function colorAt(i: number): string {
  return COLORS[i % COLORS.length]!;
}

function payloadForParam(
  group: EditableParamGroup,
  opt: ParamPoolOption,
): Record<string, unknown> | undefined {
  switch (group) {
    case "duration":
      return { sec: opt.sec ?? Number(opt.id) };
    case "edges":
    case "ruins": {
      const { lo, hi } = countBandFromOption(opt);
      return { nMin: lo, nMax: hi, n: lo === hi ? lo : undefined };
    }
    case "bpm":
      return {
        bpmMin: opt.bpmMin ?? 60,
        bpmMax: opt.bpmMax ?? 120,
      };
    case "finaleOdds":
      return {
        pCum: opt.pCum ?? 0.5,
        pRuin: opt.pRuin ?? 0.25,
      };
    case "mood":
    case "mode":
      return undefined;
    default: {
      const _exhaustive: never = group;
      return _exhaustive;
    }
  }
}

function optionsFromPool(
  group: EditableParamGroup,
  settings: RouletteSettings,
  unlocks: ContentUnlockLists,
): RouletteOption[] {
  const pool = resolveParamPool(group, settings);
  const live = group === "mode" ? readLiveWearGate() : null;
  let currentMoodId: string | null = null;
  if (group === "mood") {
    try {
      currentMoodId = moodFromScore(
        loadControlState(getActiveMistress().id).moodScore,
      );
    } catch {
      currentMoodId = null;
    }
  }
  const mapped: RouletteOption[] = pool.map((opt, i) => {
    let unlocked = true;
    if (group === "mood") {
      unlocked = isMoodUnlocked(opt.id as SessionMood, unlocks);
    } else if (group === "mode") {
      unlocked =
        isModeUnlocked(opt.id as SessionMode, unlocks) &&
        isModeAllowedForMistress(opt.id, getActiveMistress().id);
    }
    let weight = (opt.weight ?? 1) * (group === "mode" ? modeWeightMultiplier(opt.id) : 1);
    if (group === "mood" && currentMoodId) {
      if (opt.id === currentMoodId) weight *= 2.2;
      else if (
        isHarshMood(currentMoodId as SessionMood) &&
        (opt.id === "cruel" || opt.id === "chaotic")
      ) {
        weight *= 1.35;
      }
    }
    return {
      id: opt.id,
      labelRu: unlocked ? opt.labelRu : `${opt.labelRu} · закрыто`,
      weight,
      color: unlocked ? colorAt(i) : "#3a3a3a",
      payload: payloadForParam(group, opt),
      unlocked,
    };
  });
  const enabled = filterByEnabled(mapped, settings, group);
  if (group === "mode" && live) {
    return filterOptionsByLiveMode(enabled, live);
  }
  return enabled;
}

/** Ordered spins Hu Tao runs when she decides the session. */
export function buildPlanRouletteSteps(
  settings: RouletteSettings = loadRouletteSettings(),
  unlocks: ContentUnlockLists = EMPTY_UNLOCKS,
  /** Used when the finish step is off — filter cumplay by this destination. */
  draftFinishId?: string,
): RouletteStepDef[] {
  const finishes = filterByEnabled(
    finishOptions,
    settings,
    "finish",
    (f) => f.enabled,
  ).map((f, i) => ({
    id: f.id,
    labelRu: f.nameRu,
    weight: 1,
    color: colorAt(i),
    unlocked: true,
  }));

  const finishStepOn =
    isStepEnabled(settings, "finish") && finishes.length > 0;
  // Until finish lands, keep a broad pool; if finish is skipped, filter now.
  const cumplayFinishFilter = finishStepOn ? undefined : draftFinishId;

  const all: RouletteStepDef[] = [
    {
      id: "mood",
      titleRu: "Настроение Госпожи",
      speakEn: "First — who am I tonight?",
      options: optionsFromPool("mood", settings, unlocks),
    },
    {
      id: "mode",
      titleRu: "Режим",
      speakEn: "How do you serve me?",
      options: optionsFromPool("mode", settings, unlocks),
    },
    {
      id: "duration",
      titleRu: "Длительность",
      speakEn: "How long do I keep you?",
      options: optionsFromPool("duration", settings, unlocks),
    },
    {
      id: "edges",
      titleRu: "Эджи",
      speakEn: "How many edges before the end?",
      options: optionsFromPool("edges", settings, unlocks),
    },
    {
      id: "ruins",
      titleRu: "Руины mid",
      speakEn: "Any ruined orgasms mid-session?",
      options: optionsFromPool("ruins", settings, unlocks),
    },
    // Finale odds are NOT spun here — surprise wheel at session-end countdown.
    {
      id: "finish",
      titleRu: "Куда кончить",
      speakEn: "Where does the mess go?",
      options: finishes,
    },
    // Cumplay pool rebuilt after «Куда кончить» lands (finish-filtered).
    buildCumplayTierStep(
      "normal",
      settings,
      cumplayFinishFilter,
    ) as RouletteStepDef,
    {
      id: "bpm",
      titleRu: "Темп",
      speakEn: "How fast do you stroke for me?",
      options: optionsFromPool("bpm", settings, unlocks),
    },
    // Rebuilt after mood lands (favorites / dislike mix).
    buildPlaceholderTagStep() as RouletteStepDef,
    buildCharacterStep(settings, unlocks) as RouletteStepDef,
    buildMediaTypeStep(settings, unlocks) as RouletteStepDef,
    // Rebuilt after mood lands (easy/medium/hard count range).
    buildPlaceholderToysCountStep() as RouletteStepDef,
  ];

  return all.filter((step) => {
    if (!isStepEnabled(settings, step.id)) return false;
    return step.options.length > 0;
  });
}

export function pickWeightedOption(
  options: RouletteOption[],
  rng: () => number = Math.random,
): RouletteOption {
  const spinable = options.filter((o) => o.unlocked !== false);
  const pool = spinable.length > 0 ? spinable : options;
  const weights = pool.map((o) => Math.max(0.01, o.weight ?? 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}

/** Build final session draft from ordered spin results. */
export function applyRoulettePicks(
  picks: Partial<Record<RouletteStepId, RouletteOption>>,
  base: SessionParams = DEFAULT_PARAMS,
  rng: () => number = Math.random,
  inventoryToys: ToyDef[] = catalogToys,
  content?: { site?: BooruSiteId; rating?: BooruRatingId },
): PlanRouletteResult {
  const mood =
    (picks.mood?.id as SessionMood) ||
    getActiveMistress().moodLines.defaultMood ||
    "sweet";
  const moodScore = scoreFromMood(mood);

  let params: SessionParams = { ...base };

  const mode = (picks.mode?.id as SessionMode) || params.mode;
  params = { ...params, mode };

  const dur = picks.duration?.payload?.sec;
  if (typeof dur === "number") params = { ...params, durationSec: dur };

  const edgesLo = picks.edges?.payload?.nMin;
  const edgesHi = picks.edges?.payload?.nMax;
  const edgesFixed = picks.edges?.payload?.n;
  if (typeof edgesLo === "number" && typeof edgesHi === "number") {
    params = {
      ...params,
      edgesTarget: rollCountInBand(edgesLo, edgesHi, rng),
    };
  } else if (typeof edgesFixed === "number") {
    params = { ...params, edgesTarget: edgesFixed };
  }

  const ruinsLo = picks.ruins?.payload?.nMin;
  const ruinsHi = picks.ruins?.payload?.nMax;
  const ruinsFixed = picks.ruins?.payload?.n;
  if (typeof ruinsLo === "number" && typeof ruinsHi === "number") {
    params = {
      ...params,
      ruinsTarget: rollCountInBand(ruinsLo, ruinsHi, rng),
    };
  } else if (typeof ruinsFixed === "number") {
    params = { ...params, ruinsTarget: ruinsFixed };
  }

  // pCum / pRuin stay on defaults until the end-session finale wheel resolves them.

  if (picks.finish?.id) params = { ...params, finishId: picks.finish.id };

  const cumPick = resolveCumplayPick(picks);
  if (cumPick) {
    params = {
      ...params,
      cumplayId: coerceCumplayForFinish(cumPick.id, params.finishId),
    };
  } else {
    params = {
      ...params,
      cumplayId: coerceCumplayForFinish(params.cumplayId, params.finishId),
    };
  }

  const bpmMin = picks.bpm?.payload?.bpmMin;
  const bpmMax = picks.bpm?.payload?.bpmMax;
  if (typeof bpmMin === "number" && typeof bpmMax === "number") {
    params = { ...params, bpmMin, bpmMax };
  }

  // Harsh moods add edges only — finale bias waits for the end wheel.
  if (mood === "cruel" || mood === "chaotic") {
    params = {
      ...params,
      edgesTarget: params.edgesTarget + 1,
    };
  }

  const floors = enforceRouletteFloors({
    durationSec: params.durationSec,
    edgesTarget: params.edgesTarget,
    ruinsTarget: params.ruinsTarget,
  });
  params = {
    ...params,
    durationSec: floors.durationSec,
    edgesTarget: floors.edgesTarget,
    ruinsTarget: floors.ruinsTarget,
  };

  const media = loadMediaSettings();
  const composed = composeContentQuery(
    picks,
    content?.site ?? media.booruSite,
    content?.rating ?? media.rating ?? DEFAULT_BOORU_RATING,
  );

  const toysResolved = picks.toys_count != null;
  const rawToyIds: string[] = [];
  for (const id of ["toys_1", "toys_2", "toys_3"] as const) {
    const opt = picks[id];
    if (!opt || !isToyPickStepId(id)) continue;
    const toyId = opt.payload?.toyId;
    if (typeof toyId === "string" && toyId.length > 0) {
      rawToyIds.push(toyId);
    }
  }
  // Drop toys that have no functions in the spun mode; fill must-haves if needed.
  const sanitized = sanitizeSessionToyIdsForMode(
    rawToyIds,
    mode,
    inventoryToys,
  );
  const usefulOwned = filterToysForMode(
    inventoryToys.filter((t) => t.owned),
    mode,
  );
  // Empty spin → explicit none (not unrestricted inventory).
  const seedAllow =
    sanitized.length === 0 ? (["__none__"] as string[]) : sanitized;
  const sessionToyIds = toysResolved
    ? coerceAllowedToyIdsForMode(
        seedAllow,
        mode,
        usefulOwned,
        inventoryToys,
        rng,
      )
    : sanitized;
  if (toysResolved) {
    params = { ...params, allowedToyIds: sessionToyIds };
  }

  const seed = Math.floor(rng() * 1_000_000);
  const order = (Object.keys(picks) as RouletteStepId[]).filter(
    (id) => id !== "mood",
  );
  const preferred: RouletteStepId[] = [
    "mode",
    "duration",
    "edges",
    "ruins",
    "finish",
    "cumplay",
    "cumplay_heavy",
    "bpm",
    "tags",
    "tags_medium",
    "tags_hard",
    "tags_sadistic",
    "character",
    "media_type",
    "toys_count",
    "toys_1",
    "toys_2",
    "toys_3",
  ];
  const summary: { stepId: RouletteStepId; labelRu: string }[] = [];
  for (const stepId of preferred) {
    if (stepId === "finaleOdds") continue;
    const opt = picks[stepId];
    if (!opt) continue;
    summary.push({ stepId, labelRu: opt.labelRu });
  }
  for (const stepId of order) {
    if (preferred.includes(stepId)) continue;
    const opt = picks[stepId];
    if (!opt) continue;
    summary.push({ stepId, labelRu: opt.labelRu });
  }

  return {
    mood,
    moodScore,
    params,
    seed,
    tags: composed.tags,
    tagsLabelRu: composed.tagsLabelRu,
    mediaKinds: composed.mediaKinds,
    mediaTypeId: composed.mediaTypeId,
    sessionToyIds,
    toysResolved,
    summary,
  };
}

/**
 * Resolve finale chance weights when the end wheel starts — never during the
 * opening plan roulette (keeps the outcome a surprise).
 */
export function resolveSessionFinaleOdds(
  mood: SessionMood,
  rng: () => number = Math.random,
  settings: RouletteSettings = loadRouletteSettings(),
  mode?: SessionMode,
  /** Live session odds (beg / softer / finale bias) — blended, not wiped. */
  sessionBias?: { pCum: number; pRuin: number },
): { pCum: number; pRuin: number } {
  const options = optionsFromPool("finaleOdds", settings, EMPTY_UNLOCKS);
  let pCum = DEFAULT_PARAMS.pCum;
  let pRuin = DEFAULT_PARAMS.pRuin;
  if (options.length > 0) {
    const pick = pickWeightedOption(options, rng);
    const rawCum = pick.payload?.pCum;
    const rawRuin = pick.payload?.pRuin;
    if (typeof rawCum === "number") pCum = rawCum;
    if (typeof rawRuin === "number") pRuin = rawRuin;
  }
  // Keep mid-session mercy / beg / finale_want_* instead of full replace
  if (sessionBias) {
    pCum = sessionBias.pCum * 0.6 + pCum * 0.4;
    pRuin = sessionBias.pRuin * 0.6 + pRuin * 0.4;
  }
  if (mood === "cruel" || mood === "chaotic") {
    pCum = Math.max(0, pCum - 0.08);
  } else if (mood === "sweet") {
    pCum = Math.min(0.85, pCum + 0.12);
    pRuin = Math.max(0.08, pRuin - 0.04);
  } else if (mood === "calm") {
    pCum = Math.min(0.8, pCum + 0.04);
  }
  // Sparkle: no cum finale outside anal/chastity
  if (mode && !mistressAllowsCumFinale(mode)) {
    pCum = 0;
  }
  return clampFinaleOddsForMistress({ pCum, pRuin });
}
