/**
 * 3D per-voxel sculptor: hover, paint / add / erase / emit / shine / glass / transmittance.
 * Pattern follows three.js interactive voxelpainter (raycast + orbit).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import * as THREE from "three";
import type {
  EmberCharacterArtStyle,
  EmberPack,
  EmberVoxelCharacterTemplate,
  EmberVoxelModel,
} from "../../../game/content/types";
import {
  formatEmberLibraryTags,
  libraryAssetMatchesQuery,
  normalizeEmberLibraryTags,
} from "../../../game/content/libraryTags";
import {
  buildLibraryReferenceCountIndex,
  countLibraryAssetReferences,
} from "../../../game/editor/emberLibraryIndex";
import { EDITOR_ISO_POLAR } from "../../../game/three/editorThreePreview";
import { createPlayerCapsuleOverlay, resizePlayerCapsuleOverlay } from "../../../game/three/playerCapsuleOverlay";
import { DEFAULT_WORLD_BODY } from "../../../game/world/worldPhysics";
import {
  EMBER_ENV_VOXEL_MULTS,
  getEmberEnvMap,
  getEmberEnvMapVoxelMult,
  setEmberEnvMapVoxelMult,
  type EmberEnvVoxelMult,
} from "../../../game/three/envMap";
import {
  EMBER_MATERIAL_LABELS_RU,
} from "../../../game/three/materialPresets";
import {
  getShineColorKeep,
  setShineColorKeep,
} from "../../../game/three/shineColorKeep";
import {
  buildVoxelModelMesh,
  disposeVoxelModelMesh,
  previewVoxelPaletteColor,
} from "../../../game/voxel/voxelMesher";
import {
  createVoxelAxisGizmo,
  viewAxisToSpherical,
} from "../../../game/voxel/voxelAxisGizmo";
import { createHingeGizmo } from "../../../game/voxel/voxelHingeGizmo";
import {
  createVoxelTranslateGizmo,
  type TranslateGizmoHit,
} from "../../../game/voxel/voxelTranslateGizmo";
import {
  addSelectionBox,
  anyVoxelMirror,
  clearVoxelModel,
  clampVoxelSelection,
  cloneVoxelModel,
  countSelectionCells,
  createEmptyVoxelModel,
  editVoxelSelection,
  expandCellWithMirror,
  expandSelectionWithMirror,
  extractSelectionToModel,
  floodFillPaint,
  flipVoxelModel,
  getVoxel,
  getVoxelEmissive,
  getVoxelShine,
  getVoxelTransparency,
  getVoxelTransmittance,
  newVoxelVariantId,
  normalizeVoxelModel,
  normalizeVoxelSelection,
  paintVoxel,
  removeSelectionBoxes,
  resizeVoxelModel,
  selectionAll,
  selectionAllEmpty,
  selectionColZ,
  selectionColorFloodSet,
  selectionEmptyFlood,
  selectionLayerY,
  selectionRowX,
  selectionStackY,
  setVoxel,
  setVoxelEmissive,
  setVoxelShine,
  setVoxelTransparency,
  setVoxelTransmittance,
  stampSolidBlock,
  voxelGridSize,
  voxelTransmittanceLeak,
  voxelTransmittanceShadowParams,
  VOXEL_MIRROR_OFF,
  type SelectionEditOp,
  type VoxelMirrorAxes,
  type VoxelSelection,
  type VoxelSelectionSet,
} from "../../../game/voxel/voxelModel";
import {
  cellFromShapePlaneHit,
  cellWithShapeHeight,
  cellsForVoxelShape,
  cellsToUnitSelection,
  dominantVoxelAxis,
  duplicateVoxelSelection,
  gridExtentAlongAxis,
  intersectAxisAlignedPlane,
  intersectHeightAlongAxis,
  rotateVoxelSelection,
  selectionHasSolidVoxels,
  shapeFootprintCenter,
  stampVoxelShape,
  translateVoxelSelection,
  unionVoxelSelection,
  usesShapeHeightPhase,
  voxelSelectionCenter,
  type VoxelAxis,
  type VoxelRotateAxis,
  type VoxelShapeBrush,
} from "../../../game/voxel/voxelShapeBrush";
import {
  countVoxelPaletteUsage,
  fitVoxelPalette,
  replaceVoxelPaletteIndex,
} from "../../../game/voxel/voxelPaletteOps";
import { VOXELS_PER_BLOCK, MAX_VOXEL_PALETTE } from "../../../game/voxel/constants";
import { readEmberBytes } from "../../../game/content/io";
import {
  packWithVoxels,
  writeVoxelRegistry,
} from "../../../game/voxel/voxelRegistry";
import {
  assignVoxelShard,
  formatVoxelShardLabel,
  voxelVoxRel,
} from "../../../game/voxel/voxelLibrary";
import {
  applyVoxBytesToEmberModel,
  decodeVoxToEmberModel,
  encodeEmberModelToVox,
  nameRuFromVoxFileName,
  voxDocumentExceedsEmberGrid,
  voxelOccupancyFingerprint,
} from "../../../game/voxel/emberVoxCodec";
import {
  ensureVoxelScenes,
  clearSceneJoints,
  moveAnimKey,
  newVoxelAnimClipId,
  newVoxelJointId,
  newVoxelSceneObjectId,
  patchAnimClip,
  patchSceneObject,
  removeAnimKey,
  removeSceneJoint,
  sampleJointAngleDeg,
  sceneFromSingleModel,
  upsertAnimClip,
  upsertAnimKey,
  upsertSceneJoint,
  upsertSceneObject,
} from "../../../game/voxel/voxelScene";
import {
  applySkeletonNodePose,
  computeSkeletonPoses,
  jointHingeWorld,
  resolveJointAngleDeg,
} from "../../../game/voxel/voxelSkeleton";
import {
  canRotateVoxelSceneSelection,
  duplicateVoxelSceneSelection,
  removeVoxelSceneSelection,
  rotateVoxelSceneSelectionY,
  setVoxelSceneSelectionVisible,
  translateVoxelSceneSelection,
  voxelSceneSelectionMoveIds,
  voxelSceneSelectionPivot,
} from "../../../game/voxel/voxelSceneSelection";
import {
  CHIBI32_SLOT_LABEL_RU,
  characterCapsule,
  characterCapsuleCenterRelativeTo,
  characterModelIdForSlotView,
  characterPresetNameRu,
  characterPresetToastRu,
  characterSlotForObject,
  createVoxelCharacter,
  isCharacterScene,
  isLockedCharacterObject,
  newVoxelCharacterId,
} from "../../../game/voxel/voxelCharacter";
import type {
  EmberCharacterCardView,
  EmberVoxelJointAxis,
  EmberVoxelScene,
} from "../../../game/content/types";
import {
  getLastOpenedId,
  hasOpenedEditor,
  markEditorOpened,
} from "./editorOpenSession";
import { EmberThumbGrid, EmberVoxelSceneThumb, EmberVoxelThumb } from "./EmberThumbGrid";
import {
  resolveEmissiveLightRange,
  resolveEmissiveStrength,
} from "../../../game/tile/emissivePaint";
import {
  listVoxelEmissiveLamps,
  normalizeVoxelLightOffset,
  patchVoxelEmissiveLamp,
  resolveVoxelLampOrigin,
  summarizeVoxelEmissive,
  summarizeVoxelEmissiveForLamp,
  VOXEL_EMISSIVE_LAMPS_MAX,
} from "../../../game/voxel/voxelEmissiveLight";
import { packLampDiscDecay } from "../../../game/three/threeLighting";
import { EditableRange } from "./EditableRange";
import { VoxelAnimTimeline } from "./VoxelAnimTimeline";
import { VoxelObjectPropsPanel } from "./VoxelObjectPropsPanel";
import { DeferredColorInput } from "./DeferredColorInput";
import { VoxelSceneOutliner } from "./VoxelSceneOutliner";
import { VoxelCharacterPanel } from "./VoxelCharacterPanel";

export type VoxelSculptSession =
  | { mode: "library" }
  | {
      mode: "placementVariant";
      placementId: string;
      sourceModelId: string;
    };

type Props = {
  pack: EmberPack;
  modelId: string | null;
  onPackChange: (pack: EmberPack) => void;
  /** Keep parent focus in sync when the user switches models locally. */
  onActiveModelChange?: (modelId: string | null) => void;
  /** If omitted, panel is a top-level editor tab (no close button). */
  onClose?: () => void;
  onSaved?: (msg: string) => void;
  /**
   * library (default): save overwrites the active model.
   * placementVariant: save creates a unique library model for one map placement.
   */
  session?: VoxelSculptSession;
  onSavedVariant?: (payload: {
    model: EmberVoxelModel;
    placementId: string;
  }) => void;
};

type SculptTool =
  | "add"
  | "paint"
  | "erase"
  | "emit"
  | "shine"
  | "transparency"
  | "transmittance"
  | "fill"
  | "replace"
  | "pick"
  | "inspect"
  | "select"
  | "hinge"
  | "move";

type VoxelWorkspaceMode = "sculpt" | "material" | "scene" | "animate";
type SceneTransformMode = "translate" | "rotate";

/** How a click builds a voxel group selection. */
type SelectMode = "box" | "layer" | "row" | "col" | "stack" | "linked";

type HitCell = { x: number; y: number; z: number };

function cellInVoxelSelection(
  sel: VoxelSelectionSet | null | undefined,
  cell: HitCell,
): boolean {
  if (!sel?.length) return false;
  return sel.some(
    (b) =>
      cell.x >= b.x0 &&
      cell.x <= b.x1 &&
      cell.y >= b.y0 &&
      cell.y <= b.y1 &&
      cell.z >= b.z0 &&
      cell.z <= b.z1,
  );
}

function selectionGizmoScale(sel: VoxelSelectionSet): number {
  const b = unionVoxelSelection(sel);
  if (!b) return 1.2;
  const m = Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1, b.z1 - b.z0 + 1);
  return Math.max(1.05, Math.min(2.8, 0.85 + m * 0.14));
}

type SculptBarMenuId = "edit" | "file" | "create";

function SculptBarMenu({
  id,
  label,
  title,
  openId,
  onOpen,
  children,
}: {
  id: SculptBarMenuId;
  label: string;
  title?: string;
  openId: SculptBarMenuId | null;
  onOpen: (id: SculptBarMenuId | null) => void;
  children: ReactNode;
}) {
  const open = openId === id;
  return (
    <div className={`ember-voxel-sculpt__menu ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className={`ghost ${open ? "is-on" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        onClick={() => onOpen(open ? null : id)}
        onMouseEnter={() => {
          if (openId && openId !== id) onOpen(id);
        }}
      >
        {label}
        <span className="ember-voxel-sculpt__menu-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="ember-voxel-sculpt__menu-panel" role="menu">
          {children}
        </div>
      ) : null}
    </div>
  );
}

type InspectTarget = {
  objectId: string;
  modelId: string;
  cell: HitCell;
};

type SceneApi = {
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  meshRoot: THREE.Group;
  hover: THREE.Mesh;
  bounds: THREE.Mesh;
  center: THREE.Vector3;
  /** Azimuth around Y (theta). */
  yaw: number;
  /** Polar from +Y (phi), clamped away from poles. */
  pitch: number;
  dist: number;
  render: () => void;
  applyCam: () => void;
  setMesh: (group: THREE.Group) => void;
  /** Palette hover without rebuilding geometry or changing the draft model. */
  previewPaletteColor: (paletteIndex: number, hex: string) => void;
  /** Other scene objects in scene space, cleared on each call. */
  setPeerMeshes: (groups: THREE.Group[]) => void;
  setSelection: (sel: VoxelSelectionSet | null) => void;
  /** Wire edges on exposed faces of solid voxels. */
  setVoxelGrid: (model: EmberVoxelModel | null, visible: boolean) => void;
  /** Blender-style symmetry midplanes. */
  setMirrorPlanes: (
    model: EmberVoxelModel | null,
    mirror: VoxelMirrorAxes,
  ) => void;
  /** Hinge rotation gizmo at joint pivot (editor pose). */
  setHingeGizmo: (
    pose:
      | {
          pos: { x: number; y: number; z: number };
          axis: EmberVoxelJointAxis;
          scale: number;
        }
      | null,
  ) => void;
  /** Blender-style translate gizmo for the voxel selection. */
  setSelectionGizmo: (
    pose: { pos: { x: number; y: number; z: number }; scale: number } | null,
  ) => void;
  /** World-space translate gizmo for one or more scene objects. */
  setSceneObjectGizmo: (
    pose:
      | {
          pos: { x: number; y: number; z: number };
          scale: number;
          objectIds: readonly string[];
          mode: SceneTransformMode;
        }
      | null,
  ) => void;
  /** Keep selection/grid/hover aligned when meshRoot has hinge pose. */
  syncEditOverlays: () => void;
  /** Yellow marker at emissive PointLight origin (voxel coords). */
  setLightOriginMarker: (
    pos: { x: number; y: number; z: number } | null,
  ) => void;
  setLightOriginExtras: (positions: { x: number; y: number; z: number }[]) => void;
  /** Live PointLights for sculpt studio preview. */
  setPreviewEmissiveLights: (
    cfgs: Array<{
      pos: { x: number; y: number; z: number };
      color: THREE.Color;
      intensity: number;
      distance: number;
      transmittanceLeak?: number;
      softRings?: boolean;
      softShadows?: boolean;
    }> | null,
  ) => void;
  frameCamera: () => void;
  frameExploreCamera: () => void;
  setPlayerCapsule: (opts: {
    visible: boolean;
    radius: number;
    height: number;
    x: number;
    y: number;
    z: number;
  }) => void;
  dispose: () => void;
};

/** Keep spherical phi off the poles so lookAt stays stable. */
const PITCH_MIN = 0.08;
const PITCH_MAX = Math.PI - 0.08;

const VOXEL_GRID_STORAGE_KEY = "ember-voxel-sculpt-grid";
const VOXEL_CAPSULE_STORAGE_KEY = "ember-voxel-sculpt-capsule";
const VOXEL_PREVIEW_LIGHT_STORAGE_KEY = "ember-voxel-sculpt-preview-light";
const RMB_DOUBLE_MS = 320;
function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function downloadVoxBytes(fileName: string, bytes: Uint8Array): void {
  const blob = new Blob([new Uint8Array(bytes)], {
    type: "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".vox") ? fileName : `${fileName}.vox`;
  a.click();
  URL.revokeObjectURL(url);
}

function loadShowVoxelGrid(): boolean {
  try {
    return sessionStorage.getItem(VOXEL_GRID_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function loadShowPlayerCapsule(): boolean {
  try {
    return sessionStorage.getItem(VOXEL_CAPSULE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Studio PointLight from emissive voxels — on by default. */
function loadShowPreviewEmissiveLight(): boolean {
  try {
    const v = sessionStorage.getItem(VOXEL_PREVIEW_LIGHT_STORAGE_KEY);
    if (v === null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

function resolveInitialVoxelId(
  modelId: string | null,
  pack: EmberPack,
  variantMode: boolean,
  sourceModelId?: string,
): string {
  const scenes = ensureVoxelScenes(pack.voxelModels, pack.voxelScenes);
  if (variantMode && sourceModelId && pack.voxelModels[sourceModelId]) {
    // Prefer scene that contains this model.
    const hit = Object.values(scenes).find((s) =>
      s.objects.some((o) => o.modelId === sourceModelId),
    );
    return hit?.id ?? sourceModelId;
  }
  if (modelId) {
    if (scenes[modelId]) return modelId;
    if (pack.voxelModels[modelId]) {
      const hit = Object.values(scenes).find((s) =>
        s.objects.some((o) => o.modelId === modelId),
      );
      return hit?.id ?? modelId;
    }
  }
  if (hasOpenedEditor("voxel")) {
    const last = getLastOpenedId("voxel");
    if (last && (scenes[last] || pack.voxelModels[last])) {
      if (scenes[last]) return last;
      const hit = Object.values(scenes).find((s) =>
        s.objects.some((o) => o.modelId === last),
      );
      return hit?.id ?? last;
    }
  }
  return "";
}

function pushLine(
  out: number[],
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): void {
  out.push(ax, ay, az, bx, by, bz);
}

function cloneVoxelSelectionSet(
  sel: VoxelSelectionSet | null | undefined,
): VoxelSelectionSet | null {
  if (!sel?.length) return null;
  return sel.map((b) => ({ ...b }));
}

function voxelSelectionsEqual(
  a: VoxelSelectionSet | null | undefined,
  b: VoxelSelectionSet | null | undefined,
): boolean {
  const aa = a?.length ? a : [];
  const bb = b?.length ? b : [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    const x = aa[i]!;
    const y = bb[i]!;
    if (
      x.x0 !== y.x0 ||
      x.y0 !== y.y0 ||
      x.z0 !== y.z0 ||
      x.x1 !== y.x1 ||
      x.y1 !== y.y1 ||
      x.z1 !== y.z1
    ) {
      return false;
    }
  }
  return true;
}

type VoxelModelSnapshot = Omit<
  EmberVoxelModel,
  "palette" | "voxels" | "emissive" | "shine" | "transparency" | "transmittance"
> & {
  palette: string[];
  voxels: Uint8Array;
  emissive: Uint8Array;
  shine: Uint8Array;
  transparency: Uint8Array;
  transmittance: Uint8Array;
};

type VoxelHistEntry = {
  snapshot: VoxelModelSnapshot;
  selection: VoxelSelectionSet | null;
};

const MAX_VOXEL_HISTORY_BYTES = 12 * 1024 * 1024;
const MIN_VOXEL_HISTORY_STEPS = 8;
const MAX_VOXEL_HISTORY_STEPS = 80;

function captureVoxelSnapshot(model: EmberVoxelModel): VoxelModelSnapshot {
  return {
    ...model,
    palette: [...model.palette],
    voxels: Uint8Array.from(model.voxels),
    emissive: Uint8Array.from(model.emissive ?? []),
    shine: Uint8Array.from(model.shine ?? []),
    transparency: Uint8Array.from(model.transparency ?? []),
    transmittance: Uint8Array.from(model.transmittance ?? []),
  };
}

function restoreVoxelSnapshot(snapshot: VoxelModelSnapshot): EmberVoxelModel {
  return {
    ...snapshot,
    palette: [...snapshot.palette],
    voxels: Array.from(snapshot.voxels),
    emissive: Array.from(snapshot.emissive),
    shine: Array.from(snapshot.shine),
    transparency: Array.from(snapshot.transparency),
    transmittance: Array.from(snapshot.transmittance),
  };
}

function voxelHistoryLimit(model: EmberVoxelModel): number {
  const bytesPerSnapshot = Math.max(1, model.voxels.length * 5);
  return Math.max(
    MIN_VOXEL_HISTORY_STEPS,
    Math.min(
      MAX_VOXEL_HISTORY_STEPS,
      Math.floor(MAX_VOXEL_HISTORY_BYTES / bytesPerSnapshot),
    ),
  );
}

/**
 * Selection overlay for many unit cells («умный»):
 * - fill only on faces that touch non-selected space
 * - edges only on true silhouette (skip coplanar seams)
 * so a yellow frame around a chest does not become a foggy wire cage.
 */
function buildSelectionCellOverlay(sel: VoxelSelectionSet): {
  faces: number[];
  edges: number[];
} {
  const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const cells = new Set<string>();
  for (const b of sel) {
    for (let y = b.y0; y <= b.y1; y++) {
      for (let z = b.z0; z <= b.z1; z++) {
        for (let x = b.x0; x <= b.x1; x++) {
          cells.add(cellKey(x, y, z));
        }
      }
    }
  }
  const has = (x: number, y: number, z: number) => cells.has(cellKey(x, y, z));
  const faces: number[] = [];
  const edges: number[] = [];
  const edgeKeys = new Set<string>();
  // Slightly outside the solid so lines win z-test without disabling depth.
  const eps = 0.02;

  const pushTri = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
  ) => {
    faces.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };

  const pushQuad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
  ) => {
    pushTri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    pushTri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  };

  const addEdge = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
  ) => {
    const ka = `${ax.toFixed(3)},${ay.toFixed(3)},${az.toFixed(3)}`;
    const kb = `${bx.toFixed(3)},${by.toFixed(3)},${bz.toFixed(3)}`;
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    pushLine(edges, ax, ay, az, bx, by, bz);
  };

  /**
   * Edge of an exposed face is a silhouette if the sideways neighbor
   * is not selected, or that neighbor does not also expose the same plane
   * (avoids a grid on flat selected walls).
   */
  const silhouetteEdge = (
    x: number,
    y: number,
    z: number,
    /** Face normal unit axis */
    nx: number,
    ny: number,
    nz: number,
    /** Sideways step in the face plane */
    sx: number,
    sy: number,
    sz: number,
  ) => {
    const ox = x + sx;
    const oy = y + sy;
    const oz = z + sz;
    if (!has(ox, oy, oz)) return true;
    // Neighbor selected: skip if it also has this face exposed.
    return has(ox + nx, oy + ny, oz + nz);
  };

  for (const s of cells) {
    const [xs, ys, zs] = s.split(",");
    const x = Number(xs);
    const y = Number(ys);
    const z = Number(zs);
    const x0 = x - eps;
    const y0 = y - eps;
    const z0 = z - eps;
    const x1 = x + 1 + eps;
    const y1 = y + 1 + eps;
    const z1 = z + 1 + eps;

    // +X
    if (!has(x + 1, y, z)) {
      pushQuad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]);
      if (silhouetteEdge(x, y, z, 1, 0, 0, 0, 0, -1))
        addEdge(x1, y0, z0, x1, y1, z0);
      if (silhouetteEdge(x, y, z, 1, 0, 0, 0, 0, 1))
        addEdge(x1, y0, z1, x1, y1, z1);
      if (silhouetteEdge(x, y, z, 1, 0, 0, 0, -1, 0))
        addEdge(x1, y0, z0, x1, y0, z1);
      if (silhouetteEdge(x, y, z, 1, 0, 0, 0, 1, 0))
        addEdge(x1, y1, z0, x1, y1, z1);
    }
    // -X
    if (!has(x - 1, y, z)) {
      pushQuad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]);
      if (silhouetteEdge(x, y, z, -1, 0, 0, 0, 0, -1))
        addEdge(x0, y0, z0, x0, y1, z0);
      if (silhouetteEdge(x, y, z, -1, 0, 0, 0, 0, 1))
        addEdge(x0, y0, z1, x0, y1, z1);
      if (silhouetteEdge(x, y, z, -1, 0, 0, 0, -1, 0))
        addEdge(x0, y0, z0, x0, y0, z1);
      if (silhouetteEdge(x, y, z, -1, 0, 0, 0, 1, 0))
        addEdge(x0, y1, z0, x0, y1, z1);
    }
    // +Y
    if (!has(x, y + 1, z)) {
      pushQuad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]);
      if (silhouetteEdge(x, y, z, 0, 1, 0, -1, 0, 0))
        addEdge(x0, y1, z0, x0, y1, z1);
      if (silhouetteEdge(x, y, z, 0, 1, 0, 1, 0, 0))
        addEdge(x1, y1, z0, x1, y1, z1);
      if (silhouetteEdge(x, y, z, 0, 1, 0, 0, 0, -1))
        addEdge(x0, y1, z0, x1, y1, z0);
      if (silhouetteEdge(x, y, z, 0, 1, 0, 0, 0, 1))
        addEdge(x0, y1, z1, x1, y1, z1);
    }
    // -Y
    if (!has(x, y - 1, z)) {
      pushQuad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]);
      if (silhouetteEdge(x, y, z, 0, -1, 0, -1, 0, 0))
        addEdge(x0, y0, z0, x0, y0, z1);
      if (silhouetteEdge(x, y, z, 0, -1, 0, 1, 0, 0))
        addEdge(x1, y0, z0, x1, y0, z1);
      if (silhouetteEdge(x, y, z, 0, -1, 0, 0, 0, -1))
        addEdge(x0, y0, z0, x1, y0, z0);
      if (silhouetteEdge(x, y, z, 0, -1, 0, 0, 0, 1))
        addEdge(x0, y0, z1, x1, y0, z1);
    }
    // +Z
    if (!has(x, y, z + 1)) {
      pushQuad([x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]);
      if (silhouetteEdge(x, y, z, 0, 0, 1, -1, 0, 0))
        addEdge(x0, y0, z1, x0, y1, z1);
      if (silhouetteEdge(x, y, z, 0, 0, 1, 1, 0, 0))
        addEdge(x1, y0, z1, x1, y1, z1);
      if (silhouetteEdge(x, y, z, 0, 0, 1, 0, -1, 0))
        addEdge(x0, y0, z1, x1, y0, z1);
      if (silhouetteEdge(x, y, z, 0, 0, 1, 0, 1, 0))
        addEdge(x0, y1, z1, x1, y1, z1);
    }
    // -Z
    if (!has(x, y, z - 1)) {
      pushQuad([x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z0]);
      if (silhouetteEdge(x, y, z, 0, 0, -1, -1, 0, 0))
        addEdge(x0, y0, z0, x0, y1, z0);
      if (silhouetteEdge(x, y, z, 0, 0, -1, 1, 0, 0))
        addEdge(x1, y0, z0, x1, y1, z0);
      if (silhouetteEdge(x, y, z, 0, 0, -1, 0, -1, 0))
        addEdge(x0, y0, z0, x1, y0, z0);
      if (silhouetteEdge(x, y, z, 0, 0, -1, 0, 1, 0))
        addEdge(x0, y1, z0, x1, y1, z0);
    }
  }

  return { faces, edges };
}

/**
 * Edges of faces that touch air — reads as a voxel grid on the solid surface.
 * Offset 0.01 along the face normal so lines sit outside the mesh (less z-fight).
 */
function buildSolidVoxelGridPositions(model: EmberVoxelModel): number[] {
  const g = voxelGridSize(model);
  const out: number[] = [];
  const eps = 0.012;
  const solid = (x: number, y: number, z: number) =>
    x >= 0 &&
    y >= 0 &&
    z >= 0 &&
    x < g.sx &&
    y < g.sy &&
    z < g.sz &&
    getVoxel(model, x, y, z) > 0;

  for (let y = 0; y < g.sy; y++) {
    for (let z = 0; z < g.sz; z++) {
      for (let x = 0; x < g.sx; x++) {
        if (!solid(x, y, z)) continue;
        const x0 = x;
        const y0 = y;
        const z0 = z;
        const x1 = x + 1;
        const y1 = y + 1;
        const z1 = z + 1;
        if (!solid(x - 1, y, z)) {
          const ox = x0 - eps;
          pushLine(out, ox, y0, z0, ox, y1, z0);
          pushLine(out, ox, y1, z0, ox, y1, z1);
          pushLine(out, ox, y1, z1, ox, y0, z1);
          pushLine(out, ox, y0, z1, ox, y0, z0);
        }
        if (!solid(x + 1, y, z)) {
          const ox = x1 + eps;
          pushLine(out, ox, y0, z0, ox, y1, z0);
          pushLine(out, ox, y1, z0, ox, y1, z1);
          pushLine(out, ox, y1, z1, ox, y0, z1);
          pushLine(out, ox, y0, z1, ox, y0, z0);
        }
        if (!solid(x, y - 1, z)) {
          const oy = y0 - eps;
          pushLine(out, x0, oy, z0, x1, oy, z0);
          pushLine(out, x1, oy, z0, x1, oy, z1);
          pushLine(out, x1, oy, z1, x0, oy, z1);
          pushLine(out, x0, oy, z1, x0, oy, z0);
        }
        if (!solid(x, y + 1, z)) {
          const oy = y1 + eps;
          pushLine(out, x0, oy, z0, x1, oy, z0);
          pushLine(out, x1, oy, z0, x1, oy, z1);
          pushLine(out, x1, oy, z1, x0, oy, z1);
          pushLine(out, x0, oy, z1, x0, oy, z0);
        }
        if (!solid(x, y, z - 1)) {
          const oz = z0 - eps;
          pushLine(out, x0, y0, oz, x1, y0, oz);
          pushLine(out, x1, y0, oz, x1, y1, oz);
          pushLine(out, x1, y1, oz, x0, y1, oz);
          pushLine(out, x0, y1, oz, x0, y0, oz);
        }
        if (!solid(x, y, z + 1)) {
          const oz = z1 + eps;
          pushLine(out, x0, y0, oz, x1, y0, oz);
          pushLine(out, x1, y0, oz, x1, y1, oz);
          pushLine(out, x1, y1, oz, x0, y1, oz);
          pushLine(out, x0, y1, oz, x0, y0, oz);
        }
      }
    }
  }
  return out;
}

function voxelContentRoot(meshRoot: THREE.Object3D): THREE.Object3D {
  return meshRoot.children[0] ?? meshRoot;
}

function cellFromHit(
  hit: THREE.Intersection,
  meshRoot: THREE.Object3D,
  tool: SculptTool,
): HitCell {
  // Voxel grid lives on the content group. meshRoot may carry hinge
  // pose (pivot offset + rotation) — never use meshRoot local for cells.
  const space = voxelContentRoot(meshRoot);
  space.updateWorldMatrix(true, false);
  const p = hit.point.clone();
  space.worldToLocal(p);
  const nWorld = hit.face?.normal.clone() ?? new THREE.Vector3(0, 1, 0);
  nWorld.transformDirection(hit.object.matrixWorld);
  const inv = new THREE.Matrix4().copy(space.matrixWorld).invert();
  const nLocal = nWorld.clone().transformDirection(inv).normalize();
  if (tool === "add") p.addScaledVector(nLocal, 0.51);
  else p.addScaledVector(nLocal, -0.01);
  return {
    x: Math.floor(p.x),
    y: Math.floor(p.y),
    z: Math.floor(p.z),
  };
}

function localHitNormal(
  hit: THREE.Intersection,
  meshRoot: THREE.Object3D,
): THREE.Vector3 {
  const space = voxelContentRoot(meshRoot);
  space.updateWorldMatrix(true, false);
  const nWorld = hit.face?.normal.clone() ?? new THREE.Vector3(0, 1, 0);
  nWorld.transformDirection(hit.object.matrixWorld);
  const inv = new THREE.Matrix4().copy(space.matrixWorld).invert();
  return nWorld.transformDirection(inv).normalize();
}

/** True if integer grid vertex touches at least one solid voxel. */
function vertexTouchesSolid(
  model: EmberVoxelModel,
  vx: number,
  vy: number,
  vz: number,
): boolean {
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = 0; dx <= 1; dx++) {
      for (let dz = 0; dz <= 1; dz++) {
        if (getVoxel(model, vx - dx, vy - dy, vz - dz) > 0) return true;
      }
    }
  }
  return false;
}

/** Snap a local-space hit to the nearest solid voxel corner (vertex). */
function snapToNearestVertex(
  model: EmberVoxelModel,
  local: { x: number; y: number; z: number },
): HitCell | null {
  const g = voxelGridSize(model);
  const fx = Math.floor(local.x);
  const fy = Math.floor(local.y);
  const fz = Math.floor(local.z);
  let best: HitCell | null = null;
  let bestD = Infinity;
  for (let y = fy - 1; y <= fy + 2; y++) {
    for (let x = fx - 1; x <= fx + 2; x++) {
      for (let z = fz - 1; z <= fz + 2; z++) {
        if (x < 0 || y < 0 || z < 0 || x > g.sx || y > g.sy || z > g.sz) {
          continue;
        }
        if (!vertexTouchesSolid(model, x, y, z)) continue;
        const d =
          (local.x - x) * (local.x - x) +
          (local.y - y) * (local.y - y) +
          (local.z - z) * (local.z - z);
        if (d < bestD) {
          bestD = d;
          best = { x, y, z };
        }
      }
    }
  }
  return best;
}

function applyTool(
  model: EmberVoxelModel,
  cell: HitCell,
  tool: SculptTool,
  paletteIndex: number,
  emitAmount: number,
  shineAmount: number,
  transparencyAmount: number,
  transmittanceAmount: number,
): EmberVoxelModel {
  switch (tool) {
    case "add":
      return setVoxel(model, cell.x, cell.y, cell.z, paletteIndex);
    case "paint":
      return paintVoxel(model, cell.x, cell.y, cell.z, paletteIndex);
    case "erase":
      return setVoxel(model, cell.x, cell.y, cell.z, 0);
    case "emit":
      return setVoxelEmissive(model, cell.x, cell.y, cell.z, emitAmount);
    case "shine":
      return setVoxelShine(model, cell.x, cell.y, cell.z, shineAmount);
    case "transparency":
      return setVoxelTransparency(
        model,
        cell.x,
        cell.y,
        cell.z,
        transparencyAmount,
      );
    case "transmittance":
      return setVoxelTransmittance(
        model,
        cell.x,
        cell.y,
        cell.z,
        transmittanceAmount,
      );
    case "fill":
      return floodFillPaint(model, cell.x, cell.y, cell.z, paletteIndex);
    case "replace":
    case "pick":
    case "inspect":
    case "select":
    case "move":
    case "hinge":
      return model;
    default: {
      const _n: never = tool;
      return _n;
    }
  }
}

function selectionFromClick(
  model: EmberVoxelModel,
  cell: HitCell,
  mode: SelectMode,
  selectEmpty: boolean,
): VoxelSelectionSet {
  const one = normalizeVoxelSelection(cell, cell);
  switch (mode) {
    case "linked":
      // Same palette (or air) 6-connected component — exact cells.
      return selectionColorFloodSet(model, cell.x, cell.y, cell.z);
    case "box": {
      if (selectEmpty) {
        const flood =
          selectionEmptyFlood(model, cell.x, cell.y, cell.z) ?? one;
        return [flood];
      }
      return [one];
    }
    case "layer":
      return [selectionLayerY(model, cell.y) ?? one];
    case "row":
      return [
        selectionRowX(model, cell.y, cell.z, {
          empty: selectEmpty,
        }) ?? one,
      ];
    case "col":
      return [
        selectionColZ(model, cell.x, cell.y, {
          empty: selectEmpty,
        }) ?? one,
      ];
    case "stack":
      return [selectionStackY(model, cell.x, cell.z, cell.y) ?? one];
    default: {
      const _n: never = mode;
      return _n;
    }
  }
}

const HOVER_COLOR: Record<SculptTool, number> = {
  add: 0x60e080,
  paint: 0xffc060,
  erase: 0xff6060,
  emit: 0x80c0ff,
  shine: 0xc8e8f0,
  transparency: 0xa0e8ff,
  transmittance: 0xffd080,
  fill: 0xc080ff,
  replace: 0xff80b0,
  pick: 0xffffff,
  inspect: 0x70e0d0,
  select: 0x60c0ff,
  move: 0xf0c060,
  hinge: 0xe080c0,
};

const TOOL_BUTTONS: ReadonlyArray<{
  id: SculptTool;
  label: string;
  tip: string;
  /** Shown on the tool chip (letter / digit). */
  key: string;
}> = [
  { id: "add", label: "Куб", tip: "Добавить воксель · B · N — следующая форма", key: "B" },
  {
    id: "erase",
    label: "Ластик",
    tip: "Стереть · E · Shift+ЛКМ временно стирает · Delete — выделение",
    key: "E",
  },
  {
    id: "paint",
    label: "Кисть",
    tip: "Перекрасить · B · при выделении — краска группы",
    key: "B",
  },
  {
    id: "fill",
    label: "Заливка",
    tip: "Заливка связных · G · при выделении — залить группу",
    key: "G",
  },
  {
    id: "replace",
    label: "Замена",
    tip: "Все клетки этого цвета → текущий слот · R · Shift — стереть цвет",
    key: "R",
  },
  { id: "pick", label: "Пипетка", tip: "Взять цвет · I", key: "I" },
  {
    id: "inspect",
    label: "Обзор",
    tip: "Параметры вокселя · O · клик — панель справа",
    key: "O",
  },
  {
    id: "emit",
    label: "Свечение",
    tip: "Эмиссия · E · при выделении — свет группы",
    key: "E",
  },
  {
    id: "shine",
    label: "Блеск",
    tip: "Блеск · S · яркий = зеркало на верхней грани",
    key: "S",
  },
  {
    id: "transparency",
    label: "Прозрачность",
    tip: "Прозрачность · T · видно насквозь · при выделении — подгруппа",
    key: "T",
  },
  {
    id: "transmittance",
    label: "Просвет",
    tip: "Просвет · U · непрозрачный · тень светлеет и мягче с расстоянием · 255 = без тени",
    key: "U",
  },
  {
    id: "select",
    label: "Группа",
    tip: "Выделение · M · режимы группы Shift+1…6 · Shift+0 — пустые",
    key: "M",
  },
  {
    id: "move",
    label: "Сдвиг",
    tip: "Сдвиг · V в модели, W в сцене · гизмо / стрелки",
    key: "V",
  },
  {
    id: "hinge",
    label: "Петля",
    tip: "Пивоты петли: клик по родителю, затем по дочернему объекту",
    key: "J",
  },
];

const VOXEL_WORKSPACES: ReadonlyArray<{
  id: VoxelWorkspaceMode;
  label: string;
  description: string;
  defaultTool: SculptTool;
}> = [
  {
    id: "sculpt",
    label: "Модель",
    description: "Форма, выделение и геометрия",
    defaultTool: "add",
  },
  {
    id: "material",
    label: "Материал",
    description: "Цвет и каналы поверхности",
    defaultTool: "paint",
  },
  {
    id: "scene",
    label: "Сцена",
    description: "Объекты, кости и связи",
    defaultTool: "move",
  },
  {
    id: "animate",
    label: "Анимация",
    description: "Петли, ключи и клипы",
    defaultTool: "move",
  },
];

const WORKSPACE_TOOLS: Record<
  VoxelWorkspaceMode,
  ReadonlyArray<SculptTool>
> = {
  sculpt: ["add", "erase", "select", "move"],
  material: [
    "paint",
    "fill",
    "replace",
    "pick",
    "inspect",
    "emit",
    "shine",
    "transparency",
    "transmittance",
  ],
  scene: ["move", "hinge"],
  animate: ["move", "hinge"],
};

function voxelToolHotkey(
  tool: SculptTool,
  workspace: VoxelWorkspaceMode,
): string {
  if (tool === "move" && (workspace === "scene" || workspace === "animate")) {
    return "W";
  }
  return TOOL_BUTTONS.find((item) => item.id === tool)?.key ?? "";
}

function preferredWorkspaceForTool(tool: SculptTool): VoxelWorkspaceMode {
  if (tool === "hinge") return "scene";
  if (WORKSPACE_TOOLS.material.includes(tool)) return "material";
  return "sculpt";
}

const SHAPE_BRUSHES: ReadonlyArray<{
  id: VoxelShapeBrush;
  label: string;
  tip: string;
}> = [
  { id: "voxel", label: "Точка", tip: "Один воксель, как сейчас · N переключает форму" },
  { id: "line", label: "Линия", tip: "ЛКМ-drag: линия от точки до точки" },
  {
    id: "box",
    label: "Коробка",
    tip: "ЛКМ-drag по грани клика · отпустить — выдавить по нормали · ЛКМ/Enter — ок · ПКМ/Esc — отмена",
  },
  {
    id: "sphere",
    label: "Сфера",
    tip: "ЛКМ-drag по грани клика · отпустить — выдавить по нормали · ЛКМ/Enter — ок · ПКМ/Esc — отмена",
  },
];

const SELECT_MODES: ReadonlyArray<{
  id: SelectMode;
  label: string;
  tip: string;
  hotkey: string;
}> = [
  {
    id: "box",
    label: "Рамка",
    tip: "Рамка ЛКМ · Shift+ЛКМ добавить · ПКМ снять · Shift+1",
    hotkey: "⇧1",
  },
  {
    id: "layer",
    label: "Слой Y",
    tip: "Слой Y · Shift+ЛКМ добавить · Shift+2",
    hotkey: "⇧2",
  },
  {
    id: "row",
    label: "Ряд X",
    tip: "Ряд X · Shift+ЛКМ добавить · Shift+3",
    hotkey: "⇧3",
  },
  {
    id: "col",
    label: "Ряд Z",
    tip: "Ряд Z · Shift+ЛКМ добавить · Shift+4",
    hotkey: "⇧4",
  },
  {
    id: "stack",
    label: "Столбец",
    tip: "Столбец · Shift+ЛКМ добавить · Shift+5",
    hotkey: "⇧5",
  },
  {
    id: "linked",
    label: "Умный",
    tip: "Связные одного цвета · клик по вокселю · Shift+6",
    hotkey: "⇧6",
  },
];

export function VoxelSculptPanel({
  pack,
  modelId,
  onPackChange,
  onActiveModelChange,
  onClose,
  onSaved,
  session = { mode: "library" },
  onSavedVariant,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const axesHostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const draftRef = useRef<EmberVoxelModel | null>(null);
  const toolRef = useRef<SculptTool>("add");
  const shapeBrushRef = useRef<VoxelShapeBrush>("voxel");
  const shapeDragRef = useRef<{
    kind: Exclude<VoxelShapeBrush, "voxel">;
    phase: "plane" | "height";
    start: HitCell;
    planeEnd: HitCell;
    end: HitCell;
    erase: boolean;
    heightAxis: VoxelAxis;
    heightAnchorClientY: number;
    heightAnchor: number;
    heightRayBase: number | null;
  } | null>(null);
  const onShapeCommitRef = useRef<
    (start: HitCell, end: HitCell, erase: boolean) => void
  >(() => {});
  const onShapeCancelRef = useRef<() => void>(() => {});
  const onShapeConfirmRef = useRef<() => boolean>(() => false);
  const paletteRef = useRef(1);
  const emitRef = useRef(180);
  const shineRef = useRef(180);
  const transparencyRef = useRef(160);
  const transmittanceRef = useRef(255);
  const lastCellRef = useRef<string | null>(null);
  const paintingRef = useRef(false);
  const orbitingRef = useRef(false);
  const panningRef = useRef(false);
  const shiftEraseRef = useRef(false);
  const editSnapRef = useRef(false);
  const undoStackRef = useRef<VoxelHistEntry[]>([]);
  const redoStackRef = useRef<VoxelHistEntry[]>([]);
  const beginEditRef = useRef<() => void>(() => {});
  const voxFileRef = useRef<HTMLInputElement | null>(null);
  const voxImportModeRef = useRef<"replace" | "new">("replace");
  const ignoreVoxWatchUntilRef = useRef(0);
  const skipVoxWriteOnceRef = useRef<string | null>(null);
  const applyEditRef = useRef<(next: EmberVoxelModel) => void>(() => {});
  const onPickColorRef = useRef<(pi: number) => void>(() => {});
  const onPickLightOriginRef = useRef<(cell: HitCell) => void>(() => {});
  const onMoveLightOffsetRef = useRef<
    (offset: { x: number; y: number; z: number }) => void
  >(() => {});
  const onSelMovePreviewRef = useRef<
    (
      delta: HitCell,
    ) => {
      center: { x: number; y: number; z: number };
      scale: number;
    } | null
  >(() => null);
  const onSelMoveCommitRef = useRef<(delta: HitCell) => void>(() => {});
  const onSelMoveCancelRef = useRef<() => void>(() => {});
  const onSceneMoveCommitRef = useRef<(delta: HitCell) => void>(() => {});
  const onSceneMoveCancelRef = useRef<() => void>(() => {});
  const onSceneRotateCommitRef = useRef<(quarterTurns: number) => void>(
    () => {},
  );
  const onSceneRotateCancelRef = useRef<() => void>(() => {});
  const translateSelectedVoxelsRef = useRef<(delta: HitCell) => void>(() => {});
  const selMoveBaseRef = useRef<{
    model: EmberVoxelModel;
    sel: VoxelSelectionSet;
  } | null>(null);
  const onInspectRef = useRef<
    (payload: { objectId: string | null; cell: HitCell }) => void
  >(() => {});
  const onActivateObjectRef = useRef<(objectId: string) => void>(() => {});
  const selectModeRef = useRef<SelectMode>("box");
  const selectEmptyRef = useRef(false);
  const mirrorAxesRef = useRef<VoxelMirrorAxes>(VOXEL_MIRROR_OFF);
  const selectionRef = useRef<VoxelSelectionSet | null>(null);
  const setSelectionRef = useRef<(sel: VoxelSelectionSet | null) => void>(
    () => {},
  );
  /** Boxes present before this select stroke (Shift = keep them). */
  const selectBaseRef = useRef<VoxelSelectionSet>([]);
  /** Boxes painted during the current drag stroke. */
  const selectStrokeRef = useRef<VoxelSelectionSet>([]);
  /** RMB select stroke removes groups instead of adding. */
  const selectSubtractRef = useRef(false);
  const boxAnchorRef = useRef<HitCell | null>(null);
  const lastHoverCellRef = useRef<HitCell | null>(null);
  /** Double-RMB on empty space clears selection. */
  const lastEmptyRmbMsRef = useRef(0);
  const variantMode = session.mode === "placementVariant";
  const sessionKey =
    session.mode === "placementVariant"
      ? `${session.placementId}:${session.sourceModelId}`
      : "library";

  const initialId = resolveInitialVoxelId(
    modelId,
    pack,
    variantMode,
    session.mode === "placementVariant" ? session.sourceModelId : undefined,
  );

  const [activeId, setActiveId] = useState(initialId);
  const [activeObjectId, setActiveObjectId] = useState<string>("obj0");
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([
    "obj0",
  ]);
  const objectSelectionAnchorRef = useRef<string | null>(null);
  const [libLoadId, setLibLoadId] = useState("");
  const [animPlayhead, setAnimPlayhead] = useState(0);
  const [animPlaying, setAnimPlaying] = useState(false);
  const [animClipId, setAnimClipId] = useState<string | null>(null);
  const [selectedJointId, setSelectedJointId] = useState<string | null>(null);
  const [hingePickStep, setHingePickStep] = useState<"parent" | "child" | null>(
    null,
  );
  /** Single flag for hinge UI / picking — cancel always clears this. */
  const [hingeActive, setHingeActive] = useState(false);
  const [hingeAxis, setHingeAxis] = useState<EmberVoxelJointAxis>("x");
  const [characterCardView, setCharacterCardView] =
    useState<EmberCharacterCardView>("front");
  const [hingeParentId, setHingeParentId] = useState<string | null>(null);
  const [hingeChildId, setHingeChildId] = useState<string | null>(null);
  const [keyAngleDeg, setKeyAngleDeg] = useState(0);
  const hingeDraftRef = useRef<{
    parentObjectId: string;
    parentPivot: { x: number; y: number; z: number };
  } | null>(null);
  const hingePickStepRef = useRef<"parent" | "child" | null>(null);
  const hingeActiveRef = useRef(false);
  const hingeParentIdRef = useRef<string | null>(null);
  const hingeChildIdRef = useRef<string | null>(null);
  const hingeAxisRef = useRef<EmberVoxelJointAxis>("x");
  const onHingeCellPickRef = useRef<(cell: HitCell) => void>(() => {});
  const setJointAngleDegRef = useRef<(deg: number) => void>(() => {});
  const keyAngleDegRef = useRef(0);
  const selectedJointIdRef = useRef<string | null>(null);
  const activeSceneRef = useRef<EmberVoxelScene | null>(null);
  const prevSceneIdForAnimRef = useRef<string | null>(null);
  const activeObjectIdRef = useRef(activeObjectId);
  const [envVoxelMult, setEnvVoxelMult] = useState<EmberEnvVoxelMult>(() =>
    getEmberEnvMapVoxelMult(),
  );
  const [showVoxelGrid, setShowVoxelGrid] = useState(loadShowVoxelGrid);
  const [showPlayerCapsule, setShowPlayerCapsule] = useState(
    loadShowPlayerCapsule,
  );
  const [showPreviewEmissiveLight, setShowPreviewEmissiveLight] = useState(
    loadShowPreviewEmissiveLight,
  );
  const [shineColorKeep, setShineColorKeepState] = useState(() =>
    getShineColorKeep(),
  );

  const voxelScenes = useMemo(
    () => ensureVoxelScenes(pack.voxelModels ?? {}, pack.voxelScenes),
    [pack.voxelModels, pack.voxelScenes],
  );
  const activeScene: EmberVoxelScene | null = activeId
    ? voxelScenes[activeId] ?? null
    : null;
  const activeObject =
    activeScene?.objects.find((o) => o.id === activeObjectId) ??
    activeScene?.objects[0] ??
    null;
  const selectedSceneObjectIds = useMemo(() => {
    if (!activeScene) return [];
    const existing = new Set(activeScene.objects.map((object) => object.id));
    const valid = selectedObjectIds.filter((id) => existing.has(id));
    if (activeObject && !valid.includes(activeObject.id)) {
      return [activeObject.id];
    }
    return valid.length ? valid : activeObject ? [activeObject.id] : [];
  }, [activeObject, activeScene, selectedObjectIds]);
  const canRotateSelectedSceneObjects = useMemo(
    () =>
      activeScene
        ? canRotateVoxelSceneSelection(activeScene, selectedSceneObjectIds)
        : false,
    [activeScene, selectedSceneObjectIds],
  );
  const selectedSceneObjectIdsRef = useRef<readonly string[]>([]);
  selectedSceneObjectIdsRef.current = selectedSceneObjectIds;
  activeSceneRef.current = activeScene;
  activeObjectIdRef.current = activeObject?.id ?? activeObjectId;
  hingePickStepRef.current = hingePickStep;
  hingeActiveRef.current = hingeActive;
  hingeParentIdRef.current = hingeParentId;
  hingeChildIdRef.current = hingeChildId;
  hingeAxisRef.current = hingeAxis;
  keyAngleDegRef.current = keyAngleDeg;
  selectedJointIdRef.current = selectedJointId;
  setJointAngleDegRef.current = (deg: number) => {
    setAnimPlaying(false);
    setKeyAngleDeg(deg);
  };

  const scenesList = useMemo(
    () =>
      Object.values(voxelScenes).sort((a, b) =>
        (a.nameRu || a.id).localeCompare(b.nameRu || b.id, "ru"),
      ),
    [voxelScenes],
  );

  const [draft, setDraft] = useState<EmberVoxelModel | null>(() => {
    if (session.mode === "placementVariant") {
      const src = pack.voxelModels[session.sourceModelId];
      if (!src) return null;
      const base = src.nameRu?.trim() || src.id;
      return cloneVoxelModel(
        src,
        `_variant_${session.placementId}`,
        `${base} · вариант`,
      );
    }
    const scenes = ensureVoxelScenes(pack.voxelModels, pack.voxelScenes);
    const sc = initialId ? scenes[initialId] : undefined;
    const mid = sc?.objects[0]?.modelId ?? initialId;
    const m = mid ? pack.voxelModels[mid] : undefined;
    return m ? normalizeVoxelModel(m) : null;
  });
  const [pickerQuery, setPickerQuery] = useState("");
  const [tagsDraft, setTagsDraft] = useState("");
  const [browsePicker, setBrowsePicker] = useState(false);
  useEffect(() => {
    setTagsDraft(formatEmberLibraryTags(draft?.tags));
  }, [draft?.id, draft?.tags]);
  const showOpenPicker =
    !variantMode &&
    !onClose &&
    Object.keys(pack.voxelModels).length > 0 &&
    (browsePicker || !activeId);
  const [tool, setTool] = useState<SculptTool>("add");
  const [workspaceMode, setWorkspaceMode] = useState<VoxelWorkspaceMode>(() => {
    try {
      const saved = sessionStorage.getItem("ember-voxel-workspace");
      return VOXEL_WORKSPACES.some((item) => item.id === saved)
        ? (saved as VoxelWorkspaceMode)
        : "sculpt";
    } catch {
      return "sculpt";
    }
  });
  const [sceneTransformMode, setSceneTransformMode] =
    useState<SceneTransformMode>("translate");
  const [showToolsPanel, setShowToolsPanel] = useState(true);
  const [showScenePanel, setShowScenePanel] = useState(true);
  const [shapeBrush, setShapeBrush] = useState<VoxelShapeBrush>("voxel");
  const [selectMode, setSelectMode] = useState<SelectMode>("box");
  /** Select deleted / air cells instead of solid groups. */
  const [selectEmpty, setSelectEmpty] = useState(false);
  const [mirrorAxes, setMirrorAxes] =
    useState<VoxelMirrorAxes>(VOXEL_MIRROR_OFF);
  const [selection, setSelection] = useState<VoxelSelectionSet | null>(null);
  const [paletteIndex, setPaletteIndex] = useState(1);
  const [emitAmount, setEmitAmount] = useState(180);
  const [shineAmount, setShineAmount] = useState(180);
  const [transparencyAmount, setTransparencyAmount] = useState(160);
  const [transmittanceAmount, setTransmittanceAmount] = useState(255);
  const [inspectTarget, setInspectTarget] = useState<InspectTarget | null>(
    null,
  );
  const [pickingLightOrigin, setPickingLightOrigin] = useState(false);
  const pickingLightOriginRef = useRef(false);
  pickingLightOriginRef.current = pickingLightOrigin;
  const [activeLampId, setActiveLampId] = useState<string | null>(null);
  const activeLampIdRef = useRef<string | null>(null);
  activeLampIdRef.current = activeLampId;
  const [hoverLabel, setHoverLabel] = useState("—");
  const [saving, setSaving] = useState(false);
  const [histTick, setHistTick] = useState(0);
  const [autoSave, setAutoSave] = useState(() => {
    try {
      return sessionStorage.getItem("ember-voxel-autosave") !== "0";
    } catch {
      return true;
    }
  });
  const [sculptMenu, setSculptMenu] = useState<SculptBarMenuId | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveGenRef = useRef(0);
  const histPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const histPendingModelRef = useRef<EmberVoxelModel | null>(null);
  const pendingVoxelAutosaveRef = useRef<{
    normalized: EmberVoxelModel;
    json: string;
  } | null>(null);
  const flushVoxelAutosaveRef = useRef<() => void>(() => {});
  const lastSavedJsonRef = useRef<string>("");
  const skipPackSyncRef = useRef(false);
  const packRef = useRef(pack);
  packRef.current = pack;
  const voxelScenesRef = useRef(voxelScenes);
  voxelScenesRef.current = voxelScenes;
  const onPackChangeRef = useRef(onPackChange);
  onPackChangeRef.current = onPackChange;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const commitSceneRef = useRef<
    (nextScene: EmberVoxelScene, modelsExtra?: Record<string, EmberVoxelModel>) => void
  >(() => {});
  const cancelHingeRef = useRef<() => void>(() => {});
  const clearHingeRef = useRef<() => void>(() => {});

  draftRef.current = draft;
  toolRef.current = tool;
  shapeBrushRef.current = shapeBrush;
  paletteRef.current = paletteIndex;

  useEffect(() => {
    onShapeCancelRef.current();
  }, [tool, shapeBrush]);
  useEffect(() => {
    if (!WORKSPACE_TOOLS[workspaceMode].includes(tool)) {
      setWorkspaceMode(preferredWorkspaceForTool(tool));
    }
  }, [tool, workspaceMode]);
  useEffect(() => {
    try {
      sessionStorage.setItem("ember-voxel-workspace", workspaceMode);
    } catch {
      // The editor remains fully usable when session storage is unavailable.
    }
  }, [workspaceMode]);
  emitRef.current = emitAmount;
  shineRef.current = shineAmount;
  transparencyRef.current = transparencyAmount;
  transmittanceRef.current = transmittanceAmount;
  selectModeRef.current = selectMode;
  selectEmptyRef.current = selectEmpty;
  mirrorAxesRef.current = mirrorAxes;
  selectionRef.current = selection;
  setSelectionRef.current = setSelection;

  const histStorageKey = (id: string) => `ember-voxel-hist:${id}`;

  const flushHistSession = useCallback(() => {
    const model = histPendingModelRef.current ?? draftRef.current;
    histPendingModelRef.current = null;
    if (histPersistTimerRef.current) {
      clearTimeout(histPersistTimerRef.current);
      histPersistTimerRef.current = null;
    }
    if (!model) return;
    const serializable = (entry: VoxelHistEntry) => ({
      model: restoreVoxelSnapshot(entry.snapshot),
      selection: cloneVoxelSelectionSet(entry.selection),
    });
    const payload = {
      version: 2,
      // Recovery is deliberately compact. Full interactive history remains in
      // RAM as Uint8Array snapshots; only a few recent steps cross storage.
      undo: undoStackRef.current.slice(-2).map(serializable),
      redo: redoStackRef.current.slice(-1).map(serializable),
      draft: model,
      selection: cloneVoxelSelectionSet(selectionRef.current),
    };
    try {
      sessionStorage.setItem(
        histStorageKey(model.id),
        JSON.stringify(payload),
      );
    } catch {
      // A large model may still exceed a constrained storage quota. Preserve
      // the draft first; undo history is an optional recovery convenience.
      try {
        sessionStorage.setItem(
          histStorageKey(model.id),
          JSON.stringify({
            version: 2,
            undo: [],
            redo: [],
            draft: model,
            selection: cloneVoxelSelectionSet(selectionRef.current),
          }),
        );
      } catch {
        onSavedRef.current?.("Session recovery недоступен: quota хранилища");
      }
    }
  }, []);

  const persistHistSession = useCallback((model: EmberVoxelModel | null) => {
    if (!model) return;
    histPendingModelRef.current = model;
    if (histPersistTimerRef.current) clearTimeout(histPersistTimerRef.current);
    histPersistTimerRef.current = setTimeout(flushHistSession, 450);
  }, [flushHistSession]);

  const parseHistEntry = (raw: unknown): VoxelHistEntry | null => {
    if (!raw || typeof raw !== "object") return null;
    const rec = raw as {
      model?: EmberVoxelModel;
      selection?: VoxelSelectionSet | null;
      id?: string;
      voxels?: number[];
    };
    // New format: { model, selection }
    if (rec.model && Array.isArray(rec.model.voxels)) {
      return {
        snapshot: captureVoxelSnapshot(normalizeVoxelModel(rec.model)),
        selection: cloneVoxelSelectionSet(rec.selection),
      };
    }
    // Legacy: bare EmberVoxelModel
    if (typeof rec.id === "string" && Array.isArray(rec.voxels)) {
      return {
        snapshot: captureVoxelSnapshot(
          normalizeVoxelModel(raw as EmberVoxelModel),
        ),
        selection: null,
      };
    }
    return null;
  };

  const restoreHistSession = useCallback((id: string): boolean => {
    try {
      const raw = sessionStorage.getItem(histStorageKey(id));
      if (!raw) return false;
      const parsed = JSON.parse(raw) as {
        undo?: unknown[];
        redo?: unknown[];
        draft?: EmberVoxelModel;
        selection?: VoxelSelectionSet | null;
      };
      if (!parsed.draft || parsed.draft.id !== id) return false;
      undoStackRef.current = (parsed.undo ?? [])
        .map(parseHistEntry)
        .filter((e): e is VoxelHistEntry => Boolean(e));
      redoStackRef.current = (parsed.redo ?? [])
        .map(parseHistEntry)
        .filter((e): e is VoxelHistEntry => Boolean(e));
      setDraft(normalizeVoxelModel(parsed.draft));
      setSelection(cloneVoxelSelectionSet(parsed.selection));
      setHistTick((n) => n + 1);
      return true;
    } catch {
      return false;
    }
  }, []);

  const resetHistory = () => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    editSnapRef.current = false;
    setHistTick((n) => n + 1);
  };

  const pushHistSnapshot = () => {
    if (!draftRef.current) return;
    undoStackRef.current.push({
      snapshot: captureVoxelSnapshot(draftRef.current),
      selection: cloneVoxelSelectionSet(selectionRef.current),
    });
    const limit = voxelHistoryLimit(draftRef.current);
    while (undoStackRef.current.length > limit) undoStackRef.current.shift();
    redoStackRef.current = [];
    setHistTick((n) => n + 1);
  };

  beginEditRef.current = () => {
    if (editSnapRef.current || !draftRef.current) return;
    editSnapRef.current = true;
    pushHistSnapshot();
  };

  const persistHistNowRef = useRef<() => void>(() => {});
  persistHistNowRef.current = () => {
    if (draftRef.current) persistHistSession(draftRef.current);
  };

  onPickColorRef.current = (pi: number) => {
    if (pi <= 0) return;
    setPaletteIndex(pi);
    setTool("paint");
  };

  onPickLightOriginRef.current = (cell: HitCell) => {
    const d = draftRef.current;
    if (!d) return;
    beginEditRef.current();
    const lamps = listVoxelEmissiveLamps(d);
    const lampId = activeLampIdRef.current ?? lamps[0]?.id;
    const origin = { x: cell.x, y: cell.y, z: cell.z };
    setDraft(
      lampId
        ? patchVoxelEmissiveLamp(d, lampId, { origin })
        : {
            ...d,
            emissiveCastsLight: true,
            emissiveLightOrigin: origin,
          },
    );
    setPickingLightOrigin(false);
    onSaved?.(
      `Источник света: ${cell.x}, ${cell.y}, ${cell.z}`,
    );
  };

  onMoveLightOffsetRef.current = (offset) => {
    const d = draftRef.current;
    if (!d) return;
    beginEditRef.current();
    const lamps = listVoxelEmissiveLamps(d);
    const lampId = activeLampIdRef.current ?? lamps[0]?.id;
    const normalized = normalizeVoxelLightOffset(offset);
    setDraft(
      lampId
        ? patchVoxelEmissiveLamp(d, lampId, { offset: normalized })
        : {
            ...d,
            emissiveCastsLight: true,
            emissiveLightOffset: normalized,
          },
    );
  };

  onInspectRef.current = (payload: {
    objectId: string | null;
    cell: HitCell;
  }) => {
    const scene = activeSceneRef.current;
    const objectId =
      payload.objectId ??
      activeObjectIdRef.current ??
      scene?.objects[0]?.id ??
      "";
    if (!objectId) return;
    const obj = scene?.objects.find((o) => o.id === objectId);
    const modelId = obj?.modelId ?? draftRef.current?.id ?? "";
    if (!modelId) return;
    if (objectId !== activeObjectIdRef.current) {
      setSelectedObjectIds([objectId]);
      objectSelectionAnchorRef.current = objectId;
      setActiveObjectId(objectId);
    }
    setInspectTarget({ objectId, modelId, cell: payload.cell });
  };

  onActivateObjectRef.current = (objectId: string) => {
    if (!objectId) return;
    setSelectedObjectIds([objectId]);
    objectSelectionAnchorRef.current = objectId;
    if (objectId !== activeObjectIdRef.current) setActiveObjectId(objectId);
  };

  onSceneMoveCommitRef.current = (delta) => {
    const scene = activeSceneRef.current;
    const objectIds = selectedSceneObjectIdsRef.current;
    if (!scene || !objectIds.length) return;
    const next = translateVoxelSceneSelection(scene, objectIds, delta);
    if (next === scene) return;
    commitSceneRef.current(next);
    onSavedRef.current?.(
      objectIds.length === 1
        ? `Объект сдвинут: ${delta.x}, ${delta.y}, ${delta.z}`
        : `Группа сдвинута (${objectIds.length}): ${delta.x}, ${delta.y}, ${delta.z}`,
    );
  };
  onSceneMoveCancelRef.current = () => {};
  onSceneRotateCommitRef.current = (quarterTurns) => {
    const scene = activeSceneRef.current;
    const objectIds = selectedSceneObjectIdsRef.current;
    if (!scene || !objectIds.length) return;
    const next = rotateVoxelSceneSelectionY(scene, objectIds, quarterTurns);
    if (next === scene) return;
    commitSceneRef.current(next);
    onSavedRef.current?.(
      objectIds.length === 1
        ? `Объект повёрнут: ${quarterTurns * 90}°`
        : `Группа повёрнута (${objectIds.length}): ${quarterTurns * 90}°`,
    );
  };
  onSceneRotateCancelRef.current = () => {};

  // Sync external modelId (library / tab) into active scene.
  useEffect(() => {
    if (variantMode) return;
    if (!modelId) return;
    const scenes = ensureVoxelScenes(pack.voxelModels, pack.voxelScenes);
    if (scenes[modelId]) {
      setActiveId(modelId);
      setLibLoadId(modelId);
      markEditorOpened("voxel", modelId);
      return;
    }
    if (pack.voxelModels[modelId]) {
      const hit = Object.values(scenes).find((s) =>
        s.objects.some((o) => o.modelId === modelId),
      );
      const sid = hit?.id ?? modelId;
      setActiveId(sid);
      setLibLoadId(modelId);
      if (hit) {
        const obj = hit.objects.find((o) => o.modelId === modelId);
        if (obj) setActiveObjectId(obj.id);
      }
      markEditorOpened("voxel", sid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: modelId prop only
  }, [modelId, variantMode]);

  // Keep parent focus + session last-opened in sync with local scene.
  useEffect(() => {
    if (variantMode) return;
    if (!activeId) return;
    markEditorOpened("voxel", activeId);
    const mid =
      voxelScenes[activeId]?.objects.find((o) => o.id === activeObjectId)
        ?.modelId ??
      voxelScenes[activeId]?.objects[0]?.modelId ??
      activeId;
    onActiveModelChange?.(mid);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notify on scene/object
  }, [activeId, activeObjectId, variantMode]);

  // Library mode: load draft when switching scene / object.
  useEffect(() => {
    if (variantMode) return;
    const scene = activeId ? voxelScenes[activeId] : undefined;
    if (
      scene &&
      !scene.objects.some((o) => o.id === activeObjectId) &&
      scene.objects[0]
    ) {
      setActiveObjectId(scene.objects[0].id);
      return;
    }
    const obj =
      scene?.objects.find((o) => o.id === activeObjectId) ??
      scene?.objects[0];
    const slot = scene && obj ? characterSlotForObject(scene, obj.id) : undefined;
    const mid =
      scene && slot
        ? characterModelIdForSlotView(scene, slot, characterCardView) ??
          obj?.modelId
        : obj?.modelId;
    const m = mid ? pack.voxelModels[mid] : undefined;
    resetHistory();
    setSelection(null);
    setLibLoadId("");
    const sceneChanged = prevSceneIdForAnimRef.current !== (activeId ?? null);
    prevSceneIdForAnimRef.current = activeId ?? null;
    if (sceneChanged) {
      setAnimClipId(scene?.animations?.[0]?.id ?? null);
      setSelectedJointId(scene?.joints?.[0]?.id ?? null);
    }
    if (mid && restoreHistSession(mid)) {
      const saved = pack.voxelModels[mid];
      if (saved) {
        lastSavedJsonRef.current = JSON.stringify(normalizeVoxelModel(saved));
      }
      return;
    }
    const loaded = m ? fitVoxelPalette(normalizeVoxelModel(m)) : null;
    setDraft(loaded);
    lastSavedJsonRef.current = loaded ? JSON.stringify(loaded) : "";
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pack is initial source only
  }, [activeId, activeObjectId, characterCardView, variantMode, restoreHistSession]);

  // External pack updates for the active mesh (skip our own autosave echoes).
  useEffect(() => {
    if (variantMode) return;
    if (skipPackSyncRef.current) {
      skipPackSyncRef.current = false;
      return;
    }
    const mid = activeObject?.modelId;
    if (!mid) return;
    const m = pack.voxelModels[mid];
    if (!m) return;
    const json = JSON.stringify(normalizeVoxelModel(m));
    if (json === lastSavedJsonRef.current) return;
    if (draftRef.current?.id === mid) {
      const local = JSON.stringify(normalizeVoxelModel(draftRef.current));
      if (local !== lastSavedJsonRef.current && local !== json) {
        return;
      }
    }
    lastSavedJsonRef.current = json;
    setDraft(fitVoxelPalette(normalizeVoxelModel(m)));
  }, [pack.voxelModels, activeObject?.modelId, variantMode]);

  // Placement variant: clone source into an isolated draft (don't mutate shared).
  useEffect(() => {
    if (session.mode !== "placementVariant") return;
    const src = pack.voxelModels[session.sourceModelId];
    resetHistory();
    setSelection(null);
    if (!src) {
      setDraft(null);
      return;
    }
    const base = src.nameRu?.trim() || src.id;
    setActiveId(session.sourceModelId);
    setLibLoadId(session.sourceModelId);
    setDraft(
      cloneVoxelModel(
        src,
        `_variant_${session.placementId}`,
        `${base} · вариант`,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-init on session key
  }, [sessionKey, variantMode]);

  const models = useMemo(
    () => Object.values(pack.voxelModels ?? {}),
    [pack.voxelModels],
  );
  const paletteUsage = useMemo(
    () => (draft ? countVoxelPaletteUsage(draft) : []),
    [draft],
  );

  useEffect(() => {
    if (!draft) return;
    const last = draft.palette.length - 1;
    if (paletteIndex > last) setPaletteIndex(Math.max(1, last));
  }, [draft, paletteIndex]);

  useEffect(() => {
    if (!draft || draft.palette.length < 128) return;
    const next = fitVoxelPalette(draft);
    if (next.palette.length === draft.palette.length) return;
    setDraft(next);
  }, [draft]);

  const libraryReferenceCounts = useMemo(
    () =>
      buildLibraryReferenceCountIndex({
        ...pack,
        voxelScenes,
      }),
    [pack, voxelScenes],
  );

  const pickerItems = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const list = models
      .slice()
      .sort((a, b) =>
        (a.nameRu || a.id).localeCompare(b.nameRu || b.id, "ru"),
      )
      .filter((m) => libraryAssetMatchesQuery(m, q));
    return list.map((m) => {
      const g = voxelGridSize(m);
      const solids = m.voxels.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
      const scene = voxelScenes[m.id];
      const useScene = scene != null && scene.objects.length > 1;
      const usage = libraryReferenceCounts.voxel.get(m.id) ?? 0;
      return {
        id: m.id,
        label: m.nameRu?.trim() || m.id,
        title: [
          m.nameRu?.trim() || m.id,
          m.id,
          ...(m.tags ?? []),
          formatVoxelShardLabel(
            pack.voxelLibraryFiles?.[m.id] ??
              assignVoxelShard(m.id, pack.voxelLibraryFiles ?? {}),
          ),
          usage ? `${usage} на картах` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        badges: [`${g.sx}×${g.sy}×${g.sz}`, `${solids} вкс`],
        thumb: useScene ? (
          <EmberVoxelSceneThumb
            scene={scene}
            models={pack.voxelModels ?? {}}
            size={88}
          />
        ) : (
          <EmberVoxelThumb model={m} size={88} />
        ),
      };
    });
  }, [models, pickerQuery, voxelScenes, pack, libraryReferenceCounts]);

  // Persistent Three scene.
  useEffect(() => {
    const host = hostRef.current;
    const axesHost = axesHostRef.current;
    if (!host || !axesHost) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x140e0c);
    scene.environment = getEmberEnvMap();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 800);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    host.innerHTML = "";
    host.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    scene.add(new THREE.HemisphereLight(0xffe0c0, 0x203040, 0.5));
    const key = new THREE.DirectionalLight(0xffe8d0, 0.75);
    key.position.set(6, 10, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0008;
    key.shadow.normalBias = 0.06;
    key.shadow.radius = 0;
    const keyCam = key.shadow.camera;
    keyCam.near = 0.5;
    keyCam.far = 48;
    keyCam.left = -28;
    keyCam.right = 28;
    keyCam.top = 28;
    keyCam.bottom = -28;
    keyCam.updateProjectionMatrix();
    scene.add(key);

    const meshRoot = new THREE.Group();
    scene.add(meshRoot);
    const peerRoot = new THREE.Group();
    peerRoot.name = "vox-peers";
    scene.add(peerRoot);
    const peerHoverBox = new THREE.BoxHelper(peerRoot, 0xf0c060);
    peerHoverBox.visible = false;
    peerHoverBox.raycast = () => {};
    scene.add(peerHoverBox);
    let lastPeerHop = { id: "", t: 0 };

    const hover = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 1.02, 1.02),
      new THREE.MeshBasicMaterial({
        color: 0x60e080,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
    );
    hover.visible = false;
    const editOverlayRoot = new THREE.Group();
    editOverlayRoot.name = "vox-edit-overlay";
    scene.add(editOverlayRoot);
    editOverlayRoot.add(hover);

    const vertexHover = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 10),
      new THREE.MeshBasicMaterial({
        color: 0xe080c0,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      }),
    );
    vertexHover.visible = false;
    vertexHover.renderOrder = 10;
    vertexHover.raycast = () => {};
    scene.add(vertexHover);

    const lightTranslateGizmo = createVoxelTranslateGizmo();
    editOverlayRoot.add(lightTranslateGizmo.root);
    const lightDrag = {
      active: false,
      axis: "center" as TranslateGizmoHit,
      /** Resolved light pos when the drag started. */
      startPos: new THREE.Vector3(),
      /** Base (origin/centroid) without offset — offset = pos − base. */
      basePos: new THREE.Vector3(),
    };

    const selTranslateGizmo = createVoxelTranslateGizmo();
    editOverlayRoot.add(selTranslateGizmo.root);
    const selMoveDrag = {
      active: false,
      axis: "center" as TranslateGizmoHit,
      startCenter: new THREE.Vector3(),
      lastDelta: { x: 0, y: 0, z: 0 },
    };

    const sceneObjectTranslateGizmo = createVoxelTranslateGizmo();
    scene.add(sceneObjectTranslateGizmo.root);
    const sceneObjectRotateGizmo = createHingeGizmo();
    sceneObjectRotateGizmo.root.name = "vox-scene-rotate-gizmo";
    scene.add(sceneObjectRotateGizmo.root);
    let sceneObjectMoveIds = new Set<string>();
    const sceneMoveDrag = {
      active: false,
      axis: "center" as TranslateGizmoHit,
      startPivot: new THREE.Vector3(),
      lastDelta: { x: 0, y: 0, z: 0 },
      nodes: [] as Array<{ node: THREE.Object3D; position: THREE.Vector3 }>,
    };
    const sceneRotateDrag = {
      active: false,
      startPlaneAngle: 0,
      lastQuarterTurns: 0,
      pivot: new THREE.Vector3(),
      nodes: [] as Array<{
        node: THREE.Object3D;
        position: THREE.Vector3;
        quaternion: THREE.Quaternion;
      }>,
    };

    const previewLights: THREE.PointLight[] = [];
    const extraLampRoot = new THREE.Group();
    extraLampRoot.name = "extraLampMarkers";
    editOverlayRoot.add(extraLampRoot);
    const extraLampGeom = new THREE.SphereGeometry(0.2, 8, 6);
    const extraLampMat = new THREE.MeshBasicMaterial({
      color: 0xffc070,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    });

    const configurePreviewLightShadow = (
      light: THREE.PointLight,
      distance: number,
      leak = 0,
      forceSoft = false,
    ) => {
      light.castShadow = true;
      light.shadow.mapSize.set(256, 256);
      light.shadow.bias = -0.0008;
      light.shadow.normalBias = 0.08;
      light.shadow.camera.near = 0.15;
      light.shadow.camera.far = Math.max(distance * 1.25, 8);
      light.shadow.camera.updateProjectionMatrix();
      const soft = voxelTransmittanceShadowParams(leak, forceSoft);
      light.shadow.radius = soft.radius;
      light.shadow.intensity = soft.intensity;
    };

    const ensurePreviewLights = (count: number): THREE.PointLight[] => {
      while (previewLights.length < count) {
        const light = new THREE.PointLight(
          0xffc060,
          0,
          12,
          packLampDiscDecay(0.32, 0.62),
        );
        light.visible = false;
        light.castShadow = false;
        scene.add(light);
        previewLights.push(light);
      }
      for (let i = 0; i < previewLights.length; i++) {
        const light = previewLights[i]!;
        if (i >= count) {
          light.visible = false;
          light.intensity = 0;
          light.castShadow = false;
        }
      }
      return previewLights.slice(0, count);
    };

    const bounds = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x2a2218,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    bounds.visible = false;
    bounds.name = "vox-bounds";
    editOverlayRoot.add(bounds);

    const selRoot = new THREE.Group();
    selRoot.name = "vox-sel";
    editOverlayRoot.add(selRoot);
    const selMat = new THREE.MeshBasicMaterial({
      // Magenta — contrasts yellow trim and brown body.
      color: 0xff2d7a,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const selEdgeMat = new THREE.LineBasicMaterial({
      // Cyan outline — readable on yellow voxels (unlike white/yellow).
      color: 0x00f6ff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    });

    const gridRoot = new THREE.Group();
    gridRoot.name = "vox-grid";
    editOverlayRoot.add(gridRoot);
    const gridMat = new THREE.LineBasicMaterial({
      color: 0xd8c8a0,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      // Slightly prefer drawing over the solid so seams read on faces.
      depthTest: true,
      toneMapped: false,
    });

    const mirrorRoot = new THREE.Group();
    mirrorRoot.name = "vox-mirror";
    editOverlayRoot.add(mirrorRoot);

    const playerCapsule = createPlayerCapsuleOverlay(
      DEFAULT_WORLD_BODY.radiusVoxels,
      DEFAULT_WORLD_BODY.heightVoxels,
    );
    playerCapsule.visible = false;
    playerCapsule.position.set(
      -DEFAULT_WORLD_BODY.radiusVoxels - 1.5,
      DEFAULT_WORLD_BODY.heightVoxels * 0.5,
      DEFAULT_WORLD_BODY.radiusVoxels,
    );
    editOverlayRoot.add(playerCapsule);

    const clearGridRoot = () => {
      while (gridRoot.children.length) {
        const c = gridRoot.children[0]!;
        gridRoot.remove(c);
        if (c instanceof THREE.LineSegments) {
          c.geometry.dispose();
        }
      }
    };

    const clearMirrorRoot = () => {
      while (mirrorRoot.children.length) {
        const c = mirrorRoot.children[0]!;
        mirrorRoot.remove(c);
        c.traverse((o) => {
          if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
            o.geometry.dispose();
            const m = o.material;
            if (Array.isArray(m)) m.forEach((x) => x.dispose());
            else m.dispose();
          }
        });
      }
    };

    const center = new THREE.Vector3();
    const panRight = new THREE.Vector3();
    const panUp = new THREE.Vector3();

    const axisGizmo = createVoxelAxisGizmo(axesHost, (axis) => {
      const next = viewAxisToSpherical(axis, api.yaw);
      api.yaw = next.yaw;
      api.pitch = next.pitch;
      api.applyCam();
      api.render();
    });

    const hingeGizmo = createHingeGizmo();
    scene.add(hingeGizmo.root);
    const hingeDrag = {
      active: false,
      startPlaneAngle: 0,
      startJointAngle: 0,
    };

    const snapLightCoord = (n: number, fine: boolean) => {
      const step = fine ? 0.25 : 0.05;
      return Math.round(n / step) * step;
    };

    const api: SceneApi = {
      camera,
      renderer,
      meshRoot,
      hover,
      bounds,
      center,
      yaw: Math.PI * 0.25,
      pitch: EDITOR_ISO_POLAR,
      dist: 48,
      render() {
        renderer.render(scene, camera);
        axisGizmo.syncFromCamera(camera);
        axisGizmo.render();
      },
      applyCam() {
        const phi = THREE.MathUtils.clamp(api.pitch, PITCH_MIN, PITCH_MAX);
        api.pitch = phi;
        const s = new THREE.Spherical(api.dist, phi, api.yaw);
        camera.position.setFromSpherical(s).add(center);
        camera.lookAt(center);
      },
      setMesh(group) {
        while (meshRoot.children.length) {
          const c = meshRoot.children[0]!;
          meshRoot.remove(c);
          disposeVoxelModelMesh(c);
        }
        meshRoot.add(group);
        renderer.shadowMap.needsUpdate = true;
        api.render();
      },
      previewPaletteColor(paletteIndex, hex) {
        previewVoxelPaletteColor(meshRoot, paletteIndex, hex);
        api.render();
      },
      setPeerMeshes(groups) {
        while (peerRoot.children.length) {
          const c = peerRoot.children[0]!;
          peerRoot.remove(c);
          disposeVoxelModelMesh(c);
        }
        peerHoverBox.visible = false;
        for (const g of groups) peerRoot.add(g);
        api.render();
      },
      setSelection(sel) {
        while (selRoot.children.length) {
          const c = selRoot.children[0]!;
          selRoot.remove(c);
          if (c instanceof THREE.Mesh || c instanceof THREE.LineSegments) {
            c.geometry.dispose();
          }
        }
        if (!sel?.length) {
          api.render();
          return;
        }
        // Many unit cells («умный»): exposed-face fill + silhouette, not a wire cage.
        const allUnit = sel.every(
          (b) => b.x0 === b.x1 && b.y0 === b.y1 && b.z0 === b.z1,
        );
        if (allUnit && sel.length > 1) {
          const { faces, edges } = buildSelectionCellOverlay(sel);
          if (faces.length) {
            const faceGeo = new THREE.BufferGeometry();
            faceGeo.setAttribute(
              "position",
              new THREE.Float32BufferAttribute(faces, 3),
            );
            const fill = new THREE.Mesh(faceGeo, selMat);
            fill.renderOrder = 4;
            fill.frustumCulled = false;
            selRoot.add(fill);
          }
          if (edges.length) {
            const edgeGeo = new THREE.BufferGeometry();
            edgeGeo.setAttribute(
              "position",
              new THREE.Float32BufferAttribute(edges, 3),
            );
            const outline = new THREE.LineSegments(edgeGeo, selEdgeMat);
            outline.renderOrder = 5;
            outline.frustumCulled = false;
            selRoot.add(outline);
          }
          api.render();
          return;
        }
        for (const box of sel) {
          const sx = box.x1 - box.x0 + 1;
          const sy = box.y1 - box.y0 + 1;
          const sz = box.z1 - box.z0 + 1;
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), selMat);
          mesh.position.set(
            box.x0 + sx * 0.5,
            box.y0 + sy * 0.5,
            box.z0 + sz * 0.5,
          );
          mesh.renderOrder = 4;
          selRoot.add(mesh);
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz)),
            selEdgeMat,
          );
          edges.position.copy(mesh.position);
          edges.renderOrder = 5;
          selRoot.add(edges);
        }
        api.render();
      },
      setVoxelGrid(model, visible) {
        clearGridRoot();
        if (!visible || !model) {
          api.render();
          return;
        }
        const positions = buildSolidVoxelGridPositions(model);
        if (positions.length < 6) {
          api.render();
          return;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3),
        );
        const lines = new THREE.LineSegments(geo, gridMat);
        lines.renderOrder = 4;
        lines.frustumCulled = false;
        gridRoot.add(lines);
        api.render();
      },
      setMirrorPlanes(model, mirror) {
        clearMirrorRoot();
        if (!model || !anyVoxelMirror(mirror)) {
          api.render();
          return;
        }
        const g = voxelGridSize(model);
        const addPlane = (
          w: number,
          h: number,
          color: number,
          pos: THREE.Vector3,
          rot: THREE.Euler,
        ) => {
          const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(w, h),
            new THREE.MeshBasicMaterial({
              color,
              transparent: true,
              opacity: 0.14,
              depthWrite: false,
              side: THREE.DoubleSide,
              toneMapped: false,
            }),
          );
          mesh.position.copy(pos);
          mesh.rotation.copy(rot);
          mesh.renderOrder = 1;
          mirrorRoot.add(mesh);
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)),
            new THREE.LineBasicMaterial({
              color,
              transparent: true,
              opacity: 0.55,
              depthWrite: false,
              toneMapped: false,
            }),
          );
          edges.position.copy(pos);
          edges.rotation.copy(rot);
          edges.renderOrder = 2;
          mirrorRoot.add(edges);
        };
        if (mirror.x) {
          addPlane(
            g.sz,
            g.sy,
            0xe05050,
            new THREE.Vector3(g.sx * 0.5, g.sy * 0.5, g.sz * 0.5),
            new THREE.Euler(0, Math.PI / 2, 0),
          );
        }
        if (mirror.y) {
          addPlane(
            g.sx,
            g.sz,
            0x50c060,
            new THREE.Vector3(g.sx * 0.5, g.sy * 0.5, g.sz * 0.5),
            new THREE.Euler(-Math.PI / 2, 0, 0),
          );
        }
        if (mirror.z) {
          addPlane(
            g.sx,
            g.sy,
            0x5090e0,
            new THREE.Vector3(g.sx * 0.5, g.sy * 0.5, g.sz * 0.5),
            new THREE.Euler(0, 0, 0),
          );
        }
        api.render();
      },
      setHingeGizmo(pose) {
        if (!pose) {
          hingeGizmo.setVisible(false);
          api.render();
          return;
        }
        hingeGizmo.setPose(pose.pos, pose.axis, pose.scale);
        hingeGizmo.setVisible(true);
        api.render();
      },
      setSelectionGizmo(pose) {
        if (!pose) {
          selTranslateGizmo.setVisible(false);
          api.render();
          return;
        }
        selTranslateGizmo.setPose(pose.pos, pose.scale);
        selTranslateGizmo.setVisible(true);
        api.render();
      },
      setSceneObjectGizmo(pose) {
        if (!pose) {
          sceneObjectMoveIds = new Set();
          sceneObjectTranslateGizmo.setVisible(false);
          sceneObjectRotateGizmo.setVisible(false);
          api.render();
          return;
        }
        sceneObjectMoveIds = new Set(pose.objectIds);
        if (pose.mode === "rotate") {
          sceneObjectTranslateGizmo.setVisible(false);
          sceneObjectRotateGizmo.setPose(pose.pos, "y", pose.scale);
          sceneObjectRotateGizmo.setVisible(true);
        } else {
          sceneObjectRotateGizmo.setVisible(false);
          sceneObjectTranslateGizmo.setPose(pose.pos, pose.scale);
          sceneObjectTranslateGizmo.setVisible(true);
        }
        api.render();
      },
      syncEditOverlays() {
        // Selection / hover / grid live in voxel-local space. Match the
        // content group so hinge pose (pivot + rotation) does not skew picks.
        meshRoot.updateMatrixWorld(true);
        const content = voxelContentRoot(meshRoot);
        if (content === meshRoot) {
          editOverlayRoot.position.set(0, 0, 0);
          editOverlayRoot.quaternion.identity();
          editOverlayRoot.scale.set(1, 1, 1);
        } else {
          content.updateWorldMatrix(true, false);
          content.matrixWorld.decompose(
            editOverlayRoot.position,
            editOverlayRoot.quaternion,
            editOverlayRoot.scale,
          );
        }
      },
      setLightOriginMarker(pos) {
        if (!pos) {
          lightTranslateGizmo.setVisible(false);
          api.render();
          return;
        }
        lightTranslateGizmo.setPose(pos, 1.15);
        lightTranslateGizmo.setVisible(true);
        api.render();
      },
      setLightOriginExtras(positions) {
        while (extraLampRoot.children.length) {
          extraLampRoot.remove(extraLampRoot.children[0]!);
        }
        for (const pos of positions) {
          const marker = new THREE.Mesh(extraLampGeom, extraLampMat);
          marker.position.set(pos.x, pos.y, pos.z);
          extraLampRoot.add(marker);
        }
        api.render();
      },
      setPreviewEmissiveLights(cfgs) {
        if (!cfgs || cfgs.length === 0) {
          ensurePreviewLights(0);
          renderer.shadowMap.needsUpdate = true;
          api.render();
          return;
        }
        const lights = ensurePreviewLights(
          Math.min(cfgs.length, VOXEL_EMISSIVE_LAMPS_MAX),
        );
        for (let i = 0; i < lights.length; i++) {
          const cfg = cfgs[i]!;
          const light = lights[i]!;
          light.visible = true;
          light.color.copy(cfg.color);
          light.intensity = Math.max(0, cfg.intensity);
          light.distance = Math.max(0.5, cfg.distance);
          light.position.set(cfg.pos.x, cfg.pos.y, cfg.pos.z);
          light.decay = packLampDiscDecay(
            0.32,
            0.62,
            cfg.softRings === true,
          );
          configurePreviewLightShadow(
            light,
            light.distance,
            cfg.transmittanceLeak ?? 0,
            cfg.softShadows === true,
          );
        }
        renderer.shadowMap.needsUpdate = true;
        api.render();
      },
      frameCamera() {
        // Fit the whole visible studio content (active mesh + scene peers).
        meshRoot.updateMatrixWorld(true);
        peerRoot.updateMatrixWorld(true);
        const box = new THREE.Box3();
        if (meshRoot.children.length > 0) box.expandByObject(meshRoot);
        if (peerRoot.children.length > 0) box.expandByObject(peerRoot);
        if (box.isEmpty()) {
          const draft = draftRef.current;
          if (!draft) return;
          const g = voxelGridSize(draft);
          box.set(
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(g.sx, g.sy, g.sz),
          );
        }
        box.getCenter(center);
        const size = box.getSize(new THREE.Vector3());
        const sx = Math.max(size.x, 1);
        const sy = Math.max(size.y, 1);
        const sz = Math.max(size.z, 1);
        const vFov = THREE.MathUtils.degToRad(camera.fov);
        const aspect = Math.max(0.25, camera.aspect || 1);
        const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * aspect);
        const fitVert = sy * 0.5 / Math.tan(vFov * 0.5);
        const fitHoriz =
          Math.max(sx, sz) * 0.5 / Math.tan(hFov * 0.5);
        const radius = 0.5 * Math.hypot(sx, sy, sz);
        const fitSphere = radius / Math.sin(vFov * 0.5);
        const fit = Math.max(fitVert, fitHoriz, fitSphere);
        // Push back so the object doesn't fill the viewport tightly.
        const PAD = 1.65;
        api.dist = THREE.MathUtils.clamp(fit * PAD, 22, 240);
        api.applyCam();
      },
      frameExploreCamera() {
        api.yaw = Math.PI * 0.25;
        api.pitch = EDITOR_ISO_POLAR;
        api.frameCamera();
      },
      setPlayerCapsule(opts) {
        resizePlayerCapsuleOverlay(playerCapsule, opts.radius, opts.height);
        playerCapsule.visible = opts.visible;
        playerCapsule.position.set(opts.x, opts.y, opts.z);
        api.render();
      },
      dispose() {
        /* filled after listeners attach */
      },
    };
    apiRef.current = api;
    api.applyCam();

    const el = renderer.domElement;

    const pointerRay = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
      );
      const ray = new THREE.Raycaster();
      // Slightly generous threshold so the thin ring is easy to grab.
      ray.params.Line = { threshold: 0.15 };
      ray.setFromCamera(ndc, camera);
      return ray;
    };

    const overlayLocalToWorld = (local: THREE.Vector3) => {
      editOverlayRoot.updateWorldMatrix(true, false);
      return local.clone().applyMatrix4(editOverlayRoot.matrixWorld);
    };
    const overlayWorldToLocal = (world: THREE.Vector3) => {
      editOverlayRoot.updateWorldMatrix(true, false);
      const inv = new THREE.Matrix4().copy(editOverlayRoot.matrixWorld).invert();
      return world.clone().applyMatrix4(inv);
    };

    const sceneObjectNodes = (): THREE.Object3D[] => {
      const candidates: THREE.Object3D[] = [meshRoot, ...peerRoot.children];
      return candidates.filter((node) => {
        const objectId = node.userData.sceneObjectId;
        return typeof objectId === "string" && sceneObjectMoveIds.has(objectId);
      });
    };

    const restoreSceneMovePreview = () => {
      for (const entry of sceneMoveDrag.nodes) {
        entry.node.position.copy(entry.position);
      }
      sceneMoveDrag.nodes = [];
      api.syncEditOverlays();
      api.render();
    };

    const beginSceneObjectMove = (axis: TranslateGizmoHit) => {
      sceneMoveDrag.active = true;
      sceneMoveDrag.axis = axis;
      sceneMoveDrag.startPivot.copy(sceneObjectTranslateGizmo.root.position);
      sceneMoveDrag.lastDelta = { x: 0, y: 0, z: 0 };
      sceneMoveDrag.nodes = sceneObjectNodes().map((node) => ({
        node,
        position: node.position.clone(),
      }));
      sceneObjectTranslateGizmo.setHighlight(axis);
      el.style.cursor = "grabbing";
    };

    const deltaFromSceneDragHit = (
      world: THREE.Vector3,
      step: number,
    ): HitCell => {
      const snap = (value: number) => Math.round(value / step) * step;
      const rawX = world.x - sceneMoveDrag.startPivot.x;
      const rawY = world.y - sceneMoveDrag.startPivot.y;
      const rawZ = world.z - sceneMoveDrag.startPivot.z;
      if (sceneMoveDrag.axis === "x") return { x: snap(rawX), y: 0, z: 0 };
      if (sceneMoveDrag.axis === "y") return { x: 0, y: snap(rawY), z: 0 };
      if (sceneMoveDrag.axis === "z") return { x: 0, y: 0, z: snap(rawZ) };
      return { x: snap(rawX), y: snap(rawY), z: snap(rawZ) };
    };

    const applySceneMoveDelta = (delta: HitCell) => {
      if (
        delta.x === sceneMoveDrag.lastDelta.x &&
        delta.y === sceneMoveDrag.lastDelta.y &&
        delta.z === sceneMoveDrag.lastDelta.z
      ) {
        return;
      }
      sceneMoveDrag.lastDelta = delta;
      for (const entry of sceneMoveDrag.nodes) {
        entry.node.position.set(
          entry.position.x + delta.x,
          entry.position.y + delta.y,
          entry.position.z + delta.z,
        );
      }
      sceneObjectTranslateGizmo.setPose(
        {
          x: sceneMoveDrag.startPivot.x + delta.x,
          y: sceneMoveDrag.startPivot.y + delta.y,
          z: sceneMoveDrag.startPivot.z + delta.z,
        },
        sceneObjectTranslateGizmo.root.scale.x,
      );
      api.syncEditOverlays();
      api.render();
    };

    const restoreSceneRotatePreview = () => {
      for (const entry of sceneRotateDrag.nodes) {
        entry.node.position.copy(entry.position);
        entry.node.quaternion.copy(entry.quaternion);
      }
      sceneRotateDrag.nodes = [];
      api.syncEditOverlays();
      api.render();
    };

    const beginSceneObjectRotate = (startPlaneAngle: number) => {
      sceneRotateDrag.active = true;
      sceneRotateDrag.startPlaneAngle = startPlaneAngle;
      sceneRotateDrag.lastQuarterTurns = 0;
      sceneRotateDrag.pivot.copy(sceneObjectRotateGizmo.root.position);
      sceneRotateDrag.nodes = sceneObjectNodes().map((node) => ({
        node,
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
      }));
      sceneObjectRotateGizmo.setHighlight(true);
      el.style.cursor = "grabbing";
    };

    const applySceneRotateTurns = (quarterTurns: number) => {
      if (quarterTurns === sceneRotateDrag.lastQuarterTurns) return;
      sceneRotateDrag.lastQuarterTurns = quarterTurns;
      const radians = quarterTurns * (Math.PI / 2);
      const yaw = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        radians,
      );
      for (const entry of sceneRotateDrag.nodes) {
        const relative = entry.position
          .clone()
          .sub(sceneRotateDrag.pivot)
          .applyQuaternion(yaw);
        entry.node.position.copy(sceneRotateDrag.pivot).add(relative);
        entry.node.quaternion.copy(yaw).multiply(entry.quaternion);
      }
      api.syncEditOverlays();
      api.render();
    };

    const beginSelMove = (
      axis: TranslateGizmoHit,
      startCenter: { x: number; y: number; z: number },
    ) => {
      selMoveDrag.active = true;
      selMoveDrag.axis = axis;
      selMoveDrag.startCenter.set(startCenter.x, startCenter.y, startCenter.z);
      selMoveDrag.lastDelta = { x: 0, y: 0, z: 0 };
      selTranslateGizmo.setHighlight(axis);
      const sel = selectionRef.current ?? [];
      selTranslateGizmo.setPose(startCenter, selectionGizmoScale(sel));
      el.style.cursor = "grabbing";
    };

    const deltaFromSelDragHit = (local: THREE.Vector3): HitCell => {
      const rawX = local.x - selMoveDrag.startCenter.x;
      const rawY = local.y - selMoveDrag.startCenter.y;
      const rawZ = local.z - selMoveDrag.startCenter.z;
      if (selMoveDrag.axis === "x") {
        return { x: Math.round(rawX), y: 0, z: 0 };
      }
      if (selMoveDrag.axis === "y") {
        return { x: 0, y: Math.round(rawY), z: 0 };
      }
      if (selMoveDrag.axis === "z") {
        return { x: 0, y: 0, z: Math.round(rawZ) };
      }
      return {
        x: Math.round(rawX),
        y: Math.round(rawY),
        z: Math.round(rawZ),
      };
    };

    const applySelMoveDelta = (delta: HitCell) => {
      if (
        delta.x === selMoveDrag.lastDelta.x &&
        delta.y === selMoveDrag.lastDelta.y &&
        delta.z === selMoveDrag.lastDelta.z
      ) {
        return;
      }
      const pose = onSelMovePreviewRef.current(delta);
      if (!pose) return;
      selMoveDrag.lastDelta = delta;
      selTranslateGizmo.setPose(pose.center, pose.scale);
      api.render();
    };

    const activeTool = (): SculptTool => {
      // Shift+select = multi-add, not erase.
      // Replace uses Shift to erase that palette index globally.
      if (
        shiftEraseRef.current &&
        toolRef.current !== "select" &&
        toolRef.current !== "replace"
      ) {
        return "erase";
      }
      return toolRef.current;
    };

    const clampCell = (cell: HitCell): HitCell | null => {
      const draft = draftRef.current;
      if (!draft) return null;
      const g = voxelGridSize(draft);
      if (
        cell.x < 0 ||
        cell.y < 0 ||
        cell.z < 0 ||
        cell.x >= g.sx ||
        cell.y >= g.sy ||
        cell.z >= g.sz
      ) {
        return null;
      }
      return cell;
    };

    const pick = (e: PointerEvent): HitCell | null => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      meshRoot.updateMatrixWorld(true);
      peerRoot.updateMatrixWorld(true);
      // Prefer solid mesh — full-grid bounds is larger and steals hits
      // after rows/columns were erased (looks like “outer” empty cells).
      const meshHits = ray.intersectObject(meshRoot, true);
      const wantEmpty =
        activeTool() === "select" && selectEmptyRef.current;
      if (meshHits[0] && !wantEmpty) {
        // Always pick into the solid for select/paint (not the air outside).
        const tool =
          activeTool() === "select" ||
          activeTool() === "pick" ||
          activeTool() === "inspect"
            ? "paint"
            : activeTool();
        return clampCell(cellFromHit(meshHits[0], meshRoot, tool));
      }
      if (meshHits[0] && wantEmpty) {
        // Step into air next to the face so deleted pockets can be picked.
        return clampCell(cellFromHit(meshHits[0], meshRoot, "add"));
      }
      // Bounds: box-select, or any select while targeting empty cells.
      if (
        activeTool() === "select" &&
        (selectModeRef.current === "box" || wantEmpty) &&
        bounds.visible
      ) {
        const boundHits = ray.intersectObject(bounds, true);
        if (boundHits[0]) {
          return clampCell(cellFromHit(boundHits[0], meshRoot, "paint"));
        }
      }
      return null;
    };

    const shapePlaneName = (axis: VoxelAxis): string => {
      switch (axis) {
        case "x":
          return "YZ";
        case "y":
          return "XZ";
        case "z":
          return "XY";
        default: {
          const _never: never = axis;
          return _never;
        }
      }
    };

    const shapeDepthName = (axis: VoxelAxis): string => {
      switch (axis) {
        case "x":
          return "глубина X";
        case "y":
          return "высота Y";
        case "z":
          return "глубина Z";
        default: {
          const _never: never = axis;
          return _never;
        }
      }
    };

    const pickSculptMeshHit = (e: PointerEvent): THREE.Intersection | null => {
      meshRoot.updateMatrixWorld(true);
      return pointerRay(e).intersectObject(meshRoot, true)[0] ?? null;
    };

    const pickShapeStart = (
      e: PointerEvent,
    ): { cell: HitCell; heightAxis: VoxelAxis } | null => {
      const hit = pickSculptMeshHit(e);
      const t = activeTool();
      const tool: SculptTool = t === "erase" ? "erase" : "add";
      if (!hit) {
        const cell = pick(e);
        return cell ? { cell, heightAxis: "y" } : null;
      }
      const cell = clampCell(cellFromHit(hit, meshRoot, tool));
      if (!cell) return null;
      const n = localHitNormal(hit, meshRoot);
      return {
        cell,
        heightAxis: dominantVoxelAxis({ x: n.x, y: n.y, z: n.z }),
      };
    };

    const beginShapeStroke = (
      kind: Exclude<VoxelShapeBrush, "voxel">,
      cell: HitCell,
      erase: boolean,
      e: PointerEvent,
      heightAxis: VoxelAxis,
    ) => {
      shapeDragRef.current = {
        kind,
        phase: "plane",
        start: cell,
        planeEnd: cell,
        end: cell,
        erase,
        heightAxis,
        heightAnchorClientY: e.clientY,
        heightAnchor: cell[heightAxis],
        heightRayBase: null,
      };
    };

    const previewShapeStroke = (
      drag: NonNullable<typeof shapeDragRef.current>,
    ) => {
      if (drag.kind === "box") {
        api.setSelection([normalizeVoxelSelection(drag.start, drag.end)]);
      } else {
        api.setSelection(
          cellsToUnitSelection(
            cellsForVoxelShape(drag.start, drag.end, drag.kind),
          ),
        );
      }
      const box = normalizeVoxelSelection(drag.start, drag.end);
      const w = box.x1 - box.x0 + 1;
      const h = box.y1 - box.y0 + 1;
      const d = box.z1 - box.z0 + 1;
      const name =
        drag.kind === "sphere"
          ? "сфера"
          : drag.kind === "box"
            ? "коробка"
            : "линия";
      if (drag.kind === "line") {
        setHoverLabel(`${name} ${w}×${h}×${d}`);
        return;
      }
      if (drag.phase === "height") {
        setHoverLabel(
          `${name} ${w}×${h}×${d} · ${shapeDepthName(drag.heightAxis)} · ЛКМ/Enter · ПКМ/Esc`,
        );
        return;
      }
      setHoverLabel(
        `${name} ${w}×${h}×${d} · плоскость ${shapePlaneName(drag.heightAxis)}`,
      );
    };

    const pickShapePlaneCell = (
      e: PointerEvent,
      start: HitCell,
      heightAxis: VoxelAxis,
    ): HitCell | null => {
      const draft = draftRef.current;
      if (!draft) return null;
      const g = voxelGridSize(draft);
      const local = localPointerRay(e);
      if (local) {
        const hit = intersectAxisAlignedPlane(
          local.origin,
          local.dir,
          heightAxis,
          start[heightAxis] + 0.5,
        );
        if (hit) {
          return cellFromShapePlaneHit(hit, start, heightAxis, g);
        }
      }
      const cell = pick(e);
      if (!cell) return { x: start.x, y: start.y, z: start.z };
      return cellFromShapePlaneHit(
        { x: cell.x + 0.5, y: cell.y + 0.5, z: cell.z + 0.5 },
        start,
        heightAxis,
        g,
      );
    };

    const sampleShapeHeightCoord = (
      e: PointerEvent,
      drag: NonNullable<typeof shapeDragRef.current>,
    ): number | null => {
      const local = localPointerRay(e);
      if (!local) return null;
      return intersectHeightAlongAxis(
        local.origin,
        local.dir,
        shapeFootprintCenter(drag.start, drag.planeEnd, drag.heightAxis),
        drag.heightAxis,
        local.camPos,
        local.camRight,
      );
    };

    const pickShapeHeightEnd = (
      e: PointerEvent,
      drag: NonNullable<typeof shapeDragRef.current>,
    ): HitCell => {
      const draft = draftRef.current;
      const g = draft ? voxelGridSize(draft) : { sx: 1, sy: 1, sz: 1 };
      const sampled = sampleShapeHeightCoord(e, drag);
      let h: number;
      if (sampled != null && drag.heightRayBase != null) {
        h = drag.start[drag.heightAxis] + (sampled - drag.heightRayBase);
      } else {
        h =
          drag.heightAnchor +
          Math.round((drag.heightAnchorClientY - e.clientY) / 10);
      }
      const max = gridExtentAlongAxis(g, drag.heightAxis);
      h = Math.max(0, Math.min(max - 1, h));
      return cellWithShapeHeight(drag.planeEnd, h, drag.heightAxis);
    };

    const localPointerRay = (e: PointerEvent) => {
      const ray = pointerRay(e);
      const space = voxelContentRoot(meshRoot);
      space.updateWorldMatrix(true, false);
      const inv = new THREE.Matrix4().copy(space.matrixWorld).invert();
      const origin = ray.ray.origin.clone().applyMatrix4(inv);
      const target = ray.ray.origin
        .clone()
        .add(ray.ray.direction)
        .applyMatrix4(inv);
      const dir = target.sub(origin);
      if (dir.lengthSq() < 1e-12) return null;
      dir.normalize();
      const camPos = camera.position.clone();
      space.worldToLocal(camPos);
      const camRight = new THREE.Vector3()
        .setFromMatrixColumn(camera.matrixWorld, 0)
        .transformDirection(inv)
        .normalize();
      return {
        origin: { x: origin.x, y: origin.y, z: origin.z },
        dir: { x: dir.x, y: dir.y, z: dir.z },
        camPos: { x: camPos.x, y: camPos.y, z: camPos.z },
        camRight: { x: camRight.x, y: camRight.y, z: camRight.z },
      };
    };

    const cancelShapeStroke = () => {
      if (!shapeDragRef.current) return;
      shapeDragRef.current = null;
      paintingRef.current = false;
      shiftEraseRef.current = false;
      api.setSelection(selectionRef.current);
      api.render();
    };

    const confirmShapeStroke = (): boolean => {
      const drag = shapeDragRef.current;
      if (!drag || !usesShapeHeightPhase(drag.kind)) return false;
      onShapeCommitRef.current(drag.start, drag.end, drag.erase);
      shapeDragRef.current = null;
      paintingRef.current = false;
      shiftEraseRef.current = false;
      api.setSelection(selectionRef.current);
      api.render();
      return true;
    };

    onShapeCancelRef.current = cancelShapeStroke;
    onShapeConfirmRef.current = confirmShapeStroke;

    /** Inspect: active mesh or any peer object in the scene. */
    const pickInspect = (
      e: PointerEvent,
    ): { objectId: string | null; cell: HitCell } | null => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      meshRoot.updateMatrixWorld(true);
      peerRoot.updateMatrixWorld(true);
      const hits = [
        ...ray.intersectObject(meshRoot, true),
        ...ray.intersectObject(peerRoot, true),
      ].sort((a, b) => a.distance - b.distance);
      const hit = hits[0];
      if (!hit) return null;
      let o: THREE.Object3D | null = hit.object;
      let peerId: string | null = null;
      while (o) {
        if (o.name.startsWith("peer-")) {
          peerId = o.name.slice("peer-".length);
          break;
        }
        o = o.parent;
      }
      if (peerId) {
        let wrap: THREE.Object3D | null = hit.object;
        while (wrap && !wrap.name.startsWith("peer-")) wrap = wrap.parent;
        if (!wrap) return null;
        const cell = cellFromHit(hit, wrap, "paint");
        return { objectId: peerId, cell };
      }
      const cell = clampCell(cellFromHit(hit, meshRoot, "paint"));
      return cell ? { objectId: null, cell } : null;
    };

    const hidePeerHover = () => {
      peerHoverBox.visible = false;
    };

    const peerLabel = (objectId: string): string => {
      const sc = activeSceneRef.current;
      if (!sc) return objectId;
      const slot = characterSlotForObject(sc, objectId);
      if (slot) return CHIBI32_SLOT_LABEL_RU[slot];
      const obj = sc.objects.find((o) => o.id === objectId);
      return obj?.nameRu?.trim() || obj?.modelId || objectId;
    };

    const highlightPeer = (objectId: string) => {
      const wrap = peerRoot.children.find((c) => c.name === `peer-${objectId}`);
      if (!wrap) {
        hidePeerHover();
        return;
      }
      hover.visible = false;
      vertexHover.visible = false;
      lastHoverCellRef.current = null;
      wrap.updateWorldMatrix(true, true);
      peerHoverBox.setFromObject(wrap);
      peerHoverBox.visible = true;
      setHoverLabel(peerLabel(objectId));
      api.render();
    };

    /** Hinge pivots snap to solid voxel corners (vertices), not cell centers. */
    const pickVertex = (e: PointerEvent): HitCell | null => {
      const draft = draftRef.current;
      if (!draft) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      meshRoot.updateMatrixWorld(true);
      const meshHits = ray.intersectObject(meshRoot, true);
      if (!meshHits[0]) return null;
      const content = voxelContentRoot(meshRoot);
      const local = content.worldToLocal(meshHits[0].point.clone());
      return snapToNearestVertex(draft, local);
    };

    const showHover = (cell: HitCell | null) => {
      const hingeMode = activeTool() === "hinge";
      hidePeerHover();
      if (!cell || !draftRef.current) {
        hover.visible = false;
        vertexHover.visible = false;
        lastHoverCellRef.current = null;
        setHoverLabel("—");
        api.render();
        return;
      }
      api.syncEditOverlays();
      if (hingeMode) {
        hover.visible = false;
        lastHoverCellRef.current = cell;
        const wp = new THREE.Vector3(cell.x, cell.y, cell.z);
        const content = voxelContentRoot(meshRoot);
        content.localToWorld(wp);
        vertexHover.position.copy(wp);
        vertexHover.visible = true;
        (vertexHover.material as THREE.MeshBasicMaterial).color.setHex(
          HOVER_COLOR.hinge,
        );
        setHoverLabel(`вершина ${cell.x}, ${cell.y}, ${cell.z}`);
        api.render();
        return;
      }
      vertexHover.visible = false;
      const g = voxelGridSize(draftRef.current);
      if (
        cell.x < 0 ||
        cell.y < 0 ||
        cell.z < 0 ||
        cell.x >= g.sx ||
        cell.y >= g.sy ||
        cell.z >= g.sz
      ) {
        hover.visible = false;
        lastHoverCellRef.current = null;
        setHoverLabel("вне сетки");
        api.render();
        return;
      }
      lastHoverCellRef.current = cell;
      const mat = hover.material as THREE.MeshBasicMaterial;
      mat.color.setHex(HOVER_COLOR[activeTool()]);
      // hover is parented under editOverlayRoot (= content pose).
      hover.position.set(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
      hover.visible = true;
      if (activeTool() === "replace") {
        const from = getVoxel(draftRef.current, cell.x, cell.y, cell.z);
        const to = shiftEraseRef.current ? 0 : paletteRef.current;
        setHoverLabel(
          from > 0
            ? `замена #${from} → ${to === 0 ? "пусто" : `#${to}`}`
            : `${cell.x}, ${cell.y}, ${cell.z}`,
        );
      } else {
        setHoverLabel(`${cell.x}, ${cell.y}, ${cell.z}`);
      }
      api.render();
    };

    const stroke = (e: PointerEvent, once: boolean) => {
      const t = activeTool();
      if (t === "hinge") {
        if (!hingeActiveRef.current || !hingePickStepRef.current) {
          hover.visible = false;
          vertexHover.visible = false;
          return;
        }
        const vert = pickVertex(e);
        showHover(vert);
        if (vert && once) onHingeCellPickRef.current(vert);
        return;
      }
      if (t === "inspect") {
        const hit = pickInspect(e);
        if (!hit) {
          showHover(null);
          return;
        }
        if (hit.objectId) {
          highlightPeer(hit.objectId);
        } else {
          showHover(hit.cell);
        }
        if (once) onInspectRef.current(hit);
        return;
      }
      const cell = pick(e);
      showHover(cell);
      if (!cell || !draftRef.current) return;
      if (t === "select") {
        if (once) beginEditRef.current();
        const mode = selectModeRef.current;
        const subtract = selectSubtractRef.current;
        const pickEmpty = selectEmptyRef.current;
        if (mode === "box") {
          let piece: VoxelSelection;
          if (once || !boxAnchorRef.current) {
            boxAnchorRef.current = cell;
            if (pickEmpty && once) {
              piece =
                selectionEmptyFlood(
                  draftRef.current,
                  cell.x,
                  cell.y,
                  cell.z,
                ) ?? normalizeVoxelSelection(cell, cell);
            } else {
              piece = normalizeVoxelSelection(cell, cell);
            }
            selectStrokeRef.current = [piece];
          } else {
            piece = normalizeVoxelSelection(boxAnchorRef.current, cell);
            selectStrokeRef.current = [piece];
          }
        } else if (mode === "linked") {
          // Click-once flood (same color / air); ignore drag.
          if (!once && selectStrokeRef.current.length) {
            return;
          }
          selectStrokeRef.current = selectionFromClick(
            draftRef.current,
            cell,
            mode,
            pickEmpty,
          );
        } else {
          const pieces = selectionFromClick(
            draftRef.current,
            cell,
            mode,
            pickEmpty,
          );
          for (const p of pieces) {
            selectStrokeRef.current = addSelectionBox(
              selectStrokeRef.current,
              p,
            );
          }
        }

        // Symmetry: expand stroke boxes across midplanes.
        if (
          selectStrokeRef.current.length &&
          anyVoxelMirror(mirrorAxesRef.current)
        ) {
          selectStrokeRef.current = expandSelectionWithMirror(
            draftRef.current,
            selectStrokeRef.current,
            mirrorAxesRef.current,
          );
        }

        let combined: VoxelSelectionSet;
        if (subtract) {
          combined = [...selectBaseRef.current];
          const remMode =
            mode === "box" ? "intersect" : "exact";
          for (const b of selectStrokeRef.current) {
            combined = removeSelectionBoxes(combined, b, remMode);
          }
        } else {
          combined = [];
          for (const b of selectBaseRef.current) {
            combined = addSelectionBox(combined, b);
          }
          for (const b of selectStrokeRef.current) {
            combined = addSelectionBox(combined, b);
          }
        }
        const next = combined.length ? combined : null;
        setSelectionRef.current(next);
        api.setSelection(next);
        return;
      }
      if (t === "pick") {
        const pi = getVoxel(draftRef.current, cell.x, cell.y, cell.z);
        onPickColorRef.current(pi);
        return;
      }
      if (t === "replace") {
        if (!once) return;
        const from = getVoxel(draftRef.current, cell.x, cell.y, cell.z);
        if (from <= 0) return;
        const to = shiftEraseRef.current ? 0 : paletteRef.current;
        beginEditRef.current();
        const next = replaceVoxelPaletteIndex(
          draftRef.current,
          from,
          to,
          selectionRef.current,
        );
        if (next !== draftRef.current) {
          draftRef.current = next;
          setDraft(next);
        }
        return;
      }
      // Fill is click-once (not a drag stroke).
      if (t === "fill" && !once) return;
      if (t === "move") return;
      const key = `${cell.x},${cell.y},${cell.z}:${t}`;
      if (lastCellRef.current === key || strokeCells.has(key)) return;
      lastCellRef.current = key;
      strokeCells.add(key);
      beginEditRef.current();
      const seeds = expandCellWithMirror(
        draftRef.current,
        cell,
        mirrorAxesRef.current,
      );
      let next = draftRef.current;
      for (const c of seeds) {
        next = applyTool(
          next,
          c,
          t,
          paletteRef.current,
          emitRef.current,
          shineRef.current,
          transparencyRef.current,
          transmittanceRef.current,
        );
      }
      if (next !== draftRef.current) {
        // Pointer events may arrive before React commits the previous state.
        // Keep the imperative ray/edit source current for the whole stroke.
        draftRef.current = next;
        setDraft(next);
      }
    };

    let activePointerId: number | null = null;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let paintDragStarted = false;
    const strokeCells = new Set<string>();
    const PAINT_DRAG_THRESHOLD_PX = 3;

    const onDown = (e: PointerEvent) => {
      const heightStroke = shapeDragRef.current;
      if (
        heightStroke &&
        usesShapeHeightPhase(heightStroke.kind) &&
        heightStroke.phase === "height"
      ) {
        if (e.button === 0 && !e.altKey) {
          e.preventDefault();
          confirmShapeStroke();
          return;
        }
        if (e.button === 2) {
          e.preventDefault();
          cancelShapeStroke();
          return;
        }
        return;
      }
      if (!e.isPrimary || activePointerId !== null) return;
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      activePointerId = e.pointerId;
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
      paintDragStarted = false;
      strokeCells.clear();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        activePointerId = null;
        return;
      }
      // Middle mouse — pan orbit target (camera center).
      if (e.button === 1) {
        e.preventDefault();
        panningRef.current = true;
        el.setPointerCapture(e.pointerId);
        el.style.cursor = "grabbing";
        return;
      }

      // Scene-object yaw gizmo. Rotation is snapped to quarter turns so the
      // persisted voxel offsets and `rot` stay on the integer grid.
      if (
        e.button === 0 &&
        !e.altKey &&
        sceneObjectRotateGizmo.root.visible
      ) {
        const ray = pointerRay(e);
        const handle = sceneObjectRotateGizmo.pick(ray);
        const point = handle
          ? sceneObjectRotateGizmo.intersectPlane(ray)
          : null;
        if (point) {
          e.preventDefault();
          beginSceneObjectRotate(
            sceneObjectRotateGizmo.planeAngleAt(point),
          );
          el.setPointerCapture(e.pointerId);
          api.render();
          return;
        }
      }

      // Scene-object translate gizmo. It lives in world voxel space, unlike
      // the sculpt-selection gizmo which follows the active mesh transform.
      if (
        e.button === 0 &&
        !e.altKey &&
        sceneObjectTranslateGizmo.root.visible
      ) {
        const hit = sceneObjectTranslateGizmo.pick(pointerRay(e));
        if (hit) {
          e.preventDefault();
          beginSceneObjectMove(hit);
          el.setPointerCapture(e.pointerId);
          api.render();
          return;
        }
      }

      // Voxel-selection translate gizmo (Blender-style grab).
      if (e.button === 0 && !e.altKey && selTranslateGizmo.root.visible) {
        const ray = pointerRay(e);
        const hit = selTranslateGizmo.pick(ray);
        if (hit) {
          e.preventDefault();
          const center = voxelSelectionCenter(selectionRef.current);
          if (center) {
            beginSelMove(hit, center);
            el.setPointerCapture(e.pointerId);
            api.render();
            return;
          }
        }
      }

      // Move tool: drag a selected solid (same as gizmo center).
      if (
        e.button === 0 &&
        !e.altKey &&
        toolRef.current === "move" &&
        selectionRef.current?.length
      ) {
        const cell = pick(e);
        if (cell && cellInVoxelSelection(selectionRef.current, cell)) {
          const center = voxelSelectionCenter(selectionRef.current);
          if (center) {
            e.preventDefault();
            beginSelMove("center", center);
            el.setPointerCapture(e.pointerId);
            api.render();
            return;
          }
        }
      }

      // Light-origin translate gizmo (PointLight center).
      if (
        e.button === 0 &&
        !e.altKey &&
        lightTranslateGizmo.root.visible &&
        !pickingLightOriginRef.current
      ) {
        const ray = pointerRay(e);
        const hit = lightTranslateGizmo.pick(ray);
        if (hit) {
          e.preventDefault();
          const draft = draftRef.current;
          const sum = draft ? summarizeVoxelEmissive(draft) : null;
          if (draft && sum) {
            const lamps = listVoxelEmissiveLamps(draft);
            const lamp =
              lamps.find((item) => item.id === activeLampIdRef.current) ??
              lamps[0]!;
            const origin = resolveVoxelLampOrigin(draft, lamp, sum);
            const base = resolveVoxelLampOrigin(
              draft,
              { ...lamp, offset: undefined },
              sum,
            );
            lightDrag.active = true;
            lightDrag.axis = hit;
            lightDrag.startPos.set(origin.x, origin.y, origin.z);
            lightDrag.basePos.set(base.x, base.y, base.z);
            lightTranslateGizmo.setHighlight(hit);
            el.setPointerCapture(e.pointerId);
            el.style.cursor = "grabbing";
            api.render();
            return;
          }
        }
      }

      // Hinge gizmo: drag ring to rotate joint (Blender-like).
      if (e.button === 0 && !e.altKey && hingeGizmo.root.visible) {
        const ray = pointerRay(e);
        const hit = hingeGizmo.pick(ray);
        if (hit === "ring" || hit === "axis") {
          e.preventDefault();
          const p = hingeGizmo.intersectPlane(ray);
          if (p) {
            hingeDrag.active = true;
            hingeDrag.startPlaneAngle = hingeGizmo.planeAngleAt(p);
            hingeDrag.startJointAngle = keyAngleDegRef.current;
            hingeGizmo.setHighlight(true);
            el.setPointerCapture(e.pointerId);
            el.style.cursor = "grabbing";
            api.render();
            return;
          }
        }
      }

      // Double RMB on empty space (not a solid voxel) clears selection.
      if (e.button === 2) {
        const cell = pick(e);
        const draft = draftRef.current;
        const onSolid =
          Boolean(cell) &&
          Boolean(draft) &&
          getVoxel(draft!, cell!.x, cell!.y, cell!.z) > 0;
        if (!onSolid) {
          const now = performance.now();
          if (now - lastEmptyRmbMsRef.current < RMB_DOUBLE_MS) {
            lastEmptyRmbMsRef.current = 0;
            if (selectionRef.current?.length) {
              setSelectionRef.current(null);
              api.setSelection(null);
              api.render();
            }
          } else {
            lastEmptyRmbMsRef.current = now;
          }
        } else {
          lastEmptyRmbMsRef.current = 0;
        }
      }
      // Select tool: RMB subtracts when pointing at a relevant cell;
      // empty space / wrong target → orbit.
      if (e.button === 2 && toolRef.current === "select") {
        e.preventDefault();
        const cell = pick(e);
        const draft = draftRef.current;
        const wantEmpty = selectEmptyRef.current;
        let hitOk = false;
        if (cell && draft) {
          const solid = getVoxel(draft, cell.x, cell.y, cell.z) > 0;
          hitOk = wantEmpty ? !solid : solid;
        }
        if (hitOk) {
          selectSubtractRef.current = true;
          shiftEraseRef.current = false;
          paintingRef.current = true;
          lastCellRef.current = null;
          boxAnchorRef.current = null;
          selectStrokeRef.current = [];
          selectBaseRef.current = [...(selectionRef.current ?? [])];
          el.setPointerCapture(e.pointerId);
          stroke(e, true);
          return;
        }
        // Fall through to orbit when not on a matching cell.
      }
      // RMB / Alt+LMB — orbit around center.
      if (e.button === 2 || e.altKey) {
        e.preventDefault();
        orbitingRef.current = true;
        el.setPointerCapture(e.pointerId);
        return;
      }
      if (e.button !== 0) return;

      // Ctrl/Cmd+LMB or double-click a peer → make it the active slot.
      if (
        !pickingLightOriginRef.current &&
        toolRef.current !== "hinge" &&
        toolRef.current !== "inspect"
      ) {
        const hit = pickInspect(e);
        if (hit?.objectId) {
          const now = performance.now();
          const dbl =
            hit.objectId === lastPeerHop.id && now - lastPeerHop.t < 400;
          lastPeerHop = { id: hit.objectId, t: now };
          if (e.ctrlKey || e.metaKey || dbl) {
            e.preventDefault();
            onActivateObjectRef.current(hit.objectId);
            return;
          }
          e.preventDefault();
          highlightPeer(hit.objectId);
          return;
        }
      }

      // Place PointLight origin on a voxel (from object props «Источник»).
      if (pickingLightOriginRef.current) {
        e.preventDefault();
        const cell = pick(e);
        if (cell) onPickLightOriginRef.current(cell);
        return;
      }

      // Shift+select = multi-add; Shift+paint tools = erase.
      selectSubtractRef.current = false;
      shiftEraseRef.current = e.shiftKey && toolRef.current !== "select";
      paintingRef.current = true;
      lastCellRef.current = null;
      boxAnchorRef.current = null;
      selectStrokeRef.current = [];
      selectBaseRef.current =
        e.shiftKey && toolRef.current === "select"
          ? [...(selectionRef.current ?? [])]
          : [];
      el.setPointerCapture(e.pointerId);
      const t = toolRef.current;
      if (
        (t === "add" || t === "erase") &&
        shapeBrushRef.current !== "voxel"
      ) {
        const kind = shapeBrushRef.current;
        const started = pickShapeStart(e);
        if (started) {
          beginShapeStroke(
            kind,
            started.cell,
            t === "erase" || shiftEraseRef.current,
            e,
            usesShapeHeightPhase(kind) ? started.heightAxis : "y",
          );
          showHover(started.cell);
          if (shapeDragRef.current) previewShapeStroke(shapeDragRef.current);
        }
        return;
      }
      stroke(e, true);
    };

    const onMove = (e: PointerEvent) => {
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      if (sceneRotateDrag.active) {
        const point = sceneObjectRotateGizmo.intersectPlane(pointerRay(e));
        if (point) {
          let delta =
            sceneObjectRotateGizmo.planeAngleAt(point) -
            sceneRotateDrag.startPlaneAngle;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          applySceneRotateTurns(Math.round(delta / (Math.PI / 2)));
        }
        return;
      }
      if (sceneMoveDrag.active) {
        const ray = pointerRay(e);
        const hit = sceneObjectTranslateGizmo.projectDrag(
          ray,
          camera,
          sceneMoveDrag.axis,
          sceneMoveDrag.startPivot,
        );
        if (hit) {
          applySceneMoveDelta(deltaFromSceneDragHit(hit, e.shiftKey ? 4 : 1));
        }
        return;
      }
      if (selMoveDrag.active) {
        const ray = pointerRay(e);
        const hit = selTranslateGizmo.projectDrag(
          ray,
          camera,
          selMoveDrag.axis,
          overlayLocalToWorld(selMoveDrag.startCenter),
        );
        if (hit) {
          applySelMoveDelta(deltaFromSelDragHit(overlayWorldToLocal(hit)));
        }
        return;
      }
      if (lightDrag.active) {
        const ray = pointerRay(e);
        const hit = lightTranslateGizmo.projectDrag(
          ray,
          camera,
          lightDrag.axis,
          lightDrag.startPos,
        );
        if (hit) {
          // Axis drag keeps the other axes at the drag start.
          let x = lightDrag.startPos.x;
          let y = lightDrag.startPos.y;
          let z = lightDrag.startPos.z;
          if (lightDrag.axis === "center") {
            x = hit.x;
            y = hit.y;
            z = hit.z;
          } else if (lightDrag.axis === "x") {
            x = hit.x;
          } else if (lightDrag.axis === "y") {
            y = hit.y;
          } else {
            z = hit.z;
          }
          // Shift = coarse 0.25; default = fine 0.05 voxel steps.
          const fine = !e.shiftKey;
          x = snapLightCoord(x, fine);
          y = snapLightCoord(y, fine);
          z = snapLightCoord(z, fine);
          onMoveLightOffsetRef.current({
            x: x - lightDrag.basePos.x,
            y: y - lightDrag.basePos.y,
            z: z - lightDrag.basePos.z,
          });
          lightTranslateGizmo.setPose({ x, y, z }, 1.15);
          api.render();
        }
        return;
      }
      if (hingeDrag.active) {
        const ray = pointerRay(e);
        const p = hingeGizmo.intersectPlane(ray);
        if (p) {
          const planeA = hingeGizmo.planeAngleAt(p);
          let delta =
            THREE.MathUtils.radToDeg(planeA - hingeDrag.startPlaneAngle);
          // Keep shortest-path feel while dragging past ±180.
          while (delta > 180) delta -= 360;
          while (delta < -180) delta += 360;
          const next = hingeDrag.startJointAngle + delta;
          setJointAngleDegRef.current(
            Math.round(THREE.MathUtils.clamp(next, -180, 180)),
          );
        }
        return;
      }
      if (panningRef.current) {
        // Screen-space pan of the look-at target.
        panRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
        panUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
        const k = api.dist * 0.0018;
        center.addScaledVector(panRight, -e.movementX * k);
        center.addScaledVector(panUp, e.movementY * k);
        api.applyCam();
        api.render();
        return;
      }
      if (orbitingRef.current) {
        // Free orbit around look-at: X → yaw, Y → pitch (all axes).
        api.yaw -= e.movementX * 0.01;
        api.pitch -= e.movementY * 0.01;
        api.applyCam();
        api.render();
        return;
      }
      const heightDrag = shapeDragRef.current;
      if (
        heightDrag &&
        usesShapeHeightPhase(heightDrag.kind) &&
        heightDrag.phase === "height"
      ) {
        heightDrag.end = pickShapeHeightEnd(e, heightDrag);
        showHover(heightDrag.end);
        previewShapeStroke(heightDrag);
        return;
      }
      if (paintingRef.current) {
        const t = toolRef.current;
        const kind = shapeBrushRef.current;
        if ((t === "add" || t === "erase") && kind !== "voxel") {
          const drag = shapeDragRef.current;
          if (
            drag &&
            usesShapeHeightPhase(drag.kind) &&
            (e.buttons & 2) !== 0
          ) {
            cancelShapeStroke();
            paintingRef.current = false;
            shiftEraseRef.current = false;
            activePointerId = null;
            try {
              el.releasePointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
            return;
          }
          if (drag && usesShapeHeightPhase(drag.kind)) {
            const cell = pickShapePlaneCell(e, drag.start, drag.heightAxis);
            if (cell) {
              drag.planeEnd = cell;
              drag.end = cell;
              showHover(cell);
              previewShapeStroke(drag);
            }
            return;
          }
          const cell = pick(e);
          showHover(cell);
          if (cell) {
            if (!shapeDragRef.current) {
              beginShapeStroke(
                kind,
                cell,
                t === "erase" || shiftEraseRef.current,
                e,
                "y",
              );
            } else if (shapeDragRef.current) {
              shapeDragRef.current.planeEnd = cell;
              shapeDragRef.current.end = cell;
            }
            const next = shapeDragRef.current;
            if (next) previewShapeStroke(next);
          }
          return;
        }
        if (!paintDragStarted) {
          const moved = Math.hypot(
            e.clientX - pointerStartX,
            e.clientY - pointerStartY,
          );
          if (moved < PAINT_DRAG_THRESHOLD_PX) return;
          paintDragStarted = true;
        }
        stroke(e, false);
      }
      else if (activeTool() === "hinge") showHover(pickVertex(e));
      else if (activeTool() === "inspect") {
        const hit = pickInspect(e);
        if (!hit) showHover(null);
        else if (hit.objectId) highlightPeer(hit.objectId);
        else showHover(hit.cell);
      } else {
        if (sceneObjectRotateGizmo.root.visible) {
          const hit = sceneObjectRotateGizmo.pick(pointerRay(e));
          sceneObjectRotateGizmo.setHighlight(Boolean(hit));
          if (hit) {
            el.style.cursor = "grab";
            hover.visible = false;
            vertexHover.visible = false;
            hidePeerHover();
            api.render();
            return;
          }
          el.style.cursor = "";
        }
        if (sceneObjectTranslateGizmo.root.visible) {
          const hit = sceneObjectTranslateGizmo.pick(pointerRay(e));
          sceneObjectTranslateGizmo.setHighlight(hit);
          if (hit) {
            el.style.cursor = "grab";
            hover.visible = false;
            vertexHover.visible = false;
            hidePeerHover();
            api.render();
            return;
          }
          el.style.cursor = "";
        }
        if (selTranslateGizmo.root.visible) {
          const hit = selTranslateGizmo.pick(pointerRay(e));
          selTranslateGizmo.setHighlight(hit);
          if (hit) {
            el.style.cursor = "grab";
            hover.visible = false;
            vertexHover.visible = false;
            hidePeerHover();
            api.render();
            return;
          }
          el.style.cursor = "";
        }
        if (lightTranslateGizmo.root.visible && !pickingLightOriginRef.current) {
          const hit = lightTranslateGizmo.pick(pointerRay(e));
          lightTranslateGizmo.setHighlight(hit);
          if (hit) {
            el.style.cursor = "grab";
            hover.visible = false;
            vertexHover.visible = false;
            api.render();
            return;
          }
        }
        if (hingeGizmo.root.visible) {
          const hit = hingeGizmo.pick(pointerRay(e));
          hingeGizmo.setHighlight(hit === "ring" || hit === "axis");
          if (hit) {
            el.style.cursor = "grab";
            hover.visible = false;
            vertexHover.visible = false;
            hidePeerHover();
            api.render();
            return;
          }
          el.style.cursor = "";
        }
        const sceneHit = pickInspect(e);
        if (sceneHit?.objectId) {
          highlightPeer(sceneHit.objectId);
          return;
        }
        showHover(pick(e));
      }
    };

    const finishPointer = (
      e: PointerEvent,
      releaseCapture: boolean,
      canceled = false,
    ) => {
      if (activePointerId !== e.pointerId) return;
      // Clear first: releasePointerCapture may synchronously emit
      // lostpointercapture, which must not finish the stroke twice.
      activePointerId = null;
      if (sceneRotateDrag.active) {
        const quarterTurns = sceneRotateDrag.lastQuarterTurns;
        sceneRotateDrag.active = false;
        sceneObjectRotateGizmo.setHighlight(false);
        el.style.cursor = "";
        if (canceled || quarterTurns === 0) {
          restoreSceneRotatePreview();
          onSceneRotateCancelRef.current();
        } else {
          sceneRotateDrag.nodes = [];
          onSceneRotateCommitRef.current(quarterTurns);
        }
      }
      if (sceneMoveDrag.active) {
        const delta = sceneMoveDrag.lastDelta;
        sceneMoveDrag.active = false;
        sceneObjectTranslateGizmo.setHighlight(null);
        el.style.cursor = "";
        if (canceled || (delta.x === 0 && delta.y === 0 && delta.z === 0)) {
          restoreSceneMovePreview();
          onSceneMoveCancelRef.current();
        } else {
          sceneMoveDrag.nodes = [];
          onSceneMoveCommitRef.current(delta);
        }
      }
      if (selMoveDrag.active) {
        const delta = selMoveDrag.lastDelta;
        selMoveDrag.active = false;
        selTranslateGizmo.setHighlight(null);
        el.style.cursor = "";
        if (canceled || (delta.x === 0 && delta.y === 0 && delta.z === 0)) {
          onSelMoveCancelRef.current();
        } else {
          onSelMoveCommitRef.current(delta);
        }
      }
      if (lightDrag.active) {
        lightDrag.active = false;
        lightTranslateGizmo.setHighlight(null);
        el.style.cursor = "";
      }
      if (hingeDrag.active) {
        hingeDrag.active = false;
        hingeGizmo.setHighlight(false);
        el.style.cursor = "";
      }
      const shapeDrag = shapeDragRef.current;
      if (canceled) {
        if (shapeDrag) cancelShapeStroke();
      } else if (
        shapeDrag &&
        usesShapeHeightPhase(shapeDrag.kind) &&
        shapeDrag.phase === "plane"
      ) {
        shapeDrag.phase = "height";
        shapeDrag.heightAnchorClientY = e.clientY;
        shapeDrag.heightAnchor = shapeDrag.start[shapeDrag.heightAxis];
        shapeDrag.heightRayBase = sampleShapeHeightCoord(e, shapeDrag);
        previewShapeStroke(shapeDrag);
      } else if (shapeDrag && shapeDrag.phase === "height") {
        /* Height is confirmed by a later LMB / Enter, not this release. */
      } else if (shapeDrag) {
        shapeDragRef.current = null;
        onShapeCommitRef.current(shapeDrag.start, shapeDrag.end, shapeDrag.erase);
        api.setSelection(selectionRef.current);
      }
      orbitingRef.current = false;
      panningRef.current = false;
      paintingRef.current = false;
      shiftEraseRef.current = false;
      selectSubtractRef.current = false;
      lastCellRef.current = null;
      boxAnchorRef.current = null;
      strokeCells.clear();
      if (editSnapRef.current) {
        editSnapRef.current = false;
        persistHistNowRef.current();
      }
      el.style.cursor = "";
      if (releaseCapture) {
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    };

    const onUp = (e: PointerEvent) => finishPointer(e, true);
    const onCancel = (e: PointerEvent) => finishPointer(e, false, true);
    const onLostPointerCapture = (e: PointerEvent) => {
      if (activePointerId === e.pointerId) finishPointer(e, false);
    };

    const onLeave = () => {
      if (shapeDragRef.current?.phase === "height") return;
      if (
        !paintingRef.current &&
        !orbitingRef.current &&
        !panningRef.current &&
        !sceneRotateDrag.active &&
        !sceneMoveDrag.active
      ) {
        showHover(null);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      api.dist = THREE.MathUtils.clamp(
        api.dist * (e.deltaY > 0 ? 1.1 : 1 / 1.1),
        8,
        260,
      );
      api.applyCam();
      api.render();
    };

    const onContext = (ev: Event) => ev.preventDefault();
    const onAuxClick = (ev: MouseEvent) => {
      // Block browser middle-click autoscroll / open-tab gestures.
      if (ev.button === 1) ev.preventDefault();
    };

    const resize = () => {
      const w = host.clientWidth || 320;
      const h = host.clientHeight || 240;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      el.style.width = "100%";
      el.style.height = "100%";
      api.render();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    el.addEventListener("lostpointercapture", onLostPointerCapture);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContext);
    el.addEventListener("auxclick", onAuxClick);
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    api.dispose = () => {
      ro.disconnect();
      while (selRoot.children.length) {
        const c = selRoot.children[0]!;
        selRoot.remove(c);
        if (c instanceof THREE.Mesh || c instanceof THREE.LineSegments) {
          c.geometry.dispose();
        }
      }
      selMat.dispose();
      selEdgeMat.dispose();
      clearGridRoot();
      gridMat.dispose();
      clearMirrorRoot();
      axisGizmo.dispose();
      hingeGizmo.dispose();
      lightTranslateGizmo.dispose();
      selTranslateGizmo.dispose();
      sceneObjectTranslateGizmo.dispose();
      sceneObjectRotateGizmo.dispose();
      extraLampGeom.dispose();
      extraLampMat.dispose();
      for (const light of previewLights) scene.remove(light);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("lostpointercapture", onLostPointerCapture);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContext);
      el.removeEventListener("auxclick", onAuxClick);
      while (meshRoot.children.length) {
        const c = meshRoot.children[0]!;
        meshRoot.remove(c);
        disposeVoxelModelMesh(c);
      }
      while (peerRoot.children.length) {
        const c = peerRoot.children[0]!;
        peerRoot.remove(c);
        disposeVoxelModelMesh(c);
      }
      hover.geometry.dispose();
      (hover.material as THREE.Material).dispose();
      vertexHover.geometry.dispose();
      (vertexHover.material as THREE.Material).dispose();
      bounds.geometry.dispose();
      (bounds.material as THREE.Material).dispose();
      renderer.dispose();
      try {
        renderer.forceContextLoss();
      } catch {
        /* ignore */
      }
      host.innerHTML = "";
    };

    return () => {
      api.dispose();
      apiRef.current = null;
    };
  }, []);

  const lastFrameKeyRef = useRef<string | null>(null);
  const remeshFrameRef = useRef<number | null>(null);
  const remeshPendingRef = useRef<{
    draft: EmberVoxelModel;
    shineColorKeep: number;
  } | null>(null);

  // Remesh when draft or shine color-keep changes (camera stays unless model / grid size switches).
  useEffect(() => {
    if (!draft) return;
    remeshPendingRef.current = { draft, shineColorKeep };
    if (remeshFrameRef.current != null) return;
    remeshFrameRef.current = window.requestAnimationFrame(() => {
      remeshFrameRef.current = null;
      const pending = remeshPendingRef.current;
      remeshPendingRef.current = null;
      const api = apiRef.current;
      if (!api || !pending) return;
      // Reset active transform before remesh (joint preview may have rotated it).
      api.meshRoot.position.set(0, 0, 0);
      api.meshRoot.quaternion.identity();
      api.meshRoot.rotation.set(0, 0, 0);
      // Coalesce rapid pointer edits to at most one full remesh per frame.
      const built = buildVoxelModelMesh(pending.draft, VOXELS_PER_BLOCK, {
        directLightScale: 1,
        shineColorKeep: pending.shineColorKeep,
        suppressCastShadow:
          pending.draft.emissiveSuppressHostShadow === true,
      });
      api.setMesh(built.group);
      const g = voxelGridSize(pending.draft);
      api.bounds.geometry.dispose();
      api.bounds.geometry = new THREE.BoxGeometry(g.sx, g.sy, g.sz);
      api.bounds.position.set(g.sx / 2, g.sy / 2, g.sz / 2);
      api.bounds.visible = true;
      api.setSelection(selectionRef.current);
      api.syncEditOverlays();
      api.render();
    });
  }, [draft, shineColorKeep, draft?.emissiveSuppressHostShadow]);

  useEffect(() => {
    return () => {
      if (remeshFrameRef.current != null) {
        window.cancelAnimationFrame(remeshFrameRef.current);
        remeshFrameRef.current = null;
      }
      remeshPendingRef.current = null;
    };
  }, []);

  // Light-origin marker + live PointLight in the studio (chrome «Свет» toggle).
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    if (!draft?.emissiveCastsLight) {
      api.setLightOriginMarker(null);
      api.setLightOriginExtras([]);
      api.setPreviewEmissiveLights(null);
      return;
    }
    const sum = summarizeVoxelEmissive(draft);
    if (!sum) {
      api.setLightOriginMarker(null);
      api.setLightOriginExtras([]);
      api.setPreviewEmissiveLights(null);
      return;
    }
    const lamps = listVoxelEmissiveLamps(draft);
    const selected =
      lamps.find((lamp) => lamp.id === activeLampId) ?? lamps[0]!;
    const selectedOrigin = resolveVoxelLampOrigin(draft, selected, sum);
    api.setLightOriginMarker(selectedOrigin);
    api.setLightOriginExtras(
      lamps
        .filter((lamp) => lamp.id !== selected.id)
        .map((lamp) => resolveVoxelLampOrigin(draft, lamp, sum)),
    );
    if (!showPreviewEmissiveLight) {
      api.setPreviewEmissiveLights(null);
      return;
    }
    const leak = voxelTransmittanceLeak(draft);
    api.setPreviewEmissiveLights(
      lamps.map((lamp, i) => {
        const lampSum =
          summarizeVoxelEmissiveForLamp(draft, lamps, i) ?? sum;
        const origin = resolveVoxelLampOrigin(draft, lamp, lampSum);
        const strength = resolveEmissiveStrength(
          lamp.strength ?? draft.emissiveStrength,
        );
        const rangeTiles = resolveEmissiveLightRange(
          lamp.range ?? draft.emissiveLightRange,
        );
        const dens = Math.max(
          0.35,
          Math.min(
            1,
            0.4 + lampSum.weight * 0.35 + Math.min(0.35, lampSum.count * 0.04),
          ),
        );
        return {
          pos: origin,
          color: new THREE.Color(lampSum.r, lampSum.g, lampSum.b),
          intensity: (3.4 + strength * 9.5) * dens,
          distance: rangeTiles * VOXELS_PER_BLOCK,
          transmittanceLeak: leak,
          softRings:
            lamp.softRings === true || draft.emissiveLightSoftRings === true,
          softShadows:
            lamp.softShadows === true ||
            draft.emissiveLightSoftShadows === true,
        };
      }),
    );
  }, [
    draft?.id,
    draft?.emissiveCastsLight,
    draft?.emissiveStrength,
    draft?.emissiveLightRange,
    draft?.emissiveLightOrigin?.x,
    draft?.emissiveLightOrigin?.y,
    draft?.emissiveLightOrigin?.z,
    draft?.emissiveLightOffset?.x,
    draft?.emissiveLightOffset?.y,
    draft?.emissiveLightOffset?.z,
    draft?.emissiveLightSoftRings,
    draft?.emissiveLightSoftShadows,
    draft?.emissive,
    draft?.transmittance,
    draft?.voxels,
    draft?.emissiveLights,
    activeLampId,
    showPreviewEmissiveLight,
  ]);

  // Frame camera when the model / scene / canvas size context changes.
  // Deferred so peer meshes are already placed for multi-object scenes.
  const draftGridKey = draft
    ? (() => {
        const g = voxelGridSize(draft);
        return `${draft.id}:${g.sx}x${g.sy}x${g.sz}`;
      })()
    : null;
  useEffect(() => {
    if (!draftGridKey) return;
    const key = `${activeId ?? ""}:${draftGridKey}`;
    if (lastFrameKeyRef.current === key) return;
    lastFrameKeyRef.current = key;
    let cancelled = false;
    const t = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (cancelled) return;
        const api = apiRef.current;
        if (!api) return;
        api.frameCamera();
        api.render();
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(t);
    };
  }, [activeId, draftGridKey]);

  // Peer scene objects + hierarchical joint preview.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    if (!activeScene || !activeObject || variantMode) {
      api.setPeerMeshes([]);
      delete api.meshRoot.userData.sceneObjectId;
      api.meshRoot.visible = true;
      api.meshRoot.position.set(0, 0, 0);
      api.meshRoot.quaternion.identity();
      api.meshRoot.rotation.set(0, 0, 0);
      const meshChild = api.meshRoot.children[0];
      if (meshChild) meshChild.position.set(0, 0, 0);
      api.setHingeGizmo(null);
      api.syncEditOverlays();
      api.render();
      return;
    }

    const clip = activeScene.animations?.find((c) => c.id === animClipId);
    const originFrame = { x: 0, y: 0, z: 0 };
    const peers: THREE.Group[] = [];
    const poses = computeSkeletonPoses(
      activeScene,
      (jointId) =>
        resolveJointAngleDeg(jointId, {
          selectedJointId,
          keyAngleDeg,
          clip,
          playhead: animPlayhead,
        }),
      1,
    );

    const activeHidden = activeObject.visible === false;
    api.meshRoot.userData.sceneObjectId = activeObject.id;
    api.meshRoot.visible = !activeHidden;
    api.bounds.visible = !activeHidden;
    const activePose = poses.get(activeObject.id);
    if (!activeHidden && activePose) {
      applySkeletonNodePose(
        api.meshRoot,
        api.meshRoot.children[0],
        activePose,
        originFrame,
      );
    } else {
      api.meshRoot.position.set(0, 0, 0);
      api.meshRoot.quaternion.identity();
      api.meshRoot.rotation.set(0, 0, 0);
      const meshChild = api.meshRoot.children[0];
      if (meshChild) meshChild.position.set(0, 0, 0);
    }

    for (const obj of activeScene.objects) {
      if (obj.id === activeObject.id) continue;
      if (obj.visible === false) continue;
      const slot = characterSlotForObject(activeScene, obj.id);
      const viewModelId =
        slot && activeScene.character?.facing === "card4"
          ? characterModelIdForSlotView(activeScene, slot, characterCardView)
          : undefined;
      const modelId = viewModelId ?? obj.modelId;
      const m =
        modelId === draft?.id ? draft : pack.voxelModels[modelId];
      if (!m) continue;
      const built = buildVoxelModelMesh(m, VOXELS_PER_BLOCK, {
        directLightScale: 1,
        shineColorKeep,
        suppressCastShadow: m.emissiveSuppressHostShadow === true,
      });
      const wrapper = new THREE.Group();
      wrapper.name = `peer-${obj.id}`;
      wrapper.userData.sceneObjectId = obj.id;
      const pose = poses.get(obj.id);
      if (pose) {
        applySkeletonNodePose(wrapper, built.group, pose, originFrame);
        wrapper.add(built.group);
      } else {
        wrapper.add(built.group);
        wrapper.position.set(obj.offset.x, obj.offset.y, obj.offset.z);
      }
      peers.push(wrapper);
    }
    api.setPeerMeshes(peers);

    const jointForGizmo =
      (selectedJointId
        ? activeScene.joints?.find((j) => j.id === selectedJointId)
        : undefined) ?? activeScene.joints?.[0];
    if (jointForGizmo && !hingeActive) {
      const hinge = jointHingeWorld(jointForGizmo, poses, 1);
      if (hinge) {
        const scale = Math.max(1.2, api.dist * 0.055);
        api.setHingeGizmo({
          pos: {
            x: hinge.x,
            y: hinge.y,
            z: hinge.z,
          },
          axis: jointForGizmo.axis,
          scale,
        });
      } else {
        api.setHingeGizmo(null);
      }
    } else {
      api.setHingeGizmo(null);
    }
    api.syncEditOverlays();
    api.render();
  }, [
    activeScene,
    activeObject,
    animClipId,
    animPlayhead,
    keyAngleDeg,
    selectedJointId,
    hingeActive,
    draft,
    pack.voxelModels,
    shineColorKeep,
    variantMode,
    characterCardView,
  ]);

  // Timeline play: drive live joint angle from clip keys.
  useEffect(() => {
    if (!animPlaying || !activeScene || !animClipId || !selectedJointId) return;
    const clip = activeScene.animations?.find((c) => c.id === animClipId);
    if (!clip) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const dur = Math.max(0.05, clip.durationSec);
      setAnimPlayhead((t) => {
        const next = t + dt / dur;
        const u = next >= 1 ? next - Math.floor(next) : next;
        setKeyAngleDeg(sampleJointAngleDeg(clip, selectedJointId, u));
        return u;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animPlaying, activeScene, animClipId, selectedJointId]);

  // Move tool: arrow keys nudge voxels, or the scene bone when nothing is selected.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      let dx = 0;
      let dy = 0;
      let dz = 0;
      if (e.key === "ArrowLeft") dx = -1;
      else if (e.key === "ArrowRight") dx = 1;
      else if (e.key === "ArrowUp" && e.shiftKey) dy = 1;
      else if (e.key === "ArrowDown" && e.shiftKey) dy = -1;
      else if (e.key === "ArrowUp") dz = -1;
      else if (e.key === "ArrowDown") dz = 1;
      else return;
      const model = draftRef.current;
      const sel = selectionRef.current;
      if (
        workspaceMode === "sculpt" &&
        model &&
        sel?.length &&
        (tool === "select" || tool === "move") &&
        selectionHasSolidVoxels(model, sel)
      ) {
        e.preventDefault();
        translateSelectedVoxelsRef.current({ x: dx, y: dy, z: dz });
        return;
      }
      if (tool !== "move" || !activeScene || !activeObject || variantMode) return;
      e.preventDefault();
      commitSceneRef.current(
        translateVoxelSceneSelection(activeScene, selectedSceneObjectIds, {
          x: dx,
          y: dy,
          z: dz,
        }),
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    tool,
    activeScene,
    activeObject,
    variantMode,
    selection,
    draft,
    selectedSceneObjectIds,
    workspaceMode,
  ]);

  useEffect(() => {
    if (sceneTransformMode === "rotate" && !canRotateSelectedSceneObjects) {
      setSceneTransformMode("translate");
    }
  }, [canRotateSelectedSceneObjects, sceneTransformMode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((workspaceMode !== "scene" && workspaceMode !== "animate") || variantMode) return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (event.code === "KeyW") {
        event.preventDefault();
        setTool("move");
        setSceneTransformMode("translate");
      } else if (
        workspaceMode === "scene" &&
        event.code === "KeyE" &&
        canRotateSelectedSceneObjects
      ) {
        event.preventDefault();
        setTool("move");
        setSceneTransformMode("rotate");
      } else if (event.code === "KeyJ") {
        event.preventDefault();
        startHingeJoint();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canRotateSelectedSceneObjects, variantMode, workspaceMode]);

  useEffect(() => {
    apiRef.current?.setSelection(selection);
  }, [selection]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const show =
      workspaceMode === "sculpt" &&
      (tool === "select" || tool === "move") &&
      Boolean(draft && selection?.length) &&
      selectionHasSolidVoxels(draft!, selection);
    if (!show) {
      api.setSelectionGizmo(null);
      return;
    }
    const center = voxelSelectionCenter(selection);
    if (!center) {
      api.setSelectionGizmo(null);
      return;
    }
    api.setSelectionGizmo({
      pos: center,
      scale: selectionGizmoScale(selection!),
    });
  }, [tool, selection, draft, workspaceMode]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    if (
      workspaceMode !== "scene" ||
      tool !== "move" ||
      !activeScene ||
      !selectedSceneObjectIds.length ||
      variantMode
    ) {
      api.setSceneObjectGizmo(null);
      return;
    }
    const pivot = voxelSceneSelectionPivot(
      activeScene,
      selectedSceneObjectIds,
    );
    if (!pivot) {
      api.setSceneObjectGizmo(null);
      return;
    }
    api.setSceneObjectGizmo({
      pos:
        sceneTransformMode === "rotate"
          ? {
              x: Math.round(pivot.x),
              y: Math.round(pivot.y),
              z: Math.round(pivot.z),
            }
          : pivot,
      scale: Math.max(1.15, Math.min(3.2, api.dist * 0.045)),
      objectIds: voxelSceneSelectionMoveIds(
        activeScene,
        selectedSceneObjectIds,
      ),
      mode:
        sceneTransformMode === "rotate" && canRotateSelectedSceneObjects
          ? "rotate"
          : "translate",
    });
  }, [
    activeScene,
    canRotateSelectedSceneObjects,
    sceneTransformMode,
    selectedSceneObjectIds,
    tool,
    variantMode,
    workspaceMode,
  ]);

  useEffect(() => {
    try {
      sessionStorage.setItem(VOXEL_GRID_STORAGE_KEY, showVoxelGrid ? "1" : "0");
    } catch {
      /* ignore */
    }
    apiRef.current?.setVoxelGrid(draft, showVoxelGrid);
  }, [showVoxelGrid, draft]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        VOXEL_CAPSULE_STORAGE_KEY,
        showPlayerCapsule ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
    apiRef.current?.setPlayerCapsule(
      showPlayerCapsule
        ? isCharacterScene(activeScene) && activeScene
          ? {
              visible: true,
              ...characterCapsule(activeScene),
              ...characterCapsuleCenterRelativeTo(activeScene, {
                x: 0,
                y: 0,
                z: 0,
              }),
            }
          : {
              visible: true,
              radius: DEFAULT_WORLD_BODY.radiusVoxels,
              height: DEFAULT_WORLD_BODY.heightVoxels,
              x: -DEFAULT_WORLD_BODY.radiusVoxels - 1.5,
              y: DEFAULT_WORLD_BODY.heightVoxels * 0.5,
              z: DEFAULT_WORLD_BODY.radiusVoxels,
            }
        : {
            visible: false,
            radius: DEFAULT_WORLD_BODY.radiusVoxels,
            height: DEFAULT_WORLD_BODY.heightVoxels,
            x: 0,
            y: 0,
            z: 0,
          },
    );
  }, [showPlayerCapsule, activeScene, activeObject]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        VOXEL_PREVIEW_LIGHT_STORAGE_KEY,
        showPreviewEmissiveLight ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [showPreviewEmissiveLight]);

  useEffect(() => {
    apiRef.current?.setMirrorPlanes(draft, mirrorAxes);
  }, [mirrorAxes, draft]);

  const applyEdit = (next: EmberVoxelModel) => {
    beginEditRef.current();
    editSnapRef.current = false;
    setDraft(next);
    persistHistSession(next);
  };
  applyEditRef.current = applyEdit;
  onShapeCommitRef.current = (start, end, erase) => {
    const current = draftRef.current;
    const kind = shapeBrushRef.current;
    if (!current || kind === "voxel") return;
    const next = stampVoxelShape(current, start, end, kind, {
      paletteIndex: paletteRef.current,
      erase,
      mirror: mirrorAxesRef.current,
    });
    if (next !== current) applyEdit(next);
  };

  const noteOwnVoxWrite = () => {
    ignoreVoxWatchUntilRef.current = Date.now() + 2000;
  };

  const writeVoxelDraft = useCallback(
    async (
      normalized: EmberVoxelModel,
      json: string,
      syncPack: boolean,
      gen: number,
    ) => {
      const modelsMap = {
        ...(packRef.current.voxelModels ?? {}),
        [normalized.id]: normalized,
      };
      const scenesMap = {
        ...(packRef.current.voxelScenes ?? {}),
        ...voxelScenesRef.current,
      };
      const skipVox =
        skipVoxWriteOnceRef.current === normalized.id
          ? [normalized.id]
          : undefined;
      skipVoxWriteOnceRef.current = null;
      if (!skipVox) ignoreVoxWatchUntilRef.current = Date.now() + 2000;
      const res = await writeVoxelRegistry(modelsMap, scenesMap, {
        dirtyIds: [normalized.id],
        skipVoxWrite: skipVox,
      });
      if (gen !== autoSaveGenRef.current) return;
      if (!res.ok) {
        onSavedRef.current?.(`Ошибка авто: ${res.error}`);
        return;
      }
      lastSavedJsonRef.current = json;
      if (pendingVoxelAutosaveRef.current?.json === json) {
        pendingVoxelAutosaveRef.current = null;
      }
      if (syncPack) {
        skipPackSyncRef.current = true;
        onPackChangeRef.current(
          packWithVoxels(packRef.current, modelsMap, scenesMap),
        );
      }
      const t = new Date();
      const hh = String(t.getHours()).padStart(2, "0");
      const mm = String(t.getMinutes()).padStart(2, "0");
      const ss = String(t.getSeconds()).padStart(2, "0");
      onSavedRef.current?.(`Автосохранение вокселей ${hh}:${mm}:${ss}`);
    },
    [],
  );

  // Debounced autosave to library + session history.
  useEffect(() => {
    if (!draft) return;
    const normalized = fitVoxelPalette(normalizeVoxelModel(draft));
    persistHistSession(normalized);
    if (variantMode || !autoSave) return;

    const json = JSON.stringify(normalized);
    if (json === lastSavedJsonRef.current) {
      pendingVoxelAutosaveRef.current = null;
      return;
    }
    pendingVoxelAutosaveRef.current = { normalized, json };

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const gen = ++autoSaveGenRef.current;
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      void writeVoxelDraft(normalized, json, true, gen);
    }, 900);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [
    draft,
    autoSave,
    variantMode,
    persistHistSession,
    writeVoxelDraft,
  ]);

  flushVoxelAutosaveRef.current = () => {
    const current = draftRef.current;
    if (!current || variantMode || !autoSave) return;
    const pending = pendingVoxelAutosaveRef.current;
    const normalized =
      pending?.normalized ?? fitVoxelPalette(normalizeVoxelModel(current));
    const json = pending?.json ?? JSON.stringify(normalized);
    if (json === lastSavedJsonRef.current) {
      pendingVoxelAutosaveRef.current = null;
      return;
    }
    pendingVoxelAutosaveRef.current = { normalized, json };
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    const gen = ++autoSaveGenRef.current;
    void writeVoxelDraft(normalized, json, false, gen);
  };

  useEffect(() => {
    return () => {
      flushHistSession();
      flushVoxelAutosaveRef.current();
    };
  }, [flushHistSession]);

  useEffect(() => {
    if (variantMode || !draft?.id) return;
    const desktop = window.joiDesktop?.ember;
    if (!desktop?.watch || !desktop.onFileChanged || !desktop.unwatch) return;
    const modelId = draft.id;
    const rel = voxelVoxRel(modelId);
    let cancelled = false;
    void desktop.watch(rel);
    const unsub = desktop.onFileChanged((payload) => {
      if (cancelled || payload.rel !== rel) return;
      if (Date.now() < ignoreVoxWatchUntilRef.current) return;
      void (async () => {
        let bytes: Uint8Array | null = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          if (cancelled) return;
          const res = await readEmberBytes(rel);
          if (res.ok) {
            bytes = res.data;
            break;
          }
          await waitMs(160);
        }
        if (!bytes || cancelled) return;
        const current = draftRef.current;
        if (!current || current.id !== modelId) return;
        let next: EmberVoxelModel;
        try {
          next = applyVoxBytesToEmberModel(current, bytes);
        } catch {
          await waitMs(200);
          if (cancelled) return;
          const retry = await readEmberBytes(rel);
          if (!retry.ok) return;
          try {
            next = applyVoxBytesToEmberModel(current, retry.data);
          } catch {
            onSaved?.("MagicaVoxel: не удалось прочитать сохранённый .vox");
            return;
          }
        }
        if (cancelled) return;
        if (
          voxelOccupancyFingerprint(current) ===
          voxelOccupancyFingerprint(next)
        ) {
          return;
        }
        skipVoxWriteOnceRef.current = modelId;
        applyEditRef.current(next);
        onSaved?.(
          `Сетка из MagicaVoxel → «${next.nameRu ?? next.id}» (свет в JSON)`,
        );
      })();
    });
    return () => {
      cancelled = true;
      unsub();
      void desktop.unwatch();
    };
  }, [draft?.id, variantMode, onSaved]);

  const applySelectionOp = (op: SelectionEditOp) => {
    const model = draftRef.current;
    const sel = selectionRef.current;
    if (!model || !sel) return;
    const amount =
      op === "shine"
        ? shineRef.current
        : op === "transparency"
          ? transparencyRef.current
          : op === "transmittance"
            ? transmittanceRef.current
            : emitRef.current;
    const expanded = expandSelectionWithMirror(
      model,
      sel,
      mirrorAxesRef.current,
    );
    const next = editVoxelSelection(
      model,
      expanded,
      op,
      paletteRef.current,
      amount,
    );
    if (next !== model) applyEdit(next);
  };

  const toggleMirror = (axis: keyof VoxelMirrorAxes) => {
    setMirrorAxes((cur) => ({ ...cur, [axis]: !cur[axis] }));
  };

  const activateSelectMode = (mode: SelectMode) => {
    setTool("select");
    setSelectMode(mode);
    const model = draftRef.current;
    const cell = lastHoverCellRef.current;
    if (!model || !cell) return;
    let pieces = selectionFromClick(
      model,
      cell,
      mode,
      selectEmptyRef.current,
    );
    if (pieces.length && anyVoxelMirror(mirrorAxesRef.current)) {
      pieces = expandSelectionWithMirror(
        model,
        pieces,
        mirrorAxesRef.current,
      );
    }
    const next = pieces.length ? pieces : null;
    changeSelection(next);
  };

  const undo = () => {
    const prev = undoStackRef.current.pop();
    if (!prev || !draft) return;
    redoStackRef.current.push({
      snapshot: captureVoxelSnapshot(draft),
      selection: cloneVoxelSelectionSet(selectionRef.current),
    });
    const restored = restoreVoxelSnapshot(prev.snapshot);
    setDraft(restored);
    setSelection(cloneVoxelSelectionSet(prev.selection));
    apiRef.current?.setSelection(prev.selection);
    setHistTick((n) => n + 1);
    persistHistSession(restored);
  };

  const redo = () => {
    const next = redoStackRef.current.pop();
    if (!next || !draft) return;
    undoStackRef.current.push({
      snapshot: captureVoxelSnapshot(draft),
      selection: cloneVoxelSelectionSet(selectionRef.current),
    });
    const restored = restoreVoxelSnapshot(next.snapshot);
    setDraft(restored);
    setSelection(cloneVoxelSelectionSet(next.selection));
    apiRef.current?.setSelection(next.selection);
    setHistTick((n) => n + 1);
    persistHistSession(restored);
  };

  /** Atomic selection change (toolbar / hotkeys) — one undo step. */
  const changeSelection = (next: VoxelSelectionSet | null) => {
    if (voxelSelectionsEqual(selectionRef.current, next)) return;
    if (!editSnapRef.current) {
      pushHistSnapshot();
    }
    editSnapRef.current = false;
    setSelection(next);
    apiRef.current?.setSelection(next);
    if (draftRef.current) persistHistSession(draftRef.current);
  };

  const transformSelection = (op: "dup" | VoxelRotateAxis) => {
    const model = draftRef.current;
    const sel = selectionRef.current;
    if (!model || !sel?.length) return;
    const result =
      op === "dup"
        ? duplicateVoxelSelection(model, sel)
        : rotateVoxelSelection(model, sel, op);
    if (!result) return;
    applyEdit(result.model);
    changeSelection(result.selection);
  };

  const remeshStudioFromDraft = () => {
    const api = apiRef.current;
    const d = draftRef.current;
    if (!api || !d) return;
    const built = buildVoxelModelMesh(d, VOXELS_PER_BLOCK, {
      directLightScale: 1,
      shineColorKeep,
      suppressCastShadow: d.emissiveSuppressHostShadow === true,
    });
    api.setMesh(built.group);
    api.setSelection(selectionRef.current);
    api.setVoxelGrid(d, showVoxelGrid);
    api.syncEditOverlays();
    if (
      (toolRef.current === "select" || toolRef.current === "move") &&
      selectionRef.current &&
      selectionHasSolidVoxels(d, selectionRef.current)
    ) {
      const center = voxelSelectionCenter(selectionRef.current);
      if (center) {
        api.setSelectionGizmo({
          pos: center,
          scale: selectionGizmoScale(selectionRef.current),
        });
      } else {
        api.setSelectionGizmo(null);
      }
    } else {
      api.setSelectionGizmo(null);
    }
    api.render();
  };

  const translateSelectedVoxels = (delta: HitCell) => {
    const model = draftRef.current;
    const sel = selectionRef.current;
    if (!model || !sel?.length) return;
    const result = translateVoxelSelection(model, sel, delta);
    if (!result) return;
    applyEdit(result.model);
    changeSelection(result.selection);
  };
  translateSelectedVoxelsRef.current = translateSelectedVoxels;

  onSelMovePreviewRef.current = (delta) => {
    if (!selMoveBaseRef.current) {
      const model = draftRef.current;
      const sel = selectionRef.current;
      if (!model || !sel?.length) return null;
      const clonedSel = cloneVoxelSelectionSet(sel);
      if (!clonedSel) return null;
      selMoveBaseRef.current = {
        model: cloneVoxelModel(model, model.id),
        sel: clonedSel,
      };
    }
    const base = selMoveBaseRef.current;
    const moved = base.sel
      .map((box) =>
        clampVoxelSelection(base.model, {
          x0: box.x0 + delta.x,
          y0: box.y0 + delta.y,
          z0: box.z0 + delta.z,
          x1: box.x1 + delta.x,
          y1: box.y1 + delta.y,
          z1: box.z1 + delta.z,
        }),
      )
      .filter((box): box is VoxelSelection => Boolean(box));
    if (!moved.length) return null;
    const api = apiRef.current;
    if (!api) return null;
    // Preview only the selection/gizmo. Rebuilding the complete model for
    // every pointer delta made large-grid drags allocation-heavy; the actual
    // voxel move and one remesh happen atomically on commit.
    api.setSelection(moved);
    const center = voxelSelectionCenter(moved);
    if (!center) return null;
    return { center, scale: selectionGizmoScale(moved) };
  };
  onSelMoveCommitRef.current = (delta) => {
    const base = selMoveBaseRef.current;
    selMoveBaseRef.current = null;
    if (!base) {
      remeshStudioFromDraft();
      return;
    }
    if (delta.x === 0 && delta.y === 0 && delta.z === 0) {
      remeshStudioFromDraft();
      return;
    }
    const result = translateVoxelSelection(base.model, base.sel, delta);
    if (!result) {
      remeshStudioFromDraft();
      return;
    }
    applyEdit(result.model);
    changeSelection(result.selection);
  };
  onSelMoveCancelRef.current = () => {
    selMoveBaseRef.current = null;
    remeshStudioFromDraft();
  };

  const cycleShapeBrush = () => {
    onShapeCancelRef.current();
    setShapeBrush((cur) => {
      const i = SHAPE_BRUSHES.findIndex((b) => b.id === cur);
      return SHAPE_BRUSHES[(i + 1) % SHAPE_BRUSHES.length]!.id;
    });
    if (toolRef.current !== "add" && toolRef.current !== "erase") {
      setTool("add");
    }
  };

  const frameCamera = () => {
    const api = apiRef.current;
    if (!api) return;
    api.frameCamera();
    api.render();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      // Use e.code (physical key) so shortcuts work on a Russian layout.
      const mod = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;
      const { code } = e;

      if (mod && code === "KeyZ" && !shift) {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && (code === "KeyY" || (code === "KeyZ" && shift))) {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && code === "KeyA" && workspaceMode === "sculpt") {
        e.preventDefault();
        if (draftRef.current) {
          const all = selectEmptyRef.current
            ? selectionAllEmpty(draftRef.current)
            : selectionAll(draftRef.current);
          changeSelection(all ? [all] : null);
        }
        setTool("select");
        return;
      }
      if (mod && code === "KeyD" && workspaceMode === "sculpt") {
        e.preventDefault();
        transformSelection("dup");
        return;
      }

      // Predictable selection modes: Shift+1…6, Shift+0 for empty cells.
      if (workspaceMode === "sculpt" && shift && !mod && !alt) {
        if (code === "Digit0" || code === "Numpad0") {
          e.preventDefault();
          setSelectEmpty((v) => !v);
          setTool("select");
          return;
        }
        if (code === "Digit1" || code === "Numpad1") {
          e.preventDefault();
          activateSelectMode("box");
          return;
        }
        if (code === "Digit2" || code === "Numpad2") {
          e.preventDefault();
          activateSelectMode("layer");
          return;
        }
        if (code === "Digit3" || code === "Numpad3") {
          e.preventDefault();
          activateSelectMode("row");
          return;
        }
        if (code === "Digit4" || code === "Numpad4") {
          e.preventDefault();
          activateSelectMode("col");
          return;
        }
        if (code === "Digit5" || code === "Numpad5") {
          e.preventDefault();
          activateSelectMode("stack");
          return;
        }
        if (code === "Digit6" || code === "Numpad6") {
          e.preventDefault();
          activateSelectMode("linked");
          return;
        }
      }

      if (code === "Escape") {
        if (onShapeCancelRef.current && shapeDragRef.current) {
          e.preventDefault();
          onShapeCancelRef.current();
          return;
        }
        if (hingeActiveRef.current || toolRef.current === "hinge") {
          e.preventDefault();
          cancelHingeRef.current();
          return;
        }
        changeSelection(null);
        return;
      }
      if (code === "Enter" || code === "NumpadEnter") {
        if (onShapeConfirmRef.current()) {
          e.preventDefault();
          return;
        }
      }
      if (code === "KeyF" && !mod && shift) {
        e.preventDefault();
        apiRef.current?.frameExploreCamera();
        return;
      }
      if (code === "KeyF" && !mod && !shift) {
        e.preventDefault();
        frameCamera();
        return;
      }

      const hasSel = Boolean(selectionRef.current?.length);
      if (code === "Delete" || code === "Backspace") {
        if (hasSel) {
          e.preventDefault();
          applySelectionOp("erase");
        }
        return;
      }

      // Model workspace follows familiar DCC keys: B/E/M/V.
      if (workspaceMode === "sculpt" && !mod && !shift && !alt) {
        if (code === "KeyB") {
          clearHingeRef.current();
          setTool("add");
          return;
        }
        if (code === "KeyE") {
          e.preventDefault();
          if (hasSel) applySelectionOp("erase");
          else {
            clearHingeRef.current();
            setTool("erase");
          }
          return;
        }
        if (code === "KeyM") {
          clearHingeRef.current();
          setTool("select");
          return;
        }
        if (code === "KeyV") {
          clearHingeRef.current();
          setTool("move");
          return;
        }
        if (code === "KeyN") {
          e.preventDefault();
          cycleShapeBrush();
          return;
        }
      }

      // Material workspace keeps paint operations together and context-local.
      if (workspaceMode === "material" && !mod && !shift && !alt) {
        if (code === "KeyB") {
          e.preventDefault();
          if (hasSel) applySelectionOp("paint");
          else {
            clearHingeRef.current();
            setTool("paint");
          }
          return;
        }
        if (code === "KeyG") {
          e.preventDefault();
          if (hasSel) applySelectionOp("fill");
          else {
            clearHingeRef.current();
            setTool("fill");
          }
          return;
        }
        if (code === "KeyR") {
          e.preventDefault();
          clearHingeRef.current();
          setTool("replace");
          return;
        }
        if (code === "KeyI") {
          clearHingeRef.current();
          setTool("pick");
          return;
        }
        if (code === "KeyO") {
          clearHingeRef.current();
          setTool("inspect");
          return;
        }
        if (code === "KeyE") {
          e.preventDefault();
          if (hasSel) applySelectionOp("emit");
          else {
            clearHingeRef.current();
            setTool("emit");
          }
          return;
        }
        if (code === "KeyS") {
          e.preventDefault();
          if (hasSel) applySelectionOp("shine");
          else {
            clearHingeRef.current();
            setTool("shine");
          }
          return;
        }
        if (code === "KeyT") {
          e.preventDefault();
          if (hasSel) applySelectionOp("transparency");
          else {
            clearHingeRef.current();
            setTool("transparency");
          }
          return;
        }
        if (code === "KeyU") {
          e.preventDefault();
          if (hasSel) applySelectionOp("transmittance");
          else {
            clearHingeRef.current();
            setTool("transmittance");
          }
          return;
        }
      }

      // Rotation is explicit by axis and no longer hidden behind brackets.
      if (workspaceMode === "sculpt" && alt && !mod && !shift && code === "KeyX") {
        e.preventDefault();
        transformSelection("x");
        return;
      }
      if (workspaceMode === "sculpt" && alt && !mod && !shift && code === "KeyY") {
        e.preventDefault();
        transformSelection("y");
        return;
      }
      if (workspaceMode === "sculpt" && alt && !mod && !shift && code === "KeyZ") {
        e.preventDefault();
        transformSelection("z");
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, histTick, workspaceMode]);

  const loadLibraryModel = (id: string) => {
    const src = pack.voxelModels[id];
    if (!src) return;
    resetHistory();
    setLibLoadId(id);
    if (variantMode && session.mode === "placementVariant") {
      const base = src.nameRu?.trim() || src.id;
      setDraft(
        cloneVoxelModel(
          src,
          draft?.id ?? `_variant_${session.placementId}`,
          draft?.nameRu?.includes("вариант")
            ? draft.nameRu
            : `${base} · вариант`,
        ),
      );
      return;
    }
    const scenes = ensureVoxelScenes(pack.voxelModels, pack.voxelScenes);
    if (scenes[id]) {
      setActiveId(id);
      setActiveObjectId(scenes[id]!.objects[0]?.id ?? "obj0");
      return;
    }
    const hit = Object.values(scenes).find((s) =>
      s.objects.some((o) => o.modelId === id),
    );
    if (hit) {
      setActiveId(hit.id);
      const obj = hit.objects.find((o) => o.modelId === id);
      if (obj) setActiveObjectId(obj.id);
    } else {
      setActiveId(id);
    }
  };

  /**
   * Copy a library model into the *current* draft (same id).
   * Use to start a variation: New 1×1×1 → pick stair → «Взять основу».
   */
  const applyLibraryAsBase = (sourceId: string) => {
    const src = pack.voxelModels[sourceId];
    if (!src || !draft) return;
    if (sourceId === draft.id) return;

    const solidCount = draft.voxels.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
    const looksEdited =
      solidCount > 1 ||
      undoStackRef.current.length > 0 ||
      (draft.nameRu?.trim() &&
        draft.nameRu.trim() !== "Новый блок" &&
        draft.nameRu.trim() !== "Новый вариант");
    if (looksEdited) {
      const srcName = src.nameRu?.trim() || src.id;
      const ok = window.confirm(
        `Заменить содержимое «${draft.nameRu?.trim() || draft.id}» на «${srcName}»?\n` +
          `Id блока сохранится — это основа для вариации. Исходник в библиотеке не изменится.`,
      );
      if (!ok) return;
    }

    const keepName = draft.nameRu?.trim();
    const isPlaceholderName =
      !keepName ||
      keepName === "Новый блок" ||
      keepName === "Новый вариант" ||
      keepName === draft.id;
    const srcLabel = src.nameRu?.trim() || src.id;
    const nextName = isPlaceholderName
      ? `${srcLabel} · вариант`
      : keepName;

    const next = normalizeVoxelModel(
      cloneVoxelModel(src, draft.id, nextName),
    );
    // Keep material the user already set on this draft (if any).
    if (draft.material) next.material = draft.material;

    beginEditRef.current();
    editSnapRef.current = false;
    setDraft(next);
    setLibLoadId(sourceId);
    setSelection(null);
    if (!variantMode) {
      onPackChange(
        packWithVoxels(pack, { ...pack.voxelModels, [next.id]: next }),
      );
    }
    onSaved?.(`Основа: «${srcLabel}» → «${next.nameRu ?? next.id}»`);
  };

  const createModel = () => {
    if (variantMode && session.mode === "placementVariant") {
      const created = stampSolidBlock(
        createEmptyVoxelModel(
          draft?.id ?? `_variant_${session.placementId}`,
          { x: 1, y: 1, z: 1 },
          draft?.nameRu ?? "Новый вариант",
        ),
        1,
      );
      resetHistory();
      setDraft(created);
      return;
    }
    const id = `vox_${Date.now().toString(36)}`;
    const created = stampSolidBlock(
      createEmptyVoxelModel(id, { x: 1, y: 1, z: 1 }, "Новый блок"),
      1,
    );
    const scene = sceneFromSingleModel(id, "Новый блок", id);
    const modelsMap = { ...pack.voxelModels, [id]: created };
    const scenesMap = { ...voxelScenes, [scene.id]: scene };
    setBrowsePicker(false);
    onPackChange(packWithVoxels(pack, modelsMap, scenesMap));
    void writeVoxelRegistry(modelsMap, scenesMap, { dirtyIds: [id] });
    setActiveId(scene.id);
    setActiveObjectId(scene.objects[0]!.id);
    setLibLoadId(id);
    setDraft(created);
    markEditorOpened("voxel", scene.id);
    onActiveModelChange?.(id);
    resetHistory();
  };

  const createCharacter = (
    templateId: EmberVoxelCharacterTemplate,
    style: EmberCharacterArtStyle = "chibi",
  ) => {
    if (variantMode) return;
    const id = newVoxelCharacterId();
    const built = createVoxelCharacter(
      templateId,
      id,
      characterPresetNameRu(templateId, style),
      style,
    );
    const modelsMap = { ...pack.voxelModels, ...built.models };
    const scenesMap = { ...voxelScenes, [built.scene.id]: built.scene };
    const pelvis = built.scene.objects.find((o) => o.id === "obj_pelvis");
    const pelvisModel = pelvis ? built.models[pelvis.modelId] : undefined;
    setBrowsePicker(false);
    onPackChange(packWithVoxels(pack, modelsMap, scenesMap));
    void writeVoxelRegistry(modelsMap, scenesMap, {
      dirtyIds: [built.scene.id, ...Object.keys(built.models)],
    });
    setActiveId(built.scene.id);
    setActiveObjectId(pelvis?.id ?? built.scene.objects[0]!.id);
    setLibLoadId(pelvis?.modelId ?? "");
    if (pelvisModel) setDraft(pelvisModel);
    setShowPlayerCapsule(true);
    markEditorOpened("voxel", built.scene.id);
    onActiveModelChange?.(pelvis?.modelId ?? id);
    resetHistory();
    onSaved?.(characterPresetToastRu(templateId, style));
  };

  const deleteLibraryModel = () => {
    if (variantMode || !draft) return;
    const scene = activeScene;
    const ids = new Set<string>();
    if (scene && isCharacterScene(scene)) {
      ids.add(scene.id);
      for (const object of scene.objects) ids.add(object.modelId);
    } else {
      ids.add(draft.id);
    }
    const usage = [...ids].reduce(
      (sum, id) => sum + countLibraryAssetReferences(pack, "voxel", id),
      0,
    );
    const label = scene?.nameRu || draft.nameRu || draft.id;
    const extra = usage
      ? `\nНа картах есть ${usage} ссылок — экземпляры нужно убрать отдельно.`
      : "";
    if (
      !window.confirm(
        `Удалить «${label}» из библиотеки? Файлы модели будут стёрты.${extra}`,
      )
    ) {
      return;
    }
    const modelsMap = { ...pack.voxelModels };
    const scenesMap = { ...voxelScenes };
    for (const id of ids) {
      delete modelsMap[id];
      delete scenesMap[id];
    }
    const nextId =
      Object.keys(scenesMap)[0] ?? Object.keys(modelsMap)[0] ?? null;
    onPackChange(packWithVoxels(pack, modelsMap, scenesMap));
    void writeVoxelRegistry(modelsMap, scenesMap, { deletedIds: [...ids] }).then(
      (res) => {
        onSaved?.(
          res.ok
            ? `Удалено из библиотеки: ${label}`
            : `Удаление: ${res.error}`,
        );
      },
    );
    if (nextId) {
      setActiveId(nextId);
      const nextScene = scenesMap[nextId];
      const nextModel =
        modelsMap[nextId] ??
        (nextScene ? modelsMap[nextScene.objects[0]?.modelId ?? ""] : undefined);
      setActiveObjectId(nextScene?.objects[0]?.id ?? "obj0");
      setLibLoadId(nextModel?.id ?? "");
      if (nextModel) setDraft(nextModel);
      markEditorOpened("voxel", nextId);
      onActiveModelChange?.(nextModel?.id ?? nextId);
    } else {
      setActiveId("");
      setActiveObjectId("obj0");
      setDraft(null);
      setBrowsePicker(true);
    }
    resetHistory();
  };

  const exportDraftVox = () => {
    if (!draft) return;
    try {
      downloadVoxBytes(`${draft.id}.vox`, encodeEmberModelToVox(draft));
      onSaved?.(
        `Экспорт MagicaVoxel: ${draft.id}.vox (форма и палитра; свет остаётся в JSON)`,
      );
    } catch (err) {
      onSaved?.(
        `Экспорт .vox: ${err instanceof Error ? err.message : "ошибка"}`,
      );
    }
  };

  const importVoxFile = async (
    file: File,
    mode: "replace" | "new",
  ) => {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch (err) {
      onSaved?.(
        `Импорт .vox: ${err instanceof Error ? err.message : "не удалось прочитать файл"}`,
      );
      return;
    }
    try {
      if (voxDocumentExceedsEmberGrid(bytes)) {
        const ok = window.confirm(
          `«${file.name}» больше лимита Ember (128³). Лишние воксели обрежутся. Продолжить?`,
        );
        if (!ok) return;
      }
    } catch (err) {
      onSaved?.(
        `Импорт .vox: ${err instanceof Error ? err.message : "файл не читается"}`,
      );
      return;
    }

    const replaceCurrent = mode === "replace" && draft && !variantMode;
    const replaceVariant = mode === "replace" && draft && variantMode;
    if (replaceCurrent || replaceVariant) {
      const srcName = draft.nameRu?.trim() || draft.id;
      const ok = window.confirm(
        `Заменить сетку «${srcName}» из MagicaVoxel?\n` +
          `Коллизия и свет объекта сохранятся. Форма и палитра — из .vox.`,
      );
      if (!ok) return;
      try {
        const next = applyVoxBytesToEmberModel(draft, bytes);
        applyEdit(next);
        setSelection(null);
        onSaved?.(`Импорт .vox → «${next.nameRu ?? next.id}»`);
      } catch (err) {
        onSaved?.(
          `Импорт .vox: ${err instanceof Error ? err.message : "ошибка"}`,
        );
      }
      return;
    }

    if (variantMode && session.mode === "placementVariant") {
      try {
        const next = applyVoxBytesToEmberModel(
          draft ??
            createEmptyVoxelModel(
              `_variant_${session.placementId}`,
              { x: 1, y: 1, z: 1 },
              "Новый вариант",
            ),
          bytes,
        );
        resetHistory();
        setDraft(next);
        setSelection(null);
        onSaved?.(`Импорт .vox → вариант «${next.nameRu ?? next.id}»`);
      } catch (err) {
        onSaved?.(
          `Импорт .vox: ${err instanceof Error ? err.message : "ошибка"}`,
        );
      }
      return;
    }

    try {
      const id = `vox_${Date.now().toString(36)}`;
      const nameRu = nameRuFromVoxFileName(file.name);
      const created = normalizeVoxelModel({
        ...decodeVoxToEmberModel(bytes, id, nameRu),
        physical: true,
      });
      const scene = sceneFromSingleModel(id, nameRu, id);
      const modelsMap = { ...pack.voxelModels, [id]: created };
      const scenesMap = { ...voxelScenes, [scene.id]: scene };
      setBrowsePicker(false);
      onPackChange(packWithVoxels(pack, modelsMap, scenesMap));
      void writeVoxelRegistry(modelsMap, scenesMap, { dirtyIds: [id] });
      setActiveId(scene.id);
      setActiveObjectId(scene.objects[0]!.id);
      setLibLoadId(id);
      setDraft(created);
      markEditorOpened("voxel", scene.id);
      onActiveModelChange?.(id);
      resetHistory();
      setSelection(null);
      onSaved?.(`Импорт .vox → «${nameRu}»`);
    } catch (err) {
      onSaved?.(
        `Импорт .vox: ${err instanceof Error ? err.message : "ошибка"}`,
      );
    }
  };

  const onVoxFileChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void importVoxFile(file, voxImportModeRef.current);
  };

  const openVoxImporter = (mode: "replace" | "new") => {
    voxImportModeRef.current = mode;
    voxFileRef.current?.click();
  };

  const commitScene = (nextScene: EmberVoxelScene, modelsExtra?: Record<string, EmberVoxelModel>) => {
    const modelsMap = {
      ...pack.voxelModels,
      ...(modelsExtra ?? {}),
      ...(draft ? { [draft.id]: normalizeVoxelModel(draft) } : {}),
    };
    const scenesMap = { ...voxelScenes, [nextScene.id]: nextScene };
    onPackChange(packWithVoxels(pack, modelsMap, scenesMap));
    void writeVoxelRegistry(modelsMap, scenesMap, {
      dirtyIds: [
        nextScene.id,
        ...nextScene.objects.map((object) => object.modelId),
        ...(draft ? [draft.id] : []),
      ],
    }).then((res) => {
      if (!res.ok) onSaved?.(`Сцена: ошибка — ${res.error}`);
    });
  };
  commitSceneRef.current = commitScene;

  onHingeCellPickRef.current = (cell: HitCell) => {
    const scene = activeSceneRef.current;
    if (!scene) return;
    const pivot = { x: cell.x, y: cell.y, z: cell.z };
    const parentId = hingeParentIdRef.current;
    const childId = hingeChildIdRef.current;
    if (!parentId || !childId || parentId === childId) {
      onSaved?.(
        "Петля: в сайдбаре выберите два разных объекта (родитель и дочерний)",
      );
      return;
    }

    if (hingePickStepRef.current !== "child" || !hingeDraftRef.current) {
      // Parent pivot — ensure we sculpt/pick the parent mesh.
      if (activeObjectIdRef.current !== parentId) {
        setActiveObjectId(parentId);
        onSaved?.("Петля: переключились на родителя — кликните пивот ещё раз");
        return;
      }
      hingeDraftRef.current = { parentObjectId: parentId, parentPivot: pivot };
      setHingePickStep("child");
      setActiveObjectId(childId);
      const childName =
        scene.objects.find((o) => o.id === childId)?.nameRu?.trim() || childId;
      onSaved?.(`Петля: теперь кликните пивот на «${childName}»`);
      return;
    }

    if (activeObjectIdRef.current !== childId) {
      setActiveObjectId(childId);
      onSaved?.("Петля: переключились на дочерний — кликните пивот ещё раз");
      return;
    }

    const draftH = hingeDraftRef.current;
    const jointId = newVoxelJointId();
    const next = upsertSceneJoint(scene, {
      id: jointId,
      nameRu: "Петля",
      parentObjectId: draftH.parentObjectId,
      childObjectId: childId,
      parentPivot: draftH.parentPivot,
      childPivot: pivot,
      axis: hingeAxisRef.current,
    });
    hingeDraftRef.current = null;
    hingeActiveRef.current = false;
    setHingeActive(false);
    setHingePickStep(null);
    setHingeParentId(null);
    setHingeChildId(null);
    setSelectedJointId(jointId);
    commitScene(next);
    setTool("select");
    onSaved?.("Петля создана");
  };

  const addObjectFromLibrary = () => {
    if (!activeScene || !libLoadId || !pack.voxelModels[libLoadId]) return;
    const src = pack.voxelModels[libLoadId]!;
    const objId = newVoxelSceneObjectId();
    const next = upsertSceneObject(activeScene, {
      id: objId,
      nameRu: src.nameRu,
      modelId: src.id,
      offset: {
        x: (activeObject?.offset.x ?? 0) + voxelGridSize(src).sx + 1,
        y: activeObject?.offset.y ?? 0,
        z: activeObject?.offset.z ?? 0,
      },
      visible: true,
    });
    commitScene(next);
    setActiveObjectId(objId);
    onSaved?.(`Объект «${src.nameRu ?? src.id}» добавлен в блок`);
  };

  const createAnimClip = () => {
    if (!activeScene) return;
    const id = newVoxelAnimClipId();
    const next = upsertAnimClip(activeScene, {
      id,
      nameRu: "Клип",
      durationSec: 0.8,
      tracks: [],
    });
    commitScene(next);
    setAnimClipId(id);
  };

  const addAnimKey = () => {
    if (!activeScene || !animClipId || !selectedJointId) return;
    const next = upsertAnimKey(activeScene, animClipId, selectedJointId, {
      t: animPlayhead,
      angleDeg: keyAngleDeg,
    });
    commitScene(next);
  };

  const deleteAnimKey = (t: number) => {
    if (!activeScene || !animClipId || !selectedJointId) return;
    commitScene(removeAnimKey(activeScene, animClipId, selectedJointId, t));
  };

  const relocateAnimKey = (fromT: number, toT: number) => {
    if (!activeScene || !animClipId || !selectedJointId) return;
    commitScene(
      moveAnimKey(activeScene, animClipId, selectedJointId, fromT, toT),
    );
  };

  const setAnimDurationSec = (sec: number) => {
    if (!activeScene || !animClipId) return;
    commitScene(patchAnimClip(activeScene, animClipId, { durationSec: sec }));
  };

  const selectSceneObject = (
    objectId: string,
    modifiers: { toggle: boolean; range: boolean },
  ) => {
    if (!activeScene) return;
    const orderedIds = activeScene.objects.map((object) => object.id);
    if (!orderedIds.includes(objectId)) return;
    const anchor = objectSelectionAnchorRef.current;
    if (modifiers.range && anchor && orderedIds.includes(anchor)) {
      const from = orderedIds.indexOf(anchor);
      const to = orderedIds.indexOf(objectId);
      const range = orderedIds.slice(Math.min(from, to), Math.max(from, to) + 1);
      setSelectedObjectIds(
        modifiers.toggle
          ? [...new Set([...selectedSceneObjectIds, ...range])]
          : range,
      );
      setActiveObjectId(objectId);
      return;
    }
    objectSelectionAnchorRef.current = objectId;
    if (modifiers.toggle) {
      const next = selectedSceneObjectIds.includes(objectId)
        ? selectedSceneObjectIds.filter((id) => id !== objectId)
        : [...selectedSceneObjectIds, objectId];
      const safeNext = next.length ? next : [objectId];
      setSelectedObjectIds(safeNext);
      setActiveObjectId(
        safeNext.includes(objectId)
          ? objectId
          : safeNext[safeNext.length - 1]!,
      );
      return;
    }
    setSelectedObjectIds([objectId]);
    setActiveObjectId(objectId);
  };

  const duplicateSelectedSceneObjects = () => {
    if (!activeScene || !selectedSceneObjectIds.length) return;
    const orderedSelected = activeScene.objects
      .filter((object) => selectedSceneObjectIds.includes(object.id))
      .map((object) => object.id);
    const result = duplicateVoxelSceneSelection(
      activeScene,
      selectedSceneObjectIds,
    );
    if (!result.objectIds.length) return;
    commitScene(result.scene);
    const primaryIndex = Math.max(0, orderedSelected.indexOf(activeObjectId));
    const primaryId = result.objectIds[primaryIndex] ?? result.objectIds[0]!;
    setSelectedObjectIds(result.objectIds);
    setActiveObjectId(primaryId);
    objectSelectionAnchorRef.current = primaryId;
    onSaved?.(
      result.objectIds.length === 1
        ? "Объект продублирован"
        : `Продублировано объектов: ${result.objectIds.length}`,
    );
  };

  const removableSelectedObjectIds = activeScene
    ? selectedSceneObjectIds.filter(
        (objectId) =>
          !isCharacterScene(activeScene) ||
          !isLockedCharacterObject(activeScene, objectId),
      )
    : [];
  const canRemoveSelectedObjects = Boolean(
    activeScene &&
      removableSelectedObjectIds.length > 0 &&
      activeScene.objects.length - removableSelectedObjectIds.length >= 1,
  );

  const removeSelectedSceneObjects = () => {
    if (!activeScene || !canRemoveSelectedObjects) return;
    const next = removeVoxelSceneSelection(
      activeScene,
      removableSelectedObjectIds,
    );
    if (next === activeScene) return;
    commitScene(next);
    const nextActive =
      next.objects.find((object) => !removableSelectedObjectIds.includes(object.id)) ??
      next.objects[0];
    setActiveObjectId(nextActive?.id ?? "obj0");
    setSelectedObjectIds(nextActive ? [nextActive.id] : []);
    objectSelectionAnchorRef.current = nextActive?.id ?? null;
    if (selectedJointId && !(next.joints ?? []).some((j) => j.id === selectedJointId)) {
      setSelectedJointId(next.joints?.[0]?.id ?? null);
    }
    const lockedCount =
      selectedSceneObjectIds.length - removableSelectedObjectIds.length;
    onSaved?.(
      lockedCount
        ? `Убрано: ${removableSelectedObjectIds.length}; слоты шаблона сохранены: ${lockedCount}`
        : removableSelectedObjectIds.length === 1
          ? "Объект убран из сцены"
          : `Убрано объектов: ${removableSelectedObjectIds.length}`,
    );
  };

  const startHingeJoint = () => {
    if (!activeScene || activeScene.objects.length < 2) {
      onSaved?.(
        "Петля: нужно ≥2 объекта в сцене — «Отделить» или «+ Объект»",
      );
      return;
    }
    const objs = activeScene.objects;
    const parent =
      activeObject?.id && objs.some((o) => o.id === activeObject.id)
        ? activeObject.id
        : objs[0]!.id;
    const child = objs.find((o) => o.id !== parent)?.id ?? null;
    hingeDraftRef.current = null;
    setHingeActive(true);
    hingeActiveRef.current = true;
    setHingeParentId(parent);
    setHingeChildId(child);
    setActiveObjectId(parent);
    setHingePickStep("parent");
    setTool("hinge");
    const pName =
      objs.find((o) => o.id === parent)?.nameRu?.trim() || parent;
    onSaved?.(
      `Петля: выберите объекты в сайдбаре, затем кликните вершину на «${pName}»`,
    );
  };

  const cancelHingeJoint = () => {
    hingeDraftRef.current = null;
    hingePickStepRef.current = null;
    hingeActiveRef.current = false;
    hingeParentIdRef.current = null;
    hingeChildIdRef.current = null;
    setHingeActive(false);
    setHingePickStep(null);
    setHingeParentId(null);
    setHingeChildId(null);
    toolRef.current = "select";
    setTool("select");
    onSaved?.("Режим петли выключен");
  };
  cancelHingeRef.current = cancelHingeJoint;

  const clearHingeIfNeeded = () => {
    if (!hingeActiveRef.current && toolRef.current !== "hinge") return;
    hingeDraftRef.current = null;
    hingePickStepRef.current = null;
    hingeActiveRef.current = false;
    hingeParentIdRef.current = null;
    hingeChildIdRef.current = null;
    setHingeActive(false);
    setHingePickStep(null);
    setHingeParentId(null);
    setHingeChildId(null);
  };
  clearHingeRef.current = clearHingeIfNeeded;

  const deleteSelectedJoint = () => {
    if (!activeScene || !selectedJointId) return;
    const next = removeSceneJoint(activeScene, selectedJointId);
    commitScene(next);
    setSelectedJointId(next.joints?.[0]?.id ?? null);
    onSaved?.("Петля удалена");
  };

  const deleteAllJoints = () => {
    if (!activeScene) return;
    const n = activeScene.joints?.length ?? 0;
    if (n === 0) {
      cancelHingeJoint();
      return;
    }
    commitScene(clearSceneJoints(activeScene));
    setSelectedJointId(null);
    cancelHingeJoint();
    onSaved?.(n === 1 ? "Петля сброшена" : `Сброшено петель: ${n}`);
  };

  const separateSelection = () => {
    if (!draft || !selection?.length || !activeScene || !activeObject) return;
    const expanded = expandSelectionWithMirror(
      draft,
      selection,
      mirrorAxes,
    );
    const newId = `vox_${Date.now().toString(36)}`;
    const baseName = draft.nameRu?.trim() || draft.id;
    const extracted = extractSelectionToModel(
      draft,
      expanded,
      newId,
      `${baseName} · часть`,
    );
    if (!extracted) {
      onSaved?.("Отделить: в выделении нет вокселей");
      return;
    }
    beginEditRef.current();
    editSnapRef.current = false;
    const erased = editVoxelSelection(draft, expanded, "erase", 1, 0);
    setDraft(erased);
    setSelection(null);
    const objId = newVoxelSceneObjectId();
    const offset = {
      x: activeObject.offset.x + extracted.originOffset.x,
      y: activeObject.offset.y + extracted.originOffset.y,
      z: activeObject.offset.z + extracted.originOffset.z,
    };
    let nextScene = upsertSceneObject(activeScene, {
      id: objId,
      nameRu: extracted.model.nameRu,
      modelId: extracted.model.id,
      offset,
      visible: true,
    });
    // Keep source object pointing at erased draft after save.
    nextScene = patchSceneObject(nextScene, activeObject.id, {
      modelId: erased.id,
    });
    const modelsMap = {
      ...pack.voxelModels,
      [erased.id]: erased,
      [extracted.model.id]: extracted.model,
    };
    const scenesMap = { ...voxelScenes, [nextScene.id]: nextScene };
    skipPackSyncRef.current = true;
    lastSavedJsonRef.current = JSON.stringify(normalizeVoxelModel(erased));
    onPackChange(packWithVoxels(pack, modelsMap, scenesMap));
    void writeVoxelRegistry(modelsMap, scenesMap, {
      dirtyIds: [erased.id, extracted.model.id, nextScene.id],
    });
    setActiveObjectId(objId);
    setDraft(extracted.model);
    lastSavedJsonRef.current = JSON.stringify(
      normalizeVoxelModel(extracted.model),
    );
    onSaved?.(
      `Отделено «${extracted.model.nameRu ?? extracted.model.id}»`,
    );
  };

  const resizeBlocks = (axis: "x" | "z", value: number) => {
    if (!draft) return;
    const sizeBlocks = {
      ...draft.sizeBlocks,
      [axis]: Math.max(1, Math.min(4, value)),
    };
    applyEdit(resizeVoxelModel(draft, sizeBlocks, draft.heightVoxels));
  };

  const resizeHeightVoxels = (voxels: number) => {
    if (!draft) return;
    const hv = Math.max(1, Math.min(64, Math.round(voxels)));
    const sizeBlocks = {
      ...draft.sizeBlocks,
      y: Math.max(1, Math.ceil(hv / VOXELS_PER_BLOCK)),
    };
    applyEdit(resizeVoxelModel(draft, sizeBlocks, hv));
  };

  const setPaletteColor = (index: number, hex: string) => {
    if (!draft || index <= 0) return;
    const palette = [...draft.palette];
    palette[index] = hex;
    applyEdit({ ...draft, palette });
  };

  const remapPaletteIndex = (fromIndex: number, toIndex: number) => {
    if (!draft) return;
    const next = replaceVoxelPaletteIndex(
      draft,
      fromIndex,
      toIndex,
      selection,
    );
    if (next !== draft) applyEdit(next);
  };

  const previewPaletteColor = (index: number, hex: string) => {
    apiRef.current?.previewPaletteColor(index, hex);
  };

  const addPaletteColor = () => {
    if (!draft) return;
    if (draft.palette.length >= MAX_VOXEL_PALETTE) {
      onSaved?.("Палитра: максимум 255 цветов");
      return;
    }
    const palette = [...draft.palette, "#ffb060"];
    applyEdit({ ...draft, palette });
    setPaletteIndex(palette.length - 1);
    setTool("paint");
  };

  void histTick;
  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    const currentPack = packRef.current;
    if (session.mode === "placementVariant") {
      const newId = newVoxelVariantId();
      const saved = cloneVoxelModel(
        normalizeVoxelModel(draft),
        newId,
        draft.nameRu?.trim() || newId,
      );
      // Never overwrite the shared source model id.
      const modelsMap = {
        ...(currentPack.voxelModels ?? {}),
        [newId]: saved,
      };
      const scenesMap = ensureVoxelScenes(modelsMap, currentPack.voxelScenes);
      const res = await writeVoxelRegistry(modelsMap, scenesMap, {
        dirtyIds: [newId],
      });
      setSaving(false);
      if (!res.ok) {
        onSaved?.(`Воксели: ошибка сохранения — ${res.error}`);
        return false;
      }
      onPackChange(packWithVoxels(currentPack, modelsMap, scenesMap));
      onSavedVariant?.({ model: saved, placementId: session.placementId });
      onSaved?.(
        `Вариант «${saved.nameRu ?? saved.id}» сохранён в библиотеку`,
      );
      onClose?.();
      return true;
    }

    const normalized = fitVoxelPalette(normalizeVoxelModel(draft));
    const modelsMap = {
      ...(currentPack.voxelModels ?? {}),
      [normalized.id]: normalized,
    };
    const scenesMap = { ...voxelScenes };
    noteOwnVoxWrite();
    const res = await writeVoxelRegistry(modelsMap, scenesMap, {
      dirtyIds: [normalized.id],
    });
    setSaving(false);
    if (!res.ok) {
      onSaved?.(`Воксели: ошибка сохранения — ${res.error}`);
      return false;
    }
    lastSavedJsonRef.current = JSON.stringify(normalized);
    skipPackSyncRef.current = true;
    persistHistSession(normalized);
    onPackChange(packWithVoxels(currentPack, modelsMap, scenesMap));
    onSaved?.(`Воксели «${normalized.nameRu ?? normalized.id}» сохранены`);
    return true;
  };

  useEffect(() => {
    if (!sculptMenu) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest(".ember-voxel-sculpt__menu")) return;
      setSculptMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSculptMenu(null);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [sculptMenu]);

  const canOpenMagicaVoxel = Boolean(window.joiDesktop?.ember?.openPath);

  const openInMagicaVoxel = async () => {
    if (!draft || variantMode) return;
    const desktop = window.joiDesktop?.ember;
    if (!desktop?.openPath) {
      onSaved?.(
        "Открыть MagicaVoxel можно в приложении Electron. Назначьте .vox на MagicaVoxel.",
      );
      return;
    }
    const ok = await save();
    if (!ok) return;
    const rel = voxelVoxRel(draft.id);
    const exists = await readEmberBytes(rel);
    if (!exists.ok) {
      onSaved?.(
        `Нет файла ${rel} — сохраните модель, затем откройте снова`,
      );
      return;
    }
    noteOwnVoxWrite();
    const res = await desktop.openPath(rel);
    if (!res.ok) {
      onSaved?.(
        `Не открылся ${rel}: ${res.detail ?? "ошибка"}. Назначьте MagicaVoxel программой по умолчанию для .vox`,
      );
      return;
    }
    onSaved?.(
      "MagicaVoxel: сохрани там .vox — Ember подхватит сетку, свет останется в JSON",
    );
  };

  const grid = draft ? voxelGridSize(draft) : null;
  const activeColor = draft?.palette[paletteIndex] || "#888888";
  const libraryRel = draft
    ? pack.voxelLibraryFiles?.[draft.id] ??
      assignVoxelShard(draft.id, pack.voxelLibraryFiles ?? {})
    : null;
  const activeWorkspace =
    VOXEL_WORKSPACES.find((item) => item.id === workspaceMode) ??
    VOXEL_WORKSPACES[0];
  const visibleToolButtons = TOOL_BUTTONS.filter((item) =>
    WORKSPACE_TOOLS[workspaceMode].includes(item.id),
  );
  const selectedVoxelCount = selection ? countSelectionCells(selection) : 0;

  const activateWorkspace = (next: VoxelWorkspaceMode) => {
    setWorkspaceMode(next);
    const allowed = WORKSPACE_TOOLS[next];
    if (!allowed.includes(tool)) {
      clearHingeIfNeeded();
      const nextTool =
        VOXEL_WORKSPACES.find((item) => item.id === next)?.defaultTool ?? "add";
      setTool(nextTool);
    }
  };

  const openPickedModel = (id: string) => {
    if (!pack.voxelModels[id]) return;
    setBrowsePicker(false);
    setActiveId(id);
    setLibLoadId(id);
    markEditorOpened("voxel", id);
    onActiveModelChange?.(id);
  };

  return (
    <div
      className={[
        "ember-voxel-sculpt",
        onClose ? "ember-voxel-sculpt--modal" : "ember-voxel-sculpt--page",
      ].join(" ")}
    >
      <input
        ref={voxFileRef}
        type="file"
        accept=".vox,application/octet-stream"
        hidden
        onChange={onVoxFileChosen}
      />
      {showOpenPicker ? (
        <div className="ember-ed-open-picker ember-ed-open-picker--overlay">
          <div className="ember-ed-open-picker__shell">
            <header className="ember-ed-open-picker__hero">
              <div className="ember-ed-open-picker__hero-text">
                <p className="ember-ed-open-picker__eyebrow">Воксели</p>
                <h3 className="ember-ed-open-picker__title">Открыть модель</h3>
                <p className="muted ember-ed-open-picker__hint">
                  Выберите объект для редактирования. В следующий раз откроется
                  последний выбранный.
                </p>
              </div>
              <div className="ember-ed-open-picker__hero-actions">
                {activeId ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setBrowsePicker(false)}
                  >
                    Отмена
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ghost"
                  title="Новый объект из MagicaVoxel .vox"
                  onClick={() => openVoxImporter("new")}
                >
                  Импорт .vox
                </button>
                <button
                  type="button"
                  className="primary ember-ed-open-picker__create"
                  onClick={() => {
                    setBrowsePicker(false);
                    createModel();
                  }}
                >
                  Создать новую
                </button>
              </div>
            </header>

            <label className="ember-ed-open-picker__search">
              <input
                type="search"
                    placeholder="Поиск по имени, id или тегу…"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                autoFocus
                aria-label="Поиск моделей"
              />
            </label>

            <div className="ember-ed-open-picker__scroll">
              <EmberThumbGrid
                size="md"
                className="ember-ed-open-picker__thumbs"
                selectedId={null}
                onSelect={openPickedModel}
                items={pickerItems}
                empty={
                  <p className="muted ember-hint">
                    {pickerQuery.trim()
                      ? "Ничего не найдено"
                      : "Библиотека пуста — создайте модель"}
                  </p>
                }
              />
            </div>
          </div>
        </div>
      ) : null}
      <header className="ember-voxel-sculpt__head">
        <div className="ember-voxel-sculpt__head-title">
          <p className="ember-map-lightpanel__eyebrow">Воксели</p>
          <h3>
            {variantMode
              ? "Вариант объекта на карте"
              : "Редактор вокселей"}
          </h3>
          {libraryRel ? (
            <p
              className="muted ember-voxel-sculpt__head-file"
              title={libraryRel}
            >
              файл: {formatVoxelShardLabel(libraryRel)}
            </p>
          ) : null}
        </div>

        <div
          className="ember-voxel-sculpt__chrome"
          role="toolbar"
          aria-label="Правка и сохранение"
        >
          <div className="ember-voxel-sculpt__chrome-group">
            <button
              type="button"
              className="ghost"
              disabled={!canUndo}
              title="Отменить (Ctrl+Z)"
              onClick={undo}
            >
              ↩
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!canRedo}
              title="Повторить (Ctrl+Y)"
              onClick={redo}
            >
              ↪
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft}
              title="Центр камеры (F)"
              onClick={frameCamera}
            >
              Кадр
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft}
              title="Камера как в explore play: iso 0.95, юго-восток (Shift+F)"
              onClick={() => apiRef.current?.frameExploreCamera()}
            >
              Игра
            </button>
            <button
              type="button"
              className={`ghost ${showVoxelGrid ? "is-on" : ""}`}
              disabled={!draft}
              aria-pressed={showVoxelGrid}
              title="Сетка вокселей на поверхности объекта"
              onClick={() => setShowVoxelGrid((v) => !v)}
            >
              Сетка
            </button>
            <button
              type="button"
              className={`ghost ${showPlayerCapsule ? "is-on" : ""}`}
              disabled={!draft}
              aria-pressed={showPlayerCapsule}
              title={
                isCharacterScene(activeScene)
                  ? "Капсула персонажа (4.5×22 vx) на стопах · волосы снаружи"
                  : draft?.physical === false
                    ? "Капсула игрока (2.5×12 vx) · модель walk-through"
                    : "Капсула игрока (2.5×12 vx) рядом с моделью"
              }
              onClick={() => setShowPlayerCapsule((v) => !v)}
            >
              Капсула
            </button>
            <button
              type="button"
              className={`ghost ${showPreviewEmissiveLight ? "is-on" : ""}`}
              disabled={!draft?.emissiveCastsLight}
              aria-pressed={showPreviewEmissiveLight}
              title="Превью PointLight от emissive-вокселей в студии (не влияет на карту)"
              onClick={() => setShowPreviewEmissiveLight((v) => !v)}
            >
              Свет
            </button>
          </div>

          <div
            className="ember-voxel-sculpt__chrome-group"
            role="toolbar"
            aria-label="Зеркальное редактирование"
          >
            <span
              className="ember-voxel-sculpt__chrome-label"
              title="Симметрия при рисовании — как в Blender"
            >
              Зерк.
            </span>
            <button
              type="button"
              className={`ghost ${mirrorAxes.x ? "is-on" : ""}`}
              disabled={!draft}
              aria-pressed={mirrorAxes.x}
              title="Зеркальное редактирование по X"
              onClick={() => toggleMirror("x")}
            >
              X
            </button>
            <button
              type="button"
              className={`ghost ${mirrorAxes.y ? "is-on" : ""}`}
              disabled={!draft}
              aria-pressed={mirrorAxes.y}
              title="Зеркальное редактирование по Y"
              onClick={() => toggleMirror("y")}
            >
              Y
            </button>
            <button
              type="button"
              className={`ghost ${mirrorAxes.z ? "is-on" : ""}`}
              disabled={!draft}
              aria-pressed={mirrorAxes.z}
              title="Зеркальное редактирование по Z"
              onClick={() => toggleMirror("z")}
            >
              Z
            </button>
          </div>

          <div className="ember-voxel-sculpt__chrome-actions">
            <SculptBarMenu
              id="edit"
              label="Правка"
              title="Переворот, заливка, очистка, автосохранение"
              openId={sculptMenu}
              onOpen={setSculptMenu}
            >
              <button
                type="button"
                role="menuitem"
                className="ember-voxel-sculpt__menu-item"
                disabled={!draft}
                onClick={() => {
                  if (draft) applyEdit(flipVoxelModel(draft, "x"));
                  setSculptMenu(null);
                }}
              >
                Перевернуть X
              </button>
              <button
                type="button"
                role="menuitem"
                className="ember-voxel-sculpt__menu-item"
                disabled={!draft}
                onClick={() => {
                  if (draft) applyEdit(flipVoxelModel(draft, "y"));
                  setSculptMenu(null);
                }}
              >
                Перевернуть Y
              </button>
              <button
                type="button"
                role="menuitem"
                className="ember-voxel-sculpt__menu-item"
                disabled={!draft}
                onClick={() => {
                  if (draft) applyEdit(flipVoxelModel(draft, "z"));
                  setSculptMenu(null);
                }}
              >
                Перевернуть Z
              </button>
              <div className="ember-voxel-sculpt__menu-sep" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="ember-voxel-sculpt__menu-item"
                disabled={!draft}
                onClick={() => {
                  if (draft) applyEdit(stampSolidBlock(draft, paletteIndex));
                  setSculptMenu(null);
                }}
              >
                Залить куб
              </button>
              <button
                type="button"
                role="menuitem"
                className="ember-voxel-sculpt__menu-item ember-danger"
                disabled={!draft}
                onClick={() => {
                  if (draft) applyEdit(clearVoxelModel(draft));
                  setSculptMenu(null);
                }}
              >
                Очистить воксели
              </button>
            </SculptBarMenu>
            <SculptBarMenu
              id="file"
              label="Файл"
              title="Библиотека и обмен с MagicaVoxel"
              openId={sculptMenu}
              onOpen={setSculptMenu}
            >
              {!variantMode ? (
                <button
                  type="button"
                  role="menuitem"
                  className="ember-voxel-sculpt__menu-item"
                  onClick={() => {
                    openVoxImporter("new");
                    setSculptMenu(null);
                  }}
                >
                  Импорт .vox
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="ember-voxel-sculpt__menu-item"
                disabled={!draft}
                onClick={() => {
                  openVoxImporter("replace");
                  setSculptMenu(null);
                }}
              >
                Заменить из .vox
              </button>
              <button
                type="button"
                role="menuitem"
                className="ember-voxel-sculpt__menu-item"
                disabled={!draft}
                onClick={() => {
                  exportDraftVox();
                  setSculptMenu(null);
                }}
              >
                Скачать .vox
              </button>
              <button
                type="button"
                role="menuitem"
                className="ember-voxel-sculpt__menu-item"
                disabled={!draft || variantMode || !canOpenMagicaVoxel}
                title={
                  canOpenMagicaVoxel
                    ? "Открыть voxels/models/<id>.vox в MagicaVoxel. Сохрани там — Ember подхватит сетку."
                    : "Только в Electron: откроет .vox в MagicaVoxel и будет следить за файлом"
                }
                onClick={() => {
                  void openInMagicaVoxel();
                  setSculptMenu(null);
                }}
              >
                Открыть MagicaVoxel
              </button>
            </SculptBarMenu>
            {!variantMode && !onClose && models.length > 0 ? (
              <button
                type="button"
                className="ghost"
                title="Открыть библиотеку и выбрать другой объект"
                onClick={() => {
                  setBrowsePicker(true);
                  setSculptMenu(null);
                }}
              >
                Меню
              </button>
            ) : null}
            {!variantMode ? (
              <button
                type="button"
                className={`ghost ember-voxel-sculpt__autosave ${autoSave ? "is-on" : ""}`}
                disabled={!draft}
                aria-pressed={autoSave}
                title="Автосохранение в библиотеку · история ходов в сессии (Ctrl+Z)"
                onClick={() => {
                  setAutoSave((v) => {
                    const next = !v;
                    try {
                      sessionStorage.setItem(
                        "ember-voxel-autosave",
                        next ? "1" : "0",
                      );
                    } catch {
                      /* ignore */
                    }
                    return next;
                  });
                }}
              >
                {autoSave ? "Авто · вкл" : "Авто · выкл"}
              </button>
            ) : null}
            <button
              type="button"
              className="primary"
              disabled={!draft || saving}
              onClick={() => void save()}
            >
              {saving
                ? "…"
                : variantMode
                  ? "Сохранить как новый"
                  : "Сохранить"}
            </button>
            {onClose ? (
              <button type="button" className="ghost" onClick={onClose}>
                Закрыть
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {variantMode ? (
        <p className="ember-voxel-sculpt__banner">
          Сохранить как новый объект в библиотеке · исходная модель не
          изменится
        </p>
      ) : null}

      <nav
        className="ember-voxel-sculpt__workspaces"
        aria-label="Рабочий режим редактора вокселей"
      >
        <div className="ember-voxel-sculpt__workspace-tabs" role="tablist">
          {VOXEL_WORKSPACES.map((item) => {
            const unavailable =
              variantMode && (item.id === "scene" || item.id === "animate");
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                className={workspaceMode === item.id ? "is-active" : ""}
                aria-selected={workspaceMode === item.id}
                disabled={unavailable}
                title={
                  unavailable
                    ? "В варианте объекта доступны модель и материал"
                    : item.description
                }
                onClick={() => activateWorkspace(item.id)}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            );
          })}
        </div>
        <div
          className="ember-voxel-sculpt__panel-toggles"
          role="toolbar"
          aria-label="Панели редактора"
        >
          <button
            type="button"
            className={showToolsPanel ? "is-on" : ""}
            aria-pressed={showToolsPanel}
            title="Показать или скрыть панель инструментов"
            onClick={() => setShowToolsPanel((value) => !value)}
          >
            Инструменты
          </button>
          <button
            type="button"
            className={showScenePanel ? "is-on" : ""}
            aria-pressed={showScenePanel}
            title="Показать или скрыть сцену и свойства"
            onClick={() => setShowScenePanel((value) => !value)}
          >
            Свойства
          </button>
        </div>
      </nav>

      <div className="ember-voxel-sculpt__toolbar">
        <div className="ember-voxel-sculpt__toolbar-row">
          {!variantMode ? (
            <label>
              Сцена
              <select
                value={activeId}
                onChange={(e) => {
                  const sid = e.target.value;
                  setActiveId(sid);
                  const sc = voxelScenes[sid];
                  if (sc?.objects[0]) setActiveObjectId(sc.objects[0].id);
                }}
                title="Какой блок моделей открыт"
              >
                {scenesList.length === 0 ? (
                  <option value="">— нет —</option>
                ) : (
                  scenesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameRu ?? s.id}
                    </option>
                  ))
                )}
              </select>
            </label>
          ) : null}
          {draft ? (
            <>
              <label className="ember-voxel-sculpt__field--name">
                Имя
                <input
                  value={draft.nameRu ?? ""}
                  onChange={(e) => {
                    const nameRu = e.target.value;
                    const prev = (draft.nameRu ?? "").trim();
                    setDraft({ ...draft, nameRu });
                    if (variantMode || !activeScene) return;
                    let next = activeScene;
                    const sceneName = (activeScene.nameRu ?? "").trim();
                    if (!sceneName || sceneName === prev) {
                      next = { ...next, nameRu };
                    }
                    if (activeObject) {
                      const objName = (activeObject.nameRu ?? "").trim();
                      if (!objName || objName === prev) {
                        next = patchSceneObject(next, activeObject.id, {
                          nameRu,
                        });
                      }
                    }
                    if (next !== activeScene) commitScene(next);
                  }}
                  title="Имя активного меша · тоже обновляет имя сцены, если оно совпадало"
                />
              </label>
              <label className="ember-voxel-sculpt__field--name">
                Теги
                <input
                  value={tagsDraft}
                  placeholder="village, street"
                  title="Через запятую. Префиксы vox_vil_ / vox_fan_ ищутся и без явных тегов"
                  onChange={(e) => setTagsDraft(e.target.value)}
                  onBlur={() => {
                    const tags = normalizeEmberLibraryTags(tagsDraft);
                    setTagsDraft(formatEmberLibraryTags(tags));
                    setDraft({ ...draft, tags });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
              </label>
              <label>
                Отраж.
                <select
                  value={envVoxelMult}
                  onChange={(e) => {
                    const next = setEmberEnvMapVoxelMult(
                      Number(e.target.value),
                    );
                    setEnvVoxelMult(next);
                    apiRef.current?.render();
                  }}
                  title="Разрешение отражений металла"
                >
                  {EMBER_ENV_VOXEL_MULTS.map((m) => (
                    <option key={m} value={m}>
                      ×{m}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          <label>
            Источник
            <select
              value={libLoadId}
              onChange={(e) => setLibLoadId(e.target.value)}
              title="Чужой меш из библиотеки: открыть или вставить через + Создать"
            >
              <option value="">— выбрать —</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nameRu ?? m.id}
                </option>
              ))}
            </select>
          </label>
          <div className="ember-voxel-sculpt__toolbar-btns">
            <button
              type="button"
              className="ghost"
              disabled={!libLoadId || !pack.voxelModels[libLoadId]}
              title="Открыть выбранный блок в редакторе"
              onClick={() => loadLibraryModel(libLoadId)}
            >
              Открыть
            </button>
            <SculptBarMenu
              id="create"
              label="+ Создать"
              title="Новая модель или вставка из источника"
              openId={sculptMenu}
              onOpen={setSculptMenu}
            >
              <button
                type="button"
                role="menuitem"
                className="ember-voxel-sculpt__menu-item"
                onClick={() => {
                  createModel();
                  setSculptMenu(null);
                }}
              >
                + 1×1×1
              </button>
              <button
                type="button"
                role="menuitem"
                className="ember-voxel-sculpt__menu-item"
                disabled={variantMode}
                onClick={() => {
                  createCharacter("chibi_32");
                  setSculptMenu(null);
                }}
              >
                + Чиби
              </button>
              <button
                type="button"
                role="menuitem"
                className="ember-voxel-sculpt__menu-item"
                disabled={variantMode}
                onClick={() => {
                  createCharacter("chibi_25d");
                  setSculptMenu(null);
                }}
              >
                + 2.5D
              </button>
              <button
                type="button"
                role="menuitem"
                className="ember-voxel-sculpt__menu-item"
                disabled={variantMode}
                onClick={() => {
                  createCharacter("chibi_32", "slasher");
                  setSculptMenu(null);
                }}
              >
                + Slasher
              </button>
              <button
                type="button"
                role="menuitem"
                className="ember-voxel-sculpt__menu-item"
                disabled={variantMode}
                onClick={() => {
                  createCharacter("chibi_25d", "slasher");
                  setSculptMenu(null);
                }}
              >
                + Slasher 2.5D
              </button>
              <div className="ember-voxel-sculpt__menu-sep" role="separator" />
              <p className="ember-voxel-sculpt__menu-hint">Из источника</p>
              <button
                type="button"
                role="menuitem"
                className="ember-voxel-sculpt__menu-item"
                disabled={
                  !libLoadId ||
                  !pack.voxelModels[libLoadId] ||
                  !draft ||
                  libLoadId === draft.id
                }
                onClick={() => {
                  applyLibraryAsBase(libLoadId);
                  setSculptMenu(null);
                }}
              >
                Подставить основой
              </button>
              <button
                type="button"
                role="menuitem"
                className="ember-voxel-sculpt__menu-item"
                disabled={
                  variantMode ||
                  !activeScene ||
                  !libLoadId ||
                  !pack.voxelModels[libLoadId]
                }
                onClick={() => {
                  addObjectFromLibrary();
                  setSculptMenu(null);
                }}
              >
                + Объект в сцену
              </button>
            </SculptBarMenu>
            {!variantMode ? (
              <button
                type="button"
                className="ghost ember-danger"
                disabled={!draft}
                title="Удалить текущую модель из библиотеки"
                onClick={deleteLibraryModel}
              >
                Удалить
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={[
          "ember-voxel-sculpt__main",
          !showToolsPanel ? "is-tools-collapsed" : "",
          !showScenePanel ? "is-scene-collapsed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {showToolsPanel ? (
          <aside
            className="ember-voxel-sculpt__side ember-voxel-sculpt__side--tools"
            aria-label="Инструменты редактирования"
          >
          <p className="ember-voxel-sculpt__side-title">
            {activeWorkspace.label}
          </p>
          <p className="muted ember-voxel-sculpt__workspace-hint">
            {activeWorkspace.description}
          </p>

          <p className="ember-voxel-sculpt__section">Инструменты</p>
          <div className="ember-voxel-sculpt__tools" role="toolbar">
            {visibleToolButtons.map(({ id, label, tip }) => (
              <button
                key={id}
                type="button"
                className={
                  tool === id || (id === "hinge" && hingeActive)
                    ? "is-active"
                    : ""
                }
                title={tip}
                onClick={() => {
                  if (id === "hinge") startHingeJoint();
                  else {
                    clearHingeIfNeeded();
                    setTool(id);
                  }
                }}
              >
                <em>{voxelToolHotkey(id, workspaceMode)}</em>
                {label}
              </button>
            ))}
          </div>

          {workspaceMode === "scene" ? (
            <>
              <p className="ember-voxel-sculpt__section">Трансформация</p>
              <div
                className="ember-voxel-sculpt__modes"
                role="toolbar"
                aria-label="Режим трансформации объектов"
              >
                <button
                  type="button"
                  className={sceneTransformMode === "translate" ? "is-active" : ""}
                  onClick={() => {
                    setTool("move");
                    setSceneTransformMode("translate");
                  }}
                >
                  W Перемещение
                </button>
                <button
                  type="button"
                  className={sceneTransformMode === "rotate" ? "is-active" : ""}
                  disabled={!canRotateSelectedSceneObjects}
                  title={
                    canRotateSelectedSceneObjects
                      ? "Поворот вокруг общей точки, шаг 90°"
                      : "Сначала выберите объекты без скелетных связей"
                  }
                  onClick={() => {
                    setTool("move");
                    setSceneTransformMode("rotate");
                  }}
                >
                  E Поворот
                </button>
              </div>
              <p className="muted ember-voxel-sculpt__group-hint">
                Перемещение: шаг 1 воксель, Shift — 4. Поворот: Y с шагом
                90°. Связанные кости защищены от повреждения рига.
              </p>
            </>
          ) : workspaceMode === "animate" ? (
            <p className="muted ember-voxel-sculpt__group-hint">
              Выберите петлю и клип, затем ставьте ключи на временной шкале под
              viewport.
            </p>
          ) : null}

          {tool === "add" || tool === "erase" ? (
            <>
              <p className="ember-voxel-sculpt__section">Форма</p>
              <div className="ember-voxel-sculpt__modes" role="toolbar">
                {SHAPE_BRUSHES.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={shapeBrush === b.id ? "is-active" : ""}
                    title={b.tip}
                    onClick={() => {
                      onShapeCancelRef.current();
                      setShapeBrush(b.id);
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <p className="muted ember-voxel-sculpt__group-hint">
                {shapeBrush === "voxel"
                  ? "Точка: клик / drag как раньше · N — следующая форма"
                  : shapeBrush === "line"
                    ? "Линия: ЛКМ-drag от клетки до клетки · Shift+ЛКМ — стереть · N — форма"
                    : "Коробка/сфера: ЛКМ-drag по грани клика, отпустить — выдавить по нормали, ЛКМ/Enter — ок, ПКМ/Esc — отмена"}
              </p>
            </>
          ) : null}

          {tool === "move" ? (
            <p className="muted ember-hint">
              {workspaceMode === "scene"
                ? sceneTransformMode === "rotate"
                  ? `Кольцо поворачивает выбор (${selectedSceneObjectIds.length}) · шаг 90°`
                  : `Гизмо и стрелки двигают выбор (${selectedSceneObjectIds.length}) · drag+Shift = шаг 4`
                : selection?.length
                ? "Гизмо или стрелки: сдвиг группы вокселей · Shift+↑↓ — высота"
                : "Стрелки: XZ · Shift+↑↓: Y · без выделения сдвигает кость в сцене"}
            </p>
          ) : null}

          {workspaceMode === "material" &&
          (tool === "emit" || (tool === "select" && selection)) ? (
            <EditableRange
              label="Яркость"
              value={emitAmount}
              min={0}
              max={255}
              onChange={setEmitAmount}
            />
          ) : null}

          {workspaceMode === "material" &&
          (tool === "shine" || (tool === "select" && selection)) ? (
            <>
              <EditableRange
                label="Блеск"
                value={shineAmount}
                min={0}
                max={255}
                onChange={setShineAmount}
              />
              <EditableRange
                label="Цвет при блеске"
                value={Math.round(shineColorKeep * 100)}
                min={0}
                max={100}
                suffix="%"
                title="Сколько блеск сохраняет исходный цвет"
                onChange={(v) => {
                  const next = v / 100;
                  setShineColorKeepState(next);
                  setShineColorKeep(next);
                }}
              />
            </>
          ) : null}

          {workspaceMode === "material" &&
          (tool === "transparency" || (tool === "select" && selection)) ? (
            <EditableRange
              label="Прозрачность"
              value={transparencyAmount}
              min={0}
              max={255}
              title="0 = непрозрачный · 255 = почти стекло (свет проходит)"
              onChange={setTransparencyAmount}
            />
          ) : null}

          {workspaceMode === "material" &&
          (tool === "transmittance" || (tool === "select" && selection)) ? (
            <EditableRange
              label="Просвет"
              value={transmittanceAmount}
              min={0}
              max={255}
              title="0 = глухая тень · выше = тень светлеет и мягче дальше от лампы · 255 = без тени"
              onChange={setTransmittanceAmount}
            />
          ) : null}

          {workspaceMode === "material" && selection?.length ? (
            <>
              <p className="ember-voxel-sculpt__section">
                К выделению · {selectedVoxelCount}
              </p>
              <div className="ember-voxel-sculpt__actions">
                <button
                  type="button"
                  className="ghost"
                  title="Перекрасить сплошные клетки выделения"
                  onClick={() => applySelectionOp("paint")}
                >
                  Краска
                </button>
                <button
                  type="button"
                  className="ghost"
                  title="Залить выделение текущим цветом"
                  onClick={() => applySelectionOp("fill")}
                >
                  Залить
                </button>
                <button
                  type="button"
                  className="ghost"
                  title="Эмиссия на выделении"
                  onClick={() => applySelectionOp("emit")}
                >
                  Свет
                </button>
                <button
                  type="button"
                  className="ghost"
                  title="Блеск на выделении"
                  onClick={() => applySelectionOp("shine")}
                >
                  Блеск
                </button>
                <button
                  type="button"
                  className="ghost"
                  title="Прозрачность на выделении"
                  onClick={() => applySelectionOp("transparency")}
                >
                  Прозр.
                </button>
                <button
                  type="button"
                  className="ghost"
                  title="Просвет на выделении"
                  onClick={() => applySelectionOp("transmittance")}
                >
                  Просвет
                </button>
              </div>
            </>
          ) : null}

          {(workspaceMode === "material" ||
            (workspaceMode === "sculpt" && tool === "add")) &&
          tool !== "erase" &&
          tool !== "emit" &&
          tool !== "shine" &&
          tool !== "transparency" &&
          tool !== "transmittance" ? (
            <>
              <p className="ember-voxel-sculpt__section">Палитра</p>
              <div className="ember-voxel-sculpt__palette">
                {(draft?.palette ?? []).map((c, i) =>
                  i === 0 ? null : (
                    <button
                      key={i}
                      type="button"
                      className={paletteIndex === i ? "is-active" : ""}
                      style={{ background: c || "#444" }}
                      title={
                        `#${i}` +
                        (paletteUsage[i]
                          ? ` · ${paletteUsage[i]} кл.`
                          : " · пусто") +
                        " · Alt+клик — заменить текущий цвет этим"
                      }
                      onClick={(e) => {
                        if (e.altKey) {
                          e.preventDefault();
                          if (i === paletteIndex) return;
                          remapPaletteIndex(paletteIndex, i);
                          setPaletteIndex(i);
                          return;
                        }
                        setPaletteIndex(i);
                        if (tool === "pick") setTool("paint");
                      }}
                    />
                  ),
                )}
                <button
                  type="button"
                  className="ember-voxel-sculpt__palette-add"
                  title="Добавить цвет"
                  onClick={addPaletteColor}
                >
                  +
                </button>
              </div>
              <label className="ember-voxel-sculpt__color">
                Цвет
                <DeferredColorInput
                  value={activeColor.startsWith("#") ? activeColor : "#888888"}
                  onPreview={(hex) => previewPaletteColor(paletteIndex, hex)}
                  onCommit={(hex) => setPaletteColor(paletteIndex, hex)}
                />
              </label>
              <p className="muted ember-voxel-sculpt__group-hint">
                {tool === "replace"
                  ? selection?.length
                    ? "Клик по вокселю — этот цвет палитры в выделении станет текущим слотом · Shift — стереть цвет"
                    : "Клик по вокселю — все клетки этого цвета станут текущим слотом · Shift — стереть цвет"
                  : selection?.length
                    ? "Alt+клик по слоту — клетки текущего цвета в выделении станут им · P — кисть замены"
                    : "Alt+клик по слоту — все клетки текущего цвета станут им · P — кисть замены"}
              </p>
            </>
          ) : null}

          {workspaceMode === "sculpt" ? (
            <>
          <p className="ember-voxel-sculpt__section">Группы</p>
          <div className="ember-voxel-sculpt__modes" role="toolbar">
            {SELECT_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={
                  tool === "select" && selectMode === m.id ? "is-active" : ""
                }
                title={m.tip}
                onClick={() => activateSelectMode(m.id)}
              >
                <em>{m.hotkey}</em>
                {m.label}
              </button>
            ))}
            <button
              type="button"
              className={selectEmpty ? "is-active" : ""}
              title="Выделять удалённые / пустые клетки (клик — связная группа воздуха)"
              aria-pressed={selectEmpty}
              onClick={() => {
                setSelectEmpty((v) => !v);
                setTool("select");
              }}
            >
              <em>⇧0</em>
              Пустые
            </button>
          </div>
          <p className="muted ember-voxel-sculpt__group-hint">
            {tool === "select"
              ? selectMode === "linked"
                ? "Умный: все связные того же цвета палитры · Shift+ЛКМ / ПКМ"
                : selectEmpty
                  ? selectMode === "box"
                    ? "Пустые: клик — связная дыра · drag — рамка · Shift+ЛКМ добавить"
                    : "Пустые: ряд/слой по air · Shift+ЛКМ добавить"
                  : selectMode === "box"
                    ? "ЛКМ — рамка · Shift+ЛКМ — добавить · ПКМ по вокселю — снять"
                    : "ЛКМ/drag — группы · Shift+ЛКМ — добавить · ПКМ — снять · гизмо — сдвиг"
              : "M — выделение · Shift+1…6 — режим · Shift+0 — пустые · Esc снять"}
            {selection?.length
              ? ` · ${countSelectionCells(selection)} кл.`
              : ""}
            {selectEmpty ? " · режим пустых" : ""}
          </p>
          <div className="ember-voxel-sculpt__actions">
            <button
              type="button"
              className="ghost"
              disabled={!draft || !selection?.length}
              title="Залить выделение текущим цветом"
              onClick={() => applySelectionOp("fill")}
            >
              Залить
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft || !selection?.length}
              title="Стереть выделение"
              onClick={() => applySelectionOp("erase")}
            >
              Стереть
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft}
              title={
                selectEmpty
                  ? "Выделить все пустые клетки"
                  : "Выделить всю модель"
              }
              onClick={() => {
                if (!draft) return;
                setTool("select");
                const all = selectEmpty
                  ? selectionAllEmpty(draft)
                  : selectionAll(draft);
                changeSelection(all ? [all] : null);
              }}
            >
              Всё
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!selection?.length}
              title="Снять выделение (Esc)"
              onClick={() => changeSelection(null)}
            >
              Снять
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft || !selection?.length}
              title="Поворот 90° вокруг X · Alt+X"
              onClick={() => transformSelection("x")}
            >
              ↻X
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft || !selection?.length}
              title="Поворот 90° вокруг Y (yaw) · Alt+Y"
              onClick={() => transformSelection("y")}
            >
              ↻Y
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft || !selection?.length}
              title="Поворот 90° вокруг Z · Alt+Z"
              onClick={() => transformSelection("z")}
            >
              ↻Z
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft || !selection?.length}
              title="Дублировать выделение со сдвигом +X · Ctrl+D"
              onClick={() => transformSelection("dup")}
            >
              Дубль
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft || !selection?.length}
              title="Сдвиг −X · ←"
              onClick={() => translateSelectedVoxels({ x: -1, y: 0, z: 0 })}
            >
              −X
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft || !selection?.length}
              title="Сдвиг +X · →"
              onClick={() => translateSelectedVoxels({ x: 1, y: 0, z: 0 })}
            >
              +X
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft || !selection?.length}
              title="Сдвиг −Y · Shift+↓"
              onClick={() => translateSelectedVoxels({ x: 0, y: -1, z: 0 })}
            >
              −Y
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft || !selection?.length}
              title="Сдвиг +Y · Shift+↑"
              onClick={() => translateSelectedVoxels({ x: 0, y: 1, z: 0 })}
            >
              +Y
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft || !selection?.length}
              title="Сдвиг −Z · ↓"
              onClick={() => translateSelectedVoxels({ x: 0, y: 0, z: -1 })}
            >
              −Z
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft || !selection?.length}
              title="Сдвиг +Z · ↑"
              onClick={() => translateSelectedVoxels({ x: 0, y: 0, z: 1 })}
            >
              +Z
            </button>
          </div>
            </>
          ) : null}
        </aside>
        ) : null}

        <div className="ember-voxel-sculpt__view-col">
          <div className="ember-voxel-sculpt__view-wrap">
            <div ref={hostRef} className="ember-voxel-sculpt__view" />
            <div
              ref={axesHostRef}
              className="ember-voxel-sculpt__axes"
              title="Клик по концу оси — вид с этой стороны (как в Blender)"
            />
          </div>
          {!variantMode && workspaceMode === "animate" ? (
            <VoxelAnimTimeline
              scene={activeScene}
              clipId={animClipId}
              playhead={animPlayhead}
              playing={animPlaying}
              selectedJointId={selectedJointId}
              keyAngleDeg={keyAngleDeg}
              onKeyAngleDeg={setKeyAngleDeg}
              onPlayhead={(t) => {
                setAnimPlaying(false);
                setAnimPlayhead(t);
                const clip = activeScene?.animations?.find(
                  (c) => c.id === animClipId,
                );
                if (clip && selectedJointId) {
                  setKeyAngleDeg(
                    sampleJointAngleDeg(clip, selectedJointId, t),
                  );
                }
              }}
              onTogglePlay={() => setAnimPlaying((p) => !p)}
              onSelectClip={setAnimClipId}
              onAddKey={addAnimKey}
              onDeleteKey={deleteAnimKey}
              onMoveKey={relocateAnimKey}
              onDurationSec={setAnimDurationSec}
              onCreateClip={createAnimClip}
              onSelectJoint={setSelectedJointId}
              onAddJoint={startHingeJoint}
            />
          ) : null}
          <footer className="ember-voxel-sculpt__viewport-status">
            <span>
              <strong>{activeWorkspace.label}</strong>
              {" · "}
              {TOOL_BUTTONS.find((item) => item.id === tool)?.label ?? tool}
            </span>
            <span>
              {grid
                ? `${grid.sx}×${grid.sy}×${grid.sz}`
                : "модель не выбрана"}
            </span>
            {selectedVoxelCount > 0 ? (
              <span>выделено: {selectedVoxelCount}</span>
            ) : null}
            {hingeActive ? (
              <span>
                петля {hingePickStep === "child" ? "2/2" : "1/2"}
              </span>
            ) : null}
            <span className="ember-voxel-sculpt__viewport-coords">
              {hoverLabel}
            </span>
          </footer>
        </div>
        {showScenePanel ? (
          <aside
          className="ember-voxel-sculpt__side ember-voxel-sculpt__side--scene"
          aria-label="Сцена и модификаторы"
        >
          <p className="ember-voxel-sculpt__side-title">
            {isCharacterScene(activeScene) ? "Персонаж" : "Сцена"}
          </p>

          {!variantMode && activeScene && isCharacterScene(activeScene) ? (
            <VoxelCharacterPanel
              scene={activeScene}
              activeObjectId={activeObject?.id ?? null}
              onSelectSlot={(id) => setActiveObjectId(id)}
              cardView={characterCardView}
              onCardViewChange={setCharacterCardView}
              onToggleVisible={(id) => {
                const obj = activeScene.objects.find((o) => o.id === id);
                if (!obj) return;
                const nextVisible = obj.visible === false;
                const nextScene = patchSceneObject(activeScene, id, {
                  visible: nextVisible,
                });
                commitScene(nextScene);
                if (!nextVisible && id === activeObject?.id) {
                  const other = nextScene.objects.find(
                    (o) => o.id !== id && o.visible !== false,
                  );
                  if (other) setActiveObjectId(other.id);
                }
              }}
            />
          ) : null}

          {!variantMode ? (
            <VoxelSceneOutliner
              scene={activeScene}
              activeObjectId={activeObject?.id ?? null}
              selectedObjectIds={selectedSceneObjectIds}
              onSelectObject={selectSceneObject}
              onSelectAll={() => {
                if (!activeScene?.objects.length) return;
                const ids = activeScene.objects.map((object) => object.id);
                const primaryId = activeObject?.id ?? ids[0]!;
                setSelectedObjectIds(ids);
                setActiveObjectId(primaryId);
                objectSelectionAnchorRef.current = primaryId;
              }}
              onToggleVisible={(id) => {
                if (!activeScene) return;
                const obj = activeScene.objects.find((o) => o.id === id);
                if (!obj) return;
                const nextVisible = obj.visible === false;
                const nextScene = patchSceneObject(activeScene, id, {
                  visible: nextVisible,
                });
                commitScene(nextScene);
                if (!nextVisible && id === activeObject?.id) {
                  const other = nextScene.objects.find(
                    (o) => o.id !== id && o.visible !== false,
                  );
                  if (other) setActiveObjectId(other.id);
                }
              }}
              onSetSelectionVisible={(visible) => {
                if (!activeScene || !selectedSceneObjectIds.length) return;
                commitScene(
                  setVoxelSceneSelectionVisible(
                    activeScene,
                    selectedSceneObjectIds,
                    visible,
                  ),
                );
              }}
              onSeparate={separateSelection}
              canSeparate={Boolean(draft && selection?.length)}
              onDuplicateSelection={duplicateSelectedSceneObjects}
              onRemoveSelection={removeSelectedSceneObjects}
              canRemoveSelection={canRemoveSelectedObjects}
            />
          ) : null}

          {!variantMode && activeObject ? (
            <VoxelObjectPropsPanel
              mode={workspaceMode}
              selectionCount={selectedSceneObjectIds.length}
              object={activeObject}
              model={
                draft && draft.id === activeObject.modelId
                  ? draft
                  : pack.voxelModels[activeObject.modelId] ?? null
              }
              canRemove={canRemoveSelectedObjects}
              onRename={(nameRu) => {
                if (!activeScene) return;
                commitScene(
                  patchSceneObject(activeScene, activeObject.id, { nameRu }),
                );
              }}
              onSetOffset={(offset) => {
                if (!activeScene) return;
                commitScene(
                  translateVoxelSceneSelection(
                    activeScene,
                    selectedSceneObjectIds,
                    {
                      x: offset.x - activeObject.offset.x,
                      y: offset.y - activeObject.offset.y,
                      z: offset.z - activeObject.offset.z,
                    },
                  ),
                );
              }}
              rotationQuarterTurns={activeObject.rot ?? 0}
              canRotateSelection={canRotateSelectedSceneObjects}
              onRotateSelection={(quarterTurns) => {
                if (!activeScene) return;
                const next = rotateVoxelSceneSelectionY(
                  activeScene,
                  selectedSceneObjectIds,
                  quarterTurns,
                );
                if (next !== activeScene) commitScene(next);
              }}
              onResizeBlocks={resizeBlocks}
              onResizeHeight={resizeHeightVoxels}
              onSetMaterial={(material) => {
                if (!draft || draft.id !== activeObject.modelId) return;
                setDraft({ ...draft, material });
              }}
              onSetPaletteColor={(index, hex) => {
                if (!draft || draft.id !== activeObject.modelId) return;
                setPaletteColor(index, hex);
              }}
              onPreviewPaletteColor={(index, hex) => {
                if (!draft || draft.id !== activeObject.modelId) return;
                previewPaletteColor(index, hex);
              }}
              onEditModel={(next) => {
                if (!draft || draft.id !== activeObject.modelId) return;
                applyEdit(next);
              }}
              selection={selection}
              onDuplicate={duplicateSelectedSceneObjects}
              onRemove={removeSelectedSceneObjects}
              pickingLightOrigin={pickingLightOrigin}
              selectedLampId={activeLampId}
              onSelectLamp={setActiveLampId}
              onStartPickLightOrigin={() => {
                setPickingLightOrigin(true);
                onSaved?.(
                  "Кликните воксель — туда встанет PointLight (центр ячейки)",
                );
              }}
              onClearLightOrigin={() => {
                if (!draft || draft.id !== activeObject.modelId) return;
                beginEditRef.current();
                const lamps = listVoxelEmissiveLamps(draft);
                const lampId = activeLampId ?? lamps[0]?.id;
                setDraft(
                  lampId
                    ? patchVoxelEmissiveLamp(draft, lampId, {
                        origin: undefined,
                        offset: undefined,
                      })
                    : {
                        ...draft,
                        emissiveLightOrigin: undefined,
                        emissiveLightOffset: undefined,
                      },
                );
                onSaved?.("Источник света: авто (центр emissive)");
              }}
            />
          ) : null}

          {workspaceMode === "material" ? (
            <p className="ember-voxel-sculpt__section">Параметры вокселя</p>
          ) : workspaceMode === "scene" || workspaceMode === "animate" ? (
            <p className="ember-voxel-sculpt__section">Связи и петли</p>
          ) : null}

          {workspaceMode === "material" &&
          (tool === "inspect" || inspectTarget) ? (
            <div className="ember-voxel-inspect">
              <div className="ember-voxel-inspect__head">
                <p className="ember-voxel-sculpt__section">Воксель</p>
                {inspectTarget ? (
                  <button
                    type="button"
                    className="ghost"
                    title="Сбросить обзор"
                    onClick={() => setInspectTarget(null)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
              {!inspectTarget ? (
                <p className="muted ember-hint ember-voxel-inspect__hint">
                  Кликните воксель на любом объекте сцены — здесь появятся
                  координаты, цвет, эмиссия и блеск.
                </p>
              ) : (
                <>
                  <dl className="ember-voxel-inspect__meta">
                    <div>
                      <dt>Объект</dt>
                      <dd>
                        {activeScene?.objects.find(
                          (o) => o.id === inspectTarget.objectId,
                        )?.nameRu?.trim() ||
                          inspectTarget.objectId}
                      </dd>
                    </div>
                    <div>
                      <dt>XYZ</dt>
                      <dd>
                        {inspectTarget.cell.x}, {inspectTarget.cell.y},{" "}
                        {inspectTarget.cell.z}
                      </dd>
                    </div>
                    <div>
                      <dt>Индекс</dt>
                      <dd>
                        {(() => {
                          const model =
                            draft?.id === inspectTarget.modelId
                              ? draft
                              : pack.voxelModels[inspectTarget.modelId];
                          if (!model) return "—";
                          const pi = getVoxel(
                            model,
                            inspectTarget.cell.x,
                            inspectTarget.cell.y,
                            inspectTarget.cell.z,
                          );
                          return pi <= 0 ? "пусто" : `#${pi}`;
                        })()}
                      </dd>
                    </div>
                  </dl>
                  {(() => {
                    const model =
                      draft?.id === inspectTarget.modelId
                        ? draft
                        : pack.voxelModels[inspectTarget.modelId];
                    if (!model) {
                      return (
                        <p className="muted ember-hint">Модель не найдена</p>
                      );
                    }
                    const { x, y, z } = inspectTarget.cell;
                    const pi = getVoxel(model, x, y, z);
                    const emit = getVoxelEmissive(model, x, y, z);
                    const shine = getVoxelShine(model, x, y, z);
                    const transparency = getVoxelTransparency(model, x, y, z);
                    const transmittance = getVoxelTransmittance(model, x, y, z);
                    const color =
                      pi > 0
                        ? model.palette[pi] || "#888888"
                        : "transparent";
                    const canEdit =
                      Boolean(draft) && draft!.id === inspectTarget.modelId;
                    const patchCell = (
                      next: EmberVoxelModel,
                    ) => {
                      if (!canEdit) return;
                      applyEdit(next);
                    };
                    return (
                      <div className="ember-voxel-inspect__params">
                        <div className="ember-voxel-inspect__swatch-row">
                          <span
                            className="ember-voxel-inspect__swatch"
                            style={{
                              background:
                                pi > 0 ? color : "repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 8px 8px",
                            }}
                            title={pi > 0 ? color : "воздух"}
                          />
                          <span className="ember-voxel-inspect__hex">
                            {pi > 0 ? color : "— воздух —"}
                          </span>
                        </div>
                        <label className="ember-voxel-inspect__field">
                          <span>Палитра</span>
                          <select
                            disabled={!canEdit || pi <= 0}
                            value={pi > 0 ? pi : ""}
                            onChange={(e) => {
                              if (!draft || !canEdit) return;
                              const nextPi = Number(e.target.value);
                              patchCell(
                                setVoxel(draft, x, y, z, nextPi),
                              );
                            }}
                          >
                            {pi <= 0 ? (
                              <option value="">пусто</option>
                            ) : null}
                            {model.palette.map((c, i) =>
                              i === 0 ? null : (
                                <option key={i} value={i}>
                                  #{i} · {c}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        {canEdit && pi > 0 ? (
                          <label className="ember-voxel-inspect__field">
                            <span>Цвет слота</span>
                            <DeferredColorInput
                              value={
                                color.startsWith("#") ? color : "#888888"
                              }
                              onPreview={(hex) => previewPaletteColor(pi, hex)}
                              onCommit={(hex) => setPaletteColor(pi, hex)}
                            />
                          </label>
                        ) : null}
                        <EditableRange
                          label="Эмиссия"
                          value={emit}
                          min={0}
                          max={255}
                          disabled={!canEdit || pi <= 0}
                          onChange={(v) => {
                            if (!draft || !canEdit) return;
                            patchCell(setVoxelEmissive(draft, x, y, z, v));
                          }}
                        />
                        <EditableRange
                          label="Блеск"
                          value={shine}
                          min={0}
                          max={255}
                          disabled={!canEdit || pi <= 0}
                          onChange={(v) => {
                            if (!draft || !canEdit) return;
                            patchCell(setVoxelShine(draft, x, y, z, v));
                          }}
                        />
                        <EditableRange
                          label="Прозрачность"
                          value={transparency}
                          min={0}
                          max={255}
                          disabled={!canEdit || pi <= 0}
                          onChange={(v) => {
                            if (!draft || !canEdit) return;
                            patchCell(setVoxelTransparency(draft, x, y, z, v));
                          }}
                        />
                        <EditableRange
                          label="Просвет"
                          value={transmittance}
                          min={0}
                          max={255}
                          disabled={!canEdit || pi <= 0}
                          title="Непрозрачный; тень светлеет и мягче с расстоянием"
                          onChange={(v) => {
                            if (!draft || !canEdit) return;
                            patchCell(
                              setVoxelTransmittance(draft, x, y, z, v),
                            );
                          }}
                        />
                        {model.material ? (
                          <p className="muted ember-voxel-inspect__mat">
                            Материал модели:{" "}
                            {EMBER_MATERIAL_LABELS_RU[model.material] ??
                              model.material}
                          </p>
                        ) : null}
                        {!canEdit ? (
                          <p className="muted ember-hint ember-voxel-inspect__hint">
                            Клик по объекту делает его активным — тогда можно
                            править.
                          </p>
                        ) : (
                          <div className="ember-voxel-inspect__ops">
                            <button
                              type="button"
                              className="ghost"
                              disabled={pi <= 0}
                              title="Взять цвет в кисть"
                              onClick={() => {
                                if (pi <= 0) return;
                                setPaletteIndex(pi);
                                setEmitAmount(emit);
                                setShineAmount(shine);
                                setTransparencyAmount(transparency);
                                setTransmittanceAmount(transmittance);
                                setTool("paint");
                              }}
                            >
                              В кисть
                            </button>
                            <button
                              type="button"
                              className="ghost ember-danger"
                              disabled={pi <= 0}
                              title="Стереть воксель"
                              onClick={() => {
                                if (!draft || pi <= 0) return;
                                patchCell(setVoxel(draft, x, y, z, 0));
                              }}
                            >
                              Стереть
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          ) : null}

          {workspaceMode === "scene" || workspaceMode === "animate" ? (
            hingeActive ? (
            <div className="ember-voxel-hinge">
              <div className="ember-voxel-hinge__head">
                <p className="ember-voxel-sculpt__section">Петля — объекты</p>
                <button
                  type="button"
                  className="ghost"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    cancelHingeJoint();
                  }}
                >
                  Отмена
                </button>
              </div>
              {(activeScene?.objects.length ?? 0) < 2 ? (
                <p className="muted ember-hint">
                  Нужно ≥2 объекта: выделите часть и «Отделить», или «+ Объект».
                </p>
              ) : (
                <>
                  <label className="ember-voxel-hinge__field">
                    <span>Родитель (корпус)</span>
                    <select
                      value={hingeParentId ?? ""}
                      onChange={(e) => {
                        const id = e.target.value;
                        setHingeParentId(id);
                        hingeDraftRef.current = null;
                        setHingePickStep("parent");
                        setActiveObjectId(id);
                      }}
                    >
                      {(activeScene?.objects ?? []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nameRu?.trim() || o.modelId}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ember-voxel-hinge__field">
                    <span>Дочерний (крышка)</span>
                    <select
                      value={hingeChildId ?? ""}
                      onChange={(e) => {
                        const id = e.target.value;
                        setHingeChildId(id);
                        if (hingePickStep === "child") setActiveObjectId(id);
                      }}
                    >
                      {(activeScene?.objects ?? []).map((o) => (
                        <option
                          key={o.id}
                          value={o.id}
                          disabled={o.id === hingeParentId}
                        >
                          {o.nameRu?.trim() || o.modelId}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ember-voxel-hinge__field">
                    <span>Ось вращения</span>
                    <select
                      value={hingeAxis}
                      onChange={(e) =>
                        setHingeAxis(e.target.value as EmberVoxelJointAxis)
                      }
                    >
                      <option value="x">X</option>
                      <option value="y">Y</option>
                      <option value="z">Z</option>
                    </select>
                  </label>
                  <p className="muted ember-hint ember-voxel-hinge__step">
                    {hingePickStep === "child"
                      ? `Шаг 2/2: кликните вершину (угол) на «${
                          activeScene?.objects.find((o) => o.id === hingeChildId)
                            ?.nameRu?.trim() || hingeChildId || "…"
                        }»`
                      : `Шаг 1/2: кликните вершину (угол вокселя) на «${
                          activeScene?.objects.find((o) => o.id === hingeParentId)
                            ?.nameRu?.trim() || hingeParentId || "…"
                        }»`}
                  </p>
                </>
              )}
              {(activeScene?.joints?.length ?? 0) > 0 ? (
                <button
                  type="button"
                  className="ghost"
                  title="Удалить все петли со сцены"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteAllJoints();
                  }}
                >
                  Сбросить все петли
                </button>
              ) : null}
            </div>
          ) : (activeScene?.joints?.length ?? 0) > 0 ? (
            <div className="ember-voxel-hinge">
              <div className="ember-voxel-hinge__head">
                <p className="ember-voxel-sculpt__section">Открыть / угол</p>
                <button
                  type="button"
                  className="ghost"
                  disabled={!selectedJointId}
                  title="Удалить выбранную петлю"
                  onClick={deleteSelectedJoint}
                >
                  Удалить
                </button>
              </div>
              <label className="ember-voxel-hinge__field">
                <span>Петля</span>
                <select
                  value={selectedJointId ?? ""}
                  onChange={(e) => setSelectedJointId(e.target.value || null)}
                >
                  {(activeScene?.joints ?? []).map((j) => {
                    const child = activeScene?.objects.find(
                      (o) => o.id === j.childObjectId,
                    );
                    const label =
                      j.nameRu?.trim() ||
                      child?.nameRu?.trim() ||
                      j.id;
                    return (
                      <option key={j.id} value={j.id}>
                        {label} · ось {j.axis.toUpperCase()}
                      </option>
                    );
                  })}
                </select>
              </label>
              <EditableRange
                label="Угол"
                value={keyAngleDeg}
                min={-180}
                max={180}
                step={1}
                suffix="°"
                disabled={!selectedJointId}
                title="Крутить дочерний объект вокруг петли"
                onChange={(v) => {
                  setAnimPlaying(false);
                  setKeyAngleDeg(v);
                }}
              />
              <div className="ember-voxel-hinge__presets">
                <button
                  type="button"
                  className="ghost"
                  disabled={!selectedJointId}
                  onClick={() => {
                    setAnimPlaying(false);
                    setKeyAngleDeg(0);
                  }}
                >
                  0°
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={!selectedJointId}
                  title="Открыть назад (−90°)"
                  onClick={() => {
                    setAnimPlaying(false);
                    setKeyAngleDeg(-90);
                  }}
                >
                  −90°
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={!selectedJointId}
                  title="Открыть вперёд (+90°)"
                  onClick={() => {
                    setAnimPlaying(false);
                    setKeyAngleDeg(90);
                  }}
                >
                  +90°
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={!selectedJointId}
                  onClick={() => {
                    setAnimPlaying(false);
                    setKeyAngleDeg(110);
                  }}
                >
                  +110°
                </button>
              </div>
              <p className="muted ember-hint ember-voxel-hinge__step">
                Гизмо у петли: тяни кольцо/стрелки во вьюпорте. «Сдвиг» (M) —
                только перенос объекта.
              </p>
              <button
                type="button"
                className="ghost"
                onClick={deleteAllJoints}
              >
                Сбросить все петли
              </button>
            </div>
          ) : (
            <p className="muted ember-hint">
              Петля (J): свяжите два объекта — здесь появится угол и гизмо.
            </p>
          )
          ) : null}
        </aside>
        ) : null}
      </div>
    </div>
  );
}
