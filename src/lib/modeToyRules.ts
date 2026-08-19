/**
 * Hard loadout rules per SessionMode for Plan drum + toy roulette.
 * Soft recommendations stay in toyModeAffinity; this module enforces must-haves.
 */
import type { SessionMode, ToyDef } from "./types";
import { MODE_LABELS } from "./labels";
import { getActiveMistress } from "./mistress/activeMistress";

/** Abstract groups a mode may require (matched via id / satisfies / vibe). */
export type ToyReqGroup =
  | "dildo"
  | "chastity_cage"
  /** Wand OR anal vibe (Edge2 / vibe-plug) — cage partner. */
  | "cage_vibe"
  | "wand"
  | "anal_vibe"
  | "plug";

export type ModeToyRules = {
  /** «Без игрушек» / count 0 allowed. */
  allowZero: boolean;
  /** Prone etc.: force empty allow-list sentinel. */
  forceZero: boolean;
  /**
   * Minimum toy picks when inventory can cover must-groups.
   * Clamped down if owned toys can't satisfy every group.
   */
  minCount: number;
  /** Ordered must-have groups for slots 1…N (roulette + plan pick). */
  mustGroups: ToyReqGroup[];
  summaryRu: string;
};

const RULES: Record<SessionMode, ModeToyRules> = {
  stroke: {
    allowZero: true,
    forceZero: false,
    minCount: 0,
    mustGroups: [],
    summaryRu: "игрушки по желанию",
  },
  onahole: {
    allowZero: true,
    forceZero: false,
    minCount: 0,
    mustGroups: [],
    summaryRu: "игрушки по желанию (онахол — руками)",
  },
  anal: {
    allowZero: false,
    forceZero: false,
    minCount: 1,
    mustGroups: ["dildo"],
    summaryRu: "дилдо обязателен; «без игрушек» недоступно",
  },
  oral: {
    allowZero: false,
    forceZero: false,
    minCount: 1,
    mustGroups: ["dildo"],
    summaryRu: "дилдо обязателен для оральных ходов; «без игрушек» недоступно",
  },
  chastity: {
    allowZero: false,
    forceZero: false,
    minCount: 2,
    mustGroups: ["chastity_cage", "cage_vibe"],
    summaryRu:
      "клетка + партнёр (wand/пуля / вибро / пробка / worn-дилдо)",
  },
  cbt: {
    allowZero: true,
    forceZero: false,
    minCount: 0,
    mustGroups: [],
    summaryRu: "игрушки по желанию (дилдо — plapping или worn-grind)",
  },
  prone: {
    allowZero: true,
    forceZero: true,
    minCount: 0,
    mustGroups: [],
    summaryRu: "только бёдра — игрушки выключены",
  },
  plapping: {
    allowZero: false,
    forceZero: false,
    minCount: 2,
    mustGroups: ["chastity_cage", "dildo"],
    summaryRu:
      "клетка + любой дилдо обязательны; оставшиеся слоты — worn-наполненность / vibe",
  },
};

/**
 * Sunna: dildo is always prepared at session start.
 * Hard must in allow-list / wheels for plapping · oral · anal;
 * chastity focuses on wand/bullet (dildo ready but not the mode partner).
 */
export function sunnaModeRequiresDildo(mode: SessionMode): boolean {
  return mode === "plapping" || mode === "oral" || mode === "anal";
}

/**
 * Base mode rules, then Sunna overlay: cage is always required
 * (every legal Sunna mode keeps chastity_cage in must-groups).
 */
export function getModeToyRules(mode: SessionMode): ModeToyRules {
  const base = RULES[mode];
  if (getActiveMistress().id !== "sunna" || base.forceZero) {
    return base;
  }
  let must: ToyReqGroup[] = base.mustGroups.includes("chastity_cage")
    ? [...base.mustGroups]
    : ["chastity_cage", ...base.mustGroups];
  // Plapping / oral / anal: dildo is a hard must-group.
  if (sunnaModeRequiresDildo(mode) && !must.includes("dildo")) {
    must.push("dildo");
  }
  // Chastity under Sunna: partner = wand/bullet (not plug/dildo fill).
  if (mode === "chastity") {
    must = ["chastity_cage", "wand"];
  }
  const minCount = Math.max(base.minCount, Math.min(must.length, 3));
  let sunnaNote = base.summaryRu;
  if (!sunnaNote.includes("Санн")) {
    sunnaNote = `${sunnaNote}; у Санны клетка всегда обязательна`;
  }
  if (mode === "chastity") {
    sunnaNote =
      "клетка + wand/вибропуля (фокус); дилдо готовим заранее, используем по ходу";
  } else if (
    sunnaModeRequiresDildo(mode) &&
    !sunnaNote.includes("дилдо обязат")
  ) {
    sunnaNote = `${sunnaNote}; дилдо обязателен (готовим и используем)`;
  }
  return {
    ...base,
    allowZero: false,
    minCount,
    mustGroups: must,
    summaryRu: sunnaNote,
  };
}

export function toyMatchesReqGroup(toy: ToyDef, group: ToyReqGroup): boolean {
  switch (group) {
    case "dildo":
      return (
        toy.id.startsWith("dildo_") ||
        (toy.satisfies?.includes("dildo") ?? false)
      );
    case "chastity_cage":
      return (
        toy.id === "chastity_cage" ||
        (toy.satisfies?.includes("chastity") ?? false)
      );
    case "wand":
      return (
        toy.id === "wand" || (toy.satisfies?.includes("wand") ?? false)
      );
    case "anal_vibe":
      return (
        toy.id === "lovense_edge2" ||
        toy.id === "vibrating_plug" ||
        (toy.satisfies?.includes("anal_vibe") ?? false) ||
        (toy.satisfies?.includes("prostate_vibe") ?? false)
      );
    case "cage_vibe":
      // Partner for cage: external vibe, anal vibe, or worn anal fill (plug / dildo).
      return (
        toyMatchesReqGroup(toy, "wand") ||
        toyMatchesReqGroup(toy, "anal_vibe") ||
        toyMatchesReqGroup(toy, "plug")
      );
    case "plug":
      return (
        toy.id === "plug" ||
        toy.id === "vibrating_plug" ||
        toy.id.startsWith("dildo_") ||
        (toy.satisfies?.includes("plug") ?? false) ||
        (toy.satisfies?.includes("plug_static") ?? false)
      );
    default: {
      const _exhaustive: never = group;
      return _exhaustive;
    }
  }
}

export function groupLabelRu(group: ToyReqGroup): string {
  switch (group) {
    case "dildo":
      return "дилдо";
    case "chastity_cage":
      return "клетка";
    case "wand":
      return "wand / вибропуля";
    case "anal_vibe":
      return "вибро (пробка / Edge 2)";
    case "cage_vibe":
      return "вибро или worn-наполненность";
    case "plug":
      return "пробка / дилдо (worn)";
    default: {
      const _exhaustive: never = group;
      return _exhaustive;
    }
  }
}

export function toysMatchingGroup(
  toys: ToyDef[],
  group: ToyReqGroup,
): ToyDef[] {
  return toys.filter((t) => toyMatchesReqGroup(t, group));
}

export function groupSatisfiedByIds(
  toyIds: string[],
  group: ToyReqGroup,
  toys: ToyDef[],
): boolean {
  const byId = new Map(toys.map((t) => [t.id, t]));
  return toyIds.some((id) => {
    const toy = byId.get(id);
    return toy ? toyMatchesReqGroup(toy, group) : false;
  });
}

/** Must-groups that have at least one owned (or pool) candidate. */
export function satisfiableMustGroups(
  pool: ToyDef[],
  mustGroups: ToyReqGroup[],
): ToyReqGroup[] {
  return mustGroups.filter((g) => toysMatchingGroup(pool, g).length > 0);
}

export type ModeToyCountBounds = {
  min: number;
  max: number;
  allowZero: boolean;
  forceZero: boolean;
  /** Must-groups still coverable from pool. */
  mustGroups: ToyReqGroup[];
};

/**
 * Count drum / roulette bounds for a mode.
 * `pool` should already be owned ∩ mode-useful (caller filters).
 * Mood max is raised to `min` so must-haves can actually be spun.
 */
export function modeToyCountBounds(
  mode: SessionMode,
  pool: ToyDef[],
  moodMax: number,
): ModeToyCountBounds {
  const rules = getModeToyRules(mode);

  if (rules.forceZero || pool.length === 0) {
    return {
      min: 0,
      max: 0,
      allowZero: true,
      forceZero: true,
      mustGroups: [],
    };
  }

  const must = satisfiableMustGroups(pool, rules.mustGroups);
  let min = 0;
  if (!rules.allowZero && must.length > 0) {
    min = must.length;
    if (must.length === rules.mustGroups.length) {
      min = Math.max(min, rules.minCount);
    }
  }
  min = Math.min(min, pool.length, 3);

  let max = Math.max(moodMax, min);
  max = Math.min(max, pool.length, 3);

  return {
    min,
    max,
    allowZero: min === 0 && (rules.allowZero || must.length === 0),
    forceZero: false,
    mustGroups: must,
  };
}

/** First unsatisfied must-group for this pick slot (1-based). */
export function requiredGroupForToySlot(
  mode: SessionMode,
  slot: 1 | 2 | 3,
  alreadyPicked: string[],
  toys: ToyDef[],
  pool?: ToyDef[],
): ToyReqGroup | null {
  const rules = getModeToyRules(mode);
  const candidates = pool ?? toys;
  const must = satisfiableMustGroups(candidates, rules.mustGroups);
  if (must.length === 0) return null;

  const indexed = must[slot - 1];
  if (
    indexed &&
    !groupSatisfiedByIds(alreadyPicked, indexed, toys) &&
    toysMatchingGroup(candidates, indexed).some(
      (t) => !alreadyPicked.includes(t.id),
    )
  ) {
    return indexed;
  }

  for (const g of must) {
    if (groupSatisfiedByIds(alreadyPicked, g, toys)) continue;
    if (
      toysMatchingGroup(candidates, g).some(
        (t) => !alreadyPicked.includes(t.id),
      )
    ) {
      return g;
    }
  }
  return null;
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

/**
 * Pick up to `count` toys: must-groups first, then fill from remaining pool.
 */
export function pickToysForMode(
  mode: SessionMode,
  pool: ToyDef[],
  count: number,
  rng: () => number = Math.random,
): string[] {
  const n = Math.max(0, Math.min(count, pool.length, 3));
  if (n === 0) return [];

  const rules = getModeToyRules(mode);
  const picked: string[] = [];
  const used = new Set<string>();

  for (const group of rules.mustGroups) {
    if (picked.length >= n) break;
    const candidates = toysMatchingGroup(pool, group).filter(
      (t) => !used.has(t.id),
    );
    if (candidates.length === 0) continue;
    const choice = candidates[Math.floor(rng() * candidates.length)]!;
    picked.push(choice.id);
    used.add(choice.id);
  }

  const rest = pool.filter((t) => !used.has(t.id));
  shuffleInPlace(rest, rng);
  for (const t of rest) {
    if (picked.length >= n) break;
    picked.push(t.id);
    used.add(t.id);
  }

  return picked;
}

/**
 * Ensure explicit allow-list covers mode must-groups (add from pool if needed).
 * Returns `__none__` for forceZero. Leaves unrestricted `[]` alone when valid.
 */
/**
 * Ensure explicit allow-list covers mode must-groups (add from pool if needed).
 * `pool` = owned ∩ mode-useful. Returns `__none__` for forceZero.
 * Leaves unrestricted `[]` alone when mode allows inventory.
 */
export function coerceAllowedToyIdsForMode(
  allowed: string[] | undefined,
  mode: SessionMode,
  pool: ToyDef[],
  allToys: ToyDef[] = pool,
  rng: () => number = Math.random,
): string[] {
  const rules = getModeToyRules(mode);

  if (rules.forceZero) {
    return ["__none__"];
  }

  if (!allowed || allowed.length === 0) {
    return [];
  }

  const current = allowed;
  const none = current.every((id) => id === "__none__");

  if (none) {
    if (rules.allowZero) return ["__none__"];
    const bounds = modeToyCountBounds(mode, pool, 3);
    const picked = pickToysForMode(mode, pool, Math.max(1, bounds.min), rng);
    return picked.length > 0 ? picked : ["__none__"];
  }

  const poolIds = new Set(pool.map((t) => t.id));
  const byId = new Map(allToys.map((t) => [t.id, t]));
  let next = current.filter((id) => id !== "__none__" && poolIds.has(id));

  for (const group of rules.mustGroups) {
    if (groupSatisfiedByIds(next, group, allToys)) continue;
    const add = toysMatchingGroup(pool, group).find(
      (t) => !next.includes(t.id),
    );
    if (add) next.push(add.id);
  }

  if (!rules.allowZero && next.length === 0) {
    const bounds = modeToyCountBounds(mode, pool, 3);
    next = pickToysForMode(mode, pool, Math.max(1, bounds.min), rng);
  }

  if (next.length > 3) {
    const keep = new Set<string>();
    for (const group of rules.mustGroups) {
      const id = next.find((tid) => {
        const toy = byId.get(tid);
        return toy ? toyMatchesReqGroup(toy, group) : false;
      });
      if (id) keep.add(id);
    }
    for (const id of next) {
      if (keep.size >= 3) break;
      keep.add(id);
    }
    next = [...keep];
  }

  return next;
}

/** Whether an allow-list is valid for the mode (for UI guards). */
export function allowedToysValidForMode(
  allowed: string[] | undefined,
  mode: SessionMode,
  pool: ToyDef[],
  allToys: ToyDef[] = pool,
): boolean {
  const rules = getModeToyRules(mode);
  if (rules.forceZero) {
    return Boolean(allowed?.length) && allowed!.every((id) => id === "__none__");
  }
  if (!allowed || allowed.length === 0) return true;
  const current = allowed;
  if (current.every((id) => id === "__none__")) {
    return rules.allowZero;
  }
  for (const group of rules.mustGroups) {
    if (toysMatchingGroup(pool, group).length === 0) continue;
    if (!groupSatisfiedByIds(current, group, allToys)) return false;
  }
  return true;
}

/** Compact rule line under mode wheel. */
export function modeToyRulesAdviceRu(mode: SessionMode): string {
  const modeName = MODE_LABELS[mode]?.nameRu ?? mode;
  const rules = getModeToyRules(mode);
  return `${modeName}: ${rules.summaryRu}.`;
}
