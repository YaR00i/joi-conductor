import { describe, expect, it } from "vitest";
import { applyStage, RUNNER_STAGE_MAX, stageOf } from "./runnerProgress";
import { getRunnerDifficulty } from "./runnerReward";
import { applyRunnerRun, emptyAchievements } from "./achievements";

describe("applyStage", () => {
  const base = getRunnerDifficulty("run");

  it("stage 1 returns the base difficulty untouched", () => {
    expect(applyStage(base, 1)).toBe(base);
  });

  it("later stages stretch the track and pay more, gently", () => {
    const s3 = applyStage(base, 3);
    expect(s3.trackLen).toBe(Math.round(base.trackLen * 1.3));
    expect(s3.base).toBe(Math.round(base.base * 1.3));
    expect(s3.crowdMult).toBeCloseTo(base.crowdMult + 0.2, 5);
    expect(s3.enemyFactor).toBeCloseTo(base.enemyFactor + 0.04, 5);
  });

  it("clamps out-of-range stages", () => {
    expect(applyStage(base, 99).trackLen).toBe(applyStage(base, RUNNER_STAGE_MAX).trackLen);
    expect(applyStage(base, 0)).toBe(base);
  });
});

describe("stageOf", () => {
  it("defaults to stage 1 for unknown progress shapes", () => {
    expect(stageOf({ stage: {} }, "marathon")).toBe(1);
    expect(stageOf({ stage: { warmup: 3 } }, "warmup")).toBe(3);
  });
});

describe("applyRunnerRun", () => {
  it("folds a finished run into the mini-game counters", () => {
    let st = emptyAchievements();
    st = applyRunnerRun(st, { survived: true, bossDefeated: true, clean: true, crowd: 42 });
    expect(st.counters.runnerRuns).toBe(1);
    expect(st.counters.runnerWins).toBe(1);
    expect(st.counters.runnerBosses).toBe(1);
    expect(st.counters.runnerCleanRuns).toBe(1);
    expect(st.counters.runnerBestCrowd).toBe(42);

    st = applyRunnerRun(st, { survived: false, bossDefeated: true, clean: false, crowd: 99 });
    expect(st.counters.runnerRuns).toBe(2);
    expect(st.counters.runnerWins).toBe(1); // unchanged
    expect(st.counters.runnerBosses).toBe(2);
    expect(st.counters.runnerCleanRuns).toBe(1); // clean requires survival
    expect(st.counters.runnerBestCrowd).toBe(42); // wiped crowds don't count
  });
});
