/**
 * Naughty farm (Пошлая ферма) field simulation — pure logic, no React.
 *
 * Farm-Frenzy-style loop compressed into one round: plant cheeky crops,
 * water them when they get needy, harvest before they sulk and wilt, and
 * keep the weeds down. Mistress inspections (see FarmGame.tsx) sample this
 * field mid-round: wilted crops + weeds count as "mess".
 *
 * All mutation happens through the exported actions / step function so the
 * React layer stays a thin renderer and the balance test can drive synthetic
 * farmers through the exact same code paths.
 */

import { harvestValueFor } from "../../lib/farmReward";

export interface FarmCrop {
  id: string;
  emoji: string;
  nameRu: string;
  /** Cheeky one-liner shown in the seed tray / tooltips. */
  jokeRu: string;
  /** Watered growth time from seed to ripe. */
  growMs: number;
  /** How long a ripe crop waits to be picked before it wilts. */
  ripeWindowMs: number;
  /** How long a thirsty crop stalls before it wilts. */
  thirstToleranceMs: number;
  /** Cinders at combo ×1. */
  value: number;
}

export const FARM_CROPS: readonly FarmCrop[] = [
  {
    id: "cucumber",
    emoji: "🥒",
    nameRu: "Огурчики",
    jokeRu: "Созревают быстрее, чем ты успеваешь покраснеть.",
    growMs: 30_000,
    ripeWindowMs: 14_000,
    thirstToleranceMs: 9_000,
    value: 1,
  },
  {
    id: "banana",
    emoji: "🍌",
    nameRu: "Бананы",
    jokeRu: "Загнутые и наглые. Любят, когда их держат крепко.",
    growMs: 48_000,
    ripeWindowMs: 16_000,
    thirstToleranceMs: 10_000,
    value: 2,
  },
  {
    id: "eggplant",
    emoji: "🍆",
    nameRu: "Баклажаны",
    jokeRu: "Тёмные, упругие и подозрительно самодовольные.",
    growMs: 72_000,
    ripeWindowMs: 14_000,
    thirstToleranceMs: 10_000,
    value: 3,
  },
  {
    id: "peach",
    emoji: "🍑",
    nameRu: "Персики",
    jokeRu: "Нежные и сочные: млеют от рук, обижаются на ожидание.",
    growMs: 100_000,
    ripeWindowMs: 9_000,
    thirstToleranceMs: 7_000,
    value: 5,
  },
] as const;

export function farmCropById(id: string): FarmCrop {
  return FARM_CROPS.find((c) => c.id === id) ?? FARM_CROPS[0];
}

export type FarmPlot =
  | { kind: "empty" }
  | { kind: "weed" }
  | { kind: "growing"; cropId: string; growthMs: number; thirsty: boolean; thirstMs: number }
  | { kind: "ripe"; cropId: string; ripeMs: number }
  | { kind: "wilted"; cropId: string };

export interface FarmField {
  plots: FarmPlot[];
  /** Consecutive timely harvests; drives the reward multiplier. */
  combo: number;
  /** Σ harvestValueFor over the round. */
  harvestScore: number;
  harvested: number;
  /** Cumulative wilted crops (thirst neglect + overripe). */
  wilts: number;
  watered: number;
  weeded: number;
}

export interface FarmEventRates {
  /** Thirst events per second across the whole field. */
  thirstPerSec: number;
  /** Weed sprouts per second across the whole field. */
  weedPerSec: number;
}

export function createFarmField(plotCount: number): FarmField {
  return {
    plots: Array.from({ length: plotCount }, () => ({ kind: "empty" }) as FarmPlot),
    combo: 0,
    harvestScore: 0,
    harvested: 0,
    wilts: 0,
    watered: 0,
    weeded: 0,
  };
}

/**
 * Advance the whole field by dtMs (call from the game tick; tests drive it
 * directly). Events are Poisson-ish: one Bernoulli trial per tick per event
 * kind, then a uniformly random eligible plot. rng is injectable for tests.
 */
export function stepFarmField(
  f: FarmField,
  dtMs: number,
  rates: FarmEventRates,
  rng: () => number = Math.random,
): void {
  if (dtMs <= 0) return;

  const thirstDue = rng() < (rates.thirstPerSec * dtMs) / 1000;
  if (thirstDue) {
    const eligible = f.plots.filter(
      (p): p is Extract<FarmPlot, { kind: "growing" }> =>
        p.kind === "growing" && !p.thirsty,
    );
    if (eligible.length > 0) {
      eligible[Math.floor(rng() * eligible.length)].thirsty = true;
    }
  }

  const weedDue = rng() < (rates.weedPerSec * dtMs) / 1000;
  if (weedDue) {
    const emptyIdx = f.plots
      .map((p, i) => (p.kind === "empty" ? i : -1))
      .filter((i) => i >= 0);
    if (emptyIdx.length > 0) {
      f.plots[emptyIdx[Math.floor(rng() * emptyIdx.length)]] = { kind: "weed" };
    }
  }

  for (let i = 0; i < f.plots.length; i++) {
    const plot = f.plots[i];
    if (plot.kind === "growing") {
      const crop = farmCropById(plot.cropId);
      if (plot.thirsty) {
        plot.thirstMs += dtMs;
        if (plot.thirstMs >= crop.thirstToleranceMs) wilt(f, i, plot.cropId);
      } else {
        plot.growthMs += dtMs;
        if (plot.growthMs >= crop.growMs) {
          f.plots[i] = { kind: "ripe", cropId: plot.cropId, ripeMs: 0 };
        }
      }
    } else if (plot.kind === "ripe") {
      const crop = farmCropById(plot.cropId);
      plot.ripeMs += dtMs;
      if (plot.ripeMs >= crop.ripeWindowMs) wilt(f, i, plot.cropId);
    }
  }
}

function wilt(f: FarmField, idx: number, cropId: string): void {
  f.plots[idx] = { kind: "wilted", cropId };
  f.wilts += 1;
  f.combo = 0;
}

/** Plant the chosen crop on an empty plot. */
export function plantCrop(f: FarmField, idx: number, cropId: string): boolean {
  if (f.plots[idx].kind !== "empty") return false;
  f.plots[idx] = { kind: "growing", cropId, growthMs: 0, thirsty: false, thirstMs: 0 };
  return true;
}

/** Water a thirsty growing crop (resumes growth, resets the thirst clock). */
export function waterPlot(f: FarmField, idx: number): boolean {
  const plot = f.plots[idx];
  if (plot.kind !== "growing" || !plot.thirsty) return false;
  plot.thirsty = false;
  plot.thirstMs = 0;
  f.watered += 1;
  return true;
}

/** Pick a ripe crop: raises the combo and pays value × combo multiplier. */
export function harvestPlot(f: FarmField, idx: number): number | null {
  const plot = f.plots[idx];
  if (plot.kind !== "ripe") return null;
  f.combo += 1;
  const gained = harvestValueFor(farmCropById(plot.cropId).value, f.combo);
  f.harvestScore += gained;
  f.harvested += 1;
  f.plots[idx] = { kind: "empty" };
  return gained;
}

/** Clear a wilted crop or a weed so the plot can be reused. */
export function clearPlot(f: FarmField, idx: number): boolean {
  const plot = f.plots[idx];
  if (plot.kind === "wilted") {
    f.plots[idx] = { kind: "empty" };
    return true;
  }
  if (plot.kind === "weed") {
    f.plots[idx] = { kind: "empty" };
    f.weeded += 1;
    return true;
  }
  return false;
}

/** Mess the Mistress can spot at an inspection: wilted crops + weeds. */
export function farmDirtCount(f: FarmField): number {
  return f.plots.filter((p) => p.kind === "wilted" || p.kind === "weed").length;
}

/** Weeds still standing (charged at the final horn). */
export function farmWeedsLeft(f: FarmField): number {
  return f.plots.filter((p) => p.kind === "weed").length;
}

/** Growth progress of a growing plot, 0..1 (for the progress bar). */
export function farmPlotProgress(plot: FarmPlot): number {
  if (plot.kind !== "growing") return 0;
  const crop = farmCropById(plot.cropId);
  return Math.max(0, Math.min(1, plot.growthMs / crop.growMs));
}

/** How urgent a ripe crop is, 0..1 (1 = about to sulk and wilt). */
export function farmRipeUrgency(plot: FarmPlot): number {
  if (plot.kind !== "ripe") return 0;
  const crop = farmCropById(plot.cropId);
  return Math.max(0, Math.min(1, plot.ripeMs / crop.ripeWindowMs));
}
