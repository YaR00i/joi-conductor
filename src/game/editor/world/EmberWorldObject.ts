import type {
  EmberColliderModifier,
  EmberLightSource,
  EmberMapRegion,
  EmberSpritePlacement,
  EmberVoxelPlacement,
} from "../../content/types";

export type EmberWorldValueSource =
  | "instance"
  | "asset"
  | "legacy"
  | "default";

export type EmberWorldObjectKind =
  | "voxel"
  | "sprite"
  | "light"
  | "region"
  | "tile";

export type EmberWorldObjectRef =
  | { kind: "voxel"; id: string }
  | { kind: "sprite"; id: string }
  | { kind: "light"; id: string }
  | { kind: "region"; id: string }
  | { kind: "tile"; tx: number; ty: number; elev?: number };

export type EmberWorldTransform = Readonly<{
  /** Authored map-grid position. Null Z means inherited from the floor. */
  position: Readonly<{ x: number; y: number; z: number | null }>;
  /** Effective elevation after floor inheritance. */
  resolvedZ: number;
  rotationQuarterTurns: number;
  scale: Readonly<{ x: number; y: number; z: number }>;
}>;

export type EmberWorldTransformComponent = Readonly<{
  type: "transform";
  value: EmberWorldTransform;
}>;

export type EmberWorldVoxelRendererComponent = Readonly<{
  type: "voxel-renderer";
  modelId: string;
  directLightScale: number;
  fieldSources: Readonly<{ directLightScale: EmberWorldValueSource }>;
}>;

export type EmberWorldVoxelLightComponent = Readonly<{
  type: "voxel-light";
  values: Readonly<{
    emissiveCastsLight: boolean;
    emissiveLightRange: number;
    emissiveLightShadows: boolean;
    emissiveStrength: number;
    emissiveTorchFlicker: boolean;
    emissiveLanternFlicker: boolean;
    emissiveSuppressHostShadow: boolean;
  }>;
  fieldSources: Readonly<Record<string, EmberWorldValueSource>>;
}>;

export type EmberWorldSpriteRendererComponent = Readonly<{
  type: "sprite-renderer";
  spriteId: string;
}>;

export type EmberWorldLightComponent = Readonly<{
  type: "light";
  source: EmberLightSource;
}>;

export type EmberWorldVolumeComponent = Readonly<{
  type: "volume";
  region: EmberMapRegion;
}>;

export type EmberWorldTriggerComponent = Readonly<{
  type: "trigger";
  scriptId?: string;
  note?: string;
  group?: string;
}>;

export type EmberWorldTeleportComponent = Readonly<{
  type: "teleport";
  targetRegionId?: string;
  targetPosition?: Readonly<{ x: number; y: number; z?: number }>;
}>;

export type EmberWorldSpawnComponent = Readonly<{
  type: "spawn";
  role: "player" | "enemy";
  group?: string;
}>;

export type EmberWorldChestComponent = Readonly<{
  type: "chest";
  closedModelId?: string;
  openModelId?: string;
  sceneId?: string;
  openClipId?: string;
}>;

export type EmberWorldCameraBoundsComponent = Readonly<{
  type: "camera-bounds";
}>;

export type EmberWorldBlockComponent = Readonly<{
  type: "block";
  tileId: number;
  elevation: number;
  heightVoxels: number;
}>;

export type EmberWorldColliderComponent = Readonly<{
  type: "collider";
  modifier: EmberColliderModifier | null;
  /** Where the add/remove decision comes from, separate from field overrides. */
  presenceSource?: EmberWorldValueSource;
  inheritedFrom: EmberWorldValueSource;
  fieldSources: Readonly<Record<string, EmberWorldValueSource>>;
}>;

export type EmberWorldObjectComponent =
  | EmberWorldTransformComponent
  | EmberWorldVoxelRendererComponent
  | EmberWorldVoxelLightComponent
  | EmberWorldSpriteRendererComponent
  | EmberWorldLightComponent
  | EmberWorldVolumeComponent
  | EmberWorldTriggerComponent
  | EmberWorldTeleportComponent
  | EmberWorldSpawnComponent
  | EmberWorldChestComponent
  | EmberWorldCameraBoundsComponent
  | EmberWorldBlockComponent
  | EmberWorldColliderComponent;

export type EmberWorldObjectSource =
  | { kind: "voxel"; value: EmberVoxelPlacement }
  | { kind: "sprite"; value: EmberSpritePlacement }
  | { kind: "light"; value: EmberLightSource }
  | { kind: "region"; value: EmberMapRegion }
  | {
      kind: "tile";
      value: { tx: number; ty: number; elev: number; tileId: number };
    };

export type EmberWorldObject = Readonly<{
  key: string;
  ref: EmberWorldObjectRef;
  kind: EmberWorldObjectKind;
  id: string;
  name: string;
  transform: EmberWorldTransform;
  components: readonly EmberWorldObjectComponent[];
  /** Instance-side component tombstones that can be reverted to the asset. */
  removedComponents?: readonly ("collider" | "voxel-light")[];
  source: EmberWorldObjectSource;
}>;

export type EmberWorldTransformPatch = Readonly<{
  x?: number;
  y?: number;
  z?: number | null;
  rotationQuarterTurns?: number;
}>;

export type EmberWorldTransformSpace = "world" | "local";

export function emberWorldObjectRefKey(ref: EmberWorldObjectRef): string {
  if (ref.kind === "tile") {
    return `tile:${ref.tx}:${ref.ty}:${ref.elev ?? "auto"}`;
  }
  return `${ref.kind}:${ref.id}`;
}

export function emberWorldObjectRefEquals(
  left: EmberWorldObjectRef,
  right: EmberWorldObjectRef,
): boolean {
  return emberWorldObjectRefKey(left) === emberWorldObjectRefKey(right);
}

export function emberWorldObjectComponent<
  TType extends EmberWorldObjectComponent["type"],
>(
  object: EmberWorldObject,
  type: TType,
): Extract<EmberWorldObjectComponent, { type: TType }> | null {
  return (
    object.components.find((component) => component.type === type) as
      | Extract<EmberWorldObjectComponent, { type: TType }>
      | undefined
  ) ?? null;
}
