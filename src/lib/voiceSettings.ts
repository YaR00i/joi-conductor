import type { MistressId, MistressPack } from "./mistress/types";

const STORAGE_KEY = "joi-voice-settings-v1";

export type TtsProviderSetting =
  | "auto"
  | "sovits"
  | "qwen"
  | "piper"
  | "edge"
  | "system";

/** Per-mistress playback knobs. Ref wav still comes from the pack. */
export type MistressVoiceTuning = {
  ttsRate?: number;
  ttsPitch?: number;
  /** 0..2 — above 1 boosts quiet clone refs (host WAV gain). */
  ttsVolume?: number;
};

export interface VoiceSettings {
  mode: "template" | "llm";
  endpoint: string;
  model: string;
  timeoutMs: number;
  autoStartOllama: boolean;
  /** Start GPT-SoVITS api_v2 when TTS uses sovits/auto */
  autoStartSovits: boolean;
  ttsEnabled: boolean;
  ttsProvider: TtsProviderSetting;
  /** Active mistress rate (mirrors mistressTuning[active]). */
  ttsRate: number;
  /** Active mistress volume 0..2 (mirrors mistressTuning[active]). */
  ttsVolume: number;
  /** Active mistress pitch (mirrors mistressTuning[active]). */
  ttsPitch: number;
  ttsEdgeVoice: string;
  ttsVoiceURI: string;
  /** GPT-SoVITS api_v2 base */
  sovitsUrl: string;
  /** Absolute or project-relative path to reference wav */
  sovitsRefPath: string;
  /** Transcript of the reference clip (same language) */
  sovitsPromptText: string;
  /** zh if cutscene is Chinese; ru if Russian dub */
  sovitsPromptLang: "ru" | "zh" | "en" | "ja";
  sovitsTextLang: "ru" | "zh" | "en" | "ja" | "ko";
  /** Qwen3-TTS (vLLM OpenAI-compatible /v1/audio/speech) base */
  qwenUrl: string;
  /** Model id served by vLLM, e.g. "Qwen/Qwen3-TTS-0.6B" */
  qwenModel: string;
  /** Built-in voice id, e.g. "Cherry" / "Ethan" / "Chelsie" */
  qwenVoice: string;
  /** Optional Bearer token when vLLM is behind auth */
  qwenApiKey: string;
  /** Optional EN→RU captions via Google (default: show English) */
  captionGoogleRu: boolean;
  /** Saved rate/pitch/volume per mistress id */
  mistressTuning: Partial<Record<MistressId, MistressVoiceTuning>>;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  mode: "template",
  endpoint: "/api/ollama/v1/chat/completions",
  model: "llama3.2",
  timeoutMs: 12000,
  autoStartOllama: true,
  autoStartSovits: true,
  ttsEnabled: true,
  ttsProvider: "sovits",
  ttsRate: 1.05,
  ttsVolume: 1,
  ttsPitch: 1.12,
  ttsEdgeVoice: "ru-RU-DariyaNeural",
  ttsVoiceURI: "",
  sovitsUrl: "http://127.0.0.1:9880",
  sovitsRefPath: "voice-refs/hu-tao/ref.wav",
  sovitsPromptText:
    'Hu as in "Who put me in this coffin?" and Tao as in "I can\'t geT OUt!" Hehe... No, not funny?',
  sovitsPromptLang: "en",
  sovitsTextLang: "en",
  qwenUrl: "http://127.0.0.1:8000/v1",
  qwenModel: "Qwen/Qwen3-TTS-0.6B",
  qwenVoice: "Cherry",
  qwenApiKey: "",
  captionGoogleRu: false,
  mistressTuning: {},
};

const PROVIDERS: TtsProviderSetting[] = [
  "auto",
  "sovits",
  "qwen",
  "piper",
  "edge",
  "system",
];

const MISTRESS_IDS: readonly MistressId[] = [
  "hu_tao",
  "furina",
  "sunna",
  "sparkle",
] as const;

export function clampTtsRate(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOICE_SETTINGS.ttsRate;
  return Math.min(1.8, Math.max(0.5, value));
}

export function clampTtsPitch(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOICE_SETTINGS.ttsPitch;
  return Math.min(2, Math.max(0.5, value));
}

/** 0..2 — values above 1 boost quiet refs via host WAV gain. */
export function clampTtsVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOICE_SETTINGS.ttsVolume;
  return Math.min(2, Math.max(0, value));
}

function parseMistressTuning(
  raw: unknown,
): Partial<Record<MistressId, MistressVoiceTuning>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<MistressId, MistressVoiceTuning>> = {};
  for (const id of MISTRESS_IDS) {
    const entry = (raw as Record<string, unknown>)[id];
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const tuning: MistressVoiceTuning = {};
    if (typeof e.ttsRate === "number") tuning.ttsRate = clampTtsRate(e.ttsRate);
    if (typeof e.ttsPitch === "number") {
      tuning.ttsPitch = clampTtsPitch(e.ttsPitch);
    }
    if (typeof e.ttsVolume === "number") {
      tuning.ttsVolume = clampTtsVolume(e.ttsVolume);
    }
    if (
      tuning.ttsRate != null ||
      tuning.ttsPitch != null ||
      tuning.ttsVolume != null
    ) {
      out[id] = tuning;
    }
  }
  return out;
}

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VOICE_SETTINGS, mistressTuning: {} };
    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    const provider = PROVIDERS.includes(parsed.ttsProvider as TtsProviderSetting)
      ? (parsed.ttsProvider as TtsProviderSetting)
      : "sovits";
    const mistressTuning = parseMistressTuning(parsed.mistressTuning);
    return {
      ...DEFAULT_VOICE_SETTINGS,
      ...parsed,
      mode: parsed.mode === "llm" ? "llm" : "template",
      timeoutMs:
        typeof parsed.timeoutMs === "number" && parsed.timeoutMs > 500
          ? parsed.timeoutMs
          : DEFAULT_VOICE_SETTINGS.timeoutMs,
      autoStartOllama: parsed.autoStartOllama !== false,
      autoStartSovits: parsed.autoStartSovits !== false,
      ttsEnabled: parsed.ttsEnabled !== false,
      ttsProvider: provider,
      ttsRate:
        typeof parsed.ttsRate === "number" && parsed.ttsRate >= 0.5
          ? clampTtsRate(parsed.ttsRate)
          : DEFAULT_VOICE_SETTINGS.ttsRate,
      ttsVolume:
        typeof parsed.ttsVolume === "number" && parsed.ttsVolume >= 0
          ? clampTtsVolume(parsed.ttsVolume)
          : DEFAULT_VOICE_SETTINGS.ttsVolume,
      ttsPitch:
        typeof parsed.ttsPitch === "number" && parsed.ttsPitch >= 0.5
          ? clampTtsPitch(parsed.ttsPitch)
          : DEFAULT_VOICE_SETTINGS.ttsPitch,
      ttsEdgeVoice:
        typeof parsed.ttsEdgeVoice === "string" && parsed.ttsEdgeVoice
          ? parsed.ttsEdgeVoice
          : DEFAULT_VOICE_SETTINGS.ttsEdgeVoice,
      ttsVoiceURI:
        typeof parsed.ttsVoiceURI === "string" ? parsed.ttsVoiceURI : "",
      sovitsUrl:
        typeof parsed.sovitsUrl === "string" && parsed.sovitsUrl.trim()
          ? parsed.sovitsUrl.trim()
          : DEFAULT_VOICE_SETTINGS.sovitsUrl,
      sovitsRefPath:
        typeof parsed.sovitsRefPath === "string"
          ? parsed.sovitsRefPath
          : DEFAULT_VOICE_SETTINGS.sovitsRefPath,
      sovitsPromptText: (() => {
        const rawPrompt =
          typeof parsed.sovitsPromptText === "string"
            ? parsed.sovitsPromptText.trim()
            : "";
        // Migrate away from retired Hu Tao VO transcripts
        if (
          !rawPrompt ||
          rawPrompt.includes("77th Director of the Wangsheng") ||
          rawPrompt.includes("bathe in sunlight")
        ) {
          return DEFAULT_VOICE_SETTINGS.sovitsPromptText;
        }
        return rawPrompt;
      })(),
      sovitsPromptLang:
        parsed.sovitsPromptLang === "ru" ||
        parsed.sovitsPromptLang === "en" ||
        parsed.sovitsPromptLang === "ja" ||
        parsed.sovitsPromptLang === "zh"
          ? parsed.sovitsPromptLang
          : DEFAULT_VOICE_SETTINGS.sovitsPromptLang,
      sovitsTextLang:
        parsed.sovitsTextLang === "zh" ||
        parsed.sovitsTextLang === "en" ||
        parsed.sovitsTextLang === "ja" ||
        parsed.sovitsTextLang === "ko"
          ? parsed.sovitsTextLang
          : DEFAULT_VOICE_SETTINGS.sovitsTextLang,
      qwenUrl:
        typeof parsed.qwenUrl === "string" && parsed.qwenUrl.trim()
          ? parsed.qwenUrl.trim()
          : DEFAULT_VOICE_SETTINGS.qwenUrl,
      qwenModel:
        typeof parsed.qwenModel === "string" && parsed.qwenModel.trim()
          ? parsed.qwenModel.trim()
          : DEFAULT_VOICE_SETTINGS.qwenModel,
      qwenVoice:
        typeof parsed.qwenVoice === "string" && parsed.qwenVoice.trim()
          ? parsed.qwenVoice.trim()
          : DEFAULT_VOICE_SETTINGS.qwenVoice,
      qwenApiKey:
        typeof parsed.qwenApiKey === "string" ? parsed.qwenApiKey : "",
      captionGoogleRu: parsed.captionGoogleRu === true,
      mistressTuning,
    };
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS, mistressTuning: {} };
  }
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function resolveMistressRate(
  settings: VoiceSettings,
  pack: MistressPack,
): number {
  const saved = settings.mistressTuning[pack.id]?.ttsRate;
  if (typeof saved === "number") return clampTtsRate(saved);
  if (typeof pack.voice.ttsRate === "number") {
    return clampTtsRate(pack.voice.ttsRate);
  }
  return clampTtsRate(DEFAULT_VOICE_SETTINGS.ttsRate);
}

function resolveMistressPitch(
  settings: VoiceSettings,
  pack: MistressPack,
): number {
  const saved = settings.mistressTuning[pack.id]?.ttsPitch;
  if (typeof saved === "number") return clampTtsPitch(saved);
  if (typeof pack.voice.ttsPitch === "number") {
    return clampTtsPitch(pack.voice.ttsPitch);
  }
  return clampTtsPitch(DEFAULT_VOICE_SETTINGS.ttsPitch);
}

function resolveMistressVolume(
  settings: VoiceSettings,
  pack: MistressPack,
): number {
  const saved = settings.mistressTuning[pack.id]?.ttsVolume;
  if (typeof saved === "number") return clampTtsVolume(saved);
  if (typeof pack.voice.ttsVolume === "number") {
    return clampTtsVolume(pack.voice.ttsVolume);
  }
  return clampTtsVolume(DEFAULT_VOICE_SETTINGS.ttsVolume);
}

/** Apply the active mistress pack's SoVITS clone + per-profile knobs. */
export function withMistressVoice(
  settings: VoiceSettings,
  pack: MistressPack,
): VoiceSettings {
  const v = pack.voice;
  return {
    ...settings,
    sovitsRefPath: v.sovitsRefPath,
    sovitsPromptText: v.sovitsPromptText,
    sovitsPromptLang: v.sovitsPromptLang ?? settings.sovitsPromptLang,
    sovitsTextLang: v.sovitsTextLang ?? settings.sovitsTextLang,
    ttsRate: resolveMistressRate(settings, pack),
    ttsPitch: resolveMistressPitch(settings, pack),
    ttsVolume: resolveMistressVolume(settings, pack),
  };
}

/** Persist rate/pitch/volume for one mistress and update the active fields. */
export function setMistressVoiceTuning(
  settings: VoiceSettings,
  mistressId: MistressId,
  patch: MistressVoiceTuning,
): VoiceSettings {
  const prev = settings.mistressTuning[mistressId] ?? {};
  const nextTuning: MistressVoiceTuning = { ...prev };
  if (patch.ttsRate != null) nextTuning.ttsRate = clampTtsRate(patch.ttsRate);
  if (patch.ttsPitch != null) {
    nextTuning.ttsPitch = clampTtsPitch(patch.ttsPitch);
  }
  if (patch.ttsVolume != null) {
    nextTuning.ttsVolume = clampTtsVolume(patch.ttsVolume);
  }
  return {
    ...settings,
    ttsRate:
      nextTuning.ttsRate != null ? nextTuning.ttsRate : settings.ttsRate,
    ttsPitch:
      nextTuning.ttsPitch != null ? nextTuning.ttsPitch : settings.ttsPitch,
    ttsVolume:
      nextTuning.ttsVolume != null ? nextTuning.ttsVolume : settings.ttsVolume,
    mistressTuning: {
      ...settings.mistressTuning,
      [mistressId]: nextTuning,
    },
  };
}

/** Drop user overrides for a mistress and re-apply pack defaults. */
export function resetMistressVoiceProfile(
  settings: VoiceSettings,
  pack: MistressPack,
): VoiceSettings {
  const { [pack.id]: _removed, ...rest } = settings.mistressTuning;
  return withMistressVoice(
    {
      ...settings,
      mistressTuning: rest,
    },
    pack,
  );
}
