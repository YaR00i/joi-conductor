/**
 * Shared interactivity modifier contract: data parse, occupancy, wouldFire.
 * Used by editor, exploreSim, and play overlays.
 */
import { isEmberQuestMarkerStatus } from "./emberScript";
import {
  EMBER_INTERACTIVITY_KINDS,
  type EmberInteractivityKind,
  type EmberInteractivityModifier,
  type EmberMap,
  type EmberMapRegion,
  type EmberSpritePlacement,
  type EmberVoxelModel,
  type EmberVoxelPlacement,
  type MapRegionKind,
} from "./types";
import { pointInRegion } from "../tile/mapUtils";

export type InteractiveProp = {
  id: string;
  source: "voxel" | "sprite";
  x: number;
  y: number;
  w: number;
  h: number;
  interactivity: EmberInteractivityModifier;
};

export type InteractivityWouldFire =
  | { action: "run_script"; scriptId: string | null }
  | { action: "talk"; scriptId: string | null }
  | {
      action: "shop";
      shopId: string | null;
      nameRu: string | null;
      wallet: number;
      listings: Array<{
        itemId: string;
        nameRu: string;
        buyPrice: number;
        sellPrice: number;
        stock: number | null;
      }>;
    }
  | {
      action: "change_map";
      targetMapId: string;
      targetRegionId: string | null;
    }
  | {
      action: "open_chest";
      closedModelId: string | null;
      sceneId: string | null;
      loot: string[];
      lootNames: string[];
      empty: boolean;
      opened: boolean;
      alreadyOpen: boolean;
      repeatable: boolean;
    }
  | {
      action: "warp";
      targetRegionId: string | null;
      targetX: number | null;
      targetY: number | null;
    };

export type InteractHit =
  | {
      kind: "region";
      region: EmberMapRegion;
      via: "occupying" | "facing";
    }
  | {
      kind: "prop";
      prop: InteractiveProp;
      via: "occupying" | "facing";
    };

export function isInteractableRegionKind(
  kind: MapRegionKind,
): kind is "trigger" | "chest" | "teleport" {
  switch (kind) {
    case "trigger":
    case "chest":
    case "teleport":
      return true;
    case "player_start":
    case "spawn":
    case "camera_bound":
    case "npc_idle":
    case "npc_wander":
      return false;
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

/** Occupying volume/prop first, then one tile in facing direction. */
export function pickInteractHit(
  map: EmberMap,
  x: number,
  y: number,
  facingMx: number,
  facingMy: number,
  voxelModels?: Record<string, EmberVoxelModel | undefined>,
  elev?: number,
): InteractHit | null {
  const occupying = map.regions.find(
    (region) =>
      isInteractableRegionKind(region.kind) &&
      pointInRegion(map, region, x, y, elev),
  );
  if (occupying) {
    return { kind: "region", region: occupying, via: "occupying" };
  }
  const occupyingProp = findInteractivePropAt(map, x, y, voxelModels);
  if (occupyingProp) {
    return { kind: "prop", prop: occupyingProp, via: "occupying" };
  }
  const ts = map.tileSize;
  const fx = x + facingMx * ts;
  const fy = y + facingMy * ts;
  const facingHit = map.regions.find(
    (region) =>
      isInteractableRegionKind(region.kind) &&
      pointInRegion(map, region, fx, fy, elev),
  );
  if (facingHit) {
    return { kind: "region", region: facingHit, via: "facing" };
  }
  const facingProp = findInteractivePropAt(map, fx, fy, voxelModels);
  if (facingProp) {
    return { kind: "prop", prop: facingProp, via: "facing" };
  }
  return null;
}

export function isEmberInteractivityKind(
  value: unknown,
): value is EmberInteractivityKind {
  return (
    typeof value === "string" &&
    (EMBER_INTERACTIVITY_KINDS as readonly string[]).includes(value)
  );
}

export function defaultInteractivity(
  kind: EmberInteractivityKind = "custom",
): EmberInteractivityModifier {
  return { kind };
}

export function parseInteractivity(
  raw: unknown,
): EmberInteractivityModifier | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (!isEmberInteractivityKind(rec.kind)) return null;
  const next: EmberInteractivityModifier = { kind: rec.kind };
  if (typeof rec.triggerId === "string" && rec.triggerId.trim()) {
    next.triggerId = rec.triggerId.trim();
  }
  if (typeof rec.scriptId === "string" && rec.scriptId.trim()) {
    next.scriptId = rec.scriptId.trim();
  }
  if (typeof rec.iconId === "string" && rec.iconId.trim()) {
    next.iconId = rec.iconId.trim();
  }
  if (typeof rec.shopId === "string" && rec.shopId.trim()) {
    next.shopId = rec.shopId.trim();
  }
  if (isEmberQuestMarkerStatus(rec.questStatus)) {
    next.questStatus = rec.questStatus;
  }
  return next;
}

export function compactInteractivity(
  value: EmberInteractivityModifier,
): EmberInteractivityModifier {
  const next: EmberInteractivityModifier = { kind: value.kind };
  if (value.triggerId?.trim()) next.triggerId = value.triggerId.trim();
  if (value.scriptId?.trim()) next.scriptId = value.scriptId.trim();
  if (value.iconId?.trim()) next.iconId = value.iconId.trim();
  if (value.shopId?.trim()) next.shopId = value.shopId.trim();
  if (isEmberQuestMarkerStatus(value.questStatus)) {
    next.questStatus = value.questStatus;
  }
  return next;
}

export function isQuestMarkerKind(kind: EmberInteractivityKind): boolean {
  switch (kind) {
    case "quest_marker":
      return true;
    case "door":
    case "talk":
    case "shop":
    case "custom":
      return false;
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

function optionalText(value: string | undefined): string | null {
  const text = value?.trim() ?? "";
  return text || null;
}

export function boundTriggerFor(
  map: EmberMap,
  modifier: EmberInteractivityModifier,
): EmberMapRegion | null {
  const id = optionalText(modifier.triggerId);
  if (!id) return null;
  return map.regions.find((region) => region.id === id) ?? null;
}

export function wouldFireForTriggerRegion(
  region: EmberMapRegion,
): InteractivityWouldFire {
  const targetMapId = optionalText(region.targetMapId);
  if (targetMapId) {
    return {
      action: "change_map",
      targetMapId,
      targetRegionId: optionalText(region.targetRegionId),
    };
  }
  return {
    action: "run_script",
    scriptId: optionalText(region.scriptId),
  };
}

export function wouldFireForInteractivity(
  map: EmberMap,
  modifier: EmberInteractivityModifier,
): InteractivityWouldFire {
  const bound = boundTriggerFor(map, modifier);
  switch (modifier.kind) {
    case "shop":
      return {
        action: "shop",
        shopId: optionalText(modifier.shopId),
        nameRu: null,
        wallet: 0,
        listings: [],
      };
    case "talk":
      return {
        action: "talk",
        scriptId:
          optionalText(modifier.scriptId) ??
          optionalText(bound?.scriptId) ??
          null,
      };
    case "door":
    case "quest_marker":
    case "custom":
      if (bound) return wouldFireForTriggerRegion(bound);
      return {
        action: "run_script",
        scriptId: optionalText(modifier.scriptId),
      };
    default: {
      const _never: never = modifier.kind;
      return _never;
    }
  }
}

export function listInteractiveProps(
  map: EmberMap,
  voxelModels?: Record<string, EmberVoxelModel | undefined>,
): InteractiveProp[] {
  const out: InteractiveProp[] = [];
  for (const place of map.voxelProps ?? []) {
    const interactivity = parseInteractivity(place.interactivity);
    if (!interactivity) continue;
    out.push(interactiveVoxelProp(place, interactivity, voxelModels?.[place.modelId]));
  }
  for (const place of map.sprites ?? []) {
    const interactivity = parseInteractivity(place.interactivity);
    if (!interactivity) continue;
    out.push(interactiveSpriteProp(place, interactivity));
  }
  return out;
}

function interactiveVoxelProp(
  place: EmberVoxelPlacement,
  interactivity: EmberInteractivityModifier,
  model: EmberVoxelModel | undefined,
): InteractiveProp {
  const w = Math.max(1, Math.round(model?.sizeBlocks.x ?? 1));
  const h = Math.max(1, Math.round(model?.sizeBlocks.z ?? 1));
  return {
    id: place.id,
    source: "voxel",
    x: place.x,
    y: place.y,
    w,
    h,
    interactivity,
  };
}

function interactiveSpriteProp(
  place: EmberSpritePlacement,
  interactivity: EmberInteractivityModifier,
): InteractiveProp {
  return {
    id: place.id,
    source: "sprite",
    x: place.x,
    y: place.y,
    w: 1,
    h: 1,
    interactivity,
  };
}

export function pointHitsInteractiveProp(
  map: EmberMap,
  prop: InteractiveProp,
  x: number,
  y: number,
): boolean {
  const ts = map.tileSize;
  const left = prop.x * ts;
  const top = prop.y * ts;
  const right = (prop.x + prop.w) * ts;
  const bottom = (prop.y + prop.h) * ts;
  return x >= left && x < right && y >= top && y < bottom;
}

export function findInteractivePropAt(
  map: EmberMap,
  x: number,
  y: number,
  voxelModels?: Record<string, EmberVoxelModel | undefined>,
): InteractiveProp | null {
  return (
    listInteractiveProps(map, voxelModels).find((prop) =>
      pointHitsInteractiveProp(map, prop, x, y),
    ) ?? null
  );
}
