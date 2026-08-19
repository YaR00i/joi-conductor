/**
 * Toy ↔ mode affinity derived from catalog functions (requiresToys + modes).
 * Used by roulette filters and PlanPanel recommendations.
 */
import { functions as catalogFunctions, toys as catalogToys } from "./catalog";
import type { FunctionDef, SessionMode, ToyDef } from "./types";
import { MODE_LABELS } from "./labels";
import {
  getModeToyRules,
  groupLabelRu,
  modeToyRulesAdviceRu,
  satisfiableMustGroups,
  toysMatchingGroup,
} from "./modeToyRules";

/** Oral-only vibe assists (mirrors conductor). */
const ORAL_ASSIST_IDS = new Set(["vibe_assist", "hands_off_vibe"]);

export type ModeToyRecommendation = {
  toyId: string;
  nameRu: string;
  /** Abstract group if any (e.g. dildo). */
  group?: string;
  owned: boolean;
  /** How strongly the mode uses this toy. */
  kind: "core" | "assist";
  reasonRu: string;
};

/** Whether a function can appear in the session queue for this mode (loadout ignored). */
export function functionMatchesMode(
  fn: FunctionDef,
  mode: SessionMode,
): boolean {
  if (!fn.enabled) return false;
  if (fn.id === "finale_roulette") return false;
  if (fn.id === "rest_hands_off") return true;

  if (mode === "prone") {
    return fn.id === "stroke_prone";
  }
  if (mode === "plapping") {
    return (
      fn.modes.includes("plapping") ||
      fn.id === "rest_hands_off" ||
      fn.id === "plug_passive" ||
      fn.id.startsWith("ball_") ||
      fn.id.startsWith("combo_cage") ||
      fn.id === "hands_off_vibe" ||
      fn.id === "vibe_press"
    );
  }
  if (mode === "cbt") {
    return (
      fn.category === "cbt" ||
      fn.modes.includes("cbt") ||
      fn.modes.includes("stroke")
    );
  }
  if (mode === "oral") {
    return (
      fn.category === "oral" ||
      fn.modes.includes("oral") ||
      ORAL_ASSIST_IDS.has(fn.id)
    );
  }
  if (mode === "onahole") {
    return fn.modes.includes("stroke");
  }
  if (mode === "chastity") {
    if (fn.category === "stroke") return false;
    return fn.modes.includes("chastity");
  }
  return fn.modes.includes(mode);
}

function toyFulfillsRequirement(toy: ToyDef, requirement: string): boolean {
  if (toy.id === requirement) return true;
  return toy.satisfies?.includes(requirement) ?? false;
}

/** Requirement tokens used by functions that can run in this mode. */
export function requirementTokensForMode(
  mode: SessionMode,
  fns: FunctionDef[] = catalogFunctions,
): Map<string, { count: number; sampleFnRu: string }> {
  const map = new Map<string, { count: number; sampleFnRu: string }>();
  for (const fn of fns) {
    if (!functionMatchesMode(fn, mode)) continue;
    for (const req of fn.requiresToys) {
      if (!req) continue;
      const prev = map.get(req);
      if (prev) {
        prev.count += 1;
      } else {
        map.set(req, { count: 1, sampleFnRu: fn.nameRu });
      }
    }
  }
  return map;
}

/** True if this owned/catalog toy can satisfy at least one function in the mode. */
export function toyUsefulForMode(
  toy: ToyDef,
  mode: SessionMode,
  fns: FunctionDef[] = catalogFunctions,
): boolean {
  const tokens = requirementTokensForMode(mode, fns);
  if (tokens.size === 0) return false;
  for (const req of tokens.keys()) {
    if (toyFulfillsRequirement(toy, req)) return true;
  }
  return false;
}

/** Filter inventory to toys that the spun/selected mode can actually use. */
export function filterToysForMode(
  toys: ToyDef[],
  mode: SessionMode,
  fns: FunctionDef[] = catalogFunctions,
): ToyDef[] {
  return toys.filter((t) => toyUsefulForMode(t, mode, fns));
}

function kindForRequirement(
  mode: SessionMode,
  req: string,
  count: number,
): "core" | "assist" {
  if (mode === "anal" && req === "dildo") return "core";
  if (mode === "oral" && req === "dildo") return "core";
  if (mode === "chastity" && req === "chastity_cage") return "core";
  if (mode === "chastity" && (req === "plug_static" || req === "wand")) {
    return "assist";
  }
  if (
    (mode === "cbt" || mode === "stroke" || mode === "onahole") &&
    (req === "dildo" || req === "plug_static")
  ) {
    return "assist";
  }
  if (count >= 2) return "core";
  return "assist";
}

function reasonForRequirement(
  mode: SessionMode,
  req: string,
  sampleFnRu: string,
): string {
  switch (req) {
    case "dildo":
      if (mode === "anal") return "thrust / анальные функции";
      if (mode === "oral") return "оральные функции с дилдо";
      if (mode === "cbt" || mode === "stroke" || mode === "onahole") {
        return "plapping и похожие ходы";
      }
      return sampleFnRu;
    case "chastity_cage":
      return "клетка для chastity-комбо";
    case "wand":
      return "внешняя вибрация (wand / вибропуля) / комбо";
    case "lovense_edge2":
      return "простата / вибро-фон";
    case "vibrating_plug":
      return "вибро-пробка / hands-free";
    case "plug":
      return "пассивная наполненность";
    case "plug_static":
      return "worn-наполненность / grind (пробка или дилдо)";
    default:
      return sampleFnRu;
  }
}

/**
 * Recommended toys for a mode — one row per concrete catalog toy that can
 * fulfill a mode requirement (deduped; prefer showing each SKU once).
 */
export function modeToyRecommendations(
  mode: SessionMode,
  toys: ToyDef[] = catalogToys,
  fns: FunctionDef[] = catalogFunctions,
): ModeToyRecommendation[] {
  const tokens = requirementTokensForMode(mode, fns);
  if (tokens.size === 0) return [];

  const out: ModeToyRecommendation[] = [];
  const seen = new Set<string>();

  for (const [req, meta] of tokens) {
    const matches = toys.filter((t) => toyFulfillsRequirement(t, req));
    // Prefer listing concrete toys; if none in catalog, skip.
    for (const toy of matches) {
      if (seen.has(toy.id)) continue;
      seen.add(toy.id);
      out.push({
        toyId: toy.id,
        nameRu: toy.nameRu,
        group: toy.satisfies?.[0],
        owned: toy.owned,
        kind: kindForRequirement(mode, req, meta.count),
        reasonRu: reasonForRequirement(mode, req, meta.sampleFnRu),
      });
    }
  }

  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "core" ? -1 : 1;
    if (a.owned !== b.owned) return a.owned ? -1 : 1;
    return a.nameRu.localeCompare(b.nameRu, "ru");
  });
  return out;
}

/** Short blurb under the mode wheel. */
export function modeToyAdviceRu(
  mode: SessionMode,
  toys: ToyDef[] = catalogToys,
  fns: FunctionDef[] = catalogFunctions,
): string {
  const rules = getModeToyRules(mode);
  const owned = toys.filter((t) => t.owned);
  const mustOk = satisfiableMustGroups(owned, rules.mustGroups);
  const mustMissing = rules.mustGroups.filter((g) => !mustOk.includes(g));

  const hard = modeToyRulesAdviceRu(mode);
  if (rules.forceZero || rules.mustGroups.length === 0) {
    const recs = modeToyRecommendations(mode, toys, fns);
    if (recs.length === 0) return hard;
    const assist = recs
      .filter((r) => r.kind === "assist")
      .map((r) => (r.owned ? r.nameRu : `${r.nameRu} (нет)`))
      .slice(0, 3)
      .join(", ");
    return assist ? `${hard} Опционально: ${assist}.` : hard;
  }

  const mustRu = rules.mustGroups
    .map((g) => {
      const hits = toysMatchingGroup(owned, g);
      const label = groupLabelRu(g);
      if (hits.length === 0) return `${label} (нет в инвентаре)`;
      return `${label} ← ${hits.map((t) => t.nameRu).join("/")}`;
    })
    .join("; ");

  const modeName = MODE_LABELS[mode]?.nameRu ?? mode;
  if (mustMissing.length > 0) {
    return `${modeName}: ${rules.summaryRu}. Не хватает: ${mustMissing
      .map(groupLabelRu)
      .join(", ")}.`;
  }
  return `${hard} Слоты: ${mustRu}.`;
}

/** Drop session toy ids that cannot be used in the chosen mode. */
export function sanitizeSessionToyIdsForMode(
  toyIds: string[],
  mode: SessionMode,
  toys: ToyDef[] = catalogToys,
  fns: FunctionDef[] = catalogFunctions,
): string[] {
  const byId = new Map(toys.map((t) => [t.id, t]));
  return toyIds.filter((id) => {
    const toy = byId.get(id);
    if (!toy) return false;
    return toyUsefulForMode(toy, mode, fns);
  });
}
