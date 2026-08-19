import type { AchievementLevelUp } from "./achievements";
import type { SessionMood } from "./types";
import {
  getActiveMoodLines,
  isMistressMood,
  pickMoodLine,
} from "./voice/moodLines";

export type SessionDebriefCtaId =
  | "diary"
  | "achievements"
  | "shop"
  | "roulette"
  | "contracts";

export type AbortDebriefCtaId = "diary" | "roulette" | "contracts";

export type SessionDebriefUnlockKind = "achievement" | "contract";

export type SessionDebriefUnlock = {
  kind: SessionDebriefUnlockKind;
  titleRu: string;
  detailRu?: string;
  cinders?: number;
};

export type SessionDebriefContract = {
  status: "done" | "failed";
  titleRu: string;
  rewarded: number;
  reasonRu?: string;
};

export type SessionDebrief = {
  mistressNameRu: string;
  portraitSrc: string;
  mood: SessionMood;
  moodLabelRu: string;
  verdictRu: string;
  finaleOutcome?: "cum" | "ruin" | "deny";
  finaleLabelRu: string;
  cindersEarned: number;
  unlocks: SessionDebriefUnlock[];
  elapsedSec: number;
  edgesDone: number;
  /** Favorites count at end — light taste chip when > 0. */
  likesCount?: number;
  contract?: SessionDebriefContract;
};

/** Quiet post-abort sheet — not a celebration. */
export type AbortDebrief = {
  mistressNameRu: string;
  portraitSrc: string;
  mood: SessionMood;
  moodLabelRu: string;
  noteRu: string;
  /** True only if an abort entry was written to the diary. */
  diaryRecorded: boolean;
  elapsedSec: number;
  edgesDone: number;
  ruinsDone: number;
  clawQuestCinders: number;
  contractFailedTitleRu?: string;
};

export function finaleOutcomeLabelRu(
  outcome?: "cum" | "ruin" | "deny",
): string {
  switch (outcome) {
    case "cum":
      return "Кончить";
    case "ruin":
      return "Руина";
    case "deny":
      return "Отказ";
    case undefined:
      return "Без финала";
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}

function fallbackVerdictRu(
  mistressNameRu: string,
  outcome?: "cum" | "ruin" | "deny",
): string {
  switch (outcome) {
    case "cum":
      return `${mistressNameRu} закрыла сессию: финал засчитан.`;
    case "ruin":
      return `${mistressNameRu}: руина принята. Записала.`;
    case "deny":
      return `${mistressNameRu}: отказ. Живи с этим.`;
    case undefined:
      return `${mistressNameRu} закрыла сессию. Дневник обновлён.`;
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}

function fallbackAbortNoteRu(mistressNameRu: string): string {
  return `${mistressNameRu} оборвала сессию. Без финала — просто стоп.`;
}

export function pickSessionDebriefVerdict(
  mood: SessionMood,
  mistressNameRu: string,
  finaleOutcome?: "cum" | "ruin" | "deny",
  rng: () => number = Math.random,
): string {
  const pack = getActiveMoodLines();
  const moodKey = isMistressMood(mood) ? mood : pack.defaultMood;
  const line = pickMoodLine(pack, "session_end_complete", moodKey, rng);
  if (line?.text?.trim()) return line.text.trim();
  return fallbackVerdictRu(mistressNameRu, finaleOutcome);
}

export function pickAbortDebriefNote(
  mood: SessionMood,
  mistressNameRu: string,
  rng: () => number = Math.random,
): string {
  const pack = getActiveMoodLines();
  const moodKey = isMistressMood(mood) ? mood : pack.defaultMood;
  const line = pickMoodLine(pack, "session_end_abort", moodKey, rng);
  if (line?.text?.trim()) return line.text.trim();
  return fallbackAbortNoteRu(mistressNameRu);
}

export function buildSessionDebrief(opts: {
  mistressNameRu: string;
  portraitSrc: string;
  mood: SessionMood;
  moodLabelRu: string;
  finaleOutcome?: "cum" | "ruin" | "deny";
  cindersEarned: number;
  levelUps: AchievementLevelUp[];
  elapsedSec: number;
  edgesDone: number;
  likesCount?: number;
  contract?: SessionDebriefContract | null;
  verdictRu?: string;
}): SessionDebrief {
  const unlocks: SessionDebriefUnlock[] = [];

  for (const up of opts.levelUps.slice(0, 4)) {
    unlocks.push({
      kind: "achievement",
      titleRu: up.nameRu,
      detailRu: `ур. ${up.level}`,
      cinders: up.cinders,
    });
  }

  if (opts.contract) {
    switch (opts.contract.status) {
      case "done":
        unlocks.unshift({
          kind: "contract",
          titleRu: `Контракт «${opts.contract.titleRu}»`,
          detailRu: "выполнен",
          cinders: opts.contract.rewarded > 0 ? opts.contract.rewarded : undefined,
        });
        break;
      case "failed":
        unlocks.unshift({
          kind: "contract",
          titleRu: `Контракт «${opts.contract.titleRu}»`,
          detailRu: opts.contract.reasonRu
            ? `провален · ${opts.contract.reasonRu}`
            : "провален",
        });
        break;
      default: {
        const _exhaustive: never = opts.contract.status;
        void _exhaustive;
      }
    }
  }

  const likes =
    opts.likesCount != null && Number.isFinite(opts.likesCount)
      ? Math.max(0, Math.floor(opts.likesCount))
      : undefined;

  return {
    mistressNameRu: opts.mistressNameRu,
    portraitSrc: opts.portraitSrc,
    mood: opts.mood,
    moodLabelRu: opts.moodLabelRu,
    verdictRu:
      opts.verdictRu?.trim() ||
      pickSessionDebriefVerdict(
        opts.mood,
        opts.mistressNameRu,
        opts.finaleOutcome,
      ),
    finaleOutcome: opts.finaleOutcome,
    finaleLabelRu: finaleOutcomeLabelRu(opts.finaleOutcome),
    cindersEarned: Math.max(0, Math.floor(opts.cindersEarned)),
    unlocks,
    elapsedSec: Math.max(0, Math.floor(opts.elapsedSec)),
    edgesDone: Math.max(0, Math.floor(opts.edgesDone)),
    likesCount: likes && likes > 0 ? likes : undefined,
    contract: opts.contract ?? undefined,
  };
}

export function buildAbortDebrief(opts: {
  mistressNameRu: string;
  portraitSrc: string;
  mood: SessionMood;
  moodLabelRu: string;
  diaryRecorded: boolean;
  elapsedSec: number;
  edgesDone: number;
  ruinsDone: number;
  clawQuestCinders: number;
  contractFailedTitleRu?: string;
  noteRu?: string;
}): AbortDebrief {
  return {
    mistressNameRu: opts.mistressNameRu,
    portraitSrc: opts.portraitSrc,
    mood: opts.mood,
    moodLabelRu: opts.moodLabelRu,
    noteRu:
      opts.noteRu?.trim() ||
      pickAbortDebriefNote(opts.mood, opts.mistressNameRu),
    diaryRecorded: opts.diaryRecorded,
    elapsedSec: Math.max(0, Math.floor(opts.elapsedSec)),
    edgesDone: Math.max(0, Math.floor(opts.edgesDone)),
    ruinsDone: Math.max(0, Math.floor(opts.ruinsDone)),
    clawQuestCinders: Math.max(0, Math.floor(opts.clawQuestCinders)),
    contractFailedTitleRu: opts.contractFailedTitleRu?.trim() || undefined,
  };
}

export function formatDebriefDurationRu(elapsedSec: number): string {
  const sec = Math.max(0, Math.floor(elapsedSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m <= 0) return `${s} с`;
  return `${m} мин ${s.toString().padStart(2, "0")} с`;
}

/** Short diary status line for the abort sheet. */
export function abortDiaryStatusRu(recorded: boolean): string {
  return recorded
    ? "Запись прерывания попала в дневник"
    : "В дневник не записано — только «Завершить» оставляет след";
}

/** Smart Contracts CTA — only when debrief carried a settled contract. */
export function shouldShowSessionContractsCta(
  debrief: Pick<SessionDebrief, "contract">,
): boolean {
  return debrief.contract != null;
}

export function debriefContractsCtaSubRu(
  contract: SessionDebriefContract,
): string {
  switch (contract.status) {
    case "done":
      return "Итог контракта";
    case "failed":
      return "Провал в доске";
    default: {
      const _exhaustive: never = contract.status;
      return _exhaustive;
    }
  }
}

/** Abort sheet — quiet Contracts link only if a contract failed this stop. */
export function shouldShowAbortContractsCta(
  debrief: Pick<AbortDebrief, "contractFailedTitleRu">,
): boolean {
  return Boolean(debrief.contractFailedTitleRu?.trim());
}
