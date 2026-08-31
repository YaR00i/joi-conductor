import type { ContractInstance } from "./dailyBoard";
import { isFinishDebriefContract } from "./finishDebrief";
import { isMediaDrillContract, type ActiveMediaDrill } from "./mediaDrill";
import {
  buildSessionSeedFromContract,
  isLiveGoalSessionSeed,
  isWearTimerContractDefId,
  type ActiveSessionSeed,
} from "./sessionSeed";

/**
 * How a contract is closed / verified in UX.
 * Honor = self-report. Debrief = honor + finish questionnaire.
 * Everything else is Conductor-checked (session, seal, timer, drill).
 */
export type ContractVerificationMode =
  | "honor"
  | "debrief"
  | "auto"
  | "sealed"
  | "live"
  | "drill"
  | "timer";

export type ContractVerificationInput = {
  contract: ContractInstance;
  activeSeed?: ActiveSessionSeed | null;
  activeDrill?: ActiveMediaDrill | null;
};

/** Short badge copy — shared across ContractsPage / Daily brief. */
export const CONTRACT_VERIFY_BADGE_RU: Record<ContractVerificationMode, string> =
  {
    honor: "на честности",
    debrief: "отчёт",
    auto: "авто",
    sealed: "печать",
    live: "в сессии",
    drill: "колода",
    timer: "таймер",
  };

export function contractVerificationModeFromSeed(
  seed: ActiveSessionSeed,
): ContractVerificationMode {
  if (isWearTimerContractDefId(seed.defId)) return "timer";
  if (isLiveGoalSessionSeed(seed)) return "live";
  if (seed.completion === "honor") return "honor";
  if (seed.lockKeys.length > 0) return "sealed";
  return "auto";
}

/**
 * Single source of truth for honor vs Conductor-verified labeling.
 * Prefers live active seed/drill; otherwise peeks at seed plan / catalog kind.
 */
export function contractVerificationMode(
  input: ContractVerificationInput | ContractInstance,
): ContractVerificationMode {
  const opts: ContractVerificationInput =
    "contract" in input && input.contract
      ? input
      : { contract: input as ContractInstance };
  const { contract, activeSeed, activeDrill } = opts;

  if (activeDrill?.instanceId === contract.instanceId) return "drill";
  if (isMediaDrillContract(contract)) return "drill";
  if (isFinishDebriefContract(contract)) return "debrief";

  if (activeSeed?.instanceId === contract.instanceId) {
    return contractVerificationModeFromSeed(activeSeed);
  }

  if (isWearTimerContractDefId(contract.defId)) return "timer";

  const preview = buildSessionSeedFromContract(contract);
  if (preview) return contractVerificationModeFromSeed(preview);

  return "honor";
}

export function contractVerificationBadgeRu(
  mode: ContractVerificationMode,
): string {
  return CONTRACT_VERIFY_BADGE_RU[mode];
}

/** Tooltip / title — clarifies who checks the contract. */
export function contractVerificationTitleRu(
  mode: ContractVerificationMode,
): string {
  switch (mode) {
    case "honor":
      return "На честности — Conductor не проверяет";
    case "debrief":
      return "На честности — после финала ответь на вопросы";
    case "auto":
      return "Проверит Conductor после сессии";
    case "sealed":
      return "Печать на плане — проверит Conductor";
    case "live":
      return "Прогресс в сессии — проверит Conductor";
    case "drill":
      return "Колода из Контента — доложить число триггеров";
    case "timer":
      return "Таймер клетки/пробки — проверит Conductor";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/**
 * Self-report button copy. Honor path is plain «Выполнил»;
 * verified paths say manual so they do not imply auto-check.
 *
 * When `opts.hasTimer` is true (contract defines a perform-window limit),
 * the honor CTA becomes «Принять» for the first click (which starts the timer
 * by sealing the contract) — the caller swaps to a report CTA once sealed.
 */
export function contractHonorReportCtaRu(
  mode: ContractVerificationMode,
  opts?: { hasTimer?: boolean },
): string {
  switch (mode) {
    case "honor":
      return opts?.hasTimer ? "Принять" : "Выполнил";
    case "debrief":
      return "Доложить финал";
    case "auto":
    case "sealed":
    case "live":
    case "drill":
    case "timer":
      return "Отметил вручную";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/** Compact path hint when there is no primary accept CTA. */
export function contractVerificationPathHintRu(
  mode: ContractVerificationMode,
  opts?: { seeded?: boolean },
): string {
  if (opts?.seeded) {
    switch (mode) {
      case "timer":
        return "таймер активен";
      case "live":
        return "жду в сессии";
      case "sealed":
      case "auto":
        return "печать активна";
      case "honor":
        return "на честности";
      case "debrief":
        return "жду отчёт";
      case "drill":
        return "колода идёт";
      default: {
        const _exhaustive: never = mode;
        return _exhaustive;
      }
    }
  }
  switch (mode) {
    case "honor":
      return "на честности";
    case "debrief":
      return "отчёт о финале";
    case "auto":
      return "проверит Conductor";
    case "sealed":
      return "печать";
    case "live":
      return "в сессии";
    case "drill":
      return "колода";
    case "timer":
      return "таймер";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/** Extra line under an accepted seed — how it closes. */
export function contractVerificationCloseHintRu(
  mode: ContractVerificationMode,
  seed?: ActiveSessionSeed | null,
): string {
  switch (mode) {
    case "honor":
      return "после выполнения отметь «Выполнил»";
    case "debrief":
      return "после финала — «Доложить финал» и ответь на вопросы";
    case "timer":
      return "закроется по таймеру (или «Снял» раньше = провал)";
    case "live":
      if (seed?.verify.kind === "ate_release") {
        return "руин/конч → open→eat→thanks в сессии";
      }
      if (seed?.verify.kind === "ruin_and_eat") {
        return "финал-руин + съесть в сессии";
      }
      if (seed?.verify.kind === "quest_id") {
        return "квест CBT в сессии (платит контракт)";
      }
      return "прогресс в сессии — проверит Conductor";
    case "sealed":
    case "auto":
      return "закроется само, если условие выполнено";
    case "drill":
      return "смотри колоду → «Доложить»";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function isHonorVerificationMode(
  mode: ContractVerificationMode,
): boolean {
  return mode === "honor" || mode === "debrief";
}

export function isConductorVerifiedMode(
  mode: ContractVerificationMode,
): boolean {
  return mode !== "honor" && mode !== "debrief";
}
