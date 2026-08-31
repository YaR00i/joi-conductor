import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../test/localStorageMock";
import { setActiveMistress } from "./mistress/activeMistress";
import {
  ensureDailyContractBoard,
  markContractAccepted,
  saveContractBoard,
} from "./contracts/dailyBoard";
import { listHomeTasksToday, listOpenContractsToday } from "./dailyBrief";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
  setActiveMistress("hu_tao");
});

describe("listHomeTasksToday", () => {
  it("splits accepted rows as active and the rest as fresh", () => {
    const board = ensureDailyContractBoard(new Date(2026, 8, 1, 12));
    const keep = board.contracts[0]!;
    markContractAccepted(keep.instanceId, Date.now());
    const next = ensureDailyContractBoard(new Date(2026, 8, 1, 12));
    const home = listHomeTasksToday(next, Date.now());
    expect(home.active.some((c) => c.instanceId === keep.instanceId)).toBe(
      true,
    );
    expect(home.fresh.some((c) => c.instanceId === keep.instanceId)).toBe(
      false,
    );
    expect(home.active.length + home.fresh.length).toBe(
      listOpenContractsToday(next).length,
    );
  });

  it("hides the sealed seed instance from both lists", () => {
    const board = ensureDailyContractBoard(new Date(2026, 8, 1, 12));
    const keep = board.contracts[0]!;
    markContractAccepted(keep.instanceId, Date.now());
    const next = ensureDailyContractBoard(new Date(2026, 8, 1, 12));
    const home = listHomeTasksToday(next, Date.now(), keep.instanceId);
    expect(home.active.some((c) => c.instanceId === keep.instanceId)).toBe(
      false,
    );
    expect(home.fresh.some((c) => c.instanceId === keep.instanceId)).toBe(
      false,
    );
  });

  it("does not list done contracts as fresh", () => {
    const board = ensureDailyContractBoard(new Date(2026, 8, 1, 12));
    const [first, ...rest] = board.contracts;
    saveContractBoard({
      ...board,
      contracts: [{ ...first!, status: "done" }, ...rest],
    });
    const home = listHomeTasksToday(
      ensureDailyContractBoard(new Date(2026, 8, 1, 12)),
      Date.now(),
    );
    expect(
      home.fresh.some((c) => c.instanceId === first!.instanceId),
    ).toBe(false);
    expect(
      home.active.some((c) => c.instanceId === first!.instanceId),
    ).toBe(false);
  });
});
