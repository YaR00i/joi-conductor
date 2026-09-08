import { splitThinkFromCompletion } from "./llmSettings";

/** Hold unfinished tags back: `<thi` must never flash in the speech bubble. */
export function streamSpeechPreview(content: string): string {
  const completeTags = content.replace(/<[^>]*$/, "");
  const speech = splitThinkFromCompletion(null, completeTags).speech;
  // An unfinished command/code block is not parseable by the final speech guard yet.
  return speech.split(/```|[{}]|---\s*CONTROL/i)[0].trim();
}

/** OpenAI-compatible SSE transport shared by Groq and Ollama's /v1 endpoint. */
export async function readChatCompletionStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onPreview: (speech: string) => void,
): Promise<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventLines: string[] = [];
  let content = "";
  let reasoning = "";
  let complete = false;
  let doneEvent = false;
  let bytes = 0;
  let lastPreview = "";
  let lastPublish = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });

  function publish(force = false) {
    signal.throwIfAborted();
    if (!force && Date.now() - lastPublish < 50) return;
    const next = streamSpeechPreview(content);
    if (next !== lastPreview) {
      lastPreview = next;
      lastPublish = Date.now();
      onPreview(next);
    }
  }

  function event() {
    const payload = eventLines.join("\n").trim();
    eventLines = [];
    if (!payload) return;
    if (payload === "[DONE]") { complete = true; doneEvent = true; return; }
    let data: {
      error?: unknown;
      choices?: Array<{ index?: number; delta?: Record<string, unknown>; finish_reason?: string | null }>;
    };
    try { data = JSON.parse(payload); }
    catch { throw new TypeError("Повреждён поток ответа. Повтори запрос."); }
    if (!data || data.error) throw new TypeError("Сервис прервал поток ответа. Повтори запрос.");
    const choice = data.choices?.find(row => row.index === 0 || row.index == null);
    if (!choice) return; // Usage frames and keep-alive events have no delta.
    const delta = choice.delta;
    if (typeof delta?.content === "string") content += delta.content;
    for (const key of ["reasoning_content", "reasoning", "thinking", "think"]) {
      if (typeof delta?.[key] === "string") { reasoning += delta[key]; break; }
    }
    if (choice.finish_reason != null) complete = true;
    publish();
  }

  function lines() {
    let end: number;
    while (!doneEvent && (end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end).replace(/\r$/, "");
      buffer = buffer.slice(end + 1);
      if (!line) event();
      else if (line.startsWith("data:")) eventLines.push(line.slice(5).replace(/^ /, ""));
    }
  }

  try {
    signal.throwIfAborted();
    while (!doneEvent) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) {
        buffer += decoder.decode() + "\n\n";
        lines();
        break;
      }
      bytes += value.byteLength;
      if (bytes > 2_000_000) throw new Error("Поток ответа слишком большой. Сократи лимит генерации.");
      buffer += decoder.decode(value, { stream: true });
      lines();
    }
    if (!complete) throw new TypeError("Поток ответа оборвался. Повтори запрос.");
    publish(true);
    return { choices: [{ message: { content, reasoning_content: reasoning } }] };
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
