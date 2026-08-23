import type {
  EmberInteractivityModifier,
  EmberLightPreset,
  EmberLightSource,
  EmberMap,
  EmberMapRegion,
  EmberPack,
  EmberPixelSprite,
  EmberSpritePlacement,
  EmberTileset,
  EmberTilesetTile,
  EmberVoxelModel,
  EmberVoxelPlacement,
} from "../../content/types";
import { clampElevation } from "../../content/types";
import {
  compactInteractivity,
  defaultInteractivity,
  isEmberInteractivityKind,
  parseInteractivity,
} from "../../content/interactivity";
import { compactLootIds, parseLootIds } from "../../content/chestLoot";
import {
  clearElevTile,
  elevationAt,
  elevTileIdAt,
  ensureMapLayers,
  heightVoxelsAt,
  tileSurfaceElev,
  regionVolumeElev,
  topOccupiedElevAt,
} from "../../tile/mapUtils";
import {
  resolveEmissiveLightRange,
  resolveEmissiveStrength,
} from "../../tile/emissivePaint";
import type {
  EmberWorldColliderComponent,
  EmberWorldObject,
  EmberWorldObjectComponent,
  EmberWorldObjectRef,
  EmberWorldTransform,
  EmberWorldTransformPatch,
} from "./EmberWorldObject";
import { emberWorldObjectRefKey } from "./EmberWorldObject";
import type { EmberInspectorFieldEdit } from "./EmberInspectorSchema";
import {
  normalizeEmberSceneHierarchy,
  refreshEmberSceneHierarchyPivots,
} from "./EmberSceneHierarchy";
import {
  clearVoxelInstanceComponent,
  clearVoxelInstanceField,
  resolveVoxelPrefabState,
  setVoxelAssetComponentPresence,
  setVoxelInstanceComponentPresence,
  voxelOptionalComponentPresent,
  type EmberOptionalComponentType,
  type EmberVoxelOptionalComponentType,
  type EmberVoxelOverrideComponentType,
} from "./EmberVoxelPrefab";
import {
  resolveSpriteInstanceCollider,
  resolveTileInstanceCollider,
  setColliderField,
  spriteAssetColliderPresent,
  spriteInstanceColliderPresent,
  tileAssetColliderPresent,
  tileInstanceColliderPresent,
  tileInstanceModifierAt,
} from "../../world/worldObjectModifiers";
import {
  compactEmberTransformScale,
  resolveEmberTransformScale,
} from "../../world/worldTransform";

export type EmberWorldObjectAdapterContext = Readonly<{
  pack?: EmberPack;
  tileset?: EmberTileset;
}>;

function normalizeQuarterTurns(value: number | undefined): number {
  return ((Math.round(value ?? 0) % 4) + 4) % 4;
}

function transform(
  x: number,
  y: number,
  authoredZ: number | null,
  resolvedZ: number,
  rotationQuarterTurns = 0,
  authoredScale?: { x?: number; y?: number; z?: number },
): EmberWorldTransform {
  return {
    position: { x, y, z: authoredZ },
    resolvedZ,
    rotationQuarterTurns: normalizeQuarterTurns(rotationQuarterTurns),
    scale: resolveEmberTransformScale(authoredScale),
  };
}

function colliderForVoxel(
  placement: NonNullable<EmberMap["voxelProps"]>[number],
  model: EmberVoxelModel | undefined,
): EmberWorldColliderComponent {
  const state = resolveVoxelPrefabState(placement, model);
  const sources = Object.values(state.collider.sources);
  const inheritedFrom = sources.includes("instance")
    ? "instance"
    : sources.includes("asset")
      ? "asset"
      : sources.includes("legacy")
        ? "legacy"
        : "default";
  return {
    type: "collider",
    modifier: state.collider.value,
    inheritedFrom,
    fieldSources: state.collider.sources,
  };
}

function voxelObjectComponents(
  placement: EmberVoxelPlacement,
  model: EmberVoxelModel | undefined,
): EmberWorldObjectComponent[] {
  const prefab = resolveVoxelPrefabState(placement, model);
  const components: EmberWorldObjectComponent[] = [
    {
      type: "voxel-renderer",
      modelId: placement.modelId,
      directLightScale: prefab.directLightScale.value,
      fieldSources: { directLightScale: prefab.directLightScale.source },
    },
  ];
  if (voxelOptionalComponentPresent(placement, model, "collider")) {
    components.push(colliderForVoxel(placement, model));
  }
  if (voxelOptionalComponentPresent(placement, model, "voxel-light")) {
    components.push({
      type: "voxel-light",
      values: {
        emissiveCastsLight: prefab.light.emissiveCastsLight.value,
        emissiveLightRange: prefab.light.emissiveLightRange.value,
        emissiveLightShadows: prefab.light.emissiveLightShadows.value,
        emissiveStrength: prefab.light.emissiveStrength.value,
        emissiveTorchFlicker: prefab.light.emissiveTorchFlicker.value,
        emissiveLanternFlicker: prefab.light.emissiveLanternFlicker.value,
        emissiveSuppressHostShadow:
          prefab.light.emissiveSuppressHostShadow.value,
      },
      fieldSources: Object.fromEntries(
        Object.entries(prefab.light).map(([field, resolved]) => [
          field,
          resolved.source,
        ]),
      ),
    });
  }
  const interactivity = parseInteractivity(placement.interactivity);
  if (interactivity) {
    components.push({
      type: "interactivity",
      kind: interactivity.kind,
      triggerId: interactivity.triggerId,
      scriptId: interactivity.scriptId,
      iconId: interactivity.iconId,
      shopId: interactivity.shopId,
      questStatus: interactivity.questStatus,
    });
  }
  return components;
}

function colliderForSprite(
  placement: NonNullable<EmberMap["sprites"]>[number],
  context: EmberWorldObjectAdapterContext,
): EmberWorldColliderComponent {
  const sprite = context.pack?.sprites?.[placement.spriteId];
  const fields = [
    "enabled",
    "isTrigger",
    "blocksMovement",
    "walkableTop",
    "heightVoxels",
    "offsetVoxels",
    "layer",
    "mask",
  ] as const;
  const fieldSources = Object.fromEntries(
    fields.map((field) => [
      field,
      placement.collider?.[field] !== undefined
        ? "instance"
        : sprite?.collider?.[field] !== undefined
          ? "asset"
          : sprite?.solid
            ? "legacy"
            : "default",
    ]),
  ) as EmberWorldColliderComponent["fieldSources"];
  return {
    type: "collider",
    modifier: resolveSpriteInstanceCollider(placement, sprite),
    presenceSource:
      placement.componentStates?.collider !== undefined
        ? "instance"
        : sprite?.componentStates?.collider !== undefined
          ? "asset"
          : sprite?.solid
            ? "legacy"
            : "default",
    inheritedFrom: placement.collider
      ? "instance"
      : sprite?.collider
        ? "asset"
        : sprite?.solid
          ? "legacy"
          : "default",
    fieldSources,
  };
}

function colliderForAsset(
  collider: EmberPixelSprite["collider"] | EmberTilesetTile["collider"],
  legacySolid: boolean | undefined,
): EmberWorldColliderComponent {
  return {
    type: "collider",
    modifier: collider ?? (legacySolid ? { enabled: true } : { enabled: true }),
    inheritedFrom: collider ? "asset" : legacySolid ? "legacy" : "default",
    fieldSources: {},
  };
}

function regionComponents(
  region: EmberMap["regions"][number],
): EmberWorldObjectComponent[] {
  const components: EmberWorldObjectComponent[] = [
    { type: "volume", region },
  ];
  if (region.kind === "trigger" || region.kind === "teleport" || region.kind === "chest") {
    components.push({
      type: "trigger",
      scriptId: region.scriptId,
      note: region.note,
      group: region.group,
      targetMapId: region.targetMapId,
      targetRegionId: region.targetRegionId,
      boundObjectId: region.boundObjectId,
    });
  }
  if (region.kind === "teleport") {
    components.push({
      type: "teleport",
      targetRegionId: region.targetRegionId,
      targetPosition:
        region.targetX != null && region.targetY != null
          ? {
              x: region.targetX,
              y: region.targetY,
              ...(region.targetElevation != null
                ? { z: region.targetElevation }
                : {}),
            }
          : undefined,
    });
  } else if (region.kind === "player_start" || region.kind === "spawn") {
    components.push({
      type: "spawn",
      role: region.kind === "player_start" ? "player" : "enemy",
      group: region.group,
    });
  } else if (region.kind === "chest") {
    components.push({
      type: "chest",
      closedModelId: region.closedModelId,
      openModelId: region.openModelId,
      sceneId: region.sceneId,
      openClipId: region.openClipId,
      lootIds: region.lootIds,
      repeatable: region.repeatable,
    });
  } else if (region.kind === "camera_bound") {
    components.push({ type: "camera-bounds" });
  }
  return components;
}

export function getEmberWorldObject(
  map: EmberMap,
  ref: EmberWorldObjectRef,
  context: EmberWorldObjectAdapterContext = {},
): EmberWorldObject | null {
  const key = emberWorldObjectRefKey(ref);
  if (ref.kind === "voxel") {
    const value = map.voxelProps?.find((item) => item.id === ref.id);
    if (!value) return null;
    const resolvedZ = value.elev ?? tileSurfaceElev(map, value.x, value.y);
    const valueTransform = transform(
      value.x,
      value.y,
      value.elev ?? null,
      resolvedZ,
      value.rot,
      value.scale,
    );
    const model = context.pack?.voxelModels?.[value.modelId];
    return {
      key,
      ref,
      kind: "voxel",
      id: value.id,
      name: model?.nameRu ?? value.modelId,
      transform: valueTransform,
      components: [
        { type: "transform", value: valueTransform },
        ...voxelObjectComponents(value, model),
      ],
      removedComponents: (Object.entries(value.componentStates ?? {})
        .filter(([, present]) => present === false)
        .map(([type]) => type) as Array<"collider" | "voxel-light">),
      source: { kind: "voxel", value },
    };
  }
  if (ref.kind === "sprite") {
    const value = map.sprites?.find((item) => item.id === ref.id);
    if (!value) return null;
    const resolvedZ = value.elev ?? tileSurfaceElev(map, value.x, value.y);
    const valueTransform = transform(
      value.x,
      value.y,
      value.elev ?? null,
      resolvedZ,
      0,
      value.scale,
    );
    const sprite = context.pack?.sprites?.[value.spriteId];
    const components: EmberWorldObjectComponent[] = [
      { type: "transform", value: valueTransform },
      { type: "sprite-renderer", spriteId: value.spriteId },
    ];
    if (spriteInstanceColliderPresent(value, sprite)) {
      components.push(colliderForSprite(value, context));
    }
    const spriteInteractivity = parseInteractivity(value.interactivity);
    if (spriteInteractivity) {
      components.push({
        type: "interactivity",
        kind: spriteInteractivity.kind,
        triggerId: spriteInteractivity.triggerId,
        scriptId: spriteInteractivity.scriptId,
        iconId: spriteInteractivity.iconId,
        shopId: spriteInteractivity.shopId,
        questStatus: spriteInteractivity.questStatus,
      });
    }
    return {
      key,
      ref,
      kind: "sprite",
      id: value.id,
      name: sprite?.nameRu ?? value.spriteId,
      transform: valueTransform,
      components,
      removedComponents:
        value.componentStates?.collider === false ? ["collider"] : [],
      source: { kind: "sprite", value },
    };
  }
  if (ref.kind === "light") {
    const value = map.lights?.find(
      (item) => item.id === ref.id && item.enabled !== false,
    );
    if (!value) return null;
    const resolvedZ = tileSurfaceElev(map, value.x, value.y);
    const valueTransform = transform(value.x, value.y, null, resolvedZ);
    return {
      key,
      ref,
      kind: "light",
      id: value.id,
      name: `Light ${value.id}`,
      transform: valueTransform,
      components: [
        { type: "transform", value: valueTransform },
        { type: "light", source: value },
      ],
      source: { kind: "light", value },
    };
  }
  if (ref.kind === "region") {
    const value = map.regions.find((item) => item.id === ref.id);
    if (!value) return null;
    const resolvedZ = regionVolumeElev(map, value);
    const valueTransform: EmberWorldTransform = {
      ...transform(value.x, value.y, value.elev ?? null, resolvedZ),
      scale: { x: value.w, y: value.h, z: 1 },
    };
    return {
      key,
      ref,
      kind: "region",
      id: value.id,
      name: `${value.kind} · ${value.id}`,
      transform: valueTransform,
      components: [
        { type: "transform", value: valueTransform },
        ...regionComponents(value),
      ],
      source: { kind: "region", value },
    };
  }

  const requestedElev =
    ref.elev ?? topOccupiedElevAt(map, ref.tx, ref.ty) ?? elevationAt(map, ref.tx, ref.ty);
  const tileId = elevTileIdAt(map, ref.tx, ref.ty, requestedElev);
  const valueTransform = transform(
    ref.tx,
    ref.ty,
    requestedElev,
    requestedElev,
  );
  const tile = context.tileset?.tiles.find((item) => item.id === tileId);
  const components: EmberWorldObjectComponent[] = [
    { type: "transform", value: valueTransform },
    {
      type: "block",
      tileId,
      elevation: requestedElev,
      heightVoxels: heightVoxelsAt(map, ref.tx, ref.ty),
    },
  ];
  const tileModifier = tileInstanceModifierAt(
    map,
    ref.tx,
    ref.ty,
    requestedElev,
  );
  if (tileInstanceColliderPresent(tileModifier, tile, Boolean(tileId))) {
    const resolved = resolveTileInstanceCollider(
      tileModifier,
      tile,
      Boolean(tileId),
    );
    const fields = [
      "enabled",
      "isTrigger",
      "blocksMovement",
      "walkableTop",
      "heightVoxels",
      "offsetVoxels",
      "layer",
      "mask",
    ] as const;
    components.push({
      type: "collider",
      modifier: resolved,
      presenceSource:
        tileModifier?.componentStates?.collider !== undefined
          ? "instance"
          : tile?.componentStates?.collider !== undefined
            ? "asset"
            : "default",
      inheritedFrom: tileModifier?.collider
        ? "instance"
        : tile?.collider
          ? "asset"
          : "default",
      fieldSources: Object.fromEntries(
        fields.map((field) => [
          field,
          tileModifier?.collider?.[field] !== undefined
            ? "instance"
            : tile?.collider?.[field] !== undefined
              ? "asset"
              : "default",
        ]),
      ),
    });
  }
  return {
    key,
    ref: { ...ref, elev: requestedElev },
    kind: "tile",
    id: `${ref.tx}:${ref.ty}:${requestedElev}`,
    name: tile?.name ?? (tileId ? `Tile #${tileId}` : "Empty cell"),
    transform: valueTransform,
    components,
    removedComponents:
      tileModifier?.componentStates?.collider === false ? ["collider"] : [],
    source: {
      kind: "tile",
      value: { tx: ref.tx, ty: ref.ty, elev: requestedElev, tileId },
    },
  };
}

/** Unified Inspector projection for a shared voxel asset in the map library. */
export function getEmberVoxelAssetWorldObject(
  model: EmberVoxelModel,
): EmberWorldObject {
  const placement: EmberVoxelPlacement = {
    id: `asset:${model.id}`,
    modelId: model.id,
    x: 0,
    y: 0,
  };
  const valueTransform = transform(0, 0, 0, 0);
  return {
    key: `asset:voxel:${model.id}`,
    ref: { kind: "voxel", id: placement.id },
    kind: "voxel",
    id: model.id,
    name: model.nameRu?.trim() || model.id,
    transform: valueTransform,
    components: [
      { type: "transform", value: valueTransform },
      ...voxelObjectComponents(placement, model),
    ],
    source: { kind: "voxel", value: placement },
  };
}

/** Unified Inspector projection for a shared sprite asset. */
export function getEmberSpriteAssetWorldObject(
  sprite: EmberPixelSprite,
): EmberWorldObject {
  const placement = {
    id: `asset:${sprite.id}`,
    spriteId: sprite.id,
    x: 0,
    y: 0,
  };
  const valueTransform = transform(0, 0, 0, 0);
  const components: EmberWorldObjectComponent[] = [
    { type: "transform", value: valueTransform },
    { type: "sprite-renderer", spriteId: sprite.id },
  ];
  if (spriteAssetColliderPresent(sprite)) {
    components.push(colliderForAsset(sprite.collider, sprite.solid));
  }
  return {
    key: `asset:sprite:${sprite.id}`,
    ref: { kind: "sprite", id: placement.id },
    kind: "sprite",
    id: sprite.id,
    name: sprite.nameRu?.trim() || sprite.id,
    transform: valueTransform,
    components,
    source: { kind: "sprite", value: placement },
  };
}

/** Unified Inspector projection for a shared tile asset. */
export function getEmberTileAssetWorldObject(
  tile: EmberTilesetTile,
  tileSize = 16,
): EmberWorldObject {
  const valueTransform = transform(0, 0, 0, 0);
  const components: EmberWorldObjectComponent[] = [
    { type: "transform", value: valueTransform },
    {
      type: "block",
      tileId: tile.id,
      elevation: 0,
      heightVoxels: Math.max(0, Math.round((tile.defaultHeight ?? 0) * tileSize)),
    },
  ];
  if (tileAssetColliderPresent(tile)) {
    components.push(colliderForAsset(tile.collider, tile.solid));
  }
  return {
    key: `asset:tile:${tile.id}`,
    ref: { kind: "tile", tx: 0, ty: 0, elev: 0 },
    kind: "tile",
    id: String(tile.id),
    name: tile.name || `Tile #${tile.id}`,
    transform: valueTransform,
    components,
    source: {
      kind: "tile",
      value: { tx: 0, ty: 0, elev: 0, tileId: tile.id },
    },
  };
}

/** Unified Inspector projection for a reusable light preset. */
export function getEmberLightAssetWorldObject(
  preset: EmberLightPreset,
): EmberWorldObject {
  const source: EmberLightSource = {
    ...preset,
    id: `asset:${preset.id}`,
    x: 0,
    y: 0,
    enabled: true,
  };
  const valueTransform = transform(0, 0, 0, 0);
  return {
    key: `asset:light:${preset.id}`,
    ref: { kind: "light", id: source.id },
    kind: "light",
    id: preset.id,
    name: preset.nameRu?.trim() || preset.id,
    transform: valueTransform,
    components: [
      { type: "transform", value: valueTransform },
      { type: "light", source },
    ],
    source: { kind: "light", value: source },
  };
}

/** Unified Inspector projection for a zone template before it is placed. */
export function getEmberRegionDraftWorldObject(
  map: EmberMap,
  region: EmberMapRegion,
): EmberWorldObject | null {
  return getEmberWorldObject(
    { ...map, regions: [region] },
    { kind: "region", id: region.id },
  );
}

export function setEmberSpriteAssetComponentPresence(
  sprite: EmberPixelSprite,
  component: EmberVoxelOptionalComponentType,
  present: boolean,
): EmberPixelSprite {
  if (component !== "collider") return sprite;
  return {
    ...sprite,
    componentStates: { ...sprite.componentStates, collider: present },
    solid: present ? true : false,
    collider: present
      ? { enabled: true, ...sprite.collider }
      : { ...sprite.collider, enabled: false },
  };
}

export function setEmberTileAssetComponentPresence(
  tile: EmberTilesetTile,
  component: EmberVoxelOptionalComponentType,
  present: boolean,
): EmberTilesetTile {
  if (component !== "collider") return tile;
  return {
    ...tile,
    componentStates: { ...tile.componentStates, collider: present },
    solid: present ? true : false,
    collider: present
      ? { enabled: true, ...tile.collider }
      : { ...tile.collider, enabled: false },
  };
}

function applyAssetColliderFieldEdit<T extends EmberPixelSprite | EmberTilesetTile>(
  asset: T,
  edit: EmberInspectorFieldEdit,
): T {
  if (edit.componentType !== "collider") return asset;
  const withCollider = (
    "width" in asset
      ? setEmberSpriteAssetComponentPresence(asset, "collider", true)
      : setEmberTileAssetComponentPresence(asset, "collider", true)
  ) as T;
  const collider = { ...withCollider.collider };
  if (edit.value === null) {
    delete collider[edit.fieldId as keyof typeof collider];
  } else if (
    (edit.fieldId === "enabled" ||
      edit.fieldId === "isTrigger" ||
      edit.fieldId === "walkableTop") &&
    typeof edit.value === "boolean"
  ) {
    collider[edit.fieldId] = edit.value;
    if (edit.fieldId === "isTrigger" && edit.value) {
      collider.blocksMovement = false;
    }
  } else if (
    edit.fieldId === "offsetVoxels" &&
    typeof edit.value === "number"
  ) {
    collider.offsetVoxels = Math.round(edit.value);
  }
  return { ...withCollider, collider };
}

export function applyEmberSpriteAssetInspectorFieldEdit(
  sprite: EmberPixelSprite,
  edit: EmberInspectorFieldEdit,
): EmberPixelSprite {
  return applyAssetColliderFieldEdit(sprite, edit);
}

export function applyEmberTileAssetInspectorFieldEdit(
  tile: EmberTilesetTile,
  edit: EmberInspectorFieldEdit,
): EmberTilesetTile {
  return applyAssetColliderFieldEdit(tile, edit);
}

export function applyEmberLightAssetInspectorFieldEdit(
  preset: EmberLightPreset,
  edit: EmberInspectorFieldEdit,
): EmberLightPreset {
  if (edit.componentType !== "light") return preset;
  const next = { ...preset };
  const numericRanges: Record<string, readonly [number, number]> = {
    lampRange: [1, 16],
    lampDiscCore: [0, 16],
    lampDiscMid: [0, 16],
    lampHeight: [0.2, 3],
    lampStrength0: [0, 1],
    lampStrengthFalloff: [0, 1],
  };
  if (
    (edit.fieldId === "lampColor" || edit.fieldId === "lampFaceColor") &&
    typeof edit.value === "string"
  ) {
    next[edit.fieldId] = edit.value;
  } else if (
    (edit.fieldId === "lampShowCore" || edit.fieldId === "lampTorchFlicker") &&
    typeof edit.value === "boolean"
  ) {
    next[edit.fieldId] = edit.value;
  } else if (edit.fieldId in numericRanges && typeof edit.value === "number") {
    const [min, max] = numericRanges[edit.fieldId];
    (next as Record<string, unknown>)[edit.fieldId] = Math.max(
      min,
      Math.min(max, edit.value),
    );
  }
  next.lampDiscCore = Math.min(next.lampDiscCore, next.lampRange);
  next.lampDiscMid = Math.max(
    next.lampDiscCore,
    Math.min(next.lampDiscMid, next.lampRange),
  );
  return next;
}

function setPlacementInteractivity<
  T extends EmberVoxelPlacement | EmberSpritePlacement,
>(placement: T, present: boolean): T {
  if (present) {
    return {
      ...placement,
      interactivity:
        parseInteractivity(placement.interactivity) ?? defaultInteractivity(),
    };
  }
  const { interactivity: _dropped, ...rest } = placement;
  return rest as T;
}

export function setEmberWorldObjectComponentPresence(
  map: EmberMap,
  ref: EmberWorldObjectRef,
  component: EmberOptionalComponentType,
  present: boolean,
): EmberMap {
  if (component === "interactivity") {
    if (ref.kind === "voxel") {
      let changed = false;
      const voxelProps = (map.voxelProps ?? []).map((placement) => {
        if (placement.id !== ref.id) return placement;
        changed = true;
        return setPlacementInteractivity(placement, present);
      });
      return changed ? { ...map, voxelProps } : map;
    }
    if (ref.kind === "sprite") {
      let changed = false;
      const sprites = (map.sprites ?? []).map((placement) => {
        if (placement.id !== ref.id) return placement;
        changed = true;
        return setPlacementInteractivity(placement, present);
      });
      return changed ? { ...map, sprites } : map;
    }
    return map;
  }
  if (ref.kind === "voxel") {
    let changed = false;
    const voxelProps = (map.voxelProps ?? []).map((placement) => {
      if (placement.id !== ref.id) return placement;
      changed = true;
      return setVoxelInstanceComponentPresence(placement, component, present);
    });
    return changed ? { ...map, voxelProps } : map;
  }
  if (component !== "collider") return map;
  if (ref.kind === "sprite") {
    let changed = false;
    const sprites = (map.sprites ?? []).map((placement) => {
      if (placement.id !== ref.id) return placement;
      changed = true;
      return {
        ...placement,
        componentStates: {
          ...placement.componentStates,
          collider: present,
        },
      };
    });
    return changed ? { ...map, sprites } : map;
  }
  if (ref.kind !== "tile") return map;
  const elev =
    ref.elev ??
    topOccupiedElevAt(map, ref.tx, ref.ty) ??
    elevationAt(map, ref.tx, ref.ty);
  const existing = tileInstanceModifierAt(map, ref.tx, ref.ty, elev);
  const modifier = {
    ...existing,
    x: ref.tx,
    y: ref.ty,
    elev,
    componentStates: { ...existing?.componentStates, collider: present },
  };
  return {
    ...map,
    tileModifiers: [
      ...(map.tileModifiers ?? []).filter(
        (item) =>
          item.x !== ref.tx || item.y !== ref.ty || item.elev !== elev,
      ),
      modifier,
    ],
  };
}

/** Clears only per-instance fields, restoring inheritance from the asset. */
export function clearEmberWorldObjectComponentOverrides(
  map: EmberMap,
  ref: EmberWorldObjectRef,
  component: EmberVoxelOverrideComponentType,
): EmberMap {
  if (ref.kind === "voxel") {
    return {
      ...map,
      voxelProps: (map.voxelProps ?? []).map((placement) =>
        placement.id === ref.id
          ? clearVoxelInstanceComponent(placement, component)
          : placement,
      ),
    };
  }
  if (component !== "collider") return map;
  if (ref.kind === "sprite") {
    return {
      ...map,
      sprites: (map.sprites ?? []).map((placement) => {
        if (placement.id !== ref.id) return placement;
        const next = { ...placement };
        delete next.collider;
        if (next.componentStates) {
          const states = { ...next.componentStates };
          delete states.collider;
          if (Object.keys(states).length) next.componentStates = states;
          else delete next.componentStates;
        }
        return next;
      }),
    };
  }
  if (ref.kind !== "tile") return map;
  const elev =
    ref.elev ??
    topOccupiedElevAt(map, ref.tx, ref.ty) ??
    elevationAt(map, ref.tx, ref.ty);
  return {
    ...map,
    tileModifiers: (map.tileModifiers ?? []).filter(
      (item) =>
        item.x !== ref.tx || item.y !== ref.ty || item.elev !== elev,
    ),
  };
}

export function setEmberVoxelAssetComponentPresence(
  model: EmberVoxelModel,
  component: EmberVoxelOptionalComponentType,
  present: boolean,
): EmberVoxelModel {
  return setVoxelAssetComponentPresence(model, component, present);
}

export function applyEmberVoxelAssetInspectorFieldEdit(
  model: EmberVoxelModel,
  edit: EmberInspectorFieldEdit,
): EmberVoxelModel {
  if (edit.componentType === "voxel-renderer") {
    const next = { ...model };
    if (edit.fieldId !== "directLightScale") return model;
    if (edit.value === null) delete next.directLightScale;
    else if (typeof edit.value === "number") {
      next.directLightScale = Math.max(0.05, Math.min(1.5, edit.value));
    }
    return next;
  }
  if (edit.componentType === "collider") {
    const next = setVoxelAssetComponentPresence(model, "collider", true);
    const collider = { ...next.collider };
    if (edit.value === null) {
      delete collider[edit.fieldId as keyof typeof collider];
    } else if (
      (edit.fieldId === "enabled" ||
        edit.fieldId === "isTrigger" ||
        edit.fieldId === "walkableTop") &&
      typeof edit.value === "boolean"
    ) {
      collider[edit.fieldId] = edit.value;
      if (edit.fieldId === "isTrigger" && edit.value) {
        collider.blocksMovement = false;
      }
    } else if (
      edit.fieldId === "offsetVoxels" &&
      typeof edit.value === "number"
    ) {
      collider.offsetVoxels = Math.round(edit.value);
    }
    return { ...next, collider };
  }
  if (edit.componentType !== "voxel-light") return model;
  const next = setVoxelAssetComponentPresence(model, "voxel-light", true);
  const booleanFields = [
    "emissiveCastsLight",
    "emissiveLightShadows",
    "emissiveTorchFlicker",
    "emissiveLanternFlicker",
    "emissiveSuppressHostShadow",
  ] as const;
  if (edit.value === null) {
    delete (next as Record<string, unknown>)[edit.fieldId];
  } else if (
    booleanFields.includes(edit.fieldId as (typeof booleanFields)[number]) &&
    typeof edit.value === "boolean"
  ) {
    (next as Record<string, unknown>)[edit.fieldId] = edit.value;
  } else if (
    edit.fieldId === "emissiveLightRange" &&
    typeof edit.value === "number"
  ) {
    next.emissiveLightRange = resolveEmissiveLightRange(edit.value);
  } else if (
    edit.fieldId === "emissiveStrength" &&
    typeof edit.value === "number"
  ) {
    next.emissiveStrength = resolveEmissiveStrength(edit.value);
  }
  return next;
}

/** Scene objects for Outliner. Tiles are queried lazily by cell/chunk. */
export function listEmberWorldObjects(
  map: EmberMap,
  context: EmberWorldObjectAdapterContext = {},
): EmberWorldObject[] {
  const refs: EmberWorldObjectRef[] = [
    ...(map.voxelProps ?? []).map((item) => ({
      kind: "voxel" as const,
      id: item.id,
    })),
    ...(map.sprites ?? []).map((item) => ({
      kind: "sprite" as const,
      id: item.id,
    })),
    ...(map.lights ?? []).filter((item) => item.enabled !== false).map((item) => ({
      kind: "light" as const,
      id: item.id,
    })),
    ...map.regions.map((item) => ({
      kind: "region" as const,
      id: item.id,
    })),
  ];
  return refs.flatMap((ref) => {
    const object = getEmberWorldObject(map, ref, context);
    return object ? [object] : [];
  });
}

/** Editor-only projection that omits hidden scene objects without mutating map data. */
export function mapWithoutHiddenWorldObjects(
  map: EmberMap,
  hiddenKeys: ReadonlySet<string>,
): EmberMap {
  if (hiddenKeys.size === 0) return map;
  return {
    ...map,
    voxelProps: map.voxelProps?.filter(
      (item) => !hiddenKeys.has(`voxel:${item.id}`),
    ),
    sprites: map.sprites?.filter(
      (item) => !hiddenKeys.has(`sprite:${item.id}`),
    ),
    lights: map.lights?.filter(
      (item) => !hiddenKeys.has(`light:${item.id}`),
    ),
    regions: map.regions.filter(
      (item) => !hiddenKeys.has(`region:${item.id}`),
    ),
  };
}

function cloneMapForWorldEdit(map: EmberMap): EmberMap {
  return {
    ...map,
    lights: map.lights?.map((item) => ({ ...item })),
    sprites: map.sprites?.map((item) => ({
      ...item,
      scale: item.scale ? { ...item.scale } : undefined,
      componentStates: item.componentStates
        ? { ...item.componentStates }
        : undefined,
      collider: item.collider ? { ...item.collider } : undefined,
    })),
    tileModifiers: map.tileModifiers?.map((modifier) => ({
      ...modifier,
      componentStates: modifier.componentStates
        ? { ...modifier.componentStates }
        : undefined,
      collider: modifier.collider ? { ...modifier.collider } : undefined,
    })),
    voxelProps: map.voxelProps?.map((item) => ({
      ...item,
      scale: item.scale ? { ...item.scale } : undefined,
    })),
    regions: map.regions.map((item) => ({ ...item })),
    sceneHierarchy: map.sceneHierarchy
      ? {
          version: 1,
          groups: map.sceneHierarchy.groups.map((group) => ({
            ...group,
            objectKeys: [...group.objectKeys],
            pivot: { ...group.pivot },
            localTransforms: group.localTransforms
              ? Object.fromEntries(
                  Object.entries(group.localTransforms).map(([key, transform]) => [
                    key,
                    { ...transform, position: { ...transform.position } },
                  ]),
                )
              : undefined,
          })),
        }
      : undefined,
    layers: map.layers.map((layer) => ({ ...layer, data: [...layer.data] })),
  };
}

export function patchEmberWorldObjectTransform(
  map: EmberMap,
  ref: EmberWorldObjectRef,
  patch: EmberWorldTransformPatch,
): EmberMap {
  const clampX = (value: number, width = 1) =>
    Math.max(0, Math.min(map.width - width, Math.round(value)));
  const clampY = (value: number, height = 1) =>
    Math.max(0, Math.min(map.height - height, Math.round(value)));
  // Inspector objects historically support eight vertical editor levels.
  // Terrain elevation constants describe walkable ground and must not limit
  // scene objects placed above it (bridges, lamps, overhead voxel props).
  const clampZ = (value: number) => Math.max(0, Math.min(8, value));
  const hasScalePatch =
    patch.scaleX != null || patch.scaleY != null || patch.scaleZ != null;
  const patchScale = (current: { x: number; y: number; z: number } | undefined) => {
    if (!hasScalePatch) return current;
    const resolved = resolveEmberTransformScale(current);
    return compactEmberTransformScale({
      x: patch.scaleX ?? resolved.x,
      y: patch.scaleY ?? resolved.y,
      z: patch.scaleZ ?? resolved.z,
    });
  };
  let next = map;
  if (ref.kind === "voxel") {
    next = {
      ...map,
      voxelProps: (map.voxelProps ?? []).map((item) => {
        if (item.id !== ref.id) return item;
        const updated: EmberVoxelPlacement = {
          ...item,
          x: patch.x == null ? item.x : clampX(patch.x),
          y: patch.y == null ? item.y : clampY(patch.y),
          rot:
            patch.rotationQuarterTurns == null
              ? item.rot
              : normalizeQuarterTurns(patch.rotationQuarterTurns),
        };
        if (hasScalePatch) {
          const scale = patchScale(item.scale);
          if (scale) updated.scale = scale;
          else delete updated.scale;
        }
        if (patch.z === null) delete updated.elev;
        else if (patch.z != null) updated.elev = clampZ(patch.z);
        return updated;
      }),
    };
  } else if (ref.kind === "sprite") {
    next = {
      ...map,
      sprites: (map.sprites ?? []).map((item) => {
        if (item.id !== ref.id) return item;
        const updated = {
          ...item,
          x: patch.x == null ? item.x : clampX(patch.x),
          y: patch.y == null ? item.y : clampY(patch.y),
        };
        if (patch.z === null) delete updated.elev;
        else if (patch.z != null) updated.elev = clampZ(patch.z);
        if (hasScalePatch) {
          const scale = patchScale(item.scale);
          if (scale) updated.scale = scale;
          else delete updated.scale;
        }
        return updated;
      }),
    };
  } else if (ref.kind === "light") {
    next = {
      ...map,
      lights: (map.lights ?? []).map((item) =>
        item.id === ref.id
          ? {
              ...item,
              x: patch.x == null ? item.x : clampX(patch.x),
              y: patch.y == null ? item.y : clampY(patch.y),
            }
          : item,
      ),
    };
  } else if (ref.kind === "region") {
    next = {
      ...map,
      regions: map.regions.map((item) => {
        if (item.id !== ref.id) return item;
        const w =
          patch.scaleX == null
            ? item.w
            : Math.max(1, Math.min(map.width, Math.round(patch.scaleX)));
        const h =
          patch.scaleY == null
            ? item.h
            : Math.max(1, Math.min(map.height, Math.round(patch.scaleY)));
        const next = {
          ...item,
          w,
          h,
          x: patch.x == null ? Math.min(item.x, map.width - w) : clampX(patch.x, w),
          y: patch.y == null ? Math.min(item.y, map.height - h) : clampY(patch.y, h),
        };
        if (patch.z === null) delete next.elev;
        else if (patch.z != null) next.elev = clampElevation(patch.z);
        return next;
      }),
    };
  }
  return next === map ? map : refreshEmberSceneHierarchyPivots(next);
}

function rotateLocalOffset(x: number, y: number, quarterTurns: number) {
  let nextX = x;
  let nextY = y;
  for (let index = 0; index < normalizeQuarterTurns(quarterTurns); index += 1) {
    [nextX, nextY] = [-nextY, nextX];
  }
  return { x: nextX, y: nextY };
}

/**
 * Writes a direct child's local transform through its Parent and persists the
 * resulting authored world placement. Scene hierarchy remains the single
 * source of truth for Parent pivots and local-space synchronization.
 */
export function patchEmberWorldObjectLocalTransform(
  map: EmberMap,
  ref: EmberWorldObjectRef,
  patch: EmberWorldTransformPatch,
): EmberMap {
  if (ref.kind === "tile") return map;
  const synchronized = refreshEmberSceneHierarchyPivots(map);
  const key = emberWorldObjectRefKey(ref);
  const parent = synchronized.sceneHierarchy?.groups.find((group) =>
    group.objectKeys.includes(key),
  );
  const current = parent?.localTransforms?.[key];
  if (!parent || !current) {
    return patchEmberWorldObjectTransform(synchronized, ref, patch);
  }

  const localPosition = {
    x: patch.x ?? current.position.x,
    y: patch.y ?? current.position.y,
    z: patch.z == null ? current.position.z : patch.z,
  };
  const rotated = rotateLocalOffset(
    localPosition.x,
    localPosition.y,
    parent.rotationQuarterTurns ?? 0,
  );
  let worldX = parent.pivot.x + rotated.x;
  let worldY = parent.pivot.y + rotated.y;

  if (ref.kind === "region") {
    const region = synchronized.regions.find((item) => item.id === ref.id);
    if (!region) return synchronized;
    worldX -= Math.max(0, region.w - 1) / 2;
    worldY -= Math.max(0, region.h - 1) / 2;
  }

  return patchEmberWorldObjectTransform(synchronized, ref, {
    ...(patch.x != null || patch.y != null
      ? { x: Math.round(worldX), y: Math.round(worldY) }
      : {}),
    ...((ref.kind === "voxel" || ref.kind === "region") && patch.z != null
      ? { z: parent.pivot.z + localPosition.z }
      : {}),
    ...(ref.kind === "voxel" && patch.rotationQuarterTurns != null
      ? {
          rotationQuarterTurns: normalizeQuarterTurns(
            (parent.rotationQuarterTurns ?? 0) + patch.rotationQuarterTurns,
          ),
        }
      : {}),
    ...(patch.scaleX != null ? { scaleX: patch.scaleX } : {}),
    ...(patch.scaleY != null ? { scaleY: patch.scaleY } : {}),
    ...(patch.scaleZ != null ? { scaleZ: patch.scaleZ } : {}),
  });
}

export function removeEmberWorldObject(
  map: EmberMap,
  ref: EmberWorldObjectRef,
): EmberMap {
  const next = cloneMapForWorldEdit(map);
  if (ref.kind === "voxel") {
    next.voxelProps = (next.voxelProps ?? []).filter((item) => item.id !== ref.id);
  } else if (ref.kind === "sprite") {
    next.sprites = (next.sprites ?? []).filter((item) => item.id !== ref.id);
  } else if (ref.kind === "light") {
    next.lights = (next.lights ?? []).filter((item) => item.id !== ref.id);
    if (next.lights.length === 0) delete next.lights;
  } else if (ref.kind === "region") {
    next.regions = next.regions.filter((item) => item.id !== ref.id);
  } else {
    const normalized = ensureMapLayers(next);
    const elev =
      ref.elev ??
      topOccupiedElevAt(normalized, ref.tx, ref.ty) ??
      elevationAt(normalized, ref.tx, ref.ty);
    clearElevTile(normalized, ref.tx, ref.ty, elev);
    return normalized;
  }
  return normalizeEmberSceneHierarchy(next);
}

/** Moves several scene objects as one editor command without intermediate clones. */
export function translateEmberWorldObjects(
  map: EmberMap,
  refs: readonly EmberWorldObjectRef[],
  dx: number,
  dy: number,
): EmberMap {
  const keys = new Set(refs.map(emberWorldObjectRefKey));
  const clampX = (value: number, width = 1) =>
    Math.max(0, Math.min(map.width - width, Math.round(value + dx)));
  const clampY = (value: number, height = 1) =>
    Math.max(0, Math.min(map.height - height, Math.round(value + dy)));
  return refreshEmberSceneHierarchyPivots({
    ...map,
    voxelProps: map.voxelProps?.map((item) =>
      keys.has(`voxel:${item.id}`)
        ? { ...item, x: clampX(item.x), y: clampY(item.y) }
        : item,
    ),
    sprites: map.sprites?.map((item) =>
      keys.has(`sprite:${item.id}`)
        ? { ...item, x: clampX(item.x), y: clampY(item.y) }
        : item,
    ),
    lights: map.lights?.map((item) =>
      keys.has(`light:${item.id}`)
        ? { ...item, x: clampX(item.x), y: clampY(item.y) }
        : item,
    ),
    regions: map.regions.map((item) =>
      keys.has(`region:${item.id}`)
        ? {
            ...item,
            x: clampX(item.x, item.w),
            y: clampY(item.y, item.h),
          }
        : item,
    ),
  });
}

/**
 * Atomically edits authored Z for voxel/sprite instances. `floor` removes the
 * explicit override so the object follows its current terrain surface.
 */
export function setEmberWorldObjectsElevation(
  map: EmberMap,
  refs: readonly EmberWorldObjectRef[],
  elevation: number | "floor",
): EmberMap {
  const keys = new Set(refs.map(emberWorldObjectRefKey));
  const authored =
    elevation === "floor" ? null : Math.max(0, Math.min(8, elevation));
  let changed = false;
  const voxelProps = map.voxelProps?.map((item) => {
    if (!keys.has(`voxel:${item.id}`)) return item;
    if (authored == null) {
      if (item.elev == null) return item;
      changed = true;
      const next = { ...item };
      delete next.elev;
      return next;
    }
    if (item.elev === authored) return item;
    changed = true;
    return { ...item, elev: authored };
  });
  const sprites = map.sprites?.map((item) => {
    if (!keys.has(`sprite:${item.id}`)) return item;
    if (authored == null) {
      if (item.elev == null) return item;
      changed = true;
      const next = { ...item };
      delete next.elev;
      return next;
    }
    if (item.elev === authored) return item;
    changed = true;
    return { ...item, elev: authored };
  });
  const regions = map.regions.map((item) => {
    if (!keys.has(`region:${item.id}`)) return item;
    if (authored == null) {
      if (item.elev == null) return item;
      changed = true;
      const next = { ...item };
      delete next.elev;
      return next;
    }
    if (item.elev === authored) return item;
    changed = true;
    return { ...item, elev: authored };
  });
  if (!changed) return map;
  return refreshEmberSceneHierarchyPivots({
    ...map,
    voxelProps,
    sprites,
    regions,
  });
}

/** Removes several non-tile scene objects as one editor command. */
export function removeEmberWorldObjects(
  map: EmberMap,
  refs: readonly EmberWorldObjectRef[],
): EmberMap {
  const keys = new Set(refs.map(emberWorldObjectRefKey));
  const next = cloneMapForWorldEdit(map);
  next.voxelProps = next.voxelProps?.filter(
    (item) => !keys.has(`voxel:${item.id}`),
  );
  next.sprites = next.sprites?.filter(
    (item) => !keys.has(`sprite:${item.id}`),
  );
  next.lights = next.lights?.filter(
    (item) => !keys.has(`light:${item.id}`),
  );
  if (next.lights?.length === 0) delete next.lights;
  next.regions = next.regions.filter(
    (item) => !keys.has(`region:${item.id}`),
  );
  return normalizeEmberSceneHierarchy(next);
}

/** Rotates mixed scene objects around a shared grid pivot in 90° steps. */
export function rotateEmberWorldObjectsAroundPivot(
  map: EmberMap,
  refs: readonly EmberWorldObjectRef[],
  pivot: Readonly<{ x: number; y: number }>,
  quarterTurns: number,
): EmberMap {
  const turns = ((Math.round(quarterTurns) % 4) + 4) % 4;
  if (turns === 0) return map;
  const keys = new Set(refs.map(emberWorldObjectRefKey));
  const rotatePoint = (x: number, y: number) => {
    let dx = x - pivot.x;
    let dy = y - pivot.y;
    for (let index = 0; index < turns; index += 1) [dx, dy] = [-dy, dx];
    return {
      x: Math.max(0, Math.min(map.width - 1, Math.round(pivot.x + dx))),
      y: Math.max(0, Math.min(map.height - 1, Math.round(pivot.y + dy))),
    };
  };
  return refreshEmberSceneHierarchyPivots({
    ...map,
    voxelProps: map.voxelProps?.map((item) => {
      if (!keys.has(`voxel:${item.id}`)) return item;
      const point = rotatePoint(item.x, item.y);
      return { ...item, ...point, rot: normalizeQuarterTurns((item.rot ?? 0) + turns) };
    }),
    sprites: map.sprites?.map((item) =>
      keys.has(`sprite:${item.id}`) ? { ...item, ...rotatePoint(item.x, item.y) } : item,
    ),
    lights: map.lights?.map((item) =>
      keys.has(`light:${item.id}`) ? { ...item, ...rotatePoint(item.x, item.y) } : item,
    ),
    regions: map.regions.map((item) => {
      if (!keys.has(`region:${item.id}`)) return item;
      const center = rotatePoint(
        item.x + (item.w - 1) / 2,
        item.y + (item.h - 1) / 2,
      );
      const w = turns % 2 ? item.h : item.w;
      const h = turns % 2 ? item.w : item.h;
      return {
        ...item,
        w,
        h,
        x: Math.max(0, Math.min(map.width - w, Math.round(center.x - (w - 1) / 2))),
        y: Math.max(0, Math.min(map.height - h, Math.round(center.y - (h - 1) / 2))),
      };
    }),
  });
}

/** Scales mixed scene objects around a shared grid/elevation pivot. */
export function scaleEmberWorldObjectsAroundPivot(
  map: EmberMap,
  refs: readonly EmberWorldObjectRef[],
  pivot: Readonly<{ x: number; y: number; z?: number }>,
  authoredScale: Readonly<{ x: number; y: number; z: number }>,
): EmberMap {
  const delta = resolveEmberTransformScale(authoredScale);
  if (delta.x === 1 && delta.y === 1 && delta.z === 1) return map;
  const keys = new Set(refs.map(emberWorldObjectRefKey));
  const pivotZ = pivot.z ?? 0;
  const scalePoint = (x: number, y: number) => ({
    x: pivot.x + (x - pivot.x) * delta.x,
    y: pivot.y + (y - pivot.y) * delta.y,
  });
  const clampX = (value: number, width = 1) =>
    Math.max(0, Math.min(map.width - width, Math.round(value)));
  const clampY = (value: number, height = 1) =>
    Math.max(0, Math.min(map.height - height, Math.round(value)));
  const multiplyScale = (current: { x: number; y: number; z: number } | undefined) => {
    const value = resolveEmberTransformScale(current);
    return compactEmberTransformScale({
      x: value.x * delta.x,
      y: value.y * delta.y,
      z: value.z * delta.z,
    });
  };
  return refreshEmberSceneHierarchyPivots({
    ...map,
    voxelProps: map.voxelProps?.map((item) => {
      if (!keys.has(`voxel:${item.id}`)) return item;
      const point = scalePoint(item.x, item.y);
      const currentZ = item.elev ?? tileSurfaceElev(map, item.x, item.y);
      const next = {
        ...item,
        x: clampX(point.x),
        y: clampY(point.y),
        elev:
          delta.z === 1
            ? item.elev
            : Math.max(0, Math.min(8, pivotZ + (currentZ - pivotZ) * delta.z)),
      };
      const scale = multiplyScale(item.scale);
      if (scale) next.scale = scale;
      else delete next.scale;
      if (next.elev == null) delete next.elev;
      return next;
    }),
    sprites: map.sprites?.map((item) => {
      if (!keys.has(`sprite:${item.id}`)) return item;
      const point = scalePoint(item.x, item.y);
      const currentZ = item.elev ?? tileSurfaceElev(map, item.x, item.y);
      const next = {
        ...item,
        x: clampX(point.x),
        y: clampY(point.y),
        elev:
          delta.z === 1
            ? item.elev
            : Math.max(0, Math.min(8, pivotZ + (currentZ - pivotZ) * delta.z)),
      };
      const scale = multiplyScale(item.scale);
      if (scale) next.scale = scale;
      else delete next.scale;
      if (next.elev == null) delete next.elev;
      return next;
    }),
    lights: map.lights?.map((item) => {
      if (!keys.has(`light:${item.id}`)) return item;
      const point = scalePoint(item.x, item.y);
      return { ...item, x: clampX(point.x), y: clampY(point.y) };
    }),
    regions: map.regions.map((item) => {
      if (!keys.has(`region:${item.id}`)) return item;
      const center = scalePoint(
        item.x + (item.w - 1) / 2,
        item.y + (item.h - 1) / 2,
      );
      const w = Math.max(1, Math.min(map.width, Math.round(item.w * delta.x)));
      const h = Math.max(1, Math.min(map.height, Math.round(item.h * delta.y)));
      return {
        ...item,
        w,
        h,
        x: clampX(center.x - (w - 1) / 2, w),
        y: clampY(center.y - (h - 1) / 2, h),
      };
    }),
  });
}

function optionalText(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

/** Applies one schema field edit while preserving the legacy map format. */
export function applyEmberInspectorFieldEdit(
  map: EmberMap,
  ref: EmberWorldObjectRef,
  edit: EmberInspectorFieldEdit,
): EmberMap {
  if (edit.componentType === "transform") {
    if (edit.fieldId === "x" && typeof edit.value === "number") {
      return patchEmberWorldObjectTransform(map, ref, {
        x: Math.max(0, Math.min(map.width - 1, Math.round(edit.value))),
      });
    }
    if (edit.fieldId === "y" && typeof edit.value === "number") {
      return patchEmberWorldObjectTransform(map, ref, {
        y: Math.max(0, Math.min(map.height - 1, Math.round(edit.value))),
      });
    }
    if (edit.fieldId === "z" && typeof edit.value === "number") {
      return patchEmberWorldObjectTransform(map, ref, {
        z:
          ref.kind === "region"
            ? clampElevation(edit.value)
            : Math.max(0, Math.min(8, Math.round(edit.value))),
      });
    }
    if (
      edit.fieldId === "rotationQuarterTurns" &&
      typeof edit.value === "number"
    ) {
      return patchEmberWorldObjectTransform(map, ref, {
        rotationQuarterTurns: edit.value / 90,
      });
    }
    return map;
  }

  if (
    ref.kind === "voxel" &&
    edit.value === null &&
    (edit.componentType === "voxel-renderer" ||
      edit.componentType === "collider" ||
      edit.componentType === "voxel-light")
  ) {
    const component = edit.componentType;
    return {
      ...map,
      voxelProps: (map.voxelProps ?? []).map((item) =>
        item.id === ref.id
          ? clearVoxelInstanceField(item, component, edit.fieldId)
          : item,
      ),
    };
  }

  if (ref.kind === "voxel" && edit.componentType === "voxel-renderer") {
    return {
      ...map,
      voxelProps: (map.voxelProps ?? []).map((item) => {
        if (item.id !== ref.id) return item;
        if (edit.fieldId === "directLightScale" && typeof edit.value === "number") {
          return {
            ...item,
            directLightScale: Math.max(0.05, Math.min(1.5, edit.value)),
          };
        }
        return item;
      }),
    };
  }

  if (ref.kind === "voxel" && edit.componentType === "collider") {
    return {
      ...map,
      voxelProps: (map.voxelProps ?? []).map((item) => {
        if (item.id !== ref.id) return item;
        const collider = { ...item.collider };
        if (
          (edit.fieldId === "enabled" ||
            edit.fieldId === "isTrigger" ||
            edit.fieldId === "walkableTop") &&
          typeof edit.value === "boolean"
        ) {
          collider[edit.fieldId] = edit.value;
          if (edit.fieldId === "isTrigger" && edit.value) {
            collider.blocksMovement = false;
          }
        } else if (
          edit.fieldId === "offsetVoxels" &&
          typeof edit.value === "number"
        ) {
          collider.offsetVoxels = Math.round(edit.value);
        }
        return { ...item, collider };
      }),
    };
  }

  if (ref.kind === "voxel" && edit.componentType === "voxel-light") {
    return {
      ...map,
      voxelProps: (map.voxelProps ?? []).map((item) => {
        if (item.id !== ref.id) return item;
        if (
          (edit.fieldId === "emissiveCastsLight" ||
            edit.fieldId === "emissiveLightShadows" ||
            edit.fieldId === "emissiveTorchFlicker" ||
            edit.fieldId === "emissiveLanternFlicker" ||
            edit.fieldId === "emissiveSuppressHostShadow") &&
          typeof edit.value === "boolean"
        ) {
          return { ...item, [edit.fieldId]: edit.value };
        }
        if (
          edit.fieldId === "emissiveLightRange" &&
          typeof edit.value === "number"
        ) {
          return {
            ...item,
            emissiveLightRange: resolveEmissiveLightRange(edit.value),
          };
        }
        if (
          edit.fieldId === "emissiveStrength" &&
          typeof edit.value === "number"
        ) {
          return {
            ...item,
            emissiveStrength: resolveEmissiveStrength(edit.value),
          };
        }
        return item;
      }),
    };
  }

  if (
    (ref.kind === "voxel" || ref.kind === "sprite") &&
    edit.componentType === "interactivity"
  ) {
    const patchInteractivity = (
      current: EmberInteractivityModifier | undefined,
    ): EmberInteractivityModifier | undefined => {
      const base = parseInteractivity(current) ?? defaultInteractivity();
      if (edit.fieldId === "kind") {
        if (!isEmberInteractivityKind(edit.value)) return base;
        return compactInteractivity({ ...base, kind: edit.value });
      }
      if (
        edit.fieldId === "triggerId" ||
        edit.fieldId === "scriptId" ||
        edit.fieldId === "iconId" ||
        edit.fieldId === "shopId" ||
        edit.fieldId === "questStatus"
      ) {
        return compactInteractivity({
          ...base,
          [edit.fieldId]: optionalText(edit.value),
        });
      }
      return base;
    };
    if (ref.kind === "voxel") {
      return {
        ...map,
        voxelProps: (map.voxelProps ?? []).map((item) => {
          if (item.id !== ref.id) return item;
          const interactivity = patchInteractivity(item.interactivity);
          if (!interactivity) {
            const { interactivity: _dropped, ...rest } = item;
            return rest;
          }
          return { ...item, interactivity };
        }),
      };
    }
    return {
      ...map,
      sprites: (map.sprites ?? []).map((item) => {
        if (item.id !== ref.id) return item;
        const interactivity = patchInteractivity(item.interactivity);
        if (!interactivity) {
          const { interactivity: _dropped, ...rest } = item;
          return rest;
        }
        return { ...item, interactivity };
      }),
    };
  }

  if (ref.kind === "sprite" && edit.componentType === "collider") {
    return {
      ...map,
      sprites: (map.sprites ?? []).map((placement) => {
        if (placement.id !== ref.id) return placement;
        let collider = placement.collider;
        if (edit.value === null) {
          collider = setColliderField(
            collider,
            edit.fieldId as keyof NonNullable<typeof collider>,
            null,
          );
        } else if (
          (edit.fieldId === "enabled" ||
            edit.fieldId === "isTrigger" ||
            edit.fieldId === "walkableTop") &&
          typeof edit.value === "boolean"
        ) {
          collider = setColliderField(collider, edit.fieldId, edit.value);
          if (edit.fieldId === "isTrigger" && edit.value) {
            collider = setColliderField(collider, "blocksMovement", false);
          }
        } else if (
          edit.fieldId === "offsetVoxels" &&
          typeof edit.value === "number"
        ) {
          collider = setColliderField(
            collider,
            "offsetVoxels",
            Math.round(edit.value),
          );
        } else {
          return placement;
        }
        return {
          ...placement,
          componentStates: {
            ...placement.componentStates,
            collider: true,
          },
          collider,
        };
      }),
    };
  }

  if (ref.kind === "tile" && edit.componentType === "collider") {
    const elev =
      ref.elev ??
      topOccupiedElevAt(map, ref.tx, ref.ty) ??
      elevationAt(map, ref.tx, ref.ty);
    const existing = tileInstanceModifierAt(map, ref.tx, ref.ty, elev);
    let collider = existing?.collider;
    if (edit.value === null) {
      collider = setColliderField(
        collider,
        edit.fieldId as keyof NonNullable<typeof collider>,
        null,
      );
    } else if (
      (edit.fieldId === "enabled" ||
        edit.fieldId === "isTrigger" ||
        edit.fieldId === "walkableTop") &&
      typeof edit.value === "boolean"
    ) {
      collider = setColliderField(collider, edit.fieldId, edit.value);
      if (edit.fieldId === "isTrigger" && edit.value) {
        collider = setColliderField(collider, "blocksMovement", false);
      }
    } else if (
      edit.fieldId === "offsetVoxels" &&
      typeof edit.value === "number"
    ) {
      collider = setColliderField(
        collider,
        "offsetVoxels",
        Math.round(edit.value),
      );
    } else {
      return map;
    }
    const modifier = {
      ...existing,
      x: ref.tx,
      y: ref.ty,
      elev,
      componentStates: { ...existing?.componentStates, collider: true },
      collider,
    };
    return {
      ...map,
      tileModifiers: [
        ...(map.tileModifiers ?? []).filter(
          (item) =>
            item.x !== ref.tx || item.y !== ref.ty || item.elev !== elev,
        ),
        modifier,
      ],
    };
  }

  if (ref.kind === "light" && edit.componentType === "light") {
    return {
      ...map,
      lights: (map.lights ?? []).map((item) => {
        if (item.id !== ref.id) return item;
        if (edit.fieldId === "enabled" && typeof edit.value === "boolean") {
          return { ...item, enabled: edit.value };
        }
        if (edit.fieldId === "lampRange" && typeof edit.value === "number") {
          return { ...item, lampRange: Math.max(1, Math.min(16, edit.value)) };
        }
        if (edit.fieldId === "lampHeight" && typeof edit.value === "number") {
          return { ...item, lampHeight: Math.max(0.2, Math.min(3, edit.value)) };
        }
        if (
          (edit.fieldId === "lampColor" ||
            edit.fieldId === "lampFaceColor") &&
          typeof edit.value === "string"
        ) {
          return { ...item, [edit.fieldId]: edit.value };
        }
        if (
          (edit.fieldId === "lampShowCore" ||
            edit.fieldId === "lampTorchFlicker") &&
          typeof edit.value === "boolean"
        ) {
          return { ...item, [edit.fieldId]: edit.value };
        }
        if (
          (edit.fieldId === "lampDiscCore" ||
            edit.fieldId === "lampDiscMid") &&
          typeof edit.value === "number"
        ) {
          return {
            ...item,
            [edit.fieldId]: Math.max(
              0,
              Math.min(item.lampRange ?? 16, Math.round(edit.value)),
            ),
          };
        }
        if (
          (edit.fieldId === "lampStrength0" ||
            edit.fieldId === "lampStrengthFalloff") &&
          typeof edit.value === "number"
        ) {
          return {
            ...item,
            [edit.fieldId]: Math.max(0, Math.min(1, edit.value)),
          };
        }
        return item;
      }),
    };
  }

  if (ref.kind !== "region") return map;
  return {
    ...map,
    regions: map.regions.map((region) => {
      if (region.id !== ref.id) return region;
      if (edit.componentType === "volume") {
        if (edit.fieldId === "width" && typeof edit.value === "number") {
          return {
            ...region,
            w: Math.max(1, Math.min(map.width - region.x, Math.round(edit.value))),
          };
        }
        if (edit.fieldId === "height" && typeof edit.value === "number") {
          return {
            ...region,
            h: Math.max(
              1,
              Math.min(map.height - region.y, Math.round(edit.value)),
            ),
          };
        }
      }
      if (edit.componentType === "trigger") {
        if (edit.fieldId === "scriptId") {
          return { ...region, scriptId: optionalText(edit.value) };
        }
        if (edit.fieldId === "note") {
          return { ...region, note: optionalText(edit.value) };
        }
        if (edit.fieldId === "group") {
          return { ...region, group: optionalText(edit.value) };
        }
        if (edit.fieldId === "targetMapId") {
          return { ...region, targetMapId: optionalText(edit.value) };
        }
        if (edit.fieldId === "targetRegionId") {
          return { ...region, targetRegionId: optionalText(edit.value) };
        }
        if (edit.fieldId === "boundObjectId") {
          return { ...region, boundObjectId: optionalText(edit.value) };
        }
      }
      if (edit.componentType === "teleport") {
        if (edit.fieldId === "targetRegionId") {
          return {
            ...region,
            targetRegionId: optionalText(edit.value),
            ...(optionalText(edit.value)
              ? { targetX: undefined, targetY: undefined }
              : {}),
          };
        }
        if (edit.fieldId === "targetX" && typeof edit.value === "number") {
          return {
            ...region,
            targetX: Math.round(edit.value),
            targetRegionId: undefined,
          };
        }
        if (edit.fieldId === "targetY" && typeof edit.value === "number") {
          return {
            ...region,
            targetY: Math.round(edit.value),
            targetRegionId: undefined,
          };
        }
        if (edit.fieldId === "targetElevation" && typeof edit.value === "number") {
          return { ...region, targetElevation: Math.round(edit.value) };
        }
      }
      if (edit.componentType === "spawn" && edit.fieldId === "group") {
        return { ...region, group: optionalText(edit.value) };
      }
      if (edit.componentType === "chest") {
        if (
          edit.fieldId === "closedModelId" ||
          edit.fieldId === "openModelId" ||
          edit.fieldId === "sceneId" ||
          edit.fieldId === "openClipId"
        ) {
          return { ...region, [edit.fieldId]: optionalText(edit.value) };
        }
        if (edit.fieldId === "lootIds") {
          return { ...region, lootIds: compactLootIds(parseLootIds(edit.value)) };
        }
        if (edit.fieldId === "repeatable") {
          return {
            ...region,
            repeatable: edit.value === true ? true : undefined,
          };
        }
      }
      return region;
    }),
  };
}
