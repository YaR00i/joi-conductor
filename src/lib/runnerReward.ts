/**
 * Reward math + track tuning for the Minigames → Runner (gate runner) game.
 *
 * total = base(difficulty) + crowdBonus + Σ taskRewardBonus − Σ taskFailPenalty
 * A wiped crowd still earns a cut of the crowd bonus (see survived below),
 * clamped to >= 0.
 */

export type RunnerDifficultyId = "warmup" | "run" | "marathon";

export interface RunnerDifficulty {
  id: RunnerDifficultyId;
  labelRu: string;
  /** Track length in world units; gate rows are spaced ~ROW_SPACING apart. */
  trackLen: number;
  /** Base cinders for reaching the boss at all. */
  base: number;
  /** Crowd bonus multiplier (scales with difficulty). */
  crowdMult: number;
  /** Chance a gate row contains a red (−/÷) trap column. */
  badGateChance: number;
  /** Chance an enemy crowd blocks the road after a gate row. */
  enemyChance: number;
  /** Enemy strength as a fraction of a "greedy reference" crowd. */
  enemyFactor: number;
  /** Boss strength as a fraction of the final reference crowd. */
  bossFactor: number;
}

export const RUNNER_DIFFICULTIES: readonly RunnerDifficulty[] = [
  {
    id: "warmup",
    labelRu: "Разминка",
    trackLen: 2400,
    base: 6,
    crowdMult: 1,
    badGateChance: 0.18,
    enemyChance: 0.38,
    enemyFactor: 0.3,
    bossFactor: 0.48,
  },
  {
    id: "run",
    labelRu: "Забег",
    trackLen: 3300,
    base: 12,
    crowdMult: 1.2,
    badGateChance: 0.22,
    enemyChance: 0.45,
    enemyFactor: 0.38,
    bossFactor: 0.54,
  },
  {
    id: "marathon",
    labelRu: "Марафон",
    trackLen: 4300,
    base: 22,
    crowdMult: 1.45,
    badGateChance: 0.24,
    enemyChance: 0.5,
    enemyFactor: 0.38,
    bossFactor: 0.52,
  },
] as const;

export function getRunnerDifficulty(id: RunnerDifficultyId): RunnerDifficulty {
  return RUNNER_DIFFICULTIES.find((d) => d.id === id) ?? RUNNER_DIFFICULTIES[0];
}

/** Hard cap on the crowd so drawing/labels stay sane. */
export const RUNNER_CROWD_CAP = 400;

export interface RunnerRewardInput {
  difficulty: RunnerDifficulty;
  /** Crowd size at the end (0 if wiped mid-track). */
  finalCrowd: number;
  /** Beat the boss and crossed the finish line? */
  survived: boolean;
  taskReward: number; // Σ rewardBonus of succeeded fire-gate tasks
  taskPenalty: number; // Σ failPenalty of failed fire-gate tasks
  /** Mistress rule honored this run (see runnerRules). */
  ruleBonus?: number;
}

export interface RunnerRewardResult {
  base: number;
  crowdBonus: number;
  taskReward: number;
  taskPenalty: number;
  ruleBonus: number;
  total: number;
}

export function calcRunnerReward(input: RunnerRewardInput): RunnerRewardResult {
  const { difficulty, finalCrowd, survived, taskReward, taskPenalty } = input;
  const ruleBonus = Math.max(0, Math.round(input.ruleBonus ?? 0));
  const crowd = Math.max(0, Math.min(RUNNER_CROWD_CAP, finalCrowd));
  // Wiped crowd keeps only ~40% of the crowd bonus: runners that died on the
  // road still count, but nowhere near a full finish.
  const survivalCut = survived ? 1 : 0.4;
  const crowdBonus = Math.round(
    Math.sqrt(crowd) * 2.2 * difficulty.crowdMult * survivalCut,
  );
  const total = Math.max(
    0,
    difficulty.base + crowdBonus + taskReward - taskPenalty + ruleBonus,
  );
  return {
    base: difficulty.base,
    crowdBonus,
    taskReward,
    taskPenalty,
    ruleBonus,
    total,
  };
}

// ---- best-run persistence (per difficulty) ----

export interface RunnerBest {
  crowd: number;
  total: number;
}

const BEST_KEY = "joi-runner-best-v1";

export function loadRunnerBest(): Partial<Record<RunnerDifficultyId, RunnerBest>> {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Partial<Record<RunnerDifficultyId, RunnerBest>> = {};
    for (const d of RUNNER_DIFFICULTIES) {
      const v = (parsed as Record<string, unknown>)[d.id];
      if (
        v && typeof v === "object" &&
        typeof (v as RunnerBest).crowd === "number" &&
        typeof (v as RunnerBest).total === "number"
      ) {
        out[d.id] = v as RunnerBest;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveRunnerBestIfBetter(
  id: RunnerDifficultyId,
  run: RunnerBest,
): Partial<Record<RunnerDifficultyId, RunnerBest>> {
  const all = loadRunnerBest();
  const prev = all[id];
  if (!prev || run.total > prev.total) {
    all[id] = run;
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(all));
    } catch {
      // ignore quota
    }
  }
  return all;
}
