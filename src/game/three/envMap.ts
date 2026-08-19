/**
 * Chunky voxel-grid environment map for metal / wet shine reflections.
 * Face size = VOXELS_PER_BLOCK × mult; NearestFilter so reflections read as a grid.
 */
import * as THREE from "three";
import { VOXELS_PER_BLOCK } from "../voxel/constants";

/** Allowed reflection resolutions (texels per voxel cell on each cube face). */
export const EMBER_ENV_VOXEL_MULTS = [1, 2, 4, 8] as const;
export type EmberEnvVoxelMult = (typeof EMBER_ENV_VOXEL_MULTS)[number];

const STORAGE_KEY = "ember-env-voxel-mult";
const DEFAULT_MULT: EmberEnvVoxelMult = 2;
/** Water default: chunkiest (1 texel per voxel / tile pixel). */
export const DEFAULT_WATER_REFLECT_MULT: EmberEnvVoxelMult = 1;

let voxelMult: EmberEnvVoxelMult = loadMult();
const cacheByMult = new Map<EmberEnvVoxelMult, THREE.CubeTexture>();

function loadMult(): EmberEnvVoxelMult {
  try {
    const raw = Number(sessionStorage.getItem(STORAGE_KEY));
    if ((EMBER_ENV_VOXEL_MULTS as readonly number[]).includes(raw)) {
      return raw as EmberEnvVoxelMult;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_MULT;
}

export function clampEmberEnvVoxelMult(raw: number): EmberEnvVoxelMult {
  if ((EMBER_ENV_VOXEL_MULTS as readonly number[]).includes(raw)) {
    return raw as EmberEnvVoxelMult;
  }
  // Snap slider values / odd numbers to nearest allowed step.
  let best: EmberEnvVoxelMult = DEFAULT_MULT;
  let bestDist = Infinity;
  for (const m of EMBER_ENV_VOXEL_MULTS) {
    const d = Math.abs(m - raw);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

export function getEmberEnvMapVoxelMult(): EmberEnvVoxelMult {
  return voxelMult;
}

/**
 * Set global reflection grid density (metal / sculptor).
 * Updates the shared CubeTexture for the active global mult.
 */
export function setEmberEnvMapVoxelMult(mult: number): EmberEnvVoxelMult {
  const next = clampEmberEnvVoxelMult(mult);
  if (next === voxelMult && cacheByMult.has(next)) return voxelMult;
  voxelMult = next;
  try {
    sessionStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    /* ignore */
  }
  const images = buildFaceCanvases(next);
  const cached = cacheByMult.get(next);
  if (cached) {
    cached.image = images;
    cached.needsUpdate = true;
  } else {
    getEmberEnvMapAtMult(next);
  }
  return voxelMult;
}

function cellColor(
  face: "px" | "nx" | "py" | "ny" | "pz" | "nz",
  gx: number,
  gy: number,
  cells: number,
): string {
  const v = (gy + 0.5) / cells;
  const checker = (gx + gy) % 2 === 0;

  if (face === "py") {
    return checker ? "#d0e0f4" : "#a8bcd0";
  }
  if (face === "ny") {
    return checker ? "#3a3228" : "#2a2418";
  }

  // Side faces: hard sky → horizon → ground bands.
  if (v < 0.35) return checker ? "#9eb4cc" : "#7a90a8";
  if (v < 0.55) return checker ? "#5a6878" : "#4a5568";
  if (v < 0.72) return checker ? "#3a4050" : "#2e3440";
  return checker ? "#1c1a22" : "#141218";
}

function buildFaceCanvases(mult: EmberEnvVoxelMult): HTMLCanvasElement[] {
  const cells = VOXELS_PER_BLOCK;
  const size = Math.max(cells, cells * mult);
  const px = size / cells;
  const faces: ("px" | "nx" | "py" | "ny" | "pz" | "nz")[] = [
    "px",
    "nx",
    "py",
    "ny",
    "pz",
    "nz",
  ];
  const images: HTMLCanvasElement[] = [];
  for (const face of faces) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    for (let gy = 0; gy < cells; gy++) {
      for (let gx = 0; gx < cells; gx++) {
        ctx.fillStyle = cellColor(face, gx, gy, cells);
        ctx.fillRect(
          Math.floor(gx * px),
          Math.floor(gy * px),
          Math.ceil(px),
          Math.ceil(px),
        );
      }
    }
    images.push(c);
  }
  return images;
}

/** Env map at an explicit voxel mult (used by water tiles). */
export function getEmberEnvMapAtMult(mult: number): THREE.CubeTexture {
  const m = clampEmberEnvVoxelMult(mult);
  const hit = cacheByMult.get(m);
  if (hit) return hit;

  const images = buildFaceCanvases(m);
  const cube = new THREE.CubeTexture(images);
  cube.colorSpace = THREE.SRGBColorSpace;
  cube.magFilter = THREE.NearestFilter;
  cube.minFilter = THREE.NearestFilter;
  cube.generateMipmaps = false;
  cube.needsUpdate = true;
  cacheByMult.set(m, cube);
  return cube;
}

/** Shared voxel-grid cube env for Standard metal / shine (global sculptor mult). */
export function getEmberEnvMap(): THREE.CubeTexture {
  return getEmberEnvMapAtMult(voxelMult);
}

export function resolveWaterReflectMult(
  raw: number | undefined,
): EmberEnvVoxelMult {
  if (raw == null || !Number.isFinite(raw)) return DEFAULT_WATER_REFLECT_MULT;
  return clampEmberEnvVoxelMult(raw);
}
