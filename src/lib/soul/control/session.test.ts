import { describe, expect, it } from "vitest";
import { applyMistressQueuePatch } from "./session";
import type { Block } from "../../types";

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

describe("mistress queue patch", () => {
  it("refuses to patch when the session is not live", () => {
    const q = [block("now"), block("next")];
    expect(applyMistressQueuePatch(q, 0, false, "drop_next").reason).toBe(
      "not_live",
    );
    expect(applyMistressQueuePatch(q, 0, false, "insert_rest").queue).toBeNull();
  });

  it("drops only the first upcoming editable block", () => {
    const q = [block("now"), block("next"), block("later")];
    const result = applyMistressQueuePatch(q, 0, true, "drop_next");
    expect(result.reason).toBe("ok");
    expect(result.queue?.map((b) => b.id)).toEqual(["now", "later"]);
  });

  it("does not drop the current block", () => {
    const q = [block("now"), block("fin", "finale")];
    const result = applyMistressQueuePatch(q, 0, true, "drop_next");
    expect(result.reason).toBe("no_upcoming");
    expect(result.queue).toBeNull();
  });

  it("inserts rest after the current live block", () => {
    const q = [block("now"), block("next")];
    const result = applyMistressQueuePatch(q, 0, true, "insert_rest", 1);
    expect(result.reason).toBe("ok");
    expect(result.queue?.map((b) => b.goal)).toEqual([
      "stroke",
      "rest",
      "stroke",
    ]);
    expect(result.queue?.[0]?.id).toBe("now");
  });
});
