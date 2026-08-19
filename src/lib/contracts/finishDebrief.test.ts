import { describe, expect, it } from "vitest";
import type { ContractInstance } from "./dailyBoard";
import {
  finishDebriefComplete,
  finishDebriefMaxBonus,
  finishDebriefPresetFor,
  isFinishDebriefContract,
  scoreFinishDebrief,
  visibleFinishDebriefQuestions,
} from "./finishDebrief";

function makeContract(
  partial: Partial<ContractInstance> & Pick<ContractInstance, "defId">,
): ContractInstance {
  return {
    instanceId: partial.instanceId ?? "inst-1",
    defId: partial.defId,
    dayKey: partial.dayKey ?? "2026-07-22",
    mistressId: partial.mistressId ?? "hu_tao",
    category: partial.category ?? "oral_cei",
    titleRu: partial.titleRu ?? "Тест",
    bodyRu: partial.bodyRu ?? "Тело",
    reward: partial.reward ?? 14,
    deadlineMs: partial.deadlineMs ?? Date.now() + 60_000,
    status: partial.status ?? "open",
    params: partial.params ?? {},
    difficulty: partial.difficulty ?? 2,
  };
}

describe("finishDebrief", () => {
  it("detects finish_debrief contracts and presets", () => {
    const c = makeContract({
      defId: "finish_cei_dessert",
      params: { finishDebriefPreset: "cei_required", n: 3 },
    });
    expect(isFinishDebriefContract(c)).toBe(true);
    expect(finishDebriefPresetFor(c)).toBe("cei_required");
    expect(finishDebriefMaxBonus("cei_required")).toBeGreaterThan(10);
  });

  it("hides where/ate when user denied finish", () => {
    const visible = visibleFinishDebriefQuestions("cum_allowed", {
      how: "denied",
    });
    expect(visible.map((q) => q.id)).toEqual(["how", "feel"]);
  });

  it("pays bonus for full CEI obedience", () => {
    const answers = {
      how: "full",
      where: "mouth",
      ate: "all",
      feel: "thanks",
    };
    expect(finishDebriefComplete("cei_required", answers)).toBe(true);
    const scored = scoreFinishDebrief(14, "cei_required", answers);
    expect(scored.rewarded).toBeGreaterThan(14);
    expect(scored.tone).toBe("sweet");
  });

  it("zeros reward when CEI required but refused", () => {
    const scored = scoreFinishDebrief(14, "cei_required", {
      how: "full",
      where: "waste",
      ate: "no",
      feel: "greedy",
    });
    expect(scored.rewarded).toBe(0);
    expect(scored.tone).toBe("cruel");
  });

  it("zeros reward when user did not use finish permission", () => {
    const scored = scoreFinishDebrief(12, "cum_allowed", {
      how: "denied",
      feel: "empty",
    });
    expect(scored.rewarded).toBe(0);
  });

  it("punishes full orgasm on ruin-only preset", () => {
    const scored = scoreFinishDebrief(16, "ruin_allowed", {
      how: "full",
      feel: "greedy",
    });
    expect(scored.rewarded).toBe(0);
  });

  it("scores faproulette chain with spins question", () => {
    const ids = visibleFinishDebriefQuestions("faproulette", {}).map(
      (q) => q.id,
    );
    expect(ids[0]).toBe("spins_done");
    const scored = scoreFinishDebrief(12, "faproulette", {
      spins_done: "all",
      how: "ruin",
      where: "hand",
      ate: "all",
      feel: "thanks",
    });
    expect(scored.rewarded).toBeGreaterThan(12);
  });
});
