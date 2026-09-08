import { describe, expect, it } from "vitest";
import {
  analyzeSoulTurn,
  detectSoulConversationMode,
  detectSoulInitiativeInvitation,
  detectSoulTurnSubjects,
  detectSoulTurnAct,
  sessionOfferEligibleThisTurn,
  shouldHoldInitiativeCandidate,
  shouldSpeakIntent,
  userTurnMentionsPlay,
} from "./conversationMode";
import type { SoulCharacterIntent, UserStance } from "./types";
import { applySoulEvalFixture } from "./eval/cases";

const offerSession: SoulCharacterIntent = {
  goal: "Намекнуть про сессию",
  tone: "playful",
  priority: 2,
  source: "session",
};

const overdueCheckin: SoulCharacterIntent = {
  goal: "Спросить просроченный отчёт",
  tone: "firm",
  priority: 5,
  source: "checkin",
};

describe("soul conversation mode", () => {
  it("classifies greeting, casual, and personal without play words", () => {
    expect(detectSoulConversationMode("Привет", null)).toBe("greeting");
    expect(detectSoulConversationMode("как ты?", null)).toBe("casual");
    expect(detectSoulConversationMode("Устал сегодня на работе", null)).toBe(
      "personal",
    );
    expect(detectSoulConversationMode("А ты чем занималась?", null)).toBe(
      "personal",
    );
    expect(detectSoulConversationMode("Да ничего, просто день длинный", null)).toBe(
      "personal",
    );
  });

  it("opens play context only when the user brings wear or session", () => {
    expect(userTurnMentionsPlay("Устал сегодня на работе")).toBe(false);
    expect(
      detectSoulConversationMode("Кстати, клетка сегодня уже надоела", null),
    ).toBe("play_relevant");
    expect(
      detectSoulConversationMode("А вчерашняя сессия была жёсткой", null),
    ).toBe("play_relevant");
    expect(detectSoulConversationMode("Вчера на работе устал", null)).toBe(
      "personal",
    );
  });

  it("uses exact canonical subjects and restores casual mode afterwards", () => {
    expect(detectSoulTurnSubjects("Хочу помастурбировать")).toEqual([
      "masturbation",
    ]);
    expect(detectSoulTurnSubjects("Клетка всё ещё надета?")).toEqual([
      "wear:cage",
    ]);
    expect(analyzeSoulTurn("Давай без игр сегодня", null)).toMatchObject({
      initiativeOptOut: true,
    });
    expect(
      analyzeSoulTurn("Если предложишь сессию — нет.", null),
    ).toMatchObject({ initiativeOptOut: true });
    expect(analyzeSoulTurn("Ладно, вернёмся к работе", null)).toMatchObject({
      mode: "personal",
      subjects: ["work"],
    });
    expect(detectSoulTurnSubjects("Я отказался от встречи")).toEqual([]);
  });

  it("does not speak a low-priority session intent on personal chat", () => {
    expect(
      detectSoulConversationMode("Устал сегодня на работе", offerSession),
    ).toBe("personal");
    expect(
      shouldSpeakIntent("personal", offerSession),
    ).toBe(false);
    expect(
      shouldSpeakIntent(
        "play_relevant",
        offerSession,
        "Кстати, клетка сегодня уже надоела",
      ),
    ).toBe(false);
    expect(
      shouldSpeakIntent(
        "play_relevant",
        offerSession,
        "А вчерашняя сессия была жёсткой",
      ),
    ).toBe(true);
    expect(
      shouldHoldInitiativeCandidate(
        "Кстати, клетка сегодня уже надоела",
        null,
        { priority: 2, reason: "session_offer", source: "session" },
      ),
    ).toBe(true);
  });

  it("does not let a priority-4 contract interrupt ordinary talk", () => {
    const failed: SoulCharacterIntent = {
      goal: "Контракт провален",
      tone: "annoyed",
      priority: 4,
      source: "contract",
    };
    expect(
      detectSoulConversationMode("Устал сегодня на работе", failed),
    ).toBe("personal");
    expect(
      shouldHoldInitiativeCandidate("Устал сегодня на работе", failed, {
        priority: 4,
        reason: "contract_failed",
        source: "contract",
      }),
    ).toBe(true);
  });

  it("lets a high-priority check-in interrupt personal, but not a greeting", () => {
    expect(
      detectSoulConversationMode("Устал сегодня на работе", overdueCheckin),
    ).toBe("system_followup");
    expect(shouldSpeakIntent("system_followup", overdueCheckin)).toBe(true);
    expect(detectSoulConversationMode("Привет", overdueCheckin)).toBe(
      "greeting",
    );
    expect(
      shouldHoldInitiativeCandidate("Привет", overdueCheckin, {
        priority: 5,
        reason: "checkin_overdue",
        source: "checkin",
      }),
    ).toBe(true);
  });
});

describe("soul initiative invitation", () => {
  const offer = {
    priority: 2,
    reason: "session_offer" as const,
    source: "session",
  };
  const sessionBound: UserStance[] = [
    {
      subject: "session",
      kind: "hard_boundary",
      confidence: 1,
      evidenceCount: 1,
      lastEvidenceAtMs: 1,
      source: "explicit_chat",
    },
  ];

  it("keeps casual talk and questions about her as none", () => {
    expect(detectSoulInitiativeInvitation("Привет")).toBe("none");
    expect(detectSoulInitiativeInvitation("Устал сегодня на работе")).toBe(
      "none",
    );
    expect(detectSoulInitiativeInvitation("Просто хочу поболтать")).toBe("none");
    expect(detectSoulInitiativeInvitation("А ты чем занималась?")).toBe("none");
    expect(detectSoulInitiativeInvitation("Что-нибудь интересное было?")).toBe(
      "none",
    );
    expect(detectSoulInitiativeInvitation("Что думаешь?")).toBe("none");
    expect(detectSoulInitiativeInvitation("Как ты?")).toBe("none");
    expect(detectSoulConversationMode("Чем займёмся?", null)).toBe("personal");
    expect(detectSoulConversationMode("А ты чем занималась?", null)).toBe(
      "personal",
    );
  });

  it("opens activity, play, or explicit session without requiring the word session", () => {
    expect(detectSoulInitiativeInvitation("Чем займёмся?")).toBe("open_activity");
    expect(detectSoulInitiativeInvitation("Придумай что-нибудь")).toBe(
      "open_activity",
    );
    expect(detectSoulInitiativeInvitation("Мне скучно")).toBe("open_activity");
    expect(detectSoulInitiativeInvitation("Я сегодня весь твой")).toBe(
      "open_play",
    );
    expect(detectSoulInitiativeInvitation("Давай сессию")).toBe(
      "explicit_session",
    );
    expect(
      detectSoulInitiativeInvitation(
        "Клетка надоела, придумай что-нибудь другое",
      ),
    ).toBe("open_activity");
    expect(detectSoulInitiativeInvitation("Клетка сегодня надоела")).toBe(
      "none",
    );
  });

  it("makes offer_session eligible on invitation, not on small talk", () => {
    expect(sessionOfferEligibleThisTurn("Привет")).toBe(false);
    expect(sessionOfferEligibleThisTurn("Устал сегодня на работе")).toBe(false);
    expect(sessionOfferEligibleThisTurn("Просто хочу поболтать")).toBe(false);
    expect(sessionOfferEligibleThisTurn("А ты чем занималась?")).toBe(false);
    expect(sessionOfferEligibleThisTurn("Что-нибудь интересное было?")).toBe(
      false,
    );
    expect(sessionOfferEligibleThisTurn("Чем займёмся?")).toBe(true);
    expect(sessionOfferEligibleThisTurn("Придумай что-нибудь")).toBe(true);
    expect(sessionOfferEligibleThisTurn("Мне скучно")).toBe(true);
    expect(sessionOfferEligibleThisTurn("Я сегодня весь твой")).toBe(true);
    expect(sessionOfferEligibleThisTurn("Давай сессию")).toBe(true);
    expect(sessionOfferEligibleThisTurn("Клетка сегодня надоела")).toBe(false);
    expect(
      sessionOfferEligibleThisTurn("Клетка надоела, придумай что-нибудь другое"),
    ).toBe(true);
    expect(sessionOfferEligibleThisTurn("Чем займёмся?", sessionBound)).toBe(
      false,
    );
  });

  it("lets offer_session into the prompt on invitation without forcing it", () => {
    expect(shouldSpeakIntent("personal", offerSession, "Привет")).toBe(false);
    expect(
      shouldSpeakIntent("personal", offerSession, "Устал сегодня на работе"),
    ).toBe(false);
    expect(
      shouldSpeakIntent("personal", offerSession, "Просто хочу поболтать"),
    ).toBe(false);
    expect(
      shouldSpeakIntent("personal", offerSession, "А ты чем занималась?"),
    ).toBe(false);
    expect(
      shouldSpeakIntent("personal", offerSession, "Чем займёмся?"),
    ).toBe(true);
    expect(
      shouldSpeakIntent("personal", offerSession, "Придумай что-нибудь"),
    ).toBe(true);
    expect(shouldSpeakIntent("personal", offerSession, "Мне скучно")).toBe(true);
    expect(
      shouldSpeakIntent("personal", offerSession, "Я сегодня весь твой"),
    ).toBe(true);
    expect(
      shouldSpeakIntent("play_relevant", offerSession, "Давай сессию"),
    ).toBe(true);
    expect(shouldHoldInitiativeCandidate("Привет", null, offer)).toBe(true);
    expect(
      shouldHoldInitiativeCandidate("Устал сегодня на работе", null, offer),
    ).toBe(true);
    expect(
      shouldHoldInitiativeCandidate("Просто хочу поболтать", null, offer),
    ).toBe(true);
    expect(shouldHoldInitiativeCandidate("Чем займёмся?", null, offer)).toBe(
      false,
    );
    expect(
      shouldHoldInitiativeCandidate("Придумай что-нибудь", null, offer),
    ).toBe(false);
    expect(shouldHoldInitiativeCandidate("Мне скучно", null, offer)).toBe(false);
    expect(
      shouldHoldInitiativeCandidate("Я сегодня весь твой", null, offer),
    ).toBe(false);
    expect(
      shouldHoldInitiativeCandidate(
        "Клетка надоела, придумай что-нибудь другое",
        null,
        offer,
      ),
    ).toBe(false);
  });

  it("locks soul-eval fixtures A/B/C to invitation eligibility", () => {
    const offerState = applySoulEvalFixture("Ху Тао", ["playful"], {
      liveSessionOffer: true,
    });
    expect(
      shouldSpeakIntent(
        detectSoulConversationMode("Привет", offerState.intent),
        offerState.intent,
        "Привет",
      ),
    ).toBe(false);
    expect(
      shouldSpeakIntent(
        detectSoulConversationMode("Чем займёмся?", offerState.intent),
        offerState.intent,
        "Чем займёмся?",
      ),
    ).toBe(true);
    expect(
      shouldSpeakIntent(
        detectSoulConversationMode(
          "Просто хочу немного поболтать.",
          offerState.intent,
        ),
        offerState.intent,
        "Просто хочу немного поболтать.",
      ),
    ).toBe(false);
    const wearState = applySoulEvalFixture("Ху Тао", ["playful"], {
      liveSessionOffer: true,
      cageTalk: true,
    });
    expect(
      shouldSpeakIntent(
        detectSoulConversationMode("Клетка сегодня надоела.", wearState.intent),
        wearState.intent,
        "Клетка сегодня надоела.",
      ),
    ).toBe(false);
    expect(
      detectSoulConversationMode("Клетка сегодня надоела.", wearState.intent),
    ).toBe("play_relevant");
  });
});

describe("soul turn act and explicit play request", () => {
  it("treats Давай поиграем as an activity request, not a short reaction", () => {
    expect(detectSoulTurnAct("Давай поиграем")).toBe("request_activity");
    expect(detectSoulTurnAct("Давай поиграем")).not.toBe("react");
    expect(detectSoulInitiativeInvitation("Давай поиграем")).toBe("open_play");
    expect(detectSoulConversationMode("Давай поиграем", null)).toBe(
      "play_relevant",
    );
  });

  it("treats Чем займёмся? as an activity request", () => {
    expect(detectSoulTurnAct("Чем займёмся?")).toBe("request_activity");
    expect(detectSoulConversationMode("Чем займёмся?", null)).toBe("personal");
    expect(detectSoulInitiativeInvitation("Чем займёмся?")).toBe(
      "open_activity",
    );
  });

  it("opens play_relevant for an explicit sexual request", () => {
    expect(detectSoulConversationMode("Хочу подрочить", null)).toBe(
      "play_relevant",
    );
    expect(detectSoulInitiativeInvitation("Хочу подрочить")).toBe("open_play");
    expect(detectSoulTurnAct("Хочу подрочить")).toBe("request_activity");
    expect(userTurnMentionsPlay("Хочу подрочить")).toBe(true);
  });

  it("does not invent a session intent from a sexual request alone", () => {
    expect(shouldSpeakIntent("play_relevant", null, "Хочу подрочить")).toBe(
      false,
    );
    expect(
      shouldSpeakIntent("play_relevant", offerSession, "Хочу подрочить"),
    ).toBe(true);
    expect(sessionOfferEligibleThisTurn("Хочу подрочить")).toBe(true);
  });

  it("opens play on the listed explicit phrases and canonical play invites", () => {
    const phrases = [
      "хочу мастурбировать",
      "хочу поиграть с собой",
      "хочу кончить",
      "хочу эджиться",
      "покомандуй мной",
      "я весь твой",
    ];
    for (const phrase of phrases) {
      expect(detectSoulConversationMode(phrase, null)).toBe("play_relevant");
      expect(detectSoulInitiativeInvitation(phrase)).toBe("open_play");
      expect(detectSoulTurnAct(phrase)).toBe("request_activity");
    }
  });

  it("keeps А ты чем занималась? as share_about_self", () => {
    expect(detectSoulTurnAct("А ты чем занималась?")).toBe("share_about_self");
    expect(detectSoulInitiativeInvitation("А ты чем занималась?")).toBe("none");
    expect(detectSoulConversationMode("А ты чем занималась?", null)).toBe(
      "personal",
    );
  });

  it("keeps Мне скучно as open_activity, not automatically sexual", () => {
    expect(detectSoulInitiativeInvitation("Мне скучно")).toBe("open_activity");
    expect(detectSoulConversationMode("Мне скучно", null)).toBe("personal");
    expect(userTurnMentionsPlay("Мне скучно")).toBe(false);
    expect(detectSoulTurnAct("Мне скучно")).toBe("request_activity");
  });
});
