import type { SoulTurnDebugSnapshot } from "../turnDebug";
import type { SoulEvalExpectation } from "./cases";

export type SoulEvalTurnMetrics = {
  promptChars: number | null;
  includedSectionCount: number;
  irrelevantSectionCount: number;
  structuredRetryCount: number;
  chatRetryUsed: boolean;
  jsonValidity: {
    router: boolean | null;
    extractor: boolean | null;
    planner: boolean | null;
  };
  latencyMs: {
    chat: number | null;
    router: number | null;
    extractor: number | null;
    planner: number | null;
  };
  proposalFalsePositive: boolean;
  planValidationRejectionReasons: string[];
};

function structuredValid(
  ran: boolean | undefined,
  parsed: string | undefined,
  accepted: readonly { acceptedByValidator: boolean; reason?: string }[] = [],
): boolean | null {
  if (!ran) return null;
  if (parsed === "invalid") return false;
  return accepted.every((row) => row.acceptedByValidator);
}

/** Metrics that are deterministic from the same snapshot shown in Chat debug. */
export function collectSoulEvalTurnMetrics(opts: {
  debug?: SoulTurnDebugSnapshot;
  expectations: SoulEvalExpectation;
  proposalCount: number;
}): SoulEvalTurnMetrics {
  const debug = opts.debug;
  const included = debug?.context.sections.filter((row) => row.included) ?? [];
  const mode = debug?.conversation.mode;
  const subjects = new Set(debug?.conversation.detectedSubjects ?? []);
  const irrelevant = included.filter((section) => {
    if (section.name === "PLAY VOICE" && mode !== "play_relevant") return true;
    if (
      section.name === "LIVE CONTEXT" &&
      (mode === "greeting" || mode === "casual" || mode === "personal")
    ) {
      return true;
    }
    if (
      section.name === "APPEARANCE" &&
      !subjects.has("appearance") &&
      !subjects.has("clothing")
    ) {
      return true;
    }
    return false;
  });
  const retryFlags = [
    debug?.router?.retryUsed,
    debug?.extractor?.retryUsed,
    debug?.planner?.retryUsed,
  ];
  return {
    promptChars: debug?.context.totalChars ?? null,
    includedSectionCount: included.length,
    irrelevantSectionCount: irrelevant.length,
    structuredRetryCount: retryFlags.filter(Boolean).length,
    chatRetryUsed: debug?.speech.retryUsed === true,
    jsonValidity: {
      router: debug?.router?.ran
        ? debug.router.parsed !== "invalid"
        : null,
      extractor: structuredValid(
        debug?.extractor?.ran,
        debug?.extractor?.parsed,
        debug?.extractor?.proposals,
      ),
      planner: debug?.planner?.ran
        ? debug.planner.parsed === "valid"
        : null,
    },
    latencyMs: {
      chat: debug?.speech.latencyMs ?? null,
      router: debug?.router?.latencyMs ?? null,
      extractor: debug?.extractor?.latencyMs ?? null,
      planner: debug?.planner?.latencyMs ?? null,
    },
    proposalFalsePositive:
      opts.expectations.forbidProposal === true && opts.proposalCount > 0,
    planValidationRejectionReasons: debug?.planner?.fallbackReason
      ? [debug.planner.fallbackReason]
      : [],
  };
}
