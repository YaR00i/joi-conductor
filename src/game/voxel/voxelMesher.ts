/**
 * Culled-face mesher: only emit quads where a neighbor is empty.
 * Avoids internal coplanar faces (z-fighting mottling on solid blocks).
 */
import * as THREE from "three";
import type { EmberVoxelModel } from "../content/types";
import { getEmberEnvMap } from "../three/envMap";
import { patchEmberLampDiscFalloff } from "../three/lampDiscFalloff";
import {
  normalizeEmberMaterial,
  resolveMaterialResponse,
} from "../three/materialPresets";
import { patchStandardPlanarReflect } from "../three/planarReflectMaterial";
import {
  applyShineColorKeep,
  getShineColorKeep,
} from "../three/shineColorKeep";
import { getToonGradientMap } from "../three/toonMaterials";
import { patchEmberVoxelLightSnap } from "../three/voxelLightSnap";
import { parseHexRgb } from "../tile/mapUtils";
import { VOXELS_PER_BLOCK } from "./constants";
import { normalizeVoxelModel, voxelGridSize, voxelIndex } from "./voxelModel";

/** Must stay unique vs lampDiscFalloff cache key (overwrites after patch). */
const VOXEL_PROP_LIGHT_CACHE_KEY = "ember-lamp-discs-v5-voxel-prop-light-v2";

/** Default MeshToon direct-light scale for map props (avoids lantern blowout). */
export const DEFAULT_VOXEL_DIRECT_LIGHT_SCALE = 0.42;

export function clampVoxelDirectLightScale(
  value: number | undefined | null,
): number {
  if (value == null || !Number.isFinite(value)) {
    return DEFAULT_VOXEL_DIRECT_LIGHT_SCALE;
  }
  return Math.max(0.05, Math.min(1.5, value));
}

export type BuildVoxelMeshOpts = {
  /** Direct lamp response; omit for model material / default. Use `1` in sculpt studio. */
  directLightScale?: number;
  /**
   * 0..1 how much to preserve base color under shine (softens metalness crush).
   * Omit to use `getShineColorKeep()` (localStorage / default).
   */
  shineColorKeep?: number;
  /**
   * When true, no mesh casts shadows. Only for sealed cages that would
   * otherwise trap an interior PointLight (opt-in via model flag).
   */
  suppressCastShadow?: boolean;
};

function hexColor(hex: string, fallback = 0x888888): THREE.Color {
  const rgb = parseHexRgb(hex);
  if (!rgb) return new THREE.Color(fallback);
  return new THREE.Color(rgb.r / 255, rgb.g / 255, rgb.b / 255);
}

/** Quantize 0..255 emission into a few material bands. */
function emissiveBand(amount: number): number {
  if (amount <= 0) return 0;
  if (amount < 64) return 1;
  if (amount < 128) return 2;
  if (amount < 192) return 3;
  return 4;
}

function bandIntensity(band: number): number {
  // Hot bands so UnrealBloom / night scenes read a clear halo.
  switch (band) {
    case 1:
      return 0.9;
    case 2:
      return 1.6;
    case 3:
      return 2.6;
    case 4:
      return 3.8;
    default:
      return 0;
  }
}

/** Shine 0..255 → metalness / roughness / env intensity (before color-keep). */
function shineParams(band: number): {
  metalness: number;
  roughness: number;
  envMapIntensity: number;
} {
  switch (band) {
    case 1:
      return { metalness: 0.12, roughness: 0.52, envMapIntensity: 0.4 };
    case 2:
      return { metalness: 0.28, roughness: 0.34, envMapIntensity: 0.7 };
    case 3:
      return { metalness: 0.48, roughness: 0.18, envMapIntensity: 1.05 };
    case 4:
      return { metalness: 0.62, roughness: 0.1, envMapIntensity: 1.3 };
    default:
      return { metalness: 0, roughness: 1, envMapIntensity: 0 };
  }
}

type FaceBucket = {
  positions: number[];
  normals: number[];
  indices: number[];
};

const FACES: ReadonlyArray<{
  /** Neighbor offset. */
  dx: number;
  dy: number;
  dz: number;
  /** Quad corners in voxel-local [0..1] space (CCW, outward). */
  corners: ReadonlyArray<readonly [number, number, number]>;
  nx: number;
  ny: number;
  nz: number;
}> = [
  {
    dx: 1,
    dy: 0,
    dz: 0,
    nx: 1,
    ny: 0,
    nz: 0,
    corners: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  {
    dx: -1,
    dy: 0,
    dz: 0,
    nx: -1,
    ny: 0,
    nz: 0,
    corners: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
  },
  {
    dx: 0,
    dy: 1,
    dz: 0,
    nx: 0,
    ny: 1,
    nz: 0,
    corners: [
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
    ],
  },
  {
    dx: 0,
    dy: -1,
    dz: 0,
    nx: 0,
    ny: -1,
    nz: 0,
    corners: [
      [0, 0, 1],
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
    ],
  },
  {
    dx: 0,
    dy: 0,
    dz: 1,
    nx: 0,
    ny: 0,
    nz: 1,
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  {
    dx: 0,
    dy: 0,
    dz: -1,
    nx: 0,
    ny: 0,
    nz: -1,
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
];

/** Opaque enough to occlude a neighbor face (≥ mid transparency = see-through). */
const OCCLUSION_TRANSPARENCY_MAX = 127;

function solidAt(
  voxels: number[],
  transparency: number[] | undefined,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
): boolean {
  if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return false;
  const i = x + z * sx + y * sx * sz;
  if ((voxels[i] ?? 0) <= 0) return false;
  // Highly transparent cells do not seal faces / block light visually.
  return (transparency?.[i] ?? 0) <= OCCLUSION_TRANSPARENCY_MAX;
}

function opacityFromTransparency(amount: number): number {
  const t = Math.max(0, Math.min(255, amount)) / 255;
  // Keep a little body so glass still reads at 255.
  return Math.max(0.08, 1 - t * 0.92);
}

function pushFace(
  bucket: FaceBucket,
  x: number,
  y: number,
  z: number,
  voxelWorld: number,
  face: (typeof FACES)[number],
): void {
  const base = bucket.positions.length / 3;
  for (const [lx, ly, lz] of face.corners) {
    bucket.positions.push(
      (x + lx) * voxelWorld,
      (y + ly) * voxelWorld,
      (z + lz) * voxelWorld,
    );
    bucket.normals.push(face.nx, face.ny, face.nz);
  }
  bucket.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

export type VoxelMeshBuild = {
  group: THREE.Group;
  /** World size of one voxel cell when placed on a map with given tileSize. */
  voxelWorld: number;
};

/**
 * Build a mesh for a voxel model.
 * `blockWorld` = world units per map block (usually map.tileSize).
 */
export function buildVoxelModelMesh(
  modelIn: EmberVoxelModel,
  blockWorld: number,
  opts?: BuildVoxelMeshOpts,
): VoxelMeshBuild {
  const model = normalizeVoxelModel(modelIn);
  const { sx, sy, sz } = voxelGridSize(model);
  const voxelWorld = blockWorld / VOXELS_PER_BLOCK;
  const matKind = normalizeEmberMaterial(model.material);
  const matResponse = matKind
    ? resolveMaterialResponse(matKind)
    : null;
  const directLightScale = clampVoxelDirectLightScale(
    opts?.directLightScale ??
      matResponse?.directLightScale ??
      DEFAULT_VOXEL_DIRECT_LIGHT_SCALE,
  );
  // Placement may override model; when omitted, sealed cages opt out of casting.
  const suppressCastShadow =
    opts?.suppressCastShadow !== undefined
      ? opts.suppressCastShadow
      : model.emissiveSuppressHostShadow === true;
  const forceStandard = matResponse?.forceStandard === true;
  const group = new THREE.Group();
  group.name = `vox:${model.id}`;

  // key = palette | em | shine | alpha | transmit
  const buckets = new Map<number, FaceBucket>();

  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const i = voxelIndex(model, x, y, z);
        const pi = model.voxels[i] ?? 0;
        if (pi <= 0) continue;
        const emBand = emissiveBand(model.emissive?.[i] ?? 0);
        const shBand = emissiveBand(model.shine?.[i] ?? 0);
        const alphaBand = emissiveBand(model.transparency?.[i] ?? 0);
        const fullTransmit = (model.transmittance?.[i] ?? 0) >= 255 ? 1 : 0;
        const key =
          pi |
          (emBand << 8) |
          (shBand << 12) |
          (alphaBand << 16) |
          (fullTransmit << 20);
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { positions: [], normals: [], indices: [] };
          buckets.set(key, bucket);
        }
        for (const face of FACES) {
          if (
            solidAt(
              model.voxels,
              model.transparency,
              sx,
              sy,
              sz,
              x + face.dx,
              y + face.dy,
              z + face.dz,
            )
          ) {
            continue;
          }
          pushFace(bucket, x, y, z, voxelWorld, face);
        }
      }
    }
  }

  const envMap = getEmberEnvMap();

  for (const [key, bucket] of buckets) {
    if (bucket.indices.length === 0) continue;
    const pi = key & 0xff;
    const emBand = (key >> 8) & 0xf;
    const shBand = (key >> 12) & 0xf;
    const alphaBand = (key >> 16) & 0xf;
    const fullTransmit = ((key >> 20) & 1) === 1;
    const hex = model.palette[pi] || "#888888";
    const color = hexColor(hex);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(bucket.positions, 3),
    );
    geo.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(bucket.normals, 3),
    );
    geo.setIndex(bucket.indices);
    const intensity = bandIntensity(emBand);
    // Mid of band → opacity (bands 1..4 map ~32..224).
    const alphaAmount =
      alphaBand <= 0 ? 0 : Math.min(255, 32 + (alphaBand - 1) * 64);
    const opacity = opacityFromTransparency(alphaAmount);
    const useAlpha = alphaBand > 0;
    let mat: THREE.Material;
    if (shBand > 0) {
      const shineKeep =
        opts?.shineColorKeep != null
          ? opts.shineColorKeep
          : getShineColorKeep();
      const sh = applyShineColorKeep(shineParams(shBand), shineKeep);
      const metalBias = matResponse?.metalness ?? 0;
      const envBias = matResponse?.envMapIntensity ?? 0;
      const std = new THREE.MeshStandardMaterial({
        color,
        metalness: Math.min(
          1,
          Math.max(sh.metalness, metalBias * 0.85 * (1 - shineKeep * 0.7)),
        ),
        roughness: sh.roughness,
        envMap,
        envMapIntensity: Math.max(sh.envMapIntensity, envBias * 0.75),
        emissive: intensity > 0 ? color.clone() : new THREE.Color(0x000000),
        emissiveIntensity: intensity * 0.85,
        toneMapped: intensity <= 0,
        transparent: useAlpha,
        opacity,
        depthWrite: !useAlpha,
      });
      patchEmberVoxelLightSnap(std);
      // Higher shine bands → stronger floor mirrors (255 ≈ near-mirror).
      mat = patchStandardPlanarReflect(std, {
        strength: Math.min(0.96, 0.55 + shBand * 0.1),
      });
    } else if (forceStandard && matResponse) {
      const std = new THREE.MeshStandardMaterial({
        color,
        metalness: matResponse.metalness,
        roughness: matResponse.roughness,
        envMap,
        envMapIntensity: matResponse.envMapIntensity,
        emissive: intensity > 0 ? color.clone() : new THREE.Color(0x000000),
        emissiveIntensity: intensity,
        toneMapped: intensity <= 0,
        transparent: useAlpha,
        opacity,
        depthWrite: !useAlpha,
      });
      patchEmberVoxelLightSnap(std);
      mat =
        matResponse.metalness >= 0.28 || matResponse.envMapIntensity >= 0.45
          ? patchStandardPlanarReflect(std, {
              strength: Math.min(0.92, 0.45 + matResponse.metalness * 0.5),
            })
          : std;
    } else {
      const toon = new THREE.MeshToonMaterial({
        color,
        gradientMap: getToonGradientMap(matResponse?.toonSteps ?? 4),
        emissive: intensity > 0 ? color.clone() : new THREE.Color(0x000000),
        emissiveIntensity: intensity,
        toneMapped: intensity <= 0,
        transparent: useAlpha,
        opacity,
        depthWrite: !useAlpha,
      });
      patchEmberLampDiscFalloff(toon);
      // Solid-color props wash out under hard lamp discs + MeshToon (terrain
      // textures hide the same crush). Cap direct light; keep emissive bands.
      toon.onBeforeCompile = (shader) => {
        shader.uniforms.emberDirectLightScale = { value: directLightScale };
        shader.fragmentShader =
          "uniform float emberDirectLightScale;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <lights_fragment_begin>",
          `#include <lights_fragment_begin>
	reflectedLight.directDiffuse *= emberDirectLightScale;
	reflectedLight.directSpecular *= emberDirectLightScale;`,
        );
      };
      toon.customProgramCacheKey = () =>
        `${VOXEL_PROP_LIGHT_CACHE_KEY}|dls:${directLightScale.toFixed(2)}|steps:${matResponse?.toonSteps ?? 4}|a:${alphaBand}`;
      patchEmberVoxelLightSnap(toon);
      mat = toon;
    }
    mat.userData.emberVoxelPaletteIndex = pi;
    mat.userData.emberVoxelHasEmissiveColor = intensity > 0;
    const mesh = new THREE.Mesh(geo, mat);
    // Glass skips shadows. Full transmittance (255) skips them too. Mid
    // values still occlude; analog leak is the host PointLight's umbra
    // (dim + distance-soft penumbra), not holes in the depth map.
    mesh.castShadow =
      !suppressCastShadow && intensity <= 0 && !useAlpha && !fullTransmit;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return { group, voxelWorld };
}

/**
 * Update only material uniforms for a palette preview. Geometry and the source
 * model remain untouched until the editor commits the chosen color.
 */
export function previewVoxelPaletteColor(
  root: THREE.Object3D,
  paletteIndex: number,
  hex: string,
): void {
  const color = hexColor(hex);
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const materials = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];
    for (const material of materials) {
      if (material.userData.emberVoxelPaletteIndex !== paletteIndex) continue;
      const colored = material as THREE.Material & {
        color?: THREE.Color;
        emissive?: THREE.Color;
      };
      colored.color?.copy(color);
      if (material.userData.emberVoxelHasEmissiveColor === true) {
        colored.emissive?.copy(color);
      }
    }
  });
}

export function disposeVoxelModelMesh(group: THREE.Object3D): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m.dispose();
      o.customDepthMaterial?.dispose();
      o.customDistanceMaterial?.dispose();
      o.customDepthMaterial = undefined;
      o.customDistanceMaterial = undefined;
      const releaseTrackedTextures = o.userData.emberReleaseTrackedTextures as
        | (() => void)
        | undefined;
      releaseTrackedTextures?.();
    }
  });
}
