import type { WearTimerKind } from "../cageTimer";
import type { ContractInstance } from "./dailyBoard";
import {
  isLiveGoalSessionSeed,
  isWearTimerContractDefId,
  wearTimerKindForDefId,
  type ActiveSessionSeed,
} from "./sessionSeed";

export type AcceptSessionSeedNav = "stay" | "roulette";

export type AcceptSessionSeedPlan = {
  seed: ActiveSessionSeed;
  /** Start hub denial pill until board deadline (hours). */
  denialHours?: number;
  /** Start wear-timer pill (cage / plug). */
  wear?: { kind: WearTimerKind; hours: number };
  nav: AcceptSessionSeedNav;
  flashRu: string;
};

function hoursFromContract(
  contract: ContractInstance,
  fallback: number,
): number {
  const raw = contract.params.hours;
  const hours =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : fallback;
  return Number.isFinite(hours) && hours > 0 ? hours : fallback;
}

export function acceptSessionSeedFlashRu(seed: ActiveSessionSeed): string {
  const wearOnly = isWearTimerContractDefId(seed.defId);
  const liveGoal = isLiveGoalSessionSeed(seed);
  const sealed = seed.lockKeys.length > 0;
  const wearLabel =
    wearTimerKindForDefId(seed.defId) === "plug" ? "Пробка" : "Клетка";

  if (wearOnly) {
    return `${wearLabel} «${seed.titleRu}» — таймер запущен.`;
  }
  if (liveGoal && sealed) {
    return `Условия «${seed.titleRu}» приняты — печать + прогресс в сессии.`;
  }
  if (liveGoal) {
    return `Обязательство «${seed.titleRu}» принято — жду руин в сессии.`;
  }
  if (seed.completion === "honor" && seed.lockKeys.length === 0) {
    return seed.performDeadlineMs
      ? `Контракт «${seed.titleRu}» принят — таймер выполнения запущен.`
      : `Контракт «${seed.titleRu}» принят.`;
  }
  return `Условия «${seed.titleRu}» приняты — печать на плане. Снять можно до дедлайна.`;
}

/**
 * Pure side-effect plan after `startSessionSeedFromContract`.
 * App applies denial/cage timers, nav, and flash from this plan.
 */
export function planAcceptSessionSeed(
  contract: ContractInstance,
  seed: ActiveSessionSeed,
  opts?: { denialHoursUntilDeadline?: (deadlineMs: number) => number },
): AcceptSessionSeedPlan {
  let denialHours: number | undefined;
  let wear: AcceptSessionSeedPlan["wear"];

  if (seed.defId === "session_deny_tomorrow") {
    const deadlineMs =
      contract.deadlineMs ?? seed.deadlineMs ?? Date.now() + 86_400_000;
    denialHours = opts?.denialHoursUntilDeadline
      ? opts.denialHoursUntilDeadline(deadlineMs)
      : Math.max(1, Math.ceil((deadlineMs - Date.now()) / 3_600_000));
  }

  const wearKind = wearTimerKindForDefId(seed.defId);
  if (wearKind) {
    const hours = hoursFromContract(
      contract,
      wearKind === "plug" ? 2 : 4,
    );
    wear = { kind: wearKind, hours };
  }

  const wearOnly = isWearTimerContractDefId(seed.defId);
  const honorOnly = seed.completion === "honor" && seed.lockKeys.length === 0;
  return {
    seed,
    denialHours,
    wear,
    nav: wearOnly || honorOnly ? "stay" : "roulette",
    flashRu: acceptSessionSeedFlashRu(seed),
  };
}
