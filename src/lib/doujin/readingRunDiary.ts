import { getCumplay, getFinish } from "../catalog";
import { getActiveMistress } from "../mistress";
import type { DiaryAteCum, DiaryCumFate, DiaryEntry } from "../sessionDiary";
import { moodFromScore } from "../moodEngine";
import { getActiveMoodLines } from "../voice/moodLines";
import { readingRunElapsedSec, type ReadingRunState } from "./readingRun";

const EAT = new Set([
  "swallow",
  "on_food_eat",
  "on_drink",
  "lick_fingers",
  "chew",
  "snowball_solo",
  "lick_toy",
  "feet_lick",
]);
const SMEAR_FACE = new Set(["smear_lips", "smear_nose"]);
const SMEAR_BODY = new Set(["smear_chest"]);

function cumFateFromPlay(
  cumplayId: string,
  outcome: ReadingRunState["finaleOutcome"],
): DiaryCumFate {
  if (outcome !== "cum" && outcome !== "ruin") return "none";
  if (EAT.has(cumplayId)) return "ate";
  if (SMEAR_FACE.has(cumplayId)) return "smear_face";
  if (SMEAR_BODY.has(cumplayId)) return "smear_body";
  if (cumplayId === "none" || !cumplayId) return "washed";
  return "none";
}

function ateCumFromFate(fate: DiaryCumFate): DiaryAteCum {
  switch (fate) {
    case "ate":
      return "yes";
    case "none":
      return "none";
    case "smear_face":
    case "smear_body":
    case "washed":
      return "no";
    default: {
      const _exhaustive: never = fate;
      return _exhaustive;
    }
  }
}

export function buildReadingDiaryEntry(opts: {
  run: ReadingRunState;
  ended: "complete" | "abort";
  now?: Date;
}): DiaryEntry {
  const now = opts.now ?? new Date();
  const run = opts.run;
  const elapsedSec = readingRunElapsedSec(run, now.getTime());
  const mistress = getActiveMistress();
  const mood = moodFromScore(run.moodScore);
  const finish = getFinish("hand");
  const cumplay = getCumplay(run.cumplayId);
  const cumFate = cumFateFromPlay(run.cumplayId, run.finaleOutcome);
  return {
    id: `diary-read-${now.getTime()}-${Math.floor(Math.random() * 1e6)}`,
    createdAt: now.toISOString(),
    startedAt: new Date(run.startedAt).toISOString(),
    ended: opts.ended,
    elapsedSec,
    durationSec: elapsedSec,
    edgesDone: run.edgesDone,
    edgesTarget: run.edgesDone,
    ruinsDone: run.ruinsDone,
    ruinsTarget: run.ruinsDone,
    finaleOutcome: run.finaleOutcome,
    finishId: "hand",
    finishNameRu: finish?.nameRu ?? "Рука",
    cumplayId: run.cumplayId,
    cumplayNameRu: cumplay?.nameRu ?? run.cumplayId,
    cumFate,
    ateCum: ateCumFromFate(cumFate),
    mistressNameRu: mistress.displayNameRu,
    mistressId: mistress.id,
    mood,
    moodLabelRu: getActiveMoodLines().moods[mood]?.labelRu ?? mood,
    moodScore: run.moodScore,
    mode: "stroke",
    modeNameRu: "Чтение",
    tagsLabelRu:
      run.source === "gelbooru"
        ? `${run.listName} · ${run.pagesShown} пост.`
        : `${run.listName} · ${run.galleries.length} раб.`,
    source: "reading",
    reading: {
      listId: run.listId,
      listName: run.listName,
      origin: run.origin,
      galleries: run.galleries.length,
      pagesShown: run.pagesShown,
      pagesContent: run.pagesContent,
      strokesDone: run.strokesDone,
      slapsDone: run.slapsDone,
      orgasmsDone: run.orgasmsDone,
    },
  };
}
