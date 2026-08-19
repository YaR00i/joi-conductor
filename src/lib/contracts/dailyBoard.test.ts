import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../test/localStorageMock";
import { setActiveMistress } from "../mistress/activeMistress";
import type { MistressId } from "../mistress/types";
import {
  contractsTodayKey,
  endOfLocalDayMs,
  ensureDailyContractBoard,
  loadContractBoard,
  rerollDailyContractBoard,
  rollDailyBoard,
  saveContractBoard,
  type ContractInstance,
  type DailyContractBoard,
} from "./dailyBoard";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
  setActiveMistress("hu_tao");
});

function atLocal(y: number, m: number, d: number, h = 12): Date {
  return new Date(y, m - 1, d, h, 0, 0, 0);
}

describe("contractsTodayKey / endOfLocalDayMs", () => {
  it("formats local calendar day as YYYY-MM-DD", () => {
    expect(contractsTodayKey(atLocal(2026, 7, 22))).toBe("2026-07-22");
    expect(contractsTodayKey(atLocal(2026, 1, 5))).toBe("2026-01-05");
  });

  it("endOfLocalDayMs is after noon and still same calendar day", () => {
    const key = "2026-07-22";
    const end = endOfLocalDayMs(key);
    const noon = atLocal(2026, 7, 22, 12).getTime();
    expect(end).toBeGreaterThan(noon);
    expect(contractsTodayKey(new Date(end))).toBe(key);
  });
});

describe("rollDailyBoard", () => {
  it("rolls a fixed-size board for day+mistress seed", () => {
    const a = rollDailyBoard("2026-07-22", "hu_tao");
    const b = rollDailyBoard("2026-07-22", "hu_tao");
    expect(a.dayKey).toBe("2026-07-22");
    expect(a.mistressId).toBe("hu_tao");
    expect(a.contracts).toHaveLength(5);
    expect(a.contracts.map((c) => c.defId)).toEqual(
      b.contracts.map((c) => c.defId),
    );
    expect(a.contracts.every((c) => c.status === "open")).toBe(true);
    expect(a.contracts.every((c) => c.deadlineMs === endOfLocalDayMs(a.dayKey))).toBe(
      true,
    );
  });

  it("changes composition when day or mistress changes", () => {
    const dayA = rollDailyBoard("2026-07-22", "hu_tao");
    const dayB = rollDailyBoard("2026-07-23", "hu_tao");
    const otherMistress = rollDailyBoard("2026-07-22", "furina");
    expect(dayA.contracts.map((c) => c.defId)).not.toEqual(
      dayB.contracts.map((c) => c.defId),
    );
    expect(dayA.contracts.map((c) => c.defId)).not.toEqual(
      otherMistress.contracts.map((c) => c.defId),
    );
  });

  it("prefers distinct categories when catalog allows", () => {
    const board = rollDailyBoard("2026-07-22", "hu_tao");
    const cats = new Set(board.contracts.map((c) => c.category));
    expect(cats.size).toBeGreaterThanOrEqual(3);
  });

  it("changes composition when reroll salt changes", () => {
    const base = rollDailyBoard("2026-07-22", "hu_tao", 0);
    const paid = rollDailyBoard("2026-07-22", "hu_tao", 1);
    expect(paid.rerollSalt).toBe(1);
    expect(paid.contracts.map((c) => c.defId)).not.toEqual(
      base.contracts.map((c) => c.defId),
    );
  });
});

describe("rerollDailyContractBoard", () => {
  it("persists a new salt and board for the same day", () => {
    const now = atLocal(2026, 7, 22);
    const first = ensureDailyContractBoard(now);
    const second = rerollDailyContractBoard(now);
    expect(second.dayKey).toBe(first.dayKey);
    expect(second.rerollSalt).toBe(1);
    expect(loadContractBoard()?.rerollSalt).toBe(1);
    expect(second.contracts.map((c) => c.instanceId)).not.toEqual(
      first.contracts.map((c) => c.instanceId),
    );
  });
});

describe("ensureDailyContractBoard day rollover", () => {
  it("creates and persists a board for today", () => {
    const now = atLocal(2026, 7, 22);
    const board = ensureDailyContractBoard(now);
    expect(board.dayKey).toBe("2026-07-22");
    expect(loadContractBoard()?.dayKey).toBe("2026-07-22");
  });

  it("keeps the same board within the same day", () => {
    const morning = atLocal(2026, 7, 22, 9);
    const evening = atLocal(2026, 7, 22, 21);
    const first = ensureDailyContractBoard(morning);
    const second = ensureDailyContractBoard(evening);
    expect(second.contracts.map((c) => c.instanceId)).toEqual(
      first.contracts.map((c) => c.instanceId),
    );
  });

  it("re-rolls when the calendar day changes", () => {
    const day1 = ensureDailyContractBoard(atLocal(2026, 7, 22));
    const day2 = ensureDailyContractBoard(atLocal(2026, 7, 23));
    expect(day2.dayKey).toBe("2026-07-23");
    expect(day2.contracts.map((c) => c.instanceId)).not.toEqual(
      day1.contracts.map((c) => c.instanceId),
    );
    expect(loadContractBoard()?.dayKey).toBe("2026-07-23");
  });

  it("re-rolls after calendar day changes past previous deadline", () => {
    const dayKey = "2026-07-21";
    const stale: DailyContractBoard = {
      dayKey,
      mistressId: "hu_tao",
      contracts: [
        {
          instanceId: `${dayKey}-x-1`,
          defId: "session_long_edges",
          dayKey,
          mistressId: "hu_tao",
          category: "session_mod",
          titleRu: "t",
          bodyRu: "b",
          reward: 10,
          deadlineMs: endOfLocalDayMs(dayKey),
          status: "open",
          params: {},
          difficulty: 1,
        } satisfies ContractInstance,
      ],
    };
    saveContractBoard(stale);
    const afterDeadline = new Date(endOfLocalDayMs(dayKey) + 1_000);
    const rolled = ensureDailyContractBoard(afterDeadline);
    expect(rolled.dayKey).toBe(contractsTodayKey(afterDeadline));
    expect(rolled.dayKey).not.toBe(dayKey);
  });

  it("marks open contracts expired when deadline already passed same dayKey", () => {
    const now = atLocal(2026, 7, 22, 18);
    const dayKey = contractsTodayKey(now);
    // Skip one-shot media-drill injection so the seeded row stays addressable.
    localStorage.setItem("joi-contracts-mig-media-drill-1", "1");
    const board: DailyContractBoard = {
      dayKey,
      mistressId: "hu_tao",
      contracts: [
        {
          instanceId: `${dayKey}-expired-1`,
          defId: "session_long_edges",
          dayKey,
          mistressId: "hu_tao",
          category: "session_mod",
          titleRu: "t",
          bodyRu: "b",
          reward: 10,
          deadlineMs: now.getTime() - 5_000,
          status: "open",
          params: {},
          difficulty: 1,
        } satisfies ContractInstance,
        {
          instanceId: `${dayKey}-drill-1`,
          defId: "media_cache_triggers",
          dayKey,
          mistressId: "hu_tao",
          category: "media",
          titleRu: "drill",
          bodyRu: "b",
          reward: 12,
          deadlineMs: endOfLocalDayMs(dayKey),
          status: "open",
          params: { limit: 20 },
          difficulty: 2,
        } satisfies ContractInstance,
      ],
    };
    saveContractBoard(board);
    const next = ensureDailyContractBoard(now);
    expect(next.dayKey).toBe(dayKey);
    const seeded = next.contracts.find((c) => c.instanceId === `${dayKey}-expired-1`);
    expect(seeded?.status).toBe("expired");
  });

  it("re-rolls when mistress changes on the same day", () => {
    const now = atLocal(2026, 7, 22);
    const a = ensureDailyContractBoard(now);
    expect(a.mistressId).toBe("hu_tao");

    // Bypass unlock gate by writing storage + active pack for furina board check.
    // setActiveMistress may refuse locked packs — seed board mistress mismatch instead.
    const mismatched: DailyContractBoard = {
      ...a,
      mistressId: "furina" as MistressId,
    };
    saveContractBoard(mismatched);
    setActiveMistress("hu_tao");
    const next = ensureDailyContractBoard(now);
    expect(next.mistressId).toBe("hu_tao");
    expect(next.contracts.map((c) => c.instanceId)).not.toEqual(
      mismatched.contracts.map((c) => c.instanceId),
    );
  });
});
