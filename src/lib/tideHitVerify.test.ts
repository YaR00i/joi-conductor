import { describe, expect, it } from "vitest";
import {
  clampTideHitThresholdDb,
  dbToMeterRatio,
  DEFAULT_TIDE_HIT_VERIFY,
  initialTideHitOnsetState,
  parseTideHitVerifySettings,
  rmsFromFloat32,
  rmsToDb,
  shouldAutoCountTideOnAccent,
  thresholdFromPeakDb,
  tickTideHitOnset,
  TIDE_HIT_THRESHOLD_MAX_DB,
  TIDE_HIT_THRESHOLD_MIN_DB,
} from "./tideHitVerify";

describe("tideHitVerify", () => {
  it("parses settings and clamps threshold", () => {
    expect(parseTideHitVerifySettings(null)).toEqual(DEFAULT_TIDE_HIT_VERIFY);
    expect(parseTideHitVerifySettings({ mode: "mic", thresholdDb: -18 }).mode).toBe(
      "mic",
    );
    expect(parseTideHitVerifySettings({ mode: "nope", thresholdDb: 9 })).toEqual({
      mode: "honor",
      thresholdDb: TIDE_HIT_THRESHOLD_MAX_DB,
    });
    expect(clampTideHitThresholdDb(-90)).toBe(TIDE_HIT_THRESHOLD_MIN_DB);
  });

  it("auto-counts only in honor mode", () => {
    expect(shouldAutoCountTideOnAccent("honor")).toBe(true);
    expect(shouldAutoCountTideOnAccent("mic")).toBe(false);
  });

  it("converts RMS to dB and meter ratio", () => {
    expect(rmsFromFloat32(new Float32Array([0, 0, 0]))).toBe(0);
    expect(rmsToDb(0)).toBe(-80);
    expect(rmsToDb(1)).toBeCloseTo(0);
    expect(dbToMeterRatio(-60)).toBe(0);
    expect(dbToMeterRatio(0)).toBe(1);
    expect(dbToMeterRatio(-30)).toBeCloseTo(0.5);
  });

  it("sets threshold a few dB below a captured peak", () => {
    expect(thresholdFromPeakDb(-12)).toBe(-16);
    expect(thresholdFromPeakDb(-2)).toBe(TIDE_HIT_THRESHOLD_MAX_DB);
  });

  it("fires once on rising through threshold, then needs a drop", () => {
    let state = initialTideHitOnsetState(0);
    const quiet = tickTideHitOnset({
      db: -40,
      thresholdDb: -22,
      nowMs: 10,
      state,
    });
    expect(quiet.hit).toBe(false);
    state = quiet.next;

    const loud = tickTideHitOnset({
      db: -12,
      thresholdDb: -22,
      nowMs: 20,
      state,
    });
    expect(loud.hit).toBe(true);
    state = loud.next;

    const stillLoud = tickTideHitOnset({
      db: -12,
      thresholdDb: -22,
      nowMs: 400,
      state,
    });
    expect(stillLoud.hit).toBe(false);

    const drop = tickTideHitOnset({
      db: -40,
      thresholdDb: -22,
      nowMs: 500,
      state: stillLoud.next,
    });
    expect(drop.hit).toBe(false);

    const second = tickTideHitOnset({
      db: -12,
      thresholdDb: -22,
      nowMs: 510,
      state: drop.next,
    });
    expect(second.hit).toBe(true);
  });

  it("ignores a second peak inside dead time", () => {
    let state = initialTideHitOnsetState(0);
    const first = tickTideHitOnset({
      db: -10,
      thresholdDb: -22,
      nowMs: 100,
      state,
    });
    expect(first.hit).toBe(true);
    state = first.next;
    const drop = tickTideHitOnset({
      db: -40,
      thresholdDb: -22,
      nowMs: 120,
      state,
    });
    const second = tickTideHitOnset({
      db: -10,
      thresholdDb: -22,
      nowMs: 140,
      state: drop.next,
    });
    expect(second.hit).toBe(false);
  });

  it("does not count while blanked for the metronome", () => {
    const blanked = tickTideHitOnset({
      db: -8,
      thresholdDb: -22,
      nowMs: 50,
      state: { armed: true, lastHitAtMs: Number.NEGATIVE_INFINITY, blankUntilMs: 100 },
    });
    expect(blanked.hit).toBe(false);
  });
});
