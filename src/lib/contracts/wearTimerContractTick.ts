import {
  chastityCageClearedEarly,
  chastityCageWindowElapsed,
  isWearTimerContractDefId,
  wearTimerKindForDefId,
  type ActiveSessionSeed,
} from "./sessionSeed";
import type { ContractInstance } from "./dailyBoard";

export type WearTimerTickResult =
  | { action: "none" }
  | {
      action: "fail_early";
      noun: string;
      nounCap: string;
      kind: "cage" | "plug";
    }
  | {
      action: "done";
      noun: string;
      nounCap: string;
      kind: "cage" | "plug";
    };

/**
 * Pure wear-timer seal evaluation (cage / plug).
 * App applies report/clear/wallet; this only decides the outcome.
 */
export function evaluateWearTimerTick(
  seed: ActiveSessionSeed | null | undefined,
  open: ContractInstance | null | undefined,
): WearTimerTickResult {
  if (
    !seed ||
    !isWearTimerContractDefId(seed.defId) ||
    typeof seed.linkedCageUntilMs !== "number"
  ) {
    return { action: "none" };
  }
  if (!open || open.status !== "open") {
    return { action: "none" };
  }

  const kind = wearTimerKindForDefId(seed.defId) ?? "cage";
  const noun = kind === "plug" ? "пробка" : "клетка";
  const nounCap = kind === "plug" ? "Пробка" : "Клетка";

  if (chastityCageClearedEarly(seed)) {
    return { action: "fail_early", noun, nounCap, kind };
  }
  if (chastityCageWindowElapsed(seed)) {
    return { action: "done", noun, nounCap, kind };
  }
  return { action: "none" };
}

export function wearTimerDoneFlashRu(
  nounCap: string,
  rewarded: number,
): string {
  return rewarded > 0
    ? `${nounCap} выдержана · +${rewarded} угольков`
    : `${nounCap} выдержана — контракт выполнен`;
}

export function wearTimerFailFlashRu(noun: string): string {
  return `Контракт провален: ${noun} снята раньше срока`;
}
