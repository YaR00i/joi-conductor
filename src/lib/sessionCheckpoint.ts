import type { MistressId } from "./mistress/types";
import type { SessionState } from "./types";

const STORAGE_KEY = "joi-session-checkpoint-v1";
/** Discard checkpoints older than this (ms). */
export const CHECKPOINT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export type SessionCheckpointMeta = {
  pressureHeatBand: number;
  edgesTaxCount: number;
  recentGoals: string[];
  lastPromptId: string | null;
  beatBlockCount: number;
};

export type SessionCheckpoint = {
  version: 1;
  savedAtMs: number;
  mistressId: MistressId;
  /** Wall-clock elapsed at save (for UI). */
  elapsedSec: number;
  edgesDone: number;
  edgesTarget: number;
  state: SessionState;
  meta: SessionCheckpointMeta;
};

export function saveSessionCheckpoint(cp: SessionCheckpoint): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cp));
  } catch {
    // quota / private mode
  }
}

export function loadSessionCheckpoint(): SessionCheckpoint | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionCheckpoint;
    if (parsed?.version !== 1 || !parsed.state || !parsed.meta) return null;
    if (
      parsed.state.status !== "running" &&
      parsed.state.status !== "paused"
    ) {
      return null;
    }
    if (Date.now() - parsed.savedAtMs > CHECKPOINT_MAX_AGE_MS) {
      clearSessionCheckpoint();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSessionCheckpoint(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function formatCheckpointAge(savedAtMs: number, now = Date.now()): string {
  const sec = Math.max(0, Math.floor((now - savedAtMs) / 1000));
  if (sec < 60) return `${sec}с назад`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  return `${h}ч ${m % 60}м назад`;
}

/** Strip performance.now()-relative fields so restore can re-arm clocks. */
export function sanitizeStateForCheckpoint(state: SessionState): SessionState {
  return {
    ...state,
    status: "paused",
    beatOriginPerf: null,
    beatUntilAtMs: null,
    blockEnteredAtPerf: null,
    confirmRequestAtPerf: null,
    holdGraceUntilPerf: null,
    timerTease: null,
    activeQuest: state.activeQuest
      ? {
          ...state.activeQuest,
          endsAtPerf: 0,
        }
      : state.activeQuest,
  };
}
