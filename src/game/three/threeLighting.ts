/**
 * Map Ember light settings → Three.js lights.
 *
 * Canvas night used ambientColor/Alpha as a dark overlay on bright art.
 * Three AmbientLight uses the color as the light itself, so we remap:
 * fill stays readable; ambientAlpha deepens night; lamps scale with lampPower.
 * Global shadows come from the key DirectionalLight (sun/moon).
 * Play and editor both use one map-wide cached ortho; local PointLights add
 * light on top of the baked umbra. Do not fit a follow volume to the player.
 *
 * Per-lamp params mirror canvas flood (`lampStrengthAtDist`):
 * - lampRange → outer rim cutoff in tiles → PointLight.distance
 * - lampDiscCore / lampDiscMid → hard disc edges (packed into PointLight.decay)
 * - lampStrength0 → center brightness → intensity
 * - lampStrengthFalloff → mid-ring energy (canvas dist≥1) → gentler/harder decay
 * - lampColor / lampFaceColor → mixed PointLight tint
 */
import * as THREE from "three";
import type { EmberMap } from "../content/types";
import { WALL_HEIGHT } from "../tile/extruded";
import {
  listLanternSources,
  parseHexRgb,
  tileSurfaceElev,
  type ResolvedLanternParams,
  type ResolvedMapLight,
} from "../tile/mapUtils";
import { MAP_POINT_LIGHTS_MAX } from "../tile/lightLimits";
import { applyDirectionalShadowBias } from "./dynamicShadowPolicy";

export const THREE_MAX_LAMPS = 32;
/** Every authored lamp can keep a baked cube; dynamic updates stay pooled. */
export const THREE_MAX_LAMP_SHADOWS = MAP_POINT_LIGHTS_MAX;

/**
 * Pack core/mid fractions of cutoff into PointLight.decay for the toon
 * falloff shader (physical decay is unused — we use hard discs).
 * Layout: floor(pack) = round(coreT*1000), fract(pack) ≈ midT.
 * Soft rings add LAMP_DISC_SOFT_BIAS so the shader can smooth disc edges.
 */
export const LAMP_DISC_SOFT_BIAS = 2000;

export function packLampDiscDecay(
  coreT: number,
  midT: number,
  softRings = false,
): number {
  const c = Math.round(Math.max(0.001, Math.min(0.998, coreT)) * 1000);
  const m = Math.max(0.001, Math.min(0.999, midT));
  return (softRings ? LAMP_DISC_SOFT_BIAS : 0) + c + m;
}

export function lampDiscFractions(params: ResolvedLanternParams): {
  coreT: number;
  midT: number;
} {
  const range = Math.max(1, params.lampRange);
  const coreT = Math.max(0.001, Math.min(0.998, params.lampDiscCore / range));
  const midT = Math.max(coreT + 0.001, Math.min(0.999, params.lampDiscMid / range));
  return { coreT, midT };
}

export type ThreeLightBuildOpts = {
  map: EmberMap;
  light: ResolvedMapLight;
  center: THREE.Vector3;
  /** Include a soft key directional (editor readability). */
  keyLight?: boolean;
  /** Max lantern point lights. */
  maxLamps?: number;
  /** Max cube-shadow lanterns (default THREE_MAX_LAMP_SHADOWS). */
  maxShadows?: number;
  /** Global directional shadows (default true with keyLight). */
  shadows?: boolean;
  /** Shadow map resolution for the key light / lantern cubes. */
  shadowMapSize?: number;
  tileset: Parameters<typeof listLanternSources>[1];
  sprites?: Parameters<typeof listLanternSources>[2];
  /** Optional tile-space runtime window for local lamp streaming. */
  sourceBounds?: { x0: number; y0: number; x1: number; y1: number };
  /**
   * When set, cube-shadow slots go to lamps nearest this world-space point
   * (explore street lanterns). Default ranks by authored strength.
   */
  shadowFocus?: THREE.Vector3;
};

export type FillLightOpts = {
  keyLight?: boolean;
  mapDepth?: number;
  mapWidth?: number;
  shadows?: boolean;
  shadowMapSize?: number;
};

const DEG2RAD = Math.PI / 180;

/**
 * Unit direction TOWARD the sun from the map center.
 * Azimuth 0 = +X, 90 = +Z; elevation 0 = horizon, 90 = zenith.
 */
export function sunDirectionFromAngles(
  azimuthDeg: number,
  elevationDeg: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const az = azimuthDeg * DEG2RAD;
  const el = Math.max(5, Math.min(85, elevationDeg)) * DEG2RAD;
  const cosEl = Math.cos(el);
  return out.set(cosEl * Math.cos(az), Math.sin(el), cosEl * Math.sin(az));
}

function nightTint(light: ResolvedMapLight): THREE.Color {
  const rgb = parseHexRgb(light.ambientColor) ?? { r: 8, g: 6, b: 20 };
  // Lift so AmbientLight is never near-black even with night hex.
  return new THREE.Color(
    Math.max(0.22, (rgb.r / 255) * 3.2),
    Math.max(0.2, (rgb.g / 255) * 3.2),
    Math.max(0.28, (rgb.b / 255) * 3.2),
  );
}

function configureDirectionalShadow(
  key: THREE.DirectionalLight,
  center: THREE.Vector3,
  span: number,
  mapSize: number,
): void {
  key.castShadow = true;
  const res = Math.max(128, Math.min(1024, mapSize));
  key.shadow.mapSize.set(res, res);
  applyDirectionalShadowBias(key);
  // Tight ortho → more texels per world unit → fewer stair-step umbras.
  const half = Math.max(40, span * 0.52 + 16);
  const cam = key.shadow.camera;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  const lightDist = key.position.distanceTo(center);
  cam.near = Math.max(0.5, lightDist * 0.15);
  cam.far = Math.max(120, lightDist + half * 1.35);
  cam.updateProjectionMatrix();
  key.target.position.copy(center);
  key.target.updateMatrixWorld();
}

/** Ambient + hemisphere (+ optional key with global soft shadows). */
export function addThreeFillLights(
  root: THREE.Object3D,
  light: ResolvedMapLight,
  center: THREE.Vector3,
  opts?: FillLightOpts,
): THREE.DirectionalLight | null {
  const night = light.ambientAlpha;
  const fillMul = light.fillIntensity;
  const shadows = opts?.shadows !== false && Boolean(opts?.keyLight);

  const day = new THREE.Color(0.92, 0.88, 0.82);
  const tint = nightTint(light);
  const fillColor = day.clone().lerp(tint, Math.min(1, night * 0.9));

  // Keep fill dim — MeshToon needs a dominant key for hard cel bands.
  // Floor the shadow dim a bit so night + cloud multiply can't crush terrain
  // to a void while MeshBasic lamp cores / water mirrors still pop.
  const shadowDim = shadows ? 0.4 : 0.55;
  const ambIntensity = (0.26 - night * 0.1) * fillMul * shadowDim;
  root.add(new THREE.AmbientLight(fillColor, Math.max(0.04, ambIntensity)));

  const hemiSky = new THREE.Color(0x6a7a98).lerp(tint, night * 0.6);
  const hemiGround = new THREE.Color(0x3a2818).lerp(tint, night * 0.4);
  root.add(
    new THREE.HemisphereLight(
      hemiSky,
      hemiGround,
      Math.max(0.02, (0.1 - night * 0.04) * fillMul * shadowDim),
    ),
  );

  if (!opts?.keyLight) return null;

  const sunRgb = parseHexRgb(light.sunColor) ?? { r: 255, g: 228, b: 200 };
  const sunCol = new THREE.Color(sunRgb.r / 255, sunRgb.g / 255, sunRgb.b / 255);
  const sunMul = Math.max(0, light.sunIntensity);
  const key = new THREE.DirectionalLight(
    sunCol,
    Math.max(0.05, (2.55 - night * 0.45) * fillMul * sunMul),
  );
  const depth = opts.mapDepth ?? 200;
  const width = opts.mapWidth ?? depth;
  const span = Math.max(width, depth);
  // Closer high sun → better shadow-map depth precision than a distant light.
  const sunDist = Math.max(80, span * 0.72);
  const dir = sunDirectionFromAngles(light.sunAzimuth, light.sunElevation);
  key.position.set(
    center.x + sunDist * dir.x,
    center.y + sunDist * dir.y + WALL_HEIGHT,
    center.z + sunDist * dir.z,
  );
  root.add(key);
  root.add(key.target);
  if (shadows) {
    const res = opts.shadowMapSize ?? (span > 900 ? 4096 : 2048);
    configureDirectionalShadow(key, center, span, res);
  }
  return key;
}

/** Pack per-lamp disc radii into PointLight.decay for the falloff shader. */
export function lampPointDecay(params: ResolvedLanternParams): number {
  const { coreT, midT } = lampDiscFractions(params);
  return packLampDiscDecay(coreT, midT);
}

/** Hard cutoff in world units = range tiles × tileSize (matches editor ring). */
export function lampPointDistance(
  tileSize: number,
  rangeTiles: number,
): number {
  const ts = Math.max(1, tileSize);
  const r = Math.max(1, Math.round(rangeTiles));
  return r * ts;
}

/** Overall lamp candela — disc steps live in the material falloff patch. */
export function lampPointIntensity(
  light: ResolvedMapLight,
  params: Pick<
    ResolvedLanternParams,
    "lampStrength0" | "lampStrengthFalloff"
  >,
): number {
  const strength0 = Math.max(0, Math.min(1, params.lampStrength0));
  const falloff = Math.max(0, Math.min(1, params.lampStrengthFalloff));
  const nightBoost = 1 + light.ambientAlpha * 0.55;
  // Keep moderate so hard mid/rim discs stay in distinct MeshToon bands
  // instead of crushing into one saturated core.
  return (
    (7 + strength0 * 16) *
    (0.7 + falloff * 0.55) *
    light.lampPower *
    nightBoost
  );
}

export function lampPointColor(params: ResolvedLanternParams): THREE.Color {
  const floor = parseHexRgb(params.lampColor) ?? { r: 255, g: 170, b: 70 };
  const face = parseHexRgb(params.lampFaceColor) ?? floor;
  // Canvas split floor/walls; one PointLight → mix so both swatches matter.
  return new THREE.Color(
    (floor.r * 0.62 + face.r * 0.38) / 255,
    (floor.g * 0.62 + face.g * 0.38) / 255,
    (floor.b * 0.62 + face.b * 0.38) / 255,
  );
}

/** Point lights + small emissive cores for placed/implicit lanterns. */
export function addThreeLanternLights(
  root: THREE.Object3D,
  opts: ThreeLightBuildOpts,
): THREE.PointLight[] {
  const {
    map,
    light,
    tileset,
    sprites,
    maxLamps = THREE_MAX_LAMPS,
  } = opts;
  const shadows = opts.shadows !== false;
  const maxShadows = Math.max(
    0,
    Math.min(
      THREE_MAX_LAMP_SHADOWS,
      opts.maxShadows ?? THREE_MAX_LAMP_SHADOWS,
    ),
  );
  const lampShadowMap = Math.max(128, opts.shadowMapSize ?? 1024);
  const allLamps = listLanternSources(map, tileset, sprites);
  const lamps = opts.sourceBounds
    ? allLamps.filter(
        (lamp) =>
          lamp.x >= opts.sourceBounds!.x0 &&
          lamp.y >= opts.sourceBounds!.y0 &&
          lamp.x < opts.sourceBounds!.x1 &&
          lamp.y < opts.sourceBounds!.y1,
      )
    : allLamps;
  const storyH = WALL_HEIGHT;
  const ts = map.tileSize;
  const outLights: THREE.PointLight[] = [];

  const enableLampShadow = (pl: THREE.PointLight, mapSize: number) => {
    pl.castShadow = true;
    pl.shadow.mapSize.set(mapSize, mapSize);
    // Seal umbra fully — any intensity < 1 lets disc rings bleed past walls.
    pl.shadow.bias = -0.0002;
    // A tile-relative 0.01 normalBias was larger than a voxel on common maps,
    // detaching or fully erasing self-shadow on small lamp props.
    pl.shadow.normalBias = Math.max(0.035, Math.min(0.1, ts * 0.005));
    pl.shadow.camera.near = Math.max(0.08, Math.min(0.25, ts * 0.0125));
    // Bake static occluders beyond the largest torch rim. The live cutoff can
    // breathe inside this fixed volume without rebuilding six cube faces.
    pl.shadow.camera.far = Math.max(pl.distance * 1.5, ts * 2);
    pl.shadow.camera.updateProjectionMatrix();
    pl.shadow.radius = 0; // hard umbra with BasicShadowMap
    pl.shadow.intensity = 1;
  };

  const addLamp = (
    sourceId: string,
    params: ResolvedLanternParams,
    x: number,
    floorY: number,
    z: number,
    withShadow: boolean,
    seed: number,
  ) => {
    const color = lampPointColor(params);
    const distance = lampPointDistance(ts, params.lampRange);
    const decay = lampPointDecay(params);
    const intensity = lampPointIntensity(light, params);
    const heightTiles = Math.max(0.2, Math.min(3, params.lampHeight));
    const lightY = floorY + heightTiles * ts;
    const discs = lampDiscFractions(params);

    // One shadow-casting light; disc edges packed into decay (core/mid tiles).
    const pl = new THREE.PointLight(color, intensity, distance, decay);
    pl.position.set(x, lightY, z);
    const lampUd: Record<string, unknown> = {
      sourceId,
      rangeTiles: params.lampRange,
      discCoreTiles: params.lampDiscCore,
      discMidTiles: params.lampDiscMid,
      heightTiles,
      showCore: params.lampShowCore,
      coreT: discs.coreT,
      midT: discs.midT,
      strength0: params.lampStrength0,
      falloff: params.lampStrengthFalloff,
      distance,
      intensity,
      torchFlicker: params.lampTorchFlicker,
      seed,
    };
    pl.userData.emberLamp = lampUd;
    pl.userData.emberShadowRequested = shadows;
    if (withShadow) enableLampShadow(pl, lampShadowMap);
    root.add(pl);
    outLights.push(pl);

    if (params.lampShowCore) {
      // Box + toneMapped: spheres were bloom bombs; boxes read as voxel lamps
      // in both the main view and the planar water mirror.
      const coreMat = new THREE.MeshBasicMaterial({
        color: color.clone().multiplyScalar(0.85),
        toneMapped: true,
      });
      const coreSize = Math.max(1.1, ts * 0.14);
      const core = new THREE.Mesh(
        new THREE.BoxGeometry(coreSize, coreSize, coreSize),
        coreMat,
      );
      core.position.set(x, lightY, z);
      core.castShadow = false;
      core.userData.emberLampCore = true;
      root.add(core);
      lampUd.coreMat = coreMat;
      lampUd.coreBase = color.clone();
      lampUd.coreMesh = core;
    }
  };

  // No authored/implicit sources means no local PointLight. Older builds
  // spawned a synthetic lamp at map center here; it was absent from map data,
  // impossible to select and appeared immediately after deleting the last
  // real source.
  if (allLamps.length === 0) return outLights;

  // Strongest lamps first get the scarce shadow slots, unless explore
  // streaming asked for nearest-to-player street cubes.
  const ranked = [...lamps].sort((a, b) => {
    if (opts.shadowFocus) {
      const focus = opts.shadowFocus;
      const ax = (a.x + 0.5) * ts - focus.x;
      const az = (a.y + 0.5) * ts - focus.z;
      const bx = (b.x + 0.5) * ts - focus.x;
      const bz = (b.y + 0.5) * ts - focus.z;
      return ax * ax + az * az - (bx * bx + bz * bz);
    }
    return b.params.lampStrength0 - a.params.lampStrength0;
  });

  let shadowSlots = shadows ? maxShadows : 0;
  for (const lamp of ranked.slice(0, maxLamps)) {
    const elev = lamp.elev ?? tileSurfaceElev(map, lamp.x, lamp.y);
    const withShadow = shadowSlots > 0;
    if (withShadow) shadowSlots -= 1;
    const floorY = elev * storyH;
    const seed =
      ((lamp.x * 73856093) ^ (lamp.y * 19349663) ^ lamp.id.length * 83492791) |
      0;
    addLamp(
      lamp.id,
      lamp.params,
      (lamp.x + 0.5) * ts,
      floorY,
      (lamp.y + 0.5) * ts,
      withShadow,
      seed,
    );
  }

  return outLights;
}
