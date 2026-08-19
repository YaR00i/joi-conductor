import type {
  EmberColliderModifier,
  EmberVoxelModel,
  EmberVoxelPlacement,
} from "../../content/types";
import {
  DEFAULT_EMISSIVE_LIGHT_RANGE,
  DEFAULT_EMISSIVE_STRENGTH,
} from "../../tile/lightLimits";
import { resolveWorldCollider } from "../../world/worldPhysics";
import {
  clampVoxelDirectLightScale,
  DEFAULT_VOXEL_DIRECT_LIGHT_SCALE,
} from "../../voxel/voxelMesher";
import type { EmberWorldValueSource } from "./EmberWorldObject";

export type EmberVoxelOverrideComponentType =
  | "voxel-renderer"
  | "collider"
  | "voxel-light";

/** Optional components shared by the unified WorldObject Inspector. */
export type EmberOptionalComponentType = "collider" | "voxel-light";
/** @deprecated Use EmberOptionalComponentType outside voxel-prefab internals. */
export type EmberVoxelOptionalComponentType = EmberOptionalComponentType;

export type EmberVoxelPrefabField<T> = Readonly<{
  value: T;
  source: EmberWorldValueSource;
}>;

const LIGHT_FIELDS = [
  "emissiveCastsLight",
  "emissiveLightRange",
  "emissiveLightShadows",
  "emissiveStrength",
  "emissiveTorchFlicker",
  "emissiveLanternFlicker",
  "emissiveSuppressHostShadow",
] as const;

export type EmberVoxelLightFieldId = (typeof LIGHT_FIELDS)[number];

function owns(object: object | undefined, key: PropertyKey): boolean {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

export function voxelOptionalComponentPresent(
  placement: EmberVoxelPlacement,
  model: EmberVoxelModel | undefined,
  component: EmberVoxelOptionalComponentType,
): boolean {
  const instance = placement.componentStates?.[component];
  if (instance != null) return instance;
  const asset = model?.componentStates?.[component];
  // Legacy assets exposed both components; keep them compatible until the
  // author explicitly removes one in the new component menu.
  return asset ?? true;
}

export function setVoxelInstanceComponentPresence(
  placement: EmberVoxelPlacement,
  component: EmberVoxelOptionalComponentType,
  present: boolean,
): EmberVoxelPlacement {
  const next: EmberVoxelPlacement = {
    ...placement,
    componentStates: { ...placement.componentStates, [component]: present },
  };
  if (component === "collider") {
    next.collider = present
      ? { ...placement.collider, enabled: true }
      : { ...placement.collider, enabled: false };
  } else if (!present) {
    next.emissiveCastsLight = false;
  }
  return next;
}

export function setVoxelAssetComponentPresence(
  model: EmberVoxelModel,
  component: EmberVoxelOptionalComponentType,
  present: boolean,
): EmberVoxelModel {
  const next: EmberVoxelModel = {
    ...model,
    componentStates: { ...model.componentStates, [component]: present },
  };
  if (component === "collider") {
    next.physical = present;
    next.collider = present
      ? { ...model.collider, enabled: true }
      : { ...model.collider, enabled: false };
  } else if (!present) {
    next.emissiveCastsLight = false;
  }
  return next;
}

function sourceFor(
  instance: object | undefined,
  asset: object | undefined,
  key: PropertyKey,
  legacy = false,
): EmberWorldValueSource {
  if (owns(instance, key)) return "instance";
  if (owns(asset, key)) return "asset";
  return legacy ? "legacy" : "default";
}

export function resolveVoxelPrefabState(
  placement: EmberVoxelPlacement,
  model: EmberVoxelModel | undefined,
) {
  const collider = resolveWorldCollider(
    model?.collider,
    placement.collider,
    model?.physical !== false,
  );
  const colliderSources = {
    enabled: sourceFor(
      placement.collider,
      model?.collider,
      "enabled",
      model?.physical === false,
    ),
    isTrigger: sourceFor(placement.collider, model?.collider, "isTrigger"),
    walkableTop: sourceFor(
      placement.collider,
      model?.collider,
      "walkableTop",
    ),
    offsetVoxels: sourceFor(
      placement.collider,
      model?.collider,
      "offsetVoxels",
    ),
  } satisfies Record<string, EmberWorldValueSource>;

  const instanceScale = owns(placement, "directLightScale");
  const assetScale = owns(model, "directLightScale");
  const directLightScale = clampVoxelDirectLightScale(
    instanceScale ? placement.directLightScale : model?.directLightScale,
  );

  const lightValue = <T>(
    field: EmberVoxelLightFieldId,
    fallback: T,
  ): EmberVoxelPrefabField<T> => ({
    value: (owns(placement, field)
      ? placement[field]
      : owns(model, field)
        ? model?.[field]
        : fallback) as T,
    source: sourceFor(placement, model, field),
  });

  return {
    directLightScale: {
      value: directLightScale ?? DEFAULT_VOXEL_DIRECT_LIGHT_SCALE,
      source: instanceScale ? "instance" : assetScale ? "asset" : "default",
    } satisfies EmberVoxelPrefabField<number>,
    collider: {
      value: collider,
      sources: colliderSources,
      instance: placement.collider,
      asset: model?.collider,
    },
    light: {
      emissiveCastsLight: lightValue("emissiveCastsLight", false),
      emissiveLightRange: lightValue(
        "emissiveLightRange",
        DEFAULT_EMISSIVE_LIGHT_RANGE,
      ),
      emissiveLightShadows: lightValue("emissiveLightShadows", false),
      emissiveStrength: lightValue(
        "emissiveStrength",
        DEFAULT_EMISSIVE_STRENGTH,
      ),
      emissiveTorchFlicker: lightValue("emissiveTorchFlicker", false),
      emissiveLanternFlicker: lightValue("emissiveLanternFlicker", false),
      emissiveSuppressHostShadow: lightValue(
        "emissiveSuppressHostShadow",
        false,
      ),
    },
  };
}

function withoutKey<T extends object>(value: T | undefined, key: keyof T): T | undefined {
  if (!value || !owns(value, key)) return value;
  const next = { ...value };
  delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}

export function clearVoxelInstanceField(
  placement: EmberVoxelPlacement,
  component: EmberVoxelOverrideComponentType,
  fieldId: string,
): EmberVoxelPlacement {
  const next = { ...placement };
  if (component === "voxel-renderer" && fieldId === "directLightScale") {
    delete next.directLightScale;
  } else if (component === "collider") {
    next.collider = withoutKey(
      next.collider,
      fieldId as keyof EmberColliderModifier,
    );
    if (!next.collider) delete next.collider;
  } else if (
    component === "voxel-light" &&
    LIGHT_FIELDS.includes(fieldId as EmberVoxelLightFieldId)
  ) {
    delete next[fieldId as EmberVoxelLightFieldId];
  }
  return next;
}

export function clearVoxelInstanceComponent(
  placement: EmberVoxelPlacement,
  component: EmberVoxelOverrideComponentType,
): EmberVoxelPlacement {
  let next = { ...placement };
  if (component === "voxel-renderer") {
    delete next.directLightScale;
  } else if (component === "collider") {
    delete next.collider;
  } else {
    for (const field of LIGHT_FIELDS) delete next[field];
  }
  return next;
}

export function applyVoxelInstanceComponentToAsset(
  placement: EmberVoxelPlacement,
  model: EmberVoxelModel,
  component: EmberVoxelOverrideComponentType,
): { placement: EmberVoxelPlacement; model: EmberVoxelModel; changed: boolean } {
  const nextPlacement = { ...placement };
  const nextModel = { ...model };
  let changed = false;

  if (component === "voxel-renderer" && owns(placement, "directLightScale")) {
    nextModel.directLightScale = clampVoxelDirectLightScale(
      placement.directLightScale,
    );
    delete nextPlacement.directLightScale;
    changed = true;
  } else if (component === "collider" && placement.collider) {
    nextModel.collider = { ...model.collider, ...placement.collider };
    delete nextPlacement.collider;
    changed = true;
  } else if (component === "voxel-light") {
    for (const field of LIGHT_FIELDS) {
      if (!owns(placement, field)) continue;
      (nextModel as Record<string, unknown>)[field] = placement[field];
      delete nextPlacement[field];
      changed = true;
    }
  }

  return { placement: nextPlacement, model: nextModel, changed };
}
