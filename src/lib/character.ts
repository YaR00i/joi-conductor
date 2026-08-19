import bibleData from "../../data/character/hu-tao.json";

export interface CharacterBible {
  id: string;
  nameRu: string;
  locale: string;
  tone: string[];
  taboo: string[];
  diminutives: string[];
  emojiAllowed: boolean;
  systemPrompt: string;
  /**
   * Short writing recipe injected into the LLM user turn.
   * Reinforces per-mistress voice beyond the system prompt.
   */
  llmVoiceGuide?: string;
  fallbackLines: Record<string, string[]>;
}

/** Interpolate `{cost}` / `{reward}` placeholders in bible fallback lines. */
export function formatFallbackLine(
  template: string,
  vars: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value == null ? match : String(value);
  });
}

/** Phase 2 character pack — Hu Tao bible for TemplateVoice / LocalLlmVoice. */
export const huTaoBible = bibleData as CharacterBible;

export function pickFallbackLine(
  bible: CharacterBible,
  key: string,
  rng: () => number = Math.random,
): string | null {
  const lines = bible.fallbackLines[key];
  if (!lines || lines.length === 0) return null;
  return lines[Math.floor(rng() * lines.length)] ?? null;
}
