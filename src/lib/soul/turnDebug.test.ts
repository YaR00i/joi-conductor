import { describe, expect, it } from "vitest";
import type { CharacterBible } from "../character";
import { sendSoulChatTurn } from "./engine";
import {
  listInitiativeCandidates,
  prepareSoulTurnIntent,
  type SoulInitiativeContext,
} from "./initiative";
import { buildChatMessages } from "./prompts";
import {
  formatSoulTurnDebugReport,
  inspectSoulTurnDebug,
  mergeProposalLifecycleDebug,
} from "./turnDebug";
import { emptyMistressState } from "./types";
import type { SoulLlmClient } from "./client";

const bible: CharacterBible = {
  id: "hu_tao",
  nameRu: "Ху Тао",
  locale: "ru",
  tone: ["playful"],
  taboo: ["break character"],
  diminutives: ["silly"],
  emojiAllowed: false,
  systemPrompt: "You are Hu Tao, director of Wangsheng.",
  fallbackLines: { chat: ["Хе-хе. Скажи ещё раз."] },
};

function ctx(
  overrides: Partial<SoulInitiativeContext> = {},
): SoulInitiativeContext {
  return {
    nowMs: 1_000_000,
    checkInOverdue: false,
    sessionOfferOpen: false,
    ...overrides,
  };
}

function inspectTurn(
  userText: string,
  initiativeCtx: SoulInitiativeContext,
  intentGoal?: string,
) {
  const state = emptyMistressState(bible.nameRu, bible.tone);
  if (intentGoal) {
    state.intent = {
      goal: intentGoal,
      tone: "playful",
      priority: 2,
      source: "session",
      candidateId: "session_offer:open",
      expiresAtMs: initiativeCtx.nowMs + 60_000,
    };
  }
  const prepared = prepareSoulTurnIntent(state, userText, initiativeCtx);
  const messages = buildChatMessages(bible, prepared.state, userText, {
    nowMs: initiativeCtx.nowMs,
  });
  return inspectSoulTurnDebug({
    userText,
    state: prepared.state,
    candidates: listInitiativeCandidates(prepared.state, initiativeCtx),
    selected: prepared.selected,
    intent: prepared.state.intent,
    stances: prepared.state.user.stances ?? [],
    nowMs: initiativeCtx.nowMs,
    sessionOfferOpen: initiativeCtx.sessionOfferOpen,
    systemPrompt: messages[0]?.content ?? "",
    consumed: false,
  });
}

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

describe("soul turn debug", () => {
  it("explains a suppressed session offer on greeting", () => {
    const debug = inspectTurn("Привет", ctx({ sessionOfferOpen: true }));
    expect(debug.conversation.mode).toBe("greeting");
    expect(debug.conversation.invitation).toBe("none");
    const offer = debug.candidates.find((row) => row.kind === "session_offer");
    expect(offer?.eligible).toBe(false);
    expect(offer?.reason).toMatch(/ordinary greeting/i);
    expect(debug.selectedIntent?.includedInPrompt).not.toBe(true);
    expect(
      debug.context.sections.find((row) => row.name === "TURN INTENT")?.included,
    ).toBe(false);
  });

  it("marks offer_session eligible on Чем займёмся? when the chip exists", () => {
    const debug = inspectTurn("Чем займёмся?", ctx({ sessionOfferOpen: true }));
    expect(debug.conversation.invitation).toBe("open_activity");
    const offer = debug.candidates.find((row) => row.kind === "session_offer");
    expect(offer?.eligible).toBe(true);
    expect(offer?.reason).toContain("invitation=open_activity");
    expect(debug.selectedIntent?.includedInPrompt).toBe(true);
    expect(
      debug.context.sections.find((row) => row.name === "TURN INTENT")?.included,
    ).toBe(true);
    expect(debug.initiative?.consumed).toBe(false);
    expect(debug.initiative?.consumeReason).toBe("not consumed");
  });

  it("notes eligibility without a live offer candidate", () => {
    const debug = inspectTurn("Чем займёмся?", ctx({ sessionOfferOpen: false }));
    expect(debug.conversation.invitation).toBe("open_activity");
    expect(debug.context.notes.join(" ")).toMatch(/no live offer candidate/);
    const offer = debug.candidates.find((row) => row.kind === "session_offer");
    expect(offer?.eligible).toBe(false);
    expect(debug.selectedIntent).toBeUndefined();
  });

  it("keeps wear in prompt and suppresses session on cage talk", () => {
    const debug = inspectTurn(
      "Клетка сегодня надоела",
      ctx({ sessionOfferOpen: true }),
    );
    expect(debug.conversation.detectedSubjects).toContain("wear:cage");
    const offer = debug.candidates.find((row) => row.kind === "session_offer");
    expect(offer?.eligible).toBe(false);
    expect(offer?.reason).toMatch(/subject mismatch|no invitation/);
    expect(
      debug.context.sections.find((row) => row.name === "PLAY VOICE")?.included,
    ).toBe(true);
    expect(
      debug.context.sections.find((row) => row.name === "TURN INTENT")?.included,
    ).toBe(false);
  });

  it("includes session intent on an explicit session invite", () => {
    const debug = inspectTurn("Давай сессию", ctx({ sessionOfferOpen: true }));
    expect(debug.conversation.invitation).toBe("explicit_session");
    expect(debug.selectedIntent?.includedInPrompt).toBe(true);
    expect(
      debug.context.sections.find((row) => row.name === "TURN INTENT")?.included,
    ).toBe(true);
  });

  it("formats a compact report without dumping memory files", () => {
    const debug = inspectTurn("Чем займёмся?", ctx({ sessionOfferOpen: true }));
    const report = formatSoulTurnDebugReport({
      turnId: "t1",
      userText: "Чем займёмся?",
      ...debug,
      model: { role: "chat", model: "qwen3-abliterated:14b", preset: "balanced" },
      roles: {
        chat: "qwen3-abliterated:14b",
        router: "qwen2.5:7b",
        extractor: "qwen2.5:7b",
        planner: "qwen2.5:7b",
      },
      speech: {
        firstAttemptValid: true,
        retryUsed: false,
        finalValidation: "ok",
        repetitionScore: 0.11,
      },
      extractor: {
        ran: false,
        speechHintDetected: false,
        proposals: [],
        cardEmitted: false,
      },
      router: { ran: false, updates: [], rejected: [] },
      promptMessages: [],
    });
    expect(report).toContain("SOUL TURN DEBUG");
    expect(report).toContain("invitation: open_activity");
    expect(report).toContain("qwen3-abliterated:14b");
    expect(report).not.toContain("MEMORY.md");
    expect(report).not.toContain("USER.md");
  });

  it("records retry, extractor skip, and does not change turn semantics", async () => {
    const hello = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Привет",
      client: scriptedClient(["Привет, глупыш."]),
      nowMs: 10,
    });
    expect(hello.reply).toBe("Привет, глупыш.");
    expect(hello.proposals).toEqual([]);
    expect(hello.debug?.speech.firstAttemptValid).toBe(true);
    expect(hello.debug?.speech.retryUsed).toBe(false);
    expect(hello.debug?.extractor?.ran).toBe(false);
    expect(hello.debug?.initiative?.consumed).toBe(false);
    expect(hello.state.initiative.consumedIds).toEqual([]);

    const retried = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Привет",
      client: scriptedClient(["<think>secret</think>", "Привет ещё раз."]),
      nowMs: 11,
    });
    expect(retried.reply).toBe("Привет ещё раз.");
    expect(retried.debug?.speech.retryUsed).toBe(true);
    expect(retried.debug?.speech.firstAttemptValid).toBe(false);

    const extracted = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Чем займёмся?",
      client: scriptedClient([
        "Сессия будет.",
        '{"actions":[{"op":"propose_session","kind":"edges","durationSec":1800,"edgesTarget":5,"finalePolicy":"ruin_norm"}]}',
      ]),
      nowMs: 12,
    });
    expect(extracted.debug?.extractor?.speechHintDetected).toBe(true);
    expect(extracted.debug?.extractor?.ran).toBe(true);
    expect(extracted.proposals[0]?.kind).toBe("session");
    expect(extracted.debug?.extractor?.cardEmitted).toBe(true);
    expect(extracted.debug?.proposalLifecycle).toEqual([
      expect.objectContaining({
        proposalId: extracted.proposals[0]?.id,
        kind: "session",
        state: "created",
      }),
    ]);

    const accepted = mergeProposalLifecycleDebug(
      extracted.debug!,
      extracted.proposals[0]!,
      "accepted",
      undefined,
      20,
    );
    const started = mergeProposalLifecycleDebug(
      accepted,
      extracted.proposals[0]!,
      "started",
      "planner",
      21,
    );
    expect(started.proposalLifecycle?.map((row) => row.state)).toEqual([
      "created",
      "accepted",
      "started",
    ]);
    expect(formatSoulTurnDebugReport(started)).toContain(
      "session: started (planner)",
    );
  });

  it("records refused, blocked and failed terminal card states without duplicates", () => {
    const base = {
      turnId: "t-card",
      userText: "Давай сессию",
      ...inspectTurn("Давай сессию", ctx()),
      model: { role: "chat" as const, model: "chat" },
      roles: {
        chat: "chat",
        router: "small",
        extractor: "small",
        planner: "small",
      },
      speech: {
        firstAttemptValid: true,
        retryUsed: false,
        finalValidation: "ok",
      },
      promptMessages: [],
    };
    const offer = {
      id: "session:edges:600",
      kind: "session" as const,
    };
    const refused = mergeProposalLifecycleDebug(base, offer, "refused", undefined, 1);
    const same = mergeProposalLifecycleDebug(refused, offer, "refused", undefined, 2);
    expect(same).toBe(refused);
    const blocked = mergeProposalLifecycleDebug(base, offer, "blocked", "hard_boundary", 3);
    const failed = mergeProposalLifecycleDebug(base, offer, "failed", "network", 4);
    expect(blocked.proposalLifecycle?.at(-1)).toMatchObject({
      state: "blocked",
      detail: "hard_boundary",
    });
    expect(failed.proposalLifecycle?.at(-1)).toMatchObject({
      state: "failed",
      detail: "network",
    });
  });
});
