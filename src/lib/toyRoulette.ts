/**
 * Toy count + per-slot toy pick wheels for plan roulette.
 * Count range from mood band: easy 0–1, medium 0–2, hard 0–3 —
 * raised to mode must-have minimum (anal ≥1 dildo, chastity ≥ cage+vibe).
 * Pool is filtered by spun mode so orphan toys (e.g. dildo on prone) never land.
 */
import type { SessionMode, SessionMood, ToyDef } from "./types";
import { tagMoodBand, type TagMoodBand } from "./tagRoulette";
import { filterToysForMode } from "./toyModeAffinity";
import {
  groupLabelRu,
  modeToyCountBounds,
  pickToysForMode,
  requiredGroupForToySlot,
  toyMatchesReqGroup,
  type ToyReqGroup,
} from "./modeToyRules";

type ToyRouletteOption = {
  id: string;
  labelRu: string;
  weight?: number;
  color?: string;
  payload?: Record<string, unknown>;
  unlocked?: boolean;
};

type ToyRouletteStep = {
  id: "toys_count" | "toys_1" | "toys_2" | "toys_3";
  titleRu: string;
  speakEn: string;
  options: ToyRouletteOption[];
};

export type ToyDifficulty = "easy" | "medium" | "hard";

export function toyDifficultyFromMood(mood: SessionMood): ToyDifficulty {
  const band: TagMoodBand = tagMoodBand(mood);
  switch (band) {
    case "good":
      return "easy";
    case "normal":
      return "medium";
    case "bad":
      return "hard";
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

export function toyCountMax(diff: ToyDifficulty): number {
  switch (diff) {
    case "easy":
      return 1;
    case "medium":
      return 2;
    case "hard":
      return 3;
    default: {
      const _exhaustive: never = diff;
      return _exhaustive;
    }
  }
}

const COUNT_COLORS = ["#64748b", "#2fbf6a", "#e6b422", "#e04545"];

export function buildToysCountStep(
  mood: SessionMood,
  opts: {
    mode?: SessionMode;
    toys?: ToyDef[];
  } = {},
): ToyRouletteStep {
  const diff = toyDifficultyFromMood(mood);
  const moodMax = toyCountMax(diff);
  const mode = opts.mode;
  const owned = opts.toys?.filter((t) => t.owned) ?? [];
  const useful =
    mode && opts.toys ? filterToysForMode(owned, mode) : owned;

  const bounds = mode
    ? modeToyCountBounds(mode, useful, moodMax)
    : {
        min: 0,
        max: Math.min(moodMax, useful.length),
        allowZero: true,
        forceZero: useful.length === 0,
        mustGroups: [] as ToyReqGroup[],
      };

  const noToyMode = bounds.forceZero || useful.length === 0;
  const min = noToyMode ? 0 : bounds.min;
  const max = noToyMode ? 0 : bounds.max;
  const diffRu =
    diff === "easy" ? "лёгкий" : diff === "hard" ? "сложный" : "средний";
  const options: ToyRouletteOption[] = [];
  for (let n = min; n <= max; n++) {
    const atFloor = n === min && min > 0;
    options.push({
      id: `toys_n_${n}`,
      labelRu:
        n === 0
          ? "Без игрушек"
          : atFloor
            ? `${n} ${ruToys(n)} · минимум`
            : `${n} ${ruToys(n)}`,
      weight: atFloor ? 1.15 : 1,
      color: COUNT_COLORS[n] ?? COUNT_COLORS[0]!,
      unlocked: true,
      payload: {
        toysCount: n,
        toyDifficulty: diff,
        toysMin: min,
        mustGroups: bounds.mustGroups,
      },
    });
  }
  if (options.length === 0) {
    options.push({
      id: "toys_n_0",
      labelRu: "Без игрушек",
      weight: 1,
      color: COUNT_COLORS[0]!,
      unlocked: true,
      payload: { toysCount: 0, toyDifficulty: diff, modeNoToys: true },
    });
  }

  const mustRu =
    bounds.mustGroups.length > 0
      ? bounds.mustGroups.map(groupLabelRu).join(" + ")
      : "";
  return {
    id: "toys_count",
    titleRu: noToyMode
      ? "Игрушки · режим без toys"
      : min > 0
        ? `Игрушки · от ${min} (${diffRu}${mustRu ? ` · ${mustRu}` : ""})`
        : `Игрушки · сколько (${diffRu})`,
    speakEn: noToyMode
      ? "This mode doesn't need toys. Zero."
      : min > 0
        ? `At least ${min}. No empty loadout.`
        : diff === "hard"
          ? "How many toys ruin you tonight? Up to three…"
          : diff === "easy"
            ? "Toys… zero or one. Be grateful."
            : "Zero, one, or two toys. Spin.",
    options,
  };
}

export function buildPlaceholderToysCountStep(): ToyRouletteStep {
  return {
    id: "toys_count",
    titleRu: "Игрушки · сколько",
    speakEn: "Toy count after mood…",
    options: [
      {
        id: "toys_count_pending",
        labelRu: "После настроения…",
        weight: 1,
        color: "#3a3a3a",
        unlocked: false,
        payload: { toysCount: 0, pending: true },
      },
    ],
  };
}

const TOY_COLORS = [
  "#c45c26",
  "#8b5cf6",
  "#0d9488",
  "#db2777",
  "#e6b422",
  "#3d7ea6",
];

/** One wheel to pick a single owned/allowed toy useful for the session mode. */
export function buildToyPickStep(
  slot: 1 | 2 | 3,
  toys: ToyDef[],
  excludeIds: string[],
  allowedToyIds?: string[],
  mode?: SessionMode,
): ToyRouletteStep {
  const exclude = new Set(excludeIds);
  let pool = toys.filter((t) => {
    if (!t.owned) return false;
    if (exclude.has(t.id)) return false;
    if (
      allowedToyIds &&
      allowedToyIds.length > 0 &&
      !isNoneToyAllowList(allowedToyIds)
    ) {
      return allowedToyIds.includes(t.id);
    }
    return true;
  });
  if (mode) {
    pool = filterToysForMode(pool, mode);
  }

  const requireGroup: ToyReqGroup | null = mode
    ? requiredGroupForToySlot(mode, slot, excludeIds, toys, pool)
    : null;

  let focused = pool;
  if (requireGroup) {
    const matched = pool.filter((t) => toyMatchesReqGroup(t, requireGroup));
    if (matched.length > 0) focused = matched;
  }

  const options: ToyRouletteOption[] = focused.map((t, i) => ({
    id: t.id,
    labelRu: t.nameRu,
    weight: 1,
    color: TOY_COLORS[i % TOY_COLORS.length]!,
    unlocked: true,
    payload: {
      toyId: t.id,
      toySlot: slot,
      requireGroup: requireGroup ?? undefined,
    },
  }));

  if (options.length === 0) {
    options.push({
      id: `toys_${slot}_empty`,
      labelRu: mode
        ? "Нет игрушек для этого режима"
        : "Нет доступных игрушек",
      weight: 1,
      color: "#3a3a3a",
      unlocked: false,
      payload: { toyId: null, toySlot: slot, empty: true },
    });
  }

  const stepId =
    slot === 1 ? "toys_1" : slot === 2 ? "toys_2" : "toys_3";

  const groupRu = requireGroup ? groupLabelRu(requireGroup) : null;

  return {
    id: stepId,
    titleRu: groupRu
      ? `Игрушка ${slot} · ${groupRu}`
      : `Игрушка ${slot}`,
    speakEn: groupRu
      ? `Toy ${slot}: ${groupRu}.`
      : `Toy number ${slot}. What goes on you?`,
    options,
  };
}

export function isToyPickStepId(
  id: string,
): id is "toys_1" | "toys_2" | "toys_3" {
  return id === "toys_1" || id === "toys_2" || id === "toys_3";
}

function ruToys(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "игрушка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "игрушки";
  }
  return "игрушек";
}

export { ruToys };

const NONE_TOY_SENTINEL = "__none__";

/** Plan wheel: unrestricted inventory (empty allow-list = all owned). */
export const PLAN_TOY_COUNT_INVENTORY = -1;

export function isNoneToyAllowList(allowed?: string[] | null): boolean {
  return Boolean(
    allowed &&
      allowed.length > 0 &&
      allowed.every((id) => id === NONE_TOY_SENTINEL),
  );
}

/** Empty allow = all owned; `__none__` = none; else explicit ids. */
export function isToyAllowedInSession(
  toyId: string,
  allowedToyIds?: string[] | null,
): boolean {
  if (!allowedToyIds || allowedToyIds.length === 0) return true;
  if (isNoneToyAllowList(allowedToyIds)) return false;
  return allowedToyIds.includes(toyId);
}

/**
 * Pool for Plan toy-count drum: owned ∩ allowed ∩ mode-useful.
 * Empty allowed (= all owned) or __none__ → all owned useful for mode.
 * `poolIds` (snapshot) wins when provided so Plan picks don't shrink the pool.
 */
export function resolvePlanToyPool(
  toys: ToyDef[],
  mode: SessionMode,
  allowedToyIds?: string[],
  poolIds?: string[] | null,
): ToyDef[] {
  const owned = toys.filter((t) => t.owned);
  let base: ToyDef[];
  if (poolIds && poolIds.length > 0) {
    const set = new Set(poolIds);
    base = owned.filter((t) => set.has(t.id));
  } else if (!allowedToyIds || allowedToyIds.length === 0) {
    base = owned;
  } else if (isNoneToyAllowList(allowedToyIds)) {
    base = owned;
  } else {
    const set = new Set(allowedToyIds);
    base = owned.filter((t) => set.has(t.id));
  }
  return filterToysForMode(base, mode);
}

/**
 * Drum value from allowedToyIds:
 * `-1` = unrestricted (empty allow → all owned, mid-session equip ok)
 * `0` = explicit none (`__none__`)
 * `1…max` = picked count
 */
export function planToyCountFromAllowed(
  allowedToyIds?: string[],
  max = 3,
): number {
  if (!allowedToyIds || allowedToyIds.length === 0) {
    return PLAN_TOY_COUNT_INVENTORY;
  }
  if (isNoneToyAllowList(allowedToyIds)) return 0;
  return Math.min(
    max,
    allowedToyIds.filter((id) => id !== NONE_TOY_SENTINEL).length,
  );
}

/** Pick up to `count` distinct toys from pool (stable shuffle). */
export function pickPlanToys(
  pool: ToyDef[],
  count: number,
  rng: () => number = Math.random,
  mode?: SessionMode,
): string[] {
  if (mode) return pickToysForMode(mode, pool, count, rng);
  const n = Math.max(0, Math.min(count, pool.length, 3));
  if (n === 0) return [];
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }
  return shuffled.slice(0, n).map((t) => t.id);
}

/** Write Plan count → SessionParams.allowedToyIds. */
export function applyPlanToyCount(
  count: number,
  pool: ToyDef[],
  rng: () => number = Math.random,
  mode?: SessionMode,
): string[] {
  if (mode) {
    const useful = filterToysForMode(pool, mode);
    const bounds = modeToyCountBounds(mode, useful, 3);
    if (bounds.forceZero) return [NONE_TOY_SENTINEL];
    if (count < 0) {
      // «Из инвентаря» — unrestricted, unless mode forces zero.
      return [];
    }
    let n = Math.max(0, Math.min(3, count));
    if (!bounds.allowZero) n = Math.max(n, bounds.min);
    if (n <= 0) return [NONE_TOY_SENTINEL];
    const picked = pickPlanToys(useful, n, rng, mode);
    return picked.length > 0 ? picked : [NONE_TOY_SENTINEL];
  }
  if (count < 0) return [];
  const n = Math.max(0, Math.min(3, count));
  if (n <= 0) return [NONE_TOY_SENTINEL];
  const picked = pickPlanToys(pool, n, rng);
  return picked.length > 0 ? picked : [NONE_TOY_SENTINEL];
}

export function planToyCountLabelRu(n: number): string {
  if (n < 0) return "Из инвентаря";
  if (n <= 0) return "Без игрушек";
  return `${n} ${ruToys(n)}`;
}
