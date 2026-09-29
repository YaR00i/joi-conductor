/**
 * Contract journal — separate from sessionDiary.
 *
 * Stores outcome records for contracts (done / failed / expired) with their
 * debrief answers, reward, and perform-window timing. Kept in its own storage
 * key so the session diary (joi-diary-v1) stays single-shape and its stats
 * aggregations remain unaffected.
 *
 * Persistence mirrors sessionDiary.ts: single JSON list, capped, validated.
 */

import type { ContractCategory } from "./contracts/catalog";
import type { ContractInstance } from "./contracts/dailyBoard";
import type { MistressId } from "./mistress/types";

const STORAGE_KEY = "joi-contract-journal-v1";
const MAX_ENTRIES = 300;

export type ContractJournalOutcome = "done" | "failed" | "expired";

export type ContractJournalPerformedVia =
  | "honor"
  | "timer"
  | "debrief"
  | "auto";

export type ContractJournalEntry = {
  id: string;
  /** ISO timestamp of the report */
  createdAt: string;
  /** ISO timestamp of acceptance if known */
  acceptedAt?: string;
  mistressId: MistressId;
  contractDefId: string;
  contractInstanceTitleRu: string;
  category: ContractCategory;
  outcome: ContractJournalOutcome;
  /** Cinders actually credited (0 on failed/expired). */
  reward: number;
  /** Rolled base reward before debrief adjustment. */
  baseReward: number;
  /** Perform-window limit (minutes) when a timer was set. */
  durationLimitMin?: number;
  /** Actual time spent (seconds) between accept and report, if known. */
  actualDurationSec?: number;
  /** Whether the contract had a live countdown timer. */
  hadTimer?: boolean;
  performedVia: ContractJournalPerformedVia;
  /** Debrief questionnaire preset name, if a debrief was used. */
  debriefPreset?: "finish_debrief" | "activity_debrief";
  /** Flat debrief answers map (finishDebrief or activityDebrief). */
  debriefAnswers?: Record<string, string>;
  /** Human-readable reward summary (from debrief scoring). */
  summaryRu?: string;
  /** Difficulty of the contract def. */
  difficulty?: 1 | 2 | 3;
  seriesInstanceId?: string;
  seriesDefId?: string;
  seriesDayIndex?: number;
  seriesTotalDays?: number;
};

function coerceEntry(raw: unknown): ContractJournalEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    typeof r.createdAt !== "string" ||
    typeof r.contractDefId !== "string" ||
    typeof r.contractInstanceTitleRu !== "string"
  ) {
    return null;
  }
  return {
    id: r.id,
    createdAt: r.createdAt,
    acceptedAt:
      typeof r.acceptedAt === "string" ? r.acceptedAt : undefined,
    mistressId: (r.mistressId as MistressId) ?? "hu_tao",
    contractDefId: r.contractDefId,
    contractInstanceTitleRu: r.contractInstanceTitleRu,
    category: (r.category as ContractCategory) ?? "edge",
    outcome:
      r.outcome === "done" || r.outcome === "failed" || r.outcome === "expired"
        ? r.outcome
        : "done",
    reward: typeof r.reward === "number" ? r.reward : 0,
    baseReward: typeof r.baseReward === "number" ? r.baseReward : 0,
    durationLimitMin:
      typeof r.durationLimitMin === "number" ? r.durationLimitMin : undefined,
    actualDurationSec:
      typeof r.actualDurationSec === "number" ? r.actualDurationSec : undefined,
    hadTimer: r.hadTimer === true ? true : undefined,
    performedVia:
      r.performedVia === "honor" ||
      r.performedVia === "timer" ||
      r.performedVia === "debrief" ||
      r.performedVia === "auto"
        ? r.performedVia
        : "honor",
    debriefPreset:
      r.debriefPreset === "finish_debrief" ||
      r.debriefPreset === "activity_debrief"
        ? r.debriefPreset
        : undefined,
    debriefAnswers:
      r.debriefAnswers && typeof r.debriefAnswers === "object"
        ? (r.debriefAnswers as Record<string, string>)
        : undefined,
    summaryRu: typeof r.summaryRu === "string" ? r.summaryRu : undefined,
    difficulty:
      r.difficulty === 1 || r.difficulty === 2 || r.difficulty === 3
        ? r.difficulty
        : undefined,
    seriesInstanceId:
      typeof r.seriesInstanceId === "string" ? r.seriesInstanceId : undefined,
    seriesDefId: typeof r.seriesDefId === "string" ? r.seriesDefId : undefined,
    seriesDayIndex:
      typeof r.seriesDayIndex === "number" ? r.seriesDayIndex : undefined,
    seriesTotalDays:
      typeof r.seriesTotalDays === "number" ? r.seriesTotalDays : undefined,
  };
}

export function loadContractJournal(): ContractJournalEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: ContractJournalEntry[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const entry = coerceEntry(item);
      if (!entry || seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry);
    }
    return out;
  } catch {
    return [];
  }
}

function saveContractJournal(list: ContractJournalEntry[]): void {
  try {
    const trimmed = list.slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* best effort */
  }
}

let entryCounter = 0;
function makeEntryId(): string {
  entryCounter += 1;
  return `cj_${Date.now()}_${entryCounter}_${Math.floor(Math.random() * 1e6)}`;
}

export function appendContractJournalEntry(
  entry: Omit<ContractJournalEntry, "id">,
): ContractJournalEntry[] {
  const full: ContractJournalEntry = { ...entry, id: makeEntryId() };
  const next = [full, ...loadContractJournal()];
  saveContractJournal(next);
  return next;
}

/** Stable-id append for auto-expire / cancel so remount does not duplicate. */
export function appendContractJournalEntryIfAbsent(
  id: string,
  entry: Omit<ContractJournalEntry, "id">,
): boolean {
  if (!id) return false;
  const list = loadContractJournal();
  if (list.some((e) => e.id === id)) return false;
  saveContractJournal([{ ...entry, id }, ...list]);
  return true;
}

export function clearContractJournal(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Build a journal entry from a contract + report result. */
export function buildContractJournalEntry(opts: {
  contract: ContractInstance;
  outcome: ContractJournalOutcome;
  reward: number;
  baseReward?: number;
  performedVia: ContractJournalPerformedVia;
  acceptedAtMs?: number;
  summaryRu?: string;
  debriefPreset?: "finish_debrief" | "activity_debrief";
  debriefAnswers?: Record<string, string>;
}): Omit<ContractJournalEntry, "id"> {
  const { contract: c } = opts;
  const now = new Date().toISOString();
  const actualDurationSec =
    typeof opts.acceptedAtMs === "number"
      ? Math.max(0, Math.round((Date.now() - opts.acceptedAtMs) / 1000))
      : undefined;
  return {
    createdAt: now,
    acceptedAt:
      typeof opts.acceptedAtMs === "number"
        ? new Date(opts.acceptedAtMs).toISOString()
        : undefined,
    mistressId: c.mistressId,
    contractDefId: c.defId,
    contractInstanceTitleRu: c.titleRu,
    category: c.category,
    outcome: opts.outcome,
    reward: opts.reward,
    baseReward: opts.baseReward ?? c.reward,
    actualDurationSec,
    performedVia: opts.performedVia,
    debriefPreset: opts.debriefPreset,
    debriefAnswers: opts.debriefAnswers,
    summaryRu: opts.summaryRu,
    difficulty: c.difficulty,
    seriesInstanceId: c.seriesInstanceId,
    seriesDefId: c.seriesDefId,
    seriesDayIndex: c.seriesDayIndex,
    seriesTotalDays: c.seriesTotalDays,
  };
}

export type ContractJournalStats = {
  total: number;
  done: number;
  failed: number;
  expired: number;
  successRate: number; // 0..1 (done / total)
  totalCinders: number; // sum of reward
};

export function contractJournalStats(
  entries: ContractJournalEntry[],
): ContractJournalStats {
  const total = entries.length;
  let done = 0;
  let failed = 0;
  let expired = 0;
  let totalCinders = 0;
  for (const e of entries) {
    if (e.outcome === "done") {
      done += 1;
      totalCinders += e.reward;
    } else if (e.outcome === "failed") failed += 1;
    else if (e.outcome === "expired") expired += 1;
  }
  return {
    total,
    done,
    failed,
    expired,
    successRate: total > 0 ? done / total : 0,
    totalCinders,
  };
}
