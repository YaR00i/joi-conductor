/**
 * Helpers for Ember lamp param snapshots: clipboard + pack presets.
 */
import type {
  EmberLampParams,
  EmberLightPreset,
  EmberLightSource,
  EmberLightsFile,
} from "./types";
import { clampLampDiscRadii } from "../tile/mapUtils";

export function normalizeLampParams(
  raw: Partial<EmberLampParams> | null | undefined,
  fallback?: Partial<EmberLampParams>,
): EmberLampParams {
  const f = fallback ?? {};
  const range = Math.max(
    1,
    Math.min(16, Math.round(raw?.lampRange ?? f.lampRange ?? 3)),
  );
  const discs = clampLampDiscRadii(
    raw?.lampDiscCore ?? f.lampDiscCore ?? Math.max(1, Math.round(range * 0.4)),
    raw?.lampDiscMid ?? f.lampDiscMid ?? Math.max(1, Math.round(range * 0.7)),
    range,
  );
  const height = Number(raw?.lampHeight ?? f.lampHeight ?? 1.15);
  return {
    lampColor: raw?.lampColor || f.lampColor || "#ffaa48",
    lampFaceColor: raw?.lampFaceColor || f.lampFaceColor || "#ff9030",
    lampRange: discs.range,
    lampDiscCore: discs.core,
    lampDiscMid: discs.mid,
    lampHeight: Math.max(0.2, Math.min(3, Number.isFinite(height) ? height : 1.15)),
    lampShowCore:
      typeof raw?.lampShowCore === "boolean"
        ? raw.lampShowCore
        : typeof f.lampShowCore === "boolean"
          ? f.lampShowCore
          : true,
    lampStrength0: Math.max(
      0,
      Math.min(1, Number(raw?.lampStrength0 ?? f.lampStrength0 ?? 0.62)),
    ),
    lampStrengthFalloff: Math.max(
      0,
      Math.min(1, Number(raw?.lampStrengthFalloff ?? f.lampStrengthFalloff ?? 0.45)),
    ),
    lampTorchFlicker:
      typeof raw?.lampTorchFlicker === "boolean"
        ? raw.lampTorchFlicker
        : typeof f.lampTorchFlicker === "boolean"
          ? f.lampTorchFlicker
          : true,
  };
}

export function lampParamsFromSource(
  src: Pick<EmberLightSource, keyof EmberLampParams> | EmberLampParams,
): EmberLampParams {
  return normalizeLampParams(src);
}

export function applyLampParamsToSource(
  source: EmberLightSource,
  params: EmberLampParams,
): EmberLightSource {
  const p = normalizeLampParams(params);
  return {
    ...source,
    ...p,
    enabled: source.enabled !== false,
  };
}

export function normalizeLightPreset(
  raw: Partial<EmberLightPreset> & { id?: string },
): EmberLightPreset | null {
  if (!raw?.id || typeof raw.id !== "string") return null;
  const params = normalizeLampParams(raw);
  return {
    id: raw.id,
    nameRu: (raw.nameRu || raw.id).trim() || raw.id,
    ...params,
  };
}

export function lightsFileFromPresets(
  presets: Record<string, EmberLightPreset>,
): EmberLightsFile {
  return {
    presets: Object.values(presets).sort((a, b) =>
      a.nameRu.localeCompare(b.nameRu, "ru"),
    ),
  };
}

export function presetsFromLightsFile(
  file: EmberLightsFile | null | undefined,
): Record<string, EmberLightPreset> {
  const out: Record<string, EmberLightPreset> = {};
  for (const raw of file?.presets ?? []) {
    const p = normalizeLightPreset(raw);
    if (p) out[p.id] = p;
  }
  return out;
}

export function newLightPresetId(): string {
  return `lamp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
