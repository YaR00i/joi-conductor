import { loadControlState } from "./control/store";
import { controlLiveSnapshot } from "./control/live";
import type { MistressId } from "../mistress/types";
import {
  SOUL_EVENT_CANDIDATE_WINDOW_MS,
  SOUL_INITIATIVE_CONSUMED_CAP,
  SOUL_INITIATIVE_COOLDOWN_MS,
  SOUL_INTENT_TTL_MS,
  emptySoulInitiative,
  clampSoulIntentPriority,
  type SoulCharacterIntent,
  type SoulInitiativeState,
  type SoulIntentSource,
  type SoulIntentTone,
  type SoulMistressState,
  type SoulOpenLoop,
  type SoulWorldEvent,
  type SoulWorldEventKind,
  type UserStance,
} from "./types";
import { expireSoulOpenLoops } from "./worldEvents";
import { shouldHoldInitiativeCandidate } from "./conversationMode";
import { looksLikeSessionInvite } from "./control/actions";

export { isCasualOpener } from "./conversationMode";

export const SOUL_INITIATIVE_REASONS = [
  "checkin_overdue",
  "contract_failed",
  "session_aborted",
  "session_completed",
  "contract_completed",
  "open_loop",
  "session_offer",
] as const;
export type SoulInitiativeReason = (typeof SOUL_INITIATIVE_REASONS)[number];

export type SoulInitiativeCandidate = {
  id: string;
  reason: SoulInitiativeReason;
  priority: number;
  goal: string;
  tone: SoulIntentTone;
  source: SoulIntentSource;
  subject?: string;
  atMs: number;
};

export type SoulInitiativeContext = {
  nowMs: number;
  checkInOverdue: boolean;
  checkInNote?: string;
  checkInAtMs?: number;
  sessionOfferOpen: boolean;
  sessionOfferKey?: string;
};

export type SoulTurnInitiative = {
  candidateId: string;
  reason: SoulInitiativeReason;
};

export function liveSoulIntent(
  intent: SoulCharacterIntent | null | undefined,
  nowMs: number,
): SoulCharacterIntent | null {
  if (!intent || !intent.goal.trim()) return null;
  if (intent.expiresAtMs != null && intent.expiresAtMs <= nowMs) return null;
  return intent;
}

function loopTone(source: SoulWorldEventKind): SoulIntentTone {
  switch (source) {
    case "session_refused":
    case "session_aborted":
    case "contract_failed":
    case "quest_failed":
      return "annoyed";
    case "morning_pack":
    case "contract_accepted":
      return "firm";
    case "session_completed":
    case "contract_completed":
    case "quest_completed":
      return "pleased";
    case "checkin_submitted":
    case "live_obligation_changed":
      return "curious";
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

function candidateFromEvent(
  event: SoulWorldEvent,
): SoulInitiativeCandidate | null {
  const id = `event:${event.id}`;
  const subject = event.subjectId;
  switch (event.kind) {
    case "contract_failed":
      return {
        id,
        reason: "contract_failed",
        priority: 4,
        goal: event.summary,
        tone: "annoyed",
        source: "contract",
        atMs: event.atMs,
        ...(subject ? { subject } : {}),
      };
    case "session_aborted":
      return {
        id,
        reason: "session_aborted",
        priority: 4,
        goal: "Если к месту — спросить, почему он оборвал сессию. Не отчитывать списком.",
        tone: "annoyed",
        source: "session",
        subject: "оборванная сессия",
        atMs: event.atMs,
      };
    case "session_completed":
      return {
        id,
        reason: "session_completed",
        priority: 3,
        goal: "Если к месту — коротко отметить последнюю сессию. Не отчёт и не пересказ.",
        tone: "pleased",
        source: "session",
        subject: "последняя сессия",
        atMs: event.atMs,
      };
    case "contract_completed":
      return {
        id,
        reason: "contract_completed",
        priority: 3,
        goal: event.summary,
        tone: "pleased",
        source: "contract",
        atMs: event.atMs,
        ...(subject ? { subject } : {}),
      };
    case "contract_accepted":
    case "session_refused":
    case "quest_completed":
    case "quest_failed":
    case "morning_pack":
    case "checkin_submitted":
    case "live_obligation_changed":
      return null;
    default: {
      const _exhaustive: never = event.kind;
      return _exhaustive;
    }
  }
}

function loopIntentSource(source: SoulWorldEventKind): SoulIntentSource {
  switch (source) {
    case "session_completed":
    case "session_aborted":
    case "session_refused":
      return "session";
    case "contract_accepted":
    case "contract_completed":
    case "contract_failed":
    case "quest_completed":
    case "quest_failed":
      return "contract";
    case "morning_pack":
    case "checkin_submitted":
      return "checkin";
    case "live_obligation_changed":
      return "system";
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

function candidateFromLoop(loop: SoulOpenLoop): SoulInitiativeCandidate {
  const priority = loop.importance >= 3 ? 4 : loop.importance >= 2 ? 3 : 2;
  return {
    id: `loop:${loop.id}`,
    reason: "open_loop",
    priority,
    goal: loop.summary,
    tone: loopTone(loop.source),
    source: loopIntentSource(loop.source),
    atMs: loop.atMs,
    ...(loop.subjectId ? { subject: loop.subjectId } : {}),
  };
}

export function listInitiativeCandidates(
  state: SoulMistressState,
  ctx: SoulInitiativeContext,
): SoulInitiativeCandidate[] {
  const nowMs = ctx.nowMs;
  const out: SoulInitiativeCandidate[] = [];
  const seenIds = new Set<string>();
  const eventIds = new Set<string>();
  const eventSubjects = new Set<string>();

  const push = (row: SoulInitiativeCandidate) => {
    if (seenIds.has(row.id)) return;
    seenIds.add(row.id);
    out.push(row);
  };

  if (ctx.checkInOverdue && ctx.checkInAtMs != null) {
    push({
      id: `checkin:${ctx.checkInAtMs}`,
      reason: "checkin_overdue",
      priority: 5,
      goal:
        ctx.checkInNote?.trim() ||
        "После ответа спросить просроченный отчёт — не вместо приветствия.",
      tone: "firm",
      source: "checkin",
      atMs: ctx.checkInAtMs,
    });
  }

  let latestSession: SoulWorldEvent | null = null;
  for (const event of state.recentEvents) {
    if (nowMs - event.atMs > SOUL_EVENT_CANDIDATE_WINDOW_MS) continue;
    if (event.kind === "session_completed" || event.kind === "session_aborted") {
      if (!latestSession || event.atMs >= latestSession.atMs) {
        latestSession = event;
      }
      continue;
    }
    const row = candidateFromEvent(event);
    if (!row) continue;
    eventIds.add(event.id);
    if (event.subjectId) eventSubjects.add(event.subjectId);
    push(row);
  }
  if (latestSession) {
    const row = candidateFromEvent(latestSession);
    if (row) {
      eventIds.add(latestSession.id);
      if (latestSession.subjectId) eventSubjects.add(latestSession.subjectId);
      push(row);
    }
  }

  for (const loop of state.openLoops) {
    if (eventIds.has(loop.id)) continue;
    if (loop.subjectId && eventSubjects.has(loop.subjectId)) continue;
    push(candidateFromLoop(loop));
  }

  if (ctx.sessionOfferOpen) {
    const key = ctx.sessionOfferKey?.trim() || "open";
    push({
      id: `session_offer:${key}`,
      reason: "session_offer",
      priority: 2,
      goal: "В приложении уже есть чип сессии. Можно намекнуть в речи, не пересказывать CONTROL.",
      tone: "playful",
      source: "session",
      atMs: nowMs,
    });
  }

  return out;
}

export function selectInitiativeCandidate(
  candidates: readonly SoulInitiativeCandidate[],
  initiative: SoulInitiativeState,
  userText: string,
  nowMs: number,
  intent: SoulCharacterIntent | null = null,
  stances: readonly UserStance[] = [],
): SoulInitiativeCandidate | null {
  const consumed = new Set(initiative.consumedIds);
  const cooling =
    initiative.lastAtMs != null &&
    nowMs - initiative.lastAtMs < SOUL_INITIATIVE_COOLDOWN_MS;
  const eligible = candidates.filter((row) => {
    if (consumed.has(row.id)) return false;
    if (shouldHoldInitiativeCandidate(userText, intent, row, stances)) {
      return false;
    }
    if (cooling && row.priority < 5) return false;
    return true;
  });
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.atMs - a.atMs;
  })[0]!;
}

export function applyIntentFromCandidate(
  state: SoulMistressState,
  candidate: SoulInitiativeCandidate,
  nowMs: number,
): SoulMistressState {
  const intent: SoulCharacterIntent = {
    goal: candidate.goal.trim(),
    tone: candidate.tone,
    priority: clampSoulIntentPriority(candidate.priority),
    expiresAtMs: nowMs + SOUL_INTENT_TTL_MS,
    source: candidate.source,
    candidateId: candidate.id,
    ...(candidate.subject ? { subject: candidate.subject } : {}),
  };
  return { ...state, intent };
}

export function consumeInitiative(
  state: SoulMistressState,
  candidateId: string,
  nowMs: number,
): SoulMistressState {
  const prev = state.initiative ?? emptySoulInitiative();
  const kept = prev.consumedIds.filter((id) => id !== candidateId);
  return {
    ...state,
    initiative: {
      lastAtMs: nowMs,
      consumedIds: [...kept, candidateId].slice(-SOUL_INITIATIVE_CONSUMED_CAP),
    },
  };
}

/** Session offers consume only when speech or a card actually expressed them. */
export function shouldConsumeSelectedInitiative(
  candidate: Pick<SoulInitiativeCandidate, "reason">,
  speech: string,
  proposalCount: number,
): boolean {
  if (candidate.reason !== "session_offer") return true;
  if (proposalCount > 0) return true;
  return looksLikeSessionInvite(speech);
}

export function prepareSoulTurnIntent(
  state: SoulMistressState,
  userText: string,
  ctx: SoulInitiativeContext,
): { state: SoulMistressState; selected: SoulInitiativeCandidate | null } {
  const openLoops = expireSoulOpenLoops(state.openLoops, ctx.nowMs);
  const intent = liveSoulIntent(state.intent, ctx.nowMs);
  const next: SoulMistressState = {
    ...state,
    openLoops,
    intent,
    initiative: state.initiative ?? emptySoulInitiative(),
  };
  const selected = selectInitiativeCandidate(
    listInitiativeCandidates(next, ctx),
    next.initiative,
    userText,
    ctx.nowMs,
    intent,
    next.user.stances,
  );
  if (!selected) return { state: next, selected: null };
  return { state: applyIntentFromCandidate(next, selected, ctx.nowMs), selected };
}

export function buildSoulInitiativeContext(
  mistressId: MistressId,
  nowMs: number,
): SoulInitiativeContext {
  const control = loadControlState(mistressId);
  const live = controlLiveSnapshot(control, nowMs);
  return {
    nowMs,
    checkInOverdue: live.checkInOverdue,
    checkInNote: live.checkIn?.note,
    checkInAtMs: live.checkIn?.atMs,
    sessionOfferOpen: control.dispatch.phase === "session_offer",
    sessionOfferKey: control.dispatch.lastOfferDate ?? "open",
  };
}

/** UI-only. Prompt still uses intent.goal. */
export function formatIntentLabelRu(
  intent: Pick<
    SoulCharacterIntent,
    "goal" | "subject" | "source" | "candidateId"
  >,
): string {
  const candidateId = intent.candidateId?.trim() ?? "";
  const subject = intent.subject?.trim() ?? "";
  const goal = intent.goal.trim();

  if (candidateId.startsWith("checkin:") || intent.source === "checkin") {
    return "Дождаться отчёта";
  }
  if (candidateId.startsWith("session_offer:")) {
    return "Подвести разговор к сессии";
  }

  switch (intent.source) {
    case "session":
      if (/оборв/i.test(subject) || /оборв/i.test(goal)) {
        return "Вернуться к оборванной сессии";
      }
      return "Вспомнить недавнюю сессию";
    case "contract":
    case "conversation":
    case "relationship":
    case "system":
      return "Текущая тема разговора";
    default: {
      const _exhaustive: never = intent.source;
      return _exhaustive;
    }
  }
}
