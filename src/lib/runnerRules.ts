/**
 * "Забег по её правилу" — one mistress rule per run, drawn BEFORE the run
 * from the actual generated track, so every rule is verifiably feasible:
 *
 *  - noRed    every row always has a non-red column (track generator guarantee)
 *  - crowdN   target is 70% of the "typical player" crowd on THIS track
 *             (the same reference that sizes enemies/boss), requires survival
 *  - allFire  offered only when the track has ≥2 fire rows; tasks are
 *             self-confirmed (Готово ✓), so completing is always possible
 *  - survive  beatable per difficulty by typical play (see runnerBalance.test)
 */

import type { RunnerDifficulty } from "./runnerReward";

export type RunnerRuleKind = "noRed" | "crowdN" | "allFire" | "survive";

export interface RunnerRule {
  kind: RunnerRuleKind;
  /** Short card label (intro + HUD chip). */
  labelRu: string;
  /** One-line explanation of what counts. */
  hintRu: string;
  /** crowdN: crowd size to reach (survived). */
  targetN?: number;
  /** Cinders paid on top of the run when the rule is honored. */
  bonus: number;
}

/** Stats buildTrack returns; structural to avoid a pages→lib import cycle. */
export interface RunnerRuleTrackStats {
  fireRows: number;
  typCrowd: number;
}

export interface RunnerLive {
  crowd: number;
  redHits: number;
  fireSeen: number;
  fireDone: number;
  survived: boolean;
  dead: boolean;
}

export function drawRunnerRule(
  track: RunnerRuleTrackStats,
  diff: RunnerDifficulty,
  rng: () => number = Math.random,
): RunnerRule {
  const pool: RunnerRule[] = [
    {
      kind: "noRed",
      labelRu: "Ни одного красного ворот",
      hintRu: "Обходит стороной каждый −N и ÷2. Задания не в счёт.",
      bonus: Math.round(diff.base * 0.8),
    },
    {
      kind: "crowdN",
      labelRu: "Доведи толпу до цели",
      hintRu: "Финишировать с толпой не меньше цели. Цель — по силам этой трассы.",
      bonus: diff.base,
    },
    {
      kind: "survive",
      labelRu: "Победи босса",
      hintRu: "Дойти до конца и смешать босса с асфальтом.",
      bonus: Math.round(diff.base * 0.9),
    },
  ];
  if (track.fireRows >= 2) {
    pool.push({
      kind: "allFire",
      labelRu: "Пройди все огненные врата",
      hintRu: "Забирай каждый 🔥 и выполняй задания. Пропустил или провалил — правило нарушено.",
      bonus: Math.round(diff.base * 1.2),
    });
  }
  const rule = pool[Math.floor(rng() * pool.length)]!;
  if (rule.kind === "crowdN") {
    // Typical play lands near typCrowd — 70% of it demands good gates but
    // stays comfortably reachable (see the balance simulation).
    const targetN = Math.max(8, Math.round(track.typCrowd * 0.7));
    return {
      ...rule,
      targetN,
      labelRu: `Доведи толпу до ${targetN}`,
    };
  }
  return rule;
}

/** HUD chip label with live progress. */
export function ruleStatusLabel(
  rule: RunnerRule,
  live: RunnerLive,
  fireRows: number,
): { text: string; state: "ok" | "done" | "failed" } {
  switch (rule.kind) {
    case "noRed":
      return live.redHits > 0
        ? { text: `красные: ${live.redHits} ✗`, state: "failed" }
        : { text: "красные: 0 ✓", state: "ok" };
    case "crowdN": {
      const n = rule.targetN ?? 8;
      return live.crowd >= n
        ? { text: `толпа ${live.crowd}/${n} ✓`, state: "done" }
        : { text: `толпа ${live.crowd}/${n}`, state: "ok" };
    }
    case "allFire":
      return {
        text: `огонь ${live.fireDone}/${fireRows}`,
        state: live.fireSeen > live.fireDone ? "failed" : "ok",
      };
    case "survive":
      if (live.dead) return { text: "добеги… ✗", state: "failed" };
      if (live.survived) return { text: "босс побит ✓", state: "done" };
      return { text: "добеги до босса", state: "ok" };
  }
}

export interface RunnerRuleOutcome {
  survived: boolean;
  finalCrowd: number;
  redHits: number;
  fireSeen: number;
  fireDone: number;
}

/** Verdict at the result screen. */
export function ruleHonored(
  rule: RunnerRule,
  o: RunnerRuleOutcome,
  fireRows: number,
): boolean {
  switch (rule.kind) {
    case "noRed":
      return o.redHits === 0;
    case "crowdN":
      return o.survived && o.finalCrowd >= (rule.targetN ?? 8);
    case "allFire":
      return o.fireSeen === fireRows && o.fireDone === o.fireSeen;
    case "survive":
      return o.survived;
  }
}
