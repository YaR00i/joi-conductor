import type { MistressId } from "../../mistress/types";
import { compactMistressOs, sessionKindLabelRu } from "./catalog";
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

function liveLines(live: ControlLiveSnapshot): string[] {
  const lines: string[] = [];
  if (live.wear) {
    const label = live.wear.kind === "plug" ? "plug" : "cage";
    lines.push(
      `Wear: ${label} ${formatHoursLeft(live.wear.remainingMs)} left (${live.wear.hours}h set).`,
    );
  } else {
    lines.push("Wear: none.");
  }
  if (live.denial) {
    lines.push(
      `Denial: ${formatHoursLeft(live.denial.remainingMs)} left, edges ${live.denial.edgesDone}/${live.denial.edgesTarget}.`,
    );
  } else {
    lines.push("Denial: none.");
  }
  if (live.clothing.active) {
    lines.push(`Clothing: ${live.clothing.detail}`);
  }
  if (live.checkIn) {
    const when = live.checkInOverdue
      ? "overdue — you may ask for a report after he is already talking, not instead of a hello"
      : `due ${new Date(live.checkIn.atMs).toLocaleString()}`;
    lines.push(`Check-in (${live.checkIn.kind}): ${when}. ${live.checkIn.note}`.trim());
  } else {
    lines.push("Check-in: none.");
  }
  return lines;
}

function moodLine(state: ControlState): string {
  const mood = moodFromScore(state.moodScore);
  return `MOOD: ${mood} (score ${state.moodScore}) — comment only, do not change it.`;
}

function dispatchLines(state: ControlState): string[] {
  const phase: DispatchPhase = state.dispatch.phase;
  switch (phase) {
    case "idle":
      return [
        "Dispatch: idle. Session offers, morning reports, and punishments are app commands — speak only.",
      ];
    case "morning": {
      const titles = listMorningContracts(state)
        .map((row) => row.titleRu)
        .join("; ");
      return [
        `Dispatch: morning pack is OPEN in the app${titles ? ` (${titles})` : ""}.`,
        "Refusing a SESSION is not skipping morning chores. Do not set_wear this turn.",
      ];
    }
    case "session_offer":
      return [
        "Dispatch: a SESSION offer is open in the app (agree / refuse).",
        "If he refuses the session, that is not a morning skip. Speak only. Do not set_wear or set_denial.",
      ];
    case "punish": {
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

export function buildControlPromptSlice(
  mistressId: MistressId,
  state: ControlState,
  live: ControlLiveSnapshot,
  userText: string,
): string {
  const rules = state.rules.notes.slice(0, 8);
  const trigger = pickRelevantTrigger(state.triggers, userText);
  const progression = pickProgression(state.progressions, userText);
  const kinds = state.lastSessionKinds
    .slice(-4)
    .map((k: MistressSessionKind) => sessionKindLabelRu(k));
  return [
    compactMistressOs(mistressId),
    "",
    "--- CONTROL ---",
    moodLine(state),
    ...liveLines(live),
    ...dispatchLines(state),
    rules.length ? `Rules:\n${rules.map((n) => `- ${n}`).join("\n")}` : "",
    progression
      ? `Progression: ${progression.labelRu} lv${progression.level}. ${progression.note}`.trim()
      : "",
    trigger
      ? `Trigger: ${trigger.actionRu} — ${trigger.need} needs an order. Phrases: ${trigger.phrases.slice(0, 3).join(" / ")}`
      : "",
    kinds.length ? `Recent session kinds: ${kinds.join(", ")}` : "",
    state.pendingProposal
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
