import { QUEST_CATALOG, type QuestDef } from "./quests";
import type { QuestExerciseKind } from "./types";

export type QuestBoardRow = {
  id: QuestDef["id"];
  nameRu: string;
  kindRu: string;
  enabled: boolean;
};

export function questExerciseKindRu(kind: QuestExerciseKind): string {
  switch (kind) {
    case "cbt":
      return "CBT";
    case "edge":
      return "Эдж";
    case "count":
      return "Счёт";
    case "rest":
      return "Пауза";
    case "media":
      return "Медиа";
    case "hold":
      return "Удержание";
    case "sync":
      return "Ритм";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function formatQuestRewardRangeRu(min: number, max: number): string {
  if (min === max) return `+${min} ◆`;
  return `+${min}–${max} ◆`;
}

export function formatQuestDurationRu(sec: number): string {
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m} мин ${s} с` : `${m} мин`;
}

/** Pool rows: names only — no rules, so the live offer stays a surprise. */
export function listQuestBoardRows(
  catalog: readonly QuestDef[] = QUEST_CATALOG,
  disabledIds: ReadonlySet<string> = new Set(),
): QuestBoardRow[] {
  return catalog.map((q) => ({
    id: q.id,
    nameRu: q.nameRu,
    kindRu: questExerciseKindRu(q.exerciseKind),
    enabled: !disabledIds.has(q.id),
  }));
}
