/**
 * Mistress pack unlock rules — progress via shop purchases + session history.
 */

import type { MistressId } from "./types";

export type MistressUnlockSnapshot = {
  functionIds: readonly string[];
  modeIds: readonly string[];
  characterIds: readonly string[];
  tagPacks: readonly string[];
  /** Shop feature keys (sparkle_mask, iskra_fang, …). */
  featureIds?: readonly string[];
  /** Completed sessions in chastity mode (lifetime). */
  chastitySessionsCompleted?: number;
};

/** Shop / unlock keys that advance Tide (Furina). */
export const FURINA_UNLOCK = {
  functions: [
    "plapping",
    "cbt_medium",
    "cbt_cock_thwack",
    "stroke_prone",
  ] as const,
  tagPacks: ["censored_court", "blacked_court"] as const,
  modes: ["cbt"] as const,
};

/** Shop / unlock keys that advance Idol Soft (Sunna). */
export const SUNNA_UNLOCK = {
  functions: ["vibe_assist", "hands_off_vibe", "vibe_press"] as const,
  modes: ["chastity", "oral"] as const,
  characters: ["trap", "futanari", "sissy"] as const,
};

/** Mask Circus (Sparkle / Iskra) — dual soul keys + prior mistresses. */
export const SPARKLE_UNLOCK = {
  modes: ["anal", "chastity"] as const,
  tagPacks: ["censored_court", "blacked_court"] as const,
  /** «Маска Искорки» + «Клык Искры» */
  soulKeys: ["sparkle_mask", "iskra_fang"] as const,
  minChastitySessions: 1,
} as const;

function ownsAny(
  have: readonly string[],
  need: readonly string[],
): boolean {
  const set = new Set(have);
  return need.some((id) => set.has(id));
}

function ownsAll(
  have: readonly string[],
  need: readonly string[],
): boolean {
  const set = new Set(have);
  return need.every((id) => set.has(id));
}

function countOwned(
  have: readonly string[],
  need: readonly string[],
): number {
  const set = new Set(have);
  return need.filter((id) => set.has(id)).length;
}

/**
 * Furina (Tide): need pain/CBT/prone direction AND censored/blacked pack,
 * OR already own mode_cbt (legacy / direct).
 */
export function isFurinaUnlockSatisfied(
  u: MistressUnlockSnapshot,
): boolean {
  if (u.modeIds.includes("cbt")) return true;
  const pain = ownsAny(u.functionIds, FURINA_UNLOCK.functions);
  const packs = ownsAny(u.tagPacks, FURINA_UNLOCK.tagPacks);
  return pain && packs;
}

/**
 * Sunna (Idol): vibe direction + (cage or oral mode) + fem character.
 * Or own mode_oral as shortcut after prior unlock.
 */
export function isSunnaUnlockSatisfied(
  u: MistressUnlockSnapshot,
): boolean {
  if (
    u.modeIds.includes("oral") &&
    ownsAny(u.functionIds, SUNNA_UNLOCK.functions)
  ) {
    return true;
  }
  const vibe = ownsAny(u.functionIds, SUNNA_UNLOCK.functions);
  const mode = ownsAny(u.modeIds, SUNNA_UNLOCK.modes);
  const char = ownsAny(u.characterIds, SUNNA_UNLOCK.characters);
  return vibe && mode && char;
}

/**
 * Sparkle / Iskra (Mask Circus):
 * - Furina + Sunna unlocked
 * - mode_anal + mode_chastity
 * - both censored_court + blacked_court
 * - both soul keys (Маска Искорки + Клык Искры)
 * - ≥1 completed chastity session
 */
export function isSparkleUnlockSatisfied(
  u: MistressUnlockSnapshot,
): boolean {
  if (!isFurinaUnlockSatisfied(u) || !isSunnaUnlockSatisfied(u)) {
    return false;
  }
  if (!ownsAll(u.modeIds, SPARKLE_UNLOCK.modes)) return false;
  if (!ownsAll(u.tagPacks, SPARKLE_UNLOCK.tagPacks)) return false;
  const features = u.featureIds ?? [];
  if (!ownsAll(features, SPARKLE_UNLOCK.soulKeys)) return false;
  const cageSessions = u.chastitySessionsCompleted ?? 0;
  return cageSessions >= SPARKLE_UNLOCK.minChastitySessions;
}

export function isMistressIdUnlocked(
  id: MistressId,
  u: MistressUnlockSnapshot,
): boolean {
  switch (id) {
    case "hu_tao":
      return true;
    case "furina":
      return isFurinaUnlockSatisfied(u);
    case "sunna":
      return isSunnaUnlockSatisfied(u);
    case "sparkle":
      return isSparkleUnlockSatisfied(u);
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

/** Modes that only exist for a specific mistress while she is active. */
export function isModeExclusiveToMistress(
  mode: string,
): MistressId | null {
  if (mode === "cbt" || mode === "prone") return "furina";
  if (mode === "oral" || mode === "plapping") return "sunna";
  if (mode === "onahole") return "hu_tao";
  return null;
}

/**
 * Sunna identity: no hand-stroke / onahole / CBT / prone —
 * vibe + oral + chastity + plapping (+ anal if unlocked). Cage always on.
 */
function isModeBannedForMistress(
  mode: string,
  mistressId: MistressId,
): boolean {
  if (mistressId !== "sunna") return false;
  return (
    mode === "stroke" ||
    mode === "onahole" ||
    mode === "cbt" ||
    mode === "prone"
  );
}

export function isModeAllowedForMistress(
  mode: string,
  mistressId: MistressId,
): boolean {
  if (isModeBannedForMistress(mode, mistressId)) return false;
  const exclusive = isModeExclusiveToMistress(mode);
  if (!exclusive) return true;
  return exclusive === mistressId;
}

/** Fallback mode when current mode is illegal for the active mistress. */
export function fallbackModeForMistress(mistressId: MistressId): string {
  switch (mistressId) {
    case "sunna":
      return "oral";
    case "furina":
      return "cbt";
    case "sparkle":
      return "chastity";
    case "hu_tao":
      return "stroke";
    default: {
      const _exhaustive: never = mistressId;
      return _exhaustive;
    }
  }
}

/** Human-readable unlock hint for locked picker cards. */
export function mistressUnlockHintRu(id: MistressId): string {
  switch (id) {
    case "hu_tao":
      return "";
    case "furina":
      return "Купи CBT / шлёпанье / prone и пак censored или blacked";
    case "sunna":
      return "Купи вибро + (клетка или орал) + трап/фута/сисси";
    case "sparkle":
      return "Фурина+Санна · anal+клетка · оба пака · Маска+Клык · 1 сессия в клетке";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

/** Progress fraction for UI. */
export function mistressUnlockProgress(
  id: MistressId,
  u: MistressUnlockSnapshot,
): { have: number; need: number; detailRu: string } {
  switch (id) {
    case "furina": {
      const pain = countOwned(u.functionIds, FURINA_UNLOCK.functions) > 0 ? 1 : 0;
      const packs = countOwned(u.tagPacks, FURINA_UNLOCK.tagPacks) > 0 ? 1 : 0;
      return {
        have: pain + packs,
        need: 2,
        detailRu: `боль/CBT ${pain ? "✓" : "·"} · censored/blacked ${packs ? "✓" : "·"}`,
      };
    }
    case "sunna": {
      const vibe = countOwned(u.functionIds, SUNNA_UNLOCK.functions) > 0 ? 1 : 0;
      const mode = countOwned(u.modeIds, SUNNA_UNLOCK.modes) > 0 ? 1 : 0;
      const char = countOwned(u.characterIds, SUNNA_UNLOCK.characters) > 0 ? 1 : 0;
      return {
        have: vibe + mode + char,
        need: 3,
        detailRu: `вибро ${vibe ? "✓" : "·"} · клетка/орал ${mode ? "✓" : "·"} · архетип ${char ? "✓" : "·"}`,
      };
    }
    case "sparkle": {
      const tide = isFurinaUnlockSatisfied(u) ? 1 : 0;
      const idol = isSunnaUnlockSatisfied(u) ? 1 : 0;
      const modes = ownsAll(u.modeIds, SPARKLE_UNLOCK.modes) ? 1 : 0;
      const packs = ownsAll(u.tagPacks, SPARKLE_UNLOCK.tagPacks) ? 1 : 0;
      const keys = ownsAll(u.featureIds ?? [], SPARKLE_UNLOCK.soulKeys)
        ? 1
        : 0;
      const cage =
        (u.chastitySessionsCompleted ?? 0) >=
        SPARKLE_UNLOCK.minChastitySessions
          ? 1
          : 0;
      const parts = [
        `Tide ${tide ? "✓" : "·"}`,
        `Idol ${idol ? "✓" : "·"}`,
        `anal+клетка ${modes ? "✓" : "·"}`,
        `оба пака ${packs ? "✓" : "·"}`,
        `Маска+Клык ${keys ? "✓" : "·"}`,
        `сессия в клетке ${cage ? "✓" : "·"}`,
      ];
      return {
        have: tide + idol + modes + packs + keys + cage,
        need: 6,
        detailRu: parts.join(" · "),
      };
    }
    default:
      return { have: 1, need: 1, detailRu: "" };
  }
}

/**
 * Modes / flags to auto-grant when a mistress unlocks.
 * Sparkle: phantom rules live on the pack; no extra mode id yet.
 */
export function modesGrantedWithMistress(id: MistressId): string[] {
  // onahole stays shop-gated but exclusive to Hu Tao while she is active.
  if (id === "furina") return ["cbt", "prone"];
  if (id === "sunna") return ["oral", "plapping"];
  return [];
}

/** Feature ids granted when Sparkle unlocks (phantom / SessionFx readiness). */
export function featuresGrantedWithMistress(id: MistressId): string[] {
  if (id === "sparkle") return ["sparkle_phantom", "sparkle_session_fx"];
  return [];
}

/** Build snapshot for picker / setActiveMistress from wallet (+ optional lifetime). */
export function mistressUnlockSnapshotFrom(opts: {
  functionIds: readonly string[];
  modeIds: readonly string[];
  characterIds: readonly string[];
  tagPacks: readonly string[];
  featureIds?: readonly string[];
  chastitySessionsCompleted?: number;
}): MistressUnlockSnapshot {
  return {
    functionIds: opts.functionIds,
    modeIds: opts.modeIds,
    characterIds: opts.characterIds,
    tagPacks: opts.tagPacks,
    featureIds: opts.featureIds ?? [],
    chastitySessionsCompleted: opts.chastitySessionsCompleted ?? 0,
  };
}
