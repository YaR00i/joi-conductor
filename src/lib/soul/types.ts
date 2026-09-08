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
  /** Explicitly shared cloud exchange; absent for all legacy/private messages. */
  cloudContextId?: string;
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
  /** Everyday life only (tea, work hours, games). Play belongs in stances. */
  preferencesHabits: string[];
  sharedMilestones: string[];
  /** Compact play stance. Not a second event log; not USER.md prose. */
  stances: UserStance[];
};

export const USER_STANCE_KINDS = [
  "hard_boundary",
  "liked",
  "disliked_once",
  "often_refuses",
  "struggles_with",
  "curious_about",
  "responds_well_to",
] as const;
export type UserStanceKind = (typeof USER_STANCE_KINDS)[number];

export const USER_STANCE_SOURCES = [
  "explicit_chat",
  "contract",
  "session",
  "quest",
  "behavior",
] as const;
export type UserStanceSource = (typeof USER_STANCE_SOURCES)[number];

export type UserStance = {
  subject: string;
  kind: UserStanceKind;
  confidence: number;
  evidenceCount: number;
  lastEvidenceAtMs: number;
  source: UserStanceSource;
  evidenceKey?: string;
  note?: string;
};

/** Conductor facts for Soul — not LLM chain-of-thought. */
export const SOUL_WORLD_EVENT_KINDS = [
  "session_completed",
  "session_aborted",
  "contract_accepted",
  "contract_completed",
  "contract_failed",
  "quest_completed",
  "quest_failed",
  "morning_pack",
  "checkin_submitted",
  "session_refused",
  "live_obligation_changed",
] as const;

export type SoulWorldEventKind = (typeof SOUL_WORLD_EVENT_KINDS)[number];

export type SoulWorldEventImportance = 1 | 2 | 3;

export type SoulWorldEvent = {
  id: string;
  kind: SoulWorldEventKind;
  atMs: number;
  mistressId: MistressId;
  summary: string;
  importance: SoulWorldEventImportance;
  subjectId?: string;
};

export type SoulOpenLoop = {
  id: string;
  summary: string;
  source: SoulWorldEventKind;
  atMs: number;
  importance: SoulWorldEventImportance;
  subjectId?: string;
  expiresAtMs?: number;
};

export const SOUL_INTENT_SOURCES = [
  "conversation",
  "contract",
  "session",
  "checkin",
  "relationship",
  "system",
] as const;
export type SoulIntentSource = (typeof SOUL_INTENT_SOURCES)[number];

export const SOUL_INTENT_TONES = [
  "warm",
  "pleased",
  "curious",
  "firm",
  "annoyed",
  "playful",
] as const;
export type SoulIntentTone = (typeof SOUL_INTENT_TONES)[number];

/** Current interaction goal. Conductor-owned, not model chain-of-thought. */
export type SoulCharacterIntent = {
  goal: string;
  subject?: string;
  tone: SoulIntentTone;
  priority: number;
  expiresAtMs?: number;
  source: SoulIntentSource;
  candidateId?: string;
};

/** Initiative ledger — not a second memory, only cooldown/consumed. */
export type SoulInitiativeState = {
  lastAtMs: number | null;
  consumedIds: string[];
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
  /** Compact recent Conductor facts. Log for candidates, not a second diary. */
  recentEvents: SoulWorldEvent[];
  /**
   * Unclosed topics. Sole loop store: create/replace, close = remove, expire = drop.
   * No closedLoops array.
   */
  openLoops: SoulOpenLoop[];
  /** Current interaction goal. Conductor-owned; not router activeAgenda. */
  intent: SoulCharacterIntent | null;
  /** Cooldown + consumed candidate ids. Not memory. */
  initiative: SoulInitiativeState;
};

export const SOUL_ROUTER_BATCH = 4;
export const SOUL_RAG_MAX_TOPICS = 3;
export const SOUL_RECENT_EVENTS_CAP = 12;
export const SOUL_OPEN_LOOPS_CAP = 6;
export const SOUL_EVENT_DEDUPE_MS = 6 * 60 * 60 * 1000;
export const SOUL_INITIATIVE_COOLDOWN_MS = 4 * 60 * 60 * 1000;
export const SOUL_INITIATIVE_CONSUMED_CAP = 32;
export const SOUL_INTENT_TTL_MS = 45 * 60 * 1000;
export const SOUL_EVENT_CANDIDATE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const SOUL_STANCES_CAP = 16;
export const SOUL_STANCE_SLICE_CAP = 6;

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
    activeAgenda: "Learn who he is.",
    immediateFocus: "This conversation.",
    cognitiveDissonance: "None",
  };
}

export function emptyUserMemory(): SoulUserMemory {
  return {
    roleInStory: "The person she talks to.",
    knownAttributes: "Unknown yet.",
    trustLevel: "Neutral",
    dynamicDescription: "A new voice. She has not decided.",
    unspokenTension: "None yet.",
    preferencesHabits: [],
    sharedMilestones: [],
    stances: [],
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
    recentEvents: [],
    openLoops: [],
    intent: null,
    initiative: { lastAtMs: null, consumedIds: [] },
  };
}

export function emptySoulInitiative(): SoulInitiativeState {
  return { lastAtMs: null, consumedIds: [] };
}

export function clampSoulIntentPriority(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, Math.round(n)));
}

export function isSoulWorldEventKind(v: unknown): v is SoulWorldEventKind {
  return (
    typeof v === "string" &&
    (SOUL_WORLD_EVENT_KINDS as readonly string[]).includes(v)
  );
}

export function isSoulIntentSource(v: unknown): v is SoulIntentSource {
  return (
    typeof v === "string" &&
    (SOUL_INTENT_SOURCES as readonly string[]).includes(v)
  );
}

export function isSoulIntentTone(v: unknown): v is SoulIntentTone {
  return (
    typeof v === "string" &&
    (SOUL_INTENT_TONES as readonly string[]).includes(v)
  );
}

export function isUserStanceKind(v: unknown): v is UserStanceKind {
  return (
    typeof v === "string" &&
    (USER_STANCE_KINDS as readonly string[]).includes(v)
  );
}

export function isUserStanceSource(v: unknown): v is UserStanceSource {
  return (
    typeof v === "string" &&
    (USER_STANCE_SOURCES as readonly string[]).includes(v)
  );
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
