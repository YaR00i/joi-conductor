/**
 * Pixelated planar reflection for Ember water + wet/metal floors.
 * Renders the scene from a mirrored camera into a low-res NearestFilter RT.
 * Materials must keep stable uniform object identity — we only write
 * `.value` so onBeforeCompile bindings stay live.
 */
import * as THREE from "three";
import {
  materialHasPlanarReflect,
  materialPlanarUniforms,
} from "./planarReflectMaterial";

export type WaterPlanarReflection = {
  /** Call once per frame before the main/post render. */
  render: (
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) => void;
  /** Wire RT + matrix into water / planar-shine materials. */
  bindMaterials: (mats: readonly THREE.Material[]) => void;
  setResolution: (width: number, height: number) => void;
  /** World Y of the reflection plane. */
  setPlaneY: (y: number) => void;
  dispose: () => void;
};

export type WaterPlanarReflectionOpts = {
  width?: number;
  height?: number;
  clipBias?: number;
};

const _normal = new THREE.Vector3(0, 1, 0);
const _reflectorPos = new THREE.Vector3();
const _cameraPos = new THREE.Vector3();
const _target = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _up = new THREE.Vector3();
const _rotation = new THREE.Matrix4();
const _plane = new THREE.Plane();
const _clipPlane = new THREE.Vector4();
const _q = new THREE.Vector4();
const _view = new THREE.Vector3();

/**
 * Park camera-locked infinity sprites (sun/moon) on the active camera so the
 * planar pass and the main pass share the same direction with no parallax.
 */
function snapInfinitySkyBodies(
  root: THREE.Object3D,
  camera: THREE.Camera,
): void {
  camera.getWorldPosition(_cameraPos);
  root.traverse((obj) => {
    if (!obj.userData?.emberInfinitySky) return;
    const dir = obj.userData.emberInfinityDir as THREE.Vector3 | undefined;
    const dist = obj.userData.emberInfinityDist as number | undefined;
    if (!dir || !(dist && dist > 0)) return;
    obj.position.copy(_cameraPos).addScaledVector(dir, dist);
    const ang = (obj.userData.emberInfinityAng as number | undefined) ?? 0.03;
    const s = dist * ang;
    obj.scale.set(s, s, 1);
  });
}

type ReflectUniformBag = {
  reflectMap?: { value: THREE.Texture | null };
  reflectMatrix?: { value: THREE.Matrix4 };
  reflectSize?: { value: THREE.Vector2 };
  reflectEnabled?: { value: number };
};

function reflectUniformsOf(
  mat: THREE.Material,
): ReflectUniformBag | null {
  return materialPlanarUniforms(mat) as ReflectUniformBag | null;
}

export function estimateWaterPlaneY(root: THREE.Object3D | null): number | null {
  if (!root) return null;
  // Prefer explicit surface tags; fall back to the top of water AABBs.
  // Depth walls hang below the slab — their AABB *center* sits too low and
  // skews the mirror plane (very visible in play when the camera is closer).
  let taggedSum = 0;
  let taggedCount = 0;
  let maxY = -Infinity;
  let any = false;
  const box = new THREE.Box3();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    if (!mats.some((m) => m?.userData?.emberWaterUniforms)) return;
    obj.updateWorldMatrix(true, false);
    if (obj.userData?.emberWaterSurface === true) {
      box.setFromObject(obj);
      if (!box.isEmpty()) {
        taggedSum += box.max.y;
        taggedCount += 1;
      }
      return;
    }
    box.setFromObject(obj);
    if (box.isEmpty()) return;
    maxY = Math.max(maxY, box.max.y);
    any = true;
  });
  if (taggedCount > 0) return taggedSum / taggedCount;
  if (!any) return null;
  return maxY;
}

export function collectWaterMeshes(root: THREE.Object3D | null): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  if (!root) return out;
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    if (mats.some((m) => materialHasPlanarReflect(m))) out.push(obj);
  });
  return out;
}

export function waterReflectionResolution(
  viewW: number,
  viewH: number,
  reflectMult: number,
): { width: number; height: number } {
  const m = Math.max(1, Math.min(8, reflectMult));
  // Slider ×1…×8 → RT density (NearestFilter keeps the pixel look).
  // ×1 ≈ view/5, ×2 ≈ /3, ×4 ≈ /1.75, ×8 ≈ /1.1
  const div = Math.max(1.1, 5.2 / Math.sqrt(m));
  return {
    width: Math.max(128, Math.floor(viewW / div)),
    height: Math.max(96, Math.floor(viewH / div)),
  };
}

export function createWaterPlanarReflection(
  opts: WaterPlanarReflectionOpts = {},
): WaterPlanarReflection {
  let rtW = Math.max(128, opts.width ?? 256);
  let rtH = Math.max(96, opts.height ?? 192);
  const clipBias = opts.clipBias ?? 0.003;
  let planeY = 0.55;
  const boundMats: THREE.Material[] = [];

  const virtualCamera = new THREE.PerspectiveCamera();
  const textureMatrix = new THREE.Matrix4();
  const reflectSize = new THREE.Vector2(rtW, rtH);

  let renderTarget = makeRT(rtW, rtH);
  let cachedScene: THREE.Scene | null = null;
  const cachedWaterMeshes: THREE.Mesh[] = [];
  const cachedSkipFx: THREE.Object3D[] = [];
  const cachedAmbientLights: THREE.AmbientLight[] = [];
  const cachedHemisphereLights: THREE.HemisphereLight[] = [];
  const cachedLocalLights: THREE.Light[] = [];
  const prevWaterVisible: boolean[] = [];
  const prevSkipFxVisible: boolean[] = [];
  const prevAmbientIntensity: number[] = [];
  const prevHemisphereIntensity: number[] = [];
  const prevLocalIntensity: number[] = [];

  function refreshSceneCache(scene: THREE.Scene): void {
    if (cachedScene === scene) return;
    cachedScene = scene;
    cachedWaterMeshes.length = 0;
    cachedSkipFx.length = 0;
    cachedAmbientLights.length = 0;
    cachedHemisphereLights.length = 0;
    cachedLocalLights.length = 0;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        if (mats.some((mat) => materialHasPlanarReflect(mat))) {
          cachedWaterMeshes.push(obj);
        }
      }
      if (obj.userData?.emberSkipWaterReflect) cachedSkipFx.push(obj);
      if (obj instanceof THREE.AmbientLight) {
        cachedAmbientLights.push(obj);
      } else if (obj instanceof THREE.HemisphereLight) {
        cachedHemisphereLights.push(obj);
      } else if (obj instanceof THREE.Light && !(obj instanceof THREE.DirectionalLight)) {
        cachedLocalLights.push(obj);
      }
    });
  }

  function makeRT(w: number, h: number): THREE.WebGLRenderTarget {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
      samples: 0,
    });
    rt.texture.generateMipmaps = false;
    rt.texture.minFilter = THREE.NearestFilter;
    rt.texture.magFilter = THREE.NearestFilter;
    rt.texture.wrapS = THREE.ClampToEdgeWrapping;
    rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    return rt;
  }

  function pushUniformsToMats(enabled: number): void {
    for (const mat of boundMats) {
      const u = reflectUniformsOf(mat);
      if (!u) continue;
      if (u.reflectMap) u.reflectMap.value = renderTarget.texture;
      // Keep Matrix4 identity — mutate in place so shader uniform refs stay live.
      if (u.reflectMatrix?.value) u.reflectMatrix.value.copy(textureMatrix);
      if (u.reflectSize) u.reflectSize.value.copy(reflectSize);
      if (u.reflectEnabled) u.reflectEnabled.value = enabled;
    }
  }

  function setResolution(width: number, height: number): void {
    const w = Math.max(128, Math.floor(width));
    const h = Math.max(96, Math.floor(height));
    if (w === rtW && h === rtH) return;
    rtW = w;
    rtH = h;
    renderTarget.dispose();
    renderTarget = makeRT(rtW, rtH);
    reflectSize.set(rtW, rtH);
    pushUniformsToMats(1);
  }

  function bindMaterials(mats: readonly THREE.Material[]): void {
    // World/editor rebuilds call bind again; refresh the matching scene lists on
    // the next reflection instead of traversing the scene every mirror frame.
    cachedScene = null;
    boundMats.length = 0;
    for (const mat of mats) {
      const u = reflectUniformsOf(mat);
      if (!u) continue;
      // Keep object identity — only write .value (shader holds these refs).
      if (u.reflectMap) u.reflectMap.value = renderTarget.texture;
      if (u.reflectMatrix?.value) u.reflectMatrix.value.copy(textureMatrix);
      if (u.reflectSize) u.reflectSize.value.copy(reflectSize);
      if (u.reflectEnabled) u.reflectEnabled.value = 1;
      mat.userData.emberWaterPlanar = true;
      boundMats.push(mat);
    }
  }

  function render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ): void {
    if (boundMats.length === 0) return;
    refreshSceneCache(scene);

    _reflectorPos.set(0, planeY, 0);
    _cameraPos.setFromMatrixPosition(camera.matrixWorld);

    // Camera must be above the water plane.
    if (_cameraPos.y <= planeY + 0.05) {
      pushUniformsToMats(0);
      return;
    }

    _view.subVectors(_reflectorPos, _cameraPos);
    // Reflector.js: skip when reflector faces away (dot > 0 for front-face).
    if (_view.dot(_normal) > 0) {
      pushUniformsToMats(0);
      return;
    }

    _view.reflect(_normal).negate();
    _view.add(_reflectorPos);

    _rotation.extractRotation(camera.matrixWorld);
    _lookAt.set(0, 0, -1).applyMatrix4(_rotation).add(_cameraPos);

    _target.subVectors(_reflectorPos, _lookAt);
    _target.reflect(_normal).negate();
    _target.add(_reflectorPos);

    virtualCamera.position.copy(_view);
    _up.set(0, 1, 0).applyMatrix4(_rotation).reflect(_normal);
    if (_up.lengthSq() < 1e-6) _up.set(0, 0, 1);
    virtualCamera.up.copy(_up).normalize();
    virtualCamera.lookAt(_target);
    virtualCamera.far = camera.far;
    virtualCamera.near = Math.max(0.5, camera.near);
    virtualCamera.fov = camera.fov;
    virtualCamera.aspect = camera.aspect;
    // Runtime actors use a separate layer for static PointLight shadow bakes;
    // the mirror should still see the same layers as the gameplay camera.
    virtualCamera.layers.mask = camera.layers.mask;
    virtualCamera.updateProjectionMatrix();
    virtualCamera.updateMatrixWorld(true);
    virtualCamera.projectionMatrix.copy(camera.projectionMatrix);

    // Sampler matrix from the unclipped projection (Three.js Reflector order).
    textureMatrix.set(
      0.5,
      0.0,
      0.0,
      0.5,
      0.0,
      0.5,
      0.0,
      0.5,
      0.0,
      0.0,
      0.5,
      0.5,
      0.0,
      0.0,
      0.0,
      1.0,
    );
    textureMatrix.multiply(virtualCamera.projectionMatrix);
    textureMatrix.multiply(virtualCamera.matrixWorldInverse);

    // Oblique near-clip so geometry below the water plane is not mirrored.
    _plane.setFromNormalAndCoplanarPoint(_normal, _reflectorPos);
    _plane.applyMatrix4(virtualCamera.matrixWorldInverse);
    _clipPlane.set(
      _plane.normal.x,
      _plane.normal.y,
      _plane.normal.z,
      _plane.constant,
    );
    const proj = virtualCamera.projectionMatrix;
    _q.x = (Math.sign(_clipPlane.x) + proj.elements[8]!) / proj.elements[0]!;
    _q.y = (Math.sign(_clipPlane.y) + proj.elements[9]!) / proj.elements[5]!;
    _q.z = -1;
    _q.w = (1 + proj.elements[10]!) / proj.elements[14]!;
    const clipDot = _clipPlane.dot(_q);
    if (Math.abs(clipDot) > 1e-6) {
      _clipPlane.multiplyScalar(2 / clipDot);
      proj.elements[2] = _clipPlane.x;
      proj.elements[6] = _clipPlane.y;
      proj.elements[10] = _clipPlane.z + 1 - clipBias;
      proj.elements[14] = _clipPlane.w;
    }

    for (let i = 0; i < cachedWaterMeshes.length; i++) {
      prevWaterVisible[i] = cachedWaterMeshes[i]!.visible;
      cachedWaterMeshes[i]!.visible = false;
    }

    // Soft atmosphere FX (sun glare disc, cloud multiply plane) become a pale
    // moon-blob in the mirror — hide for the planar pass only.
    for (let i = 0; i < cachedSkipFx.length; i++) {
      prevSkipFxVisible[i] = cachedSkipFx[i]!.visible;
      cachedSkipFx[i]!.visible = false;
    }

    // Soft teal blobs were PointLight / SpotLight pools mirrored into the RT.
    // Keep Ambient + Hemisphere + Directional so ordinary voxels still read;
    // only kill local omni lights. Mutate intensity (not .visible) so a failed
    // restore can never leave the main scene permanently unlit / black.
    // Keep lamp-core meshes — MeshBasic boxes read as hard mirrors.
    for (let i = 0; i < cachedAmbientLights.length; i++) {
      const light = cachedAmbientLights[i]!;
      prevAmbientIntensity[i] = light.intensity;
      light.intensity = Math.max(light.intensity * 3, 0.5);
    }
    for (let i = 0; i < cachedHemisphereLights.length; i++) {
      const light = cachedHemisphereLights[i]!;
      prevHemisphereIntensity[i] = light.intensity;
      light.intensity = Math.max(light.intensity * 3, 0.2);
    }
    for (let i = 0; i < cachedLocalLights.length; i++) {
      const light = cachedLocalLights[i]!;
      prevLocalIntensity[i] = light.intensity;
      light.intensity = 0;
    }

    const prevTarget = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled;
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    const prevAutoClear = renderer.autoClear;
    const prevBg = scene.background;
    const prevFog = scene.fog;

    try {
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      // Keep CubeTexture / textured sky so stars, clouds, and the pixel sun
      // appear in the water mirror. Only flat Color clears become a void.
      const keepSky =
        prevBg instanceof THREE.CubeTexture ||
        (prevBg instanceof THREE.Texture &&
          !(prevBg as THREE.Texture & { isRenderTargetTexture?: boolean })
            .isRenderTargetTexture);
      if (!keepSky) {
        scene.background = new THREE.Color(0x050810);
      }
      scene.fog = null;
      // Do NOT call setViewport(rtW, rtH) here — WebGLRenderer.setViewport always
      // multiplies by pixelRatio, which overflows the RT when DPR > 1 (play uses
      // up to 1.25; editor forces 1). setRenderTarget already binds the RT's own
      // viewport in device pixels.
      renderer.setRenderTarget(renderTarget);
      renderer.autoClear = true;
      renderer.clear();
      // Moon/sun disc must sit on the *virtual* camera for the mirror pass.
      snapInfinitySkyBodies(scene, virtualCamera);
      renderer.render(scene, virtualCamera);
    } finally {
      // Restore for the main view (same frame).
      snapInfinitySkyBodies(scene, camera);
      scene.background = prevBg;
      scene.fog = prevFog;
      renderer.xr.enabled = prevXr;
      renderer.shadowMap.autoUpdate = prevShadowAuto;
      renderer.autoClear = prevAutoClear;
      renderer.setRenderTarget(prevTarget);

      for (let i = 0; i < cachedLocalLights.length; i++) {
        cachedLocalLights[i]!.intensity = prevLocalIntensity[i]!;
      }
      for (let i = 0; i < cachedAmbientLights.length; i++) {
        cachedAmbientLights[i]!.intensity = prevAmbientIntensity[i]!;
      }
      for (let i = 0; i < cachedHemisphereLights.length; i++) {
        cachedHemisphereLights[i]!.intensity = prevHemisphereIntensity[i]!;
      }
      for (let i = 0; i < cachedSkipFx.length; i++) {
        cachedSkipFx[i]!.visible = prevSkipFxVisible[i]!;
      }
      for (let i = 0; i < cachedWaterMeshes.length; i++) {
        cachedWaterMeshes[i]!.visible = prevWaterVisible[i]!;
      }
    }

    pushUniformsToMats(1);
  }

  return {
    render,
    bindMaterials,
    setResolution,
    setPlaneY: (y) => {
      planeY = y;
    },
    dispose: () => {
      boundMats.length = 0;
      cachedScene = null;
      cachedWaterMeshes.length = 0;
      cachedSkipFx.length = 0;
      cachedAmbientLights.length = 0;
      cachedHemisphereLights.length = 0;
      cachedLocalLights.length = 0;
      renderTarget.dispose();
    },
  };
}
