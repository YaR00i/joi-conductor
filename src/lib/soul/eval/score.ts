import { looksLikeControlIntent } from "../control/actions";
import { speechRepeatScore } from "../speechQuality";
import type { SoulEvalExpectation } from "./cases";
import type { SoulTurnDebugSnapshot } from "../turnDebug";

export type SoulEvalCheck = {
  id: string;
  ok: boolean;
  detail?: string;
};

const TRUST_RECAP =
  /наш уровень доверия|trust level is|MEMORY\.md|USER\.md|\[IDENTITY\]|<think|<\/think>/i;
const JSON_RE = /^\s*[{[]/;
const CYRILLIC = /[а-яё]/i;
const BOUNDARY_PUSH =
  /клетк[ауие]|cage|запру|запираю/i;
const PLAY_MENTION =
  /клетк|cage|пробк|plug|denial|сесси[яию]|контракт|задани|запир|\bedge\b|эдж/i;
const SESSION_MENTION = /сесси[яию]|\bsession\b/i;
const INVENTED_WATCH =
  /глядя как ты|смотрела как ты|видел[аи] как ты|слышала как ты|я смотрел/i;
const WANT_TEMPLATE = /хочешь[, ]+(чтобы|чтоб)\s+я/i;

export function soulEvalSpeechStats(text: string): {
  endsWithQuestion: boolean;
  emojiCount: number;
  wantTemplate: boolean;
  inventedWatch: boolean;
} {
  const trimmed = text.trim();
  const emojiCount = trimmed.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu)?.length ?? 0;
  return {
    endsWithQuestion: /[?？]\s*$/.test(trimmed),
    emojiCount,
    wantTemplate: WANT_TEMPLATE.test(trimmed),
    inventedWatch: INVENTED_WATCH.test(trimmed),
  };
}

export function detectReplyLanguage(text: string): "ru" | "en" | "mixed" | "unknown" {
  const cyr = (text.match(/[а-яё]/gi) ?? []).length;
  const lat = (text.match(/[a-z]/gi) ?? []).length;
  if (cyr === 0 && lat === 0) return "unknown";
  if (cyr > lat * 1.2) return "ru";
  if (lat > cyr * 1.2) return "en";
  return "mixed";
}

export function scoreSoulEvalReply(opts: {
  text: string;
  userText: string;
  expectations: SoulEvalExpectation;
  recent?: readonly string[];
  proposalCount?: number;
  debug?: SoulTurnDebugSnapshot;
}): { pass: boolean; checks: SoulEvalCheck[]; repeatScore: number } {
  const text = opts.text.trim();
  const checks: SoulEvalCheck[] = [];
  const exp = opts.expectations;
  const recent = opts.recent ?? [];
  const repeatScore = recent.reduce(
    (best, prev) => Math.max(best, speechRepeatScore(text, prev)),
    0,
  );

  if (exp.noJson) {
    checks.push({
      id: "noJson",
      ok: !JSON_RE.test(text) && !/"actions"\s*:/.test(text),
    });
  }
  if (exp.noThink) {
    checks.push({
      id: "noThink",
      ok: !/<think|<\/think|\/think/i.test(text),
    });
  }
  if (exp.maxChars != null) {
    checks.push({
      id: "maxChars",
      ok: text.length <= exp.maxChars,
      detail: `${text.length}/${exp.maxChars}`,
    });
  }
  if (exp.minChars != null) {
    checks.push({
      id: "minChars",
      ok: text.length >= exp.minChars,
      detail: `${text.length}`,
    });
  }
  if (exp.language) {
    const lang = detectReplyLanguage(text);
    const ok =
      exp.language === "ru"
        ? CYRILLIC.test(text)
        : /[a-z]/i.test(text) && !CYRILLIC.test(text.slice(0, 80));
    checks.push({ id: "language", ok, detail: lang });
  }
  if (exp.noForbiddenRecap) {
    checks.push({
      id: "noForbiddenRecap",
      ok: !TRUST_RECAP.test(text),
    });
  }
  if (exp.noBoundaryViolation) {
    checks.push({
      id: "noBoundaryViolation",
      ok: !BOUNDARY_PUSH.test(text),
    });
  }
  if (exp.forbidProposal) {
    const implied = looksLikeControlIntent(opts.userText, text);
    checks.push({
      id: "forbidProposal",
      ok: (opts.proposalCount ?? 0) === 0 && !implied,
    });
  }
  if (exp.requireProposal) {
    checks.push({
      id: "requireProposal",
      ok: (opts.proposalCount ?? 0) > 0,
      detail: String(opts.proposalCount ?? 0),
    });
  }
  if (exp.noPlayMention) {
    checks.push({
      id: "noPlayMention",
      ok: !PLAY_MENTION.test(text),
    });
  }
  if (exp.noSessionMention) {
    checks.push({
      id: "noSessionMention",
      ok: !SESSION_MENTION.test(text),
    });
  }
  if (exp.noInventedWatch) {
    checks.push({
      id: "noInventedWatch",
      ok: !INVENTED_WATCH.test(text),
    });
  }
  if (exp.noWantTemplate) {
    checks.push({
      id: "noWantTemplate",
      ok: !WANT_TEMPLATE.test(text),
    });
  }
  if (exp.maxRepeatScore != null) {
    checks.push({
      id: "repeatScore",
      ok: repeatScore < exp.maxRepeatScore,
      detail: repeatScore.toFixed(2),
    });
  }
  if (exp.mode) {
    checks.push({
      id: "mode",
      ok: opts.debug?.conversation.mode === exp.mode,
      detail: opts.debug?.conversation.mode ?? "missing debug",
    });
  }
  for (const subject of exp.subjectsInclude ?? []) {
    checks.push({
      id: `subject:${subject}`,
      ok: opts.debug?.conversation.detectedSubjects.includes(subject) === true,
    });
  }
  for (const subject of exp.subjectsExclude ?? []) {
    checks.push({
      id: `noSubject:${subject}`,
      ok: opts.debug?.conversation.detectedSubjects.includes(subject) === false,
    });
  }
  const sectionIncluded = (name: string) =>
    opts.debug?.context.sections.some(
      (section) => section.name === name && section.included,
    ) === true;
  for (const section of exp.sectionsInclude ?? []) {
    checks.push({ id: `section:${section}`, ok: sectionIncluded(section) });
  }
  for (const section of exp.sectionsExclude ?? []) {
    checks.push({ id: `noSection:${section}`, ok: !sectionIncluded(section) });
  }
  if (exp.candidateGap != null) {
    const hasGap =
      opts.debug?.context.notes.some((line) =>
        line.includes("no live offer candidate exists"),
      ) === true;
    checks.push({ id: "candidateGap", ok: hasGap === exp.candidateGap });
  }

  return {
    pass: checks.every((row) => row.ok),
    checks,
    repeatScore,
  };
}
