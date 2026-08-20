import { parseJsonObject } from "./json";
import { characterMemoryToMd, userMemoryToMd, soulTopicFilename } from "./markdown";
import { findSimilarSoulTopic } from "./rag";
import type {
  SoulCharacterMemory,
  SoulMistressState,
  SoulTopicFile,
  SoulUserMemory,
} from "./types";

export type SoulTopicActionKind = "create" | "update";

export type SoulTopicAction = {
  action: SoulTopicActionKind;
  filename: string;
  reason: string;
};

export type SoulRouterResult =
  | { kind: "no_change" }
  | {
      kind: "patch";
      character: SoulCharacterMemory;
      user: SoulUserMemory;
      topicActions: SoulTopicAction[];
    };

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function asStringList(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  const next = v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 8);
  return next.length > 0 ? next : fallback;
}

function asInt(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.max(0, Math.min(6, Math.round(v)));
  }
  if (typeof v === "string" && /^\d+$/.test(v.trim())) {
    return Math.max(0, Math.min(6, Number(v.trim())));
  }
  return fallback;
}

function readObj(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function softenIntensity(raw: string): string {
  const match = raw.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return raw;
  const n = Number(match[1]);
  const d = Number(match[2]);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return raw;
  return `${Math.max(1, n - 1)}/${d}`;
}

export function applyEmotionalDecay(
  previous: SoulCharacterMemory,
  next: SoulCharacterMemory,
): SoulCharacterMemory {
  const sameEmotion =
    previous.primaryEmotion.trim().toLowerCase() ===
    next.primaryEmotion.trim().toLowerCase();
  if (!sameEmotion) {
    return { ...next, emotionalDecayCounter: 0 };
  }
  const counter = previous.emotionalDecayCounter + 1;
  if (counter < 3) {
    return { ...next, emotionalDecayCounter: counter };
  }
  return {
    ...next,
    intensity: softenIntensity(next.intensity),
    emotionalDecayCounter: 0,
  };
}

function parseCharacter(
  raw: unknown,
  fallback: SoulCharacterMemory,
): SoulCharacterMemory {
  const obj = readObj(raw);
  if (!obj) return fallback;
  const internal = readObj(obj.internal_state) ?? obj;
  const drive = readObj(obj.cognitive_drive) ?? obj;
  return {
    coreIdentity: asStringList(obj.core_identity, fallback.coreIdentity),
    primaryEmotion: asString(
      internal.primary_emotion ?? obj.primary_emotion,
      fallback.primaryEmotion,
    ),
    intensity: asString(
      internal.intensity ?? obj.intensity,
      fallback.intensity,
    ),
    psychologicalTension: asString(
      internal.psychological_tension ?? obj.psychological_tension,
      fallback.psychologicalTension,
    ),
    emotionalDecayCounter: asInt(
      internal.emotional_decay_counter ?? obj.emotional_decay_counter,
      fallback.emotionalDecayCounter,
    ),
    activeAgenda: asString(
      drive.active_agenda ?? obj.active_agenda,
      fallback.activeAgenda,
    ),
    immediateFocus: asString(
      drive.immediate_focus ?? obj.immediate_focus,
      fallback.immediateFocus,
    ),
    cognitiveDissonance: asString(
      obj.cognitive_dissonance,
      fallback.cognitiveDissonance,
    ),
  };
}

function parseUser(raw: unknown, fallback: SoulUserMemory): SoulUserMemory {
  const obj = readObj(raw);
  if (!obj) return fallback;
  const identity = readObj(obj.identity) ?? obj;
  const rel = readObj(obj.relationship_dynamic) ?? obj;
  return {
    roleInStory: asString(
      identity.role_in_story ?? obj.role_in_story,
      fallback.roleInStory,
    ),
    knownAttributes: asString(
      identity.known_attributes ?? obj.known_attributes,
      fallback.knownAttributes,
    ),
    trustLevel: asString(
      rel.trust_level ?? obj.trust_level,
      fallback.trustLevel,
    ),
    dynamicDescription: asString(
      rel.dynamic_description ?? obj.dynamic_description,
      fallback.dynamicDescription,
    ),
    unspokenTension: asString(
      rel.unspoken_tension ?? obj.unspoken_tension,
      fallback.unspokenTension,
    ),
    preferencesHabits: asStringList(
      obj.preferences_and_habits,
      fallback.preferencesHabits,
    ),
    sharedMilestones: asStringList(
      obj.shared_milestones,
      fallback.sharedMilestones,
    ),
  };
}

function parseTopicAction(raw: unknown): SoulTopicAction | null {
  const obj = readObj(raw);
  if (!obj) return null;
  const action = obj.action;
  if (action !== "create" && action !== "update") return null;
  const filename = soulTopicFilename(asString(obj.filename, ""));
  const reason = asString(obj.reason, "");
  if (!reason) return null;
  return { action, filename, reason };
}

export function parseSoulRouterOutput(
  raw: string,
  previous: SoulMistressState,
): SoulRouterResult | null {
  const obj = parseJsonObject(raw);
  if (!obj) return null;
  if (obj.no_significant_change === true) return { kind: "no_change" };
  const character = applyEmotionalDecay(
    previous.character,
    parseCharacter(obj.character_memory, previous.character),
  );
  const user = parseUser(obj.user_memory, previous.user);
  const plan = readObj(obj.topic_plan);
  const actionsRaw = plan && Array.isArray(plan.actions) ? plan.actions : [];
  const topicActions = actionsRaw
    .map(parseTopicAction)
    .filter((a): a is SoulTopicAction => a !== null)
    .slice(0, 2);
  return { kind: "patch", character, user, topicActions };
}

export function applySoulRouterPatch(
  state: SoulMistressState,
  result: SoulRouterResult,
): SoulMistressState {
  if (result.kind === "no_change") {
    return { ...state, pendingSinceRouter: 0 };
  }
  return {
    ...state,
    character: result.character,
    user: result.user,
    memoryMd: characterMemoryToMd(result.character),
    userMd: userMemoryToMd(result.user),
    pendingSinceRouter: 0,
  };
}

export function upsertSoulTopic(
  topics: readonly SoulTopicFile[],
  filename: string,
  body: string,
): SoulTopicFile[] {
  const name = soulTopicFilename(filename);
  const similar = findSimilarSoulTopic(topics, `${name} ${body}`);
  const target = similar?.filename ?? name;
  const next = topics.filter((t) => t.filename !== target);
  next.push({ filename: target, body });
  next.sort((a, b) => a.filename.localeCompare(b.filename));
  return next;
}

export function resolveTopicActionTarget(
  topics: readonly SoulTopicFile[],
  action: SoulTopicAction,
): SoulTopicAction {
  if (action.action === "update") return action;
  const similar = findSimilarSoulTopic(topics, action.filename);
  if (!similar) return action;
  return { ...action, action: "update", filename: similar.filename };
}
