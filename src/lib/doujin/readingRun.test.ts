import { describe, expect, it } from "vitest";
import {
  applyCumplayChoice,
  applyMistressSurvey,
  canAskPermission,
  completeActiveTask,
  createReadingRun,
  noteReadingPage,
  offerListEnd,
  queueProgress,
  readingFinaleOdds,
  readingRunCanResume,
  readingRunElapsedSec,
  readingRunHasProgress,
  reportCum,
  reportEdge,
  reportRuin,
  resolvePermission,
  skipActiveTask,
} from "./readingRun";

function run(over: Partial<ReturnType<typeof createReadingRun>> = {}) {
  return {
    ...createReadingRun({
      listId: "l1",
      listName: "Вечер",
      listTotal: 10,
      origin: "mistress",
      moodScore: 2,
      now: 1_000,
      rng: () => 0,
    }),
    ...over,
  };
}

describe("reading run journal", () => {
  it("counts elapsed only while running", () => {
    const a = run({ elapsedMs: 5_000, runningSince: 1_000, status: "running" });
    expect(readingRunElapsedSec(a, 4_000)).toBe(8);
  });

  it("skips cover pages for content stats and does not spawn there", () => {
    const first = noteReadingPage(run({ nextTaskGap: 0, contentSinceTask: 20 }), {
      galleryId: 7,
      title: "T",
      pageIndex: 0,
      pageCount: 20,
      rng: () => 0,
    });
    expect(first.state.pagesShown).toBe(1);
    expect(first.state.pagesContent).toBe(0);
    expect(first.state.activeTask).toBeNull();
  });

  it("spawns a mistress task after the gap on a content page", () => {
    const { state } = noteReadingPage(
      run({ nextTaskGap: 0, contentSinceTask: 8 }),
      {
        galleryId: 7,
        title: "T",
        pageIndex: 5,
        pageCount: 20,
        rng: () => 0,
      },
    );
    expect(state.activeTask).not.toBeNull();
    expect(state.activeTask?.galleryId).toBe("7");
  });

  it("does not spawn tasks in self-report mode", () => {
    const { state } = noteReadingPage(
      run({ mode: "self", origin: "user", nextTaskGap: 0, contentSinceTask: 8 }),
      {
        galleryId: 7,
        title: "T",
        pageIndex: 5,
        pageCount: 20,
        rng: () => 0,
      },
    );
    expect(state.activeTask).toBeNull();
  });

  it("skip drops mood and raises hardness", () => {
    const seeded = noteReadingPage(
      run({ nextTaskGap: 0, contentSinceTask: 8 }),
      {
        galleryId: 7,
        title: "T",
        pageIndex: 5,
        pageCount: 20,
        rng: () => 0,
      },
    );
    const skipped = skipActiveTask(seeded.state);
    expect(skipped.moodDelta).toBe(-1);
    expect(skipped.state.hardness).toBe(1);
    expect(skipped.state.moodScore).toBeLessThan(seeded.state.moodScore);
  });

  it("complete honors stroke counts", () => {
    const seeded = noteReadingPage(
      run({ nextTaskGap: 0, contentSinceTask: 8 }),
      {
        galleryId: 7,
        title: "T",
        pageIndex: 5,
        pageCount: 20,
        rng: () => 0,
      },
    );
    const task = seeded.state.activeTask;
    expect(task).toBeTruthy();
    const done = completeActiveTask(seeded.state);
    if (task?.kind === "strokes") {
      const span = task.endPage - task.startPage + 1;
      expect(done.state.strokesDone).toBe(task.strokesPerPage * span);
    }
    expect(done.state.activeTask).toBeNull();
  });
});

describe("permission roulette", () => {
  it("is mistress-only", () => {
    expect(canAskPermission(run({ mode: "self", origin: "user" }), 2_000)).toBe(
      false,
    );
    expect(canAskPermission(run(), 2_000)).toBe(true);
  });

  it("early progress lowers pCum", () => {
    const early = readingFinaleOdds(run({ finishedGalleryIds: [] }));
    const late = readingFinaleOdds(
      run({
        finishedGalleryIds: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
      }),
    );
    expect(late.pCum).toBeGreaterThan(early.pCum);
  });

  it("forced deny still leaves the queue open", () => {
    const open = { ...run(), overlay: { kind: "permission" as const } };
    const denied = resolvePermission(open, 2_000, () => 0.99);
    expect(denied.state.finaleOutcome).toBe("deny");
    expect(denied.state.hadOrgasm).toBe(false);
    expect(denied.state.status).toBe("running");
  });

  it("permission cum and ruin increment their own counters", () => {
    const open = { ...run(), overlay: { kind: "permission" as const } };
    const allowed = resolvePermission(open, 2_000, () => 0);
    expect(allowed.state.finaleOutcome).toBe("cum");
    expect(allowed.state.orgasmsDone).toBe(1);
    expect(allowed.state.ruinsDone).toBe(0);
    const odds = readingFinaleOdds({ ...open, moodScore: -2 });
    const ruined = resolvePermission(
      { ...open, moodScore: -2 },
      2_000,
      () => odds.pCum + odds.pRuin / 2,
    );
    expect(ruined.state.finaleOutcome).toBe("ruin");
    expect(ruined.state.ruinsDone).toBe(1);
    expect(ruined.state.orgasmsDone).toBe(0);
  });
});

describe("list end", () => {
  it("mistress without orgasm opens a survey", () => {
    expect(offerListEnd(run()).overlay.kind).toBe("survey");
  });

  it("self-report opens a shelf picker, not a top-up survey", () => {
    expect(offerListEnd(run({ mode: "self", origin: "user" })).overlay.kind).toBe(
      "selfEnd",
    );
  });

  it("survey stop ends the run and does not invent galleries", () => {
    const surveyed = offerListEnd(run());
    const stopped = applyMistressSurvey(surveyed, "stop");
    expect(stopped.state.status).toBe("ended");
    expect(stopped.state.galleries).toHaveLength(0);
  });
});

describe("self-report C", () => {
  it("opens a cumplay report without permission", () => {
    const next = reportCum(run({ mode: "self", origin: "user" }));
    expect(next.state.overlay).toEqual({
      kind: "cumplay",
      reason: "self",
      outcome: "cum",
    });
    const closed = applyCumplayChoice(next.state, "hold");
    expect(closed.cumplayId).toBe("hold");
    expect(closed.overlay.kind).toBe("none");
  });

  it("edge, ruin, and cum are live counters", () => {
    expect(reportEdge(run()).state.edgesDone).toBe(1);
    const ruined = reportRuin(run());
    expect(ruined.state.ruinsDone).toBe(1);
    expect(ruined.state.orgasmsDone).toBe(0);
    const twice = reportCum(reportCum(run({ mode: "self", origin: "user" })).state);
    expect(twice.state.orgasmsDone).toBe(2);
  });
});

describe("queueProgress", () => {
  it("uses finished galleries over list total", () => {
    expect(
      queueProgress(run({ finishedGalleryIds: ["1", "2"], listTotal: 10 })),
    ).toBe(0.2);
  });
});

describe("readingRunCanResume", () => {
  it("is true only for a live run on that list", () => {
    const live = run();
    expect(readingRunCanResume(live, "l1")).toBe(true);
    expect(readingRunCanResume(live, "other")).toBe(false);
    expect(readingRunCanResume({ ...live, status: "ended" }, "l1")).toBe(false);
    expect(readingRunCanResume(null, "l1")).toBe(false);
    expect(readingRunCanResume(live, "l1", "gelbooru")).toBe(false);
  });
});

describe("gelbooru playlist volume", () => {
  it("treats the queue as one gallery and spawns on a middle post", () => {
    const { state } = noteReadingPage(
      run({
        source: "gelbooru",
        nextTaskGap: 0,
        contentSinceTask: 8,
        listTotal: 20,
      }),
      {
        galleryId: "gb-night",
        title: "Ночное",
        pageIndex: 5,
        pageCount: 20,
        rng: () => 0,
      },
    );
    expect(state.activeTask).not.toBeNull();
    expect(state.activeTask?.galleryId).toBe("gb-night");
    expect(queueProgress(state)).toBe(0.3);
  });

  it("grows listTotal when the mistress queue is topped up", () => {
    const first = noteReadingPage(
      run({ source: "gelbooru", listTotal: 10 }),
      {
        galleryId: "gb-night",
        title: "Ночное",
        pageIndex: 9,
        pageCount: 10,
        rng: () => 0,
      },
    );
    const topped = noteReadingPage(first.state, {
      galleryId: "gb-night",
      title: "Ночное",
      pageIndex: 10,
      pageCount: 20,
      rng: () => 0,
    });
    expect(topped.state.listTotal).toBe(20);
    expect(queueProgress(topped.state)).toBe(0.55);
  });
});

describe("readingRunHasProgress", () => {
  it("is false on a fresh run that only opened the first page", () => {
    expect(readingRunHasProgress(run({ pagesShown: 1 }))).toBe(false);
  });

  it("is true after turning a page or doing a report", () => {
    expect(readingRunHasProgress(run({ pagesShown: 2 }))).toBe(true);
    expect(readingRunHasProgress(run({ pagesContent: 1 }))).toBe(true);
    expect(readingRunHasProgress(run({ edgesDone: 1 }))).toBe(true);
    expect(readingRunHasProgress(run({ orgasmsDone: 1 }))).toBe(true);
  });
});
