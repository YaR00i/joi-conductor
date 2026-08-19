import { describe, expect, it } from "vitest";
import { emptyAchievements } from "./achievements";
import {
  abortAchievementDeltas,
  computeSessionEndProgress,
} from "./sessionEndProgress";
import { emptyWallet } from "./wallet";
import { DEFAULT_PARAMS, type SessionState } from "./types";

function minimalState(over: Partial<SessionState> = {}): SessionState {
  return {
    status: "idle",
    params: DEFAULT_PARAMS,
    queue: [],
    index: 0,
    elapsedSec: 120,
    edgesDone: 3,
    ruinsDone: 1,
    mood: "soft",
    moodScore: 0,
    ...over,
  } as SessionState;
}

describe("computeSessionEndProgress", () => {
  it("records abort diary + thin abort counters, claws quest cinders", () => {
    const before = emptyAchievements();
    const result = computeSessionEndProgress({
      reason: "abort",
      state: minimalState(),
      events: [],
      cindersEarned: 5,
      mistressId: "hu_tao",
      achievements: before,
      wallet: emptyWallet(),
      sessionQuestCinders: 7,
    });
    expect(result.recordDiary).toBe(true);
    expect(result.chaseDiarySouvenir).toBe(false);
    expect(result.syncAchievements).toBe(true);
    expect(result.showDebrief).toBe(false);
    expect(result.showAbortDebrief).toBe(true);
    expect(result.clawQuestCinders).toBe(7);
    expect(result.creditCinders).toBe(0);
    expect(result.levelUps).toEqual([]);
    expect(result.achievementCinders).toBe(0);
    expect(result.achievements.counters.sessionsAborted).toBe(
      before.counters.sessionsAborted + 1,
    );
    expect(result.achievements.counters.sessionsCompleted).toBe(
      before.counters.sessionsCompleted,
    );
    expect(result.achievements.counters.edges).toBe(before.counters.edges);
  });

  it("skips all progress on silent remount abort", () => {
    const before = emptyAchievements();
    const result = computeSessionEndProgress({
      reason: "abort",
      state: minimalState(),
      events: [],
      cindersEarned: 0,
      mistressId: "hu_tao",
      achievements: before,
      wallet: emptyWallet(),
      sessionQuestCinders: 7,
      silent: true,
    });
    expect(result.recordDiary).toBe(false);
    expect(result.syncAchievements).toBe(false);
    expect(result.showAbortDebrief).toBe(false);
    expect(result.clawQuestCinders).toBe(0);
    expect(result.achievements).toBe(before);
  });

  it("exports thin abort deltas without completed markers", () => {
    expect(abortAchievementDeltas()).toEqual({
      sessionsStarted: 1,
      sessionsAborted: 1,
    });
  });
});
