import type { ToyDef } from "./types";

const STORAGE_KEY = "joi-toys-owned-v1";

/** Persisted owned overrides keyed by toy id. Missing key → catalog default. */
export function loadToyOwnedOverrides(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, boolean> = {};
    for (const [id, v] of Object.entries(parsed)) {
      if (typeof v === "boolean") out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveToyOwnedOverrides(map: Record<string, boolean>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function resolveToys(
  catalog: ToyDef[],
  overrides: Record<string, boolean> = loadToyOwnedOverrides(),
): ToyDef[] {
  return catalog.map((t) => ({
    ...t,
    owned: overrides[t.id] ?? t.owned,
  }));
}

export function setToyOwned(
  overrides: Record<string, boolean>,
  toyId: string,
  owned: boolean,
): Record<string, boolean> {
  return { ...overrides, [toyId]: owned };
}
