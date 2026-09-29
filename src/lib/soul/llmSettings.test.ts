import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../test/localStorageMock";
import {
  buildChatCompletionBody,
  apiKeyAfterProviderSwitch,
  settingsAfterProviderSwitch,
  withChatApiKey,
  assignLocalChatModel,
  localChatModelOf,
  chatProviderNeedsKey,
  chatProviderShowsKeyField,
  DEFAULT_CHAT_SAMPLING,
  endpointForProvider,
  CHAT_LLM_STORAGE_KEY,
  loadChatLlmSettings,
  resolveChatLlm,
  saveChatLlmSettings,
  stripThinkBlocks,
  splitThinkFromRaw,
  collapseRepeatedSpeech,
  harvestChatCompletion,
  OPENROUTER_CHAT_URL,
  GROQ_CHAT_URL,
  emptyChatLlmSettings,
  chatProviderUsesOllama,
  chatCloudConversationId,
  modelForRole,
  samplingForRole,
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
    expect(endpointForProvider("groq_chat", "", "")).toBe(GROQ_CHAT_URL);
    expect(chatProviderNeedsKey("openrouter")).toBe(true);
    expect(chatProviderNeedsKey("groq_chat")).toBe(true);
    expect(chatProviderNeedsKey("ollama")).toBe(false);
    expect(chatProviderNeedsKey("custom")).toBe(false);
    expect(chatProviderShowsKeyField("custom")).toBe(true);
    expect(chatProviderShowsKeyField("openrouter")).toBe(true);
    expect(chatProviderShowsKeyField("groq")).toBe(false);
  });

  it("treats Groq chat as cloud-only without a local fallback", () => {
    const resolved = resolveChatLlm(
      {
        ...emptyChatLlmSettings(),
        provider: "groq_chat",
        apiKey: "gsk_test",
        groqLocalModel: "private-local",
      },
      { endpoint: "http://127.0.0.1:11434/v1/chat/completions", model: "local" },
    );
    expect(resolved.provider).toBe("groq_chat");
    expect(resolved.localFallback).toBeUndefined();
    expect(resolved.endpoint).toBe(GROQ_CHAT_URL);
    expect(chatProviderUsesOllama("groq_chat")).toBe(false);
    expect(chatProviderUsesOllama("groq")).toBe(true);
    expect(
      chatCloudConversationId({
        provider: "groq_chat",
        groqConversationId: "c1",
      }),
    ).toBe("c1");
  });

  it("keeps the Groq key when switching to Ollama and back", () => {
    const groq = {
      ...emptyChatLlmSettings(),
      provider: "groq" as const,
      apiKey: "gsk_test",
    };
    const ollama = settingsAfterProviderSwitch(groq, "ollama");
    expect(ollama.apiKey).toBe("");
    expect(ollama.providerKeys?.groq).toBe("gsk_test");
    expect(settingsAfterProviderSwitch(ollama, "groq").apiKey).toBe("gsk_test");
    expect(settingsAfterProviderSwitch(ollama, "groq_chat").apiKey).toBe(
      "gsk_test",
    );
    expect(apiKeyAfterProviderSwitch("groq", "groq", "gsk_test")).toBe(
      "gsk_test",
    );
  });

  it("keeps each cloud provider's key when switching tabs", () => {
    const groq = settingsAfterProviderSwitch(
      { ...emptyChatLlmSettings(), provider: "groq", apiKey: "gsk_test" },
      "openrouter",
    );
    expect(groq.provider).toBe("openrouter");
    expect(groq.apiKey).toBe("");
    expect(groq.providerKeys?.groq).toBe("gsk_test");

    const openrouter = withChatApiKey(groq, "sk-or-test");
    expect(openrouter.providerKeys?.openrouter).toBe("sk-or-test");
    expect(openrouter.providerKeys?.groq).toBe("gsk_test");

    const openai = settingsAfterProviderSwitch(openrouter, "openai");
    expect(openai.apiKey).toBe("");
    const withOpenai = withChatApiKey(openai, "sk-openai");
    expect(settingsAfterProviderSwitch(withOpenai, "groq").apiKey).toBe(
      "gsk_test",
    );
    expect(settingsAfterProviderSwitch(withOpenai, "openrouter").apiKey).toBe(
      "sk-or-test",
    );
    expect(settingsAfterProviderSwitch(withOpenai, "openai").apiKey).toBe(
      "sk-openai",
    );
  });

  it("migrates a leftover Groq key stored while Ollama is selected", () => {
    saveChatLlmSettings({
      ...emptyChatLlmSettings(),
      provider: "ollama",
      apiKey: "gsk_leftover",
    });
    const loaded = loadChatLlmSettings();
    expect(loaded.provider).toBe("ollama");
    expect(loaded.apiKey).toBe("");
    expect(loaded.providerKeys?.groq).toBe("gsk_leftover");
    expect(settingsAfterProviderSwitch(loaded, "groq").apiKey).toBe(
      "gsk_leftover",
    );
  });

  it("loads a Groq key from old storage that had no providerKeys", () => {
    localStorage.setItem(
      CHAT_LLM_STORAGE_KEY,
      JSON.stringify({
        provider: "openrouter",
        apiKey: "sk-or-legacy",
        model: "deepseek/deepseek-chat",
      }),
    );
    const loaded = loadChatLlmSettings();
    expect(loaded.apiKey).toBe("sk-or-legacy");
    expect(loaded.providerKeys?.openrouter).toBe("sk-or-legacy");
    expect(loaded.providerModels?.openrouter).toBe("deepseek/deepseek-chat");
  });

  it("keeps each provider's model and the custom endpoint when switching tabs", () => {
    const groq = settingsAfterProviderSwitch(
      {
        ...emptyChatLlmSettings(),
        provider: "groq",
        model: "openai/gpt-oss-120b",
      },
      "openrouter",
    );
    expect(groq.model).toBe("");
    expect(groq.providerModels?.groq).toBe("openai/gpt-oss-120b");
    const openrouter = settingsAfterProviderSwitch(
      { ...groq, model: "deepseek/deepseek-chat" },
      "custom",
    );
    expect(openrouter.provider).toBe("custom");
    expect(openrouter.providerModels?.openrouter).toBe("deepseek/deepseek-chat");
    const custom = settingsAfterProviderSwitch(
      {
        ...openrouter,
        model: "lmstudio-community/qwen",
        endpoint: "http://127.0.0.1:1234/v1/chat/completions",
      },
      "groq",
    );
    expect(custom.endpoint).toBe("");
    expect(custom.customEndpoint).toBe(
      "http://127.0.0.1:1234/v1/chat/completions",
    );
    expect(custom.model).toBe("openai/gpt-oss-120b");
    const back = settingsAfterProviderSwitch(custom, "custom");
    expect(back.model).toBe("lmstudio-community/qwen");
    expect(back.endpoint).toBe("http://127.0.0.1:1234/v1/chat/completions");
    expect(
      settingsAfterProviderSwitch(
        { ...emptyChatLlmSettings(), provider: "groq_chat", model: "openai/gpt-oss-20b" },
        "groq",
      ).model,
    ).toBe("openai/gpt-oss-20b");
  });

  it("assigns a local Ollama chat model without leaving Groq", () => {
    const groq = assignLocalChatModel(
      {
        ...emptyChatLlmSettings(),
        provider: "groq",
        model: "openai/gpt-oss-120b",
      },
      "qwen2.5:14b",
    );
    expect(groq.provider).toBe("groq");
    expect(groq.model).toBe("openai/gpt-oss-120b");
    expect(groq.groqLocalModel).toBe("qwen2.5:14b");
    expect(localChatModelOf(groq)).toBe("qwen2.5:14b");
    const cloud = assignLocalChatModel(
      {
        ...emptyChatLlmSettings(),
        provider: "openrouter",
        model: "deepseek/deepseek-chat",
      },
      "llama3.2",
    );
    expect(cloud.provider).toBe("openrouter");
    expect(cloud.model).toBe("deepseek/deepseek-chat");
    expect(localChatModelOf(cloud)).toBe("llama3.2");
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

  it("turns Ollama think on for a spoken chat turn", () => {
    const body = buildChatCompletionBody(
      {
        provider: "ollama",
        model: "qwen2.5:14b",
        endpoint: "/api/ollama/v1/chat/completions",
        apiKey: "",
        sampling: { ...DEFAULT_CHAT_SAMPLING },
      },
      [{ role: "user", content: "hi" }],
      { think: true },
    );
    expect(body.think).toBe(true);
    expect(body.max_tokens).toBe(DEFAULT_CHAT_SAMPLING.maxTokens);
    expect(body.options?.repeat_penalty).toBeGreaterThanOrEqual(1.22);
  });

  it("strips reasoning blocks", () => {
    expect(stripThinkBlocks("<think>secret</think>\nПривет")).toBe("Привет");
    expect(splitThinkFromRaw("<think>secret</think>\nПривет")).toEqual({
      think: "secret",
      speech: "Привет",
    });
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

  it("collapses a looping spoken reply to one cycle", () => {
    const unit =
      "(Смех) Ты опоздал. Я уже в игре. Ты не отчитался — значит, я могу тебя наказать.";
    const loop = Array(12).fill(unit).join(" ");
    expect(collapseRepeatedSpeech(loop)).toBe(unit);
  });

  it("reads Ollama thinking out of the message field", () => {
    const harvested = harvestChatCompletion({
      choices: [
        {
          message: {
            role: "assistant",
            thinking: "He said hi. Greet him, don't dump the cage.",
            content: "Привет, Серёжа.",
          },
        },
      ],
    });
    expect(harvested.speech).toBe("Привет, Серёжа.");
    expect(harvested.think).toContain("Greet him");
  });

  it("does not promote think-only output into visible speech", () => {
    const harvested = harvestChatCompletion({
      choices: [
        {
          message: {
            role: "assistant",
            thinking: "He said hi. Greet him, don't dump the cage.",
            content: "<think>secret plan</think>",
          },
        },
      ],
    });
    expect(harvested.speech).toBe("");
    expect(harvested.think).toContain("secret plan");
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
    expect(loaded.providerKeys?.openrouter).toBe("sk-test");
    expect(loaded.sampling.temperature).toBe(1.05);
    expect(loaded.generationPreset).toBe("balanced");
    expect(loaded.voiceExamples).toBe(true);
  });

  it("uses the chat model when service-role overrides are empty", () => {
    const resolved = resolveChatLlm(
      {
        provider: "ollama",
        model: "qwen2.5:14b",
        endpoint: "",
        apiKey: "",
        sampling: { ...DEFAULT_CHAT_SAMPLING },
        roleModels: {
          router: "",
          extractor: "qwen2.5:7b",
          planner: "qwen2.5:7b",
        },
      },
      { endpoint: "/api/ollama/v1/chat/completions", model: "fallback" },
    );
    expect(modelForRole(resolved, "chat")).toBe("qwen2.5:14b");
    expect(modelForRole(resolved, "router")).toBe("qwen2.5:14b");
    expect(modelForRole(resolved, "extractor")).toBe("qwen2.5:7b");
    expect(modelForRole(resolved, "planner")).toBe("qwen2.5:7b");
    expect(samplingForRole(resolved, "router").temperature).toBeLessThan(
      samplingForRole(resolved, "chat").temperature,
    );
    expect(samplingForRole(resolved, "extractor").temperature).toBeLessThan(
      samplingForRole(resolved, "router").temperature,
    );
    const routerBody = buildChatCompletionBody(resolved, [{ role: "user", content: "hi" }], {
      role: "router",
    });
    const chatBody = buildChatCompletionBody(resolved, [{ role: "user", content: "hi" }], {
      role: "chat",
      think: true,
    });
    const extractorBody = buildChatCompletionBody(resolved, [{ role: "user", content: "hi" }], {
      role: "extractor",
    });
    const plannerBody = buildChatCompletionBody(resolved, [{ role: "user", content: "hi" }], {
      role: "planner",
    });
    expect(routerBody.temperature).toBeLessThan(chatBody.temperature);
    expect(extractorBody.temperature).toBe(0.05);
    expect(extractorBody.model).toBe("qwen2.5:7b");
    expect(routerBody.think).toBe(false);
    expect(routerBody.response_format).toEqual({ type: "json_object" });
    expect(extractorBody.response_format).toEqual({ type: "json_object" });
    expect(plannerBody.response_format).toEqual({ type: "json_object" });
    expect(chatBody.response_format).toBeUndefined();
  });

  it("keeps router/extractor sampling off the chat sliders", () => {
    const resolved = resolveChatLlm(
      {
        provider: "ollama",
        model: "huihui_ai/qwen3-abliterated:14b",
        endpoint: "",
        apiKey: "",
        sampling: { ...DEFAULT_CHAT_SAMPLING, temperature: 1.4, topP: 0.95 },
        roleModels: {
          router: "qwen2.5:7b",
          extractor: "qwen2.5:7b",
          planner: "qwen2.5:7b",
        },
      },
      { endpoint: "/api/ollama/v1/chat/completions", model: "fallback" },
    );
    expect(modelForRole(resolved, "router")).toBe("qwen2.5:7b");
    expect(modelForRole(resolved, "extractor")).toBe("qwen2.5:7b");
    expect(samplingForRole(resolved, "router").temperature).toBe(0.15);
    expect(samplingForRole(resolved, "extractor").temperature).toBe(0.05);
    const openaiRouter = buildChatCompletionBody(
      { ...resolved, provider: "openai" },
      [{ role: "user", content: "hi" }],
      { role: "router" },
    );
    expect(openaiRouter.response_format).toBeUndefined();
  });
});
