import { afterEach, describe, expect, it, vi } from "vitest";
import type { CharacterBible } from "../character";
import { createDirectSoulChatClient, createSoulChatClient } from "./client";
import { regenerateSoulReply, sendSoulChatTurn } from "./engine";
import { emptyChatLlmSettings, resolveChatLlm } from "./llmSettings";
import { emptyMistressState } from "./types";

const bible: CharacterBible = {
  id: "hu_tao", nameRu: "Ху Тао", locale: "ru", tone: [], taboo: [],
  diminutives: [], emojiAllowed: false, systemPrompt: "",
  fallbackLines: { chat: ["Расскажи подробнее."] },
};
const config = () => resolveChatLlm(emptyChatLlmSettings(), {
  endpoint: "http://127.0.0.1:11434/v1/chat/completions", model: "local",
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("chat cancellation and recovery", () => {
  it("retries a failed turn without duplicating the saved user message", async () => {
    const state = emptyMistressState(bible.nameRu, []);
    const failed = await sendSoulChatTurn({ state, bible, userText: "Привет", client: {
      complete: async () => { throw new Error("offline"); },
    } });
    expect(failed.error).toBe("offline");
    const retried = await sendSoulChatTurn({ state: failed.state, bible, userText: "Привет", client: {
      complete: async () => ({ text: "Привет! Как прошёл день?" }),
    } });
    expect(retried.error).toBeUndefined();
    expect(retried.state.messages.map(m => m.role)).toEqual(["user", "assistant"]);
    expect(retried.state.messages[0].id).toBe(failed.state.messages[0].id);
  });

  it.each(["send", "regenerate"])("discards late %s completion after stopping, even when the client ignores abort", async (kind) => {
    const abort = new AbortController();
    const state = emptyMistressState(bible.nameRu, []);
    state.messages = [
      { id: "u", role: "user", text: "Привет", atMs: 1 },
      { id: "a", role: "assistant", text: "Старый ответ", atMs: 2 },
    ];
    const original = structuredClone(state);
    const complete = vi.fn(async () => {
      abort.abort();
      return { text: "Привет! Как прошёл день?" };
    });
    const opts = { state, bible, client: { complete }, signal: abort.signal };
    const pending = kind === "send"
      ? sendSoulChatTurn({ ...opts, userText: "Привет" })
      : regenerateSoulReply({ ...opts, messageId: "a" });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(state).toEqual(original);
  });

  it("does not call a model for an already stopped turn", async () => {
    const abort = new AbortController(); abort.abort();
    const complete = vi.fn();
    await expect(sendSoulChatTurn({ state: emptyMistressState(bible.nameRu, []), bible,
      userText: "Привет", client: { complete }, signal: abort.signal,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(complete).not.toHaveBeenCalled();
  });

  function stalledFetch() {
    return vi.fn((_url: string, opts: RequestInit) => new Promise<Response>((_resolve, reject) => {
      opts.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
  }

  it("distinguishes a local timeout from a user's Stop", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", stalledFetch());
    const resolved = config(); resolved.sampling.timeoutMs = 100;
    const pending = createDirectSoulChatClient(resolved).complete({ messages: [] });
    const check = expect(pending).rejects.toThrow("не ответила вовремя");
    await vi.advanceTimersByTimeAsync(100);
    await check;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still falls back locally after a Groq timeout", async () => {
    vi.useFakeTimers();
    const resolved = resolveChatLlm({ ...emptyChatLlmSettings(), provider: "groq", apiKey: "test" },
      { endpoint: "http://127.0.0.1:11434/v1/chat/completions", model: "local" });
    resolved.sampling.timeoutMs = 100;
    const fetchMock = stalledFetch().mockImplementationOnce(stalledFetch())
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "Привет!" } }] })));
    vi.stubGlobal("fetch", fetchMock);
    const pending = createSoulChatClient(resolved).complete({ messages: [], cloudMessages: [] });
    const check = expect(pending).resolves.toMatchObject({ delivery: { provider: "ollama" } });
    await vi.advanceTimersByTimeAsync(100);
    await check;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
