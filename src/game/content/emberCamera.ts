import type {
  EmberCameraPresetId,
  EmberMap,
  EmberMapCamera,
  EmberPack,
  EmberUserCameraPreset,
} from "./types";
import { EMBER_CAMERA_PRESET_IDS } from "./types";

/** Polar from +Y used by play and the editor iso lock. ~54° from zenith. */
export const DEFAULT_CAMERA_POLAR = 0.95;
/** South-east quarter view — same as editor "Сверху" yaw. */
export const DEFAULT_CAMERA_YAW = Math.PI * 0.25;
export const DEFAULT_CAMERA_FOV = 40;
export const DEFAULT_CAMERA_LOOK_HEIGHT = 6;
export const DEFAULT_CAMERA_NEAR = 1;
export const DEFAULT_CAMERA_FAR = 5000;
export const DEFAULT_CAMERA_PITCH_LOCK = true;
export const DEFAULT_CAMERA_POLAR_MIN = 0.35;
export const DEFAULT_CAMERA_POLAR_MAX = 1.35;
export const DEFAULT_CAMERA_MOUSE_SENSITIVITY = 1;

export const CAMERA_FOV_MIN = 25;
export const CAMERA_FOV_MAX = 85;
export const CAMERA_DIST_MIN = 48;
export const CAMERA_DIST_MAX = 320;
export const CAMERA_POLAR_DEG_MIN = 20;
export const CAMERA_POLAR_DEG_MAX = 80;

export type ResolvedEmberCamera = {
  presetId?: string;
  fov: number;
  followDistance: number;
  polarAngle: number;
  yaw: number;
  lookHeight: number;
  near: number;
  far: number;
  pitchLock: boolean;
  polarMin: number;
  polarMax: number;
  mouseSensitivity: number;
};

export function isCameraPresetId(value: unknown): value is EmberCameraPresetId {
  return (
    typeof value === "string" &&
    (EMBER_CAMERA_PRESET_IDS as readonly string[]).includes(value)
  );
}

/** Saved catalog ids (`cam_…`). Builtins never use this prefix. */
export function isUserCameraPresetId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^cam_[a-z0-9]+(?:_[a-z0-9]+)*$/i.test(value) &&
    !isCameraPresetId(value)
  );
}

function customPartial(preset: EmberUserCameraPreset): EmberMapCamera {
  const { id: _id, nameRu: _name, mapId: _mapId, presetId: _pid, ...fields } =
    preset;
  return fields;
}

export function cameraPresetLabelRu(id: EmberCameraPresetId): string {
  switch (id) {
    case "iso":
      return "Iso JRPG";
    case "close":
      return "Ближе";
    case "high":
      return "Высоко";
    case "wide":
      return "Широкий";
    default: {
      const _never: never = id;
      return _never;
    }
  }
}

/** Play follow distance when the map does not author one. */
export function defaultFollowDistance(tileSize: number): number {
  const tile = Number.isFinite(tileSize) && tileSize > 0 ? tileSize : 16;
  return clamp(tile * 7.5, 96, 160);
}

export function polarDegFromRad(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function polarRadFromDeg(deg: number): number {
  return (deg * Math.PI) / 180;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function clampFov(n: number): number {
  return clamp(n, CAMERA_FOV_MIN, CAMERA_FOV_MAX);
}

function clampDist(n: number): number {
  return clamp(n, CAMERA_DIST_MIN, CAMERA_DIST_MAX);
}

function clampPolar(n: number): number {
  return clamp(
    n,
    polarRadFromDeg(CAMERA_POLAR_DEG_MIN),
    polarRadFromDeg(CAMERA_POLAR_DEG_MAX),
  );
}

function finiteOr(n: unknown, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function presetPartial(
  id: EmberCameraPresetId,
  tileSize: number,
): EmberMapCamera {
  const follow = defaultFollowDistance(tileSize);
  switch (id) {
    case "iso":
      return {
        presetId: "iso",
        fov: DEFAULT_CAMERA_FOV,
        followDistance: follow,
        polarAngle: DEFAULT_CAMERA_POLAR,
        yaw: DEFAULT_CAMERA_YAW,
      };
    case "close":
      // Tighter chibi framing — still perspective, not FPS.
      return {
        presetId: "close",
        fov: 48,
        followDistance: clamp(tileSize * 5.2, 72, 120),
        polarAngle: 0.88,
        yaw: DEFAULT_CAMERA_YAW,
      };
    case "high":
      // More overhead, still 3D (Cinemachine high-angle / Zelda map-ish).
      return {
        presetId: "high",
        fov: 42,
        followDistance: clamp(tileSize * 9, 120, 200),
        polarAngle: 0.55,
        yaw: DEFAULT_CAMERA_YAW,
      };
    case "wide":
      // ~60° vertical FOV is the usual game/Three.js default.
      return {
        presetId: "wide",
        fov: 60,
        followDistance: clamp(tileSize * 8.2, 110, 180),
        polarAngle: DEFAULT_CAMERA_POLAR,
        yaw: DEFAULT_CAMERA_YAW,
      };
    default: {
      const _never: never = id;
      return _never;
    }
  }
}

export function cameraFromPreset(
  id: EmberCameraPresetId,
  tileSize: number,
): EmberMapCamera {
  return compactMapCamera(resolveMapCamera({ camera: presetPartial(id, tileSize) }, tileSize), tileSize) ?? {
    presetId: id,
  };
}

export function resolveMapCamera(
  map: Pick<EmberMap, "camera" | "tileSize"> | { camera?: EmberMapCamera; tileSize?: number },
  tileSize = map.tileSize ?? 16,
  customPresets?: Record<string, EmberUserCameraPreset>,
): ResolvedEmberCamera {
  const raw = map.camera;
  let preset: EmberMapCamera = {};
  if (isCameraPresetId(raw?.presetId)) {
    preset = presetPartial(raw.presetId, tileSize);
  } else if (raw?.presetId && customPresets?.[raw.presetId]) {
    preset = customPartial(customPresets[raw.presetId]!);
  }
  const merged: EmberMapCamera = { ...preset, ...raw };
  const follow = finiteOr(merged.followDistance, defaultFollowDistance(tileSize));
  const polar = clampPolar(finiteOr(merged.polarAngle, DEFAULT_CAMERA_POLAR));
  let polarMin = clampPolar(finiteOr(merged.polarMin, DEFAULT_CAMERA_POLAR_MIN));
  let polarMax = clampPolar(finiteOr(merged.polarMax, DEFAULT_CAMERA_POLAR_MAX));
  if (polarMin > polarMax) {
    const swap = polarMin;
    polarMin = polarMax;
    polarMax = swap;
  }
  const presetId = merged.presetId;
  return {
    presetId:
      isCameraPresetId(presetId) || isUserCameraPresetId(presetId)
        ? presetId
        : undefined,
    fov: clampFov(finiteOr(merged.fov, DEFAULT_CAMERA_FOV)),
    followDistance: clampDist(follow),
    polarAngle: polar,
    yaw: finiteOr(merged.yaw, DEFAULT_CAMERA_YAW),
    lookHeight: clamp(finiteOr(merged.lookHeight, DEFAULT_CAMERA_LOOK_HEIGHT), 0, 32),
    near: clamp(finiteOr(merged.near, DEFAULT_CAMERA_NEAR), 0.2, 20),
    far: clamp(finiteOr(merged.far, DEFAULT_CAMERA_FAR), 200, 16000),
    pitchLock:
      typeof merged.pitchLock === "boolean"
        ? merged.pitchLock
        : DEFAULT_CAMERA_PITCH_LOCK,
    polarMin,
    polarMax,
    mouseSensitivity: clamp(
      finiteOr(merged.mouseSensitivity, DEFAULT_CAMERA_MOUSE_SENSITIVITY),
      0.25,
      3,
    ),
  };
}

export function resolvePackMapCamera(
  map: Pick<EmberMap, "camera" | "tileSize">,
  pack: Pick<EmberPack, "cameraPresets"> | undefined,
  tileSize = map.tileSize,
): ResolvedEmberCamera {
  return resolveMapCamera(map, tileSize, pack?.cameraPresets);
}

export function matchingCameraPresetId(
  resolved: ResolvedEmberCamera,
  tileSize: number,
): EmberCameraPresetId | undefined {
  for (const id of EMBER_CAMERA_PRESET_IDS) {
    const preset = resolveMapCamera({ camera: presetPartial(id, tileSize) }, tileSize);
    if (
      Math.abs(preset.fov - resolved.fov) < 0.51 &&
      Math.abs(preset.followDistance - resolved.followDistance) < 1.5 &&
      Math.abs(preset.polarAngle - resolved.polarAngle) < 0.02 &&
      Math.abs(preset.yaw - resolved.yaw) < 0.02
    ) {
      return id;
    }
  }
  return undefined;
}

/** Drop defaults so map JSON stays compact. */
export function compactMapCamera(
  resolved: ResolvedEmberCamera,
  tileSize: number,
): EmberMapCamera | undefined {
  const defaults = resolveMapCamera({}, tileSize);
  const out: EmberMapCamera = {};
  const matched = matchingCameraPresetId(resolved, tileSize);
  if (isUserCameraPresetId(resolved.presetId)) {
    out.presetId = resolved.presetId;
  } else if (resolved.presetId && matched === resolved.presetId) {
    out.presetId = resolved.presetId;
  } else if (matched && matched !== "iso") {
    out.presetId = matched;
  }
  if (Math.abs(resolved.fov - defaults.fov) > 0.01) out.fov = round1(resolved.fov);
  if (Math.abs(resolved.followDistance - defaults.followDistance) > 0.5) {
    out.followDistance = round1(resolved.followDistance);
  }
  if (Math.abs(resolved.polarAngle - defaults.polarAngle) > 0.005) {
    out.polarAngle = round3(resolved.polarAngle);
  }
  if (Math.abs(resolved.yaw - defaults.yaw) > 0.005) {
    out.yaw = round3(resolved.yaw);
  }
  if (Math.abs(resolved.lookHeight - defaults.lookHeight) > 0.05) {
    out.lookHeight = round1(resolved.lookHeight);
  }
  if (Math.abs(resolved.near - defaults.near) > 0.05) out.near = round2(resolved.near);
  if (Math.abs(resolved.far - defaults.far) > 1) out.far = Math.round(resolved.far);
  if (resolved.pitchLock !== defaults.pitchLock) out.pitchLock = resolved.pitchLock;
  if (Math.abs(resolved.polarMin - defaults.polarMin) > 0.005) {
    out.polarMin = round3(resolved.polarMin);
  }
  if (Math.abs(resolved.polarMax - defaults.polarMax) > 0.005) {
    out.polarMax = round3(resolved.polarMax);
  }
  if (Math.abs(resolved.mouseSensitivity - defaults.mouseSensitivity) > 0.02) {
    out.mouseSensitivity = round2(resolved.mouseSensitivity);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function normalizeMapCamera(
  raw: unknown,
  tileSize: number,
): EmberMapCamera | undefined {
  if (raw == null || raw === "") return undefined;
  if (typeof raw !== "object") return undefined;
  const src = raw as Record<string, unknown>;
  const next: EmberMapCamera = {};
  if (isCameraPresetId(src.presetId) || isUserCameraPresetId(src.presetId)) {
    next.presetId = src.presetId;
  }
  if (typeof src.fov === "number") next.fov = clampFov(src.fov);
  if (typeof src.followDistance === "number") {
    next.followDistance = clampDist(src.followDistance);
  }
  if (typeof src.polarAngle === "number") next.polarAngle = clampPolar(src.polarAngle);
  if (typeof src.yaw === "number" && Number.isFinite(src.yaw)) next.yaw = src.yaw;
  if (typeof src.lookHeight === "number") {
    next.lookHeight = clamp(src.lookHeight, 0, 32);
  }
  if (typeof src.near === "number") next.near = clamp(src.near, 0.2, 20);
  if (typeof src.far === "number") next.far = clamp(src.far, 200, 16000);
  if (typeof src.pitchLock === "boolean") next.pitchLock = src.pitchLock;
  if (typeof src.polarMin === "number") next.polarMin = clampPolar(src.polarMin);
  if (typeof src.polarMax === "number") next.polarMax = clampPolar(src.polarMax);
  if (typeof src.mouseSensitivity === "number") {
    next.mouseSensitivity = clamp(src.mouseSensitivity, 0.25, 3);
  }
  const resolved = resolveMapCamera({ camera: next, tileSize }, tileSize);
  return compactMapCamera(resolved, tileSize);
}

export function cameraValidationMessage(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "object") {
    return "camera должен быть объектом";
  }
  const src = raw as Record<string, unknown>;
  if (
    src.presetId != null &&
    !isCameraPresetId(src.presetId) &&
    !isUserCameraPresetId(src.presetId)
  ) {
    return `Неизвестный camera.presetId «${String(src.presetId)}»`;
  }
  return null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
