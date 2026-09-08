import { describe, expect, it } from "vitest";
import type { CharacterBible } from "../character";
import { sendSoulChatTurn, soulNeedsSync, syncSoulMemory, syncSoulMemoryDetailed, truncateForRegenerate, editSoulMessage, regenerateSoulReply } from "./engine";
import type { SoulLlmClient } from "./ollama";
import { STRUCTURED_JSON_REPAIR_HINT } from "./prompts";
import { buildChatMessages } from "./prompts";
import { emptyMistressState } from "./types";

const bible: CharacterBible = {
  id: "hu_tao",
  nameRu: "Ху Тао",
  locale: "ru",
  tone: ["playful"],
  taboo: ["break character"],
  diminutives: ["silly"],
  emojiAllowed: false,
  systemPrompt: "You are Hu Tao, director of Wangsheng.",
  fallbackLines: {
    chat: ["Хе-хе. Скажи ещё раз."],
  },
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

describe("soul chat engine", () => {
  it("injects compact mistress OS and allows action JSON, not the conductor", () => {
    const state = emptyMistressState(bible.nameRu, bible.tone);
    const withUser = {
      ...state,
      messages: [
        {
          id: "1",
          role: "user" as const,
          text: "Привет, как тебя зовут?",
          atMs: 1,
        },
      ],
    };
    const messages = buildChatMessages(bible, withUser, "Привет, как тебя зовут?");
    const system = messages[0]?.content ?? "";
    expect(system).not.toContain("does not control the JOI queue");
    expect(system).toContain("[IDENTITY]");
    expect(system).toContain("[BEHAVIOR RULES]");
    expect(system).not.toContain("--- CONTROL ---");
    expect(system).not.toContain("MEMORY.md");
    expect(system).toContain("Do not output JSON");
    expect(system).not.toMatch(/block_start|"text":"..."/);
    expect(system).toContain("Russian in → Russian out");
    expect(system).toContain("/think");
    expect(system).not.toContain("/no_think");
    expect(system).not.toContain("You are the CONDUCTOR");
    expect(system).not.toMatch(/Reply with ONLY one JSON/);
    expect(system).toContain("Ask his name");
    expect(system).not.toContain("Trigger:");
  });

  it("drops the session conductor/JSON recipe from the chat persona", () => {
    const sessionBible: CharacterBible = {
      ...bible,
      systemPrompt: [
        "You are Hu Tao, playful gamer-girl. English only.",
        "You are the CONDUCTOR on top of JOI Conductor mechanics.",
        'Reply with ONLY one JSON object: {"text":"..."}',
      ].join("\n"),
    };
    const state = emptyMistressState(bible.nameRu, bible.tone);
    const system =
      buildChatMessages(sessionBible, state, "Привет")[0]?.content ?? "";
    expect(system).toContain("private one-on-one chat");
    expect(system).not.toContain("playful gamer-girl");
    expect(system).not.toContain("You are the CONDUCTOR");
    expect(system).not.toContain("English only");
    expect(system).not.toContain("ONLY one JSON");
  });

  it("appends a turn without touching pending sync until the batch", async () => {
    const client = scriptedClient(["Хе-хе. Ху Тао, к твоим услугам."]);
    const result = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Привет",
      client,
      nowMs: 1000,
    });
    expect(result.reply).toContain("Ху Тао");
    expect(result.state.messages).toHaveLength(2);
    expect(result.state.pendingSinceRouter).toBe(2);
    expect(soulNeedsSync(result.state)).toBe(false);
  });

  it("does not duplicate a user line already on the thread", async () => {
    const client = scriptedClient(["Хе-хе."]);
    const seeded = emptyMistressState(bible.nameRu, bible.tone);
    seeded.messages = [
      { id: "u1", role: "user", text: "Привет", atMs: 1 },
    ];
    const result = await sendSoulChatTurn({
      state: seeded,
      bible,
      userText: "Привет",
      client,
      nowMs: 1000,
    });
    expect(result.state.messages.filter((m) => m.role === "user")).toHaveLength(
      1,
    );
    expect(result.state.messages).toHaveLength(2);
  });

  it("stores think on the assistant bubble without speaking it", async () => {
    const client: SoulLlmClient = {
      async complete() {
        return { text: "Привет, глупыш.", think: "He just said hi. Greet back." };
      },
    };
    const result = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Привет",
      client,
    });
    expect(result.reply).toBe("Привет, глупыш.");
    expect(result.state.messages[1]?.text).toBe("Привет, глупыш.");
    expect(result.state.messages[1]?.think).toBe(
      "He just said hi. Greet back.",
    );
  });

  it("keeps the user line if the model fails", async () => {
    const client: SoulLlmClient = {
      async complete() {
        throw new Error("LLM HTTP 500");
      },
    };
    const result = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Привет",
      client,
    });
    expect(result.error).toContain("500");
    expect(result.state.messages).toHaveLength(1);
    expect(result.state.messages[0]?.role).toBe("user");
  });

  it("rerolls an assistant bubble and drops later turns", async () => {
    const filled = emptyMistressState(bible.nameRu, bible.tone);
    filled.messages = [
      { id: "u1", role: "user", text: "Привет", atMs: 1 },
      { id: "a1", role: "assistant", text: "Старый ответ", atMs: 2 },
      { id: "u2", role: "user", text: "Ещё", atMs: 3 },
      { id: "a2", role: "assistant", text: "Хвост", atMs: 4 },
    ];
    const sliced = truncateForRegenerate(filled, "a1");
    expect(sliced?.messages).toHaveLength(1);
    expect(sliced?.messages[0]?.id).toBe("u1");

    const edited = editSoulMessage(filled, "a1", "  Поправленный текст  ");
    expect(edited.messages[1]?.text).toBe("Поправленный текст");

    const reroll = await regenerateSoulReply({
      state: filled,
      bible,
      messageId: "a1",
      client: scriptedClient(["Новый ответ."]),
      nowMs: 9,
    });
    expect(reroll.reply).toBe("Новый ответ.");
    expect(reroll.state.messages).toHaveLength(2);
    expect(reroll.state.messages[1]?.text).toBe("Новый ответ.");
  });

  it("rejects action JSON in speech, retries, then uses the extractor", async () => {
    const result = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Запирай",
      client: scriptedClient([
        'Клетка. {"actions":[{"op":"set_wear","kind":"cage","hours":2}]}',
        "Клетка.",
        '{"actions":[{"op":"set_wear","kind":"cage","hours":2}]}',
      ]),
      nowMs: 5,
    });
    expect(result.reply).toBe("Клетка.");
    expect(result.proposals[0]?.kind).toBe("wear");
    expect(result.state.messages[1]?.text).toBe("Клетка.");
    expect(result.state.messages[1]?.text).not.toContain("actions");
  });

  it("asks a follow-up JSON call when speech implies a session", async () => {
    const result = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Я сделал утренние упражнения и побрился",
      client: scriptedClient([
        "Молодец, Серёжа. Сессия будет.",
        '{"actions":[{"op":"propose_session","kind":"edges","durationSec":1800,"edgesTarget":5,"finalePolicy":"ruin_norm"}]}',
      ]),
      nowMs: 8,
    });
    expect(result.reply).toBe("Молодец, Серёжа. Сессия будет.");
    expect(result.reply).not.toContain("actions");
    expect(result.proposals[0]?.kind).toBe("session");
  });

  it("does not extract control from a hello that mentions an existing cage", async () => {
    let calls = 0;
    const client: SoulLlmClient = {
      async complete() {
        calls += 1;
        if (calls === 1) {
          return { text: "Привет, Серёжа. Ты уже носишь клетку на ночь." };
        }
        return {
          text: '{"actions":[{"op":"propose_session","kind":"edges","durationSec":600,"edgesTarget":5,"finalePolicy":"ruin_norm"}]}',
        };
      },
    };
    const result = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Привет, Хутао",
      client,
    });
    expect(calls).toBe(1);
    expect(result.proposals).toEqual([]);
  });

  it("drops a leaked session seed on a greeting", async () => {
    const result = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Привет",
      client: scriptedClient([
        'Привет. {"actions":[{"op":"propose_session","kind":"edges","durationSec":600,"edgesTarget":5,"finalePolicy":"ruin_norm"}]}',
        "Привет.",
      ]),
    });
    expect(result.reply).toBe("Привет.");
    expect(result.proposals).toEqual([]);
  });

  it("does not mint a session card from an invitation without spoken session", async () => {
    const result = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Чем займёмся?",
      client: scriptedClient(["Можем просто посидеть с чаем."]),
      nowMs: 12,
    });
    expect(result.reply).toBe("Можем просто посидеть с чаем.");
    expect(result.proposals).toEqual([]);
    expect(result.initiative).toBeUndefined();
  });

  it("still extracts a session card after spoken session on an invitation", async () => {
    const result = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Чем займёмся?",
      client: scriptedClient([
        "Сессия будет.",
        '{"actions":[{"op":"propose_session","kind":"edges","durationSec":1800,"edgesTarget":5,"finalePolicy":"ruin_norm"}]}',
      ]),
      nowMs: 13,
    });
    expect(result.reply).toBe("Сессия будет.");
    expect(result.proposals[0]?.kind).toBe("session");
  });

  it("runs router + diary after four messages and writes a topic", async () => {
    const started = emptyMistressState(bible.nameRu, bible.tone);
    const first = await sendSoulChatTurn({
      state: started,
      bible,
      userText: "Я зашёл поздороваться",
      client: scriptedClient(["О, живой клиент."]),
      nowMs: 1,
    });
    const second = await sendSoulChatTurn({
      state: first.state,
      bible,
      userText: "Люблю чай по ночам",
      client: scriptedClient(["Тогда садись. Чай будет траурный."]),
      nowMs: 2,
    });
    expect(soulNeedsSync(second.state)).toBe(true);

    const synced = await syncSoulMemory(
      second.state,
      bible,
      scriptedClient([
        JSON.stringify({
          no_significant_change: false,
          character_memory: {
            core_identity: ["Director"],
            internal_state: {
              primary_emotion: "Amused",
              intensity: "3/5",
              psychological_tension: "He likes night tea",
              emotional_decay_counter: 0,
            },
            cognitive_drive: {
              active_agenda: "Keep him talking",
              immediate_focus: "Tea",
            },
            cognitive_dissonance: "None",
          },
          user_memory: {
            identity: {
              role_in_story: "Night visitor",
              known_attributes: "Likes tea",
            },
            relationship_dynamic: {
              trust_level: "Warming",
              dynamic_description: "Easy chat",
              unspoken_tension: "None",
            },
            preferences_and_habits: ["night tea"],
            shared_milestones: ["first hello"],
          },
          topic_plan: {
            actions: [
              {
                action: "create",
                filename: "night_tea.md",
                reason: "He said he drinks tea at night",
                body: "He drifted in after dark and admitted a habit of night tea.",
              },
            ],
          },
          diary_entry:
            "Он зашёл ночью. Чай, говорит, любит. Пусть пьёт — живым тоже наливаю.",
        }),
      ]),
      undefined,
      Date.parse("2026-08-20T00:00:00Z"),
    );
    expect(synced.pendingSinceRouter).toBe(0);
    expect(synced.character.primaryEmotion).toBe("Amused");
    expect(synced.topics.some((t) => t.filename === "night_tea.md")).toBe(true);
    expect(synced.diaryMd).toContain("2026-08-20");
    expect(synced.diaryMd).toContain("Он зашёл ночью");
  });

  it("does not speak or consume on empty user text", async () => {
    const client = scriptedClient(["не должно вызваться"]);
    const seeded = emptyMistressState(bible.nameRu, bible.tone);
    seeded.recentEvents.push({
      id: "ev-session",
      kind: "session_completed",
      atMs: 1,
      mistressId: "hu_tao",
      summary: "Сессия завершена",
      importance: 3,
    });
    const result = await sendSoulChatTurn({
      state: seeded,
      bible,
      userText: "   ",
      client,
      nowMs: 1000,
    });
    expect(result.reply).toBe("");
    expect(result.state.messages).toEqual([]);
    expect(result.state.initiative.consumedIds).toEqual([]);
    expect(result.initiative).toBeUndefined();
    expect(result.proposals).toEqual([]);
  });

  it("sets intent from a session result and consumes the candidate after speech", async () => {
    const seeded = emptyMistressState(bible.nameRu, bible.tone);
    seeded.recentEvents.push({
      id: "ev-session",
      kind: "session_completed",
      atMs: 1,
      mistressId: "hu_tao",
      summary: "Сессия завершена · Руина",
      importance: 3,
    });
    const result = await sendSoulChatTurn({
      state: seeded,
      bible,
      userText: "Ну что, как тебе сессия?",
      client: scriptedClient(["Славно постарался."]),
      nowMs: 1000,
    });
    expect(result.state.intent?.source).toBe("session");
    expect(result.state.intent?.goal).toMatch(/последнюю сессию/i);
    expect(result.initiative?.reason).toBe("session_completed");
    expect(result.state.initiative.consumedIds).toContain("event:ev-session");
  });

  it("does not recap a session on greeting and does not repeat consumed initiative", async () => {
    const seeded = emptyMistressState(bible.nameRu, bible.tone);
    seeded.recentEvents.push({
      id: "ev-session",
      kind: "session_completed",
      atMs: 1,
      mistressId: "hu_tao",
      summary: "Сессия завершена. Руина, эджи 4.",
      importance: 3,
      subjectId: "sess:hu_tao:1:complete",
    });
    const hello = await sendSoulChatTurn({
      state: seeded,
      bible,
      userText: "Привет",
      client: scriptedClient(["Привет."]),
      nowMs: 1000,
    });
    expect(hello.state.intent).toBeNull();
    expect(hello.initiative).toBeUndefined();
    expect(hello.state.initiative.consumedIds).toEqual([]);

    const asked = await sendSoulChatTurn({
      state: hello.state,
      bible,
      userText: "Ну что, как тебе сессия?",
      client: scriptedClient(["Славно."]),
      nowMs: 2000,
    });
    expect(asked.initiative?.reason).toBe("session_completed");
    expect(asked.state.initiative.consumedIds).toContain("event:ev-session");

    const again = await sendSoulChatTurn({
      state: asked.state,
      bible,
      userText: "И ещё раз про сессию",
      client: scriptedClient(["Уже сказала."]),
      nowMs: 2000 + 4 * 60 * 60 * 1000 + 1,
    });
    expect(again.initiative).toBeUndefined();
    expect(again.state.initiative.consumedIds).toContain("event:ev-session");
  });

  it("injects INTENT into the system prompt when a live goal exists", () => {
    const state = emptyMistressState(bible.nameRu, bible.tone);
    state.intent = {
      goal: "Прокомментировать сессию",
      tone: "pleased",
      priority: 3,
      source: "session",
      expiresAtMs: Date.now() + 60_000,
    };
    const withGoal =
      buildChatMessages(bible, state, "Ну что")[0]?.content ?? "";
    expect(withGoal).not.toContain("[TURN INTENT]");
    const asked =
      buildChatMessages(bible, state, "Ну что, как тебе сессия?")[0]?.content ??
      "";
    expect(asked).toContain("[TURN INTENT]");
    expect(asked).toContain("Прокомментировать сессию");
    const greeting =
      buildChatMessages(bible, state, "Привет")[0]?.content ?? "";
    expect(greeting).not.toContain("[TURN INTENT]");
    expect(greeting).not.toContain("[LIVE CONTEXT]");
  });

  it("retries once on think-only then keeps the spoken line", async () => {
    const tracked: Array<string | undefined> = [];
    const queue = ["<think>secret</think>", "Привет, глупыш."];
    const client: SoulLlmClient = {
      async complete(opts) {
        tracked.push(opts.role);
        const next = queue.shift();
        if (next == null) throw new Error("no scripted reply");
        return { text: next };
      },
    };
    const result = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Привет",
      client,
    });
    expect(result.reply).toBe("Привет, глупыш.");
    expect(tracked).toEqual(["chat", "chat"]);
    expect(result.state.messages[1]?.text).toBe("Привет, глупыш.");
  });

  it("retries when the model returns think with no speech", async () => {
    const queue: Array<{ text: string; think?: string }> = [
      { text: "", think: "He said hi. Greet him." },
      { text: "Привет. Я на месте." },
    ];
    const client: SoulLlmClient = {
      async complete() {
        const next = queue.shift();
        if (next == null) throw new Error("no scripted reply");
        return next;
      },
    };
    const result = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Привет",
      client,
    });
    expect(result.reply).toBe("Привет. Я на месте.");
    expect(result.state.messages[1]?.text).toBe("Привет. Я на месте.");
  });

  it("falls back after a second bad repeat and does not extract", async () => {
    const tracked: Array<string | undefined> = [];
    const line = "Хе-хе. Опять ты. Садись, чай сам себя не выпьет.";
    const seeded = emptyMistressState(bible.nameRu, bible.tone);
    seeded.messages = [
      { id: "u0", role: "user", text: "Привет", atMs: 1 },
      { id: "a0", role: "assistant", text: line, atMs: 2 },
    ];
    const client: SoulLlmClient = {
      async complete(opts) {
        tracked.push(opts.role);
        return { text: line };
      },
    };
    const result = await sendSoulChatTurn({
      state: seeded,
      bible,
      userText: "Запри меня в клетку на три часа",
      client,
      nowMs: 8,
    });
    expect(result.reply).toBe("Хе-хе. Скажи ещё раз.");
    expect(result.proposals).toEqual([]);
    expect(tracked).toEqual(["chat", "chat"]);
    expect(result.state.messages.at(-1)?.text).toBe("Хе-хе. Скажи ещё раз.");
  });
});

const wearExtract = JSON.stringify({
  proposals: [{ op: "set_wear", kind: "cage", hours: 3 }],
});
const sessionExtract = JSON.stringify({
  proposals: [
    {
      op: "propose_session",
      kind: "edges",
      durationSec: 600,
      edgesTarget: 5,
      finalePolicy: "ruin_norm",
    },
  ],
});
const routerPatch = JSON.stringify({
  no_significant_change: false,
  character_memory: {
    core_identity: ["Director"],
    internal_state: {
      primary_emotion: "Amused",
      intensity: "3/5",
      psychological_tension: "Tea",
      emotional_decay_counter: 0,
    },
    cognitive_drive: {
      active_agenda: "Talk",
      immediate_focus: "Tea",
    },
    cognitive_dissonance: "None",
  },
  user_memory: {
    identity: { role_in_story: "Visitor", known_attributes: "Likes tea" },
    relationship_dynamic: {
      trust_level: "Warming",
      dynamic_description: "Easy",
      unspoken_tension: "None",
    },
  },
  topic_plan: { actions: [] },
});

function trackingClient(replies: string[]) {
  const queue = [...replies];
  const roles: Array<string | undefined> = [];
  const repairs: boolean[] = [];
  const client: SoulLlmClient = {
    async complete(opts) {
      roles.push(opts.role);
      repairs.push(
        opts.messages.some((row) => row.content === STRUCTURED_JSON_REPAIR_HINT),
      );
      const next = queue.shift();
      if (next == null) throw new Error("no scripted reply");
      return { text: next };
    },
  };
  return { client, roles, repairs };
}

describe("soul router and extractor roles", () => {
  it("applies a valid router patch and leaves empty patches unchanged", async () => {
    const patched = await syncSoulMemory(
      emptyMistressState(bible.nameRu, bible.tone),
      bible,
      scriptedClient([routerPatch, "Дневник про чай."]),
      undefined,
      1,
    );
    expect(patched.character.primaryEmotion).toBe("Amused");
    expect(patched.user.knownAttributes).toBe("Likes tea");

    const previous = emptyMistressState(bible.nameRu, bible.tone);
    const empty = await syncSoulMemory(
      previous,
      bible,
      scriptedClient(["{}", "Дневник без новостей."]),
      undefined,
      1,
    );
    expect(empty.character).toEqual(previous.character);
    expect(empty.user.knownAttributes).toBe(previous.user.knownAttributes);
  });

  it("retries one malformed router output and applies the valid retry once", async () => {
    const { client, roles, repairs } = trackingClient([
      "not-json",
      routerPatch,
      "Дневник.",
    ]);
    const synced = await syncSoulMemoryDetailed(
      emptyMistressState(bible.nameRu, bible.tone),
      bible,
      client,
      undefined,
      1,
    );
    expect(synced.state.character.primaryEmotion).toBe("Amused");
    expect(roles.filter((role) => role === "router")).toHaveLength(2);
    expect(repairs).toContain(true);
    expect(synced.router.retryUsed).toBe(true);
    expect(synced.router.firstAttemptValid).toBe(false);
    expect(synced.router.parsed).toBe("patch");
  });

  it("repairs a missing topic action for an explicitly important episode", async () => {
    const previous = emptyMistressState(bible.nameRu, bible.tone);
    previous.messages.push({
      id: "u1",
      role: "user",
      text: "Запомни нашу первую встречу, это для меня важно.",
      atMs: 1,
    });
    const seenMessages: string[][] = [];
    const replies = [
      '{"diary_entry":"Важная встреча."}',
      '{"topic_plan":{"actions":[{"action":"create","filename":"first_meeting.md","reason":"важная первая встреча","body":"Мы познакомились ночью."}]},"diary_entry":"Важная встреча."}',
    ];
    const client: SoulLlmClient = {
      async complete(opts) {
        seenMessages.push(opts.messages.map((row) => row.content));
        return { text: replies.shift() ?? "{}" };
      },
    };
    const synced = await syncSoulMemoryDetailed(previous, bible, client, undefined, 1);
    expect(synced.router.retryUsed).toBe(true);
    expect(synced.router.parsed).toBe("patch");
    expect(synced.state.topics[0]?.filename).toBe("first_meeting.md");
    expect(seenMessages[1]?.join("\n")).toContain("one complete action");
  });

  it("rejects two malformed router outputs without mutating memory", async () => {
    const previous = emptyMistressState(bible.nameRu, bible.tone);
    const { client } = trackingClient(["nope", "still nope", "Дневник."]);
    const synced = await syncSoulMemoryDetailed(previous, bible, client, undefined, 1);
    expect(synced.state.character).toEqual(previous.character);
    expect(synced.state.user).toEqual(previous.user);
    expect(synced.state.memoryMd).toBe(previous.memoryMd);
    expect(synced.router.parsed).toBe("invalid");
    expect(synced.router.retryUsed).toBe(true);
    expect(synced.router.rejected[0]).toMatch(/not valid JSON patch/);
  });

  it("does not let a router failure break the chat turn", async () => {
    const chat = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Ты сегодня какой-то уставший.",
      client: scriptedClient(["Да, день длинный."]),
      nowMs: 4,
    });
    expect(chat.reply).toBe("Да, день длинный.");
    expect(chat.error).toBeUndefined();
    const previous = chat.state;
    const synced = await syncSoulMemoryDetailed(
      previous,
      bible,
      scriptedClient(["<<<", "???", "Дневник."]),
      undefined,
      5,
    );
    expect(synced.state.character).toEqual(previous.character);
    expect(chat.reply).toBe("Да, день длинный.");
  });

  it("extracts nothing from ordinary speech and vague teasing", async () => {
    const ordinary = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Ты сегодня какой-то уставший.",
      client: scriptedClient(["Похоже, день тебя добил."]),
      nowMs: 6,
    });
    expect(ordinary.proposals).toEqual([]);
    expect(ordinary.debug?.extractor?.ran).toBe(false);

    const teasing = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Ну и что дальше",
      client: scriptedClient(["Хе-хе, я могла бы придумать кое-что."]),
      nowMs: 7,
    });
    expect(teasing.proposals).toEqual([]);
  });

  it("does not run the extractor or create a card on an explicit opt-out", async () => {
    const result = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Если предложишь сессию — нет.",
      client: scriptedClient(["Хорошо, сегодня просто поговорим."]),
      nowMs: 7,
    });
    expect(result.proposals).toEqual([]);
    expect(result.debug?.extractor?.ran).toBe(false);
  });

  it("extracts an explicit wear command and an explicit session proposal", async () => {
    const wear = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "надень клетку",
      client: scriptedClient(["Надень клетку на три часа.", wearExtract]),
      nowMs: 8,
    });
    expect(wear.proposals[0]?.kind).toBe("wear");
    expect(wear.proposals[0]?.source).toBe("extractor");

    const session = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "давай сессию",
      client: scriptedClient(["Давай устроим мою сессию.", sessionExtract]),
      nowMs: 9,
    });
    expect(session.proposals[0]?.kind).toBe("session");
  });

  it("retries one malformed extractor output and returns the proposal once", async () => {
    const { client, roles, repairs } = trackingClient([
      "Надень клетку на три часа.",
      "not-json",
      wearExtract,
    ]);
    const result = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "надень клетку",
      client,
      nowMs: 10,
    });
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.kind).toBe("wear");
    expect(roles.filter((role) => role === "extractor")).toHaveLength(2);
    expect(repairs).toContain(true);
    expect(result.debug?.extractor?.retryUsed).toBe(true);
    expect(result.debug?.extractor?.parsed).toBe("valid");
  });

  it("returns no proposals after two malformed extractor outputs", async () => {
    const { client } = trackingClient(["Просто поговорим.", "nope", "still nope"]);
    const result = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "давай сессию",
      client,
      nowMs: 11,
    });
    expect(result.proposals).toEqual([]);
    expect(result.reply).toBe("Просто поговорим.");
    expect(result.debug?.extractor?.parsed).toBe("invalid");
    expect(result.debug?.extractor?.retryUsed).toBe(true);
  });

  it("rejects unknown ops and fake contract defs from extract", async () => {
    const unknown = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "давай сессию",
      client: scriptedClient([
        "Просто поговорим.",
        JSON.stringify({ proposals: [{ op: "launch_nukes" }] }),
      ]),
      nowMs: 12,
    });
    expect(unknown.proposals).toEqual([]);

    const fake = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "давай сессию",
      client: scriptedClient([
        "Просто поговорим.",
        JSON.stringify({
          proposals: [{ op: "propose_task", defId: "brand_new_torture" }],
        }),
      ]),
      nowMs: 13,
    });
    const task = fake.proposals.find((row) => row.kind === "task");
    if (task && task.kind === "task") {
      expect(task.defId).not.toBe("brand_new_torture");
    }
  });
});
