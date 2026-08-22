import {
  cageIsActive,
  cageRemainingMs,
  loadCageLock,
} from "../../cageTimer";
import {
  denialIsActive,
  denialRemainingMs,
  loadDenialQuest,
} from "../../denialQuest";
import type { ControlLiveSnapshot, ControlState } from "./types";

export function controlLiveSnapshot(
  state: ControlState,
  nowMs = Date.now(),
): ControlLiveSnapshot {
  const lock = loadCageLock();
  const wear =
    cageIsActive(lock, nowMs) && lock
      ? {
          kind: lock.kind === "plug" ? ("plug" as const) : ("cage" as const),
          hours: lock.hours,
          untilMs: lock.untilMs,
          remainingMs: cageRemainingMs(lock, nowMs),
        }
      : null;
  const quest = loadDenialQuest();
  const denial =
    denialIsActive(quest, nowMs) && quest
      ? {
          hours: quest.hours,
          untilMs: quest.untilMs,
          remainingMs: denialRemainingMs(quest, nowMs),
          edgesTarget: quest.edgesTarget,
          edgesDone: quest.edgesDone,
        }
      : null;
  const checkIn = state.checkIn;
  return {
    wear,
    denial,
    clothing: state.clothing,
    checkIn,
    checkInOverdue: Boolean(checkIn && checkIn.atMs <= nowMs),
  };
}

export function formatHoursLeft(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}ч ${String(m).padStart(2, "0")}м`;
  return `${m}м`;
}
