import { describe, expect, it, vi } from "vitest";
import {
  createFavoriteSaveQueue,
  favoriteSaveItemDetail,
  favoriteSaveItemPhaseRu,
  favoriteSaveListsRu,
  formatFavoriteSaveItemLabel,
  formatFavoriteSaveToast,
  groupFavoriteSaveItems,
} from "./favoriteSaveQueue";

describe("formatFavoriteSaveToast", () => {
  it("shows a live queue counter while several saves wait", () => {
    expect(
      formatFavoriteSaveToast({
        phase: "live",
        kind: "save",
        batch: 4,
        current: 2,
        savedOk: 1,
        removedOk: 0,
        cachedOk: 0,
        failed: 0,
        error: null,
      }),
    ).toEqual({
      status: "live",
      kicker: "Очередь",
      text: "Сохранение 2 / 4",
    });
  });

  it("says successfully saved after one or many adds", () => {
    expect(
      formatFavoriteSaveToast({
        phase: "done",
        kind: null,
        batch: 1,
        current: 1,
        savedOk: 1,
        removedOk: 0,
        cachedOk: 0,
        failed: 0,
        error: null,
      }),
    ).toEqual({
      status: "done",
      kicker: "Готово",
      text: "Успешно сохранено",
    });
    expect(
      formatFavoriteSaveToast({
        phase: "done",
        kind: null,
        batch: 3,
        current: 3,
        savedOk: 3,
        removedOk: 0,
        cachedOk: 0,
        failed: 0,
        error: null,
      })?.text,
    ).toBe("Успешно сохранено · 3");
  });

  it("names several lists on the live toast", () => {
    expect(
      formatFavoriteSaveToast({
        phase: "live",
        kind: "save",
        batch: 12,
        current: 3,
        savedOk: 2,
        removedOk: 0,
        cachedOk: 0,
        failed: 0,
        error: null,
        groupCount: 2,
      }),
    ).toEqual({
      status: "live",
      kicker: "Очередь",
      text: "2 списка · 3 / 12",
    });
    expect(favoriteSaveListsRu(1)).toBe("1 список");
    expect(favoriteSaveListsRu(5)).toBe("5 списков");
  });

  it("treats cache jobs as downloads, not shelf saves", () => {
    expect(
      formatFavoriteSaveToast({
        phase: "live",
        kind: "cache",
        batch: 8,
        current: 2,
        savedOk: 0,
        removedOk: 0,
        cachedOk: 1,
        failed: 0,
        error: null,
      }),
    ).toEqual({
      status: "live",
      kicker: "Кэш",
      text: "Качаю 2 / 8",
    });
    expect(
      formatFavoriteSaveToast({
        phase: "done",
        kind: "cache",
        batch: 8,
        current: 8,
        savedOk: 0,
        removedOk: 0,
        cachedOk: 8,
        failed: 0,
        error: null,
      })?.text,
    ).toBe("Скачано · 8");
  });
});

describe("formatFavoriteSaveItemLabel", () => {
  it("matches the session-cache card line", () => {
    expect(
      formatFavoriteSaveItemLabel({
        order: 1,
        mediaKind: "image",
        publicId: "8051371",
      }),
    ).toBe("#1 · фото · 8051371");
    expect(
      formatFavoriteSaveItemLabel({
        order: 2,
        mediaKind: "gallery",
        publicId: "177013",
      }),
    ).toBe("#2 · галерея · 177013");
  });
});

describe("favoriteSaveItem copy", () => {
  it("keeps cache-style phase words and save details", () => {
    expect(favoriteSaveItemPhaseRu("loading")).toBe("качаю");
    expect(
      favoriteSaveItemDetail({
        id: "a",
        order: 1,
        kind: "save",
        label: "#1 · фото · 1",
        detail: "1girl",
        phase: "loading",
        errorDetail: null,
        groupId: null,
        groupLabel: null,
      }),
    ).toBe("пишу на полку · 1girl");
    expect(
      favoriteSaveItemDetail({
        id: "b",
        order: 2,
        kind: "cache",
        label: "#2 · фото · 2",
        detail: null,
        phase: "loading",
        errorDetail: null,
        groupId: "l1",
        groupLabel: "Ночное",
      }),
    ).toBe("качаю в кэш");
  });
});

describe("groupFavoriteSaveItems", () => {
  it("keeps list order and labels the shelf when a group is missing", () => {
    const groups = groupFavoriteSaveItems([
      {
        id: "a",
        order: 1,
        kind: "save",
        label: "#1 · фото · 1",
        detail: null,
        phase: "loading",
        errorDetail: null,
        groupId: "l1",
        groupLabel: "Фото · 29.08",
      },
      {
        id: "b",
        order: 2,
        kind: "save",
        label: "#2 · фото · 2",
        detail: null,
        phase: "queued",
        errorDetail: null,
        groupId: "l2",
        groupLabel: "Гифки · 29.08",
      },
      {
        id: "c",
        order: 3,
        kind: "save",
        label: "#3 · фото · 3",
        detail: null,
        phase: "queued",
        errorDetail: null,
        groupId: "l1",
        groupLabel: "Фото · 29.08",
      },
    ]);
    expect(groups.map((row) => [row.id, row.items.map((item) => item.id)])).toEqual([
      ["l1", ["a", "c"]],
      ["l2", ["b"]],
    ]);
  });
});

describe("createFavoriteSaveQueue", () => {
  it("runs jobs one after another and keeps later clicks", async () => {
    const order: string[] = [];
    const started: string[] = [];
    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const q = createFavoriteSaveQueue({ doneHoldMs: 60_000 });

    q.enqueue({
      id: "a",
      kind: "save",
      mediaKind: "image",
      publicId: "11",
      run: async () => {
        started.push("a");
        await gateA;
        order.push("a");
      },
    });
    q.enqueue({
      id: "b",
      kind: "save",
      mediaKind: "video",
      publicId: "22",
      run: async () => {
        started.push("b");
        order.push("b");
      },
    });
    q.enqueue({
      id: "c",
      kind: "save",
      mediaKind: "gif",
      publicId: "33",
      run: async () => {
        started.push("c");
        order.push("c");
      },
    });

    await Promise.resolve();
    expect(started).toEqual(["a"]);
    expect(q.isBusy("b")).toBe(true);
    expect(q.isBusy("c")).toBe(true);
    expect(q.snapshot().toast).toEqual({
      status: "live",
      kicker: "Очередь",
      text: "Сохранение 1 / 3",
    });
    expect(q.snapshot().items.map((row) => [row.label, row.phase])).toEqual([
      ["#1 · фото · 11", "loading"],
      ["#2 · видео · 22", "queued"],
      ["#3 · gif · 33", "queued"],
    ]);

    releaseA();
    await q.flush();
    expect(order).toEqual(["a", "b", "c"]);
    expect(q.snapshot().toast).toEqual({
      status: "done",
      kicker: "Готово",
      text: "Успешно сохранено · 3",
    });
    expect(q.isBusy("a")).toBe(false);
    expect(q.snapshot().items.every((row) => row.phase === "ready")).toBe(true);
    expect(q.snapshot().hold?.durationMs).toBe(60_000);
  });

  it("ignores a second click on the same id while it is queued", async () => {
    const run = vi.fn(async () => undefined);
    const q = createFavoriteSaveQueue({ doneHoldMs: 60_000 });
    expect(q.enqueue({ id: "x", kind: "save", run })).toBe(true);
    expect(q.enqueue({ id: "x", kind: "save", run })).toBe(false);
    await q.flush();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("appends a second list without resetting the live queue", async () => {
    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const q = createFavoriteSaveQueue({ doneHoldMs: 60_000 });
    q.enqueue({
      id: "a",
      kind: "cache",
      group: { id: "l1", label: "Ночное" },
      run: async () => {
        await gateA;
      },
    });
    expect(
      q.enqueueMany([
        {
          id: "b",
          kind: "cache",
          group: { id: "l2", label: "Фото · 29.08" },
          run: async () => undefined,
        },
        {
          id: "c",
          kind: "cache",
          group: { id: "l2", label: "Фото · 29.08" },
          run: async () => undefined,
        },
      ]),
    ).toBe(2);
    expect(q.snapshot().toast).toEqual({
      status: "live",
      kicker: "Кэш",
      text: "2 списка · 1 / 3",
    });
    expect(q.snapshot().items.map((row) => row.groupId)).toEqual([
      "l1",
      "l2",
      "l2",
    ]);
    releaseA();
    await q.flush();
    expect(q.snapshot().toast?.text).toBe("Скачано · 3");
  });

  it("keeps a success toast after the last job", async () => {
    const q = createFavoriteSaveQueue({ doneHoldMs: 60_000 });
    q.enqueue({ id: "one", kind: "save", run: async () => undefined });
    await q.flush();
    expect(q.snapshot().toast?.text).toBe("Успешно сохранено");
  });

  it("clears the done toast after the hold elapses", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const q = createFavoriteSaveQueue({ doneHoldMs: 800 });
      q.enqueue({ id: "one", kind: "save", run: async () => undefined });
      await q.flush();
      expect(q.snapshot().toast?.status).toBe("done");
      await vi.advanceTimersByTimeAsync(800);
      expect(q.snapshot().toast).toBeNull();
      expect(q.snapshot().items).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("restarts hold when a new save arrives during the done toast", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const q = createFavoriteSaveQueue({ doneHoldMs: 800 });
      q.enqueue({ id: "one", kind: "save", run: async () => undefined });
      await q.flush();
      const firstGen = q.snapshot().hold?.generation;
      expect(firstGen).toBeGreaterThan(0);
      await vi.advanceTimersByTimeAsync(400);
      q.enqueue({ id: "two", kind: "save", run: async () => undefined });
      expect(q.snapshot().toast?.status).toBe("live");
      expect(q.snapshot().hold).toBeNull();
      await q.flush();
      expect(q.snapshot().hold?.generation).not.toBe(firstGen);
      await vi.advanceTimersByTimeAsync(800);
      expect(q.snapshot().toast).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("pauses hold without calling host timers as methods", async () => {
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    vi.stubGlobal(
      "setTimeout",
      function (this: unknown, fn: TimerHandler, ms?: number) {
        if (this != null && this !== globalThis) {
          throw new TypeError("Illegal invocation");
        }
        return realSet(fn as () => void, ms);
      },
    );
    vi.stubGlobal("clearTimeout", function (this: unknown, id?: number) {
      if (this != null && this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      realClear(id);
    });
    try {
      const q = createFavoriteSaveQueue({ doneHoldMs: 60_000 });
      q.enqueue({ id: "one", kind: "save", run: async () => undefined });
      await q.flush();
      expect(() => q.setHoldPaused(true)).not.toThrow();
      expect(q.snapshot().toast?.status).toBe("done");
      expect(() => q.setHoldPaused(false)).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not dismiss while the toast is expanded", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const q = createFavoriteSaveQueue({ doneHoldMs: 400 });
      q.enqueue({ id: "one", kind: "save", run: async () => undefined });
      await q.flush();
      q.setHoldPaused(true);
      await vi.advanceTimersByTimeAsync(800);
      expect(q.snapshot().toast?.status).toBe("done");
      q.setHoldPaused(false);
      await vi.advanceTimersByTimeAsync(400);
      expect(q.snapshot().toast).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects jobs after dispose", async () => {
    const run = vi.fn(async () => undefined);
    const q = createFavoriteSaveQueue({ doneHoldMs: 60_000 });
    q.dispose();
    expect(q.enqueue({ id: "x", kind: "save", run })).toBe(false);
    await q.flush();
    expect(run).not.toHaveBeenCalled();
  });
});
