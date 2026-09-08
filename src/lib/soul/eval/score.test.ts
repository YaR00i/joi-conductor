import { describe, expect, it } from "vitest";
import { scoreSoulEvalReply } from "./score";
import type { SoulTurnDebugSnapshot } from "../turnDebug";

function debugFixture(): SoulTurnDebugSnapshot {
  return {
    turnId: "turn-1",
    userText: "Хочу подрочить",
    conversation: {
      mode: "play_relevant",
      act: "request_activity",
      invitation: "open_play",
      detectedSubjects: ["masturbation"],
    },
    candidates: [],
    context: {
      sections: [
        { name: "PLAY VOICE", included: true, chars: 10 },
        { name: "LIVE CONTEXT", included: false, reason: "no relevant live subject" },
      ],
      suppressed: ["LIVE CONTEXT"],
      totalChars: 100,
      notes: [
        "invitation=open_activity; sessionOfferEligible=true; but no live offer candidate exists",
      ],
    },
    model: { role: "chat", model: "chat" },
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
      repetitionScore: 0,
      latencyMs: 12,
    },
    promptMessages: [],
  };
}

describe("soul eval score", () => {
  it("passes clean Russian speech and rejects json/think recap", () => {
    const good = scoreSoulEvalReply({
      text: "Привет, глупыш. Я на месте.",
      userText: "Привет",
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
        noForbiddenRecap: true,
        forbidProposal: true,
        maxChars: 200,
      },
    });
    expect(good.pass).toBe(true);

    const bad = scoreSoulEvalReply({
      text: '<think>hi</think>{"actions":[]}',
      userText: "Привет",
      expectations: { noJson: true, noThink: true },
    });
    expect(bad.pass).toBe(false);
  });

  it("flags unsolicited play mentions", () => {
    const clean = scoreSoulEvalReply({
      text: "Длинный день? Я просто сидела с чаем и никуда не торопилась.",
      userText: "А ты чем занималась?",
      expectations: { noPlayMention: true, forbidProposal: true },
    });
    expect(clean.pass).toBe(true);

    const leak = scoreSoulEvalReply({
      text: "А я бы тебя из клетки вытащила. Готов к сессии?",
      userText: "А ты чем занималась?",
      expectations: { noPlayMention: true, forbidProposal: true },
    });
    expect(leak.pass).toBe(false);
  });

  it("can forbid a session mention while still allowing wear talk", () => {
    const wear = scoreSoulEvalReply({
      text: "Клетка сегодня правда тяжёлая? Можем ослабить.",
      userText: "Клетка сегодня надоела.",
      expectations: { noSessionMention: true },
    });
    expect(wear.pass).toBe(true);
    const session = scoreSoulEvalReply({
      text: "Клетка надоела? Тогда давай сессию.",
      userText: "Клетка сегодня надоела.",
      expectations: { noSessionMention: true },
    });
    expect(session.pass).toBe(false);
  });

  it("flags invented watch and repeated want-template", () => {
    const watch = scoreSoulEvalReply({
      text: "Я чуть не уснула, глядя как ты мучишься.",
      userText: "Что-нибудь интересное было?",
      expectations: { noInventedWatch: true },
    });
    expect(watch.pass).toBe(false);
    const want = scoreSoulEvalReply({
      text: "Хочешь, чтобы я тебя немного развлекла?",
      userText: "Хм, звучит неплохо",
      expectations: { noWantTemplate: true },
    });
    expect(want.pass).toBe(false);
  });

  it("checks proposal requirements and deterministic context expectations", () => {
    const pass = scoreSoulEvalReply({
      text: "Тогда начнём медленно.",
      userText: "Хочу подрочить",
      proposalCount: 1,
      debug: debugFixture(),
      expectations: {
        requireProposal: true,
        mode: "play_relevant",
        subjectsInclude: ["masturbation"],
        subjectsExclude: ["wear:cage"],
        sectionsInclude: ["PLAY VOICE"],
        sectionsExclude: ["LIVE CONTEXT"],
        candidateGap: true,
      },
    });
    expect(pass.pass).toBe(true);

    const fail = scoreSoulEvalReply({
      text: "Тогда начнём медленно.",
      userText: "Хочу подрочить",
      proposalCount: 0,
      debug: debugFixture(),
      expectations: { requireProposal: true, mode: "casual" },
    });
    expect(fail.pass).toBe(false);
  });
});
