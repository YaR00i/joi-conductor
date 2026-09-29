import { extractChatContent } from "../voice/parseLlmContent";
import { readChatCompletionStream } from "./chatStream";
import type { SoulChatTurn } from "./prompts";
import {
  buildChatCompletionBody,
  chatCompletionHeaders,
  DEFAULT_CHAT_SAMPLING,
  DEFAULT_ROLE_MODELS,
  isGroqCloudProvider,
  splitThinkFromCompletion,
  type ResolvedChatLlm,
  type SoulModelRole,
} from "./llmSettings";

export type SoulLlmReply = {
  text: string;
  think?: string;
  delivery?: { provider: "groq" | "ollama"; notice?: string };
};

export type SoulLlmCompleteOpts = {
  messages: SoulChatTurn[];
  maxTokens?: number;
  temperature?: number;
  think?: boolean;
  role?: SoulModelRole;
  signal?: AbortSignal;
  /** Allowlisted conversation assembled independently of private prompts. */
  cloudMessages?: SoulChatTurn[];
  /** Temporary speech only; never persist or speak until complete() resolves. */
  onSpeechPreview?: (text: string) => void;
};

export type SoulLlmClient = {
  complete: (opts: SoulLlmCompleteOpts) => Promise<SoulLlmReply>;
};

class LlmHttpError extends Error {
  constructor(public status: number, public retryAfter: number, message: string) {
    super(message);
  }
}

class LlmTimeoutError extends Error {}

let groqRetryAt = 0;

function assertLocalFallback(resolved?: ResolvedChatLlm): asserts resolved is ResolvedChatLlm {
  if (!resolved?.model) throw new Error("Выбери локальную модель Ollama в настройках Groq.");
  const url = new URL(resolved.endpoint, globalThis.location?.origin || "http://localhost");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("Приватный режим Groq требует локальный адрес Ollama (localhost).");
  }
}

export function createSoulChatClient(resolved: ResolvedChatLlm): SoulLlmClient {
  const direct = createDirectSoulChatClient(resolved);
  if (resolved.provider === "groq_chat") {
    return {
      async complete(opts) {
        if (opts.signal?.aborted) throw new DOMException("Отменено", "AbortError");
        if ((opts.role && opts.role !== "chat") || !opts.cloudMessages) {
          return { text: "" };
        }
        if (!resolved.apiKey) throw new Error("Введи ключ Groq в настройках чата → Модель.");
        const result = await direct.complete({ ...opts, messages: opts.cloudMessages });
        return { ...result, delivery: { provider: "groq" } };
      },
    };
  }
  if (resolved.provider !== "groq") return direct;
  async function local(opts: SoulLlmCompleteOpts, notice?: string): Promise<SoulLlmReply> {
    assertLocalFallback(resolved.localFallback);
    try {
      const result = await createDirectSoulChatClient(resolved.localFallback).complete(opts);
      return { ...result, delivery: { provider: "ollama", notice } };
    } catch (error) {
      if (opts.signal?.aborted) throw error;
      throw new Error(`${notice ? `${notice} ` : ""}Ollama не ответила: ${error instanceof Error ? error.message : "ошибка соединения"}`);
    }
  }
  return { async complete(opts) {
    if (opts.signal?.aborted) throw new DOMException("Отменено", "AbortError");
    if ((opts.role && opts.role !== "chat") || !opts.cloudMessages) return local(opts);
    if (!resolved.apiKey) throw new Error("Введи ключ Groq в настройках чата → Модель.");
    if (Date.now() < groqRetryAt) return local(opts, "Groq: пауза после лимита. Ответила локальная модель.");
    try {
      const result = await direct.complete({ ...opts, messages: opts.cloudMessages });
      return { ...result, delivery: { provider: "groq" } };
    } catch (error) {
      if (opts.signal?.aborted) throw error;
      const recoverable = error instanceof LlmHttpError
        ? error.status === 429 || error.status >= 500
        : error instanceof TypeError || error instanceof LlmTimeoutError || (error instanceof Error && error.name === "AbortError");
      if (!recoverable) throw error;
      if (error instanceof LlmHttpError && error.status === 429) {
        groqRetryAt = Date.now() + Math.max(1000, error.retryAfter || 60000);
      }
      return local(opts, "Groq временно недоступен или достигнут лимит. Ответила локальная модель.");
    }
  } };
}

/** Transport only. Groq callers outside diagnostics must use the hybrid client. */
export function createDirectSoulChatClient(resolved: ResolvedChatLlm): SoulLlmClient {
  const timeoutMs = resolved.sampling.timeoutMs;
  return {
    async complete({
      messages,
      maxTokens,
      temperature,
      think,
      role,
      signal,
      onSpeechPreview,
    }) {
      if (signal?.aborted) throw new DOMException("Отменено", "AbortError");
      const abort = new AbortController();
      const timer = globalThis.setTimeout(() => abort.abort(), timeoutMs);
      const onParentAbort = () => abort.abort();
      signal?.addEventListener("abort", onParentAbort);
      const preview = role == null || role === "chat" ? onSpeechPreview : undefined;
      try {
        preview?.("");
        const res = await fetch(resolved.endpoint, {
          method: "POST",
          headers: chatCompletionHeaders(resolved),
          signal: abort.signal,
          body: JSON.stringify(
            { ...buildChatCompletionBody(resolved, messages, {
              maxTokens,
              temperature,
              think,
              role,
            }), ...(preview ? { stream: true } : {}) },
          ),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          const retry = res.headers.get("retry-after") || "";
          const retryMs = Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
          throw new LlmHttpError(res.status, Number.isFinite(retryMs) ? retryMs : 60000,
            isGroqCloudProvider(resolved.provider)
              ? `Groq HTTP ${res.status}: ${res.status === 401 ? "проверь API-ключ" : res.status === 400 || res.status === 404 ? "проверь модель и параметры запроса" : "сервис недоступен"}`
              : `LLM HTTP ${res.status}${errText ? `: ${errText.slice(0, 180)}` : ""}`);
        }
        const data: unknown = preview && res.body && res.headers.get("content-type")?.includes("text/event-stream")
          ? await readChatCompletionStream(res.body, abort.signal, preview)
          : await res.json();
        abort.signal.throwIfAborted();
        const content = extractChatContent(data);
        const split = splitThinkFromCompletion(data, content ?? "");
        if (!split.speech) {
          return split.think ? { text: "", think: split.think } : { text: "" };
        }
        return split.think
          ? { text: split.speech, think: split.think }
          : { text: split.speech };
      } catch (error) {
        if (!signal?.aborted) preview?.("");
        if (signal?.aborted) {
          if (error instanceof Error && error.name === "AbortError") throw error;
          throw new DOMException("Отменено", "AbortError");
        }
        if (abort.signal.aborted) {
          throw new LlmTimeoutError("Модель не ответила вовремя. Повтори запрос или выбери другую модель.");
        }
        throw error;
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
      ...DEFAULT_CHAT_SAMPLING,
      timeoutMs: opts.timeoutMs ?? DEFAULT_CHAT_SAMPLING.timeoutMs,
    },
    generationPreset: "balanced",
    roleModels: { ...DEFAULT_ROLE_MODELS },
    voiceExamples: true,
  });
}
