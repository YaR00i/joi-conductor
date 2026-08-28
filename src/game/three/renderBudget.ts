import type { WebGLCapabilities } from "three";
import type { EmberMapPlayProfile } from "../content/types";
import {
  MAP_POINT_LIGHTS_MAX,
  MAP_POINT_SHADOWS_MAX,
} from "../tile/lightLimits";

/**
 * Shared GPU budget for Ember's Three.js renderers.
 *
 * Point lights and especially point-light cube shadows are shader-wide: every
 * visible toon/standard material gets arrays for all of them, even when a light
 * is far away. Keeping independent limits for lanterns and emissive props can
 * therefore exceed WebGL uniform/sampler limits and make whole material classes
 * disappear after shader linking fails.
 */
export type EmberRenderBudget = {
  /** Conservative default used when the map leaves the cap on Auto. */
  maxPointLights: number;
  maxPointShadows: number;
  /**
   * GPU/sampler ceiling. An authored slider value clamps here, not to the
   * conservative Auto default (arena/editor otherwise silently keep 6/4 cubes).
   */
  maxPointLightsHard: number;
  maxPointShadowsHard: number;
  pointShadowMapSize: number;
  directionalShadowMapSize: number;
};

export type EmberAuthoredLightBudget = {
  maxPointLights: number | null;
  maxPointShadows: number | null;
};

export type EmberPlayProfileBudget = {
  maxPointLights: number;
  maxPointShadows: number;
  allowHorde: boolean;
  allowNpc: boolean;
  emissiveShadows: boolean;
  maxNpcs: number;
};

export type EmberWebGLBudgetCaps = Pick<
  WebGLCapabilities,
  | "maxFragmentUniforms"
  | "maxTextures"
  | "maxTextureSize"
  | "maxCubemapSize"
>;

const clampInt = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.floor(value)));

export const EXPLORE_NPC_CAP = 24;

export function resolvePlayProfileBudget(
  profile: EmberMapPlayProfile,
): EmberPlayProfileBudget {
  switch (profile) {
    case "arena":
      return {
        maxPointLights: 28,
        maxPointShadows: 6,
        allowHorde: true,
        allowNpc: false,
        emissiveShadows: true,
        maxNpcs: 0,
      };
    case "explore":
      return {
        maxPointLights: 40,
        maxPointShadows: 6,
        allowHorde: false,
        allowNpc: true,
        // Fill lamps stay; cube maps are nearest lanterns only (not windows).
        emissiveShadows: false,
        maxNpcs: EXPLORE_NPC_CAP,
      };
    default: {
      const _never: never = profile;
      return _never;
    }
  }
}

export function resolveEmberRenderBudget(
  caps: EmberWebGLBudgetCaps,
  mode: "play" | "editor",
  profile: EmberMapPlayProfile = "arena",
): EmberRenderBudget {
  const profileBudget =
    mode === "play" ? resolvePlayProfileBudget(profile) : null;
  // A PointLight consumes roughly four fragment uniform vectors in Three.js.
  // Reserve a generous block for materials, fog, grading and the other lights.
  const uniformLimited = Math.floor(
    (Math.max(0, caps.maxFragmentUniforms) - 96) / 4,
  );
  const maxPointLightsHard = clampInt(uniformLimited, 8, MAP_POINT_LIGHTS_MAX);
  const maxPointLights = clampInt(
    uniformLimited,
    8,
    Math.min(
      maxPointLightsHard,
      profileBudget?.maxPointLights ?? (mode === "play" ? 28 : 24),
    ),
  );

  // Atlas umbras use one 2D sampler, not one cube sampler per lamp. Bake-cache
  // size is the authored cap (up to MAP_POINT_SHADOWS_MAX). Shader loop stays K=8.
  const maxPointShadowsHard = MAP_POINT_SHADOWS_MAX;
  // Auto stays conservative (6 in play, 4 in the editor). An explicit map
  // slider may go up to `maxPointShadowsHard`.
  const maxPointShadows = clampInt(
    profileBudget?.maxPointShadows ?? (mode === "play" ? 6 : 4),
    0,
    maxPointShadowsHard,
  );

  const cubeLimit = Math.max(128, caps.maxCubemapSize || 128);
  const textureLimit = Math.max(128, caps.maxTextureSize || 128);
  // One cached map-wide sun atlas. 1024 is the pre-cascade size; point cubes
  // stay at 256 because each is six scene passes.
  const pointShadowMapSize = Math.min(256, cubeLimit);
  const directionalShadowMapSize = Math.min(1024, textureLimit);

  return {
    maxPointLights,
    maxPointShadows,
    maxPointLightsHard,
    maxPointShadowsHard,
    pointShadowMapSize,
    directionalShadowMapSize,
  };
}

/** Authored lamps consume slots first; emissive props receive the true remainder. */
export function lanternShadowShare(budget: EmberRenderBudget): number {
  return budget.maxPointShadows;
}

/**
 * Apply map-authored on-screen light/shadow caps on top of the GPU budget.
 * `null` means “use the hardware/profile default”.
 */
export function applyMapLightBudget(
  hardware: EmberRenderBudget,
  authored: EmberAuthoredLightBudget,
): EmberRenderBudget {
  return {
    ...hardware,
    maxPointLights:
      authored.maxPointLights == null
        ? hardware.maxPointLights
        : clampInt(authored.maxPointLights, 1, hardware.maxPointLightsHard),
    maxPointShadows:
      authored.maxPointShadows == null
        ? hardware.maxPointShadows
        : clampInt(authored.maxPointShadows, 0, hardware.maxPointShadowsHard),
  };
}

/**
 * Atlas bake-cache cap for play. Shader slot count stays
 * `POINT_SHADOW_SHADER_SLOTS`; this is not a cube-sampler count.
 */
export function playPointShadowCap(
  budget: EmberRenderBudget,
  _profile: EmberPlayProfileBudget,
): number {
  return budget.maxPointShadows;
}

/** Cube slots left for emissive voxel/sprite lamps after authored lanterns. */
export function remainingEmissiveShadowSlots(
  cubeCap: number,
  lanternCubes: number,
): number {
  return Math.max(0, Math.floor(cubeCap) - Math.max(0, Math.floor(lanternCubes)));
}

/** How many lantern PointLights to spawn before emissive fill takes the rest. */
export function lanternVisibleShare(
  budget: EmberRenderBudget,
  opts: { authoredLights: boolean; explore: boolean },
): number {
  if (opts.authoredLights) return budget.maxPointLights;
  if (opts.explore) return Math.ceil(budget.maxPointLights * 0.7);
  return Math.ceil(budget.maxPointLights / 2);
}
