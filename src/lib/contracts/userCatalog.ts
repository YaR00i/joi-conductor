/**
 * User-created contract catalog.
 *
 * Stored separately from the built-in CONTRACT_CATALOG so the static catalog
 * (data/contracts + catalog.ts) stays immutable. The daily board generator
 * consumes getMergedContractCatalog() = built-ins + user entries, so custom
 * contracts show up on the board with the same weight/selection rules.
 *
 * Persistence follows the project pattern: a single JSON blob in localStorage,
 * read-on-demand, validated on load. See sessionSeed.ts / sessionDiary.ts.
 */

import {
  CONTRACT_CATALOG,
  CONTRACT_CATEGORY_LABELS,
  _registerUserContractLookup,
  type ContractDef,
} from "./catalog";
import type { MistressId } from "../mistress/types";

const MISTRESS_IDS: readonly MistressId[] = [
  "hu_tao",
  "furina",
  "sunna",
  "sparkle",
] as const;

// Wire up the user-catalog lookup into catalog.ts's getContractDef().
// Done at module load so any caller of getContractDef sees user entries.
_registerUserContractLookup((id: string) => {
  const user = loadUserContracts();
  return user.find((c) => c.id === id);
});

const STORAGE_KEY = "joi-user-contracts-v1";
const ID_PREFIX = "user_";

/** A user-authored contract def with provenance metadata. */
export type UserContractDef = ContractDef & {
  userCreated: true;
  createdAt: string;
  updatedAt: string;
};

function isUserDef(raw: unknown): raw is UserContractDef {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  return (
    r.userCreated === true &&
    typeof r.id === "string" &&
    typeof r.category === "string" &&
    typeof r.nameRu === "string" &&
    typeof r.instructionRu === "string" &&
    typeof r.rewardMin === "number" &&
    typeof r.rewardMax === "number"
  );
}

/** Sanitize a raw entry into a valid UserContractDef (drops unknown fields). */
function coerceUserDef(raw: unknown): UserContractDef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const base: ContractDef = {
    id: String(r.id ?? ""),
    category: (r.category as ContractDef["category"]) ?? "edge",
    nameRu: String(r.nameRu ?? "Без названия"),
    briefRu: String(r.briefRu ?? ""),
    instructionRu: String(r.instructionRu ?? ""),
    difficulty:
      r.difficulty === 1 || r.difficulty === 2 || r.difficulty === 3
        ? r.difficulty
        : 1,
    durationHintMin:
      typeof r.durationHintMin === "number" && r.durationHintMin > 0
        ? r.durationHintMin
        : undefined,
    durationLimitMin:
      typeof r.durationLimitMin === "number" && r.durationLimitMin > 0
        ? r.durationLimitMin
        : typeof r.timerMin === "number" && r.timerMin > 0
          ? r.timerMin
          : undefined,
    rewardMin: typeof r.rewardMin === "number" ? r.rewardMin : 0,
    rewardMax: typeof r.rewardMax === "number" ? r.rewardMax : 0,
    rolls: (r.rolls as ContractDef["rolls"]) ?? undefined,
    biasHints: Array.isArray(r.biasHints)
      ? r.biasHints.filter((x): x is string => typeof x === "string")
      : undefined,
    mistressBias: Array.isArray(r.mistressBias)
      ? r.mistressBias.filter(
          (x): x is MistressId =>
            typeof x === "string" &&
            (MISTRESS_IDS as readonly string[]).includes(x),
        )
      : undefined,
    kind: (r.kind as ContractDef["kind"]) ?? undefined,
    finishDebriefPreset:
      (r.finishDebriefPreset as ContractDef["finishDebriefPreset"]) ??
      undefined,
    requireActivityDebrief:
      r.requireActivityDebrief === true ? true : undefined,
    clonedFrom: typeof r.clonedFrom === "string" ? r.clonedFrom : undefined,
  };
  // Older editor builds allowed arbitrary stable ids. Keep them: today's
  // board may already reference such an id, and silently dropping it makes
  // «Принять» appear broken after an upgrade.
  if (!base.id) return null;
  return {
    ...base,
    userCreated: true,
    createdAt:
      typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
    updatedAt:
      typeof r.updatedAt === "string" ? r.updatedAt : new Date().toISOString(),
  };
}

export function loadUserContracts(): UserContractDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: UserContractDef[] = [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      if (!isUserDef(entry) && !coerceUserDef(entry)) continue;
      const def = coerceUserDef(entry);
      if (!def) continue;
      if (seen.has(def.id)) continue;
      seen.add(def.id);
      out.push(def);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveUserContracts(list: UserContractDef[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode — best effort */
  }
}

/**
 * Merge built-ins with user contracts. A user clone with `clonedFrom === <id>`
 * substitutes for the built-in `<id>` (so editing a built-in's clone replaces
 * the original on the daily board). Brand-new user defs append after built-ins.
 */
export function getMergedContractCatalog(): ContractDef[] {
  const user = loadUserContracts();
  if (user.length === 0) return CONTRACT_CATALOG;
  // ids superseded by a user clone (either same id, or clonedFrom pointing at builtin).
  const superseded = new Set<string>();
  for (const u of user) {
    if (u.clonedFrom) superseded.add(u.clonedFrom);
    // a user def that re-uses a builtin id also supersedes it.
    if (CONTRACT_CATALOG.some((b) => b.id === u.id)) superseded.add(u.id);
  }
  const keptBuiltins = CONTRACT_CATALOG.filter((b) => !superseded.has(b.id));
  return [...keptBuiltins, ...user];
}

/** Lookup that prefers user defs (so editing overrides built-ins by id). */
export function getMergedContractDef(id: string): ContractDef | undefined {
  const user = loadUserContracts();
  // a clone pointing at this builtin id wins first
  const clone = user.find((c) => c.clonedFrom === id);
  if (clone) return clone;
  const userHit = user.find((c) => c.id === id);
  if (userHit) return userHit;
  return CONTRACT_CATALOG.find((c) => c.id === id);
}

/** Generate a unique user-prefixed id from a Russian name. */
export function makeUserContractId(nameRu: string, existing: string[]): string {
  const base = String(nameRu || "contract")
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/giu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || "contract";
  let id = `${ID_PREFIX}${base}`;
  let n = 2;
  const all = new Set([...existing, ...CONTRACT_CATALOG.map((c) => c.id)]);
  while (all.has(id)) {
    id = `${ID_PREFIX}${base}_${n}`;
    n += 1;
  }
  return id;
}

export function addUserContract(
  def: Omit<UserContractDef, "userCreated" | "createdAt" | "updatedAt">,
): UserContractDef {
  const list = loadUserContracts();
  const now = new Date().toISOString();
  const full: UserContractDef = {
    ...def,
    userCreated: true,
    createdAt: now,
    updatedAt: now,
  };
  saveUserContracts([full, ...list]);
  return full;
}

export function updateUserContract(
  id: string,
  patch: Partial<Omit<UserContractDef, "id" | "userCreated" | "createdAt">>,
): UserContractDef | null {
  const list = loadUserContracts();
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  const updated: UserContractDef = {
    ...list[idx],
    ...patch,
    id: list[idx].id,
    userCreated: true,
    createdAt: list[idx].createdAt,
    updatedAt: new Date().toISOString(),
  };
  list[idx] = updated;
  saveUserContracts(list);
  return updated;
}

export function deleteUserContract(id: string): boolean {
  const list = loadUserContracts();
  const next = list.filter((c) => c.id !== id);
  if (next.length === list.length) return false;
  saveUserContracts(next);
  return true;
}

/**
 * Clone a built-in contract into a user-editable def. The clone carries
 * `clonedFrom` so the merge layer substitutes it for the original on the daily
 * board. If a clone already exists for this builtin, returns it unchanged.
 * Returns null if the builtin id is unknown.
 */
export function cloneBuiltinToUser(builtinId: string): UserContractDef | null {
  const builtin = CONTRACT_CATALOG.find((c) => c.id === builtinId);
  if (!builtin) return null;
  const list = loadUserContracts();
  const existing = list.find((c) => c.clonedFrom === builtinId);
  if (existing) return existing;
  const now = new Date().toISOString();
  // Keep the builtin id so the daily board (which references defId) keeps
  // resolving — the clone supersedes the builtin in getMergedContractCatalog.
  const clone: UserContractDef = {
    ...builtin,
    id: builtin.id,
    clonedFrom: builtin.id,
    userCreated: true,
    createdAt: now,
    updatedAt: now,
  };
  saveUserContracts([clone, ...list]);
  return clone;
}

/** Has this builtin already been cloned into the user catalog? */
export function isBuiltinCloned(builtinId: string): boolean {
  return loadUserContracts().some(
    (c) => c.clonedFrom === builtinId || c.id === builtinId,
  );
}

export type ContractEditorOrigin = "builtin" | "override" | "user";

export const CONTRACT_EDITOR_ORIGIN_RU: Record<ContractEditorOrigin, string> = {
  builtin: "встроенный",
  override: "изменён",
  user: "свой",
};

export type ContractEditorRow = {
  id: string;
  def: ContractDef;
  origin: ContractEditorOrigin;
};

export function contractEditorOrigin(id: string): ContractEditorOrigin {
  const user = loadUserContracts().find((c) => c.id === id);
  if (!user) return "builtin";
  if (user.clonedFrom || CONTRACT_CATALOG.some((b) => b.id === id)) {
    return "override";
  }
  return "user";
}

/** Merged catalog for the editor list: one row per live def, sorted. */
export function listEditorCatalog(): ContractEditorRow[] {
  const catOrder = Object.keys(CONTRACT_CATEGORY_LABELS);
  return getMergedContractCatalog()
    .map((def) => ({
      id: def.id,
      def,
      origin: contractEditorOrigin(def.id),
    }))
    .sort((a, b) => {
      const ca = catOrder.indexOf(a.def.category);
      const cb = catOrder.indexOf(b.def.category);
      if (ca !== cb) return ca - cb;
      return a.def.nameRu.localeCompare(b.def.nameRu, "ru");
    });
}

/**
 * Save a draft over a built-in (creates/updates override, same id) or a user def.
 */
export function upsertUserOverride(
  def: Omit<UserContractDef, "userCreated" | "createdAt" | "updatedAt">,
): UserContractDef {
  const existing = loadUserContracts().find((c) => c.id === def.id);
  if (existing) {
    const updated = updateUserContract(def.id, def);
    if (updated) return updated;
  }
  const builtin = CONTRACT_CATALOG.find((b) => b.id === def.id);
  return addUserContract({
    ...def,
    clonedFrom: def.clonedFrom ?? builtin?.id,
  });
}

/** Drop the user override so the built-in text returns. */
export function restoreBuiltinOverride(id: string): boolean {
  const list = loadUserContracts();
  const user = list.find((c) => c.id === id || c.clonedFrom === id);
  if (!user) return false;
  const builtinId = user.clonedFrom ?? user.id;
  if (!CONTRACT_CATALOG.some((b) => b.id === builtinId)) return false;
  const next = list.filter(
    (c) => c.id !== user.id && c.clonedFrom !== builtinId,
  );
  if (next.length === list.length) return false;
  saveUserContracts(next);
  return true;
}

/** Copy any catalog def as a new user contract (does not replace the original). */
export function duplicateToUserContract(source: ContractDef): UserContractDef {
  const ids = loadUserContracts().map((c) => c.id);
  const id = makeUserContractId(source.nameRu, ids);
  return addUserContract({
    ...source,
    id,
    nameRu: `${source.nameRu} (копия)`,
    clonedFrom: undefined,
  });
}

export function isUserContract(id: string): boolean {
  if (id.startsWith(ID_PREFIX)) return true;
  // A builtin id that has been cloned into a user-editable override.
  return loadUserContracts().some(
    (c) => c.clonedFrom === id || c.id === id,
  );
}

export function exportUserContractsJson(): string {
  const contracts = loadUserContracts().map((d) => ({
    ...d,
    durationLimitMin: d.durationLimitMin ?? d.durationHintMin ?? null,
    timerMin: d.durationLimitMin ?? d.durationHintMin ?? null,
  }));
  return JSON.stringify(
    { version: 2, contracts },
    null,
    2,
  );
}

/**
 * Export EVERYTHING — built-in catalog + user contracts — as JSON, including
 * the timer field (durationLimitMin) for each. Useful as a full backup or to
 * hand-edit the built-in presets' timers and re-import as user overrides.
 */
export function exportAllContractsJson(): string {
  const withTimer = (d: ContractDef | UserContractDef) => ({
    ...d,
    durationLimitMin: d.durationLimitMin ?? d.durationHintMin ?? null,
    // Friendly alias for hand-edited JSON; importer accepts either name.
    timerMin: d.durationLimitMin ?? d.durationHintMin ?? null,
  });
  const builtins = CONTRACT_CATALOG.map(withTimer);
  const user = loadUserContracts().map(withTimer);
  return JSON.stringify(
    {
      version: 2,
      source: "joi-conductor",
      note: "Полный каталог: встроенные + пользовательские контракты. Поле durationLimitMin — таймер выполнения (мин).",
      builtinCount: builtins.length,
      userCount: user.length,
      contracts: [...builtins, ...user],
    },
    null,
    2,
  );
}

export function importUserContractsJson(
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
    : Array.isArray((parsed as Record<string, unknown>)?.contracts)
      ? ((parsed as Record<string, unknown>).contracts as unknown[])
      : [];
  const existing = mode === "replace" ? [] : loadUserContracts();
  const byId = new Map(existing.map((c) => [c.id, c]));
  let imported = 0;
  let skipped = 0;
  for (const raw of arr) {
    const source =
      raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : null;
    const sourceId = typeof source?.id === "string" ? source.id : "";
    const builtin = CONTRACT_CATALOG.find((d) => d.id === sourceId);
    // Full-catalog exports contain plain built-ins. Importing an edited one
    // turns it into an override automatically, so exporting/editing/importing
    // the timer is a complete round-trip rather than a trap.
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
    const def = coerceUserDef(normalized);
    if (!def) {
      skipped += 1;
      continue;
    }
    byId.set(def.id, def);
    imported += 1;
  }
  saveUserContracts([...byId.values()]);
  return { imported, skipped };
}
