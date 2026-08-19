import type { Block, SessionMode, SessionMood } from "./types";
import { isHarshMood } from "./moodEngine";

/** Breath-hold challenge variants (shop-gated). */
export type BreathMode =
  | "stroke_timer"
  | "stroke_count"
  | "stroke_beats"
  | "edge_race"
  | "hold_edge"
  | "still";

export const BREATH_FEATURE_ID = "breath_hold";

export const BREATH_MODE_META: Record<
  BreathMode,
  { nameRu: string; hintRu: string }
> = {
  stroke_timer: {
    nameRu: "Дрочка на задержке",
    hintRu: "Дрочи, пока задерживаешь дыхание — до конца таймера.",
  },
  stroke_count: {
    nameRu: "Счёт на задержке",
    hintRu: "Сделай N движений, пока хватает воздуха — потом «Готово».",
  },
  stroke_beats: {
    nameRu: "Биты на задержке",
    hintRu: "Попади в N сильных битов на меняющемся BPM, не дыша.",
  },
  edge_race: {
    nameRu: "Эдж на воздухе",
    hintRu: "Дойди до эджа, пока хватает воздуха — жми «Эдж ✓».",
  },
  hold_edge: {
    nameRu: "Удержание на задержке",
    hintRu: "Держи эдж без дрочки, пока задерживаешь дыхание.",
  },
  still: {
    nameRu: "Тишина / задержка",
    hintRu: "Руки прочь. Только задержка дыхания до конца таймера.",
  },
};

export function breathModeLabelRu(mode: BreathMode): string {
  return BREATH_MODE_META[mode].nameRu;
}

export function pickBreathMode(
  mood: SessionMood,
  rng: () => number = Math.random,
): BreathMode {
  const harsh = isHarshMood(mood) || mood === "bored";
  const pool: { mode: BreathMode; w: number }[] = harsh
    ? [
        { mode: "edge_race", w: 1.4 },
        { mode: "hold_edge", w: 1.3 },
        { mode: "stroke_beats", w: 1.1 },
        { mode: "stroke_timer", w: 0.9 },
        { mode: "stroke_count", w: 0.85 },
        { mode: "still", w: 0.7 },
      ]
    : [
        { mode: "stroke_timer", w: 1.3 },
        { mode: "stroke_count", w: 1.15 },
        { mode: "still", w: 1.1 },
        { mode: "stroke_beats", w: 1 },
        { mode: "hold_edge", w: 0.85 },
        { mode: "edge_race", w: 0.75 },
      ];
  const sum = pool.reduce((a, p) => a + p.w, 0);
  let r = rng() * sum;
  for (const p of pool) {
    r -= p.w;
    if (r <= 0) return p.mode;
  }
  return pool[0]!.mode;
}

export function moodBreathChance(mood: SessionMood): number {
  switch (mood) {
    case "cruel":
    case "chaotic":
      return 0.14;
    case "bored":
    case "horny":
      return 0.1;
    case "calm":
      return 0.07;
    case "sweet":
      return 0.05;
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

export function moodBreathHoldSec(
  mood: SessionMood,
  rng: () => number = Math.random,
): number {
  const harsh = isHarshMood(mood) || mood === "bored";
  if (harsh) return 12 + Math.floor(rng() * 10); // 12–21
  if (mood === "horny") return 10 + Math.floor(rng() * 8);
  return 8 + Math.floor(rng() * 7); // 8–14
}

export function moodBreathTargetCount(
  mode: BreathMode,
  mood: SessionMood,
  rng: () => number = Math.random,
): number {
  const harsh = isHarshMood(mood) || mood === "bored";
  if (mode === "stroke_beats") {
    return harsh ? 6 + Math.floor(rng() * 5) : 4 + Math.floor(rng() * 4);
  }
  // stroke_count
  return harsh ? 18 + Math.floor(rng() * 12) : 12 + Math.floor(rng() * 10);
}

export function moodBreathPrepSec(mood: SessionMood): number {
  return isHarshMood(mood) || mood === "bored" ? 3 : 4;
}

/** Build a breath-hold block for queue splice / conductor. */
export function makeBreathBlock(opts: {
  id: string;
  mode: SessionMode;
  breathMode: BreathMode;
  holdSec: number;
  prepSec?: number;
  targetCount?: number;
  bpm?: number;
  functionId?: string;
  patternId?: string;
}): Block {
  const still = opts.breathMode === "still";
  return {
    id: opts.id,
    durationSec: Math.max(6, opts.holdSec),
    functionId: still
      ? "rest_hands_off"
      : (opts.functionId ?? "stroke_shaft_only"),
    patternId: opts.patternId ?? (still ? "meter_straight" : "special_half"),
    bpm: still ? 40 : (opts.bpm ?? (opts.breathMode === "stroke_beats" ? 55 : 48)),
    mode: opts.mode,
    modifiers: [],
    goal: "breath",
    drive: "beat",
    holdSec: Math.max(6, opts.holdSec),
    breathMode: opts.breathMode,
    breathPrepSec: opts.prepSec ?? 4,
    breathTargetCount: opts.targetCount,
  };
}

/** Tease pause chance per tick (hold / breath / task timers only). */
export function moodTimerTeaseChance(mood: SessionMood): number {
  switch (mood) {
    case "cruel":
      return 0.012;
    case "chaotic":
      return 0.016;
    case "bored":
      return 0.01;
    case "horny":
      return 0.008;
    case "calm":
      return 0.004;
    case "sweet":
      return 0.003;
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

/** Minimum gap between timer teases (ms). */
export const TIMER_TEASE_COOLDOWN_MS = 150_000;

export function moodTimerTeaseExtendSec(
  mood: SessionMood,
  rng: () => number = Math.random,
): number {
  const harsh = isHarshMood(mood) || mood === "bored";
  if (harsh) return 2 + Math.floor(rng() * 4); // 2–5
  return 1 + Math.floor(rng() * 3); // 1–3
}

export function moodTimerTeasePauseSec(
  mood: SessionMood,
  rng: () => number = Math.random,
): number {
  return isHarshMood(mood) ? 2 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 2);
}
