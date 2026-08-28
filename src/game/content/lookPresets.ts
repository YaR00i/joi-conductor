/**
 * Helpers for Ember map look snapshots: fill, sun, bloom, grade, atmosphere.
 */
import type {
  EmberLookPreset,
  EmberLooksFile,
  EmberMapAtmosphere,
  EmberMapLight,
} from "./types";
import {
  omitUnsetLightBudget,
  resolveMapLight,
  type ResolvedMapLight,
} from "../tile/mapUtils";

/** Built-in golden-hour evening — warm low sun, soft haze, long shadows. */
export const BUILTIN_SUNNY_EVENING_LOOK: EmberLookPreset = {
  id: "look_sunny_evening",
  nameRu: "Солнечный вечер",
  ambientColor: "#2a140c",
  ambientAlpha: 0.22,
  fillIntensity: 1.05,
  sunAzimuth: 228,
  sunElevation: 11,
  sunColor: "#ff9a4a",
  sunIntensity: 1.45,
  bloomStrength: 0.58,
  bloomThreshold: 0.38,
  bloomRadius: 0.72,
  grade: {
    tone: 0.28,
    brightness: 1.08,
    saturation: 1.18,
  },
  atmosphere: {
    fog: 0.24,
    fogColor: "#c89068",
    rain: 0,
    wind: 0.22,
    cloudShadows: 0.22,
    cloudSpeed: 0.18,
    dust: 0.42,
    vignette: 0.3,
    tiltShift: 0,
    haze: 0.55,
    sunGlare: 0.72,
    sparkle: 0,
    fireflies: 0.12,
  },
};

/** Built-in toy diorama: high sun, pastel haze, sparkle, tilt-shift. */
export const BUILTIN_TOY_LOOK: EmberLookPreset = {
  id: "look_toy_diorama",
  nameRu: "Игрушечный",
  ambientColor: "#3a2418",
  ambientAlpha: 0.1,
  fillIntensity: 1.22,
  sunAzimuth: 52,
  sunElevation: 54,
  sunColor: "#ffe8b8",
  sunIntensity: 1.18,
  bloomStrength: 0.48,
  bloomThreshold: 0.52,
  bloomRadius: 0.44,
  grade: {
    tone: 0.16,
    brightness: 1.12,
    saturation: 1.22,
  },
  atmosphere: {
    fog: 0.04,
    fogColor: "#c8e4f0",
    rain: 0,
    wind: 0.18,
    cloudShadows: 0.16,
    cloudSpeed: 0.2,
    dust: 0.1,
    fireflies: 0,
    sparkle: 0.55,
    vignette: 0.16,
    tiltShift: 0.42,
    haze: 0.12,
    sunGlare: 0.4,
  },
};

const BUILTIN_LOOKS: Record<string, EmberLookPreset> = {
  [BUILTIN_SUNNY_EVENING_LOOK.id]: BUILTIN_SUNNY_EVENING_LOOK,
  [BUILTIN_TOY_LOOK.id]: BUILTIN_TOY_LOOK,
};

export function normalizeLookPreset(
  raw: Omit<Partial<EmberLookPreset>, "atmosphere"> & {
    id?: string;
    atmosphere?: EmberMapAtmosphere;
  },
): EmberLookPreset | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const resolved = resolveMapLight({
    light: {
      ambientColor: raw.ambientColor,
      ambientAlpha: raw.ambientAlpha,
      fillIntensity: raw.fillIntensity,
      sunAzimuth: raw.sunAzimuth,
      sunElevation: raw.sunElevation,
      sunColor: raw.sunColor,
      sunIntensity: raw.sunIntensity,
      bloomStrength: raw.bloomStrength,
      bloomThreshold: raw.bloomThreshold,
      bloomRadius: raw.bloomRadius,
      grade: raw.grade,
      atmosphere: raw.atmosphere,
    },
  });
  return {
    id: raw.id,
    nameRu: (raw.nameRu || raw.id).trim() || raw.id,
    ambientColor: resolved.ambientColor,
    ambientAlpha: resolved.ambientAlpha,
    fillIntensity: resolved.fillIntensity,
    sunAzimuth: resolved.sunAzimuth,
    sunElevation: resolved.sunElevation,
    sunColor: resolved.sunColor,
    sunIntensity: resolved.sunIntensity,
    bloomStrength: resolved.bloomStrength,
    bloomThreshold: resolved.bloomThreshold,
    bloomRadius: resolved.bloomRadius,
    grade: { ...resolved.grade },
    atmosphere: { ...resolved.atmosphere },
  };
}

export function lookSnapshotFromLight(light: ResolvedMapLight): Omit<
  EmberLookPreset,
  "id" | "nameRu"
> {
  return {
    ambientColor: light.ambientColor,
    ambientAlpha: light.ambientAlpha,
    fillIntensity: light.fillIntensity,
    sunAzimuth: light.sunAzimuth,
    sunElevation: light.sunElevation,
    sunColor: light.sunColor,
    sunIntensity: light.sunIntensity,
    bloomStrength: light.bloomStrength,
    bloomThreshold: light.bloomThreshold,
    bloomRadius: light.bloomRadius,
    grade: { ...light.grade },
    atmosphere: { ...light.atmosphere },
  };
}

/** Apply a look preset onto existing map light (keeps lamp defaults). */
export function applyLookPresetToLight(
  current: ResolvedMapLight | EmberMapLight | undefined,
  preset: EmberLookPreset,
): EmberMapLight {
  const base = resolveMapLight({ light: current });
  const look = normalizeLookPreset(preset) ?? preset;
  return omitUnsetLightBudget({
    ...base,
    ambientColor: look.ambientColor,
    ambientAlpha: look.ambientAlpha,
    fillIntensity: look.fillIntensity,
    sunAzimuth: look.sunAzimuth,
    sunElevation: look.sunElevation,
    sunColor: look.sunColor,
    sunIntensity: look.sunIntensity,
    bloomStrength: look.bloomStrength,
    bloomThreshold: look.bloomThreshold,
    bloomRadius: look.bloomRadius,
    grade: { ...look.grade },
    atmosphere: { ...look.atmosphere },
    // Preserve lantern defaults from the map.
    lampColor: base.lampColor,
    lampFaceColor: base.lampFaceColor,
    lampRange: base.lampRange,
    lampDiscCore: base.lampDiscCore,
    lampDiscMid: base.lampDiscMid,
    lampHeight: base.lampHeight,
    lampShowCore: base.lampShowCore,
    lampStrength0: base.lampStrength0,
    lampStrengthFalloff: base.lampStrengthFalloff,
    lampPower: base.lampPower,
    floorGlowBase: base.floorGlowBase,
    floorGlowScale: base.floorGlowScale,
    faceGlowBase: base.faceGlowBase,
    faceGlowScale: base.faceGlowScale,
  });
}

export function looksFileFromPresets(
  presets: Record<string, EmberLookPreset>,
): EmberLooksFile {
  return {
    presets: Object.values(presets)
      .filter((p) => !BUILTIN_LOOKS[p.id])
      .sort((a, b) => a.nameRu.localeCompare(b.nameRu, "ru")),
  };
}

export function presetsFromLooksFile(
  file: EmberLooksFile | null | undefined,
): Record<string, EmberLookPreset> {
  const out: Record<string, EmberLookPreset> = { ...BUILTIN_LOOKS };
  for (const raw of file?.presets ?? []) {
    const p = normalizeLookPreset(raw);
    if (p) out[p.id] = p;
  }
  return out;
}

export function newLookPresetId(): string {
  return `look_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function listLookPresets(
  packPresets: Record<string, EmberLookPreset> | undefined,
): EmberLookPreset[] {
  const merged = { ...BUILTIN_LOOKS, ...(packPresets ?? {}) };
  return Object.values(merged).sort((a, b) => {
    const rank = (id: string) => {
      if (id === BUILTIN_SUNNY_EVENING_LOOK.id) return 0;
      if (id === BUILTIN_TOY_LOOK.id) return 1;
      return 2;
    };
    const d = rank(a.id) - rank(b.id);
    if (d !== 0) return d;
    return a.nameRu.localeCompare(b.nameRu, "ru");
  });
}

export function isBuiltinLookPreset(id: string): boolean {
  return Boolean(BUILTIN_LOOKS[id]);
}
