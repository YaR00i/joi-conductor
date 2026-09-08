import { finishOptions, functions, patterns, toys } from "../../catalog";
import type { MistressId } from "../../mistress/types";
import type { PlanRouletteResult } from "../../planRoulette";
import { DEFAULT_PARAMS, type SessionParams } from "../../types";
import type { SoulLlmClient } from "../client";
import { parseJsonObject } from "../json";
import type { ResolvedChatLlm } from "../llmSettings";
import { modelForRole } from "../llmSettings";
import { completeStructuredRole } from "../structuredComplete";
import { hasHardBoundaryOn } from "../stance";
import type { UserStance } from "../types";
import { applyProposalToParams } from "./catalog";
import type { ChatProposal } from "./proposals";
import { assembleProgramSession } from "./assembleSession";
import { loadControlState } from "./store";
import { controlLiveSnapshot } from "./live";

export type SessionChatProposal = Extract<ChatProposal, { kind: "session" }>;

export type SessionPlannerDraft = {
  bpmMin: number;
  bpmMax: number;
  blockSecMin: number;
  blockSecMax: number;
  allowedFunctionIds: string[];
  allowedPatternIds: string[];
};

export type SessionPlannerDebug = {
  ran: boolean;
  source: "program" | "planner" | "program_fallback";
  model?: string;
  parsed?: "valid" | "invalid";
  retryUsed?: boolean;
  latencyMs?: number;
  fallbackReason?: string;
};

export type AcceptedSessionBuild = {
  result: PlanRouletteResult;
  debug: SessionPlannerDebug;
};

function numberInRange(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.round(Math.max(min, Math.min(max, raw)));
}

function stringIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const ids = raw.filter((row): row is string => typeof row === "string");
  if (ids.length !== raw.length) return null;
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, 16);
}

function plannerFunctionRows(
  base: SessionParams,
  stances: readonly UserStance[],
) {
  const equipment = new Set(
    toys
      .filter((toy) => toy.owned)
      .flatMap((toy) => [toy.id, ...(toy.satisfies ?? [])]),
  );
  return functions.filter((row) => {
    if (!row.enabled || !row.modes.includes(base.mode)) return false;
    if (row.requiresToys.some((id) => !equipment.has(id))) return false;
    return !hasHardBoundaryOn(stances, [
      row.id,
      row.category,
      ...row.modes,
      ...row.bodyFocus,
    ]);
  });
}

export function parseSessionPlannerDraft(
  raw: string,
  base: SessionParams,
  stances: readonly UserStance[] = [],
): SessionPlannerDraft | null {
  const rec = parseJsonObject(raw);
  if (!rec) return null;
  const allowedFunctions = new Set(
    plannerFunctionRows(base, stances).map((row) => row.id),
  );
  const allowedPatterns = new Set(
    patterns.filter((row) => row.enabled).map((row) => row.id),
  );
  const functionIds = stringIds(rec.allowedFunctionIds);
  const patternIds = stringIds(rec.allowedPatternIds);
  if (!functionIds?.length || !patternIds?.length) return null;
  if (functionIds.some((id) => !allowedFunctions.has(id))) return null;
  if (patternIds.some((id) => !allowedPatterns.has(id))) return null;

  const bpmMin = numberInRange(rec.bpmMin, base.bpmMin, 35, 220);
  const bpmMax = numberInRange(rec.bpmMax, base.bpmMax, bpmMin, 240);
  const blockSecMin = numberInRange(rec.blockSecMin, base.blockSecMin, 10, 90);
  const blockSecMax = numberInRange(
    rec.blockSecMax,
    base.blockSecMax,
    blockSecMin,
    120,
  );
  return {
    bpmMin,
    bpmMax,
    blockSecMin,
    blockSecMax,
    allowedFunctionIds: functionIds,
    allowedPatternIds: patternIds,
  };
}

function plannerPrompt(
  proposal: SessionChatProposal,
  base: SessionParams,
  recentKinds: readonly string[],
  stances: readonly UserStance[],
  liveLine: string,
): string {
  const functionCatalog = plannerFunctionRows(base, stances)
    .map((row) => `${row.id}:${row.nameRu}`)
    .join(", ");
  const patternCatalog = patterns
    .filter((row) => row.enabled)
    .map((row) => `${row.id}:${row.nameRu}`)
    .join(", ");
  const finishes = finishOptions
    .filter((row) => row.enabled)
    .map((row) => row.id)
    .join(", ");
  return [
    "You are the JOI Conductor session Planner.",
    "The user has already accepted this session. Select only existing building blocks; never invent ids.",
    "Return one JSON object only with bpmMin, bpmMax, blockSecMin, blockSecMax, allowedFunctionIds, allowedPatternIds.",
    `Accepted request: kind=${proposal.sessionKind}; durationSec=${base.durationSec}; edgesTarget=${base.edgesTarget}; mode=${base.mode}; finalePolicy=${proposal.finalePolicy}.`,
    `Recent session kinds (avoid needless repetition when the catalog permits): ${recentKinds.slice(-5).join(", ") || "none"}.`,
    `Current state constraints: ${liveLine}.`,
    `Hard-boundary subjects already removed from the catalog: ${stances.filter((row) => row.kind === "hard_boundary").map((row) => row.subject).join(", ") || "none"}.`,
    `Enabled compatible functions: ${functionCatalog}.`,
    `Enabled patterns: ${patternCatalog}.`,
    `Enabled finishes are runtime-owned and may not be changed here: ${finishes}.`,
    "Bounds: bpm 35..240; block seconds 10..120. Pick at least one function and one pattern.",
    `Exact shape example: ${JSON.stringify({
      bpmMin: base.bpmMin,
      bpmMax: base.bpmMax,
      blockSecMin: base.blockSecMin,
      blockSecMax: base.blockSecMax,
      allowedFunctionIds: plannerFunctionRows(base, stances)
        .slice(0, 1)
        .map((row) => row.id),
      allowedPatternIds: patterns
        .filter((row) => row.enabled)
        .slice(0, 1)
        .map((row) => row.id),
    })}`,
    "Use these exact six keys. Do not rename allowedFunctionIds or allowedPatternIds.",
  ].join("\n");
}

function applyAcceptedShape(
  result: PlanRouletteResult,
  proposal: SessionChatProposal,
): PlanRouletteResult {
  return {
    ...result,
    params: applyProposalToParams(
      result.params,
      proposal.sessionKind,
      proposal.durationSec,
      proposal.edgesTarget,
      proposal.finalePolicy,
    ),
  };
}

/**
 * Accepted-session boundary. The app remains the queue owner: Planner may only
 * narrow catalog ids and timing ranges, then the existing Conductor builds once.
 */
export async function buildAcceptedSession(opts: {
  mistressId: MistressId;
  proposal: SessionChatProposal;
  stances?: readonly UserStance[];
  planner?: {
    client: SoulLlmClient;
    resolved: Pick<ResolvedChatLlm, "model" | "sampling" | "roleModels">;
    signal?: AbortSignal;
  };
}): Promise<AcceptedSessionBuild> {
  const requested = applyProposalToParams(
    DEFAULT_PARAMS,
    opts.proposal.sessionKind,
    opts.proposal.durationSec,
    opts.proposal.edgesTarget,
    opts.proposal.finalePolicy,
  );
  const assembled = applyAcceptedShape(
    await assembleProgramSession(opts.mistressId, requested),
    opts.proposal,
  );
  if (!opts.planner) {
    return { result: assembled, debug: { ran: false, source: "program" } };
  }

  const control = loadControlState(opts.mistressId);
  const recentKinds = control.lastSessionKinds;
  const stances = opts.stances ?? [];
  const live = controlLiveSnapshot(control);
  const liveLine = [
    `wear=${live.wear?.kind ?? "none"}`,
    `denial=${live.denial ? "on" : "off"}`,
  ].join("; ");
  const planned = await completeStructuredRole({
    client: opts.planner.client,
    role: "planner",
    messages: [
      {
        role: "user",
        content: plannerPrompt(
          opts.proposal,
          assembled.params,
          recentKinds,
          stances,
          liveLine,
        ),
      },
    ],
    parse: (raw) => parseSessionPlannerDraft(raw, assembled.params, stances),
    signal: opts.planner.signal,
  });
  const model = modelForRole(opts.planner.resolved, "planner");
  if (!planned.value) {
    return {
      result: assembled,
      debug: {
        ran: true,
        source: "program_fallback",
        model,
        parsed: "invalid",
        retryUsed: planned.retryUsed,
        latencyMs: planned.latencyMs,
        fallbackReason: "Planner output failed catalog validation",
      },
    };
  }
  return {
    result: {
      ...assembled,
      params: { ...assembled.params, ...planned.value },
    },
    debug: {
      ran: true,
      source: "planner",
      model,
      parsed: "valid",
      retryUsed: planned.retryUsed,
      latencyMs: planned.latencyMs,
    },
  };
}
