import { beforeEach, describe, expect, it, vi } from "vitest";
import { functions, patterns, toys } from "../../catalog";
import { buildQueue } from "../../conductor";
import type { PlanRouletteResult } from "../../planRoulette";
import { DEFAULT_PARAMS } from "../../types";
import type { SoulLlmClient } from "../client";
import { DEFAULT_CHAT_SAMPLING } from "../llmSettings";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../../test/localStorageMock";
import * as assembledSession from "./assembleSession";
import {
  buildAcceptedSession,
  parseSessionPlannerDraft,
  type SessionChatProposal,
} from "./sessionPlanner";
import { loadControlState, saveControlState } from "./store";

installLocalStorageMock();

const assembledResult: PlanRouletteResult = {
  mood: "calm",
  moodScore: 0,
  params: { ...DEFAULT_PARAMS },
  seed: 7,
  tags: "",
  tagsLabelRu: "",
  mediaKinds: [],
  mediaTypeId: "all",
  sessionToyIds: [],
  toysResolved: false,
  summary: [],
};

const proposal: SessionChatProposal = {
  id: "session:edges:600",
  kind: "session",
  sessionKind: "edges",
  durationSec: 600,
  edgesTarget: 5,
  finalePolicy: "ruin_norm",
  noteRu: "",
  titleRu: "Сессия Conductor",
  hintRu: "",
  confirmRu: "Согласен",
  refuseRu: "Не сейчас",
  source: "extractor",
};

function scriptedClient(replies: string[]): SoulLlmClient {
  const queue = [...replies];
  return {
    async complete() {
      const next = queue.shift();
      if (next == null) throw new Error("no scripted reply");
      return { text: next };
    },
  };
}

const resolved = {
  model: "chat",
  sampling: { ...DEFAULT_CHAT_SAMPLING },
  roleModels: { router: "", extractor: "", planner: "planner-small" },
};

describe("accepted session planner validation", () => {
  const functionId = functions.find(
    (row) =>
      row.enabled &&
      row.modes.includes(DEFAULT_PARAMS.mode) &&
      row.requiresToys.length === 0,
  )!.id;
  const patternId = patterns.find((row) => row.enabled)!.id;

  beforeEach(() => {
    resetLocalStorage();
    vi.spyOn(assembledSession, "assembleProgramSession").mockResolvedValue({
      ...assembledResult,
      params: { ...assembledResult.params },
    });
  });

  it("accepts catalog ids and clamps timing bounds", () => {
    const draft = parseSessionPlannerDraft(
      JSON.stringify({
        bpmMin: 10,
        bpmMax: 999,
        blockSecMin: 1,
        blockSecMax: 999,
        allowedFunctionIds: [functionId],
        allowedPatternIds: [patternId],
      }),
      DEFAULT_PARAMS,
    );
    expect(draft).toMatchObject({
      bpmMin: 35,
      bpmMax: 240,
      blockSecMin: 10,
      blockSecMax: 120,
      allowedFunctionIds: [functionId],
      allowedPatternIds: [patternId],
    });
  });

  it("rejects invented ids instead of silently widening the pool", () => {
    expect(
      parseSessionPlannerDraft(
        JSON.stringify({
          allowedFunctionIds: ["invented_function"],
          allowedPatternIds: [patternId],
        }),
        DEFAULT_PARAMS,
      ),
    ).toBeNull();
    expect(
      parseSessionPlannerDraft(
        JSON.stringify({
          allowedFunctionIds: [functionId],
          allowedPatternIds: ["invented_pattern"],
        }),
        DEFAULT_PARAMS,
      ),
    ).toBeNull();
  });

  it("rejects a function hidden by a hard boundary", () => {
    const fn = functions.find((row) => row.id === functionId)!;
    expect(
      parseSessionPlannerDraft(
        JSON.stringify({
          allowedFunctionIds: [functionId],
          allowedPatternIds: [patternId],
        }),
        DEFAULT_PARAMS,
        [
          {
            subject: fn.category,
            kind: "hard_boundary",
            confidence: 1,
            evidenceCount: 1,
            lastEvidenceAtMs: 1,
            source: "explicit_chat",
          },
        ],
      ),
    ).toBeNull();
  });

  it("uses program mode without calling an LLM", async () => {
    const client = { complete: vi.fn() } as unknown as SoulLlmClient;
    const built = await buildAcceptedSession({
      mistressId: "hu_tao",
      proposal,
    });
    expect(client.complete).not.toHaveBeenCalled();
    expect(built.debug).toEqual({ ran: false, source: "program" });
    expect(built.result.params.durationSec).toBe(600);
    expect(built.result.params.edgesTarget).toBe(5);
  });

  it("accepts a valid Planner draft and reports the role model", async () => {
    const before = loadControlState("hu_tao");
    const built = await buildAcceptedSession({
      mistressId: "hu_tao",
      proposal,
      planner: {
        client: scriptedClient([
          JSON.stringify({
            bpmMin: 55,
            bpmMax: 95,
            blockSecMin: 20,
            blockSecMax: 35,
            allowedFunctionIds: [functionId],
            allowedPatternIds: [patternId],
          }),
        ]),
        resolved,
      },
    });
    expect(built.debug).toMatchObject({
      ran: true,
      source: "planner",
      model: "planner-small",
      parsed: "valid",
    });
    expect(built.result.params.allowedFunctionIds).toEqual([functionId]);
    expect(loadControlState("hu_tao")).toEqual(before);

    const queue = buildQueue(
      {
        ...built.result.params,
        durationSec: 240,
        edgesTarget: 0,
        ruinsTarget: 0,
      },
      { functions, patterns, toys },
      built.result.seed,
    );
    const active = queue.filter(
      (block) => block.goal !== "rest" && block.goal !== "finale",
    );
    expect(active.length).toBeGreaterThan(0);
    expect(active.every((block) => block.functionId === functionId)).toBe(true);
    expect(
      active.every(
        (block) =>
          block.patternId === patternId || block.patternId === "vibe_timeline",
      ),
    ).toBe(true);
  });

  it("retries malformed output once, then accepts the valid draft", async () => {
    const client = scriptedClient([
      "not json",
      JSON.stringify({
        allowedFunctionIds: [functionId],
        allowedPatternIds: [patternId],
      }),
    ]);
    const built = await buildAcceptedSession({
      mistressId: "hu_tao",
      proposal,
      planner: { client, resolved },
    });
    expect(built.debug.source).toBe("planner");
    expect(built.debug.retryUsed).toBe(true);
  });

  it("falls back to the program result after two invalid drafts", async () => {
    const built = await buildAcceptedSession({
      mistressId: "hu_tao",
      proposal,
      planner: {
        client: scriptedClient(["not json", '{"allowedFunctionIds":[]}']),
        resolved,
      },
    });
    expect(built.debug).toMatchObject({
      ran: true,
      source: "program_fallback",
      parsed: "invalid",
      retryUsed: true,
    });
    expect(built.result.params.allowedFunctionIds).toEqual([]);
  });

  it("passes recent duplicate kinds to the Planner anti-repeat instruction", async () => {
    const state = loadControlState("hu_tao");
    saveControlState("hu_tao", {
      ...state,
      lastSessionKinds: ["edges", "edges"],
    });
    let prompt = "";
    const client: SoulLlmClient = {
      async complete(opts) {
        prompt = opts.messages[0]?.content ?? "";
        return {
          text: JSON.stringify({
            allowedFunctionIds: [functionId],
            allowedPatternIds: [patternId],
          }),
        };
      },
    };
    await buildAcceptedSession({
      mistressId: "hu_tao",
      proposal,
      planner: { client, resolved },
    });
    expect(prompt).toContain("edges, edges");
    expect(prompt).toContain("avoid needless repetition");
  });
});
