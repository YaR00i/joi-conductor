import { scanJsonObjects } from "../json";
import type { MistressId } from "../../mistress/types";
import type { SessionMode } from "../../types";
import {
  isCheckInKind,
  isFinalePolicy,
  isProgressionId,
  isQueuePatchEdit,
  isTriggerNeed,
  isWearKind,
  modeForSessionKind,
  normalizeSessionKind,
} from "./catalog";
import { clearCageLock, setCageLock } from "../../cageTimer";
import {
  bindDenialQuestToContract,
  bindWearLockToContract,
} from "../../contracts/liveObligation";
import { clearDenialQuest, setDenialQuest } from "../../denialQuest";
import {
  applyMistressCensor,
  clearMistressCensor,
  isMediaCensorCoverage,
  isMediaCensorStyle,
  type MediaCensorCoverage,
  type MediaCensorStyle,
} from "../../mediaCensor";
import { loadControlState, notifyControlChanged, saveControlState } from "./store";
import type {
  AppliedControlResult,
  ControlAction,
  ControlState,
  MistressSessionProposal,
  QueuePatchEdit,
} from "./types";
import { isInitiativeOptOut } from "../conversationMode";

const CONTROL_OPS = [
  "set_wear",
  "clear_wear",
  "set_denial",
  "clear_denial",
  "set_checkin",
  "clear_checkin",
  "set_clothing",
  "clear_clothing",
  "bump_progression",
  "note_trigger",
  "propose_session",
  "patch_queue",
  "set_censor",
  "clear_censor",
] as const;

type ControlOp = (typeof CONTROL_OPS)[number];

const SESSION_MODES: SessionMode[] = [
  "stroke",
  "anal",
  "chastity",
  "onahole",
  "cbt",
  "oral",
  "prone",
  "plapping",
];

function notifyWearChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("joi-cage-lock-changed"));
}
function notifyDenialChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("joi-denial-quest-changed"));
}

function isSessionMode(v: unknown): v is SessionMode {
  return typeof v === "string" && (SESSION_MODES as string[]).includes(v);
}

function isControlOp(v: unknown): v is ControlOp {
  return typeof v === "string" && (CONTROL_OPS as readonly string[]).includes(v);
}

function readOp(rec: Record<string, unknown>): ControlOp | null {
  for (const key of ["op", "type", "action", "id"] as const) {
    if (isControlOp(rec[key])) return rec[key] as ControlOp;
  }
  return null;
}

function asHours(v: unknown, fallback: number, min: number, max: number): number {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim()
        ? Number(v)
        : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function asInt(v: unknown, fallback: number, min: number, max: number): number {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && /^-?\d+$/.test(v.trim())
        ? Number(v.trim())
        : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function asNote(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 240) : "";
}

function nextMorningAt(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(9, 0, 0, 0);
  if (d.getTime() <= nowMs) d.setDate(d.getDate() + 1);
  return d.getTime();
}

const SESSION_INVITE =
  /(?:давай|хочу|предлагаю|устрою|провед[еу]|начинаем|начн[её]м|запускай|запусти).{0,24}сесси|сесси[яию].{0,32}(будет|начина|запуск|устрою|предлагаю)|давай\s+(играть|эдж|hump)|хочу\s+эдж|her session|вот твоя сесс|заходи\b.{0,16}сесс/i;

const USER_ASKS_ORDER =
  /надень|сними|запир|запрети|клетк\w{0,8}\s+на|пробк\w{0,8}\s+на|давай\s+(сесс|эдж|hump|играть)|хочу\s+(сесс|эдж)|запусти|check-?in|поставь\s+(клет|проб|таймер)|руки прочь|отчёт по|отчет по|цензор|закрой.{0,12}(кадр|картин|медиа)|мозаик/i;

const SPEECH_ISSUES_ORDER =
  /(надень|запир|ставь клет|ставь проб|держи клет|запрещаю|руки прочь|не снимай|не вынимай|цензор|мозаик|закрываю.{0,16}(кадр|картин|медиа))|((клетк|пробк)\w{0,8}\s+на\s+(?:\d+|полтора|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять))|(на\s+(?:\d+|два|три|четыре|пять)\s*(час|мин))|(пиши.{0,16}через\s+\d)|(сесси[яию].{0,40}(минут|час|начина|запуск))/i;

export function looksLikeSessionInvite(text: string): boolean {
  const trimmed = text.trim();
  if (isInitiativeOptOut(trimmed)) return false;
  return SESSION_INVITE.test(trimmed);
}

/** True only if he asked for an order or she issued one this turn — not a status recap. */
export function looksLikeControlIntent(userText: string, speech = ""): boolean {
  const user = userText.trim();
  const spoken = speech.trim();
  if (looksLikeSessionInvite(user) || looksLikeSessionInvite(spoken)) return true;
  if (!isInitiativeOptOut(user) && USER_ASKS_ORDER.test(user)) return true;
  if (SPEECH_ISSUES_ORDER.test(spoken)) return true;
  return false;
}

/** A session-refuse turn must not silently start cage/plug/denial.
 *  Session/check-in now become proposals, not dropped. */
export function filterControlActions(
  actions: ControlAction[],
  userText: string,
  _speech: string,
): ControlAction[] {
  const refuseSession = /отказываюсь от сессии/i.test(userText);
  if (!refuseSession) return actions;
  return actions.filter((action) => {
    if (
      action.op === "set_wear" ||
      action.op === "clear_wear" ||
      action.op === "set_denial" ||
      action.op === "clear_denial"
    ) {
      return false;
    }
    return true;
  });
}

function readCensorStyle(v: unknown): MediaCensorStyle | undefined {
  if (isMediaCensorStyle(v)) return v;
  if (v === "pixel" || v === "pixelated" || v === "pixels") return "mosaic";
  if (v === "bar" || v === "black" || v === "box") return "bars";
  if (v === "text" || v === "label" || v === "censored") return "sticker";
  return undefined;
}

function readCensorCoverage(v: unknown): MediaCensorCoverage | undefined {
  if (isMediaCensorCoverage(v)) return v;
  if (v === "all" || v === "frame" || v === "whole") return "full";
  if (v === "parts" || v === "zones" || v === "body") return "bands";
  return undefined;
}

export function parseControlAction(raw: unknown): ControlAction | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const op = readOp(rec);
  if (!op) return null;
  switch (op) {
    case "set_wear":
      return isWearKind(rec.kind)
        ? { op, kind: rec.kind, hours: asHours(rec.hours, 3, 0.25, 24) }
        : null;
    case "clear_wear":
      return { op };
    case "set_denial":
      return {
        op,
        hours: asHours(rec.hours, 8, 0.25, 48),
        edges: asInt(rec.edges ?? rec.edgesTarget ?? rec.edgeTarget, 0, 0, 20),
      };
    case "clear_denial":
      return { op };
    case "set_checkin":
      return isCheckInKind(rec.kind)
        ? {
            op,
            kind: rec.kind,
            hours:
              rec.hours == null ? undefined : asHours(rec.hours, 2, 0.25, 72),
            note: asNote(rec.note),
          }
        : null;
    case "clear_checkin":
      return { op };
    case "set_clothing": {
      const detail = asNote(rec.detail);
      return detail ? { op, detail } : null;
    }
    case "clear_clothing":
      return { op };
    case "bump_progression": {
      const id = isProgressionId(rec.progression) ? rec.progression : rec.id;
      return isProgressionId(id)
        ? {
            op,
            id,
            level: rec.level == null ? undefined : asInt(rec.level, 1, 0, 5),
            note: asNote(rec.note),
          }
        : null;
    }
    case "note_trigger": {
      const id = typeof rec.trigger === "string" ? rec.trigger.trim() : asNote(rec.id);
      const phrase = asNote(rec.phrase);
      if (!id || isControlOp(id) || !phrase) return null;
      return {
        op,
        id,
        phrase,
        need: isTriggerNeed(rec.need) ? rec.need : undefined,
      };
    }
    case "propose_session": {
      const kind = normalizeSessionKind(rec.kind);
      const finale = isFinalePolicy(rec.finalePolicy)
        ? rec.finalePolicy
        : "ruin_norm";
      if (!kind) return null;
      return {
        op,
        kind,
        durationSec: asInt(rec.durationSec ?? rec.duration, 600, 180, 2400),
        edgesTarget: asInt(
          rec.edgesTarget ?? rec.edgeTarget ?? rec.edges,
          5,
          0,
          20,
        ),
        mode: isSessionMode(rec.mode) ? rec.mode : undefined,
        finalePolicy: finale,
        noteRu: asNote(rec.noteRu ?? rec.note),
      };
    }
    case "patch_queue":
      return isQueuePatchEdit(rec.edit) ? { op, edit: rec.edit } : null;
    case "set_censor": {
      const style = readCensorStyle(rec.style ?? rec.kind);
      const coverage = readCensorCoverage(rec.coverage);
      const strengthRaw = rec.strength ?? rec.level;
      const strength =
        typeof strengthRaw === "number" ||
        (typeof strengthRaw === "string" && /^-?\d+$/.test(strengthRaw.trim()))
          ? asInt(strengthRaw, 3, 1, 5)
          : undefined;
      return {
        op,
        ...(style ? { style } : {}),
        ...(coverage ? { coverage } : {}),
        ...(strength != null ? { strength } : {}),
      };
    }
    case "clear_censor":
      return { op };
    default: {
      const _exhaustive: never = op;
      return _exhaustive;
    }
  }
}

function actionListFrom(raw: Record<string, unknown>): unknown[] {
  if (Array.isArray(raw.actions)) return raw.actions;
  if (raw.actions && typeof raw.actions === "object") return [raw.actions];
  return [];
}

export function parseControlActions(raw: unknown): ControlAction[] {
  if (!raw || typeof raw !== "object") return [];
  const rec = raw as Record<string, unknown>;
  const fromList = actionListFrom(rec)
    .map(parseControlAction)
    .filter((a): a is ControlAction => a !== null);
  if (fromList.length > 0) return fromList.slice(0, 8);
  const single = parseControlAction(rec);
  return single ? [single] : [];
}

export function isControlJsonShape(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const rec = raw as Record<string, unknown>;
  return "actions" in rec;
}

export type ControlReplySplit = {
  speech: string;
  actions: ControlAction[];
};

/** Speech for the bubble; trailing actions JSON is executed, never shown. */
export function splitControlReply(raw: string): ControlReplySplit {
  const text = raw.trim();
  if (!text) return { speech: "", actions: [] };
  let wrapper: { start: number; actions: ControlAction[] } | null = null;
  let bare: { start: number; actions: ControlAction[] } | null = null;
  for (const hit of scanJsonObjects(text)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(hit.blob);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const rec = parsed as Record<string, unknown>;
    if ("actions" in rec) {
      wrapper = { start: hit.start, actions: parseControlActions(parsed) };
      continue;
    }
    const single = parseControlAction(parsed);
    if (single) bare = { start: hit.start, actions: [single] };
  }
  const found = wrapper ?? bare;
  if (!found) return { speech: text, actions: [] };
  const speech = text
    .slice(0, found.start)
    .replace(/```(?:json|JSON)?\s*$/u, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { speech, actions: found.actions };
}

function applyOne(
  state: ControlState,
  action: ControlAction,
  nowMs: number,
  queueEdits: QueuePatchEdit[],
  flags: { wear: boolean; denial: boolean },
): ControlState {
  switch (action.op) {
    case "set_wear": {
      const lock = setCageLock(action.hours, { kind: action.kind });
      bindWearLockToContract(lock);
      flags.wear = true;
      return state;
    }
    case "clear_wear":
      clearCageLock();
      flags.wear = true;
      return state;
    case "set_denial": {
      const quest = setDenialQuest(action.hours, action.edges);
      bindDenialQuestToContract(quest);
      flags.denial = true;
      return state;
    }
    case "clear_denial":
      clearDenialQuest();
      flags.denial = true;
      return state;
    case "set_checkin": {
      const atMs =
        action.kind === "hours"
          ? nowMs + (action.hours ?? 2) * 3600_000
          : action.kind === "morning"
            ? nextMorningAt(nowMs)
            : nowMs + 3600_000;
      return {
        ...state,
        checkIn: { atMs, kind: action.kind, note: action.note },
      };
    }
    case "clear_checkin":
      return { ...state, checkIn: null };
    case "set_clothing":
      return { ...state, clothing: { active: true, detail: action.detail } };
    case "clear_clothing":
      return { ...state, clothing: { active: false, detail: "" } };
    case "bump_progression":
      return {
        ...state,
        progressions: state.progressions.map((p) => {
          if (p.id !== action.id) return p;
          const level =
            action.level != null
              ? action.level
              : Math.min(5, p.level + 1);
          return {
            ...p,
            level,
            note: action.note || p.note,
          };
        }),
      };
    case "note_trigger": {
      const existing = state.triggers.find((t) => t.id === action.id);
      const nextEntry = existing
        ? {
            ...existing,
            need: action.need ?? existing.need,
            phrases: [...new Set([action.phrase, ...existing.phrases])].slice(
              0,
              8,
            ),
          }
        : {
            id: action.id,
            actionRu: action.id,
            need: action.need ?? "optional",
            phrases: [action.phrase],
          };
      return {
        ...state,
        triggers: [
          nextEntry,
          ...state.triggers.filter((t) => t.id !== action.id),
        ].slice(0, 24),
      };
    }
    case "propose_session": {
      const proposal: MistressSessionProposal = {
        kind: action.kind,
        durationSec: action.durationSec,
        edgesTarget: action.edgesTarget,
        mode: action.mode ?? modeForSessionKind(action.kind),
        finalePolicy: action.finalePolicy,
        noteRu: action.noteRu,
        atMs: nowMs,
      };
      return {
        ...state,
        pendingProposal: proposal,
        lastSessionKinds: [...state.lastSessionKinds, action.kind].slice(-12),
      };
    }
    case "patch_queue":
      queueEdits.push(action.edit === "pause" ? "insert_rest" : action.edit);
      return state;
    case "set_censor":
      applyMistressCensor({
        style: action.style,
        coverage: action.coverage,
        strength: action.strength,
      });
      return state;
    case "clear_censor":
      clearMistressCensor();
      return state;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function applyControlActions(
  mistressId: MistressId,
  actions: readonly ControlAction[],
  nowMs = Date.now(),
): AppliedControlResult {
  let state = loadControlState(mistressId);
  const queueEdits: QueuePatchEdit[] = [];
  const flags = { wear: false, denial: false };
  for (const action of actions) {
    state = applyOne(state, action, nowMs, queueEdits, flags);
  }
  saveControlState(mistressId, state);
  if (flags.wear) notifyWearChanged();
  if (flags.denial) notifyDenialChanged();
  notifyControlChanged();
  return {
    state,
    queueEdits,
    proposal: state.pendingProposal,
    wearChanged: flags.wear,
    denialChanged: flags.denial,
  };
}
