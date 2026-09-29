import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../test/localStorageMock";
import { loadContractJournal } from "../contractJournal";
import { setActiveMistress } from "../mistress/activeMistress";
import {
  cancelActiveContractSeries,
  ensureDailyContractBoard,
  loadContractBoard,
  markContractAccepted,
  reportContract,
  rerollDailyContractBoard,
  saveContractBoard,
  startActiveContractSeries,
  type ContractLifecycleNotice,
  setContractLifecycleListener,
} from "./dailyBoard";
import {
  isSeriesContract,
  loadSeriesState,
  saveSeriesState,
  seriesChildInstanceId,
} from "./contractSeries";
import { BUILTIN_SERIES_CATALOG, seriesDayDefIds } from "./seriesCatalog";
import { upsertUserSeriesOverride } from "./userSeriesCatalog";
import { endOfLocalDayMs } from "./contractTime";

installLocalStorageMock();

function atLocal(y: number, m: number, d: number, h = 12): Date {
  return new Date(y, m - 1, d, h, 0, 0, 0);
}

const WEEK_ID = "series_week_skin";

beforeEach(() => {
  resetLocalStorage();
  setActiveMistress("hu_tao");
  setContractLifecycleListener(null);
  localStorage.setItem("joi-contracts-mig-media-drill-1", "1");
});

describe("contract series runtime", () => {
  it("starts a week series and issues one accepted child due end of local day", () => {
    const now = atLocal(2026, 7, 22);
    const started = startActiveContractSeries(WEEK_ID, now);
    expect(started.ok).toBe(true);
    const board = started.ok ? started.board! : ensureDailyContractBoard(now);
    const children = board.contracts.filter(isSeriesContract);
    expect(children).toHaveLength(1);
    const child = children[0]!;
    expect(child.acceptedAtMs).toBeTypeOf("number");
    expect(child.dayKey).toBe("2026-07-22");
    expect(child.deadlineMs).toBe(endOfLocalDayMs("2026-07-22"));
    expect(child.seriesDayIndex).toBe(0);
    expect(child.seriesTotalDays).toBe(7);
    expect(child.defId).toBe(seriesDayDefIds(BUILTIN_SERIES_CATALOG[0]!)[0]);
    expect(board.contracts.filter((c) => !isSeriesContract(c)).length).toBeGreaterThanOrEqual(5);
  });

  it("uses a deterministic child id and is idempotent on remount", () => {
    const now = atLocal(2026, 7, 22);
    const started = startActiveContractSeries(WEEK_ID, now);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const id = seriesChildInstanceId(started.series.instanceId, 0);
    const first = ensureDailyContractBoard(now);
    const second = ensureDailyContractBoard(now);
    expect(first.contracts.filter(isSeriesContract).map((c) => c.instanceId)).toEqual([id]);
    expect(second.contracts.filter(isSeriesContract).map((c) => c.instanceId)).toEqual([id]);
    expect(loadContractJournal()).toHaveLength(0);
  });

  it("records done once and does not double-reward after refresh", () => {
    const now = atLocal(2026, 7, 22);
    startActiveContractSeries(WEEK_ID, now);
    const child = ensureDailyContractBoard(now).contracts.find(isSeriesContract)!;
    const first = reportContract(child.instanceId, "done", { now });
    expect(first?.status).toBe("done");
    expect(first?.rewarded).toBeGreaterThan(0);
    const second = reportContract(child.instanceId, "done", { now });
    expect(second?.status).toBe("done");
    expect(second?.rewarded).toBe(0);
    const series = loadSeriesState().series!;
    expect(series.days.filter((d) => d.dayIndex === 0)).toHaveLength(1);
    expect(series.days[0]?.outcome).toBe("done");
    expect(series.days[0]?.creditedReward).toBe(first?.rewarded);
    expect(series.status).toBe("active");
  });

  it("keeps the series going after a skip and completes on the last day", () => {
    const start = atLocal(2026, 7, 22);
    startActiveContractSeries(WEEK_ID, start);
    const skipped = ensureDailyContractBoard(atLocal(2026, 7, 23));
    expect(loadSeriesState().series?.status).toBe("active");
    expect(loadSeriesState().series?.days).toHaveLength(1);
    expect(loadSeriesState().series?.days[0]?.outcome).toBe("expired");
    expect(skipped.contracts.filter((c) => isSeriesContract(c) && c.status === "open")).toHaveLength(1);
    expect(loadContractJournal().filter((e) => e.outcome === "expired")).toHaveLength(1);
    expect(loadContractJournal()[0]?.reward).toBe(0);
    expect(loadContractJournal()[0]?.performedVia).toBe("auto");

    let now = atLocal(2026, 7, 23);
    for (let day = 1; day < 6; day++) {
      now = atLocal(2026, 7, 22 + day);
      const board = ensureDailyContractBoard(now);
      const open = board.contracts.find((c) => isSeriesContract(c) && c.status === "open");
      expect(open).toBeTruthy();
      reportContract(open!.instanceId, "done", { now });
    }
    const lastDay = atLocal(2026, 7, 28);
    const lastBoard = ensureDailyContractBoard(lastDay);
    const last = lastBoard.contracts.find((c) => isSeriesContract(c) && c.status === "open")!;
    expect(last.seriesDayIndex).toBe(6);
    reportContract(last.instanceId, "done", { now: lastDay });
    const series = loadSeriesState().series!;
    expect(series.status).toBe("completed");
    expect(series.days).toHaveLength(7);
    expect(series.days.filter((d) => d.outcome === "expired")).toHaveLength(1);
    const after = ensureDailyContractBoard(atLocal(2026, 7, 29));
    expect(after.contracts.filter((c) => isSeriesContract(c) && c.status === "open")).toHaveLength(0);
  });

  it("expires several offline days with one journal entry each and no reward", () => {
    const notices: ContractLifecycleNotice[] = [];
    setContractLifecycleListener((n) => notices.push(n));
    startActiveContractSeries(WEEK_ID, atLocal(2026, 7, 22));
    ensureDailyContractBoard(atLocal(2026, 7, 22));
    const later = ensureDailyContractBoard(atLocal(2026, 7, 26, 10));
    const series = loadSeriesState().series!;
    expect(series.days.filter((d) => d.outcome === "expired")).toHaveLength(4);
    expect(series.status).toBe("active");
    const journal = loadContractJournal().filter((e) => e.performedVia === "auto");
    expect(journal).toHaveLength(4);
    expect(journal.every((e) => e.reward === 0)).toBe(true);
    expect(later.contracts.filter((c) => isSeriesContract(c) && c.status === "open")).toHaveLength(1);
    expect(later.contracts.find(isSeriesContract)?.seriesDayIndex).toBe(4);

    const autoExpired = notices.filter((n) => n.outcome === "expired");
    ensureDailyContractBoard(atLocal(2026, 7, 26, 11));
    expect(loadContractJournal().filter((e) => e.performedVia === "auto")).toHaveLength(4);
    expect(
      notices.filter((n) => n.outcome === "expired").length,
    ).toBe(autoExpired.length);
  });

  it("cancels the open child once and does not rewrite history", () => {
    const now = atLocal(2026, 7, 22);
    startActiveContractSeries(WEEK_ID, now);
    const day1 = ensureDailyContractBoard(now).contracts.find(isSeriesContract)!;
    reportContract(day1.instanceId, "done", { now });
    const day2now = atLocal(2026, 7, 23);
    const day2 = ensureDailyContractBoard(day2now).contracts.find(
      (c) => isSeriesContract(c) && c.status === "open",
    )!;
    const board = cancelActiveContractSeries(day2now);
    expect(board.contracts.find((c) => c.instanceId === day2.instanceId)?.status).toBe(
      "failed",
    );
    const series = loadSeriesState().series!;
    expect(series.status).toBe("cancelled");
    expect(series.days[0]?.outcome).toBe("done");
    expect(series.days[1]?.outcome).toBe("failed");
    const journalFailed = loadContractJournal().filter((e) => e.outcome === "failed");
    expect(journalFailed).toHaveLength(1);
    cancelActiveContractSeries(day2now);
    expect(loadContractJournal().filter((e) => e.outcome === "failed")).toHaveLength(1);
    expect(loadSeriesState().series?.days[0]?.outcome).toBe("done");
  });

  it("cancels after today's done step without inventing a failed next day", () => {
    const now = atLocal(2026, 7, 22);
    startActiveContractSeries(WEEK_ID, now);
    const child = ensureDailyContractBoard(now).contracts.find(isSeriesContract)!;
    reportContract(child.instanceId, "done", { now });
    cancelActiveContractSeries(now);
    const series = loadSeriesState().series!;
    expect(series.status).toBe("cancelled");
    expect(series.days).toHaveLength(1);
    expect(series.days[0]?.outcome).toBe("done");
    expect(loadContractJournal().filter((e) => e.outcome === "failed")).toHaveLength(
      0,
    );
  });

  it("cancels after today's done step without inventing a failed next day", () => {
    const now = atLocal(2026, 7, 22);
    startActiveContractSeries(WEEK_ID, now);
    const child = ensureDailyContractBoard(now).contracts.find(isSeriesContract)!;
    reportContract(child.instanceId, "done", { now });
    cancelActiveContractSeries(now);
    const series = loadSeriesState().series!;
    expect(series.status).toBe("cancelled");
    expect(series.days).toHaveLength(1);
    expect(series.days[0]?.outcome).toBe("done");
    expect(loadContractJournal().filter((e) => e.outcome === "failed")).toHaveLength(
      0,
    );
  });

  it("does not carry a series child to the next day, unlike a regular accepted contract", () => {
    const day1 = atLocal(2026, 7, 22);
    startActiveContractSeries(WEEK_ID, day1);
    const board1 = ensureDailyContractBoard(day1);
    const seriesChild = board1.contracts.find(isSeriesContract)!;
    const regular = board1.contracts.find((c) => !isSeriesContract(c))!;
    markContractAccepted(regular.instanceId, day1.getTime());
    const day2 = ensureDailyContractBoard(atLocal(2026, 7, 23));
    expect(day2.contracts.some((c) => c.instanceId === seriesChild.instanceId && c.status === "open")).toBe(
      false,
    );
    expect(day2.contracts.some((c) => c.instanceId === regular.instanceId && c.status === "open")).toBe(
      true,
    );
    const todaySeries = day2.contracts.find((c) => isSeriesContract(c) && c.status === "open");
    expect(todaySeries?.instanceId).not.toBe(seriesChild.instanceId);
    expect(todaySeries?.seriesDayIndex).toBe(1);
  });

  it("keeps the series child on paid reroll and mistress board change", () => {
    const now = atLocal(2026, 7, 22);
    startActiveContractSeries(WEEK_ID, now);
    const before = ensureDailyContractBoard(now);
    const child = before.contracts.find(isSeriesContract)!;
    const rerolled = rerollDailyContractBoard(now);
    expect(rerolled.contracts.filter((c) => !isSeriesContract(c)).length).toBeGreaterThanOrEqual(5);
    expect(rerolled.contracts.some((c) => c.instanceId === child.instanceId)).toBe(true);

    const mismatched = {
      ...loadContractBoard()!,
      mistressId: "furina" as const,
    };
    saveContractBoard(mismatched);
    const afterMistress = ensureDailyContractBoard(now);
    const kept = afterMistress.contracts.find((c) => c.instanceId === child.instanceId);
    expect(kept).toBeTruthy();
    expect(kept?.mistressId).toBe("hu_tao");
    expect(afterMistress.contracts.filter((c) => c.instanceId === child.instanceId)).toHaveLength(1);
  });

  it("refuses a second active series", () => {
    const now = atLocal(2026, 7, 22);
    expect(startActiveContractSeries(WEEK_ID, now).ok).toBe(true);
    const again = startActiveContractSeries("series_month_discipline", now);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/уже идёт/i);
    expect(ensureDailyContractBoard(now).contracts.filter(isSeriesContract)).toHaveLength(1);
  });

  it("keeps snapshot body equal to the issued child and ignores later preset edits", () => {
    const now = atLocal(2026, 7, 22);
    startActiveContractSeries(WEEK_ID, now);
    const child = ensureDailyContractBoard(now).contracts.find(isSeriesContract)!;
    const snap = loadSeriesState().series?.snapshot?.[0];
    expect(snap?.bodyRu).toBe(child.bodyRu);
    expect(child.params.n).toBe(3);
    const remount = ensureDailyContractBoard(now).contracts.find(isSeriesContract)!;
    expect(remount.params).toEqual(child.params);

    const src = BUILTIN_SERIES_CATALOG[0]!;
    upsertUserSeriesOverride({
      ...src,
      nameRu: "Правка после старта",
      clonedFrom: src.id,
      days: src.days.map((d, i) =>
        i === 0
          ? { ...d, contractDefId: "edge_slow", paramOverrides: { n: 5 } }
          : d,
      ),
    });
    const afterEdit = ensureDailyContractBoard(now).contracts.find(isSeriesContract)!;
    expect(afterEdit.defId).toBe(child.defId);
    expect(afterEdit.bodyRu).toBe(child.bodyRu);
    expect(afterEdit.params.n).toBe(3);
  });

  it("rebuilds a snapshot for old runtime state without one", () => {
    const now = atLocal(2026, 7, 22);
    startActiveContractSeries(WEEK_ID, now);
    const series = loadSeriesState().series!;
    saveSeriesState({
      version: 1,
      series: {
        ...series,
        snapshot: undefined,
        theme: undefined,
        nameRu: undefined,
      },
    });
    expect(ensureDailyContractBoard(now).contracts.find(isSeriesContract)).toBeTruthy();
    expect(loadSeriesState().series?.snapshot).toHaveLength(7);
  });

  it("blocks issuing a day whose snapshot child def disappeared", () => {
    const now = atLocal(2026, 7, 22);
    startActiveContractSeries(WEEK_ID, now);
    const board = ensureDailyContractBoard(now);
    saveContractBoard({
      ...board,
      contracts: board.contracts.filter((c) => !isSeriesContract(c)),
    });
    const series = loadSeriesState().series!;
    saveSeriesState({
      version: 1,
      series: {
        ...series,
        snapshot: series.snapshot!.map((d, i) =>
          i === 0 ? { ...d, contractDefId: "missing_now" } : d,
        ),
      },
    });
    const next = ensureDailyContractBoard(now);
    expect(
      next.contracts.filter((c) => isSeriesContract(c) && c.status === "open"),
    ).toHaveLength(0);
    expect(loadSeriesState().series?.blockedReasonRu).toMatch(/недоступен/i);
  });
});
