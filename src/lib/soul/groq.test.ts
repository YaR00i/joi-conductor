import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildChatCompletionBody, emptyChatLlmSettings, resolveChatLlm, saveChatLlmSettings, loadChatLlmSettings } from "./llmSettings";
import { buildCloudConversation } from "./cloudConversation";
import { emptyMistressState } from "./types";
import { installLocalStorageMock, resetLocalStorage } from "../../test/localStorageMock";
import { editSoulMessage, regenerateSoulReply, sendSoulChatTurn } from "./engine";
import { saveSoulState, loadSoulState } from "./store";
import type { CharacterBible } from "../character";
import type { SoulLlmCompleteOpts } from "./client";

installLocalStorageMock();
const bible: CharacterBible = {
  id: "hu_tao", nameRu: "Ху Тао", locale: "ru", tone: ["playful"], taboo: [],
  diminutives: [], emojiAllowed: false, systemPrompt: "PRIVATE_BIBLE",
  fallbackLines: { chat: ["Расскажи подробнее."] },
};
const privateMessages = [{ role: "system" as const, content: "PRIVATE_MEMORY" }, { role: "user" as const, content: "Привет" }];
const cloudMessages = [{ role: "user" as const, content: "Привет" }];
const resolved = () => resolveChatLlm({ ...emptyChatLlmSettings(), provider: "groq", apiKey: "test-key", groqLocalModel: "local-chat" },
  { endpoint: "http://127.0.0.1:11434/v1/chat/completions", model: "default-local" });
const response = () => new Response(JSON.stringify({ choices: [{ message: { content: "Привет! Как прошёл день?" } }] }), { status: 200 });

beforeEach(() => { resetLocalStorage(); vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Groq hybrid boundary", () => {
  it("pins cloud URL, preserves local model, strips Ollama-only options and roundtrips settings", () => {
    const settings = { ...emptyChatLlmSettings(), provider: "groq" as const, groqLocalModel: "private", groqConversationId: "conversation-1" };
    saveChatLlmSettings(settings);
    expect(loadChatLlmSettings()).toMatchObject(settings);
    const config = resolved();
    expect(config.endpoint).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(config.localFallback).toMatchObject({ model: "local-chat", provider: "ollama", apiKey: "" });
    const body = buildChatCompletionBody(config, cloudMessages, { think: true });
    expect(body).toMatchObject({ reasoning_effort: "low" });
    expect(body).not.toHaveProperty("think");
    expect(body).not.toHaveProperty("options");
    expect(body).not.toHaveProperty("stop");
  });

  it("never sends private prompts for a cloud speech request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response()); vi.stubGlobal("fetch", fetchMock);
    const { createSoulChatClient } = await import("./client");
    const reply = await createSoulChatClient(resolved()).complete({ messages: privateMessages, cloudMessages, role: "chat" });
    expect(reply.delivery?.provider).toBe("groq");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages).toEqual(cloudMessages);
    expect(fetchMock.mock.calls[0][1].body).not.toContain("PRIVATE_MEMORY");
  });

  it.each(["chat", "router", "extractor", "planner"] as const)("keeps %s without explicit cloud context local", async (role) => {
    const fetchMock = vi.fn().mockResolvedValue(response()); vi.stubGlobal("fetch", fetchMock);
    const { createSoulChatClient } = await import("./client");
    const reply = await createSoulChatClient(resolved()).complete({ messages: privateMessages, role });
    expect(reply.delivery?.provider).toBe("ollama");
    expect(fetchMock.mock.calls[0][0]).toContain("127.0.0.1");
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
  });

  it("keeps service roles local even with cloud context attached", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response()); vi.stubGlobal("fetch", fetchMock);
    const { createSoulChatClient } = await import("./client");
    await createSoulChatClient(resolved()).complete({ messages: privateMessages, cloudMessages, role: "router" });
    expect(fetchMock.mock.calls[0][0]).toContain("127.0.0.1");
  });

  it("falls back on 429 and observes Retry-After across new clients", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("limit", { status: 429, headers: { "retry-after": "60" } }))
      .mockImplementation(async () => response()); vi.stubGlobal("fetch", fetchMock);
    const { createSoulChatClient } = await import("./client");
    const opts = { messages: privateMessages, cloudMessages };
    const result = await createSoulChatClient(resolved()).complete(opts);
    expect(result.delivery).toMatchObject({ provider: "ollama" });
    expect(result.delivery?.notice).toContain("лимит");
    await createSoulChatClient(resolved()).complete(opts);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([resolved().endpoint, resolved().localFallback!.endpoint, resolved().localFallback!.endpoint]);
  });

  it("shows bad-key errors without masking them with a local answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("secret echoed", { status: 401 })); vi.stubGlobal("fetch", fetchMock);
    const { createSoulChatClient } = await import("./client");
    await expect(createSoulChatClient(resolved()).complete({ messages: privateMessages, cloudMessages })).rejects.toThrow("проверь API-ключ");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not start a fallback after cancellation", async () => {
    const abort = new AbortController();
    const fetchMock = vi.fn().mockImplementation(() => { abort.abort(); throw new DOMException("cancelled", "AbortError"); });
    vi.stubGlobal("fetch", fetchMock);
    const { createSoulChatClient } = await import("./client");
    await expect(createSoulChatClient(resolved()).complete({ messages: privateMessages, cloudMessages, signal: abort.signal })).rejects.toThrow("cancelled");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects remote endpoints posing as private fallback", async () => {
    const config = resolved(); config.localFallback!.endpoint = "https://remote.example/v1/chat/completions";
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const { createSoulChatClient } = await import("./client");
    await expect(createSoulChatClient(config).complete({ messages: privateMessages })).rejects.toThrow("локальный адрес");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shares only explicitly marked history, persists marks, revokes edited content", () => {
    const state = emptyMistressState("Ху Тао", []);
    state.diaryMd = "PRIVATE_DIARY";
    state.messages = [
      { id: "old", role: "user", text: "PRIVATE_HISTORY", atMs: 1 },
      { id: "other", role: "user", text: "OTHER_CONVERSATION", atMs: 2, cloudContextId: "old-scope" },
      { id: "shared", role: "assistant", text: "SHARED", atMs: 3, cloudContextId: "scope" },
    ];
    saveSoulState("hu_tao", state);
    const loaded = loadSoulState("hu_tao", bible);
    const sent = JSON.stringify(buildCloudConversation("hu_tao", loaded, "Новый вопрос", "scope"));
    expect(sent).toContain("SHARED");
    expect(sent).not.toMatch(/PRIVATE_|OTHER_CONVERSATION/);
    const edited = editSoulMessage(loaded, "shared", "PRIVATE_EDIT");
    expect(JSON.stringify(buildCloudConversation("hu_tao", edited, "Привет", "scope"))).not.toContain("PRIVATE_EDIT");
    expect(buildCloudConversation("hu_tao", loaded, "Привет", "")).toBeUndefined();
  });

  it("marks successful cloud exchanges and keeps private regeneration local", async () => {
    const client = { complete: vi.fn(async () => ({ text: "Привет! Рада тебя видеть.", delivery: { provider: "groq" as const } })) };
    const result = await sendSoulChatTurn({ state: emptyMistressState("Ху Тао", []), bible, userText: "Привет", client, cloudConversationId: "scope" });
    expect(result.state.messages.map((m) => m.cloudContextId)).toEqual(["scope", "scope"]);
    expect(JSON.stringify(result.debug?.promptMessages)).not.toContain("PRIVATE_BIBLE");
    const privateState = { ...result.state, messages: result.state.messages.map((m) => ({ ...m, cloudContextId: undefined })) };
    const local = { complete: vi.fn(async (_opts: SoulLlmCompleteOpts) => ({ text: "Привет! Рада тебя видеть." })) };
    await regenerateSoulReply({ state: privateState, bible, messageId: privateState.messages.at(-1)!.id, client: local, cloudConversationId: "scope" });
    expect(local.complete.mock.calls[0]?.[0].cloudMessages).toBeUndefined();
  });
});

describe("Groq chat-only", () => {
  const cloudOnly = () => resolveChatLlm(
    { ...emptyChatLlmSettings(), provider: "groq_chat", apiKey: "test-key" },
    { endpoint: "http://127.0.0.1:11434/v1/chat/completions", model: "default-local" },
  );

  it("has no local fallback and never sends private prompts", async () => {
    expect(cloudOnly().localFallback).toBeUndefined();
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);
    const { createSoulChatClient } = await import("./client");
    const client = createSoulChatClient(cloudOnly());
    const reply = await client.complete({ messages: privateMessages, cloudMessages, role: "chat" });
    expect(reply.delivery?.provider).toBe("groq");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages).toEqual(cloudMessages);
    fetchMock.mockClear();
    await expect(client.complete({ messages: privateMessages, role: "chat" })).resolves.toEqual({ text: "" });
    await expect(client.complete({ messages: privateMessages, cloudMessages, role: "router" })).resolves.toEqual({ text: "" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fall back to Ollama on 429", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("limit", { status: 429, headers: { "retry-after": "1" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { createSoulChatClient } = await import("./client");
    await expect(createSoulChatClient(cloudOnly()).complete({ messages: privateMessages, cloudMessages }))
      .rejects.toThrow("сервис недоступен");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips extractor cards when service roles are off", async () => {
    const client = {
      complete: vi.fn(async (opts: SoulLlmCompleteOpts) => {
        if (opts.role && opts.role !== "chat") throw new Error("service role should not run");
        return { text: "Привет! Рада тебя видеть.", delivery: { provider: "groq" as const } };
      }),
    };
    const result = await sendSoulChatTurn({
      state: emptyMistressState("Ху Тао", []),
      bible,
      userText: "Поставь клетку",
      client,
      cloudConversationId: "scope",
      skipServiceRoles: true,
    });
    expect(result.proposals).toEqual([]);
    expect(client.complete.mock.calls.every((call) => !call[0].role || call[0].role === "chat")).toBe(true);
  });
});
