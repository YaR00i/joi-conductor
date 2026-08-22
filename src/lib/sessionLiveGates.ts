import { cageIsActive, loadCageLock, type WearTimerKind } from "./cageTimer";
import { denialIsActive, loadDenialQuest } from "./denialQuest";
import type { SessionMode } from "./types";

export type LiveWearGate = {
  wearKind: WearTimerKind | null;
  denialOn: boolean;
};

const SESSION_MODES: readonly SessionMode[] = [
  "stroke",
  "anal",
  "chastity",
  "onahole",
  "cbt",
  "oral",
  "prone",
  "plapping",
];

export function readLiveWearGate(nowMs = Date.now()): LiveWearGate {
  const lock = loadCageLock();
  const wearKind =
    cageIsActive(lock, nowMs) && lock
      ? lock.kind === "plug"
        ? "plug"
        : "cage"
      : null;
  const denial = loadDenialQuest();
  return {
    wearKind,
    denialOn: denialIsActive(denial, nowMs),
  };
}

export function isModeAllowedForLive(
  mode: SessionMode,
  gate: LiveWearGate,
): boolean {
  if (gate.wearKind === "cage") {
    switch (mode) {
      case "chastity":
      case "cbt":
      case "plapping":
      case "prone":
      case "anal":
        return true;
      case "stroke":
      case "onahole":
      case "oral":
        return false;
      default: {
        const _exhaustive: never = mode;
        return _exhaustive;
      }
    }
  }
  return true;
}

export function allowedModesForLive(gate: LiveWearGate): SessionMode[] {
  return SESSION_MODES.filter((mode) => isModeAllowedForLive(mode, gate));
}

export function filterOptionsByLiveMode<T extends { id: string }>(
  options: T[],
  gate: LiveWearGate,
): T[] {
  const kept = options.filter((opt) => {
    const mode = opt.id as SessionMode;
    if (!(SESSION_MODES as readonly string[]).includes(mode)) return true;
    return isModeAllowedForLive(mode, gate);
  });
  return kept.length > 0 ? kept : options;
}
