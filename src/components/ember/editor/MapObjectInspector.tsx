/**
 * Right-side slide-out inspector for the map object under selection
 * (light / sprite / voxel prop / tile / region / library item / global light).
 */
import type {
  EmberColliderModifier,
  EmberLightSource,
  EmberMap,
  EmberMapLight,
  EmberMapPlayProfile,
  EmberMapRegion,
  EmberPack,
  EmberSceneGroup,
  EmberTileset,
  EmberVoxelPlacement,
} from "../../../game/content/types";
import { listAssignableScriptOptions } from "../../../game/content/emberScript";
import { MAX_ELEVATION, MIN_ELEVATION } from "../../../game/content/types";
import { normalizePixelSprite } from "../../../game/content/pixelSprite";
import { normalizeLampParams } from "../../../game/content/lightPresets";
import {
  findLibraryAssetReferences,
  type EmberAssetReference,
} from "../../../game/editor/emberLibraryIndex";
import { EmberLibraryTagsField, EmberLibraryUsageLine } from "./EmberLibraryMeta";
import {
  elevationAt,
  elevTileIdAt,
  heightVoxelsAt,
  tileSurfaceElev,
  type LanternSource,
  type ResolvedMapLight,
} from "../../../game/tile/mapUtils";
import {
  DEFAULT_EMISSIVE_LIGHT_RANGE,
  MAX_EMISSIVE_LIGHT_RANGE,
  MAX_EMISSIVE_STRENGTH,
  MIN_EMISSIVE_LIGHT_RANGE,
  MIN_EMISSIVE_STRENGTH,
  resolveEmissiveLightRange,
  resolveEmissiveStrength,
} from "../../../game/tile/emissivePaint";
import {
  clampVoxelDirectLightScale,
  DEFAULT_VOXEL_DIRECT_LIGHT_SCALE,
} from "../../../game/voxel/voxelMesher";
import { modelHasEmissiveVoxels } from "../../../game/voxel/voxelEmissiveLight";
import { voxelGridSize } from "../../../game/voxel/voxelModel";
import { normalizeVoxelRot } from "../../../game/voxel/voxelPlacement";
import { LightSourceEditor } from "./MapLightPanel";
import {
  BUILTIN_LIGHT_PRESET_IDS,
  type MapLibPayload,
} from "./MapLibraryTray";
import {
  MAP_REGION_KIND_LABEL,
} from "./mapRegionHelpers";
import {
  MapRegionEditor,
  regionsAtTile,
} from "./MapRegionEditor";
import { MapSettingsPanel } from "./MapSettingsPanel";
import {
  getEmberWorldObject,
  getEmberLightAssetWorldObject,
  getEmberRegionDraftWorldObject,
  getEmberSpriteAssetWorldObject,
  getEmberTileAssetWorldObject,
  getEmberVoxelAssetWorldObject,
  type EmberInspectorFieldEdit,
  type EmberOptionalComponentType,
  type EmberVoxelOverrideComponentType,
  type EmberWorldObject,
  type EmberWorldObjectRef,
  type EmberWorldTransformPatch,
  type EmberWorldTransformSpace,
} from "../../../game/editor";
import { WorldObjectSchemaInspector } from "./WorldObjectSchemaInspector";
import { InspectorObjectHeader } from "./InspectorObjectHeader";

export type MapSelection =
  | { kind: "light"; id: string }
  | { kind: "sprite"; id: string }
  | { kind: "voxel"; id: string }
  | { kind: "tile"; tx: number; ty: number; elev?: number }
  | { kind: "region"; id: string }
  | { kind: "group"; id: string }
  | { kind: "lib"; payload: MapLibPayload }
  | { kind: "globalLight" };

export function mapSelectionToWorldObjectRef(
  selection: MapSelection | null,
): EmberWorldObjectRef | null {
  if (
    !selection ||
    selection.kind === "lib" ||
    selection.kind === "globalLight" ||
    selection.kind === "group"
  ) {
    return null;
  }
  if (selection.kind === "tile") {
    return {
      kind: "tile",
      tx: selection.tx,
      ty: selection.ty,
      elev: selection.elev,
    };
  }
  return { kind: selection.kind, id: selection.id };
}

export type MapObjectInspectorProps = {
  selection: MapSelection;
  /** Complete editor selection. The Inspector still edits only its primary. */
  selectionItems?: readonly MapSelection[];
  onSetSelectionPrimary?: (selection: MapSelection) => void;
  onToggleSelection?: (selection: MapSelection) => void;
  onClearSelection?: () => void;
  multiWorldObjects?: readonly EmberWorldObject[];
  multiAllLocked?: boolean;
  multiAllHidden?: boolean;
  onSetMultiElevation?: (elevation: number) => void;
  onDropMultiToFloor?: () => void;
  onSetMultiLocked?: (locked: boolean) => void;
  onSetMultiHidden?: (hidden: boolean) => void;
  onDuplicateMulti?: () => void;
  onDeleteMulti?: () => void;
  /** Duplicate the inspector's primary placed object (undoable). */
  onDuplicateSelection?: () => void;
  /** Delete the inspector's primary placed object or tile (undoable). */
  onDeleteSelection?: () => void;
  /** Editor-only lock from the Scene Outliner. */
  locked?: boolean;
  /** Editor-only visibility from the Scene Outliner. */
  hidden?: boolean;
  onToggleLocked?: () => void;
  onToggleHidden?: () => void;
  /** Unified scene object resolved by the World Object adapter. */
  worldObject?: EmberWorldObject | null;
  onWorldObjectFieldEdit?: (edit: EmberInspectorFieldEdit) => void;
  onWorldObjectTransformPatch?: (
    space: EmberWorldTransformSpace,
    patch: EmberWorldTransformPatch,
  ) => void;
  onApplyWorldObjectComponentToAsset?: (
    component: EmberVoxelOverrideComponentType,
  ) => void;
  onRevertWorldObjectComponentOverrides?: (
    component: EmberVoxelOverrideComponentType,
  ) => void;
  onAddWorldObjectComponent?: (
    component: EmberOptionalComponentType,
  ) => void;
  onRemoveWorldObjectComponent?: (
    component: EmberOptionalComponentType,
  ) => void;
  onLibraryObjectFieldEdit?: (edit: EmberInspectorFieldEdit) => void;
  onAddLibraryObjectComponent?: (
    component: EmberOptionalComponentType,
  ) => void;
  onRemoveLibraryObjectComponent?: (
    component: EmberOptionalComponentType,
  ) => void;
  sceneGroup?: EmberSceneGroup | null;
  sceneGroups?: readonly EmberSceneGroup[];
  onRenameGroup?: (id: string, name: string) => void;
  onDuplicateGroup?: (id: string) => void;
  onTranslateGroup?: (id: string, dx: number, dy: number) => void;
  onRotateGroup?: (id: string, quarterTurns: number) => void;
  onScaleGroup?: (
    id: string,
    scale: { x: number; y: number; z: number },
  ) => void;
  onSelectGroupMembers?: (id: string) => void;
  onRemoveGroup?: (id: string) => void;
  onSetGroupParent?: (id: string, parentGroupId?: string) => void;
  onSetWorldObjectParent?: (objectKey: string, parentGroupId?: string) => void;
  map: EmberMap;
  pack: EmberPack;
  tileset: EmberTileset | undefined;
  globalLight: ResolvedMapLight;
  lanternSources: LanternSource[];
  pickModeActive: boolean;
  onClose: () => void;
  onActivatePickMode: () => void;
  onSelectLight: (id: string | null) => void;
  onCommitGlobal: (light: EmberMapLight) => void;
  onResetGlobal: () => void;
  onCommitPlayProfile?: (profile: EmberMapPlayProfile) => void;
  onCommitSource: (
    source: EmberLightSource,
    opts?: { history?: boolean },
  ) => void;
  onBeginSourceEdit?: () => void;
  onDeleteSource: (id: string) => void;
  onClearSourceOverrides: (id: string) => void;
  /** Nudge / relocate selected lantern (tile coords). */
  onMoveSource?: (id: string, x: number, y: number) => void;
  /** Start G-style grab move for the selected lantern. */
  onBeginSourceGrabMove?: (id: string) => void;
  onPackChange?: (pack: EmberPack) => void;
  onSaved?: (msg: string) => void;
  onDeleteSprite: (id: string) => void;
  onDeleteVoxel: (id: string) => void;
  onPatchTile: (
    tx: number,
    ty: number,
    patch: {
      heightVoxels?: number;
      elevation?: number;
      sourceElevation?: number;
    },
  ) => void;
  onPatchVoxelPlacement: (
    id: string,
    patch: {
      modelId?: string;
      elev?: number;
      x?: number;
      y?: number;
      rot?: number;
      directLightScale?: number;
      emissiveCastsLight?: boolean | null;
      emissiveLightRange?: number | null;
      emissiveLightShadows?: boolean | null;
      emissiveStrength?: number | null;
      emissiveTorchFlicker?: boolean | null;
      emissiveLanternFlicker?: boolean | null;
      emissiveSuppressHostShadow?: boolean | null;
      collider?: EmberColliderModifier | null;
    },
  ) => void;
  onRenameVoxelModel: (modelId: string, nameRu: string) => void;
  onSetVoxelModelTags?: (
    modelId: string,
    tags: string[] | undefined,
  ) => void;
  onSetSpriteTags?: (spriteId: string, tags: string[] | undefined) => void;
  onFocusLibraryReference?: (ref: EmberAssetReference) => void;
  onPatchVoxelModelLight?: (
    modelId: string,
    patch: {
      emissiveCastsLight?: boolean | null;
      emissiveLightRange?: number | null;
      emissiveLightShadows?: boolean | null;
      emissiveStrength?: number | null;
      emissiveTorchFlicker?: boolean | null;
      emissiveLanternFlicker?: boolean | null;
      emissiveSuppressHostShadow?: boolean | null;
    },
  ) => void;
  onOpenVoxelSculpt: (placementId: string) => void;
  /** Create a unique library copy for this placement only. */
  onOpenVoxelSculptVariant?: (placementId: string) => void;
  onDuplicateVoxel: (placementId: string) => void;
  onSelectVoxel: (placementId: string) => void;
  onEditTile?: (tileId: number) => void;
  onEditSprite?: (spriteId: string) => void;
  onCreateTile?: () => void;
  onCloneTile?: (tileId: number) => void;
  onCommitRegion: (prevId: string, region: EmberMapRegion) => void;
  onDeleteRegion: (id: string) => void;
  onFocusRegion?: (id: string) => void;
  onPairTeleport?: (fromId: string, toId: string) => void;
  /** Hover preview another zone (camera + blink). */
  onHoverRegionPeer?: (id: string | null) => void;
  onOpenVoxelScene?: (sceneId: string) => void;
  /** Draft region while a library zone is selected (applied on place). */
  libRegionDraft?: EmberMapRegion | null;
  onLibRegionDraftChange?: (region: EmberMapRegion) => void;
  onOpenVoxelSculptLibrary?: () => void;
};

const BUILTIN_LIGHT_LABEL: Record<string, string> = {
  default: "Фонарь",
  warm: "Тёплый",
  cool: "Холодный",
  bright: "Яркий",
  dim: "Тусклый",
};

function kindEyebrow(sel: MapSelection): string {
  switch (sel.kind) {
    case "light":
      return "Свет";
    case "sprite":
      return "Объект";
    case "voxel":
      return "Воксель";
    case "tile":
      return "Клетка";
    case "region":
      return "Зона";
    case "group":
      return "Иерархия";
    case "lib":
      return "Библиотека";
    case "globalLight":
      return "Карта";
    default: {
      const _n: never = sel;
      return _n;
    }
  }
}

function titleFor(sel: MapSelection, pack: EmberPack, tileset?: EmberTileset): string {
  switch (sel.kind) {
    case "light":
      return "Источник света";
    case "sprite":
      return "Спрайт";
    case "voxel":
      return "Воксель-блок";
    case "tile":
      return "Тайл";
    case "region":
      return "Зона на карте";
    case "group":
      return "Группа объектов";
    case "lib":
      return libTitle(sel.payload, pack, tileset);
    case "globalLight":
      return "Свет карты";
    default: {
      const _n: never = sel;
      return _n;
    }
  }
}

function compactSelectionLabel(selection: MapSelection): string {
  switch (selection.kind) {
    case "voxel":
      return `Воксель · ${selection.id}`;
    case "sprite":
      return `Спрайт · ${selection.id}`;
    case "light":
      return `Свет · ${selection.id}`;
    case "region":
      return `Зона · ${selection.id}`;
    case "group":
      return `Группа · ${selection.id}`;
    case "tile":
      return `${selection.tx}, ${selection.ty}${selection.elev == null ? "" : ` · Z${selection.elev}`}`;
    case "lib":
      return "Ассет библиотеки";
    case "globalLight":
      return "Свет карты";
    default: {
      const exhaustive: never = selection;
      return exhaustive;
    }
  }
}

function compactSelectionKey(selection: MapSelection): string {
  if (selection.kind === "tile") {
    return `tile:${selection.tx}:${selection.ty}:${selection.elev ?? ""}`;
  }
  if (selection.kind === "lib") {
    return `lib:${JSON.stringify(selection.payload)}`;
  }
  if (selection.kind === "globalLight") return "globalLight";
  return `${selection.kind}:${selection.id}`;
}

function mapSelectionEqualsForInspector(
  left: MapSelection,
  right: MapSelection,
): boolean {
  return compactSelectionKey(left) === compactSelectionKey(right);
}

function libTitle(
  payload: MapLibPayload,
  pack: EmberPack,
  tileset?: EmberTileset,
): string {
  switch (payload.kind) {
    case "sprite": {
      const s = pack.sprites[payload.spriteId];
      return s
        ? normalizePixelSprite(s).nameRu?.trim() || payload.spriteId
        : payload.spriteId;
    }
    case "voxel": {
      const m = pack.voxelModels?.[payload.modelId];
      return m?.nameRu?.trim() || payload.modelId;
    }
    case "tile": {
      const t = tileset?.tiles.find((x) => x.id === payload.tileId);
      return t?.name || `Тайл #${payload.tileId}`;
    }
    case "light":
      return (
        pack.lightPresets?.[payload.presetId]?.nameRu ||
        BUILTIN_LIGHT_LABEL[payload.presetId] ||
        payload.presetId
      );
    case "region":
      return MAP_REGION_KIND_LABEL[payload.regionKind];
    default: {
      const _n: never = payload;
      return _n;
    }
  }
}

function VoxelBody({
  place,
  pack,
  map,
  onPatch,
  onPatchModelLight,
  onRenameModel,
  onSetModelTags,
  onFocusLibraryReference,
  onEditVoxels,
  onCreateVariant,
  showCoreComponents = true,
}: {
  place: EmberVoxelPlacement;
  pack: EmberPack;
  map: EmberMap;
  onPatch: (patch: {
    modelId?: string;
    elev?: number;
    x?: number;
    y?: number;
    rot?: number;
    directLightScale?: number;
    emissiveCastsLight?: boolean | null;
    emissiveLightRange?: number | null;
    emissiveLightShadows?: boolean | null;
    emissiveStrength?: number | null;
    emissiveTorchFlicker?: boolean | null;
    emissiveLanternFlicker?: boolean | null;
    emissiveSuppressHostShadow?: boolean | null;
    collider?: EmberColliderModifier | null;
  }) => void;
  onPatchModelLight?: (patch: {
    emissiveCastsLight?: boolean | null;
    emissiveLightRange?: number | null;
    emissiveLightShadows?: boolean | null;
    emissiveStrength?: number | null;
    emissiveTorchFlicker?: boolean | null;
    emissiveLanternFlicker?: boolean | null;
    emissiveSuppressHostShadow?: boolean | null;
  }) => void;
  onRenameModel: (nameRu: string) => void;
  onSetModelTags?: (tags: string[] | undefined) => void;
  onFocusLibraryReference?: (ref: EmberAssetReference) => void;
  onEditVoxels: () => void;
  onCreateVariant?: () => void;
  showCoreComponents?: boolean;
}) {
  const models = Object.values(pack.voxelModels ?? {});
  const model = pack.voxelModels?.[place.modelId];
  const floorElev = elevationAt(map, place.x, place.y);
  const surfaceElev = tileSurfaceElev(map, place.x, place.y);
  const elev = place.elev ?? surfaceElev;
  const grid = model ? voxelGridSize(model) : null;
  const elevMax = Math.max(MAX_ELEVATION, 8);
  const rot = normalizeVoxelRot(place.rot);
  const rotDeg = rot * 90;
  const directLightScale = clampVoxelDirectLightScale(place.directLightScale);
  const modelHasEmit = model ? modelHasEmissiveVoxels(model) : false;
  const modelCasts = model?.emissiveCastsLight === true;
  const effectiveCasts =
    place.emissiveCastsLight !== undefined
      ? place.emissiveCastsLight
      : modelCasts;
  const effectiveRange = resolveEmissiveLightRange(
    place.emissiveLightRange ?? model?.emissiveLightRange,
  );
  const effectiveStrength = resolveEmissiveStrength(
    place.emissiveStrength ?? model?.emissiveStrength,
  );
  const modelShadows = model?.emissiveLightShadows === true;
  const effectiveShadows =
    place.emissiveLightShadows !== undefined
      ? place.emissiveLightShadows
      : modelShadows;
  const effectiveTorchFlicker =
    place.emissiveTorchFlicker !== undefined
      ? place.emissiveTorchFlicker
      : model?.emissiveTorchFlicker === true;
  const effectiveLanternFlicker =
    place.emissiveLanternFlicker !== undefined
      ? place.emissiveLanternFlicker
      : model?.emissiveLanternFlicker === true;
  const effectiveSuppressHost =
    place.emissiveSuppressHostShadow !== undefined
      ? place.emissiveSuppressHostShadow
      : model?.emissiveSuppressHostShadow === true;
  const hasLightOverride =
    place.emissiveCastsLight !== undefined ||
    place.emissiveLightRange !== undefined ||
    place.emissiveLightShadows !== undefined ||
    place.emissiveStrength !== undefined ||
    place.emissiveTorchFlicker !== undefined ||
    place.emissiveLanternFlicker !== undefined ||
    place.emissiveSuppressHostShadow !== undefined;
  const effectiveCollider: EmberColliderModifier = {
    enabled: model?.physical !== false,
    blocksMovement: model?.physical !== false,
    walkableTop: true,
    layer: "world",
    ...model?.collider,
    ...place.collider,
  };

  const clearLightOverrides = () =>
    onPatch({
      emissiveCastsLight: null,
      emissiveLightRange: null,
      emissiveLightShadows: null,
      emissiveStrength: null,
      emissiveTorchFlicker: null,
      emissiveLanternFlicker: null,
      emissiveSuppressHostShadow: null,
    });

  const writeLightToModel = () => {
    if (!onPatchModelLight) return;
    onPatchModelLight({
      emissiveCastsLight: effectiveCasts ? true : null,
      emissiveLightRange: effectiveCasts ? effectiveRange : null,
      emissiveLightShadows: effectiveCasts && effectiveShadows ? true : null,
      emissiveStrength: effectiveCasts ? effectiveStrength : null,
      emissiveTorchFlicker:
        effectiveCasts && effectiveTorchFlicker ? true : null,
      emissiveLanternFlicker:
        effectiveCasts && effectiveLanternFlicker ? true : null,
      emissiveSuppressHostShadow:
        effectiveCasts && effectiveSuppressHost ? true : null,
    });
    clearLightOverrides();
  };

  const moveBy = (dx: number, dy: number) => {
    const nx = Math.max(0, Math.min(map.width - 1, place.x + dx));
    const ny = Math.max(0, Math.min(map.height - 1, place.y + dy));
    if (nx === place.x && ny === place.y) return;
    onPatch({ x: nx, y: ny });
  };

  return (
    <div className="ember-map-inspector__body">
      <div className="ember-map-inspector__hero">
        <div className="ember-map-inspector__hero-text">
          <strong>{model?.nameRu?.trim() || place.modelId}</strong>
          <span>
            {place.x}, {place.y}
            {grid ? ` · ${grid.sx}×${grid.sy}×${grid.sz}` : ""}
            {` · ${rotDeg}°`}
          </span>
        </div>
        <button
          type="button"
          className="primary ember-map-inspector__cta"
          title="Открыть общую модель в библиотеке (свет, размер, origin…)"
          onClick={onEditVoxels}
        >
          Редактировать воксели
        </button>
        {onCreateVariant ? (
          <button
            type="button"
            className="ghost ember-map-inspector__cta"
            title="Создать копию модели только для этой клетки"
            onClick={onCreateVariant}
          >
            Создать вариацию
          </button>
        ) : null}
      </div>

      {showCoreComponents ? (
      <section className="ember-map-inspector__card">
        <p className="ember-map-inspector__section">Размещение</p>
        <p className="ember-map-inspector__section ember-map-inspector__section--sub">
          Переместить
        </p>
        <div className="ember-map-inspector__pad" role="group" aria-label="Сдвиг">
          <button
            type="button"
            className="ghost"
            title="Север (−Y)"
            onClick={() => moveBy(0, -1)}
          >
            ↑
          </button>
          <div className="ember-map-inspector__pad-mid">
            <button
              type="button"
              className="ghost"
              title="Запад (−X)"
              onClick={() => moveBy(-1, 0)}
            >
              ←
            </button>
            <button
              type="button"
              className="ghost"
              title="Юг (+Y)"
              onClick={() => moveBy(0, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="ghost"
              title="Восток (+X)"
              onClick={() => moveBy(1, 0)}
            >
              →
            </button>
          </div>
        </div>

        <p className="ember-map-inspector__section ember-map-inspector__section--sub">
          Повернуть
        </p>
        <div className="ember-map-inspector__rot" role="group" aria-label="Поворот">
          <button
            type="button"
            className="ghost"
            title="Против часовой (−90°)"
            onClick={() => onPatch({ rot: normalizeVoxelRot(rot - 1) })}
          >
            ↺ −90°
          </button>
          <em>{rotDeg}°</em>
          <button
            type="button"
            className="ghost"
            title="По часовой (+90°)"
            onClick={() => onPatch({ rot: normalizeVoxelRot(rot + 1) })}
          >
            ↻ +90°
          </button>
        </div>

        <label className="ember-map-inspector__row">
          <span>Высота пола (Z)</span>
          <input
            type="range"
            min={0}
            max={elevMax}
            step={1}
            value={elev}
            onChange={(e) => onPatch({ elev: Number(e.target.value) })}
          />
          <em>{elev}</em>
        </label>
        <p className="muted ember-map-inspector__hint">
          Пол клетки: Z{floorElev}
          {surfaceElev !== floorElev
            ? ` · верх стены: ${surfaceElev.toFixed(2)}`
            : ""}
        </p>
        <label className="ember-map-inspector__row">
          <span>Прямой свет</span>
          <input
            type="range"
            min={0.05}
            max={1.5}
            step={0.05}
            value={directLightScale}
            onChange={(e) =>
              onPatch({ directLightScale: Number(e.target.value) })
            }
          />
          <em>{directLightScale.toFixed(2)}</em>
        </label>
        <p className="muted ember-map-inspector__hint">
          Ослабление ловли ламп (по умолчанию{" "}
          {DEFAULT_VOXEL_DIRECT_LIGHT_SCALE.toFixed(2)}). Меньше — тусклее под
          фонарём, 1.0 — полная реакция.
        </p>
        <p className="muted ember-map-inspector__hint">
          На карте: G — перенос к курсору · R — поворот к курсору · клик —
          подтвердить · Esc — отмена
        </p>
      </section>
      ) : null}

      {showCoreComponents ? (
      <section className="ember-map-inspector__card">
        <p className="ember-map-inspector__section">Модификатор · Collider</p>
        <label className="ember-map-inspector__row ember-map-inspector__row--check">
          <span>Включён</span>
          <input
            type="checkbox"
            checked={effectiveCollider.enabled !== false}
            onChange={(e) =>
              onPatch({
                collider: { ...place.collider, enabled: e.target.checked },
              })
            }
          />
        </label>
        <label className="ember-map-inspector__row ember-map-inspector__row--check">
          <span>Trigger</span>
          <input
            type="checkbox"
            checked={effectiveCollider.isTrigger === true}
            onChange={(e) =>
              onPatch({
                collider: {
                  ...place.collider,
                  isTrigger: e.target.checked,
                  blocksMovement: e.target.checked ? false : undefined,
                },
              })
            }
          />
        </label>
        <label className="ember-map-inspector__row ember-map-inspector__row--check">
          <span>Проходимый верх</span>
          <input
            type="checkbox"
            checked={effectiveCollider.walkableTop !== false}
            onChange={(e) =>
              onPatch({
                collider: { ...place.collider, walkableTop: e.target.checked },
              })
            }
          />
        </label>
        <label className="ember-map-inspector__row">
          <span>Сдвиг Y (vx)</span>
          <input
            type="number"
            min={-128}
            max={128}
            step={1}
            value={effectiveCollider.offsetVoxels ?? 0}
            onChange={(e) =>
              onPatch({
                collider: {
                  ...place.collider,
                  offsetVoxels: Number(e.target.value),
                },
              })
            }
          />
        </label>
        <button
          type="button"
          className="ghost"
          disabled={!place.collider}
          onClick={() => onPatch({ collider: null })}
        >
          Сбросить модификатор экземпляра
        </button>
        <p className="muted ember-map-inspector__hint">
          Один Collider используется игрой и редактором. Настройки экземпляра
          перекрывают модель, как component overrides в Unity.
        </p>
      </section>
      ) : null}

      {showCoreComponents ? (
      <section className="ember-map-inspector__card">
        <p className="ember-map-inspector__section">Свет от emissive</p>
        {!modelHasEmit ? (
          <p className="muted ember-map-inspector__hint">
            В модели нет светящихся вокселей. Включи кисть «Свечение» в
            скульпторе и сохрани модель.
          </p>
        ) : (
          <>
            <label className="ember-map-inspector__row ember-map-inspector__row--check">
              <span>PointLight</span>
              <input
                type="checkbox"
                checked={effectiveCasts}
                onChange={(e) =>
                  onPatch({
                    emissiveCastsLight: e.target.checked,
                  })
                }
              />
            </label>
            <label className="ember-map-inspector__row">
              <span>Дальность</span>
              <input
                type="range"
                min={MIN_EMISSIVE_LIGHT_RANGE}
                max={MAX_EMISSIVE_LIGHT_RANGE}
                step={0.05}
                disabled={!effectiveCasts}
                value={effectiveRange}
                onChange={(e) =>
                  onPatch({
                    emissiveCastsLight: true,
                    emissiveLightRange: Number(e.target.value),
                  })
                }
              />
              <em>{effectiveRange.toFixed(2)}</em>
            </label>
            <label className="ember-map-inspector__row">
              <span>Сила</span>
              <input
                type="range"
                min={MIN_EMISSIVE_STRENGTH}
                max={MAX_EMISSIVE_STRENGTH}
                step={0.05}
                disabled={!effectiveCasts}
                value={effectiveStrength}
                onChange={(e) =>
                  onPatch({
                    emissiveCastsLight: true,
                    emissiveStrength: Number(e.target.value),
                  })
                }
              />
              <em>{effectiveStrength.toFixed(2)}</em>
            </label>
            <label
              className="ember-map-inspector__row ember-map-inspector__row--check"
              title="Cube-shadow от PointLight на рельеф и соседние воксели (не путать с «Рама без теней»)."
            >
              <span>Тени PointLight</span>
              <input
                type="checkbox"
                disabled={!effectiveCasts}
                checked={effectiveShadows}
                onChange={(e) =>
                  onPatch({
                    emissiveCastsLight: true,
                    emissiveLightShadows: e.target.checked,
                  })
                }
              />
            </label>
            <label
              className="ember-map-inspector__row ember-map-inspector__row--check"
              title="Рама/столб не кастуют тени (ни от лампы, ни от луны). Не отключает тени от самого PointLight."
            >
              <span>Рама без теней</span>
              <input
                type="checkbox"
                disabled={!effectiveCasts}
                checked={effectiveSuppressHost}
                onChange={(e) =>
                  onPatch({
                    emissiveCastsLight: true,
                    emissiveSuppressHostShadow: e.target.checked,
                  })
                }
              />
            </label>
            <label
              className="ember-map-inspector__row ember-map-inspector__row--check"
              title="Круги света дышат — то расширяются, то сжимаются (как у обычных фонарей)"
            >
              <span>Мерцание факела</span>
              <input
                type="checkbox"
                disabled={!effectiveCasts}
                checked={effectiveTorchFlicker}
                onChange={(e) =>
                  onPatch({
                    emissiveCastsLight: true,
                    emissiveTorchFlicker: e.target.checked,
                  })
                }
              />
            </label>
            <label
              className="ember-map-inspector__row ember-map-inspector__row--check"
              title="Короткие обрывы света — как ломающаяся лампочка. Можно вместе с мерцанием факела"
            >
              <span>Мерцание фонаря</span>
              <input
                type="checkbox"
                disabled={!effectiveCasts}
                checked={effectiveLanternFlicker}
                onChange={(e) =>
                  onPatch({
                    emissiveCastsLight: true,
                    emissiveLanternFlicker: e.target.checked,
                  })
                }
              />
            </label>
            <p className="muted ember-map-inspector__hint">
              Модель: PointLight {modelCasts ? "вкл" : "выкл"}
              {hasLightOverride ? " · override на пропе" : ""}
              {" · "}
              <button
                type="button"
                className="ghost"
                style={{ padding: "0 0.25rem", fontSize: "inherit" }}
                disabled={!hasLightOverride}
                onClick={clearLightOverrides}
              >
                как в модели
              </button>
              {onPatchModelLight ? (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="ghost"
                    style={{ padding: "0 0.25rem", fontSize: "inherit" }}
                    disabled={!effectiveCasts && !modelCasts}
                    onClick={writeLightToModel}
                    title="Записать текущие значения в модель и сбросить override"
                  >
                    в модель
                  </button>
                </>
              ) : null}
            </p>
            <p className="muted ember-map-inspector__hint">
              Источник — центр emissive (или точка в скульпторе). «Тени
              PointLight» = cube map (самотени рамы). «Рама без теней» =
              mesh.castShadow off. Оба мерцания можно вместе. По умолчанию
              дальность {DEFAULT_EMISSIVE_LIGHT_RANGE.toFixed(2)}.
            </p>
          </>
        )}
      </section>
      ) : null}

      <section className="ember-map-inspector__card">
        <p className="ember-map-inspector__section">Модель</p>
        <label className="ember-map-inspector__row ember-map-inspector__row--stack">
          <span>Из библиотеки</span>
          <select
            value={place.modelId}
            onChange={(e) => onPatch({ modelId: e.target.value })}
          >
            {models.length === 0 ? (
              <option value={place.modelId}>{place.modelId}</option>
            ) : (
              models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nameRu?.trim() || m.id}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="ember-map-inspector__row ember-map-inspector__row--stack">
          <span>Имя</span>
          <input
            type="text"
            value={model?.nameRu ?? ""}
            disabled={!model}
            onChange={(e) => onRenameModel(e.target.value)}
          />
        </label>
        {onSetModelTags ? (
          <EmberLibraryTagsField
            tags={model?.tags}
            disabled={!model}
            onCommit={onSetModelTags}
          />
        ) : null}
        <EmberLibraryUsageLine
          refs={findLibraryAssetReferences(pack, "voxel", place.modelId)}
          currentMapId={map.id}
          onFocus={onFocusLibraryReference}
        />
      </section>

    </div>
  );
}

function LibBody({
  payload,
  map,
  pack,
  tileset,
  libRegionDraft,
  onLibRegionDraftChange,
  onEditTile,
  onEditSprite,
  onCreateTile,
  onCloneTile,
  onOpenVoxelSculptLibrary,
  onOpenVoxelScene,
  onSetVoxelModelTags,
  onSetSpriteTags,
  onFocusLibraryReference,
}: {
  payload: MapLibPayload;
  map: EmberMap;
  pack: EmberPack;
  tileset: EmberTileset | undefined;
  libRegionDraft?: EmberMapRegion | null;
  onLibRegionDraftChange?: (region: EmberMapRegion) => void;
  onEditTile?: (tileId: number) => void;
  onEditSprite?: (spriteId: string) => void;
  onCreateTile?: () => void;
  onCloneTile?: (tileId: number) => void;
  onOpenVoxelSculptLibrary?: () => void;
  onOpenVoxelScene?: (sceneId: string) => void;
  onSetVoxelModelTags?: (
    modelId: string,
    tags: string[] | undefined,
  ) => void;
  onSetSpriteTags?: (spriteId: string, tags: string[] | undefined) => void;
  onFocusLibraryReference?: (ref: EmberAssetReference) => void;
}) {
  const placeHint =
    "Клик или перетаскивание на карту — поставить. Настройки ниже применятся при постановке (зоны) или сразу после.";

  switch (payload.kind) {
    case "tile": {
      const tile = tileset?.tiles.find((t) => t.id === payload.tileId);
      return (
        <div className="ember-map-inspector__body">
          <div className="ember-map-inspector__hero">
            <div className="ember-map-inspector__swatch" aria-hidden>
              <span style={{ background: tile?.color || "#5a4a40" }} />
            </div>
            <div className="ember-map-inspector__hero-text">
              <strong>{tile?.name || `#${payload.tileId}`}</strong>
              <span>
                #{payload.tileId}
                {tile?.material ? ` · ${tile.material}` : ""}
                {tile?.solid ? " · solid" : ""}
              </span>
            </div>
          </div>
          <p className="muted ember-map-inspector__hint ember-map-inspector__hint--box">
            {placeHint}
          </p>
          <div className="ember-map-inspector__actions">
            {onEditTile && tile ? (
              <button
                type="button"
                className="primary"
                onClick={() => onEditTile(payload.tileId)}
              >
                Редактировать тайл
              </button>
            ) : null}
            {onCloneTile && tile ? (
              <button
                type="button"
                className="ghost"
                onClick={() => onCloneTile(payload.tileId)}
              >
                Клонировать тайл
              </button>
            ) : null}
            {onCreateTile ? (
              <button type="button" className="ghost" onClick={onCreateTile}>
                Новый тайл
              </button>
            ) : null}
          </div>
        </div>
      );
    }
    case "sprite": {
      const def = pack.sprites[payload.spriteId];
      const spr = def ? normalizePixelSprite(def) : null;
      return (
        <div className="ember-map-inspector__body">
          <section className="ember-map-inspector__card">
            <dl className="ember-map-inspector__meta">
              <div>
                <dt>Имя</dt>
                <dd>{spr?.nameRu?.trim() || payload.spriteId}</dd>
              </div>
              <div>
                <dt>Id</dt>
                <dd>{payload.spriteId}</dd>
              </div>
              {spr ? (
                <div>
                  <dt>Размер</dt>
                  <dd>
                    {spr.width}×{spr.topHeight}
                    {spr.glow ? " · glow" : ""}
                  </dd>
                </div>
              ) : null}
            </dl>
            {onSetSpriteTags ? (
              <EmberLibraryTagsField
                tags={spr?.tags}
                disabled={!spr}
                onCommit={(tags) => onSetSpriteTags(payload.spriteId, tags)}
              />
            ) : null}
            <EmberLibraryUsageLine
              refs={findLibraryAssetReferences(pack, "sprite", payload.spriteId)}
              currentMapId={map.id}
              onFocus={onFocusLibraryReference}
            />
          </section>
          <p className="muted ember-map-inspector__hint ember-map-inspector__hint--box">
            {placeHint}
          </p>
          <div className="ember-map-inspector__actions">
            {onEditSprite ? (
              <button
                type="button"
                className="primary"
                onClick={() => onEditSprite(payload.spriteId)}
              >
                Редактировать спрайт
              </button>
            ) : null}
          </div>
        </div>
      );
    }
    case "voxel": {
      const model = pack.voxelModels?.[payload.modelId];
      const grid = model ? voxelGridSize(model) : null;
      return (
        <div className="ember-map-inspector__body">
          <section className="ember-map-inspector__card">
            <dl className="ember-map-inspector__meta">
              <div>
                <dt>Имя</dt>
                <dd>{model?.nameRu?.trim() || payload.modelId}</dd>
              </div>
              <div>
                <dt>Id</dt>
                <dd>{payload.modelId}</dd>
              </div>
              {grid ? (
                <div>
                  <dt>Сетка</dt>
                  <dd>
                    {grid.sx}×{grid.sy}×{grid.sz}
                  </dd>
                </div>
              ) : null}
            </dl>
            {onSetVoxelModelTags ? (
              <EmberLibraryTagsField
                tags={model?.tags}
                disabled={!model}
                onCommit={(tags) => onSetVoxelModelTags(payload.modelId, tags)}
              />
            ) : null}
            <EmberLibraryUsageLine
              refs={findLibraryAssetReferences(pack, "voxel", payload.modelId)}
              currentMapId={map.id}
              onFocus={onFocusLibraryReference}
            />
          </section>
          <p className="muted ember-map-inspector__hint ember-map-inspector__hint--box">
            {placeHint}
          </p>
          <div className="ember-map-inspector__actions">
            {onOpenVoxelSculptLibrary ? (
              <button
                type="button"
                className="primary"
                onClick={onOpenVoxelSculptLibrary}
              >
                Открыть в скульпторе
              </button>
            ) : null}
          </div>
        </div>
      );
    }
    case "light": {
      const custom = pack.lightPresets?.[payload.presetId];
      const isBuiltin = (
        BUILTIN_LIGHT_PRESET_IDS as readonly string[]
      ).includes(payload.presetId);
      return (
        <div className="ember-map-inspector__body">
          <section className="ember-map-inspector__card">
            <dl className="ember-map-inspector__meta">
              <div>
                <dt>Пресет</dt>
                <dd>
                  {custom?.nameRu ||
                    BUILTIN_LIGHT_LABEL[payload.presetId] ||
                    payload.presetId}
                </dd>
              </div>
              <div>
                <dt>Тип</dt>
                <dd>{isBuiltin ? "Встроенный" : "Свой пресет"}</dd>
              </div>
              {custom ? (
                <div>
                  <dt>Цвет</dt>
                  <dd>{custom.lampColor}</dd>
                </div>
              ) : null}
            </dl>
          </section>
          <p className="muted ember-map-inspector__hint ember-map-inspector__hint--box">
            Поставьте на карту — инспектор откроет полные параметры света (цвет,
            радиус, сила, мерцание).
          </p>
        </div>
      );
    }
    case "region": {
      const draft = libRegionDraft;
      return (
        <div className="ember-map-inspector__body">
          <p className="muted ember-map-inspector__hint ember-map-inspector__hint--box">
            Настройте компоненты зоны выше, затем кликните по карте. Параметры
            Volume, Trigger, Teleport, Spawn и Chest переносятся на новый объект.
          </p>
          {draft && draft.kind === payload.regionKind ? (
            <details className="ember-schema-advanced">
              <summary>Связи и расширенные параметры зоны</summary>
              <MapRegionEditor
                region={draft}
                map={map}
                pack={pack}
                compact
                hideDelete
                onChange={(next) => onLibRegionDraftChange?.(next)}
                onDelete={() => undefined}
                onOpenVoxelScene={onOpenVoxelScene}
              />
            </details>
          ) : (
            <p className="muted ember-map-inspector__empty">
              Черновик зоны не готов — выберите зону в библиотеке ещё раз.
            </p>
          )}
        </div>
      );
    }
    default: {
      const _n: never = payload;
      return _n;
    }
  }
}

function TileBody({
  tx,
  ty,
  elev: elevProp,
  map,
  pack,
  tileset,
  onPatch,
  onEditTile,
  onCreateTile,
  onSelectVoxel,
  onEditVoxels,
  onCommitRegion,
  onDeleteRegion,
  onFocusRegion,
  onPairTeleport,
  onHoverRegionPeer,
  onOpenVoxelScene,
}: {
  tx: number;
  ty: number;
  elev?: number;
  map: EmberMap;
  pack: EmberPack;
  tileset: EmberTileset | undefined;
  onPatch: (patch: {
    heightVoxels?: number;
    elevation?: number;
    sourceElevation?: number;
  }) => void;
  onEditTile?: () => void;
  onCreateTile?: () => void;
  onSelectVoxel?: (placementId: string) => void;
  onEditVoxels?: (placementId: string) => void;
  onCommitRegion: (prevId: string, region: EmberMapRegion) => void;
  onDeleteRegion: (id: string) => void;
  onFocusRegion?: (id: string) => void;
  onPairTeleport?: (fromId: string, toId: string) => void;
  onHoverRegionPeer?: (id: string | null) => void;
  onOpenVoxelScene?: (sceneId: string) => void;
}) {
  const elev = elevProp ?? elevationAt(map, tx, ty);
  const tileId =
    elevTileIdAt(map, tx, ty, elev) ||
    (map.layers.find((l) => l.name === "ground")?.data[ty * map.width + tx] ??
      0);
  const tile = tileset?.tiles.find((t) => t.id === tileId);
  const voxH = heightVoxelsAt(map, tx, ty);
  const maxVox = map.tileSize * 3;
  const surfaceElev = elevationAt(map, tx, ty);
  const wallTopElev = surfaceElev + voxH / Math.max(1, map.tileSize);
  const voxelOnCell = (map.voxelProps ?? []).find(
    (p) => p.x === tx && p.y === ty,
  );
  const voxelModel = voxelOnCell
    ? pack.voxelModels?.[voxelOnCell.modelId]
    : undefined;
  const zones = regionsAtTile(map, tx, ty);

  return (
    <div className="ember-map-inspector__body">
      <div className="ember-map-inspector__hero">
        <div className="ember-map-inspector__swatch" aria-hidden>
          <span
            style={{
              background: tile?.color || "#5a4a40",
            }}
          />
        </div>
        <div className="ember-map-inspector__hero-text">
          <strong>{tile?.name || `#${tileId}`}</strong>
          <span>
            {tx}, {ty}
            <span className="muted"> · Z{elev}</span>
            {tile?.material ? ` · ${tile.material}` : ""}
            <span className="muted"> · #{tileId}</span>
          </span>
        </div>
      </div>

      {zones.length > 0 ? (
        <section className="ember-map-inspector__card ember-map-inspector__card--accent">
          <p className="ember-map-inspector__section">
            Зоны на клетке · {zones.length}
          </p>
          <div className="ember-map-inspector__zones">
            {zones.map((r) => (
              <MapRegionEditor
                key={r.id}
                region={r}
                map={map}
                pack={pack}
                compact
                onChange={(next) => onCommitRegion(r.id, next)}
                onDelete={() => onDeleteRegion(r.id)}
                onFocus={() => onFocusRegion?.(r.id)}
                onPairLink={onPairTeleport}
                onHoverPeer={onHoverRegionPeer}
                onOpenVoxelScene={onOpenVoxelScene}
              />
            ))}
          </div>
        </section>
      ) : (
        <p className="muted ember-map-inspector__hint ember-map-inspector__hint--box">
          На клетке нет зон. Сундук, ТП, спавн и триггеры ставятся из библиотеки
          или вкладки «Регионы».
        </p>
      )}

      {voxelOnCell ? (
        <section className="ember-map-inspector__card ember-map-inspector__card--accent">
          <p className="ember-map-inspector__section">Воксель на клетке</p>
          <p className="ember-map-inspector__card-lead">
            {voxelModel?.nameRu?.trim() || voxelOnCell.modelId}
          </p>
          <div className="ember-map-inspector__actions ember-map-inspector__actions--inline">
            <button
              type="button"
              className="primary"
              title="Открыть общую модель в библиотеке"
              onClick={() => onEditVoxels?.(voxelOnCell.id)}
            >
              Редактировать воксели
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => onSelectVoxel?.(voxelOnCell.id)}
            >
              Открыть объект
            </button>
          </div>
        </section>
      ) : (
        <p className="muted ember-map-inspector__hint ember-map-inspector__hint--box">
          Это тайл рельефа (высота стены), не воксель-блок. Поставьте модель из
          библиотеки «Воксели», чтобы редактировать кубики.
        </p>
      )}

      <section className="ember-map-inspector__card ember-terrain-component">
        <p className="ember-map-inspector__section">Рельеф клетки</p>
        <div className="ember-terrain-component__levels">
          <span><small>Блок</small><strong>Z{elev}</strong></span>
          <span><small>Поверхность</small><strong>Z{surfaceElev}</strong></span>
          <span><small>Верх стены</small><strong>Z{wallTopElev.toFixed(2).replace(/\.00$/, "")}</strong></span>
        </div>
        <label className="ember-map-inspector__row">
          <span>Высота стены (vx)</span>
          <input
            type="range"
            min={0}
            max={maxVox}
            step={1}
            value={voxH}
            onChange={(e) => onPatch({ heightVoxels: Number(e.target.value) })}
          />
          <em>{voxH}</em>
        </label>
        <label className="ember-map-inspector__row">
          <span>Z выбранного блока</span>
          <input
            type="range"
            min={MIN_ELEVATION}
            max={MAX_ELEVATION}
            step={1}
            value={elev}
            onChange={(e) =>
              onPatch({
                elevation: Number(e.target.value),
                sourceElevation: elev,
              })
            }
          />
          <em>{elev}</em>
        </label>
        <p className="muted ember-map-inspector__hint">
          Стена начинается над верхним блоком клетки. Её высота хранится в
          вокселях: {map.tileSize} vx = один полный блок.
        </p>
      </section>

      <div className="ember-map-inspector__actions">
        {onEditTile && tileId > 0 ? (
          <button type="button" className="primary" onClick={onEditTile}>
            Редактировать тайл
          </button>
        ) : null}
        {onCreateTile ? (
          <button type="button" className="ghost" onClick={onCreateTile}>
            Новый тайл
          </button>
        ) : null}
      </div>
    </div>
  );
}

function GroupBody({
  group,
  onTranslate,
  onRotate,
  onScale,
  onSelectMembers,
  groups,
}: {
  group: EmberSceneGroup;
  onTranslate?: (id: string, dx: number, dy: number) => void;
  onRotate?: (id: string, quarterTurns: number) => void;
  onScale?: (id: string, scale: { x: number; y: number; z: number }) => void;
  onSelectMembers?: (id: string) => void;
  groups: readonly EmberSceneGroup[];
}) {
  const parentLocal = group.parentGroupId
    ? groups.find((candidate) => candidate.id === group.parentGroupId)
        ?.localTransforms?.[`group:${group.id}`]
    : undefined;
  const commitPivot = (axis: "x" | "y", raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    const delta = Math.round(value - group.pivot[axis]);
    if (delta) onTranslate?.(group.id, axis === "x" ? delta : 0, axis === "y" ? delta : 0);
  };
  const commitScale = (axis: "x" | "y" | "z", raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0 || value === 1) return;
    onScale?.(group.id, {
      x: axis === "x" ? value : 1,
      y: axis === "y" ? value : 1,
      z: axis === "z" ? value : 1,
    });
  };
  return (
    <div className="ember-map-inspector__body">
      <section className="ember-map-inspector__card">
        <p className="ember-map-inspector__section">Transform · World</p>
        <label className="ember-map-inspector__row">
          <span>X</span>
          <input key={`x-${group.pivot.x}`} type="number" step="1" defaultValue={group.pivot.x} onBlur={(event) => commitPivot("x", event.target.value)} />
        </label>
        <label className="ember-map-inspector__row">
          <span>Y</span>
          <input key={`y-${group.pivot.y}`} type="number" step="1" defaultValue={group.pivot.y} onBlur={(event) => commitPivot("y", event.target.value)} />
        </label>
        {(["x", "y", "z"] as const).map((axis) => (
          <label className="ember-map-inspector__row" key={`scale-${axis}`}>
            <span>Scale {axis.toUpperCase()}</span>
            <input
              type="number"
              min="0.125"
              max="8"
              step="0.125"
              defaultValue="1"
              onBlur={(event) => {
                commitScale(axis, event.target.value);
                event.currentTarget.value = "1";
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          </label>
        ))}
        <label className="ember-map-inspector__row">
          <span>Rotation</span>
          <input
            key={`r-${group.rotationQuarterTurns ?? 0}`}
            type="number"
            step="90"
            defaultValue={(group.rotationQuarterTurns ?? 0) * 90}
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (!Number.isFinite(value)) return;
              const target = Math.round(value / 90);
              const current = group.rotationQuarterTurns ?? 0;
              const delta = ((target - current) % 4 + 4) % 4;
              if (delta) onRotate?.(group.id, delta);
            }}
          />
        </label>
        <div className="ember-map-inspector__pad" role="group" aria-label="Сдвиг группы">
          <span />
          <button type="button" aria-label="Группу вверх" onClick={() => onTranslate?.(group.id, 0, -1)}>↑</button>
          <span />
          <button type="button" aria-label="Группу влево" onClick={() => onTranslate?.(group.id, -1, 0)}>←</button>
          <button type="button" aria-label="Группу вниз" onClick={() => onTranslate?.(group.id, 0, 1)}>↓</button>
          <button type="button" aria-label="Группу вправо" onClick={() => onTranslate?.(group.id, 1, 0)}>→</button>
        </div>
        <div className="ember-map-inspector__rot" role="group" aria-label="Поворот группы">
          <button type="button" onClick={() => onRotate?.(group.id, -1)}>↶ −90°</button>
          <strong>Pivot</strong>
          <button type="button" onClick={() => onRotate?.(group.id, 1)}>↷ +90°</button>
        </div>
        <p className="muted ember-map-inspector__hint">
          Transform применяется рекурсивно ко всем дочерним группам и объектам одним шагом Undo.
        </p>
      </section>

      {parentLocal ? (
        <section className="ember-map-inspector__card">
          <p className="ember-map-inspector__section">Transform · Local to Parent</p>
          <dl className="ember-map-inspector__meta">
            <div><dt>Position</dt><dd>{parentLocal.position.x.toFixed(2)}, {parentLocal.position.y.toFixed(2)}, Z{parentLocal.position.z.toFixed(2)}</dd></div>
            <div><dt>Rotation</dt><dd>{parentLocal.rotationQuarterTurns * 90}°</dd></div>
          </dl>
        </section>
      ) : null}

      <details className="ember-schema-advanced">
        <summary>Local children · {Object.keys(group.localTransforms ?? {}).length}</summary>
        <div className="ember-map-inspector__card">
          {Object.entries(group.localTransforms ?? {}).map(([key, transform]) => (
            <dl className="ember-map-inspector__meta" key={key}>
              <div><dt>{key}</dt><dd>{transform.position.x.toFixed(2)}, {transform.position.y.toFixed(2)}, Z{transform.position.z.toFixed(2)} · {transform.rotationQuarterTurns * 90}°</dd></div>
            </dl>
          ))}
          {Object.keys(group.localTransforms ?? {}).length === 0 ? (
            <p className="muted ember-map-inspector__hint">Нет прямых дочерних Transform.</p>
          ) : null}
        </div>
      </details>

      <div className="ember-map-inspector__actions">
        <button type="button" className="primary" onClick={() => onSelectMembers?.(group.id)}>Выбрать потомков</button>
      </div>
    </div>
  );
}

export function MapObjectInspector(props: MapObjectInspectorProps) {
  const { selection, map, pack, tileset, globalLight, lanternSources } = props;
  const multiTransformObjects = (props.multiWorldObjects ?? []).filter(
    (object) => object.kind === "voxel" || object.kind === "sprite",
  );
  const multiElevation = (() => {
    const first = multiTransformObjects[0]?.transform.resolvedZ;
    if (first == null) return null;
    return multiTransformObjects.every(
      (object) => Math.abs(object.transform.resolvedZ - first) < 0.001,
    )
      ? first
      : null;
  })();
  const worldObject =
    props.worldObject ??
    (() => {
      const ref = mapSelectionToWorldObjectRef(selection);
      return ref ? getEmberWorldObject(map, ref, { pack, tileset }) : null;
    })();
  const selectedLantern =
    selection.kind === "light"
      ? (lanternSources.find((s) => s.id === selection.id) ?? null)
      : null;
  const spritePlace =
    selection.kind === "sprite" && worldObject?.source.kind === "sprite"
      ? worldObject.source.value
      : null;
  const voxelPlace =
    selection.kind === "voxel" && worldObject?.source.kind === "voxel"
      ? worldObject.source.value
      : null;
  const regionPlace =
    selection.kind === "region" && worldObject?.source.kind === "region"
      ? worldObject.source.value
      : null;
  const selectedGroup = selection.kind === "group" ? props.sceneGroup ?? null : null;
  const libraryWorldObject =
    selection.kind === "lib"
      ? (() => {
          const payload = selection.payload;
          if (payload.kind === "voxel") {
            const model = pack.voxelModels?.[payload.modelId];
            return model ? getEmberVoxelAssetWorldObject(model) : null;
          }
          if (payload.kind === "sprite") {
            const sprite = pack.sprites?.[payload.spriteId];
            return sprite
              ? getEmberSpriteAssetWorldObject(normalizePixelSprite(sprite))
              : null;
          }
          if (payload.kind === "tile") {
            const tile = tileset?.tiles.find((item) => item.id === payload.tileId);
            return tile
              ? getEmberTileAssetWorldObject(tile, tileset?.tileSize ?? map.tileSize)
              : null;
          }
          if (payload.kind === "region") {
            return props.libRegionDraft &&
              props.libRegionDraft.kind === payload.regionKind
              ? getEmberRegionDraftWorldObject(map, props.libRegionDraft)
              : null;
          }
          const custom = pack.lightPresets?.[payload.presetId];
          if (custom) return getEmberLightAssetWorldObject(custom);
          const base = normalizeLampParams(globalLight);
          const overrides =
            payload.presetId === "warm"
              ? { lampColor: "#ff9a40", lampFaceColor: "#ff7040" }
              : payload.presetId === "cool"
                ? { lampColor: "#80a8ff", lampFaceColor: "#6080e0" }
                : payload.presetId === "bright"
                  ? {
                      lampRange: 6,
                      lampDiscCore: 2,
                      lampDiscMid: 4,
                      lampStrength0: 1,
                      lampStrengthFalloff: 0.5,
                    }
                  : payload.presetId === "dim"
                    ? {
                        lampRange: 2,
                        lampDiscCore: 1,
                        lampDiscMid: 2,
                        lampStrength0: 0.4,
                        lampStrengthFalloff: 0.4,
                      }
                    : {};
          return getEmberLightAssetWorldObject({
            id: payload.presetId,
            nameRu:
              BUILTIN_LIGHT_LABEL[payload.presetId] || payload.presetId,
            ...normalizeLampParams({ ...base, ...overrides }),
          });
        })()
      : null;
  const libraryObjectEditable =
    selection.kind === "lib" &&
    !(
      selection.payload.kind === "light" &&
      (BUILTIN_LIGHT_PRESET_IDS as readonly string[]).includes(
        selection.payload.presetId,
      )
    );
  const objectParentGroup = worldObject
    ? (props.sceneGroups ?? []).find((group) => group.objectKeys.includes(worldObject.key))
    : null;
  const headerName =
    selectedGroup?.name ??
    worldObject?.name ??
    titleFor(selection, pack, tileset);
  const headerDescription =
    selection.kind === "lib"
      ? "Ассет библиотеки · изменения влияют на его экземпляры"
      : selection.kind === "group"
        ? `${selection.id} · прямых объектов: ${selectedGroup?.objectKeys.length ?? 0}`
        : worldObject
          ? worldObject.key
          : selection.kind === "globalLight"
            ? map.id
            : undefined;
  const headerIcon =
    selection.kind === "voxel" ||
    (selection.kind === "lib" && selection.payload.kind === "voxel")
      ? "▦"
      : selection.kind === "sprite" ||
          (selection.kind === "lib" && selection.payload.kind === "sprite")
        ? "▧"
        : selection.kind === "light" ||
            selection.kind === "globalLight" ||
            (selection.kind === "lib" && selection.payload.kind === "light")
          ? "✦"
          : selection.kind === "region" ||
              (selection.kind === "lib" && selection.payload.kind === "region")
            ? "◇"
            : selection.kind === "group"
              ? "▣"
              : "▤";
  const headerSourceLabel =
    selection.kind === "lib"
      ? "ASSET"
      : selection.kind === "group"
        ? "SCENE NODE"
        : selection.kind === "globalLight"
          ? "MAP"
          : "INSTANCE";
  const headerSourceDetail = (() => {
    if (worldObject?.source.kind === "voxel") return worldObject.source.value.modelId;
    if (worldObject?.source.kind === "sprite") return worldObject.source.value.spriteId;
    if (worldObject?.source.kind === "light") return `Map light · ${worldObject.id}`;
    if (worldObject?.source.kind === "region") return `${worldObject.source.value.kind} · ${worldObject.id}`;
    if (worldObject?.source.kind === "tile") return `${map.tilesetId} · Tile #${worldObject.source.value.tileId}`;
    if (selection.kind === "group") return `Group · ${selection.id}`;
    if (selection.kind === "globalLight") return `Map · ${map.id}`;
    if (selection.kind === "lib") {
      if (selection.payload.kind === "voxel") return selection.payload.modelId;
      if (selection.payload.kind === "sprite") return selection.payload.spriteId;
      if (selection.payload.kind === "tile") return `${map.tilesetId} · Tile #${selection.payload.tileId}`;
      if (selection.payload.kind === "light") return selection.payload.presetId;
      return selection.payload.regionKind;
    }
    return undefined;
  })();
  const openHeaderSource = (() => {
    if (selection.kind === "voxel") {
      return () => props.onOpenVoxelSculpt(selection.id);
    }
    if (selection.kind === "sprite" && props.onEditSprite && spritePlace) {
      return () => props.onEditSprite?.(spritePlace.spriteId);
    }
    if (selection.kind === "lib") {
      if (selection.payload.kind === "voxel" && props.onOpenVoxelSculptLibrary) {
        return props.onOpenVoxelSculptLibrary;
      }
      if (selection.payload.kind === "sprite" && props.onEditSprite) {
        const spriteId = selection.payload.spriteId;
        return () => props.onEditSprite?.(spriteId);
      }
      if (selection.payload.kind === "tile" && props.onEditTile) {
        const tileId = selection.payload.tileId;
        return () => props.onEditTile?.(tileId);
      }
    }
    return undefined;
  })();
  const duplicateFromHeader = (() => {
    if (selection.kind === "group" && props.onDuplicateGroup) {
      return () => props.onDuplicateGroup?.(selection.id);
    }
    if (
      selection.kind === "voxel" ||
      selection.kind === "sprite" ||
      selection.kind === "light" ||
      selection.kind === "region"
    ) {
      if (props.onDuplicateSelection) return props.onDuplicateSelection;
      if (selection.kind === "voxel") {
        return () => props.onDuplicateVoxel(selection.id);
      }
      return undefined;
    }
    return undefined;
  })();
  const deleteFromHeader = (() => {
    if (props.locked) return undefined;
    if (
      selection.kind === "voxel" ||
      selection.kind === "sprite" ||
      selection.kind === "light" ||
      selection.kind === "region" ||
      selection.kind === "tile"
    ) {
      if (props.onDeleteSelection) return props.onDeleteSelection;
    }
    if (selection.kind === "voxel") return () => props.onDeleteVoxel(selection.id);
    if (selection.kind === "sprite") return () => props.onDeleteSprite(selection.id);
    if (selection.kind === "light") return () => props.onDeleteSource(selection.id);
    if (selection.kind === "region") return () => props.onDeleteRegion(selection.id);
    if (selection.kind === "group" && props.onRemoveGroup) {
      return () => props.onRemoveGroup?.(selection.id);
    }
    return undefined;
  })();
  const selectedLightEditor = selectedLantern ? (
    <LightSourceEditor
      selected={selectedLantern}
      globalLight={globalLight}
      pack={pack}
      mapWidth={map.width}
      mapHeight={map.height}
      onCommitSource={props.onCommitSource}
      onBeginSourceEdit={props.onBeginSourceEdit}
      onDeleteSource={props.onDeleteSource}
      onClearSourceOverrides={props.onClearSourceOverrides}
      onMoveSource={props.onMoveSource}
      onBeginSourceGrabMove={props.onBeginSourceGrabMove}
      onPackChange={props.onPackChange}
      onSaved={props.onSaved}
      onClose={props.onClose}
    />
  ) : null;
  const selectedRegionEditor = regionPlace ? (
    <div className="ember-map-inspector__body">
      <MapRegionEditor
        region={regionPlace}
        map={map}
        pack={pack}
        onChange={(next) => props.onCommitRegion(regionPlace.id, next)}
        onDelete={() => props.onDeleteRegion(regionPlace.id)}
        onFocus={() => props.onFocusRegion?.(regionPlace.id)}
        onPairLink={props.onPairTeleport}
        onHoverPeer={props.onHoverRegionPeer}
        onOpenVoxelScene={props.onOpenVoxelScene}
      />
    </div>
  ) : null;

  return (
    <aside
      className="ember-map-inspector"
      aria-label="Настройки объекта"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {(props.selectionItems?.length ?? 0) > 1 ? (
        <section
          className="ember-map-inspector__multi"
          aria-label="Мультивыделение"
        >
          <div className="ember-map-inspector__multi-head">
            <strong>Выбрано: {props.selectionItems?.length}</strong>
            <button
              type="button"
              className="ghost"
              onClick={props.onClearSelection}
            >
              Снять всё
            </button>
          </div>
          <div className="ember-map-inspector__multi-list">
            {props.selectionItems?.map((item) => {
              const active = mapSelectionEqualsForInspector(
                item,
                selection,
              );
              return (
                <div
                  className={`ember-map-inspector__multi-item ${active ? "is-primary" : ""}`}
                  key={compactSelectionKey(item)}
                >
                  <button
                    type="button"
                    title="Сделать основным объектом Inspector"
                    onClick={() => props.onSetSelectionPrimary?.(item)}
                  >
                    {compactSelectionLabel(item)}
                  </button>
                  <button
                    type="button"
                    className="ember-map-inspector__multi-remove"
                    aria-label={`Убрать из выбора: ${compactSelectionLabel(item)}`}
                    onClick={() => props.onToggleSelection?.(item)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
          <small>
            Inspector редактирует основной объект, gizmo — совместимые объекты
            набора.
          </small>
          <div className="ember-map-inspector__multi-tools">
            <label title="Установить одинаковый authored Z вокселям и спрайтам">
              <span>Z</span>
              <input
                key={`multi-z-${multiElevation ?? "mixed"}`}
                type="number"
                min="0"
                max="8"
                step="0.25"
                defaultValue={multiElevation ?? ""}
                placeholder="mixed"
                disabled={multiTransformObjects.length === 0}
                onBlur={(event) => {
                  const value = Number(event.currentTarget.value);
                  if (Number.isFinite(value) && event.currentTarget.value.trim()) {
                    props.onSetMultiElevation?.(value);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </label>
            <button
              type="button"
              disabled={multiTransformObjects.length === 0}
              onClick={props.onDropMultiToFloor}
            >
              Drop to Floor
            </button>
            <button
              type="button"
              disabled={(props.multiWorldObjects?.length ?? 0) === 0}
              onClick={() => props.onSetMultiLocked?.(!props.multiAllLocked)}
            >
              {props.multiAllLocked ? "Unlock All" : "Lock All"}
            </button>
            <button
              type="button"
              disabled={(props.multiWorldObjects?.length ?? 0) === 0}
              onClick={() => props.onSetMultiHidden?.(!props.multiAllHidden)}
            >
              {props.multiAllHidden ? "Show All" : "Hide All"}
            </button>
            <button
              type="button"
              disabled={(props.multiWorldObjects?.length ?? 0) === 0}
              onClick={props.onDuplicateMulti}
            >
              Дублировать
            </button>
            <button
              type="button"
              className="is-danger"
              disabled={(props.multiWorldObjects?.length ?? 0) === 0}
              onClick={props.onDeleteMulti}
            >
              Удалить
            </button>
          </div>
        </section>
      ) : null}
      <InspectorObjectHeader
        kindLabel={kindEyebrow(selection)}
        name={headerName}
        description={headerDescription}
        sourceLabel={headerSourceLabel}
        sourceDetail={headerSourceDetail}
        icon={headerIcon}
        locked={props.locked}
        hidden={props.hidden}
        parentGroupId={selectedGroup?.parentGroupId ?? objectParentGroup?.id}
        parentGroups={
          selectedGroup
            ? (props.sceneGroups ?? []).filter((group) => group.id !== selectedGroup.id)
            : props.sceneGroups
        }
        onRename={
          selectedGroup && props.onRenameGroup
            ? (name) => props.onRenameGroup?.(selectedGroup.id, name)
            : undefined
        }
        onToggleLocked={worldObject && worldObject.kind !== "tile" ? props.onToggleLocked : undefined}
        onToggleHidden={worldObject && worldObject.kind !== "tile" ? props.onToggleHidden : undefined}
        onSetParent={
          selectedGroup && props.onSetGroupParent
            ? (parentGroupId) => props.onSetGroupParent?.(selectedGroup.id, parentGroupId)
            : worldObject && worldObject.kind !== "tile" && props.onSetWorldObjectParent
              ? (parentGroupId) => props.onSetWorldObjectParent?.(worldObject.key, parentGroupId)
              : undefined
        }
        onOpenSource={openHeaderSource}
        onDuplicate={duplicateFromHeader}
        onDelete={deleteFromHeader}
        onClose={props.onClose}
      />

      <fieldset
        className="ember-map-inspector__scroll ember-map-inspector__fieldset"
        disabled={props.locked}
      >
        {props.locked ? (
          <div className="ember-map-inspector__locked" role="status">
            <strong>Объект заблокирован</strong>
            <span>Разблокируй его в Outliner, чтобы менять параметры.</span>
          </div>
        ) : null}
        {worldObject && props.onWorldObjectFieldEdit ? (
          <WorldObjectSchemaInspector
            object={worldObject}
            onEdit={props.onWorldObjectFieldEdit}
            localTransform={objectParentGroup?.localTransforms?.[worldObject.key]}
            parentName={objectParentGroup?.name}
            onTransformPatch={props.onWorldObjectTransformPatch}
            onApplyComponentToAsset={
              props.onApplyWorldObjectComponentToAsset
            }
            onRevertComponentOverrides={
              props.onRevertWorldObjectComponentOverrides
            }
            onAddComponent={props.onAddWorldObjectComponent}
            onRemoveComponent={props.onRemoveWorldObjectComponent}
            shopOptions={Object.values(props.pack.shops ?? {}).map((shop) => ({
              value: shop.id,
              label: `${shop.nameRu} (${shop.id})`,
            }))}
            scriptOptions={listAssignableScriptOptions(
              props.pack.scenes,
              props.pack.scripts,
            )}
          />
        ) : null}

        {libraryWorldObject && props.onLibraryObjectFieldEdit ? (
          <WorldObjectSchemaInspector
            object={libraryWorldObject}
            onEdit={props.onLibraryObjectFieldEdit}
            showTransform={false}
            assetMode
            editable={libraryObjectEditable}
            onAddComponent={props.onAddLibraryObjectComponent}
            onRemoveComponent={props.onRemoveLibraryObjectComponent}
          />
        ) : null}

        {selection.kind === "group" && props.sceneGroup ? (
          <GroupBody
            group={props.sceneGroup}
            onTranslate={props.onTranslateGroup}
            onRotate={props.onRotateGroup}
            onScale={props.onScaleGroup}
            onSelectMembers={props.onSelectGroupMembers}
            groups={props.sceneGroups ?? []}
          />
        ) : null}

        {selection.kind === "globalLight" ? (
          <MapSettingsPanel
            globalLight={globalLight}
            pack={pack}
            onPackChange={props.onPackChange}
            onSaved={props.onSaved}
            playProfile={map.playProfile}
            onCommitPlayProfile={props.onCommitPlayProfile}
            onCommitGlobal={props.onCommitGlobal}
            onResetGlobal={props.onResetGlobal}
          />
        ) : null}

        {selection.kind === "light" && selectedLantern ? (
          worldObject ? (
            <details className="ember-schema-advanced">
              <summary>Расширенные настройки света</summary>
              {selectedLightEditor}
            </details>
          ) : selectedLightEditor
        ) : null}

        {selection.kind === "voxel" && voxelPlace ? (
          <VoxelBody
            place={voxelPlace}
            pack={pack}
            map={map}
            onPatch={(patch) =>
              props.onPatchVoxelPlacement(voxelPlace.id, patch)
            }
            onPatchModelLight={
              props.onPatchVoxelModelLight
                ? (patch) =>
                    props.onPatchVoxelModelLight?.(voxelPlace.modelId, patch)
                : undefined
            }
            onRenameModel={(nameRu) =>
              props.onRenameVoxelModel(voxelPlace.modelId, nameRu)
            }
            onSetModelTags={
              props.onSetVoxelModelTags
                ? (tags) =>
                    props.onSetVoxelModelTags?.(voxelPlace.modelId, tags)
                : undefined
            }
            onFocusLibraryReference={props.onFocusLibraryReference}
            onEditVoxels={() => props.onOpenVoxelSculpt(voxelPlace.id)}
            onCreateVariant={
              props.onOpenVoxelSculptVariant
                ? () => props.onOpenVoxelSculptVariant?.(voxelPlace.id)
                : undefined
            }
            showCoreComponents={!worldObject}
          />
        ) : null}

        {selection.kind === "tile" ? (
          <details className="ember-schema-advanced">
            <summary>Рельеф и содержимое клетки</summary>
            <TileBody
              tx={selection.tx}
              ty={selection.ty}
              elev={selection.elev}
              map={map}
              pack={pack}
              tileset={tileset}
              onPatch={(patch) =>
                props.onPatchTile(selection.tx, selection.ty, patch)
              }
              onEditTile={
                props.onEditTile
                  ? () => {
                      const story =
                        selection.elev ??
                        elevationAt(map, selection.tx, selection.ty);
                      const id =
                        elevTileIdAt(map, selection.tx, selection.ty, story) ||
                        (map.layers.find((l) => l.name === "ground")?.data[
                          selection.ty * map.width + selection.tx
                        ] ?? 0);
                      if (id > 0) props.onEditTile?.(id);
                    }
                  : undefined
              }
              onCreateTile={props.onCreateTile}
              onSelectVoxel={props.onSelectVoxel}
              onEditVoxels={props.onOpenVoxelSculpt}
              onCommitRegion={props.onCommitRegion}
              onDeleteRegion={props.onDeleteRegion}
              onFocusRegion={props.onFocusRegion}
              onPairTeleport={props.onPairTeleport}
              onHoverRegionPeer={props.onHoverRegionPeer}
              onOpenVoxelScene={props.onOpenVoxelScene}
            />
          </details>
        ) : null}

        {selection.kind === "region" && regionPlace ? (
          selectedRegionEditor
        ) : null}

        {selection.kind === "lib" ? (
          <LibBody
            payload={selection.payload}
            map={map}
            pack={pack}
            tileset={tileset}
            libRegionDraft={props.libRegionDraft}
            onLibRegionDraftChange={props.onLibRegionDraftChange}
            onEditTile={props.onEditTile}
            onEditSprite={props.onEditSprite}
            onCreateTile={props.onCreateTile}
            onCloneTile={props.onCloneTile}
            onOpenVoxelSculptLibrary={props.onOpenVoxelSculptLibrary}
            onOpenVoxelScene={props.onOpenVoxelScene}
            onSetVoxelModelTags={props.onSetVoxelModelTags}
            onSetSpriteTags={props.onSetSpriteTags}
            onFocusLibraryReference={props.onFocusLibraryReference}
          />
        ) : null}

        {selection.kind === "light" && !selectedLantern ? (
          <p className="muted ember-map-inspector__empty">
            Источник больше не на карте.
          </p>
        ) : null}
        {selection.kind === "sprite" && !spritePlace ? (
          <p className="muted ember-map-inspector__empty">
            Спрайт больше не на карте.
          </p>
        ) : null}
        {selection.kind === "voxel" && !voxelPlace ? (
          <p className="muted ember-map-inspector__empty">
            Воксель больше не на карте.
          </p>
        ) : null}
        {selection.kind === "region" && !regionPlace ? (
          <p className="muted ember-map-inspector__empty">
            Зона больше не на карте.
          </p>
        ) : null}
        {selection.kind === "group" && !props.sceneGroup ? (
          <p className="muted ember-map-inspector__empty">Группа больше не существует.</p>
        ) : null}
      </fieldset>
    </aside>
  );
}
