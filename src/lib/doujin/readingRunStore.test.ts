import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../test/localStorageMock";
import { createReadingRun } from "./readingRun";
import {
  loadReadingRun,
  loadReadingRunForSource,
  saveReadingRun,
  saveReadingRunForSource,
} from "./readingRunStore";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

describe("reading run store", () => {
  it("coerces legacy numeric gallery ids and missing source", () => {
    localStorage.setItem(
      "joi-doujin-reading-run-v1",
      JSON.stringify({
        ...createReadingRun({
          listId: "l1",
          listName: "Вечер",
          listTotal: 3,
          origin: "user",
          moodScore: 0,
          now: 1,
          rng: () => 0,
        }),
        source: undefined,
        finishedGalleryIds: [7],
        galleries: [{ galleryId: 7, title: "T", pagesShown: 2, pagesContent: 1 }],
        activeTask: {
          specId: "x",
          nameRu: "n",
          ruleRu: "r",
          kind: "strokes",
          galleryId: 7,
          startPage: 2,
          endPage: 4,
          severity: 1,
          strokesPerPage: 10,
        },
      }),
    );
    const run = loadReadingRun();
    expect(run?.source).toBe("nhentai");
    expect(run?.finishedGalleryIds).toEqual(["7"]);
    expect(run?.galleries[0]?.galleryId).toBe("7");
    expect(run?.activeTask?.galleryId).toBe("7");
  });

  it("coerces a legacy cum into orgasmsDone", () => {
    const base = createReadingRun({
      listId: "l1",
      listName: "Вечер",
      listTotal: 3,
      origin: "user",
      moodScore: 0,
      now: 1,
      rng: () => 0,
    });
    const { orgasmsDone: _drop, ...legacy } = base;
    localStorage.setItem(
      "joi-doujin-reading-run-v1",
      JSON.stringify({ ...legacy, hadOrgasm: true, finaleOutcome: "cum" }),
    );
    expect(loadReadingRun()?.orgasmsDone).toBe(1);
    localStorage.setItem(
      "joi-doujin-reading-run-v1",
      JSON.stringify({ ...legacy, hadOrgasm: true, finaleOutcome: "ruin" }),
    );
    expect(loadReadingRun()?.orgasmsDone).toBe(0);
  });

  it("does not clear a gelbooru run when nhentai saves null", () => {
    const gb = createReadingRun({
      listId: "g1",
      listName: "Ночное",
      listTotal: 10,
      origin: "mistress",
      moodScore: 0,
      source: "gelbooru",
      now: 1,
      rng: () => 0,
    });
    saveReadingRun(gb);
    saveReadingRunForSource(null, "nhentai");
    expect(loadReadingRunForSource("gelbooru")?.listId).toBe("g1");
    expect(loadReadingRunForSource("nhentai")).toBeNull();
  });

  it("does not clear a joidb run when gelbooru saves null", () => {
    const row = createReadingRun({
      listId: "j1",
      listName: "JOI",
      listTotal: 3,
      origin: "user",
      moodScore: 0,
      source: "joidb",
      now: 1,
      rng: () => 0,
    });
    saveReadingRun(row);
    saveReadingRunForSource(null, "gelbooru");
    expect(loadReadingRunForSource("joidb")?.listId).toBe("j1");
  });
});
