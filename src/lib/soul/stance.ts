import { sessionKindLabelRu } from "./control/catalog";
import type { MistressSessionKind } from "./control/types";
import { MISTRESS_SESSION_KINDS } from "./control/types";
import {
  SOUL_STANCE_SLICE_CAP,
  SOUL_STANCES_CAP,
  isUserStanceKind,
  isUserStanceSource,
  type SoulCharacterIntent,
  type SoulWorldEvent,
  type UserStance,
  type UserStanceKind,
  type UserStanceSource,
} from "./types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export type StanceUpdateInput = {
  subject: string;
  kind: string;
  evidence?: string;
  explicit?: boolean;
};

export type StanceMemoryView = {
  boundaries: string[];
  likes: string[];
  curious: string[];
  refuses: string[];
};

const SUBJECT_ALIASES: Record<string, string> = {
  edge: "edges",
  edges: "edges",
  edging: "edges",
  "edge play": "edges",
  эдж: "edges",
  эджи: "edges",
  эджинг: "edges",
  cage: "cage",
  клетка: "cage",
  клетку: "cage",
  клетки: "cage",
  клетке: "cage",
  chastity: "cage",
  plug: "plug",
  пробка: "plug",
  пробку: "plug",
  пробки: "plug",
  пробке: "plug",
  denial: "denial",
  deny: "denial",
  отказ: "denial",
  oral: "oral",
  орал: "oral",
  cei: "oral",
  hump: "hump",
  cbt: "cbt",
  session: "session",
  сессия: "session",
  сессию: "session",
  сессии: "session",
  checkin: "checkin",
  "check-in": "checkin",
  contract: "contract",
  контракт: "contract",
};

const QUEST_IDS = new Set([
  "ball_taps",
  "edge_rush",
  "stroke_count",
  "hands_off",
  "fetish_focus",
  "slow_edge",
  "bpm_sync",
]);

const SESSION_KIND_SET = new Set<string>(MISTRESS_SESSION_KINDS);

const CANONICAL_PLAY_SUBJECTS = new Set<string>([
  ...Object.values(SUBJECT_ALIASES),
  ...MISTRESS_SESSION_KINDS,
]);

/** Too generic to treat a habit line as play by itself. */
const GENERIC_HABIT_ALIASES = new Set(["отказ"]);

const PLAY_HABIT_MARKERS = [
  "ruin",
  "руина",
  "руину",
  "fetish",
  "фетиш",
  "joi",
  "safeword",
  "dildo",
  "never offer",
  "никогда не предлагай",
  "hard boundary",
  "hard limit",
];

function unchanged(stances: readonly UserStance[]): UserStance[] {
  return stances as UserStance[];
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function normalizeStanceSubject(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase().replace(/['"«»]/g, "");
  if (!trimmed) return null;
  const collapsed = trimmed.replace(/\s+/g, " ");
  const aliased = SUBJECT_ALIASES[collapsed];
  if (aliased) return aliased;
  if (SESSION_KIND_SET.has(collapsed)) return collapsed;
  if (QUEST_IDS.has(collapsed)) return `quest:${collapsed}`;
  const quest = collapsed.match(/^quest[:\s_-]+([a-z0-9_]+)$/);
  if (quest?.[1]) return `quest:${quest[1]}`;
  const slug = collapsed
    .replace(/[^a-z0-9а-яё]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  if (!slug || slug.length < 2) return null;
  if (SUBJECT_ALIASES[slug]) return SUBJECT_ALIASES[slug];
  return slug;
}

export function stanceSubjectFromTurnSubject(subject: string): string | null {
  switch (subject) {
    case "wear:cage":
      return "cage";
    case "wear:plug":
      return "plug";
    case "edging":
      return "edges";
    case "cei":
      return "oral";
    case "session":
    case "masturbation":
    case "orgasm":
    case "denial":
    case "ruin":
    case "checkin":
    case "task":
    case "contract":
      return subject;
    case "appearance":
    case "clothing":
    case "work":
    case "games":
    case "mood":
      return null;
    default:
      return null;
  }
}

function escapePhrase(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseInLine(line: string, phrase: string): boolean {
  const needle = phrase.trim().toLowerCase();
  if (!needle) return false;
  const re = new RegExp(
    `(^|[^a-z0-9а-яё])${escapePhrase(needle)}(?=[^a-z0-9а-яё]|$)`,
    "i",
  );
  return re.test(line);
}

export function isCanonicalPlaySubject(subject: string): boolean {
  if (CANONICAL_PLAY_SUBJECTS.has(subject)) return true;
  if (SESSION_KIND_SET.has(subject)) return true;
  return subject.startsWith("quest:");
}

export function isPlayPreferenceHabit(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  const whole = normalizeStanceSubject(trimmed);
  if (whole && isCanonicalPlaySubject(whole)) return true;
  for (const [alias, canonical] of Object.entries(SUBJECT_ALIASES)) {
    if (GENERIC_HABIT_ALIASES.has(alias)) continue;
    if (!isCanonicalPlaySubject(canonical)) continue;
    if (phraseInLine(lower, alias)) return true;
  }
  for (const kind of MISTRESS_SESSION_KINDS) {
    if (phraseInLine(lower, kind)) return true;
    if (phraseInLine(lower, kind.replace(/_/g, " "))) return true;
  }
  for (const questId of QUEST_IDS) {
    if (phraseInLine(lower, questId)) return true;
  }
  for (const marker of PLAY_HABIT_MARKERS) {
    if (phraseInLine(lower, marker)) return true;
  }
  return false;
}

export function everydayHabitsFrom(
  lines: readonly string[],
): string[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isPlayPreferenceHabit(line))
    .slice(0, 8);
}

export function stanceSubjectLabelRu(subject: string): string {
  if (SESSION_KIND_SET.has(subject)) {
    return sessionKindLabelRu(subject as MistressSessionKind);
  }
  switch (subject) {
    case "session":
      return "сессия";
    case "cage":
      return "клетка";
    case "plug":
      return "пробка";
    case "denial":
      return "denial";
    case "cbt":
      return "CBT";
    case "contract":
      return "контракты";
    case "checkin":
      return "check-in";
    default:
      break;
  }
  if (subject.startsWith("quest:")) return subject.slice(6).replace(/_/g, " ");
  return subject.replace(/_/g, " ");
}

function decayMs(kind: UserStanceKind): number | null {
  switch (kind) {
    case "hard_boundary":
      return null;
    case "disliked_once":
      return 3 * DAY;
    case "curious_about":
      return 21 * DAY;
    case "liked":
      return 45 * DAY;
    case "often_refuses":
    case "struggles_with":
    case "responds_well_to":
      return 21 * DAY;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function effectiveStanceConfidence(
  stance: UserStance,
  nowMs: number,
): number {
  if (stance.kind === "hard_boundary") return Math.max(stance.confidence, 0.9);
  const ttl = decayMs(stance.kind);
  if (ttl == null) return clamp01(stance.confidence);
  const age = Math.max(0, nowMs - stance.lastEvidenceAtMs);
  if (age >= ttl) return 0;
  return clamp01(stance.confidence * (1 - age / ttl));
}

export function isStanceActive(stance: UserStance, nowMs: number): boolean {
  if (stance.kind === "hard_boundary") return true;
  return effectiveStanceConfidence(stance, nowMs) >= 0.15;
}

function baseConfidence(kind: UserStanceKind, explicit: boolean): number {
  switch (kind) {
    case "hard_boundary":
      return 0.95;
    case "liked":
      return explicit ? 0.75 : 0.45;
    case "curious_about":
      return explicit ? 0.55 : 0.35;
    case "often_refuses":
      return 0.6;
    case "struggles_with":
      return 0.5;
    case "responds_well_to":
      return 0.5;
    case "disliked_once":
      return explicit ? 0.4 : 0.25;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function sameSubject(a: UserStance, subject: string): boolean {
  return a.subject === subject;
}

function findStance(
  stances: readonly UserStance[],
  subject: string,
  kind: UserStanceKind,
): UserStance | undefined {
  return stances.find((row) => row.subject === subject && row.kind === kind);
}

function dropKinds(
  stances: readonly UserStance[],
  subject: string,
  kinds: readonly UserStanceKind[],
): UserStance[] {
  const drop = new Set(kinds);
  return stances.filter((row) => !(row.subject === subject && drop.has(row.kind)));
}

function upsert(
  stances: readonly UserStance[],
  next: UserStance,
): UserStance[] {
  const without = stances.filter(
    (row) => !(row.subject === next.subject && row.kind === next.kind),
  );
  return [...without, next].slice(-SOUL_STANCES_CAP);
}

function bump(
  prev: UserStance | undefined,
  draft: Omit<UserStance, "evidenceCount" | "confidence"> & {
    confidence: number;
  },
  evidenceKey: string,
): UserStance {
  if (prev && prev.evidenceKey === evidenceKey) return prev;
  const count = (prev?.evidenceCount ?? 0) + 1;
  const confidence = clamp01(
    Math.max(draft.confidence, (prev?.confidence ?? 0) + 0.08),
  );
  return {
    ...draft,
    confidence,
    evidenceCount: count,
    evidenceKey,
  };
}

export function applyStanceUpdate(
  stances: readonly UserStance[],
  input: {
    subject: string;
    kind: UserStanceKind;
    source: UserStanceSource;
    atMs: number;
    explicit?: boolean;
    evidenceKey: string;
    note?: string;
  },
): UserStance[] {
  const subject = normalizeStanceSubject(input.subject);
  if (!subject) return unchanged(stances);
  const explicit = input.explicit === true;
  const existing = stances.filter((row) => sameSubject(row, subject));
  const hard = existing.find((row) => row.kind === "hard_boundary");

  if (input.kind !== "hard_boundary" && hard && !explicit) {
    return unchanged(stances);
  }

  if (input.kind === "hard_boundary") {
    const next = bump(findStance(stances, subject, "hard_boundary"), {
      subject,
      kind: "hard_boundary",
      source: input.source,
      lastEvidenceAtMs: input.atMs,
      confidence: baseConfidence("hard_boundary", true),
      ...(input.note ? { note: input.note } : {}),
    }, input.evidenceKey);
    if (next === findStance(stances, subject, "hard_boundary")) return unchanged(stances);
    return upsert(
      dropKinds(stances, subject, [
        "liked",
        "disliked_once",
        "often_refuses",
        "curious_about",
        "responds_well_to",
      ]),
      next,
    );
  }

  if (
    explicit &&
    hard &&
    (input.kind === "liked" || input.kind === "curious_about")
  ) {
    const lifted = dropKinds(stances, subject, ["hard_boundary"]);
    return applyStanceUpdate(lifted, input);
  }

  if (input.kind === "liked" && explicit) {
    const cleaned = dropKinds(stances, subject, [
      "disliked_once",
      "often_refuses",
    ]);
    const next = bump(findStance(cleaned, subject, "liked"), {
      subject,
      kind: "liked",
      source: input.source,
      lastEvidenceAtMs: input.atMs,
      confidence: baseConfidence("liked", true),
      ...(input.note ? { note: input.note } : {}),
    }, input.evidenceKey);
    if (next === findStance(cleaned, subject, "liked")) return cleaned;
    return upsert(cleaned, next);
  }

  if (input.kind === "curious_about" && explicit) {
    const next = bump(findStance(stances, subject, "curious_about"), {
      subject,
      kind: "curious_about",
      source: input.source,
      lastEvidenceAtMs: input.atMs,
      confidence: baseConfidence("curious_about", true),
      ...(input.note ? { note: input.note } : {}),
    }, input.evidenceKey);
    if (next === findStance(stances, subject, "curious_about")) {
      return unchanged(stances);
    }
    return upsert(stances, next);
  }

  if (input.kind === "disliked_once") {
    const liked = existing.find((row) => row.kind === "liked");
    if (liked && liked.confidence >= 0.5 && !explicit) return unchanged(stances);
    const refuses = findStance(stances, subject, "often_refuses");
    const prev = findStance(stances, subject, "disliked_once");
    if (refuses) {
      const nextRefuse = bump(refuses, {
        subject,
        kind: "often_refuses",
        source: input.source,
        lastEvidenceAtMs: input.atMs,
        confidence: baseConfidence("often_refuses", explicit),
      }, input.evidenceKey);
      if (nextRefuse === refuses) return unchanged(stances);
      return upsert(dropKinds(stances, subject, ["disliked_once"]), nextRefuse);
    }
    const nextOnce = bump(prev, {
      subject,
      kind: "disliked_once",
      source: input.source,
      lastEvidenceAtMs: input.atMs,
      confidence: baseConfidence("disliked_once", explicit),
    }, input.evidenceKey);
    if (nextOnce === prev) return unchanged(stances);
    if (nextOnce.evidenceCount >= 3) {
      return upsert(dropKinds(stances, subject, ["disliked_once"]), {
        ...nextOnce,
        kind: "often_refuses",
        confidence: baseConfidence("often_refuses", false),
      });
    }
    return upsert(
      explicit ? dropKinds(stances, subject, ["liked"]) : stances,
      nextOnce,
    );
  }

  if (input.kind === "often_refuses") {
    const next = bump(findStance(stances, subject, "often_refuses"), {
      subject,
      kind: "often_refuses",
      source: input.source,
      lastEvidenceAtMs: input.atMs,
      confidence: baseConfidence("often_refuses", explicit),
    }, input.evidenceKey);
    if (next === findStance(stances, subject, "often_refuses")) {
      return unchanged(stances);
    }
    return upsert(dropKinds(stances, subject, ["disliked_once"]), next);
  }

  if (input.kind === "struggles_with") {
    const next = bump(findStance(stances, subject, "struggles_with"), {
      subject,
      kind: "struggles_with",
      source: input.source,
      lastEvidenceAtMs: input.atMs,
      confidence: baseConfidence("struggles_with", explicit),
    }, input.evidenceKey);
    if (next === findStance(stances, subject, "struggles_with")) {
      return unchanged(stances);
    }
    return upsert(stances, next);
  }

  if (input.kind === "responds_well_to") {
    const next = bump(findStance(stances, subject, "responds_well_to"), {
      subject,
      kind: "responds_well_to",
      source: input.source,
      lastEvidenceAtMs: input.atMs,
      confidence: baseConfidence("responds_well_to", explicit),
    }, input.evidenceKey);
    if (next === findStance(stances, subject, "responds_well_to")) {
      return unchanged(stances);
    }
    return upsert(dropKinds(stances, subject, ["disliked_once"]), next);
  }

  const next = bump(findStance(stances, subject, input.kind), {
    subject,
    kind: input.kind,
    source: input.source,
    lastEvidenceAtMs: input.atMs,
    confidence: baseConfidence(input.kind, explicit),
    ...(input.note ? { note: input.note } : {}),
  }, input.evidenceKey);
  if (next === findStance(stances, subject, input.kind)) return unchanged(stances);
  return upsert(stances, next);
}

export function applyStanceUpdates(
  stances: readonly UserStance[],
  updates: readonly StanceUpdateInput[],
  nowMs: number,
): UserStance[] {
  if (updates.length === 0) return unchanged(stances);
  let next = [...stances];
  for (const row of updates) {
    if (!isUserStanceKind(row.kind)) continue;
    const subject = normalizeStanceSubject(row.subject);
    if (!subject) continue;
    const explicit = row.explicit === true;
    if (row.kind === "hard_boundary" && !explicit) continue;
    next = applyStanceUpdate(next, {
      subject,
      kind: row.kind,
      source: "explicit_chat",
      atMs: nowMs,
      explicit,
      evidenceKey: `router:${subject}:${row.kind}:${Math.floor(nowMs / DAY)}`,
      ...(row.evidence?.trim() ? { note: row.evidence.trim().slice(0, 80) } : {}),
    });
  }
  return next.slice(-SOUL_STANCES_CAP);
}

function hourKey(atMs: number): string {
  return String(Math.floor(atMs / HOUR));
}

export function applyWorldEventToStances(
  stances: readonly UserStance[],
  event: SoulWorldEvent,
): UserStance[] {
  switch (event.kind) {
    case "session_refused":
    case "session_aborted":
      return applyStanceUpdate(stances, {
        subject: "session",
        kind: "disliked_once",
        source: "session",
        atMs: event.atMs,
        evidenceKey: `${event.kind}:session:${hourKey(event.atMs)}`,
      });
    case "quest_failed": {
      const subject = event.subjectId
        ? normalizeStanceSubject(`quest:${event.subjectId}`)
        : null;
      if (!subject) return unchanged(stances);
      const prev = findStance(stances, subject, "struggles_with");
      const onceKey = `${event.kind}:${subject}:${hourKey(event.atMs)}`;
      if (prev?.evidenceKey === onceKey) return unchanged(stances);
      const priorFails = prev?.evidenceCount ?? 0;
      const failCount = priorFails + 1;
      if (failCount < 2) {
        return applyStanceUpdate(stances, {
          subject,
          kind: "struggles_with",
          source: "quest",
          atMs: event.atMs,
          evidenceKey: onceKey,
        }).map((row) =>
          row.subject === subject && row.kind === "struggles_with"
            ? { ...row, confidence: 0.05, evidenceCount: 1 }
            : row,
        );
      }
      return applyStanceUpdate(stances, {
        subject,
        kind: "struggles_with",
        source: "quest",
        atMs: event.atMs,
        evidenceKey: onceKey,
      });
    }
    case "session_completed":
    case "quest_completed":
    case "contract_accepted":
    case "contract_completed":
    case "contract_failed":
    case "morning_pack":
    case "checkin_submitted":
    case "live_obligation_changed":
      return stances as UserStance[];
    default: {
      const _exhaustive: never = event.kind;
      return _exhaustive;
    }
  }
}

const EXPLICIT_RULES: Array<{
  re: RegExp;
  kind: UserStanceKind;
  lift?: boolean;
}> = [
  {
    re: /никак(?:ой|ая|ого|их)\s+([^,.!?…—-]+?)(?:,|\s+[—-])\s*(?:это\s+)?ж[её]стк(?:ая|ий)\s+границ/i,
    kind: "hard_boundary",
  },
  {
    re: /(?:^|:\s*)([^:,.!?…—-]+?)\s*[—-]\s*(?:это\s+)?(?:моя|мой)\s+ж[её]стк(?:ая|ий)\s+границ/i,
    kind: "hard_boundary",
  },
  {
    re: /(?:^|:\s*)([^:,.!?…—-]+?)\s+(?:is\s+)?my\s+hard\s+boundary/i,
    kind: "hard_boundary",
  },
  { re: /никогда\s+(?:больше\s+)?не\s+(?:предлагай|предлагать|делай|трогай)\s+(.+)/i, kind: "hard_boundary" },
  { re: /не\s+предлагай\s+(.+?)\s+никогда/i, kind: "hard_boundary" },
  { re: /never\s+(?:offer|suggest|do)\s+(.+)/i, kind: "hard_boundary" },
  { re: /(?:это\s+)?мой\s+любимый\s+(.+)/i, kind: "liked" },
  { re: /я\s+люблю\s+(.+)/i, kind: "liked" },
  { re: /\blove\s+(.+)/i, kind: "liked" },
  { re: /интересно\s+(?:попробовать|попробовать\s+)?(.+)/i, kind: "curious_about" },
  { re: /хочу\s+попробовать\s+(.+)/i, kind: "curious_about" },
  { re: /curious\s+about\s+(.+)/i, kind: "curious_about" },
  { re: /мне\s+не\s+нравится\s+(.+)/i, kind: "disliked_once" },
  { re: /не\s+нравится\s+(.+)/i, kind: "disliked_once" },
  { re: /теперь\s+можно\s+(.+)/i, kind: "curious_about", lift: true },
  { re: /я\s+передумал(?:а)?(?:\s+(?:насчёт|про))?\s+(.+)/i, kind: "curious_about", lift: true },
];

function captureSubject(raw: string): string | null {
  const cut = raw
    .replace(/[.!?…]+$/g, "")
    .replace(/\s+(пожалуйста|please|больше|вообще)$/i, "")
    .trim();
  const first = cut.split(/[,.]/)[0]?.trim() ?? "";
  return normalizeStanceSubject(first);
}

export function explicitStancesFromUserText(
  text: string,
  atMs: number,
): UserStance[] {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 180) return [];
  let stances: UserStance[] = [];
  for (const rule of EXPLICIT_RULES) {
    const match = trimmed.match(rule.re);
    if (!match?.[1]) continue;
    const subject = captureSubject(match[1]);
    if (!subject || !isCanonicalPlaySubject(subject)) continue;
    stances = applyStanceUpdate(stances, {
      subject,
      kind: rule.kind,
      source: "explicit_chat",
      atMs,
      explicit: true,
      evidenceKey: `explicit:${subject}:${rule.kind}`,
    });
    break;
  }
  return stances;
}

export function applyExplicitUserTextToStances(
  stances: readonly UserStance[],
  text: string,
  atMs: number,
): UserStance[] {
  const extracted = explicitStancesFromUserText(text, atMs);
  if (extracted.length === 0) return unchanged(stances);
  let next = [...stances];
  for (const row of extracted) {
    next = applyStanceUpdate(next, {
      subject: row.subject,
      kind: row.kind,
      source: row.source,
      atMs,
      explicit: true,
      evidenceKey: row.evidenceKey ?? `explicit:${row.subject}:${row.kind}`,
    });
  }
  return next;
}

export function hasHardBoundaryOn(
  stances: readonly UserStance[],
  subjects: readonly string[],
): boolean {
  return stances.some(
    (stance) =>
      stance.kind === "hard_boundary" && subjects.includes(stance.subject),
  );
}

export function scoreSubjectsForStance(
  stances: readonly UserStance[],
  subjects: readonly string[],
  nowMs: number,
): number {
  let score = 0;
  for (const stance of stances) {
    if (!subjects.includes(stance.subject)) continue;
    if (!isStanceActive(stance, nowMs)) continue;
    const conf = effectiveStanceConfidence(stance, nowMs);
    switch (stance.kind) {
      case "hard_boundary":
        return -1000;
      case "often_refuses":
        score -= 2 * conf;
        break;
      case "disliked_once":
        score -= 0.4 * conf;
        break;
      case "liked":
        score += 1.2 * conf;
        break;
      case "curious_about":
        score += 0.6 * conf;
        break;
      case "responds_well_to":
        score += 0.5 * conf;
        break;
      case "struggles_with":
        score -= 0.15 * conf;
        break;
      default: {
        const _exhaustive: never = stance.kind;
        return _exhaustive;
      }
    }
  }
  return score;
}

function mentionsSubject(blob: string, subject: string): boolean {
  const lower = blob.toLowerCase();
  if (subject.length >= 2 && lower.includes(subject.toLowerCase())) return true;
  const label = stanceSubjectLabelRu(subject).toLowerCase();
  if (label.length >= 3 && lower.includes(label)) return true;
  for (const [alias, canonical] of Object.entries(SUBJECT_ALIASES)) {
    if (canonical === subject && alias.length >= 3 && lower.includes(alias)) {
      return true;
    }
  }
  return false;
}

function relevantSubjects(
  userText: string,
  intent: SoulCharacterIntent | null,
): Set<string> {
  const out = new Set<string>();
  const blob = `${userText} ${intent?.subject ?? ""} ${intent?.goal ?? ""}`;
  for (const [alias, canonical] of Object.entries(SUBJECT_ALIASES)) {
    if (blob.toLowerCase().includes(alias)) out.add(canonical);
  }
  for (const kind of MISTRESS_SESSION_KINDS) {
    if (blob.toLowerCase().includes(kind)) out.add(kind);
  }
  if (intent?.source === "session") out.add("session");
  if (intent?.source === "contract") out.add("contract");
  if (intent?.source === "checkin") out.add("checkin");
  return out;
}

export function stancePromptLines(
  stances: readonly UserStance[],
  userText: string,
  intent: SoulCharacterIntent | null,
  nowMs: number,
  casual: boolean,
): string[] {
  if (casual) return [];
  const active = stances.filter((row) => isStanceActive(row, nowMs));
  if (active.length === 0) return [];
  const blob = `${userText} ${intent?.subject ?? ""} ${intent?.goal ?? ""}`;
  const wanted = relevantSubjects(userText, intent);
  const hard = active.filter((row) => row.kind === "hard_boundary");
  const prefs = active.filter((row) => {
    if (row.kind === "hard_boundary") return false;
    if (wanted.has(row.subject)) return true;
    return mentionsSubject(blob, row.subject);
  });
  const lines: string[] = ["--- USER STANCE ---"];
  if (hard.length > 0) {
    lines.push(
      "Hard boundaries are non-negotiable. Never propose, encourage, roleplay, or tease about violating them. If he asks for one, briefly decline and point to the boundary without repeating the forbidden scenario:",
    );
    for (const row of hard.slice(0, 4)) {
      lines.push(`- ${stanceSubjectLabelRu(row.subject)}`);
    }
  }
  if (prefs.length > 0) {
    lines.push("Relevant preferences:");
    for (const row of prefs.slice(0, SOUL_STANCE_SLICE_CAP)) {
      lines.push(`- ${row.kind} ${stanceSubjectLabelRu(row.subject)}`);
    }
  }
  if (lines.length <= 1) return [];
  return lines;
}

export function stanceMemoryView(
  stances: readonly UserStance[],
  nowMs = Date.now(),
): StanceMemoryView {
  const active = stances.filter((row) => isStanceActive(row, nowMs));
  const label = (kind: UserStanceKind) =>
    active
      .filter((row) => row.kind === kind)
      .map((row) => stanceSubjectLabelRu(row.subject));
  return {
    boundaries: label("hard_boundary"),
    likes: label("liked"),
    curious: label("curious_about"),
    refuses: label("often_refuses"),
  };
}

export function asStances(raw: unknown): UserStance[] {
  if (!Array.isArray(raw)) return [];
  const out: UserStance[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Partial<UserStance>;
    if (!isUserStanceKind(rec.kind)) continue;
    if (!isUserStanceSource(rec.source)) continue;
    const subject = typeof rec.subject === "string"
      ? normalizeStanceSubject(rec.subject)
      : null;
    if (!subject) continue;
    if (typeof rec.lastEvidenceAtMs !== "number" || !Number.isFinite(rec.lastEvidenceAtMs)) {
      continue;
    }
    const confidence =
      typeof rec.confidence === "number" ? clamp01(rec.confidence) : 0.3;
    const evidenceCount =
      typeof rec.evidenceCount === "number" && Number.isFinite(rec.evidenceCount)
        ? Math.max(1, Math.min(20, Math.round(rec.evidenceCount)))
        : 1;
    const evidenceKey =
      typeof rec.evidenceKey === "string" && rec.evidenceKey.trim()
        ? rec.evidenceKey.trim()
        : undefined;
    const note =
      typeof rec.note === "string" && rec.note.trim()
        ? rec.note.trim().slice(0, 80)
        : undefined;
    out.push({
      subject,
      kind: rec.kind,
      confidence,
      evidenceCount,
      lastEvidenceAtMs: rec.lastEvidenceAtMs,
      source: rec.source,
      ...(evidenceKey ? { evidenceKey } : {}),
      ...(note ? { note } : {}),
    });
  }
  return out.slice(-SOUL_STANCES_CAP);
}

export function parseRouterStanceUpdates(raw: unknown): StanceUpdateInput[] {
  if (!Array.isArray(raw)) return [];
  const out: StanceUpdateInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.subject !== "string" || !rec.subject.trim()) continue;
    if (typeof rec.kind !== "string") continue;
    out.push({
      subject: rec.subject,
      kind: rec.kind,
      ...(typeof rec.evidence === "string" ? { evidence: rec.evidence } : {}),
      ...(typeof rec.explicit === "boolean" ? { explicit: rec.explicit } : {}),
    });
  }
  return out.slice(0, 6);
}
