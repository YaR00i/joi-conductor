import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "../types";
import {
  planSessionSeedEndSettle,
  sessionSeedEndDebrief,
  sessionSeedEndDoneFlashRu,
  sessionSeedEndFailedFlashRu,
} from "./sessionSeedEndSettle";
import type { ActiveSessionSeed } from "./sessionSeed";

function seed(over: Partial<ActiveSessionSeed> = {}): ActiveSessionSeed {
  return {
    instanceId: "c1",
    dayKey: "2026-07-22",
    defId: "edges_5",
    titleRu: "Пять граней",
    bodyRu: "5 эджей",
    startedAtMs: Date.now(),
    paramsPatch: {},
    lockKeys: [],
    verify: { kind: "edges_min", n: 5 },
    completion: "auto",
    ...over,
  };
}

describe("planSessionSeedEndSettle", () => {
  it("keeps abort pending", () => {
    const plan = planSessionSeedEndSettle(
      seed(),
      {
        edgesDone: 5,
        ruinsDone: 0,
        params: DEFAULT_PARAMS,
      },
      "abort",
    );
    expect(plan.kind).toBe("none");
  });

  it("marks edges quota done on complete", () => {
    const plan = planSessionSeedEndSettle(
      seed(),
      {
        edgesDone: 5,
        ruinsDone: 0,
        params: DEFAULT_PARAMS,
      },
      "complete",
    );
    expect(plan).toEqual({ kind: "done", titleRu: "Пять граней" });
    expect(
      sessionSeedEndDebrief(plan as { kind: "done"; titleRu: string }, 12),
    ).toEqual({
      status: "done",
      titleRu: "Пять граней",
      rewarded: 12,
    });
    expect(sessionSeedEndDoneFlashRu(12)).toContain("+12");
  });

  it("fails short edges on complete", () => {
    const plan = planSessionSeedEndSettle(
      seed(),
      {
        edgesDone: 2,
        ruinsDone: 0,
        params: DEFAULT_PARAMS,
      },
      "complete",
    );
    expect(plan.kind).toBe("failed");
    if (plan.kind !== "failed") throw new Error("expected failed");
    expect(sessionSeedEndFailedFlashRu(plan.reasonRu)).toContain(
      plan.reasonRu,
    );
    expect(sessionSeedEndDebrief(plan, 0).status).toBe("failed");
  });
});
