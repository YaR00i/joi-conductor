import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../test/localStorageMock";
import {
  buildChatCompletionBody,
  chatProviderNeedsKey,
  DEFAULT_CHAT_SAMPLING,
  endpointForProvider,
  loadChatLlmSettings,
  resolveChatLlm,
  saveChatLlmSettings,
  stripThinkBlocks,
  OPENROUTER_CHAT_URL,
} from "./llmSettings";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

describe("chat llm settings", () => {
  it("uses Soul of Waifu sampling defaults", () => {
    expect(DEFAULT_CHAT_SAMPLING.temperature).toBe(0.8);
    expect(DEFAULT_CHAT_SAMPLING.topP).toBe(0.7);
    expect(DEFAULT_CHAT_SAMPLING.maxTokens).toBe(1000);
    expect(DEFAULT_CHAT_SAMPLING.minP).toBe(0.07);
    expect(DEFAULT_CHAT_SAMPLING.frequencyPenalty).toBe(0.4);
    expect(DEFAULT_CHAT_SAMPLING.presencePenalty).toBe(0.3);
  });

  it("pins OpenRouter and OpenAI URLs", () => {
    expect(endpointForProvider("openrouter", "http://ignored", "")).toBe(
      OPENROUTER_CHAT_URL,
    );
    expect(endpointForProvider("openai", "", "")).toContain("api.openai.com");
    expect(chatProviderNeedsKey("openrouter")).toBe(true);
    expect(chatProviderNeedsKey("ollama")).toBe(false);
  });

  it("falls back to the session Ollama model when chat model is empty", () => {
    const resolved = resolveChatLlm(
      {
        provider: "ollama",
        model: "",
        endpoint: "",
        apiKey: "",
        sampling: { ...DEFAULT_CHAT_SAMPLING },
      },
      { endpoint: "/api/ollama/v1/chat/completions", model: "qwen2.5:14b" },
    );
    expect(resolved.model).toBe("qwen2.5:14b");
    expect(resolved.endpoint).toBe("/api/ollama/v1/chat/completions");
  });

  it("puts SoW params on the OpenAI body and Ollama options", () => {
    const body = buildChatCompletionBody(
      {
        provider: "ollama",
        model: "qwen2.5:14b",
        endpoint: "/api/ollama/v1/chat/completions",
        apiKey: "",
        sampling: { ...DEFAULT_CHAT_SAMPLING },
      },
      [{ role: "user", content: "hi" }],
    );
    expect(body.temperature).toBe(0.8);
    expect(body.top_p).toBe(0.7);
    expect(body.max_tokens).toBe(1000);
    expect(body.frequency_penalty).toBe(0.4);
    expect(body.presence_penalty).toBe(0.3);
    expect(body.options?.min_p).toBe(0.07);
    expect(body.options?.repeat_penalty).toBe(1.1);
    expect(body.think).toBe(false);
  });

  it("strips reasoning blocks", () => {
    expect(stripThinkBlocks("<think>secret</think>\nПривет")).toBe("Привет");
  });

  it("keeps the spoken line after a leaked Qwen3 think dump", () => {
    const leaked = [
      "要简洁有力，保持角色设定，用1-2个emoji让对话更自然。",
      '示例: "Привет, silly. Ready to play? 🔥"',
      "</think>",
      "Привет, bunny. What's your name? 😉",
    ].join("\n");
    expect(stripThinkBlocks(leaked)).toBe(
      "Привет, bunny. What's your name? 😉",
    );
  });

  it("drops a diary assignment recap and keeps her entry", () => {
    const leaked = [
      "颗 Okay, let's see. I need to write Hu Tao's private diary entry about the latest chat.",
      "First person, so she's writing it. The user is third person: he, the boy, his name if known.",
      "The user's name is Сергей, but she calls him Серёжа. The diary should be 4-6 sentences.",
      "Серёжа зашёл только поздороваться. Пусть сидит — живым тоже наливаю чай.",
    ].join(" ");
    expect(stripThinkBlocks(leaked)).toBe(
      "Серёжа зашёл только поздороваться. Пусть сидит — живым тоже наливаю чай.",
    );
  });

  it("returns empty when the diary dump is only planning", () => {
    expect(
      stripThinkBlocks(
        "Okay, let's see. I need to write Hu Tao's private diary entry about the latest chat. The diary should be 4-6 sentences.",
      ),
    ).toBe("");
  });

  it("round-trips settings", () => {
    saveChatLlmSettings({
      provider: "openrouter",
      model: "deepseek/deepseek-chat",
      endpoint: "",
      apiKey: "sk-test",
      sampling: { ...DEFAULT_CHAT_SAMPLING, temperature: 1.05 },
    });
    const loaded = loadChatLlmSettings();
    expect(loaded.provider).toBe("openrouter");
    expect(loaded.apiKey).toBe("sk-test");
    expect(loaded.sampling.temperature).toBe(1.05);
  });
});
