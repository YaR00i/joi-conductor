import { describe, expect, it } from "vitest";
import type { CharacterBible } from "../character";
import { buildChatMessages } from "./prompts";
import {
  SOUL_SESSION_SUMMARY_TEXT_MAX,
  buildSoulSessionSummary,
  lastSoulSessionEvent,
  makeSoulSessionId,
  stripSoulInternalIds,
  userTurnNeedsSessionContinuity,
} from "./sessionSummary";
import { emptyMistressState } from "./types";
import {
  ingestSoulWorldEvent,
  questEndEventInput,
  sessionEndEventInput,
  sessionRefusedEventInput,
} from "./worldEvents";

const bible: CharacterBible = {
  id: "hu_tao",
  nameRu: "Ху Тао",
  locale: "ru",
  tone: ["playful"],
  taboo: ["break character"],
  diminutives: ["silly"],
  emojiAllowed: false,
  systemPrompt: "You are Hu Tao.",
  fallbackLines: {},
};

describe("soul session summary", () => {
  it("builds a completed summary from conductor facts, not a transcript", () => {
    const summary = buildSoulSessionSummary({
      mistressId: "hu_tao",
      reason: "complete",
      endedAtMs: 1_000,
      startedAtMs: 100,
      durationSec: 28 * 60,
      finaleOutcome: "ruin",
      edgesDone: 4,
      mode: "stroke",
      events: [
        { type: "beat", blockId: "a", stepIndex: 0, accent: 1, bpm: 90, atMs: 1 },
        { type: "quest_completed", questId: "q1", offerId: "o1", reward: 10 },
        { type: "unauthorized", kind: "cum", punishmentRu: "штраф" },
      ],
      contractInstanceId: "seed-1",
      contractStatus: "done",
    });
    expect(summary.result).toBe("completed");
    expect(summary.sessionId).toBe(
      makeSoulSessionId({
        mistressId: "hu_tao",
        reason: "complete",
        endedAtMs: 1_000,
        startedAtMs: 100,
      }),
    );
    expect(summary.finaleOutcome).toBe("ruin");
    expect(summary.completedContractIds).toEqual(["seed-1"]);
    expect(summary.failedContractIds).toEqual([]);
    expect(summary.questResults).toEqual([{ questId: "q1", result: "completed" }]);
    expect(summary.userChoices).toContain("кончил без разрешения");
    expect(summary.conciseText).toMatch(/Сессия завершена/);
    expect(summary.conciseText).toMatch(/Руина/);
    expect(summary.conciseText).not.toMatch(/BPM|90|block_start|seed-1|q1|sess:/);
    expect(summary.conciseText.length).toBeLessThanOrEqual(
      SOUL_SESSION_SUMMARY_TEXT_MAX,
    );
    expect(summary.conciseText.split(/[.!?]/).filter(Boolean).length).toBeLessThanOrEqual(4);
  });

  it("builds a different aborted summary and does not invent a finale", () => {
    const summary = buildSoulSessionSummary({
      mistressId: "hu_tao",
      reason: "abort",
      endedAtMs: 2_000,
      edgesDone: 2,
      events: [{ type: "quest_declined", questId: "q2", offerId: "o2" }],
    });
    expect(summary.result).toBe("aborted");
    expect(summary.finaleOutcome).toBeUndefined();
    expect(summary.conciseText).toMatch(/оборвана/i);
    expect(summary.conciseText).not.toMatch(/Сессия завершена/);
    expect(summary.userChoices).toContain("отказался от задания");
  });

  it("keeps conciseText bounded even with extra choices", () => {
    const summary = buildSoulSessionSummary({
      mistressId: "hu_tao",
      reason: "complete",
      endedAtMs: 3_000,
      finaleOutcome: "deny",
      edgesDone: 12,
      events: [
        { type: "unauthorized", kind: "edge", punishmentRu: "a" },
        { type: "unauthorized", kind: "ruin", punishmentRu: "b" },
        { type: "unauthorized", kind: "cum", punishmentRu: "c" },
        { type: "quest_declined", questId: "q", offerId: "o" },
      ],
    });
    expect(summary.conciseText.length).toBeLessThanOrEqual(
      SOUL_SESSION_SUMMARY_TEXT_MAX,
    );
  });
});

describe("session summary world events", () => {
  it("ingests one completed event and does not duplicate the same sessionId", () => {
    const input = sessionEndEventInput({
      mistressId: "hu_tao",
      reason: "complete",
      finaleOutcome: "cum",
      edgesDone: 3,
      sessionId: "sess:hu_tao:1:complete",
      endedAtMs: 10_000,
    });
    const first = ingestSoulWorldEvent(emptyMistressState("Ху Тао", ["playful"]), input);
    expect(first.duplicate).toBe(false);
    expect(first.state.recentEvents).toHaveLength(1);
    expect(first.state.recentEvents[0]?.kind).toBe("session_completed");
    const again = ingestSoulWorldEvent(first.state, {
      ...input,
      summary: "Сессия завершена. Другая формулировка.",
      atMs: 10_000 + 7 * 60 * 60 * 1000,
    });
    expect(again.duplicate).toBe(true);
    expect(again.state.recentEvents).toHaveLength(1);
  });

  it("ingests abort as a different result and opens a loop", () => {
    const result = ingestSoulWorldEvent(
      emptyMistressState("Ху Тао", ["playful"]),
      sessionEndEventInput({
        mistressId: "hu_tao",
        reason: "abort",
        sessionId: "sess:hu_tao:2:abort",
        endedAtMs: 20_000,
        edgesDone: 1,
      }),
    );
    expect(result.state.recentEvents[0]?.kind).toBe("session_aborted");
    expect(result.decision).toBe("open_loop");
    expect(result.state.openLoops).toHaveLength(1);
    expect(result.state.openLoops[0]?.subjectId).toBe("sess:hu_tao:2:abort");
  });

  it("does not write a second contract milestone from the session summary", () => {
    const start = emptyMistressState("Ху Тао", ["playful"]);
    const contract = ingestSoulWorldEvent(start, {
      kind: "contract_completed",
      mistressId: "hu_tao",
      summary: "Контракт выполнен: Hands-off",
      importance: 3,
      subjectId: "seed-1",
      atMs: 1,
    });
    const session = ingestSoulWorldEvent(
      contract.state,
      sessionEndEventInput({
        mistressId: "hu_tao",
        reason: "complete",
        finaleOutcome: "ruin",
        sessionId: "sess:hu_tao:3:complete",
        endedAtMs: 2,
        contractInstanceId: "seed-1",
        contractStatus: "done",
        contractTitleRu: "Hands-off",
      }),
    );
    const contractMilestones = session.state.user.sharedMilestones.filter((row) =>
      /Контракт выполнен/.test(row),
    );
    expect(contractMilestones).toHaveLength(1);
    expect(session.state.recentEvents.filter((ev) => ev.kind === "contract_completed")).toHaveLength(1);
    expect(session.state.recentEvents.filter((ev) => ev.kind === "session_completed")).toHaveLength(1);
    expect(session.state.recentEvents[1]?.summary).not.toMatch(/Hands-off/);
    expect(
      session.state.user.sharedMilestones.filter((row) => /сессия завершена/i.test(row))
        .every((row) => !/Hands-off/.test(row)),
    ).toBe(true);
  });

  it("does not ingest a second quest event from the session summary", () => {
    const quest = ingestSoulWorldEvent(
      emptyMistressState("Ху Тао", ["playful"]),
      questEndEventInput({
        mistressId: "hu_tao",
        outcome: "completed",
        titleRu: "Ударь по яйцам",
        questId: "q1",
      }),
    );
    const session = ingestSoulWorldEvent(
      quest.state,
      sessionEndEventInput({
        mistressId: "hu_tao",
        reason: "complete",
        sessionId: "sess:hu_tao:4:complete",
        endedAtMs: 3,
        events: [
          { type: "quest_completed", questId: "q1", offerId: "o1", reward: 10 },
        ],
      }),
    );
    expect(session.state.recentEvents.filter((ev) => ev.kind === "quest_completed")).toHaveLength(1);
    expect(session.state.recentEvents.filter((ev) => ev.kind === "session_completed")).toHaveLength(1);
    expect(
      session.state.user.sharedMilestones.filter((row) => /квест выполнен/i.test(row)),
    ).toHaveLength(0);
  });

  it("closes refuse/abort loops on complete and leaves unrelated loops", () => {
    const refused = ingestSoulWorldEvent(
      emptyMistressState("Ху Тао", ["playful"]),
      sessionRefusedEventInput("hu_tao"),
    );
    const withMorning = ingestSoulWorldEvent(refused.state, {
      kind: "morning_pack",
      mistressId: "hu_tao",
      summary: "Утренний пак: пропустил 1",
      importance: 2,
      atMs: 5,
    });
    const withContract = ingestSoulWorldEvent(withMorning.state, {
      kind: "contract_failed",
      mistressId: "hu_tao",
      summary: "Контракт провален: зарядка",
      importance: 2,
      subjectId: "c-unrelated",
      atMs: 6,
    });
    expect(withContract.state.openLoops.map((loop) => loop.source).sort()).toEqual([
      "contract_failed",
      "morning_pack",
      "session_refused",
    ]);
    const done = ingestSoulWorldEvent(
      withContract.state,
      sessionEndEventInput({
        mistressId: "hu_tao",
        reason: "complete",
        sessionId: "sess:hu_tao:5:complete",
        endedAtMs: 7,
        finaleOutcome: "cum",
      }),
    );
    const leftover = done.state.openLoops.map((loop) => loop.source).sort();
    expect(leftover).toEqual(["contract_failed", "morning_pack"]);
  });

  it("updates the abort loop for the same session id instead of stacking", () => {
    const first = ingestSoulWorldEvent(
      emptyMistressState("Ху Тао", ["playful"]),
      sessionEndEventInput({
        mistressId: "hu_tao",
        reason: "abort",
        sessionId: "sess:hu_tao:6:abort",
        endedAtMs: 8,
      }),
    );
    expect(first.state.openLoops).toHaveLength(1);
    const again = ingestSoulWorldEvent(
      first.state,
      sessionEndEventInput({
        mistressId: "hu_tao",
        reason: "abort",
        sessionId: "sess:hu_tao:6:abort",
        endedAtMs: 9,
        edgesDone: 2,
      }),
    );
    expect(again.duplicate).toBe(true);
    expect(again.state.openLoops).toHaveLength(1);
  });
});

describe("session summary prompt continuity", () => {
  it("does not recap on greeting and has no internal ids when he asks", () => {
    const state = emptyMistressState("Ху Тао", ["playful"]);
    const ingested = ingestSoulWorldEvent(
      state,
      sessionEndEventInput({
        mistressId: "hu_tao",
        reason: "complete",
        finaleOutcome: "ruin",
        edgesDone: 4,
        sessionId: "sess:hu_tao:7:complete",
        endedAtMs: 11,
      }),
    );
    expect(lastSoulSessionEvent(ingested.state)?.subjectId).toBe(
      "sess:hu_tao:7:complete",
    );
    const greeting =
      buildChatMessages(bible, ingested.state, "Привет")[0]?.content ?? "";
    expect(greeting).not.toContain("--- RECENT CONTINUITY ---");
    expect(greeting).not.toContain("--- INTENT ---");
    expect(userTurnNeedsSessionContinuity("Привет")).toBe(false);

    const ask =
      buildChatMessages(
        bible,
        ingested.state,
        "А вчерашняя сессия была жёсткой",
      )[0]?.content ?? "";
    expect(ask).toContain("--- RECENT CONTINUITY ---");
    expect(ask).toContain("Руина");
    expect(ask).not.toContain("sess:");
    expect(ask).not.toContain("hu_tao:7");
    expect(stripSoulInternalIds(ask)).not.toMatch(/\bsess:/);
  });
});
