import { describe, expect, it } from "vitest";
import {
  clampVibeLevel,
  intensityToLovense,
  vibeLevelToIntensity,
  vibeLevelToLovense,
} from "./intensityMap";
import {
  shouldRestoreDeviceOnResume,
  shouldStopDeviceOnEvent,
  shouldStopOnBlockStart,
  stopReasonForEvent,
} from "./deviceSession";

describe("intensityMap", () => {
  it("clamps vibe levels to 0–5", () => {
    expect(clampVibeLevel(-2)).toBe(0);
    expect(clampVibeLevel(0)).toBe(0);
    expect(clampVibeLevel(3.4)).toBe(3);
    expect(clampVibeLevel(5)).toBe(5);
    expect(clampVibeLevel(99)).toBe(5);
  });

  it("maps 0–5 → 0–1 intensity", () => {
    expect(vibeLevelToIntensity(0)).toBe(0);
    expect(vibeLevelToIntensity(1)).toBeCloseTo(0.2);
    expect(vibeLevelToIntensity(5)).toBe(1);
  });

  it("maps intensity → Lovense 0–20", () => {
    expect(intensityToLovense(0)).toBe(0);
    expect(intensityToLovense(1)).toBe(20);
    expect(intensityToLovense(0.5)).toBe(10);
    expect(vibeLevelToLovense(0)).toBe(0);
    expect(vibeLevelToLovense(5)).toBe(20);
    expect(vibeLevelToLovense(3)).toBe(12);
  });
});

describe("deviceSession stop helpers", () => {
  it("stops on pause / end / block_end", () => {
    expect(shouldStopDeviceOnEvent("session_pause")).toBe(true);
    expect(shouldStopDeviceOnEvent("session_end")).toBe(true);
    expect(shouldStopDeviceOnEvent("block_end")).toBe(true);
    expect(shouldStopDeviceOnEvent("vibe_level")).toBe(false);
    expect(shouldStopDeviceOnEvent("session_resume")).toBe(false);
  });

  it("stops when leaving vibe drive", () => {
    expect(shouldStopOnBlockStart("vibe")).toBe(false);
    expect(shouldStopOnBlockStart("beat")).toBe(true);
    expect(shouldStopOnBlockStart(undefined)).toBe(true);
  });

  it("restores on resume only with active level", () => {
    expect(
      shouldRestoreDeviceOnResume({ status: "running", vibeLevel: 3 }),
    ).toBe(true);
    expect(
      shouldRestoreDeviceOnResume({ status: "running", vibeLevel: 0 }),
    ).toBe(false);
    expect(
      shouldRestoreDeviceOnResume({ status: "paused", vibeLevel: 4 }),
    ).toBe(false);
    expect(
      shouldRestoreDeviceOnResume({ status: "running", vibeLevel: null }),
    ).toBe(false);
  });

  it("maps stop reasons", () => {
    expect(stopReasonForEvent("session_pause")).toBe("session_pause");
    expect(stopReasonForEvent("vibe_level")).toBeNull();
  });
});
