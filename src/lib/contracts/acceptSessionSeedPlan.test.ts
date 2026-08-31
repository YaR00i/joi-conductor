import { describe, expect, it } from "vitest";
import { planAcceptSessionSeed } from "./acceptSessionSeedPlan";
import type { ContractInstance } from "./dailyBoard";
import { buildSessionSeedFromContract } from "./sessionSeed";

function makeContract(
  partial: Partial<ContractInstance> & Pick<ContractInstance, "defId">,
): ContractInstance {
  return {
    instanceId: partial.instanceId ?? "inst-1",
    defId: partial.defId,
    dayKey: partial.dayKey ?? "2026-09-01",
    mistressId: partial.mistressId ?? "hu_tao",
    category: partial.category ?? "anal",
    titleRu: partial.titleRu ?? "Тест",
    bodyRu: partial.bodyRu ?? "Тело",
    reward: partial.reward ?? 10,
    deadlineMs: partial.deadlineMs ?? Date.now() + 60_000,
    status: partial.status ?? "open",
    params: partial.params ?? {},
    difficulty: partial.difficulty ?? 2,
  };
}

describe("planAcceptSessionSeed", () => {
  it("keeps wear timers on the current screen", () => {
    const contract = makeContract({
      defId: "anal_plug_hours",
      params: { hours: 2 },
      titleRu: "Пробка на часы",
    });
    const seed = buildSessionSeedFromContract(contract);
    expect(seed).not.toBeNull();
    const plan = planAcceptSessionSeed(contract, seed!);
    expect(plan.nav).toBe("stay");
    expect(plan.wear).toEqual({ kind: "plug", hours: 2 });
  });

  it("keeps honor-only contracts on the current screen", () => {
    const contract = makeContract({
      defId: "body_daily_exercise",
      category: "body",
      params: {},
    });
    const seed = buildSessionSeedFromContract(contract);
    expect(seed).not.toBeNull();
    expect(planAcceptSessionSeed(contract, seed!).nav).toBe("stay");
  });

  it("opens roulette when the seal locks the plan", () => {
    const contract = makeContract({
      defId: "session_ruin_only",
      category: "session_mod",
      params: {},
    });
    const seed = buildSessionSeedFromContract(contract);
    expect(seed).not.toBeNull();
    expect(planAcceptSessionSeed(contract, seed!).nav).toBe("roulette");
  });
});
