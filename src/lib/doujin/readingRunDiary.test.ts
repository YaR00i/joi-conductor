import { describe, expect, it } from "vitest";
import { createReadingRun } from "./readingRun";
import { buildReadingDiaryEntry } from "./readingRunDiary";

describe("buildReadingDiaryEntry", () => {
  it("marks the row as reading, not a stroke session", () => {
    const run = createReadingRun({
      listId: "l",
      listName: "Вечер",
      listTotal: 4,
      origin: "mistress",
      moodScore: 1,
      now: 1_700_000_000_000,
      rng: () => 0,
    });
    const entry = buildReadingDiaryEntry({
      run: {
        ...run,
        edgesDone: 3,
        strokesDone: 40,
        pagesShown: 12,
        pagesContent: 9,
        finaleOutcome: "deny",
        galleries: [
          {
            galleryId: "1",
            title: "A",
            pagesShown: 12,
            pagesContent: 9,
          },
        ],
      },
      ended: "complete",
      now: new Date("2026-08-28T00:00:00.000Z"),
    });
    expect(entry.source).toBe("reading");
    expect(entry.modeNameRu).toBe("Чтение");
    expect(entry.edgesDone).toBe(3);
    expect(entry.finaleOutcome).toBe("deny");
    expect(entry.reading?.pagesContent).toBe(9);
    expect(entry.reading?.origin).toBe("mistress");
  });
});
