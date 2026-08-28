import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isUserCameraPresetId, resolveMapCamera } from "./emberCamera";
import {
  cameraFromUserPreset,
  camerasFileFromPresets,
  listUserCameraPresetsForMap,
  matchingUserCameraPresetId,
  normalizeUserCameraPreset,
  presetsFromCamerasFile,
  snapshotUserCameraPreset,
} from "./cameraPresets";
import type { EmberCamerasFile } from "./types";

describe("user camera presets", () => {
  it("keeps pack-global presets visible on every map", () => {
    const all = {
      cam_a1: { id: "cam_a1", nameRu: "Общий", fov: 50 },
      cam_b1: { id: "cam_b1", nameRu: "Двор", fov: 58, mapId: "hu_tao_yard" },
      cam_c1: {
        id: "cam_c1",
        nameRu: "Песочница",
        fov: 44,
        mapId: "agent_sandbox",
      },
    };
    const sandbox = listUserCameraPresetsForMap(all, "agent_sandbox");
    expect(sandbox.map((p) => p.id)).toEqual(["cam_a1", "cam_c1"]);
    expect(listUserCameraPresetsForMap(all, "fan_town").map((p) => p.id)).toEqual(
      ["cam_a1"],
    );
  });

  it("round-trips a named rig through the pack file", () => {
    const resolved = resolveMapCamera({ camera: { fov: 55, followDistance: 140 } }, 16);
    const saved = snapshotUserCameraPreset(
      "cam_test1_ab",
      "Тест",
      "agent_sandbox",
      resolved,
      16,
    );
    expect(saved.mapId).toBe("agent_sandbox");
    expect(saved.fov).toBe(55);
    const file = camerasFileFromPresets({ [saved.id]: saved });
    const loaded = presetsFromCamerasFile(file);
    expect(normalizeUserCameraPreset(loaded[saved.id], 16)?.nameRu).toBe("Тест");
    const authored = cameraFromUserPreset(loaded[saved.id]!, 16);
    expect(authored.presetId).toBe("cam_test1_ab");
    expect(resolveMapCamera({ camera: authored, tileSize: 16 }, 16).fov).toBe(55);
    expect(
      matchingUserCameraPresetId(resolved, 16, Object.values(loaded)),
    ).toBe("cam_test1_ab");
  });

  it("rejects builtin ids as user catalog entries", () => {
    expect(isUserCameraPresetId("iso")).toBe(false);
    expect(isUserCameraPresetId("cam_iso")).toBe(true);
    expect(normalizeUserCameraPreset({ id: "wide", nameRu: "x", fov: 60 })).toBeNull();
  });

  it("ships cameras/registry.json so play does not 404", () => {
    const emberRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../content/ember",
    );
    const file = JSON.parse(
      readFileSync(path.join(emberRoot, "cameras/registry.json"), "utf8"),
    ) as EmberCamerasFile;
    expect(Array.isArray(file.presets)).toBe(true);
    expect(presetsFromCamerasFile(file)).toEqual({});
  });
});
