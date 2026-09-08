import { describe, expect, it } from "vitest";
import type { SoulTurnDebugSnapshot } from "../turnDebug";
import { collectSoulEvalTurnMetrics } from "./metrics";

describe("soul eval metrics", () => {
  it("derives prompt, retry, validity, latency and false-positive metrics", () => {
    const debug = {
      conversation: {
        mode: "personal",
        detectedSubjects: ["work"],
      },
      context: {
        totalChars: 321,
        sections: [
          { name: "IDENTITY", included: true, chars: 100 },
          { name: "LIVE CONTEXT", included: true, chars: 20 },
          { name: "PLAY VOICE", included: false },
        ],
      },
      speech: { retryUsed: false, latencyMs: 40 },
      extractor: {
        ran: true,
        parsed: "valid",
        retryUsed: true,
        latencyMs: 8,
        proposals: [],
      },
      router: {
        ran: true,
        parsed: "invalid",
        retryUsed: true,
        latencyMs: 6,
      },
      planner: {
        ran: true,
        parsed: "invalid",
        retryUsed: true,
        latencyMs: 7,
        fallbackReason: "unknown id",
      },
    } as unknown as SoulTurnDebugSnapshot;
    expect(
      collectSoulEvalTurnMetrics({
        debug,
        expectations: { forbidProposal: true },
        proposalCount: 1,
      }),
    ).toEqual({
      promptChars: 321,
      includedSectionCount: 2,
      irrelevantSectionCount: 1,
      structuredRetryCount: 3,
      chatRetryUsed: false,
      jsonValidity: {
        router: false,
        extractor: true,
        planner: false,
      },
      latencyMs: {
        chat: 40,
        router: 6,
        extractor: 8,
        planner: 7,
      },
      proposalFalsePositive: true,
      planValidationRejectionReasons: ["unknown id"],
    });
  });
});
