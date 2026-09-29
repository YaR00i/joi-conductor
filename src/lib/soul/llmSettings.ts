/**
 * Chat LLM settings — independent from session Ollama (English JSON lines).
 * Defaults match Soul of Waifu `app/configuration/settings.json`.
 */

import {
  OLLAMA_CHAT_PRESETS,
  type OllamaModelPreset,
} from "../ollamaCatalog";

export const CHAT_LLM_STORAGE_KEY = "joi-chat-llm-v1";
export const CHAT_LLM_CHANGED_EVENT = "joi-chat-llm-changed";

export const CHAT_LLM_PROVIDERS = [
  "ollama",
  "groq_chat",
  "groq",
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

export const SOUL_MODEL_ROLES = ["chat", "router", "extractor", "planner"] as const;
export type SoulModelRole = (typeof SOUL_MODEL_ROLES)[number];

export const CHAT_GENERATION_PRESETS = [
  "stable",
  "balanced",
  "expressive",
] as const;
export type ChatGenerationPreset = (typeof CHAT_GENERATION_PRESETS)[number];

export type SoulRoleModels = {
  router: string;
  extractor: string;
  planner: string;
};

export type ChatLlmProviderKeys = Partial<Record<ChatLlmProvider, string>>;
export type ChatLlmProviderModels = Partial<Record<ChatLlmProvider, string>>;

export type ChatLlmSettings = {
  provider: ChatLlmProvider;
  model: string;
  endpoint: string;
  /** LM Studio / custom URL kept while other tabs are selected. */
  customEndpoint?: string;
  apiKey: string;
  /** Keys stay with their provider. Groq and Groq + Ollama share the `groq` slot. */
  providerKeys?: ChatLlmProviderKeys;
  /** Chat model id per provider. Groq flavors share the `groq` slot. */
  providerModels?: ChatLlmProviderModels;
  sampling: ChatLlmSampling;
  generationPreset?: ChatGenerationPreset;
  roleModels?: Partial<SoulRoleModels>;
  /** Program-first by default; model planning runs only after explicit acceptance. */
  sessionPlanner?: "program" | "model";
  voiceExamples?: boolean;
  turnDebug?: boolean;
  /** Explicit cloud conversation; empty means private/local. Rotated on entry. */
  groqConversationId?: string;
  groqLocalModel?: string;
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

export const CHAT_GENERATION_PRESET_SAMPLING: Record<
  ChatGenerationPreset,
  Omit<ChatLlmSampling, "timeoutMs" | "maxTokens">
> = {
  stable: {
    temperature: 0.58,
    topP: 0.8,
    minP: 0.06,
    topK: 40,
    frequencyPenalty: 0.5,
    presencePenalty: 0.2,
    repeatPenalty: 1.18,
  },
  balanced: {
    temperature: DEFAULT_CHAT_SAMPLING.temperature,
    topP: DEFAULT_CHAT_SAMPLING.topP,
    minP: DEFAULT_CHAT_SAMPLING.minP,
    topK: DEFAULT_CHAT_SAMPLING.topK,
    frequencyPenalty: DEFAULT_CHAT_SAMPLING.frequencyPenalty,
    presencePenalty: DEFAULT_CHAT_SAMPLING.presencePenalty,
    repeatPenalty: DEFAULT_CHAT_SAMPLING.repeatPenalty,
  },
  expressive: {
    temperature: 0.9,
    topP: 0.92,
    minP: 0.04,
    topK: 50,
    frequencyPenalty: 0.35,
    presencePenalty: 0.4,
    repeatPenalty: 1.12,
  },
};

export const ROUTER_ROLE_SAMPLING: ChatLlmSampling = {
  temperature: 0.15,
  topP: 0.8,
  minP: 0.05,
  topK: 20,
  maxTokens: 1400,
  frequencyPenalty: 0.15,
  presencePenalty: 0,
  repeatPenalty: 1.05,
  timeoutMs: DEFAULT_CHAT_SAMPLING.timeoutMs,
};

export const EXTRACTOR_ROLE_SAMPLING: ChatLlmSampling = {
  temperature: 0.05,
  topP: 0.7,
  minP: 0.02,
  topK: 20,
  maxTokens: 400,
  frequencyPenalty: 0,
  presencePenalty: 0,
  repeatPenalty: 1.05,
  timeoutMs: DEFAULT_CHAT_SAMPLING.timeoutMs,
};

export const PLANNER_ROLE_SAMPLING: ChatLlmSampling = {
  temperature: 0.1,
  topP: 0.75,
  minP: 0.03,
  topK: 20,
  maxTokens: 900,
  frequencyPenalty: 0,
  presencePenalty: 0,
  repeatPenalty: 1.05,
  timeoutMs: DEFAULT_CHAT_SAMPLING.timeoutMs,
};

export const DEFAULT_ROLE_MODELS: SoulRoleModels = {
  router: "",
  extractor: "",
  planner: "",
};

export const OPENROUTER_CHAT_URL =
  "https://openrouter.ai/api/v1/chat/completions";
export const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
export const CHAT_GROQ_PRESETS: readonly ChatModelPreset[] = [
  { id: "openai/gpt-oss-120b", hint: "Обычный разговор · основной" },
  { id: "openai/gpt-oss-20b", hint: "Быстрый ответ" },
];
export const CUSTOM_CHAT_URL_DEFAULT =
  "http://127.0.0.1:1234/v1/chat/completions";

export const DEFAULT_CHAT_LLM: ChatLlmSettings = {
  provider: "ollama",
  model: "",
  endpoint: "",
  apiKey: "",
  providerKeys: {},
  providerModels: {},
  customEndpoint: "",
  sampling: { ...DEFAULT_CHAT_SAMPLING },
  generationPreset: "balanced",
  roleModels: { ...DEFAULT_ROLE_MODELS },
  sessionPlanner: "program",
  voiceExamples: true,
  turnDebug: false,
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

export function chatGenerationPresetLabelRu(preset: ChatGenerationPreset): string {
  switch (preset) {
    case "stable":
      return "Спокойный";
    case "balanced":
      return "Сбалансированный";
    case "expressive":
      return "Выразительный";
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}

export function isChatGenerationPreset(v: unknown): v is ChatGenerationPreset {
  return (
    typeof v === "string" &&
    (CHAT_GENERATION_PRESETS as readonly string[]).includes(v)
  );
}

export function applyChatGenerationPreset(
  settings: ChatLlmSettings,
  preset: ChatGenerationPreset,
): ChatLlmSettings {
  const base = CHAT_GENERATION_PRESET_SAMPLING[preset];
  return {
    ...settings,
    generationPreset: preset,
    sampling: {
      ...settings.sampling,
      ...base,
    },
  };
}

export function chatLlmProviderLabelRu(provider: ChatLlmProvider): string {
  switch (provider) {
    case "ollama":
      return "Ollama";
    case "groq_chat":
      return "Groq";
    case "groq":
      return "Groq + Ollama";
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
    case "groq_chat":
    case "groq":
      return CHAT_GROQ_PRESETS;
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
    case "groq_chat":
    case "groq":
      return GROQ_CHAT_URL;
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

function sanitizeRoleModels(raw: Partial<SoulRoleModels> | undefined): SoulRoleModels {
  return {
    router: typeof raw?.router === "string" ? raw.router.trim() : "",
    extractor: typeof raw?.extractor === "string" ? raw.extractor.trim() : "",
    planner: typeof raw?.planner === "string" ? raw.planner.trim() : "",
  };
}

const CHAT_API_KEY_MAX = 500;
const CHAT_MODEL_ID_MAX = 200;

/** Groq and Groq + Ollama share one Groq Console key. */
export function chatApiKeySlot(provider: ChatLlmProvider): ChatLlmProvider {
  switch (provider) {
    case "groq_chat":
      return "groq";
    case "groq":
    case "ollama":
    case "openrouter":
    case "openai":
    case "custom":
      return provider;
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

function clipChatApiKey(value: string): string {
  return value.trim().slice(0, CHAT_API_KEY_MAX);
}

export function sanitizeProviderKeys(raw: unknown): ChatLlmProviderKeys {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const rec = raw as Record<string, unknown>;
  const out: ChatLlmProviderKeys = {};
  for (const provider of CHAT_LLM_PROVIDERS) {
    const value = rec[provider];
    if (typeof value !== "string") continue;
    const trimmed = clipChatApiKey(value);
    if (!trimmed) continue;
    out[chatApiKeySlot(provider)] = trimmed;
  }
  return out;
}

export function rememberChatApiKey(
  settings: Pick<ChatLlmSettings, "provider" | "apiKey" | "providerKeys">,
): ChatLlmProviderKeys {
  const keys = sanitizeProviderKeys(settings.providerKeys);
  const current = clipChatApiKey(settings.apiKey);
  if (settings.provider === "ollama" && looksLikeGroqApiKey(current)) {
    if (!keys.groq) keys.groq = current;
    delete keys.ollama;
    return keys;
  }
  const slot = chatApiKeySlot(settings.provider);
  if (current) keys[slot] = current;
  else delete keys[slot];
  return keys;
}

function looksLikeGroqApiKey(key: string): boolean {
  return key.startsWith("gsk_");
}

export function hydrateChatLlmKeys(
  provider: ChatLlmProvider,
  apiKey: string,
  rawKeys: unknown,
): { apiKey: string; providerKeys: ChatLlmProviderKeys } {
  const providerKeys = sanitizeProviderKeys(rawKeys);
  if (
    typeof providerKeys.ollama === "string" &&
    looksLikeGroqApiKey(providerKeys.ollama)
  ) {
    if (!providerKeys.groq) providerKeys.groq = providerKeys.ollama;
    delete providerKeys.ollama;
  }
  const trimmed = clipChatApiKey(apiKey);
  const slot = chatApiKeySlot(provider);
  if (trimmed) {
    if (provider === "ollama" && looksLikeGroqApiKey(trimmed)) {
      if (!providerKeys.groq) providerKeys.groq = trimmed;
    } else {
      providerKeys[slot] = trimmed;
    }
  }
  return { providerKeys, apiKey: providerKeys[slot] ?? "" };
}

function clipChatModel(value: string): string {
  return value.trim().slice(0, CHAT_MODEL_ID_MAX);
}

export function sanitizeProviderModels(raw: unknown): ChatLlmProviderModels {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const rec = raw as Record<string, unknown>;
  const out: ChatLlmProviderModels = {};
  for (const provider of CHAT_LLM_PROVIDERS) {
    const value = rec[provider];
    if (typeof value !== "string") continue;
    const trimmed = clipChatModel(value);
    if (!trimmed) continue;
    out[chatApiKeySlot(provider)] = trimmed;
  }
  return out;
}

export function rememberChatModel(
  settings: Pick<ChatLlmSettings, "provider" | "model" | "providerModels">,
): ChatLlmProviderModels {
  const models = sanitizeProviderModels(settings.providerModels);
  const slot = chatApiKeySlot(settings.provider);
  const current = clipChatModel(settings.model);
  if (current) models[slot] = current;
  else delete models[slot];
  return models;
}

export function hydrateChatLlmModels(
  provider: ChatLlmProvider,
  model: string,
  rawModels: unknown,
): { model: string; providerModels: ChatLlmProviderModels } {
  const providerModels = sanitizeProviderModels(rawModels);
  const trimmed = clipChatModel(model);
  const slot = chatApiKeySlot(provider);
  if (trimmed) providerModels[slot] = trimmed;
  return { providerModels, model: providerModels[slot] ?? "" };
}

export function rememberCustomEndpoint(
  settings: Pick<ChatLlmSettings, "provider" | "endpoint" | "customEndpoint">,
): string {
  if (settings.provider === "custom") return settings.endpoint.trim();
  return (settings.customEndpoint ?? "").trim();
}

export function persistableChatLlm(next: ChatLlmSettings): ChatLlmSettings {
  const providerKeys = rememberChatApiKey(next);
  const providerModels = rememberChatModel(next);
  const apiKey = clipChatApiKey(next.apiKey);
  const customEndpoint = rememberCustomEndpoint(next);
  return {
    ...next,
    apiKey:
      next.provider === "ollama" && looksLikeGroqApiKey(apiKey) ? "" : apiKey,
    providerKeys,
    providerModels,
    customEndpoint,
    endpoint: next.provider === "custom" ? customEndpoint : next.endpoint,
  };
}

export function withChatApiKey(
  settings: ChatLlmSettings,
  apiKey: string,
): ChatLlmSettings {
  return persistableChatLlm({ ...settings, apiKey });
}

export function settingsAfterProviderSwitch(
  settings: ChatLlmSettings,
  to: ChatLlmProvider,
): ChatLlmSettings {
  const providerKeys = rememberChatApiKey(settings);
  const providerModels = rememberChatModel(settings);
  const customEndpoint = rememberCustomEndpoint(settings);
  return {
    ...settings,
    provider: to,
    providerKeys,
    providerModels,
    customEndpoint,
    apiKey: providerKeys[chatApiKeySlot(to)] ?? "",
    model: providerModels[chatApiKeySlot(to)] ?? "",
    endpoint: to === "custom" ? customEndpoint : "",
  };
}

export function localChatModelOf(settings: ChatLlmSettings): string {
  switch (settings.provider) {
    case "ollama":
      return settings.model.trim();
    case "groq":
      return (settings.groqLocalModel ?? "").trim();
    case "groq_chat":
    case "openrouter":
    case "openai":
    case "custom":
      return (settings.providerModels?.ollama ?? "").trim();
    default: {
      const _exhaustive: never = settings.provider;
      return _exhaustive;
    }
  }
}

export function assignLocalChatModel(
  settings: ChatLlmSettings,
  name: string,
): ChatLlmSettings {
  const trimmed = clipChatModel(name);
  const providerModels = {
    ...rememberChatModel(settings),
    ...(trimmed ? { ollama: trimmed } : {}),
  };
  if (!trimmed) delete providerModels.ollama;
  switch (settings.provider) {
    case "ollama":
      return persistableChatLlm({ ...settings, model: trimmed, providerModels });
    case "groq":
      return persistableChatLlm({
        ...settings,
        groqLocalModel: trimmed,
        providerModels,
      });
    case "groq_chat":
    case "openrouter":
    case "openai":
    case "custom":
      return persistableChatLlm({ ...settings, providerModels });
    default: {
      const _exhaustive: never = settings.provider;
      return _exhaustive;
    }
  }
}

export function emptyChatLlmSettings(): ChatLlmSettings {
  return {
    ...DEFAULT_CHAT_LLM,
    sampling: { ...DEFAULT_CHAT_SAMPLING },
    roleModels: { ...DEFAULT_ROLE_MODELS },
    providerKeys: {},
    providerModels: {},
    customEndpoint: "",
  };
}

export function loadChatLlmSettings(): ChatLlmSettings {
  try {
    const raw = localStorage.getItem(CHAT_LLM_STORAGE_KEY);
    if (!raw) return emptyChatLlmSettings();
    const parsed = JSON.parse(raw) as Partial<ChatLlmSettings>;
    const provider = isChatLlmProvider(parsed.provider)
      ? parsed.provider
      : "ollama";
    const keys = hydrateChatLlmKeys(
      provider,
      typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      parsed.providerKeys,
    );
    const models = hydrateChatLlmModels(
      provider,
      typeof parsed.model === "string" ? parsed.model : "",
      parsed.providerModels,
    );
    const customEndpoint =
      typeof parsed.customEndpoint === "string"
        ? parsed.customEndpoint.trim()
        : "";
    const endpoint =
      typeof parsed.endpoint === "string" ? parsed.endpoint.trim() : "";
    return {
      provider,
      model: models.model,
      endpoint,
      customEndpoint:
        provider === "custom" ? endpoint || customEndpoint : customEndpoint,
      apiKey: keys.apiKey,
      providerKeys: keys.providerKeys,
      providerModels: models.providerModels,
      sampling: sanitizeChatSampling(parsed.sampling),
      generationPreset: isChatGenerationPreset(parsed.generationPreset)
        ? parsed.generationPreset
        : "balanced",
      roleModels: sanitizeRoleModels(parsed.roleModels),
      sessionPlanner: parsed.sessionPlanner === "model" ? "model" : "program",
      voiceExamples: parsed.voiceExamples !== false,
      turnDebug: parsed.turnDebug === true,
      groqConversationId: typeof parsed.groqConversationId === "string" ? parsed.groqConversationId.slice(0, 100) : "",
      groqLocalModel: typeof parsed.groqLocalModel === "string" ? parsed.groqLocalModel.trim() : "",
    };
  } catch {
    return emptyChatLlmSettings();
  }
}

export function notifyChatLlmChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHAT_LLM_CHANGED_EVENT));
}

export function saveChatLlmSettings(next: ChatLlmSettings): ChatLlmSettings {
  const stored = persistableChatLlm(next);
  try {
    localStorage.setItem(CHAT_LLM_STORAGE_KEY, JSON.stringify(stored));
    notifyChatLlmChanged();
  } catch {
    /* quota */
  }
  return stored;
}

export type ResolvedChatLlm = {
  localFallback?: ResolvedChatLlm;
  provider: ChatLlmProvider;
  model: string;
  endpoint: string;
  apiKey: string;
  sampling: ChatLlmSampling;
  generationPreset?: ChatGenerationPreset;
  roleModels?: SoulRoleModels;
  sessionPlanner?: "program" | "model";
  voiceExamples?: boolean;
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
    apiKey:
      chat.apiKey.trim() ||
      clipChatApiKey(chat.providerKeys?.[chatApiKeySlot(chat.provider)] ?? ""),
    sampling,
    generationPreset: isChatGenerationPreset(chat.generationPreset)
      ? chat.generationPreset
      : "balanced",
    roleModels: sanitizeRoleModels(chat.roleModels),
    sessionPlanner: chat.sessionPlanner === "model" ? "model" : "program",
    voiceExamples: chat.voiceExamples !== false,
    ...(chat.provider === "groq" ? {
      localFallback: resolveChatLlm({
        ...chat, provider: "ollama", model: chat.groqLocalModel || "",
        endpoint: "", apiKey: "", providerKeys: {},
      }, voice),
    } : {}),
  };
}

export function modelForRole(
  resolved: Pick<ResolvedChatLlm, "model" | "roleModels">,
  role: SoulModelRole,
): string {
  switch (role) {
    case "chat":
      return resolved.model;
    case "router":
      return resolved.roleModels?.router?.trim() || resolved.model;
    case "extractor":
      return resolved.roleModels?.extractor?.trim() || resolved.model;
    case "planner":
      return resolved.roleModels?.planner?.trim() || resolved.model;
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export function samplingForRole(
  resolved: Pick<ResolvedChatLlm, "sampling">,
  role: SoulModelRole,
): ChatLlmSampling {
  switch (role) {
    case "chat":
      return resolved.sampling;
    case "router":
      return {
        ...ROUTER_ROLE_SAMPLING,
        timeoutMs: resolved.sampling.timeoutMs,
      };
    case "extractor":
      return {
        ...EXTRACTOR_ROLE_SAMPLING,
        timeoutMs: resolved.sampling.timeoutMs,
      };
    case "planner":
      return {
        ...PLANNER_ROLE_SAMPLING,
        timeoutMs: resolved.sampling.timeoutMs,
      };
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export function chatProviderNeedsKey(provider: ChatLlmProvider): boolean {
  switch (provider) {
    case "groq_chat":
    case "groq":
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

export function chatProviderShowsKeyField(provider: ChatLlmProvider): boolean {
  switch (provider) {
    case "openrouter":
    case "openai":
    case "custom":
      return true;
    case "groq_chat":
    case "groq":
    case "ollama":
      return false;
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

/** Cloud Groq flavors share one key; hybrid still owns the local fallback. */
export function isGroqCloudProvider(provider: ChatLlmProvider): boolean {
  switch (provider) {
    case "groq_chat":
    case "groq":
      return true;
    case "ollama":
    case "openrouter":
    case "openai":
    case "custom":
      return false;
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

export function isGroqHybridProvider(provider: ChatLlmProvider): boolean {
  return provider === "groq";
}

export function chatProviderUsesOllama(provider: ChatLlmProvider): boolean {
  switch (provider) {
    case "ollama":
    case "groq":
      return true;
    case "groq_chat":
    case "openrouter":
    case "openai":
    case "custom":
      return false;
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

export function chatCloudConversationId(
  chat: Pick<ChatLlmSettings, "provider" | "groqConversationId">,
): string | undefined {
  switch (chat.provider) {
    case "groq_chat":
    case "groq":
      return chat.groqConversationId?.trim() || undefined;
    case "ollama":
    case "openrouter":
    case "openai":
    case "custom":
      return undefined;
    default: {
      const _exhaustive: never = chat.provider;
      return _exhaustive;
    }
  }
}

/** Visible key after a tab switch. Other providers stay in `providerKeys`. */
export function apiKeyAfterProviderSwitch(
  from: ChatLlmProvider,
  to: ChatLlmProvider,
  apiKey: string,
  providerKeys?: ChatLlmProviderKeys,
): string {
  return settingsAfterProviderSwitch(
    { ...emptyChatLlmSettings(), provider: from, apiKey, providerKeys },
    to,
  ).apiKey;
}

export type ChatCompletionJsonFormat = {
  type: "json_object";
};

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
  response_format?: ChatCompletionJsonFormat;
  options?: Record<string, number | boolean>;
  reasoning_effort?: "low";
};

export type ChatCompletionOverride = {
  maxTokens?: number;
  temperature?: number;
  think?: boolean;
  role?: SoulModelRole;
};

export function buildChatCompletionBody(
  resolved: ResolvedChatLlm,
  messages: Array<{ role: string; content: string }>,
  override?: ChatCompletionOverride,
): ChatCompletionBody {
  const role = override?.role ?? "chat";
  const sampling = samplingForRole(resolved, role);
  const temperature = override?.temperature ?? sampling.temperature;
  const think = role === "chat" ? Boolean(override?.think) : false;
  const maxTokens = override?.maxTokens ?? sampling.maxTokens;
  const body: ChatCompletionBody = {
    model: modelForRole(resolved, role),
    temperature,
    top_p: sampling.topP,
    max_tokens: maxTokens,
    frequency_penalty: think
      ? Math.max(sampling.frequencyPenalty, 0.55)
      : sampling.frequencyPenalty,
    presence_penalty: sampling.presencePenalty,
    messages,
    stop: ["<|im_end|>", "<|endoftext|>"],
  };
  if (think) body.think = true;
  if (isGroqCloudProvider(resolved.provider)) {
    delete body.think;
    delete body.stop;
    if (resolved.model.startsWith("openai/gpt-oss-")) body.reasoning_effort = "low";
  }
  if (resolved.provider === "ollama") {
    if (!think) body.think = false;
    body.options = {
      temperature,
      top_p: sampling.topP,
      min_p: sampling.minP,
      top_k: sampling.topK,
      repeat_penalty: think
        ? Math.max(sampling.repeatPenalty, 1.22)
        : sampling.repeatPenalty,
      num_predict: maxTokens,
    };
    if (role === "router" || role === "extractor" || role === "planner") {
      body.response_format = { type: "json_object" };
    }
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

/** Pull <think> / leftover </think> dumps. Speech is stripThinkBlocks(raw). */
export function splitThinkFromRaw(raw: string): { think: string; speech: string } {
  const text = String(raw ?? "");
  const blocks: string[] = [];
  const re = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi;
  let tagged = text;
  tagged = tagged.replace(re, (_whole, inner: string) => {
    const bit = String(inner ?? "").trim();
    if (bit) blocks.push(bit);
    return "\n";
  });
  const close = tagged.lastIndexOf("</think>");
  if (close >= 0 && !/<think(?:ing)?>/i.test(tagged.slice(0, close))) {
    const lead = tagged
      .slice(0, close)
      .replace(/<\/?think(?:ing)?>/gi, "")
      .trim();
    if (lead) blocks.push(lead);
  }
  const openUnclosed = tagged.search(/<think(?:ing)?>/i);
  if (openUnclosed >= 0) {
    const inner = tagged
      .slice(openUnclosed)
      .replace(/<think(?:ing)?>/i, "")
      .replace(/<\/think(?:ing)?>/gi, "")
      .trim();
    if (inner) blocks.push(inner);
  }
  return {
    think: blocks.join("\n\n").trim(),
    speech: stripThinkBlocks(text),
  };
}

function stringFromUnknown(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "content" in value) {
    const inner = (value as { content?: unknown }).content;
    if (typeof inner === "string") return inner.trim();
  }
  return "";
}

function isThinkPartType(type: string): boolean {
  return /^(thinking|reasoning|reason)$/i.test(type);
}

function contentPartText(part: Record<string, unknown>): string {
  for (const key of ["text", "thinking", "reasoning", "content"]) {
    const value = part[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function uniqueJoin(parts: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const bit = part.trim();
    if (!bit || seen.has(bit)) continue;
    seen.add(bit);
    out.push(bit);
  }
  return out.join("\n\n").trim();
}

/** Cut Qwen/Ollama loops that paste the same 2–4 sentences until max_tokens. */
export function collapseRepeatedSpeech(raw: string): string {
  const text = String(raw ?? "").trim();
  if (text.length < 80) return text;
  const sentences = text
    .split(/(?<=[.!?…])(?:\s+|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length >= 6) {
    const maxCycle = Math.min(8, Math.floor(sentences.length / 3));
    for (let n = 1; n <= maxCycle; n++) {
      const unit = sentences.slice(0, n);
      const key = unit.join(" ").replace(/\s+/g, " ");
      let repeats = 0;
      let i = 0;
      while (i + n <= sentences.length) {
        const chunk = sentences.slice(i, i + n).join(" ").replace(/\s+/g, " ");
        if (chunk !== key) break;
        repeats += 1;
        i += n;
      }
      if (repeats >= 3 && i >= sentences.length * 0.65) {
        return unit.join(" ");
      }
    }
  }
  return text;
}

export function clipSpokenReply(raw: string, maxChars = 900): string {
  const collapsed = collapseRepeatedSpeech(raw);
  if (collapsed.length <= maxChars) return collapsed;
  const cut = collapsed.slice(0, maxChars);
  const last = Math.max(
    cut.lastIndexOf("."),
    cut.lastIndexOf("!"),
    cut.lastIndexOf("?"),
    cut.lastIndexOf("…"),
  );
  return (last >= 60 ? cut.slice(0, last + 1) : cut).trim();
}

function harvestMessage(message: Record<string, unknown>): {
  think: string[];
  speech: string[];
} {
  const think: string[] = [];
  const speech: string[] = [];
  const field = uniqueJoin(
    ["reasoning_content", "reasoning", "thinking", "think"].map((key) =>
      stringFromUnknown(message[key]),
    ),
  );
  if (field) think.push(field);
  const content = message.content;
  if (typeof content === "string") {
    const tagged = splitThinkFromRaw(content);
    if (tagged.think) think.push(tagged.think);
    if (tagged.speech) speech.push(tagged.speech);
    return { think, speech };
  }
  if (Array.isArray(content)) {
    for (const item of content) {
      if (typeof item === "string") {
        const tagged = splitThinkFromRaw(item);
        if (tagged.think) think.push(tagged.think);
        if (tagged.speech) speech.push(tagged.speech);
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const part = item as Record<string, unknown>;
      const type = typeof part.type === "string" ? part.type : "";
      const bit = contentPartText(part);
      if (!bit) continue;
      if (isThinkPartType(type)) think.push(bit);
      else {
        const tagged = splitThinkFromRaw(bit);
        if (tagged.think) think.push(tagged.think);
        if (tagged.speech) speech.push(tagged.speech);
      }
    }
  }
  return { think, speech };
}

export function harvestChatCompletion(data: unknown): {
  think: string;
  speech: string;
} {
  const thinkBits: string[] = [];
  const speechBits: string[] = [];
  if (data && typeof data === "object") {
    const rec = data as Record<string, unknown>;
    if (rec.message && typeof rec.message === "object") {
      const harvested = harvestMessage(rec.message as Record<string, unknown>);
      thinkBits.push(...harvested.think);
      speechBits.push(...harvested.speech);
    }
    const choices = rec.choices;
    if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
      const message = (choices[0] as { message?: unknown }).message;
      if (message && typeof message === "object") {
        const harvested = harvestMessage(message as Record<string, unknown>);
        thinkBits.push(...harvested.think);
        speechBits.push(...harvested.speech);
      }
    }
  }
  const think = collapseRepeatedSpeech(uniqueJoin(thinkBits));
  const speech = clipSpokenReply(uniqueJoin(speechBits));
  return { think, speech };
}

export function splitThinkFromCompletion(data: unknown, content: string): {
  think: string;
  speech: string;
} {
  const fromPayload = harvestChatCompletion(data);
  if (fromPayload.speech || fromPayload.think) return fromPayload;
  const tagged = splitThinkFromRaw(content);
  return {
    think: collapseRepeatedSpeech(tagged.think),
    speech: clipSpokenReply(tagged.speech),
  };
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
