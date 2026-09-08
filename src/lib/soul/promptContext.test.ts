import { describe, expect, it } from "vitest";
import type { CharacterBible } from "../character";
import {
  budgetHistory,
  buildLayeredChatPrompt,
  clipPromptChars,
  detectChatPromptFocus,
  SOUL_PROMPT_BUDGET,
  turnReplyLength,
} from "./promptContext";
import { buildChatMessages } from "./prompts";
import { applyExplicitUserTextToStances } from "./stance";
import { emptyMistressState } from "./types";

const bible: CharacterBible = {
  id: "hu_tao",
  nameRu: "Ху Тао",
  locale: "ru",
  tone: ["playful"],
  taboo: ["break character"],
  diminutives: ["silly"],
  emojiAllowed: false,
  systemPrompt: [
    "You are Hu Tao, playful gamer-girl. English only.",
    "Look (optional flavor, don't catalog every time): 162 cm, red-tipped hair, gamer vibe.",
    "You are the CONDUCTOR on top of JOI Conductor mechanics.",
    'Reply with ONLY one JSON object: {"text":"..."}',
  ].join("\n"),
  chatVoiceExamples: [
    { tag: "chat", line: "О, живой. Садись." },
    { tag: "tease", line: "Хе-хе." },
  ],
  fallbackLines: {},
};

function sectionOrder(prompt: string): string[] {
  return [...prompt.matchAll(/^\[([A-Z ]+)\]$/gm)].map((m) => m[1] ?? "");
}

describe("soul prompt context", () => {
  it("orders sections and skips empty ones on a greeting", () => {
    const state = emptyMistressState(bible.nameRu, bible.tone);
    const prompt = buildChatMessages(bible, state, "Привет")[0]?.content ?? "";
    expect(sectionOrder(prompt)).toEqual([
      "IDENTITY",
      "RELATIONSHIP",
      "CURRENT STATE",
      "BEHAVIOR RULES",
    ]);
    expect(prompt).toContain("[CURRENT STATE]");
    expect(prompt).not.toContain("[LIVE CONTEXT]");
    expect(prompt).not.toContain("[RELEVANT MEMORY]");
    expect(prompt).not.toContain("[PLAY VOICE]");
    expect(prompt).not.toContain("[APPEARANCE]");
    expect(prompt).not.toContain("--- CONTROL ---");
    expect(prompt).not.toContain("MEMORY.md");
    expect(prompt).toContain("1–3 sentences");
    expect(prompt).toContain("make a statement and stop");
    expect(prompt).not.toContain("You are the CONDUCTOR");
    expect(prompt).not.toContain("English only");
    expect(prompt).not.toContain("sexually tormenting");
    expect(prompt).not.toContain("162 cm");
  });

  it("keeps greeting context small even if memory is huge", () => {
    const state = emptyMistressState(bible.nameRu, bible.tone);
    state.memoryMd = "X".repeat(8000);
    state.userMd = "Y".repeat(8000);
    state.topics = [{ filename: "night.md", body: "Z".repeat(4000) }];
    const prompt = buildChatMessages(bible, state, "как ты?")[0]?.content ?? "";
    expect(prompt.length).toBeLessThan(3500);
    expect(prompt).not.toContain("XXXX");
  });

  it("puts continuity in live context when he asks about the last session", () => {
    const state = emptyMistressState(bible.nameRu, bible.tone);
    state.recentEvents.push({
      id: "ev-session",
      kind: "session_completed",
      atMs: 1,
      mistressId: "hu_tao",
      summary: "Сессия завершена. Руина, эджи 4.",
      importance: 3,
      subjectId: "sess:hu_tao:7:complete",
    });
    const prompt =
      buildChatMessages(bible, state, "А вчерашняя сессия была жёсткой")[0]
        ?.content ?? "";
    expect(prompt).toContain("[LIVE CONTEXT]");
    expect(prompt).toContain("Руина");
    expect(prompt).not.toContain("sess:");
    expect(prompt).not.toContain("hu_tao:7");
  });

  it("keeps cage stance and drops unrelated play stance on tea talk", () => {
    const state = emptyMistressState(bible.nameRu, bible.tone);
    state.user.stances = applyExplicitUserTextToStances(
      applyExplicitUserTextToStances([], "я люблю клетку", 1),
      "я люблю эджи",
      1,
    );
    const cage =
      buildChatMessages(bible, state, "клетка как сидится", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(cage).toContain("[RELEVANT USER STANCE]");
    expect(cage).toMatch(/клетк|chastity|wear/i);
    const tea =
      buildChatMessages(bible, state, "Как заваривать чай?", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(tea).not.toMatch(/edges|эджи/i);
    expect(tea).not.toContain("[RELEVANT USER STANCE]");
  });

  it("makes hard boundaries and activity opt-outs explicit speech constraints", () => {
    const state = emptyMistressState(bible.nameRu, bible.tone);
    state.user.stances = applyExplicitUserTextToStances(
      [],
      "никакой клетки, это жёсткая граница",
      1,
    );
    const boundary =
      buildChatMessages(bible, state, "Давай клетку", { nowMs: 1 })[0]?.content ?? "";
    expect(boundary).toContain("Hard boundaries are non-negotiable");
    expect(boundary).toContain("Never propose, encourage, roleplay");

    const optOut =
      buildChatMessages(bible, state, "Если предложишь сессию — нет.", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(optOut).toContain("explicitly opted out");
    expect(optOut).toContain("refusal were consent");
  });

  it("clips history by character budget, not only last 16", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      role: "user" as const,
      content: `msg-${i}-${"a".repeat(200)}`,
    }));
    const kept = budgetHistory(rows, 800);
    expect(kept.length).toBeLessThan(16);
    const used = kept.reduce((n, row) => n + row.content.length, 0);
    expect(used).toBeLessThanOrEqual(800 + 40);
    expect(clipPromptChars("hello world", 5).endsWith("…")).toBe(true);
  });

  it("picks length policy from the turn", () => {
    expect(turnReplyLength("Привет", null)).toBe("short");
    expect(turnReplyLength("как ты?", null)).toBe("short");
    expect(turnReplyLength("Я устал после работы и не знаю что делать вечером", null)).toBe(
      "medium",
    );
    expect(detectChatPromptFocus("клетка жмёт", null)).toBe("wear");
    expect(detectChatPromptFocus("давай эджи", null)).toBe("play");
  });

  it("can omit voice examples", () => {
    const state = emptyMistressState(bible.nameRu, bible.tone);
    const withExamples = buildLayeredChatPrompt(bible, state, "Привет", [], {
      voiceExamples: true,
    });
    const without = buildLayeredChatPrompt(bible, state, "Привет", [], {
      voiceExamples: false,
    });
    expect(withExamples).toContain("О, живой");
    expect(without).not.toContain("О, живой");
  });

  it("gates play context until the user brings wear or session", () => {
    const state = emptyMistressState(bible.nameRu, bible.tone);
    state.intent = {
      goal: "В приложении уже есть чип сессии. Можно намекнуть в речи.",
      tone: "playful",
      priority: 2,
      source: "session",
      expiresAtMs: Date.now() + 60_000,
    };
    state.recentEvents.push({
      id: "ev-session",
      kind: "session_completed",
      atMs: 1,
      mistressId: "hu_tao",
      summary: "Сессия завершена. Руина.",
      importance: 3,
    });
    state.user.stances = applyExplicitUserTextToStances(
      [],
      "я люблю клетку",
      1,
    );
    state.user.knownAttributes = "клетка на ночь";
    state.user.sharedMilestones = ["клетка ночевала 8–9 ч"];
    state.topics = [
      { filename: "control_journal.md", body: "Клетка: ночь держит." },
    ];

    const hello = buildChatMessages(bible, state, "Привет", { nowMs: 1 })[0]
      ?.content ?? "";
    expect(sectionOrder(hello)).toEqual([
      "IDENTITY",
      "RELATIONSHIP",
      "CURRENT STATE",
      "BEHAVIOR RULES",
    ]);
    expect(hello).not.toContain("[TURN INTENT]");
    expect(hello).not.toContain("[LIVE CONTEXT]");
    expect(hello).not.toContain("[RELEVANT USER STANCE]");
    expect(hello).not.toContain("[PLAY VOICE]");
    expect(hello).not.toContain("--- CONTROL ---");
    expect(hello).not.toContain("клетка на ночь");
    expect(hello).not.toContain("чип сессии");

    const tired =
      buildChatMessages(bible, state, "Устал сегодня на работе", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(sectionOrder(tired)).toEqual([
      "IDENTITY",
      "RELATIONSHIP",
      "CURRENT STATE",
      "BEHAVIOR RULES",
    ]);
    expect(tired).toContain("Emotion:");
    expect(tired).not.toContain("[TURN INTENT]");
    expect(tired).not.toContain("[PLAY VOICE]");
    expect(tired).not.toContain("[APPEARANCE]");
    expect(tired).not.toContain("Agenda:");
    expect(tired).not.toContain("[LIVE CONTEXT]");
    expect(tired).not.toContain("[RELEVANT USER STANCE]");
    expect(tired).not.toContain("--- CONTROL ---");
    expect(tired).not.toContain("клетка на ночь");
    expect(tired).not.toContain("чип сессии");
    expect(tired).toContain("Flirting is not a proposal");

    const aboutHer =
      buildChatMessages(bible, state, "А ты чем занималась?", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(sectionOrder(aboutHer)).toEqual([
      "IDENTITY",
      "RELATIONSHIP",
      "CURRENT STATE",
      "BEHAVIOR RULES",
    ]);
    expect(aboutHer).toContain("Actually tell him something about you");
    expect(aboutHer).not.toContain("[TURN INTENT]");
    expect(aboutHer).not.toContain("[PLAY VOICE]");
    expect(aboutHer).not.toContain("[LIVE CONTEXT]");
    expect(aboutHer).not.toContain("--- CONTROL ---");
    expect(aboutHer).not.toContain("клетка на ночь");

    const wear =
      buildChatMessages(bible, state, "Кстати, клетка сегодня уже надоела", {
        nowMs: 1,
      })[0]?.content ?? "";
    expect(wear).toContain("[PLAY VOICE]");
    expect(wear).toContain("[RELEVANT USER STANCE]");
    expect(wear).toMatch(/клетк/i);
    expect(wear).not.toContain("[TURN INTENT]");
    expect(wear).not.toContain("[APPEARANCE]");

    const session =
      buildChatMessages(bible, state, "А вчерашняя сессия была жёсткой", {
        nowMs: 1,
      })[0]?.content ?? "";
    expect(session).toContain("[PLAY VOICE]");
    expect(session).toContain("[LIVE CONTEXT]");
    expect(session).toContain("[TURN INTENT]");
    expect(session).toContain("Руина");
    expect(session).toContain("--- CONTROL ---");
    expect(session).not.toContain("Утренний комплекс");
    expect(session).not.toContain("Гладкость");
    expect(session).not.toContain("[APPEARANCE]");

    const look =
      buildChatMessages(bible, state, "Как ты сегодня выглядишь?", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(look).toContain("[APPEARANCE]");
    expect(look).toContain("162 cm");
    expect(look).not.toContain("[PLAY VOICE]");
  });

  it("lets a live session offer into TURN INTENT only on a real invitation", () => {
    const state = emptyMistressState(bible.nameRu, bible.tone);
    state.intent = {
      goal: "В приложении уже есть чип сессии. Можно намекнуть в речи.",
      tone: "playful",
      priority: 2,
      source: "session",
      candidateId: "session_offer:open",
      expiresAtMs: Date.now() + 60_000,
    };

    const chat =
      buildChatMessages(bible, state, "Чем займёмся?", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(chat).toContain("[TURN INTENT]");
    expect(chat).toContain("one possible direction");
    expect(chat).toContain("Do not force it");
    expect(chat).not.toContain("--- CONTROL ---");

    const bored =
      buildChatMessages(bible, state, "Мне скучно", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(bored).toContain("[TURN INTENT]");
    expect(bored).toContain("Do not force it");

    const play =
      buildChatMessages(bible, state, "Я сегодня весь твой", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(play).toContain("[TURN INTENT]");
    expect(play).toContain("opened the door for play");

    const explicit =
      buildChatMessages(bible, state, "Давай сессию", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(explicit).toContain("[TURN INTENT]");
    expect(explicit).toContain("speak to it directly");

    const optOut =
      buildChatMessages(bible, state, "Просто хочу поболтать", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(optOut).not.toContain("[TURN INTENT]");

    const aboutHer =
      buildChatMessages(bible, state, "А ты чем занималась?", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(aboutHer).not.toContain("[TURN INTENT]");

    const wear =
      buildChatMessages(bible, state, "Клетка сегодня надоела", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(wear).toContain("[PLAY VOICE]");
    expect(wear).not.toContain("[TURN INTENT]");

    const wearInvite =
      buildChatMessages(
        bible,
        state,
        "Клетка надоела, придумай что-нибудь другое",
        { nowMs: 1 },
      )[0]?.content ?? "";
    expect(wearInvite).toContain("[PLAY VOICE]");
    expect(wearInvite).toContain("[TURN INTENT]");
    expect(wearInvite).toContain("one possible direction");
  });

  it("keeps masturbation live context on its exact subject", () => {
    const state = emptyMistressState(bible.nameRu, bible.tone);
    const prompt =
      buildChatMessages(bible, state, "Хочу помастурбировать", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(prompt).toContain("--- CONTROL ---");
    expect(prompt).toContain("Denial:");
    expect(prompt).toContain("Orgasm permission required");
    expect(prompt).not.toContain("Cage:");
    expect(prompt).not.toContain("Plug:");
    expect(prompt).not.toContain("Recent session kinds");
  });

  it("includes PLAY VOICE on an explicit sexual request without inventing TURN INTENT", () => {
    const state = emptyMistressState(bible.nameRu, bible.tone);
    const prompt =
      buildChatMessages(bible, state, "Хочу подрочить", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(prompt).toContain("[PLAY VOICE]");
    expect(prompt).not.toContain("[TURN INTENT]");
    expect(prompt).toContain("Respond to the invitation");
    expect(prompt).not.toContain("A short reaction is enough");

    const invite =
      buildChatMessages(bible, state, "Давай поиграем", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(invite).toContain("[PLAY VOICE]");
    expect(invite).toContain("Respond to the invitation");
    expect(invite).not.toContain("A short reaction is enough");
    expect(invite).not.toContain("[TURN INTENT]");

    const activity =
      buildChatMessages(bible, state, "Чем займёмся?", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(activity).toContain("Respond to the invitation");
    expect(activity).not.toContain("Answer the question he actually asked.");
    expect(activity).not.toContain("[PLAY VOICE]");

    const bored =
      buildChatMessages(bible, state, "Мне скучно", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(bored).not.toContain("[PLAY VOICE]");
    expect(bored).not.toContain("[TURN INTENT]");
    expect(bored).toContain("Respond to the invitation");
  });

  it("lets a live session offer into TURN INTENT on an explicit sexual request", () => {
    const state = emptyMistressState(bible.nameRu, bible.tone);
    state.intent = {
      goal: "В приложении уже есть чип сессии. Можно намекнуть в речи.",
      tone: "playful",
      priority: 2,
      source: "session",
      candidateId: "session_offer:open",
      expiresAtMs: Date.now() + 60_000,
    };
    const prompt =
      buildChatMessages(bible, state, "Хочу подрочить", { nowMs: 1 })[0]
        ?.content ?? "";
    expect(prompt).toContain("[PLAY VOICE]");
    expect(prompt).toContain("[TURN INTENT]");
  });

  it("stays under the published prompt budget for a normal turn", () => {
    const state = emptyMistressState(bible.nameRu, bible.tone);
    state.user.preferencesHabits = ["tea at night"];
    state.topics = [
      { filename: "tea.md", body: "He drinks funeral tea after dark. ".repeat(40) },
    ];
    const prompt =
      buildChatMessages(bible, state, "Расскажи про чай")[0]?.content ?? "";
    expect(prompt.length).toBeLessThan(
      SOUL_PROMPT_BUDGET.identityChars +
        SOUL_PROMPT_BUDGET.relationshipChars +
        SOUL_PROMPT_BUDGET.currentStateChars +
        SOUL_PROMPT_BUDGET.intentChars +
        SOUL_PROMPT_BUDGET.liveContextChars +
        SOUL_PROMPT_BUDGET.stanceChars +
        SOUL_PROMPT_BUDGET.memoryChars +
        1800,
    );
  });
});
