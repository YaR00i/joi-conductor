import huTaoPromptsData from "../../data/character/hu-tao-prompts.json";
import furinaPromptsData from "../../data/character/furina-prompts.json";
import sunnaPromptsData from "../../data/character/sunna-prompts.json";
import sparklePromptsData from "../../data/character/sparkle-prompts.json";
import type { SessionMood } from "./types";
import type { MoodPhraseKey } from "./voice/moodLines";
import { isHarshMood } from "./moodEngine";
import type { ChoiceAction } from "./choiceOffers";
import { isChoiceAction } from "./choiceOffers";
import { getActiveMistress } from "./mistress";
import type { MistressId } from "./mistress/types";

export type PromptKind =
  | "feeling"
  | "wager"
  | "confess"
  | "loyalty"
  | "obey"
  | "dare"
  | "equip"
  | "mood_offer"
  | "permission"
  | "finale_bias"
  | "choice";

export type DareTaskType =
  | "timed_report"
  | "cage_hijack"
  | "cum_eat_promise"
  | "edge_ad"
  | "dice_chaos"
  | "breath_challenge";

export type PromptEffect =
  | "feeling_good"
  | "feeling_bad"
  | "wager_yes"
  | "wager_no"
  | "mute"
  | "confess_like"
  | "confess_dislike"
  | "loyalty_yes"
  | "loyalty_no"
  | "obey_ok"
  | "obey_fail"
  | "dare_accept"
  | "dare_refuse"
  | "dare_done"
  | "dare_fail"
  | "promise_done"
  | "promise_fail"
  | "equip_yes"
  | "equip_no"
  | "mood_harsher"
  | "mood_softer"
  | "mood_horny"
  | "mood_refuse"
  | "beg_please"
  | "beg_skip"
  | "beg_deny_want"
  | "finale_want_cum"
  | "finale_want_deny"
  | "finale_want_ruin"
  | "choice_yes"
  | "choice_no";

export type WagerPool = "good" | "bad";

export type FetishPreferKey = string;

export type MistressPromptOption = {
  id: string;
  labelRu: string;
  effect: PromptEffect;
  preferKey?: FetishPreferKey;
};

export type MistressPromptDef = {
  id: string;
  kind: PromptKind;
  speakEn: string;
  labelRu: string;
  tags?: string;
  pool?: WagerPool;
  preferKeys?: FetishPreferKey[];
  loyaltySec?: number;
  /**
   * What «Да» does for loyalty prompts:
   * rest (default) | hold (edge hold turn) | tip (tip-only stroke turn).
   */
  loyaltyAction?: "rest" | "hold" | "tip";
  /** Mid-session choice offer («хочешь…?») — yes may open a roulette. */
  choiceAction?: ChoiceAction;
  correctOptionId?: string;
  taskType?: DareTaskType;
  taskSec?: number;
  taskCount?: number;
  instructionRu?: string;
  cageHours?: number;
  cageHoursMin?: number;
  cageHoursMax?: number;
  /** Catalog toy id for equip prompts */
  toyId?: string;
  /**
   * If set, prompt is preferred/allowed in these moods.
   * Empty/omitted = available in all moods (with lower weight when mismatched via heuristics).
   */
  moods?: SessionMood[];
  /**
   * Prefer this feeling prompt after these block goals finished
   * (hold / edge / ruin_attempt / stroke…), not always — soft weight boost.
   */
  afterGoals?: string[];
  options: MistressPromptOption[];
};

export type MistressPromptsPack = {
  feeling: MistressPromptDef[];
  wagerGood: MistressPromptDef[];
  wagerBad: MistressPromptDef[];
  confess?: MistressPromptDef[];
  loyalty?: MistressPromptDef[];
  obey?: MistressPromptDef[];
  dare?: MistressPromptDef[];
  equip?: MistressPromptDef[];
  wager?: MistressPromptDef[];
  moodOffer?: MistressPromptDef[];
  permission?: MistressPromptDef[];
  finaleBias?: MistressPromptDef[];
  choice?: MistressPromptDef[];
};

export type FetishPrefs = Record<string, number>;

export type PromptPickContext = {
  mood: SessionMood;
  prefs: FetishPrefs;
  excludeId?: string | null;
  /** Toy ids already equipped — filter equip pool */
  equippedToyIds?: string[];
  /** Whether any equip targets remain */
  canEquip?: boolean;
  /** Recent countable block goals (newest last) for contextual feeling. */
  recentGoals?: string[];
  /**
   * When true, boost feeling prompts whose afterGoals match recentGoals.
   * Typically rolled ~55% so context is common but not mandatory.
   */
  preferContextualFeeling?: boolean;
};

export const huTaoPrompts = huTaoPromptsData as MistressPromptsPack;
export const furinaPrompts = furinaPromptsData as MistressPromptsPack;
export const sunnaPrompts = sunnaPromptsData as MistressPromptsPack;
export const sparklePrompts = sparklePromptsData as MistressPromptsPack;

const PROMPTS_BY_ID: Record<MistressId, MistressPromptsPack> = {
  hu_tao: huTaoPrompts,
  furina: furinaPrompts,
  sunna: sunnaPrompts,
  sparkle: sparklePrompts,
};

/** Active mistress prompt bank (never cross-leaks Hu Tao onto other packs). */
export function activeMistressPrompts(): MistressPromptsPack {
  return PROMPTS_BY_ID[getActiveMistress().id];
}

export function wagerPoolForMood(mood: SessionMood): WagerPool {
  switch (mood) {
    case "sweet":
    case "horny":
    case "calm":
      return "good";
    case "cruel":
    case "chaotic":
    case "bored":
      return "bad";
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

export function wagerPoolFor(pool: WagerPool): MistressPromptDef[] {
  const pack = activeMistressPrompts();
  const taste = pool === "good" ? tasteWagerGood : tasteWagerBad;
  if (pool === "good") {
    const base = pack.wagerGood?.length
      ? pack.wagerGood
      : (pack.wager ?? []);
    return [...base, ...taste];
  }
  const base = pack.wagerBad?.length
    ? pack.wagerBad
    : (pack.wager ?? []);
  return [...base, ...taste, ...sessionSkipWagerBad];
}

/** Dynamic wagers from favorite tag stats (liked / unliked). */
let tasteWagerGood: MistressPromptDef[] = [];
let tasteWagerBad: MistressPromptDef[] = [];
/** Live bad-wager seeds from quickly skipped session media tags. */
let sessionSkipWagerBad: MistressPromptDef[] = [];

export function setTasteWagerPrompts(
  good: MistressPromptDef[],
  bad: MistressPromptDef[],
): void {
  tasteWagerGood = good;
  tasteWagerBad = bad;
}

export function clearTasteWagerPrompts(): void {
  tasteWagerGood = [];
  tasteWagerBad = [];
  sessionSkipWagerBad = [];
}

export function clearSessionSkipWagers(): void {
  sessionSkipWagerBad = [];
}

/** Merge quick-skip tag wagers into the live bad pool (dedupe by tag). */
export function appendSessionSkipWagers(defs: MistressPromptDef[]): void {
  if (defs.length === 0) return;
  const seen = new Set(
    sessionSkipWagerBad.map((d) => (d.preferKeys?.[0] ?? d.id).toLowerCase()),
  );
  for (const d of defs) {
    const key = (d.preferKeys?.[0] ?? d.id).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sessionSkipWagerBad.push(d);
  }
  // Cap so the pool stays manageable mid-session
  if (sessionSkipWagerBad.length > 16) {
    sessionSkipWagerBad = sessionSkipWagerBad.slice(-16);
  }
}

export function confessPool(): MistressPromptDef[] {
  return activeMistressPrompts().confess ?? [];
}

export function loyaltyPool(): MistressPromptDef[] {
  return activeMistressPrompts().loyalty ?? [];
}

export function obeyPool(): MistressPromptDef[] {
  return activeMistressPrompts().obey ?? [];
}

export function darePool(): MistressPromptDef[] {
  return activeMistressPrompts().dare ?? [];
}

export function moodOfferPool(): MistressPromptDef[] {
  return activeMistressPrompts().moodOffer ?? [];
}

export function permissionPool(): MistressPromptDef[] {
  return activeMistressPrompts().permission ?? [];
}

export function finaleBiasPool(): MistressPromptDef[] {
  return activeMistressPrompts().finaleBias ?? [];
}

export function choicePool(): MistressPromptDef[] {
  return (activeMistressPrompts().choice ?? []).filter(
    (p) => p.choiceAction && isChoiceAction(p.choiceAction),
  );
}

export function equipPool(equippedToyIds: string[] = []): MistressPromptDef[] {
  const all = activeMistressPrompts().equip ?? [];
  return all.filter(
    (p) => p.toyId && !equippedToyIds.includes(p.toyId),
  );
}

export function allMistressPrompts(): MistressPromptDef[] {
  const pack = activeMistressPrompts();
  return [
    ...pack.feeling,
    ...wagerPoolFor("good"),
    ...wagerPoolFor("bad"),
    ...confessPool(),
    ...loyaltyPool(),
    ...obeyPool(),
    ...darePool(),
    ...(pack.equip ?? []),
    ...moodOfferPool(),
    ...permissionPool(),
    ...finaleBiasPool(),
    ...choicePool(),
  ];
}

/** Hard filter: moods[] must include current mood (untagged = all). */
export function filterPoolByMood(
  pool: MistressPromptDef[],
  mood: SessionMood,
): MistressPromptDef[] {
  const matched = pool.filter(
    (p) => !p.moods || p.moods.length === 0 || p.moods.includes(mood),
  );
  return matched.length > 0 ? matched : pool;
}

/** Soft weight: tagged mismatch still possible but rare. */
export function promptMoodWeight(
  def: MistressPromptDef,
  mood: SessionMood,
): number {
  if (!def.moods || def.moods.length === 0) return 1;
  return def.moods.includes(mood) ? 3.5 : 0.12;
}

function poolForKind(
  kind: PromptKind,
  mood: SessionMood,
  equippedToyIds: string[],
): MistressPromptDef[] {
  switch (kind) {
    case "feeling":
      return filterPoolByMood(activeMistressPrompts().feeling, mood);
    case "wager":
      return wagerPoolFor(wagerPoolForMood(mood));
    case "confess":
      return filterPoolByMood(confessPool(), mood);
    case "loyalty":
      return filterPoolByMood(loyaltyPool(), mood);
    case "obey":
      return filterPoolByMood(obeyPool(), mood);
    case "dare":
      return filterPoolByMood(darePool(), mood);
    case "equip":
      return filterPoolByMood(equipPool(equippedToyIds), mood);
    case "mood_offer":
      return filterPoolByMood(moodOfferPool(), mood);
    case "permission":
      return filterPoolByMood(permissionPool(), mood);
    case "finale_bias":
      return filterPoolByMood(finaleBiasPool(), mood);
    case "choice":
      return filterPoolByMood(choicePool(), mood);
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function wagerWeight(
  def: MistressPromptDef,
  pool: WagerPool,
  prefs: FetishPrefs,
): number {
  const keys = def.preferKeys ?? [];
  if (keys.length === 0) return 1;
  let w = 1;
  for (const key of keys) {
    const score = prefs[key] ?? 0;
    if (pool === "good") {
      w += Math.max(0, score) * 2.5;
    } else {
      w += Math.max(0, -score) * 3.5;
      w += Math.max(0, score) * 0.6;
    }
  }
  return Math.max(0.2, w);
}

function pickWeighted(
  list: MistressPromptDef[],
  weights: number[],
  rng: () => number,
): MistressPromptDef {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    return list[Math.floor(rng() * list.length)] ?? list[0]!;
  }
  let roll = rng() * total;
  for (let i = 0; i < list.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return list[i]!;
  }
  return list[list.length - 1]!;
}

function feelingContextWeight(
  def: MistressPromptDef,
  recentGoals: string[] | undefined,
  preferContextual: boolean,
): number {
  if (!preferContextual) return 1;
  const goals = def.afterGoals;
  if (!goals || goals.length === 0) return 0.85;
  if (!recentGoals || recentGoals.length === 0) return 1;
  const recent = recentGoals.slice(-4);
  const edgeStreak = recent.filter((g) => g === "edge").length;
  let hit = goals.some((g) => recent.includes(g));
  // Extra: cum-urge after several edges even without explicit ruin
  if (
    !hit &&
    def.id === "feeling_cum_urge" &&
    (edgeStreak >= 2 || recent.includes("ruin_attempt"))
  ) {
    hit = true;
  }
  if (hit) {
    // Stronger boost if the *last* block matches
    const last = recent[recent.length - 1];
    return last && goals.includes(last) ? 7.5 : 4.2;
  }
  // Contextual roll active but this prompt doesn't match — demote a bit
  return 0.35;
}

export function pickMistressPrompt(
  kind: PromptKind | "any",
  rng: () => number = Math.random,
  ctx: PromptPickContext = { mood: "sweet", prefs: {} },
): MistressPromptDef {
  const {
    mood,
    prefs,
    excludeId,
    equippedToyIds = [],
    recentGoals,
    preferContextualFeeling = false,
  } = ctx;
  let pool: MistressPromptDef[];
  if (kind === "any") {
    const pack = activeMistressPrompts();
    pool = [
      ...filterPoolByMood(pack.feeling, mood),
      ...wagerPoolFor(wagerPoolForMood(mood)),
      ...filterPoolByMood(confessPool(), mood),
      ...filterPoolByMood(loyaltyPool(), mood),
      ...filterPoolByMood(obeyPool(), mood),
      ...filterPoolByMood(darePool(), mood),
      ...filterPoolByMood(equipPool(equippedToyIds), mood),
      ...filterPoolByMood(moodOfferPool(), mood),
      ...filterPoolByMood(permissionPool(), mood),
      ...filterPoolByMood(finaleBiasPool(), mood),
      ...filterPoolByMood(choicePool(), mood),
    ];
  } else {
    pool = poolForKind(kind, mood, equippedToyIds);
  }

  const filtered = excludeId ? pool.filter((p) => p.id !== excludeId) : pool;
  const list = filtered.length > 0 ? filtered : pool;
  if (list.length === 0) {
    return activeMistressPrompts().feeling[0]!;
  }

  const poolSide = wagerPoolForMood(mood);
  const useFeelingContext =
    preferContextualFeeling && (kind === "feeling" || kind === "any");
  const weights = list.map((d) => {
    let w = promptMoodWeight(d, mood);
    if (d.kind === "wager" || kind === "wager") {
      w *= wagerWeight(d, poolSide, prefs);
    }
    if (d.kind === "feeling" && useFeelingContext) {
      w *= feelingContextWeight(d, recentGoals, true);
    }
    // Harsh moods prefer meaner dare types
    if (d.kind === "dare" && d.taskType) {
      const harsh = isHarshMood(mood) || mood === "bored";
      if (d.taskType === "cage_hijack" || d.taskType === "edge_ad") {
        w *= harsh ? 2.2 : 0.45;
      }
      if (d.taskType === "dice_chaos") {
        w *= mood === "chaotic" || harsh ? 2.5 : 0.55;
      }
      if (d.taskType === "cum_eat_promise") {
        w *= harsh || mood === "horny" ? 1.6 : 0.7;
      }
    }
    return w;
  });
  return pickWeighted(list, weights, rng);
}

export function rollPromptKind(
  rng: () => number = Math.random,
  prefs: FetishPrefs = {},
  opts: {
    canEquip?: boolean;
    mood?: SessionMood;
    begCredits?: number;
    nearFinale?: boolean;
  } = {},
): PromptKind {
  const hasPrefs = Object.keys(prefs).length > 0;
  const hasDare = darePool().length > 0;
  const canEquip = Boolean(opts.canEquip) && equipPool().length > 0;
  const hasMoodOffer = moodOfferPool().length > 0;
  const hasPermission =
    permissionPool().length > 0 && (opts.begCredits ?? 0) > 0;
  const hasFinaleBias =
    Boolean(opts.nearFinale) && finaleBiasPool().length > 0;
  const hasChoice = choicePool().length > 0;
  const mood = opts.mood ?? "calm";
  const harsh = isHarshMood(mood) || mood === "bored";
  const soft = mood === "sweet" || mood === "horny" || mood === "calm";
  const r = rng();

  if (hasFinaleBias && r < 0.22) return "finale_bias";
  if (hasPermission && r < 0.18) return "permission";
  if (hasMoodOffer && r < 0.28) return "mood_offer";
  // Voluntary «хочешь…?» offers — common between turns
  if (hasChoice && r < 0.34) return "choice";

  if (harsh) {
    if (canEquip && r < 0.42) return "equip";
    if (hasChoice && r < 0.52) return "choice";
    if (r < 0.58) return "feeling";
    if (r < 0.66) return "wager";
    if (r < (hasPrefs ? 0.72 : 0.76)) return "confess";
    if (r < 0.82) return "loyalty";
    if (r < 0.9) return "obey";
    if (hasDare) return "dare";
    return canEquip ? "equip" : "loyalty";
  }

  if (soft) {
    if (canEquip && r < 0.38) return "equip";
    if (hasChoice && r < 0.52) return "choice";
    if (r < 0.62) return "feeling";
    if (r < 0.74) return "wager";
    if (r < (hasPrefs ? 0.8 : 0.85)) return "confess";
    if (r < 0.9) return "loyalty";
    if (r < 0.94) return "obey";
    if (hasDare) return "dare";
    return canEquip ? "equip" : "feeling";
  }

  if (canEquip && r < 0.28) return "equip";
  if (hasChoice && r < 0.42) return "choice";
  if (r < 0.52) return "feeling";
  if (r < 0.64) return "wager";
  if (r < (hasPrefs ? 0.72 : 0.78)) return "confess";
  if (r < 0.86) return "loyalty";
  if (r < 0.92) return "obey";
  if (hasDare) return "dare";
  return canEquip ? "equip" : "loyalty";
}

export function applyPreferDelta(
  prefs: FetishPrefs,
  key: string | undefined,
  delta: number,
): FetishPrefs {
  if (!key) return prefs;
  const next = { ...prefs };
  next[key] = (next[key] ?? 0) + delta;
  return next;
}

export function resolveCageHours(
  def: Pick<
    MistressPromptDef,
    "cageHours" | "cageHoursMin" | "cageHoursMax"
  >,
  mood: SessionMood,
  rng: () => number = Math.random,
): number {
  const min = def.cageHoursMin ?? def.cageHours ?? 2;
  const max = def.cageHoursMax ?? def.cageHours ?? Math.max(min, 4);
  const base = min + rng() * (max - min);
  const harsh =
    mood === "cruel" || mood === "chaotic" || mood === "bored";
  const hours = harsh ? (base + max) / 2 : (base + min) / 2;
  return Math.round(hours * 2) / 2;
}

export function answerPhraseKey(effect: PromptEffect): MoodPhraseKey {
  switch (effect) {
    case "feeling_good":
    case "confess_like":
    case "obey_ok":
    case "dare_done":
    case "promise_done":
    case "equip_yes":
    case "mood_softer":
    case "mood_horny":
    case "beg_please":
    case "finale_want_cum":
      return "prompt_answer_good";
    case "feeling_bad":
    case "confess_dislike":
    case "obey_fail":
    case "dare_fail":
    case "promise_fail":
    case "mood_harsher":
    case "beg_deny_want":
    case "finale_want_deny":
      return "prompt_answer_bad";
    case "wager_yes":
    case "loyalty_yes":
    case "dare_accept":
    case "finale_want_ruin":
    case "choice_yes":
      return "prompt_answer_yes";
    case "wager_no":
    case "loyalty_no":
    case "dare_refuse":
    case "equip_no":
    case "mood_refuse":
    case "beg_skip":
    case "choice_no":
      return "prompt_answer_no";
    case "mute":
      return "prompt_answer_mute";
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}

export function moodDeltaForEffect(effect: PromptEffect): number {
  switch (effect) {
    case "feeling_good":
      return 1;
    case "feeling_bad":
      return -1;
    case "wager_yes":
      return 1;
    case "wager_no":
      return -1;
    case "mute":
      return -2;
    case "confess_like":
      return 1;
    case "confess_dislike":
      return 0;
    case "loyalty_yes":
      return 1;
    case "loyalty_no":
      return -1;
    case "obey_ok":
      return 2;
    case "obey_fail":
      return -2;
    case "dare_accept":
      return 1;
    case "dare_refuse":
      return -1;
    case "dare_done":
      return 2;
    case "dare_fail":
      return -2;
    case "promise_done":
      return 2;
    case "promise_fail":
      return -2;
    case "equip_yes":
      return 1;
    case "equip_no":
      return -1;
    case "mood_harsher":
      return -2;
    case "mood_softer":
      return 2;
    case "mood_horny":
      return -1; // toward needy / less "sweet" pride
    case "mood_refuse":
      return 0;
    case "beg_please":
      return 1;
    case "beg_skip":
      return -1;
    case "beg_deny_want":
      return -1;
    case "finale_want_cum":
      return 1;
    case "finale_want_deny":
      return -1;
    case "finale_want_ruin":
      return 0;
    case "choice_yes":
      return 1;
    case "choice_no":
      return 0;
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}

/**
 * Soft answers that may fade after a few seconds.
 * Never fade equip / loyalty accepts — physical setup takes time.
 * Never fade mood-offer Да/Нет — same action, need a stable choice.
 */
export function isMercyFadeEffect(effect: PromptEffect): boolean {
  switch (effect) {
    case "beg_please":
    case "feeling_good":
    case "obey_ok":
    case "confess_like":
    case "finale_want_cum":
    case "wager_yes":
      return true;
    case "feeling_bad":
    case "wager_no":
    case "mute":
    case "confess_dislike":
    case "loyalty_yes":
    case "loyalty_no":
    case "obey_fail":
    case "dare_accept":
    case "dare_refuse":
    case "dare_done":
    case "dare_fail":
    case "promise_done":
    case "promise_fail":
    case "equip_yes":
    case "equip_no":
    case "mood_harsher":
    case "mood_softer":
    case "mood_horny":
    case "mood_refuse":
    case "beg_skip":
    case "beg_deny_want":
    case "finale_want_deny":
    case "finale_want_ruin":
    case "choice_yes":
    case "choice_no":
      return false;
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}

export function promptKindLabelRu(kind: PromptKind): string {
  switch (kind) {
    case "feeling":
      return `${getActiveMistress().displayNameRu} спрашивает`;
    case "wager":
      return "Ставка";
    case "confess":
      return "Признайся";
    case "loyalty":
      return "Проверка лояльности";
    case "obey":
      return "Проверка послушания";
    case "dare":
      return "Команда";
    case "equip":
      return "Надень / вставь";
    case "mood_offer":
      return "Настроение";
    case "permission":
      return "Умолять?";
    case "finale_bias":
      return "Финал";
    case "choice":
      return "Предложение";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
