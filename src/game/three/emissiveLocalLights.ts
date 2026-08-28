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
import {
  resolveSpriteWorldOffsetVoxels,
  spriteTotalHeight,
} from "../content/pixelSprite";
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
  listLanternSources,
  tileSurfaceElev,
} from "../tile/mapUtils";
import {
  resolveChestModelPose,
  type ChestModelPose,
} from "../voxel/chestPlacement";
import { VOXELS_PER_BLOCK } from "../voxel/constants";
import {
  listVoxelEmissiveLamps,
  resolveVoxelLampOrigin,
  summarizeVoxelEmissive,
  summarizeVoxelEmissiveForLamp,
} from "../voxel/voxelEmissiveLight";
import { sceneFootprintVoxels } from "../voxel/voxelModelApply";
import {
  voxelGridSize,
  voxelTransmittanceLeak,
  voxelTransmittanceShadowParams,
} from "../voxel/voxelModel";
import { resolveEmberTransformScale } from "../world/worldTransform";
import { normalizeVoxelRot } from "../voxel/voxelPlacement";
import {
  tagEmissiveLight,
  type EmberEmissiveLightMeta,
} from "./emissiveAnimTick";
import { MAP_POINT_LIGHTS_MAX } from "../tile/lightLimits";
import { setPointLightShadowGranted } from "./dynamicShadowPolicy";
import { packLampDiscDecay } from "./threeLighting";

export const THREE_MAX_EMISSIVE_LIGHTS = 48;
/** Match the map light ceiling so every emissive source can keep a baked cube. */
export const THREE_MAX_EMISSIVE_SHADOWS = MAP_POINT_LIGHTS_MAX;

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
   * 0..1 analog leak from voxel transmittance. Dims and softens this
   * PointLight's umbra; omitted / 0 keeps a hard lantern shadow.
   */
  shadowLeak?: number;
  /** Soften cartoon lamp discs / outer light cutoff. */
  softRings?: boolean;
  /** Force transmittance-style penumbra even with leak 0. */
  softShadows?: boolean;
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
  const scale = resolveEmberTransformScale(place.scale);
  const ly = origin.y * vw * scale.z;
  const rx = (origin.x * vw - w * 0.5) * scale.x;
  const rz = (origin.z * vw - d * 0.5) * scale.y;
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
    sum?: ReturnType<typeof summarizeVoxelEmissive>;
    range?: number;
    strength?: number;
    castShadows?: boolean;
    softRings?: boolean;
    softShadows?: boolean;
    torchFlicker?: boolean;
    lanternFlicker?: boolean;
  },
): void {
  const { id, modelId, model, tx, ty, worldPosition, ts } = args;
  if (model.emissiveCastsLight !== true) return;
  const sum = args.sum ?? summarizeVoxelEmissive(model);
  if (!sum || sum.count < 1) return;
  const strength = resolveEmissiveStrength(args.strength ?? model.emissiveStrength);
  const rangeTiles = resolveEmissiveLightRange(
    args.range ?? model.emissiveLightRange,
  );
  const dens = Math.max(
    0.35,
    Math.min(1, 0.4 + sum.weight * 0.35 + Math.min(0.35, sum.count * 0.04)),
  );
  const intensity = voxelPeakIntensity(strength, dens);
  const distance = rangeTiles * ts;
  const castShadows = args.castShadows ?? model.emissiveLightShadows === true;
  const torchFlicker =
    args.torchFlicker ?? model.emissiveTorchFlicker === true;
  const lanternFlicker =
    args.lanternFlicker ?? model.emissiveLanternFlicker === true;
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
    shadowLeak: voxelTransmittanceLeak(model),
    softRings: args.softRings ?? model.emissiveLightSoftRings === true,
    softShadows: args.softShadows ?? model.emissiveLightSoftShadows === true,
    rank: args.rank ?? (castShadows ? 2 : 0),
    meta: buildMeta(
      modelId,
      tx,
      ty,
      {
        torchFlicker: torchFlicker ? true : undefined,
        lanternFlicker: lanternFlicker ? true : undefined,
        baseDistance: distance,
      },
      intensity,
    ),
  });
}

function voxelLampSourceId(
  baseId: string,
  lamps: { id: string }[],
  lamp: { id: string },
): string {
  return lamps.length <= 1 ? baseId : `${baseId}:${lamp.id}`;
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
      const elev = place.elev ?? tileSurfaceElev(map, place.x, place.y);
      const scale = resolveEmberTransformScale(place.scale);
      const visualOffset = resolveSpriteWorldOffsetVoxels(spr);
      const voxelWorld = ts / VOXELS_PER_BLOCK;
      // Place light near the lit band centroid along the stack height.
      const cyNorm =
        sum.cy >= 0 ? 1 - (sum.cy + 0.5) / Math.max(1, sum.height) : 0.45;
      const stackH =
        (totalH / Math.max(1, spr.width)) * ts * scale.z;
      const heightAboveFloor =
        elev * storyH +
        Math.max(0.15 * ts, cyNorm * stackH) +
        visualOffset.z * voxelWorld;

      const castShadows = spr.emissiveLightShadows === true;
      out.push({
        id: `emspr:${place.id}`,
        x: place.x,
        y: place.y,
        localX: ts * 0.5 + visualOffset.x * voxelWorld,
        localZ: ts * 0.5 + visualOffset.y * voxelWorld,
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
      const lamps = listVoxelEmissiveLamps(model);
      const elev = place.elev ?? tileSurfaceElev(map, place.x, place.y);
      for (let li = 0; li < lamps.length; li++) {
        const lamp = lamps[li]!;
        const lampSum = summarizeVoxelEmissiveForLamp(model, lamps, li);
        if (!lampSum || lampSum.count < 1) continue;
        const origin = resolveVoxelLampOrigin(model, lamp, lampSum);
        const worldPosition = voxelLightWorldPosition(
          place,
          model,
          ts,
          elev,
          origin,
        );
        const strength = resolveEmissiveStrength(
          lamp.strength ?? place.emissiveStrength ?? model.emissiveStrength,
        );
        const rangeTiles = resolveEmissiveLightRange(
          lamp.range ?? place.emissiveLightRange ?? model.emissiveLightRange,
        );
        const dens = Math.max(
          0.35,
          Math.min(
            1,
            0.4 + lampSum.weight * 0.35 + Math.min(0.35, lampSum.count * 0.04),
          ),
        );
        const intensity = voxelPeakIntensity(strength, dens);
        const castShadows =
          place.emissiveLightShadows !== undefined
            ? place.emissiveLightShadows
            : lamp.shadows === true || model.emissiveLightShadows === true;
        const torchFlicker =
          place.emissiveTorchFlicker !== undefined
            ? place.emissiveTorchFlicker
            : lamp.torchFlicker === true ||
              model.emissiveTorchFlicker === true;
        const lanternFlicker =
          place.emissiveLanternFlicker !== undefined
            ? place.emissiveLanternFlicker
            : lamp.lanternFlicker === true ||
              model.emissiveLanternFlicker === true;
        const distance = rangeTiles * ts;
        const rank =
          (castShadows ? 20 : 8) +
          (place.emissiveLightShadows === true ? 8 : 0) +
          (torchFlicker || lanternFlicker ? 16 : 0);
        out.push({
          id: voxelLampSourceId(`emvox:${place.id}`, lamps, lamp),
          x: place.x,
          y: place.y,
          localX: ts * 0.5,
          localZ: ts * 0.5,
          heightAboveFloor: worldPosition.y,
          worldPosition,
          color: new THREE.Color(lampSum.r, lampSum.g, lampSum.b),
          intensity,
          distance,
          castShadows,
          shadowLeak: voxelTransmittanceLeak(model),
          softRings:
            lamp.softRings === true || model.emissiveLightSoftRings === true,
          softShadows:
            lamp.softShadows === true ||
            model.emissiveLightSoftShadows === true,
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
          const lamps = listVoxelEmissiveLamps(model);
          for (let li = 0; li < lamps.length; li++) {
            const lamp = lamps[li]!;
            const lampSum = summarizeVoxelEmissiveForLamp(model, lamps, li);
            if (!lampSum) continue;
            const origin = resolveVoxelLampOrigin(model, lamp, lampSum);
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
              id: voxelLampSourceId(
                `emchest:${region.id}:${obj.id}`,
                lamps,
                lamp,
              ),
              modelId: obj.modelId,
              model,
              tx: pose.tx,
              ty: pose.ty,
              worldPosition,
              ts,
              rank: model.emissiveLightShadows === true ? 3 : 0,
              sum: lampSum,
              range: lamp.range,
              strength: lamp.strength,
              castShadows:
                lamp.shadows === true || model.emissiveLightShadows === true,
              softRings:
                lamp.softRings === true || model.emissiveLightSoftRings === true,
              softShadows:
                lamp.softShadows === true ||
                model.emissiveLightSoftShadows === true,
              torchFlicker:
                lamp.torchFlicker === true ||
                model.emissiveTorchFlicker === true,
              lanternFlicker:
                lamp.lanternFlicker === true ||
                model.emissiveLanternFlicker === true,
            });
          }
        }
        continue;
      }
      const modelId = region.closedModelId;
      if (!modelId) continue;
      const model = voxelModels[modelId];
      if (!model || model.emissiveCastsLight !== true) continue;
      const lamps = listVoxelEmissiveLamps(model);
      for (let li = 0; li < lamps.length; li++) {
        const lamp = lamps[li]!;
        const lampSum = summarizeVoxelEmissiveForLamp(model, lamps, li);
        if (!lampSum) continue;
        const origin = resolveVoxelLampOrigin(model, lamp, lampSum);
        pushVoxelEmissiveLight(out, {
          id: voxelLampSourceId(`emchest:${region.id}`, lamps, lamp),
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
          sum: lampSum,
          range: lamp.range,
          strength: lamp.strength,
          castShadows:
            lamp.shadows === true || model.emissiveLightShadows === true,
          softRings:
            lamp.softRings === true || model.emissiveLightSoftRings === true,
          softShadows:
            lamp.softShadows === true ||
            model.emissiveLightSoftShadows === true,
          torchFlicker:
            lamp.torchFlicker === true || model.emissiveTorchFlicker === true,
          lanternFlicker:
            lamp.lanternFlicker === true ||
            model.emissiveLanternFlicker === true,
        });
      }
    }
  }

  // Prefer map voxel lanterns / shadow casters when over the light/shadow caps.
  out.sort((a, b) => {
    const flickerBonus = (src: EmissiveLocalLightSource) =>
      src.meta.torchFlicker || src.meta.lanternFlicker ? 16 : 0;
    const ra =
      (a.rank ?? 0) +
      (a.castShadows ? 40 : 0) +
      flickerBonus(a) +
      a.intensity * 0.02;
    const rb =
      (b.rank ?? 0) +
      (b.castShadows ? 40 : 0) +
      flickerBonus(b) +
      b.intensity * 0.02;
    return rb - ra;
  });
  return out.slice(0, THREE_MAX_EMISSIVE_LIGHTS);
}

/** Authored lanterns plus emissive PointLight objects currently on the map. */
export function countMapLocalLightObjects(
  map: EmberMap,
  tileset: EmberTileset,
  opts?: {
    sprites?: EmberSpriteLib;
    voxelModels?: EmberVoxelModelLib;
    voxelScenes?: EmberVoxelSceneLib;
  },
): number {
  return (
    listLanternSources(map, tileset, opts?.sprites).length +
    listEmissiveLocalLights(
      map,
      tileset,
      opts?.sprites,
      opts?.voxelModels,
      opts?.voxelScenes,
    ).length
  );
}

function enableEmissiveShadow(
  pl: THREE.PointLight,
  tileSize: number,
  mapSize = 512,
  leak = 0,
  forceSoft = false,
): void {
  pl.castShadow = false;
  const res = Math.max(128, Math.round(mapSize));
  pl.shadow.mapSize.set(res, res);
  pl.shadow.bias = -0.0002;
  // Keep the offset below a voxel edge on normal 16 px tiles. The former
  // tileSize*0.01 could detach the host's own shadow entirely.
  pl.shadow.normalBias = Math.max(
    0.025,
    Math.min(0.08, tileSize * 0.004),
  );
  pl.shadow.camera.near = Math.max(
    0.05,
    Math.min(0.2, tileSize * 0.008),
  );
  // Cover the maximum torch radius wobble without changing the projection at
  // runtime. MAP_LIGHT_RANGE_MAX remains covered by the tile fallback.
  pl.shadow.camera.far = Math.max(pl.distance * 1.5, tileSize * 18);
  pl.shadow.camera.updateProjectionMatrix();
  const soft = voxelTransmittanceShadowParams(leak, forceSoft);
  pl.shadow.radius = soft.radius;
  pl.shadow.intensity = soft.intensity;
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
    /**
     * Explore: only torch/lantern-flicker lamps may consume cube slots.
     * Windows keep PointLight fill without a cube sampler.
     */
    lampFlickerShadowsOnly?: boolean;
    shadowMapSize?: number;
    voxelModels?: EmberVoxelModelLib;
    voxelScenes?: EmberVoxelSceneLib;
    /** Optional tile-space runtime window for local light streaming. */
    sourceBounds?: { x0: number; y0: number; x1: number; y1: number };
  },
): THREE.PointLight[] {
  const allSources = listEmissiveLocalLights(
    map,
    tileset,
    sprites,
    opts?.voxelModels,
    opts?.voxelScenes,
  );
  const sources = opts?.sourceBounds
    ? allSources.filter(
        (source) =>
          source.x >= opts.sourceBounds!.x0 &&
          source.y >= opts.sourceBounds!.y0 &&
          source.x < opts.sourceBounds!.x1 &&
          source.y < opts.sourceBounds!.y1,
      )
    : allSources;
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

  // Per-lamp disc packing so MeshToon materials get hard or soft core/mid/rim.
  for (const src of sources.slice(0, maxLights)) {
    const pl = new THREE.PointLight(
      src.color,
      0, // start extinguished — tick eases up
      src.distance,
      packLampDiscDecay(0.32, 0.62, src.softRings === true),
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
    const shadowRequested =
      allowShadows &&
      src.castShadows &&
      (opts?.lampFlickerShadowsOnly !== true ||
        src.meta.torchFlicker === true ||
        src.meta.lanternFlicker === true);
    const granted = shadowRequested && shadowSlots > 0;
    if (granted) {
      enableEmissiveShadow(
        pl,
        ts,
        shadowMapSize,
        src.shadowLeak ?? 0,
        src.softShadows === true,
      );
      shadowSlots -= 1;
    }
    setPointLightShadowGranted(pl, granted);
    pl.userData.emberEmissiveLight = true;
    pl.userData.emberEmissiveSourceId = src.id;
    pl.userData.emberShadowRequested = shadowRequested;
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
