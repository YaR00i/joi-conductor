import { describe, expect, it } from "vitest";
import type { CharacterBible } from "../character";
import { sendSoulChatTurn, soulNeedsSync, syncSoulMemory, truncateForRegenerate, editSoulMessage, regenerateSoulReply } from "./engine";
import type { SoulLlmClient } from "./ollama";
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
  fallbackLines: {},
};

function scriptedClient(replies: string[]): SoulLlmClient {
  const queue = [...replies];
  return {
    async complete() {
      const next = queue.shift();
      if (next == null) throw new Error("no scripted reply");
      return next;
    },
  };
}

describe("soul chat engine", () => {
  it("keeps the chat prompt off the session queue", () => {
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
    expect(system).toContain("does not control the JOI queue");
    expect(system).not.toMatch(/edgesTarget|block_start|"text":"..."/);
    expect(system).toContain("MEMORY.md");
    expect(system).toContain("Russian in → Russian out");
    expect(system).toContain("/no_think");
    expect(system).not.toContain("You are the CONDUCTOR");
    expect(system).not.toMatch(/Reply with ONLY one JSON/);
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
    expect(system).toContain("playful gamer-girl");
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
              },
            ],
          },
        }),
        "He drifted in after dark and admitted a habit of night tea. She filed it under living clients who might yet buy a coffin.",
        "Он зашёл ночью. Чай, говорит, любит. Пусть пьёт — живым тоже наливаю.",
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
});
