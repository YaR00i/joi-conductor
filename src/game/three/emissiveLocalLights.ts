/**
 * Dense emissive pixel / voxel clusters → weak local PointLights (~0.5–1 tile).
 * Opt-in via `emissiveCastsLight` on sprites / voxels. Anim syncs with mats.
 */
import * as THREE from "three";
import type {
  EmberMap,
  EmberTileset,
  EmberVoxelModel,
  EmberVoxelPlacement,
  EmberVoxelScene,
} from "../content/types";
import { spriteTotalHeight } from "../content/pixelSprite";
import {
  emissiveCellSeed,
  emissiveInkDenseEnough,
  emissivePlacementSeed,
  hasEmissiveInk,
  resolveEmissiveLightRange,
  resolveEmissiveStrength,
  summarizeEmissiveInk,
  type EmissiveInkSummary,
} from "../tile/emissivePaint";
import { blockStoryHeight } from "../tile/extruded";
import {
  WALL_HEIGHT,
  type EmberSpriteLib,
  layerData,
  tileSurfaceElev,
} from "../tile/mapUtils";
import {
  resolveChestModelPose,
  type ChestModelPose,
} from "../voxel/chestPlacement";
import { VOXELS_PER_BLOCK } from "../voxel/constants";
import {
  resolveVoxelLightOrigin,
  summarizeVoxelEmissive,
} from "../voxel/voxelEmissiveLight";
import { sceneFootprintVoxels } from "../voxel/voxelModelApply";
import { voxelGridSize } from "../voxel/voxelModel";
import { normalizeVoxelRot } from "../voxel/voxelPlacement";
import {
  tagEmissiveLight,
  type EmberEmissiveLightMeta,
} from "./emissiveAnimTick";
import { packLampDiscDecay } from "./threeLighting";

export const THREE_MAX_EMISSIVE_LIGHTS = 48;
/** Soft fill shadows are expensive (cube maps) — keep a modest budget. */
export const THREE_MAX_EMISSIVE_SHADOWS = 12;

export type EmissiveLocalLightSource = {
  id: string;
  x: number;
  y: number;
  /** World-space offsets inside the tile (0..tileSize). */
  localX: number;
  localZ: number;
  /** Height above floor (world units). */
  heightAboveFloor: number;
  /**
   * Absolute world position — used for rotated voxel props.
   * When set, overrides tile + localX/Z + heightAboveFloor.
   */
  worldPosition?: { x: number; y: number; z: number };
  color: THREE.Color;
  /** Peak PointLight intensity (before anim mul). */
  intensity: number;
  /** Cutoff distance (world units). */
  distance: number;
  /** Opt-in cube shadows (budgeted). */
  castShadows: boolean;
  /**
   * Sort boost when capping lights / shadow slots.
   * Map voxel props (esp. with shadows) beat chest auto-lights.
   */
  rank?: number;
  meta: EmberEmissiveLightMeta;
};

export type EmberVoxelModelLib = Record<string, EmberVoxelModel>;
export type EmberVoxelSceneLib = Record<string, EmberVoxelScene>;

function densityGain(sum: EmissiveInkSummary): number {
  // Sparse ink → weaker fill; dense clusters approach 1.
  return Math.max(0.2, Math.min(1, 0.28 + sum.density * 10 + sum.count * 0.02));
}

function peakIntensity(strength: number, dens: number): number {
  // Sprite soft fill — weaker than full lanterns (~7–20).
  return (0.85 + strength * 2.4) * dens;
}

/** Voxel cores need lantern-adjacent candela or night MeshToon reads as “off”. */
function voxelPeakIntensity(strength: number, dens: number): number {
  return (3.4 + strength * 9.5) * dens;
}

function buildMeta(
  assetId: string | number,
  tx: number,
  ty: number,
  src: {
    emissiveAnim?: EmberEmissiveLightMeta["anim"];
    emissiveAnimPeriod?: number;
    emissiveAnimPeriodMin?: number;
    emissiveAnimPeriodMax?: number;
    emissiveTriggerRadius?: number;
    emissiveTriggerWhen?: EmberEmissiveLightMeta["triggerWhen"];
    emissiveTriggerEventId?: string;
    torchFlicker?: boolean;
    lanternFlicker?: boolean;
    baseDistance?: number;
  },
  baseIntensity: number,
): EmberEmissiveLightMeta {
  const seed =
    typeof assetId === "number"
      ? emissiveCellSeed(assetId, tx, ty)
      : emissivePlacementSeed(assetId, tx, ty);
  return {
    anim: src.emissiveAnim,
    seed,
    baseIntensity,
    kind: "light",
    periodSec: src.emissiveAnimPeriod,
    periodMinSec: src.emissiveAnimPeriodMin,
    periodMaxSec: src.emissiveAnimPeriodMax,
    triggerWhen: src.emissiveTriggerWhen,
    triggerRadius: src.emissiveTriggerRadius,
    triggerEventId: src.emissiveTriggerEventId,
    tx,
    ty,
    torchFlicker: src.torchFlicker === true ? true : undefined,
    lanternFlicker: src.lanternFlicker === true ? true : undefined,
    baseDistance: src.baseDistance,
  };
}

function voxelLightWorldPosition(
  place: EmberVoxelPlacement,
  model: EmberVoxelModel,
  tileSize: number,
  elev: number,
  origin: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const { sx, sz } = voxelGridSize(model);
  const vw = tileSize / VOXELS_PER_BLOCK;
  const w = sx * vw;
  const d = sz * vw;
  const rot = normalizeVoxelRot(place.rot);
  const lx = origin.x * vw;
  const ly = origin.y * vw;
  const lz = origin.z * vw;
  const rx = lx - w * 0.5;
  const rz = lz - d * 0.5;
  const angle = rot * (Math.PI / 2);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: place.x * tileSize + w * 0.5 + (rx * cos - rz * sin),
    y: elev * blockStoryHeight(tileSize) + ly,
    z: place.y * tileSize + d * 0.5 + (rx * sin + rz * cos),
  };
}

/** Lone chest model: centered footprint + region pose/scale. */
function chestModelLightWorldPosition(
  pose: ChestModelPose,
  model: EmberVoxelModel,
  tileSize: number,
  origin: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const { sx, sz } = voxelGridSize(model);
  const vw = tileSize / VOXELS_PER_BLOCK;
  const s = pose.scale;
  const lx = (origin.x - sx * 0.5) * vw * s;
  const ly = origin.y * vw * s;
  const lz = (origin.z - sz * 0.5) * vw * s;
  const angle = pose.rot * (Math.PI / 2);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: pose.x + (lx * cos - lz * sin),
    y: pose.elev * blockStoryHeight(tileSize) + ly,
    z: pose.y + (lx * sin + lz * cos),
  };
}

/**
 * Scene object light (closed pose): object offset + light origin, then
 * footprint-center + region pose/scale (matches buildVoxelSceneMesh).
 */
function chestSceneLightWorldPosition(
  pose: ChestModelPose,
  scene: EmberVoxelScene,
  models: EmberVoxelModelLib,
  objOffset: { x: number; y: number; z: number },
  tileSize: number,
  origin: { x: number; y: number; z: number },
): { x: number; y: number; z: number } | null {
  const foot = sceneFootprintVoxels(scene, models);
  if (!foot) return null;
  const vw = tileSize / VOXELS_PER_BLOCK;
  const cx = ((foot.minX + foot.maxX) / 2) * vw;
  const cz = ((foot.minZ + foot.maxZ) / 2) * vw;
  const s = pose.scale;
  const lx = ((objOffset.x + origin.x) * vw - cx) * s;
  const ly = (objOffset.y + origin.y) * vw * s;
  const lz = ((objOffset.z + origin.z) * vw - cz) * s;
  const angle = pose.rot * (Math.PI / 2);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: pose.x + (lx * cos - lz * sin),
    y: pose.elev * blockStoryHeight(tileSize) + ly,
    z: pose.y + (lx * sin + lz * cos),
  };
}

function pushVoxelEmissiveLight(
  out: EmissiveLocalLightSource[],
  args: {
    id: string;
    modelId: string;
    model: EmberVoxelModel;
    tx: number;
    ty: number;
    worldPosition: { x: number; y: number; z: number };
    ts: number;
    /** Lower than map voxel props so lanterns keep shadow slots. */
    rank?: number;
  },
): void {
  const { id, modelId, model, tx, ty, worldPosition, ts } = args;
  if (model.emissiveCastsLight !== true) return;
  const sum = summarizeVoxelEmissive(model);
  if (!sum || sum.count < 1) return;
  const strength = resolveEmissiveStrength(model.emissiveStrength);
  const rangeTiles = resolveEmissiveLightRange(model.emissiveLightRange);
  const dens = Math.max(
    0.35,
    Math.min(1, 0.4 + sum.weight * 0.35 + Math.min(0.35, sum.count * 0.04)),
  );
  const intensity = voxelPeakIntensity(strength, dens);
  const distance = rangeTiles * ts;
  const castShadows = model.emissiveLightShadows === true;
  out.push({
    id,
    x: tx,
    y: ty,
    localX: ts * 0.5,
    localZ: ts * 0.5,
    heightAboveFloor: worldPosition.y,
    worldPosition,
    color: new THREE.Color(sum.r, sum.g, sum.b),
    intensity,
    distance,
    castShadows,
    rank: args.rank ?? (castShadows ? 2 : 0),
    meta: buildMeta(
      modelId,
      tx,
      ty,
      {
        torchFlicker: model.emissiveTorchFlicker === true ? true : undefined,
        lanternFlicker:
          model.emissiveLanternFlicker === true ? true : undefined,
        baseDistance: distance,
      },
      intensity,
    ),
  });
}

/**
 * Scan map for opted-in emissive sprites/voxels dense enough to cast soft fill.
 * Skips cells that already have a lantern (`glow`) to avoid double-lighting.
 */
export function listEmissiveLocalLights(
  map: EmberMap,
  tileset: EmberTileset,
  sprites?: EmberSpriteLib,
  voxelModels?: EmberVoxelModelLib,
  voxelScenes?: EmberVoxelSceneLib,
): EmissiveLocalLightSource[] {
  const ts = Math.max(1, map.tileSize);
  const storyH = WALL_HEIGHT;
  const out: EmissiveLocalLightSource[] = [];
  const lanternCells = new Set<string>();

  const glowIds = new Set(
    tileset.tiles
      .filter((t) => t.glow || t.name === "lantern")
      .map((t) => t.id),
  );
  if (glowIds.size > 0) {
    for (const layerName of ["decor", "ground"] as const) {
      const data = layerData(map, layerName);
      if (!data) continue;
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const id = data[y * map.width + x] ?? 0;
          if (glowIds.has(id)) lanternCells.add(`${x},${y}`);
        }
      }
    }
  }
  if (sprites && map.sprites?.length) {
    for (const place of map.sprites) {
      if (sprites[place.spriteId]?.glow) {
        lanternCells.add(`${place.x},${place.y}`);
      }
    }
  }

  if (sprites && map.sprites?.length) {
    for (const place of map.sprites) {
      const key = `${place.x},${place.y}`;
      if (lanternCells.has(key)) continue;
      const spr = sprites[place.spriteId];
      if (!spr?.emissiveCastsLight || !hasEmissiveInk(spr.emissivePixels)) {
        continue;
      }
      const totalH = Math.max(1, spriteTotalHeight(spr));
      const sum = summarizeEmissiveInk(spr.emissivePixels, spr.width, totalH);
      if (!emissiveInkDenseEnough(sum)) continue;

      const strength = resolveEmissiveStrength(spr.emissiveStrength);
      const rangeTiles = resolveEmissiveLightRange(spr.emissiveLightRange);
      const dens = densityGain(sum);
      const intensity = peakIntensity(strength, dens);
      const elev = tileSurfaceElev(map, place.x, place.y);
      // Place light near the lit band centroid along the stack height.
      const cyNorm =
        sum.cy >= 0 ? 1 - (sum.cy + 0.5) / Math.max(1, sum.height) : 0.45;
      const stackH = (totalH / Math.max(1, spr.width)) * ts;
      const heightAboveFloor =
        elev * storyH + Math.max(0.15 * ts, cyNorm * stackH);

      const castShadows = spr.emissiveLightShadows === true;
      out.push({
        id: `emspr:${place.id}`,
        x: place.x,
        y: place.y,
        localX: ts * 0.5,
        localZ: ts * 0.5,
        heightAboveFloor,
        color: new THREE.Color(sum.r, sum.g, sum.b),
        intensity,
        distance: rangeTiles * ts,
        castShadows,
        rank: castShadows ? 4 : 1,
        meta: buildMeta(place.spriteId, place.x, place.y, spr, intensity),
      });
    }
  }

  if (voxelModels && map.voxelProps?.length) {
    for (const place of map.voxelProps) {
      const model = voxelModels[place.modelId];
      if (!model) continue;
      const casts =
        place.emissiveCastsLight !== undefined
          ? place.emissiveCastsLight
          : model.emissiveCastsLight === true;
      if (!casts) continue;
      const sum = summarizeVoxelEmissive(model);
      if (!sum || sum.count < 1) continue;

      const strength = resolveEmissiveStrength(
        place.emissiveStrength ?? model.emissiveStrength,
      );
      const rangeTiles = resolveEmissiveLightRange(
        place.emissiveLightRange ?? model.emissiveLightRange,
      );
      // Voxel cores are denser than pixel ink — mild gain from cell count.
      const dens = Math.max(
        0.35,
        Math.min(1, 0.4 + sum.weight * 0.35 + Math.min(0.35, sum.count * 0.04)),
      );
      const intensity = voxelPeakIntensity(strength, dens);
      const elev = place.elev ?? tileSurfaceElev(map, place.x, place.y);
      const origin = resolveVoxelLightOrigin(model, sum);
      const worldPosition = voxelLightWorldPosition(
        place,
        model,
        ts,
        elev,
        origin,
      );
      const castShadows =
        place.emissiveLightShadows !== undefined
          ? place.emissiveLightShadows
          : model.emissiveLightShadows === true;
      const torchFlicker =
        place.emissiveTorchFlicker !== undefined
          ? place.emissiveTorchFlicker
          : model.emissiveTorchFlicker === true;
      const lanternFlicker =
        place.emissiveLanternFlicker !== undefined
          ? place.emissiveLanternFlicker
          : model.emissiveLanternFlicker === true;
      const distance = rangeTiles * ts;
      // Explicit placement shadow flag outranks auto chest lights.
      const rank =
        (castShadows ? 20 : 8) +
        (place.emissiveLightShadows === true ? 8 : 0);

      out.push({
        id: `emvox:${place.id}`,
        x: place.x,
        y: place.y,
        localX: ts * 0.5,
        localZ: ts * 0.5,
        heightAboveFloor: worldPosition.y,
        worldPosition,
        color: new THREE.Color(sum.r, sum.g, sum.b),
        intensity,
        distance,
        castShadows,
        rank,
        meta: buildMeta(
          place.modelId,
          place.x,
          place.y,
          {
            torchFlicker,
            lanternFlicker,
            baseDistance: distance,
          },
          intensity,
        ),
      });
    }
  }

  // Chest regions: pull PointLights from linked sculptor models/scenes.
  if (voxelModels) {
    for (const region of map.regions ?? []) {
      if (region.kind !== "chest") continue;
      const pose = resolveChestModelPose(map, region);
      const scene =
        region.sceneId && voxelScenes
          ? voxelScenes[region.sceneId]
          : undefined;
      if (scene) {
        for (const obj of scene.objects) {
          if (obj.visible === false) continue;
          const model = voxelModels[obj.modelId];
          if (!model || model.emissiveCastsLight !== true) continue;
          const sum = summarizeVoxelEmissive(model);
          if (!sum) continue;
          const origin = resolveVoxelLightOrigin(model, sum);
          const worldPosition = chestSceneLightWorldPosition(
            pose,
            scene,
            voxelModels,
            obj.offset,
            ts,
            origin,
          );
          if (!worldPosition) continue;
          pushVoxelEmissiveLight(out, {
            id: `emchest:${region.id}:${obj.id}`,
            modelId: obj.modelId,
            model,
            tx: pose.tx,
            ty: pose.ty,
            worldPosition,
            ts,
            rank: model.emissiveLightShadows === true ? 3 : 0,
          });
        }
        continue;
      }
      const modelId = region.closedModelId;
      if (!modelId) continue;
      const model = voxelModels[modelId];
      if (!model || model.emissiveCastsLight !== true) continue;
      const sum = summarizeVoxelEmissive(model);
      if (!sum) continue;
      const origin = resolveVoxelLightOrigin(model, sum);
      pushVoxelEmissiveLight(out, {
        id: `emchest:${region.id}`,
        modelId,
        model,
        tx: pose.tx,
        ty: pose.ty,
        worldPosition: chestModelLightWorldPosition(
          pose,
          model,
          ts,
          origin,
        ),
        ts,
        rank: model.emissiveLightShadows === true ? 3 : 0,
      });
    }
  }

  // Prefer map voxel lanterns / shadow casters when over the light/shadow caps.
  out.sort((a, b) => {
    const ra = (a.rank ?? 0) + (a.castShadows ? 40 : 0) + a.intensity * 0.02;
    const rb = (b.rank ?? 0) + (b.castShadows ? 40 : 0) + b.intensity * 0.02;
    return rb - ra;
  });
  return out.slice(0, THREE_MAX_EMISSIVE_LIGHTS);
}

function enableEmissiveShadow(
  pl: THREE.PointLight,
  tileSize: number,
  mapSize = 512,
): void {
  pl.castShadow = true;
  const res = Math.max(128, Math.round(mapSize));
  pl.shadow.mapSize.set(res, res);
  pl.shadow.bias = -0.0004;
  pl.shadow.normalBias = Math.max(0.05, tileSize * 0.01);
  pl.shadow.camera.near = Math.max(0.25, tileSize * 0.04);
  // Cover MAP_LIGHT_RANGE_MAX (~16 tiles) so far clip doesn't kill umbras.
  pl.shadow.camera.far = Math.max(pl.distance * 1.25, tileSize * 18);
  pl.shadow.camera.updateProjectionMatrix();
  pl.shadow.radius = 0;
  pl.shadow.intensity = 1;
}

/** Spawn soft PointLights (optional shadows, soft decay). Returns lights for anim tick. */
export function addThreeEmissiveLocalLights(
  root: THREE.Object3D,
  map: EmberMap,
  tileset: EmberTileset,
  sprites?: EmberSpriteLib,
  opts?: {
    shadows?: boolean;
    /** Shared renderer-wide PointLight budget after lanterns were added. */
    maxLights?: number;
    /** Cap cube-shadow emissive lights (default THREE_MAX_EMISSIVE_SHADOWS). */
    maxShadows?: number;
    shadowMapSize?: number;
    voxelModels?: EmberVoxelModelLib;
    voxelScenes?: EmberVoxelSceneLib;
  },
): THREE.PointLight[] {
  const sources = listEmissiveLocalLights(
    map,
    tileset,
    sprites,
    opts?.voxelModels,
    opts?.voxelScenes,
  );
  const lights: THREE.PointLight[] = [];
  const ts = Math.max(1, map.tileSize);
  const allowShadows = opts?.shadows !== false;
  const maxShadows = Math.max(
    0,
    Math.min(
      THREE_MAX_EMISSIVE_SHADOWS,
      opts?.maxShadows ?? THREE_MAX_EMISSIVE_SHADOWS,
    ),
  );
  const shadowMapSize = opts?.shadowMapSize ?? 512;
  const maxLights = Math.max(
    0,
    Math.min(
      THREE_MAX_EMISSIVE_LIGHTS,
      Math.floor(opts?.maxLights ?? THREE_MAX_EMISSIVE_LIGHTS),
    ),
  );
  let shadowSlots = allowShadows ? maxShadows : 0;

  // Match lantern disc packing so MeshToon materials get hard core/mid/rim.
  const discDecay = packLampDiscDecay(0.32, 0.62);
  for (const src of sources.slice(0, maxLights)) {
    const pl = new THREE.PointLight(
      src.color,
      0, // start extinguished — tick eases up
      src.distance,
      discDecay,
    );
    pl.castShadow = false;
    if (src.worldPosition) {
      pl.position.set(
        src.worldPosition.x,
        src.worldPosition.y,
        src.worldPosition.z,
      );
    } else {
      pl.position.set(
        src.x * ts + src.localX,
        src.heightAboveFloor,
        src.y * ts + src.localZ,
      );
    }
    if (src.castShadows && shadowSlots > 0) {
      enableEmissiveShadow(pl, ts, shadowMapSize);
      shadowSlots -= 1;
    }
    pl.userData.emberEmissiveLight = true;
    pl.userData.emberEmissiveSourceId = src.id;
    tagEmissiveLight(pl, src.meta);
    root.add(pl);
    lights.push(pl);
  }
  return lights;
}

/**
 * Move existing emissive PointLights when voxel/sprite/chest poses change
 * without a full light rebuild (editor incremental prop sync).
 */
export function syncThreeEmissiveLocalLightPoses(
  lights: readonly THREE.PointLight[],
  map: EmberMap,
  tileset: EmberTileset,
  sprites?: EmberSpriteLib,
  opts?: {
    voxelModels?: EmberVoxelModelLib;
    voxelScenes?: EmberVoxelSceneLib;
  },
): void {
  if (!lights.length) return;
  const sources = listEmissiveLocalLights(
    map,
    tileset,
    sprites,
    opts?.voxelModels,
    opts?.voxelScenes,
  );
  if (!sources.length) return;
  const byId = new Map(sources.map((s) => [s.id, s]));
  const ts = Math.max(1, map.tileSize);
  for (const pl of lights) {
    const id = pl.userData.emberEmissiveSourceId as string | undefined;
    if (!id) continue;
    const src = byId.get(id);
    if (!src) continue;
    if (src.worldPosition) {
      pl.position.set(
        src.worldPosition.x,
        src.worldPosition.y,
        src.worldPosition.z,
      );
    } else {
      pl.position.set(
        src.x * ts + src.localX,
        src.heightAboveFloor,
        src.y * ts + src.localZ,
      );
    }
    const meta = pl.userData.emberEmissive as EmberEmissiveLightMeta | undefined;
    if (meta) {
      meta.tx = src.x;
      meta.ty = src.y;
    }
  }
}
