import { seedSoulFactsIfEmpty } from "./control/seed";
import type { CharacterBible } from "../character";
import type { MistressId } from "../mistress/types";
import { characterMemoryToMd, userMemoryToMd } from "./markdown";
import {
  emptyMistressState,
  isSoulMemoryMode,
  type SoulChatMessage,
  type SoulMistressState,
  type SoulStoreFile,
  type SoulTopicFile,
} from "./types";

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

function hydrateMarkdown(state: SoulMistressState): SoulMistressState {
  return {
    ...state,
    memoryMd: state.memoryMd.trim() || characterMemoryToMd(state.character),
    userMd: state.userMd.trim() || userMemoryToMd(state.user),
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
    },
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

export function saveSoulState(
  mistressId: MistressId,
  state: SoulMistressState,
): void {
  const file = readStore();
  file.byMistress[mistressId] = hydrateMarkdown(state);
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
