/**
 * Chat LLM settings — independent from session Ollama (English JSON lines).
 * Defaults match Soul of Waifu `app/configuration/settings.json`.
 */

import {
  OLLAMA_CHAT_PRESETS,
  type OllamaModelPreset,
} from "../ollamaCatalog";

export const CHAT_LLM_STORAGE_KEY = "joi-chat-llm-v1";

export const CHAT_LLM_PROVIDERS = [
  "ollama",
  "openrouter",
  "openai",
  "custom",
] as const;

export type ChatLlmProvider = (typeof CHAT_LLM_PROVIDERS)[number];

export type ChatLlmSampling = {
  temperature: number;
  topP: number;
  minP: number;
  topK: number;
  maxTokens: number;
  frequencyPenalty: number;
  presencePenalty: number;
  repeatPenalty: number;
  timeoutMs: number;
};

export type ChatLlmSettings = {
  provider: ChatLlmProvider;
  model: string;
  endpoint: string;
  apiKey: string;
  sampling: ChatLlmSampling;
};

/** SoW main_settings: temperature 0.8, top_p 0.7, max_tokens 1000, min_p 0.07, freq 0.4, presence 0.3. */
export const DEFAULT_CHAT_SAMPLING: ChatLlmSampling = {
  temperature: 0.8,
  topP: 0.7,
  minP: 0.07,
  topK: 40,
  maxTokens: 1000,
  frequencyPenalty: 0.4,
  presencePenalty: 0.3,
  repeatPenalty: 1.1,
  timeoutMs: 90000,
};

export const OPENROUTER_CHAT_URL =
  "https://openrouter.ai/api/v1/chat/completions";
export const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
export const CUSTOM_CHAT_URL_DEFAULT =
  "http://127.0.0.1:1234/v1/chat/completions";

export const DEFAULT_CHAT_LLM: ChatLlmSettings = {
  provider: "ollama",
  model: "",
  endpoint: "",
  apiKey: "",
  sampling: { ...DEFAULT_CHAT_SAMPLING },
};

export type ChatModelPreset = OllamaModelPreset;

export const CHAT_OLLAMA_PRESETS: readonly ChatModelPreset[] =
  OLLAMA_CHAT_PRESETS;

/** SoW openrouter_model plus a couple of stable cloud picks. */
export const CHAT_OPENROUTER_PRESETS: readonly ChatModelPreset[] = [
  { id: "google/gemma-4-26b-a4b-it:free", hint: "SoW · free" },
  { id: "deepseek/deepseek-chat", hint: "дешево" },
  { id: "qwen/qwen3-235b-a22b:free", hint: "free · RU" },
  { id: "anthropic/claude-sonnet-4", hint: "облако" },
];

export const CHAT_OPENAI_PRESETS: readonly ChatModelPreset[] = [
  { id: "gpt-4.1-mini", hint: "быстрая" },
  { id: "gpt-4o-mini", hint: "дешевле" },
];

export function chatLlmProviderLabelRu(provider: ChatLlmProvider): string {
  switch (provider) {
    case "ollama":
      return "Ollama";
    case "openrouter":
      return "OpenRouter";
    case "openai":
      return "OpenAI";
    case "custom":
      return "Свой";
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

export function isChatLlmProvider(v: unknown): v is ChatLlmProvider {
  return (
    typeof v === "string" &&
    (CHAT_LLM_PROVIDERS as readonly string[]).includes(v)
  );
}

export function chatPresetsFor(
  provider: ChatLlmProvider,
): readonly ChatModelPreset[] {
  switch (provider) {
    case "ollama":
      return CHAT_OLLAMA_PRESETS;
    case "openrouter":
      return CHAT_OPENROUTER_PRESETS;
    case "openai":
      return CHAT_OPENAI_PRESETS;
    case "custom":
      return [];
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

export function endpointForProvider(
  provider: ChatLlmProvider,
  customEndpoint: string,
  ollamaFallback: string,
): string {
  switch (provider) {
    case "ollama":
      return customEndpoint.trim() || ollamaFallback;
    case "openrouter":
      return OPENROUTER_CHAT_URL;
    case "openai":
      return OPENAI_CHAT_URL;
    case "custom":
      return customEndpoint.trim() || CUSTOM_CHAT_URL_DEFAULT;
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeChatSampling(
  raw: Partial<ChatLlmSampling> | undefined,
): ChatLlmSampling {
  const s = raw ?? {};
  return {
    temperature: clamp(s.temperature ?? DEFAULT_CHAT_SAMPLING.temperature, 0, 2),
    topP: clamp(s.topP ?? DEFAULT_CHAT_SAMPLING.topP, 0.05, 1),
    minP: clamp(s.minP ?? DEFAULT_CHAT_SAMPLING.minP, 0, 0.5),
    topK: Math.round(clamp(s.topK ?? DEFAULT_CHAT_SAMPLING.topK, 0, 200)),
    maxTokens: Math.round(
      clamp(s.maxTokens ?? DEFAULT_CHAT_SAMPLING.maxTokens, 64, 4096),
    ),
    frequencyPenalty: clamp(
      s.frequencyPenalty ?? DEFAULT_CHAT_SAMPLING.frequencyPenalty,
      -2,
      2,
    ),
    presencePenalty: clamp(
      s.presencePenalty ?? DEFAULT_CHAT_SAMPLING.presencePenalty,
      -2,
      2,
    ),
    repeatPenalty: clamp(
      s.repeatPenalty ?? DEFAULT_CHAT_SAMPLING.repeatPenalty,
      0.8,
      2,
    ),
    timeoutMs: Math.round(
      clamp(s.timeoutMs ?? DEFAULT_CHAT_SAMPLING.timeoutMs, 5000, 180000),
    ),
  };
}

export function loadChatLlmSettings(): ChatLlmSettings {
  try {
    const raw = localStorage.getItem(CHAT_LLM_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CHAT_LLM, sampling: { ...DEFAULT_CHAT_SAMPLING } };
    const parsed = JSON.parse(raw) as Partial<ChatLlmSettings>;
    const provider = isChatLlmProvider(parsed.provider)
      ? parsed.provider
      : "ollama";
    return {
      provider,
      model: typeof parsed.model === "string" ? parsed.model : "",
      endpoint: typeof parsed.endpoint === "string" ? parsed.endpoint : "",
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      sampling: sanitizeChatSampling(parsed.sampling),
    };
  } catch {
    return { ...DEFAULT_CHAT_LLM, sampling: { ...DEFAULT_CHAT_SAMPLING } };
  }
}

export function saveChatLlmSettings(next: ChatLlmSettings): void {
  try {
    localStorage.setItem(CHAT_LLM_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
}

export type ResolvedChatLlm = {
  provider: ChatLlmProvider;
  model: string;
  endpoint: string;
  apiKey: string;
  sampling: ChatLlmSampling;
};

export function resolveChatLlm(
  chat: ChatLlmSettings,
  voice: { endpoint: string; model: string },
): ResolvedChatLlm {
  const sampling = sanitizeChatSampling(chat.sampling);
  const endpoint = endpointForProvider(
    chat.provider,
    chat.endpoint,
    voice.endpoint,
  );
  const fallbackModel =
    chat.provider === "ollama"
      ? voice.model
      : chatPresetsFor(chat.provider)[0]?.id ?? "";
  return {
    provider: chat.provider,
    model: chat.model.trim() || fallbackModel,
    endpoint,
    apiKey: chat.apiKey.trim(),
    sampling,
  };
}

export function chatProviderNeedsKey(provider: ChatLlmProvider): boolean {
  switch (provider) {
    case "openrouter":
    case "openai":
      return true;
    case "ollama":
      return false;
    case "custom":
      return false;
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

export type ChatCompletionBody = {
  model: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  frequency_penalty: number;
  presence_penalty: number;
  messages: Array<{ role: string; content: string }>;
  stop?: string[];
  think?: boolean;
  options?: Record<string, number | boolean>;
};

export function buildChatCompletionBody(
  resolved: ResolvedChatLlm,
  messages: Array<{ role: string; content: string }>,
  override?: { maxTokens?: number; temperature?: number },
): ChatCompletionBody {
  const sampling = resolved.sampling;
  const temperature = override?.temperature ?? sampling.temperature;
  const maxTokens = override?.maxTokens ?? sampling.maxTokens;
  const body: ChatCompletionBody = {
    model: resolved.model,
    temperature,
    top_p: sampling.topP,
    max_tokens: maxTokens,
    frequency_penalty: sampling.frequencyPenalty,
    presence_penalty: sampling.presencePenalty,
    messages,
    stop: ["<|im_end|>"],
  };
  if (resolved.provider === "ollama") {
    // Qwen3 / R1 default to a visible chain-of-thought. Chat must not show it.
    body.think = false;
    body.options = {
      temperature,
      top_p: sampling.topP,
      min_p: sampling.minP,
      top_k: sampling.topK,
      repeat_penalty: sampling.repeatPenalty,
      num_predict: maxTokens,
    };
  }
  return body;
}

const INSTRUCTION_CJK =
  /设定|保持角色|简洁|示例|指令|系统提示|扮演|不要输出|自然一点/;

function cjkRatio(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return cjk / Math.max(text.replace(/\s/g, "").length, 1);
}

function looksLikeLeakedInstruction(block: string): boolean {
  const t = block.trim();
  if (!t) return true;
  if (/^示例[:：]/m.test(t) || /^examples?[:：]/im.test(t)) return true;
  if (/<\/?think/i.test(t) || /<\/?thinking/i.test(t)) return true;
  if (INSTRUCTION_CJK.test(t) && cjkRatio(t) > 0.2) return true;
  if (
    /do not output json/i.test(t) &&
    /stay in character|reply in the user/i.test(t)
  ) {
    return true;
  }
  if (/^voice guide:/im.test(t) && /taboos?:/im.test(t)) return true;
  return false;
}

function looksLikeTaskPreamble(sentence: string): boolean {
  const t = sentence.trim();
  if (!t) return true;
  if (looksLikeLeakedInstruction(t)) return true;
  if (t.length <= 3 && /[\u4e00-\u9fff]/.test(t)) return true;
  if (
    /^(?:[\u4e00-\u9fff]+\s+)?(okay|alright|sure|hmm|wait)[,.]?\s+(let'?s|I need|so )/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\bI need to (write|create|generate|make)\b/i.test(t)) return true;
  if (
    /\b(private )?diary entry\b/i.test(t) &&
    /\b(write|need|should|latest chat)\b/i.test(t)
  ) {
    return true;
  }
  if (/\bthe user is third person\b/i.test(t)) return true;
  if (/\bfirst person(,| so) (as her|so she)/i.test(t)) return true;
  if (/\b4\s*[-–to]+\s*6 sentences\b/i.test(t)) return true;
  if (/\bno quotation marks\b/i.test(t)) return true;
  if (/\bno asterisks, no roleplay\b/i.test(t)) return true;
  if (/\breply with the (diary|file) (text|body) only\b/i.test(t)) return true;
  if (/\bdo not mention the JOI\b/i.test(t)) return true;
  if (/\bhis name if known\b/i.test(t)) return true;
  if (/\bshe calls him\b/i.test(t) && /\bthe user'?s name\b/i.test(t)) {
    return true;
  }
  return false;
}

function stripTaskPreamble(text: string): string {
  const strippedLead = text.replace(/^[\u4e00-\u9fff]{1,8}\s+/, "");
  const sentences = strippedLead.split(/(?<=[.!?…])(?:\s+|$)|(?<=\n)/);
  const kept = sentences.map((s) => s.trim()).filter((s) => !looksLikeTaskPreamble(s));
  if (kept.length === 0) return "";
  return kept.join(" ").replace(/[ \t]+\n/g, "\n").replace(/\s{2,}/g, " ").trim();
}

/** Drop CoT, prompt echoes, and Chinese instruction recaps. Keep the spoken line. */
export function stripThinkBlocks(raw: string): string {
  let text = String(raw ?? "");
  text = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  const close = text.lastIndexOf("</think>");
  if (close >= 0) {
    text = text.slice(close + "</think>".length);
  }
  const openThink = text.search(/<think(?:ing)?>/i);
  if (openThink >= 0) {
    text = text.slice(0, openThink);
  }
  const chunks = text
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter((c) => c && !looksLikeLeakedInstruction(c));
  text = (chunks.length > 0 ? chunks.join("\n\n") : text)
    .replace(/^\s*示例[:：][^\n]*\n?/gm, "")
    .replace(/^\s*examples?[:：][^\n]*\n?/gim, "")
    .replace(/<\/?think(?:ing)?>/gi, "")
    .trim();
  return stripTaskPreamble(text);
}

export function chatCompletionHeaders(
  resolved: ResolvedChatLlm,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (resolved.apiKey) {
    headers.Authorization = `Bearer ${resolved.apiKey}`;
  }
  if (resolved.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/YaR00i/joi-conductor";
    headers["X-Title"] = "JOI Conductor";
  }
  return headers;
}
