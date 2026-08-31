import { describe, expect, it } from "vitest";
import type { BeatPatternDef } from "./types";
import {
  hitAtMsForStep,
  hitsForStep,
  nextHitAfter,
  scheduleWindow,
} from "./beatSchedule";
import { BEAT_LEAD_IN_MS } from "./beatTiming";

const meter: BeatPatternDef = {
  id: "meter_1_2",
  name: "1-2",
  nameRu: "Раз-два",
  descriptionRu: "",
  kind: "meter",
  steps: [1, 2],
  cuesRu: [],
  enabled: true,
};

const double: BeatPatternDef = {
  id: "special_double",
  name: "double",
  nameRu: "Двойной",
  descriptionRu: "",
  kind: "special",
  cuesRu: [],
  enabled: true,
};

const accel: BeatPatternDef = {
  id: "special_accel",
  name: "accel",
  nameRu: "Разгон",
  descriptionRu: "",
  kind: "special",
  params: { fromBpmScale: 0.7, toBpmScale: 1.3 },
  cuesRu: [],
  enabled: true,
};

describe("hitAtMsForStep", () => {
  it("places meter steps on a constant grid after lead-in", () => {
    const lead = BEAT_LEAD_IN_MS;
    const bpm = 60;
    expect(hitAtMsForStep(meter, bpm, lead, 0)).toBe(lead);
    expect(hitAtMsForStep(meter, bpm, lead, 1)).toBe(lead + 1000);
    expect(hitAtMsForStep(meter, bpm, lead, 2)).toBe(lead + 2000);
  });

  it("adds a micro-hit for special_double", () => {
    const lead = 0;
    const hits = hitsForStep(double, 60, lead, 0);
    expect(hits).toHaveLength(2);
    expect(hits[0]?.atMs).toBe(0);
    expect(hits[1]?.atMs).toBeCloseTo(350, 6);
    expect(hits[1]?.accent).toBe(1);
  });

  it("integrates accel so later steps arrive sooner than a constant 60bpm grid", () => {
    const lead = 0;
    const t10 = hitAtMsForStep(accel, 60, lead, 10);
    // Accel starts at 0.7× BPM, so early hits are later than a 60bpm grid.
    expect(t10).toBeGreaterThan(10_000);
    const step10 = hitAtMsForStep(accel, 60, lead, 10);
    const step11 = hitAtMsForStep(accel, 60, lead, 11);
    const earlyIv =
      hitAtMsForStep(accel, 60, lead, 1) - hitAtMsForStep(accel, 60, lead, 0);
    expect(step11 - step10).toBeLessThan(earlyIv);
  });
});

describe("clock plan vs scheduleWindow", () => {
  it("shares hitAt for meter, double, and accel", () => {
    const cases: Array<{ pattern: BeatPatternDef; bpm: number }> = [
      { pattern: meter, bpm: 80 },
      { pattern: double, bpm: 60 },
      { pattern: accel, bpm: 60 },
    ];
    for (const { pattern, bpm } of cases) {
      const origin = 8_000;
      const lead = BEAT_LEAD_IN_MS;
      const now = origin + lead + 1800;
      const window = scheduleWindow({
        pattern,
        baseBpm: bpm,
        blockStartPerf: origin,
        nowPerf: now,
        lookAheadMs: 2400,
        lookBehindMs: 800,
        leadInMs: lead,
      });
      expect(window.length).toBeGreaterThan(0);
      for (const hit of window) {
        const planned = hitsForStep(pattern, bpm, lead, hit.stepIndex);
        const match = planned.find(
          (h) => Math.abs(h.atMs - hit.atMs) < 0.05 && h.accent === hit.accent,
        );
        expect(match).toBeTruthy();
        expect(hit.hitAt).toBe(origin + hit.atMs);
      }
    }
  });
});

describe("scheduleWindow vs hitAtMsForStep", () => {
  it("uses the same atMs for meter hits", () => {
    const origin = 10_000;
    const lead = BEAT_LEAD_IN_MS;
    const bpm = 80;
    const now = origin + lead + 1500;
    const window = scheduleWindow({
      pattern: meter,
      baseBpm: bpm,
      blockStartPerf: origin,
      nowPerf: now,
      lookAheadMs: 2400,
      lookBehindMs: 800,
      leadInMs: lead,
    });
    expect(window.length).toBeGreaterThan(0);
    for (const hit of window) {
      const expected = hitsForStep(meter, bpm, lead, hit.stepIndex).find(
        (h) => h.accent === hit.accent && Math.abs(h.atMs - hit.atMs) < 0.01,
      );
      expect(expected).toBeTruthy();
      expect(hit.hitAt).toBe(origin + hit.atMs);
    }
  });

  it("matches accel step times in the look-ahead window", () => {
    const origin = 0;
    const lead = 0;
    const now = 4000;
    const window = scheduleWindow({
      pattern: accel,
      baseBpm: 60,
      blockStartPerf: origin,
      nowPerf: now,
      lookAheadMs: 2400,
      lookBehindMs: 800,
      leadInMs: lead,
    });
    const mains = window.filter((h) => h.accent >= 2 || h.accent === 0);
    expect(mains.length).toBeGreaterThan(0);
    for (const hit of mains) {
      expect(hit.atMs).toBeCloseTo(
        hitAtMsForStep(accel, 60, lead, hit.stepIndex),
        4,
      );
    }
  });

  it("keeps late-ramp accel hits on the track through center, not only the right edge", () => {
    const lead = BEAT_LEAD_IN_MS;
    const now = 35_000;
    const window = scheduleWindow({
      pattern: accel,
      baseBpm: 80,
      blockStartPerf: 0,
      nowPerf: now,
      lookAheadMs: 2400,
      lookBehindMs: 800,
      leadInMs: lead,
    });
    const dts = window.map((h) => h.atMs - now);
    expect(window.length).toBeGreaterThan(2);
    expect(dts.some((dt) => dt >= -800 && dt <= 80)).toBe(true);
    expect(dts.some((dt) => dt > 200 && dt < 2200)).toBe(true);
  });

  it("finds the true next accel hit late in the ramp", () => {
    const lead = BEAT_LEAD_IN_MS;
    const now = 35_000;
    const next = nextHitAfter(accel, 80, lead, now);
    expect(next).toBeTruthy();
    expect(next!.atMs).toBeGreaterThanOrEqual(now - 1);
    expect(next!.atMs - now).toBeLessThan(1200);
    const trueAt = hitAtMsForStep(accel, 80, lead, next!.stepIndex);
    expect(next!.atMs).toBeCloseTo(trueAt, 4);
  });
});
