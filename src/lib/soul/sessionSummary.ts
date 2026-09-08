import type { MistressId } from "../mistress/types";
import { finaleOutcomeLabelRu } from "../sessionDebrief";
import type {
  FinaleOutcome,
  SessionEvent,
  SessionMode,
} from "../types";
import type { SoulMistressState, SoulWorldEvent } from "./types";

/** Keep in lockstep with `normalizeSummary` in worldEvents. */
export const SOUL_SESSION_SUMMARY_TEXT_MAX = 180;
const KEY_EVENT_CAP = 6;
const USER_CHOICE_CAP = 4;
const SENTENCE_CAP = 4;

export type SoulSessionResult = "completed" | "aborted";

export type SoulSessionQuestResult = {
  questId: string;
  result: "completed" | "failed";
};

export type SoulSessionSummary = {
  sessionId: string;
  mistressId: MistressId;
  endedAtMs: number;
  result: SoulSessionResult;
  mode?: SessionMode;
  durationSec?: number;
  finaleOutcome?: FinaleOutcome;
  keyEvents: string[];
  completedContractIds: string[];
  failedContractIds: string[];
  questResults: SoulSessionQuestResult[];
  userChoices: string[];
  conciseText: string;
};

export type SoulSessionSummaryInput = {
  mistressId: MistressId;
  reason: "complete" | "abort";
  endedAtMs?: number;
  startedAtMs?: number;
  sessionId?: string;
  mode?: SessionMode;
  durationSec?: number;
  finaleOutcome?: FinaleOutcome;
  edgesDone?: number;
  events?: readonly SessionEvent[];
  contractInstanceId?: string;
  contractStatus?: "done" | "failed";
};

const SESSION_MENTION =
  /(сесс|вчера|позавчера|закончил|оборв|эдж|руин|deny|финал|кончил|как прошло|было\s+ж[её]стк|после\s+этого|не\s+дош[её]л)/i;

export function makeSoulSessionId(input: {
  mistressId: MistressId;
  reason: "complete" | "abort";
  endedAtMs: number;
  startedAtMs?: number;
}): string {
  const start =
    input.startedAtMs != null && Number.isFinite(input.startedAtMs)
      ? Math.round(input.startedAtMs)
      : Math.round(input.endedAtMs);
  return `sess:${input.mistressId}:${start}:${input.reason}`;
}

export function lastSoulSessionEvent(
  state: Pick<SoulMistressState, "recentEvents">,
): SoulWorldEvent | null {
  for (let i = state.recentEvents.length - 1; i >= 0; i -= 1) {
    const event = state.recentEvents[i];
    if (!event) continue;
    if (event.kind === "session_completed" || event.kind === "session_aborted") {
      return event;
    }
  }
  return null;
}

export function userTurnNeedsSessionContinuity(userText: string): boolean {
  const trimmed = userText.trim();
  if (!trimmed) return false;
  return SESSION_MENTION.test(trimmed);
}

export function stripSoulInternalIds(text: string): string {
  return text
    .replace(/\bsess:[^\s]+/gi, "")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{4,}\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function pushUnique(list: string[], value: string, cap: number): void {
  const next = value.trim();
  if (!next || list.includes(next) || list.length >= cap) return;
  list.push(next);
}

function edgesPhrase(count: number | undefined): string | null {
  if (count == null || count <= 0) return null;
  return `эджи ${count}`;
}

function collectQuestResults(
  events: readonly SessionEvent[],
): SoulSessionQuestResult[] {
  const byId = new Map<string, SoulSessionQuestResult["result"]>();
  for (const event of events) {
    if (event.type === "quest_completed" && event.questId) {
      byId.set(event.questId, "completed");
    } else if (event.type === "quest_failed" && event.questId) {
      byId.set(event.questId, "failed");
    }
  }
  return [...byId.entries()].map(([questId, result]) => ({ questId, result }));
}

function collectUserChoices(events: readonly SessionEvent[]): string[] {
  const out: string[] = [];
  for (const event of events) {
    if (event.type === "quest_declined") {
      pushUnique(out, "отказался от задания", USER_CHOICE_CAP);
      continue;
    }
    if (event.type !== "unauthorized") continue;
    switch (event.kind) {
      case "cum":
        pushUnique(out, "кончил без разрешения", USER_CHOICE_CAP);
        break;
      case "ruin":
        pushUnique(out, "руина без разрешения", USER_CHOICE_CAP);
        break;
      case "edge":
        pushUnique(out, "эдж без разрешения", USER_CHOICE_CAP);
        break;
      default: {
        const _exhaustive: never = event;
        void _exhaustive;
        break;
      }
    }
  }
  return out;
}

function collectKeyEvents(input: {
  result: SoulSessionResult;
  finaleOutcome?: FinaleOutcome;
  userChoices: readonly string[];
  questResults: readonly SoulSessionQuestResult[];
  contractStatus?: "done" | "failed";
}): string[] {
  const out: string[] = [];
  pushUnique(
    out,
    input.result === "completed" ? "session_completed" : "session_aborted",
    KEY_EVENT_CAP,
  );
  if (input.finaleOutcome) {
    pushUnique(out, `finale:${input.finaleOutcome}`, KEY_EVENT_CAP);
  }
  if (input.contractStatus === "done") {
    pushUnique(out, "contract_completed", KEY_EVENT_CAP);
  } else if (input.contractStatus === "failed") {
    pushUnique(out, "contract_failed", KEY_EVENT_CAP);
  }
  if (input.questResults.some((row) => row.result === "completed")) {
    pushUnique(out, "quest_completed", KEY_EVENT_CAP);
  }
  if (input.questResults.some((row) => row.result === "failed")) {
    pushUnique(out, "quest_failed", KEY_EVENT_CAP);
  }
  for (const choice of input.userChoices) {
    pushUnique(out, choice, KEY_EVENT_CAP);
  }
  return out;
}

function boundConciseText(sentences: string[]): string {
  const kept: string[] = [];
  for (const raw of sentences) {
    if (kept.length >= SENTENCE_CAP) break;
    const sentence = raw.trim().replace(/\s+/g, " ");
    if (!sentence) continue;
    const next = [...kept, sentence].join(" ");
    if (next.length > SOUL_SESSION_SUMMARY_TEXT_MAX) break;
    kept.push(sentence);
  }
  if (kept.length === 0) return "Сессия завершена.";
  return kept.join(" ").slice(0, SOUL_SESSION_SUMMARY_TEXT_MAX);
}

function buildConciseText(input: {
  result: SoulSessionResult;
  finaleOutcome?: FinaleOutcome;
  edgesDone?: number;
  userChoices: readonly string[];
}): string {
  const sentences: string[] = [];
  const edges = edgesPhrase(input.edgesDone);
  if (input.result === "completed") {
    const finale = input.finaleOutcome
      ? finaleOutcomeLabelRu(input.finaleOutcome)
      : "";
    const detail = [finale, edges].filter(Boolean).join(", ");
    sentences.push(detail ? `Сессия завершена. ${detail}.` : "Сессия завершена.");
  } else {
    sentences.push("Сессия оборвана, до финала не дошёл.");
    if (edges) sentences.push(`${edges}.`);
  }
  for (const choice of input.userChoices.slice(0, 2)) {
    const capped =
      choice.charAt(0).toUpperCase() + choice.slice(1);
    sentences.push(`${capped}.`);
  }
  return boundConciseText(sentences);
}

export function buildSoulSessionSummary(
  input: SoulSessionSummaryInput,
): SoulSessionSummary {
  const endedAtMs =
    input.endedAtMs != null && Number.isFinite(input.endedAtMs)
      ? Math.round(input.endedAtMs)
      : Date.now();
  const result: SoulSessionResult =
    input.reason === "complete" ? "completed" : "aborted";
  const sessionId =
    input.sessionId?.trim() ||
    makeSoulSessionId({
      mistressId: input.mistressId,
      reason: input.reason,
      endedAtMs,
      startedAtMs: input.startedAtMs,
    });
  const events = input.events ?? [];
  const questResults = collectQuestResults(events);
  const userChoices = collectUserChoices(events);
  const completedContractIds: string[] = [];
  const failedContractIds: string[] = [];
  const contractId = input.contractInstanceId?.trim();
  if (contractId && input.contractStatus === "done") {
    completedContractIds.push(contractId);
  } else if (contractId && input.contractStatus === "failed") {
    failedContractIds.push(contractId);
  }
  const durationSec =
    input.durationSec != null && Number.isFinite(input.durationSec)
      ? Math.max(0, Math.round(input.durationSec))
      : undefined;
  const conciseText = buildConciseText({
    result,
    finaleOutcome: input.finaleOutcome,
    edgesDone: input.edgesDone,
    userChoices,
  });
  return {
    sessionId,
    mistressId: input.mistressId,
    endedAtMs,
    result,
    ...(input.mode ? { mode: input.mode } : {}),
    ...(durationSec != null ? { durationSec } : {}),
    ...(input.finaleOutcome ? { finaleOutcome: input.finaleOutcome } : {}),
    keyEvents: collectKeyEvents({
      result,
      finaleOutcome: input.finaleOutcome,
      userChoices,
      questResults,
      contractStatus: input.contractStatus,
    }),
    completedContractIds,
    failedContractIds,
    questResults,
    userChoices,
    conciseText,
  };
}
