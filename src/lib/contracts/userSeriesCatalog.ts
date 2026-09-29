/**
 * User-authored long-series catalog.
 * Authoring only — not save-slot progress. Mirrors userCatalog.ts.
 */

import { getContractDef } from "./catalog";
import {
  BUILTIN_SERIES_CATALOG,
  canonicalSeriesDef,
  coerceSeriesDefinition,
  expectedSeriesLength,
  getBuiltinSeriesDef,
  resizeSeriesDays,
  validateSeriesDef,
  type ContractSeriesDef,
} from "./seriesCatalog";

const STORAGE_KEY = "joi-user-contract-series-v1";
const ID_PREFIX = "user_series_";

export type UserSeriesDef = ContractSeriesDef & {
  userCreated: true;
  createdAt: string;
  updatedAt: string;
  clonedFrom?: string;
};

export type SeriesEditorOrigin = "builtin" | "override" | "user";

export const SERIES_EDITOR_ORIGIN_RU: Record<SeriesEditorOrigin, string> = {
  builtin: "встроенная",
  override: "изменена",
  user: "своя",
};

export type SeriesEditorRow = {
  id: string;
  def: ContractSeriesDef;
  origin: SeriesEditorOrigin;
  errors: string[];
};

function coerceSeriesDef(raw: unknown): UserSeriesDef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const base = coerceSeriesDefinition(raw);
  if (!base) return null;
  return {
    ...canonicalSeriesDef(base),
    userCreated: true,
    createdAt:
      typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
    updatedAt:
      typeof r.updatedAt === "string" ? r.updatedAt : new Date().toISOString(),
    clonedFrom: typeof r.clonedFrom === "string" ? r.clonedFrom : undefined,
  };
}

export function loadUserSeriesCatalog(): UserSeriesDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: UserSeriesDef[] = [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      const def = coerceSeriesDef(entry);
      if (!def || seen.has(def.id)) continue;
      seen.add(def.id);
      out.push(def);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveUserSeriesCatalog(list: UserSeriesDef[]): void {
  try {
    const canonical = list.map((s) => ({
      ...s,
      ...canonicalSeriesDef(s),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(canonical));
  } catch {
    /* quota */
  }
}

export function getMergedSeriesDef(id: string): ContractSeriesDef | undefined {
  const user = loadUserSeriesCatalog();
  const clone = user.find((s) => s.clonedFrom === id);
  if (clone) return clone;
  const hit = user.find((s) => s.id === id);
  if (hit) return hit;
  return getBuiltinSeriesDef(id);
}

export function getMergedSeriesCatalog(): ContractSeriesDef[] {
  const user = loadUserSeriesCatalog();
  const superseded = new Set<string>();
  for (const u of user) {
    if (u.clonedFrom) superseded.add(u.clonedFrom);
    if (BUILTIN_SERIES_CATALOG.some((b) => b.id === u.id)) superseded.add(u.id);
  }
  const kept = BUILTIN_SERIES_CATALOG.filter((b) => !superseded.has(b.id));
  return [...kept, ...user];
}

export function seriesEditorOrigin(id: string): SeriesEditorOrigin {
  const user = loadUserSeriesCatalog().find((s) => s.id === id);
  if (!user) return "builtin";
  if (user.clonedFrom || BUILTIN_SERIES_CATALOG.some((b) => b.id === id)) {
    return "override";
  }
  return "user";
}

export function listEditorSeries(): SeriesEditorRow[] {
  return getMergedSeriesCatalog().map((def) => ({
    id: def.id,
    def,
    origin: seriesEditorOrigin(def.id),
    errors: validateSeriesDef(def, getContractDef).errors,
  }));
}

export function makeUserSeriesId(nameRu: string, existing: string[]): string {
  const base =
    String(nameRu || "series")
      .toLowerCase()
      .replace(/[^a-z0-9а-я]+/giu, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24) || "series";
  let id = `${ID_PREFIX}${base}`;
  let n = 2;
  const all = new Set([
    ...existing,
    ...BUILTIN_SERIES_CATALOG.map((s) => s.id),
  ]);
  while (all.has(id)) {
    id = `${ID_PREFIX}${base}_${n}`;
    n += 1;
  }
  return id;
}

export function addUserSeries(
  def: Omit<UserSeriesDef, "userCreated" | "createdAt" | "updatedAt">,
): UserSeriesDef {
  const list = loadUserSeriesCatalog();
  const now = new Date().toISOString();
  const full: UserSeriesDef = {
    ...def,
    userCreated: true,
    createdAt: now,
    updatedAt: now,
  };
  saveUserSeriesCatalog([full, ...list]);
  return full;
}

export function updateUserSeries(
  id: string,
  patch: Partial<Omit<UserSeriesDef, "id" | "userCreated" | "createdAt">>,
): UserSeriesDef | null {
  const list = loadUserSeriesCatalog();
  const idx = list.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const updated: UserSeriesDef = {
    ...list[idx]!,
    ...patch,
    id: list[idx]!.id,
    userCreated: true,
    createdAt: list[idx]!.createdAt,
    updatedAt: new Date().toISOString(),
  };
  list[idx] = updated;
  saveUserSeriesCatalog(list);
  return updated;
}

export function deleteUserSeries(id: string): boolean {
  const list = loadUserSeriesCatalog();
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) return false;
  saveUserSeriesCatalog(next);
  return true;
}

export function upsertUserSeriesOverride(
  def: Omit<UserSeriesDef, "userCreated" | "createdAt" | "updatedAt">,
): UserSeriesDef {
  const existing = loadUserSeriesCatalog().find((s) => s.id === def.id);
  if (existing) {
    const updated = updateUserSeries(def.id, def);
    if (updated) return updated;
  }
  const builtin = getBuiltinSeriesDef(def.id);
  return addUserSeries({
    ...def,
    clonedFrom: def.clonedFrom ?? builtin?.id,
  });
}

export function restoreBuiltinSeriesOverride(id: string): boolean {
  const list = loadUserSeriesCatalog();
  const user = list.find((s) => s.id === id || s.clonedFrom === id);
  if (!user) return false;
  const builtinId = user.clonedFrom ?? user.id;
  if (!getBuiltinSeriesDef(builtinId)) return false;
  const next = list.filter(
    (s) => s.id !== user.id && s.clonedFrom !== builtinId,
  );
  if (next.length === list.length) return false;
  saveUserSeriesCatalog(next);
  return true;
}

export function duplicateToUserSeries(source: ContractSeriesDef): UserSeriesDef {
  const ids = loadUserSeriesCatalog().map((s) => s.id);
  const id = makeUserSeriesId(source.nameRu, ids);
  const need = expectedSeriesLength(source.periodKind);
  const days = resizeSeriesDays(source.days ?? [], source.periodKind);
  while (days.length < need) {
    days.push({ contractDefId: "", intensity: 3 });
  }
  return addUserSeries({
    ...canonicalSeriesDef({
      ...source,
      id,
      nameRu: `${source.nameRu} (копия)`,
      days,
    }),
    clonedFrom: undefined,
  });
}

export function exportUserSeriesJson(): string {
  return JSON.stringify(
    { version: 1, source: "joi-conductor-series", series: loadUserSeriesCatalog() },
    null,
    2,
  );
}

export function importUserSeriesJson(
  json: string,
  mode: "merge" | "replace" = "merge",
): { imported: number; skipped: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { imported: 0, skipped: 0 };
  }
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)?.series)
      ? ((parsed as Record<string, unknown>).series as unknown[])
      : Array.isArray((parsed as Record<string, unknown>)?.contracts)
        ? ((parsed as Record<string, unknown>).contracts as unknown[])
        : [];
  const existing = mode === "replace" ? [] : loadUserSeriesCatalog();
  const byId = new Map(existing.map((s) => [s.id, s]));
  let imported = 0;
  let skipped = 0;
  for (const raw of arr) {
    const source =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    const sourceId = typeof source?.id === "string" ? source.id : "";
    const builtin = getBuiltinSeriesDef(sourceId);
    const normalized = builtin
      ? {
          ...source,
          id: builtin.id,
          clonedFrom: builtin.id,
          userCreated: true,
          createdAt:
            typeof source?.createdAt === "string"
              ? source.createdAt
              : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : raw;
    const def = coerceSeriesDef(normalized);
    if (!def) {
      skipped += 1;
      continue;
    }
    byId.set(def.id, def);
    imported += 1;
  }
  saveUserSeriesCatalog([...byId.values()]);
  return { imported, skipped };
}

export function canStartSeriesDef(def: ContractSeriesDef): boolean {
  return validateSeriesDef(def, getContractDef).ok;
}
