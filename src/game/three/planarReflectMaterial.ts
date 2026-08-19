/**
 * Scene planar reflections for wet / metal MeshStandard surfaces.
 * Shares the water mirror RT (horizontal plane); strength follows gloss.
 * Floors get a real scene mirror; walls keep cube envMap (vertical plane TBD).
 */
import * as THREE from "three";

export type PlanarReflectUniforms = {
  reflectMap: { value: THREE.Texture | null };
  reflectMatrix: { value: THREE.Matrix4 };
  reflectSize: { value: THREE.Vector2 };
  reflectEnabled: { value: number };
  /** 0..1 overall mirror amount (floors). */
  reflectStrength: { value: number };
  /** Texel cell size for Nearest quantization (world units hint → UV cells). */
  reflectCell: { value: number };
};

const MARKER = "Ember planar reflect";
const CACHE_TAG = "ember-planar-reflect-v1";

export function createPlanarReflectUniforms(
  strength = 0.92,
  cell = 8,
): PlanarReflectUniforms {
  return {
    reflectMap: { value: null },
    reflectMatrix: { value: new THREE.Matrix4() },
    reflectSize: { value: new THREE.Vector2(256, 192) },
    reflectEnabled: { value: 0 },
    reflectStrength: { value: Math.max(0, Math.min(1, strength)) },
    reflectCell: { value: Math.max(1, cell) },
  };
}

export function materialPlanarUniforms(
  mat: THREE.Material | undefined,
): PlanarReflectUniforms | null {
  if (!mat) return null;
  const planar = mat.userData.emberPlanarUniforms as
    | PlanarReflectUniforms
    | undefined;
  if (planar) return planar;
  const water = mat.userData.emberWaterUniforms as
    | PlanarReflectUniforms
    | undefined;
  return water ?? null;
}

export function materialHasPlanarReflect(mat: THREE.Material | undefined): boolean {
  return Boolean(materialPlanarUniforms(mat));
}

/**
 * Inject pixelated scene-mirror sampling into a MeshStandardMaterial.
 * Safe to call once per material; re-entry is a no-op.
 */
export function patchStandardPlanarReflect(
  mat: THREE.MeshStandardMaterial,
  opts?: { strength?: number; cell?: number },
): THREE.MeshStandardMaterial {
  if (mat.userData.emberPlanarUniforms) return mat;

  const uniforms = createPlanarReflectUniforms(opts?.strength ?? 0.92, opts?.cell);
  mat.userData.emberPlanarUniforms = uniforms;
  mat.userData.emberPlanarReflect = true;

  const prevCompile = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prevCompile(shader, renderer);
    if (shader.fragmentShader.includes(MARKER)) return;

    shader.uniforms.emberPlanarReflectMap = uniforms.reflectMap;
    shader.uniforms.emberPlanarReflectMatrix = uniforms.reflectMatrix;
    shader.uniforms.emberPlanarReflectSize = uniforms.reflectSize;
    shader.uniforms.emberPlanarReflectEnabled = uniforms.reflectEnabled;
    shader.uniforms.emberPlanarReflectStrength = uniforms.reflectStrength;
    shader.uniforms.emberPlanarReflectCell = uniforms.reflectCell;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
varying vec3 vEmberPlanarWorldPos;
varying vec3 vEmberPlanarWorldNormal;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
	// ${MARKER}
	{
		vec4 _emberPWP = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		_emberPWP = batchingMatrix * _emberPWP;
	#endif
	#ifdef USE_INSTANCING
		_emberPWP = instanceMatrix * _emberPWP;
	#endif
		vEmberPlanarWorldPos = ( modelMatrix * _emberPWP ).xyz;
		vEmberPlanarWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );
	}`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
uniform sampler2D emberPlanarReflectMap;
uniform mat4 emberPlanarReflectMatrix;
uniform vec2 emberPlanarReflectSize;
uniform float emberPlanarReflectEnabled;
uniform float emberPlanarReflectStrength;
uniform float emberPlanarReflectCell;
varying vec3 vEmberPlanarWorldPos;
varying vec3 vEmberPlanarWorldNormal;

// ${MARKER}
vec3 emberSamplePlanarMirror(vec3 worldPos) {
	if ( emberPlanarReflectEnabled < 0.5 ) return vec3( 0.0 );
	vec4 coord = emberPlanarReflectMatrix * vec4( worldPos, 1.0 );
	float w = max( abs( coord.w ), 1e-4 );
	vec2 uv = coord.xy / w;
	vec2 res = max( emberPlanarReflectSize, vec2( 8.0 ) );
	uv = ( floor( uv * res ) + 0.5 ) / res;
	if ( uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0 ) return vec3( 0.0 );
	vec3 c = texture2D( emberPlanarReflectMap, uv ).rgb;
	float luma = max( c.r, max( c.g, c.b ) );
	if ( luma < 0.02 ) return vec3( 0.0 );
	c *= 1.15;
	return clamp( c, 0.0, 1.6 );
}
`,
    );

    // Mix after lighting, before opaque output / tonemap.
    const hook = "#include <opaque_fragment>";
    if (shader.fragmentShader.includes(hook)) {
      shader.fragmentShader = shader.fragmentShader.replace(
        hook,
        `
	// ${MARKER}
	{
		float _gloss = 1.0 - roughnessFactor;
		_gloss = _gloss * _gloss;
		vec3 _wn = normalize( vEmberPlanarWorldNormal );
		// Horizontal floors / tops — correct for the shared Y mirror plane.
		float _up = smoothstep( 0.2, 0.72, _wn.y );
		// Slight fresnel so grazing floors still flash.
		vec3 _viewW = normalize( cameraPosition - vEmberPlanarWorldPos );
		float _fres = pow( 1.0 - max( dot( _wn, _viewW ), 0.0 ), 3.0 );
		float _metal = metalnessFactor;
		float _amt = emberPlanarReflectEnabled
			* emberPlanarReflectStrength
			* _gloss
			* mix( 0.55, 1.0, _metal )
			* mix( _up, 1.0, _fres * _up * 0.65 );
		_amt = clamp( _amt, 0.0, 0.94 );
		if ( _amt > 0.01 ) {
			vec3 _planar = emberSamplePlanarMirror( vEmberPlanarWorldPos );
			outgoingLight = mix( outgoingLight, _planar, _amt );
		}
	}
${hook}`,
      );
    }
  };

  const prevKey =
    typeof mat.customProgramCacheKey === "function"
      ? mat.customProgramCacheKey.bind(mat)
      : () => "";
  mat.customProgramCacheKey = () => `${prevKey()}|${CACHE_TAG}`;
  mat.needsUpdate = true;
  return mat;
}

export function collectPlanarReflectMaterials(
  root: THREE.Object3D | null,
): THREE.Material[] {
  const mats: THREE.Material[] = [];
  if (!root) return mats;
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) {
      if (mat?.userData?.emberPlanarUniforms) mats.push(mat);
    }
  });
  return mats;
}

/** Top of shiny / metal floor meshes for mirror plane fallback. */
export function estimatePlanarFloorY(root: THREE.Object3D | null): number | null {
  if (!root) return null;
  let maxY = -Infinity;
  let any = false;
  const box = new THREE.Box3();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    if (!list.some((m) => m?.userData?.emberPlanarUniforms)) return;
    obj.updateWorldMatrix(true, false);
    box.setFromObject(obj);
    if (box.isEmpty()) return;
    maxY = Math.max(maxY, box.max.y);
    any = true;
  });
  if (!any) return null;
  return maxY;
}
