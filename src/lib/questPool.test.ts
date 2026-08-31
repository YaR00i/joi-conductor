import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../test/localStorageMock";
import {
  isQuestInPool,
  listEnabledQuestDefs,
  loadDisabledQuestIds,
  QUEST_POOL_STORAGE_KEY,
  setQuestInPool,
} from "./questPool";
import {
  buildForcedQuestOffer,
  buildQuestOffer,
  QUEST_CATALOG,
} from "./quests";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

describe("questPool", () => {
  it("defaults every catalog quest into the pool", () => {
    expect(loadDisabledQuestIds().size).toBe(0);
    expect(listEnabledQuestDefs()).toHaveLength(QUEST_CATALOG.length);
    expect(isQuestInPool("ball_taps")).toBe(true);
  });

  it("round-trips a disabled quest and drops unknown ids", () => {
    setQuestInPool("hands_off", false);
    expect(isQuestInPool("hands_off")).toBe(false);
    expect(listEnabledQuestDefs().some((q) => q.id === "hands_off")).toBe(
      false,
    );

    localStorage.setItem(
      QUEST_POOL_STORAGE_KEY,
      JSON.stringify({ version: 1, disabledIds: ["hands_off", "nope"] }),
    );
    const disabled = loadDisabledQuestIds();
    expect(disabled.has("hands_off")).toBe(true);
    expect(disabled.size).toBe(1);
  });

  it("excludes disabled quests from random offers, not from contract force", () => {
    const rng = () => 0.01;
    const pool = listEnabledQuestDefs(
      QUEST_CATALOG,
      new Set(["ball_taps"]),
    );
    expect(pool.some((q) => q.id === "ball_taps")).toBe(false);

    for (let i = 0; i < 20; i++) {
      const offer = buildQuestOffer(() => Math.random(), {
        mood: "calm",
        pool,
      });
      expect(offer).not.toBeNull();
      expect(offer!.questId).not.toBe("ball_taps");
    }

    const forced = buildForcedQuestOffer(rng, "ball_taps", { mood: "calm" });
    expect(forced.questId).toBe("ball_taps");
  });

  it("returns no random offer when the pool is empty", () => {
    expect(buildQuestOffer(() => 0.5, { mood: "calm", pool: [] })).toBeNull();
  });
});
