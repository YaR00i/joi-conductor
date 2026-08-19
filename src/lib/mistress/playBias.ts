import { getActiveMistress } from "./activeMistress";

/** Soft weight multiplier for roulette mode options from PlayBias. */
export function modeWeightMultiplier(modeId: string): number {
  const preferred = getActiveMistress().play.preferredModes;
  if (preferred.length === 0) return 1;
  if (preferred.includes(modeId)) return 1.55;
  return 0.72;
}

/**
 * Soft boost for function scoring from PlayBias.functionWeightHints.
 * Hints match function category or id substring (e.g. "cbt", "stroke", "anal").
 */
export function functionPlayBiasBoost(
  fn: { id: string; category: string },
): number {
  const hints = getActiveMistress().play.functionWeightHints;
  if (hints.length === 0) return 0;
  let boost = 0;
  const id = fn.id.toLowerCase();
  const cat = fn.category.toLowerCase();
  for (const hint of hints) {
    const h = hint.toLowerCase();
    if (cat === h || id.includes(h)) boost += 1.35;
  }
  return boost;
}

/** Quest catalog weight from exerciseKind / functionId vs PlayBias hints. */
export function questPlayBiasWeight(def: {
  exerciseKind: string;
  functionId: string;
}): number {
  const hints = getActiveMistress().play.functionWeightHints;
  if (hints.length === 0) return 1;
  let w = 1;
  const fid = def.functionId.toLowerCase();
  const kind = def.exerciseKind.toLowerCase();
  for (const hint of hints) {
    const h = hint.toLowerCase();
    if (fid.includes(h) || kind.includes(h) || (h === "cbt" && kind === "cbt")) {
      w += 1.2;
    }
  }
  // Soft demote rest-only when pack leans hard
  if (kind === "rest" && hints.some((h) => h === "cbt" || h === "anal")) {
    w *= 0.55;
  }
  return Math.max(0.15, w);
}

export function mistressAllowsCumFinale(mode: string): boolean {
  const play = getActiveMistress().play;
  if (!play.analOrgasmOnly) return true;
  return mode === "anal" || mode === "chastity";
}
