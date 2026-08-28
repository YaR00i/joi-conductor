/**
 * Quantize lighting / shadow sample position to voxel centers so lamps and
 * key-light umbras read as blocky steps instead of smooth per-pixel gradients.
 *
 * Must snap in the **fragment** shader from the interpolated world position.
 * Vertex snap alone fails on greedy-meshed terrain: large quads interpolate
 * shadow/light coords smoothly across many voxels (looks like a tiny shift).
 *
 * Snap only in the surface tangent plane (keep the dominant normal axis).
 * Burying the probe along the face normal caused acne noise on walls that
 * shimmered with camera motion. Re-apply stock shadow normalBias on probes.
 *
 * Three r152+ keeps lighting locals inside `#include <lights_fragment_begin>`
 * — we inline a patched chunk in onBeforeCompile.
 *
 * Shared uniforms — toggling updates every patched material without rebuild.
 */
import {
  ShaderChunk,
  DataTexture,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
  ClampToEdgeWrapping,
  Vector2,
  Vector3,
  Vector4,
  type Material,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { POINT_SHADOW_SHADER_SLOTS } from "./pointShadowAtlas";

const MARKER = "Ember voxel light snap";
const CACHE_TAG = "ember-voxel-light-snap-v17";
const INCLUDE_LIGHTS = "#include <lights_fragment_begin>";
const INCLUDE_WORLDPOS = "#include <worldpos_vertex>";
const INCLUDE_SHADOWMAP = "#include <shadowmap_pars_fragment>";

/** Atlas sample plus stock cubeToUV / texture2DCompare helpers. */
export function patchedShadowmapParsFragment(): string {
  const chunk = ShaderChunk.shadowmap_pars_fragment;
  if (chunk.includes("emberAtlasShadow")) {
    return chunk;
  }
  const endif = chunk.lastIndexOf("#endif");
  if (endif < 0) return chunk + emberAtlasShadowGlsl();
  return chunk.slice(0, endif) + emberAtlasShadowGlsl() + "\n#endif\n";
}

function emberAtlasShadowGlsl(): string {
  const slots: string[] = [];
  for (let i = 0; i < POINT_SHADOW_SHADER_SLOTS; i += 1) {
    slots.push(`	if ( emberAtlasOccupied[ ${i} ] > 0.5 ) {
		slotView = ( viewMatrix * vec4( emberAtlasLightWorld[ ${i} ], 1.0 ) ).xyz;
		if ( distance( slotView, lightViewPos ) < 1.5 ) {
			lightToPos = worldProbe - emberAtlasLightWorld[ ${i} ];
			len = length( lightToPos );
			nf = emberAtlasNearFar[ ${i} ];
			if ( len - nf.y <= 0.0 && len - nf.x >= 0.0 ) {
				dp = ( len - nf.x ) / max( nf.y - nf.x, 1e-4 ) + emberAtlasBias[ ${i} ];
				bd3D = normalize( lightToPos );
				cubeUv = cubeToUV( bd3D, texelY );
				so = emberAtlasScaleOffset[ ${i} ];
				uv = cubeUv * so.xy + so.zw;
				shadow = mix( 1.0, texture2DCompare( emberPointShadowAtlas, uv, dp ), emberAtlasIntensity[ ${i} ] );
			}
		}
	}`);
  }
  return `

float emberAtlasShadow( vec3 lightViewPos, vec3 worldProbe ) {

	if ( emberAtlasEnabled < 0.5 ) return 1.0;

	float shadow = 1.0;
	vec3 slotView;
	vec3 lightToPos;
	float len;
	vec2 nf;
	float dp;
	vec3 bd3D;
	vec2 cubeUv;
	vec4 so;
	vec2 uv;
	float texelY = 1.0 / max( emberAtlasFaceSize * 2.0, 1.0 );

${slots.join("\n")}

	return shadow;

}
`;
}

/** Shared across all Ember lit materials. */
export const emberVoxelLightSnapState = {
  enabled: false,
  /** World units per voxel (usually tileSize / 16). */
  voxelSize: 1,
};

const atlasOccupied = Array.from(
  { length: POINT_SHADOW_SHADER_SLOTS },
  () => 0,
);
const atlasScaleOffset = Array.from(
  { length: POINT_SHADOW_SHADER_SLOTS },
  () => new Vector4(1, 1, 0, 0),
);
const atlasLightWorld = Array.from(
  { length: POINT_SHADOW_SHADER_SLOTS },
  () => new Vector3(),
);
const atlasNearFar = Array.from(
  { length: POINT_SHADOW_SHADER_SLOTS },
  () => new Vector2(0.5, 1),
);
const atlasBias = Array.from({ length: POINT_SHADOW_SHADER_SLOTS }, () => 0);
const atlasIntensity = Array.from(
  { length: POINT_SHADOW_SHADER_SLOTS },
  () => 1,
);

function createFallbackAtlasTexture(): DataTexture {
  const tex = new DataTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    RGBAFormat,
    UnsignedByteType,
  );
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  tex.name = "emberPointShadowAtlasFallback";
  return tex;
}

const fallbackAtlasTexture = createFallbackAtlasTexture();

const sharedUniforms = {
  emberVoxelLightSnap: { value: 0 },
  emberVoxelSize: { value: 1 },
  emberPointShadowAtlas: { value: fallbackAtlasTexture as Texture },
  emberAtlasEnabled: { value: 0 },
  emberAtlasFaceSize: { value: 256 },
  emberAtlasOccupied: { value: atlasOccupied },
  emberAtlasScaleOffset: { value: atlasScaleOffset },
  emberAtlasLightWorld: { value: atlasLightWorld },
  emberAtlasNearFar: { value: atlasNearFar },
  emberAtlasBias: { value: atlasBias },
  emberAtlasIntensity: { value: atlasIntensity },
};

export type EmberPointShadowAtlasSlot = {
  occupied: boolean;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
  z: number;
  near: number;
  far: number;
  bias: number;
  intensity: number;
};

/**
 * Bind the point-shadow atlas for every patched Ember material.
 * Compile-time slot count stays POINT_SHADOW_SHADER_SLOTS.
 */
export function setEmberPointShadowAtlas(args: {
  enabled: boolean;
  texture?: Texture | null;
  faceSize?: number;
  slots?: readonly EmberPointShadowAtlasSlot[];
}): void {
  sharedUniforms.emberAtlasEnabled.value = args.enabled ? 1 : 0;
  sharedUniforms.emberPointShadowAtlas.value =
    args.texture ?? fallbackAtlasTexture;
  sharedUniforms.emberAtlasFaceSize.value = Math.max(1, args.faceSize ?? 256);
  const slots = args.slots ?? [];
  for (let i = 0; i < POINT_SHADOW_SHADER_SLOTS; i += 1) {
    const slot = slots[i];
    atlasOccupied[i] = slot?.occupied ? 1 : 0;
    if (!slot) {
      atlasScaleOffset[i]!.set(1, 1, 0, 0);
      atlasLightWorld[i]!.set(0, 0, 0);
      atlasNearFar[i]!.set(0.5, 1);
      atlasBias[i] = 0;
      atlasIntensity[i] = 1;
      continue;
    }
    atlasScaleOffset[i]!.set(
      slot.scaleX,
      slot.scaleY,
      slot.offsetX,
      slot.offsetY,
    );
    atlasLightWorld[i]!.set(slot.x, slot.y, slot.z);
    atlasNearFar[i]!.set(slot.near, Math.max(slot.near + 1e-4, slot.far));
    atlasBias[i] = slot.bias;
    atlasIntensity[i] = Math.max(0, Math.min(1, slot.intensity));
  }
}

function syncSharedUniforms(): void {
  sharedUniforms.emberVoxelLightSnap.value = emberVoxelLightSnapState.enabled
    ? 1
    : 0;
  sharedUniforms.emberVoxelSize.value = Math.max(
    1e-3,
    emberVoxelLightSnapState.voxelSize,
  );
}

/**
 * Update global snap. Materials that already patched share these uniforms,
 * so the next frame picks up the change immediately.
 */
export function setEmberVoxelLightSnap(
  enabled: boolean,
  voxelSize: number,
): void {
  emberVoxelLightSnapState.enabled = enabled;
  emberVoxelLightSnapState.voxelSize = Math.max(1e-3, voxelSize);
  syncSharedUniforms();
}

/** True interpolated world pos — snap happens per-fragment. */
const VERT_WORLD_VARYING = `
	// ${MARKER}
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined( USE_SHADOWMAP ) || defined( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vEmberWorldPos = worldPosition.xyz;
#else
	{
		vec4 _emberWP = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		_emberWP = batchingMatrix * _emberWP;
	#endif
	#ifdef USE_INSTANCING
		_emberWP = instanceMatrix * _emberWP;
	#endif
		vEmberWorldPos = ( modelMatrix * _emberWP ).xyz;
	}
#endif
`;

/**
 * After geometryNormal is set. Snap tangent axes only; keep surface axis.
 * Slight inward bias before floor() so face edges don't flicker between cells.
 */
const FRAG_SNAP_AFTER_NORMAL = `
	// ${MARKER}
	vec3 emberSnapWorld = vEmberWorldPos;
	vec3 emberShadowWorld = vEmberWorldPos;
	if ( emberVoxelLightSnap > 0.5 ) {
		float _evs = max( emberVoxelSize, 1e-3 );
		vec3 _en = inverseTransformDirection( geometryNormal, viewMatrix );
		float _enLen = length( _en );
		_en = _enLen > 1e-5 ? _en / _enLen : vec3( 0.0, 1.0, 0.0 );
		vec3 _nAbs = abs( _en );
		float _nMax = max( _nAbs.x, max( _nAbs.y, _nAbs.z ) );
		vec3 _keep = step( vec3( _nMax - 1e-4 ), _nAbs );
		vec3 _p = vEmberWorldPos - _en * ( _evs * 0.02 );
		vec3 _grid = ( floor( _p / _evs ) + 0.5 ) * _evs;
		emberSnapWorld = mix( _grid, vEmberWorldPos, _keep );
		emberShadowWorld = emberSnapWorld;
		geometryPosition = ( viewMatrix * vec4( emberSnapWorld, 1.0 ) ).xyz;
	}
`;

const FRAG_SNAP_AFTER_NORMAL_LEGACY = `
	// ${MARKER}
	vec3 emberSnapWorld = vEmberWorldPos;
	vec3 emberShadowWorld = vEmberWorldPos;
	if ( emberVoxelLightSnap > 0.5 ) {
		float _evs = max( emberVoxelSize, 1e-3 );
		vec3 _en = inverseTransformDirection( normal, viewMatrix );
		float _enLen = length( _en );
		_en = _enLen > 1e-5 ? _en / _enLen : vec3( 0.0, 1.0, 0.0 );
		vec3 _nAbs = abs( _en );
		float _nMax = max( _nAbs.x, max( _nAbs.y, _nAbs.z ) );
		vec3 _keep = step( vec3( _nMax - 1e-4 ), _nAbs );
		vec3 _p = vEmberWorldPos - _en * ( _evs * 0.02 );
		vec3 _grid = ( floor( _p / _evs ) + 0.5 ) * _evs;
		emberSnapWorld = mix( _grid, vEmberWorldPos, _keep );
		emberShadowWorld = emberSnapWorld;
		geometry.position = ( viewMatrix * vec4( emberSnapWorld, 1.0 ) ).xyz;
	}
`;

const SHADOW_WORLD_WITH_BIAS = (biasExpr: string) =>
  `emberShadowWorld + inverseTransformDirection( geometryNormal, viewMatrix ) * ( ${biasExpr} + emberVoxelSize * 0.2 )`;

function dirShadowCoord(index: string): string {
  const shadow = `directionalLightShadows[ ${index} ]`;
  const towardLight = `inverseTransformDirection( directionalLights[ ${index} ].direction, viewMatrix )`;
  const biased = `emberShadowWorld + ${towardLight} * ( ${shadow}.shadowNormalBias + emberVoxelSize * 0.15 )`;
  const snapped = `( directionalShadowMatrix[ ${index} ] * vec4( ${biased}, 1.0 ) )`;
  return `( emberVoxelLightSnap > 0.5 ? ${snapped} : vDirectionalShadowCoord[ ${index} ] )`;
}

function dirShadowSample(index: string): string {
  const shadow = `directionalLightShadows[ ${index} ]`;
  const coord = dirShadowCoord(index);
  return `getShadow( directionalShadowMap[ ${index} ], ${shadow}.shadowMapSize, ${shadow}.shadowIntensity, ${shadow}.shadowBias, ${shadow}.shadowRadius, ${coord} )`;
}

/**
 * One cached sun map. Extra directional loop indices (if any) must not light
 * or shadow. Keep this as a single sample so editor and play both compile
 * with NUM_DIR_LIGHT_SHADOWS == 1.
 */
export function combineDirCascadeShadowExpr(): string {
  return `( UNROLLED_LOOP_INDEX == 0 ? ${dirShadowSample("0")} : 1.0 )`;
}

function patchDirShadowSamples(chunk: string): string {
  const from =
    "getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )";
  if (!chunk.includes(from)) return chunk;
  return chunk.replaceAll(from, combineDirCascadeShadowExpr());
}

/**
 * Stock Three computes viewDir from smooth `vViewPosition` even after we snap
 * `geometryPosition` — that leaves soft specular gradients (esp. on water).
 * Re-bind viewDir to the snapped surface point.
 */
const VIEWDIR_FROM_VPOS =
  "vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );";
const VIEWDIR_FROM_VPOS_TIGHT =
  "vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize(vViewPosition);";
const VIEWDIR_SNAPPED = `
	vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
	// ${MARKER} view
	if ( emberVoxelLightSnap > 0.5 ) {
		geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( - geometryPosition );
	}
`;

function patchedLightsFragmentBegin(): string {
  let chunk = ShaderChunk.lights_fragment_begin;
  if (chunk.includes(`${MARKER} view`)) return chunk;

  const afterNormal = "vec3 geometryNormal = normal;";
  const legacyPos = "geometry.position = - vViewPosition;";
  const legacyPosTight = "geometry.position = -vViewPosition;";

  if (chunk.includes(afterNormal) && !chunk.includes(MARKER)) {
    chunk = chunk.replace(afterNormal, afterNormal + FRAG_SNAP_AFTER_NORMAL);
  } else if (chunk.includes(legacyPos) && !chunk.includes(MARKER)) {
    chunk = chunk.replace(legacyPos, legacyPos + FRAG_SNAP_AFTER_NORMAL_LEGACY);
  } else if (chunk.includes(legacyPosTight) && !chunk.includes(MARKER)) {
    chunk = chunk.replace(
      legacyPosTight,
      legacyPosTight + FRAG_SNAP_AFTER_NORMAL_LEGACY,
    );
  } else if (!chunk.includes(MARKER)) {
    return chunk;
  }

  if (chunk.includes(VIEWDIR_FROM_VPOS)) {
    chunk = chunk.replace(VIEWDIR_FROM_VPOS, VIEWDIR_SNAPPED);
  } else if (chunk.includes(VIEWDIR_FROM_VPOS_TIGHT)) {
    chunk = chunk.replace(VIEWDIR_FROM_VPOS_TIGHT, VIEWDIR_SNAPPED);
  }

  return patchAtlasPointShadows(patchDirShadowSamples(chunk));
}

const ATLAS_LIGHT_NEEDLE =
  "getPointLightInfo( pointLight, geometryPosition, directLight );";

function patchAtlasPointShadows(chunk: string): string {
  if (chunk.includes("emberAtlasShadow( pointLight.position")) return chunk;
  if (!chunk.includes(ATLAS_LIGHT_NEEDLE)) return chunk;
  return chunk.replace(
    ATLAS_LIGHT_NEEDLE,
    `${ATLAS_LIGHT_NEEDLE}

		#if defined( USE_SHADOWMAP ) && ( NUM_POINT_LIGHT_SHADOWS < 1 )
		directLight.color *= ( directLight.visible && receiveShadow ) ? emberAtlasShadow( pointLight.position, emberVoxelLightSnap > 0.5 ? ${SHADOW_WORLD_WITH_BIAS("0.05")} : vEmberWorldPos ) : 1.0;
		#endif`,
  );
}

/** Patched lights_fragment_begin (voxel snap + atlas). Exported for shader tests. */
export function patchedEmberLightsFragmentBegin(): string {
  return patchedLightsFragmentBegin();
}

function injectFragmentSnap(fragmentShader: string): string {
  let fs = fragmentShader;
  if (
    fs.includes(INCLUDE_SHADOWMAP) &&
    !fs.includes("emberAtlasShadow")
  ) {
    fs = fs.replace(INCLUDE_SHADOWMAP, patchedShadowmapParsFragment());
  }
  if (fs.includes(MARKER)) return fs;
  if (!fs.includes(INCLUDE_LIGHTS)) return fs;
  return fs.replace(INCLUDE_LIGHTS, patchedLightsFragmentBegin());
}

function injectVertexWorldVarying(vertexShader: string): string {
  if (vertexShader.includes(MARKER)) return vertexShader;
  if (!vertexShader.includes(INCLUDE_WORLDPOS)) return vertexShader;
  return vertexShader.replace(
    INCLUDE_WORLDPOS,
    INCLUDE_WORLDPOS + VERT_WORLD_VARYING,
  );
}

/**
 * Chain onto material.onBeforeCompile so lamp discs / direct-light scale keep working.
 */
export function patchEmberVoxelLightSnap(material: Material): void {
  syncSharedUniforms();
  const prevCompile = material.onBeforeCompile
    ? material.onBeforeCompile.bind(material)
    : ((_shader: WebGLProgramParametersWithUniforms, _renderer: unknown) => {
        /* no prior compile hook */
      });
  const prevKey =
    typeof material.customProgramCacheKey === "function"
      ? material.customProgramCacheKey.bind(material)
      : () => "";

  material.onBeforeCompile = (shader, renderer) => {
    prevCompile(shader, renderer);
    shader.uniforms.emberVoxelLightSnap = sharedUniforms.emberVoxelLightSnap;
    shader.uniforms.emberVoxelSize = sharedUniforms.emberVoxelSize;
    shader.uniforms.emberPointShadowAtlas =
      sharedUniforms.emberPointShadowAtlas;
    shader.uniforms.emberAtlasEnabled = sharedUniforms.emberAtlasEnabled;
    shader.uniforms.emberAtlasFaceSize = sharedUniforms.emberAtlasFaceSize;
    shader.uniforms.emberAtlasOccupied = sharedUniforms.emberAtlasOccupied;
    shader.uniforms.emberAtlasScaleOffset =
      sharedUniforms.emberAtlasScaleOffset;
    shader.uniforms.emberAtlasLightWorld = sharedUniforms.emberAtlasLightWorld;
    shader.uniforms.emberAtlasNearFar = sharedUniforms.emberAtlasNearFar;
    shader.uniforms.emberAtlasBias = sharedUniforms.emberAtlasBias;
    shader.uniforms.emberAtlasIntensity = sharedUniforms.emberAtlasIntensity;

    if (!shader.vertexShader.includes("varying vec3 vEmberWorldPos")) {
      shader.vertexShader =
        "varying vec3 vEmberWorldPos;\n" + shader.vertexShader;
    }
    const fragUniforms = `varying vec3 vEmberWorldPos;
uniform float emberVoxelLightSnap;
uniform float emberVoxelSize;
uniform sampler2D emberPointShadowAtlas;
uniform float emberAtlasEnabled;
uniform float emberAtlasFaceSize;
uniform float emberAtlasOccupied[ ${POINT_SHADOW_SHADER_SLOTS} ];
uniform vec4 emberAtlasScaleOffset[ ${POINT_SHADOW_SHADER_SLOTS} ];
uniform vec3 emberAtlasLightWorld[ ${POINT_SHADOW_SHADER_SLOTS} ];
uniform vec2 emberAtlasNearFar[ ${POINT_SHADOW_SHADER_SLOTS} ];
uniform float emberAtlasBias[ ${POINT_SHADOW_SHADER_SLOTS} ];
uniform float emberAtlasIntensity[ ${POINT_SHADOW_SHADER_SLOTS} ];
#if defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 )
	uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
#endif
`;
    if (!shader.fragmentShader.includes("varying vec3 vEmberWorldPos")) {
      shader.fragmentShader = fragUniforms + shader.fragmentShader;
    } else if (
      !shader.fragmentShader.includes("uniform float emberVoxelLightSnap")
    ) {
      shader.fragmentShader =
        fragUniforms.replace("varying vec3 vEmberWorldPos;\n", "") +
        shader.fragmentShader;
    }

    shader.vertexShader = injectVertexWorldVarying(shader.vertexShader);
    shader.fragmentShader = injectFragmentSnap(shader.fragmentShader);
  };
  material.customProgramCacheKey = () => `${prevKey()}|${CACHE_TAG}`;
  material.needsUpdate = true;
}
