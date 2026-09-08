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

export function ollamaModelBase(name: string): string {
  const trimmed = name.trim();
  return trimmed.split(":")[0] ?? trimmed;
}

/** Exact tag, or short name vs `name:tag`. Different tags of the same family stay distinct. */
export function sameOllamaModel(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  if (!left || !right) return false;
  if (left === right) return true;
  return left.startsWith(`${right}:`) || right.startsWith(`${left}:`);
}

export function resolveInstalledOllamaName(
  want: string,
  installed: readonly string[],
): string | null {
  const needle = want.trim();
  if (!needle) return null;
  return installed.find((m) => sameOllamaModel(m, needle)) ?? null;
}

export function sortOllamaInstalled(models: readonly string[]): string[] {
  return [...models].sort((a, b) => a.localeCompare(b, "en"));
}

export function ollamaSelectOptions(
  current: string,
  installed: readonly string[],
): string[] {
  const sorted = sortOllamaInstalled(installed);
  const needle = current.trim();
  if (!needle) return sorted;
  if (resolveInstalledOllamaName(needle, sorted)) return sorted;
  return [needle, ...sorted];
}

export function recommendedOllamaNotInstalled(
  installed: readonly string[],
  presets: readonly OllamaModelPreset[] = OLLAMA_RECOMMENDED_PRESETS,
): OllamaModelPreset[] {
  return presets.filter((p) => !resolveInstalledOllamaName(p.id, installed));
}

export type OllamaRoleMark = "чат" | "роутер" | "разбор" | "планер" | "сессия";

export function ollamaRoleMarks(opts: {
  name: string;
  chat: string;
  router?: string;
  extractor?: string;
  planner?: string;
  session?: string;
}): OllamaRoleMark[] {
  const marks: OllamaRoleMark[] = [];
  if (opts.chat.trim() && sameOllamaModel(opts.name, opts.chat)) {
    marks.push("чат");
  }
  if (opts.router?.trim() && sameOllamaModel(opts.name, opts.router)) {
    marks.push("роутер");
  }
  if (opts.extractor?.trim() && sameOllamaModel(opts.name, opts.extractor)) {
    marks.push("разбор");
  }
  if (opts.planner?.trim() && sameOllamaModel(opts.name, opts.planner)) {
    marks.push("планер");
  }
  if (opts.session?.trim() && sameOllamaModel(opts.name, opts.session)) {
    marks.push("сессия");
  }
  return marks;
}
