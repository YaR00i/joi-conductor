/**
 * Official Qwen3-TTS 0.6B lineup (12Hz tokenizer).
 * CustomVoice = 9 presets, production. Base = 3s clone / fine-tune.
 */

export type QwenTtsFlavor = "custom_voice" | "base";

export type QwenInstallTarget = "tokenizer" | "custom_voice" | "base";

export const QWEN_TTS_TOKENIZER_ID = "Qwen/Qwen3-TTS-Tokenizer-12Hz";
export const QWEN_TTS_CUSTOM_VOICE_ID = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice";
export const QWEN_TTS_BASE_ID = "Qwen/Qwen3-TTS-12Hz-0.6B-Base";

/** Retired generic id that vLLM examples used before the 12Hz split. */
const LEGACY_QWEN_MODEL_IDS = new Set([
  "Qwen/Qwen3-TTS-0.6B",
  "Qwen/Qwen3-TTS-0.6B-Instruct",
]);

/** Omni / older Qwen-TTS voices — not in CustomVoice 0.6B. */
const LEGACY_QWEN_VOICES = new Set(["Cherry", "Ethan", "Chelsie"]);

export const QWEN_TTS_CUSTOM_VOICES = [
  {
    id: "Serena",
    labelRu: "Serena · тёплый женский",
    native: "zh",
  },
  {
    id: "Vivian",
    labelRu: "Vivian · яркий женский",
    native: "zh",
  },
  {
    id: "Sohee",
    labelRu: "Sohee · тёплый женский (KR)",
    native: "ko",
  },
  {
    id: "Ono_Anna",
    labelRu: "Ono_Anna · лёгкий женский (JP)",
    native: "ja",
  },
  {
    id: "Uncle_Fu",
    labelRu: "Uncle_Fu · низкий мужской",
    native: "zh",
  },
  {
    id: "Dylan",
    labelRu: "Dylan · ясный мужской (Beijing)",
    native: "zh",
  },
  {
    id: "Eric",
    labelRu: "Eric · живой мужской (Sichuan)",
    native: "zh",
  },
  {
    id: "Ryan",
    labelRu: "Ryan · ритмичный мужской (EN)",
    native: "en",
  },
  {
    id: "Aiden",
    labelRu: "Aiden · светлый мужской (EN)",
    native: "en",
  },
] as const;

export const DEFAULT_QWEN_VOICE = "Serena";

export function qwenModelForFlavor(flavor: QwenTtsFlavor): string {
  return flavor === "base" ? QWEN_TTS_BASE_ID : QWEN_TTS_CUSTOM_VOICE_ID;
}

export function inferQwenFlavor(model: string): QwenTtsFlavor {
  const id = model.trim();
  if (/CustomVoice/i.test(id)) return "custom_voice";
  if (id === QWEN_TTS_BASE_ID || /[-_/]Base$/i.test(id)) return "base";
  return "custom_voice";
}

export function migrateQwenModel(model: string): string {
  const id = model.trim();
  if (!id || LEGACY_QWEN_MODEL_IDS.has(id)) return QWEN_TTS_CUSTOM_VOICE_ID;
  return id;
}

export function migrateQwenVoice(voice: string): string {
  const id = voice.trim();
  if (!id || LEGACY_QWEN_VOICES.has(id)) return DEFAULT_QWEN_VOICE;
  return id;
}

export function isCustomVoiceId(voice: string): boolean {
  return QWEN_TTS_CUSTOM_VOICES.some((v) => v.id === voice);
}

export const QWEN_HF_REPOS: Record<QwenInstallTarget, string> = {
  tokenizer: QWEN_TTS_TOKENIZER_ID,
  custom_voice: QWEN_TTS_CUSTOM_VOICE_ID,
  base: QWEN_TTS_BASE_ID,
};

export function qwenServeHint(localDir: string | null, flavor: QwenTtsFlavor): string {
  const model = localDir?.trim() || qwenModelForFlavor(flavor);
  return `qwen-tts / vLLM · ${model}`;
}
