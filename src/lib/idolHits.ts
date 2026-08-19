/**
 * Sunna Idol Soft: Chorus (oral accent reps) + Buzz hold helpers.
 * Mirror of Tide CBT counters, throat / vibe themed.
 */

export const IDOL_CHORUS_FUNCTION_IDS = [
  "oral_shallow",
  "oral_deep",
  "oral_hold",
] as const;

export type IdolChorusFunctionId = (typeof IDOL_CHORUS_FUNCTION_IDS)[number];

export const IDOL_BUZZ_FUNCTION_IDS = [
  "hands_off_vibe",
  "vibe_press",
  "combo_cage_wand",
  "combo_cage_vibe_plug",
] as const;

export type IdolBuzzFunctionId = (typeof IDOL_BUZZ_FUNCTION_IDS)[number];

/** Functions banned for Sunna queues (hand-on-shaft / stroke identity). */
export const SUNNA_BANNED_FUNCTION_IDS = [
  "vibe_assist",
  "stroke_left",
  "stroke_right",
  "stroke_two_hands",
  "stroke_head_only",
  "stroke_shaft_only",
  "stroke_reverse",
  "stroke_prone",
  "cbt_light",
  "cbt_medium",
  "cbt_cock_slap",
  "cbt_cock_thwack",
  "cbt_head_flick",
  "cbt_underside_tap",
  "plapping",
] as const;

export function isIdolChorusFunction(
  functionId: string | null | undefined,
): functionId is IdolChorusFunctionId {
  return (
    typeof functionId === "string" &&
    (IDOL_CHORUS_FUNCTION_IDS as readonly string[]).includes(functionId)
  );
}

export function isIdolBuzzFunction(
  functionId: string | null | undefined,
): functionId is IdolBuzzFunctionId {
  return (
    typeof functionId === "string" &&
    (IDOL_BUZZ_FUNCTION_IDS as readonly string[]).includes(functionId)
  );
}

export function isSunnaBannedFunction(
  functionId: string | null | undefined,
): boolean {
  return (
    typeof functionId === "string" &&
    (SUNNA_BANNED_FUNCTION_IDS as readonly string[]).includes(functionId)
  );
}

function chorusAccentFactor(functionId: IdolChorusFunctionId): number {
  switch (functionId) {
    case "oral_shallow":
      return 0.4;
    case "oral_deep":
    case "oral_hold":
      return 0.55;
    default: {
      const _exhaustive: never = functionId;
      return _exhaustive;
    }
  }
}

export function idolChorusSoftTarget(
  functionId: string,
  durationSec: number,
  bpm: number,
): number {
  if (!isIdolChorusFunction(functionId)) return 0;
  const beats = Math.max(0, durationSec) * (Math.max(0, bpm) / 60);
  const raw = Math.round(beats * chorusAccentFactor(functionId));
  return Math.max(3, raw);
}

export function isIdolAutoAccent(accent: number): boolean {
  return accent >= 2;
}

export function idolChorusCounterLabelRu(hits: number, target: number): string {
  return `${hits} / ${target}`;
}

export function idolChorusProgressHintRu(): string {
  return "считаю сильные акценты — глотки";
}

export function idolChorusFailButtonLabelRu(): string {
  return "НЕ ВЫДЕРЖАЛ";
}

export function idolChorusFailButtonSubRu(): string {
  return "горло не справилось";
}

export function idolChorusMissAskLabelRu(): string {
  return "Сколько глотков / ходов на дилдо пропустил?";
}

export function idolChorusMissAskSpeakEn(): string {
  return "How many throat reps did you skip, little clitty? Number. Don't lie.";
}

export function idolChorusMissCap(target: number, hits: number): number {
  return Math.max(1, target, hits);
}

export function idolChorusCompleteAskLabelRu(
  target: number,
  hits: number,
): string {
  return `Все ${hits} глотков — до последнего акцента? Или только норму (${target})?`;
}

export function idolChorusCompleteAskSpeakEn(
  target: number,
  hits: number,
): string {
  return `I counted ${hits} for that pretty throat. Every accent — or just the quota of ${target}?`;
}

export function idolChorusCompleteYesLabelRu(): string {
  return "ВСЕ · ДО ПОСЛЕДНЕГО";
}

export function idolChorusCompleteYesSubRu(): string {
  return "полный припев, ни одного пропуска";
}

export function idolChorusCompleteNoLabelRu(): string {
  return "НЕ ВСЕ · ТОЛЬКО НОРМУ";
}

export function idolChorusCompleteNoSubRu(): string {
  return "минимум сделал, дальше не смог";
}

export function idolChorusCompleteYesSpeakEn(): string {
  return "Every gulp. Good girl. That clitty stays locked while your throat works.";
}

export function idolChorusCompleteNoSpeakEn(): string {
  return "Only the quota. Cute. Next chorus I want all of them.";
}

export type IdolMissConsequence = {
  moodDelta: number;
  extraEdges: number;
  restAfterSec: number;
  replaceWithRestSec: number;
  speakEn: string;
};

export function idolChorusMissConsequence(missed: number): IdolMissConsequence {
  const m = Math.max(0, Math.floor(missed));
  if (m <= 0) {
    return {
      moodDelta: 0,
      extraEdges: 0,
      restAfterSec: 0,
      replaceWithRestSec: 0,
      speakEn: "Zero skips? Then why tap fail. Open wider and keep going.",
    };
  }
  if (m <= 2) {
    return {
      moodDelta: -1,
      extraEdges: 1,
      restAfterSec: 0,
      replaceWithRestSec: 0,
      speakEn: `Only ${m}? That throat is lazy. Extra edges for your clitty.`,
    };
  }
  if (m <= 5) {
    return {
      moodDelta: -2,
      extraEdges: 2,
      restAfterSec: 40,
      replaceWithRestSec: 0,
      speakEn: `${m} missed gulps. Hands on toys only — then rest. Think about your throat.`,
    };
  }
  return {
    moodDelta: -2,
    extraEdges: 3,
    restAfterSec: 0,
    replaceWithRestSec: 35,
    speakEn: `${m} missed. Stop. Rest with that locked clitty and remember who owns your mouth.`,
  };
}

export type IdolBuzzHoldMode = "hands_on" | "clipped";

/** Soft endurance band by mood-ish score (−3…+3 mapped loosely). */
export function idolBuzzTargetSec(
  moodScore: number,
  rng: () => number = Math.random,
): number {
  const base = moodScore <= -1 ? 45 : moodScore >= 2 ? 25 : 35;
  const jitter = Math.floor(rng() * 16) - 5;
  return Math.max(20, Math.min(60, base + jitter));
}

export function idolBuzzArmLabelRu(): string {
  return "ДЕРЖУ";
}

export function idolBuzzArmSubRu(mode: IdolBuzzHoldMode): string {
  return mode === "clipped"
    ? "игрушка на клетке · руки прочь"
    : "держу wand / пулю у клитора";
}

export function idolBuzzFailLabelRu(): string {
  return "НЕ ВЫДЕРЖАЛ";
}

export function idolBuzzFailSubRu(): string {
  return "почти кончил / сорвался";
}

export function idolBuzzSuccessSpeakEn(): string {
  return "Good. That locked clitty survived the buzz. I'm proud — a little.";
}

export function idolBuzzFailSpeakEn(): string {
  return "Almost came from a toy on your clitty? Pathetic. Extra edges.";
}
