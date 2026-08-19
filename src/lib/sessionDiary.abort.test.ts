import { describe, expect, it } from "vitest";
import { shouldRecordDiaryEntry } from "./sessionDiary";

describe("shouldRecordDiaryEntry", () => {
  it("records both complete and abort", () => {
    expect(shouldRecordDiaryEntry("complete", 0)).toBe(true);
    expect(shouldRecordDiaryEntry("abort", 0)).toBe(true);
    expect(shouldRecordDiaryEntry("abort", 120)).toBe(true);
  });
});
