import { QUEST_CATALOG, type QuestDef } from "./quests";
import type { QuestExerciseKind } from "./types";

export type QuestBoardRow = {
  id: QuestDef["id"];
  nameRu: string;
  ruleRu: string;
  kindRu: string;
  durationLabelRu: string;
  rewardLabelRu: string;
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

/** Read-only meta board rows from the mid-session quest catalog. */
export function listQuestBoardRows(
  catalog: readonly QuestDef[] = QUEST_CATALOG,
): QuestBoardRow[] {
  return catalog.map((q) => ({
    id: q.id,
    nameRu: q.nameRu,
    ruleRu: q.ruleRu,
    kindRu: questExerciseKindRu(q.exerciseKind),
    durationLabelRu: formatQuestDurationRu(q.durationSec),
    rewardLabelRu: formatQuestRewardRangeRu(q.rewardMin, q.rewardMax),
  }));
}
