import { describe, expect, it } from "vitest";
import { calcFarmReward, getFarmDifficulty, type FarmDifficultyId } from "../../lib/farmReward";
import type { PuzzleTask } from "../../lib/puzzleTasks";
import {
  FARM_CROPS,
  clearPlot,
  createFarmField,
  farmDirtCount,
  farmWeedsLeft,
  harvestPlot,
  plantCrop,
  stepFarmField,
  waterPlot,
  type FarmCrop,
  type FarmField,
} from "./farmField";

/**
 * Balance simulation for the naughty farm: full rounds driven by synthetic
 * farmers of varying diligence through the exact production code paths
 * (stepFarmField + actions + inspection dirt snapshots + calcFarmReward).
 *
 * Keeps the punishment/reward calibration honest: an attentive farmer should
 * earn well above a sloppy one, and total neglect must pay nothing.
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

const POLICY_SPEC: Record<
  Policy,
  { minDelayMs: number; maxDelayMs: number; missChance: number; taskWinChance: number }
> = {
  greedy: { minDelayMs: 200, maxDelayMs: 1200, missChance: 0, taskWinChance: 1 },
  typical: { minDelayMs: 2000, maxDelayMs: 6000, missChance: 0.15, taskWinChance: 0.7 },
  weak: { minDelayMs: 6000, maxDelayMs: 14000, missChance: 0.4, taskWinChance: 0.4 },
  worst: { minDelayMs: Number.POSITIVE_INFINITY, maxDelayMs: Number.POSITIVE_INFINITY, missChance: 0, taskWinChance: 0 },
};

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick the crop a policy plants on an empty plot given the time left. */
function pickCrop(policy: Policy, remainingMs: number, rng: () => number): FarmCrop {
  const fits = (c: FarmCrop) => c.growMs + c.ripeWindowMs * 0.4 <= remainingMs;
  const byId = new Map(FARM_CROPS.map((c) => [c.id, c]));
  if (policy === "greedy") {
    // Best value that still has time to ripen and be picked.
    for (const id of ["peach", "eggplant", "banana", "cucumber"]) {
      const c = byId.get(id)!;
      if (fits(c)) return c;
    }
    return byId.get("cucumber")!;
  }
  const roll = rng();
  if (policy === "typical") {
    if (roll < 0.1) return byId.get("peach")!;
    if (roll < 0.3) return byId.get("eggplant")!;
    if (roll < 0.65) return byId.get("banana")!;
    return byId.get("cucumber")!;
  }
  // weak
  if (roll < 0.1) return byId.get("eggplant")!;
  if (roll < 0.4) return byId.get("banana")!;
  return byId.get("cucumber")!;
}

interface SimOutcome {
  total: number;
  harvested: number;
  wilts: number;
}

function simulate(id: FarmDifficultyId, policy: Policy, seed: number): SimOutcome {
  const diff = getFarmDifficulty(id);
  const rng = mulberry32(seed);
  const f: FarmField = createFarmField(diff.cols * diff.rows);
  const roundMs = diff.roundSec * 1000;
  const rates = { thirstPerSec: diff.thirstPerMin / 60, weedPerSec: diff.weedPerMin / 60 };
  const spec = POLICY_SPEC[policy];

  // When each plot's current need will be serviced (round-relative ms).
  const pendingUntil = new Array<number>(f.plots.length).fill(-1);
  const scheduledFor = new Array<string>(f.plots.length).fill("");
  let taskReward = 0;
  let taskPenalty = 0;
  let cleanInspections = 0;
  let punishedInspections = 0;
  let inspectionsDone = 0;

  const needKey = (i: number): string | null => {
    const p = f.plots[i];
    if (p.kind === "empty") return "plant";
    if (p.kind === "weed" || p.kind === "wilted") return "clear";
    if (p.kind === "growing" && p.thirsty) return "water";
    if (p.kind === "ripe") return "harvest";
    return null;
  };

  const service = (i: number, now: number, remaining: number): void => {
    const key = needKey(i);
    if (key == null) return;
    if (scheduledFor[i] !== key) {
      scheduledFor[i] = key;
      pendingUntil[i] =
        now + spec.minDelayMs + rng() * (spec.maxDelayMs - spec.minDelayMs);
    }
    if (now < pendingUntil[i]) return;
    if (rng() < spec.missChance) {
      // Fumbled: retry a full delay later.
      pendingUntil[i] = now + spec.minDelayMs + rng() * (spec.maxDelayMs - spec.minDelayMs);
      return;
    }
    switch (key) {
      case "clear":
        clearPlot(f, i);
        break;
      case "water":
        waterPlot(f, i);
        break;
      case "harvest":
        harvestPlot(f, i);
        break;
      case "plant":
        plantCrop(f, i, pickCrop(policy, remaining, rng).id);
        break;
    }
    scheduledFor[i] = "";
  };

  // The "worst" farmer plants everything once at ~2s, then walks away.
  if (policy === "worst") {
    for (let i = 0; i < f.plots.length; i++) plantCrop(f, i, "cucumber");
  }

  const TICK = 150;
  for (let now = TICK; now <= roundMs; now += TICK) {
    stepFarmField(f, TICK, rates, rng);
    const remaining = roundMs - now;

    if (inspectionsDone < diff.inspections.length && now >= diff.inspections[inspectionsDone] * roundMs) {
      inspectionsDone += 1;
      if (farmDirtCount(f) === 0) {
        cleanInspections += 1;
      } else {
        punishedInspections += 1;
        if (rng() < spec.taskWinChance) taskReward += stubTask.rewardBonus;
        else taskPenalty += stubTask.failPenalty;
      }
    }

    if (policy !== "worst") {
      for (let i = 0; i < f.plots.length; i++) service(i, now, remaining);
    }
  }

  const r = calcFarmReward({
    difficulty: diff,
    harvestScore: f.harvestScore,
    cleanInspections,
    totalInspections: cleanInspections + punishedInspections,
    wilts: f.wilts,
    weedsLeft: farmWeedsLeft(f),
    taskReward,
    taskPenalty,
  });
  return { total: r.total, harvested: f.harvested, wilts: f.wilts };
}

const SEEDS = [1, 2, 3, 7, 11];

function avg(id: FarmDifficultyId, policy: Policy): number {
  return SEEDS.reduce((s, seed) => s + simulate(id, policy, seed).total, 0) / SEEDS.length;
}

describe("farm balance (medium round)", () => {
  const id: FarmDifficultyId = "medium";

  it("pays attentive play clearly above sloppy play", () => {
    const greedy = avg(id, "greedy");
    const typical = avg(id, "typical");
    const weak = avg(id, "weak");
    expect(greedy).toBeGreaterThan(typical);
    expect(typical).toBeGreaterThan(weak);
    expect(weak).toBeGreaterThan(0);
  });

  it("keeps a good farmer in a healthy payout band", () => {
    const greedy = avg(id, "greedy");
    expect(greedy).toBeGreaterThanOrEqual(60);
    expect(greedy).toBeLessThanOrEqual(180);
  });

  it("keeps a typical farmer modest and a weak farmer scrap-by", () => {
    const typical = avg(id, "typical");
    const weak = avg(id, "weak");
    expect(typical).toBeGreaterThanOrEqual(20);
    expect(typical).toBeLessThanOrEqual(90);
    expect(weak).toBeLessThanOrEqual(50);
  });

  it("pays nothing for total neglect, on every seed", () => {
    for (const seed of SEEDS) {
      const out = simulate(id, "worst", seed);
      expect(out.total).toBe(0);
      expect(out.wilts).toBeGreaterThan(0);
    }
  });

  it("greedy actually harvests a lot and rarely wilts", () => {
    const outs = SEEDS.map((seed) => simulate(id, "greedy", seed));
    const harvested = outs.reduce((s, o) => s + o.harvested, 0) / outs.length;
    const wilts = outs.reduce((s, o) => s + o.wilts, 0) / outs.length;
    expect(harvested).toBeGreaterThanOrEqual(6);
    expect(wilts).toBeLessThanOrEqual(6);
  });
});

describe("farm balance (all difficulties, sanity)", () => {
  const ids: FarmDifficultyId[] = ["easy", "medium", "hard", "expert"];

  it("produces finite non-negative totals for every policy", () => {
    for (const id of ids) {
      for (const policy of ["greedy", "typical", "weak", "worst"] as Policy[]) {
        for (const seed of SEEDS) {
          const out = simulate(id, policy, seed);
          expect(Number.isFinite(out.total)).toBe(true);
          expect(out.total).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("rewards scale with difficulty for attentive play", () => {
    const easy = avg("easy", "greedy");
    const expert = avg("expert", "greedy");
    expect(expert).toBeGreaterThan(easy);
  });
});
