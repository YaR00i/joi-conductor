import { pickFallbackLine, type CharacterBible } from "../character";
import { splitControlReply } from "./control/actions";
import { parseJsonObject } from "./json";
import { clipSpokenReply, stripThinkBlocks } from "./llmSettings";
import { detectSoulTurnSubjects } from "./conversationMode";
import { stanceSubjectFromTurnSubject } from "./stance";

export const SOUL_SPEECH_FAIL_REASONS = [
  "empty",
  "think_only",
  "json_only",
  "prompt_echo",
  "repeat",
  "meta",
  "action_json",
  "wrong_language",
  "hard_boundary",
] as const;
export type SoulSpeechFailReason = (typeof SOUL_SPEECH_FAIL_REASONS)[number];

export type SoulSpeechValidation = {
  ok: boolean;
  reason?: SoulSpeechFailReason;
  text?: string;
};

const REPEAT_RETRY_HINT =
  "Your previous wording was too similar. Keep the meaning, but respond naturally with different wording and rhythm. Do not mention this instruction.";

export function soulRepeatRetryHint(): string {
  return REPEAT_RETRY_HINT;
}

export function normalizeSoulSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[\s«»"'`*_~.,!?…:;()\-—–]+/g, " ")
    .trim();
}

export function sanitizeSoulSpeech(raw: string): string {
  let text = stripThinkBlocks(raw);
  text = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^\s*(?:Assistant|Character|System|User|Госпожа)\s*:\s*/i, "")
    .replace(/\/(?:no_)?think\b/gi, "")
    .trim();
  return clipSpokenReply(text);
}

function looksLikeJsonOnly(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  const parsed = parseJsonObject(trimmed);
  if (parsed) {
    return true;
  }
  return /^{\s*"/.test(trimmed) && trimmed.length < 800;
}

function looksLikePromptEcho(text: string): boolean {
  if (
    /\[(IDENTITY|RELATIONSHIP|CURRENT STATE|TURN INTENT|PLAY VOICE|RELEVANT USER STANCE|LIVE CONTEXT|RELEVANT MEMORY|APPEARANCE|BEHAVIOR RULES)\]/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/---\s*(IDENTITY|RELATIONSHIP|CURRENT STATE|TURN INTENT|PLAY VOICE|RELEVANT USER STANCE|LIVE CONTEXT|RELEVANT MEMORY|APPEARANCE|BEHAVIOR RULES|MEMORY\.md|USER\.md|CONTROL|USER STANCE|INTENT|RECENT CONTINUITY)\s*---/i.test(text)) {
    return true;
  }
  if (/You are the Soul Memory Router/i.test(text)) return true;
  if (/You are a state update classifier/i.test(text)) return true;
  if (/Reply with ONLY one JSON object/i.test(text)) return true;
  if (/\/(?:no_)?think\b/i.test(text) && text.length < 80) return true;
  return false;
}

function looksLikeMeta(text: string): boolean {
  const t = text.trim();
  if (/^(as an ai|i am an (?:ai|assistant)|as a language model)/i.test(t)) {
    return true;
  }
  if (/^\s*\{[\s\S]*"text"\s*:/.test(t)) return true;
  return false;
}

function trigrams(text: string): Set<string> {
  const words = normalizeSoulSpeech(text).split(" ").filter((w) => w.length > 1);
  const out = new Set<string>();
  if (words.length < 3) {
    if (words.length > 0) out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i <= words.length - 3; i += 1) {
    out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return out;
}

const WANT_TEMPLATE = /хочешь[, ]+(чтобы|чтоб)\s+я/i;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((row) => normalizeSoulSpeech(row))
    .filter((row) => row.length >= 12);
}

function hasInternalSentenceRepeat(text: string): boolean {
  const counts = new Map<string, number>();
  for (const sentence of splitSentences(text)) {
    const count = (counts.get(sentence) ?? 0) + 1;
    if (count >= 2 && sentence.length >= 24) return true;
    if (count >= 3) return true;
    counts.set(sentence, count);
  }
  return false;
}

export function speechRepeatScore(a: string, b: string): number {
  const na = normalizeSoulSpeech(a);
  const nb = normalizeSoulSpeech(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const prefixLen = Math.min(48, na.length, nb.length);
  if (prefixLen >= 24 && na.slice(0, prefixLen) === nb.slice(0, prefixLen)) {
    return 0.92;
  }
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

function signaturePhraseRepeat(text: string, recent: readonly string[]): boolean {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return false;
  const window = recent.slice(-4);
  for (const sent of sentences) {
    const prefix = sent.slice(0, 24);
    let hits = 0;
    for (const prev of window) {
      const prevSentences = splitSentences(prev);
      if (prevSentences.includes(sent) || normalizeSoulSpeech(prev).includes(sent)) {
        hits += 1;
      }
      if (prefix.length >= 18) {
        for (const ps of prevSentences) {
          if (ps.slice(0, 24) === prefix) hits += 1;
        }
      }
    }
    if (hits >= 1 && sent.length >= 18) return true;
    if (hits >= 2) return true;
  }
  return false;
}

function repeatedQuestionMove(text: string, recent: readonly string[]): boolean {
  if (WANT_TEMPLATE.test(text)) {
    return recent.slice(-4).some((prev) => WANT_TEMPLATE.test(prev));
  }
  if (!/[?？]\s*$/.test(text.trim())) return false;
  const ending = normalizeSoulSpeech(text).slice(-36);
  if (ending.length < 16) return false;
  let hits = 0;
  for (const prev of recent.slice(-4)) {
    if (!/[?？]\s*$/.test(prev.trim())) continue;
    if (normalizeSoulSpeech(prev).slice(-36) === ending) hits += 1;
  }
  return hits >= 2;
}

export function isRepeatSpeech(
  text: string,
  recent: readonly string[],
  threshold = 0.82,
): boolean {
  const normalized = normalizeSoulSpeech(text);
  if (!normalized) return false;
  if (hasInternalSentenceRepeat(text)) return true;
  if (signaturePhraseRepeat(text, recent)) return true;
  if (repeatedQuestionMove(text, recent)) return true;
  let prefixHits = 0;
  const prefix = normalized.slice(0, 36);
  for (const prev of recent.slice(-4)) {
    if (speechRepeatScore(text, prev) >= threshold) return true;
    const np = normalizeSoulSpeech(prev);
    if (prefix.length >= 24 && np.startsWith(prefix)) prefixHits += 1;
  }
  return prefixHits >= 3;
}

export function validateSoulSpeech(
  raw: string,
  opts?: {
    recent?: readonly string[];
    expectedLanguage?: "ru" | "en";
    forbiddenSubjects?: readonly string[];
  },
): SoulSpeechValidation {
  if (splitControlReply(stripThinkBlocks(raw)).actions.length > 0) {
    return { ok: false, reason: "action_json" };
  }
  const text = sanitizeSoulSpeech(raw);
  if (!text) {
    return {
      ok: false,
      reason: /<\/?think/i.test(raw) ? "think_only" : "empty",
    };
  }
  if (looksLikeJsonOnly(text) || looksLikeJsonOnly(raw)) {
    return { ok: false, reason: "json_only" };
  }
  if (looksLikePromptEcho(text)) {
    return { ok: false, reason: "prompt_echo" };
  }
  if (looksLikeMeta(text)) {
    return { ok: false, reason: "meta" };
  }
  if (opts?.expectedLanguage === "ru") {
    if (!/[а-яё]/i.test(text) || /[\u3400-\u9fff]/u.test(text)) {
      return { ok: false, reason: "wrong_language", text };
    }
  } else if (opts?.expectedLanguage === "en") {
    if (!/[a-z]/i.test(text) || /[а-яё\u3400-\u9fff]/iu.test(text)) {
      return { ok: false, reason: "wrong_language", text };
    }
  }
  if (opts?.forbiddenSubjects?.length) {
    const mentioned = detectSoulTurnSubjects(text)
      .map(stanceSubjectFromTurnSubject)
      .filter((subject): subject is string => Boolean(subject));
    if (mentioned.some((subject) => opts.forbiddenSubjects?.includes(subject))) {
      return { ok: false, reason: "hard_boundary", text };
    }
  }
  if (
    hasInternalSentenceRepeat(stripThinkBlocks(raw)) ||
    isRepeatSpeech(text, opts?.recent ?? [])
  ) {
    return { ok: false, reason: "repeat", text };
  }
  return { ok: true, text };
}

export function fallbackSoulSpeech(
  bible: CharacterBible,
  language: "ru" | "en" = "ru",
): string {
  if (language === "en") return "I'm here. Say that again — briefly.";
  return (
    pickFallbackLine(bible, "chat") ??
    pickFallbackLine(bible, "rest") ??
    `${bible.nameRu} тут. Скажи ещё раз — коротко.`
  );
}
