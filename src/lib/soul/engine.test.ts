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
    expect(system).toContain("CONTROL");
    expect(system).toContain("Do not output JSON");
    expect(system).not.toMatch(/block_start|"text":"..."/);
    expect(system).toContain("MEMORY.md");
    expect(system).toContain("Russian in → Russian out");
    expect(system).toContain("/think");
    expect(system).not.toContain("/no_think");
    expect(system).not.toContain("You are the CONDUCTOR");
    expect(system).not.toMatch(/Reply with ONLY one JSON/);
    expect(system).toContain("THIS TURN");
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

  it("strips trailing control JSON from the stored bubble", async () => {
    const result = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Запирай",
      client: scriptedClient([
        'Клетка. {"actions":[{"op":"set_wear","kind":"cage","hours":2}]}',
      ]),
      nowMs: 5,
    });
    expect(result.reply).toBe("Клетка.");
    expect(result.actions[0]?.op).toBe("set_wear");
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
    expect(result.actions).toEqual([]);
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
    expect(result.actions).toEqual([]);
  });

  it("drops a leaked session seed on a greeting", async () => {
    const result = await sendSoulChatTurn({
      state: emptyMistressState(bible.nameRu, bible.tone),
      bible,
      userText: "Привет",
      client: scriptedClient([
        'Привет. {"actions":[{"op":"propose_session","kind":"edges","durationSec":600,"edgesTarget":5,"finalePolicy":"ruin_norm"}]}',
      ]),
    });
    expect(result.reply).toBe("Привет.");
    expect(result.actions).toEqual([]);
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
