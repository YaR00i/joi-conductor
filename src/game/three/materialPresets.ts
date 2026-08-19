/**
 * Material presets: how surfaces receive lantern / key light.
 * Procedural art still uses the same id in tileTextures.
 */
import type { EmberMaterialKind } from "../content/types";

export const EMBER_MATERIAL_KINDS: readonly EmberMaterialKind[] = [
  "stone",
  "wood",
  "path",
  "grass",
  "metal",
  "cloth",
] as const;

export const EMBER_MATERIAL_LABELS_RU: Record<EmberMaterialKind, string> = {
  stone: "Камень",
  wood: "Дерево",
  path: "Тропа",
  grass: "Трава",
  metal: "Металл",
  cloth: "Ткань",
};

/** Lighting / shading response for a material kind. */
export type EmberMaterialResponse = {
  /** MeshToon direct lamp multiplier (voxel props use the same idea). */
  directLightScale: number;
  /** Base metalness when using Standard / as shine bias. */
  metalness: number;
  /** Base roughness (1 = matte). */
  roughness: number;
  /** Env reflection strength on Standard mats. */
  envMapIntensity: number;
  /** Cel bands: fewer = chunkier, more = softer. */
  toonSteps: 3 | 4 | 5;
  /**
   * Prefer MeshStandard even without painted shine
   * (metal / wet cloth sheen).
   */
  forceStandard: boolean;
};

const PRESETS: Record<EmberMaterialKind, EmberMaterialResponse> = {
  stone: {
    directLightScale: 0.58,
    metalness: 0.04,
    roughness: 0.88,
    envMapIntensity: 0.18,
    toonSteps: 4,
    forceStandard: false,
  },
  wood: {
    directLightScale: 0.5,
    metalness: 0,
    roughness: 0.82,
    envMapIntensity: 0.12,
    toonSteps: 4,
    forceStandard: false,
  },
  path: {
    directLightScale: 0.52,
    metalness: 0.02,
    roughness: 0.86,
    envMapIntensity: 0.14,
    toonSteps: 4,
    forceStandard: false,
  },
  grass: {
    directLightScale: 0.4,
    metalness: 0,
    roughness: 0.92,
    envMapIntensity: 0.06,
    toonSteps: 3,
    forceStandard: false,
  },
  metal: {
    directLightScale: 0.88,
    metalness: 0.82,
    roughness: 0.28,
    envMapIntensity: 1.05,
    toonSteps: 4,
    forceStandard: true,
  },
  cloth: {
    directLightScale: 0.26,
    metalness: 0,
    roughness: 0.97,
    envMapIntensity: 0.04,
    toonSteps: 3,
    forceStandard: false,
  },
};

export function normalizeEmberMaterial(
  raw: unknown,
): EmberMaterialKind | undefined {
  if (typeof raw !== "string") return undefined;
  return (EMBER_MATERIAL_KINDS as readonly string[]).includes(raw)
    ? (raw as EmberMaterialKind)
    : undefined;
}

/** Resolve preset; unknown / unset → stone-like neutral. */
export function resolveMaterialResponse(
  kind: EmberMaterialKind | undefined | null,
): EmberMaterialResponse {
  if (kind && PRESETS[kind]) return PRESETS[kind];
  return PRESETS.stone;
}

/** Infer kind from legacy tile name when `material` is unset. */
export function inferMaterialFromTileName(
  name: string | undefined,
): EmberMaterialKind | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase();
  if (n.includes("metal") || n.includes("iron") || n.includes("steel")) {
    return "metal";
  }
  if (n.includes("cloth") || n.includes("fabric") || n.includes("curtain")) {
    return "cloth";
  }
  if (n.includes("grass")) return "grass";
  if (n.includes("path") || n.includes("dirt") || n.includes("sand")) {
    return "path";
  }
  if (n.includes("wood") || n.includes("plank") || n.includes("crate")) {
    return "wood";
  }
  if (n.includes("stone") || n.includes("wall") || n.includes("brick")) {
    return "stone";
  }
  return undefined;
}

export function resolveTileMaterialKind(tile: {
  material?: EmberMaterialKind;
  name?: string;
}): EmberMaterialKind {
  return (
    normalizeEmberMaterial(tile.material) ??
    inferMaterialFromTileName(tile.name) ??
    "stone"
  );
}

/** Neutral catch when no material is set (legacy look ≈ full lamp). */
export const NEUTRAL_MATERIAL_RESPONSE: EmberMaterialResponse = {
  directLightScale: 1,
  metalness: 0.04,
  roughness: 0.9,
  envMapIntensity: 0.2,
  toonSteps: 4,
  forceStandard: false,
};

/**
 * Lighting response for a tile: explicit/inferred kind, else neutral
 * (avoids darkening every unnamed tile to “stone”).
 */
export function resolveTileMaterialResponse(tile: {
  material?: EmberMaterialKind;
  name?: string;
}): EmberMaterialResponse {
  const kind =
    normalizeEmberMaterial(tile.material) ??
    inferMaterialFromTileName(tile.name);
  return kind ? resolveMaterialResponse(kind) : NEUTRAL_MATERIAL_RESPONSE;
}
