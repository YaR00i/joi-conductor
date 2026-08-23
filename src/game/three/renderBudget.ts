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

  // Each PointLight shadow is one cube sampler. Reserve eight units for the
  // heaviest Ember surface path, then expose remaining hardware capacity.
  // CPU cost is the real cliff: six cube faces per shadowed point light.
  const samplerLimited = Math.max(0, caps.maxTextures - 8);
  const maxPointShadowsHard = clampInt(
    samplerLimited,
    0,
    MAP_POINT_SHADOWS_MAX,
  );
  // Auto stays conservative (6 in play, 4 in the editor). An explicit map
  // slider may go up to `maxPointShadowsHard` without this profile clamp.
  const maxPointShadows = clampInt(
    samplerLimited,
    0,
    Math.min(
      maxPointShadowsHard,
      profileBudget?.maxPointShadows ?? (mode === "play" ? 6 : 4),
    ),
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
 * Explore maps often author 12 cubes for the editor. Play clamps to the
 * profile so every toon material is not sampling a dozen cube maps.
 */
export function playPointShadowCap(
  budget: EmberRenderBudget,
  profile: EmberPlayProfileBudget,
): number {
  return Math.min(budget.maxPointShadows, profile.maxPointShadows);
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
