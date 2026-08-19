/** Post-session denial / no-touch quest (survives app reload). */

const STORAGE_KEY = "joi-conductor.denialQuest";

export type DenialQuest = {
  untilMs: number;
  hours: number;
  setAtMs: number;
  /** Required edges during the quest window (0 = pure no-touch). */
  edgesTarget: number;
  edgesDone: number;
};

export function loadDenialQuest(): DenialQuest | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DenialQuest;
    if (
      typeof parsed.untilMs !== "number" ||
      typeof parsed.hours !== "number" ||
      typeof parsed.setAtMs !== "number" ||
      typeof parsed.edgesTarget !== "number" ||
      typeof parsed.edgesDone !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setDenialQuest(
  hours: number,
  edgesTarget = 0,
): DenialQuest {
  const h = Math.max(0.25, Math.min(48, hours));
  const setAtMs = Date.now();
  const quest: DenialQuest = {
    hours: h,
    setAtMs,
    untilMs: setAtMs + h * 3600_000,
    edgesTarget: Math.max(0, Math.min(20, Math.round(edgesTarget))),
    edgesDone: 0,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quest));
  } catch {
    // ignore quota
  }
  return quest;
}

export function clearDenialQuest(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function denialRemainingMs(
  quest: DenialQuest,
  nowMs = Date.now(),
): number {
  return Math.max(0, quest.untilMs - nowMs);
}

export function denialIsActive(
  quest: DenialQuest | null,
  nowMs = Date.now(),
): boolean {
  return quest != null && denialRemainingMs(quest, nowMs) > 0;
}

export function denialEdgesComplete(quest: DenialQuest): boolean {
  return quest.edgesDone >= quest.edgesTarget;
}

export function reportDenialEdge(): DenialQuest | null {
  const q = loadDenialQuest();
  if (!q || !denialIsActive(q)) return null;
  const next: DenialQuest = {
    ...q,
    edgesDone: Math.min(q.edgesTarget, q.edgesDone + 1),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function formatDenialRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}ч ${String(m).padStart(2, "0")}м`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
