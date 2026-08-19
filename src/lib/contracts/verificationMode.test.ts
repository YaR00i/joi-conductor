import { describe, expect, it } from "vitest";
import type { ContractInstance } from "./dailyBoard";
import {
  contractHonorReportCtaRu,
  contractVerificationBadgeRu,
  contractVerificationMode,
  contractVerificationModeFromSeed,
} from "./verificationMode";
import { buildSessionSeedFromContract } from "./sessionSeed";

function makeContract(
  partial: Partial<ContractInstance> & Pick<ContractInstance, "defId">,
): ContractInstance {
  return {
    instanceId: partial.instanceId ?? "inst-1",
    defId: partial.defId,
    dayKey: partial.dayKey ?? "2026-07-22",
    mistressId: partial.mistressId ?? "hu_tao",
    category: partial.category ?? "session_mod",
    titleRu: partial.titleRu ?? "Тест",
    bodyRu: partial.bodyRu ?? "Тело",
    reward: partial.reward ?? 10,
    deadlineMs: partial.deadlineMs ?? Date.now() + 60_000,
    status: partial.status ?? "open",
    params: partial.params ?? {},
    difficulty: partial.difficulty ?? 2,
  };
}

describe("contractVerificationMode", () => {
  it("labels plain board contracts as honor", () => {
    const c = makeContract({
      defId: "body_nipples_x3",
      category: "body",
    });
    expect(contractVerificationMode(c)).toBe("honor");
    expect(contractVerificationBadgeRu("honor")).toBe("на честности");
    expect(contractHonorReportCtaRu("honor")).toBe("Выполнил");
  });

  it("labels media drills as drill", () => {
    const c = makeContract({
      defId: "media_cache_triggers",
      category: "media",
      params: { limit: 40 },
    });
    expect(contractVerificationMode(c)).toBe("drill");
    expect(contractHonorReportCtaRu("drill")).toBe("Отметил вручную");
  });

  it("labels finish-permission contracts as debrief", () => {
    const c = makeContract({
      defId: "finish_earned_cum",
      category: "oral_cei",
      params: { n: 4, finishDebriefPreset: "cum_allowed" },
    });
    expect(contractVerificationMode(c)).toBe("debrief");
    expect(contractVerificationBadgeRu("debrief")).toBe("отчёт");
    expect(contractHonorReportCtaRu("debrief")).toBe("Доложить финал");
  });

  it("labels wear timers as timer (Conductor pill), not honor", () => {
    const c = makeContract({
      defId: "chastity_locked_hours",
      category: "chastity",
      params: { hours: 4 },
    });
    expect(contractVerificationMode(c)).toBe("timer");
    const seed = buildSessionSeedFromContract(c)!;
    expect(contractVerificationModeFromSeed(seed)).toBe("timer");
  });

  it("labels edge quota seals as live", () => {
    const c = makeContract({
      defId: "edge_count",
      category: "edge",
      params: { n: 5 },
    });
    expect(contractVerificationMode(c)).toBe("live");
  });

  it("labels mode seals as sealed", () => {
    const c = makeContract({
      defId: "session_anal_plug_mod",
      params: {},
    });
    expect(contractVerificationMode(c)).toBe("sealed");
  });

  it("labels oral CEI chain as live", () => {
    const c = makeContract({
      defId: "oral_next_ruin_eat",
      category: "oral_cei",
      params: {},
    });
    expect(contractVerificationMode(c)).toBe("live");
  });

  it("prefers active seed instance over catalog peek", () => {
    const c = makeContract({
      defId: "edge_count",
      category: "edge",
      params: { n: 5 },
    });
    const seed = buildSessionSeedFromContract(c)!;
    expect(
      contractVerificationMode({
        contract: c,
        activeSeed: seed,
      }),
    ).toBe("live");
  });
});
