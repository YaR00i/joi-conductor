import type { SessionParams } from "../types";
import type { SessionDebriefContract } from "../sessionDebrief";
import {
  evaluateSessionSeed,
  type ActiveSessionSeed,
} from "./sessionSeed";

export type SessionSeedEndSnapshot = {
  edgesDone: number;
  ruinsDone: number;
  finaleOutcome?: "cum" | "ruin" | "deny";
  params: SessionParams;
};

export type SessionSeedEndSettlePlan =
  | { kind: "none" }
  | {
      kind: "done";
      titleRu: string;
    }
  | {
      kind: "failed";
      titleRu: string;
      reasonRu: string;
    };

export function sessionSeedEndDoneFlashRu(rewarded: number): string {
  return rewarded > 0
    ? `Контракт выполнен · +${rewarded} угольков`
    : "Контракт выполнен";
}

export function sessionSeedEndFailedFlashRu(reasonRu: string): string {
  return `Контракт провален: ${reasonRu}`;
}

export function sessionSeedEndDebrief(
  plan: Exclude<SessionSeedEndSettlePlan, { kind: "none" }>,
  rewarded: number,
): SessionDebriefContract {
  switch (plan.kind) {
    case "done":
      return {
        status: "done",
        titleRu: plan.titleRu,
        rewarded: Math.max(0, Math.floor(rewarded)),
      };
    case "failed":
      return {
        status: "failed",
        titleRu: plan.titleRu,
        rewarded: 0,
        reasonRu: plan.reasonRu,
      };
    default: {
      const _exhaustive: never = plan;
      return _exhaustive;
    }
  }
}

/**
 * Pure session_end settle plan for an active seed.
 * App applies reportContract / wallet / flash from the plan.
 */
export function planSessionSeedEndSettle(
  seed: ActiveSessionSeed | null | undefined,
  st: SessionSeedEndSnapshot | null,
  reason: "complete" | "abort",
): SessionSeedEndSettlePlan {
  if (!seed) return { kind: "none" };
  const verdict = evaluateSessionSeed(seed, st, reason);
  switch (verdict.result) {
    case "pending":
      return { kind: "none" };
    case "done":
      return { kind: "done", titleRu: seed.titleRu };
    case "failed":
      return {
        kind: "failed",
        titleRu: seed.titleRu,
        reasonRu: verdict.reasonRu,
      };
    default: {
      const _exhaustive: never = verdict;
      return _exhaustive;
    }
  }
}
