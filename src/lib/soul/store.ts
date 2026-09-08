import { seedSoulFactsIfEmpty } from "./control/seed";
import type { CharacterBible } from "../character";
import type { MistressId } from "../mistress/types";
import { characterMemoryToMd, userMemoryToMd } from "./markdown";
import {
  emptyMistressState,
  emptySoulInitiative,
  isSoulIntentSource,
  isSoulIntentTone,
  isSoulMemoryMode,
  clampSoulIntentPriority,
  SOUL_INITIATIVE_CONSUMED_CAP,
  SOUL_OPEN_LOOPS_CAP,
  SOUL_RECENT_EVENTS_CAP,
  type SoulCharacterIntent,
  type SoulChatMessage,
  type SoulInitiativeState,
  type SoulMistressState,
  type SoulOpenLoop,
  type SoulStoreFile,
  type SoulTopicFile,
  type SoulWorldEvent,
} from "./types";
import { asStances } from "./stance";
import {
  asSoulOpenLoop,
  asSoulWorldEvent,
  soulConductorStamp,
} from "./worldEvents";

export const SOUL_STORAGE_KEY = "joi-soul-v1";

function asMessages(raw: unknown): SoulChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: SoulChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Partial<SoulChatMessage>;
    if (rec.role !== "user" && rec.role !== "assistant") continue;
    if (typeof rec.text !== "string" || !rec.text.trim()) continue;
    out.push({
      id:
        typeof rec.id === "string" && rec.id.trim()
          ? rec.id
          : `m${out.length}`,
      role: rec.role,
      text: rec.text,
      atMs: typeof rec.atMs === "number" ? rec.atMs : 0,
      ...(typeof rec.cloudContextId === "string" && rec.cloudContextId
        ? { cloudContextId: rec.cloudContextId.slice(0, 100) } : {}),
      ...(typeof rec.think === "string" && rec.think.trim()
        ? { think: rec.think.trim().slice(0, 8000) }
        : {}),
    });
  }
  return out.slice(-200);
}

function asTopics(raw: unknown): SoulTopicFile[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Partial<SoulTopicFile>;
      if (typeof rec.filename !== "string" || typeof rec.body !== "string") {
        return null;
      }
      return { filename: rec.filename, body: rec.body };
    })
    .filter((t): t is SoulTopicFile => t !== null)
    .slice(0, 40);
}

function asRecentEvents(raw: unknown): SoulWorldEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(asSoulWorldEvent)
    .filter((row): row is SoulWorldEvent => row !== null)
    .slice(-SOUL_RECENT_EVENTS_CAP);
}

function asOpenLoops(raw: unknown): SoulOpenLoop[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(asSoulOpenLoop)
    .filter((row): row is SoulOpenLoop => row !== null)
    .slice(-SOUL_OPEN_LOOPS_CAP);
}

function asIntent(raw: unknown): SoulCharacterIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Partial<SoulCharacterIntent>;
  if (typeof rec.goal !== "string" || !rec.goal.trim()) return null;
  if (!isSoulIntentTone(rec.tone) || !isSoulIntentSource(rec.source)) return null;
  const subject =
    typeof rec.subject === "string" && rec.subject.trim()
      ? rec.subject.trim()
      : undefined;
  const candidateId =
    typeof rec.candidateId === "string" && rec.candidateId.trim()
      ? rec.candidateId.trim()
      : undefined;
  return {
    goal: rec.goal.trim().slice(0, 180),
    tone: rec.tone,
    source: rec.source,
    priority: clampSoulIntentPriority(
      typeof rec.priority === "number" ? rec.priority : 1,
    ),
    ...(typeof rec.expiresAtMs === "number" && Number.isFinite(rec.expiresAtMs)
      ? { expiresAtMs: rec.expiresAtMs }
      : {}),
    ...(subject ? { subject } : {}),
    ...(candidateId ? { candidateId } : {}),
  };
}

function asInitiative(raw: unknown): SoulInitiativeState {
  const empty = emptySoulInitiative();
  if (!raw || typeof raw !== "object") return empty;
  const rec = raw as Partial<SoulInitiativeState>;
  const lastAtMs =
    rec.lastAtMs === null
      ? null
      : typeof rec.lastAtMs === "number" && Number.isFinite(rec.lastAtMs)
        ? rec.lastAtMs
        : null;
  const consumedIds = Array.isArray(rec.consumedIds)
    ? rec.consumedIds
        .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
        .map((id) => id.trim())
        .slice(-SOUL_INITIATIVE_CONSUMED_CAP)
    : [];
  return { lastAtMs, consumedIds };
}

function hydrateMarkdown(state: SoulMistressState): SoulMistressState {
  return {
    ...state,
    memoryMd: characterMemoryToMd(state.character),
    userMd: userMemoryToMd(state.user),
  };
}

function parseMistressState(
  raw: unknown,
  bible: CharacterBible,
): SoulMistressState {
  const base = emptyMistressState(bible.nameRu, bible.tone);
  if (!raw || typeof raw !== "object") return hydrateMarkdown(base);
  const rec = raw as Partial<SoulMistressState>;
  const mode = isSoulMemoryMode(rec.mode) ? rec.mode : 0;
  const pending =
    typeof rec.pendingSinceRouter === "number" &&
    Number.isFinite(rec.pendingSinceRouter)
      ? Math.max(0, Math.round(rec.pendingSinceRouter))
      : 0;
  return hydrateMarkdown({
    ...base,
    memoryMd: typeof rec.memoryMd === "string" ? rec.memoryMd : base.memoryMd,
    userMd: typeof rec.userMd === "string" ? rec.userMd : base.userMd,
    diaryMd: typeof rec.diaryMd === "string" ? rec.diaryMd : "",
    topics: asTopics(rec.topics),
    messages: asMessages(rec.messages),
    pendingSinceRouter: pending,
    mode,
    character: {
      ...base.character,
      ...(rec.character && typeof rec.character === "object"
        ? rec.character
        : {}),
    },
    user: {
      ...base.user,
      ...(rec.user && typeof rec.user === "object" ? rec.user : {}),
      stances: asStances(
        rec.user && typeof rec.user === "object"
          ? (rec.user as { stances?: unknown }).stances
          : [],
      ),
    },
    recentEvents: asRecentEvents(rec.recentEvents),
    openLoops: asOpenLoops(rec.openLoops),
    intent: asIntent(rec.intent),
    initiative: asInitiative(rec.initiative),
  });
}

function readStore(): SoulStoreFile {
  try {
    const raw = localStorage.getItem(SOUL_STORAGE_KEY);
    if (!raw) return { version: 1, byMistress: {} };
    const parsed = JSON.parse(raw) as Partial<SoulStoreFile>;
    if (!parsed || parsed.version !== 1 || typeof parsed.byMistress !== "object") {
      return { version: 1, byMistress: {} };
    }
    return { version: 1, byMistress: parsed.byMistress ?? {} };
  } catch {
    return { version: 1, byMistress: {} };
  }
}

function writeStore(file: SoulStoreFile): void {
  try {
    localStorage.setItem(SOUL_STORAGE_KEY, JSON.stringify(file));
  } catch {
    // quota / private mode
  }
}

function asMilestones(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const user = (raw as { user?: { sharedMilestones?: unknown } }).user;
  if (!Array.isArray(user?.sharedMilestones)) return [];
  return user.sharedMilestones
    .filter((row): row is string => typeof row === "string" && Boolean(row.trim()))
    .slice(-8);
}

export function loadSoulState(
  mistressId: MistressId,
  bible: CharacterBible,
): SoulMistressState {
  const file = readStore();
  const parsed = parseMistressState(file.byMistress[mistressId], bible);
  const seeded = seedSoulFactsIfEmpty(mistressId, parsed);
  if (seeded !== parsed) saveSoulState(mistressId, seeded);
  return seeded;
}

/**
 * Chat persist can lag behind a Conductor event write. Keep the newer
 * recentEvents/openLoops/milestones so a stale thread save cannot drop them.
 */
export function saveSoulState(
  mistressId: MistressId,
  state: SoulMistressState,
): void {
  const file = readStore();
  const incoming = hydrateMarkdown(state);
  const prevRaw = file.byMistress[mistressId];
  const prevEvents = asRecentEvents(
    prevRaw && typeof prevRaw === "object"
      ? (prevRaw as { recentEvents?: unknown }).recentEvents
      : [],
  );
  const prevLoops = asOpenLoops(
    prevRaw && typeof prevRaw === "object"
      ? (prevRaw as { openLoops?: unknown }).openLoops
      : [],
  );
  const prevStamp = soulConductorStamp({
    recentEvents: prevEvents,
    openLoops: prevLoops,
  });
  const nextStamp = soulConductorStamp(incoming);
  const keepPrevConductor = prevStamp > nextStamp;
  const toSave = keepPrevConductor
    ? {
        ...incoming,
        recentEvents: prevEvents,
        openLoops: prevLoops,
        user: {
          ...incoming.user,
          sharedMilestones: asMilestones(prevRaw),
          stances:
            prevRaw &&
            typeof prevRaw === "object" &&
            (prevRaw as { user?: { stances?: unknown } }).user &&
            Array.isArray(
              (prevRaw as { user: { stances?: unknown } }).user.stances,
            )
              ? asStances(
                  (prevRaw as { user: { stances?: unknown } }).user.stances,
                )
              : incoming.user.stances,
        },
      }
    : incoming;
  file.byMistress[mistressId] = hydrateMarkdown(toSave);
  writeStore(file);
}

export function newSoulMessage(
  role: SoulChatMessage["role"],
  text: string,
  atMs = Date.now(),
  think?: string,
): SoulChatMessage {
  const thought = think?.trim().slice(0, 8000);
  return {
    id: `${atMs.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text: text.trim(),
    atMs,
    ...(thought ? { think: thought } : {}),
  };
}

export function clearSoulMessages(
  state: SoulMistressState,
): SoulMistressState {
  return { ...state, messages: [], pendingSinceRouter: 0 };
}

export function clearSoulDiary(state: SoulMistressState): SoulMistressState {
  return { ...state, diaryMd: "" };
}

export function clearSoulTopics(state: SoulMistressState): SoulMistressState {
  return { ...state, topics: [] };
}
