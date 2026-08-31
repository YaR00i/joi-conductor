import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../test/localStorageMock";
import { setCageLock } from "../cageTimer";
import { setDenialQuest } from "../denialQuest";
import { setActiveMistress } from "../mistress/activeMistress";
import {
  assignProgramContract,
  ensureDailyContractBoard,
  isAcceptedOpen,
  loadContractBoard,
  markContractAccepted,
} from "./dailyBoard";
import {
  bindDenialQuestToContract,
  bindWearLockToContract,
  DENIAL_LIVE_DEF_ID,
  syncLiveObligationContracts,
} from "./liveObligation";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
  setActiveMistress("hu_tao");
});

describe("liveObligation", () => {
  it("binds a cage timer to an accepted contract without replacing the board", () => {
    const board = ensureDailyContractBoard(new Date(2026, 8, 1, 12));
    const size = board.contracts.length;
    const lock = setCageLock(6, { kind: "cage" });
    const row = bindWearLockToContract(lock);
    expect(row?.defId).toBe("chastity_locked_hours");
    expect(row && isAcceptedOpen(row)).toBe(true);
    expect(row?.params.hours).toBe(6);
    const next = loadContractBoard();
    expect(next?.contracts.length).toBeGreaterThanOrEqual(size);
    expect(
      next?.contracts.filter((c) => c.status === "open" && !isAcceptedOpen(c))
        .length,
    ).toBeGreaterThan(0);
  });

  it("reuses an open daily wear contract instead of adding a duplicate", () => {
    const board = ensureDailyContractBoard(new Date(2026, 8, 1, 12));
    const existing =
      board.contracts.find(
        (c) => c.status === "open" && c.defId === "chastity_locked_hours",
      ) ??
      assignProgramContract(
        "chastity_locked_hours",
        { hours: 4 },
        "Клетка 4 ч",
      );
    expect(existing).not.toBeNull();
    const lock = setCageLock(10, { kind: "cage" });
    const row = bindWearLockToContract(lock);
    expect(row?.instanceId).toBe(existing?.instanceId);
    expect(row?.params.hours).toBe(10);
    const sameDef = loadContractBoard()?.contracts.filter(
      (c) => c.status === "open" && c.defId === "chastity_locked_hours",
    );
    expect(sameDef).toHaveLength(1);
  });

  it("binds denial with an edge quota", () => {
    ensureDailyContractBoard(new Date(2026, 8, 1, 12));
    const quest = setDenialQuest(8, 3);
    const row = bindDenialQuestToContract(quest);
    expect(row?.defId).toBe(DENIAL_LIVE_DEF_ID);
    expect(row && isAcceptedOpen(row)).toBe(true);
    expect(row?.params.n).toBe(3);
    expect(row?.titleRu).toMatch(/эджи 3/i);
  });

  it("sync is idempotent once the timer already has a contract", () => {
    ensureDailyContractBoard(new Date(2026, 8, 1, 12));
    setCageLock(4, { kind: "plug" });
    expect(syncLiveObligationContracts()).toBe(true);
    expect(syncLiveObligationContracts()).toBe(false);
    const plugs = loadContractBoard()?.contracts.filter(
      (c) => c.status === "open" && c.defId === "anal_plug_hours",
    );
    expect(plugs).toHaveLength(1);
    expect(plugs?.[0] && isAcceptedOpen(plugs[0])).toBe(true);
  });

  it("does not reopen an already accepted wear row", () => {
    const board = ensureDailyContractBoard(new Date(2026, 8, 1, 12));
    const found = board.contracts.find((c) => c.defId === "anal_plug_hours");
    if (found) markContractAccepted(found.instanceId, Date.now());
    const lock = setCageLock(2, { kind: "plug" });
    const row = bindWearLockToContract(lock);
    if (found) expect(row?.instanceId).toBe(found.instanceId);
    expect(row && isAcceptedOpen(row)).toBe(true);
  });
});
