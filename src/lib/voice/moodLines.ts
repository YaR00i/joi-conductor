import moodLinesData from "../../../data/character/hu-tao-mood-lines.json";
import type { Emotion } from "../types";
import { getActiveMistress } from "../mistress";

/** Session-facing mood for phrase library (separate from TTS Emotion). */
export type MistressMood =
  | "sweet"
  | "cruel"
  | "calm"
  | "chaotic"
  | "horny"
  | "bored";

export const MISTRESS_MOODS: readonly MistressMood[] = [
  "sweet",
  "cruel",
  "calm",
  "chaotic",
  "horny",
  "bored",
] as const;

/** Phrase keys — session events now + action feedback for later wiring. */
export type MoodPhraseKey =
  | "session_start"
  | "session_start_anal"
  | "session_start_chastity"
  | "stroke"
  | "rest"
  | "edge"
  | "hold"
  | "hold_done"
  | "breath_prep"
  | "breath_hold"
  | "breath_done"
  | "breath_fail"
  | "timer_tease_freeze"
  | "timer_tease_extend"
  | "ruin_attempt"
  | "edge_request"
  | "ruin_request"
  | "countdown"
  | "ladder"
  | "dice_chaos"
  | "dare_start"
  | "cage_hijack"
  | "equip_confirm"
  | "cumplay_done_cum"
  | "cumplay_done_ruin"
  | "finale_edge"
  | "finale_cum"
  | "finale_ruin"
  | "finale_deny"
  | "unauthorized_edge"
  | "unauthorized_ruin"
  | "unauthorized_cum"
  | "finish"
  | "cumplay"
  | "session_pause"
  | "session_resume"
  | "session_end_complete"
  | "session_end_abort"
  | "skip"
  | "force_finale"
  | "edge_done"
  | "ruin_done"
  | "like"
  | "ready"
  | "mood_shift"
  | "prompt_answer_yes"
  | "prompt_answer_no"
  | "prompt_answer_mute"
  | "prompt_answer_good"
  | "prompt_answer_bad"
  | "prompt_media_fail";

export const MOOD_PHRASE_KEYS: readonly MoodPhraseKey[] = [
  "session_start",
  "session_start_anal",
  "session_start_chastity",
  "stroke",
  "rest",
  "edge",
  "hold",
  "hold_done",
  "breath_prep",
  "breath_hold",
  "breath_done",
  "breath_fail",
  "timer_tease_freeze",
  "timer_tease_extend",
  "ruin_attempt",
  "edge_request",
  "ruin_request",
  "countdown",
  "ladder",
  "dice_chaos",
  "dare_start",
  "cage_hijack",
  "equip_confirm",
  "cumplay_done_cum",
  "cumplay_done_ruin",
  "finale_edge",
  "finale_cum",
  "finale_ruin",
  "finale_deny",
  "unauthorized_edge",
  "unauthorized_ruin",
  "unauthorized_cum",
  "finish",
  "cumplay",
  "session_pause",
  "session_resume",
  "session_end_complete",
  "session_end_abort",
  "skip",
  "force_finale",
  "edge_done",
  "ruin_done",
  "like",
  "ready",
  "mood_shift",
  "prompt_answer_yes",
  "prompt_answer_no",
  "prompt_answer_mute",
  "prompt_answer_good",
  "prompt_answer_bad",
  "prompt_media_fail",
] as const;

export interface MoodPhrase {
  text: string;
  emotion: Emotion;
  gesture?: string;
}

export interface MoodMeta {
  labelRu: string;
  emotionBias: Emotion;
}

export interface MoodLinesPack {
  defaultMood: MistressMood;
  moods: Record<MistressMood, MoodMeta>;
  lines: Partial<
    Record<MoodPhraseKey, Partial<Record<MistressMood, MoodPhrase[]>>>
  >;
}

export const huTaoMoodLines = moodLinesData as MoodLinesPack;

/** Active mistress mood pack (Furina / Hu Tao / …). */
export function getActiveMoodLines(): MoodLinesPack {
  return getActiveMistress().moodLines;
}

function pickFrom(list: MoodPhrase[], rng: () => number): MoodPhrase | null {
  if (list.length === 0) return null;
  return list[Math.floor(rng() * list.length)] ?? null;
}

/**
 * Random line for key+mood. Fallback order: mood → pack.defaultMood → any mood with lines.
 */
export function pickMoodLine(
  pack: MoodLinesPack,
  key: MoodPhraseKey,
  mood: MistressMood,
  rng: () => number = Math.random,
): MoodPhrase | null {
  const byMood = pack.lines[key];
  if (!byMood) return null;

  const primary = byMood[mood];
  if (primary && primary.length > 0) return pickFrom(primary, rng);

  const fallbackMood = byMood[pack.defaultMood];
  if (fallbackMood && fallbackMood.length > 0) {
    return pickFrom(fallbackMood, rng);
  }

  for (const m of MISTRESS_MOODS) {
    const list = byMood[m];
    if (list && list.length > 0) return pickFrom(list, rng);
  }

  return null;
}

export function isMistressMood(value: string): value is MistressMood {
  return (MISTRESS_MOODS as readonly string[]).includes(value);
}

export function isMoodPhraseKey(value: string): value is MoodPhraseKey {
  return (MOOD_PHRASE_KEYS as readonly string[]).includes(value);
}
