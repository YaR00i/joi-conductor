import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "../types";
import type { ContractInstance } from "./dailyBoard";
import {
  applySealToRouletteStep,
  buildSealedRouletteOption,
  buildSessionSeedFromContract,
  pickSealedFatePhraseRu,
  pruneStaleSessionSeed,
  rouletteStepToLockKey,
  sealedFatePhraseForSeed,
  sessionSeedHasLock,
  sessionSeedLocksRouletteStep,
  SEALED_FATE_PHRASES_RU,
  clearActiveSessionSeed,
  evaluateSessionSeed,
  type ActiveSessionSeed,
} from "./sessionSeed";

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
    params: partial.params ?? { n: 8 },
    difficulty: partial.difficulty ?? 2,
  };
}

describe("session seal helpers", () => {
  it("builds ruin seal with finaleOdds + ruins + eat chain", () => {
    const seed = buildSessionSeedFromContract(
      makeContract({ defId: "session_ruin_only", params: {} }),
    );
    expect(seed).not.toBeNull();
    expect(sessionSeedHasLock(seed, "finaleOdds")).toBe(true);
    expect(sessionSeedHasLock(seed, "ruins")).toBe(true);
    expect(sessionSeedHasLock(seed, "finish")).toBe(true);
    expect(sessionSeedHasLock(seed, "cumplay")).toBe(true);
    expect(seed!.verify.kind).toBe("ruin_and_eat");
    expect(seed!.progress?.steps).toHaveLength(4);
    expect(seed!.paramsPatch.pRuin).toBeGreaterThan(0.5);
    expect(seed!.sealedPhraseRu).toBeTruthy();
    expect(seed!.deadlineMs).toBeGreaterThan(Date.now());
  });

  it("builds edge seal locking edges (+ duration when hinted)", () => {
    const seed = buildSessionSeedFromContract(
      makeContract({
        defId: "edge_count",
        category: "edge",
        params: { n: 5 },
      }),
    );
    expect(seed).not.toBeNull();
    expect(sessionSeedHasLock(seed, "edges")).toBe(true);
    expect(seed!.verify).toEqual({ kind: "edges_min", n: 5 });
    expect(seed!.completion).toBe("auto");
  });

  it("accepts an ordinary legacy board contract as a timed honor seal", () => {
    const before = Date.now();
    const seed = buildSessionSeedFromContract(
      makeContract({
        defId: "body_nipples_x3",
        category: "body",
        params: {},
      }),
    );
    expect(seed).not.toBeNull();
    expect(seed!.completion).toBe("honor");
    expect(seed!.lockKeys).toEqual([]);
    expect(seed!.performDeadlineMs).toBeGreaterThan(before);
  });

  it("maps roulette steps to lock keys exhaustively for sealable axes", () => {
    expect(rouletteStepToLockKey("mode")).toBe("mode");
    expect(rouletteStepToLockKey("duration")).toBe("duration");
    expect(rouletteStepToLockKey("edges")).toBe("edges");
    expect(rouletteStepToLockKey("ruins")).toBe("ruins");
    expect(rouletteStepToLockKey("finaleOdds")).toBe("finaleOdds");
    expect(rouletteStepToLockKey("finish")).toBe("finish");
    expect(rouletteStepToLockKey("cumplay")).toBe("cumplay");
    expect(rouletteStepToLockKey("cumplay_heavy")).toBe("cumplay");
    expect(rouletteStepToLockKey("mood")).toBeNull();
    expect(rouletteStepToLockKey("toys_1")).toBeNull();
  });

  it("collapses locked roulette step to a single sealed option", () => {
    const seed = buildSessionSeedFromContract(
      makeContract({
        defId: "session_anal_plug_mod",
        params: {},
      }),
    )!;
    expect(sessionSeedLocksRouletteStep(seed, "mode")).toBe(true);
    const opt = buildSealedRouletteOption(seed, "mode", "hu_tao");
    expect(opt).not.toBeNull();
    expect(opt!.id).toBe("anal");
    expect(opt!.labelRu).toContain("·");

    const sealed = applySealToRouletteStep(
      {
        id: "mode",
        titleRu: "Режим",
        speakEn: "x",
        options: [
          { id: "stroke", labelRu: "Дрочка", weight: 1 },
          { id: "anal", labelRu: "Анал", weight: 1 },
        ],
      },
      seed,
      "hu_tao",
    );
    expect(sealed.options).toHaveLength(1);
    expect(sealed.options[0]!.id).toBe("anal");
  });

  it("keeps unlocked roulette steps multi-option", () => {
    const seed = buildSessionSeedFromContract(
      makeContract({ defId: "session_anal_plug_mod", params: {} }),
    )!;
    const mood = applySealToRouletteStep(
      {
        id: "mood",
        titleRu: "Mood",
        speakEn: "x",
        options: [
          { id: "sweet", labelRu: "Sweet", weight: 1 },
          { id: "cruel", labelRu: "Cruel", weight: 1 },
        ],
      },
      seed,
    );
    expect(mood.options).toHaveLength(2);
  });

  it("picks sealed phrases from the shared pool or mistress line", () => {
    const a = pickSealedFatePhraseRu("furina", "salt-a");
    const b = pickSealedFatePhraseRu("furina", "salt-a");
    expect(a).toBe(b);
    const known = new Set<string>([
      ...SEALED_FATE_PHRASES_RU,
      "Вердикт вынесен",
    ]);
    expect(known.has(a)).toBe(true);
  });

  it("prefers stored sealedPhraseRu on the seed", () => {
    const seed: ActiveSessionSeed = {
      instanceId: "x",
      dayKey: "2026-07-22",
      defId: "session_ruin_only",
      titleRu: "t",
      bodyRu: "b",
      startedAtMs: 1,
      sealedPhraseRu: "Судьба предрешена",
      paramsPatch: { pCum: 0, pRuin: 1 },
      lockKeys: ["finaleOdds"],
      verify: { kind: "finale_in", outcomes: ["ruin"] },
      completion: "auto",
    };
    expect(sealedFatePhraseForSeed(seed, "sparkle")).toBe("Судьба предрешена");
  });

  it("builds oral_next_ruin_eat as live goal with finish/cumplay seals", () => {
    const seed = buildSessionSeedFromContract(
      makeContract({
        defId: "oral_next_ruin_eat",
        category: "oral_cei",
        params: {},
      }),
    );
    expect(seed).not.toBeNull();
    expect(seed!.lockKeys).toEqual(["finish", "cumplay"]);
    expect(sessionSeedHasLock(seed, "finish")).toBe(true);
    expect(sessionSeedHasLock(seed, "cumplay")).toBe(true);
    expect(seed!.verify.kind).toBe("ate_release");
    expect(seed!.progress?.steps).toHaveLength(3);

    const finishOpt = buildSealedRouletteOption(seed!, "finish", "hu_tao");
    expect(finishOpt?.id).toBe("hand");
    const cumOpt = buildSealedRouletteOption(seed!, "cumplay", "hu_tao");
    expect(cumOpt?.id).toBe("swallow");

    const baseState = {
      edgesDone: 0,
      ruinsDone: 0,
      finaleOutcome: "deny" as const,
      params: DEFAULT_PARAMS,
    };
    expect(evaluateSessionSeed(seed!, baseState, "complete")).toEqual({
      result: "pending",
    });

    expect(
      evaluateSessionSeed(
        { ...seed!, progress: { ...seed!.progress!, status: "awaiting" } },
        { ...baseState, edgesDone: 2, ruinsDone: 1, finaleOutcome: undefined },
        "complete",
      ).result,
    ).toBe("failed");
  });

  it("builds edge_count with live progress and chastity cage honor seed", () => {
    const edges = buildSessionSeedFromContract(
      makeContract({
        defId: "edge_count",
        category: "edge",
        params: { n: 5 },
      }),
    )!;
    expect(edges.progress?.steps[0]?.id).toBe("edges_quota");
    expect(edges.verify).toEqual({ kind: "edges_min", n: 5 });

    const cage = buildSessionSeedFromContract(
      makeContract({
        defId: "chastity_locked_hours",
        category: "chastity",
        params: { hours: 8 },
      }),
    )!;
    expect(cage.lockKeys).toEqual([]);
    expect(cage.verify.kind).toBe("honor");
    expect(cage.progress?.steps[0]?.labelRu).toMatch(/8/);

    const plug = buildSessionSeedFromContract(
      makeContract({
        defId: "anal_plug_hours",
        category: "anal",
        params: { hours: 2 },
      }),
    )!;
    expect(plug.lockKeys).toEqual([]);
    expect(plug.verify.kind).toBe("honor");
    expect(plug.progress?.steps[0]?.id).toBe("plug_hours");
    expect(plug.progress?.steps[0]?.labelRu).toMatch(/Пробка/);
  });

  it("edge_hands_off does not treat minutes as session duration", () => {
    const seed = buildSessionSeedFromContract(
      makeContract({
        defId: "edge_hands_off",
        category: "edge",
        params: { n: 3, minutes: 15 },
      }),
    )!;
    expect(seed.handsOffSec).toBe(15 * 60);
    expect(seed.paramsPatch.durationSec).not.toBe(15 * 60);
    expect(seed.progress?.steps).toHaveLength(2);
  });

  it("prunes seal when contract is expired or missing", () => {
    const seed = buildSessionSeedFromContract(
      makeContract({ defId: "session_deny_tomorrow", params: {} }),
    )!;
    expect(
      pruneStaleSessionSeed(
        () => ({ ...makeContract({ defId: seed.defId }), status: "expired" }),
        Date.now(),
        seed,
      ),
    ).toBeNull();

    expect(pruneStaleSessionSeed(() => null, Date.now(), seed)).toBeNull();

    const open = makeContract({
      defId: seed.defId,
      instanceId: seed.instanceId,
      status: "open",
      deadlineMs: Date.now() + 10_000,
    });
    const live = { ...seed, deadlineMs: open.deadlineMs };
    expect(
      pruneStaleSessionSeed(() => open, Date.now(), live)?.instanceId,
    ).toBe(seed.instanceId);

    expect(
      pruneStaleSessionSeed(
        () => open,
        open.deadlineMs + 1,
        live,
      ),
    ).toBeNull();

    clearActiveSessionSeed();
  });
});
