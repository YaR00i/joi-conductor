import { describe, expect, it } from "vitest";
import { buildTrack, makeSeededRng, applyGate, type GateCol } from "./RunnerTrack";
import {
  getRunnerDifficulty,
  RUNNER_DIFFICULTIES,
  type RunnerDifficultyId,
} from "../../lib/runnerReward";
import type { PuzzleTask } from "../../lib/puzzleTasks";

/**
 * Balance simulation for the gate runner: many generated tracks walked by
 * synthetic players of varying quality. Keeps enemy/boss calibration honest —
 * good play should finish, decent play should mostly finish, deliberately bad
 * gate choices should hurt.
 *
 * The simulated crowd mirrors the real game: float crowd (stragglers join at
 * ~0.45/s ≈ +0.8 per row), task fails cost 20%, red −n gates are already
 * mercy-capped at generation time.
 */

const stubTask: PuzzleTask = {
  id: "stub",
  titleRu: "Задание",
  instructionRu: "Сделай это",
  kind: "edge",
  durationSec: 30,
  rewardBonus: 5,
  failPenalty: 3,
};

type Policy = "greedy" | "typical" | "weak" | "worst";

interface SimResult {
  survived: boolean;
  crowd: number;
}

function simulate(id: RunnerDifficultyId, policy: Policy, seed: number): SimResult {
  const diff = getRunnerDifficulty(id);
  const rng = makeSeededRng(seed);
  const track = buildTrack(diff, [stubTask], makeSeededRng(seed ^ 0x9e3779b9));
  let crowd = 1.0;
  const enemies = [...track.enemies].sort((a, b) => a.z - b.z);
  let ei = 0;
  const fightDue = (untilZ: number): SimResult | null => {
    while (ei < enemies.length && enemies[ei].z < untilZ) {
      if (crowd <= enemies[ei].count) return { survived: false, crowd: 0 };
      crowd -= enemies[ei].count;
      ei++;
    }
    return null;
  };
  const pickCol = (cols: GateCol[]): GateCol => {
    const [a, b] = cols;
    const aV = applyGate(crowd, a);
    const bV = applyGate(crowd, b);
    const best = aV >= bV ? a : b;
    const worst = aV >= bV ? b : a;
    if (policy === "greedy") return best;
    if (policy === "worst") return worst;
    const pBest = policy === "typical" ? 0.75 : 0.55;
    return rng() < pBest ? best : worst;
  };
  for (const row of track.rows) {
    const dead = fightDue(row.z);
    if (dead) return dead;
    const col = pickCol(row.cols);
    if (col.kind === "task") {
      const tSucc = policy === "greedy" ? 0.9 : policy === "typical" ? 0.7 : 0.5;
      const success = rng() < tSucc;
      crowd = success ? applyGate(crowd, col) : Math.max(1, crowd * 0.8);
    } else {
      crowd = applyGate(crowd, col);
    }
    if (crowd <= 0) return { survived: false, crowd: 0 };
    crowd += 0.8; // stragglers join between gate rows
  }
  const dead = fightDue(Infinity);
  if (dead) return dead;
  return { survived: true, crowd: Math.round(crowd) };
}

function survivalRate(id: RunnerDifficultyId, policy: Policy, runs = 400): number {
  let survived = 0;
  for (let s = 1; s <= runs; s++) {
    if (simulate(id, policy, s * 7919).survived) survived++;
  }
  return survived / runs;
}

describe("runner balance simulation", () => {
  it("greedy play finishes reliably on every difficulty", () => {
    for (const d of RUNNER_DIFFICULTIES) {
      const rate = survivalRate(d.id, "greedy");
      expect(rate, `${d.id} greedy`).toBeGreaterThanOrEqual(0.98);
    }
  });

  it("typical play passes comfortably: warmup easy, marathon still a challenge", () => {
    expect(survivalRate("warmup", "typical")).toBeGreaterThanOrEqual(0.78);
    expect(survivalRate("run", "typical")).toBeGreaterThanOrEqual(0.68);
    expect(survivalRate("marathon", "typical")).toBeGreaterThanOrEqual(0.6);
    expect(survivalRate("marathon", "typical")).toBeLessThanOrEqual(0.8);
  });

  it("sloppy play struggles — red gates and waves bite, but warmup forgives", () => {
    expect(survivalRate("warmup", "weak")).toBeGreaterThanOrEqual(0.5);
    expect(survivalRate("run", "weak")).toBeLessThanOrEqual(0.45);
  });

  it("worst-choice play almost never survives", () => {
    // Warmup's straggler regen can very occasionally carry a hopeless run,
    // but real difficulties shut it down completely.
    expect(survivalRate("warmup", "worst")).toBeLessThanOrEqual(0.1);
    expect(survivalRate("run", "worst")).toBeLessThanOrEqual(0.02);
    expect(survivalRate("marathon", "worst")).toBeLessThanOrEqual(0.02);
  });

  it("a greedy marathon crowd is big enough to smash the boss", () => {
    let best = 0;
    for (let s = 1; s <= 100; s++) {
      const r = simulate("marathon", "greedy", s * 104729);
      if (r.survived) best = Math.max(best, r.crowd);
    }
    expect(best).toBeGreaterThanOrEqual(30);
  });
});
