/**
 * Own 6-face point-shadow bake into a 4×2 cache tile, plus atlas bind.
 *
 * Color pass keeps every PointLight as fill (`castShadow` false) so MeshToon
 * stays at `NUM_POINT_LIGHT_SHADOWS = 0`. Bake writes MeshDistanceMaterial
 * itself: borrowing WebGLShadowMap compiles a distance program per unique
 * toon material and freezes the load overlay on large maps.
 *
 * See docs/EMBER_AI_HANDOFF.md §9.1.
 */
import * as THREE from "three";
import {
  EMBER_DYNAMIC_ACTOR_LAYER,
  STATIC_POINT_SHADOW_REACH_MULTIPLIER,
  pointLightShadowReach,
} from "./dynamicShadowPolicy";
import {
  POINT_SHADOW_CUBE_FACE_VIEWPORTS,
  POINT_SHADOW_SHADER_SLOTS,
  assignPointShadowAtlasSlots,
  pointShadowCubeFacePixelRect,
  pointShadowInfluenceScore,
  pointShadowSlotUv,
  type PointShadowSlotCandidate,
} from "./pointShadowAtlas";
import {
  PointShadowAtlasGpu,
  pointShadowDynamicCacheId,
  pointShadowLightCacheId,
} from "./pointShadowAtlasGpu";
import {
  setEmberPointShadowAtlas,
  type EmberPointShadowAtlasSlot,
} from "./voxelLightSnap";

type DistanceMaterialProps = { light?: THREE.Light };

function bindDistanceMaterialLight(
  renderer: THREE.WebGLRenderer,
  material: THREE.Material,
  light: THREE.Light,
): void {
  const props = (
    renderer as unknown as {
      properties: { get: (object: object) => DistanceMaterialProps };
    }
  ).properties.get(material);
  props.light = light;
}

type HiddenMesh = { object: THREE.Object3D; visible: boolean };

type MaterialSwap = {
  object: THREE.Mesh;
  material: THREE.Mesh["material"];
};

const distanceMaterial = new THREE.MeshDistanceMaterial({
  blending: THREE.NoBlending,
  // Same as WebGLShadowMap: FrontSide casters render BackSide into the cube.
  side: THREE.BackSide,
});
const instancedDistanceMaterial = distanceMaterial.clone();

const _lightWorld = new THREE.Vector3();
const _viewport = new THREE.Vector4();
const _clearColor = new THREE.Color();

export function pointShadowAtlasCandidatesFor(
  lights: readonly THREE.PointLight[],
  focus: THREE.Vector3,
): PointShadowSlotCandidate[] {
  const out: PointShadowSlotCandidate[] = [];
  for (let index = 0; index < lights.length; index += 1) {
    const light = lights[index]!;
    light.getWorldPosition(_lightWorld);
    const dx = _lightWorld.x - focus.x;
    const dz = _lightWorld.z - focus.z;
    out.push({
      id: pointShadowLightCacheId(light, index),
      score: pointShadowInfluenceScore(
        Math.hypot(dx, dz),
        Math.max(1, pointLightShadowReach(light)),
      ),
    });
  }
  return out;
}

export function advancePointShadowAtlasSlots(
  previous: readonly (string | null)[],
  lights: readonly THREE.PointLight[],
  focus: THREE.Vector3,
  slotCount: number,
): (string | null)[] {
  return assignPointShadowAtlasSlots(
    previous,
    pointShadowAtlasCandidatesFor(lights, focus),
    slotCount,
  );
}

export type PointShadowAtlasPresentState = {
  slotIds: (string | null)[];
  blitDirty: boolean;
};

/**
 * Shared editor/play present: sticky slots from ground focus, then blit+bind.
 * Orbit look-at is not a focus — pass the actor or spawn/Explore·Q tile.
 */
export function presentPointShadowAtlas(args: {
  gpu: PointShadowAtlasGpu | null;
  lights: readonly THREE.PointLight[];
  focus: THREE.Vector3 | null;
  slotIds: readonly (string | null)[];
  blitDirty: boolean;
  renderer: THREE.WebGLRenderer;
  blitSlotIds?: (
    slotIds: readonly (string | null)[],
  ) => (string | null)[];
}): PointShadowAtlasPresentState {
  if (!args.gpu || args.lights.length === 0 || !args.focus) {
    setEmberPointShadowAtlas({ enabled: false });
    return {
      slotIds: args.slotIds as (string | null)[],
      blitDirty: args.blitDirty,
    };
  }
  const next = advancePointShadowAtlasSlots(
    args.slotIds,
    args.lights,
    args.focus,
    args.gpu.layout.slotCount,
  );
  const slotsChanged = next.some((id, i) => id !== args.slotIds[i]);
  let blitDirty = args.blitDirty;
  if (slotsChanged || blitDirty) {
    const blitIds = args.blitSlotIds ? args.blitSlotIds(next) : next;
    args.gpu.blitSlotsWithRenderer(args.renderer, blitIds);
    blitDirty = false;
  }
  bindPointShadowAtlas({
    gpu: args.gpu,
    slotIds: next,
    lights: args.lights,
  });
  return { slotIds: next, blitDirty };
}

export function hideNonShadowCasterMeshes(scene: THREE.Scene): HiddenMesh[] {
  const hidden: HiddenMesh[] = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    if (object.castShadow) return;
    hidden.push({ object, visible: true });
    object.visible = false;
  });
  return hidden;
}

export function restoreHiddenMeshes(hidden: readonly HiddenMesh[]): void {
  for (const entry of hidden) entry.object.visible = entry.visible;
}

/**
 * One MeshDistanceMaterial for Mesh, a clone for InstancedMesh.
 * `scene.overrideMaterial` is a single program — lantern InstancedMesh then
 * bakes at the instance origin. WebGLShadowMap instead compiles a distance
 * variant per unique toon material and freezes load on large maps.
 */
export function assignPointShadowBakeMaterials(scene: THREE.Scene): () => void {
  const swaps: MaterialSwap[] = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible || !object.castShadow) {
      return;
    }
    swaps.push({ object, material: object.material });
    object.material =
      object instanceof THREE.InstancedMesh
        ? instancedDistanceMaterial
        : distanceMaterial;
  });
  return () => {
    for (const swap of swaps) swap.object.material = swap.material;
  };
}

type SceneBakeSuspend = {
  background: THREE.Scene["background"];
  environment: THREE.Scene["environment"];
  fog: THREE.Scene["fog"];
  overrideMaterial: THREE.Scene["overrideMaterial"];
};

/**
 * `renderer.render` draws `scene.background` into the current viewport.
 * Packed RGBA depth treats that dark clear as an occluder, so the whole
 * lamp radius goes into shadow and PointLight fill disappears.
 */
export function suspendSceneForPointShadowBake(
  scene: THREE.Scene,
): () => void {
  const prev: SceneBakeSuspend = {
    background: scene.background,
    environment: scene.environment,
    fog: scene.fog,
    overrideMaterial: scene.overrideMaterial,
  };
  scene.background = null;
  scene.environment = null;
  scene.fog = null;
  return () => {
    scene.background = prev.background;
    scene.environment = prev.environment;
    scene.fog = prev.fog;
    scene.overrideMaterial = prev.overrideMaterial;
  };
}

/**
 * Own 6-face cube bake into `target`. Leaves `PointLight.castShadow` false
 * so the color pass stays at `NUM_POINT_LIGHT_SHADOWS = 0`.
 */
export function bakePointShadowCacheTile(args: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  light: THREE.PointLight;
  target: THREE.WebGLRenderTarget;
  faceSize: number;
  includeActors: boolean;
}): void {
  const { renderer, scene, light, target } = args;
  const faceSize = Math.max(1, Math.floor(args.faceSize));
  const camera = light.shadow.camera;
  const liveDistance = light.distance;
  const bakeFar = Math.max(
    liveDistance,
    pointLightShadowReach(light) * STATIC_POINT_SHADOW_REACH_MULTIPLIER,
  );
  const prevMapX = light.shadow.mapSize.x;
  const prevMapY = light.shadow.mapSize.y;
  const prevLayerMask = camera.layers.mask;
  const prevTarget = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;
  const prevClearAlpha = renderer.getClearAlpha();
  renderer.getClearColor(_clearColor);
  renderer.getViewport(_viewport);
  const prevScissorTest = renderer.getScissorTest();
  const restoreScene = suspendSceneForPointShadowBake(scene);
  const hidden = hideNonShadowCasterMeshes(scene);
  const restoreBakeMaterials = assignPointShadowBakeMaterials(scene);

  try {
    scene.overrideMaterial = null;
    light.updateWorldMatrix(true, false);
    light.distance = bakeFar;
    light.userData.emberAtlasNear = camera.near;
    light.userData.emberAtlasFar = bakeFar;
    light.shadow.mapSize.set(faceSize, faceSize);
    camera.layers.set(0);
    if (args.includeActors) camera.layers.enable(EMBER_DYNAMIC_ACTOR_LAYER);

    bindDistanceMaterialLight(renderer, distanceMaterial, light);
    bindDistanceMaterialLight(renderer, instancedDistanceMaterial, light);

    renderer.autoClear = false;
    renderer.setScissorTest(false);
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, target.width, target.height);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear();

    for (let face = 0; face < POINT_SHADOW_CUBE_FACE_VIEWPORTS.length; face += 1) {
      const rect = pointShadowCubeFacePixelRect(faceSize, face);
      renderer.setViewport(rect.x, rect.y, rect.width, rect.height);
      light.shadow.updateMatrices(light, face);
      renderer.render(scene, camera);
    }
  } finally {
    restoreBakeMaterials();
    restoreHiddenMeshes(hidden);
    restoreScene();
    light.distance = liveDistance;
    light.shadow.mapSize.set(prevMapX, prevMapY);
    camera.layers.mask = prevLayerMask;
    renderer.setRenderTarget(prevTarget);
    renderer.setViewport(_viewport.x, _viewport.y, _viewport.z, _viewport.w);
    renderer.setClearColor(_clearColor, prevClearAlpha);
    renderer.autoClear = prevAutoClear;
    renderer.setScissorTest(prevScissorTest);
  }
}

export function lightsByPointShadowCacheId(
  lights: readonly THREE.PointLight[],
): Map<string, THREE.PointLight> {
  const map = new Map<string, THREE.PointLight>();
  lights.forEach((light, index) => {
    map.set(pointShadowLightCacheId(light, index), light);
  });
  return map;
}

export function bindPointShadowAtlas(args: {
  gpu: PointShadowAtlasGpu | null;
  slotIds: readonly (string | null)[];
  lights: readonly THREE.PointLight[];
}): void {
  const { gpu, slotIds, lights } = args;
  if (!gpu) {
    setEmberPointShadowAtlas({ enabled: false });
    return;
  }
  const byId = lightsByPointShadowCacheId(lights);
  const layout = gpu.layout;
  const slots: EmberPointShadowAtlasSlot[] = [];
  for (let i = 0; i < POINT_SHADOW_SHADER_SLOTS; i += 1) {
    if (i >= layout.slotCount) {
      slots.push({
        occupied: false,
        scaleX: 1,
        scaleY: 1,
        offsetX: 0,
        offsetY: 0,
        x: 0,
        y: 0,
        z: 0,
        near: 0.5,
        far: 1,
        bias: 0,
        intensity: 1,
      });
      continue;
    }
    const uv = pointShadowSlotUv(layout, i);
    const id = i < slotIds.length ? slotIds[i] : null;
    const light = id ? byId.get(id) : undefined;
    const cached =
      Boolean(id) &&
      (gpu.hasCacheTile(id!) ||
        gpu.hasCacheTile(pointShadowDynamicCacheId(id!)));
    if (!id || !light || !cached) {
      slots.push({
        occupied: false,
        scaleX: uv.scaleX,
        scaleY: uv.scaleY,
        offsetX: uv.offsetX,
        offsetY: uv.offsetY,
        x: 0,
        y: 0,
        z: 0,
        near: 0.5,
        far: 1,
        bias: 0,
        intensity: 1,
      });
      continue;
    }
    light.getWorldPosition(_lightWorld);
    const far =
      typeof light.userData.emberAtlasFar === "number"
        ? light.userData.emberAtlasFar
        : pointLightShadowReach(light) * STATIC_POINT_SHADOW_REACH_MULTIPLIER;
    const near =
      typeof light.userData.emberAtlasNear === "number"
        ? light.userData.emberAtlasNear
        : light.shadow.camera.near;
    slots.push({
      occupied: true,
      scaleX: uv.scaleX,
      scaleY: uv.scaleY,
      offsetX: uv.offsetX,
      offsetY: uv.offsetY,
      x: _lightWorld.x,
      y: _lightWorld.y,
      z: _lightWorld.z,
      near,
      far: Math.max(near + 1e-3, far),
      bias: light.shadow.bias,
      intensity: Math.max(0, Math.min(1, light.shadow.intensity)),
    });
  }
  setEmberPointShadowAtlas({
    enabled: true,
    texture: gpu.ensureAtlas().texture,
    faceSize: layout.faceSize,
    slots,
  });
}
