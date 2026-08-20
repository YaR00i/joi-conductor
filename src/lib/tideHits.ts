/** Tide CBT/plapping hit counters (honor accents / mic peaks + fail confess). */

import type { TideHitVerifyMode } from "./tideHitVerify";

export const TIDE_HIT_FUNCTION_IDS = [
  "cbt_light",
  "cbt_medium",
  "cbt_cock_slap",
  "cbt_cock_thwack",
  "cbt_head_flick",
  "cbt_underside_tap",
  "plapping",
  "plapping_cage",
  "plapping_cage_heavy",
] as const;

export type TideHitFunctionId = (typeof TIDE_HIT_FUNCTION_IDS)[number];

/** Shaft / head CBT — needs unlocked cock (no chastity cage). */
export const SHAFT_CBT_FUNCTION_IDS = [
  "cbt_cock_slap",
  "cbt_cock_thwack",
  "cbt_head_flick",
  "cbt_underside_tap",
] as const;

export function isTideHitFunction(
  functionId: string | null | undefined,
): functionId is TideHitFunctionId {
  return (
    typeof functionId === "string" &&
    (TIDE_HIT_FUNCTION_IDS as readonly string[]).includes(functionId)
  );
}

export function isShaftCbtFunction(
  functionId: string | null | undefined,
): boolean {
  return (
    typeof functionId === "string" &&
    (SHAFT_CBT_FUNCTION_IDS as readonly string[]).includes(functionId)
  );
}

/** Soft accent fraction of total beats in the block. */
function tideAccentFactor(functionId: TideHitFunctionId): number {
  switch (functionId) {
    case "cbt_underside_tap":
      return 0.32;
    case "cbt_light":
    case "cbt_head_flick":
      return 0.35;
    case "cbt_cock_slap":
      return 0.4;
    case "cbt_medium":
    case "cbt_cock_thwack":
    case "plapping":
    case "plapping_cage":
      return 0.5;
    case "plapping_cage_heavy":
      return 0.58;
    default: {
      const _exhaustive: never = functionId;
      return _exhaustive;
    }
  }
}

/**
 * Soft hit target ≈ strong accents in the block.
 * BPM 0 (shouldn't happen on CBT beat blocks) → floor of 3.
 */
export function tideSoftTarget(
  functionId: string,
  durationSec: number,
  bpm: number,
): number {
  if (!isTideHitFunction(functionId)) return 0;
  const beats = Math.max(0, durationSec) * (Math.max(0, bpm) / 60);
  const raw = Math.round(beats * tideAccentFactor(functionId));
  return Math.max(3, raw);
}

/** Strong metronome accent — same threshold as BeatBar `is-strong`. */
export function isTideAutoAccent(accent: number): boolean {
  return accent >= 2;
}

export function tideHitCounterLabelRu(hits: number, target: number): string {
  return `${hits} / ${target}`;
}

export function tideHitProgressHintRu(
  functionId?: string | null,
  mode?: TideHitVerifyMode,
): string {
  const plapping =
    functionId === "plapping_cage" || functionId === "plapping_cage_heavy";
  if (mode === "mic") {
    return plapping
      ? "микрофон — шлепок должен быть слышен"
      : "микрофон — удар должен быть слышен";
  }
  if (plapping) {
    return "считаю акценты — шлепки дилдо по яйцам";
  }
  return "считаю сильные акценты — удары";
}

export function tideFailButtonLabelRu(): string {
  return "НЕ ВЫДЕРЖАЛ";
}

export function tideFailButtonSubRu(functionId?: string | null): string {
  if (
    functionId === "plapping_cage" ||
    functionId === "plapping_cage_heavy"
  ) {
    return "слишком больно / сорвался";
  }
  return "боль / сорвался";
}

export function tideMissAskLabelRu(): string {
  return "Сколько ударов пропустил?";
}

export function tideMissAskSpeakEn(): string {
  return "How many hits did you skip? Number. Don't lie to the court.";
}

export function tideMissCap(target: number, hits: number): number {
  return Math.max(1, target, hits);
}

export function tideCompleteAskLabelRu(target: number, hits: number): string {
  return `Все ${hits} ударов — до последнего? Или только норму (${target})?`;
}

export function tideCompleteAskSpeakEn(target: number, hits: number): string {
  return `I counted ${hits}. Every hit — or just the quota of ${target}?`;
}

export function tideCompleteYesLabelRu(): string {
  return "ВСЕ · ДО ПОСЛЕДНЕГО";
}

export function tideCompleteYesSubRu(): string {
  return "ни одного пропуска";
}

export function tideCompleteNoLabelRu(): string {
  return "НЕ ВСЕ · ТОЛЬКО НОРМУ";
}

export function tideCompleteNoSubRu(): string {
  return "минимум сделал, дальше не смог";
}

export function tideCompleteYesSpeakEn(): string {
  return "Every strike. The court notes your obedience.";
}

export function tideCompleteNoSpeakEn(): string {
  return "Only the quota. Cute. Next verdict will ask for all of them.";
}

export type TideMissConsequence = {
  moodDelta: number;
  extraEdges: number;
  restAfterSec: number;
  replaceWithRestSec: number;
  speakEn: string;
};

export function tideMissConsequence(missed: number): TideMissConsequence {
  const m = Math.max(0, Math.floor(missed));
  if (m <= 0) {
    return {
      moodDelta: 0,
      extraEdges: 0,
      restAfterSec: 0,
      replaceWithRestSec: 0,
      speakEn: "Zero skips? Then why confess. Keep striking.",
    };
  }
  if (m <= 2) {
    return {
      moodDelta: -1,
      extraEdges: 1,
      restAfterSec: 0,
      replaceWithRestSec: 0,
      speakEn: `Only ${m}? Soft. Extra edges for the court.`,
    };
  }
  if (m <= 5) {
    return {
      moodDelta: -2,
      extraEdges: 2,
      restAfterSec: 40,
      replaceWithRestSec: 0,
      speakEn: `${m} missed. Rest and think about your aim.`,
    };
  }
  return {
    moodDelta: -2,
    extraEdges: 3,
    restAfterSec: 0,
    replaceWithRestSec: 35,
    speakEn: `${m} missed. Stop. Rest under my verdict.`,
  };
}
