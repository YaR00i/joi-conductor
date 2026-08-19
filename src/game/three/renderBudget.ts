import type { WebGLCapabilities } from "three";

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
  maxPointLights: number;
  maxPointShadows: number;
  pointShadowMapSize: number;
  directionalShadowMapSize: number;
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

export function resolveEmberRenderBudget(
  caps: EmberWebGLBudgetCaps,
  mode: "play" | "editor",
): EmberRenderBudget {
  // A PointLight consumes roughly four fragment uniform vectors in Three.js.
  // Reserve a generous block for materials, fog, grading and the other lights.
  const uniformLimited = Math.floor(
    (Math.max(0, caps.maxFragmentUniforms) - 96) / 4,
  );
  const maxPointLights = clampInt(uniformLimited, 8, mode === "play" ? 28 : 24);

  // Each PointLight shadow is a cube sampler. Complex Ember materials may also
  // bind albedo, emissive, roughness, gradient, env, planar reflection and the
  // directional shadow. Leave those slots free instead of relying on the
  // theoretical maximum texture-unit count.
  const samplerLimited = Math.max(0, caps.maxTextures - 12);
  const maxPointShadows = clampInt(
    samplerLimited,
    0,
    mode === "play" ? 6 : 4,
  );

  const cubeLimit = Math.max(128, caps.maxCubemapSize || 128);
  const textureLimit = Math.max(128, caps.maxTextureSize || 128);
  const pointShadowMapSize = Math.min(512, cubeLimit);
  const directionalShadowMapSize = Math.min(
    mode === "play" ? 1024 : 512,
    textureLimit,
  );

  return {
    maxPointLights,
    maxPointShadows,
    pointShadowMapSize,
    directionalShadowMapSize,
  };
}

/** Split scarce cube-shadow slots between authored lamps and emissive props. */
export function lanternShadowShare(budget: EmberRenderBudget): number {
  return Math.min(2, budget.maxPointShadows);
}
