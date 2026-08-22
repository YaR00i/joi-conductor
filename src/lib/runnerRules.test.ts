import { describe, expect, it } from "vitest";
import {
  drawRunnerRule,
  ruleHonored,
  ruleStatusLabel,
  type RunnerLive,
  type RunnerRule,
  type RunnerRuleKind,
  type RunnerRuleOutcome,
} from "./runnerRules";

function mkRule(kind: RunnerRuleKind, targetN?: number): RunnerRule {
  return { kind, labelRu: "x", hintRu: "", bonus: 5, ...(targetN != null ? { targetN } : {}) };
}
import { getRunnerDifficulty } from "./runnerReward";

const diff = getRunnerDifficulty("run");

function seq(seen: number, done: number): RunnerLive {
  return { crowd: 10, redHits: 0, fireSeen: seen, fireDone: done, survived: false, dead: false };
}

describe("drawRunnerRule", () => {
  it("crowdN target stays within reach of the typical crowd", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = (() => {
        let s = seed >>> 0;
        return () => {
          s = (s * 1664525 + 1013904223) >>> 0;
          return s / 4294967296;
        };
      })();
      const typCrowd = 20 + Math.floor(rng() * 120);
      const rule = drawRunnerRule({ fireRows: 0, typCrowd }, diff, rng);
      if (rule.kind === "crowdN") {
        expect(rule.targetN).toBeGreaterThanOrEqual(8);
        expect(rule.targetN!).toBeLessThanOrEqual(typCrowd);
      }
    }
  });

  it("allFire is only offered when the track has ≥2 fire rows", () => {
    const one = drawRunnerRule({ fireRows: 1, typCrowd: 40 }, diff, () => 0.99);
    expect(one.kind).not.toBe("allFire");
    const many = drawRunnerRule({ fireRows: 3, typCrowd: 40 }, diff, () => 0.99);
    expect(many.kind).toBe("allFire");
  });

  it("every rule pays a positive bonus", () => {
    for (const r of [0.05, 0.35, 0.65, 0.95]) {
      const rule = drawRunnerRule({ fireRows: 2, typCrowd: 50 }, diff, () => r);
      expect(rule.bonus).toBeGreaterThan(0);
    }
  });
});

describe("ruleStatusLabel", () => {
  it("tracks noRed violation", () => {
    expect(ruleStatusLabel(mkRule("noRed"), { ...seq(0, 0), redHits: 0 }, 0).state).toBe("ok");
    expect(ruleStatusLabel(mkRule("noRed"), { ...seq(0, 0), redHits: 2 }, 0).state).toBe("failed");
  });

  it("crowdN flips to done at the target", () => {
    const rule = mkRule("crowdN", 30);
    expect(ruleStatusLabel(rule, seq(0, 0), 0).state).toBe("ok");
    const at = { ...seq(0, 0), crowd: 30 };
    expect(ruleStatusLabel(rule, at, 0).state).toBe("done");
  });

  it("allFire fails when a fire gate was missed", () => {
    const rule = mkRule("allFire");
    expect(ruleStatusLabel(rule, seq(3, 3), 3).state).toBe("ok");
    expect(ruleStatusLabel(rule, seq(2, 2), 3).state).toBe("ok"); // not all seen YET — still in progress
    expect(ruleStatusLabel(rule, seq(3, 2), 3).state).toBe("failed"); // failed a task
  });
});

describe("ruleHonored", () => {
  const o = (over: Partial<RunnerRuleOutcome> = {}): RunnerRuleOutcome => ({
    survived: true,
    finalCrowd: 40,
    redHits: 0,
    fireSeen: 2,
    fireDone: 2,
    ...over,
  });

  it("noRed requires zero red hits (survival is punished separately)", () => {
    const rule = mkRule("noRed");
    expect(ruleHonored(rule, o(), 0)).toBe(true);
    expect(ruleHonored(rule, o({ redHits: 1 }), 0)).toBe(false);
    // dying to a wave with clean gates still honors the gate rule itself
    expect(ruleHonored(rule, o({ survived: false }), 0)).toBe(true);
  });

  it("crowdN requires surviving with the target crowd", () => {
    const rule = mkRule("crowdN", 35);
    expect(ruleHonored(rule, o({ finalCrowd: 35 }), 0)).toBe(true);
    expect(ruleHonored(rule, o({ finalCrowd: 34 }), 0)).toBe(false);
    expect(ruleHonored(rule, o({ finalCrowd: 100, survived: false }), 0)).toBe(false);
  });

  it("allFire requires every fire gate seen AND completed", () => {
    const rule = mkRule("allFire");
    expect(ruleHonored(rule, o(), 2)).toBe(true);
    expect(ruleHonored(rule, o({ fireSeen: 1 }), 2)).toBe(false);
    expect(ruleHonored(rule, o({ fireDone: 1 }), 2)).toBe(false);
  });

  it("survive requires finishing the run", () => {
    const rule = mkRule("survive");
    expect(ruleHonored(rule, o(), 0)).toBe(true);
    expect(ruleHonored(rule, o({ survived: false }), 0)).toBe(false);
  });
});
