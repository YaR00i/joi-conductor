import { describe, expect, it } from "vitest";
import {
  puzzleTaskSpec,
  puzzleTaskTimeoutIsSuccess,
  type PuzzleTask,
} from "./puzzleTasks";

describe("puzzleTaskTimeoutIsSuccess", () => {
  it("treats hold, rest and vibe as success when the timer ends", () => {
    expect(puzzleTaskTimeoutIsSuccess("hold")).toBe(true);
    expect(puzzleTaskTimeoutIsSuccess("rest")).toBe(true);
    expect(puzzleTaskTimeoutIsSuccess("vibe")).toBe(true);
    expect(puzzleTaskTimeoutIsSuccess("ghost_hint")).toBe(true);
  });

  it("treats edge and spank timeouts as a miss", () => {
    expect(puzzleTaskTimeoutIsSuccess("edge")).toBe(false);
    expect(puzzleTaskTimeoutIsSuccess("spank")).toBe(false);
    expect(puzzleTaskTimeoutIsSuccess("per_touch")).toBe(false);
  });
});

describe("puzzleTaskSpec", () => {
  it("describes per-touch as turns, not puzzle pieces", () => {
    const t: PuzzleTask = {
      id: "x",
      titleRu: "x",
      instructionRu: "x",
      kind: "per_touch",
      perTouchPieces: 10,
      perTouchAction: { kind: "spank", count: 5 },
      rewardBonus: 1,
      failPenalty: 1,
    };
    expect(puzzleTaskSpec(t)).toContain("ходов");
    expect(puzzleTaskSpec(t)).not.toContain("кусоч");
  });
});
