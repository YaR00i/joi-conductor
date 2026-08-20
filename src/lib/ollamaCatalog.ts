export type OllamaModelPreset = {
  id: string;
  hint: string;
};

/** Local chat picks that fit RTX 5070 12GB at Q4/Q5. */
export const OLLAMA_CHAT_PRESETS: readonly OllamaModelPreset[] = [
  { id: "qwen2.5:14b", hint: "12 ГБ · RU" },
  { id: "huihui_ai/qwen3-abliterated:14b", hint: "12 ГБ · без цензуры" },
  { id: "qwen3:14b", hint: "12 ГБ · думает" },
  { id: "gemma3:12b", hint: "12 ГБ · проза" },
  { id: "mistral-nemo", hint: "12 ГБ · RP" },
  { id: "qwen2.5:7b", hint: "лёгкая" },
];

export const OLLAMA_SESSION_PRESETS: readonly OllamaModelPreset[] = [
  { id: "llama3.2", hint: "сессия · крошечная" },
  { id: "llama3.1:8b", hint: "сессия · запас" },
];

export const OLLAMA_RECOMMENDED_PRESETS: readonly OllamaModelPreset[] = [
  ...OLLAMA_CHAT_PRESETS,
  ...OLLAMA_SESSION_PRESETS,
];

export function filterOllamaPresets(
  query: string,
  presets: readonly OllamaModelPreset[] = OLLAMA_RECOMMENDED_PRESETS,
): OllamaModelPreset[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...presets];
  return presets.filter(
    (p) =>
      p.id.toLowerCase().includes(q) || p.hint.toLowerCase().includes(q),
  );
}
