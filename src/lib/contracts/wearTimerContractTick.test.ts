import { describe, expect, it } from "vitest";
import {
  evaluateWearTimerTick,
  wearTimerDoneFlashRu,
  wearTimerFailFlashRu,
} from "./wearTimerContractTick";
import type { ActiveSessionSeed } from "./sessionSeed";
import type { ContractInstance } from "./dailyBoard";

function makeSeed(
  partial: Partial<ActiveSessionSeed> & Pick<ActiveSessionSeed, "defId">,
): ActiveSessionSeed {
  return {
    instanceId: partial.instanceId ?? "inst-1",
    dayKey: partial.dayKey ?? "2026-07-22",
    defId: partial.defId,
    titleRu: partial.titleRu ?? "Клетка",
    bodyRu: partial.bodyRu ?? "",
    startedAtMs: partial.startedAtMs ?? Date.now() - 60_000,
    paramsPatch: partial.paramsPatch ?? {},
    lockKeys: partial.lockKeys ?? [],
    verify: partial.verify ?? { kind: "honor" },
    completion: partial.completion ?? "honor",
    linkedCageUntilMs: partial.linkedCageUntilMs,
  };
}

function makeOpen(id = "inst-1"): ContractInstance {
  return {
    instanceId: id,
    defId: "chastity_locked_hours",
    dayKey: "2026-07-22",
    mistressId: "hu_tao",
    category: "chastity",
    titleRu: "Клетка",
    bodyRu: "",
    reward: 12,
    deadlineMs: Date.now() + 60_000,
    status: "open",
    params: { hours: 4 },
    difficulty: 2,
  };
}

describe("evaluateWearTimerTick", () => {
  it("returns none without linked timer", () => {
    expect(
      evaluateWearTimerTick(
        makeSeed({ defId: "chastity_locked_hours" }),
        makeOpen(),
      ),
    ).toEqual({ action: "none" });
  });

  it("returns done when window elapsed and lock gone", () => {
    const seed = makeSeed({
      defId: "anal_plug_hours",
      linkedCageUntilMs: Date.now() - 1000,
    });
    const verdict = evaluateWearTimerTick(seed, makeOpen());
    expect(verdict.action).toBe("done");
    if (verdict.action === "done") {
      expect(verdict.nounCap).toBe("Пробка");
    }
  });

  it("formats flash copy", () => {
    expect(wearTimerDoneFlashRu("Клетка", 10)).toContain("+10");
    expect(wearTimerFailFlashRu("клетка")).toMatch(/провален/i);
  });
});
