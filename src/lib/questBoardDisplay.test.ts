import { describe, expect, it } from "vitest";
import {
  formatQuestDurationRu,
  formatQuestRewardRangeRu,
  listQuestBoardRows,
  questExerciseKindRu,
} from "./questBoardDisplay";

describe("questBoardDisplay", () => {
  it("labels exercise kinds", () => {
    expect(questExerciseKindRu("cbt")).toBe("CBT");
    expect(questExerciseKindRu("sync")).toBe("Ритм");
  });

  it("formats rewards and duration", () => {
    expect(formatQuestRewardRangeRu(8, 12)).toBe("+8–12 ◆");
    expect(formatQuestRewardRangeRu(10, 10)).toBe("+10 ◆");
    expect(formatQuestDurationRu(20)).toBe("20 с");
    expect(formatQuestDurationRu(90)).toBe("1 мин 30 с");
  });

  it("lists catalog rows without empty names", () => {
    const rows = listQuestBoardRows();
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows.every((r) => r.nameRu.length > 0 && r.kindRu.length > 0)).toBe(
      true,
    );
  });
});
