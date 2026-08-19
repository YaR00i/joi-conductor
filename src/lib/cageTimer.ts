/** Out-of-session wear timer (cage / plug) — survives app reload. */

const STORAGE_KEY = "joi-conductor.cageLock";

export type WearTimerKind = "cage" | "plug";

export type CageLock = {
  untilMs: number;
  hours: number;
  setAtMs: number;
  /** Defaults to cage for legacy saves. */
  kind?: WearTimerKind;
};

export function wearTimerLabelRu(kind: WearTimerKind | undefined): string {
  return kind === "plug" ? "Пробка" : "Клетка";
}

export function loadCageLock(): CageLock | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CageLock;
    if (
      typeof parsed.untilMs !== "number" ||
      typeof parsed.hours !== "number" ||
      typeof parsed.setAtMs !== "number"
    ) {
      return null;
    }
    const kind =
      parsed.kind === "plug" || parsed.kind === "cage" ? parsed.kind : "cage";
    return { ...parsed, kind };
  } catch {
    return null;
  }
}

export function setCageLock(
  hours: number,
  opts?: { kind?: WearTimerKind },
): CageLock {
  const h = Math.max(0.25, Math.min(24, hours));
  const setAtMs = Date.now();
  const kind: WearTimerKind = opts?.kind === "plug" ? "plug" : "cage";
  const lock: CageLock = {
    hours: h,
    setAtMs,
    untilMs: setAtMs + h * 3600_000,
    kind,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lock));
  } catch {
    // ignore quota
  }
  return lock;
}

export function clearCageLock(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function cageRemainingMs(lock: CageLock, nowMs = Date.now()): number {
  return Math.max(0, lock.untilMs - nowMs);
}

export function cageIsActive(lock: CageLock | null, nowMs = Date.now()): boolean {
  return lock != null && cageRemainingMs(lock, nowMs) > 0;
}

export function formatCageRemaining(ms: number): string {
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
