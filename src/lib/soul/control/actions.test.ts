import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../../test/localStorageMock";
import { loadCageLock } from "../../cageTimer";
import { loadDenialQuest } from "../../denialQuest";
import { applyControlActions, splitControlReply, looksLikeControlIntent, filterControlActions } from "./actions";
import { applyProposalToParams } from "./catalog";
import { loadControlState } from "./store";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

describe("mistress control actions", () => {
  it("keeps speech and drops the trailing actions JSON", () => {
    const raw = [
      "Серёжа, клетка на три часа. Не ной.",
      "",
      "```json",
      '{"actions":[{"op":"set_wear","kind":"cage","hours":3}]}',
      "```",
    ].join("\n");
    const split = splitControlReply(raw);
    expect(split.speech).toBe("Серёжа, клетка на три часа. Не ной.");
    expect(split.speech).not.toContain("actions");
    expect(split.actions).toEqual([
      { op: "set_wear", kind: "cage", hours: 3 },
    ]);
  });

  it("leaves a hello without JSON untouched", () => {
    const split = splitControlReply("Привет, глупыш.");
    expect(split.speech).toBe("Привет, глупыш.");
    expect(split.actions).toEqual([]);
  });

  it("writes cage and denial timers from actions", () => {
    const applied = applyControlActions("hu_tao", [
      { op: "set_wear", kind: "cage", hours: 4 },
      { op: "set_denial", hours: 12, edges: 2 },
      { op: "set_checkin", kind: "hours", hours: 2, note: "напиши" },
    ]);
    const lock = loadCageLock();
    const quest = loadDenialQuest();
    expect(lock?.kind).toBe("cage");
    expect(lock?.hours).toBe(4);
    expect(quest?.hours).toBe(12);
    expect(quest?.edgesTarget).toBe(2);
    expect(applied.state.checkIn?.note).toBe("напиши");
    expect(applied.wearChanged).toBe(true);
    expect(applied.denialChanged).toBe(true);
  });

  it("stores a session proposal without leaking into speech", () => {
    const split = splitControlReply(
      'Hump. {"actions":[{"op":"propose_session","kind":"hump","durationSec":600,"edgesTarget":6,"finalePolicy":"ruin_norm","noteRu":"без рук"}]}',
    );
    expect(split.speech).toBe("Hump.");
    const applied = applyControlActions("hu_tao", split.actions);
    expect(applied.proposal?.kind).toBe("hump");
    expect(applied.proposal?.finalePolicy).toBe("ruin_norm");
    expect(loadControlState("hu_tao").pendingProposal?.kind).toBe("hump");
  });

  it("accepts id instead of op and strips leaked JSON", () => {
    const split = splitControlReply(
      'Готов. {"actions":[{"id":"propose_session","kind":"edges","durationSec":1800,"edgeTarget":5,"finalePolicy":"ruin_norm","noteRu":"простое","mode":null}]}',
    );
    expect(split.speech).toBe("Готов.");
    expect(split.speech).not.toContain("actions");
    expect(split.actions).toEqual([
      {
        op: "propose_session",
        kind: "edges",
        durationSec: 1800,
        edgesTarget: 5,
        finalePolicy: "ruin_norm",
        mode: undefined,
        noteRu: "простое",
      },
    ]);
  });

  it("maps ruin_norm onto session params", () => {
    const params = applyProposalToParams(
      {
        durationSec: 600,
        mode: "stroke",
        edgesTarget: 5,
        ruinsTarget: 0,
        pCum: 0.55,
        pRuin: 0.25,
        finishId: "hand",
        cumplayId: "none",
        bpmMin: 60,
        bpmMax: 120,
        blockSecMin: 25,
        blockSecMax: 45,
        allowedFunctionIds: [],
        allowedPatternIds: [],
      },
      "hump",
      720,
      8,
      "ruin_norm",
    );
    expect(params.mode).toBe("prone");
    expect(params.pRuin).toBeGreaterThan(params.pCum);
    expect(params.ruinsTarget).toBeGreaterThan(0);
  });

  it("does not treat a greeting or cage recap as a control turn", () => {
    expect(
      looksLikeControlIntent(
        "Привет, Хутао",
        "Привет, Серёжа. Ты уже носишь клетку на ночь.",
      ),
    ).toBe(false);
    expect(looksLikeControlIntent("надень клетку на 3 часа", "Как скажешь.")).toBe(
      true,
    );
    expect(looksLikeControlIntent("ок", "Клетка на три часа. Не ной.")).toBe(true);
    expect(looksLikeControlIntent("привет", "Сессия будет.")).toBe(true);
  });

  it("drops propose_session and set_checkin from the model", () => {
    const proposal = {
      op: "propose_session" as const,
      kind: "edges" as const,
      durationSec: 600,
      edgesTarget: 5,
      finalePolicy: "ruin_norm" as const,
      noteRu: "",
    };
    expect(
      filterControlActions([proposal], "ок", "Сессия будет."),
    ).toEqual([]);
    expect(
      filterControlActions(
        [{ op: "set_checkin", kind: "hours", hours: 2, note: "x" }],
        "привет",
        "напиши через час",
      ),
    ).toEqual([]);
  });

  it("does not start cage from a session-refuse turn", () => {
    expect(
      filterControlActions(
        [{ op: "set_wear", kind: "cage", hours: 8 }],
        "Отказываюсь от сессии — не от утреннего пака и не от зарядки.",
        "Тогда клетка.",
      ),
    ).toEqual([]);
  });
});
