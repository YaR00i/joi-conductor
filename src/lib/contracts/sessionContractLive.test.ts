import { describe, expect, it } from "vitest";
import type { ContractInstance } from "./dailyBoard";
import {
  armSeedOnReleaseRitual,
  buildContractProgressFlash,
  buildEdgeQuotaFlash,
  cbtQuestDoneRestyleRu,
  completeHandsOffRestStep,
  completeSeedLiveStep,
  cumplayAnswerFulfillsRuinEat,
  denialHoursUntilDeadline,
  failHandsOffOnUnauthorized,
  failSeedLiveStep,
  isContractHandsOffBlockId,
  noteCumplayAnswerOnCeiSeed,
  noteEdgeDoneOnSeed,
  noteQuestCompletedOnSeed,
  noteUnauthorizedOnSeed,
  ruinEatRestyleRu,
  shouldRestyleCumplayEat,
} from "./sessionContractLive";
import {
  buildSessionSeedFromContract,
  CEI_SEAL_CUMPLAY_ID,
  CEI_SEAL_FINISH_ID,
  evaluateSessionSeed,
} from "./sessionSeed";
import { DEFAULT_PARAMS } from "../types";

function makeOralEatContract(): ContractInstance {
  return {
    instanceId: "inst-eat",
    defId: "oral_next_ruin_eat",
    dayKey: "2026-07-22",
    mistressId: "hu_tao",
    category: "oral_cei",
    titleRu: "Следующий руин — съесть",
    bodyRu: "Съешь",
    reward: 20,
    deadlineMs: Date.now() + 60_000,
    status: "open",
    params: {},
    difficulty: 2,
  };
}

function makeEdgeContract(
  defId: string,
  params: Record<string, string | number>,
): ContractInstance {
  return {
    instanceId: `inst-${defId}`,
    defId,
    dayKey: "2026-07-22",
    mistressId: "hu_tao",
    category: defId.startsWith("session_") ? "session_mod" : "edge",
    titleRu: "Эджи",
    bodyRu: "Набери",
    reward: 14,
    deadlineMs: Date.now() + 60_000,
    status: "open",
    params,
    difficulty: 2,
  };
}

function makeCbtContract(defId: string): ContractInstance {
  return {
    instanceId: `inst-${defId}`,
    defId,
    dayKey: "2026-07-22",
    mistressId: "furina",
    category: "cbt",
    titleRu: "CBT",
    bodyRu: "Удары",
    reward: 18,
    deadlineMs: Date.now() + 60_000,
    status: "open",
    params: { taps: 20 },
    difficulty: 2,
  };
}

describe("sessionContractLive", () => {
  it("builds oral_next_ruin_eat with finish/cumplay seals + 3-step CEI", () => {
    const seed = buildSessionSeedFromContract(makeOralEatContract());
    expect(seed).not.toBeNull();
    expect(seed!.lockKeys).toEqual(["finish", "cumplay"]);
    expect(seed!.paramsPatch.finishId).toBe(CEI_SEAL_FINISH_ID);
    expect(seed!.paramsPatch.cumplayId).toBe(CEI_SEAL_CUMPLAY_ID);
    expect(seed!.verify).toEqual({ kind: "ate_release" });
    expect(seed!.progress?.steps).toHaveLength(3);
    expect(seed!.progress?.steps.map((s) => s.id)).toEqual([
      "cei_open",
      "cei_eat",
      "cei_thanks",
    ]);
    expect(seed!.progress?.status).toBe("pending");
  });

  it("advances open → eat → thanks and settles only at the end", () => {
    const seed = buildSessionSeedFromContract(makeOralEatContract())!;
    const armed = armSeedOnReleaseRitual(seed, {
      ritualContext: "finale",
      outcome: "ruin",
    })!;
    expect(armed.progress?.status).toBe("awaiting");

    const open = noteCumplayAnswerOnCeiSeed(armed, {
      stepId: "open_ruin",
      optionEffect: "cumplay_ok",
      reward: 20,
    })!;
    expect(open.settleDone).toBe(false);
    expect(open.next.progress?.completedStepIds).toContain("cei_open");
    expect(open.flash?.ruleRu).toMatch(/2\/3/);

    const eat = noteCumplayAnswerOnCeiSeed(open.next, {
      stepId: "tempt_eat_ruin",
      optionEffect: "cumplay_ok",
      reward: 20,
    })!;
    expect(eat.settleDone).toBe(false);
    expect(eat.next.progress?.completedStepIds).toContain("cei_eat");
    expect(eat.flash?.ruleRu).toMatch(/3\/3/);

    const thanks = noteCumplayAnswerOnCeiSeed(eat.next, {
      stepId: "close",
      optionEffect: "cumplay_ok",
      reward: 20,
    })!;
    expect(thanks.settleDone).toBe(true);
    expect(thanks.next.progress?.status).toBe("done");
  });

  it("fails live CEI on eat fail without completing", () => {
    const seed = buildSessionSeedFromContract(makeOralEatContract())!;
    const armed = armSeedOnReleaseRitual(seed)!;
    const afterOpen = noteCumplayAnswerOnCeiSeed(armed, {
      stepId: "open_ruin",
      optionEffect: "cumplay_ok",
      reward: 20,
    })!;
    const failed = noteCumplayAnswerOnCeiSeed(afterOpen.next, {
      stepId: "tempt_eat_ruin",
      optionEffect: "cumplay_fail",
      reward: 20,
    })!;
    expect(failed.settleFailed).toBe(true);
    expect(failed.next.progress?.status).toBe("failed");
  });

  it("restyles dock per CEI step", () => {
    const seed = buildSessionSeedFromContract(makeOralEatContract())!;
    const armed = armSeedOnReleaseRitual(seed)!;
    expect(
      shouldRestyleCumplayEat({ seed: armed, stepId: "open_ruin" }),
    ).toBe(true);
    expect(ruinEatRestyleRu(armed).okButtonLabelRu).toMatch(/показал/i);

    const afterOpen = completeSeedLiveStep(armed, "cei_open")!;
    expect(
      shouldRestyleCumplayEat({ seed: afterOpen, stepId: "tempt_eat_ruin" }),
    ).toBe(true);
    expect(ruinEatRestyleRu(afterOpen).promptLabelRu).toMatch(/съешь/i);

    expect(
      cumplayAnswerFulfillsRuinEat({
        stepId: "main_swallow",
        optionEffect: "cumplay_ok",
        cumplayId: "swallow",
      }),
    ).toBe(true);

    const flash = buildContractProgressFlash(armed, 20);
    expect(flash.metaRu).toMatch(/печать/i);
    expect(flash.ruleRu).toMatch(/1\/3/);
    expect(flash.reward).toBe(20);
  });

  it("builds session_ruin_only as ruin_and_eat composite with eat chain", () => {
    const seed = buildSessionSeedFromContract(
      makeEdgeContract("session_ruin_only", {}),
    )!;
    expect(seed.verify).toEqual({ kind: "ruin_and_eat" });
    expect(seed.lockKeys).toEqual(
      expect.arrayContaining(["finaleOdds", "ruins", "finish", "cumplay"]),
    );
    expect(seed.paramsPatch.finishId).toBe(CEI_SEAL_FINISH_ID);
    expect(seed.progress?.steps[0]?.id).toBe("ruin_finale");
    expect(seed.progress?.steps).toHaveLength(4);

    const armedFinale = armSeedOnReleaseRitual(seed, {
      ritualContext: "finale",
      outcome: "ruin",
    })!;
    expect(armedFinale.progress?.completedStepIds).toContain("ruin_finale");
    expect(armedFinale.progress?.steps[armedFinale.progress.currentStep]?.id).toBe(
      "cei_open",
    );

    const flash = buildContractProgressFlash(armedFinale, 12);
    expect(flash.ruleRu).toMatch(/руин|покажи|съесть|спасибо/i);
  });

  it("ruin_and_eat evaluates need finale ruin AND chain done", () => {
    const seed = buildSessionSeedFromContract(
      makeEdgeContract("session_ruin_only", {}),
    )!;
    const base = {
      edgesDone: 2,
      ruinsDone: 1,
      finaleOutcome: "ruin" as const,
      params: DEFAULT_PARAMS,
    };
    expect(evaluateSessionSeed(seed, base, "complete").result).toBe("failed");

    const done = {
      ...seed,
      progress: {
        ...seed.progress!,
        status: "done" as const,
        completedStepIds: seed.progress!.steps.map((s) => s.id),
        currentStep: seed.progress!.steps.length - 1,
      },
    };
    expect(evaluateSessionSeed(done, base, "complete")).toEqual({
      result: "done",
    });
    expect(
      evaluateSessionSeed(
        done,
        { ...base, finaleOutcome: "deny" },
        "complete",
      ).result,
    ).toBe("failed");
  });

  it("flashes edge quota progress and settles at target", () => {
    const seed = buildSessionSeedFromContract(
      makeEdgeContract("edge_count", { n: 3 }),
    )!;
    expect(seed.progress?.steps).toHaveLength(1);

    const mid = noteEdgeDoneOnSeed(seed, 2, 14)!;
    expect(mid.settleDone).toBe(false);
    expect(mid.injectHandsOff).toBe(false);
    expect(mid.flash.ruleRu).toBe("2/3 эджей");
    expect(buildEdgeQuotaFlash(seed, 2, 14).ruleRu).toBe("2/3 эджей");

    const hit = noteEdgeDoneOnSeed(mid.next, 3, 14)!;
    expect(hit.settleDone).toBe(true);
    expect(hit.next.progress?.status).toBe("done");
    expect(hit.flash.ruleRu).toBe("3/3 эджей");
  });

  it("arms hands-off rest after edge quota for edge_hands_off", () => {
    const seed = buildSessionSeedFromContract(
      makeEdgeContract("edge_hands_off", { n: 2, minutes: 15 }),
    )!;
    expect(seed.progress?.steps).toHaveLength(2);
    expect(seed.handsOffSec).toBe(15 * 60);

    const hit = noteEdgeDoneOnSeed(seed, 2, 14)!;
    expect(hit.settleDone).toBe(false);
    expect(hit.injectHandsOff).toBe(true);
    expect(hit.handsOffSec).toBe(15 * 60);
    expect(hit.flash.ruleRu).toMatch(/руки прочь/i);
    expect(hit.next.progress?.steps[hit.next.progress.currentStep]?.id).toBe(
      "hands_off",
    );

    const done = completeHandsOffRestStep(hit.next)!;
    expect(done.progress?.status).toBe("done");

    expect(isContractHandsOffBlockId("contract-hands-off-123")).toBe(true);
    expect(isContractHandsOffBlockId("late-1")).toBe(false);
  });

  it("fails hands-off on unauthorized during rest window", () => {
    const seed = buildSessionSeedFromContract(
      makeEdgeContract("edge_hands_off", { n: 1, minutes: 10 }),
    )!;
    const hit = noteEdgeDoneOnSeed(seed, 1, 14)!;
    const failed = failHandsOffOnUnauthorized(hit.next)!;
    expect(failed.progress?.status).toBe("failed");

    const baseState = {
      edgesDone: 1,
      ruinsDone: 0,
      finaleOutcome: undefined,
      params: DEFAULT_PARAMS,
    };
    expect(evaluateSessionSeed(failed, baseState, "complete").result).toBe(
      "failed",
    );
  });

  it("unauthorized fails deny/CEI but taxes edge quota without double-fail", () => {
    const deny = buildSessionSeedFromContract(
      makeEdgeContract("session_deny_tomorrow", {}),
    )!;
    expect(noteUnauthorizedOnSeed(deny, "edge").action).toBe("tax");
    expect(noteUnauthorizedOnSeed(deny, "cum").action).toBe("fail");

    const cei = armSeedOnReleaseRitual(
      buildSessionSeedFromContract(makeOralEatContract())!,
    )!;
    expect(noteUnauthorizedOnSeed(cei, "ruin").action).toBe("fail");

    const edges = buildSessionSeedFromContract(
      makeEdgeContract("edge_count", { n: 3 }),
    )!;
    expect(noteUnauthorizedOnSeed(edges, "edge").action).toBe("tax");

    const hands = noteEdgeDoneOnSeed(
      buildSessionSeedFromContract(
        makeEdgeContract("edge_hands_off", { n: 1, minutes: 10 }),
      )!,
      1,
      14,
    )!;
    // Hands-off rest is exclusive — noteUnauthorized ignores (caller uses failHandsOff).
    expect(noteUnauthorizedOnSeed(hands.next, "edge").action).toBe("ignore");
  });

  it("CBT seed settles on ball_taps quest; contract pays (quest reward suppressed by caller)", () => {
    const seed = buildSessionSeedFromContract(makeCbtContract("cbt_taps"))!;
    expect(seed.verify).toEqual({
      kind: "quest_id",
      questIds: ["ball_taps"],
    });
    expect(seed.linkedQuestId).toBe("ball_taps");
    expect(cbtQuestDoneRestyleRu(seed)?.doneLabelRu).toMatch(/печати/i);

    const noted = noteQuestCompletedOnSeed(seed, "ball_taps", 18)!;
    expect(noted.settleDone).toBe(true);
    expect(noted.next.progress?.status).toBe("done");
    expect(
      noteQuestCompletedOnSeed(seed, "edge_rush", 10),
    ).toBeNull();
  });

  it("session_end fails hands-off if rest not finished", () => {
    const seed = buildSessionSeedFromContract(
      makeEdgeContract("edge_hands_off", { n: 1, minutes: 10 }),
    )!;
    const hit = noteEdgeDoneOnSeed(seed, 1, 14)!;
    expect(
      evaluateSessionSeed(
        hit.next,
        {
          edgesDone: 1,
          ruinsDone: 0,
          finaleOutcome: "deny",
          params: DEFAULT_PARAMS,
        },
        "complete",
      ),
    ).toEqual({
      result: "failed",
      reasonRu: "Руки прочь не выдержаны",
    });
  });

  it("clamps denial hours until deadline", () => {
    const now = Date.now();
    expect(denialHoursUntilDeadline(now + 10 * 60_000, now)).toBe(0.25);
    expect(denialHoursUntilDeadline(now + 3 * 3_600_000, now)).toBe(3);
    expect(denialHoursUntilDeadline(now + 100 * 3_600_000, now)).toBe(48);
  });

  it("failSeedLiveStep keeps status failed", () => {
    const seed = buildSessionSeedFromContract(makeOralEatContract())!;
    const armed = armSeedOnReleaseRitual(seed)!;
    const failed = failSeedLiveStep(armed)!;
    expect(failed.progress?.status).toBe("failed");
  });
});
