import { spriteFaceHasInk } from "../content/pixelSprite";
import type {
  EmberEmissiveAnim,
  EmberEmissiveTriggerWhen,
  EmberPixelSprite,
  EmberTilesetTile,
} from "../content/types";
import {
  DEFAULT_EMISSIVE_LIGHT_RANGE,
  DEFAULT_EMISSIVE_STRENGTH,
  MAX_EMISSIVE_LIGHT_RANGE,
  MAX_EMISSIVE_STRENGTH,
  MIN_EMISSIVE_LIGHT_RANGE,
  MIN_EMISSIVE_STRENGTH,
} from "./lightLimits";

export {
  DEFAULT_EMISSIVE_LIGHT_RANGE,
  DEFAULT_EMISSIVE_STRENGTH,
  MAP_LIGHT_RANGE_MAX,
  MAX_EMISSIVE_LIGHT_RANGE,
  MAX_EMISSIVE_STRENGTH,
  MIN_EMISSIVE_LIGHT_RANGE,
  MIN_EMISSIVE_STRENGTH,
} from "./lightLimits";

export type EmissiveAnimState = {
  /** Seconds (performance.now()/1000 or scene time). */
  timeSec: number;
  /** Optional flicker seed stable per asset. */
  seed?: number;
  /**
   * Trigger mode: soft 0..1 arm amount (distance falloff / event).
   * Prefer this over {@link triggered}.
   */
  triggerAmount?: number;
  /** @deprecated use triggerAmount — true → 1, false → 0. */
  triggered?: boolean;
  /** Pulse period override (seconds). */
  periodSec?: number;
  /** Flicker random cycle bounds (seconds). */
  periodMinSec?: number;
  periodMaxSec?: number;
  /**
   * Precomputed per-block flicker brightness from {@link stepEmissiveFlicker}.
   * When set, overrides the legacy noise path.
   */
  flickerMul?: number;
};

/** Idle floor when a trigger glow is fully off. */
export const EMISSIVE_TRIGGER_IDLE = 0.06;
/** How fast intensity eases toward the target (1/sec time constant). */
export const EMISSIVE_SMOOTH_SPEED = 5.5;
/** Ease for flicker envelope tracking. */
export const EMISSIVE_FLICKER_SMOOTH_SPEED = 18;
/** Mostly-off floor while waiting for the next flash. */
export const EMISSIVE_FLICKER_OFF = 0.015;

/** Defaults match the original hard-coded tempos. */
export const DEFAULT_EMISSIVE_PULSE_PERIOD = 1.6;
export const DEFAULT_EMISSIVE_FLICKER_PERIOD = 0.55;
/** Flicker: dark wait between flashes (seconds). */
export const DEFAULT_EMISSIVE_FLICKER_PERIOD_MIN = 20;
export const DEFAULT_EMISSIVE_FLICKER_PERIOD_MAX = 60;
/** Burst duration bounds (seconds) — varies by pattern. */
export const EMISSIVE_FLICKER_LIT_MIN = 0.55;
export const EMISSIVE_FLICKER_LIT_MAX = 1.8;
/**
 * After a wait ends, chance to actually ignite (else another full wait).
 * Keeps the field sparse even with many flicker cells.
 */
export const EMISSIVE_FLICKER_IGNITE_CHANCE = 0.22;
/** Max authored pulse period (seconds). */
export const MAX_EMISSIVE_ANIM_PERIOD = 20;
/** Flicker "от": max dark-wait lower bound (2 min). */
export const MAX_EMISSIVE_FLICKER_WAIT_MIN = 120;
/** Flicker "до": max dark-wait upper bound (3 min). */
export const MAX_EMISSIVE_FLICKER_WAIT_MAX = 180;

/**
 * Burst shape id (rolled per ignition):
 * 0 bloom · 1 stutter · 2 triple · 3 spark · 4 swell · 5 flutter
 */
export type EmissiveFlickerPattern = 0 | 1 | 2 | 3 | 4 | 5;

/** Per-block intermittent flash with varied burst envelopes. */
export type EmissiveFlickerState = {
  phase: "wait" | "burst";
  pattern: EmissiveFlickerPattern;
  t: number;
  phaseLen: number;
  current: number;
  /** Peak brightness scale for this burst (0.55..1). */
  peak: number;
  roll: number;
  /** Extra encore bursts after short dark gaps. */
  chainLeft: number;
  /** Next wait→burst transition is a chained encore. */
  nextIsChain: boolean;
};

const TRIGGER_WHENS: readonly EmberEmissiveTriggerWhen[] = [
  "player",
  "enemy",
  "either",
  "event",
] as const;

export function resolveEmissiveAnim(
  anim: EmberEmissiveAnim | undefined,
): EmberEmissiveAnim {
  return anim ?? "always";
}

export function isEmissiveTriggerAnim(
  anim: EmberEmissiveAnim | undefined,
): boolean {
  return resolveEmissiveAnim(anim) === "trigger";
}

/** Flicker / trigger need a unique material per map cell. */
export function emissiveAnimNeedsPerCellMaterial(
  anim: EmberEmissiveAnim | undefined,
): boolean {
  const mode = resolveEmissiveAnim(anim);
  return mode === "flicker" || mode === "trigger";
}

export function resolveEmissiveTriggerWhen(
  when: EmberEmissiveTriggerWhen | undefined,
): EmberEmissiveTriggerWhen {
  if (when && (TRIGGER_WHENS as readonly string[]).includes(when)) {
    return when;
  }
  return "player";
}

export function normalizeEmissiveTriggerWhen(
  raw: unknown,
): EmberEmissiveTriggerWhen | undefined {
  if (typeof raw !== "string") return undefined;
  return (TRIGGER_WHENS as readonly string[]).includes(raw)
    ? (raw as EmberEmissiveTriggerWhen)
    : undefined;
}

export function resolveEmissiveTriggerRadius(radius: number | undefined): number {
  if (!Number.isFinite(radius)) return 3;
  return Math.max(1, Math.min(12, Math.round(radius as number)));
}

/** Material emissive / bloom stay in 0..1 so high light power doesn’t blow albedo. */
export const MAX_EMISSIVE_GLOW_STRENGTH = 1;

export function resolveEmissiveStrength(strength: number | undefined): number {
  if (!Number.isFinite(strength)) return DEFAULT_EMISSIVE_STRENGTH;
  return Math.max(
    MIN_EMISSIVE_STRENGTH,
    Math.min(MAX_EMISSIVE_STRENGTH, strength as number),
  );
}

/** Soften for MeshToon / canvas glow — independent of light candela. */
export function resolveEmissiveGlowStrength(
  strength: number | undefined,
): number {
  return Math.min(
    MAX_EMISSIVE_GLOW_STRENGTH,
    resolveEmissiveStrength(strength),
  );
}
/** Need at least this many lit pixels (or density below). */
export const EMISSIVE_LIGHT_MIN_PIXELS = 3;
/** Or this fraction of the buffer for sparse large canvases. */
export const EMISSIVE_LIGHT_MIN_DENSITY = 0.012;

export function resolveEmissiveLightRange(range: number | undefined): number {
  if (!Number.isFinite(range)) return DEFAULT_EMISSIVE_LIGHT_RANGE;
  return Math.max(
    MIN_EMISSIVE_LIGHT_RANGE,
    Math.min(MAX_EMISSIVE_LIGHT_RANGE, range as number),
  );
}

export type EmissiveInkSummary = {
  count: number;
  density: number;
  /** Average ink RGB 0..1 */
  r: number;
  g: number;
  b: number;
  /** Centroid in pixel space (for offset), or -1 if empty. */
  cx: number;
  cy: number;
  width: number;
  height: number;
};

/** Average color + density of an emissive buffer (row-major `width × height`). */
export function summarizeEmissiveInk(
  pixels: string[] | null | undefined,
  width: number,
  height: number,
): EmissiveInkSummary {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const empty: EmissiveInkSummary = {
    count: 0,
    density: 0,
    r: 1,
    g: 0.75,
    b: 0.4,
    cx: -1,
    cy: -1,
    width: w,
    height: h,
  };
  if (!pixels?.length || w <= 0 || h <= 0) return empty;
  let count = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sx = 0;
  let sy = 0;
  const n = Math.min(pixels.length, w * h);
  for (let i = 0; i < n; i++) {
    const rgb = parseRgb(pixels[i]);
    if (!rgb) continue;
    count += 1;
    sr += rgb.r;
    sg += rgb.g;
    sb += rgb.b;
    sx += i % w;
    sy += (i / w) | 0;
  }
  if (count <= 0) return empty;
  return {
    count,
    density: count / (w * h),
    r: sr / count / 255,
    g: sg / count / 255,
    b: sb / count / 255,
    cx: sx / count,
    cy: sy / count,
    width: w,
    height: h,
  };
}

/** True when ink is dense enough to justify a weak PointLight. */
export function emissiveInkDenseEnough(sum: EmissiveInkSummary): boolean {
  return (
    sum.count >= EMISSIVE_LIGHT_MIN_PIXELS ||
    sum.density >= EMISSIVE_LIGHT_MIN_DENSITY
  );
}

/** Optional bloom/aura tint; undefined = follow ink color. */
export function normalizeEmissiveBloomColor(
  raw: unknown,
): string | undefined {
  if (typeof raw !== "string") return undefined;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(raw.trim());
  if (!m) return undefined;
  return `#${m[1]!.toLowerCase()}`;
}

export function resolveEmissiveBloomRgb(
  bloomColor: string | undefined,
): { r: number; g: number; b: number } | null {
  const hex = normalizeEmissiveBloomColor(bloomColor);
  if (!hex) return null;
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Clamp authored pulse period; mode picks the default when unset. */
export function resolveEmissiveAnimPeriod(
  period: number | undefined,
  anim: EmberEmissiveAnim | undefined,
): number {
  const mode = resolveEmissiveAnim(anim);
  const fallback =
    mode === "flicker"
      ? DEFAULT_EMISSIVE_FLICKER_PERIOD
      : DEFAULT_EMISSIVE_PULSE_PERIOD;
  if (!Number.isFinite(period)) return fallback;
  return Math.max(0.08, Math.min(MAX_EMISSIVE_ANIM_PERIOD, period as number));
}

export function normalizeEmissiveAnimPeriod(
  raw: unknown,
): number | undefined {
  if (!Number.isFinite(raw as number)) return undefined;
  const v = Math.max(0.08, Math.min(MAX_EMISSIVE_ANIM_PERIOD, Number(raw)));
  return v;
}

/** Flicker dark-wait range (seconds), with legacy single-period fallback. */
export function resolveEmissiveFlickerPeriodRange(
  min: number | undefined,
  max: number | undefined,
  legacyPeriod?: number,
): { min: number; max: number } {
  const legacy = Number.isFinite(legacyPeriod)
    ? Math.max(
        0.08,
        Math.min(MAX_EMISSIVE_FLICKER_WAIT_MAX, legacyPeriod as number),
      )
    : undefined;
  let lo = Number.isFinite(min)
    ? (min as number)
    : legacy != null
      ? Math.max(0.08, legacy * 0.4)
      : DEFAULT_EMISSIVE_FLICKER_PERIOD_MIN;
  let hi = Number.isFinite(max)
    ? (max as number)
    : (legacy ?? DEFAULT_EMISSIVE_FLICKER_PERIOD_MAX);
  lo = Math.max(0.08, Math.min(MAX_EMISSIVE_FLICKER_WAIT_MIN, lo));
  hi = Math.max(0.08, Math.min(MAX_EMISSIVE_FLICKER_WAIT_MAX, hi));
  if (hi < lo) {
    const tmp = lo;
    lo = hi;
    hi = tmp;
  }
  // Keep "до" within its own ceiling after swap.
  lo = Math.min(lo, MAX_EMISSIVE_FLICKER_WAIT_MIN);
  hi = Math.min(hi, MAX_EMISSIVE_FLICKER_WAIT_MAX);
  if (hi < lo) hi = lo;
  return { min: lo, max: hi };
}

export function normalizeEmissiveFlickerWaitMin(
  raw: unknown,
): number | undefined {
  if (!Number.isFinite(raw as number)) return undefined;
  return Math.max(
    0.08,
    Math.min(MAX_EMISSIVE_FLICKER_WAIT_MIN, Number(raw)),
  );
}

export function normalizeEmissiveFlickerWaitMax(
  raw: unknown,
): number | undefined {
  if (!Number.isFinite(raw as number)) return undefined;
  return Math.max(
    0.08,
    Math.min(MAX_EMISSIVE_FLICKER_WAIT_MAX, Number(raw)),
  );
}

/** Compact label for flicker wait sliders (sec / min). */
export function formatFlickerWait(sec: number): string {
  if (!Number.isFinite(sec)) return "0s";
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec - m * 60);
    return s > 0 ? `${m}м ${s}с` : `${m}м`;
  }
  return sec >= 10 ? `${sec.toFixed(0)}с` : `${sec.toFixed(1)}с`;
}

/**
 * Integer avalanche hash → [0, 1).
 * Strong mixing so nearby (tx,ty) seeds don't form activation lines.
 */
export function hashUnit(seed: number, salt = 0): number {
  let n =
    (Math.imul(seed | 0, 374761393) + Math.imul(salt | 0, 668265263)) | 0;
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177) | 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967296;
}

/** Decorrelated seed from tile id + map cell (breaks row/diag waves). */
export function emissiveCellSeed(
  tileId: number,
  tx: number,
  ty: number,
): number {
  let n = (tileId | 0) ^ 0x9e3779b9;
  n = Math.imul(n ^ Math.imul(tx | 0, 1597334677), 3812015801) | 0;
  n = Math.imul(n ^ Math.imul(ty | 0, 3812015801), 1597334677) | 0;
  n = (n ^ (n >>> 16)) | 0;
  return n === 0 ? 0xa341316c : n;
}

/** Decorrelated seed for prop/sprite placements. */
export function emissivePlacementSeed(
  key: string | number,
  x: number,
  y: number,
): number {
  let id = 0;
  if (typeof key === "number") {
    id = key | 0;
  } else {
    for (let i = 0; i < key.length; i++) {
      id = Math.imul(id ^ key.charCodeAt(i), 16777619) | 0;
    }
  }
  return emissiveCellSeed(id ^ 0x85ebca6b, Math.round(x), Math.round(y));
}

function hash01(seed: number, i: number): number {
  return hashUnit(seed, i);
}

function rollFlickerPattern(seed: number, roll: number): EmissiveFlickerPattern {
  const r = hash01(seed, roll + 501);
  // Prefer short sparks; long blooms are rarer.
  if (r < 0.12) return 0; // bloom
  if (r < 0.28) return 1; // stutter
  if (r < 0.42) return 2; // triple
  if (r < 0.72) return 3; // spark
  if (r < 0.86) return 4; // swell
  return 5; // flutter
}

/** Wait length skewed toward the long end of [min, max]. */
function rollFlickerWaitLen(
  periodMin: number,
  periodMax: number,
  seed: number,
  salt: number,
): number {
  const span = Math.max(0, periodMax - periodMin);
  const u = hashUnit(seed, salt);
  // pow < 1 pulls mass toward max → fewer short waits.
  const skewed = Math.pow(u, 0.42);
  return Math.max(0.08, periodMin + span * skewed);
}

function flickerBurstDuration(
  pattern: EmissiveFlickerPattern,
  seed: number,
  roll: number,
): number {
  const u = hash01(seed, roll + 880);
  switch (pattern) {
    case 0: // bloom
      return 0.9 + u * 0.9;
    case 1: // stutter
      return 0.75 + u * 0.7;
    case 2: // triple
      return 1.0 + u * 0.7;
    case 3: // spark
      return 0.35 + u * 0.4;
    case 4: // swell
      return 1.1 + u * 0.7;
    case 5: // flutter
      return 0.8 + u * 0.7;
    default: {
      const _exhaustive: never = pattern;
      return _exhaustive;
    }
  }
}

/**
 * Brightness envelope 0..1 for a burst pattern at progress u (0..1).
 * Shapes are intentionally asymmetric / multi-peak.
 */
function flickerBurstEnvelope(
  pattern: EmissiveFlickerPattern,
  u: number,
  seed: number,
  roll: number,
): number {
  const x = Math.max(0, Math.min(1, u));
  const wobble =
    0.04 * Math.sin(x * 40 + seed * 0.7 + roll) +
    0.03 * Math.sin(x * 17.3 + roll * 1.9);
  switch (pattern) {
    case 0: {
      // Soft bloom: slow rise, shimmering plateau, soft fall.
      const rise = emissiveSmoothstep(Math.min(1, x / 0.22));
      const fall = 1 - emissiveSmoothstep(Math.max(0, (x - 0.62) / 0.38));
      const shimmer =
        0.85 + 0.15 * (0.5 + 0.5 * Math.sin(x * 22 + seed + roll));
      return Math.max(0, rise * fall * shimmer + wobble * 0.5);
    }
    case 1: {
      // Stutter: bright → dip → brighter encore.
      const a = Math.exp(-Math.pow((x - 0.18) / 0.09, 2));
      const b = Math.exp(-Math.pow((x - 0.62) / 0.14, 2));
      return Math.max(0, Math.min(1, a * 0.75 + b * 1.05 + wobble));
    }
    case 2: {
      // Triple ember pops.
      const p1 = Math.exp(-Math.pow((x - 0.18) / 0.07, 2));
      const p2 = Math.exp(-Math.pow((x - 0.45) / 0.07, 2));
      const p3 = Math.exp(-Math.pow((x - 0.78) / 0.1, 2));
      return Math.max(0, Math.min(1, p1 * 0.7 + p2 * 0.95 + p3 * 1.05));
    }
    case 3: {
      // Short hot spark with fast die.
      const peak = Math.exp(-Math.pow((x - 0.28) / 0.12, 2));
      const tail = Math.exp(-Math.pow((x - 0.55) / 0.2, 2)) * 0.25;
      return Math.max(0, Math.min(1, peak + tail));
    }
    case 4: {
      // Slow swell then snuff.
      const rise = Math.pow(emissiveSmoothstep(Math.min(1, x / 0.55)), 1.35);
      const fall = 1 - emissiveSmoothstep(Math.max(0, (x - 0.7) / 0.3));
      const breath = 0.9 + 0.1 * Math.sin(x * 9 + seed);
      return Math.max(0, rise * fall * breath);
    }
    case 5: {
      // Fluttering die-out (candle in draft).
      const body = 1 - emissiveSmoothstep(Math.max(0, (x - 0.15) / 0.85));
      const flap =
        0.55 +
        0.45 *
          (0.5 +
            0.5 *
              Math.sin(x * (28 + hash01(seed, roll) * 18) + seed * 3 + roll));
      const gasp = x > 0.72 && hash01(seed, roll + 3) > 0.45 ? 0.35 : 1;
      return Math.max(0, body * flap * gasp);
    }
    default: {
      const _exhaustive: never = pattern;
      return _exhaustive;
    }
  }
}

function beginFlickerBurst(
  st: EmissiveFlickerState,
  seed: number,
  chained: boolean,
): void {
  st.roll += 1;
  st.phase = "burst";
  st.pattern = rollFlickerPattern(seed, st.roll);
  st.phaseLen = flickerBurstDuration(st.pattern, seed, st.roll);
  st.peak = 0.62 + hash01(seed, st.roll + 44) * 0.38;
  // Rare single encore — keeps the field from clustering.
  if (!chained) {
    st.chainLeft = hash01(seed, st.roll + 910) < 0.08 ? 1 : 0;
  }
}

function beginFlickerWait(
  st: EmissiveFlickerState,
  seed: number,
  periodMin: number,
  periodMax: number,
  shortGap: boolean,
): void {
  st.roll += 1;
  st.phase = "wait";
  if (shortGap) {
    st.phaseLen = 0.18 + hash01(seed, st.roll + 70) * 0.55;
  } else {
    st.phaseLen = rollFlickerWaitLen(
      periodMin,
      periodMax,
      seed,
      st.roll + 110,
    );
  }
}

export function createEmissiveFlickerState(
  seed: number,
  periodMin: number,
  periodMax: number,
): EmissiveFlickerState {
  const waitLen = rollFlickerWaitLen(periodMin, periodMax, seed, 0xc0ffee);
  // Bias toward start of wait so the first minute isn't a ignition storm.
  const phase = Math.pow(hashUnit(seed, 0xbadc0de), 2.2);
  return {
    phase: "wait",
    pattern: 0,
    t: waitLen * phase,
    phaseLen: waitLen,
    current: EMISSIVE_FLICKER_OFF,
    peak: 1,
    roll: (seed ^ 0x5f3759df) | 0,
    chainLeft: 0,
    nextIsChain: false,
  };
}

/** Hermite smoothstep 0..1. */
export function emissiveSmoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** True if a point in tile space is within radius of (tx, ty). */
export function emissiveNearTile(
  tx: number,
  ty: number,
  radius: number,
  points: Array<{ x: number; y: number }> | undefined,
): boolean {
  return emissiveProximityAmount(tx, ty, radius, points) > 0.001;
}

/**
 * Soft proximity 0..1: 1 at the cell center, 0 at / beyond radius.
 * `points` may be fractional tile coords for smoother gradients.
 */
export function emissiveProximityAmount(
  tx: number,
  ty: number,
  radius: number,
  points: Array<{ x: number; y: number }> | undefined,
): number {
  if (!points?.length || radius <= 0) return 0;
  const cx = tx + 0.5;
  const cy = ty + 0.5;
  let best = 0;
  for (const p of points) {
    const dist = Math.hypot(p.x - cx, p.y - cy);
    if (dist >= radius) continue;
    // Ease-out: stays brighter near the actor, fades softly toward the rim.
    const linear = 1 - dist / radius;
    const soft = emissiveSmoothstep(linear);
    best = Math.max(best, soft * soft);
  }
  return best;
}

export function emissiveTriggerActive(
  when: EmberEmissiveTriggerWhen | undefined,
  opts: {
    playerNear: boolean;
    enemyNear: boolean;
    eventActive: boolean;
  },
): boolean {
  return (
    emissiveTriggerAmount(when, {
      playerAmount: opts.playerNear ? 1 : 0,
      enemyAmount: opts.enemyNear ? 1 : 0,
      eventActive: opts.eventActive,
    }) > 0.001
  );
}

/** Soft 0..1 trigger arm for player / enemy / either / event. */
export function emissiveTriggerAmount(
  when: EmberEmissiveTriggerWhen | undefined,
  opts: {
    playerAmount: number;
    enemyAmount: number;
    eventActive: boolean;
  },
): number {
  const mode = resolveEmissiveTriggerWhen(when);
  switch (mode) {
    case "player":
      return Math.max(0, Math.min(1, opts.playerAmount));
    case "enemy":
      return Math.max(0, Math.min(1, opts.enemyAmount));
    case "either":
      return Math.max(
        0,
        Math.min(1, Math.max(opts.playerAmount, opts.enemyAmount)),
      );
    case "event":
      return opts.eventActive ? 1 : 0;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/** Exponential approach for soft ignition / fade. */
export function emissiveSmoothToward(
  current: number,
  target: number,
  dtSec: number,
  speed = EMISSIVE_SMOOTH_SPEED,
): number {
  const dt = Math.max(0, dtSec);
  if (dt <= 0) return target;
  const k = 1 - Math.exp(-speed * dt);
  return current + (target - current) * k;
}

/**
 * Advance a per-block intermittent flash with varied burst patterns.
 * Dark wait in [periodMin, periodMax], then a shaped burst (bloom / stutter / …).
 */
export function stepEmissiveFlicker(
  st: EmissiveFlickerState,
  dtSec: number,
  seed: number,
  periodMin: number,
  periodMax: number,
): number {
  const dt = Math.max(0, dtSec);
  st.t += dt;
  let guard = 0;
  while (st.t >= st.phaseLen && guard++ < 8) {
    st.t -= st.phaseLen;
    if (st.phase === "wait") {
      const chained = st.nextIsChain;
      st.nextIsChain = false;
      if (
        chained ||
        hashUnit(seed, st.roll + 0x71) < EMISSIVE_FLICKER_IGNITE_CHANCE
      ) {
        beginFlickerBurst(st, seed, chained);
      } else {
        // Miss: stay dark for another full wait (sparser field).
        beginFlickerWait(st, seed, periodMin, periodMax, false);
      }
    } else if (st.chainLeft > 0) {
      st.chainLeft -= 1;
      st.nextIsChain = true;
      beginFlickerWait(st, seed, periodMin, periodMax, true);
    } else {
      beginFlickerWait(st, seed, periodMin, periodMax, false);
    }
  }

  let target = EMISSIVE_FLICKER_OFF;
  if (st.phase === "burst") {
    const u = st.phaseLen > 1e-6 ? st.t / st.phaseLen : 1;
    target =
      st.peak * flickerBurstEnvelope(st.pattern, u, seed, st.roll);
  } else if (st.phaseLen > 2.5) {
    // Very rare false-spark during long waits.
    const u = st.phaseLen > 1e-6 ? st.t / st.phaseLen : 0;
    const winkAt = 0.35 + 0.4 * hash01(seed, st.roll + 1200);
    const dist = Math.abs(u - winkAt);
    if (dist < 0.02 && hash01(seed, st.roll + 1201) < 0.06) {
      target = 0.08 + hash01(seed, st.roll + 1202) * 0.12;
    }
  }

  st.current = emissiveSmoothToward(
    st.current,
    Math.max(EMISSIVE_FLICKER_OFF, Math.min(1, target)),
    dt,
    EMISSIVE_FLICKER_SMOOTH_SPEED,
  );
  return st.current;
}

/**
 * Broken-bulb / dying lantern: mostly ON, brief millisecond blackouts.
 * Independent of the sparse “ember flash” flicker (mostly OFF).
 */
export type LanternBulbFlickerState = {
  /** Steady-on timer until next glitch. */
  waitLeft: number;
  /** Remaining blackout / stutter time. */
  cutLeft: number;
  /** Extra dips in this glitch cluster. */
  dipsLeft: number;
  /** Gap between dips inside a cluster. */
  gapLeft: number;
  current: number;
  roll: number;
};

/** Typical gap between glitch clusters (seconds). */
const BULB_WAIT_MIN = 0.9;
const BULB_WAIT_MAX = 4.8;
/** Single dip length (seconds) — “milliseconds” feel with a touch of smear. */
const BULB_CUT_MIN = 0.018;
const BULB_CUT_MAX = 0.09;
/** Tiny lit gap between double/triple blinks. */
const BULB_GAP_MIN = 0.04;
const BULB_GAP_MAX = 0.14;

export function createLanternBulbFlickerState(
  seed: number,
): LanternBulbFlickerState {
  return {
    waitLeft: BULB_WAIT_MIN + hashUnit(seed, 11) * (BULB_WAIT_MAX - BULB_WAIT_MIN),
    cutLeft: 0,
    dipsLeft: 0,
    gapLeft: 0,
    current: 1,
    roll: (seed | 0) + 17,
  };
}

function rollBulbWait(seed: number, roll: number): number {
  return (
    BULB_WAIT_MIN + hashUnit(seed, roll + 31) * (BULB_WAIT_MAX - BULB_WAIT_MIN)
  );
}

function rollBulbCut(seed: number, roll: number): number {
  return (
    BULB_CUT_MIN + hashUnit(seed, roll + 47) * (BULB_CUT_MAX - BULB_CUT_MIN)
  );
}

function beginBulbGlitch(st: LanternBulbFlickerState, seed: number): void {
  st.roll += 1;
  const r = hashUnit(seed, st.roll + 61);
  // Often a single blink; sometimes a stutter cluster.
  st.dipsLeft = r < 0.55 ? 0 : r < 0.85 ? 1 : 2;
  st.cutLeft = rollBulbCut(seed, st.roll);
  st.gapLeft = 0;
}

/**
 * Advance broken-bulb mul (1 = steady on, ~0 during brief cutouts).
 */
export function stepLanternBulbFlicker(
  st: LanternBulbFlickerState,
  dtSec: number,
  seed: number,
): number {
  const dt = Math.max(0, dtSec);
  let target = 1;

  if (st.cutLeft > 0) {
    st.cutLeft -= dt;
    target = 0.02 + hashUnit(seed, st.roll + 90) * 0.06;
    if (st.cutLeft <= 0) {
      if (st.dipsLeft > 0) {
        st.dipsLeft -= 1;
        st.gapLeft =
          BULB_GAP_MIN +
          hashUnit(seed, st.roll + 73) * (BULB_GAP_MAX - BULB_GAP_MIN);
      } else {
        st.waitLeft = rollBulbWait(seed, st.roll);
      }
    }
  } else if (st.gapLeft > 0) {
    st.gapLeft -= dt;
    target = 1;
    if (st.gapLeft <= 0) {
      st.cutLeft = rollBulbCut(seed, st.roll + st.dipsLeft);
    }
  } else {
    st.waitLeft -= dt;
    target = 1;
    if (st.waitLeft <= 0) {
      beginBulbGlitch(st, seed);
      target = 0.02;
    }
  }

  // Fast snap — cutouts should feel sharp, not smoothed away.
  st.current = emissiveSmoothToward(st.current, target, dt, 48);
  return st.current;
}

/**
 * Needs a render-loop tick (warm-up from extinguished + live anim modes).
 */
export function emissiveAnimNeedsTick(
  anim: EmberEmissiveAnim | undefined,
): boolean {
  const mode = resolveEmissiveAnim(anim);
  switch (mode) {
    case "always":
    case "pulse":
    case "flicker":
    case "trigger":
      return true;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/**
 * 0..1 multiplier for emissive intensity this frame.
 */
export function emissiveAnimMul(
  anim: EmberEmissiveAnim | undefined,
  state: EmissiveAnimState,
): number {
  const mode = resolveEmissiveAnim(anim);
  switch (mode) {
    case "always":
      return 1;
    case "pulse": {
      const period = resolveEmissiveAnimPeriod(state.periodSec, "pulse");
      const t = (state.timeSec * (Math.PI * 2)) / period;
      return 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t));
    }
    case "flicker": {
      if (state.flickerMul != null) {
        return Math.max(0, Math.min(1, state.flickerMul));
      }
      // Stateless bake fallback: rare short peaks, mostly off.
      const range = resolveEmissiveFlickerPeriodRange(
        state.periodMinSec,
        state.periodMaxSec,
        state.periodSec,
      );
      const avgWait = Math.max(0.2, (range.min + range.max) * 0.5);
      const lit = (EMISSIVE_FLICKER_LIT_MIN + EMISSIVE_FLICKER_LIT_MAX) * 0.5;
      const cycle = avgWait + lit;
      const s = state.seed ?? 1;
      const phase = ((state.timeSec + s * 17.13) % cycle + cycle) % cycle;
      return phase >= avgWait ? 0.9 : EMISSIVE_FLICKER_OFF;
    }
    case "trigger": {
      const raw =
        state.triggerAmount ??
        (state.triggered === undefined ? 0 : state.triggered ? 1 : 0);
      const amount = emissiveSmoothstep(Math.max(0, Math.min(1, raw)));
      return EMISSIVE_TRIGGER_IDLE + (1 - EMISSIVE_TRIGGER_IDLE) * amount;
    }
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function parseRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** True if buffer has any glowing pixel. */
export function hasEmissiveInk(pixels?: string[] | null): boolean {
  return spriteFaceHasInk(pixels);
}

/**
 * Paint emissive pixels into dest (additive-friendly translucent rects).
 * `alphaMul` already includes strength × anim.
 */
export function paintEmissivePixels(
  ctx: CanvasRenderingContext2D,
  pixels: string[],
  srcW: number,
  srcH: number,
  left: number,
  top: number,
  destW: number,
  destH: number,
  alphaMul: number,
): void {
  if (alphaMul <= 0.001 || srcW <= 0 || srcH <= 0) return;
  if (!hasEmissiveInk(pixels)) return;
  const x0 = Math.round(left);
  const y0 = Math.round(top);
  const rw = Math.max(1, Math.round(destW));
  const rh = Math.max(1, Math.round(destH));
  const cellW = rw / srcW;
  const cellH = rh / srcH;
  let last = "";
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const ink = pixels[y * srcW + x];
      if (!ink || ink === "" || ink === "#00000000") continue;
      const rgb = parseRgb(ink);
      if (!rgb) continue;
      const a = Math.min(1, alphaMul);
      const fill = `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
      if (fill !== last) {
        ctx.fillStyle = fill;
        last = fill;
      }
      const fx = x0 + Math.floor(x * cellW);
      const fy = y0 + Math.floor(y * cellH);
      const fw = Math.max(1, x0 + Math.floor((x + 1) * cellW) - fx);
      const fh = Math.max(1, y0 + Math.floor((y + 1) * cellH) - fy);
      ctx.fillRect(fx, fy, fw, fh);
    }
  }
}

/** Soft bloom contribution from emissive pixels (radials at lit pixels). */
export function stampEmissiveBloomField(
  ctx: CanvasRenderingContext2D,
  pixels: string[],
  srcW: number,
  srcH: number,
  left: number,
  top: number,
  destW: number,
  destH: number,
  alphaMul: number,
  /** Aura tint; when set, radials use this instead of ink RGB. */
  bloomColor?: string,
): void {
  if (alphaMul <= 0.001 || !hasEmissiveInk(pixels)) return;
  const bloomRgb = resolveEmissiveBloomRgb(bloomColor);
  const rw = Math.max(1, destW);
  const rh = Math.max(1, destH);
  const cellW = rw / srcW;
  const cellH = rh / srcH;
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const ink = pixels[y * srcW + x];
      if (!ink || ink === "" || ink === "#00000000") continue;
      const inkRgb = parseRgb(ink);
      if (!inkRgb) continue;
      const rgb = bloomRgb ?? inkRgb;
      const cx = left + (x + 0.5) * cellW;
      const cy = top + (y + 0.5) * cellH;
      const radius = Math.max(cellW, cellH) * 1.6;
      const a0 = Math.min(0.9, alphaMul * 0.85);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${a0})`);
      g.addColorStop(0.45, `rgba(${rgb.r},${rgb.g},${rgb.b},${a0 * 0.4})`);
      g.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.imageSmoothingEnabled = prevSmooth;
}

export function spriteEmissiveAlpha(
  spr: EmberPixelSprite,
  state: EmissiveAnimState,
): number {
  return (
    resolveEmissiveGlowStrength(spr.emissiveStrength) *
    emissiveAnimMul(spr.emissiveAnim, {
      ...state,
      periodSec: state.periodSec ?? spr.emissiveAnimPeriod,
      periodMinSec: state.periodMinSec ?? spr.emissiveAnimPeriodMin,
      periodMaxSec: state.periodMaxSec ?? spr.emissiveAnimPeriodMax,
    })
  );
}

export function tileEmissiveAlpha(
  tile: EmberTilesetTile,
  state: EmissiveAnimState,
): number {
  if (tile.emissiveEnabled === false) return 0;
  return (
    resolveEmissiveGlowStrength(tile.emissiveStrength) *
    emissiveAnimMul(tile.emissiveAnim, {
      ...state,
      periodSec: state.periodSec ?? tile.emissiveAnimPeriod,
      periodMinSec: state.periodMinSec ?? tile.emissiveAnimPeriodMin,
      periodMaxSec: state.periodMaxSec ?? tile.emissiveAnimPeriodMax,
    })
  );
}
