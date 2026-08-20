import type { CharacterBible } from "../character";
import type { SessionMood } from "../types";
import type { MoodLinesPack } from "../voice/moodLines";

export type MistressId = "hu_tao" | "furina" | "sunna" | "sparkle";

export type MistressThemeTokens = {
  /** CSS color values applied via data-mistress */
  accent: string;
  accent2: string;
  soft: string;
  bg0: string;
  bg1: string;
  bg2: string;
  bg3: string;
  line: string;
  muted: string;
  glowWarm: string;
  glowCool: string;
  scrollThumb: string;
  scrollThumbHover: string;
  /** Full CSS values for roulette / ember surfaces (panels, tabs, CTA). */
  surfaces: {
    emberPanel: string;
    emberPanelSoft: string;
    emberPanelOwned: string;
    rouletteEmber: string;
    rouletteEmberLine: string;
    rouletteGlowA: string;
    rouletteGlowB: string;
    rouletteStageBg: string;
    rouletteHubBg: string;
    rouletteHubTabBg: string;
    rouletteHubTabActiveBg: string;
    rouletteCtaBg: string;
    rouletteCtaBorder: string;
    rouletteCtaShadow: string;
    rouletteIdleCardBg: string;
    roulettePanelBorder: string;
    rouletteEyebrow: string;
    rouletteWarmMuted: string;
    railDotActive: string;
    railDotDone: string;
    wheelActiveBg: string;
    hubPresetActiveBg: string;
    avatarFrameBorder: string;
    avatarFrameGlow: string;
  };
};

export type MistressAssets = {
  avatarFull: string;
  shopAvatar: string;
  moodPortrait: Record<SessionMood, { labelRu: string; src: string }>;
  moodAvatar: Record<SessionMood, string>;
  /** Optional; falls back to Hu Tao emoji pack if omitted */
  emojiBase?: string;
};

export type MistressMediaProfile = {
  primaryDefaultTags: string;
  focusTags: string[];
  /** Opt-in Gelbooru bias packs (доп. теги); no second host yet. */
  secondaryBooruIds: Array<"censored" | "blacked">;
  cumplayBiasTags: string[];
};

export type MistressPlayBias = {
  summaryRu: string;
  hardnessRu: string;
  preferredModes: string[];
  functionWeightHints: string[];
  notesRu: string[];
  /** Sparkle: cage + dildo counts as stroking. */
  phantomStroke?: boolean;
  /** Sparkle: cum finale only allowed in anal (+ cage) mode. */
  analOrgasmOnly?: boolean;
};

export type MistressSessionFx = {
  avatarCensor: boolean;
  spiralOverlay: boolean;
  floatingCaptions: boolean;
  glitchHud: boolean;
};

export type MistressPack = {
  id: MistressId;
  displayNameRu: string;
  /** Дательный падеж: «Отдай выбор Фурине» */
  displayNameDativeRu: string;
  /** Родительный падеж: «по жадности Фурины» */
  displayNameGenitiveRu: string;
  taglineRu: string;
  characterTags: string[];
  unlocked: boolean;
  theme: MistressThemeTokens;
  bible: CharacterBible;
  moodLines: MoodLinesPack;
  assets: MistressAssets;
  media: MistressMediaProfile;
  play: MistressPlayBias;
  fx: MistressSessionFx;
  voice: {
    /** Project-relative or absolute GPT-SoVITS wav (4–10 s) */
    sovitsRefPath: string;
    /** Exact transcript of the SoVITS clip */
    sovitsPromptText: string;
    sovitsPromptLang?: "ru" | "zh" | "en" | "ja";
    sovitsTextLang?: "ru" | "zh" | "en" | "ja" | "ko";
    /** Qwen Base clone wav (~3 s). Falls back to sovitsRefPath only in old packs. */
    qwenRefPath?: string;
    /** Transcript of the Qwen clip (ref_text) */
    qwenPromptText?: string;
    qwenPromptLang?: "ru" | "zh" | "en" | "ja";
    /** Default SoVITS / TTS rate for this mistress (user can override). */
    ttsRate?: number;
    /** Default TTS pitch for this mistress (user can override). */
    ttsPitch?: number;
    /** Default playback volume 0..2 for this mistress (user can override). */
    ttsVolume?: number;
  };
};

export const MISTRESS_STORAGE_KEY = "joi-active-mistress";

export const SESSION_MOODS: readonly SessionMood[] = [
  "sweet",
  "calm",
  "bored",
  "cruel",
  "chaotic",
  "horny",
] as const;
