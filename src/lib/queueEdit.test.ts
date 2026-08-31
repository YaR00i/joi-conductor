import { describe, expect, it } from "vitest";
import {
  appendUpcomingBlocks,
  dropUpcomingBlock,
  insertBlockAfter,
  isUpcomingEditable,
  moveUpcomingBlock,
} from "./queueEdit";
import type { Block } from "./types";

function block(id: string, goal: Block["goal"] = "stroke"): Block {
  return {
    id,
    durationSec: 20,
    functionId: "stroke_shaft_only",
    patternId: "meter_straight",
    bpm: 60,
    mode: "stroke",
    modifiers: [],
    goal,
  };
}

describe("queueEdit", () => {
  it("locks current / past / finale / quest ids", () => {
    expect(isUpcomingEditable(block("a"), 0, 0)).toBe(false);
    expect(isUpcomingEditable(block("b"), 1, 0)).toBe(true);
    expect(isUpcomingEditable(block("fin", "finale"), 2, 0)).toBe(false);
    expect(isUpcomingEditable(block("quest-x"), 1, 0)).toBe(false);
  });

  it("drops an upcoming block", () => {
    const q = [block("now"), block("next"), block("later")];
    expect(dropUpcomingBlock(q, 1, 0)?.map((b) => b.id)).toEqual([
      "now",
      "later",
    ]);
    expect(dropUpcomingBlock(q, 0, 0)).toBeNull();
  });

  it("moves upcoming neighbors", () => {
    const q = [block("now"), block("a"), block("b")];
    expect(moveUpcomingBlock(q, 1, 1, 0)?.map((b) => b.id)).toEqual([
      "now",
      "b",
      "a",
    ]);
    expect(moveUpcomingBlock(q, 1, -1, 0)).toBeNull();
  });

  it("inserts after current", () => {
    const rest = block("rest", "rest");
    const q = [block("now"), block("next")];
    expect(insertBlockAfter(q, 0, 0, rest)?.map((b) => b.id)).toEqual([
      "now",
      "rest",
      "next",
    ]);
  });

  it("appends after the last upcoming block, before finale", () => {
    const extra = [block("lab-a"), block("lab-b")];
    const q = [block("now"), block("next"), block("fin", "finale")];
    expect(
      appendUpcomingBlocks(q, 0, extra)?.map((b) => b.id),
    ).toEqual(["now", "next", "lab-a", "lab-b", "fin"]);
    expect(
      appendUpcomingBlocks([block("now")], 0, extra)?.map((b) => b.id),
    ).toEqual(["now", "lab-a", "lab-b"]);
    expect(appendUpcomingBlocks(q, 0, [])).toBeNull();
  });
});
