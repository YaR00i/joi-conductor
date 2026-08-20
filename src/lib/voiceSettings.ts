import type { MistressId, MistressPack } from "./mistress/types";
import {
  DEFAULT_QWEN_VOICE,
  QWEN_TTS_CUSTOM_VOICE_ID,
  migrateQwenModel,
  migrateQwenVoice,
} from "./qwenTtsCatalog";
import {
  isQwenRefRel,
  sovitsRefFromLegacyQwenPath,
} from "./voiceRefPath";

const STORAGE_KEY = "joi-voice-settings-v1";

export type TtsProviderSetting =
  | "auto"
  | "sovits"
  | "qwen"
  | "qwen-cpu"
  | "piper"
  | "edge"
  | "system";

export function isQwenTtsProvider(
  provider: string,
): provider is "qwen" | "qwen-cpu" {
  return provider === "qwen" || provider === "qwen-cpu";
}

/** CUDA engine vs RAM-only engine (same installed weights). */
export function qwenServeDevice(
  provider: string,
): "cpu" | "cuda" {
  return provider === "qwen-cpu" ? "cpu" : "cuda";
}

export function qwenDeviceMatches(
  running: string | undefined,
  wanted: "cpu" | "cuda",
): boolean {
  const r = (running ?? "").toLowerCase();
  if (!r) return wanted !== "cpu";
  if (wanted === "cpu") return r === "cpu";
  return r !== "cpu";
}

/** Per-mistress playback knobs and clip transcripts. Ref wav paths still come from the pack. */
export type MistressVoiceTuning = {
  ttsRate?: number;
  ttsPitch?: number;
  /** 0..2 — above 1 boosts quiet clone refs (host WAV gain). */
  ttsVolume?: number;
  /** Override pack transcript for the SoVITS 4–10 s clip. */
  sovitsPromptText?: string;
  sovitsPromptLang?: "ru" | "zh" | "en" | "ja";
  /** Override pack transcript for the Qwen Base ~3 s clip. */
  qwenPromptText?: string;
  qwenPromptLang?: "ru" | "zh" | "en" | "ja";
};

export interface VoiceSettings {
  mode: "template" | "llm";
  endpoint: string;
  model: string;
  timeoutMs: number;
  autoStartOllama: boolean;
  /** Start GPT-SoVITS api_v2 when TTS uses sovits/auto */
  autoStartSovits: boolean;
  /** Start vLLM for Qwen3-TTS when TTS uses qwen/auto */
  autoStartQwen: boolean;
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
  /** Absolute or project-relative path to the SoVITS 4–10 s wav */
  sovitsRefPath: string;
  /** Transcript of the SoVITS reference clip */
  sovitsPromptText: string;
  /** zh if cutscene is Chinese; ru if Russian dub */
  sovitsPromptLang: "ru" | "zh" | "en" | "ja";
  sovitsTextLang: "ru" | "zh" | "en" | "ja" | "ko";
  /** Qwen Base clone wav (~3 s). CustomVoice ignores this. */
  qwenRefPath: string;
  /** Transcript of the Qwen Base clip (ref_text) */
  qwenPromptText: string;
  qwenPromptLang: "ru" | "zh" | "en" | "ja";
  /** Qwen3-TTS (vLLM OpenAI-compatible /v1/audio/speech) base */
  qwenUrl: string;
  /** Hugging Face / vLLM model id (CustomVoice or Base 12Hz 0.6B) */
  qwenModel: string;
  /** CustomVoice speaker id (Serena, Vivian, …). Ignored for Base clone. */
  qwenVoice: string;
  /** Optional Bearer token when vLLM is behind auth */
  qwenApiKey: string;
  /** Optional EN→RU captions via Google (default: show English) */
  captionGoogleRu: boolean;
  /** Saved rate/pitch/volume and clip transcripts per mistress id */
  mistressTuning: Partial<Record<MistressId, MistressVoiceTuning>>;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  mode: "template",
  endpoint: "/api/ollama/v1/chat/completions",
  model: "llama3.2",
  timeoutMs: 12000,
  autoStartOllama: true,
  autoStartSovits: true,
  autoStartQwen: false,
  ttsEnabled: true,
  ttsProvider: "sovits",
  ttsRate: 1.05,
  ttsVolume: 1,
  ttsPitch: 1.12,
  ttsEdgeVoice: "ru-RU-DariyaNeural",
  ttsVoiceURI: "",
  sovitsUrl: "http://127.0.0.1:9880",
  sovitsRefPath: "voice-refs/hu-tao/sovits-ref.wav",
  sovitsPromptText: "",
  sovitsPromptLang: "en",
  sovitsTextLang: "en",
  qwenRefPath: "voice-refs/hu-tao/ref.wav",
  qwenPromptText:
    'Hu as in "Who put me in this coffin?" and Tao as in "I can\'t geT OUt!" Hehe... No, not funny?',
  qwenPromptLang: "en",
  qwenUrl: "http://127.0.0.1:8000/v1",
  qwenModel: QWEN_TTS_CUSTOM_VOICE_ID,
  qwenVoice: DEFAULT_QWEN_VOICE,
  qwenApiKey: "",
  captionGoogleRu: false,
  mistressTuning: {},
};

const PROVIDERS: TtsProviderSetting[] = [
  "auto",
  "sovits",
  "qwen",
  "qwen-cpu",
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
    if (typeof e.sovitsPromptText === "string") {
      tuning.sovitsPromptText = e.sovitsPromptText;
    }
    if (
      e.sovitsPromptLang === "ru" ||
      e.sovitsPromptLang === "zh" ||
      e.sovitsPromptLang === "en" ||
      e.sovitsPromptLang === "ja"
    ) {
      tuning.sovitsPromptLang = e.sovitsPromptLang;
    }
    if (typeof e.qwenPromptText === "string") {
      tuning.qwenPromptText = e.qwenPromptText;
    } else if (typeof e.sovitsPromptText === "string") {
      // Pre-split saves used one transcript for Qwen Base and SoVITS.
      tuning.qwenPromptText = e.sovitsPromptText;
    }
    if (
      e.qwenPromptLang === "ru" ||
      e.qwenPromptLang === "zh" ||
      e.qwenPromptLang === "en" ||
      e.qwenPromptLang === "ja"
    ) {
      tuning.qwenPromptLang = e.qwenPromptLang;
    } else if (
      typeof e.qwenPromptText !== "string" &&
      (e.sovitsPromptLang === "ru" ||
        e.sovitsPromptLang === "zh" ||
        e.sovitsPromptLang === "en" ||
        e.sovitsPromptLang === "ja")
    ) {
      tuning.qwenPromptLang = e.sovitsPromptLang;
    }
    if (
      tuning.ttsRate != null ||
      tuning.ttsPitch != null ||
      tuning.ttsVolume != null ||
      tuning.sovitsPromptText != null ||
      tuning.sovitsPromptLang != null ||
      tuning.qwenPromptText != null ||
      tuning.qwenPromptLang != null
    ) {
      out[id] = tuning;
    }
  }
  return out;
}

function retiredHuTaoPrompt(raw: string): boolean {
  return (
    raw.includes("77th Director of the Wangsheng") ||
    raw.includes("bathe in sunlight")
  );
}

function sanitizeClipPrompt(raw: string, fallback: string): string {
  const t = raw.trim();
  if (!t || retiredHuTaoPrompt(t)) return fallback;
  return t;
}

/** Split the old shared SoVITS/Qwen clip into two files + transcripts. */
export function migrateSplitCloneFields(parsed: Partial<VoiceSettings>): {
  sovitsRefPath: string;
  sovitsPromptText: string;
  qwenRefPath: string;
  qwenPromptText: string;
} {
  const alreadySplit =
    typeof parsed.qwenRefPath === "string" ||
    typeof parsed.qwenPromptText === "string";
  const legacyPath =
    typeof parsed.sovitsRefPath === "string" ? parsed.sovitsRefPath : "";
  const legacyPrompt =
    typeof parsed.sovitsPromptText === "string"
      ? parsed.sovitsPromptText.trim()
      : "";

  if (alreadySplit) {
    return {
      sovitsRefPath: legacyPath || DEFAULT_VOICE_SETTINGS.sovitsRefPath,
      sovitsPromptText: sanitizeClipPrompt(
        legacyPrompt,
        DEFAULT_VOICE_SETTINGS.sovitsPromptText,
      ),
      qwenRefPath:
        parsed.qwenRefPath && parsed.qwenRefPath.trim()
          ? parsed.qwenRefPath
          : DEFAULT_VOICE_SETTINGS.qwenRefPath,
      qwenPromptText: sanitizeClipPrompt(
        typeof parsed.qwenPromptText === "string" ? parsed.qwenPromptText : "",
        DEFAULT_VOICE_SETTINGS.qwenPromptText,
      ),
    };
  }

  const qwenPath = legacyPath || DEFAULT_VOICE_SETTINGS.qwenRefPath;
  const qwenPrompt = sanitizeClipPrompt(
    legacyPrompt,
    DEFAULT_VOICE_SETTINGS.qwenPromptText,
  );
  const sharedShortClip = isQwenRefRel(qwenPath);
  return {
    qwenRefPath: qwenPath,
    qwenPromptText: qwenPrompt,
    sovitsRefPath: sharedShortClip
      ? sovitsRefFromLegacyQwenPath(qwenPath)
      : qwenPath || DEFAULT_VOICE_SETTINGS.sovitsRefPath,
    sovitsPromptText: sharedShortClip
      ? ""
      : sanitizeClipPrompt(legacyPrompt, ""),
  };
}

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VOICE_SETTINGS, mistressTuning: {} };
    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    const provider = PROVIDERS.includes(parsed.ttsProvider as TtsProviderSetting)
      ? (parsed.ttsProvider as TtsProviderSetting)
      : "sovits";
    const alreadySplit =
      typeof parsed.qwenRefPath === "string" ||
      typeof parsed.qwenPromptText === "string";
    const mistressTuning = parseMistressTuning(parsed.mistressTuning);
    if (!alreadySplit) {
      for (const id of MISTRESS_IDS) {
        const t = mistressTuning[id];
        if (!t || typeof t.sovitsPromptText !== "string") continue;
        if (typeof t.qwenPromptText !== "string") {
          t.qwenPromptText = t.sovitsPromptText;
        }
        t.sovitsPromptText = "";
      }
    }
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
      autoStartQwen: parsed.autoStartQwen === true,
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
      ...migrateSplitCloneFields(parsed),
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
      qwenPromptLang:
        parsed.qwenPromptLang === "ru" ||
        parsed.qwenPromptLang === "en" ||
        parsed.qwenPromptLang === "ja" ||
        parsed.qwenPromptLang === "zh"
          ? parsed.qwenPromptLang
          : parsed.sovitsPromptLang === "ru" ||
              parsed.sovitsPromptLang === "en" ||
              parsed.sovitsPromptLang === "ja" ||
              parsed.sovitsPromptLang === "zh"
            ? parsed.sovitsPromptLang
            : DEFAULT_VOICE_SETTINGS.qwenPromptLang,
      qwenUrl:
        typeof parsed.qwenUrl === "string" && parsed.qwenUrl.trim()
          ? parsed.qwenUrl.trim()
          : DEFAULT_VOICE_SETTINGS.qwenUrl,
      qwenModel: migrateQwenModel(
        typeof parsed.qwenModel === "string" && parsed.qwenModel.trim()
          ? parsed.qwenModel.trim()
          : DEFAULT_VOICE_SETTINGS.qwenModel,
      ),
      qwenVoice: migrateQwenVoice(
        typeof parsed.qwenVoice === "string" && parsed.qwenVoice.trim()
          ? parsed.qwenVoice.trim()
          : DEFAULT_VOICE_SETTINGS.qwenVoice,
      ),
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

/** Apply the active mistress pack's clone paths + per-profile knobs. */
export function withMistressVoice(
  settings: VoiceSettings,
  pack: MistressPack,
): VoiceSettings {
  const v = pack.voice;
  const tuned = settings.mistressTuning[pack.id];
  const sovitsPromptText =
    typeof tuned?.sovitsPromptText === "string"
      ? tuned.sovitsPromptText
      : v.sovitsPromptText;
  const sovitsPromptLang =
    tuned?.sovitsPromptLang ?? v.sovitsPromptLang ?? settings.sovitsPromptLang;
  const qwenPromptText =
    typeof tuned?.qwenPromptText === "string"
      ? tuned.qwenPromptText
      : (v.qwenPromptText ?? v.sovitsPromptText);
  const qwenPromptLang =
    tuned?.qwenPromptLang ??
    v.qwenPromptLang ??
    v.sovitsPromptLang ??
    settings.qwenPromptLang;
  return {
    ...settings,
    sovitsRefPath: v.sovitsRefPath,
    sovitsPromptText,
    sovitsPromptLang,
    sovitsTextLang: v.sovitsTextLang ?? settings.sovitsTextLang,
    qwenRefPath: v.qwenRefPath ?? v.sovitsRefPath,
    qwenPromptText,
    qwenPromptLang,
    ttsRate: resolveMistressRate(settings, pack),
    ttsPitch: resolveMistressPitch(settings, pack),
    ttsVolume: resolveMistressVolume(settings, pack),
  };
}

/** Persist SoVITS clip transcript for one mistress and update the active fields. */
export function setMistressClonePrompt(
  settings: VoiceSettings,
  mistressId: MistressId,
  patch: {
    sovitsPromptText?: string;
    sovitsPromptLang?: VoiceSettings["sovitsPromptLang"];
  },
): VoiceSettings {
  const prev = settings.mistressTuning[mistressId] ?? {};
  const nextTuning: MistressVoiceTuning = { ...prev };
  if (patch.sovitsPromptText != null) {
    nextTuning.sovitsPromptText = patch.sovitsPromptText;
  }
  if (patch.sovitsPromptLang != null) {
    nextTuning.sovitsPromptLang = patch.sovitsPromptLang;
  }
  return {
    ...settings,
    sovitsPromptText:
      patch.sovitsPromptText != null
        ? patch.sovitsPromptText
        : settings.sovitsPromptText,
    sovitsPromptLang: patch.sovitsPromptLang ?? settings.sovitsPromptLang,
    mistressTuning: {
      ...settings.mistressTuning,
      [mistressId]: nextTuning,
    },
  };
}

/** Persist Qwen Base clip transcript for one mistress. */
export function setMistressQwenPrompt(
  settings: VoiceSettings,
  mistressId: MistressId,
  patch: {
    qwenPromptText?: string;
    qwenPromptLang?: VoiceSettings["qwenPromptLang"];
  },
): VoiceSettings {
  const prev = settings.mistressTuning[mistressId] ?? {};
  const nextTuning: MistressVoiceTuning = { ...prev };
  if (patch.qwenPromptText != null) {
    nextTuning.qwenPromptText = patch.qwenPromptText;
  }
  if (patch.qwenPromptLang != null) {
    nextTuning.qwenPromptLang = patch.qwenPromptLang;
  }
  return {
    ...settings,
    qwenPromptText:
      patch.qwenPromptText != null
        ? patch.qwenPromptText
        : settings.qwenPromptText,
    qwenPromptLang: patch.qwenPromptLang ?? settings.qwenPromptLang,
    mistressTuning: {
      ...settings.mistressTuning,
      [mistressId]: nextTuning,
    },
  };
}

/** Copy top-level Qwen clip text onto the active mistress once (pre-per-profile saves). */
export function seedMistressClonePrompt(
  settings: VoiceSettings,
  pack: MistressPack,
): VoiceSettings {
  if (typeof settings.mistressTuning[pack.id]?.qwenPromptText === "string") {
    return settings;
  }
  return setMistressQwenPrompt(settings, pack.id, {
    qwenPromptText: settings.qwenPromptText,
    qwenPromptLang: settings.qwenPromptLang,
  });
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
