/**
 * Hard cel/toon materials + nearest-filtered tile face textures for Ember voxels.
 */
import * as THREE from "three";
import type { EmberMaterialKind, EmberTilesetTile } from "../content/types";
import {
  resolveEmissiveBloomRgb,
  resolveEmissiveGlowStrength,
} from "../tile/emissivePaint";
import { paintTileFace, paintWallFront } from "../tile/tileTextures";
import { parseHexRgb } from "../tile/mapUtils";
import { getEmberEnvMap } from "./envMap";
import { patchEmberLampDiscFalloff } from "./lampDiscFalloff";
import { patchStandardPlanarReflect } from "./planarReflectMaterial";
import { patchEmberVoxelLightSnap } from "./voxelLightSnap";
import {
  NEUTRAL_MATERIAL_RESPONSE,
  resolveMaterialResponse,
  resolveTileMaterialResponse,
  type EmberMaterialResponse,
} from "./materialPresets";
import { applyShineColorKeep, getShineColorKeep } from "./shineColorKeep";

const topTexCache = new WeakMap<EmberTilesetTile, THREE.CanvasTexture>();
const wallTexCache = new WeakMap<EmberTilesetTile, THREE.CanvasTexture>();
const topShineCache = new WeakMap<EmberTilesetTile, THREE.CanvasTexture>();
const wallShineCache = new WeakMap<EmberTilesetTile, THREE.CanvasTexture>();
const topEmissiveCache = new WeakMap<EmberTilesetTile, THREE.CanvasTexture>();
const wallEmissiveCache = new WeakMap<EmberTilesetTile, THREE.CanvasTexture>();
const topEmissiveBloomCache = new WeakMap<
  EmberTilesetTile,
  THREE.CanvasTexture
>();
const wallEmissiveBloomCache = new WeakMap<
  EmberTilesetTile,
  THREE.CanvasTexture
>();
const toonGradients = new Map<number, THREE.DataTexture>();

/** Stepped 1D ramp for MeshToonMaterial (hard cartoon bands). */
export function getToonGradientMap(steps = 4): THREE.DataTexture {
  const n = Math.max(3, Math.min(5, Math.round(steps)));
  const hit = toonGradients.get(n);
  if (hit) return hit;
  // Lift the darkest band so wall sides in rim light don't crush to black.
  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    data[i] = Math.round(48 + ((255 - 48) * i) / Math.max(1, n - 1));
  }
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  toonGradients.set(n, tex);
  return tex;
}

function canvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function solidCanvas(hex: string, size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = hex || "#6a7a50";
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** Top-face texture from tile pixels / procedural paint. */
export function getTileTopTexture(
  tile: EmberTilesetTile | undefined,
  tileSize: number,
  fallback = "#6a7a50",
): THREE.CanvasTexture {
  const size = Math.max(4, Math.round(tileSize));
  if (tile) {
    const hit = topTexCache.get(tile);
    if (hit) return hit;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    paintTileFace(ctx, tile, 0, 0, size, fallback);
    const tex = canvasTexture(c);
    topTexCache.set(tile, tex);
    return tex;
  }
  return canvasTexture(solidCanvas(fallback, size));
}

/** Wall/cliff face texture. */
export function getTileWallTexture(
  tile: EmberTilesetTile | undefined,
  tileSize: number,
  fallback = "#5a4a40",
): THREE.CanvasTexture {
  const size = Math.max(4, Math.round(tileSize));
  if (tile) {
    const hit = wallTexCache.get(tile);
    if (hit) return hit;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const base =
      tile.color && tile.color !== "#00000000" ? tile.color : fallback;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    paintWallFront(ctx, tile, 0, 0, size, size);
    const tex = canvasTexture(c);
    wallTexCache.set(tile, tex);
    return tex;
  }
  return canvasTexture(solidCanvas(fallback, size));
}

function parseShineLuma(hex: string | undefined): number {
  if (!hex || hex === "" || hex === "#00000000") return 0;
  const rgb = parseHexRgb(hex);
  if (!rgb) return 0;
  return Math.max(rgb.r, rgb.g, rgb.b) / 255;
}

/** Roughness map from shine channel (bright shine → low roughness). */
function shineRoughnessTexture(
  shine: string[] | undefined,
  size: number,
): THREE.CanvasTexture | null {
  if (!shine || shine.length !== size * size) return null;
  let any = false;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const luma = parseShineLuma(shine[i]);
    if (luma > 0.02) any = true;
    // roughness 1 = matte, 0.05 = near-mirror (scene planar picks this up)
    const rough = Math.round((1 - luma * 0.95) * 255);
    const o = i * 4;
    img.data[o] = rough;
    img.data[o + 1] = rough;
    img.data[o + 2] = rough;
    img.data[o + 3] = 255;
  }
  if (!any) return null;
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function tileHasShine(
  tile: EmberTilesetTile | undefined,
  face: "top" | "wall",
): boolean {
  if (!tile) return false;
  const ch = face === "top" ? tile.shinePixels : tile.shineWallPixels;
  if (!ch) return false;
  return ch.some((p) => parseShineLuma(p) > 0.02);
}

export function getTileTopShineRoughness(
  tile: EmberTilesetTile,
  tileSize: number,
): THREE.CanvasTexture | null {
  const hit = topShineCache.get(tile);
  if (hit) return hit;
  const tex = shineRoughnessTexture(tile.shinePixels, Math.max(4, tileSize));
  if (tex) topShineCache.set(tile, tex);
  return tex;
}

export function getTileWallShineRoughness(
  tile: EmberTilesetTile,
  tileSize: number,
): THREE.CanvasTexture | null {
  const hit = wallShineCache.get(tile);
  if (hit) return hit;
  const tex = shineRoughnessTexture(
    tile.shineWallPixels,
    Math.max(4, tileSize),
  );
  if (tex) wallShineCache.set(tile, tex);
  return tex;
}

function parseEmissiveRgb(
  hex: string | undefined,
): { r: number; g: number; b: number } | null {
  if (!hex || hex === "" || hex === "#00000000") return null;
  return parseHexRgb(hex);
}

/**
 * RGB emissive map (black = off) with 1px soft dilation for bloom catch.
 * When `bloomRgb` is set, cores keep ink color and the soft fringe uses the
 * bloom tint — white pattern + blue aura, etc.
 */
function emissiveMapTexture(
  emissive: string[] | undefined,
  size: number,
  bloomRgb?: { r: number; g: number; b: number } | null,
): THREE.CanvasTexture | null {
  if (!emissive || emissive.length !== size * size) return null;
  const coreR = new Float32Array(size * size);
  const coreG = new Float32Array(size * size);
  const coreB = new Float32Array(size * size);
  const lit = new Uint8Array(size * size);
  let any = false;
  for (let i = 0; i < size * size; i++) {
    const rgb = parseEmissiveRgb(emissive[i]);
    if (!rgb) continue;
    any = true;
    lit[i] = 1;
    // Hot core so UnrealBloom high-pass keeps single texels.
    coreR[i] = Math.min(255, rgb.r * 1.35 + 40);
    coreG[i] = Math.min(255, rgb.g * 1.35 + 20);
    coreB[i] = Math.min(255, rgb.b * 1.35 + 20);
  }
  if (!any) return null;

  const outR = new Float32Array(coreR);
  const outG = new Float32Array(coreG);
  const outB = new Float32Array(coreB);
  const ortho = [
    [1, 0, 0.55],
    [-1, 0, 0.55],
    [0, 1, 0.55],
    [0, -1, 0.55],
    [1, 1, 0.3],
    [1, -1, 0.3],
    [-1, 1, 0.3],
    [-1, -1, 0.3],
  ] as const;
  const fringeR = bloomRgb ? bloomRgb.r * 1.25 + 30 : 0;
  const fringeG = bloomRgb ? bloomRgb.g * 1.25 + 20 : 0;
  const fringeB = bloomRgb ? bloomRgb.b * 1.25 + 20 : 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (lit[i]) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let wMax = 0;
      for (const [dx, dy, w] of ortho) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const j = ny * size + nx;
        if (!lit[j]) continue;
        wMax = Math.max(wMax, w);
        if (bloomRgb) {
          r = Math.max(r, fringeR * w);
          g = Math.max(g, fringeG * w);
          b = Math.max(b, fringeB * w);
        } else {
          r = Math.max(r, coreR[j]! * w);
          g = Math.max(g, coreG[j]! * w);
          b = Math.max(b, coreB[j]! * w);
        }
      }
      if (wMax <= 0) continue;
      outR[i] = Math.min(255, r);
      outG[i] = Math.min(255, g);
      outB[i] = Math.min(255, b);
    }
  }

  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    img.data[o] = Math.round(outR[i]!);
    img.data[o + 1] = Math.round(outG[i]!);
    img.data[o + 2] = Math.round(outB[i]!);
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Soft RGBA bloom stamp (radial per lit pixel) for additive overlay.
 * Survives UnrealBloom downsample better than 1×1 cores.
 */
function emissiveBloomOverlayTexture(
  emissive: string[] | undefined,
  srcSize: number,
  strength: number,
  bloomRgb?: { r: number; g: number; b: number } | null,
): THREE.CanvasTexture | null {
  if (!emissive || emissive.length !== srcSize * srcSize) return null;
  if (!emissive.some((p) => !!parseEmissiveRgb(p))) return null;
  const scale = 4;
  const w = srcSize * scale;
  const h = srcSize * scale;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  const aMul = Math.max(0.2, Math.min(1, strength));
  for (let y = 0; y < srcSize; y++) {
    for (let x = 0; x < srcSize; x++) {
      const ink = parseEmissiveRgb(emissive[y * srcSize + x]);
      if (!ink) continue;
      const rgb = bloomRgb ?? ink;
      const cx = (x + 0.5) * scale;
      const cy = (y + 0.5) * scale;
      const radius = scale * 2.4;
      const a0 = 0.95 * aMul;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${a0})`);
      g.addColorStop(
        0.35,
        `rgba(${rgb.r},${rgb.g},${rgb.b},${a0 * 0.55})`,
      );
      g.addColorStop(
        0.7,
        `rgba(${rgb.r},${rgb.g},${rgb.b},${a0 * 0.18})`,
      );
      g.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function tileHasEmissive(
  tile: EmberTilesetTile | undefined,
  face: "top" | "wall",
): boolean {
  if (!tile || tile.emissiveEnabled === false) return false;
  const ch = face === "top" ? tile.emissivePixels : tile.emissiveWallPixels;
  if (!ch) return false;
  return ch.some((p) => !!parseEmissiveRgb(p));
}

export function getTileTopEmissiveMap(
  tile: EmberTilesetTile,
  tileSize: number,
): THREE.CanvasTexture | null {
  const hit = topEmissiveCache.get(tile);
  if (hit) return hit;
  const tex = emissiveMapTexture(
    tile.emissivePixels,
    Math.max(4, tileSize),
    resolveEmissiveBloomRgb(tile.emissiveBloomColor),
  );
  if (tex) topEmissiveCache.set(tile, tex);
  return tex;
}

export function getTileWallEmissiveMap(
  tile: EmberTilesetTile,
  tileSize: number,
): THREE.CanvasTexture | null {
  const hit = wallEmissiveCache.get(tile);
  if (hit) return hit;
  const tex = emissiveMapTexture(
    tile.emissiveWallPixels,
    Math.max(4, tileSize),
    resolveEmissiveBloomRgb(tile.emissiveBloomColor),
  );
  if (tex) wallEmissiveCache.set(tile, tex);
  return tex;
}

export function getTileTopEmissiveBloomMap(
  tile: EmberTilesetTile,
  tileSize: number,
): THREE.CanvasTexture | null {
  const hit = topEmissiveBloomCache.get(tile);
  if (hit) return hit;
  const tex = emissiveBloomOverlayTexture(
    tile.emissivePixels,
    Math.max(4, tileSize),
    resolveEmissiveGlowStrength(tile.emissiveStrength),
    resolveEmissiveBloomRgb(tile.emissiveBloomColor),
  );
  if (tex) topEmissiveBloomCache.set(tile, tex);
  return tex;
}

export function getTileWallEmissiveBloomMap(
  tile: EmberTilesetTile,
  tileSize: number,
): THREE.CanvasTexture | null {
  const hit = wallEmissiveBloomCache.get(tile);
  if (hit) return hit;
  const tex = emissiveBloomOverlayTexture(
    tile.emissiveWallPixels,
    Math.max(4, tileSize),
    resolveEmissiveGlowStrength(tile.emissiveStrength),
    resolveEmissiveBloomRgb(tile.emissiveBloomColor),
  );
  if (tex) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    wallEmissiveBloomCache.set(tile, tex);
  }
  return tex;
}

/** Peak self-glow for bloom + night readability. */
export function tileEmissiveIntensity(tile: EmberTilesetTile): number {
  // Hot enough to clear UnrealBloom threshold after mip downsample.
  return resolveEmissiveGlowStrength(tile.emissiveStrength) * 4.2;
}

/** Additive soft halo mesh material (pairs with emissiveBloom overlay tex). */
export function createEmissiveBloomMaterial(
  map: THREE.Texture,
  strength = 0.75,
): THREE.MeshBasicMaterial {
  const s = Math.max(0.15, Math.min(1, strength));
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    opacity: 0.55 + s * 0.45,
    side: THREE.DoubleSide,
  });
}

function withEmissive(
  mat: THREE.MeshToonMaterial | THREE.MeshStandardMaterial,
  emissiveMap: THREE.Texture | null,
  intensity: number,
): typeof mat {
  if (!emissiveMap || intensity <= 0.01) return mat;
  mat.emissive = new THREE.Color(0xffffff);
  mat.emissiveMap = emissiveMap;
  mat.emissiveIntensity = intensity;
  // Keep HDR-hot for the bloom high-pass (OutputPass tones the stack later).
  mat.toneMapped = false;
  mat.needsUpdate = true;
  return mat;
}

export type SurfaceMaterialOpts = {
  emissiveMap?: THREE.Texture | null;
  emissiveIntensity?: number;
  /** Material response (stone/metal/cloth…). */
  material?: EmberMaterialKind | EmberMaterialResponse;
};

export function resolveTileOpacity(tile: EmberTilesetTile | undefined): number {
  const raw = tile?.opacity;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 1;
  return THREE.MathUtils.clamp(raw, 0, 1);
}

export function tileUsesTransparency(
  tile: EmberTilesetTile | undefined,
): boolean {
  return tile?.transparent === true || resolveTileOpacity(tile) < 0.999;
}

export function applyTileTransparency<T extends THREE.Material>(
  mat: T,
  tile: EmberTilesetTile,
): T {
  const transparent = tileUsesTransparency(tile);
  const opacity = resolveTileOpacity(tile);
  mat.transparent = transparent;
  mat.opacity = opacity;
  mat.depthWrite = !transparent;
  mat.depthTest = true;
  if (transparent) {
    mat.blending = THREE.NormalBlending;
    mat.userData.emberTransparentTile = true;
  }
  mat.needsUpdate = true;
  return mat;
}

function resolveOptsMaterial(
  opts?: SurfaceMaterialOpts,
): EmberMaterialResponse {
  if (!opts?.material) return NEUTRAL_MATERIAL_RESPONSE;
  if (typeof opts.material === "string") {
    return resolveMaterialResponse(opts.material);
  }
  return opts.material;
}

/** Cap MeshToon direct diffuse/specular (same idea as voxel props). */
export function patchToonDirectLightScale(
  mat: THREE.MeshToonMaterial,
  scale: number,
): void {
  const s = Math.max(0.05, Math.min(1.5, scale));
  if (Math.abs(s - 1) < 0.02) return;
  const prevKey =
    typeof mat.customProgramCacheKey === "function"
      ? mat.customProgramCacheKey()
      : "ember-toon";
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.emberDirectLightScale = { value: s };
    shader.fragmentShader =
      "uniform float emberDirectLightScale;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_begin>",
      `#include <lights_fragment_begin>
	reflectedLight.directDiffuse *= emberDirectLightScale;
	reflectedLight.directSpecular *= emberDirectLightScale;`,
    );
  };
  mat.customProgramCacheKey = () => `${prevKey}|dls:${s.toFixed(2)}`;
  mat.needsUpdate = true;
}

export function createToonMaterial(
  map: THREE.Texture,
  tintHex?: string,
  opts?: SurfaceMaterialOpts,
): THREE.MeshToonMaterial {
  const response = resolveOptsMaterial(opts);
  const rgb = tintHex ? parseHexRgb(tintHex) : null;
  const color = rgb
    ? new THREE.Color(rgb.r / 255, rgb.g / 255, rgb.b / 255)
    : new THREE.Color(0xffffff);
  // Keep tint near white so the texture carries the look; dark tile.color
  // was crushing walls to black when used as solid Lambert color.
  if (rgb) {
    const max = Math.max(rgb.r, rgb.g, rgb.b) / 255;
    if (max < 0.15) color.setRGB(1, 1, 1);
    else color.offsetHSL(0, 0, 0.08);
  }
  const mat = new THREE.MeshToonMaterial({
    map,
    color,
    gradientMap: getToonGradientMap(response.toonSteps),
    // Push receivers slightly back in depth to cut shadow acne on walls.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  patchEmberLampDiscFalloff(mat);
  patchToonDirectLightScale(mat, response.directLightScale);
  patchEmberVoxelLightSnap(mat);
  return withEmissive(
    mat,
    opts?.emissiveMap ?? null,
    opts?.emissiveIntensity ?? 0,
  ) as THREE.MeshToonMaterial;
}

/** Wet / metal floor-wall material with env reflections from shine channel. */
export function createShineMaterial(
  albedo: THREE.Texture,
  roughnessMap: THREE.Texture,
  opts?: SurfaceMaterialOpts,
): THREE.MeshStandardMaterial {
  const response = resolveOptsMaterial(opts);
  const keep = getShineColorKeep();
  const sh = applyShineColorKeep(
    {
      metalness: Math.max(0.15, response.metalness),
      roughness: 1,
      envMapIntensity: Math.max(0.35, response.envMapIntensity),
    },
    keep,
  );
  const mat = new THREE.MeshStandardMaterial({
    map: albedo,
    color: 0xffffff,
    roughness: sh.roughness,
    roughnessMap,
    metalness: sh.metalness,
    envMap: getEmberEnvMap(),
    envMapIntensity: sh.envMapIntensity,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  patchEmberVoxelLightSnap(mat);
  return patchStandardPlanarReflect(
    withEmissive(
      mat,
      opts?.emissiveMap ?? null,
      opts?.emissiveIntensity ?? 0,
    ) as THREE.MeshStandardMaterial,
    { strength: 0.94 },
  );
}

/** Flat Standard from material preset (metal without painted shine). */
export function createPresetStandardMaterial(
  albedo: THREE.Texture,
  opts?: SurfaceMaterialOpts,
): THREE.MeshStandardMaterial {
  const response = resolveOptsMaterial(opts);
  const mat = new THREE.MeshStandardMaterial({
    map: albedo,
    color: 0xffffff,
    roughness: response.roughness,
    metalness: response.metalness,
    envMap: getEmberEnvMap(),
    envMapIntensity: response.envMapIntensity,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  patchEmberVoxelLightSnap(mat);
  const std = withEmissive(
    mat,
    opts?.emissiveMap ?? null,
    opts?.emissiveIntensity ?? 0,
  ) as THREE.MeshStandardMaterial;
  // Metal / glossy presets get the scene mirror on floors.
  if (response.metalness >= 0.28 || response.envMapIntensity >= 0.45) {
    return patchStandardPlanarReflect(std, {
      strength: Math.min(0.92, 0.45 + response.metalness * 0.5),
    });
  }
  return std;
}

/**
 * Pick toon / shine / preset-standard for a tile face.
 * Shine ink wins; else metal forceStandard; else toon with material catch.
 */
export function createTileSurfaceMaterial(
  albedo: THREE.Texture,
  tile: EmberTilesetTile,
  opts: {
    shineRoughness?: THREE.Texture | null;
    emissiveMap?: THREE.Texture | null;
    emissiveIntensity?: number;
  },
): THREE.Material {
  const response = resolveTileMaterialResponse(tile);
  const emOpts: SurfaceMaterialOpts = {
    emissiveMap: opts.emissiveMap ?? null,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    material: response,
  };
  const mat = opts.shineRoughness
    ? createShineMaterial(albedo, opts.shineRoughness, emOpts)
    : response.forceStandard
      ? createPresetStandardMaterial(albedo, emOpts)
      : createToonMaterial(albedo, "#ffffff", emOpts);
  return applyTileTransparency(mat, tile);
}
