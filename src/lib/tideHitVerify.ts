/**
 * CBT / plapping hit verification: honor (metronome accents) vs mic loudness.
 */

export const TIDE_HIT_VERIFY_STORAGE_KEY = "joi-tide-hit-verify-v1";

export const TIDE_HIT_VERIFY_MODES = ["honor", "mic"] as const;

export type TideHitVerifyMode = (typeof TIDE_HIT_VERIFY_MODES)[number];

export type TideHitVerifySettings = {
  mode: TideHitVerifyMode;
  /** Peak RMS threshold in dBFS. Typical slap sits around -28…-12. */
  thresholdDb: number;
};

export const TIDE_HIT_THRESHOLD_MIN_DB = -45;
export const TIDE_HIT_THRESHOLD_MAX_DB = -8;
export const TIDE_HIT_THRESHOLD_DEFAULT_DB = -22;
export const TIDE_HIT_HYSTERESIS_DB = 6;
export const TIDE_HIT_DEAD_MS = 160;
export const TIDE_HIT_METRONOME_BLANK_MS = 100;
export const TIDE_HIT_METER_FLOOR_DB = -60;

export const DEFAULT_TIDE_HIT_VERIFY: TideHitVerifySettings = {
  mode: "honor",
  thresholdDb: TIDE_HIT_THRESHOLD_DEFAULT_DB,
};

export function isTideHitVerifyMode(v: unknown): v is TideHitVerifyMode {
  return (
    typeof v === "string" &&
    (TIDE_HIT_VERIFY_MODES as readonly string[]).includes(v)
  );
}

export function clampTideHitThresholdDb(db: number): number {
  if (!Number.isFinite(db)) return TIDE_HIT_THRESHOLD_DEFAULT_DB;
  return Math.min(
    TIDE_HIT_THRESHOLD_MAX_DB,
    Math.max(TIDE_HIT_THRESHOLD_MIN_DB, db),
  );
}

export function parseTideHitVerifySettings(
  raw: unknown,
): TideHitVerifySettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_TIDE_HIT_VERIFY };
  }
  const rec = raw as Partial<TideHitVerifySettings>;
  return {
    mode: isTideHitVerifyMode(rec.mode) ? rec.mode : DEFAULT_TIDE_HIT_VERIFY.mode,
    thresholdDb: clampTideHitThresholdDb(
      typeof rec.thresholdDb === "number"
        ? rec.thresholdDb
        : DEFAULT_TIDE_HIT_VERIFY.thresholdDb,
    ),
  };
}

export function loadTideHitVerifySettings(): TideHitVerifySettings {
  try {
    const raw = globalThis.localStorage?.getItem(TIDE_HIT_VERIFY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TIDE_HIT_VERIFY };
    return parseTideHitVerifySettings(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_TIDE_HIT_VERIFY };
  }
}

export function saveTideHitVerifySettings(
  settings: TideHitVerifySettings,
): TideHitVerifySettings {
  const next = parseTideHitVerifySettings(settings);
  try {
    globalThis.localStorage?.setItem(
      TIDE_HIT_VERIFY_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    /* quota */
  }
  return next;
}

/** Honor: metronome still auto-counts. Mic: only loud peaks count. */
export function shouldAutoCountTideOnAccent(mode: TideHitVerifyMode): boolean {
  switch (mode) {
    case "honor":
      return true;
    case "mic":
      return false;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function tideHitVerifyModeLabelRu(mode: TideHitVerifyMode): string {
  switch (mode) {
    case "honor":
      return "Честь";
    case "mic":
      return "Микрофон";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function tideHitVerifyModeSubRu(mode: TideHitVerifyMode): string {
  switch (mode) {
    case "honor":
      return "метроном";
    case "mic":
      return "громкость";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function tideHitVerifyModeHintRu(mode: TideHitVerifyMode): string {
  switch (mode) {
    case "honor":
      return "метроном считает сильные акценты — силу удара следишь сам";
    case "mic":
      return "считаю только если удар достаточно громкий";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function rmsFromFloat32(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const n = samples[i] ?? 0;
    sum += n * n;
  }
  return Math.sqrt(sum / samples.length);
}

export function rmsToDb(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 1e-8) return -80;
  return 20 * Math.log10(rms);
}

/** Map dBFS to 0…1 for a meter (−60…0). */
export function dbToMeterRatio(db: number): number {
  const floor = TIDE_HIT_METER_FLOOR_DB;
  if (!Number.isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db - floor) / (0 - floor)));
}

/** Place threshold a bit below a captured peak so similar hits still fire. */
export function thresholdFromPeakDb(peakDb: number): number {
  return clampTideHitThresholdDb(peakDb - 4);
}

export type TideHitOnsetState = {
  armed: boolean;
  lastHitAtMs: number;
  blankUntilMs: number;
};

export function initialTideHitOnsetState(
  nowMs = 0,
): TideHitOnsetState {
  return {
    armed: true,
    lastHitAtMs: Number.NEGATIVE_INFINITY,
    blankUntilMs: nowMs,
  };
}

export function tickTideHitOnset(opts: {
  db: number;
  thresholdDb: number;
  nowMs: number;
  hysteresisDb?: number;
  deadMs?: number;
  state: TideHitOnsetState;
}): { hit: boolean; next: TideHitOnsetState } {
  const hysteresisDb = opts.hysteresisDb ?? TIDE_HIT_HYSTERESIS_DB;
  const deadMs = opts.deadMs ?? TIDE_HIT_DEAD_MS;
  const thresholdDb = clampTideHitThresholdDb(opts.thresholdDb);
  const floor = thresholdDb - hysteresisDb;
  const { db, nowMs, state } = opts;

  if (nowMs < state.blankUntilMs) {
    return {
      hit: false,
      next: {
        ...state,
        armed: db < floor,
      },
    };
  }

  if (nowMs - state.lastHitAtMs < deadMs) {
    return { hit: false, next: state };
  }

  if (db >= thresholdDb && state.armed) {
    return {
      hit: true,
      next: {
        armed: false,
        lastHitAtMs: nowMs,
        blankUntilMs: state.blankUntilMs,
      },
    };
  }

  if (db < floor) {
    return { hit: false, next: { ...state, armed: true } };
  }

  return { hit: false, next: state };
}
