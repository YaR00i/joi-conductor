/**
 * Ember water: thin transparent slab + pixel planar scene reflection.
 *
 * Lit MeshToon so lantern / emissive PointLights fall on the surface.
 * Short axis-aligned glints spawn at random sites and flash in place;
 * mild emissive on glints/foam feeds UnrealBloom. Shore foam width swells.
 * Planar mirror gets a tiny stepped texel warp so reflections feel alive.
 * Shore edges also spawn a vertical depth wall that fades with depth.
 */
import * as THREE from "three";
import type { EmberTilesetTile } from "../content/types";
import { resolveWaterReflectMult } from "./envMap";
import { installEmberLampDiscFalloff } from "./lampDiscFalloff";
import { getToonGradientMap, resolveTileOpacity } from "./toonMaterials";
import { patchEmberVoxelLightSnap } from "./voxelLightSnap";

type WaterUniforms = {
  time: { value: number };
  tint: { value: THREE.Color };
  opacity: { value: number };
  reflectCell: { value: number };
  tileSize: { value: number };
  stripeAxis: { value: number }; // 0 = X (vertical bands), 1 = Z (horizontal)
  glintBright: { value: number };
  warpStrength: { value: number };
  warpSpeed: { value: number };
  reflectMap: { value: THREE.Texture | null };
  reflectMatrix: { value: THREE.Matrix4 };
  reflectSize: { value: THREE.Vector2 };
  reflectEnabled: { value: number };
};

const DEFAULT_WATER_OPACITY = 0.38;
const DEFAULT_WATER_GLINT_BRIGHT = 1;
const DEFAULT_WATER_WARP_STRENGTH = 1;
const DEFAULT_WATER_WARP_SPEED = 1;

export type WaterMaterialOpts = {
  voxelSize: number;
  tileSize?: number;
  stripeAxis?: "x" | "z";
};

export function isWaterTile(tile: EmberTilesetTile | undefined): boolean {
  if (!tile) return false;
  const name = tile.name.toLowerCase();
  return name === "water" || name.includes("water_") || name.includes("_water");
}

/** Clamp authored glint brightness (0 = off, 1 = default, 2 = hot). */
export function resolveWaterGlintBright(raw: unknown): number {
  const n =
    typeof raw === "number" && Number.isFinite(raw)
      ? raw
      : DEFAULT_WATER_GLINT_BRIGHT;
  return Math.max(0, Math.min(2, n));
}

/** Reflection ripple amplitude in texels (0…3). */
export function resolveWaterWarpStrength(raw: unknown): number {
  const n =
    typeof raw === "number" && Number.isFinite(raw)
      ? raw
      : DEFAULT_WATER_WARP_STRENGTH;
  return Math.max(0, Math.min(3, n));
}

/** Reflection ripple speed multiplier (0…3). */
export function resolveWaterWarpSpeed(raw: unknown): number {
  const n =
    typeof raw === "number" && Number.isFinite(raw)
      ? raw
      : DEFAULT_WATER_WARP_SPEED;
  return Math.max(0, Math.min(3, n));
}

function waterCacheKey(
  tile: EmberTilesetTile,
  voxelSize: number,
  axis: "x" | "z",
): string {
  const op = resolveTileOpacity({
    ...tile,
    opacity: tile.opacity ?? DEFAULT_WATER_OPACITY,
  });
  const rm = resolveWaterReflectMult(tile.waterReflectMult);
  const gb = resolveWaterGlintBright(tile.waterGlintBright);
  const ws = resolveWaterWarpStrength(tile.waterWarpStrength);
  const wp = resolveWaterWarpSpeed(tile.waterWarpSpeed);
  return `ember-water-toon-v30:${tile.id}:op${op.toFixed(3)}:rm${rm}:gb${gb.toFixed(2)}:ws${ws.toFixed(2)}:wp${wp.toFixed(2)}:vs${voxelSize.toFixed(4)}:ax${axis}`;
}

export function createWaterMaterial(
  albedo: THREE.Texture,
  tile: EmberTilesetTile,
  opts: WaterMaterialOpts,
): THREE.MeshToonMaterial {
  installEmberLampDiscFalloff();

  const opacity = resolveTileOpacity({
    ...tile,
    opacity: tile.opacity ?? DEFAULT_WATER_OPACITY,
  });
  const reflectMult = resolveWaterReflectMult(tile.waterReflectMult);
  const voxelSize = Math.max(1e-3, opts.voxelSize);
  const tileSize = Math.max(1, opts.tileSize ?? voxelSize * 16);
  const stripeAxis = opts.stripeAxis === "z" ? "z" : "x";
  const reflectCell = voxelSize / reflectMult;
  const glintBright = resolveWaterGlintBright(tile.waterGlintBright);
  const warpStrength = resolveWaterWarpStrength(tile.waterWarpStrength);
  const warpSpeed = resolveWaterWarpSpeed(tile.waterWarpSpeed);

  const uniforms: WaterUniforms = {
    time: { value: 0 },
    tint: { value: new THREE.Color(tile.color || "#2aa6c2") },
    opacity: { value: opacity },
    reflectCell: { value: reflectCell },
    tileSize: { value: tileSize },
    stripeAxis: { value: stripeAxis === "z" ? 1 : 0 },
    glintBright: { value: glintBright },
    warpStrength: { value: warpStrength },
    warpSpeed: { value: warpSpeed },
    reflectMap: { value: null },
    reflectMatrix: { value: new THREE.Matrix4() },
    reflectSize: { value: new THREE.Vector2(128, 96) },
    reflectEnabled: { value: 0 },
  };

  const mat = new THREE.MeshToonMaterial({
    map: albedo,
    color: 0x7a9eae,
    gradientMap: getToonGradientMap(4),
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    // Base emissive off — glints add per-pixel bloom in the shader.
    emissive: new THREE.Color(0x6eb8e8),
    emissiveIntensity: 0,
  });
  mat.userData.emberWaterUniforms = uniforms;
  mat.userData.emberTransparentTile = true;
  mat.userData.emberWaterVoxelSize = voxelSize;
  mat.userData.emberWaterReflectMult = reflectMult;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.emberWaterTime = uniforms.time;
    shader.uniforms.emberWaterTint = uniforms.tint;
    shader.uniforms.emberWaterOpacity = uniforms.opacity;
    shader.uniforms.emberWaterReflectCell = uniforms.reflectCell;
    shader.uniforms.emberWaterTileSize = uniforms.tileSize;
    shader.uniforms.emberWaterStripeAxis = uniforms.stripeAxis;
    shader.uniforms.emberWaterGlintBright = uniforms.glintBright;
    shader.uniforms.emberWaterWarpStrength = uniforms.warpStrength;
    shader.uniforms.emberWaterWarpSpeed = uniforms.warpSpeed;
    shader.uniforms.emberWaterReflectMap = uniforms.reflectMap;
    shader.uniforms.emberWaterReflectMatrix = uniforms.reflectMatrix;
    shader.uniforms.emberWaterReflectSize = uniforms.reflectSize;
    shader.uniforms.emberWaterReflectEnabled = uniforms.reflectEnabled;

    shader.vertexShader =
      "attribute float emberShore;\nattribute float emberWaterDepth;\nvarying vec3 vEmberWaterWorld;\nvarying float vEmberShore;\nvarying float vEmberWaterDepth;\n" +
      shader.vertexShader;
    if (shader.vertexShader.includes("#include <project_vertex>")) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <project_vertex>",
        `#include <project_vertex>
	vEmberWaterWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
	vEmberShore = emberShore;
	vEmberWaterDepth = emberWaterDepth;`,
      );
    }

    shader.fragmentShader =
      `uniform float emberWaterTime;
uniform vec3 emberWaterTint;
uniform float emberWaterOpacity;
uniform float emberWaterReflectCell;
uniform float emberWaterTileSize;
uniform float emberWaterStripeAxis;
uniform float emberWaterGlintBright;
uniform float emberWaterWarpStrength;
uniform float emberWaterWarpSpeed;
uniform sampler2D emberWaterReflectMap;
uniform mat4 emberWaterReflectMatrix;
uniform vec2 emberWaterReflectSize;
uniform float emberWaterReflectEnabled;
varying vec3 vEmberWaterWorld;
varying float vEmberShore;
varying float vEmberWaterDepth;

float emberWaterHash(vec2 p) {
	return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}

vec3 emberSamplePlanarReflect(vec3 worldPos, vec2 texelOff) {
	if ( emberWaterReflectEnabled < 0.5 ) return vec3( 0.0 );
	vec4 coord = emberWaterReflectMatrix * vec4( worldPos, 1.0 );
	float w = max( abs( coord.w ), 1e-4 );
	vec2 uv = coord.xy / w;
	vec2 res = max( emberWaterReflectSize, vec2( 8.0 ) );

	// Living ripple: strength = max texel offset, speed = step rate.
	float _amp = max( emberWaterWarpStrength, 0.0 );
	float _spd = max( emberWaterWarpSpeed, 0.0 ) * 1.8;
	float _rippleCell = max( emberWaterReflectCell * 3.0, emberWaterTileSize * 0.12 );
	vec2 _rCell = floor( worldPos.xz / _rippleCell );
	float _tick = floor( emberWaterTime * max( _spd, 1e-4 ) );
	float _hx = emberWaterHash( _rCell + vec2( _tick, 0.7 ) );
	float _hz = emberWaterHash( _rCell + vec2( 3.1, _tick * 0.37 ) );
	float _hx2 = emberWaterHash( _rCell + vec2( _tick + 1.0, 1.9 ) );
	float _hz2 = emberWaterHash( _rCell + vec2( 5.3, ( _tick + 1.0 ) * 0.37 ) );
	float _blend = _spd < 1e-4 ? 0.0 : fract( emberWaterTime * _spd );
	// Quantized offset in [-amp, +amp] texels (0 = flat mirror).
	vec2 _offA = vec2(
		floor( ( _hx * 2.0 - 1.0 ) * _amp + 0.5 ),
		floor( ( _hz * 2.0 - 1.0 ) * _amp + 0.5 )
	);
	vec2 _offB = vec2(
		floor( ( _hx2 * 2.0 - 1.0 ) * _amp + 0.5 ),
		floor( ( _hz2 * 2.0 - 1.0 ) * _amp + 0.5 )
	);
	vec2 _warp = _amp < 1e-4 ? vec2( 0.0 ) : mix( _offA, _offB, step( 0.5, _blend ) );

	uv = ( floor( uv * res ) + texelOff + _warp + 0.5 ) / res;
	if ( uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0 ) return vec3( 0.0 );
	vec3 c = texture2D( emberWaterReflectMap, uv ).rgb;
	float luma = max( c.r, max( c.g, c.b ) );
	// Keep dim night sky / moon (was 0.035 — ate lunar disc after RT quantize).
	if ( luma < 0.018 ) return vec3( 0.0 );
	c *= 1.35;
	float g = dot( c, vec3( 0.299, 0.587, 0.114 ) );
	c = mix( vec3( g ), c, 1.22 );
	return clamp( c, 0.0, 1.7 );
}
` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
	// Pixel-scale reflection sample (must NOT use stripe cell size).
	float _rCell = max( emberWaterReflectCell, 1e-4 );
	vec2 _rxy = floor( vEmberWaterWorld.xz / _rCell );
	vec2 _rSnap = ( _rxy + 0.5 ) * _rCell;
	vec3 emberPlanar = emberSamplePlanarReflect(
		vec3( _rSnap.x, vEmberWaterWorld.y, _rSnap.y ),
		vec2( 0.0 )
	);
	float emberPlanarLuma = max( emberPlanar.r, max( emberPlanar.g, emberPlanar.b ) );

	// Sparse random glints scattered in 2D (axis only sets short streak direction).
	float _cell = max( _rCell * 2.0, emberWaterTileSize * 0.06 );
	vec2 _cxy = floor( vEmberWaterWorld.xz / _cell );
	float _across = mix( _cxy.x, _cxy.y, emberWaterStripeAxis );
	float _along = mix( _cxy.y, _cxy.x, emberWaterStripeAxis );

	float _spawnTick = floor( emberWaterTime * 0.4 );
	float _glen = 5.0;
	float _alongBin = floor( _along / _glen );

	float _id = emberWaterHash( vec2( _across * 19.7 + _alongBin * 7.3, _spawnTick + 4.1 ) );
	float _spawn = step( 0.9, _id );

	float _center = floor( emberWaterHash( vec2( _id, 2.7 ) ) * _glen );
	float _alongLocal = mod( _along, _glen );
	float _d = abs( _alongLocal - _center );
	float _streak = ( 1.0 - smoothstep( 0.0, 1.25, _d ) ) * step( _d, 1.25 );

	float _life = fract( emberWaterTime * 0.4 + emberWaterHash( vec2( _across, _alongBin + 11.0 ) ) );
	float _flash = smoothstep( 0.0, 0.22, _life ) * smoothstep( 1.0, 0.48, _life );
	float _phase = _id * 6.28318;
	_flash *= 0.6 + 0.4 * ( 0.5 + 0.5 * sin( emberWaterTime * 2.4 + _phase ) );

	float _stripeStr = _spawn * _streak * _flash;

	vec3 emberView = normalize( cameraPosition - vEmberWaterWorld );
	float emberFresnel = pow( 1.0 - clamp( abs( emberView.y ), 0.0, 1.0 ), 1.6 );

	// Albedo for MeshToon lighting (PointLights / sun / ambient).
	vec3 emberBody = mix( diffuseColor.rgb, emberWaterTint, 0.62 );
	emberBody *= 0.72; // keep surface receptive but not blown out
	emberBody = mix( emberBody, mix( emberWaterTint, vec3( 0.78, 0.93, 1.0 ), 0.45 ), _stripeStr * 0.28 );

	float _shoreDist = clamp( vEmberShore, 0.0, 1.0 );
	float _alongShore = mix( vEmberWaterWorld.z, vEmberWaterWorld.x, emberWaterStripeAxis );
	float _widthCell = floor( _alongShore / max( emberWaterTileSize * 0.55, 3.0 ) );
	float _widthFrame = floor( emberWaterTime * 1.1 );
	float _widthRnd = emberWaterHash( vec2( _widthCell, _widthFrame ) );
	float _widthTh = mix( 0.28, 0.58, floor( _widthRnd * 3.0 ) / 3.0 );
	float _foamMask = step( _widthTh, _shoreDist );
	float _foamGlow = 0.82 + 0.18 * step( 0.65, emberWaterHash( vec2( _widthCell, floor( emberWaterTime * 2.0 ) ) ) );
	float _foamPix = _foamMask * _foamGlow;
	// Depth walls: no shore foam.
	float _isDepthWall = step( 0.02, vEmberWaterDepth );
	_foamPix *= 1.0 - _isDepthWall;
	emberBody = mix( emberBody, vec3( 0.9, 0.97, 1.0 ), _foamPix * 0.4 );
	// Deeper = darker / more opaque near surface, fades out toward bottom.
	emberBody = mix( emberBody, emberWaterTint * 0.45, _isDepthWall * vEmberWaterDepth * 0.55 );

	float planarW = emberWaterReflectEnabled * (
		0.44 + emberFresnel * 0.36 + _stripeStr * 0.1 - _foamMask * 0.16
	);
	planarW = clamp( planarW, 0.0, 0.88 );
	planarW *= 1.0 - _isDepthWall; // walls are volume, not a mirror

	diffuseColor.rgb = emberBody;
	float emberOp = emberWaterOpacity * mix( 0.78, 0.9, 0.5 + _stripeStr * 0.12 + _foamPix * 0.06 );
	// Depth fade: visible near surface, almost gone at the bottom of the wall.
	float _depthFade = mix( 1.0, pow( 1.0 - clamp( vEmberWaterDepth, 0.0, 1.0 ), 1.35 ), _isDepthWall );
	emberOp = mix( emberOp, emberWaterOpacity * 0.95 * _depthFade, _isDepthWall );
	diffuseColor.a = clamp(
		max( emberOp, max( emberPlanarLuma * planarW * 0.7, _foamPix * 0.35 ) ),
		0.0,
		1.0
	);`,
    );

    // Dim lit body + light-weighted glints in one place (reliable vs include patches).
    shader.fragmentShader = shader.fragmentShader.replace(
      "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;",
      `vec3 _direct = reflectedLight.directDiffuse;
	vec3 _indirect = reflectedLight.indirectDiffuse;
	// Lamp strength only (ignore ambient/hemi — that was lighting glints everywhere).
	vec3 _alb = max( diffuseColor.rgb, vec3( 0.06 ) );
	float _irr = dot( _direct / _alb, vec3( 0.299, 0.587, 0.114 ) );
	// Hard floor: ambient-only areas stay near 0; real PointLight discs climb up.
	float _lightStr = smoothstep( 0.35, 1.4, _irr );

	vec3 _litBody = ( _direct + _indirect ) * 0.34;
	// Base glint stays faint; brightness comes almost only from _lightStr.
	float _glintMul = max( emberWaterGlintBright, 0.0 );
	float _glintLit = _stripeStr * mix( 0.08, 1.0, _lightStr ) * _glintMul * ( 1.0 - step( 0.02, vEmberWaterDepth ) );
	float _foamLit = _foamPix * mix( 0.2, 0.85, _lightStr ) * mix( 0.5, 1.0, min( _glintMul, 1.0 ) );

	totalEmissiveRadiance += vec3( 0.75, 0.95, 1.2 ) * ( _glintLit * 1.8 + _foamLit * 0.2 );
	vec3 outgoingLight = _litBody + totalEmissiveRadiance;
	float _planarKeep = planarW * ( 1.0 - clamp( _glintLit * 0.75, 0.0, 0.85 ) );
	outgoingLight = mix( outgoingLight, emberPlanar, _planarKeep );
	outgoingLight += vec3( 1.05, 1.2, 1.35 ) * _glintLit * 1.55;
	outgoingLight += vec3( 0.85, 0.95, 1.05 ) * _foamLit * 0.15;`,
    );
  };

  mat.customProgramCacheKey = () => waterCacheKey(tile, voxelSize, stripeAxis);
  patchEmberVoxelLightSnap(mat);
  mat.needsUpdate = true;
  return mat;
}

export function collectWaterMaterials(root: THREE.Object3D): THREE.Material[] {
  const mats: THREE.Material[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const material = obj.material;
    const list = Array.isArray(material) ? material : [material];
    for (const mat of list) {
      if (mat?.userData.emberWaterUniforms) mats.push(mat);
    }
  });
  return mats;
}

/** Stale meshes (pre-shore / pre-depth) lack attrs — bind zeros so the shader can compile. */
export function ensureWaterShoreAttributes(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    if (!list.some((m) => m?.userData?.emberWaterUniforms)) return;
    const geom = obj.geometry;
    const n = geom.getAttribute("position")?.count ?? 0;
    if (n <= 0) return;
    if (!geom.getAttribute("emberShore")) {
      geom.setAttribute(
        "emberShore",
        new THREE.BufferAttribute(new Float32Array(n), 1),
      );
    }
    if (!geom.getAttribute("emberWaterDepth")) {
      geom.setAttribute(
        "emberWaterDepth",
        new THREE.BufferAttribute(new Float32Array(n), 1),
      );
    }
  });
}

export function maxWaterReflectMult(mats: readonly THREE.Material[]): number {
  let m = 1;
  for (const mat of mats) {
    const v = mat.userData.emberWaterReflectMult;
    if (typeof v === "number" && v > m) m = v;
  }
  return m;
}

export function tickWaterMaterials(
  mats: readonly THREE.Material[],
  timeSec: number,
): void {
  for (const mat of mats) {
    const uniforms = mat.userData.emberWaterUniforms as
      | WaterUniforms
      | undefined;
    if (!uniforms) continue;
    uniforms.time.value = timeSec;
  }
}
