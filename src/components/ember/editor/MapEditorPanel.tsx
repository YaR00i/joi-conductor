import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  applyEmberInspectorFieldEdit,
  applyEmberLightAssetInspectorFieldEdit,
  applyEmberSpriteAssetInspectorFieldEdit,
  applyEmberTileAssetInspectorFieldEdit,
  applyEmberVoxelAssetInspectorFieldEdit,
  applyVoxelInstanceComponentToAsset,
  assignEmberSceneObjectsToGroup,
  clearEmberWorldObjectComponentOverrides,
  createEmberSceneGroup,
  duplicateEmberSceneGroup,
  EditorCore,
  DEFAULT_EDITOR_SELECTION_FILTER,
  EDITOR_VIEWPORT_SELECTION_KINDS,
  advanceEditorPickCycle,
  filterEditorSelectionStack,
  includeRegionInViewportPick,
  collectPlanarMarqueeHits,
  normalizePlanarMarqueeRect,
  normalizeEditorSelectionFilter,
  EditorSceneState,
  emberWorldObjectRefKey,
  emberSceneGroupObjectKeys,
  getEmberWorldObject,
  getEmberInspectorComponentSchema,
  listEmberWorldObjects,
  mapWithoutHiddenWorldObjects,
  normalizeEmberSceneHierarchy,
  patchEmberWorldObjectLocalTransform,
  patchEmberWorldObjectTransform,
  removeEmberWorldObject,
  removeEmberWorldObjects,
  removeEmberSceneGroup,
  renameEmberSceneGroup,
  rotateEmberWorldObjectsAroundPivot,
  rotateEmberSceneGroupTransforms,
  scaleEmberSceneGroupTransforms,
  scaleEmberWorldObjectsAroundPivot,
  setEmberSceneGroupParent,
  setEmberWorldObjectsElevation,
  setEmberSpriteAssetComponentPresence,
  setEmberTileAssetComponentPresence,
  setEmberVoxelAssetComponentPresence,
  setEmberWorldObjectComponentPresence,
  translateEmberWorldObjects,
  translateEmberSceneGroupTransforms,
  type EditorDocumentChangeSource,
  type EditorPickCycleState,
  type EditorSelectionFilter,
  type EditorViewportSelectionKind,
  type EmberInspectorFieldEdit,
  type EmberVoxelOverrideComponentType,
  type EmberOptionalComponentType,
  type EmberWorldObject,
  type EmberWorldObjectRef,
  type EmberWorldTransformPatch,
  type EmberWorldTransformSpace,
} from "../../../game/editor";
import type { EmberAssetReference } from "../../../game/editor/emberLibraryIndex";
import { writeEmberJson } from "../../../game/content/io";
import {
  packWithVoxels,
  writeVoxelRegistry,
} from "../../../game/voxel/voxelRegistry";
import {
  resolveEmissiveLightRange,
  resolveEmissiveStrength,
} from "../../../game/tile/emissivePaint";
import {
  createEditorThreePreview,
  type EditorPick,
  type EditorAssetPlacementPreview,
  type EditorThreePreview,
  type EditorTransformCommit,
  type EditorTransformPreview,
  type EditorTransformTarget,
  type PlacePreviewMark,
} from "../../../game/three/editorThreePreview";
import { blockStoryHeight, elevFromWorldY, elevStoryWorldSpan } from "../../../game/tile/extruded";
import type { VoxelSculptSession } from "./VoxelSculptPanel";
import {
  normalizePixelSprite,
  serializePixelSprite,
} from "../../../game/content/pixelSprite";
import type {
  EmberLightSource,
  EmberMap,
  EmberColliderModifier,
  EmberMapLight,
  EmberMapRegion,
  EmberSpawnTable,
  EmberPack,
  EmberStage,
  EmberTileset,
  EmberTilesetTile,
  RampDir,
} from "../../../game/content/types";
import { MAX_ELEVATION, MIN_ELEVATION, clampElevation, elevationSteps } from "../../../game/content/types";
import {
  canvasPixelToSpritePlacement,
  canvasPixelToTile,
  clearElevTile,
  fillElevColumn,
  hollowElevColumn,
  moveElevTile,
  elevationAt,
  elevTileIdAt,
  ensureMapLayers,
  heightVoxelsAt,
  listLanternSources,
  previewLanternSourceMove,
  removeLanternSource,
  mapViewModeFromArrow,
  mapViewModeLabelRu,
  rampDirDelta,
  resolveMapLight,
  setElevTileId,
  suggestConnectorElevation,
  tileCanvasTopLeft,
  tileSurfaceElev,
  regionVolumeElev,
  topOccupiedElevAt,
  type MapViewMode,
} from "../../../game/tile/mapUtils";
import {
  EmberSpriteThumb,
  EmberStairThumb,
  EmberThumbGrid,
  EmberTileSwatch,
  type EmberThumbItem,
} from "./EmberThumbGrid";
import { MapLightPanel } from "./MapLightPanel";
import {
  MapObjectInspector,
  mapSelectionToWorldObjectRef,
  type MapSelection,
} from "./MapObjectInspector";
import { MapSettingsPanel } from "./MapSettingsPanel";
import { MapSceneOutliner } from "./MapSceneOutliner";
import {
  applyLampParamsToSource,
  lampParamsFromSource,
  lightsFileFromPresets,
} from "../../../game/content/lightPresets";
import { voxelPlacementModifiersFromModel } from "../../../game/voxel/voxelModelApply";
import {
  BUILTIN_LIGHT_PRESET_IDS,
  MAP_LIB_MIME,
  MapLibraryTray,
  parseMapLibPayload,
  type BuiltinLightPresetId,
  type MapLibLightPresetId,
  type MapLibPayload,
} from "./MapLibraryTray";
import {
  checkMapLibraryPlacement,
  effectiveMapLibraryPlacementMode,
  resolveMapLibraryPlacementTarget,
  type MapLibraryPlacementMode,
  type MapLibraryPlacementTarget,
} from "./mapLibraryPlacement";
import {
  pairTeleportRegions,
  replaceRegion,
} from "./MapRegionEditor";
import {
  clampRegionOrigin,
  makeRegionAt,
  newRegionId,
  regionFootprintCenter,
} from "./mapRegionHelpers";
import { MapRegionsPanel } from "./MapRegionsPanel";
import { MapSpawnEditor } from "./MapSpawnEditor";
import { MapStageForm } from "./MapStageForm";
import {
  appendBlankTile,
  appendClonedTile,
} from "./tileCreateHelpers";

const LazyVoxelSculptPanel = lazy(() =>
  import("./VoxelSculptPanel").then((module) => ({
    default: module.VoxelSculptPanel,
  })),
);

const MAP_SELECTION_FILTER_STORAGE_KEY = "ember-map-selection-filter-v1";

const VIEWPORT_SELECTION_LABEL: Record<
  EditorViewportSelectionKind,
  string
> = {
  voxel: "Воксели",
  sprite: "Спрайты",
  light: "Свет",
  region: "Зоны",
  tile: "Блоки",
};

type ViewportMapSelection = Extract<
  MapSelection,
  { kind: EditorViewportSelectionKind }
>;

function isViewportMapSelection(
  selection: MapSelection,
): selection is ViewportMapSelection {
  return EDITOR_VIEWPORT_SELECTION_KINDS.includes(
    selection.kind as EditorViewportSelectionKind,
  );
}

function initialMapSelectionFilter(): EditorSelectionFilter {
  try {
    const stored = sessionStorage.getItem(MAP_SELECTION_FILTER_STORAGE_KEY);
    return stored
      ? normalizeEditorSelectionFilter(JSON.parse(stored))
      : { ...DEFAULT_EDITOR_SELECTION_FILTER };
  } catch {
    return { ...DEFAULT_EDITOR_SELECTION_FILTER };
  }
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.closest("[contenteditable=true]")) {
    return true;
  }
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el instanceof HTMLInputElement) {
    const t = el.type;
    // Only block real text entry — not buttons / checkboxes / etc.
    return !(
      t === "button" ||
      t === "checkbox" ||
      t === "radio" ||
      t === "range" ||
      t === "file" ||
      t === "color" ||
      t === "submit" ||
      t === "reset" ||
      t === "image"
    );
  }
  return Boolean(el.closest("textarea, select, [role='textbox']"));
}

function selectionFromWorldObject(object: EmberWorldObject): MapSelection {
  const ref = object.ref;
  if (ref.kind === "tile") {
    return { kind: "tile", tx: ref.tx, ty: ref.ty, elev: ref.elev };
  }
  return { kind: ref.kind, id: ref.id };
}

function mapSelectionEquals(left: MapSelection, right: MapSelection): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "tile" && right.kind === "tile") {
    return left.tx === right.tx && left.ty === right.ty && left.elev === right.elev;
  }
  if (
    (left.kind === "voxel" || left.kind === "sprite" || left.kind === "light" || left.kind === "region" || left.kind === "group") &&
    (right.kind === "voxel" || right.kind === "sprite" || right.kind === "light" || right.kind === "region" || right.kind === "group")
  ) {
    return left.kind === right.kind && left.id === right.id;
  }
  if (left.kind === "lib" && right.kind === "lib") {
    return left.payload === right.payload;
  }
  return left.kind === right.kind;
}

function mapSelectionKey(selection: MapSelection): string {
  if (selection.kind === "tile") {
    return `tile:${selection.tx}:${selection.ty}:${selection.elev ?? ""}`;
  }
  if (selection.kind === "lib") {
    return `lib:${JSON.stringify(selection.payload)}`;
  }
  if (selection.kind === "globalLight") return "globalLight";
  return `${selection.kind}:${selection.id}`;
}

function mapSelectionShortLabel(selection: MapSelection): string {
  switch (selection.kind) {
    case "voxel":
      return `Воксель ${selection.id}`;
    case "sprite":
      return `Спрайт ${selection.id}`;
    case "light":
      return `Свет ${selection.id}`;
    case "region":
      return `Зона ${selection.id}`;
    case "tile":
      return `Тайл ${selection.tx},${selection.ty}${selection.elev == null ? "" : ` Z${selection.elev}`}`;
    case "group":
      return `Группа ${selection.id}`;
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

type Tool =
  | "select"
  | "paint"
  | "erase"
  | "fill"
  | "collision"
  | "elevation"
  | "eyedrop"
  | "sprite"
  | "lightpick";

/** G = move / R = rotate toward cursor (selected voxel, sprite, or light). */
type ObjectGrab =
  | {
      mode: "move";
      kind: "voxel" | "sprite" | "light";
      id: string;
      hover: TilePos | null;
    }
  | {
      mode: "rotate";
      kind: "voxel";
      id: string;
      hover: TilePos | null;
      /** Live yaw preview (0..3). */
      previewRot: number;
    };

/** Floating dock popovers above the map canvas. */
type DockPanel =
  | "tools"
  | "tiles"
  | "elev"
  | "view"
  | "settings"
  | "light"
  | "regions"
  | "stage"
  | "spawn";

type Props = {
  pack: EmberPack;
  map: EmberMap;
  onChange: (map: EmberMap) => void;
  onPackChange?: (pack: EmberPack) => void;
  onStageChange: (stage: EmberStage) => void;
  onSpawnChange: (spawn: EmberSpawnTable) => void;
  onSaved: (msg: string) => void;
  /** Jump to tile / sprite editors from the object inspector. */
  onEditTile?: (tileId: number) => void;
  onEditSprite?: (spriteId: string) => void;
};

const SCALE_STEPS = [1, 2, 3, 4] as const;
/** Debounce before writing map JSON after edits. */
const MAP_AUTOSAVE_MS = 1500;

type MapSaveState = "saved" | "dirty" | "saving" | "error";

const RAMP_DIRS: RampDir[] = ["n", "e", "s", "w"];
const STAIR_PALETTE_ID = "stair";
const STAIR_DIR_LABEL: Record<RampDir, string> = {
  n: "↑ С",
  e: "→ В",
  s: "↓ Ю",
  w: "← З",
};

function rotateRampDir(dir: RampDir, delta = 1): RampDir {
  const i = RAMP_DIRS.indexOf(dir);
  const idx = i >= 0 ? i : 0;
  return RAMP_DIRS[(idx + delta + RAMP_DIRS.length) % RAMP_DIRS.length]!;
}

function findStairTileId(
  tileset: EmberTileset | undefined,
  dir: RampDir,
): number | null {
  const t = tileset?.tiles.find((tile) => tile.stair === dir);
  return t?.id ?? null;
}

function isStairTileId(
  tileset: EmberTileset | undefined,
  id: number,
): boolean {
  return Boolean(tileset?.tiles.find((t) => t.id === id)?.stair);
}

const TOOLS: Array<{
  id: Tool;
  labelRu: string;
  hint: string;
  glyph: string;
}> = [
  {
    id: "select",
    labelRu: "Выбор",
    hint: "Клик — объект / тайл · Shift+ЛКМ — рамка на Z · Ctrl+клик — мультивыбор · G/R/S",
    glyph: "V",
  },
  {
    id: "paint",
    labelRu: "Кисть",
    hint: "Зажми и тяни — прямоугольник зальётся тайлом",
    glyph: "B",
  },
  {
    id: "erase",
    labelRu: "Ластик",
    hint: "Зажми и тяни — очистить прямоугольник · ПКМ по спрайту/вокселю — снять",
    glyph: "E",
  },
  {
    id: "fill",
    labelRu: "Заливка",
    hint: "Клик — заливка по цвету; тяни — прямоугольник",
    glyph: "F",
  },
  {
    id: "eyedrop",
    labelRu: "Пипетка",
    hint: "Клик — взять тайл с карты",
    glyph: "I",
  },
  {
    id: "elevation",
    labelRu: "Блок Z",
    hint: "Добавить блок на выбранный уровень Z (панель Z / клавиши 0–3)",
    glyph: "Z",
  },
  {
    id: "collision",
    labelRu: "Стены",
    hint: "Зажми и тяни — стены · клик по стене снимает · ≤4 vx — автоподъём в игре",
    glyph: "W",
  },
  {
    id: "sprite",
    labelRu: "Спрайт",
    hint: "Штамп спрайта на тайл · удобнее из библиотеки слева",
    glyph: "S",
  },
  {
    id: "lightpick",
    labelRu: "Свет",
    hint: "Клик по фонарю — настройки; пустая клетка — новый · глобально — панель Свет",
    glyph: "L",
  },
];

const DOCK_TABS: Array<{
  id: DockPanel;
  labelRu: string;
  hint: string;
  glyph: string;
}> = [
  {
    id: "tools",
    labelRu: "Инструменты",
    hint: "Выбор, кисти, стены, свет · по умолчанию Выбор (V)",
    glyph: "✎",
  },
  {
    id: "tiles",
    labelRu: "Тайлы",
    hint: "Палитра кисти (библиотека слева — постановка объектов)",
    glyph: "▦",
  },
  {
    id: "elev",
    labelRu: "Уровень блока Z",
    hint: "Рабочий уровень кисти · −1…3 · не меняет высоту стены",
    glyph: "Z",
  },
  {
    id: "view",
    labelRu: "Камера",
    hint: "Ракурс стрелками · ПКМ орбита · СКМ пан · Ctrl+колёсико — Z плоскости",
    glyph: "◉",
  },
  {
    id: "settings",
    labelRu: "Настройки",
    hint: "Ночь, bloom, грейдинг, туман, дождь, облака",
    glyph: "⚙",
  },
  {
    id: "light",
    labelRu: "Свет",
    hint: "Фонари на карте · L — поставить/выбрать",
    glyph: "☀",
  },
  {
    id: "regions",
    labelRu: "Регионы",
    hint: "Старт, спавн, сундуки, телепорты, триггеры",
    glyph: "⬚",
  },
  {
    id: "stage",
    labelRu: "Стадия",
    hint: "Таймер, оружие, босс, награды (не музыка)",
    glyph: "▶",
  },
  {
    id: "spawn",
    labelRu: "Спавны",
    hint: "Волны врагов для таблицы стадии",
    glyph: "※",
  },
];

type TilePos = { x: number; y: number };

function normalizeRect(a: TilePos, b: TilePos) {
  return {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  };
}

function picksEqual(a: EditorPick | null, b: EditorPick | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "tile" && b.kind === "tile") {
    return (
      a.tx === b.tx &&
      a.ty === b.ty &&
      (a.elev ?? null) === (b.elev ?? null)
    );
  }
  if (
    (a.kind === "sprite" || a.kind === "voxel") &&
    (b.kind === "sprite" || b.kind === "voxel")
  ) {
    return a.kind === b.kind && a.id === b.id;
  }
  return false;
}

function ensureLayerData(map: EmberMap, name: string): number[] {
  const ensured = ensureMapLayers(map);
  let layer = ensured.layers.find((l) => l.name === name);
  if (!layer) {
    const data = new Array(ensured.width * ensured.height).fill(0);
    ensured.layers.push({ name, type: "tile", data });
    layer = ensured.layers.find((l) => l.name === name)!;
  }
  // Copy into mutable map if needed
  if (!map.layers.some((l) => l.name === name)) {
    map.layers.push({ name, type: "tile", data: [...layer.data] });
  }
  return map.layers.find((l) => l.name === name)!.data;
}

/** Set wall height in voxels; 0 clears wall + collision. */
function setWallHeightVoxels(map: EmberMap, idx: number, voxels: number): void {
  const col = map.layers.find((l) => l.name === "collision");
  const height = ensureLayerData(map, "height");
  const ts = Math.max(1, map.tileSize || 16);
  const h = Math.max(0, Math.min(8 * ts, Math.round(voxels)));
  if (col) col.data[idx] = h > 0 ? 1 : 0;
  height[idx] = h;
}

function setElevation(map: EmberMap, idx: number, elev: number): void {
  const data = ensureLayerData(map, "elevation");
  data[idx] = clampElevation(elev);
}

function cloneMap(map: EmberMap): EmberMap {
  return {
    ...map,
    light: map.light
      ? {
          ...map.light,
          grade: map.light.grade ? { ...map.light.grade } : undefined,
        }
      : undefined,
    lights: map.lights?.map((l) => ({ ...l })),
    sprites: map.sprites?.map((s) => ({
      ...s,
      scale: s.scale ? { ...s.scale } : undefined,
      componentStates: s.componentStates ? { ...s.componentStates } : undefined,
      collider: s.collider ? { ...s.collider } : undefined,
    })),
    tileModifiers: map.tileModifiers?.map((modifier) => ({
      ...modifier,
      componentStates: modifier.componentStates
        ? { ...modifier.componentStates }
        : undefined,
      collider: modifier.collider ? { ...modifier.collider } : undefined,
    })),
    voxelProps: map.voxelProps?.map((p) => ({
      ...p,
      scale: p.scale ? { ...p.scale } : undefined,
    })),
    layers: map.layers.map((l) => ({ ...l, data: [...l.data] })),
    regions: map.regions.map((r) => ({ ...r })),
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
  };
}

function selectionToPick(
  sel: MapSelection | null,
  lanterns: { id: string; x: number; y: number }[],
  regions: EmberMapRegion[],
): EditorPick | null {
  if (!sel) return null;
  switch (sel.kind) {
    case "sprite":
      return { kind: "sprite", id: sel.id };
    case "voxel":
      return { kind: "voxel", id: sel.id };
    case "tile":
      return { kind: "tile", tx: sel.tx, ty: sel.ty, elev: sel.elev };
    case "light": {
      const lamp = lanterns.find((s) => s.id === sel.id);
      return lamp ? { kind: "tile", tx: lamp.x, ty: lamp.y } : null;
    }
    case "region": {
      const r = regions.find((x) => x.id === sel.id);
      return r ? { kind: "tile", tx: r.x, ty: r.y } : null;
    }
    case "lib":
    case "globalLight":
    case "group":
      return null;
    default: {
      const _n: never = sel;
      return _n;
    }
  }
}

/** World pivot + flags for the Blender-like transform gizmo. */
function selectionTransformTarget(
  sel: MapSelection | null,
  map: EmberMap,
  tileset: EmberTileset | undefined,
  sprites: EmberPack["sprites"],
): EditorTransformTarget | null {
  if (!sel) return null;
  const ts = map.tileSize;
  const storyH = blockStoryHeight(ts);
  switch (sel.kind) {
    case "voxel": {
      const object = getEmberWorldObject(map, { kind: "voxel", id: sel.id });
      if (!object || object.source.kind !== "voxel") return null;
      const p = object.source.value;
      const elev = object.transform.resolvedZ;
      return {
        kind: "voxel",
        id: p.id,
        tx: p.x,
        ty: p.y,
        position: {
          x: (p.x + 0.5) * ts,
          y: elev * storyH,
          z: (p.y + 0.5) * ts,
        },
        rotationY: ((((p.rot ?? 0) % 4) + 4) % 4) * (Math.PI / 2),
        scale: object.transform.scale,
        allowRotate: true,
        allowScale: true,
      };
    }
    case "sprite": {
      const object = getEmberWorldObject(map, { kind: "sprite", id: sel.id });
      if (!object || object.source.kind !== "sprite") return null;
      const p = object.source.value;
      const elev = object.transform.resolvedZ;
      return {
        kind: "sprite",
        id: p.id,
        tx: p.x,
        ty: p.y,
        position: {
          x: (p.x + 0.5) * ts,
          y: elev * storyH + 1,
          z: (p.y + 0.5) * ts,
        },
        allowRotate: false,
        scale: object.transform.scale,
        allowScale: true,
      };
    }
    case "light": {
      if (!tileset) return null;
      const lamp = listLanternSources(map, tileset, sprites).find(
        (s) => s.id === sel.id,
      );
      if (!lamp) return null;
      const floorY =
        (lamp.elev ?? tileSurfaceElev(map, lamp.x, lamp.y)) * storyH;
      const heightTiles = Math.max(0.2, Math.min(3, lamp.params.lampHeight));
      return {
        kind: "light",
        id: lamp.id,
        tx: lamp.x,
        ty: lamp.y,
        position: {
          x: (lamp.x + 0.5) * ts,
          y: floorY + heightTiles * ts,
          z: (lamp.y + 0.5) * ts,
        },
        allowRotate: false,
        allowScale: false,
      };
    }
    case "tile": {
      const top =
        sel.elev ??
        topOccupiedElevAt(map, sel.tx, sel.ty) ??
        elevationAt(map, sel.tx, sel.ty);
      const { y0, y1 } = elevStoryWorldSpan(top, storyH);
      return {
        kind: "tile",
        tx: sel.tx,
        ty: sel.ty,
        position: {
          x: (sel.tx + 0.5) * ts,
          y: (y0 + y1) * 0.5,
          z: (sel.ty + 0.5) * ts,
        },
        allowRotate: false,
        allowScale: false,
      };
    }
    case "group": {
      const group = map.sceneHierarchy?.groups.find((candidate) => candidate.id === sel.id);
      if (!group) return null;
      return {
        kind: "group",
        id: group.id,
        position: {
          x: (group.pivot.x + 0.5) * ts,
          y: group.pivot.z * storyH,
          z: (group.pivot.y + 0.5) * ts,
        },
        rotationY:
          (((group.rotationQuarterTurns ?? 0) % 4) + 4) % 4 *
          (Math.PI / 2),
        allowRotate: true,
        scale: { x: 1, y: 1, z: 1 },
        allowScale: true,
      };
    }
    case "region": {
      const region = map.regions.find((candidate) => candidate.id === sel.id);
      if (!region) return null;
      const elev = regionVolumeElev(map, region);
      return {
        kind: "region",
        id: region.id,
        position: {
          x: (region.x + region.w / 2) * ts,
          y: elev * storyH,
          z: (region.y + region.h / 2) * ts,
        },
        scale: { x: region.w, y: region.h, z: 1 },
        allowRotate: false,
        allowScale: true,
        scaleAxes: { x: true, y: true, z: false },
      };
    }
    case "lib":
    case "globalLight":
      return null;
    default: {
      const _n: never = sel;
      return _n;
    }
  }
}

function multiSelectionWorldObjects(
  selections: readonly MapSelection[],
  map: EmberMap,
): EmberWorldObject[] {
  if (
    selections.some(
      (selection) =>
        selection.kind === "group" ||
        selection.kind === "tile" ||
        selection.kind === "lib" ||
        selection.kind === "globalLight",
    )
  ) {
    return [];
  }
  const byKey = new Map<string, EmberWorldObject>();
  for (const selection of selections) {
    const ref = mapSelectionToWorldObjectRef(selection);
    if (!ref || ref.kind === "tile") continue;
    const object = getEmberWorldObject(map, ref);
    if (object) byKey.set(object.key, object);
  }
  return [...byKey.values()];
}

function worldObjectTransformPivot(object: EmberWorldObject) {
  if (object.source.kind === "region") {
    const region = object.source.value;
    return {
      x: region.x + (region.w - 1) / 2,
      y: region.y + (region.h - 1) / 2,
      z: object.transform.resolvedZ,
    };
  }
  return {
    x: object.transform.position.x,
    y: object.transform.position.y,
    z: object.transform.resolvedZ,
  };
}

function multiSelectionTransformTarget(
  selections: readonly MapSelection[],
  map: EmberMap,
): EditorTransformTarget | null {
  const objects = multiSelectionWorldObjects(selections, map);
  if (objects.length < 2) return null;
  const points = objects.map(worldObjectTransformPivot);
  const pivot = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
  };
  const ts = map.tileSize;
  return {
    kind: "selection",
    position: {
      x: (pivot.x + 0.5) * ts,
      y: pivot.z * blockStoryHeight(ts),
      z: (pivot.y + 0.5) * ts,
    },
    scale: { x: 1, y: 1, z: 1 },
    allowRotate: false,
    allowScale: true,
  };
}

/** Builds a disposable map pose for the gizmo without touching history/save. */
function mapWithTransformPreview(
  map: EmberMap,
  preview: EditorTransformPreview,
  selections: readonly MapSelection[],
  tileset?: EmberTileset,
  sprites?: EmberPack["sprites"],
): EmberMap | null {
  const ts = map.tileSize;
  const storyH = blockStoryHeight(ts);
  const targetX = preview.position.x / ts - 0.5;
  const targetY = preview.position.z / ts - 0.5;
  const targetZ = clampElevation(elevFromWorldY(preview.position.y, storyH));
  const rotation =
    ((Math.round(preview.rotationY / (Math.PI / 2)) % 4) + 4) % 4;

  if (preview.kind === "selection") {
    const objects = multiSelectionWorldObjects(selections, map);
    if (objects.length < 2) return null;
    const points = objects.map(worldObjectTransformPivot);
    const pivot = {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
    };
    if (preview.mode === "scale") {
      return scaleEmberWorldObjectsAroundPivot(
        map,
        objects.map((object) => object.ref),
        pivot,
        preview.scale,
      );
    }
    return translateEmberWorldObjects(
      map,
      objects.map((object) => object.ref),
      Math.round(targetX - pivot.x),
      Math.round(targetY - pivot.y),
    );
  }

  if (preview.kind === "group" && preview.id) {
    const group = map.sceneHierarchy?.groups.find(
      (candidate) => candidate.id === preview.id,
    );
    if (!group) return null;
    const keys = new Set(
      emberSceneGroupObjectKeys(map.sceneHierarchy, group.id),
    );
    const refs = listEmberWorldObjects(map)
      .filter((object) => keys.has(object.key))
      .map((object) => object.ref);
    if (preview.mode === "scale") {
      const scaled = scaleEmberWorldObjectsAroundPivot(
        map,
        refs,
        group.pivot,
        preview.scale,
      );
      return scaleEmberSceneGroupTransforms(
        scaled,
        group.id,
        preview.scale,
      );
    }
    if (preview.mode === "rotate") {
      const current =
        (((group.rotationQuarterTurns ?? 0) % 4) + 4) % 4;
      const delta = ((rotation - current) % 4 + 4) % 4;
      const rotated = rotateEmberWorldObjectsAroundPivot(
        map,
        refs,
        group.pivot,
        delta,
      );
      return rotateEmberSceneGroupTransforms(rotated, group.id, delta);
    }
    const dx = Math.round(targetX - group.pivot.x);
    const dy = Math.round(targetY - group.pivot.y);
    const moved = translateEmberWorldObjects(map, refs, dx, dy);
    return translateEmberSceneGroupTransforms(moved, group.id, dx, dy);
  }

  if (
    preview.mode === "scale" &&
    preview.id &&
    (preview.kind === "voxel" ||
      preview.kind === "sprite" ||
      preview.kind === "region")
  ) {
    return patchEmberWorldObjectTransform(
      map,
      { kind: preview.kind, id: preview.id },
      {
        scaleX: preview.scale.x,
        scaleY: preview.scale.y,
        ...(preview.kind !== "region" ? { scaleZ: preview.scale.z } : {}),
      },
    );
  }

  if (!preview.id || preview.kind === "tile") return null;
  if (preview.kind === "voxel") {
    return patchEmberWorldObjectTransform(
      map,
      { kind: "voxel", id: preview.id },
      preview.mode === "rotate"
        ? { rotationQuarterTurns: rotation }
        : { x: targetX, y: targetY, z: targetZ },
    );
  }
  if (preview.kind === "light") {
    if (!tileset) return null;
    return previewLanternSourceMove(
      map,
      tileset,
      sprites,
      preview.id,
      targetX,
      targetY,
    );
  }
  if (preview.kind === "sprite") {
    return patchEmberWorldObjectTransform(
      map,
      { kind: "sprite", id: preview.id },
      { x: targetX, y: targetY },
    );
  }
  if (preview.kind === "region") {
    const region = map.regions.find((candidate) => candidate.id === preview.id);
    if (!region) return null;
    return patchEmberWorldObjectTransform(
      map,
      { kind: "region", id: preview.id },
      {
        x: preview.position.x / ts - region.w / 2,
        y: preview.position.z / ts - region.h / 2,
        z: clampElevation(elevFromWorldY(preview.position.y, storyH)),
      },
    );
  }
  return null;
}

/** Apply the in-flight gizmo pose so overlays follow before React commits displayMap. */
function applyLiveRegionPose(
  region: EmberMapRegion,
  preview: EditorTransformPreview | null,
  map: EmberMap,
): EmberMapRegion {
  if (!preview || preview.kind !== "region" || preview.id !== region.id) {
    return region;
  }
  const ts = map.tileSize;
  if (preview.mode === "translate") {
    return {
      ...region,
      ...clampRegionOrigin(
        preview.position.x / ts - region.w / 2,
        preview.position.z / ts - region.h / 2,
        region.w,
        region.h,
        map.width,
        map.height,
      ),
      elev: clampElevation(
        elevFromWorldY(preview.position.y, blockStoryHeight(ts)),
      ),
    };
  }
  if (preview.mode === "scale") {
    const w = Math.max(1, Math.min(map.width, Math.round(preview.scale.x)));
    const h = Math.max(1, Math.min(map.height, Math.round(preview.scale.y)));
    return {
      ...region,
      w,
      h,
      ...clampRegionOrigin(
        region.x,
        region.y,
        w,
        h,
        map.width,
        map.height,
      ),
    };
  }
  return region;
}

const TOOL_HOTKEYS: Record<string, Tool> = {
  KeyV: "select",
  KeyB: "paint",
  KeyE: "erase",
  KeyF: "fill",
  KeyI: "eyedrop",
  KeyZ: "elevation",
  KeyW: "collision",
  KeyS: "sprite",
  KeyL: "lightpick",
};

function newLightId(): string {
  return `light_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Snap facing toward a tile: 0=S, 1=E, 2=N, 3=W (90° steps). */
function voxelRotToward(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  fallback: number,
): number {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (dx === 0 && dy === 0) return ((fallback % 4) + 4) % 4;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 1 : 3;
  return dy > 0 ? 0 : 2;
}

/** Preview map while G/R grab is active (does not commit until click). */
function mapWithObjectGrab(map: EmberMap, grab: ObjectGrab | null): EmberMap {
  if (!grab) return map;
  if (grab.mode === "move") {
    if (!grab.hover) return map;
    const { x, y } = grab.hover;
    if (grab.kind === "voxel") {
      return patchEmberWorldObjectTransform(
        map,
        { kind: "voxel", id: grab.id },
        { x, y, z: tileSurfaceElev(map, x, y) },
      );
    }
    if (grab.kind === "light") {
      return patchEmberWorldObjectTransform(
        map,
        { kind: "light", id: grab.id },
        { x, y },
      );
    }
    return patchEmberWorldObjectTransform(
      map,
      { kind: "sprite", id: grab.id },
      { x, y, z: tileSurfaceElev(map, x, y) },
    );
  }
  return patchEmberWorldObjectTransform(
    map,
    { kind: "voxel", id: grab.id },
    { rotationQuarterTurns: grab.previewRot },
  );
}

function isBuiltinLightPresetId(id: string): id is BuiltinLightPresetId {
  return (BUILTIN_LIGHT_PRESET_IDS as readonly string[]).includes(id);
}

function lightSourceFromPreset(
  map: EmberMap,
  pack: EmberPack,
  presetId: MapLibLightPresetId,
  x: number,
  y: number,
): EmberLightSource {
  const defaults = resolveMapLight(map);
  const base: EmberLightSource = {
    id: newLightId(),
    x,
    y,
    enabled: true,
    ...lampParamsFromSource(defaults),
  };
  if (!isBuiltinLightPresetId(presetId)) {
    const custom = pack.lightPresets?.[presetId];
    if (custom) return applyLampParamsToSource(base, custom);
    return base;
  }
  switch (presetId) {
    case "default":
      return base;
    case "warm":
      return {
        ...base,
        lampColor: "#ff9a40",
        lampFaceColor: "#ff7040",
      };
    case "cool":
      return {
        ...base,
        lampColor: "#80a8ff",
        lampFaceColor: "#6080e0",
      };
    case "bright":
      return {
        ...base,
        lampRange: 6,
        lampDiscCore: 2,
        lampDiscMid: 4,
        lampStrength0: 1,
        lampStrengthFalloff: 0.5,
      };
    case "dim":
      return {
        ...base,
        lampRange: 2,
        lampDiscCore: 1,
        lampDiscMid: 2,
        lampStrength0: 0.4,
        lampStrengthFalloff: 0.4,
      };
    default: {
      const _n: never = presetId;
      return _n;
    }
  }
}

export function MapEditorPanel({
  pack,
  map,
  onChange,
  onPackChange,
  onStageChange,
  onSpawnChange,
  onSaved,
  onEditTile,
  onEditSprite,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const threeHostRef = useRef<HTMLDivElement>(null);
  const threePreviewRef = useRef<EditorThreePreview | null>(null);
  const transformCommitRef = useRef<(commit: EditorTransformCommit) => void>(
    () => undefined,
  );
  const transformDraggingRef = useRef(false);
  const transformLivePreviewRef = useRef<EditorTransformPreview | null>(null);
  const transformPreviewRef = useRef(false);
  const transformMapPreviewRafRef = useRef(0);
  const [transformMapPreview, setTransformMapPreview] =
    useState<EmberMap | null>(null);
  const syncThreeOverlaysRef = useRef<() => void>(() => undefined);
  const clearPlacePreviewRef = useRef<() => void>(() => undefined);
  const updatePlacePreviewRef = useRef<(next: PlacePreviewMark | null) => void>(
    () => undefined,
  );
  const painting = useRef(false);
  const eraseStrokeSaved = useRef(false);
  const eraseLastKey = useRef<string | null>(null);
  const panningRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const orbitingRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [worldLoad, setWorldLoad] = useState({
    active: true,
    ratio: 0.04,
    labelRu: "Местность…",
  });
  const setWorldLoadRef = useRef(setWorldLoad);
  setWorldLoadRef.current = setWorldLoad;
  const [voxelSculptSession, setVoxelSculptSession] =
    useState<VoxelSculptSession | null>(null);
  /** When opening sculptor from a chest scene, focus this scene/model id. */
  const [voxelSculptFocusId, setVoxelSculptFocusId] = useState<string | null>(
    null,
  );
  const [objectGrab, setObjectGrab] = useState<ObjectGrab | null>(null);
  const objectGrabRef = useRef<ObjectGrab | null>(null);
  objectGrabRef.current = objectGrab;
  /** Absolute wall height for this stroke (0 = clear). Null when using delta. */
  const wallPaintValue = useRef<number | null>(null);
  /** Relative ±vx for this stroke. Null when clearing / absolute reset. */
  const wallPaintDelta = useRef<number | null>(null);
  const dragStartRef = useRef<TilePos | null>(null);
  const dragEndRef = useRef<TilePos | null>(null);
  const marqueeing = useRef(false);
  const marqueeAddRef = useRef(false);
  const marqueeElevRef = useRef(0);
  const marqueeStartRef = useRef<TilePos | null>(null);
  const marqueeEndRef = useRef<TilePos | null>(null);
  const toolRef = useRef<Tool>("select");
  const mapRef = useRef(map);
  const displayMapRef = useRef(map);
  const packRef = useRef(pack);
  const onChangeRef = useRef(onChange);
  const editorCoreRef = useRef<
    EditorCore<EmberMap, MapSelection, Tool> | null
  >(null);
  if (!editorCoreRef.current) {
    editorCoreRef.current = new EditorCore({
      document: map,
      tools: TOOLS.map((entry) => ({
        id: entry.id,
        label: entry.labelRu,
        metadata: { hint: entry.hint, glyph: entry.glyph },
      })),
      initialTool: "select",
      historyLimit: 30,
      selectionEquals: mapSelectionEquals,
    });
  }
  const editorCore = editorCoreRef.current;
  const documentStore = editorCore.documents;
  const commandStack = editorCore.commands;
  const selectionService = editorCore.selection;
  const toolRegistry = editorCore.tools;
  const sceneStateRef = useRef<EditorSceneState | null>(null);
  if (!sceneStateRef.current) sceneStateRef.current = new EditorSceneState();
  const sceneState = sceneStateRef.current;
  const dragSelRef = useRef<{ start: TilePos; end: TilePos } | null>(null);
  const overlayRafRef = useRef(0);
  const dockRef = useRef<HTMLDivElement>(null);
  const dockBtnRefs = useRef<Partial<Record<DockPanel, HTMLButtonElement | null>>>(
    {},
  );
  const dockPopRef = useRef<HTMLDivElement>(null);
  const [dockPopStyle, setDockPopStyle] = useState<CSSProperties>({});

  const toolState = useSyncExternalStore(
    toolRegistry.subscribe,
    toolRegistry.getState,
    toolRegistry.getState,
  );
  const tool = toolState.activeId;
  const sceneStateSnapshot = useSyncExternalStore(
    sceneState.subscribe,
    sceneState.getSnapshot,
    sceneState.getSnapshot,
  );
  const hiddenObjectKeys = useMemo(
    () => new Set(sceneStateSnapshot.hiddenKeys),
    [sceneStateSnapshot.hiddenKeys],
  );
  const isolated = sceneStateSnapshot.isolated;
  const lockedObjectKeys = useMemo(
    () => new Set(sceneStateSnapshot.lockedKeys),
    [sceneStateSnapshot.lockedKeys],
  );
  const setTool = useCallback(
    (next: Tool) => {
      toolRegistry.activate(next);
    },
    [toolRegistry],
  );
  const [dockPanel, setDockPanel] = useState<DockPanel | null>(null);
  const selectionState = useSyncExternalStore(
    selectionService.subscribe,
    selectionService.getState,
    selectionService.getState,
  );
  const selection = selectionState.primary;
  const selectionItemsRef = useRef<readonly MapSelection[]>([]);
  selectionItemsRef.current = selectionState.items;
  const [selectionFilter, setSelectionFilter] =
    useState<EditorSelectionFilter>(initialMapSelectionFilter);
  const selectionFilterRef = useRef(selectionFilter);
  selectionFilterRef.current = selectionFilter;
  const pickCycleRef = useRef<EditorPickCycleState | null>(null);
  const [hoverSelectionStack, setHoverSelectionStack] = useState<
    readonly MapSelection[]
  >([]);
  const setSelection = useCallback(
    (
      next:
        | MapSelection
        | null
        | ((current: MapSelection | null) => MapSelection | null),
    ) => {
      if (typeof next === "function") {
        selectionService.updatePrimary(next);
      } else {
        selectionService.setPrimary(next);
      }
    },
    [selectionService],
  );
  const toggleSelectionFilter = useCallback(
    (kind: EditorViewportSelectionKind) => {
      setSelectionFilter((current) => ({
        ...current,
        [kind]: !current[kind],
      }));
    },
    [],
  );
  const enableAllSelectionFilters = useCallback(() => {
    setSelectionFilter({ ...DEFAULT_EDITOR_SELECTION_FILTER });
  }, []);

  useEffect(() => {
    pickCycleRef.current = null;
    setHoverSelectionStack([]);
    try {
      sessionStorage.setItem(
        MAP_SELECTION_FILTER_STORAGE_KEY,
        JSON.stringify(selectionFilter),
      );
    } catch {
      // Session persistence is optional (private contexts may reject storage).
    }
  }, [selectionFilter]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  /** Hover-preview region from teleport list (camera + blink). */
  const [previewRegionId, setPreviewRegionId] = useState<string | null>(null);
  const previewRegionIdRef = useRef<string | null>(null);
  const dockPanelRef = useRef<DockPanel | null>(null);
  const selectionRef = useRef<MapSelection | null>(null);
  const selectedRegionIdRef = useRef<string | null>(null);
  dockPanelRef.current = dockPanel;
  selectionRef.current = selection;
  selectedRegionIdRef.current = selectedRegionId;
  previewRegionIdRef.current = previewRegionId;
  const selectedLightId =
    selection?.kind === "light" ? selection.id : null;
  const selectedLightIdRef = useRef<string | null>(null);
  selectedLightIdRef.current = selectedLightId;

  const setSelectedLightId = useCallback((id: string | null) => {
    setSelection(id ? { kind: "light", id } : null);
  }, []);
  const [tileId, setTileId] = useState(1);
  const [stairDir, setStairDir] = useState<RampDir>("e");
  const [layer, setLayer] = useState<"ground" | "decor">("ground");
  const [showCollision, setShowCollision] = useState(true);
  const [showRegions, setShowRegions] = useState(true);
  const [showElevation, setShowElevation] = useState(true);
  const [showSemantics, setShowSemantics] = useState(true);
  /** Editor viewport only — hide fog/rain/clouds without clearing map settings. */
  const [showAtmosphereFx, setShowAtmosphereFx] = useState(true);
  /** Editor viewport only — authored night/bloom/grade/lamps (off = clean day look). */
  const [showLookFx, setShowLookFx] = useState(true);
  const [showEditorHints, setShowEditorHints] = useState(() => {
    try {
      return sessionStorage.getItem("ember-map-show-hints") !== "0";
    } catch {
      return true;
    }
  });
  const [viewMode, setViewMode] = useState<MapViewMode>("top");
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const [scale, setScale] = useState(2);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const [saveState, setSaveState] = useState<MapSaveState>("saved");
  const lastSavedJsonRef = useRef<string>("");
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const [brushElev, setBrushElev] = useState(1);
  const brushElevRef = useRef(brushElev);
  brushElevRef.current = brushElev;
  /** Live Minecraft place-ghost under the cursor (tx/ty + locked Z). */
  const placePreviewRef = useRef<PlacePreviewMark | null>(null);
  const [placePreview, setPlacePreview] = useState<PlacePreviewMark | null>(
    null,
  );
  /**
   * Wall brush delta in voxels (+/− to current cell height).
   * 0 = clear wall (same as Shift).
   */
  const [brushWallDelta, setBrushWallDelta] = useState(8);
  /** Hover tile for wall-height preview in the tool HUD. */
  const [wallHoverTile, setWallHoverTile] = useState<TilePos | null>(null);
  const [libCollapsed, setLibCollapsed] = useState(() => {
    try {
      return sessionStorage.getItem("ember-map-lib-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [libSelected, setLibSelected] = useState<MapLibPayload | null>(null);
  /** Draft for library region placement (chest scene, TP, …). */
  const [libRegionDraft, setLibRegionDraft] = useState<EmberMapRegion | null>(
    null,
  );
  const libRegionDraftRef = useRef<EmberMapRegion | null>(null);
  libRegionDraftRef.current = libRegionDraft;
  const [libDragActive, setLibDragActive] = useState(false);
  const [libHoverTile, setLibHoverTile] =
    useState<MapLibraryPlacementTarget | null>(null);
  const libHoverRef = useRef<MapLibraryPlacementTarget | null>(null);
  const [libraryPlacementMode, setLibraryPlacementMode] =
    useState<MapLibraryPlacementMode>("surface");
  const libraryPlacementModeRef = useRef(libraryPlacementMode);
  libraryPlacementModeRef.current = libraryPlacementMode;
  const [serialLibraryPlacement, setSerialLibraryPlacement] = useState(true);
  const serialLibraryPlacementRef = useRef(serialLibraryPlacement);
  serialLibraryPlacementRef.current = serialLibraryPlacement;
  const hoverPickRef = useRef<EditorPick | null>(null);
  const libSelectedRef = useRef<MapLibPayload | null>(null);
  libSelectedRef.current = libSelected;

  /** Max cells before we draw one AABB instead of per-tile boxes. */
  const REGION_CELL_OUTLINE_MAX = 36;

  const regionOutline = useCallback(
    (
      regionId: string | null,
    ): {
      tiles: { tx: number; ty: number; elev?: number }[];
      bounds: { x: number; y: number; w: number; h: number; elev?: number } | null;
    } => {
      if (!regionId) return { tiles: [], bounds: null };
      const overlayMap = displayMapRef.current;
      const found = overlayMap.regions.find((r) => r.id === regionId);
      if (!found) return { tiles: [], bounds: null };
      const region = applyLiveRegionPose(
        found,
        transformLivePreviewRef.current,
        overlayMap,
      );
      const bounds = {
        x: region.x,
        y: region.y,
        w: region.w,
        h: region.h,
        elev: regionVolumeElev(overlayMap, region),
      };
      const area = Math.max(1, region.w) * Math.max(1, region.h);
      // camera_bound / huge zones: one frame, not a per-cell grid.
      if (region.kind === "camera_bound" || area > REGION_CELL_OUTLINE_MAX) {
        return { tiles: [], bounds };
      }
      const cells: { tx: number; ty: number; elev?: number }[] = [];
      for (let j = 0; j < region.h; j++) {
        for (let i = 0; i < region.w; i++) {
          const tx = region.x + i;
          const ty = region.y + j;
          if (tx < 0 || ty < 0 || tx >= overlayMap.width || ty >= overlayMap.height) {
            continue;
          }
          cells.push({ tx, ty, elev: bounds.elev });
        }
      }
      return { tiles: cells, bounds };
    },
    [],
  );

  const dragCells = useCallback(
    (sel: { start: TilePos; end: TilePos } | null): { tx: number; ty: number }[] => {
      if (!sel) return [];
      const { x0, y0, x1, y1 } = normalizeRect(sel.start, sel.end);
      const cells: { tx: number; ty: number }[] = [];
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) cells.push({ tx, ty });
      }
      return cells;
    },
    [],
  );

  const syncThreeOverlays = useCallback(() => {
    const three = threePreviewRef.current;
    if (!three) return;
    const grabHover = objectGrabRef.current?.hover ?? null;
    const lib = grabHover ?? libHoverRef.current;
    const ts = pack.tilesets[mapRef.current.tilesetId];
    const lamps = ts
      ? listLanternSources(mapRef.current, ts, pack.sprites)
      : [];
    const sel = selectionRef.current;
    const baseLampMark =
      sel?.kind === "light"
        ? (lamps.find((l) => l.id === sel.id) ?? null)
        : null;
    const liveTransform = transformLivePreviewRef.current;
    const lampMark =
      baseLampMark &&
      liveTransform?.kind === "light" &&
      liveTransform.id === baseLampMark.id
        ? {
            ...baseLampMark,
            x: liveTransform.position.x / mapRef.current.tileSize - 0.5,
            y: liveTransform.position.z / mapRef.current.tileSize - 0.5,
          }
        : baseLampMark;
    const previewId = previewRegionIdRef.current;
    const regionId = previewId ?? selectedRegionIdRef.current;
    const regionMark = regionOutline(regionId);
    const elevGizmoTarget: PlacePreviewMark | null =
      sel?.kind === "tile"
        ? {
            tx: sel.tx,
            ty: sel.ty,
            elev:
              sel.elev ??
              elevationAt(mapRef.current, sel.tx, sel.ty),
          }
        : null;
    three.setOverlayMarks({
      hover: transformDraggingRef.current ? null : hoverPickRef.current,
      selected: selectionToPick(sel, lamps, mapRef.current.regions),
      selectedMany: selectionItemsRef.current
        .map((item) => selectionToPick(item, lamps, mapRef.current.regions))
        .filter((pick): pick is EditorPick => pick != null),
      selectTiles: dragCells(dragSelRef.current),
      planarMarquee: marqueeSelRef.current
        ? {
            ...normalizePlanarMarqueeRect(
              marqueeSelRef.current.start,
              marqueeSelRef.current.end,
              mapRef.current,
            ),
            elev: marqueeSelRef.current.elev,
          }
        : null,
      libTile: lib ? { tx: lib.x, ty: lib.y } : null,
      placePreview: placePreviewRef.current,
      // Hook for a future axis gizmo — currently only tracks selected cell elev.
      elevGizmoTarget,
      regionTiles: regionMark.tiles,
      regionBounds: regionMark.bounds,
      pulseRegion: Boolean(previewId),
      lampRange: lampMark
        ? {
            tx: lampMark.x,
            ty: lampMark.y,
            rangeTiles: lampMark.params.lampRange,
            coreTiles: lampMark.params.lampDiscCore,
            midTiles: lampMark.params.lampDiscMid,
            colorHex: lampMark.params.lampColor,
          }
        : null,
    });
    const pendingPayload = libSelectedRef.current;
    const pendingTile = libHoverRef.current;
    let assetPreview: EditorAssetPlacementPreview | null = null;
    if (pendingPayload && pendingTile && pendingPayload.kind !== "tile") {
      const placement = checkMapLibraryPlacement(
        pendingPayload,
        pendingTile,
        mapRef.current,
        pack,
        ts,
      );
      const elev = pendingTile.elev;
      if (pendingPayload.kind === "sprite") {
        assetPreview = {
          kind: "sprite",
          assetId: pendingPayload.spriteId,
          tx: pendingTile.x,
          ty: pendingTile.y,
          elev,
          valid: placement.valid,
        };
      } else if (pendingPayload.kind === "voxel") {
        assetPreview = {
          kind: "voxel",
          assetId: pendingPayload.modelId,
          tx: pendingTile.x,
          ty: pendingTile.y,
          elev,
          valid: placement.valid,
        };
      } else if (pendingPayload.kind === "light") {
        const source = lightSourceFromPreset(
          mapRef.current,
          pack,
          pendingPayload.presetId,
          pendingTile.x,
          pendingTile.y,
        );
        const defaults = resolveMapLight(mapRef.current);
        assetPreview = {
          kind: "light",
          assetId: pendingPayload.presetId,
          tx: pendingTile.x,
          ty: pendingTile.y,
          elev,
          valid: placement.valid,
          color: source.lampColor ?? defaults.lampColor,
          rangeTiles: source.lampRange ?? defaults.lampRange,
        };
      } else {
        const draft = libRegionDraftRef.current;
        assetPreview = {
          kind: "region",
          assetId: pendingPayload.regionKind,
          tx: pendingTile.x,
          ty: pendingTile.y,
          elev,
          valid: placement.valid,
          width: Math.max(1, draft?.w ?? 1),
          height: Math.max(1, draft?.h ?? 1),
        };
      }
    }
    three.setAssetPlacementPreview(assetPreview);
    const grab = objectGrabRef.current;
    const selectedRef = mapSelectionToWorldObjectRef(sel);
    const selectedKey =
      selectedRef && selectedRef.kind !== "tile"
        ? emberWorldObjectRefKey(selectedRef)
        : null;
    const selectedTransformKeys = selectionItemsRef.current.flatMap((item) => {
      if (item.kind === "group") {
        return emberSceneGroupObjectKeys(mapRef.current.sceneHierarchy, item.id);
      }
      const ref = mapSelectionToWorldObjectRef(item);
      return ref && ref.kind !== "tile" ? [emberWorldObjectRefKey(ref)] : [];
    });
    const transformBlocked = Boolean(
      (selectedKey &&
        (sceneState.isHidden(selectedKey) || sceneState.isLocked(selectedKey))) ||
        selectedTransformKeys.some(
          (key) => sceneState.isHidden(key) || sceneState.isLocked(key),
        ) ||
        (sel?.kind === "group" &&
          emberSceneGroupObjectKeys(mapRef.current.sceneHierarchy, sel.id).some(
            (key) => sceneState.isHidden(key) || sceneState.isLocked(key),
          )),
    );
    three.setTransformTarget(
      grab || transformBlocked
        ? null
        : selectionItemsRef.current.length > 1
          ? multiSelectionTransformTarget(
              selectionItemsRef.current,
              mapRef.current,
            )
          : selectionTransformTarget(
              sel,
              mapRef.current,
              ts,
              pack.sprites,
            ),
    );
    three.setDebugOverlays({
      showCollision,
      showElevation,
      showRegions,
      showSemantics,
    });
    three.setAtmospherePreview(showAtmosphereFx);
    three.setLookPreview(showLookFx);
  }, [
    dragCells,
    regionOutline,
    pack,
    showCollision,
    showElevation,
    showRegions,
    showSemantics,
    showAtmosphereFx,
    showLookFx,
  ]);
  syncThreeOverlaysRef.current = syncThreeOverlays;

  useEffect(() => {
    try {
      sessionStorage.setItem(
        "ember-map-show-hints",
        showEditorHints ? "1" : "0",
      );
    } catch {
      /* private mode / quota */
    }
  }, [showEditorHints]);

  const stagesForMap = useMemo(() => {
    const all = Object.values(pack.stages);
    const linked = all.filter((s) => s.mapId === map.id);
    return linked.length > 0 ? linked : all;
  }, [pack.stages, map.id]);

  const [activeStageId, setActiveStageId] = useState<string | null>(() => {
    const def = pack.meta.defaultStageId;
    if (def && pack.stages[def]?.mapId === map.id) return def;
    const linked = Object.values(pack.stages).find((s) => s.mapId === map.id);
    return linked?.id ?? pack.meta.defaultStageId ?? Object.keys(pack.stages)[0] ?? null;
  });

  useEffect(() => {
    if (activeStageId && pack.stages[activeStageId]) return;
    const def = pack.meta.defaultStageId;
    if (def && pack.stages[def]) {
      setActiveStageId(def);
      return;
    }
    setActiveStageId(stagesForMap[0]?.id ?? null);
  }, [activeStageId, pack.stages, pack.meta.defaultStageId, stagesForMap]);

  const activeStage = activeStageId ? pack.stages[activeStageId] : undefined;
  const activeSpawn =
    activeStage && pack.spawns[activeStage.spawnTableId]
      ? pack.spawns[activeStage.spawnTableId]
      : undefined;

  const selectTool = useCallback((next: Tool) => {
    setTool(next);
    if (next === "select") {
      setLibSelected(null);
      setLibRegionDraft(null);
      setSelection((cur) => (cur?.kind === "lib" ? null : cur));
      return;
    }
    if (next === "lightpick") {
      setDockPanel(null);
      setSelection((cur) =>
        cur?.kind === "light" || cur?.kind === "globalLight"
          ? cur
          : { kind: "globalLight" },
      );
      return;
    }
    if (next === "sprite" || next === "elevation" || next === "collision") {
      setDockPanel("tools");
    }
  }, []);

  const toggleDock = useCallback((id: DockPanel) => {
    setDockPanel((cur) => (cur === id ? null : id));
  }, []);

  useEffect(() => {
    if (!dockPanel && !selection) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const inDock = dockRef.current?.contains(t);
      if (dockPanel && !inDock) {
        setDockPanel(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (marqueeing.current) {
        marqueeing.current = false;
        marqueeAddRef.current = false;
        marqueeStartRef.current = null;
        marqueeEndRef.current = null;
        setMarqueeSel(null);
        return;
      }
      if (objectGrabRef.current) {
        setObjectGrab(null);
        return;
      }
      if (libSelectedRef.current) {
        setLibSelected(null);
        setLibHoverTile(null);
        setSelection((current) =>
          current?.kind === "lib" ? null : current,
        );
        return;
      }
      if (selectionRef.current || selectedRegionIdRef.current) {
        setSelection(null);
        setSelectedRegionId(null);
        return;
      }
      setDockPanel(null);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [dockPanel, selection, selectedRegionId]);

  const placeDockPop = useCallback(() => {
    if (!dockPanel) {
      setDockPopStyle({});
      return;
    }
    const bar = dockRef.current;
    const btn = dockBtnRefs.current[dockPanel];
    const pop = dockPopRef.current;
    if (!bar || !btn) return;
    const barRect = bar.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const popW = pop?.offsetWidth || 320;
    const center = btnRect.left + btnRect.width / 2 - barRect.left;
    const half = popW / 2;
    const pad = 8;
    const main = bar.parentElement;
    const outliner = main?.querySelector(".ember-outliner");
    const outlinerW =
      outliner instanceof HTMLElement ? outliner.getBoundingClientRect().width : 0;
    const minCenter = outlinerW + half + pad + 6;
    const left = Math.max(
      Math.max(half + pad, minCenter),
      Math.min(barRect.width - half - pad, center),
    );
    setDockPopStyle({
      left,
      transform: "translateX(-50%)",
    });
  }, [dockPanel]);

  useLayoutEffect(() => {
    placeDockPop();
    // Remeasure after pop content paints (width can change by panel type).
    const raf = requestAnimationFrame(() => placeDockPop());
    return () => cancelAnimationFrame(raf);
  }, [placeDockPop, dockPanel]);

  useEffect(() => {
    if (!dockPanel) return;
    const onResize = () => placeDockPop();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [dockPanel, placeDockPop]);
  const [stampSpriteId, setStampSpriteId] = useState<string | null>(() => {
    const ids = Object.keys(pack.sprites);
    return ids[0] ?? null;
  });
  const stampSpriteIdRef = useRef(stampSpriteId);
  stampSpriteIdRef.current = stampSpriteId;
  const commandState = useSyncExternalStore(
    commandStack.subscribe,
    commandStack.getState,
    commandStack.getState,
  );
  const historyLen = commandState.undoDepth;
  const redoLen = commandState.redoDepth;
  const [dragSel, setDragSel] = useState<{
    start: TilePos;
    end: TilePos;
  } | null>(null);
  const [marqueeSel, setMarqueeSel] = useState<{
    start: TilePos;
    end: TilePos;
    elev: number;
    add: boolean;
  } | null>(null);
  const marqueeSelRef = useRef(marqueeSel);
  marqueeSelRef.current = marqueeSel;
  toolRef.current = tool;

  const tileset: EmberTileset | undefined = pack.tilesets[map.tilesetId];
  const libPlacementCheck =
    libSelected && libHoverTile
      ? checkMapLibraryPlacement(
          libSelected,
          libHoverTile,
          map,
          pack,
          tileset,
        )
      : null;

  useEffect(() => {
    if (!libSelectedRef.current) return;
    setLibHoverTile((current) => {
      if (!current) return current;
      const mode = effectiveMapLibraryPlacementMode(
        libSelectedRef.current?.kind,
        libraryPlacementMode,
      );
      if (mode === "surface") return null;
      return resolveMapLibraryPlacementTarget(
        mapRef.current,
        mode,
        current,
        null,
        brushElevRef.current,
      );
    });
  }, [brushElev, libraryPlacementMode]);
  const selectedTile = tileset?.tiles.find((t) => t.id === tileId);

  const lanternSources = useMemo(
    () => (tileset ? listLanternSources(map, tileset, pack.sprites) : []),
    [map, tileset, pack.sprites],
  );
  const selectedLantern = useMemo(
    () =>
      selectedLightId
        ? (lanternSources.find((s) => s.id === selectedLightId) ?? null)
        : null,
    [lanternSources, selectedLightId],
  );
  const globalLight = useMemo(() => resolveMapLight(map), [map]);
  const selectedWorldObject = useMemo(() => {
    const ref = mapSelectionToWorldObjectRef(selection);
    return ref ? getEmberWorldObject(map, ref, { pack, tileset }) : null;
  }, [map, pack, selection, tileset]);
  const sceneObjects = useMemo(
    () => listEmberWorldObjects(map, { pack, tileset }),
    [map, pack, tileset],
  );
  const sceneGroups = map.sceneHierarchy?.groups ?? [];
  const selectedObjectKey = useMemo(() => {
    const ref = mapSelectionToWorldObjectRef(selection);
    return ref && ref.kind !== "tile" ? emberWorldObjectRefKey(ref) : null;
  }, [selection]);
  const selectedObjectKeys = useMemo(
    () =>
      new Set(
        selectionState.items.flatMap((item) => {
          if (item.kind === "group") {
            return emberSceneGroupObjectKeys(map.sceneHierarchy, item.id);
          }
          const ref = mapSelectionToWorldObjectRef(item);
          return ref && ref.kind !== "tile" ? [emberWorldObjectRefKey(ref)] : [];
        }),
      ),
    [map.sceneHierarchy, selectionState.items],
  );
  const selectedSceneObjects = useMemo(
    () => sceneObjects.filter((object) => selectedObjectKeys.has(object.key)),
    [sceneObjects, selectedObjectKeys],
  );
  const selectedSceneGroup =
    selection?.kind === "group"
      ? sceneGroups.find((group) => group.id === selection.id) ?? null
      : null;
  const selectedObjectLocked = Boolean(
    selectedObjectKey && lockedObjectKeys.has(selectedObjectKey),
  );
  const selectedObjectHidden = Boolean(
    selectedObjectKey && hiddenObjectKeys.has(selectedObjectKey),
  );
  const isSceneObjectLocked = useCallback(
    (kind: "voxel" | "sprite" | "light" | "region", id: string) =>
      sceneState.isLocked(`${kind}:${id}`),
    [sceneState],
  );

  useEffect(() => {
    sceneState.prune(sceneObjects.map((object) => object.key));
  }, [sceneObjects, sceneState]);

  useEffect(() => {
    if (
      selectedRegionId &&
      !map.regions.some((r) => r.id === selectedRegionId)
    ) {
      setSelectedRegionId(null);
    }
  }, [map.regions, selectedRegionId]);

  const applyStairDir = useCallback(
    (dir: RampDir) => {
      setStairDir(dir);
      const id = findStairTileId(tileset, dir);
      if (id != null) setTileId(id);
    },
    [tileset],
  );

  const rotateStair = useCallback(
    (delta = 1) => {
      applyStairDir(rotateRampDir(stairDir, delta));
    },
    [applyStairDir, stairDir],
  );

  mapRef.current = map;
  packRef.current = pack;
  onChangeRef.current = onChange;

  useEffect(() => {
    documentStore.syncExternal(map);
  }, [documentStore, map]);

  const publishMap = useCallback(
    (
      next: EmberMap,
      source: EditorDocumentChangeSource = "command",
    ) => {
      documentStore.replace(next, {
        source,
        dirty: source !== "external",
      });
      mapRef.current = next;
      onChangeRef.current(next);
    },
    [documentStore],
  );

  useEffect(() => {
    editorCore.resetDocument(map);
    // A map id is a separate editor document and must not share undo/selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.id]);

  useEffect(() => {
    const next = ensureMapLayers(map);
    if (
      next.layers.length !== map.layers.length ||
      !map.layers.some((l) => l.name === "elevation") ||
      !map.layers.some((l) => l.name === "height")
    ) {
      publishMap(next, "normalization");
    }
  }, [map, publishMap]);

  const focusRegion = useCallback(
    (region: EmberMapRegion) => {
      const { cx, cy } = regionFootprintCenter(region);
      const tx = Math.max(0, Math.min(mapRef.current.width - 1, Math.floor(cx)));
      const ty = Math.max(0, Math.min(mapRef.current.height - 1, Math.floor(cy)));
      threePreviewRef.current?.focusTile(tx, ty);
      const wrap = canvasWrapRef.current;
      if (!wrap) return;
      const { px, py, ts } = tileCanvasTopLeft(
        mapRef.current,
        tx,
        ty,
        scaleRef.current,
        viewModeRef.current,
      );
      const targetX = px + ts / 2;
      const targetY = py + ts / 2;
      wrap.scrollLeft = Math.max(0, targetX - wrap.clientWidth / 2);
      wrap.scrollTop = Math.max(0, targetY - wrap.clientHeight / 2);
    },
    [],
  );

  const hoverRegionPeer = useCallback(
    (id: string | null) => {
      setPreviewRegionId(id);
      if (!id) return;
      const r = mapRef.current.regions.find((x) => x.id === id);
      if (r) focusRegion(r);
    },
    [focusRegion],
  );

  const blitBaseAndOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = canvasWrapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cssW = Math.max(64, wrap?.clientWidth || canvas.width || 64);
    const cssH = Math.max(64, wrap?.clientHeight || canvas.height || 64);
    if (canvas.width !== cssW || canvas.height !== cssH) {
      canvas.width = cssW;
      canvas.height = cssH;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Three.js is the visual map; 2D canvas is picks + marks only.

    const m = ensureMapLayers(mapRef.current);
    const three = threePreviewRef.current;

    const markAt = (tx: number, ty: number) => {
      const projected = three?.projectTile(tx, ty, tileSurfaceElev(m, tx, ty));
      if (projected) {
        return {
          px: projected.px,
          py: projected.py,
          ts: projected.ts,
          shelfH: projected.ts,
        };
      }
      return tileCanvasTopLeft(m, tx, ty, scale, viewModeRef.current);
    };

    const showLightMarks =
      toolRef.current === "lightpick" ||
      selectedLightIdRef.current != null ||
      dockPanelRef.current === "light";
    if (showLightMarks && tileset) {
      const sources = listLanternSources(m, tileset, pack.sprites);
      const selectedId = selectedLightIdRef.current;
      const pickMode = toolRef.current === "lightpick";
      ctx.save();
      for (const src of sources) {
        const { px, py, ts, shelfH } = markAt(src.x, src.y);
        const active = src.id === selectedId;
        const markH = Math.max(2, shelfH);
        ctx.strokeStyle = active
          ? "rgba(255, 210, 120, 0.98)"
          : pickMode
            ? "rgba(255, 180, 80, 0.75)"
            : "rgba(255, 170, 72, 0.45)";
        ctx.lineWidth = active
          ? Math.max(2, scale * 1.1)
          : Math.max(1, scale * 0.75);
        ctx.beginPath();
        ctx.arc(
          px + ts / 2,
          py + markH / 2,
          Math.min(ts, markH) * (active ? 0.42 : 0.36),
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        if (active || pickMode) {
          ctx.fillStyle = active
            ? "rgba(255, 200, 100, 0.22)"
            : "rgba(255, 170, 72, 0.1)";
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }, [scale, tileset, pack.sprites]);

  /** Committed map + live gizmo/grab preview (visual only until commit). */
  const displayMap = useMemo(
    () => {
      const preview =
        transformMapPreview ?? mapWithObjectGrab(map, objectGrab);
      return mapWithoutHiddenWorldObjects(preview, hiddenObjectKeys);
    },
    [hiddenObjectKeys, map, objectGrab, transformMapPreview],
  );
  displayMapRef.current = displayMap;

  // Three.js isometric viewport — fills the wrap (not a scrolled 2D bake).
  useEffect(() => {
    const host = threeHostRef.current;
    const wrap = canvasWrapRef.current;
    const canvas = canvasRef.current;
    if (!host || !wrap || !canvas || !tileset) return;

    const syncViewport = () => {
      const cssW = Math.max(64, wrap.clientWidth);
      const cssH = Math.max(64, wrap.clientHeight);
      if (canvas.width !== cssW || canvas.height !== cssH) {
        canvas.width = cssW;
        canvas.height = cssH;
      }
      if (!threePreviewRef.current) {
        threePreviewRef.current = createEditorThreePreview(host);
        threePreviewRef.current.onTransformCommit((commit) => {
          transformCommitRef.current(commit);
        });
        threePreviewRef.current.onTransformDragging((dragging) => {
          transformDraggingRef.current = dragging;
          if (!dragging) {
            if (transformMapPreviewRafRef.current) {
              cancelAnimationFrame(transformMapPreviewRafRef.current);
              transformMapPreviewRafRef.current = 0;
            }
            setTransformMapPreview(null);
          }
          if (dragging) {
            hoverPickRef.current = null;
            syncThreeOverlaysRef.current();
          }
        });
        threePreviewRef.current.onTransformPreview((preview) => {
          transformLivePreviewRef.current = preview;
          if (transformMapPreviewRafRef.current) {
            cancelAnimationFrame(transformMapPreviewRafRef.current);
            transformMapPreviewRafRef.current = 0;
          }
          if (!preview) {
            setTransformMapPreview(null);
            if (transformPreviewRef.current) {
              transformPreviewRef.current = false;
              clearPlacePreviewRef.current();
            }
            syncThreeOverlaysRef.current();
            return;
          }
          transformMapPreviewRafRef.current = requestAnimationFrame(() => {
            transformMapPreviewRafRef.current = 0;
            setTransformMapPreview(
              mapWithTransformPreview(
                mapRef.current,
                preview,
                selectionItemsRef.current,
                tileset,
                pack.sprites,
              ),
            );
          });
          if (preview.mode !== "translate") {
            if (transformPreviewRef.current) {
              transformPreviewRef.current = false;
              clearPlacePreviewRef.current();
              syncThreeOverlaysRef.current();
            }
            return;
          }
          if (preview.kind !== "tile") {
            // Props/lights/groups preview their actual temporary map pose.
            // A second tile marker beneath them makes the floor look selected.
            transformPreviewRef.current = false;
            clearPlacePreviewRef.current();
            syncThreeOverlaysRef.current();
            return;
          }
          const m = mapRef.current;
          const ts = m.tileSize;
          const storyH = blockStoryHeight(ts);
          const tx = Math.max(
            0,
            Math.min(m.width - 1, Math.floor(preview.position.x / ts)),
          );
          const ty = Math.max(
            0,
            Math.min(m.height - 1, Math.floor(preview.position.z / ts)),
          );
          const elev = clampElevation(
            elevFromWorldY(preview.position.y, storyH),
          );
          transformPreviewRef.current = true;
          updatePlacePreviewRef.current({ tx, ty, elev, mode: "place" });
          syncThreeOverlaysRef.current();
        });
      }
      threePreviewRef.current.onLoadProgress((progress) => {
        setWorldLoadRef.current(
          progress.ratio >= 1
            ? { active: false, ratio: 1, labelRu: progress.labelRu }
            : {
                active: true,
                ratio: progress.ratio,
                labelRu: progress.labelRu,
              },
        );
      });
      threePreviewRef.current.setTransformPointerDom(canvas);
      threePreviewRef.current.setMap(
        ensureMapLayers(displayMap),
        tileset,
        pack,
        {
          viewMode,
          cssW,
          cssH,
          scale,
        },
      );
      blitBaseAndOverlay();
      syncThreeOverlays();
    };

    syncViewport();
    const ro = new ResizeObserver(() => syncViewport());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [
    viewMode,
    tileset,
    pack,
    displayMap,
    scale,
    blitBaseAndOverlay,
    syncThreeOverlays,
  ]);

  useEffect(() => {
    threePreviewRef.current?.setViewPreset(viewMode);
    blitBaseAndOverlay();
  }, [viewMode, blitBaseAndOverlay]);

  useLayoutEffect(() => {
    setWorldLoad({ active: true, ratio: 0.04, labelRu: "Местность…" });
  }, [map.id]);

  useEffect(() => {
    return () => {
      if (transformMapPreviewRafRef.current) {
        cancelAnimationFrame(transformMapPreviewRafRef.current);
        transformMapPreviewRafRef.current = 0;
      }
      threePreviewRef.current?.dispose();
      threePreviewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Ctrl+wheel = locked edit Z plane; Ctrl+Shift+wheel = logical grid scale.
      if (e.ctrlKey || e.metaKey) {
        if (e.shiftKey) {
          const prev = scaleRef.current;
          const idx = SCALE_STEPS.findIndex((n) => n === prev);
          const i = idx >= 0 ? idx : 1;
          const dir = e.deltaY < 0 ? 1 : -1;
          const next =
            SCALE_STEPS[
              Math.max(0, Math.min(SCALE_STEPS.length - 1, i + dir))
            ]!;
          if (next !== prev) setScale(next);
          return;
        }
        const dir = e.deltaY < 0 ? 1 : -1;
        setBrushElev((prev) => clampElevation(prev + dir));
        return;
      }
      threePreviewRef.current?.zoomBy(e.deltaY > 0 ? 1.12 : 1 / 1.12);
      blitBaseAndOverlay();
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
    // blitBaseAndOverlay is stable enough for zoom redraw; avoid rebinding wheel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Light marks stay on 2D overlay; selection/hover glow is Three edge outlines.
  useEffect(() => {
    dragSelRef.current = dragSel;
    libHoverRef.current = libHoverTile;
    if (overlayRafRef.current) cancelAnimationFrame(overlayRafRef.current);
    overlayRafRef.current = requestAnimationFrame(() => {
      overlayRafRef.current = 0;
      blitBaseAndOverlay();
      syncThreeOverlays();
    });
    return () => {
      if (overlayRafRef.current) cancelAnimationFrame(overlayRafRef.current);
    };
  }, [
    dragSel,
    marqueeSel,
    libHoverTile,
    libSelected,
    libRegionDraft,
    objectGrab,
    selection,
    selectionState.revision,
    selectedRegionId,
    previewRegionId,
    dockPanel,
    tool,
    placePreview,
    brushElev,
    showCollision,
    showElevation,
    showRegions,
    showSemantics,
    showAtmosphereFx,
    showLookFx,
    blitBaseAndOverlay,
    syncThreeOverlays,
  ]);

  // Drop grab if selection no longer matches the grabbed object.
  useEffect(() => {
    setObjectGrab((g) => {
      if (!g) return null;
      if (!selection) return null;
      if (selection.kind !== g.kind) return null;
      if (
        (selection.kind === "voxel" || selection.kind === "sprite") &&
        selection.id !== g.id
      ) {
        return null;
      }
      return g;
    });
  }, [selection]);

  const pushHistory = useCallback(
    (prev: EmberMap, label = "Изменение карты") => {
      commandStack.pushSnapshotBoundary(label, prev, cloneMap);
    },
    [commandStack],
  );

  const replaceWorldSelection = useCallback(
    (
      objects: readonly EmberWorldObject[],
      primary: EmberWorldObject | null,
    ) => {
      selectionService.replaceMany(
        objects.map(selectionFromWorldObject),
        primary ? selectionFromWorldObject(primary) : null,
      );
      if (primary?.kind === "region") setSelectedRegionId(primary.id);
    },
    [selectionService],
  );

  const translateWorldSelection = useCallback(
    (objects: readonly EmberWorldObject[], dx: number, dy: number) => {
      const editable = objects.filter((object) => !sceneState.isLocked(object.key));
      if (editable.length === 0) {
        onSaved("Выбранные объекты заблокированы в Outliner.");
        return;
      }
      const current = mapRef.current;
      pushHistory(current, `Переместить ${editable.length} объектов`);
      publishMap(
        translateEmberWorldObjects(
          current,
          editable.map((object) => object.ref),
          dx,
          dy,
        ),
      );
      if (editable.length !== objects.length) {
        onSaved(`Перемещено ${editable.length}; заблокированные пропущены.`);
      }
    },
    [onSaved, publishMap, pushHistory, sceneState],
  );

  const deleteWorldSelection = useCallback(
    (objects: readonly EmberWorldObject[]) => {
      const editable = objects.filter((object) => !sceneState.isLocked(object.key));
      const tileItems = selectionService
        .getState()
        .items.filter(
          (item): item is Extract<MapSelection, { kind: "tile" }> =>
            item.kind === "tile",
        );
      if (editable.length === 0 && tileItems.length === 0) {
        if (objects.length > 0) {
          onSaved("Выбранные объекты заблокированы в Outliner.");
        }
        return;
      }
      const current = mapRef.current;
      const parts: string[] = [];
      if (editable.length > 0) parts.push(`${editable.length} объектов`);
      if (tileItems.length > 0) parts.push(`${tileItems.length} блоков`);
      pushHistory(current, `Удалить ${parts.join(" и ")}`);
      const refs = editable.map((object) => object.ref);
      const lightRefs = refs.filter(
        (ref): ref is Extract<EmberWorldObjectRef, { kind: "light" }> =>
          ref.kind === "light",
      );
      let next =
        editable.length > 0
          ? removeEmberWorldObjects(
              current,
              refs.filter((ref) => ref.kind !== "light"),
            )
          : current;
      if (tileset) {
        for (const ref of lightRefs) {
          next = removeLanternSource(next, tileset, pack.sprites, ref.id);
        }
        if (lightRefs.length > 0) {
          next = normalizeEmberSceneHierarchy(next);
        }
      } else if (lightRefs.length > 0) {
        next = removeEmberWorldObjects(next, lightRefs);
      }
      if (tileItems.length > 0) {
        next = ensureMapLayers(cloneMap(next));
        for (const tile of tileItems) {
          const elev =
            tile.elev ?? topOccupiedElevAt(next, tile.tx, tile.ty);
          if (elev == null) continue;
          clearElevTile(next, tile.tx, tile.ty, elev);
        }
      }
      publishMap(next);
      selectionService.clear();
      const skipped = objects.length - editable.length;
      onSaved(
        skipped > 0
          ? `Удалено ${parts.join(" и ")}; заблокированные пропущены.`
          : `Удалено: ${parts.join(" и ")}`,
      );
    },
    [
      onSaved,
      pack.sprites,
      publishMap,
      pushHistory,
      sceneState,
      selectionService,
      tileset,
    ],
  );

  const duplicateWorldSelection = useCallback(
    (objects: readonly EmberWorldObject[]) => {
      const editable = objects.filter(
        (object) => !sceneState.isLocked(object.key) && object.kind !== "tile",
      );
      if (editable.length === 0) {
        onSaved("Нечего дублировать — выбери объект или разблокируй его.");
        return;
      }
      const current = mapRef.current;
      pushHistory(current, `Дублировать ${editable.length} объектов`);
      const next = cloneMap(current);
      const created: MapSelection[] = [];
      const stamp = Date.now().toString(36);
      const bumpX = (x: number) => Math.min(next.width - 1, x + 1);
      for (const [index, object] of editable.entries()) {
        if (object.kind === "voxel") {
          const src = (next.voxelProps ?? []).find((p) => p.id === object.id);
          if (!src) continue;
          const newId = `vx_${stamp}_${index}`;
          next.voxelProps = [
            ...(next.voxelProps ?? []),
            { ...src, id: newId, x: bumpX(src.x) },
          ];
          created.push({ kind: "voxel", id: newId });
        } else if (object.kind === "sprite") {
          const src = (next.sprites ?? []).find((p) => p.id === object.id);
          if (!src) continue;
          const newId = `sp_${stamp}_${index}`;
          next.sprites = [
            ...(next.sprites ?? []),
            { ...src, id: newId, x: bumpX(src.x) },
          ];
          created.push({ kind: "sprite", id: newId });
        } else if (object.kind === "light") {
          const src = (next.lights ?? []).find((p) => p.id === object.id);
          if (!src) continue;
          const newId = `light_${stamp}_${index}`;
          next.lights = [
            ...(next.lights ?? []),
            { ...src, id: newId, x: bumpX(src.x) },
          ];
          created.push({ kind: "light", id: newId });
        } else if (object.kind === "region") {
          const src = next.regions.find((p) => p.id === object.id);
          if (!src) continue;
          const newId = newRegionId(next.regions, src.kind);
          next.regions = [
            ...next.regions,
            {
              ...src,
              id: newId,
              x: Math.min(next.width - src.w, src.x + 1),
            },
          ];
          created.push({ kind: "region", id: newId });
        }
      }
      if (created.length === 0) {
        onSaved("Эти объекты нельзя дублировать (нет авторской копии).");
        return;
      }
      publishMap(normalizeEmberSceneHierarchy(next));
      selectionService.replaceMany(created, created.at(-1) ?? null);
      onSaved(`Продублировано: ${created.length}`);
    },
    [onSaved, publishMap, pushHistory, sceneState, selectionService],
  );

  const setWorldSelectionElevation = useCallback(
    (elevation: number | "floor") => {
      const editable = selectedSceneObjects.filter(
        (object) =>
          (object.kind === "voxel" || object.kind === "sprite") &&
          !sceneState.isLocked(object.key),
      );
      if (editable.length === 0) {
        onSaved("В выборе нет доступных вокселей или спрайтов с Transform Z.");
        return;
      }
      const current = mapRef.current;
      const next = setEmberWorldObjectsElevation(
        current,
        editable.map((object) => object.ref),
        elevation,
      );
      if (next === current) {
        onSaved(
          elevation === "floor"
            ? "Объекты уже привязаны к поверхности."
            : `У объектов уже установлен Z${elevation}.`,
        );
        return;
      }
      pushHistory(
        current,
        elevation === "floor"
          ? `Drop to Floor · ${editable.length}`
          : `Установить Z${elevation} · ${editable.length}`,
      );
      publishMap(next);
      onSaved(
        elevation === "floor"
          ? `К поверхности привязано: ${editable.length}`
          : `Z${elevation} установлен для ${editable.length} объектов`,
      );
    },
    [onSaved, publishMap, pushHistory, sceneState, selectedSceneObjects],
  );

  const setWorldSelectionLocked = useCallback(
    (locked: boolean) => {
      sceneState.setLockedMany(
        selectedSceneObjects.map((object) => object.key),
        locked,
      );
      if (locked) setObjectGrab(null);
    },
    [sceneState, selectedSceneObjects],
  );

  const setWorldSelectionHidden = useCallback(
    (hidden: boolean) => {
      sceneState.setHiddenMany(
        selectedSceneObjects.map((object) => object.key),
        hidden,
      );
      if (hidden) setObjectGrab(null);
    },
    [sceneState, selectedSceneObjects],
  );

  const sceneObjectsForGroup = useCallback(
    (id: string) => {
      const keys = new Set(emberSceneGroupObjectKeys(mapRef.current.sceneHierarchy, id));
      return sceneObjects.filter((object) => keys.has(object.key));
    },
    [sceneObjects],
  );

  const translateSceneGroup = useCallback(
    (id: string, dx: number, dy: number) => {
      const objects = sceneObjectsForGroup(id);
      if (objects.length === 0) return;
      if (objects.some((object) => sceneState.isLocked(object.key))) {
        onSaved("Группа содержит заблокированные объекты. Transform отменён.");
        return;
      }
      const current = mapRef.current;
      const group = current.sceneHierarchy?.groups.find((candidate) => candidate.id === id);
      if (!group) return;
      pushHistory(current, `Переместить ${group.name}`);
      const moved = translateEmberWorldObjects(
        current,
        objects.map((object) => object.ref),
        dx,
        dy,
      );
      publishMap(translateEmberSceneGroupTransforms(moved, id, dx, dy));
    },
    [onSaved, publishMap, pushHistory, sceneObjectsForGroup, sceneState],
  );

  const rotateSceneGroup = useCallback(
    (id: string, quarterTurns: number) => {
      const objects = sceneObjectsForGroup(id);
      if (objects.length === 0) return;
      if (objects.some((object) => sceneState.isLocked(object.key))) {
        onSaved("Группа содержит заблокированные объекты. Transform отменён.");
        return;
      }
      const current = mapRef.current;
      const group = current.sceneHierarchy?.groups.find((candidate) => candidate.id === id);
      if (!group) return;
      pushHistory(current, `Повернуть ${group.name}`);
      const rotated = rotateEmberWorldObjectsAroundPivot(
          current,
          objects.map((object) => object.ref),
          group.pivot,
          quarterTurns,
        );
      publishMap(rotateEmberSceneGroupTransforms(rotated, id, quarterTurns));
    },
    [onSaved, publishMap, pushHistory, sceneObjectsForGroup, sceneState],
  );

  const scaleSceneGroup = useCallback(
    (id: string, scale: { x: number; y: number; z: number }) => {
      const objects = sceneObjectsForGroup(id);
      if (objects.length === 0) return;
      if (objects.some((object) => sceneState.isLocked(object.key))) {
        onSaved("Группа содержит заблокированные объекты. Transform отменён.");
        return;
      }
      const current = mapRef.current;
      const group = current.sceneHierarchy?.groups.find(
        (candidate) => candidate.id === id,
      );
      if (!group) return;
      pushHistory(current, `Масштабировать ${group.name}`);
      const scaled = scaleEmberWorldObjectsAroundPivot(
        current,
        objects.map((object) => object.ref),
        group.pivot,
        scale,
      );
      publishMap(scaleEmberSceneGroupTransforms(scaled, id, scale));
    },
    [onSaved, publishMap, pushHistory, sceneObjectsForGroup, sceneState],
  );

  const renameSceneGroup = useCallback(
    (id: string, name: string) => {
      const current = mapRef.current;
      const next = renameEmberSceneGroup(current, id, name);
      if (next === current) return;
      pushHistory(current, "Переименовать группу");
      publishMap(next);
    },
    [publishMap, pushHistory],
  );

  const removeSceneGroup = useCallback(
    (id: string) => {
      const current = mapRef.current;
      const group = current.sceneHierarchy?.groups.find((candidate) => candidate.id === id);
      if (!group) return;
      pushHistory(current, `Разгруппировать ${group.name}`);
      publishMap(removeEmberSceneGroup(current, id));
      if (selectionRef.current?.kind === "group" && selectionRef.current.id === id) {
        selectionService.clear();
      }
      onSaved(`${group.name} разгруппирована`);
    },
    [onSaved, publishMap, pushHistory, selectionService],
  );

  const duplicateSceneGroup = useCallback(
    (id: string) => {
      const current = mapRef.current;
      const source = current.sceneHierarchy?.groups.find((group) => group.id === id);
      if (!source) return;
      const result = duplicateEmberSceneGroup(current, id);
      if (!result.groupId) return;
      pushHistory(current, `Дублировать ${source.name}`);
      publishMap(result.map);
      selectionService.setPrimary({ kind: "group", id: result.groupId });
      onSaved(`${source.name}: создана независимая копия`);
    },
    [onSaved, publishMap, pushHistory, selectionService],
  );

  const reparentSceneObjects = useCallback(
    (objectKeys: readonly string[], groupId?: string) => {
      const current = mapRef.current;
      const next = assignEmberSceneObjectsToGroup(current, objectKeys, groupId);
      if (next === current) return;
      pushHistory(current, groupId ? "Добавить объекты в группу" : "Переместить объекты в корень");
      publishMap(next);
    },
    [publishMap, pushHistory],
  );

  const reparentSceneGroup = useCallback(
    (id: string, parentGroupId?: string) => {
      const current = mapRef.current;
      const next = setEmberSceneGroupParent(current, id, parentGroupId);
      if (next === current) return;
      pushHistory(current, parentGroupId ? "Изменить Parent группы" : "Переместить группу в корень");
      publishMap(next);
    },
    [publishMap, pushHistory],
  );

  const editSelectedWorldObjectField = useCallback(
    (edit: EmberInspectorFieldEdit) => {
      const ref = mapSelectionToWorldObjectRef(selectionRef.current);
      if (!ref) return;
      if (ref.kind !== "tile" && sceneState.isLocked(emberWorldObjectRefKey(ref))) {
        onSaved("Объект заблокирован в Outliner.");
        return;
      }
      const current = mapRef.current;
      const schema = getEmberInspectorComponentSchema(edit.componentType);
      pushHistory(current, `Изменить ${schema?.label ?? edit.componentType}`);
      const next = applyEmberInspectorFieldEdit(current, ref, edit);
      publishMap(next);
    },
    [onSaved, publishMap, pushHistory, sceneState],
  );

  const setSelectedWorldObjectComponent = useCallback(
    (component: EmberOptionalComponentType, present: boolean) => {
      const ref = mapSelectionToWorldObjectRef(selectionRef.current);
      if (!ref) return;
      if (
        ref.kind !== "tile" &&
        sceneState.isLocked(emberWorldObjectRefKey(ref))
      ) {
        onSaved("Объект заблокирован в Outliner.");
        return;
      }
      const current = mapRef.current;
      const next = setEmberWorldObjectComponentPresence(
        current,
        ref,
        component,
        present,
      );
      if (next === current) return;
      pushHistory(
        current,
        `${present ? "Добавить" : "Удалить"} ${component}`,
      );
      publishMap(next);
    },
    [onSaved, publishMap, pushHistory, sceneState],
  );

  const saveLibraryVoxelModel = useCallback(
    (modelId: string, nextModel: NonNullable<EmberPack["voxelModels"]>[string], label: string) => {
      if (!onPackChange) {
        onSaved("Изменение библиотеки недоступно без сохранения пака.");
        return;
      }
      const nextModels = { ...pack.voxelModels, [modelId]: nextModel };
      onPackChange(packWithVoxels(pack, nextModels, pack.voxelScenes));
      void writeVoxelRegistry(nextModels, pack.voxelScenes ?? {}, {
        dirtyIds: [modelId],
      }).then((result) => {
        onSaved(result.ok ? label : `Ошибка записи ассета: ${result.error}`);
      });
    },
    [onPackChange, onSaved, pack],
  );

  const saveLibrarySprite = useCallback(
    (spriteId: string, nextSprite: EmberPack["sprites"][string], label: string) => {
      if (!onPackChange) {
        onSaved("Изменение библиотеки недоступно без сохранения пака.");
        return;
      }
      const nextSprites = {
        ...pack.sprites,
        [spriteId]: normalizePixelSprite(nextSprite),
      };
      onPackChange({ ...pack, sprites: nextSprites });
      void writeEmberJson("sprites/registry.json", {
        paletteFavorites: pack.paletteFavorites ?? [],
        sprites: Object.values(nextSprites).map(serializePixelSprite),
      }).then((result) => {
        onSaved(result.ok ? label : `Ошибка записи ассета: ${result.error}`);
      });
    },
    [onPackChange, onSaved, pack],
  );

  const saveLibraryTile = useCallback(
    (tileId: number, nextTile: EmberTilesetTile, label: string) => {
      if (!onPackChange || !tileset) {
        onSaved("Изменение тайлсета недоступно без сохранения пака.");
        return;
      }
      const nextTileset = {
        ...tileset,
        tiles: tileset.tiles.map((tile) =>
          tile.id === tileId ? nextTile : tile,
        ),
      };
      onPackChange({
        ...pack,
        tilesets: { ...pack.tilesets, [nextTileset.id]: nextTileset },
      });
      void writeEmberJson(`tilesets/${nextTileset.id}.json`, nextTileset).then(
        (result) => {
          onSaved(result.ok ? label : `Ошибка записи ассета: ${result.error}`);
        },
      );
    },
    [onPackChange, onSaved, pack, tileset],
  );

  const saveLibraryLightPreset = useCallback(
    (presetId: string, nextPreset: EmberPack["lightPresets"][string], label: string) => {
      if (!onPackChange) {
        onSaved("Изменение библиотеки недоступно без сохранения пака.");
        return;
      }
      const nextPresets = { ...pack.lightPresets, [presetId]: nextPreset };
      onPackChange({ ...pack, lightPresets: nextPresets });
      void writeEmberJson(
        "lights/registry.json",
        lightsFileFromPresets(nextPresets),
      ).then((result) => {
        onSaved(result.ok ? label : `Ошибка записи ассета: ${result.error}`);
      });
    },
    [onPackChange, onSaved, pack],
  );

  const editLibraryObjectField = useCallback(
    (edit: EmberInspectorFieldEdit) => {
      const selection = selectionRef.current;
      if (selection?.kind !== "lib") return;
      const payload = selection.payload;
      if (payload.kind === "voxel") {
        const model = pack.voxelModels?.[payload.modelId];
        if (!model) return;
        const next = applyEmberVoxelAssetInspectorFieldEdit(model, edit);
        if (JSON.stringify(next) !== JSON.stringify(model)) {
          saveLibraryVoxelModel(
            model.id,
            next,
            `${model.nameRu?.trim() || model.id}: ассет обновлён.`,
          );
        }
        return;
      }
      if (payload.kind === "sprite") {
        const sprite = pack.sprites?.[payload.spriteId];
        if (!sprite) return;
        const next = applyEmberSpriteAssetInspectorFieldEdit(sprite, edit);
        if (JSON.stringify(next) !== JSON.stringify(sprite)) {
          saveLibrarySprite(sprite.id, next, `${sprite.nameRu?.trim() || sprite.id}: ассет обновлён.`);
        }
        return;
      }
      if (payload.kind === "tile") {
        const tile = tileset?.tiles.find((item) => item.id === payload.tileId);
        if (!tile) return;
        const next = applyEmberTileAssetInspectorFieldEdit(tile, edit);
        if (JSON.stringify(next) !== JSON.stringify(tile)) {
          saveLibraryTile(tile.id, next, `${tile.name}: ассет обновлён.`);
        }
        return;
      }
      if (payload.kind === "light") {
        const preset = pack.lightPresets?.[payload.presetId];
        if (!preset) return;
        const next = applyEmberLightAssetInspectorFieldEdit(preset, edit);
        if (JSON.stringify(next) !== JSON.stringify(preset)) {
          saveLibraryLightPreset(preset.id, next, `${preset.nameRu}: пресет света обновлён.`);
        }
        return;
      }
      const draft = libRegionDraftRef.current;
      if (!draft || draft.kind !== payload.regionKind) return;
      const nextMap = applyEmberInspectorFieldEdit(
        { ...mapRef.current, regions: [draft] },
        { kind: "region", id: draft.id },
        edit,
      );
      if (nextMap.regions[0]) setLibRegionDraft(nextMap.regions[0]);
    },
    [pack.lightPresets, pack.sprites, pack.voxelModels, saveLibraryLightPreset, saveLibrarySprite, saveLibraryTile, saveLibraryVoxelModel, tileset],
  );

  const setLibraryObjectComponent = useCallback(
    (component: EmberOptionalComponentType, present: boolean) => {
      if (component === "interactivity") return;
      const selection = selectionRef.current;
      if (selection?.kind !== "lib") return;
      const payload = selection.payload;
      if (payload.kind === "voxel") {
        const model = pack.voxelModels?.[payload.modelId];
        if (!model) return;
        saveLibraryVoxelModel(
          model.id,
          setEmberVoxelAssetComponentPresence(model, component, present),
          `${model.nameRu?.trim() || model.id}: ${present ? "добавлен" : "удалён"} ${component}.`,
        );
        return;
      }
      if (component !== "collider") return;
      if (payload.kind === "sprite") {
        const sprite = pack.sprites?.[payload.spriteId];
        if (!sprite) return;
        saveLibrarySprite(
          sprite.id,
          setEmberSpriteAssetComponentPresence(sprite, component, present),
          `${sprite.nameRu?.trim() || sprite.id}: ${present ? "добавлен" : "удалён"} Collider.`,
        );
        return;
      }
      if (payload.kind === "tile") {
        const tile = tileset?.tiles.find((item) => item.id === payload.tileId);
        if (!tile) return;
        saveLibraryTile(
          tile.id,
          setEmberTileAssetComponentPresence(tile, component, present),
          `${tile.name}: ${present ? "добавлен" : "удалён"} Collider.`,
        );
      }
    },
    [pack.sprites, pack.voxelModels, saveLibrarySprite, saveLibraryTile, saveLibraryVoxelModel, tileset],
  );

  const editSelectedWorldObjectTransform = useCallback(
    (space: EmberWorldTransformSpace, patch: EmberWorldTransformPatch) => {
      const ref = mapSelectionToWorldObjectRef(selectionRef.current);
      if (!ref || ref.kind === "tile") return;
      const key = emberWorldObjectRefKey(ref);
      if (sceneState.isLocked(key)) {
        onSaved("Объект заблокирован в Outliner.");
        return;
      }
      const current = mapRef.current;
      pushHistory(
        current,
        space === "local" ? "Изменить Local Transform" : "Изменить World Transform",
      );
      publishMap(
        space === "local"
          ? patchEmberWorldObjectLocalTransform(current, ref, patch)
          : patchEmberWorldObjectTransform(current, ref, patch),
      );
    },
    [onSaved, publishMap, pushHistory, sceneState],
  );

  const revertSelectedWorldObjectComponent = useCallback(
    (component: EmberVoxelOverrideComponentType) => {
      const ref = mapSelectionToWorldObjectRef(selectionRef.current);
      if (!ref) return;
      if (
        ref.kind !== "tile" &&
        isSceneObjectLocked(ref.kind, ref.id)
      ) return;
      const current = mapRef.current;
      const next = clearEmberWorldObjectComponentOverrides(
        current,
        ref,
        component,
      );
      if (JSON.stringify(next) === JSON.stringify(current)) return;
      pushHistory(current, `Сбросить overrides ${component}`);
      publishMap(next);
    },
    [isSceneObjectLocked, publishMap, pushHistory],
  );

  const applySelectedWorldObjectComponentToAsset = useCallback(
    (component: EmberVoxelOverrideComponentType) => {
      const ref = mapSelectionToWorldObjectRef(selectionRef.current);
      if (!ref) return;
      if (
        ref.kind !== "tile" &&
        isSceneObjectLocked(ref.kind, ref.id)
      ) return;
      if (!onPackChange) {
        onSaved("Изменение ассета недоступно без сохранения пака.");
        return;
      }
      const current = mapRef.current;
      if (ref.kind === "sprite") {
        if (component !== "collider") return;
        const placement = current.sprites?.find((item) => item.id === ref.id);
        const sprite = placement
          ? pack.sprites?.[placement.spriteId]
          : undefined;
        if (!placement || !sprite) return;
        let nextSprite = sprite;
        if (placement.componentStates?.collider != null) {
          nextSprite = setEmberSpriteAssetComponentPresence(
            nextSprite,
            "collider",
            placement.componentStates.collider,
          );
        }
        if (placement.collider) {
          nextSprite = {
            ...nextSprite,
            collider: { ...nextSprite.collider, ...placement.collider },
          };
        }
        pushHistory(current, "Применить Collider спрайта к ассету");
        publishMap(
          clearEmberWorldObjectComponentOverrides(current, ref, component),
        );
        saveLibrarySprite(
          sprite.id,
          nextSprite,
          `Overrides применены к ассету «${sprite.nameRu?.trim() || sprite.id}».`,
        );
        return;
      }
      if (ref.kind === "tile") {
        if (component !== "collider" || !tileset) return;
        const object = getEmberWorldObject(current, ref, { pack, tileset });
        if (!object || object.source.kind !== "tile") return;
        const tileSource = object.source.value;
        const resolvedRef = object.ref.kind === "tile" ? object.ref : ref;
        const modifier = current.tileModifiers?.find(
          (item) =>
            item.x === resolvedRef.tx &&
            item.y === resolvedRef.ty &&
            item.elev === resolvedRef.elev,
        );
        const tile = tileset.tiles.find(
          (item) => item.id === tileSource.tileId,
        );
        if (!modifier || !tile) return;
        let nextTile = tile;
        if (modifier.componentStates?.collider != null) {
          nextTile = setEmberTileAssetComponentPresence(
            nextTile,
            "collider",
            modifier.componentStates.collider,
          );
        }
        if (modifier.collider) {
          nextTile = {
            ...nextTile,
            collider: { ...nextTile.collider, ...modifier.collider },
          };
        }
        pushHistory(current, "Применить Collider тайла к ассету");
        publishMap(
          clearEmberWorldObjectComponentOverrides(
            current,
            resolvedRef,
            component,
          ),
        );
        saveLibraryTile(
          tile.id,
          nextTile,
          `Overrides применены к тайлу «${tile.name}».`,
        );
        return;
      }
      if (ref.kind !== "voxel") return;
      const placement = current.voxelProps?.find(
        (item) => item.id === ref.id,
      );
      const model = placement
        ? pack.voxelModels?.[placement.modelId]
        : undefined;
      if (!placement || !model) return;
      const applied = applyVoxelInstanceComponentToAsset(
        placement,
        model,
        component,
      );
      if (!applied.changed) return;

      pushHistory(current, `Применить ${component} к ассету`);
      const nextMap = {
        ...current,
        voxelProps: (current.voxelProps ?? []).map((item) =>
          item.id === placement.id ? applied.placement : item,
        ),
      };
      const nextModels = {
        ...pack.voxelModels,
        [model.id]: applied.model,
      };
      onPackChange(packWithVoxels(pack, nextModels, pack.voxelScenes));
      publishMap(nextMap);
      void writeVoxelRegistry(nextModels, pack.voxelScenes ?? {}, {
        dirtyIds: [model.id],
      }).then((result) => {
        onSaved(
          result.ok
            ? `Overrides применены к ассету «${model.nameRu?.trim() || model.id}».`
            : `Ошибка записи ассета: ${result.error}`,
        );
      });
    },
    [
      isSceneObjectLocked,
      onPackChange,
      onSaved,
      pack,
      publishMap,
      pushHistory,
      saveLibrarySprite,
      saveLibraryTile,
      tileset,
    ],
  );

  const commitRegions = useCallback(
    (regions: EmberMapRegion[]) => {
      pushHistory(mapRef.current, "Изменить регионы");
      const next = cloneMap(mapRef.current);
      next.regions = regions.map((r) => ({ ...r }));
      publishMap(next);
    },
    [onChange],
  );

  const commitRegion = useCallback(
    (prevId: string, region: EmberMapRegion) => {
      if (isSceneObjectLocked("region", prevId)) return;
      pushHistory(mapRef.current, "Изменить регион");
      const next = cloneMap(mapRef.current);
      next.regions = replaceRegion(next.regions, prevId, region);
      if (selectedRegionIdRef.current === prevId) {
        setSelectedRegionId(region.id);
      }
      publishMap(next);
    },
    [isSceneObjectLocked, onChange],
  );

  const deleteRegion = useCallback(
    (id: string) => {
      if (isSceneObjectLocked("region", id)) return;
      pushHistory(mapRef.current, "Удалить регион");
      const next = removeEmberWorldObject(mapRef.current, {
        kind: "region",
        id,
      });
      if (selectedRegionIdRef.current === id) setSelectedRegionId(null);
      setSelection((cur) =>
        cur?.kind === "region" && cur.id === id ? null : cur,
      );
      publishMap(next);
    },
    [publishMap, pushHistory, setSelection],
  );

  const pairTeleport = useCallback(
    (fromId: string, toId: string) => {
      pushHistory(mapRef.current, "Связать телепорты");
      const next = cloneMap(mapRef.current);
      next.regions = pairTeleportRegions(next.regions, fromId, toId);
      publishMap(next);
      onSaved("Телепорты связаны парой ↔");
    },
    [onChange, onSaved],
  );

  const toggleLibCollapsed = useCallback(() => {
    setLibCollapsed((cur) => {
      const next = !cur;
      try {
        sessionStorage.setItem("ember-map-lib-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const selectLibItem = useCallback(
    (payload: MapLibPayload | null) => {
      setLibSelected(payload);
      if (!payload) {
        setLibHoverTile(null);
        setSelection((cur) => (cur?.kind === "lib" ? null : cur));
        return;
      }
      setSelection({ kind: "lib", payload });
      if (payload.kind === "region") {
        setLibraryPlacementMode((mode) =>
          mode === "surface" ? "grid" : mode,
        );
        setLibRegionDraft((cur) => {
          if (cur?.kind === payload.regionKind) return cur;
          return makeRegionAt(mapRef.current, payload.regionKind, 0, 0);
        });
      } else {
        setLibRegionDraft(null);
      }
    },
    [],
  );

  const createBlankTileInPack = useCallback(() => {
    if (!tileset || !onPackChange) {
      onSaved("Нет тайловета для создания тайла.");
      return;
    }
    const { tileset: nextTs, tileId } = appendBlankTile(tileset);
    onPackChange({
      ...pack,
      tilesets: { ...pack.tilesets, [nextTs.id]: nextTs },
    });
    void writeEmberJson(`tilesets/${nextTs.id}.json`, nextTs).then((res) => {
      onSaved(
        res.ok
          ? `Создан тайл #${tileId}`
          : `Тайл #${tileId} в паке; запись: ${"error" in res ? res.error : "?"}`,
      );
    });
    setLibSelected({ kind: "tile", tileId });
    setSelection({ kind: "lib", payload: { kind: "tile", tileId } });
    onEditTile?.(tileId);
  }, [tileset, onPackChange, pack, onSaved, onEditTile]);

  const cloneTileInPack = useCallback(
    (sourceId: number) => {
      if (!tileset || !onPackChange) {
        onSaved("Нет тайловета для клона.");
        return;
      }
      const cloned = appendClonedTile(tileset, sourceId);
      if (!cloned) {
        onSaved("Исходный тайл не найден.");
        return;
      }
      const { tileset: nextTs, tileId } = cloned;
      onPackChange({
        ...pack,
        tilesets: { ...pack.tilesets, [nextTs.id]: nextTs },
      });
      void writeEmberJson(`tilesets/${nextTs.id}.json`, nextTs).then((res) => {
        onSaved(
          res.ok
            ? `Клон тайла #${tileId}`
            : `Клон #${tileId} в паке; запись: ${"error" in res ? res.error : "?"}`,
        );
      });
      setLibSelected({ kind: "tile", tileId });
      setSelection({ kind: "lib", payload: { kind: "tile", tileId } });
      onEditTile?.(tileId);
    },
    [tileset, onPackChange, pack, onSaved, onEditTile],
  );

  const placeLibraryAt = useCallback(
    (payload: MapLibPayload, tile: MapLibraryPlacementTarget) => {
      const m = mapRef.current;
      const placement = checkMapLibraryPlacement(
        payload,
        tile,
        m,
        pack,
        tileset,
      );
      if (!placement.valid) {
        onSaved(placement.reason);
        return;
      }
      const finishPlacement = () => {
        if (serialLibraryPlacementRef.current) return;
        setLibSelected(null);
        setLibHoverTile(null);
      };
      switch (payload.kind) {
        case "sprite": {
          if (!pack.sprites[payload.spriteId]) {
            onSaved("Спрайт не найден в паке — открой вкладку «Спрайты».");
            return;
          }
          pushHistory(m, "Поставить спрайт");
          const next = cloneMap(m);
          const list = [...(next.sprites ?? [])];
          const placeId = `sp_${tile.x}_${tile.y}_${Date.now().toString(36)}`;
          list.push({
            id: placeId,
            spriteId: payload.spriteId,
            x: tile.x,
            y: tile.y,
            elev: tile.elev,
          });
          next.sprites = list;
          publishMap(next);
          setStampSpriteId(payload.spriteId);
          setSelection({ kind: "sprite", id: placeId });
          finishPlacement();
          onSaved(`Спрайт «${payload.spriteId}» поставлен`);
          return;
        }
        case "voxel": {
          const model = pack.voxelModels[payload.modelId];
          if (!model) {
            onSaved("Воксель-модель не найдена — открой скульптор блоков.");
            return;
          }
          pushHistory(m, "Поставить воксельный объект");
          const next = cloneMap(m);
          const list = [...(next.voxelProps ?? [])];
          const placeId = `vx_${tile.x}_${tile.y}_${Date.now().toString(36)}`;
          list.push({
            id: placeId,
            modelId: payload.modelId,
            x: tile.x,
            y: tile.y,
            elev: tile.elev,
            ...voxelPlacementModifiersFromModel(model),
          });
          next.voxelProps = list;
          publishMap(next);
          setSelection({ kind: "voxel", id: placeId });
          finishPlacement();
          onSaved(`Воксель «${payload.modelId}» поставлен`);
          return;
        }
        case "light": {
          pushHistory(m, "Поставить источник света");
          const next = cloneMap(m);
          const entry = lightSourceFromPreset(
            next,
            pack,
            payload.presetId,
            tile.x,
            tile.y,
          );
          const rest = (next.lights ?? []).filter(
            (l) => !(l.x === tile.x && l.y === tile.y),
          );
          next.lights = [...rest, entry];
          publishMap(next);
          setSelection({ kind: "light", id: entry.id });
          setTool("lightpick");
          finishPlacement();
          return;
        }
        case "region": {
          const placed = makeRegionAt(m, payload.regionKind, tile.x, tile.y);
          const draft = libRegionDraftRef.current;
          const region =
            draft && draft.kind === payload.regionKind
              ? {
                  ...draft,
                  id: placed.id,
                  x: Math.max(
                    0,
                    Math.min(tile.x, m.width - Math.max(1, draft.w)),
                  ),
                  y: Math.max(
                    0,
                    Math.min(tile.y, m.height - Math.max(1, draft.h)),
                  ),
                  w: Math.max(1, Math.min(draft.w, m.width)),
                  h: Math.max(1, Math.min(draft.h, m.height)),
                  kind: payload.regionKind,
                  elev: tile.elev,
                }
              : { ...placed, elev: tile.elev };
          pushHistory(m, "Поставить регион");
          const next = cloneMap(m);
          next.regions = [...next.regions, region];
          publishMap(next);
          setSelectedRegionId(region.id);
          setShowRegions(true);
          setSelection({ kind: "region", id: region.id });
          focusRegion(region);
          finishPlacement();
          onSaved(
            `Зона «${payload.regionKind}» поставлена · ${region.id}`,
          );
          return;
        }
        case "tile": {
          if (!tileset?.tiles.some((t) => t.id === payload.tileId)) return;
          pushHistory(m, "Поставить блок");
          const next = ensureMapLayers(cloneMap(m));
          const selected = tileset.tiles.find((t) => t.id === payload.tileId);
          const idx = tile.y * next.width + tile.x;
          if (layer === "decor") {
            const lay = next.layers.find((l) => l.name === "decor");
            if (!lay) {
              commandStack.discardLatestUndo();
              return;
            }
            lay.data[idx] = payload.tileId;
          } else if (selected) {
            const makeWall = Boolean(
              selected.solid || (selected.defaultHeight ?? 0) >= 1,
            );
            const connDir = selected.stair ?? selected.ramp;
            const isConnector = Boolean(connDir);
            setWallHeightVoxels(
              next,
              idx,
              makeWall && !isConnector
                ? (selected.defaultHeight ?? 1) * next.tileSize
                : 0,
            );
            if (connDir) {
              const elev = suggestConnectorElevation(
                next,
                tileset,
                tile.x,
                tile.y,
                connDir,
              );
              setElevTileId(next, tile.x, tile.y, elev, payload.tileId);
            } else {
              setElevTileId(
                next,
                tile.x,
                tile.y,
                Math.round(tile.elev),
                payload.tileId,
              );
            }
          } else {
            setElevTileId(
              next,
              tile.x,
              tile.y,
              Math.round(tile.elev),
              payload.tileId,
            );
          }
          publishMap(next);
          setTileId(payload.tileId);
          setSelection({ kind: "tile", tx: tile.x, ty: tile.y });
          finishPlacement();
          if (
            tool === "select" ||
            tool === "collision" ||
            tool === "erase" ||
            tool === "elevation" ||
            tool === "sprite" ||
            tool === "lightpick"
          ) {
            setTool("paint");
          }
          return;
        }
        default: {
          const _n: never = payload;
          return _n;
        }
      }
    },
    [
      pack,
      onChange,
      onSaved,
      focusRegion,
      tileset,
      layer,
      brushElev,
      tool,
    ],
  );

  const beginLightSourceEdit = useCallback(() => {
    if (selectedLightId && isSceneObjectLocked("light", selectedLightId)) return;
    pushHistory(mapRef.current, "Изменить источник света");
  }, [isSceneObjectLocked, selectedLightId]);

  const commitLightSource = useCallback(
    (source: EmberLightSource, opts?: { history?: boolean }) => {
      if (isSceneObjectLocked("light", source.id)) return;
      if (opts?.history !== false) pushHistory(mapRef.current);
      const next = cloneMap(mapRef.current);
      const rest = (next.lights ?? []).filter(
        (l) =>
          l.id !== source.id && !(l.x === source.x && l.y === source.y),
      );
      next.lights = [...rest, source];
      publishMap(next);
      setSelectedLightId(source.id);
    },
    [isSceneObjectLocked, onChange],
  );

  /**
   * Ensure the lantern has a map.lights entry (needed for G-grab preview).
   * Implicit glow cells get a placed override with current params.
   */
  const ensureLightPlaced = useCallback(
    (id: string): string | null => {
      if (!tileset) return null;
      const src = listLanternSources(
        mapRef.current,
        tileset,
        pack.sprites,
      ).find((s) => s.id === id);
      if (!src) return null;
      if (src.hasOverride) {
        const existing = (mapRef.current.lights ?? []).find((l) => l.id === id);
        if (existing) return existing.id;
      }
      pushHistory(mapRef.current);
      const next = cloneMap(mapRef.current);
      const entry: EmberLightSource = {
        id: src.hasOverride ? src.id : newLightId(),
        x: src.x,
        y: src.y,
        enabled: true,
        ...lampParamsFromSource(src.params),
      };
      const rest = (next.lights ?? []).filter(
        (l) =>
          l.id !== entry.id && !(l.x === entry.x && l.y === entry.y),
      );
      next.lights = [...rest, entry];
      publishMap(next);
      setSelectedLightId(entry.id);
      setSelection({ kind: "light", id: entry.id });
      return entry.id;
    },
    [onChange, pack.sprites, tileset],
  );

  /** Nudge / relocate a lantern (creates placed entry if needed). */
  const moveLightSource = useCallback(
    (id: string, x: number, y: number) => {
      if (isSceneObjectLocked("light", id)) return;
      if (!tileset) return;
      const m = mapRef.current;
      const nx = Math.max(0, Math.min(m.width - 1, x | 0));
      const ny = Math.max(0, Math.min(m.height - 1, y | 0));
      const src = listLanternSources(m, tileset, pack.sprites).find(
        (s) => s.id === id,
      );
      if (!src) return;
      if (nx === src.x && ny === src.y) return;
      pushHistory(m);
      const next = cloneMap(m);
      const entry: EmberLightSource = {
        id: src.hasOverride ? src.id : newLightId(),
        x: nx,
        y: ny,
        enabled: true,
        ...lampParamsFromSource(src.params),
      };
      let rest = (next.lights ?? []).filter(
        (l) =>
          l.id !== src.id &&
          l.id !== entry.id &&
          !(l.x === src.x && l.y === src.y) &&
          !(l.x === nx && l.y === ny),
      );
      const candidate = { ...next, lights: [...rest, entry] };
      const leftoverGlow = listLanternSources(
        candidate,
        tileset,
        pack.sprites,
      ).some((s) => s.x === src.x && s.y === src.y && s.id !== entry.id);
      if (leftoverGlow) {
        rest = [
          ...rest,
          {
            id: `mute_${src.x}_${src.y}_${Date.now().toString(36)}`,
            x: src.x,
            y: src.y,
            enabled: false,
            ...lampParamsFromSource(src.params),
          },
        ];
      }
      next.lights = [...rest, entry];
      publishMap(next);
      setSelectedLightId(entry.id);
      setSelection({ kind: "light", id: entry.id });
    },
    [isSceneObjectLocked, onChange, pack.sprites, tileset],
  );

  const deleteLightSource = useCallback(
    (id: string) => {
      if (isSceneObjectLocked("light", id)) return;
      const current = mapRef.current;
      const removed = tileset
        ? removeLanternSource(current, tileset, pack.sprites, id)
        : removeEmberWorldObject(current, { kind: "light", id });
      if (removed === current) return;
      const next = normalizeEmberSceneHierarchy(removed);
      pushHistory(current, "Удалить источник света");
      publishMap(next);
      setSelectedLightId(null);
      onSaved("Источник света удалён.");
    },
    [
      isSceneObjectLocked,
      onSaved,
      pack.sprites,
      publishMap,
      pushHistory,
      setSelectedLightId,
      tileset,
    ],
  );

  const clearLightSourceOverrides = useCallback(
    (id: string) => {
      if (isSceneObjectLocked("light", id)) return;
      const prev = lanternSources.find((s) => s.id === id);
      pushHistory(mapRef.current, "Сбросить настройки света");
      const next = removeEmberWorldObject(mapRef.current, {
        kind: "light",
        id,
      });
      publishMap(next);
      if (!prev || !tileset) {
        setSelectedLightId(null);
        return;
      }
      const still = listLanternSources(next, tileset, pack.sprites).find(
        (s) => s.x === prev.x && s.y === prev.y,
      );
      setSelectedLightId(still?.id ?? null);
    },
    [lanternSources, onChange, pack.sprites, tileset],
  );

  const clientToCanvas = useCallback(
    (clientX: number, clientY: number): { sx: number; sy: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        sx: ((clientX - rect.left) * canvas.width) / rect.width,
        sy: ((clientY - rect.top) * canvas.height) / rect.height,
      };
    },
    [],
  );

  const clientToTile = useCallback(
    (clientX: number, clientY: number): TilePos | null => {
      const pt = clientToCanvas(clientX, clientY);
      if (!pt) return null;
      const threeHit = threePreviewRef.current?.pickTile(pt.sx, pt.sy);
      if (threeHit) return { x: threeHit.tx, y: threeHit.ty };
      const hit = canvasPixelToTile(
        ensureMapLayers(map),
        pt.sx,
        pt.sy,
        scale,
        viewMode,
      );
      if (!hit) return null;
      return { x: hit.tx, y: hit.ty };
    },
    [map, scale, viewMode, clientToCanvas],
  );

  /** Paint / elev target on the locked Z work-plane (Minecraft ghost). */
  const clientToPlaceTarget = useCallback(
    (clientX: number, clientY: number): PlacePreviewMark | null => {
      const pt = clientToCanvas(clientX, clientY);
      if (!pt) return null;
      return (
        threePreviewRef.current?.pickPlaceTarget(
          pt.sx,
          pt.sy,
          brushElevRef.current,
        ) ?? null
      );
    },
    [clientToCanvas],
  );

  /** Shared library target for surface snap, vertical drop and locked grid. */
  const clientToLibraryPlacementTarget = useCallback(
    (clientX: number, clientY: number): MapLibraryPlacementTarget | null => {
      const point = clientToCanvas(clientX, clientY);
      if (!point) return null;
      const surface =
        threePreviewRef.current?.pickSurfaceTarget(point.sx, point.sy) ?? null;
      const payload = libSelectedRef.current;
      const mode = effectiveMapLibraryPlacementMode(
        payload?.kind,
        libraryPlacementModeRef.current,
      );
      let tile = clientToTile(clientX, clientY);
      if (mode === "grid") {
        const plane =
          threePreviewRef.current?.pickPlaceTarget(
            point.sx,
            point.sy,
            brushElevRef.current,
          ) ?? null;
        if (plane) tile = { x: plane.tx, y: plane.ty };
      }
      return resolveMapLibraryPlacementTarget(
        mapRef.current,
        mode,
        tile,
        surface
          ? { x: surface.tx, y: surface.ty, elev: surface.elev }
          : null,
        brushElevRef.current,
      );
    },
    [clientToCanvas, clientToTile],
  );

  /** Erase target: the block the ray hits (any elev), not the lock plane. */
  const clientToBreakTarget = useCallback(
    (clientX: number, clientY: number): PlacePreviewMark | null => {
      const pt = clientToCanvas(clientX, clientY);
      if (!pt) return null;
      return threePreviewRef.current?.pickBreakTarget(pt.sx, pt.sy) ?? null;
    },
    [clientToCanvas],
  );

  const eraseBreakTarget = useCallback(
    (target: PlacePreviewMark) => {
      const key = `${target.tx},${target.ty},${target.elev}`;
      if (eraseLastKey.current === key) return;
      eraseLastKey.current = key;
      if (!eraseStrokeSaved.current) {
        pushHistory(mapRef.current, "Стереть блоки");
        eraseStrokeSaved.current = true;
      }
      const next = ensureMapLayers(cloneMap(mapRef.current));
      if (layer === "decor") {
        const lay = next.layers.find((l) => l.name === "decor");
        if (lay) {
          lay.data[target.ty * next.width + target.tx] = 0;
        }
      } else {
        clearElevTile(next, target.tx, target.ty, target.elev);
        const top = topOccupiedElevAt(next, target.tx, target.ty);
        if (top == null) {
          setWallHeightVoxels(next, target.ty * next.width + target.tx, 0);
        }
        next.sprites = (next.sprites ?? []).filter(
          (p) => !(p.x === target.tx && p.y === target.ty),
        );
      }
      publishMap(next);
    },
    [layer, onChange],
  );

  const clearPlacePreview = useCallback(() => {
    if (!placePreviewRef.current) return;
    placePreviewRef.current = null;
    setPlacePreview(null);
  }, []);

  const updatePlacePreview = useCallback(
    (next: PlacePreviewMark | null) => {
      const prev = placePreviewRef.current;
      if (
        prev?.tx === next?.tx &&
        prev?.ty === next?.ty &&
        prev?.elev === next?.elev &&
        prev?.mode === next?.mode
      ) {
        return;
      }
      placePreviewRef.current = next;
      setPlacePreview(next);
    },
    [],
  );
  clearPlacePreviewRef.current = clearPlacePreview;
  updatePlacePreviewRef.current = updatePlacePreview;

  // Keep the place ghost on the new Z when Ctrl+wheel changes the lock plane
  // (paint/fill/elev only — eraser tracks the hit block, not the lock).
  useEffect(() => {
    if (tool === "erase") return;
    const prev = placePreviewRef.current;
    if (!prev || prev.elev === brushElev) return;
    updatePlacePreview({ ...prev, elev: brushElev });
  }, [brushElev, tool, updatePlacePreview]);

  const onLibDragOverCanvas = useCallback(
    (e: ReactDragEvent) => {
      const types = Array.from(e.dataTransfer.types);
      if (!types.includes(MAP_LIB_MIME) && !types.includes("text/plain")) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      const tile = clientToLibraryPlacementTarget(e.clientX, e.clientY);
      setLibHoverTile((prev) => {
        if (
          prev?.x === tile?.x &&
          prev?.y === tile?.y &&
          prev?.elev === tile?.elev
        ) return prev;
        return tile;
      });
    },
    [clientToLibraryPlacementTarget],
  );

  const onLibDropCanvas = useCallback(
    (e: ReactDragEvent) => {
      const types = Array.from(e.dataTransfer.types);
      if (!types.includes(MAP_LIB_MIME) && !types.includes("text/plain")) {
        return;
      }
      e.preventDefault();
      const raw =
        e.dataTransfer.getData(MAP_LIB_MIME) ||
        e.dataTransfer.getData("text/plain");
      const payload = parseMapLibPayload(raw);
      const tile = clientToLibraryPlacementTarget(e.clientX, e.clientY);
      setLibHoverTile(null);
      setLibDragActive(false);
      if (!payload || !tile) return;
      placeLibraryAt(payload, tile);
    },
    [clientToLibraryPlacementTarget, placeLibraryAt],
  );

  const onLibDragLeaveCanvas = useCallback((e: ReactDragEvent) => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const related = e.relatedTarget as Node | null;
    if (related && wrap.contains(related)) return;
    setLibHoverTile(null);
  }, []);

  /** Pick placed sprite / voxel prop via Three raycast (falls back to 2D AABB). */
  const clientToProp = useCallback(
    (clientX: number, clientY: number): EditorPick | null => {
      const pt = clientToCanvas(clientX, clientY);
      if (!pt) return null;
      const three = threePreviewRef.current;
      const hit = three?.pickObject(pt.sx, pt.sy) ?? null;
      if (hit && (hit.kind === "sprite" || hit.kind === "voxel")) return hit;
      // A live Three viewport has pixel/geometry-accurate picking. Only use
      // the legacy 2D AABB when WebGL preview is unavailable.
      if (three) return null;
      const spr = canvasPixelToSpritePlacement(
        ensureMapLayers(mapRef.current),
        pt.sx,
        pt.sy,
        scale,
        pack.sprites,
        viewMode,
      );
      return spr ? { kind: "sprite", id: spr.id } : null;
    },
    [clientToCanvas, scale, viewMode, pack.sprites],
  );

  const clientToSelectionStack = useCallback(
    (clientX: number, clientY: number): MapSelection[] => {
      const pt = clientToCanvas(clientX, clientY);
      if (!pt) return [];
      const picks =
        threePreviewRef.current?.pickObjectStack(pt.sx, pt.sy) ?? [];
      const selections: MapSelection[] = picks.map((pick) =>
        pick.kind === "tile"
          ? { kind: "tile", tx: pick.tx, ty: pick.ty, elev: pick.elev }
          : { kind: pick.kind, id: pick.id },
      );
      const tilePick = picks.find(
        (pick): pick is Extract<EditorPick, { kind: "tile" }> =>
          pick.kind === "tile",
      );
      const fallbackTile = tilePick
        ? { x: tilePick.tx, y: tilePick.ty }
        : clientToTile(clientX, clientY);
      if (fallbackTile) {
        const lights = (tileset
          ? listLanternSources(mapRef.current, tileset, pack.sprites)
          : []
        ).filter(
          (light) =>
            light.x === fallbackTile.x &&
            light.y === fallbackTile.y &&
            !sceneState.isHidden(`light:${light.id}`),
        );
        const tileIndex = selections.findIndex((item) => item.kind === "tile");
        const insertAt = tileIndex < 0 ? selections.length : tileIndex;
        selections.splice(
          insertAt,
          0,
          ...lights.map<MapSelection>((light) => ({
            kind: "light",
            id: light.id,
          })),
        );
        const regions = mapRef.current.regions
          .filter(
            (region) =>
              includeRegionInViewportPick(region.kind) &&
              fallbackTile.x >= region.x &&
              fallbackTile.y >= region.y &&
              fallbackTile.x < region.x + Math.max(1, region.w) &&
              fallbackTile.y < region.y + Math.max(1, region.h) &&
              !sceneState.isHidden(`region:${region.id}`),
          )
          .sort((left, right) => left.w * left.h - right.w * right.h);
        const afterTile = selections.findIndex((item) => item.kind === "tile");
        selections.splice(
          afterTile < 0 ? selections.length : afterTile + 1,
          0,
          ...regions.map<MapSelection>((region) => ({
            kind: "region",
            id: region.id,
          })),
        );
      }
      const unique = selections.filter(
        (selection, index, all) =>
          all.findIndex((candidate) =>
            mapSelectionEquals(candidate, selection),
          ) === index,
      );
      return filterEditorSelectionStack(
        unique.filter(isViewportMapSelection),
        selectionFilterRef.current,
        (selection) =>
          selection.kind !== "tile" &&
          sceneState.isLocked(`${selection.kind}:${selection.id}`),
      );
    },
    [clientToCanvas, clientToTile, pack.sprites, sceneState, tileset],
  );

  const selectFromPointerStack = useCallback(
    (
      stack: readonly MapSelection[],
      clientX: number,
      clientY: number,
      toggle: boolean,
    ) => {
      const signature = stack.map(mapSelectionKey).join("|");
      const cycle = advanceEditorPickCycle(
        pickCycleRef.current,
        signature,
        clientX,
        clientY,
        stack.length,
      );
      pickCycleRef.current = cycle.state;
      const next = stack[cycle.index];
      if (!next) {
        if (!toggle) selectionService.clear();
        setSelectedRegionId(null);
        return;
      }
      selectionService.select(next, toggle ? "toggle" : "replace");
      const primary = selectionService.getPrimary();
      setSelectedRegionId(
        primary?.kind === "region" ? primary.id : null,
      );
      if (primary?.kind === "tile" && primary.elev != null) {
        setBrushElev(primary.elev);
      }
    },
    [selectionService],
  );

  const removeSpritePlacement = useCallback(
    (placeId: string) => {
      if (isSceneObjectLocked("sprite", placeId)) return;
      if (
        !getEmberWorldObject(mapRef.current, { kind: "sprite", id: placeId })
      ) {
        return;
      }
      pushHistory(mapRef.current, "Удалить спрайт");
      const next = removeEmberWorldObject(mapRef.current, {
        kind: "sprite",
        id: placeId,
      });
      publishMap(next);
    },
    [isSceneObjectLocked, publishMap, pushHistory],
  );

  const removeVoxelPlacement = useCallback(
    (placeId: string) => {
      if (isSceneObjectLocked("voxel", placeId)) return;
      if (
        !getEmberWorldObject(mapRef.current, { kind: "voxel", id: placeId })
      ) {
        return;
      }
      pushHistory(mapRef.current, "Удалить воксельный объект");
      const next = removeEmberWorldObject(mapRef.current, {
        kind: "voxel",
        id: placeId,
      });
      publishMap(next);
    },
    [isSceneObjectLocked, publishMap, pushHistory],
  );

  const patchVoxelPlacement = useCallback(
    (
      placeId: string,
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
    ) => {
      if (isSceneObjectLocked("voxel", placeId)) return;
      const m = mapRef.current;
      const list = m.voxelProps ?? [];
      if (!list.some((p) => p.id === placeId)) return;
      if (patch.modelId != null && !pack.voxelModels?.[patch.modelId]) {
        onSaved("Воксель-модель не найдена в паке.");
        return;
      }
      pushHistory(m, "Изменить воксельный объект");
      const next = patchEmberWorldObjectTransform(
        m,
        { kind: "voxel", id: placeId },
        {
          x:
            patch.x != null
              ? Math.max(0, Math.min(m.width - 1, patch.x | 0))
              : undefined,
          y:
            patch.y != null
              ? Math.max(0, Math.min(m.height - 1, patch.y | 0))
              : undefined,
          z:
            patch.elev != null
              ? Math.max(
                  0,
                  Math.min(Math.max(MAX_ELEVATION, 8), patch.elev | 0),
                )
              : undefined,
          rotationQuarterTurns: patch.rot,
        },
      );
      next.voxelProps = (next.voxelProps ?? []).map((p) => {
        if (p.id !== placeId) return p;
        return {
          ...p,
          ...(patch.modelId != null ? { modelId: patch.modelId } : {}),
          ...(patch.directLightScale != null
            ? {
                directLightScale: Math.max(
                  0.05,
                  Math.min(1.5, Number(patch.directLightScale)),
                ),
              }
            : {}),
          ...(patch.emissiveCastsLight !== undefined
            ? {
                emissiveCastsLight:
                  patch.emissiveCastsLight === null
                    ? undefined
                    : patch.emissiveCastsLight,
              }
            : {}),
          ...(patch.emissiveLightRange !== undefined
            ? {
                emissiveLightRange:
                  patch.emissiveLightRange === null
                    ? undefined
                    : resolveEmissiveLightRange(
                        Number(patch.emissiveLightRange),
                      ),
              }
            : {}),
          ...(patch.emissiveLightShadows !== undefined
            ? {
                emissiveLightShadows:
                  patch.emissiveLightShadows === null
                    ? undefined
                    : patch.emissiveLightShadows,
              }
            : {}),
          ...(patch.emissiveStrength !== undefined
            ? {
                emissiveStrength:
                  patch.emissiveStrength === null
                    ? undefined
                    : resolveEmissiveStrength(Number(patch.emissiveStrength)),
              }
            : {}),
          ...(patch.emissiveTorchFlicker !== undefined
            ? {
                emissiveTorchFlicker:
                  patch.emissiveTorchFlicker === null
                    ? undefined
                    : patch.emissiveTorchFlicker,
              }
            : {}),
          ...(patch.emissiveLanternFlicker !== undefined
            ? {
                emissiveLanternFlicker:
                  patch.emissiveLanternFlicker === null
                    ? undefined
                    : patch.emissiveLanternFlicker,
              }
            : {}),
          ...(patch.emissiveSuppressHostShadow !== undefined
            ? {
                emissiveSuppressHostShadow:
                  patch.emissiveSuppressHostShadow === null
                    ? undefined
                    : patch.emissiveSuppressHostShadow,
              }
            : {}),
          ...(patch.collider !== undefined
            ? { collider: patch.collider === null ? undefined : { ...patch.collider } }
            : {}),
        };
      });
      // Clear explicit undefined keys so JSON omit works.
      next.voxelProps = (next.voxelProps ?? []).map((p) => {
        if (p.id !== placeId) return p;
        const cleaned = { ...p };
        if (cleaned.emissiveCastsLight === undefined) {
          delete cleaned.emissiveCastsLight;
        }
        if (cleaned.emissiveLightRange === undefined) {
          delete cleaned.emissiveLightRange;
        }
        if (cleaned.emissiveLightShadows === undefined) {
          delete cleaned.emissiveLightShadows;
        }
        if (cleaned.emissiveStrength === undefined) {
          delete cleaned.emissiveStrength;
        }
        if (cleaned.emissiveTorchFlicker === undefined) {
          delete cleaned.emissiveTorchFlicker;
        }
        if (cleaned.emissiveLanternFlicker === undefined) {
          delete cleaned.emissiveLanternFlicker;
        }
        if (cleaned.emissiveSuppressHostShadow === undefined) {
          delete cleaned.emissiveSuppressHostShadow;
        }
        if (cleaned.collider === undefined) delete cleaned.collider;
        return cleaned;
      });
      publishMap(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, onSaved, pack.voxelModels],
  );

  const patchSpritePlacement = useCallback(
    (placeId: string, patch: { x?: number; y?: number; elev?: number }) => {
      if (isSceneObjectLocked("sprite", placeId)) return;
      const m = mapRef.current;
      if (!getEmberWorldObject(m, { kind: "sprite", id: placeId })) return;
      pushHistory(m, "Изменить спрайт");
      const next = patchEmberWorldObjectTransform(
        m,
        { kind: "sprite", id: placeId },
        {
          x:
            patch.x != null
              ? Math.max(0, Math.min(m.width - 1, patch.x | 0))
              : undefined,
          y:
            patch.y != null
              ? Math.max(0, Math.min(m.height - 1, patch.y | 0))
              : undefined,
          z: patch.elev,
        },
      );
      publishMap(next);
    },
    [isSceneObjectLocked, publishMap, pushHistory],
  );

  const beginObjectGrabMove = useCallback(
    (kind: "voxel" | "sprite" | "light", id: string) => {
      if (isSceneObjectLocked(kind, id)) return;
      selectTool("select");
      setLibSelected(null);
      if (kind === "light") {
        const placedId = ensureLightPlaced(id);
        if (!placedId) return;
        setObjectGrab({ mode: "move", kind: "light", id: placedId, hover: null });
        return;
      }
      setObjectGrab({ mode: "move", kind, id, hover: null });
    },
    [ensureLightPlaced, isSceneObjectLocked, selectTool],
  );

  const commitObjectGrab = useCallback(
    (tile: TilePos | null) => {
      const grab = objectGrabRef.current;
      if (!grab) return;
      if (grab.mode === "move") {
        const dest = tile ?? grab.hover;
        if (!dest) {
          setObjectGrab(null);
          return;
        }
        if (grab.kind === "voxel") {
          patchVoxelPlacement(grab.id, {
            x: dest.x,
            y: dest.y,
            elev: tileSurfaceElev(mapRef.current, dest.x, dest.y),
          });
        } else if (grab.kind === "light") {
          moveLightSource(grab.id, dest.x, dest.y);
        } else {
          patchSpritePlacement(grab.id, {
            x: dest.x,
            y: dest.y,
            elev: tileSurfaceElev(mapRef.current, dest.x, dest.y),
          });
        }
        setObjectGrab(null);
        return;
      }
      let rot = grab.previewRot;
      if (tile) {
        const place = mapRef.current.voxelProps?.find((p) => p.id === grab.id);
        if (place) {
          rot = voxelRotToward(place.x, place.y, tile.x, tile.y, rot);
        }
      }
      patchVoxelPlacement(grab.id, { rot });
      setObjectGrab(null);
    },
    [patchVoxelPlacement, patchSpritePlacement, moveLightSource],
  );

  transformCommitRef.current = (commit) => {
    if (
      commit.id &&
      (commit.kind === "voxel" ||
        commit.kind === "sprite" ||
        commit.kind === "light" ||
        commit.kind === "region") &&
      isSceneObjectLocked(commit.kind, commit.id)
    ) {
      return;
    }
    const m = mapRef.current;
    const ts = m.tileSize;
    const storyH = blockStoryHeight(ts);
    const tx = Math.max(
      0,
      Math.min(m.width - 1, Math.floor(commit.position.x / ts)),
    );
    const ty = Math.max(
      0,
      Math.min(m.height - 1, Math.floor(commit.position.z / ts)),
    );
    const elev = clampElevation(elevFromWorldY(commit.position.y, storyH));
    const rot = ((Math.round(commit.rotationY / (Math.PI / 2)) % 4) + 4) % 4;

    const resync = (sel: MapSelection) => {
      threePreviewRef.current?.setTransformTarget(
        selectionTransformTarget(sel, mapRef.current, tileset, pack.sprites),
      );
    };

    if (commit.kind === "selection") {
      const objects = multiSelectionWorldObjects(
        selectionItemsRef.current,
        m,
      );
      if (objects.length < 2) return;
      const points = objects.map(worldObjectTransformPivot);
      const pivot = {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
      };
      if (commit.mode === "scale") {
        pushHistory(m, `Масштабировать ${objects.length} объектов`);
        publishMap(
          scaleEmberWorldObjectsAroundPivot(
            m,
            objects.map((object) => object.ref),
            pivot,
            commit.scale,
          ),
        );
        return;
      }
      const targetX = commit.position.x / ts - 0.5;
      const targetY = commit.position.z / ts - 0.5;
      const dx = Math.round(targetX - pivot.x);
      const dy = Math.round(targetY - pivot.y);
      if (!dx && !dy) return;
      pushHistory(m, `Переместить ${objects.length} объектов`);
      publishMap(
        translateEmberWorldObjects(
          m,
          objects.map((object) => object.ref),
          dx,
          dy,
        ),
      );
      return;
    }

    if (
      commit.mode === "scale" &&
      commit.id &&
      (commit.kind === "voxel" ||
        commit.kind === "sprite" ||
        commit.kind === "region")
    ) {
      const ref: EmberWorldObjectRef = { kind: commit.kind, id: commit.id };
      const currentObject = getEmberWorldObject(m, ref);
      if (!currentObject) return;
      const scaleZ = commit.kind === "region" ? 1 : commit.scale.z;
      if (
        Math.abs(currentObject.transform.scale.x - commit.scale.x) < 1e-4 &&
        Math.abs(currentObject.transform.scale.y - commit.scale.y) < 1e-4 &&
        Math.abs(currentObject.transform.scale.z - scaleZ) < 1e-4
      ) {
        resync({ kind: commit.kind, id: commit.id });
        return;
      }
      pushHistory(m, "Масштабировать объект");
      publishMap(
        patchEmberWorldObjectTransform(m, ref, {
          scaleX: commit.scale.x,
          scaleY: commit.scale.y,
          ...(commit.kind !== "region" ? { scaleZ: commit.scale.z } : {}),
        }),
      );
      setSelection({ kind: commit.kind, id: commit.id });
      return;
    }

    if (commit.kind === "group" && commit.id) {
      const group = m.sceneHierarchy?.groups.find((candidate) => candidate.id === commit.id);
      if (!group) return;
      if (commit.mode === "scale") {
        if (
          Math.abs(commit.scale.x - 1) < 1e-4 &&
          Math.abs(commit.scale.y - 1) < 1e-4 &&
          Math.abs(commit.scale.z - 1) < 1e-4
        ) {
          resync({ kind: "group", id: group.id });
        } else {
          scaleSceneGroup(group.id, commit.scale);
        }
      } else if (commit.mode === "rotate") {
        const currentRotation =
          (((group.rotationQuarterTurns ?? 0) % 4) + 4) % 4;
        const delta = ((rot - currentRotation) % 4 + 4) % 4;
        if (delta) rotateSceneGroup(group.id, delta);
        else resync({ kind: "group", id: group.id });
      } else {
        const targetX = commit.position.x / ts - 0.5;
        const targetY = commit.position.z / ts - 0.5;
        const dx = Math.round(targetX - group.pivot.x);
        const dy = Math.round(targetY - group.pivot.y);
        if (dx || dy) translateSceneGroup(group.id, dx, dy);
        else resync({ kind: "group", id: group.id });
      }
      return;
    }

    if (commit.kind === "voxel" && commit.id) {
      const p = m.voxelProps?.find((x) => x.id === commit.id);
      if (!p) return;
      if (commit.mode === "rotate") {
        if ((((p.rot ?? 0) % 4) + 4) % 4 === rot) {
          resync({ kind: "voxel", id: commit.id });
          return;
        }
        patchVoxelPlacement(commit.id, { rot });
      } else {
        const curElev = p.elev ?? tileSurfaceElev(m, p.x, p.y);
        if (p.x === tx && p.y === ty && curElev === elev) {
          resync({ kind: "voxel", id: commit.id });
          return;
        }
        patchVoxelPlacement(commit.id, { x: tx, y: ty, elev });
      }
      return;
    }
    if (commit.kind === "sprite" && commit.id) {
      const p = m.sprites?.find((x) => x.id === commit.id);
      if (!p) return;
      const curElev = p.elev ?? tileSurfaceElev(m, p.x, p.y);
      if (p.x === tx && p.y === ty && curElev === elev) {
        resync({ kind: "sprite", id: commit.id });
        return;
      }
      patchSpritePlacement(commit.id, { x: tx, y: ty, elev });
      return;
    }
    if (commit.kind === "light" && commit.id) {
      if (!tileset) return;
      const lamp = listLanternSources(m, tileset, pack.sprites).find(
        (s) => s.id === commit.id,
      );
      if (!lamp) return;
      if (lamp.x === tx && lamp.y === ty) {
        resync({ kind: "light", id: commit.id });
        return;
      }
      moveLightSource(commit.id, tx, ty);
      return;
    }
    if (commit.kind === "region" && commit.id) {
      const region = m.regions.find((candidate) => candidate.id === commit.id);
      if (!region) return;
      const x = Math.round(commit.position.x / ts - region.w / 2);
      const y = Math.round(commit.position.z / ts - region.h / 2);
      const elev = clampElevation(elevFromWorldY(commit.position.y, storyH));
      if (region.x === x && region.y === y && (region.elev ?? elev) === elev) {
        resync({ kind: "region", id: commit.id });
        return;
      }
      pushHistory(m, "Переместить регион");
      publishMap(
        patchEmberWorldObjectTransform(
          m,
          { kind: "region", id: commit.id },
          { x, y, z: elev },
        ),
      );
      setSelection({ kind: "region", id: commit.id });
      return;
    }
    if (commit.kind === "tile" && commit.tx != null && commit.ty != null) {
      const fromTx = commit.tx;
      const fromTy = commit.ty;
      const top =
        (selectionRef.current?.kind === "tile"
          ? selectionRef.current.elev
          : null) ?? topOccupiedElevAt(m, fromTx, fromTy);
      if (top == null) return;
      const tileIdAt = elevTileIdAt(m, fromTx, fromTy, top);
      if (!tileIdAt) return;
      if (tx === fromTx && ty === fromTy && elev === top) {
        resync({ kind: "tile", tx: fromTx, ty: fromTy, elev: top });
        return;
      }
      pushHistory(m, "Переместить блок");
      const next = ensureMapLayers(cloneMap(m));
      clearElevTile(next, fromTx, fromTy, top);
      setElevTileId(next, tx, ty, elev, tileIdAt);
      publishMap(next);
      setSelection({ kind: "tile", tx, ty, elev });
    }
  };

  const renameVoxelModel = useCallback(
    (modelId: string, nameRu: string) => {
      if (!onPackChange) return;
      const model = pack.voxelModels?.[modelId];
      if (!model) return;
      const nextModels = {
        ...pack.voxelModels,
        [modelId]: { ...model, nameRu },
      };
      onPackChange(packWithVoxels(pack, nextModels, pack.voxelScenes));
      void writeVoxelRegistry(nextModels, pack.voxelScenes ?? {}, {
        dirtyIds: [modelId],
      }).then((res) => {
        if (!res.ok) onSaved(`Имя вокселя: ошибка записи — ${res.error}`);
      });
    },
    [onPackChange, onSaved, pack],
  );

  const setVoxelModelTags = useCallback(
    (modelId: string, tags: string[] | undefined) => {
      if (!onPackChange) return;
      const model = pack.voxelModels?.[modelId];
      if (!model) return;
      const nextModel = { ...model, tags };
      if (!tags?.length) delete nextModel.tags;
      const nextModels = {
        ...pack.voxelModels,
        [modelId]: nextModel,
      };
      onPackChange(packWithVoxels(pack, nextModels, pack.voxelScenes));
      void writeVoxelRegistry(nextModels, pack.voxelScenes ?? {}, {
        dirtyIds: [modelId],
        skipVoxWrite: [modelId],
      }).then((res) => {
        if (!res.ok) onSaved(`Теги вокселя: ошибка записи — ${res.error}`);
      });
    },
    [onPackChange, onSaved, pack],
  );

  const setSpriteTags = useCallback(
    (spriteId: string, tags: string[] | undefined) => {
      const sprite = pack.sprites[spriteId];
      if (!sprite) return;
      const next = { ...sprite, tags };
      if (!tags?.length) delete next.tags;
      saveLibrarySprite(
        spriteId,
        next,
        `${sprite.nameRu?.trim() || sprite.id}: теги сохранены`,
      );
    },
    [pack.sprites, saveLibrarySprite],
  );

  const focusLibraryReference = useCallback(
    (ref: EmberAssetReference) => {
      if (ref.mapId && ref.mapId !== mapRef.current.id) {
        onSaved(
          `На карте «${ref.mapNameRu?.trim() || ref.mapId}» — открой её, чтобы прыгнуть`,
        );
        return;
      }
      if (ref.sceneId && !ref.mapId) {
        onSaved(
          `В сцене «${ref.mapNameRu?.trim() || ref.sceneId}» — открой скульптор`,
        );
        return;
      }
      switch (ref.kind) {
        case "sprite":
          setSelection({ kind: "sprite", id: ref.objectId });
          break;
        case "voxelProp":
          setSelection({ kind: "voxel", id: ref.objectId });
          break;
        case "chestModel":
        case "chestScene":
          setSelection({ kind: "region", id: ref.objectId });
          break;
        case "sceneObject":
          onSaved(
            `В сцене «${ref.mapNameRu?.trim() || ref.sceneId}» — открой скульптор`,
          );
          return;
        default: {
          const _never: never = ref.kind;
          return _never;
        }
      }
      if (ref.x != null && ref.y != null) {
        threePreviewRef.current?.focusTile(ref.x, ref.y);
      }
    },
    [onSaved, setSelection],
  );

  const patchVoxelModelLight = useCallback(
    (
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
    ) => {
      if (!onPackChange) return;
      const model = pack.voxelModels?.[modelId];
      if (!model) return;
      const next = { ...model };
      if (patch.emissiveCastsLight !== undefined) {
        if (patch.emissiveCastsLight === null || patch.emissiveCastsLight === false) {
          delete next.emissiveCastsLight;
        } else {
          next.emissiveCastsLight = true;
        }
      }
      if (patch.emissiveLightRange !== undefined) {
        if (patch.emissiveLightRange === null) {
          delete next.emissiveLightRange;
        } else {
          next.emissiveLightRange = resolveEmissiveLightRange(
            Number(patch.emissiveLightRange),
          );
        }
      }
      if (patch.emissiveLightShadows !== undefined) {
        if (patch.emissiveLightShadows === null || !patch.emissiveLightShadows) {
          delete next.emissiveLightShadows;
        } else {
          next.emissiveLightShadows = true;
        }
      }
      if (patch.emissiveStrength !== undefined) {
        if (patch.emissiveStrength === null) {
          delete next.emissiveStrength;
        } else {
          next.emissiveStrength = resolveEmissiveStrength(
            Number(patch.emissiveStrength),
          );
        }
      }
      if (patch.emissiveTorchFlicker !== undefined) {
        if (patch.emissiveTorchFlicker === null || !patch.emissiveTorchFlicker) {
          delete next.emissiveTorchFlicker;
        } else {
          next.emissiveTorchFlicker = true;
        }
      }
      if (patch.emissiveLanternFlicker !== undefined) {
        if (
          patch.emissiveLanternFlicker === null ||
          !patch.emissiveLanternFlicker
        ) {
          delete next.emissiveLanternFlicker;
        } else {
          next.emissiveLanternFlicker = true;
        }
      }
      if (patch.emissiveSuppressHostShadow !== undefined) {
        if (
          patch.emissiveSuppressHostShadow === null ||
          !patch.emissiveSuppressHostShadow
        ) {
          delete next.emissiveSuppressHostShadow;
        } else {
          next.emissiveSuppressHostShadow = true;
        }
      }
      const nextModels = { ...pack.voxelModels, [modelId]: next };
      onPackChange(packWithVoxels(pack, nextModels, pack.voxelScenes));
      void writeVoxelRegistry(nextModels, pack.voxelScenes ?? {}, {
        dirtyIds: [modelId],
      }).then((res) => {
        if (!res.ok) onSaved(`Свет вокселя: ошибка записи — ${res.error}`);
      });
    },
    [onPackChange, onSaved, pack],
  );

  const duplicateVoxelPlacement = useCallback(
    (placeId: string) => {
      const src = (mapRef.current.voxelProps ?? []).find((p) => p.id === placeId);
      if (!src) return;
      pushHistory(mapRef.current, "Дублировать воксельный объект");
      const next = cloneMap(mapRef.current);
      const newId = `vx_${src.x}_${src.y}_${Date.now().toString(36)}`;
      next.voxelProps = [
        ...(next.voxelProps ?? []),
        {
          ...src,
          id: newId,
        },
      ];
      publishMap(next);
      setSelection({ kind: "voxel", id: newId });
      onSaved("Воксель продублирован на той же клетке");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, onSaved],
  );

  /** Open the shared library model (full modifiers: light, size, origin…). */
  const openVoxelSculptForPlacement = useCallback(
    (placementId: string) => {
      const place = (mapRef.current.voxelProps ?? []).find(
        (p) => p.id === placementId,
      );
      if (!place) return;
      if (!pack.voxelModels?.[place.modelId]) {
        onSaved("Модель вокселя не найдена — открой библиотеку.");
        return;
      }
      setVoxelSculptFocusId(place.modelId);
      setVoxelSculptSession({ mode: "library" });
    },
    [onSaved, pack.voxelModels],
  );

  /** Create a per-placement copy of the model (no shared library overwrite). */
  const openVoxelSculptVariantForPlacement = useCallback(
    (placementId: string) => {
      const place = (mapRef.current.voxelProps ?? []).find(
        (p) => p.id === placementId,
      );
      if (!place) return;
      if (!pack.voxelModels?.[place.modelId]) {
        onSaved("Модель вокселя не найдена — открой библиотеку.");
        return;
      }
      setVoxelSculptSession({
        mode: "placementVariant",
        placementId: place.id,
        sourceModelId: place.modelId,
      });
    },
    [onSaved, pack.voxelModels],
  );

  const openVoxelSculptLibrary = useCallback(() => {
    setVoxelSculptFocusId(null);
    setVoxelSculptSession({ mode: "library" });
  }, []);

  const openVoxelSculptScene = useCallback((sceneId: string) => {
    setVoxelSculptFocusId(sceneId);
    setVoxelSculptSession({ mode: "library" });
  }, []);

  const onSavedVoxelVariant = useCallback(
    (payload: { model: { id: string }; placementId: string }) => {
      pushHistory(mapRef.current);
      const next = cloneMap(mapRef.current);
      next.voxelProps = (next.voxelProps ?? []).map((p) =>
        p.id === payload.placementId
          ? { ...p, modelId: payload.model.id }
          : p,
      );
      publishMap(next);
      setSelection({ kind: "voxel", id: payload.placementId });
      setVoxelSculptSession(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange],
  );

  const undo = useCallback(() => {
    const prev = commandStack.undo(documentStore);
    if (!prev) return;
    mapRef.current = prev;
    onChangeRef.current(prev);
  }, [commandStack, documentStore]);

  const redo = useCallback(() => {
    const next = commandStack.redo(documentStore);
    if (!next) return;
    mapRef.current = next;
    onChangeRef.current(next);
  }, [commandStack, documentStore]);

  /** Pick paint height Z only — does not switch to the elevation tool. */
  const setFloorElev = useCallback((elev: number) => {
    setBrushElev(clampElevation(elev));
  }, []);

  const reshapeSelectedTileColumn = useCallback(
    (mode: "platform" | "column") => {
      const sel = selectionRef.current;
      if (sel?.kind !== "tile") return;
      const current = mapRef.current;
      const top = sel.elev ?? topOccupiedElevAt(current, sel.tx, sel.ty);
      if (top == null || top <= 0) return;
      const id = elevTileIdAt(current, sel.tx, sel.ty, top);
      if (!id) return;
      pushHistory(
        current,
        mode === "platform" ? "Сделать платформу" : "Заполнить колонну",
      );
      const next = ensureMapLayers(cloneMap(current));
      if (mode === "platform") {
        hollowElevColumn(next, sel.tx, sel.ty, top);
      } else {
        fillElevColumn(next, sel.tx, sel.ty, top, id);
      }
      publishMap(next);
      setSelection({ kind: "tile", tx: sel.tx, ty: sel.ty, elev: top });
    },
    [publishMap, pushHistory, setSelection],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === "Escape" && marqueeing.current) {
        e.preventDefault();
        e.stopPropagation();
        marqueeing.current = false;
        marqueeAddRef.current = false;
        marqueeStartRef.current = null;
        marqueeEndRef.current = null;
        setMarqueeSel(null);
        return;
      }
      if (e.code === "Escape" && objectGrabRef.current) {
        e.preventDefault();
        e.stopPropagation();
        setObjectGrab(null);
        return;
      }
      if (!e.ctrlKey && !e.metaKey && e.altKey && e.code === "KeyH") {
        e.preventDefault();
        sceneState.revealAll();
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const sel = selectionRef.current;
        const three = threePreviewRef.current;
        if (e.code === "Delete" || e.code === "Backspace") {
          if (
            selectedSceneObjects.length > 0 ||
            selectionItemsRef.current.some((item) => item.kind === "tile")
          ) {
            e.preventDefault();
            e.stopPropagation();
            deleteWorldSelection(selectedSceneObjects);
            return;
          }
          // Implicit glow sources are selectable in the viewport but are not
          // regular Outliner objects until they get an authored override.
          if (sel?.kind === "light") {
            e.preventDefault();
            e.stopPropagation();
            deleteLightSource(sel.id);
            return;
          }
        }
        const gizmoSel =
          sel?.kind === "voxel" ||
          sel?.kind === "sprite" ||
          sel?.kind === "light" ||
          sel?.kind === "tile" ||
          sel?.kind === "region" ||
          sel?.kind === "group";
        if (gizmoSel && e.code === "KeyG") {
          e.preventDefault();
          setObjectGrab(null);
          three?.setTransformMode("translate");
          return;
        }
        if (
          gizmoSel &&
          e.code === "KeyR" &&
          (sel?.kind === "voxel" || sel?.kind === "group")
        ) {
          e.preventDefault();
          setObjectGrab(null);
          three?.setTransformMode("rotate");
          return;
        }
        if (
          e.code === "KeyS" &&
          (selectionItemsRef.current.length > 1 ||
            sel?.kind === "voxel" ||
            sel?.kind === "sprite" ||
            sel?.kind === "region" ||
            sel?.kind === "group")
        ) {
          e.preventDefault();
          setObjectGrab(null);
          three?.setTransformMode("scale");
          return;
        }
        if (e.code === "F1") {
          e.preventDefault();
          setShowEditorHints((v) => !v);
          return;
        }
        if (e.code === "KeyH") {
          e.preventDefault();
          if (e.shiftKey) {
            if (selectedSceneObjects.length > 0) {
              sceneState.isolate(
                selectedSceneObjects.map((object) => object.key),
                sceneObjects.map((object) => object.key),
              );
              setObjectGrab(null);
            }
            return;
          }
          if (selectedSceneObjects.length > 0) {
            const allHidden = selectedSceneObjects.every((object) =>
              sceneState.isHidden(object.key),
            );
            sceneState.setHiddenMany(
              selectedSceneObjects.map((object) => object.key),
              !allHidden,
            );
          }
          return;
        }
        if (e.code === "Slash" || e.code === "NumpadDivide") {
          e.preventDefault();
          if (sceneState.isIsolated()) {
            sceneState.exitIsolate();
          } else if (selectedSceneObjects.length > 0) {
            sceneState.isolate(
              selectedSceneObjects.map((object) => object.key),
              sceneObjects.map((object) => object.key),
            );
            setObjectGrab(null);
          }
          return;
        }
        if (e.code === "KeyQ") {
          e.preventDefault();
          setViewMode("top");
          const obj = selectedSceneObjects[0];
          if (obj) {
            three?.setExploreCamera(
              obj.transform.position.x,
              obj.transform.position.y,
            );
          } else if (sel?.kind === "tile") {
            three?.setExploreCamera(sel.tx, sel.ty);
          } else if (sel?.kind === "region") {
            const region = mapRef.current.regions.find((r) => r.id === sel.id);
            if (region) three?.setExploreCamera(region.x, region.y);
            else three?.setExploreCamera();
          } else {
            const start = mapRef.current.regions.find(
              (r) => r.kind === "player_start",
            );
            if (start) three?.setExploreCamera(start.x, start.y);
            else three?.setExploreCamera();
          }
          return;
        }
        if (e.code === "Period" || e.code === "NumpadDecimal") {
          const focusObj = selectedSceneObjects[0];
          if (focusObj) {
            e.preventDefault();
            if (focusObj.source.kind === "region") {
              focusRegion(focusObj.source.value);
            } else {
              three?.focusTile(
                focusObj.transform.position.x,
                focusObj.transform.position.y,
              );
            }
            return;
          }
          if (sel?.kind === "tile") {
            e.preventDefault();
            three?.focusTile(sel.tx, sel.ty);
            return;
          }
          if (sel?.kind === "region") {
            const region = mapRef.current.regions.find((r) => r.id === sel.id);
            if (region) {
              e.preventDefault();
              focusRegion(region);
            }
            return;
          }
        }
        if (e.shiftKey && selectedSceneObjects.length > 0) {
          const dx =
            e.code === "ArrowLeft" ? -1 : e.code === "ArrowRight" ? 1 : 0;
          const dy =
            e.code === "ArrowUp" ? -1 : e.code === "ArrowDown" ? 1 : 0;
          if (dx !== 0 || dy !== 0) {
            e.preventDefault();
            translateWorldSelection(selectedSceneObjects, dx, dy);
            return;
          }
        }
        // Selected tile: [ ] move top story up/down (Minecraft column nudge).
        if (sel?.kind === "tile") {
          if (e.code === "BracketLeft" || e.code === "BracketRight") {
            e.preventDefault();
            const dir = e.code === "BracketRight" ? 1 : -1;
            const m = mapRef.current;
            const top =
              sel.elev ?? topOccupiedElevAt(m, sel.tx, sel.ty);
            if (top == null) return;
            const nextElev = clampElevation(top + dir);
            if (nextElev === top) return;
            const id = elevTileIdAt(m, sel.tx, sel.ty, top);
            if (!id) return;
            pushHistory(m);
            const next = ensureMapLayers(cloneMap(m));
            clearElevTile(next, sel.tx, sel.ty, top);
            setElevTileId(next, sel.tx, sel.ty, nextElev, id);
            publishMap(next);
            setSelection({
              kind: "tile",
              tx: sel.tx,
              ty: sel.ty,
              elev: nextElev,
            });
            return;
          }
        }
        const toolHot = TOOL_HOTKEYS[e.code];
        if (toolHot) {
          // Z without modifiers = floor tool; Ctrl+Z stays undo below.
          e.preventDefault();
          selectTool(toolHot);
          return;
        }
        const cam = mapViewModeFromArrow(e.code);
        if (cam) {
          e.preventDefault();
          setViewMode(cam);
          return;
        }
        const elevFromDigit =
          e.code === "Digit1" || e.code === "Numpad1"
            ? 1
            : e.code === "Digit2" || e.code === "Numpad2"
              ? 2
              : e.code === "Digit3" || e.code === "Numpad3"
                ? 3
                : e.code === "Digit0" || e.code === "Numpad0"
                  ? 0
                  : e.code === "Minus" || e.code === "NumpadSubtract"
                    ? MIN_ELEVATION
                    : null;
        if (elevFromDigit != null && elevFromDigit <= MAX_ELEVATION) {
          e.preventDefault();
          setFloorElev(elevFromDigit);
          return;
        }
        if (e.code === "KeyR" && isStairTileId(tileset, tileId)) {
          e.preventDefault();
          rotateStair(e.shiftKey ? -1 : 1);
          return;
        }
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.code === "KeyD") {
        e.preventDefault();
        e.stopPropagation();
        const sel = selectionRef.current;
        if (sel?.kind === "group") duplicateSceneGroup(sel.id);
        else if (selectedSceneObjects.length > 0) {
          duplicateWorldSelection(selectedSceneObjects);
        }
        return;
      }
      if (e.code === "KeyG" && selectedSceneObjects.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const current = mapRef.current;
        const result = createEmberSceneGroup(
          current,
          selectedSceneObjects.map((object) => object.key),
        );
        if (!result.group) return;
        pushHistory(current, `Создать ${result.group.name}`);
        publishMap(result.map);
        onSaved(`${result.group.name}: ${selectedSceneObjects.length} объектов`);
        return;
      }
      const isUndo = e.code === "KeyZ" && !e.shiftKey;
      const isRedo =
        e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey);
      if (!isUndo && !isRedo) return;
      e.preventDefault();
      e.stopPropagation();
      if (isUndo) undo();
      else redo();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    undo,
    redo,
    rotateStair,
    tileset,
    tileId,
    setFloorElev,
    selectTool,
    publishMap,
    pushHistory,
    setSelection,
    deleteLightSource,
    deleteWorldSelection,
    selectedSceneObjects,
    sceneObjects,
    duplicateWorldSelection,
    duplicateSceneGroup,
    translateWorldSelection,
    sceneState,
    onSaved,
    focusRegion,
  ]);

  const paintTileCell = (
    next: EmberMap,
    idx: number,
    selected: EmberTilesetTile | undefined,
  ) => {
    const x = idx % next.width;
    const y = Math.floor(idx / next.width);
    if (layer === "decor") {
      const lay = next.layers.find((l) => l.name === "decor");
      if (!lay) return;
      lay.data[idx] = tileId;
      return;
    }
    // Ground → per-elevation stack (Minecraft column). Only this Z changes.
    const makeWall = Boolean(
      selected?.solid || (selected?.defaultHeight ?? 0) >= 1,
    );
    const connDir = selected?.stair ?? selected?.ramp;
    const isConnector = Boolean(connDir);
    setWallHeightVoxels(
      next,
      idx,
      makeWall && !isConnector
        ? (selected?.defaultHeight ?? 1) * next.tileSize
        : 0,
    );
    if (connDir && tileset) {
      const elev = suggestConnectorElevation(next, tileset, x, y, connDir);
      setElevTileId(next, x, y, elev, tileId);
    } else {
      setElevTileId(next, x, y, brushElev, tileId);
    }
  };

  const floodFill = (next: EmberMap, startIdx: number) => {
    if (layer === "decor") {
      const lay = next.layers.find((l) => l.name === "decor");
      if (!lay) return;
      const target = lay.data[startIdx] ?? 0;
      if (target === tileId) return;
      const stack = [startIdx];
      const seen = new Set<number>();
      while (stack.length) {
        const i = stack.pop()!;
        if (seen.has(i) || lay.data[i] !== target) continue;
        seen.add(i);
        lay.data[i] = tileId;
        const tx = i % map.width;
        const ty = Math.floor(i / map.width);
        if (tx > 0) stack.push(i - 1);
        if (tx < map.width - 1) stack.push(i + 1);
        if (ty > 0) stack.push(i - map.width);
        if (ty < map.height - 1) stack.push(i + map.width);
      }
      return;
    }
    // Flood at the locked elev story only.
    const startX = startIdx % map.width;
    const startY = Math.floor(startIdx / map.width);
    const target = elevTileIdAt(next, startX, startY, brushElev);
    if (target === tileId) return;
    const selected = tileset?.tiles.find((t) => t.id === tileId);
    const stack = [startIdx];
    const seen = new Set<number>();
    const makeWall = Boolean(
      selected?.solid || (selected?.defaultHeight ?? 0) >= 1,
    );
    const connDir = selected?.stair ?? selected?.ramp;
    const isConnector = Boolean(connDir);
    while (stack.length) {
      const i = stack.pop()!;
      if (seen.has(i)) continue;
      const tx = i % map.width;
      const ty = Math.floor(i / map.width);
      if (elevTileIdAt(next, tx, ty, brushElev) !== target) continue;
      seen.add(i);
      setElevTileId(next, tx, ty, brushElev, tileId);
      setWallHeightVoxels(
        next,
        i,
        makeWall && !isConnector
          ? (selected?.defaultHeight ?? 1) * next.tileSize
          : 0,
      );
      if (tx > 0) stack.push(i - 1);
      if (tx < map.width - 1) stack.push(i + 1);
      if (ty > 0) stack.push(i - map.width);
      if (ty < map.height - 1) stack.push(i + map.width);
    }
    if (seen.size === 0 || !connDir || !tileset) return;
    for (const i of seen) {
      const x = i % next.width;
      const y = Math.floor(i / next.width);
      const elev = suggestConnectorElevation(next, tileset, x, y, connDir);
      setElevTileId(next, x, y, elev, tileId);
    }
  };

  const applyToolToRect = (start: TilePos, end: TilePos) => {
    const activeTool = toolRef.current;
    if (activeTool === "eyedrop" || activeTool === "select") return;

    const { x0, y0, x1, y1 } = normalizeRect(start, end);
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const single = w === 1 && h === 1;

    pushHistory(mapRef.current, "Изменить блоки");
    const next = ensureMapLayers(cloneMap(mapRef.current));
    const selected = tileset?.tiles.find((t) => t.id === tileId);

    // Fill: single click → flood; drag → paint rectangle
    if (activeTool === "fill" && single) {
      floodFill(next, y0 * map.width + x0);
      publishMap(next);
      return;
    }

    if (activeTool === "sprite") {
      const sid = stampSpriteIdRef.current;
      if (!sid || !pack.sprites[sid]) {
        commandStack.discardLatestUndo();
        return;
      }
      let list = [...(next.sprites ?? [])];
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          list = list.filter((p) => !(p.x === x && p.y === y));
          list.push({
            id: `sp_${x}_${y}_${Date.now().toString(36)}_${x}_${y}`,
            spriteId: sid,
            x,
            y,
          });
        }
      }
      next.sprites = list;
      publishMap(next);
      return;
    }

    const cells: TilePos[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        cells.push({ x, y });
      }
    }
    // Paint stairs/ramps low→high along climb so auto-Z can chain in one stroke.
    const connDir = selected?.stair ?? selected?.ramp;
    if (
      connDir &&
      (activeTool === "paint" || activeTool === "fill") &&
      layer === "ground"
    ) {
      const { dx, dy } = rampDirDelta(connDir);
      cells.sort((a, b) => (a.x - b.x) * dx + (a.y - b.y) * dy);
    }

    for (const { x, y } of cells) {
      const idx = y * map.width + x;
      if (activeTool === "collision") {
        const delta = wallPaintDelta.current;
        if (delta != null) {
          const cur = heightVoxelsAt(next, x, y);
          setWallHeightVoxels(next, idx, cur + delta);
        } else {
          setWallHeightVoxels(next, idx, wallPaintValue.current ?? 0);
        }
      } else if (activeTool === "elevation") {
        // Place/extend current tile at locked Z without wiping lower stories.
        const cur = elevTileIdAt(next, x, y, brushElev);
        if (!cur) {
          const top = topOccupiedElevAt(next, x, y);
          const id =
            (top != null ? elevTileIdAt(next, x, y, top) : 0) || tileId;
          if (id) setElevTileId(next, x, y, brushElev, id);
        }
      } else if (activeTool === "erase") {
        // Stroke erase is applied live via eraseBreakTarget — skip rect fill.
        continue;
      } else {
        // paint or rectangular fill
        paintTileCell(next, idx, selected);
      }
    }
      publishMap(next);
  };

  const cancelMarquee = () => {
    marqueeing.current = false;
    marqueeAddRef.current = false;
    marqueeStartRef.current = null;
    marqueeEndRef.current = null;
    setMarqueeSel(null);
  };

  const finishMarquee = () => {
    if (!marqueeing.current) return;
    const start = marqueeStartRef.current;
    const end = marqueeEndRef.current ?? start;
    const elev = marqueeElevRef.current;
    const add = marqueeAddRef.current;
    cancelMarquee();
    if (!start || !end) return;
    const packNow = packRef.current;
    const mapNow = mapRef.current;
    const hits = collectPlanarMarqueeHits({
      map: mapNow,
      start,
      end,
      elev,
      filter: selectionFilterRef.current,
      voxelModels: packNow.voxelModels,
      tileset: packNow.tilesets[mapNow.tilesetId],
      sprites: packNow.sprites,
      isHidden: (key) => sceneState.isHidden(key),
      isLocked: (key) => sceneState.isLocked(key),
    });
    const primary =
      hits.find((hit) => hit.kind !== "tile") ?? hits[0] ?? null;
    if (add) {
      selectionService.replaceMany(
        [...selectionService.getState().items, ...hits],
        primary,
      );
    } else {
      selectionService.replaceMany(hits, primary);
    }
    const nextPrimary = selectionService.getPrimary();
    setSelectedRegionId(
      nextPrimary?.kind === "region" ? nextPrimary.id : null,
    );
  };

  const finishDrag = () => {
    if (!painting.current) return;
    const start = dragStartRef.current;
    const end = dragEndRef.current ?? start;
    const wasErase = toolRef.current === "erase";
    painting.current = false;
    eraseStrokeSaved.current = false;
    eraseLastKey.current = null;
    if (start && end && toolRef.current !== "eyedrop" && !wasErase) {
      applyToolToRect(start, end);
    }
    dragStartRef.current = null;
    dragEndRef.current = null;
    wallPaintValue.current = null;
    wallPaintDelta.current = null;
    setDragSel(null);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const orbit = orbitingRef.current;
      if (orbit) {
        const dx = e.clientX - orbit.lastX;
        orbit.lastX = e.clientX;
        orbit.lastY = e.clientY;
        threePreviewRef.current?.orbitYaw(-dx * 0.008);
        blitBaseAndOverlay();
        return;
      }
      const pan = panningRef.current;
      if (pan) {
        const dx = e.clientX - pan.lastX;
        const dy = e.clientY - pan.lastY;
        pan.lastX = e.clientX;
        pan.lastY = e.clientY;
        threePreviewRef.current?.panScreen(dx, dy);
        blitBaseAndOverlay();
        return;
      }
      if (marqueeing.current && marqueeStartRef.current) {
        const place = clientToPlaceTarget(e.clientX, e.clientY);
        if (!place) return;
        const tile = { x: place.tx, y: place.ty };
        marqueeEndRef.current = tile;
        setMarqueeSel({
          start: marqueeStartRef.current,
          end: tile,
          elev: marqueeElevRef.current,
          add: marqueeAddRef.current,
        });
        return;
      }
      if (painting.current && dragStartRef.current) {
        if (toolRef.current === "eyedrop") return;
        const active = toolRef.current;
        if (active === "erase") {
          const brk = clientToBreakTarget(e.clientX, e.clientY);
          if (brk) {
            updatePlacePreview(brk);
            eraseBreakTarget(brk);
            dragEndRef.current = { x: brk.tx, y: brk.ty };
          }
          return;
        }
        const usePlace =
          active === "paint" ||
          active === "fill" ||
          active === "elevation";
        const place = usePlace
          ? clientToPlaceTarget(e.clientX, e.clientY)
          : null;
        const tile = place
          ? { x: place.tx, y: place.ty }
          : clientToTile(e.clientX, e.clientY);
        if (!tile) return;
        if (place) updatePlacePreview(place);
        dragEndRef.current = tile;
        setDragSel({ start: dragStartRef.current, end: tile });
        return;
      }
      const grab = objectGrabRef.current;
      if (grab) {
        const tile = clientToTile(e.clientX, e.clientY);
        if (!tile) return;
        if (grab.mode === "move") {
          if (grab.hover?.x === tile.x && grab.hover?.y === tile.y) return;
          setObjectGrab({ ...grab, hover: tile });
          return;
        }
        const place = mapRef.current.voxelProps?.find((p) => p.id === grab.id);
        if (!place) return;
        const previewRot = voxelRotToward(
          place.x,
          place.y,
          tile.x,
          tile.y,
          grab.previewRot,
        );
        if (
          grab.hover?.x === tile.x &&
          grab.hover?.y === tile.y &&
          grab.previewRot === previewRot
        ) {
          return;
        }
        setObjectGrab({ ...grab, hover: tile, previewRot });
        return;
      }
      // Idle hover: edge-glow the object / tile under the cursor.
      // While dragging the transform gizmo, keep mouse-hover off — snap
      // destination is shown via placePreview instead.
      if (transformDraggingRef.current) {
        setHoverSelectionStack((current) =>
          current.length === 0 ? current : [],
        );
        if (hoverPickRef.current) {
          hoverPickRef.current = null;
          syncThreeOverlays();
        }
        return;
      }
      const wrap = canvasWrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!inside) {
        if (hoverPickRef.current) {
          hoverPickRef.current = null;
          syncThreeOverlays();
        }
        setWallHoverTile(null);
        setLibHoverTile(null);
        setHoverSelectionStack((current) =>
          current.length === 0 ? current : [],
        );
        clearPlacePreview();
        return;
      }
      if (libSelectedRef.current) {
        const pendingTile = clientToLibraryPlacementTarget(
          e.clientX,
          e.clientY,
        );
        setLibHoverTile((prev) =>
          prev?.x === pendingTile?.x &&
          prev?.y === pendingTile?.y &&
          prev?.elev === pendingTile?.elev
            ? prev
            : pendingTile,
        );
      }
      const activeTool = toolRef.current;
      let pick: EditorPick | null = null;
      if (activeTool === "select") {
        const stack = clientToSelectionStack(e.clientX, e.clientY);
        setHoverSelectionStack((current) => {
          const currentKey = current.map(mapSelectionKey).join("|");
          const nextKey = stack.map(mapSelectionKey).join("|");
          return currentKey === nextKey ? current : stack;
        });
        const lamps = tileset
          ? listLanternSources(mapRef.current, tileset, pack.sprites)
          : [];
        pick = selectionToPick(
          stack[0] ?? null,
          lamps,
          mapRef.current.regions,
        );
      } else {
        setHoverSelectionStack((current) =>
          current.length === 0 ? current : [],
        );
        const pt = clientToCanvas(e.clientX, e.clientY);
        pick = pt
          ? (threePreviewRef.current?.pickObject(pt.sx, pt.sy) ?? null)
          : null;
      }
      if (!picksEqual(hoverPickRef.current, pick)) {
        hoverPickRef.current = pick;
        syncThreeOverlays();
      }
      const showPlaceGhost =
        !objectGrabRef.current &&
        !transformDraggingRef.current &&
        (activeTool === "paint" ||
          activeTool === "fill" ||
          activeTool === "elevation" ||
          activeTool === "erase" ||
          activeTool === "collision");
      if (showPlaceGhost) {
        const place =
          activeTool === "erase"
            ? clientToBreakTarget(e.clientX, e.clientY)
            : clientToPlaceTarget(e.clientX, e.clientY);
        updatePlacePreview(place);
      } else {
        clearPlacePreview();
      }
      if (toolRef.current === "collision") {
        const nextHover =
          pick?.kind === "tile" ? { x: pick.tx, y: pick.ty } : null;
        setWallHoverTile((prev) => {
          if (prev?.x === nextHover?.x && prev?.y === nextHover?.y) {
            return prev;
          }
          return nextHover;
        });
      } else {
        setWallHoverTile(null);
      }
    };
    const onUp = (e: MouseEvent) => {
      if (orbitingRef.current) {
        orbitingRef.current = null;
        if (e.button === 2) return;
      }
      if (panningRef.current) {
        panningRef.current = null;
        setIsPanning(false);
        if (e.button === 1) return;
      }
      finishMarquee();
      finishDrag();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // finishDrag/apply close over latest brush values via refs + state in closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    clientToTile,
    clientToLibraryPlacementTarget,
    clientToPlaceTarget,
    clientToBreakTarget,
    clientToCanvas,
    clientToSelectionStack,
    eraseBreakTarget,
    layer,
    tileId,
    brushElev,
    brushWallDelta,
    tileset,
    map.width,
    blitBaseAndOverlay,
    syncThreeOverlays,
    updatePlacePreview,
    clearPlacePreview,
  ]);

  const beginCanvasCam = useCallback((e: ReactMouseEvent) => {
    // MMB = pan, RMB or Alt+LMB = yaw orbit (isometric pitch locked).
    if (e.button === 1) {
      e.preventDefault();
      panningRef.current = { lastX: e.clientX, lastY: e.clientY };
      setIsPanning(true);
      return true;
    }
    if (e.button === 2 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      // RMB on map clears library place-tool selection (Старт / Спавн / …).
      if (e.button === 2 && libSelectedRef.current) {
        setLibSelected(null);
      }
      orbitingRef.current = { lastX: e.clientX, lastY: e.clientY };
      return true;
    }
    return false;
  }, []);

  const saveMap = useCallback(async (reason: "manual" | "auto") => {
    if (savingRef.current) return;
    const payload = ensureMapLayers(mapRef.current);
    const json = JSON.stringify(payload);
    if (reason === "auto" && json === lastSavedJsonRef.current) {
      dirtyRef.current = false;
      documentStore.markSaved();
      setSaveState("saved");
      return;
    }
    savingRef.current = true;
    setSaveState("saving");
    const res = await writeEmberJson(`maps/${payload.id}.json`, payload);
    savingRef.current = false;
    if (res.ok) {
      lastSavedJsonRef.current = json;
      dirtyRef.current = false;
      documentStore.markSaved();
      setSaveState("saved");
      onSavedRef.current(
        reason === "auto"
          ? `Автосохранение карты (${res.source})`
          : `Карта сохранена (${res.source})`,
      );
      return;
    }
    setSaveState("error");
    onSavedRef.current(
      `Ошибка сохранения: ${"error" in res ? res.error : "?"}`,
    );
  }, [documentStore]);

  // Baseline when switching maps — don't treat load as dirty.
  useEffect(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    lastSavedJsonRef.current = JSON.stringify(ensureMapLayers(map));
    dirtyRef.current = false;
    documentStore.syncExternal(map);
    documentStore.markSaved();
    setSaveState("saved");
    // Only reset on id change; map body tracked below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.id]);

  // Debounced autosave after map edits.
  useEffect(() => {
    const json = JSON.stringify(ensureMapLayers(map));
    if (!lastSavedJsonRef.current) {
      lastSavedJsonRef.current = json;
      dirtyRef.current = false;
      documentStore.markSaved();
      setSaveState("saved");
      return;
    }
    if (json === lastSavedJsonRef.current) {
      dirtyRef.current = false;
      documentStore.markSaved();
      setSaveState((s) => (s === "saving" || s === "error" ? s : "saved"));
      return;
    }
    dirtyRef.current = true;
    setSaveState((s) => (s === "saving" ? s : "dirty"));
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void saveMap("auto");
    }, MAP_AUTOSAVE_MS);
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [map, saveMap]);

  // Flush pending edits when leaving the map / unmounting.
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      if (!dirtyRef.current || savingRef.current) return;
      const payload = ensureMapLayers(mapRef.current);
      void writeEmberJson(`maps/${payload.id}.json`, payload);
    };
  }, [map.id]);

  const tilePaletteItems = useMemo((): EmberThumbItem[] => {
    const tiles = tileset?.tiles ?? [];
    const stairProto = tiles.find((t) => t.stair);
    const items: EmberThumbItem[] = tiles
      .filter((t) => !t.stair)
      .map((t) => {
        const empty = t.color === "#00000000";
        const badges: string[] = [];
        if (t.solid) badges.push("solid");
        if (t.ramp) badges.push("ramp");
        if (t.glow) badges.push("свет");
        return {
          id: String(t.id),
          label: t.name,
          title: `#${t.id} ${t.name}${t.solid ? " (solid)" : ""}${t.ramp ? ` ramp ${t.ramp}` : ""}`,
          badges,
          thumb: (
            <EmberTileSwatch color={t.color} empty={empty} size={40} />
          ),
        };
      });
    if (stairProto) {
      items.push({
        id: STAIR_PALETTE_ID,
        label: "Лестница",
        title: `Лестница · подъём ${STAIR_DIR_LABEL[stairDir]} · R — повернуть · следующая клетка по направлению — Z+1`,
        badges: [STAIR_DIR_LABEL[stairDir], "auto Z", "R"],
        thumb: (
          <EmberStairThumb
            dir={stairDir}
            color={stairProto.color}
            size={40}
          />
        ),
        footer: (
          <div
            className="ember-stair-rotate"
            role="group"
            aria-label="Поворот лестницы"
          >
            {RAMP_DIRS.map((d) => (
              <button
                key={d}
                type="button"
                className={`ember-stair-rotate__btn ${stairDir === d ? "is-active" : ""}`}
                title={`Подъём ${STAIR_DIR_LABEL[d]}`}
                onClick={(e) => {
                  e.stopPropagation();
                  applyStairDir(d);
                }}
              >
                {d === "n" ? "↑" : d === "e" ? "→" : d === "s" ? "↓" : "←"}
              </button>
            ))}
            <button
              type="button"
              className="ember-stair-rotate__btn ember-stair-rotate__btn--spin"
              title="Повернуть (R)"
              onClick={(e) => {
                e.stopPropagation();
                rotateStair(1);
              }}
            >
              ↻
            </button>
          </div>
        ),
      });
    }
    return items;
  }, [tileset?.tiles, stairDir, applyStairDir, rotateStair]);

  const spriteStampItems = useMemo(
    () =>
      Object.values(pack.sprites).map((raw) => {
        const s = normalizePixelSprite(raw);
        const badges: string[] = [`${s.width}×${s.topHeight}`];
        if (s.solid) badges.push("физ");
        if (s.glow) badges.push("свет");
        return {
          id: s.id,
          label: s.nameRu ?? s.id,
          title: `${s.nameRu ?? s.id} · ${s.width}×${s.topHeight}${s.wallHeights.length ? ` +${s.wallHeights.length}ст` : ""}`,
          badges,
          thumb: <EmberSpriteThumb sprite={s} size={40} />,
        };
      }),
    [pack.sprites],
  );

  const activeDock =
    dockPanel != null
      ? (DOCK_TABS.find((t) => t.id === dockPanel) ?? null)
      : null;

  const activeTool = TOOLS.find((t) => t.id === tool);
  const stampSprite = stampSpriteId
    ? pack.sprites[stampSpriteId]
      ? normalizePixelSprite(pack.sprites[stampSpriteId]!)
      : null
    : null;
  const layerLabel = layer === "ground" ? "Земля" : "Декор";

  const dockValue = (id: DockPanel): { caption: string; detail?: string } => {
    switch (id) {
      case "tools":
        if (tool === "select") {
          return { caption: "Выбор", detail: "V · G/R" };
        }
        if (tool === "lightpick") {
          return {
            caption: selectedLightId ? "Источник" : "Свет на карте",
            detail: selectedLightId ? "L" : "L · клик",
          };
        }
        if (tool === "sprite") {
          return {
            caption: stampSprite?.nameRu?.trim() || stampSprite?.id || "Спрайт",
            detail: "S",
          };
        }
        if (tool === "elevation") {
          return { caption: `Блок Z${brushElev}`, detail: "Z" };
        }
        if (tool === "collision") {
          const wallCap =
            brushWallDelta === 0
              ? "Стены сброс"
              : `Стены ${brushWallDelta > 0 ? "+" : ""}${brushWallDelta}`;
          return { caption: wallCap, detail: "W" };
        }
        if (tool === "fill") {
          return { caption: "Заливка", detail: "F" };
        }
        return {
          caption: activeTool?.labelRu ?? "Кисть",
          detail: `${activeTool?.glyph ?? "B"} · ${layerLabel}`,
        };
      case "tiles":
        if (selectedTile?.stair) {
          return {
            caption: "Лестница",
            detail: STAIR_DIR_LABEL[selectedTile.stair],
          };
        }
        return {
          caption: selectedTile
            ? selectedTile.name || `#${selectedTile.id}`
            : "Тайл",
          detail: selectedTile ? `#${selectedTile.id}` : undefined,
        };
      case "elev":
        return {
          caption: `Z${brushElev}`,
          detail: "Ctrl+колёсико",
        };
      case "view":
        return {
          caption: mapViewModeLabelRu(viewMode),
          detail: "ПКМ орбита",
        };
      case "settings": {
        const atm = globalLight.atmosphere;
        const fx =
          atm.rain > 0.05
            ? "дождь"
            : atm.fog > 0.05
              ? "туман"
              : atm.cloudShadows > 0.05
                ? "облака"
                : atm.fireflies > 0.05
                  ? "светлячки"
                  : "ясно";
        return {
          caption: "Настройки",
          detail: fx,
        };
      }
      case "light": {
        const n = tileset
          ? listLanternSources(map, tileset, pack.sprites).length
          : 0;
        return {
          caption: selectedLightId ? "Источник" : "Фонари",
          detail: selectedLightId
            ? "выбран"
            : map.light
              ? `${n} ламп`
              : `${n} · default`,
        };
      }
      case "regions":
        return {
          caption: `${map.regions.length} зон`,
          detail: selectedRegionId ? "выбран" : undefined,
        };
      case "stage":
        return {
          caption: activeStage?.nameRu?.trim() || activeStage?.id || "Стадия",
          detail: activeStage
            ? `${activeStage.durationSec}с · ${activeStage.spawnTableId}`
            : undefined,
        };
      case "spawn":
        return {
          caption: activeSpawn
            ? `${activeSpawn.entries.length} волн`
            : "Спавны",
          detail: activeSpawn?.id,
        };
      default: {
        const _n: never = id;
        return _n;
      }
    }
  };

  return (
    <div className="ember-map-root">
      <div className="ember-editor-panel-head">
        <h2>Карта</h2>
        <p>
          Выбор (V) · G/R/S гизмо · Ctrl+D дубль · H скрыть · Shift+H изоляция ·
          Q explore-камера · F1 подсказки
        </p>
      </div>
      <div className="ember-map-workspace ember-map-workspace--chrome">
        <div className="ember-map-main">
          <div className="ember-map-main__bar" ref={dockRef}>
            <div className="ember-map-chrome">
              <div
                className="ember-map-dock"
                role="toolbar"
                aria-label="Панель карты"
              >
                {DOCK_TABS.map((tab) => {
                  const value = dockValue(tab.id);
                  const showTileSwatch = tab.id === "tiles" && selectedTile;
                  const showStairThumb =
                    showTileSwatch && Boolean(selectedTile?.stair);
                  const showSpriteThumb =
                    tab.id === "tools" && tool === "sprite" && stampSprite;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      ref={(el) => {
                        dockBtnRefs.current[tab.id] = el;
                      }}
                      className={`ember-map-dock__btn ${dockPanel === tab.id ? "is-active" : ""} ${
                        tab.id === "tools" ? "ember-map-dock__btn--tool" : ""
                      }`}
                      title={`${tab.labelRu}: ${value.caption}${value.detail ? ` · ${value.detail}` : ""} — ${tab.hint}`}
                      aria-pressed={dockPanel === tab.id}
                      onClick={() => toggleDock(tab.id)}
                    >
                      <span className="ember-map-dock__preview" aria-hidden>
                        {showStairThumb && selectedTile ? (
                          <EmberStairThumb
                            dir={selectedTile.stair ?? stairDir}
                            color={selectedTile.color}
                            size={22}
                          />
                        ) : showTileSwatch ? (
                          <EmberTileSwatch
                            color={selectedTile.color}
                            empty={selectedTile.id === 0}
                            size={22}
                          />
                        ) : showSpriteThumb ? (
                          <EmberSpriteThumb sprite={stampSprite} size={22} />
                        ) : (
                          <span className="ember-map-dock__glyph">
                            {tab.id === "tools"
                              ? (activeTool?.glyph ?? tab.glyph)
                              : tab.glyph}
                          </span>
                        )}
                      </span>
                      <span className="ember-map-dock__text">
                        <span className="ember-map-dock__caption">
                          {value.caption}
                        </span>
                        {value.detail ? (
                          <span className="ember-map-dock__detail">
                            {value.detail}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="ember-map-main__meta">
                <strong>{map.nameRu ?? map.id}</strong>
                <span className="muted">
                  {map.width}×{map.height} · {map.tilesetId}
                </span>
              </div>

              <div className="ember-map-main__actions">
                <div
                  className="ember-map-iconstrip"
                  role="toolbar"
                  aria-label="История и оверлеи карты"
                >
                  <button
                    type="button"
                    className="ember-map-iconbtn"
                    onClick={undo}
                    disabled={historyLen === 0}
                    title={`Отменить${commandState.lastUndoLabel ? `: ${commandState.lastUndoLabel}` : ""} · Ctrl+Z`}
                    aria-label="Отменить"
                  >
                    <svg
                      className="ember-map-iconbtn__svg"
                      viewBox="0 0 16 16"
                      aria-hidden
                    >
                      <path
                        d="M6.2 3.2 3 6.4l3.2 3.2M3.2 6.4H10a3.2 3.2 0 0 1 0 6.4H8.2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="ember-map-iconbtn"
                    onClick={redo}
                    disabled={redoLen === 0}
                    title={`Повторить${commandState.lastRedoLabel ? `: ${commandState.lastRedoLabel}` : ""} · Ctrl+Y / Ctrl+Shift+Z`}
                    aria-label="Повторить"
                  >
                    <svg
                      className="ember-map-iconbtn__svg"
                      viewBox="0 0 16 16"
                      aria-hidden
                    >
                      <path
                        d="M9.8 3.2 13 6.4 9.8 9.6M12.8 6.4H6a3.2 3.2 0 0 0 0 6.4h1.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  <span className="ember-map-iconstrip__sep" aria-hidden />

                  <button
                    type="button"
                    className={`ember-map-iconbtn ${showCollision ? "is-on" : ""}`}
                    aria-pressed={showCollision}
                    title="Оверлей коллизии: стены (vx), физические воксели, капсула игрока на spawn"
                    aria-label="Оверлей стен"
                    onClick={() => setShowCollision(!showCollision)}
                  >
                    <svg
                      className="ember-map-iconbtn__svg"
                      viewBox="0 0 16 16"
                      aria-hidden
                    >
                      <path
                        d="M2.5 6.5h11M2.5 10h11M5.5 3v10M10.5 3v10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.45"
                        strokeLinecap="round"
                      />
                      <rect
                        x="2.2"
                        y="2.8"
                        width="11.6"
                        height="10.4"
                        rx="1.4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.35"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`ember-map-iconbtn ${isolated ? "is-on" : ""}`}
                    aria-pressed={isolated}
                    disabled={!isolated && selectedSceneObjects.length === 0}
                    title={
                      isolated
                        ? "Выйти из изоляции ( / или Alt+H )"
                        : "Изолировать выбранное (Shift+H / / )"
                    }
                    aria-label="Изоляция"
                    onClick={() => {
                      if (sceneState.isIsolated()) {
                        sceneState.exitIsolate();
                        return;
                      }
                      if (selectedSceneObjects.length === 0) return;
                      sceneState.isolate(
                        selectedSceneObjects.map((object) => object.key),
                        sceneObjects.map((object) => object.key),
                      );
                      setObjectGrab(null);
                    }}
                  >
                    <svg
                      className="ember-map-iconbtn__svg"
                      viewBox="0 0 16 16"
                      aria-hidden
                    >
                      <circle
                        cx="8"
                        cy="8"
                        r="5.2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.35"
                      />
                      <circle
                        cx="8"
                        cy="8"
                        r="2"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`ember-map-iconbtn ${showElevation ? "is-on" : ""}`}
                    aria-pressed={showElevation}
                    title="Оверлей: верхний уровень поверхности Z"
                    aria-label="Оверлей уровня поверхности"
                    onClick={() => setShowElevation(!showElevation)}
                  >
                    <svg
                      className="ember-map-iconbtn__svg"
                      viewBox="0 0 16 16"
                      aria-hidden
                    >
                      <path
                        d="M2.5 12.5h11M4 10h8M5.5 7.5h5M7 5h2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <path
                        d="M8 2.8v2.4M6.7 3.8 8 2.5l1.3 1.3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.35"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`ember-map-iconbtn ${showRegions ? "is-on" : ""}`}
                    aria-pressed={showRegions}
                    title="Оверлей: регионы (спавн, сундуки, ТП…)"
                    aria-label="Оверлей регионов"
                    onClick={() => setShowRegions(!showRegions)}
                  >
                    <svg
                      className="ember-map-iconbtn__svg"
                      viewBox="0 0 16 16"
                      aria-hidden
                    >
                      <rect
                        x="2.4"
                        y="2.8"
                        width="11.2"
                        height="10.4"
                        rx="1.6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.35"
                        strokeDasharray="2.2 1.7"
                      />
                      <circle
                        cx="8"
                        cy="7.2"
                        r="1.55"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.35"
                      />
                      <path
                        d="M8 8.7v2.6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.35"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`ember-map-iconbtn ${showSemantics ? "is-on" : ""}`}
                    aria-pressed={showSemantics}
                    title="Оверлей: семантика тайлов (slow / stain / hazard / portal / trigger)"
                    aria-label="Оверлей семантики тайлов"
                    onClick={() => setShowSemantics(!showSemantics)}
                  >
                    <svg
                      className="ember-map-iconbtn__svg"
                      viewBox="0 0 16 16"
                      aria-hidden
                    >
                      <path
                        d="M8 2.3 13.2 5.2v5.6L8 13.7l-5.2-2.9V5.2L8 2.3Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.35"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M5.1 8h5.8M8 5.1v5.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.45"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`ember-map-iconbtn ${showAtmosphereFx ? "is-on" : ""}`}
                    aria-pressed={showAtmosphereFx}
                    title="Превью атмосферы: туман, дождь, облака, пыль (настройки карты не трогает)"
                    aria-label="Превью атмосферы"
                    onClick={() => setShowAtmosphereFx((v) => !v)}
                  >
                    <svg
                      className="ember-map-iconbtn__svg"
                      viewBox="0 0 16 16"
                      aria-hidden
                    >
                      <path
                        d="M4.2 7.2a2.4 2.4 0 0 1 2.2-2.3 2.8 2.8 0 0 1 5.2.9A2.2 2.2 0 0 1 12.8 9H4.6a2 2 0 0 1-.4-1.8Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.35"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M5.2 11.2v1.8M8 11.4v2M10.8 11.2v1.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.35"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`ember-map-iconbtn ${showLookFx ? "is-on" : ""}`}
                    aria-pressed={showLookFx}
                    title="Превью света: ночь, фонари, bloom, грейдинг (выкл = чистая дневная картинка; атмосфера отдельно)"
                    aria-label="Превью глобального света"
                    onClick={() => setShowLookFx((v) => !v)}
                  >
                    <svg
                      className="ember-map-iconbtn__svg"
                      viewBox="0 0 16 16"
                      aria-hidden
                    >
                      <circle
                        cx="8"
                        cy="8"
                        r="2.4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.35"
                      />
                      <path
                        d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.35"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`ember-map-iconbtn ${showEditorHints ? "is-on" : ""}`}
                    aria-pressed={showEditorHints}
                    title="Подсказки и шорткаты на карте (F1). Не зависит от превью атмосферы."
                    aria-label="Подсказки редактора"
                    onClick={() => setShowEditorHints((v) => !v)}
                  >
                    <svg
                      className="ember-map-iconbtn__svg"
                      viewBox="0 0 16 16"
                      aria-hidden
                    >
                      <circle
                        cx="8"
                        cy="8"
                        r="5.4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.35"
                      />
                      <path
                        d="M6.4 6.2a1.65 1.65 0 1 1 2.4 1.48c-.5.28-.8.62-.8 1.22V9.4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.35"
                        strokeLinecap="round"
                      />
                      <circle cx="8" cy="11.35" r="0.7" fill="currentColor" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="ember-map-iconbtn"
                    title="Перезапечь полные статические тени до максимальной границы мерцающего света"
                    aria-label="Пересчитать статические тени"
                    onClick={() =>
                      threePreviewRef.current?.rebuildStaticShadows()
                    }
                  >
                    <svg
                      className="ember-map-iconbtn__svg"
                      viewBox="0 0 16 16"
                      aria-hidden
                    >
                      <path
                        d="M12.7 5.8A5 5 0 1 0 13 9"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.35"
                        strokeLinecap="round"
                      />
                      <path
                        d="m10.1 3.2 2.8 2.7 1.1-3.7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.35"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M8 5.2v5.6M5.2 8h5.6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.15"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  className={
                    saveState === "error"
                      ? "primary ember-map-chrome__save"
                      : "ghost ember-map-chrome__save"
                  }
                  onClick={() => void saveMap("manual")}
                  disabled={saveState === "saving"}
                  title="Принудительная запись (есть автосохранение ~1.5 с)"
                >
                  Сохранить
                </button>
              </div>
            </div>

            {dockPanel && activeDock ? (
              <div
                ref={dockPopRef}
                className={`ember-map-dock__pop ${
                  dockPanel === "tiles" ||
                  (dockPanel === "tools" && tool === "sprite")
                    ? "ember-map-dock__pop--wide"
                    : ""
                } ${
                  dockPanel === "tools" ? "ember-map-dock__pop--tools" : ""
                } ${
                  dockPanel === "spawn" ||
                  dockPanel === "stage" ||
                  dockPanel === "light" ||
                  dockPanel === "settings" ||
                  dockPanel === "regions"
                    ? "ember-map-dock__pop--tall"
                    : ""
                }`}
                style={dockPopStyle}
                role="dialog"
                aria-label={activeDock.labelRu}
              >
                {dockPanel === "tools" ? (
                  <>
                    <h3 className="ember-ed-card__title">Инструменты</h3>
                    <div
                      className="ember-map-toolstrip"
                      role="toolbar"
                      aria-label="Инструменты карты"
                    >
                      {TOOLS.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className={`ember-map-toolstrip__btn ${tool === t.id ? "is-active" : ""}`}
                          title={`${t.labelRu}: ${t.hint}`}
                          onClick={() => selectTool(t.id)}
                        >
                          <span
                            className="ember-map-toolstrip__glyph"
                            aria-hidden
                          >
                            {t.glyph}
                          </span>
                          <span className="ember-map-toolstrip__label">
                            {t.labelRu}
                          </span>
                        </button>
                      ))}
                    </div>

                    {tool === "select" ? (
                      <p className="muted ember-hint">
                        Фильтр выбора — панель внизу карты. Lock — только через
                        Иерархию.
                      </p>
                    ) : null}

                    <div className="ember-map-panel__block">
                      <h4 className="ember-map-panel__sub">Слой</h4>
                      <div className="ember-chip-row">
                        {(
                          [
                            ["ground", "Земля"],
                            ["decor", "Декор"],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            className={`ember-chip ${layer === id ? "is-active" : ""}`}
                            onClick={() => setLayer(id)}
                            disabled={
                              tool === "collision" ||
                              tool === "elevation" ||
                              tool === "lightpick"
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="muted ember-hint">
                        Параметры кисти (высота стены, Z…) — слева внизу на
                        карте.
                      </p>
                    </div>

                    {tool === "sprite" ? (
                      <div className="ember-map-panel__block ember-map-panel__block--grow">
                        <h4 className="ember-map-panel__sub">Штамп спрайта</h4>
                        <EmberThumbGrid
                          size="sm"
                          selectedId={stampSpriteId}
                          onSelect={setStampSpriteId}
                          items={spriteStampItems}
                          empty={
                            <p className="muted ember-hint">
                              Сначала создайте спрайт в «Редактор спрайтов».
                            </p>
                          }
                        />
                        <p className="muted ember-hint">
                          ЛКМ — поставить · ластик / ПКМ по объекту — снять · ПКМ
                          по пустому — орбита камеры
                        </p>
                      </div>
                    ) : null}

                    {tool !== "sprite" ? (
                      <p className="muted ember-hint">
                        {TOOLS.find((t) => t.id === tool)?.hint}
                      </p>
                    ) : null}
                  </>
                ) : null}

                {dockPanel === "tiles" ? (
                  <>
                    <div className="ember-ed-card__head">
                      <h3 className="ember-ed-card__title">Палитра тайлов</h3>
                      {selectedTile ? (
                        <span className="muted ember-tile-selected-label">
                          {selectedTile.stair
                            ? `Лестница · ${STAIR_DIR_LABEL[selectedTile.stair]}`
                            : `#${selectedTile.id} ${selectedTile.name}`}
                        </span>
                      ) : null}
                    </div>
                    <EmberThumbGrid
                      size="sm"
                      selectedId={
                        selectedTile?.stair
                          ? STAIR_PALETTE_ID
                          : String(tileId)
                      }
                      onSelect={(id) => {
                        if (id === STAIR_PALETTE_ID) {
                          applyStairDir(stairDir);
                        } else {
                          setTileId(Number(id) || 0);
                        }
                        if (
                          tool === "select" ||
                          tool === "collision" ||
                          tool === "erase" ||
                          tool === "elevation" ||
                          tool === "sprite"
                        ) {
                          setTool("paint");
                        }
                      }}
                      items={tilePaletteItems}
                    />
                  </>
                ) : null}

                {dockPanel === "view" ? (
                  <div className="ember-map-view">
                    <header className="ember-map-view__head">
                      <p className="ember-map-view__eyebrow">Превью всегда 3D</p>
                      <h3 className="ember-map-view__title">Камера</h3>
                    </header>

                    <section className="ember-map-view__section">
                      <div className="ember-map-view__scale-row">
                        <span>Ракурс</span>
                        <strong>{mapViewModeLabelRu(viewMode)}</strong>
                      </div>
                      <p className="ember-map-view__hint">
                        Стрелки — пресет · ПКМ — свободная орбита · СКМ — пан ·
                        колёсико — зум камеры
                      </p>
                      <div
                        className="ember-map-view__scale-chips ember-map-view__scale-chips--4"
                        role="group"
                        aria-label="Ракурс камеры"
                      >
                        {(
                          [
                            ["top", "↓ Сверху"],
                            ["sideEast", "→ Восток"],
                            ["sideWest", "← Запад"],
                            ["sideNorth", "↑ Север"],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            className={`ember-map-view__scale ${viewMode === id ? "is-active" : ""}`}
                            onClick={() => setViewMode(id)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="ember-map-view__hint">
                        Q — камера как в explore: iso, дистанция следования,
                        фокус на выбор или spawn
                      </p>
                      <button
                        type="button"
                        className="ember-map-view__scale"
                        title="Камера как в игре (explore) · Q"
                        onClick={() => {
                          setViewMode("top");
                          const three = threePreviewRef.current;
                          const obj = selectedSceneObjects[0];
                          if (obj) {
                            three?.setExploreCamera(
                              obj.transform.position.x,
                              obj.transform.position.y,
                            );
                            return;
                          }
                          const start = map.regions.find(
                            (r) => r.kind === "player_start",
                          );
                          if (start) three?.setExploreCamera(start.x, start.y);
                          else three?.setExploreCamera();
                        }}
                      >
                        Explore · Q
                      </button>
                    </section>

                    <section className="ember-map-view__section">
                      <div className="ember-map-view__scale-row">
                        <span>Сетка / пикер</span>
                        <strong>{scale}×</strong>
                      </div>
                      <p className="ember-map-view__hint">
                        Масштаб логической сетки (не зум камеры) · Ctrl+Shift+колёсико
                      </p>
                      <div className="ember-map-view__scale-chips" role="group">
                        {SCALE_STEPS.map((n) => (
                          <button
                            key={n}
                            type="button"
                            className={`ember-map-view__scale ${scale === n ? "is-active" : ""}`}
                            onClick={() => setScale(n)}
                          >
                            {n}×
                          </button>
                        ))}
                      </div>
                    </section>

                  </div>
                ) : null}

                {dockPanel === "elev" ? (
                  <div className="ember-map-elev">
                    <h4 className="ember-map-panel__sub">Z кисти</h4>
                    <div className="ember-chip-row" role="group" aria-label="Z кисти">
                      {elevationSteps().map((e) => (
                        <button
                          key={e}
                          type="button"
                          className={`ember-chip ${brushElev === e ? "is-active" : ""}`}
                          title={
                            e < 0
                              ? `Z${e} · клавиша −`
                              : e === 0
                                ? "Z0 · клавиша 0"
                                : `Z${e} · клавиша ${e}`
                          }
                          onClick={() => setFloorElev(e)}
                        >
                          Z{e}
                        </button>
                      ))}
                    </div>
                    <div className="ember-chip-row" role="group" aria-label="Форма выбранной колонки">
                      <button
                        type="button"
                        className="ember-chip"
                        disabled={selection?.kind !== "tile" || (selection.elev ?? 0) <= 1}
                        onClick={() => reshapeSelectedTileColumn("platform")}
                        title="Оставить пол Z0 и верхний блок; промежуточные этажи сделать воздухом"
                      >
                        Платформа · воздух снизу
                      </button>
                      <button
                        type="button"
                        className="ember-chip"
                        disabled={selection?.kind !== "tile" || (selection.elev ?? 0) <= 0}
                        onClick={() => reshapeSelectedTileColumn("column")}
                        title="Заполнить все этажи от Z0 до выбранного блока"
                      >
                        Сплошная колонна
                      </button>
                    </div>
                    <p className="muted ember-hint">
                      Плоскость редактирования (Z lock). Ctrl+колёсико — смена Z;
                      кисть ставит блок только на этот этаж (слои ground_z*). Нижние
                      этажи не стираются. Превью клетки следует за курсором.
                      Клавиши −/0–3. Z-1 — дно воды / углубление. Каждый Z —
                      независимый физический блок. Для выбранного верхнего блока
                      можно явно сделать платформу с воздухом снизу или заполнить колонну.
                    </p>
                  </div>
                ) : null}

                {dockPanel === "settings" ? (
                  <MapSettingsPanel
                    globalLight={globalLight}
                    pack={pack}
                    onPackChange={onPackChange}
                    onSaved={onSaved}
                    playProfile={map.playProfile}
                    onCommitPlayProfile={(profile) => {
                      const next = cloneMap(mapRef.current);
                      next.playProfile = profile;
                      publishMap(next);
                    }}
                    autoAttack={map.autoAttack}
                    onCommitAutoAttack={(enabled) => {
                      const next = cloneMap(mapRef.current);
                      next.autoAttack = enabled;
                      publishMap(next);
                    }}
                    onCommitGlobal={(light: EmberMapLight) => {
                      const next = cloneMap(mapRef.current);
                      next.light = light;
                      publishMap(next);
                    }}
                    onResetGlobal={() => {
                      pushHistory(mapRef.current);
                      const next = cloneMap(mapRef.current);
                      delete next.light;
                      publishMap(next);
                    }}
                  />
                ) : null}

                {dockPanel === "light" && tileset ? (
                  <MapLightPanel
                    pack={pack}
                    map={map}
                    tileset={tileset}
                    globalLight={globalLight}
                    sources={lanternSources}
                    selected={selectedLantern}
                    pickModeActive={tool === "lightpick"}
                    onActivatePickMode={() => selectTool("lightpick")}
                    onSelectSource={setSelectedLightId}
                    onCommitGlobal={(light: EmberMapLight) => {
                      const next = cloneMap(mapRef.current);
                      next.light = light;
                      publishMap(next);
                    }}
                    onResetGlobal={() => {
                      pushHistory(mapRef.current);
                      const next = cloneMap(mapRef.current);
                      delete next.light;
                      publishMap(next);
                    }}
                    onCommitSource={commitLightSource}
                    onBeginSourceEdit={beginLightSourceEdit}
                    onDeleteSource={deleteLightSource}
                    onClearSourceOverrides={clearLightSourceOverrides}
                    onPackChange={onPackChange}
                    onSaved={onSaved}
                  />
                ) : null}

                {dockPanel === "regions" ? (
                  <MapRegionsPanel
                    map={map}
                    pack={pack}
                    selectedId={selectedRegionId}
                    showOverlay={showRegions}
                    defaultElev={brushElev}
                    onSelect={(id) => {
                      setSelectedRegionId(id);
                      if (id) setSelection({ kind: "region", id });
                    }}
                    onFocus={focusRegion}
                    onChange={commitRegions}
                    onToggleOverlay={() => setShowRegions((v) => !v)}
                    onSaved={onSaved}
                    onHoverPeer={hoverRegionPeer}
                    onOpenVoxelScene={openVoxelSculptScene}
                  />
                ) : null}

                {dockPanel === "stage" ? (
                  activeStage ? (
                    <MapStageForm
                      pack={pack}
                      stage={activeStage}
                      stagesForMap={stagesForMap}
                      onSelectStage={setActiveStageId}
                      onChange={onStageChange}
                      onSaved={onSaved}
                    />
                  ) : (
                    <p className="muted">Нет стадий в паке.</p>
                  )
                ) : null}

                {dockPanel === "spawn" ? (
                  activeSpawn ? (
                    <MapSpawnEditor
                      pack={pack}
                      map={map}
                      spawn={activeSpawn}
                      onChange={onSpawnChange}
                      onSaved={onSaved}
                    />
                  ) : (
                    <p className="muted">
                      Нет spawn table
                      {activeStage
                        ? ` «${activeStage.spawnTableId}»`
                        : ""}
                      . Сначала выберите стадию со spawnTableId.
                    </p>
                  )
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="ember-map-stage ember-map-stage--viewport">
            <MapSceneOutliner
              objects={sceneObjects}
              selectedKeys={selectedObjectKeys}
              primaryKey={selectedObjectKey}
              selectedGroupId={selection?.kind === "group" ? selection.id : null}
              groups={sceneGroups}
              hiddenKeys={hiddenObjectKeys}
              lockedKeys={lockedObjectKeys}
              onSelectionChange={replaceWorldSelection}
              onSelectGroup={(group) => {
                selectionService.setPrimary({ kind: "group", id: group.id });
              }}
              onFocus={(object) => {
                setSelection(selectionFromWorldObject(object));
                threePreviewRef.current?.focusTile(
                  object.transform.position.x,
                  object.transform.position.y,
                );
              }}
              onToggleHidden={(object) => {
                const hidden = sceneState.toggleHidden(object.key);
                if (hidden && objectGrabRef.current?.id === object.id) {
                  setObjectGrab(null);
                }
              }}
              onToggleLocked={(object) => {
                const locked = sceneState.toggleLocked(object.key);
                if (locked && objectGrabRef.current?.id === object.id) {
                  setObjectGrab(null);
                }
              }}
              onSetHidden={(objects, hidden) => {
                sceneState.setHiddenMany(
                  objects.map((object) => object.key),
                  hidden,
                );
              }}
              onSetLocked={(objects, locked) => {
                sceneState.setLockedMany(
                  objects.map((object) => object.key),
                  locked,
                );
                if (
                  locked &&
                  objectGrabRef.current &&
                  objects.some((object) => object.id === objectGrabRef.current?.id)
                ) {
                  setObjectGrab(null);
                }
              }}
              onTranslate={translateWorldSelection}
              onDelete={deleteWorldSelection}
              onDuplicate={duplicateWorldSelection}
              onCreateGroup={(objects) => {
                const current = mapRef.current;
                const result = createEmberSceneGroup(
                  current,
                  objects.map((object) => object.key),
                );
                if (!result.group) return;
                pushHistory(current, `Создать ${result.group.name}`);
                publishMap(result.map);
                onSaved(`${result.group.name}: ${objects.length} объектов`);
              }}
              onRemoveGroup={removeSceneGroup}
              onRenameGroup={renameSceneGroup}
              onDuplicateGroup={duplicateSceneGroup}
              onReparentObjects={reparentSceneObjects}
              onReparentGroup={reparentSceneGroup}
            />
          <div className="ember-map-stage__view">
          <div
            ref={canvasWrapRef}
            className={[
              "ember-ed-map__canvas-wrap",
              isPanning ? "is-panning" : "",
              libDragActive || libHoverTile ? "is-lib-drop" : "",
              "has-three-preview",
            ]
              .filter(Boolean)
              .join(" ")}
            onMouseDown={beginCanvasCam}
            onAuxClick={(e) => {
              if (e.button === 1) e.preventDefault();
            }}
            onDragOver={onLibDragOverCanvas}
            onDrop={onLibDropCanvas}
            onDragLeave={onLibDragLeaveCanvas}
          >
            <div
              ref={threeHostRef}
              className="ember-ed-map__three-host"
              aria-hidden
            />
            {worldLoad.active ? (
              <div
                className="ember-ed-map__boot"
                role="status"
                aria-live="polite"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(worldLoad.ratio * 100)}
              >
                <div className="ember-ed-map__boot-card">
                  <p className="ember-play__kicker muted">Загрузка мира</p>
                  <h2 className="ember-ed-map__boot-title">
                    {map.nameRu?.trim() || map.id}
                  </h2>
                  <div className="ember-play__boot-track">
                    <div
                      className="ember-play__boot-fill"
                      style={{
                        width: `${Math.max(4, Math.min(100, worldLoad.ratio * 100))}%`,
                      }}
                    />
                  </div>
                  <p className="muted ember-play__boot-label">
                    {worldLoad.labelRu}
                  </p>
                </div>
              </div>
            ) : null}
            <canvas
              ref={canvasRef}
              className={[
                "ember-ed-map__canvas",
                "is-three-overlay",
                dragSel || marqueeSel ? "is-selecting" : "",
                isPanning ? "is-panning" : "",
                tool === "lightpick" ? "is-lightpick" : "",
                libSelected || libDragActive ? "is-lib-place" : "",
                objectGrab ? "is-object-grab" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onContextMenu={(e) => e.preventDefault()}
              onMouseDown={(e) => {
                if (beginCanvasCam(e)) return;
                // Let TransformControls own the click when a handle is hit.
                if (
                  e.button === 0 &&
                  (transformDraggingRef.current ||
                    threePreviewRef.current?.isTransformBusy())
                ) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                if (e.button === 0 && objectGrabRef.current) {
                  e.preventDefault();
                  commitObjectGrab(clientToTile(e.clientX, e.clientY));
                  return;
                }
                if (e.button === 2 || (e.button === 0 && tool === "erase")) {
                  const hitProp = clientToProp(e.clientX, e.clientY);
                  if (hitProp?.kind === "sprite") {
                    e.preventDefault();
                    removeSpritePlacement(hitProp.id);
                    if (e.button === 2 || tool === "erase") return;
                  }
                  if (hitProp?.kind === "voxel") {
                    e.preventDefault();
                    removeVoxelPlacement(hitProp.id);
                    if (e.button === 2 || tool === "erase") return;
                  }
                  if (e.button === 2) {
                    e.preventDefault();
                    return;
                  }
                }

                if (e.button !== 0) return;

                // Active library asset owns LMB: show/commit the same target
                // even when another prop is already present on the cell.
                if (libSelectedRef.current) {
                  const pendingTile = clientToLibraryPlacementTarget(
                    e.clientX,
                    e.clientY,
                  );
                  if (!pendingTile) return;
                  e.preventDefault();
                  placeLibraryAt(libSelectedRef.current, pendingTile);
                  return;
                }

                const pointerStack = clientToSelectionStack(
                  e.clientX,
                  e.clientY,
                );
                if (toolRef.current === "select") {
                  e.preventDefault();
                  if (e.shiftKey) {
                    const place = clientToPlaceTarget(e.clientX, e.clientY);
                    const tile = place
                      ? { x: place.tx, y: place.ty }
                      : clientToTile(e.clientX, e.clientY);
                    if (!tile) return;
                    const elev = brushElevRef.current;
                    marqueeing.current = true;
                    marqueeAddRef.current = e.ctrlKey || e.metaKey;
                    marqueeStartRef.current = tile;
                    marqueeEndRef.current = tile;
                    marqueeElevRef.current = elev;
                    hoverPickRef.current = null;
                    setMarqueeSel({
                      start: tile,
                      end: tile,
                      elev,
                      add: marqueeAddRef.current,
                    });
                    return;
                  }
                  selectFromPointerStack(
                    pointerStack,
                    e.clientX,
                    e.clientY,
                    e.ctrlKey || e.metaKey,
                  );
                  return;
                }

                // Other tools keep the legacy convenience: clicking visible
                // prop ink opens that prop instead of painting through it.
                const directProp = pointerStack.find(
                  (candidate) =>
                    candidate.kind === "sprite" || candidate.kind === "voxel",
                );
                if (
                  directProp?.kind === "sprite" ||
                  directProp?.kind === "voxel"
                ) {
                  e.preventDefault();
                  setSelection(directProp);
                  return;
                }

                const paintTools =
                  toolRef.current === "paint" ||
                  toolRef.current === "fill" ||
                  toolRef.current === "elevation" ||
                  toolRef.current === "erase" ||
                  toolRef.current === "collision";
                const place =
                  toolRef.current === "erase"
                    ? clientToBreakTarget(e.clientX, e.clientY)
                    : paintTools
                      ? clientToPlaceTarget(e.clientX, e.clientY)
                      : null;
                const tile = place
                  ? { x: place.tx, y: place.ty }
                  : clientToTile(e.clientX, e.clientY);
                if (!tile) return;
                if (place) updatePlacePreview(place);

                if (tileset) {
                  const sources = listLanternSources(
                    mapRef.current,
                    tileset,
                    pack.sprites,
                  );
                  const lamp = sources.find(
                    (s) => s.x === tile.x && s.y === tile.y,
                  );
                  if (lamp) {
                    e.preventDefault();
                    setSelection({ kind: "light", id: lamp.id });
                    return;
                  }
                }

                if (toolRef.current === "lightpick" && tileset) {
                  e.preventDefault();
                  pushHistory(mapRef.current);
                  const next = cloneMap(mapRef.current);
                  const id = newLightId();
                  const defaults = resolveMapLight(next);
                  const entry: EmberLightSource = {
                    id,
                    x: tile.x,
                    y: tile.y,
                    enabled: true,
                    lampColor: defaults.lampColor,
                    lampFaceColor: defaults.lampFaceColor,
                    lampRange: defaults.lampRange,
                    lampDiscCore: defaults.lampDiscCore,
                    lampDiscMid: defaults.lampDiscMid,
                    lampHeight: defaults.lampHeight,
                    lampShowCore: defaults.lampShowCore,
                    lampStrength0: defaults.lampStrength0,
                    lampStrengthFalloff: defaults.lampStrengthFalloff,
                    lampTorchFlicker: defaults.lampTorchFlicker,
                  };
                  const rest = (next.lights ?? []).filter(
                    (l) => !(l.x === tile.x && l.y === tile.y),
                  );
                  next.lights = [...rest, entry];
                  publishMap(next);
                  setSelection({ kind: "light", id });
                  return;
                }

                if (e.shiftKey) {
                  e.preventDefault();
                  const storyPick = pointerStack.find(
                    (candidate) => candidate.kind === "tile",
                  );
                  const elev =
                    storyPick?.kind === "tile" && storyPick.elev != null
                      ? storyPick.elev
                      : (topOccupiedElevAt(
                          mapRef.current,
                          tile.x,
                          tile.y,
                        ) ?? undefined);
                  setSelection({
                    kind: "tile",
                    tx: tile.x,
                    ty: tile.y,
                    elev,
                  });
                  if (elev != null) setBrushElev(elev);
                  setSelectedRegionId(null);
                  return;
                }

                if (tool === "eyedrop") {
                  const canvasPt = clientToCanvas(e.clientX, e.clientY);
                  const storyPick = canvasPt
                    ? (threePreviewRef.current?.pickObject(
                        canvasPt.sx,
                        canvasPt.sy,
                      ) ?? null)
                    : null;
                  const eyedropElev =
                    storyPick?.kind === "tile" && storyPick.elev != null
                      ? storyPick.elev
                      : brushElev;
                  const picked =
                    layer === "decor"
                      ? (map.layers.find((l) => l.name === "decor")?.data[
                          tile.y * map.width + tile.x
                        ] ?? 0)
                      : elevTileIdAt(map, tile.x, tile.y, eyedropElev) ||
                        elevTileIdAt(
                          map,
                          tile.x,
                          tile.y,
                          topOccupiedElevAt(map, tile.x, tile.y) ?? brushElev,
                        );
                  if (picked) {
                    setTileId(picked);
                    const stair = tileset?.tiles.find(
                      (t) => t.id === picked,
                    )?.stair;
                    if (stair) setStairDir(stair);
                  }
                  setSelection({
                    kind: "tile",
                    tx: tile.x,
                    ty: tile.y,
                    elev: eyedropElev,
                  });
                  setTool("paint");
                  return;
                }

                painting.current = true;
                dragStartRef.current = tile;
                dragEndRef.current = tile;
                hoverPickRef.current = null;
                if (tool === "erase" && place) {
                  eraseStrokeSaved.current = false;
                  eraseLastKey.current = null;
                  eraseBreakTarget(place);
                }
                if (tool === "collision") {
                  // Shift or «Сброс» chip → clear; else ±delta to current height.
                  if (e.shiftKey || brushWallDelta === 0) {
                    wallPaintValue.current = 0;
                    wallPaintDelta.current = null;
                  } else {
                    wallPaintValue.current = null;
                    wallPaintDelta.current = brushWallDelta;
                  }
                } else {
                  wallPaintValue.current = null;
                  wallPaintDelta.current = null;
                }
                setDragSel({ start: tile, end: tile });
              }}
            />
            {marqueeSel ? (
              <div className="ember-ed-map__drag-hint muted ember-hint">
                {(() => {
                  const r = normalizePlanarMarqueeRect(
                    marqueeSel.start,
                    marqueeSel.end,
                    map,
                  );
                  const w = r.x1 - r.x0 + 1;
                  const h = r.y1 - r.y0 + 1;
                  return `${w}×${h} · плоскость Z${marqueeSel.elev} · отпусти — ${marqueeSel.add ? "добавить в выбор" : "выделить"} · Esc — отмена`;
                })()}
              </div>
            ) : dragSel ? (
              <div className="ember-ed-map__sel-hint muted">
                {(() => {
                  const r = normalizeRect(dragSel.start, dragSel.end);
                  const w = r.x1 - r.x0 + 1;
                  const h = r.y1 - r.y0 + 1;
                  return `${w}×${h} · отпусти — ${TOOLS.find((t) => t.id === tool)?.labelRu ?? tool}`;
                })()}
              </div>
            ) : objectGrab?.mode === "move" ? (
              <p className="muted ember-hint ember-ed-map__drag-hint">
                Перенос (G): наведи клетку · клик — поставить · Esc — отмена
              </p>
            ) : objectGrab?.mode === "rotate" ? (
              <p className="muted ember-hint ember-ed-map__drag-hint">
                Поворот (R): наведи направление · клик — зафиксировать · Esc —
                отмена
              </p>
            ) : libSelected &&
              (showEditorHints || libPlacementCheck?.valid === false) ? (
              <p className="muted ember-hint ember-ed-map__drag-hint">
                {libPlacementCheck && !libPlacementCheck.valid
                  ? `Нельзя поставить: ${libPlacementCheck.reason}`
                  : "Библиотека: зелёный ghost — клик для установки · ПКМ / Esc — отмена"}
              </p>
            ) : showEditorHints && tool === "select" ? (
              <p className="muted ember-hint ember-ed-map__drag-hint">
                {hoverSelectionStack.length > 1
                  ? `Под курсором: ${hoverSelectionStack
                      .slice(0, 4)
                      .map(mapSelectionShortLabel)
                      .join(" → ")}${hoverSelectionStack.length > 4 ? ` · ещё ${hoverSelectionStack.length - 4}` : ""}. Повторный клик — следующий · Ctrl+клик — добавить/убрать.`
                  : "Выбор (V): клик — объект или тайл · Shift+ЛКМ — рамка на Z · Ctrl+клик — мультивыбор · G — перенос · R — поворот · Esc — снять"}
              </p>
            ) : showEditorHints && tool === "lightpick" ? (
              <p className="muted ember-hint ember-ed-map__drag-hint">
                Режим света (L): клик по фонарю — настройки справа · пустая
                клетка — новый · Esc — снять · панель «Свет» — глобально
              </p>
            ) : showEditorHints ? (
              <p className="muted ember-hint ember-ed-map__drag-hint">
                {tool === "erase" ? (
                  <>
                    Ластик (E) · наведи на блок любого Z · клик/протяни —
                    стереть · V — выбор · ПКМ орбита · СКМ пан
                  </>
                ) : (
                  <>
                    {TOOLS.find((t) => t.id === tool)?.labelRu ?? "Кисть"} (
                    {TOOLS.find((t) => t.id === tool)?.glyph}) · плоскость Z
                    {brushElev} · Ctrl+колёсико · превью клетки · V — выбор ·
                    ПКМ орбита · СКМ пан
                  </>
                )}
              </p>
            ) : null}

            {showEditorHints ? (
              <aside className="ember-ed-map__cheat" aria-label="Шорткаты карты">
                <p className="ember-ed-map__cheat-title">Шорткаты · F1</p>
                <dl className="ember-ed-map__cheat-grid">
                  <dt>G / R / S</dt>
                  <dd>перенос · поворот · масштаб</dd>
                  <dt>H · Shift+H · Alt+H</dt>
                  <dd>скрыть · изоляция · показать все</dd>
                  <dt>Ctrl+D</dt>
                  <dd>дублировать объект</dd>
                  <dt>/ · Q</dt>
                  <dd>изоляция вкл/выкл · камера игры</dd>
                  <dt>Del</dt>
                  <dd>удалить</dd>
                  <dt>Shift+ЛКМ</dt>
                  <dd>рамка на плоскости Z</dd>
                  <dt>Shift+стрелки</dt>
                  <dd>сдвиг на клетку</dd>
                  <dt>. · Ctrl+G</dt>
                  <dd>кадр на объект · группа</dd>
                  <dt className="ember-ed-map__cheat-sep" aria-hidden />
                  <dd className="ember-ed-map__cheat-sep" aria-hidden />
                  <dt>V B E F</dt>
                  <dd>выбор · кисть · ластик · заливка</dd>
                  <dt>I Z W L</dt>
                  <dd>пипетка · Z · стены · свет</dd>
                  <dt>ПКМ · СКМ</dt>
                  <dd>орбита · пан</dd>
                </dl>
              </aside>
            ) : null}

            {libSelected ||
            tool === "select" ||
            tool === "collision" ||
            tool === "elevation" ||
            tool === "sprite" ||
            tool === "paint" ||
            tool === "fill" ||
            tool === "lightpick" ? (
              <div
                className="ember-ed-map__tool-hud"
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {libSelected ? (
                  <>
                    <div className="ember-map-selection-hud__head">
                      <p className="ember-ed-map__tool-hud-title">
                        Установка · {libSelected.kind}
                      </p>
                      <button
                        type="button"
                        className={`ember-chip ember-chip--sm ${serialLibraryPlacement ? "is-active" : ""}`}
                        aria-pressed={serialLibraryPlacement}
                        title="Оставлять ассет в руке после установки"
                        onClick={() =>
                          setSerialLibraryPlacement((current) => !current)
                        }
                      >
                        Серийно
                      </button>
                    </div>
                    <div
                      className="ember-chip-row"
                      role="group"
                      aria-label="Привязка устанавливаемого ассета"
                    >
                      {(
                        [
                          ["surface", "К поверхности"],
                          ["floor", "Drop to Floor"],
                          ["grid", `Сетка Z${brushElev}`],
                        ] as const
                      ).map(([mode, label]) => {
                        const floorOnly = libSelected.kind === "light";
                        const effective = effectiveMapLibraryPlacementMode(
                          libSelected.kind,
                          libraryPlacementMode,
                        );
                        const active = effective === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            className={`ember-chip ember-chip--sm ${active ? "is-active" : ""}`}
                            aria-pressed={active}
                            disabled={floorOnly && mode !== "floor"}
                            onClick={() => setLibraryPlacementMode(mode)}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {libSelected.kind === "region" ? (
                      <p className="ember-ed-map__tool-hud-hint">
                        Зона на этаже кисти, как блоки. Iso бьёт в потолок —
                        «К поверхности» = сетка Z. Drop to Floor — крыша колонки.
                      </p>
                    ) : null}
                    <p
                      className={`ember-ed-map__tool-hud-hint ${libPlacementCheck?.valid === false ? "is-invalid" : ""}`}
                    >
                      {libHoverTile
                        ? `${libHoverTile.x}, ${libHoverTile.y} · Z${Number(libHoverTile.elev.toFixed(2))}${libPlacementCheck?.valid === false ? ` · ${libPlacementCheck.reason}` : " · можно поставить"}`
                        : "Наведи ассет на карту · Esc/ПКМ — отмена"}
                    </p>
                  </>
                ) : null}

                {!libSelected && tool === "select" ? (
                  <>
                    <div className="ember-map-selection-hud__head">
                      <p className="ember-ed-map__tool-hud-title">
                        Выбор · {selectionState.items.length}
                      </p>
                      {selectionState.items.length > 0 ? (
                        <button
                          type="button"
                          className="ghost ember-map-selection-hud__clear"
                          onClick={() => selectionService.clear()}
                        >
                          Снять
                        </button>
                      ) : null}
                    </div>
                    {selectionState.items.length > 0 ? (
                      <div className="ember-map-selection-hud__actions">
                        <button
                          type="button"
                          className="ghost"
                          disabled={selectedSceneObjects.length === 0}
                          title="Дублировать выбранные объекты (Ctrl+D)"
                          onClick={() =>
                            duplicateWorldSelection(selectedSceneObjects)
                          }
                        >
                          Дублировать
                        </button>
                        <button
                          type="button"
                          className="ghost ember-danger"
                          title="Удалить выбранное с карты (Delete). Можно отменить через Undo."
                          onClick={() => {
                            if (
                              selectedSceneObjects.length > 0 ||
                              selectionState.items.some(
                                (item) => item.kind === "tile",
                              )
                            ) {
                              deleteWorldSelection(selectedSceneObjects);
                              return;
                            }
                            if (selection?.kind === "light") {
                              deleteLightSource(selection.id);
                            }
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    ) : null}
                    <div
                      className="ember-chip-row ember-map-selection-hud__filters"
                      role="group"
                      aria-label="Быстрый фильтр выбора"
                    >
                      {EDITOR_VIEWPORT_SELECTION_KINDS.map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          className={`ember-chip ember-chip--sm ${selectionFilter[kind] ? "is-active" : ""}`}
                          aria-pressed={selectionFilter[kind]}
                          title={`Выбирать: ${VIEWPORT_SELECTION_LABEL[kind]}`}
                          onClick={() => toggleSelectionFilter(kind)}
                        >
                          {VIEWPORT_SELECTION_LABEL[kind]}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="ghost ember-map-selection-filter__all"
                        onClick={enableAllSelectionFilters}
                        disabled={EDITOR_VIEWPORT_SELECTION_KINDS.every(
                          (kind) => selectionFilter[kind],
                        )}
                      >
                        Все
                      </button>
                    </div>
                    {showEditorHints ? (
                      <p className="muted ember-ed-map__tool-hud-hint">
                        Повторный клик — следующий · Shift+ЛКМ — рамка на Z ·
                        Ctrl — добавить · Del — удалить всё в выборе
                      </p>
                    ) : null}
                  </>
                ) : null}

                {!libSelected && tool === "collision" ? (
                  <>
                    <p className="ember-ed-map__tool-hud-title">
                      Высота стены
                    </p>
                    <div
                      className="ember-chip-row"
                      role="group"
                      aria-label="Шаг высоты стены"
                    >
                      {[4, 8, 16].map((d) => (
                        <button
                          key={`+${d}`}
                          type="button"
                          className={`ember-chip ember-chip--sm ${brushWallDelta === d ? "is-active" : ""}`}
                          onClick={() => setBrushWallDelta(d)}
                        >
                          +{d}
                          {d === map.tileSize ? "·1б" : ""}
                        </button>
                      ))}
                      {[4, 8, 16].map((d) => (
                        <button
                          key={`-${d}`}
                          type="button"
                          className={`ember-chip ember-chip--sm ${brushWallDelta === -d ? "is-active" : ""}`}
                          onClick={() => setBrushWallDelta(-d)}
                        >
                          −{d}
                          {d === map.tileSize ? "·1б" : ""}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`ember-chip ember-chip--sm ${brushWallDelta === 0 ? "is-active" : ""}`}
                        title="Убрать стену (высота 0)"
                        onClick={() => setBrushWallDelta(0)}
                      >
                        Сброс
                      </button>
                    </div>
                    <p className="muted ember-ed-map__tool-hud-hint">
                      {(() => {
                        if (wallHoverTile) {
                          const cur = heightVoxelsAt(
                            map,
                            wallHoverTile.x,
                            wallHoverTile.y,
                          );
                          const ts = Math.max(1, map.tileSize || 16);
                          const nextH =
                            brushWallDelta === 0
                              ? 0
                              : Math.max(
                                  0,
                                  Math.min(8 * ts, cur + brushWallDelta),
                                );
                          return `сейчас ${cur} → ${nextH} · Shift / Сброс — убрать`;
                        }
                        return "+x к текущей · Shift / Сброс — убрать стену";
                      })()}
                    </p>
                  </>
                ) : null}

                {!libSelected && tool === "elevation" ? (
                  <>
                    <p className="ember-ed-map__tool-hud-title">
                      Плоскость Z{brushElev}
                    </p>
                    <div
                      className="ember-chip-row"
                      role="group"
                      aria-label="Z кисти"
                    >
                      {elevationSteps().map((e) => (
                        <button
                          key={e}
                          type="button"
                          className={`ember-chip ember-chip--sm ${brushElev === e ? "is-active" : ""}`}
                          title={e === 0 ? "Z0 · 0" : `Z${e} · ${e}`}
                          onClick={() => setFloorElev(e)}
                        >
                          Z{e}
                        </button>
                      ))}
                    </div>
                    <p className="muted ember-ed-map__tool-hud-hint">
                      Ctrl+колёсико · −/{MIN_ELEVATION < 0 ? `${MIN_ELEVATION}…` : ""}
                      0–{MAX_ELEVATION}
                      {placePreview
                        ? ` · превью ${placePreview.tx},${placePreview.ty}`
                        : ""}
                    </p>
                  </>
                ) : null}

                {!libSelected && (tool === "paint" || tool === "fill") ? (
                  <>
                    <p className="ember-ed-map__tool-hud-title">
                      Слой · Z{brushElev}
                    </p>
                    <div className="ember-chip-row" role="group">
                      {(
                        [
                          ["ground", "Земля"],
                          ["decor", "Декор"],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          className={`ember-chip ember-chip--sm ${layer === id ? "is-active" : ""}`}
                          onClick={() => setLayer(id)}
                        >
                          {label}
                        </button>
                      ))}
                      {elevationSteps().map((e) => (
                        <button
                          key={`z${e}`}
                          type="button"
                          className={`ember-chip ember-chip--sm ${brushElev === e ? "is-active" : ""}`}
                          title={`Этаж Z${e}`}
                          onClick={() => setFloorElev(e)}
                        >
                          Z{e}
                        </button>
                      ))}
                    </div>
                    <p className="muted ember-ed-map__tool-hud-hint">
                      Плоскость Z{brushElev} · Ctrl+колёсико
                      {placePreview
                        ? ` · превью ${placePreview.tx},${placePreview.ty}`
                        : ""}
                    </p>
                  </>
                ) : null}

                {!libSelected && tool === "sprite" ? (
                  <>
                    <p className="ember-ed-map__tool-hud-title">Спрайт</p>
                    <p className="ember-ed-map__tool-hud-value">
                      {stampSprite?.nameRu?.trim() ||
                        stampSpriteId ||
                        "не выбран"}
                    </p>
                    <p className="muted ember-ed-map__tool-hud-hint">
                      Выбор штампа — панель «Инструменты»
                    </p>
                  </>
                ) : null}

                {!libSelected && tool === "lightpick" ? (
                  <>
                    <p className="ember-ed-map__tool-hud-title">Свет</p>
                    <p className="muted ember-ed-map__tool-hud-hint">
                      Клик по фонарю · пустая клетка — новый
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          {selection ? (
            <MapObjectInspector
              selection={selection}
              selectionItems={selectionState.items}
              onSetSelectionPrimary={(item) =>
                selectionService.select(item, "add")
              }
              onToggleSelection={(item) =>
                selectionService.select(item, "toggle")
              }
              onClearSelection={() => selectionService.clear()}
              multiWorldObjects={selectedSceneObjects}
              multiAllLocked={
                selectedSceneObjects.length > 0 &&
                selectedSceneObjects.every((object) =>
                  sceneState.isLocked(object.key),
                )
              }
              multiAllHidden={
                selectedSceneObjects.length > 0 &&
                selectedSceneObjects.every((object) =>
                  sceneState.isHidden(object.key),
                )
              }
              onSetMultiElevation={(elevation) =>
                setWorldSelectionElevation(elevation)
              }
              onDropMultiToFloor={() => setWorldSelectionElevation("floor")}
              onSetMultiLocked={setWorldSelectionLocked}
              onSetMultiHidden={setWorldSelectionHidden}
              onDeleteMulti={() => deleteWorldSelection(selectedSceneObjects)}
              onDuplicateMulti={() =>
                duplicateWorldSelection(selectedSceneObjects)
              }
              onDuplicateSelection={() =>
                duplicateWorldSelection(selectedSceneObjects)
              }
              onDeleteSelection={() =>
                deleteWorldSelection(selectedSceneObjects)
              }
              locked={selectedObjectLocked}
              hidden={selectedObjectHidden}
              onToggleLocked={
                selectedObjectKey
                  ? () => {
                      const locked = sceneState.toggleLocked(selectedObjectKey);
                      if (locked && objectGrabRef.current?.id === selectedWorldObject?.id) {
                        setObjectGrab(null);
                      }
                    }
                  : undefined
              }
              onToggleHidden={
                selectedObjectKey
                  ? () => {
                      const hidden = sceneState.toggleHidden(selectedObjectKey);
                      if (hidden && objectGrabRef.current?.id === selectedWorldObject?.id) {
                        setObjectGrab(null);
                      }
                    }
                  : undefined
              }
              worldObject={selectedWorldObject}
              sceneGroup={selectedSceneGroup}
              sceneGroups={sceneGroups}
              onRenameGroup={renameSceneGroup}
              onDuplicateGroup={duplicateSceneGroup}
              onTranslateGroup={translateSceneGroup}
              onRotateGroup={rotateSceneGroup}
              onScaleGroup={scaleSceneGroup}
              onSelectGroupMembers={(id) => {
                const objects = sceneObjectsForGroup(id);
                replaceWorldSelection(objects, objects.at(-1) ?? null);
              }}
              onRemoveGroup={removeSceneGroup}
              onSetGroupParent={reparentSceneGroup}
              onSetWorldObjectParent={(objectKey, parentGroupId) =>
                reparentSceneObjects([objectKey], parentGroupId)
              }
              onWorldObjectFieldEdit={editSelectedWorldObjectField}
              onWorldObjectTransformPatch={editSelectedWorldObjectTransform}
              onApplyWorldObjectComponentToAsset={
                applySelectedWorldObjectComponentToAsset
              }
              onRevertWorldObjectComponentOverrides={
                revertSelectedWorldObjectComponent
              }
              onAddWorldObjectComponent={(component) =>
                setSelectedWorldObjectComponent(component, true)
              }
              onRemoveWorldObjectComponent={(component) =>
                setSelectedWorldObjectComponent(component, false)
              }
              onLibraryObjectFieldEdit={editLibraryObjectField}
              onAddLibraryObjectComponent={(component) =>
                setLibraryObjectComponent(component, true)
              }
              onRemoveLibraryObjectComponent={(component) =>
                window.confirm(
                  `Удалить ${component} из общего ассета? Это повлияет на все экземпляры без собственного override.`,
                ) && setLibraryObjectComponent(component, false)
              }
              map={map}
              pack={pack}
              tileset={tileset}
              globalLight={globalLight}
              lanternSources={lanternSources}
              pickModeActive={tool === "lightpick"}
              onClose={() => setSelection(null)}
              onActivatePickMode={() => selectTool("lightpick")}
              onSelectLight={setSelectedLightId}
              onCommitGlobal={(light) => {
                const next = cloneMap(mapRef.current);
                next.light = light;
                publishMap(next);
              }}
              onCommitPlayProfile={(profile) => {
                const next = cloneMap(mapRef.current);
                next.playProfile = profile;
                publishMap(next);
              }}
              onResetGlobal={() => {
                pushHistory(mapRef.current);
                const next = cloneMap(mapRef.current);
                delete next.light;
                publishMap(next);
              }}
              onCommitSource={commitLightSource}
              onBeginSourceEdit={beginLightSourceEdit}
              onDeleteSource={deleteLightSource}
              onClearSourceOverrides={clearLightSourceOverrides}
              onMoveSource={moveLightSource}
              onBeginSourceGrabMove={(id) => beginObjectGrabMove("light", id)}
              onPackChange={onPackChange}
              onSaved={onSaved}
              onDeleteSprite={(id) => {
                removeSpritePlacement(id);
                setSelection(null);
              }}
              onDeleteVoxel={(id) => {
                removeVoxelPlacement(id);
                setSelection(null);
              }}
              onPatchTile={(tx, ty, patch) => {
                pushHistory(mapRef.current);
                const next = ensureMapLayers(cloneMap(mapRef.current));
                const idx = ty * next.width + tx;
                if (patch.heightVoxels != null) {
                  setWallHeightVoxels(next, idx, patch.heightVoxels);
                }
                if (patch.elevation != null) {
                  const source = clampElevation(
                    patch.sourceElevation ??
                      topOccupiedElevAt(next, tx, ty) ??
                      0,
                  );
                  const target = clampElevation(patch.elevation);
                  const sourceId = elevTileIdAt(next, tx, ty, source);
                  if (sourceId) {
                    if (!moveElevTile(next, tx, ty, source, target)) {
                      commandStack.discardLatestUndo();
                      return;
                    }
                  } else if (tileId) {
                    setElevTileId(next, tx, ty, target, tileId);
                  } else {
                    setElevation(next, idx, target);
                  }
                }
                publishMap(next);
              }}
              onPatchVoxelPlacement={patchVoxelPlacement}
              onRenameVoxelModel={renameVoxelModel}
              onSetVoxelModelTags={setVoxelModelTags}
              onSetSpriteTags={setSpriteTags}
              onFocusLibraryReference={focusLibraryReference}
              onPatchVoxelModelLight={patchVoxelModelLight}
              onOpenVoxelSculpt={openVoxelSculptForPlacement}
              onOpenVoxelSculptVariant={openVoxelSculptVariantForPlacement}
              onDuplicateVoxel={duplicateVoxelPlacement}
              onSelectVoxel={(id) => setSelection({ kind: "voxel", id })}
              onEditTile={onEditTile}
              onEditSprite={onEditSprite}
              onCreateTile={
                onPackChange && tileset ? createBlankTileInPack : undefined
              }
              onCloneTile={
                onPackChange && tileset ? cloneTileInPack : undefined
              }
              onCommitRegion={commitRegion}
              onDeleteRegion={deleteRegion}
              onFocusRegion={(id) => {
                setSelectedRegionId(id);
                setSelection({ kind: "region", id });
                const r = mapRef.current.regions.find((x) => x.id === id);
                if (r) focusRegion(r);
              }}
              onPairTeleport={pairTeleport}
              onHoverRegionPeer={hoverRegionPeer}
              onOpenVoxelScene={openVoxelSculptScene}
              libRegionDraft={libRegionDraft}
              onLibRegionDraftChange={setLibRegionDraft}
              onOpenVoxelSculptLibrary={openVoxelSculptLibrary}
            />
          ) : null}
          </div>
          </div>

          <MapLibraryTray
            pack={pack}
            tileset={tileset}
            collapsed={libCollapsed}
            onToggleCollapsed={toggleLibCollapsed}
            selected={libSelected}
            onSelect={selectLibItem}
            onOpenVoxelSculpt={openVoxelSculptLibrary}
            onDragActiveChange={(active) => {
              setLibDragActive(active);
              if (!active) setLibHoverTile(null);
            }}
          />
        </div>
      </div>

      {voxelSculptSession && onPackChange ? (
        <div className="ember-voxel-sculpt-overlay">
          <Suspense
            fallback={
              <div className="ember-ed-card" aria-busy="true">
                Загрузка редактора вокселей…
              </div>
            }
          >
            <LazyVoxelSculptPanel
              pack={{
                ...pack,
                voxelModels: pack.voxelModels ?? {},
              }}
              modelId={
                voxelSculptSession.mode === "placementVariant"
                  ? voxelSculptSession.sourceModelId
                  : voxelSculptFocusId ??
                    (libSelected?.kind === "voxel"
                      ? libSelected.modelId
                      : null)
              }
              session={voxelSculptSession}
              onPackChange={onPackChange}
              onClose={() => {
                setVoxelSculptSession(null);
                setVoxelSculptFocusId(null);
              }}
              onSaved={onSaved}
              onSavedVariant={onSavedVoxelVariant}
            />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}
