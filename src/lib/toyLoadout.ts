import type { FunctionDef, SessionMode, ToyDef } from "./types";
import { getActiveMistress } from "./mistress";
import { functionPlayBiasBoost } from "./mistress/playBias";
import { isShaftCbtFunction } from "./tideHits";
import { isToyAllowedInSession } from "./toyRoulette";

/** Mutually exclusive body slots for worn/inserted toys. */
export type ToySlot = "anal" | "front" | "external";

const SLOT_BY_TOY: Record<string, ToySlot> = {
  plug: "anal",
  vibrating_plug: "anal",
  lovense_edge2: "anal",
  dildo_small: "anal",
  dildo_medium_vibe: "anal",
  dildo_large: "anal",
  chastity_cage: "front",
  wand: "external",
  vibe_bullet: "external",
};

/** Wand / vibe bullet (same external_vibe group). */
export function hasExternalVibeEquipped(equipped: string[]): boolean {
  return equipped.some(
    (id) => id === "wand" || id === "vibe_bullet",
  );
}

function isExternalVibeToy(toy: ToyDef): boolean {
  return (
    toy.id === "wand" ||
    toy.id === "vibe_bullet" ||
    (toy.satisfies?.includes("wand") ?? false) ||
    (toy.satisfies?.includes("external_vibe") ?? false)
  );
}

/**
 * Session params pick which toys are in play; the conductor only queues
 * functions that fit the *equipped* loadout. If the plan explicitly includes
 * a wand / vibe bullet, start with that toy already on so vibe blocks appear.
 */
export function initialEquippedFromAllowed(
  toys: ToyDef[],
  allowedToyIds?: string[],
): string[] {
  if (!allowedToyIds || allowedToyIds.length === 0) return [];
  const pool = toys.filter(
    (t) => t.owned && isToyAllowedInSession(t.id, allowedToyIds),
  );
  const external = pool.find((t) => isExternalVibeToy(t));
  if (!external) return [];
  return [external.id];
}

/** Toys that stay on until swapped — modifiers on every following block. */
export function toySlot(toyId: string): ToySlot | null {
  return SLOT_BY_TOY[toyId] ?? null;
}

export function toysInSlot(equipped: string[], slot: ToySlot): string[] {
  return equipped.filter((id) => toySlot(id) === slot);
}

/**
 * Equip a toy: clears conflicting slot mates, returns next loadout.
 * Owned check is caller's responsibility.
 */
export function equipToy(equipped: string[], toyId: string): string[] {
  const slot = toySlot(toyId);
  if (!slot) {
    return equipped.includes(toyId) ? equipped : [...equipped, toyId];
  }
  const kept = equipped.filter((id) => toySlot(id) !== slot);
  return [...kept, toyId];
}

export function unequipToy(equipped: string[], toyId: string): string[] {
  return equipped.filter((id) => id !== toyId);
}

export function unequipSlot(equipped: string[], slot: ToySlot): string[] {
  return equipped.filter((id) => toySlot(id) !== slot);
}

/** Owned toys that can still be offered as equip prompts. */
export function availableEquipTargets(
  owned: ToyDef[],
  equipped: string[],
  allowedToyIds?: string[],
): ToyDef[] {
  const ownedOk = owned.filter((t) => {
    if (!t.owned) return false;
    if (allowedToyIds && allowedToyIds.length > 0) {
      return allowedToyIds.includes(t.id);
    }
    return true;
  });
  return ownedOk.filter((t) => !equipped.includes(t.id));
}

/**
 * A function may run only if every required toy is already equipped
 * (not merely owned). Empty requiresToys = always ok for loadout.
 */
export function functionFitsLoadout(
  fn: FunctionDef,
  equipped: Set<string>,
  toys: ToyDef[],
): boolean {
  // Shaft/head CBT needs an unlocked cock — cage blocks these moves
  if (isShaftCbtFunction(fn.id) && equipped.has("chastity_cage")) {
    return false;
  }
  if (!fn.requiresToys.length) return true;
  return fn.requiresToys.every((req) => requirementMet(req, equipped, toys));
}

export function requirementMet(
  requirement: string,
  equipped: Set<string>,
  toys: ToyDef[],
): boolean {
  if (equipped.has(requirement)) return true;
  return toys.some(
    (t) =>
      equipped.has(t.id) && (t.satisfies?.includes(requirement) ?? false),
  );
}

/** Prefer base moves; unlock combos only when loadout already has the toys. */
export function scoreFunctionForLoadout(
  fn: FunctionDef,
  equipped: string[],
  previousFunctionId: string | null,
  previousCategory: string | null,
  rng: () => number,
  mode?: SessionMode,
): number {
  let score = 1 + rng() * 0.3;

  // Continuity: stay in the same family
  if (previousCategory && fn.category === previousCategory) score += 2.4;
  if (previousFunctionId && fn.id === previousFunctionId) score -= 1.8;

  const req = fn.requiresToys.length;
  if (req === 0) {
    // Hands / body — good default, especially early
    score += equipped.length === 0 ? 2.2 : 0.8;
  } else {
    // Exact use of equipped toys
    score += 1.2 + req * 0.35;
  }

  // Soft preference: worn anal fill (plug / dildo) → grind move
  const hasAnalFill = equipped.some(
    (id) =>
      id === "plug" ||
      id === "vibrating_plug" ||
      id.startsWith("dildo_"),
  );
  if (hasAnalFill) {
    if (fn.id === "plug_passive") score += 1.8;
    if (fn.category === "stroke") score += 0.5;
    if (
      mode === "chastity" ||
      mode === "cbt" ||
      mode === "stroke" ||
      mode === "onahole"
    ) {
      if (fn.id === "plug_passive") score += 0.6;
    }
  }
  if (hasExternalVibeEquipped(equipped)) {
    if (
      fn.category === "vibe" ||
      fn.id.includes("wand") ||
      fn.requiresToys.includes("wand")
    ) {
      score += 1.2;
    }
  }
  if (equipped.includes("lovense_edge2")) {
    if (fn.id.includes("edge2") || fn.id === "edge2_pulse") score += 1.4;
  }
  if (equipped.includes("chastity_cage")) {
    if (fn.id.includes("cage") || fn.category === "nipple" || fn.category === "vibe") {
      score += 1.5;
    }
    // Locked shaft → balls are the soft focus (mercy / tease, not CBT)
    if (
      fn.id === "ball_pet" ||
      fn.id === "ball_tug" ||
      fn.id === "ball_cradle" ||
      fn.id === "ball_weight"
    ) {
      score += 2.1;
      if (mode === "chastity") score += 0.8;
      if (
        getActiveMistress().id === "sunna" ||
        getActiveMistress().id === "furina"
      ) {
        score += 0.6;
      }
    }
    if (fn.category === "stroke" && fn.id !== "rest_hands_off") {
      if (getActiveMistress().play.phantomStroke) {
        // Phantom stroke: cage on, hands work the stand-in
        score += 1.4;
      } else {
        score -= 5;
      }
    }
    if (
      getActiveMistress().play.phantomStroke &&
      (fn.category === "anal" || fn.id.includes("dildo"))
    ) {
      score += 1.6;
    }
  }

  // Sunna caged plapping mode
  if (mode === "plapping") {
    if (fn.id.startsWith("plapping_cage")) score += 2.8;
    if (fn.id === "plug_passive") score += 1.2;
    if (
      fn.id === "ball_pet" ||
      fn.id === "ball_tug" ||
      fn.id === "ball_cradle" ||
      fn.id === "ball_weight"
    ) {
      score += 0.9;
    }
    if (fn.id.startsWith("combo_cage") || fn.category === "vibe") score += 0.8;
  }

  // Tide CBT mode: prefer pain / plapping over generic stroke
  if (mode === "cbt") {
    if (fn.category === "cbt" || fn.id === "plapping") score += 2.4;
    // Mix ball + cock targets so CBT isn't balls-only
    if (
      fn.id === "cbt_cock_slap" ||
      fn.id === "cbt_head_flick" ||
      fn.id === "cbt_underside_tap"
    ) {
      score += 0.9;
    }
    if (fn.id === "cbt_cock_thwack") score += 0.7;
    if (fn.id === "stroke_prone") score += 1.2;
    if (
      fn.category === "stroke" &&
      fn.id !== "stroke_prone" &&
      fn.id !== "rest_hands_off"
    ) {
      score *= 0.55;
    }
  }

  if (equipped.includes("chastity_cage") && isShaftCbtFunction(fn.id)) {
    score = 0;
  }

  // Tide prone: hip-pressure only
  if (mode === "prone") {
    if (fn.id === "stroke_prone") score += 3.2;
    if (fn.id === "rest_hands_off") score *= 0.25;
  }

  // Oral mode: prefer throat signature + light vibe assist
  if (mode === "oral") {
    if (fn.category === "oral" || fn.id.startsWith("oral_")) score += 2.5;
    if (getActiveMistress().id === "sunna") {
      if (fn.id === "hands_off_vibe" || fn.id === "vibe_press") score += 1.8;
      if (fn.id === "vibe_assist") score = 0;
      if (fn.id.startsWith("combo_cage")) score += 1.5;
    } else if (fn.id === "vibe_assist" || fn.id === "hands_off_vibe") {
      score += 1.4;
    }
    if (fn.id === "rest_hands_off") score *= 0.2;
  }

  // Sunna Idol Soft: hands only stabilize toys — never hand-stroke shaft
  if (getActiveMistress().id === "sunna") {
    if (fn.id === "vibe_assist") score = 0;
    if (fn.id === "vibe_press" || fn.id === "hands_off_vibe") score += 1.2;
    if (fn.id.startsWith("combo_cage")) score += 1.1;
    if (
      fn.id === "ball_pet" ||
      fn.id === "ball_cradle" ||
      fn.id === "ball_tug" ||
      fn.id === "ball_weight"
    ) {
      score += 1.35;
    }
    if (
      fn.category === "stroke" &&
      fn.id !== "rest_hands_off"
    ) {
      score = 0;
    }
  }

  // Rest rare in normal flow
  if (fn.id === "rest_hands_off") score *= 0.15;
  if (fn.id === "finale_roulette") score = 0;

  score += functionPlayBiasBoost(fn);

  return Math.max(0.05, score);
}

export function pickWeightedFunction(
  scored: { fn: FunctionDef; score: number }[],
  rng: () => number,
): FunctionDef {
  const total = scored.reduce((a, s) => a + s.score, 0);
  let roll = rng() * total;
  for (const row of scored) {
    roll -= row.score;
    if (roll <= 0) return row.fn;
  }
  return scored[scored.length - 1]!.fn;
}
