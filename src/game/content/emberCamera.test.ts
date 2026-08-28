import { describe, expect, it } from "vitest";
import {
  cameraFromPreset,
  cameraPresetLabelRu,
  cameraValidationMessage,
  compactMapCamera,
  defaultFollowDistance,
  DEFAULT_CAMERA_FOV,
  DEFAULT_CAMERA_POLAR,
  matchingCameraPresetId,
  normalizeMapCamera,
  polarDegFromRad,
  polarRadFromDeg,
  resolveMapCamera,
} from "./emberCamera";

describe("ember camera rig", () => {
  it("defaults omitted maps to the current iso JRPG framing", () => {
    const resolved = resolveMapCamera({ tileSize: 16 });
    expect(resolved.fov).toBe(DEFAULT_CAMERA_FOV);
    expect(resolved.polarAngle).toBeCloseTo(DEFAULT_CAMERA_POLAR);
    expect(resolved.followDistance).toBe(defaultFollowDistance(16));
    expect(resolved.pitchLock).toBe(true);
    expect(resolved.lookHeight).toBe(6);
    expect(compactMapCamera(resolved, 16)).toBeUndefined();
  });

  it("keeps tileSize 16 follow distance at 120", () => {
    expect(defaultFollowDistance(16)).toBe(120);
  });

  it("applies wide preset FOV 60 without changing pitch lock", () => {
    const authored = cameraFromPreset("wide", 16);
    const resolved = resolveMapCamera({ camera: authored, tileSize: 16 }, 16);
    expect(resolved.fov).toBe(60);
    expect(resolved.pitchLock).toBe(true);
    expect(matchingCameraPresetId(resolved, 16)).toBe("wide");
    expect(cameraPresetLabelRu("wide")).toBe("Широкий");
  });

  it("lets an explicit FOV override the preset id", () => {
    const resolved = resolveMapCamera(
      { camera: { presetId: "iso", fov: 55 }, tileSize: 16 },
      16,
    );
    expect(resolved.fov).toBe(55);
    expect(matchingCameraPresetId(resolved, 16)).toBeUndefined();
  });

  it("round-trips polar degrees for the iso default", () => {
    expect(polarDegFromRad(DEFAULT_CAMERA_POLAR)).toBeCloseTo(54.43, 1);
    expect(polarRadFromDeg(54.43)).toBeCloseTo(DEFAULT_CAMERA_POLAR, 2);
  });

  it("drops empty camera objects and flags unknown presets", () => {
    expect(normalizeMapCamera({}, 16)).toBeUndefined();
    expect(normalizeMapCamera({ fov: 40 }, 16)).toBeUndefined();
    expect(cameraValidationMessage({ presetId: "fps" })).toMatch(/presetId/);
    expect(cameraValidationMessage({ presetId: "close" })).toBeNull();
    expect(cameraValidationMessage({ presetId: "cam_ab12_cd" })).toBeNull();
    expect(normalizeMapCamera({ presetId: "cam_ab12_cd" }, 16)).toEqual({
      presetId: "cam_ab12_cd",
    });
  });
});
