import type { MistressId } from "../../mistress/types";
import { sessionKindLabelRu } from "./catalog";
import { formatHoursLeft } from "./live";
import { moodFromScore } from "../../moodEngine";
import { findContract } from "../../contracts/dailyBoard";
import { listMorningContracts } from "./dispatch";
import type {
  ControlLiveSnapshot,
  ControlState,
  DispatchPhase,
  MistressSessionKind,
  ProgressionTrack,
  TriggerEntry,
} from "./types";
import {
  detectSoulTurnSubjects,
  type SoulCanonicalSubject,
} from "../conversationMode";

function pickRelevantTrigger(
  triggers: readonly TriggerEntry[],
  userText: string,
): TriggerEntry | null {
  const q = userText.trim().toLowerCase();
  if (!q) return null;
  return (
    triggers.find(
      (t) =>
        q.includes(t.id.toLowerCase()) ||
        t.phrases.some((p) => p.length > 2 && q.includes(p.toLowerCase())),
    ) ?? null
  );
}

function pickProgression(
  tracks: readonly ProgressionTrack[],
  userText: string,
): ProgressionTrack | null {
  const q = userText.trim().toLowerCase();
  if (!q) return null;
  return (
    tracks.find(
      (t) => q.includes(t.id) || q.includes(t.labelRu.toLowerCase()),
    ) ?? null
  );
}

function relevantLiveLines(
  live: ControlLiveSnapshot,
  subjects: ReadonlySet<SoulCanonicalSubject>,
): string[] {
  const lines: string[] = [];
  if (subjects.has("wear:cage")) {
    lines.push(
      live.wear?.kind === "cage"
        ? `Cage: ${formatHoursLeft(live.wear.remainingMs)} left (${live.wear.hours}h set).`
        : "Cage: not worn.",
    );
  }
  if (subjects.has("wear:plug")) {
    lines.push(
      live.wear?.kind === "plug"
        ? `Plug: ${formatHoursLeft(live.wear.remainingMs)} left (${live.wear.hours}h set).`
        : "Plug: not worn.",
    );
  }
  if (
    subjects.has("denial") ||
    subjects.has("edging") ||
    subjects.has("orgasm") ||
    subjects.has("masturbation") ||
    subjects.has("ruin")
  ) {
    lines.push(
      live.denial
        ? `Denial: ${formatHoursLeft(live.denial.remainingMs)} left, edges ${live.denial.edgesDone}/${live.denial.edgesTarget}.`
        : "Denial: inactive.",
    );
  }
  if (subjects.has("clothing") || subjects.has("appearance")) {
    lines.push(
      live.clothing.active
        ? `Clothing: ${live.clothing.detail}`
        : "Clothing: no active instruction.",
    );
  }
  if (subjects.has("checkin") && live.checkIn) {
    const when = live.checkInOverdue
      ? "overdue — you may ask for a report after he is already talking, not instead of a hello"
      : `due ${new Date(live.checkIn.atMs).toLocaleString()}`;
    lines.push(`Check-in (${live.checkIn.kind}): ${when}. ${live.checkIn.note}`.trim());
  }
  return lines;
}

function moodLine(state: ControlState): string {
  const mood = moodFromScore(state.moodScore);
  return `MOOD: ${mood} (score ${state.moodScore}) — comment only, do not change it.`;
}

function dispatchLines(
  state: ControlState,
  subjects: ReadonlySet<SoulCanonicalSubject>,
): string[] {
  const phase: DispatchPhase = state.dispatch.phase;
  const sessionRelevant = subjects.has("session");
  const taskRelevant = subjects.has("task") || subjects.has("contract");
  const checkInRelevant = subjects.has("checkin");
  switch (phase) {
    case "idle":
      return [];
    case "morning": {
      if (!taskRelevant && !checkInRelevant) return [];
      const titles = listMorningContracts(state)
        .map((row) => row.titleRu)
        .join("; ");
      return [
        `Dispatch: morning pack is OPEN in the app${titles ? ` (${titles})` : ""}.`,
        "Refusing a SESSION is not skipping morning chores. Do not set_wear this turn.",
      ];
    }
    case "session_offer":
      if (!sessionRelevant) return [];
      return [
        "Dispatch: a SESSION offer is open in the app (agree / refuse).",
        "If he refuses the session, that is not a morning skip. Speak only. Do not set_wear or set_denial.",
      ];
    case "punish": {
      if (!taskRelevant && !sessionRelevant) return [];
      const titles = state.dispatch.punishIds
        .map((id) => findContract(id)?.titleRu)
        .filter((title): title is string => Boolean(title))
        .join("; ");
      return [
        `Dispatch: punishment is already in the app as contracts${titles ? `: ${titles}` : ""}.`,
        "He accepts a chip to start a timer. Do not set_wear, set_denial, or start a cage yourself this turn.",
      ];
    }
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

function progressionSubjects(id: ProgressionTrack["id"]): SoulCanonicalSubject[] {
  switch (id) {
    case "cage":
      return ["wear:cage"];
    case "plug":
      return ["wear:plug"];
    case "ruin_cei":
      return ["ruin", "cei"];
    case "session_variety":
      return ["session"];
    case "sensitivity":
      return ["masturbation", "orgasm", "edging"];
    case "oral":
      return ["session"];
    case "morning":
      return ["checkin", "task"];
    case "smooth":
      return ["appearance"];
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

function subjectsOverlap(
  left: readonly SoulCanonicalSubject[],
  right: ReadonlySet<SoulCanonicalSubject>,
): boolean {
  return left.some((subject) => right.has(subject));
}

function ruleSubjects(note: string): SoulCanonicalSubject[] {
  if (/(гладк|брит|shav)/i.test(note)) return ["appearance"];
  if (/(утрен|morning)/i.test(note)) return ["task", "checkin"];
  return detectSoulTurnSubjects(note);
}

export function buildControlPromptSlice(
  _mistressId: MistressId,
  state: ControlState,
  live: ControlLiveSnapshot,
  userText: string,
  requestedSubjects: readonly SoulCanonicalSubject[] = detectSoulTurnSubjects(userText),
): string {
  const subjects = new Set(requestedSubjects);
  if (subjects.size === 0) return "";
  const rules = state.rules.notes
    .filter((note) => subjectsOverlap(ruleSubjects(note), subjects))
    .slice(0, 4);
  const trigger = pickRelevantTrigger(state.triggers, userText);
  const directProgression = pickProgression(state.progressions, userText);
  const progression =
    directProgression ??
    state.progressions.find((row) =>
      subjectsOverlap(progressionSubjects(row.id), subjects),
    ) ??
    null;
  const kinds = state.lastSessionKinds
    .slice(-4)
    .map((k: MistressSessionKind) => sessionKindLabelRu(k));
  const liveShown = relevantLiveLines(live, subjects);
  const orgasmRelevant = [
    "session",
    "masturbation",
    "orgasm",
    "edging",
    "denial",
    "ruin",
    "cei",
  ].some((subject) => subjects.has(subject as SoulCanonicalSubject));
  return [
    "--- CONTROL ---",
    subjects.has("mood") ? moodLine(state) : "",
    ...liveShown,
    orgasmRelevant
      ? `Orgasm permission required: ${state.rules.orgasmNeedsPermission ? "yes" : "no"}.`
      : "",
    ...dispatchLines(state, subjects),
    rules.length ? `Relevant rules:\n${rules.map((n) => `- ${n}`).join("\n")}` : "",
    progression
      ? `Progression: ${progression.labelRu} lv${progression.level}. ${progression.note}`.trim()
      : "",
    trigger
      ? `Trigger: ${trigger.actionRu} — ${trigger.need} needs an order. Phrases: ${trigger.phrases.slice(0, 3).join(" / ")}`
      : "",
    subjects.has("session") && kinds.length
      ? `Recent session kinds: ${kinds.join(", ")}`
      : "",
    subjects.has("session") && state.pendingProposal
      ? `Pending her session: ${sessionKindLabelRu(state.pendingProposal.kind)}, ${state.pendingProposal.durationSec}s, edges ${state.pendingProposal.edgesTarget}, ${state.pendingProposal.finalePolicy}.`
      : "",
    "CONTROL is private state. Do not recap timers, check-ins, or rules unless you are changing an order this turn.",
    "Do not seed a session on a greeting or small talk. Session offers, morning reports, and punishments are app cards — speak only.",
    "If he refuses a session, comment on the SESSION refusal only. Do not treat it as skipping morning exercise.",
    "If you want a cage, plug, denial, or a Conductor session, say it in speech (what, and if you can — for how long). The app will show accept cards under your bubble. Do not write Контракт: or Задание: — you do not create contracts.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
