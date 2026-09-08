import { afterEach, describe, expect, it, vi } from "vitest";
import { readChatCompletionStream, streamSpeechPreview } from "./chatStream";
import { createDirectSoulChatClient, createSoulChatClient } from "./client";
import { completeSoulChatSpeech } from "./chatComplete";
import { emptyChatLlmSettings, resolveChatLlm, splitThinkFromCompletion } from "./llmSettings";
import type { CharacterBible } from "../character";

const frame = (delta: Record<string, string>, finish: string | null = null) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\r\n\r\n`;
const encode = (text: string) => new TextEncoder().encode(text);
function stream(text: string, byteByByte = false) {
  const bytes = encode(text);
  return new ReadableStream<Uint8Array>({ start(controller) {
    if (byteByByte) for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    else controller.enqueue(bytes);
    controller.close();
  } });
}
const sseResponse = (text: string) => new Response(stream(text), { headers: { "Content-Type": "text/event-stream" } });
const config = (groq = false) => resolveChatLlm({ ...emptyChatLlmSettings(),
  provider: groq ? "groq" : "ollama", apiKey: groq ? "test" : "",
}, { endpoint: "http://127.0.0.1:11434/v1/chat/completions", model: "local" });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("streamed speech", () => {
  it("decodes split UTF-8, CRLF and SSE frames without losing spaces", async () => {
    const previews: string[] = [];
    const data = await readChatCompletionStream(stream(
      ': heartbeat\r\n\r\n' + frame({ content: "Привет, " }) + frame({ content: "мир!" }, "stop") + 'data: [DONE]\r\n\r\n', true),
      new AbortController().signal, text => previews.push(text));
    expect(splitThinkFromCompletion(data, "").speech).toBe("Привет, мир!");
    expect(previews.at(-1)).toBe("Привет, мир!");
  });

  it("keeps delta reasoning out of previews but available for final diagnostics", async () => {
    const previews: string[] = [];
    const data = await readChatCompletionStream(stream(frame({ reasoning: "SECRET" }) + frame({ content: "Привет!" }, "stop")),
      new AbortController().signal, text => previews.push(text));
    expect(previews.join("|")).not.toContain("SECRET");
    expect(splitThinkFromCompletion(data, "")).toEqual({ speech: "Привет!", think: "SECRET" });
  });

  it("hides think tags even when their delimiters arrive in fragments", () => {
    for (const text of ["<", "<thi", "<think>", "<think>SECRET", "<think>SECRET</thi"]) {
      expect(streamSpeechPreview(text)).toBe("");
    }
    expect(streamSpeechPreview("<think>SECRET</think>Привет!")).toBe("Привет!");
    expect(streamSpeechPreview("Привет! <thi")).toBe("Привет!");
    expect(streamSpeechPreview('Привет! {"action":')).toBe("Привет!");
    expect(streamSpeechPreview("Привет! ```json\n")).toBe("Привет!");
  });

  it.each([frame({ content: "unfinished" }), 'data: broken\n\n', 'data: {"error":{"message":"SECRET"}}\n\n'])(
    "rejects interrupted or invalid streams instead of accepting partial replies", async (text) => {
      await expect(readChatCompletionStream(stream(text), new AbortController().signal, () => {})).rejects.toBeInstanceOf(TypeError);
    });

  it("publishes before EOF and cancels a pending read on Stop", async () => {
    const abort = new AbortController();
    const cancel = vi.fn();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; }, cancel });
    const preview = vi.fn();
    const pending = readChatCompletionStream(body, abort.signal, preview);
    controller.enqueue(encode(frame({ content: "Привет" })));
    await vi.waitFor(() => expect(preview).toHaveBeenCalledWith("Привет"));
    const check = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    abort.abort();
    await check;
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it.each([false, true])("enables SSE only for speech callbacks (Groq=%s)", async (groq) => {
    const fetchMock = vi.fn().mockImplementation(async () => sseResponse(frame({ content: "Привет!" }, "stop")));
    vi.stubGlobal("fetch", fetchMock);
    const preview = vi.fn();
    const result = await createDirectSoulChatClient(config(groq)).complete({ messages: [], role: "chat", onSpeechPreview: preview });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(true);
    expect(preview).toHaveBeenLastCalledWith("Привет!");
    expect(result.text).toBe("Привет!");
  });

  it("leaves service-role calls non-streaming and supports servers returning JSON", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: "Привет!" } }] })));
    vi.stubGlobal("fetch", fetchMock);
    const preview = vi.fn();
    const client = createDirectSoulChatClient(config());
    expect((await client.complete({ messages: [], onSpeechPreview: preview })).text).toBe("Привет!");
    preview.mockClear();
    await client.complete({ messages: [], role: "router", onSpeechPreview: preview });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty("stream");
    expect(preview).not.toHaveBeenCalled();
  });

  it("clears a broken Groq preview before local fallback without sharing private prompts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseResponse(frame({ content: "Облачный обрывок" })))
      .mockResolvedValueOnce(sseResponse(frame({ content: "Локальный ответ" }, "stop")));
    vi.stubGlobal("fetch", fetchMock);
    const previews: string[] = [];
    const result = await createSoulChatClient(config(true)).complete({
      messages: [{ role: "system", content: "PRIVATE" }], cloudMessages: [{ role: "user", content: "Привет" }],
      onSpeechPreview: text => previews.push(text),
    });
    expect(fetchMock.mock.calls[0][1].body).not.toContain("PRIVATE");
    expect(fetchMock.mock.calls[1][1].body).toContain("PRIVATE");
    const partial = previews.indexOf("Облачный обрывок");
    expect(previews.slice(partial + 1, -1)).toContain("");
    expect(previews.at(-1)).toBe("Локальный ответ");
    expect(result.delivery?.provider).toBe("ollama");
  });

  it("filters invalid previews and clears the old attempt before validation retry", async () => {
    const bible: CharacterBible = { id: "hu_tao", nameRu: "Ху Тао", locale: "ru", tone: [], taboo: [],
      diminutives: [], emojiAllowed: false, systemPrompt: "", fallbackLines: { chat: ["Расскажи подробнее."] } };
    const previews: string[] = [];
    let calls = 0;
    const result = await completeSoulChatSpeech({ bible, messages: [{ role: "user", content: "Привет" }], recent: [],
      onSpeechPreview: text => previews.push(text),
      client: { complete: async (opts) => {
        calls++;
        if (calls === 1) {
          opts.onSpeechPreview?.('{"action":');
          return { text: "Hello" };
        }
        expect(previews.at(-1)).toBe("");
        opts.onSpeechPreview?.("Привет!");
        return { text: "Привет!" };
      } },
    });
    expect(previews.join(" ")).not.toContain("action");
    expect(result.retryUsed).toBe(true);
    expect(result.speech).toBe("Привет!");
  });
});
