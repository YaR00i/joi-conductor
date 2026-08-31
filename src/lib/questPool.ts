import { reportPersistFailure } from "./persistFailure";
import { QUEST_CATALOG, type QuestDef } from "./quests";
import type { QuestId } from "./types";

export const QUEST_POOL_STORAGE_KEY = "joi-quest-pool-v1";

const CATALOG_IDS = new Set<QuestId>(QUEST_CATALOG.map((q) => q.id));

export function isQuestId(value: string): value is QuestId {
  return CATALOG_IDS.has(value as QuestId);
}

export function loadDisabledQuestIds(): Set<QuestId> {
  try {
    const raw = localStorage.getItem(QUEST_POOL_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { disabledIds?: unknown };
    if (!Array.isArray(parsed.disabledIds)) return new Set();
    const next = new Set<QuestId>();
    for (const id of parsed.disabledIds) {
      if (typeof id === "string" && isQuestId(id)) next.add(id);
    }
    return next;
  } catch {
    return new Set();
  }
}

function persistDisabledQuestIds(disabled: ReadonlySet<QuestId>): void {
  try {
    localStorage.setItem(
      QUEST_POOL_STORAGE_KEY,
      JSON.stringify({ version: 1, disabledIds: [...disabled] }),
    );
  } catch {
    reportPersistFailure("пул квестов");
  }
}

export function isQuestInPool(
  id: QuestId,
  disabled: ReadonlySet<QuestId> = loadDisabledQuestIds(),
): boolean {
  return !disabled.has(id);
}

/** Enable (on) or exclude from random mid-session offers. */
export function setQuestInPool(id: QuestId, on: boolean): Set<QuestId> {
  const next = loadDisabledQuestIds();
  if (on) next.delete(id);
  else next.add(id);
  persistDisabledQuestIds(next);
  return next;
}

export function listEnabledQuestDefs(
  catalog: readonly QuestDef[] = QUEST_CATALOG,
  disabled: ReadonlySet<QuestId> = loadDisabledQuestIds(),
): QuestDef[] {
  return catalog.filter((q) => !disabled.has(q.id));
}
