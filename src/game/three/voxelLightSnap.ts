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
  type Material,
  type WebGLProgramParametersWithUniforms,
} from "three";

const MARKER = "Ember voxel light snap";
const CACHE_TAG = "ember-voxel-light-snap-v12";
const INCLUDE_LIGHTS = "#include <lights_fragment_begin>";
const INCLUDE_WORLDPOS = "#include <worldpos_vertex>";
const INCLUDE_SHADOWMAP = "#include <shadowmap_pars_fragment>";
const PENUMBRA_MARKER = "emberPointPenumbra";

const EMBER_GET_POINT_SHADOW = `float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {

	float shadow = 1.0;

	vec3 lightToPosition = shadowCoord.xyz;

	float lightToPositionLength = length( lightToPosition );

	if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {

		float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );
		dp += shadowBias;

		vec3 bd3D = normalize( lightToPosition );

		vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );

		// ${PENUMBRA_MARKER}: radius 0 keeps a hard lantern umbra. Analog leak
		// uses radius > 0 so the umbra greys and widens farther from the lamp.
		if ( shadowRadius < 0.05 ) {

			shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );

		} else {

			float distN = clamp( ( lightToPositionLength - shadowCameraNear ) / max( shadowCameraFar - shadowCameraNear, 1e-3 ), 0.0, 1.0 );
			float blurCells = ( 0.55 + distN * 2.8 ) * clamp( shadowRadius / 2.2, 0.5, 3.5 );
			float dirOff = ( emberVoxelSize * blurCells ) / max( lightToPositionLength, emberVoxelSize );
			vec2 offset = vec2( - 1.0, 1.0 ) * dirOff;

			shadow = (
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
			) * ( 1.0 / 9.0 );

		}

	}

	return mix( 1.0, shadow, shadowIntensity );

}
`;

function replaceGlslFunction(
  chunk: string,
  signature: string,
  replacement: string,
): string {
  const start = chunk.indexOf(signature);
  if (start < 0) return chunk;
  const brace = chunk.indexOf("{", start);
  if (brace < 0) return chunk;
  let depth = 0;
  for (let i = brace; i < chunk.length; i++) {
    const ch = chunk[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return chunk.slice(0, start) + replacement + chunk.slice(i + 1);
      }
    }
  }
  return chunk;
}

/** Stock Three point-shadow PCF, with distance-scaled penumbra when radius > 0. */
export function patchedShadowmapParsFragment(): string {
  const chunk = ShaderChunk.shadowmap_pars_fragment;
  if (chunk.includes(PENUMBRA_MARKER)) return chunk;
  return replaceGlslFunction(
    chunk,
    "float getPointShadow(",
    EMBER_GET_POINT_SHADOW,
  );
}

/** Shared across all Ember lit materials. */
export const emberVoxelLightSnapState = {
  enabled: false,
  /** World units per voxel (usually tileSize / 16). */
  voxelSize: 1,
};

const sharedUniforms = {
  emberVoxelLightSnap: { value: 0 },
  emberVoxelSize: { value: 1 },
};

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

function patchPointShadowSamples(chunk: string): string {
  const from =
    "getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar )";
  if (!chunk.includes(from)) return chunk;
  const biased = SHADOW_WORLD_WITH_BIAS(
    "pointLightShadows[ i ].shadowNormalBias",
  );
  // vPointShadowCoord stores light→fragment via pointShadowMatrix * worldPos.
  const to = `getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, emberVoxelLightSnap > 0.5 ? ( pointShadowMatrix[ i ] * vec4( ${biased}, 1.0 ) ) : vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar )`;
  return chunk.replaceAll(from, to);
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

  return patchPointShadowSamples(patchDirShadowSamples(chunk));
}

function injectFragmentSnap(fragmentShader: string): string {
  let fs = fragmentShader;
  if (fs.includes(INCLUDE_SHADOWMAP) && !fs.includes(PENUMBRA_MARKER)) {
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

    if (!shader.vertexShader.includes("varying vec3 vEmberWorldPos")) {
      shader.vertexShader =
        "varying vec3 vEmberWorldPos;\n" + shader.vertexShader;
    }
    const fragUniforms = `varying vec3 vEmberWorldPos;
uniform float emberVoxelLightSnap;
uniform float emberVoxelSize;
#if defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 )
	uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
#endif
#if defined( USE_SHADOWMAP ) && ( NUM_POINT_LIGHT_SHADOWS > 0 )
	uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
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
    } else if (
      !shader.fragmentShader.includes("uniform mat4 pointShadowMatrix")
    ) {
      // Older patched materials may already declare dir matrix — add point.
      shader.fragmentShader =
        `#if defined( USE_SHADOWMAP ) && ( NUM_POINT_LIGHT_SHADOWS > 0 )
	uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
#endif
` + shader.fragmentShader;
    }

    shader.vertexShader = injectVertexWorldVarying(shader.vertexShader);
    shader.fragmentShader = injectFragmentSnap(shader.fragmentShader);
  };
  material.customProgramCacheKey = () => `${prevKey()}|${CACHE_TAG}`;
  material.needsUpdate = true;
}
