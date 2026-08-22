import type { MistressId } from "../mistress/types";

export const SOUL_MEMORY_MODES = [0, 1, 2, 3] as const;

/** 0 Full · 1 Index+Diary · 2 Index · 3 Diary only — same as Soul of Waifu. */
export type SoulMemoryMode = (typeof SOUL_MEMORY_MODES)[number];

export type SoulChatRole = "user" | "assistant";

export type SoulChatMessage = {
  id: string;
  role: SoulChatRole;
  text: string;
  atMs: number;
  think?: string;
};

export type SoulTopicFile = {
  filename: string;
  body: string;
};

export type SoulCharacterMemory = {
  coreIdentity: string[];
  primaryEmotion: string;
  intensity: string;
  psychologicalTension: string;
  emotionalDecayCounter: number;
  activeAgenda: string;
  immediateFocus: string;
  cognitiveDissonance: string;
};

export type SoulUserMemory = {
  roleInStory: string;
  knownAttributes: string;
  trustLevel: string;
  dynamicDescription: string;
  unspokenTension: string;
  preferencesHabits: string[];
  sharedMilestones: string[];
};

export type SoulMistressState = {
  memoryMd: string;
  userMd: string;
  diaryMd: string;
  topics: SoulTopicFile[];
  messages: SoulChatMessage[];
  pendingSinceRouter: number;
  mode: SoulMemoryMode;
  character: SoulCharacterMemory;
  user: SoulUserMemory;
};

export const SOUL_ROUTER_BATCH = 4;
export const SOUL_RAG_THRESHOLD = 4;
export const SOUL_RAG_MAX_TOPICS = 3;

export function emptyCharacterMemory(
  nameRu: string,
  tone: string[],
): SoulCharacterMemory {
  return {
    coreIdentity: [
      `${nameRu} stays in character.`,
      ...(tone.slice(0, 3).map((t) => t.trim()).filter(Boolean)),
    ].slice(0, 5),
    primaryEmotion: "Curious",
    intensity: "2/5",
    psychologicalTension: "First contact — watching him.",
    emotionalDecayCounter: 0,
    activeAgenda: "Learn who he is without giving the session away.",
    immediateFocus: "This conversation, and the constraints she sets.",
    cognitiveDissonance: "None",
  };
}

export function emptyUserMemory(): SoulUserMemory {
  return {
    roleInStory: "The devotee she talks to outside a session.",
    knownAttributes: "Unknown yet.",
    trustLevel: "Neutral",
    dynamicDescription: "A new voice. She has not decided.",
    unspokenTension: "None yet.",
    preferencesHabits: [],
    sharedMilestones: [],
  };
}

export function emptyMistressState(
  nameRu: string,
  tone: string[],
): SoulMistressState {
  const character = emptyCharacterMemory(nameRu, tone);
  const user = emptyUserMemory();
  return {
    memoryMd: "",
    userMd: "",
    diaryMd: "",
    topics: [],
    messages: [],
    pendingSinceRouter: 0,
    mode: 0,
    character,
    user,
  };
}

export function isSoulMemoryMode(v: unknown): v is SoulMemoryMode {
  return typeof v === "number" && (SOUL_MEMORY_MODES as readonly number[]).includes(v);
}

export function soulMemoryModeLabelRu(mode: SoulMemoryMode): string {
  switch (mode) {
    case 0:
      return "Полная";
    case 1:
      return "Индекс+дневник";
    case 2:
      return "Индекс";
    case 3:
      return "Дневник";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function soulUsesRouter(mode: SoulMemoryMode): boolean {
  switch (mode) {
    case 0:
    case 1:
    case 2:
      return true;
    case 3:
      return false;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function soulUsesTopics(mode: SoulMemoryMode): boolean {
  switch (mode) {
    case 0:
      return true;
    case 1:
    case 2:
    case 3:
      return false;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function soulUsesDiary(mode: SoulMemoryMode): boolean {
  switch (mode) {
    case 0:
    case 1:
    case 3:
      return true;
    case 2:
      return false;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function soulRouterLite(mode: SoulMemoryMode): boolean {
  switch (mode) {
    case 0:
      return false;
    case 1:
    case 2:
      return true;
    case 3:
      return false;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export type SoulStoreFile = {
  version: 1;
  byMistress: Partial<Record<MistressId, SoulMistressState>>;
};
