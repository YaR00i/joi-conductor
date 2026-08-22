import { extractChatContent } from "../voice/parseLlmContent";
import type { SoulChatTurn } from "./prompts";
import {
  buildChatCompletionBody,
  chatCompletionHeaders,
  harvestChatCompletion,
  splitThinkFromCompletion,
  type ResolvedChatLlm,
} from "./llmSettings";

export type SoulLlmReply = {
  text: string;
  think?: string;
};

export type SoulLlmClient = {
  complete: (opts: {
    messages: SoulChatTurn[];
    maxTokens?: number;
    temperature?: number;
    think?: boolean;
    signal?: AbortSignal;
  }) => Promise<SoulLlmReply>;
};

export function createSoulChatClient(resolved: ResolvedChatLlm): SoulLlmClient {
  const timeoutMs = resolved.sampling.timeoutMs;
  return {
    async complete({ messages, maxTokens, temperature, think, signal }) {
      const abort = new AbortController();
      const timer = globalThis.setTimeout(() => abort.abort(), timeoutMs);
      const onParentAbort = () => abort.abort();
      signal?.addEventListener("abort", onParentAbort);
      try {
        const res = await fetch(resolved.endpoint, {
          method: "POST",
          headers: chatCompletionHeaders(resolved),
          signal: abort.signal,
          body: JSON.stringify(
            buildChatCompletionBody(resolved, messages, {
              maxTokens,
              temperature,
              think,
            }),
          ),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(
            `LLM HTTP ${res.status}${errText ? `: ${errText.slice(0, 180)}` : ""}`,
          );
        }
        const data: unknown = await res.json();
        const content = extractChatContent(data);
        const split = splitThinkFromCompletion(data, content ?? "");
        if (!split.speech) throw new Error("Пустой ответ модели");
        return split.think
          ? { text: split.speech, think: split.think }
          : { text: split.speech };
      } finally {
        globalThis.clearTimeout(timer);
        signal?.removeEventListener("abort", onParentAbort);
      }
    },
  };
}

/** @deprecated use createSoulChatClient */
export function createOllamaSoulClient(opts: {
  endpoint: string;
  model: string;
  timeoutMs?: number;
}): SoulLlmClient {
  return createSoulChatClient({
    provider: "ollama",
    model: opts.model,
    endpoint: opts.endpoint,
    apiKey: "",
    sampling: {
      temperature: 0.8,
      top_p: 0.7,
      min_p: 0.07,
      top_k: 40,
      maxTokens: 1000,
      frequencyPenalty: 0.4,
      presencePenalty: 0.3,
      repeatPenalty: 1.1,
      timeoutMs: opts.timeoutMs ?? 90000,
    },
  });
}
