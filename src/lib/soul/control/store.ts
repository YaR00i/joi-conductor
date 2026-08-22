import type { MistressId } from "../../mistress/types";
import {
  defaultControlState,
  emptyDispatch,
  isCheckInKind,
  isDispatchPhase,
  isFinalePolicy,
  isMistressSessionKind,
  isProgressionId,
  isTriggerNeed,
} from "./catalog";
import {
  CONTROL_CHANGED_EVENT,
  CONTROL_STORAGE_KEY,
  PROGRESSION_IDS,
  type ControlCheckIn,
  type ControlDispatch,
  type ControlState,
  type ControlStoreFile,
  type MistressSessionKind,
  type MistressSessionProposal,
  type ProgressionTrack,
  type TriggerEntry,
} from "./types";
import { clampMoodScore } from "../../moodEngine";

function asProgressions(raw: unknown, fallback: ProgressionTrack[]): ProgressionTrack[] {
  if (!Array.isArray(raw)) return fallback.map((p) => ({ ...p }));
  const byId = new Map<string, ProgressionTrack>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Partial<ProgressionTrack>;
    if (!isProgressionId(rec.id)) continue;
    byId.set(rec.id, {
      id: rec.id,
      level:
        typeof rec.level === "number" && Number.isFinite(rec.level)
          ? Math.max(0, Math.min(5, Math.round(rec.level)))
          : 0,
      labelRu: typeof rec.labelRu === "string" ? rec.labelRu : rec.id,
      note: typeof rec.note === "string" ? rec.note : "",
    });
  }
  return PROGRESSION_IDS.map(
    (id) => byId.get(id) ?? fallback.find((p) => p.id === id) ?? {
      id,
      level: 0,
      labelRu: id,
      note: "",
    },
  );
}

function asTriggers(raw: unknown): TriggerEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: TriggerEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Partial<TriggerEntry>;
    if (typeof rec.id !== "string" || !rec.id.trim()) continue;
    out.push({
      id: rec.id.trim(),
      actionRu: typeof rec.actionRu === "string" ? rec.actionRu : rec.id,
      need: isTriggerNeed(rec.need) ? rec.need : "optional",
      phrases: Array.isArray(rec.phrases)
        ? rec.phrases.filter((p): p is string => typeof p === "string").slice(0, 8)
        : [],
    });
  }
  return out.slice(0, 24);
}

function asCheckIn(raw: unknown): ControlCheckIn | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Partial<ControlCheckIn>;
  if (typeof rec.atMs !== "number" || !Number.isFinite(rec.atMs)) return null;
  if (!isCheckInKind(rec.kind)) return null;
  return {
    atMs: rec.atMs,
    kind: rec.kind,
    note: typeof rec.note === "string" ? rec.note : "",
  };
}

function asProposal(raw: unknown): MistressSessionProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Partial<MistressSessionProposal> & { kind?: unknown };
  if (!isMistressSessionKind(rec.kind)) return null;
  if (typeof rec.durationSec !== "number" || typeof rec.edgesTarget !== "number") {
    return null;
  }
  if (!isFinalePolicy(rec.finalePolicy)) return null;
  if (typeof rec.atMs !== "number") return null;
  return {
    kind: rec.kind,
    durationSec: rec.durationSec,
    edgesTarget: rec.edgesTarget,
    mode: rec.mode === "prone" || rec.mode === "oral" || rec.mode === "anal" || rec.mode === "chastity" || rec.mode === "cbt" || rec.mode === "stroke" || rec.mode === "onahole" || rec.mode === "plapping"
      ? rec.mode
      : "stroke",
    finalePolicy: rec.finalePolicy,
    noteRu: typeof rec.noteRu === "string" ? rec.noteRu : "",
    atMs: rec.atMs,
  };
}

function asKinds(raw: unknown): MistressSessionKind[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isMistressSessionKind).slice(-12);
}

function asDispatch(raw: unknown): ControlDispatch {
  const fallback = emptyDispatch();
  if (!raw || typeof raw !== "object") return fallback;
  const rec = raw as Partial<ControlDispatch>;
  return {
    phase: isDispatchPhase(rec.phase) ? rec.phase : "idle",
    morningIds: Array.isArray(rec.morningIds)
      ? rec.morningIds.filter((id): id is string => typeof id === "string").slice(0, 8)
      : [],
    punishIds: Array.isArray(rec.punishIds)
      ? rec.punishIds.filter((id): id is string => typeof id === "string").slice(0, 8)
      : [],
    taskIds: Array.isArray(rec.taskIds)
      ? rec.taskIds.filter((id): id is string => typeof id === "string").slice(0, 8)
      : [],
    lastOfferDate:
      typeof rec.lastOfferDate === "string" && rec.lastOfferDate.length >= 8
        ? rec.lastOfferDate
        : null,
  };
}

function parseControlState(
  raw: unknown,
  mistressId: MistressId,
): ControlState {
  const seed = defaultControlState(mistressId);
  if (!raw || typeof raw !== "object") return seed;
  const rec = raw as Partial<ControlState>;
  const seeded = rec.seeded === true;
  const moodScore =
    typeof rec.moodScore === "number" && Number.isFinite(rec.moodScore)
      ? clampMoodScore(rec.moodScore)
      : seed.moodScore;
  const moodAtMs =
    typeof rec.moodAtMs === "number" && Number.isFinite(rec.moodAtMs)
      ? rec.moodAtMs
      : 0;
  const lastShavedAtMs =
    typeof rec.lastShavedAtMs === "number" && Number.isFinite(rec.lastShavedAtMs)
      ? rec.lastShavedAtMs
      : null;
  const lastMorningDate =
    typeof rec.lastMorningDate === "string" && rec.lastMorningDate.length >= 8
      ? rec.lastMorningDate
      : null;
  return {
    version: 1,
    seeded: seeded || seed.seeded,
    clothing: {
      active: Boolean(rec.clothing?.active),
      detail:
        typeof rec.clothing?.detail === "string" ? rec.clothing.detail : "",
    },
    checkIn: asCheckIn(rec.checkIn),
    progressions: asProgressions(rec.progressions, seed.progressions),
    triggers: asTriggers(rec.triggers).length
      ? asTriggers(rec.triggers)
      : seed.triggers,
    lastSessionKinds: asKinds(rec.lastSessionKinds),
    pendingProposal: asProposal(rec.pendingProposal),
    rules: {
      smoothnessMin:
        typeof rec.rules?.smoothnessMin === "string"
          ? rec.rules.smoothnessMin
          : seed.rules.smoothnessMin,
      morningComplex: rec.rules?.morningComplex ?? seed.rules.morningComplex,
      orgasmNeedsPermission:
        rec.rules?.orgasmNeedsPermission ?? seed.rules.orgasmNeedsPermission,
      initiative: rec.rules?.initiative ?? seed.rules.initiative,
      notes: Array.isArray(rec.rules?.notes)
        ? rec.rules.notes.filter((n): n is string => typeof n === "string").slice(0, 8)
        : seed.rules.notes,
    },
    moodScore,
    moodAtMs,
    lastShavedAtMs,
    lastMorningDate,
    dispatch: asDispatch(rec.dispatch),
  };
}

function readStore(): ControlStoreFile {
  try {
    const raw = localStorage.getItem(CONTROL_STORAGE_KEY);
    if (!raw) return { version: 1, byMistress: {} };
    const parsed = JSON.parse(raw) as Partial<ControlStoreFile>;
    if (!parsed || parsed.version !== 1 || typeof parsed.byMistress !== "object") {
      return { version: 1, byMistress: {} };
    }
    return { version: 1, byMistress: parsed.byMistress ?? {} };
  } catch {
    return { version: 1, byMistress: {} };
  }
}

function writeStore(file: ControlStoreFile): void {
  try {
    localStorage.setItem(CONTROL_STORAGE_KEY, JSON.stringify(file));
  } catch {
    // quota
  }
}

export function loadControlState(mistressId: MistressId): ControlState {
  const file = readStore();
  const parsed = parseControlState(file.byMistress[mistressId], mistressId);
  if (!file.byMistress[mistressId]) {
    saveControlState(mistressId, parsed);
  }
  return parsed;
}

export function saveControlState(
  mistressId: MistressId,
  state: ControlState,
): void {
  const file = readStore();
  file.byMistress[mistressId] = state;
  writeStore(file);
}

export function notifyControlChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONTROL_CHANGED_EVENT));
}

export function saveControlMood(
  mistressId: MistressId,
  moodScore: number,
  atMs = Date.now(),
): ControlState {
  const next = {
    ...loadControlState(mistressId),
    moodScore: clampMoodScore(moodScore),
    moodAtMs: atMs,
  };
  saveControlState(mistressId, next);
  notifyControlChanged();
  return next;
}

export function applyControlMoodDelta(
  mistressId: MistressId,
  delta: number,
  atMs = Date.now(),
): ControlState {
  const cur = loadControlState(mistressId);
  return saveControlMood(mistressId, cur.moodScore + delta, atMs);
}

export function clearPendingProposal(mistressId: MistressId): ControlState {
  const next = { ...loadControlState(mistressId), pendingProposal: null };
  saveControlState(mistressId, next);
  notifyControlChanged();
  return next;
}
