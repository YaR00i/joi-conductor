import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../test/localStorageMock";
import { seriesChipText, seriesPanelView } from "./contractSeriesView";
import type { ContractSeriesInstance } from "./contractSeries";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

function sample(
  patch: Partial<ContractSeriesInstance>,
): ContractSeriesInstance {
  return {
    instanceId: "ser_x",
    defId: "series_week_skin",
    mistressId: "hu_tao",
    startedDayKey: "2026-07-22",
    totalDays: 7,
    cursorDayIndex: 2,
    status: "active",
    days: [
      {
        dayIndex: 0,
        dayKey: "2026-07-22",
        childInstanceId: "ser_x:d0",
        defId: "edge_count",
        outcome: "done",
        creditedReward: 8,
      },
      {
        dayIndex: 1,
        dayKey: "2026-07-23",
        childInstanceId: "ser_x:d1",
        defId: "media_porn_timer",
        outcome: "expired",
        creditedReward: 0,
      },
    ],
    ...patch,
  };
}

describe("contractSeriesView", () => {
  it("builds idle / active / completed models", () => {
    const idle = seriesPanelView({ series: null, nowMs: 1 });
    expect(idle.kind).toBe("idle");
    if (idle.kind === "idle") {
      expect(idle.offers.some((o) => o.periodKind === "week")).toBe(true);
      expect(idle.offers.some((o) => o.periodKind === "month")).toBe(true);
      expect(idle.offers.length).toBeGreaterThanOrEqual(2);
      expect(idle.offers.every((o) => o.themeLabelRu.length > 0)).toBe(true);
      expect(
        idle.offers.every((o) =>
          o.previewRu.every((line) => !line.includes("Прими условия")),
        ),
      ).toBe(true);
    }

    const day3 = new Date(2026, 6, 24, 12).getTime();
    const active = seriesPanelView({
      series: sample({}),
      todayTitleRu: "До грани",
      deadlineMs: day3 + 6_000,
      nowMs: day3,
    });
    expect(active.kind).toBe("active");
    if (active.kind === "active") {
      expect(active.dayHuman).toBe(3);
      expect(active.done).toBe(1);
      expect(active.expired).toBe(1);
      expect(active.todayTitleRu).toBe("До грани");
    }

    const day1 = new Date(2026, 6, 22, 18).getTime();
    const rest = seriesPanelView({
      series: sample({
        cursorDayIndex: 1,
        days: [
          {
            dayIndex: 0,
            dayKey: "2026-07-22",
            childInstanceId: "ser_x:d0",
            defId: "edge_count",
            outcome: "done",
            creditedReward: 8,
          },
        ],
      }),
      nowMs: day1,
    });
    expect(rest.kind).toBe("active");
    if (rest.kind === "active") {
      expect(rest.dayHuman).toBe(1);
      expect(rest.done).toBe(1);
      expect(rest.todayBodyRu).toMatch(/завтра/i);
      expect(rest.countdownRu).not.toBe("0 с");
    }

    const settled = seriesPanelView({
      series: sample({ status: "completed", cursorDayIndex: 7 }),
      nowMs: 1,
    });
    expect(settled.kind).toBe("settled");
    if (settled.kind === "settled") {
      expect(settled.done).toBe(1);
      expect(settled.totalDays).toBe(7);
    }
  });

  it("formats a series chip and ignores old instances", () => {
    expect(seriesChipText({ seriesDayIndex: 0, seriesTotalDays: 7 })).toBe(
      "Серия · день 1/7",
    );
    expect(seriesChipText({})).toBeNull();
  });
});
