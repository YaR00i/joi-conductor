import { describe, expect, it } from "vitest";
import {
  cumplayMediaDeckKey,
  isMainMediaDeckKey,
  nextMainMediaDeckKey,
  questMediaDeckKey,
  questResumeDeckKey,
  resolveMainResumeIndex,
  shouldTopUpMainMediaDeck,
} from "./mediaDeckOrchestration";

describe("mediaDeckOrchestration", () => {
  it("detects main deck keys", () => {
    expect(isMainMediaDeckKey("main")).toBe(true);
    expect(isMainMediaDeckKey("main:3:2")).toBe(true);
    expect(isMainMediaDeckKey("quest:abc")).toBe(false);
    expect(isMainMediaDeckKey("cumplay:1")).toBe(false);
  });

  it("resolves resume by item id then clamped index", () => {
    const playlist = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(
      resolveMainResumeIndex(playlist, { index: 0, itemId: "b" }),
    ).toBe(1);
    expect(
      resolveMainResumeIndex(playlist, { index: 9, itemId: null }),
    ).toBe(2);
    expect(
      resolveMainResumeIndex([], { index: 3, itemId: "x" }),
    ).toBe(0);
  });

  it("builds deck keys", () => {
    expect(nextMainMediaDeckKey(4, 2)).toBe("main:4:2");
    expect(questMediaDeckKey("ball_taps")).toBe("quest:ball_taps");
    expect(questResumeDeckKey("img1")).toBe("quest:resume:img1");
    expect(cumplayMediaDeckKey(99)).toBe("cumplay:99");
  });

  it("gates main-deck top-up", () => {
    expect(
      shouldTopUpMainMediaDeck({
        deckLength: 3,
        unviewedRemaining: 0,
        unviewedRatio: 0,
      }),
    ).toBe(false);
    expect(
      shouldTopUpMainMediaDeck({
        deckLength: 20,
        unviewedRemaining: 4,
        unviewedRatio: 0.5,
      }),
    ).toBe(true);
    expect(
      shouldTopUpMainMediaDeck({
        deckLength: 20,
        unviewedRemaining: 10,
        unviewedRatio: 0.1,
      }),
    ).toBe(true);
    expect(
      shouldTopUpMainMediaDeck({
        deckLength: 20,
        unviewedRemaining: 10,
        unviewedRatio: 0.5,
        cycled: true,
      }),
    ).toBe(true);
    expect(
      shouldTopUpMainMediaDeck({
        deckLength: 20,
        unviewedRemaining: 10,
        unviewedRatio: 0.5,
      }),
    ).toBe(false);
  });
});
