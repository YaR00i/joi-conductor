import * as THREE from "three";

/**
 * Layer 0 is the authored/static world. Runtime actors live on a separate
 * camera-visible layer so static point-light shadow bakes can omit them.
 */
export const EMBER_DYNAMIC_ACTOR_LAYER = 1;

/** Covers the maximum 1.28 torch wobble with a little safety margin. */
export const STATIC_POINT_SHADOW_REACH_MULTIPLIER = 1.5;

/**
 * Layer 0 is the authored/static world. Runtime actors live on a separate
 * camera-visible layer so static shadow bakes can omit them.
 *
 * Sun/moon: one map-wide DirectionalLight ortho, baked with layer 0 and never
 * fitted to the player. Follow-cascades clipped casters behind the camera and
 * rebuilt umbra edges while walking. Local PointLights add light on top of
 * that baked umbra (toon shading is additive per light).
 *
 * Official Three.js CSM is not used: it injects global shader chunks that
 * fight Ember's toon/voxel-snap patches.
 */
export const DYNAMIC_DIR_SHADOW_HALF_MIN = 64;
export const DYNAMIC_DIR_SHADOW_HALF_MAX = 120;
export const DYNAMIC_DIR_SHADOW_FOLLOW_SCALE = 0.75;
/** Shift the near/mid ortho center this fraction of `half` along ground look. */
export const DYNAMIC_DIR_SHADOW_FORWARD_BIAS = 0.6;
export const DIR_SHADOW_MID_SCALE = 2.5;
export const DIR_SHADOW_FAR_SCALE = 5.5;
/**
 * Follow-volume snap must be coarser than a gameplay step. Player speed is
 * often >1 world unit/frame, so a 1-voxel snap rebuilds the 256 map every
 * frame and umbra edges crawl.
 */
export const DIR_SHADOW_SNAP_MIN = 16;
/** Quantize camera-forward bias so orbiting doesn't slide the volume. */
export const DIR_SHADOW_LOOK_YAW_STEPS = 16;
/** Keep the previous yaw until look crosses this fraction of a step. */
export const DIR_SHADOW_LOOK_STICK = 0.65;
/** Depth slack in clip space. Tiny values leave acne on greedy-meshed floors. */
export const DIR_SHADOW_DEPTH_BIAS = -0.0008;
/**
 * World offset toward the sun (Three normalBias is reused as that length).
 * Along-surface-normal offset with an angled key light walks the probe into
 * neighboring voxels and stripes the ground.
 */
export const DIR_SHADOW_NORMAL_BIAS = 0.1;
/** Extra PointLight cube updates per frame (6 faces each). Keep this at 1. */
export const DYNAMIC_LOCAL_SHADOW_MAX_LIGHTS = 1;
/** Above this crowd size, actor-aware point cubes cost more than they add. */
export const DYNAMIC_LOCAL_SHADOW_CROWD_CUTOFF = 160;

export function dynamicLocalShadowLimitForCrowd(
  requested: number,
  crowdSize: number,
): number {
  if (crowdSize >= DYNAMIC_LOCAL_SHADOW_CROWD_CUTOFF) return 0;
  return Math.max(
    0,
    Math.min(DYNAMIC_LOCAL_SHADOW_MAX_LIGHTS, Math.floor(requested)),
  );
}

const _lightX = new THREE.Vector3();
const _lightY = new THREE.Vector3();
const _lightZ = new THREE.Vector3();
const _worldUp = new THREE.Vector3();
const _snappedFocus = new THREE.Vector3();
const _sunDir = new THREE.Vector3();
const _desiredLightPos = new THREE.Vector3();
const _followFocus = new THREE.Vector3();
const _groundLook = new THREE.Vector3();
const _lightWorld = new THREE.Vector3();
const _viewProjection = new THREE.Matrix4();
const _cameraFrustum = new THREE.Frustum();
const _lightSphere = new THREE.Sphere();

function groundDistanceToSquared(a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export function directionalShadowHalfExtent(followDist: number): number {
  return Math.min(
    DYNAMIC_DIR_SHADOW_HALF_MAX,
    Math.max(
      DYNAMIC_DIR_SHADOW_HALF_MIN,
      followDist * DYNAMIC_DIR_SHADOW_FOLLOW_SCALE,
    ),
  );
}

export function directionalShadowLightDistance(halfExtent: number): number {
  return Math.max(80, halfExtent * 2.2);
}

export function mapWideDirectionalHalf(span: number): number {
  return Math.max(40, span * 0.52 + 16);
}

export type DirShadowCascadeHalves = {
  near: number;
  mid: number;
  far: number;
};

export function directionalCascadeHalves(
  followDist: number,
  mapSpan: number,
): DirShadowCascadeHalves {
  const near = directionalShadowHalfExtent(followDist);
  return {
    near,
    mid: near * DIR_SHADOW_MID_SCALE,
    far: Math.max(mapWideDirectionalHalf(mapSpan), near * DIR_SHADOW_FAR_SCALE),
  };
}

export function configureDirectionalShadowMap(
  light: THREE.DirectionalLight,
  mapSize: number,
): void {
  light.castShadow = true;
  const res = Math.max(128, Math.min(1024, Math.floor(mapSize)));
  light.shadow.mapSize.set(res, res);
  applyDirectionalShadowBias(light);
  light.shadow.autoUpdate = false;
}

export function applyDirectionalShadowBias(light: THREE.DirectionalLight): void {
  light.shadow.bias = DIR_SHADOW_DEPTH_BIAS;
  light.shadow.normalBias = DIR_SHADOW_NORMAL_BIAS;
  light.shadow.radius = 0;
}

/**
 * One cached sun/moon map. No extra intensity-0 cascade lights: those were
 * sampled as a tight follow volume and dropped umbras from off-camera casters.
 */
export function configureCachedSunShadow(
  key: THREE.DirectionalLight,
  mapSize: number,
): void {
  configureDirectionalShadowMap(key, mapSize);
  key.userData.emberDirCascade = 0;
}

export type DirectionalShadowFollow = {
  halfExtent: number;
  lightDistance: number;
  mapSize: number;
  /** Camera look; Y is ignored so the volume slides on the ground plane. */
  lookDir?: THREE.Vector3;
  forwardBias?: number;
  /** Snap steps are at least one voxel so 256 maps match the art. */
  voxelSize?: number;
  /** Override DIR_SHADOW_SNAP_MIN; 0 keeps the raw shadow-texel grid. */
  snapMin?: number;
};

export type StickyLookState = { yaw: number | null };

function wrapPi(angle: number): number {
  let yaw = angle;
  while (yaw > Math.PI) yaw -= Math.PI * 2;
  while (yaw < -Math.PI) yaw += Math.PI * 2;
  return yaw;
}

/**
 * Stick camera-forward bias to coarse yaw steps with hysteresis so orbiting
 * does not rebuild the directional map every frame.
 */
export function snapStickyGroundLookDir(
  lookDir: THREE.Vector3,
  state: StickyLookState,
  out: THREE.Vector3,
  steps = DIR_SHADOW_LOOK_YAW_STEPS,
): THREE.Vector3 {
  out.copy(lookDir);
  out.y = 0;
  if (out.lengthSq() < 1e-8) {
    out.set(0, 0, 1);
    return out;
  }
  const yaw = Math.atan2(out.x, out.z);
  const step = (Math.PI * 2) / Math.max(1, steps);
  if (state.yaw != null) {
    const delta = wrapPi(yaw - state.yaw);
    if (Math.abs(delta) < step * DIR_SHADOW_LOOK_STICK) {
      out.set(Math.sin(state.yaw), 0, Math.cos(state.yaw));
      return out;
    }
  }
  const snapped = Math.round(yaw / step) * step;
  state.yaw = snapped;
  out.set(Math.sin(snapped), 0, Math.cos(snapped));
  return out;
}

/**
 * Quantize a world-space focus to the shadow map's texel grid in light space.
 * Sub-texel camera/player motion then keeps the same projection, which stops
 * hard cartoon umbras from shimmering (Witness / Valient stable CSM trick).
 */
export function snapShadowFocusToTexel(
  focus: THREE.Vector3,
  sunDirTowardSun: THREE.Vector3,
  halfExtent: number,
  mapSize: number,
  out = new THREE.Vector3(),
  voxelSize = 0,
  snapMin = 0,
): THREE.Vector3 {
  _lightZ.copy(sunDirTowardSun);
  if (_lightZ.lengthSq() < 1e-10) _lightZ.set(0, 1, 0);
  else _lightZ.normalize();
  if (Math.abs(_lightZ.y) > 0.9) _worldUp.set(0, 0, 1);
  else _worldUp.set(0, 1, 0);
  _lightX.crossVectors(_worldUp, _lightZ);
  if (_lightX.lengthSq() < 1e-10) _lightX.set(1, 0, 0);
  else _lightX.normalize();
  _lightY.crossVectors(_lightZ, _lightX).normalize();

  const texel = Math.max(
    snapMin,
    voxelSize,
    (Math.max(1, halfExtent) * 2) / Math.max(1, mapSize),
  );
  const localX = Math.round(focus.dot(_lightX) / texel) * texel;
  const localY = Math.round(focus.dot(_lightY) / texel) * texel;
  const localZ = focus.dot(_lightZ);
  return out
    .copy(_lightX)
    .multiplyScalar(localX)
    .addScaledVector(_lightY, localY)
    .addScaledVector(_lightZ, localZ);
}

/**
 * Keep the key DirectionalLight pointed at `focus` with a tight ortho volume.
 * Returns true when the light pose actually moved, so the caller can refresh
 * only the directional map.
 */
export function fitDirectionalShadowToFocus(
  light: THREE.DirectionalLight,
  focus: THREE.Vector3,
  sunDirTowardSun: THREE.Vector3,
  opts: DirectionalShadowFollow,
): boolean {
  const half = Math.max(1, opts.halfExtent);
  const dist = Math.max(half + 8, opts.lightDistance);
  _sunDir.copy(sunDirTowardSun);
  if (_sunDir.lengthSq() < 1e-10) _sunDir.set(0, 1, 0);
  else _sunDir.normalize();
  _followFocus.copy(focus);
  if (opts.lookDir) {
    _groundLook.copy(opts.lookDir);
    _groundLook.y = 0;
    if (_groundLook.lengthSq() > 1e-8) {
      _groundLook.normalize();
      const bias = opts.forwardBias ?? DYNAMIC_DIR_SHADOW_FORWARD_BIAS;
      _followFocus.addScaledVector(_groundLook, half * bias);
    }
  }
  snapShadowFocusToTexel(
    _followFocus,
    _sunDir,
    half,
    opts.mapSize,
    _snappedFocus,
    opts.voxelSize ?? 0,
    opts.snapMin ?? DIR_SHADOW_SNAP_MIN,
  );
  _desiredLightPos.copy(_snappedFocus).addScaledVector(_sunDir, dist);

  const cam = light.shadow.camera;
  const moved =
    light.target.position.distanceToSquared(_snappedFocus) > 1e-8 ||
    light.position.distanceToSquared(_desiredLightPos) > 1e-8 ||
    Math.abs(cam.right - half) > 1e-4 ||
    Math.abs(cam.left + half) > 1e-4;

  if (!moved) return false;

  light.target.position.copy(_snappedFocus);
  light.position.copy(_desiredLightPos);
  light.target.updateMatrixWorld();
  light.updateMatrixWorld();

  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.near = Math.max(0.5, dist * 0.15);
  cam.far = Math.max(120, dist + half * 1.35);
  cam.updateProjectionMatrix();
  return true;
}

export function setObjectRenderLayer(
  root: THREE.Object3D,
  layer: number,
): void {
  root.traverse((object) => object.layers.set(layer));
}

/** Point-light cube shadows are static in play and update only on invalidation. */
export function cachePointLightShadows(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.PointLight) || !object.castShadow) return;
    object.shadow.autoUpdate = false;
    object.shadow.needsUpdate = true;
    count += 1;
  });
  return count;
}

/** Mark cached point-light maps dirty after terrain/prop/light changes. */
export function invalidatePointLightShadows(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.PointLight) || !object.castShadow) return;
    object.shadow.autoUpdate = false;
    object.shadow.needsUpdate = true;
    count += 1;
  });
  return count;
}

export type StaticPointShadowBake = {
  count: number;
  /** Restore live light cutoffs while preserving the baked shadow camera far. */
  restore: () => void;
};

function authoredPointLightDistance(light: THREE.PointLight): number {
  const lamp = light.userData.emberLamp as { distance?: number } | undefined;
  const emissive = light.userData.emberEmissive as
    | { baseDistance?: number }
    | undefined;
  return Math.max(
    0,
    lamp?.distance ?? emissive?.baseDistance ?? light.distance,
  );
}

export function pointLightShadowReach(light: THREE.PointLight): number {
  return authoredPointLightDistance(light);
}

export function pointLightRequestsShadow(light: THREE.PointLight): boolean {
  return (
    light.castShadow || light.userData.emberShadowRequested === true
  );
}

/** Bake-cache grant. Never PointLight.castShadow after the atlas migration. */
export function setPointLightShadowGranted(
  light: THREE.PointLight,
  granted: boolean,
): void {
  light.userData.emberShadowGranted = granted;
  light.castShadow = false;
}

export function pointLightHasGrantedShadow(light: THREE.PointLight): boolean {
  return light.userData.emberShadowGranted === true;
}

/**
 * Lights that received a bake-cache slot after spawn.
 *
 * `emberShadowRequested` stays true on over-budget fill lamps (windows,
 * extra lanterns) so debug/UI still show intent. The atlas bank registers
 * only granted lights; PointLight.castShadow stays false.
 */
export function grantedPointShadowLights(
  lights: readonly THREE.PointLight[],
): THREE.PointLight[] {
  return lights.filter(pointLightHasGrantedShadow);
}

export function pointLightAffectsPoint(
  light: THREE.PointLight,
  point: THREE.Vector3,
  scale = 1,
): boolean {
  light.getWorldPosition(_lightWorld);
  const reach = authoredPointLightDistance(light) * Math.max(0, scale);
  return reach > 0 && _lightWorld.distanceToSquared(point) <= reach * reach;
}

/**
 * Rank shadow-requesting lights around the player. Play no longer uses this to
 * drop baked cubes: every candidate stays sampled so the shader define stays
 * stable. Kept for tests and any editor preview that still wants a nearby set.
 */
export function pickPointShadowSlotLights(
  lights: readonly THREE.PointLight[],
  focus: THREE.Vector3,
  dynamicLights: readonly THREE.PointLight[],
  maxLights: number,
): THREE.PointLight[] {
  const limit = Math.max(0, Math.floor(maxLights));
  if (limit === 0) return [];
  const eligible = lights.filter(
    (light) => light.visible && pointLightRequestsShadow(light),
  );
  const eligibleSet = new Set(eligible);
  const picked = dynamicLights.filter(
    (light, index) =>
      eligibleSet.has(light) && dynamicLights.indexOf(light) === index,
  );
  const dynamicSet = new Set(picked);
  const ranked = eligible
    .filter((light) => !dynamicSet.has(light))
    .map((light) => {
      light.getWorldPosition(_lightWorld);
      const reach = Math.max(1, authoredPointLightDistance(light));
      return {
        light,
        score:
          Math.sqrt(groundDistanceToSquared(_lightWorld, focus)) / reach -
          (light.castShadow ? 0.12 : 0),
      };
    })
    .sort((a, b) => a.score - b.score);
  return [
    ...picked,
    ...ranked.map((entry) => entry.light),
  ].slice(0, limit);
}

export function collectShadowedPointLights(
  root: THREE.Object3D,
): THREE.PointLight[] {
  const lights: THREE.PointLight[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.PointLight && object.castShadow) {
      lights.push(object);
    }
  });
  return lights;
}

export type DynamicPointShadowPickOptions = {
  maxLights?: number;
  /** Current dynamic lights receive the wider exit radius and a small bias. */
  previous?: readonly THREE.PointLight[];
  enterScale?: number;
  exitScale?: number;
  /** Visible enemies/NPCs can nominate a lamp in addition to the player. */
  actorFocuses?: readonly THREE.Vector3[];
  /** Off-screen secondary actor focuses do not consume dynamic cubes. */
  camera?: THREE.Camera;
};

/**
 * Pick actor-aware cubes while retaining every other PointLight's static bake.
 *
 * A new lamp enters inside `enterScale`; an already-selected lamp remains
 * active until `exitScale`. This hysteresis prevents two overlapping lamps
 * from swapping six-face cube renders at their shared boundary.
 */
export function pickDynamicPointShadowLightsFrom(
  lights: readonly THREE.PointLight[],
  focus: THREE.Vector3,
  opts: DynamicPointShadowPickOptions = {},
): THREE.PointLight[] {
  const previous = opts.previous ?? [];
  const enterScale = Math.max(0.05, opts.enterScale ?? 0.8);
  const exitScale = Math.max(enterScale, opts.exitScale ?? 1);
  const camera = opts.camera;
  if (camera) {
    camera.updateMatrixWorld();
    _viewProjection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    _cameraFrustum.setFromProjectionMatrix(_viewProjection);
  }

  const ranked: Array<{ light: THREE.PointLight; score: number }> = [];
  for (const light of lights) {
    if (!pointLightRequestsShadow(light) || !light.visible) continue;
    light.getWorldPosition(_lightWorld);
    const reach = authoredPointLightDistance(light);
    if (reach <= 0) continue;
    const retained = previous.includes(light);
    const activationReach = reach * (retained ? exitScale : enterScale);
    const activationReachSq = activationReach * activationReach;
    let score = Number.POSITIVE_INFINITY;
    const playerDistSq = _lightWorld.distanceToSquared(focus);
    if (playerDistSq <= activationReachSq) {
      score = Math.sqrt(playerDistSq) / reach;
    }
    // Ground proximity remains a secondary path for tall street lamps whose
    // visible pool reaches the actor near the edge of the strict 3D sphere.
    const playerGroundDistSq = groundDistanceToSquared(_lightWorld, focus);
    if (playerGroundDistSq <= activationReachSq) {
      score = Math.min(score, 0.75 + Math.sqrt(playerGroundDistSq) / reach);
    }
    for (const actorFocus of opts.actorFocuses ?? []) {
      if (camera && !_cameraFrustum.containsPoint(actorFocus)) continue;
      const actorDistSq = _lightWorld.distanceToSquared(actorFocus);
      if (actorDistSq > activationReachSq) continue;
      score = Math.min(score, Math.sqrt(actorDistSq) / reach + 0.25);
    }
    if (!Number.isFinite(score) && camera) {
      _lightSphere.center.copy(_lightWorld);
      _lightSphere.radius = reach * exitScale;
      if (_cameraFrustum.intersectsSphere(_lightSphere)) {
        const cameraDist = Math.sqrt(
          groundDistanceToSquared(_lightWorld, focus),
        );
        score = 2 + cameraDist / reach;
      }
    }
    if (!Number.isFinite(score)) continue;
    ranked.push({ light, score: score - (retained ? 0.08 : 0) });
  }
  ranked.sort((a, b) => a.score - b.score);
  const limit = Math.max(
    0,
    Math.floor(opts.maxLights ?? DYNAMIC_LOCAL_SHADOW_MAX_LIGHTS),
  );
  return ranked.slice(0, limit).map((entry) => entry.light);
}

/**
 * Recook keep-out: a caster closer than this clips the cube near plane
 * and black-out faces (player hugging a voxel lantern).
 */
export function pointShadowRecookKeepOut(
  light: THREE.PointLight,
  actorRadius: number,
): number {
  const near =
    Number.isFinite(light.shadow.camera.near) && light.shadow.camera.near > 0
      ? light.shadow.camera.near
      : 0.1;
  const radius = Number.isFinite(actorRadius) ? Math.max(0, actorRadius) : 0;
  return Math.max(near * 16, radius * 6, 12);
}

export function pointLightActorRecookBlocked(
  light: THREE.PointLight,
  playerPos: THREE.Vector3,
  playerRadius: number,
  extraActors: readonly THREE.Vector3[] = [],
): boolean {
  light.getWorldPosition(_lightWorld);
  const keepOutSq =
    pointShadowRecookKeepOut(light, playerRadius) ** 2;
  if (_lightWorld.distanceToSquared(playerPos) < keepOutSq) return true;
  for (const actorPos of extraActors) {
    if (_lightWorld.distanceToSquared(actorPos) < keepOutSq) return true;
  }
  return false;
}

/** Backwards-compatible scene-root helper used by focused tests/tools. */
export function pickDynamicPointShadowLights(
  root: THREE.Object3D,
  focus: THREE.Vector3,
  maxLights = DYNAMIC_LOCAL_SHADOW_MAX_LIGHTS,
): THREE.PointLight[] {
  return pickDynamicPointShadowLightsFrom(
    collectShadowedPointLights(root),
    focus,
    { maxLights },
  );
}

export function beginPointShadowBake(
  lights: readonly THREE.PointLight[],
  reachMultiplier = STATIC_POINT_SHADOW_REACH_MULTIPLIER,
): StaticPointShadowBake {
  const states: Array<{ light: THREE.PointLight; liveDistance: number }> = [];
  const multiplier = Math.max(1, reachMultiplier);
  for (const light of lights) {
    if (!light.castShadow) continue;
    const liveDistance = light.distance;
    const bakeDistance = Math.max(
      liveDistance,
      authoredPointLightDistance(light) * multiplier,
    );
    states.push({ light, liveDistance });
    light.distance = bakeDistance;
    light.shadow.camera.far = bakeDistance;
    light.shadow.camera.updateProjectionMatrix();
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true;
  }
  return {
    count: states.length,
    restore: () => {
      for (const state of states) {
        // Deliberately do not update shadow.camera here: it must keep the far
        // value used to encode the cached cube-depth texture.
        state.light.distance = state.liveDistance;
      }
    },
  };
}

/**
 * Prepare complete static PointLight cube maps.
 *
 * Three.js overwrites PointLightShadow.camera.far from PointLight.distance in
 * PointLightShadow.updateMatrices(). Merely assigning camera.far before a
 * render therefore has no effect. We temporarily widen the actual light
 * cutoff for the bake, then restore the live/flickering cutoff without
 * touching the camera matrices or the baked depth texture.
 */
export function beginStaticPointShadowBake(
  root: THREE.Object3D,
  reachMultiplier = STATIC_POINT_SHADOW_REACH_MULTIPLIER,
): StaticPointShadowBake {
  return beginPointShadowBake(
    collectShadowedPointLights(root),
    reachMultiplier,
  );
}
