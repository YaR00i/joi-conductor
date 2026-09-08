import type { MistressId } from "../mistress/types";
import { userMemoryToMd } from "./markdown";
import { applyWorldEventToStances } from "./stance";
import {
  buildSoulSessionSummary,
  type SoulSessionSummaryInput,
} from "./sessionSummary";
import {
  SOUL_EVENT_DEDUPE_MS,
  SOUL_OPEN_LOOPS_CAP,
  SOUL_RECENT_EVENTS_CAP,
  isSoulWorldEventKind,
  type SoulMistressState,
  type SoulOpenLoop,
  type SoulWorldEvent,
  type SoulWorldEventImportance,
  type SoulWorldEventKind,
} from "./types";

const HOUR = 60 * 60 * 1000;

export type SoulWorldEventInput = {
  kind: SoulWorldEventKind;
  atMs?: number;
  mistressId: MistressId;
  summary: string;
  importance: SoulWorldEventImportance;
  subjectId?: string;
};

export type SoulEventDecision = "forget" | "remember" | "milestone" | "open_loop";

export type SoulEventIngestResult = {
  state: SoulMistressState;
  event: SoulWorldEvent;
  decision: SoulEventDecision;
  duplicate: boolean;
  changed: boolean;
};

function clampImportance(n: number): SoulWorldEventImportance {
  if (n >= 3) return 3;
  if (n <= 1) return 1;
  return 2;
}

function normalizeSummary(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 180);
}

function dedupeKey(event: Pick<SoulWorldEvent, "kind" | "summary" | "subjectId">): string {
  const subject = event.subjectId?.trim();
  if (subject) return `${event.kind}::${subject}`;
  return `${event.kind}::${normalizeSummary(event.summary).toLowerCase()}`;
}

function openLoopTtlMs(source: SoulWorldEventKind): number {
  switch (source) {
    case "morning_pack":
    case "checkin_submitted":
      return 24 * HOUR;
    case "session_refused":
    case "session_aborted":
    case "quest_failed":
      return 48 * HOUR;
    case "contract_accepted":
    case "contract_failed":
      return 72 * HOUR;
    case "session_completed":
    case "contract_completed":
    case "quest_completed":
    case "live_obligation_changed":
      return 48 * HOUR;
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export function makeSoulWorldEvent(input: SoulWorldEventInput): SoulWorldEvent {
  const atMs = input.atMs ?? Date.now();
  const summary = normalizeSummary(input.summary) || input.kind;
  const subjectId = input.subjectId?.trim() || undefined;
  const id = `${atMs.toString(36)}-${input.kind}${subjectId ? `-${subjectId.slice(0, 24)}` : ""}`;
  return {
    id,
    kind: input.kind,
    atMs,
    mistressId: input.mistressId,
    summary,
    importance: clampImportance(input.importance),
    ...(subjectId ? { subjectId } : {}),
  };
}

export function isDuplicateSoulEvent(
  recent: readonly SoulWorldEvent[],
  event: SoulWorldEvent,
  windowMs = SOUL_EVENT_DEDUPE_MS,
): boolean {
  const key = dedupeKey(event);
  const stableId = Boolean(event.subjectId?.trim());
  return recent.some((row) => {
    if (dedupeKey(row) !== key) return false;
    if (stableId && row.subjectId?.trim()) return true;
    return row.atMs <= event.atMs && event.atMs - row.atMs <= windowMs;
  });
}

export function openLoopDedupeKey(
  loop: Pick<SoulOpenLoop, "source" | "summary" | "subjectId">,
): string {
  const subject = loop.subjectId?.trim();
  if (subject) return `subject:${subject}`;
  return `${loop.source}:${normalizeSummary(loop.summary).toLowerCase()}`;
}

export function expireSoulOpenLoops(
  loops: readonly SoulOpenLoop[],
  nowMs: number,
): SoulOpenLoop[] {
  return loops.filter((loop) => {
    const until = loop.expiresAtMs ?? loop.atMs + openLoopTtlMs(loop.source);
    return until > nowMs;
  });
}

export function closeSoulOpenLoops(
  loops: readonly SoulOpenLoop[],
  shouldClose: (loop: SoulOpenLoop) => boolean,
): SoulOpenLoop[] {
  return loops.filter((loop) => !shouldClose(loop));
}

export function createSoulOpenLoop(
  loops: readonly SoulOpenLoop[],
  loop: SoulOpenLoop,
  nowMs = loop.atMs,
): SoulOpenLoop[] {
  const key = openLoopDedupeKey(loop);
  const without = loops.filter((row) => openLoopDedupeKey(row) !== key);
  const expiresAtMs = loop.expiresAtMs ?? nowMs + openLoopTtlMs(loop.source);
  return [...without, { ...loop, expiresAtMs }].slice(-SOUL_OPEN_LOOPS_CAP);
}

export function addSoulMilestone(
  milestones: readonly string[],
  text: string,
): string[] {
  const next = text.trim();
  if (!next) return [...milestones];
  const key = next.toLowerCase();
  const kept = milestones.filter((row) => row.trim().toLowerCase() !== key);
  return [...kept, next].slice(-8);
}

function closeMatchingLoops(
  loops: readonly SoulOpenLoop[],
  event: SoulWorldEvent,
): SoulOpenLoop[] {
  let next = [...loops];
  if (event.kind === "session_completed") {
    next = closeSoulOpenLoops(
      next,
      (loop) =>
        loop.source === "session_refused" || loop.source === "session_aborted",
    );
  }
  const subject = event.subjectId?.trim();
  if (subject) {
    next = closeSoulOpenLoops(next, (loop) => loop.subjectId === subject);
  }
  return next;
}

function loopFromEvent(event: SoulWorldEvent): SoulOpenLoop {
  return {
    id: event.id,
    summary: event.summary,
    source: event.kind,
    atMs: event.atMs,
    importance: event.importance,
    ...(event.subjectId ? { subjectId: event.subjectId } : {}),
  };
}

/**
 * What this event should do to long-term Soul memory.
 * Importance 1 never lands in recentEvents or openLoops.
 */
export function decideSoulEventMemory(
  event: SoulWorldEvent,
): SoulEventDecision {
  if (event.importance <= 1) return "forget";
  switch (event.kind) {
    case "session_completed":
      // Ordinary sessions stay in recentEvents. First-with-mistress is
      // upgraded to a milestone in ingestSoulWorldEvent.
      return "remember";
    case "quest_completed":
    case "contract_completed":
      return event.importance >= 3 ? "milestone" : "remember";
    case "contract_accepted":
    case "contract_failed":
    case "session_aborted":
    case "session_refused":
    case "quest_failed":
    case "morning_pack":
      return "open_loop";
    case "checkin_submitted":
    case "live_obligation_changed":
      return "forget";
    default: {
      const _exhaustive: never = event.kind;
      return _exhaustive;
    }
  }
}

export function soulConductorStamp(state: {
  recentEvents: readonly SoulWorldEvent[];
  openLoops: readonly SoulOpenLoop[];
}): number {
  let max = 0;
  for (const row of state.recentEvents) max = Math.max(max, row.atMs);
  for (const row of state.openLoops) max = Math.max(max, row.atMs);
  return max;
}

function looksLikeSessionCompletionMilestone(text: string): boolean {
  return /^\s*сессия завершена\b/i.test(text.trim());
}

/** First completed session with this mistress may become a shared milestone. */
function shouldMilestoneCompletedSession(
  state: SoulMistressState,
  event: SoulWorldEvent,
): boolean {
  if (event.kind !== "session_completed") return false;
  const seenWithMistress = state.recentEvents.some(
    (row) =>
      row.kind === "session_completed" && row.mistressId === event.mistressId,
  );
  if (seenWithMistress) return false;
  if (state.user.sharedMilestones.some(looksLikeSessionCompletionMilestone)) {
    return false;
  }
  return true;
}

function withEventStances(
  state: SoulMistressState,
  event: SoulWorldEvent,
): SoulMistressState {
  const current = Array.isArray(state.user.stances) ? state.user.stances : [];
  const stances = applyWorldEventToStances(current, event);
  if (stances === current) return state;
  return {
    ...state,
    user: { ...state.user, stances },
  };
}

export function ingestSoulWorldEvent(
  state: SoulMistressState,
  input: SoulWorldEventInput,
): SoulEventIngestResult {
  const event = makeSoulWorldEvent(input);
  if (isDuplicateSoulEvent(state.recentEvents, event)) {
    const next = withEventStances(state, event);
    return {
      state: next,
      event,
      decision: "forget",
      duplicate: true,
      changed: next !== state,
    };
  }
  let decision = decideSoulEventMemory(event);
  if (event.kind === "session_completed" && decision !== "forget") {
    decision = shouldMilestoneCompletedSession(state, event)
      ? "milestone"
      : "remember";
  }
  if (decision === "forget") {
    return { state, event, decision, duplicate: false, changed: false };
  }

  const recentEvents = [...state.recentEvents, event].slice(
    -SOUL_RECENT_EVENTS_CAP,
  );
  let openLoops = expireSoulOpenLoops(
    closeMatchingLoops(state.openLoops, event),
    event.atMs,
  );
  let sharedMilestones = state.user.sharedMilestones;

  if (decision === "open_loop") {
    openLoops = createSoulOpenLoop(openLoops, loopFromEvent(event), event.atMs);
  }
  if (decision === "milestone") {
    sharedMilestones = addSoulMilestone(sharedMilestones, event.summary);
  }

  const nextUser = {
    ...state.user,
    sharedMilestones,
    stances: applyWorldEventToStances(state.user.stances ?? [], event),
  };
  return {
    event,
    decision,
    duplicate: false,
    changed: true,
    state: {
      ...state,
      recentEvents,
      openLoops,
      user: nextUser,
      userMd:
        decision === "milestone" ? userMemoryToMd(nextUser) : state.userMd,
    },
  };
}

export function asSoulWorldEvent(raw: unknown): SoulWorldEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Partial<SoulWorldEvent>;
  if (!isSoulWorldEventKind(rec.kind)) return null;
  if (typeof rec.atMs !== "number" || !Number.isFinite(rec.atMs)) return null;
  if (typeof rec.summary !== "string" || !rec.summary.trim()) return null;
  if (rec.importance !== 1 && rec.importance !== 2 && rec.importance !== 3) {
    return null;
  }
  if (typeof rec.mistressId !== "string") return null;
  const mistressId = rec.mistressId as MistressId;
  const summary = normalizeSummary(rec.summary);
  const subjectId =
    typeof rec.subjectId === "string" && rec.subjectId.trim()
      ? rec.subjectId.trim()
      : undefined;
  return {
    id:
      typeof rec.id === "string" && rec.id.trim()
        ? rec.id.trim()
        : `${rec.atMs.toString(36)}-${rec.kind}`,
    kind: rec.kind,
    atMs: rec.atMs,
    mistressId,
    summary,
    importance: rec.importance,
    ...(subjectId ? { subjectId } : {}),
  };
}

export function asSoulOpenLoop(raw: unknown): SoulOpenLoop | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Partial<SoulOpenLoop>;
  if (typeof rec.id !== "string" || !rec.id.trim()) return null;
  if (typeof rec.summary !== "string" || !rec.summary.trim()) return null;
  if (!isSoulWorldEventKind(rec.source)) return null;
  if (typeof rec.atMs !== "number" || !Number.isFinite(rec.atMs)) return null;
  if (rec.importance !== 1 && rec.importance !== 2 && rec.importance !== 3) {
    return null;
  }
  const subjectId =
    typeof rec.subjectId === "string" && rec.subjectId.trim()
      ? rec.subjectId.trim()
      : undefined;
  return {
    id: rec.id.trim(),
    summary: normalizeSummary(rec.summary),
    source: rec.source,
    atMs: rec.atMs,
    importance: rec.importance,
    ...(subjectId ? { subjectId } : {}),
    ...(typeof rec.expiresAtMs === "number" && Number.isFinite(rec.expiresAtMs)
      ? { expiresAtMs: rec.expiresAtMs }
      : {}),
  };
}

export function sessionEndEventInput(
  opts: SoulSessionSummaryInput & { contractTitleRu?: string },
): SoulWorldEventInput {
  const summary = buildSoulSessionSummary(opts);
  return {
    kind: summary.result === "completed" ? "session_completed" : "session_aborted",
    mistressId: summary.mistressId,
    summary: summary.conciseText,
    importance: summary.result === "completed" ? 3 : 2,
    subjectId: summary.sessionId,
    atMs: summary.endedAtMs,
  };
}

export function questEndEventInput(opts: {
  mistressId: MistressId;
  outcome: "completed" | "failed";
  titleRu: string;
  questId?: string;
}): SoulWorldEventInput {
  const title = opts.titleRu.trim() || "квест";
  return {
    kind: opts.outcome === "completed" ? "quest_completed" : "quest_failed",
    mistressId: opts.mistressId,
    summary:
      opts.outcome === "completed"
        ? `Квест выполнен: ${title}`
        : `Квест провален: ${title}`,
    importance: 2,
    subjectId: opts.questId,
  };
}

export function morningPackEventInput(opts: {
  mistressId: MistressId;
  done: number;
  skipped: number;
}): SoulWorldEventInput {
  const skipped = Math.max(0, opts.skipped);
  const done = Math.max(0, opts.done);
  if (skipped <= 0) {
    return {
      kind: "morning_pack",
      mistressId: opts.mistressId,
      summary: `Утренний пак закрыт (${done} из ${done})`,
      importance: 1,
    };
  }
  return {
    kind: "morning_pack",
    mistressId: opts.mistressId,
    summary: `Утренний пак: пропустил ${skipped}`,
    importance: 2,
  };
}

export function checkInEventInput(mistressId: MistressId): SoulWorldEventInput {
  return {
    kind: "checkin_submitted",
    mistressId,
    summary: "Отчитался по check-in",
    importance: 1,
  };
}

export function sessionRefusedEventInput(
  mistressId: MistressId,
): SoulWorldEventInput {
  return {
    kind: "session_refused",
    mistressId,
    summary: "Отказался от предложенной сессии",
    importance: 2,
  };
}
