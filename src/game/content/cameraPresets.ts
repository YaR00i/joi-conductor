/**
 * Named user camera rigs: pack-global or bound to one map.
 * Builtins stay in emberCamera.ts; this is the save catalog.
 */
import {
  compactMapCamera,
  isUserCameraPresetId,
  normalizeMapCamera,
  resolveMapCamera,
  type ResolvedEmberCamera,
} from "./emberCamera";
import type {
  EmberCamerasFile,
  EmberMapCamera,
  EmberUserCameraPreset,
} from "./types";

export function newCameraPresetId(): string {
  return `cam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function cameraFieldsFromPreset(
  preset: EmberUserCameraPreset,
): EmberMapCamera {
  const { id: _id, nameRu: _name, mapId: _mapId, presetId: _pid, ...fields } =
    preset;
  return fields;
}

export function normalizeUserCameraPreset(
  raw: unknown,
  tileSize = 16,
): EmberUserCameraPreset | null {
  if (raw == null || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  if (!isUserCameraPresetId(src.id)) return null;
  const nameRu =
    (typeof src.nameRu === "string" && src.nameRu.trim()) || src.id;
  const mapId =
    typeof src.mapId === "string" && src.mapId.trim()
      ? src.mapId.trim()
      : undefined;
  const camera = normalizeMapCamera({ ...src, presetId: undefined }, tileSize) ?? {};
  delete camera.presetId;
  return {
    id: src.id,
    nameRu,
    ...(mapId ? { mapId } : {}),
    ...camera,
  };
}

export function camerasFileFromPresets(
  presets: Record<string, EmberUserCameraPreset>,
): EmberCamerasFile {
  return {
    presets: Object.values(presets).sort((a, b) =>
      a.nameRu.localeCompare(b.nameRu, "ru"),
    ),
  };
}

export function presetsFromCamerasFile(
  file: EmberCamerasFile | null | undefined,
): Record<string, EmberUserCameraPreset> {
  const out: Record<string, EmberUserCameraPreset> = {};
  for (const raw of file?.presets ?? []) {
    const p = normalizeUserCameraPreset(raw);
    if (p) out[p.id] = p;
  }
  return out;
}

/** Globals first, then presets bound to this map. */
export function listUserCameraPresetsForMap(
  all: Record<string, EmberUserCameraPreset> | undefined,
  mapId: string | undefined,
): EmberUserCameraPreset[] {
  return Object.values(all ?? {})
    .filter((p) => !p.mapId || (mapId != null && p.mapId === mapId))
    .sort((a, b) => {
      const as = a.mapId ? 1 : 0;
      const bs = b.mapId ? 1 : 0;
      if (as !== bs) return as - bs;
      return a.nameRu.localeCompare(b.nameRu, "ru");
    });
}

export function cameraFromUserPreset(
  preset: EmberUserCameraPreset,
  tileSize: number,
): EmberMapCamera {
  const resolved = resolveMapCamera(
    { camera: cameraFieldsFromPreset(preset), tileSize },
    tileSize,
  );
  const compact = compactMapCamera(
    { ...resolved, presetId: preset.id },
    tileSize,
  );
  return compact ?? { presetId: preset.id };
}

export function snapshotUserCameraPreset(
  id: string,
  nameRu: string,
  mapId: string | undefined,
  resolved: ResolvedEmberCamera,
  tileSize: number,
): EmberUserCameraPreset {
  const compact =
    compactMapCamera({ ...resolved, presetId: undefined }, tileSize) ?? {};
  delete compact.presetId;
  return {
    id,
    nameRu: nameRu.trim() || id,
    ...(mapId ? { mapId } : {}),
    ...compact,
  };
}

export function matchingUserCameraPresetId(
  resolved: ResolvedEmberCamera,
  tileSize: number,
  presets: readonly EmberUserCameraPreset[],
): string | undefined {
  for (const preset of presets) {
    const sample = resolveMapCamera(
      { camera: cameraFromUserPreset(preset, tileSize), tileSize },
      tileSize,
    );
    if (
      Math.abs(sample.fov - resolved.fov) < 0.51 &&
      Math.abs(sample.followDistance - resolved.followDistance) < 1.5 &&
      Math.abs(sample.polarAngle - resolved.polarAngle) < 0.02 &&
      Math.abs(sample.yaw - resolved.yaw) < 0.02 &&
      Math.abs(sample.lookHeight - resolved.lookHeight) < 0.08 &&
      sample.pitchLock === resolved.pitchLock &&
      Math.abs(sample.mouseSensitivity - resolved.mouseSensitivity) < 0.03
    ) {
      return preset.id;
    }
  }
  return undefined;
}
