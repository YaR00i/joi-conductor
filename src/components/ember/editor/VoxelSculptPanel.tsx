/**
 * 3D per-voxel sculptor: hover highlight, paint / add / erase / emit / shine / fill / pick.
 * Pattern follows three.js interactive voxelpainter (raycast + orbit).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type {
  EmberPack,
  EmberVoxelModel,
} from "../../../game/content/types";
import { EDITOR_ISO_POLAR } from "../../../game/three/editorThreePreview";
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
  stampSolidBlock,
  voxelGridSize,
  VOXEL_MIRROR_OFF,
  type SelectionEditOp,
  type VoxelMirrorAxes,
  type VoxelSelection,
  type VoxelSelectionSet,
} from "../../../game/voxel/voxelModel";
import { VOXELS_PER_BLOCK } from "../../../game/voxel/constants";
import {
  packWithVoxels,
  writeVoxelRegistry,
} from "../../../game/voxel/voxelRegistry";
import {
  ensureVoxelScenes,
  findChildJoint,
  clearSceneJoints,
  moveAnimKey,
  newVoxelAnimClipId,
  newVoxelJointId,
  newVoxelSceneObjectId,
  patchAnimClip,
  patchSceneObject,
  removeAnimKey,
  removeSceneJoint,
  removeSceneObject,
  sampleJointAngleDeg,
  sceneFromSingleModel,
  upsertAnimClip,
  upsertAnimKey,
  upsertSceneJoint,
  upsertSceneObject,
} from "../../../game/voxel/voxelScene";
import type {
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
  normalizeVoxelLightOffset,
  resolveVoxelLightBase,
  resolveVoxelLightOrigin,
  summarizeVoxelEmissive,
} from "../../../game/voxel/voxelEmissiveLight";
import { packLampDiscDecay } from "../../../game/three/threeLighting";
import { EditableRange } from "./EditableRange";
import { VoxelAnimTimeline } from "./VoxelAnimTimeline";
import { VoxelObjectPropsPanel } from "./VoxelObjectPropsPanel";
import { DeferredColorInput } from "./DeferredColorInput";
import { VoxelSceneOutliner } from "./VoxelSceneOutliner";

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
  | "fill"
  | "pick"
  | "inspect"
  | "select"
  | "hinge"
  | "move";

/** How a click builds a voxel group selection. */
type SelectMode = "box" | "layer" | "row" | "col" | "stack" | "linked";

type HitCell = { x: number; y: number; z: number };

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
  /** Other scene objects (relative to active), cleared on each call. */
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
  /** Keep selection/grid/hover aligned when meshRoot has hinge pose. */
  syncEditOverlays: () => void;
  /** Yellow marker at emissive PointLight origin (voxel coords). */
  setLightOriginMarker: (
    pos: { x: number; y: number; z: number } | null,
  ) => void;
  /** Live PointLight for sculpt studio preview. */
  setPreviewEmissiveLight: (
    cfg: {
      pos: { x: number; y: number; z: number };
      color: THREE.Color;
      intensity: number;
      /** Reach in voxel units. */
      distance: number;
    } | null,
  ) => void;
  frameCamera: () => void;
  dispose: () => void;
};

/** Keep spherical phi off the poles so lookAt stays stable. */
const PITCH_MIN = 0.08;
const PITCH_MAX = Math.PI - 0.08;

const VOXEL_GRID_STORAGE_KEY = "ember-voxel-sculpt-grid";
const VOXEL_PREVIEW_LIGHT_STORAGE_KEY = "ember-voxel-sculpt-preview-light";
const RMB_DOUBLE_MS = 320;

function loadShowVoxelGrid(): boolean {
  try {
    return sessionStorage.getItem(VOXEL_GRID_STORAGE_KEY) === "1";
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

type VoxelHistEntry = {
  model: EmberVoxelModel;
  selection: VoxelSelectionSet | null;
};

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
    case "fill":
      return floodFillPaint(model, cell.x, cell.y, cell.z, paletteIndex);
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
  fill: 0xc080ff,
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
  { id: "add", label: "Куб", tip: "Добавить воксель · B / 1", key: "B" },
  {
    id: "erase",
    label: "Ластик",
    tip: "Стереть · X / 2 · Shift+ЛКМ · Del — выделение",
    key: "X",
  },
  {
    id: "paint",
    label: "Кисть",
    tip: "Перекрасить · C / 3 · при выделении — краска группы",
    key: "C",
  },
  {
    id: "fill",
    label: "Заливка",
    tip: "Заливка связных · G / 4 · при выделении — залить группу",
    key: "G",
  },
  { id: "pick", label: "Пипетка", tip: "Взять цвет · I / 5", key: "I" },
  {
    id: "inspect",
    label: "Обзор",
    tip: "Параметры вокселя · O · клик — панель справа",
    key: "O",
  },
  {
    id: "emit",
    label: "Свечение",
    tip: "Эмиссия · E / 6 · при выделении — свет группы",
    key: "E",
  },
  {
    id: "shine",
    label: "Блеск",
    tip: "Блеск · H / 7 · яркий = зеркало на верхней грани · при выделении — блеск группы",
    key: "✧",
  },
  {
    id: "transparency",
    label: "Прозрачность",
    tip: "Прозрачность · T / 9 · видно насквозь · свет проходит · при выделении — на группу",
    key: "T",
  },
  {
    id: "select",
    label: "Группа",
    tip: "Выделение · R / 0 · Shift+Y/X/Z/V/B — режимы",
    key: "R",
  },
  {
    id: "move",
    label: "Сдвиг",
    tip: "Сдвиг объекта в сцене (offset) · стрелки / outliner",
    key: "M",
  },
  {
    id: "hinge",
    label: "Петля",
    tip: "Пивоты петли: клик по родителю, затем по дочернему объекту",
    key: "J",
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
    tip: "Рамка ЛКМ · Shift+ЛКМ добавить · ПКМ по вокселю снять · двойной ПКМ в пустоте — снять всё · ПКМ в пустоте орбита · Shift+B",
    hotkey: "⇧B",
  },
  {
    id: "layer",
    label: "Слой Y",
    tip: "Слой Y · Shift+ЛКМ/drag добавить · ПКМ по вокселю снять · ПКМ в пустоте орбита · Shift+Y",
    hotkey: "⇧Y",
  },
  {
    id: "row",
    label: "Ряд X",
    tip: "Ряд X · Shift+ЛКМ/drag добавить · ПКМ по вокселю снять · ПКМ в пустоте орбита · Shift+X",
    hotkey: "⇧X",
  },
  {
    id: "col",
    label: "Ряд Z",
    tip: "Ряд Z · Shift+ЛКМ/drag добавить · ПКМ по вокселю снять · ПКМ в пустоте орбита · Shift+Z",
    hotkey: "⇧Z",
  },
  {
    id: "stack",
    label: "Столбец",
    tip: "Столбец · Shift+ЛКМ добавить · ПКМ по вокселю снять · ПКМ в пустоте орбита · Shift+V",
    hotkey: "⇧V",
  },
  {
    id: "linked",
    label: "Умный",
    tip: "Связные одного цвета · клик по вокселю · Shift+ЛКМ добавить · Shift+L",
    hotkey: "⇧L",
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
  const paletteRef = useRef(1);
  const emitRef = useRef(180);
  const shineRef = useRef(180);
  const transparencyRef = useRef(160);
  const lastCellRef = useRef<string | null>(null);
  const paintingRef = useRef(false);
  const orbitingRef = useRef(false);
  const panningRef = useRef(false);
  const shiftEraseRef = useRef(false);
  const editSnapRef = useRef(false);
  const undoStackRef = useRef<VoxelHistEntry[]>([]);
  const redoStackRef = useRef<VoxelHistEntry[]>([]);
  const beginEditRef = useRef<() => void>(() => {});
  const onPickColorRef = useRef<(pi: number) => void>(() => {});
  const onPickLightOriginRef = useRef<(cell: HitCell) => void>(() => {});
  const onMoveLightOffsetRef = useRef<
    (offset: { x: number; y: number; z: number }) => void
  >(() => {});
  const onInspectRef = useRef<
    (payload: { objectId: string | null; cell: HitCell }) => void
  >(() => {});
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
  const activeObjectIdRef = useRef(activeObjectId);
  const [envVoxelMult, setEnvVoxelMult] = useState<EmberEnvVoxelMult>(() =>
    getEmberEnvMapVoxelMult(),
  );
  const [showVoxelGrid, setShowVoxelGrid] = useState(loadShowVoxelGrid);
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
  const [browsePicker, setBrowsePicker] = useState(false);
  const showOpenPicker =
    !variantMode &&
    !onClose &&
    Object.keys(pack.voxelModels).length > 0 &&
    (browsePicker || !activeId);
  const [tool, setTool] = useState<SculptTool>("add");
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
  const [inspectTarget, setInspectTarget] = useState<InspectTarget | null>(
    null,
  );
  const [pickingLightOrigin, setPickingLightOrigin] = useState(false);
  const pickingLightOriginRef = useRef(false);
  pickingLightOriginRef.current = pickingLightOrigin;
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
  const [autoSaveNote, setAutoSaveNote] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveGenRef = useRef(0);
  const lastSavedJsonRef = useRef<string>("");
  const skipPackSyncRef = useRef(false);
  const packRef = useRef(pack);
  packRef.current = pack;
  const commitSceneRef = useRef<
    (nextScene: EmberVoxelScene, modelsExtra?: Record<string, EmberVoxelModel>) => void
  >(() => {});
  const cancelHingeRef = useRef<() => void>(() => {});
  const clearHingeRef = useRef<() => void>(() => {});

  draftRef.current = draft;
  toolRef.current = tool;
  paletteRef.current = paletteIndex;
  emitRef.current = emitAmount;
  shineRef.current = shineAmount;
  transparencyRef.current = transparencyAmount;
  selectModeRef.current = selectMode;
  selectEmptyRef.current = selectEmpty;
  mirrorAxesRef.current = mirrorAxes;
  selectionRef.current = selection;
  setSelectionRef.current = setSelection;

  const histStorageKey = (id: string) => `ember-voxel-hist:${id}`;

  const persistHistSession = useCallback((model: EmberVoxelModel | null) => {
    if (!model) return;
    try {
      const undo = undoStackRef.current.slice(-40).map((e) => ({
        model: normalizeVoxelModel(e.model),
        selection: cloneVoxelSelectionSet(e.selection),
      }));
      const redo = redoStackRef.current.slice(-40).map((e) => ({
        model: normalizeVoxelModel(e.model),
        selection: cloneVoxelSelectionSet(e.selection),
      }));
      sessionStorage.setItem(
        histStorageKey(model.id),
        JSON.stringify({
          undo,
          redo,
          draft: normalizeVoxelModel(model),
          selection: cloneVoxelSelectionSet(selectionRef.current),
        }),
      );
    } catch {
      /* quota / private mode */
    }
  }, []);

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
        model: normalizeVoxelModel(rec.model),
        selection: cloneVoxelSelectionSet(rec.selection),
      };
    }
    // Legacy: bare EmberVoxelModel
    if (typeof rec.id === "string" && Array.isArray(rec.voxels)) {
      return {
        model: normalizeVoxelModel(raw as EmberVoxelModel),
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
      model: normalizeVoxelModel(draftRef.current),
      selection: cloneVoxelSelectionSet(selectionRef.current),
    });
    if (undoStackRef.current.length > 80) undoStackRef.current.shift();
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
    setDraft({
      ...d,
      emissiveCastsLight: true,
      emissiveLightOrigin: { x: cell.x, y: cell.y, z: cell.z },
    });
    setPickingLightOrigin(false);
    onSaved?.(
      `Источник света: ${cell.x}, ${cell.y}, ${cell.z}`,
    );
  };

  onMoveLightOffsetRef.current = (offset) => {
    const d = draftRef.current;
    if (!d) return;
    beginEditRef.current();
    setDraft({
      ...d,
      emissiveCastsLight: true,
      emissiveLightOffset: normalizeVoxelLightOffset(offset),
    });
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
      setActiveObjectId(objectId);
    }
    setInspectTarget({ objectId, modelId, cell: payload.cell });
  };

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
    const mid = obj?.modelId;
    const m = mid ? pack.voxelModels[mid] : undefined;
    resetHistory();
    setSelection(null);
    setLibLoadId("");
    setAutoSaveNote(null);
    setAnimClipId(scene?.animations?.[0]?.id ?? null);
    setSelectedJointId(scene?.joints?.[0]?.id ?? null);
    if (mid && restoreHistSession(mid)) {
      const saved = pack.voxelModels[mid];
      if (saved) {
        lastSavedJsonRef.current = JSON.stringify(normalizeVoxelModel(saved));
      }
      return;
    }
    const loaded = m ? normalizeVoxelModel(m) : null;
    setDraft(loaded);
    lastSavedJsonRef.current = loaded ? JSON.stringify(loaded) : "";
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pack is initial source only
  }, [activeId, activeObjectId, variantMode, restoreHistSession]);

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
    setDraft(normalizeVoxelModel(m));
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

  const pickerItems = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const list = models
      .slice()
      .sort((a, b) =>
        (a.nameRu || a.id).localeCompare(b.nameRu || b.id, "ru"),
      )
      .filter((m) => {
        if (!q) return true;
        const name = (m.nameRu || "").toLowerCase();
        return name.includes(q) || m.id.toLowerCase().includes(q);
      });
    return list.map((m) => {
      const g = voxelGridSize(m);
      const solids = m.voxels.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
      const scene = voxelScenes[m.id];
      const useScene = scene != null && scene.objects.length > 1;
      return {
        id: m.id,
        label: m.nameRu?.trim() || m.id,
        title: `${m.nameRu?.trim() || m.id} · ${m.id}`,
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
  }, [models, pickerQuery, voxelScenes, pack.voxelModels]);

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
    scene.add(key);

    const meshRoot = new THREE.Group();
    scene.add(meshRoot);
    const peerRoot = new THREE.Group();
    peerRoot.name = "vox-peers";
    scene.add(peerRoot);

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

    // Studio PointLight so range/strength match map play (voxel units).
    const previewLight = new THREE.PointLight(
      0xffc060,
      0,
      12,
      packLampDiscDecay(0.32, 0.62),
    );
    previewLight.visible = false;
    previewLight.castShadow = false;
    scene.add(previewLight);

    const configurePreviewLightShadow = (distance: number) => {
      previewLight.castShadow = true;
      previewLight.shadow.mapSize.set(512, 512);
      previewLight.shadow.bias = -0.0008;
      previewLight.shadow.normalBias = 0.08;
      previewLight.shadow.camera.near = 0.15;
      previewLight.shadow.camera.far = Math.max(distance * 1.25, 8);
      previewLight.shadow.camera.updateProjectionMatrix();
      previewLight.shadow.radius = 0;
      previewLight.shadow.intensity = 1;
      renderer.shadowMap.needsUpdate = true;
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
        // Continuous voxel-space coords (cell centers + fractional offset).
        lightTranslateGizmo.setPose(pos, 1.15);
        lightTranslateGizmo.setVisible(true);
        api.render();
      },
      setPreviewEmissiveLight(cfg) {
        if (!cfg) {
          previewLight.visible = false;
          previewLight.intensity = 0;
          previewLight.castShadow = false;
          api.render();
          return;
        }
        previewLight.visible = true;
        previewLight.color.copy(cfg.color);
        previewLight.intensity = Math.max(0, cfg.intensity);
        previewLight.distance = Math.max(0.5, cfg.distance);
        previewLight.position.set(cfg.pos.x, cfg.pos.y, cfg.pos.z);
        // Always occlude by solid voxels in studio (map still uses model flag).
        configurePreviewLightShadow(previewLight.distance);
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

    const activeTool = (): SculptTool => {
      // Shift+select = multi-add, not erase.
      if (shiftEraseRef.current && toolRef.current !== "select") return "erase";
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
      setHoverLabel(`${cell.x}, ${cell.y}, ${cell.z}`);
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
          hover.visible = false;
          vertexHover.visible = false;
          lastHoverCellRef.current = hit.cell;
          setHoverLabel(`обзор ${hit.cell.x}, ${hit.cell.y}, ${hit.cell.z}`);
          api.render();
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
            const origin = resolveVoxelLightOrigin(draft, sum);
            const base = resolveVoxelLightBase(draft, sum);
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
      stroke(e, true);
    };

    const onMove = (e: PointerEvent) => {
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
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
      if (paintingRef.current) {
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
        else if (hit.objectId) {
          hover.visible = false;
          vertexHover.visible = false;
          lastHoverCellRef.current = hit.cell;
          setHoverLabel(`обзор ${hit.cell.x}, ${hit.cell.y}, ${hit.cell.z}`);
          api.render();
        } else {
          showHover(hit.cell);
        }
      } else {
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
            api.render();
            return;
          }
          el.style.cursor = "";
        }
        showHover(pick(e));
      }
    };

    const finishPointer = (e: PointerEvent, releaseCapture: boolean) => {
      if (activePointerId !== e.pointerId) return;
      // Clear first: releasePointerCapture may synchronously emit
      // lostpointercapture, which must not finish the stroke twice.
      activePointerId = null;
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
    const onCancel = (e: PointerEvent) => finishPointer(e, false);
    const onLostPointerCapture = (e: PointerEvent) => {
      if (activePointerId === e.pointerId) finishPointer(e, false);
    };

    const onLeave = () => {
      if (
        !paintingRef.current &&
        !orbitingRef.current &&
        !panningRef.current
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
      scene.remove(previewLight);
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

  // Remesh when draft or shine color-keep changes (camera stays unless model / grid size switches).
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !draft) return;
    // Reset active transform before remesh (joint preview may have rotated it).
    api.meshRoot.position.set(0, 0, 0);
    api.meshRoot.rotation.set(0, 0, 0);
    // blockWorld = VOXELS_PER_BLOCK → voxelWorld = 1 (editor cell units).
    const built = buildVoxelModelMesh(draft, VOXELS_PER_BLOCK, {
      // Studio has no hard lantern discs — keep full direct response.
      directLightScale: 1,
      shineColorKeep,
      suppressCastShadow: draft.emissiveSuppressHostShadow === true,
    });
    api.setMesh(built.group);
    const g = voxelGridSize(draft);
    api.bounds.geometry.dispose();
    api.bounds.geometry = new THREE.BoxGeometry(g.sx, g.sy, g.sz);
    api.bounds.position.set(g.sx / 2, g.sy / 2, g.sz / 2);
    api.bounds.visible = true;
    api.setSelection(selectionRef.current);
    api.syncEditOverlays();
    api.render();
  }, [draft, shineColorKeep, draft?.emissiveSuppressHostShadow]);

  // Light-origin marker + live PointLight in the studio (chrome «Свет» toggle).
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    if (!draft?.emissiveCastsLight) {
      api.setLightOriginMarker(null);
      api.setPreviewEmissiveLight(null);
      return;
    }
    const sum = summarizeVoxelEmissive(draft);
    if (!sum) {
      api.setLightOriginMarker(null);
      api.setPreviewEmissiveLight(null);
      return;
    }
    const origin = resolveVoxelLightOrigin(draft, sum);
    api.setLightOriginMarker(origin);
    if (!showPreviewEmissiveLight) {
      api.setPreviewEmissiveLight(null);
      return;
    }
    const strength = resolveEmissiveStrength(draft.emissiveStrength);
    const rangeTiles = resolveEmissiveLightRange(draft.emissiveLightRange);
    // Match emissiveLocalLights.voxelPeakIntensity (voxel units = 1 cell).
    const dens = Math.max(
      0.35,
      Math.min(1, 0.4 + sum.weight * 0.35 + Math.min(0.35, sum.count * 0.04)),
    );
    const intensity = (3.4 + strength * 9.5) * dens;
    const distance = rangeTiles * VOXELS_PER_BLOCK;
    api.setPreviewEmissiveLight({
      pos: origin,
      color: new THREE.Color(sum.r, sum.g, sum.b),
      intensity,
      distance,
    });
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
    draft?.emissive,
    draft?.voxels,
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
    const key = `${activeId ?? ""}:${activeObjectId ?? ""}:${draftGridKey}`;
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
  }, [activeId, activeObjectId, draftGridKey]);

  // Peer scene objects + joint preview (active mesh stays at origin).
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    if (!activeScene || !activeObject || variantMode) {
      api.setPeerMeshes([]);
      api.meshRoot.visible = true;
      api.meshRoot.position.set(0, 0, 0);
      api.meshRoot.rotation.set(0, 0, 0);
      const meshChild = api.meshRoot.children[0];
      if (meshChild) meshChild.position.set(0, 0, 0);
      api.setHingeGizmo(null);
      api.syncEditOverlays();
      api.render();
      return;
    }

    const clip = activeScene.animations?.find((c) => c.id === animClipId);
    const activeOff = activeObject.offset;
    const peers: THREE.Group[] = [];

    const placeWithJoint = (
      wrapper: THREE.Group,
      inner: THREE.Group,
      obj: (typeof activeScene.objects)[0],
    ) => {
      const joint = findChildJoint(activeScene, obj.id);
      const parent = joint
        ? activeScene.objects.find((o) => o.id === joint.parentObjectId)
        : undefined;
      const angleDeg = joint
        ? joint.id === selectedJointId
          ? keyAngleDeg
          : clip
            ? sampleJointAngleDeg(clip, joint.id, animPlayhead)
            : 0
        : 0;

      if (joint && parent) {
        const hinge = {
          x: parent.offset.x + joint.parentPivot.x - activeOff.x,
          y: parent.offset.y + joint.parentPivot.y - activeOff.y,
          z: parent.offset.z + joint.parentPivot.z - activeOff.z,
        };
        inner.position.set(
          -joint.childPivot.x,
          -joint.childPivot.y,
          -joint.childPivot.z,
        );
        wrapper.add(inner);
        wrapper.position.set(hinge.x, hinge.y, hinge.z);
        const rad = THREE.MathUtils.degToRad(angleDeg);
        if (joint.axis === "x") wrapper.rotation.set(rad, 0, 0);
        else if (joint.axis === "y") wrapper.rotation.set(0, rad, 0);
        else wrapper.rotation.set(0, 0, rad);
      } else {
        wrapper.add(inner);
        wrapper.position.set(
          obj.offset.x - activeOff.x,
          obj.offset.y - activeOff.y,
          obj.offset.z - activeOff.z,
        );
      }
    };

    // Joint on the active object (child) — only if the active mesh is shown.
    const activeHidden = activeObject.visible === false;
    api.meshRoot.visible = !activeHidden;
    api.bounds.visible = !activeHidden;
    if (!activeHidden) {
      const activeJoint = findChildJoint(activeScene, activeObject.id);
      const activeParent = activeJoint
        ? activeScene.objects.find((o) => o.id === activeJoint.parentObjectId)
        : undefined;
      if (activeJoint && activeParent) {
        const angleDeg =
          activeJoint.id === selectedJointId
            ? keyAngleDeg
            : clip
              ? sampleJointAngleDeg(clip, activeJoint.id, animPlayhead)
              : 0;
        const hinge = {
          x: activeParent.offset.x + activeJoint.parentPivot.x - activeOff.x,
          y: activeParent.offset.y + activeJoint.parentPivot.y - activeOff.y,
          z: activeParent.offset.z + activeJoint.parentPivot.z - activeOff.z,
        };
        // Offset mesh content so childPivot sits at hinge, then rotate meshRoot.
        api.meshRoot.position.set(hinge.x, hinge.y, hinge.z);
        const meshChild = api.meshRoot.children[0];
        if (meshChild) {
          meshChild.position.set(
            -activeJoint.childPivot.x,
            -activeJoint.childPivot.y,
            -activeJoint.childPivot.z,
          );
        }
        const rad = THREE.MathUtils.degToRad(angleDeg);
        if (activeJoint.axis === "x") api.meshRoot.rotation.set(rad, 0, 0);
        else if (activeJoint.axis === "y") api.meshRoot.rotation.set(0, rad, 0);
        else api.meshRoot.rotation.set(0, 0, rad);
      } else {
        api.meshRoot.position.set(0, 0, 0);
        api.meshRoot.rotation.set(0, 0, 0);
        const meshChild = api.meshRoot.children[0];
        if (meshChild) meshChild.position.set(0, 0, 0);
      }
    } else {
      api.meshRoot.position.set(0, 0, 0);
      api.meshRoot.rotation.set(0, 0, 0);
    }

    for (const obj of activeScene.objects) {
      if (obj.id === activeObject.id) continue;
      if (obj.visible === false) continue;
      const m =
        obj.modelId === draft?.id
          ? draft
          : pack.voxelModels[obj.modelId];
      if (!m) continue;
      const built = buildVoxelModelMesh(m, VOXELS_PER_BLOCK, {
        directLightScale: 1,
        shineColorKeep,
        suppressCastShadow: m.emissiveSuppressHostShadow === true,
      });
      const wrapper = new THREE.Group();
      wrapper.name = `peer-${obj.id}`;
      placeWithJoint(wrapper, built.group, obj);
      peers.push(wrapper);
    }
    api.setPeerMeshes(peers);

    // Blender-like hinge gizmo at selected joint pivot (when not picking a new one).
    const jointForGizmo =
      (selectedJointId
        ? activeScene.joints?.find((j) => j.id === selectedJointId)
        : undefined) ?? activeScene.joints?.[0];
    if (jointForGizmo && !hingeActive) {
      const parent = activeScene.objects.find(
        (o) => o.id === jointForGizmo.parentObjectId,
      );
      if (parent) {
        const pos = {
          x: parent.offset.x + jointForGizmo.parentPivot.x - activeOff.x,
          y: parent.offset.y + jointForGizmo.parentPivot.y - activeOff.y,
          z: parent.offset.z + jointForGizmo.parentPivot.z - activeOff.z,
        };
        const scale = Math.max(1.2, api.dist * 0.055);
        api.setHingeGizmo({
          pos,
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

  // Move tool: arrow keys nudge active object offset.
  useEffect(() => {
    if (tool !== "move" || !activeScene || !activeObject || variantMode) return;
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
      e.preventDefault();
      const next = patchSceneObject(activeScene, activeObject.id, {
        offset: {
          x: activeObject.offset.x + dx,
          y: activeObject.offset.y + dy,
          z: activeObject.offset.z + dz,
        },
      });
      commitSceneRef.current(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, activeScene, activeObject, variantMode]);

  useEffect(() => {
    apiRef.current?.setSelection(selection);
  }, [selection]);

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

  // Debounced autosave to library + session history.
  useEffect(() => {
    if (!draft) return;
    const normalized = normalizeVoxelModel(draft);
    persistHistSession(normalized);
    if (variantMode || !autoSave) return;

    const json = JSON.stringify(normalized);
    if (json === lastSavedJsonRef.current) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const gen = ++autoSaveGenRef.current;
    autoSaveTimerRef.current = setTimeout(() => {
      void (async () => {
        if (gen !== autoSaveGenRef.current) return;
        const modelsMap = {
          ...(packRef.current.voxelModels ?? {}),
          [normalized.id]: normalized,
        };
        const scenesMap = {
          ...(packRef.current.voxelScenes ?? voxelScenes),
          ...voxelScenes,
        };
        const res = await writeVoxelRegistry(modelsMap, scenesMap);
        if (gen !== autoSaveGenRef.current) return;
        if (!res.ok) {
          setAutoSaveNote(`Ошибка авто: ${res.error}`);
          return;
        }
        lastSavedJsonRef.current = json;
        skipPackSyncRef.current = true;
        onPackChange(packWithVoxels(packRef.current, modelsMap, scenesMap));
        const t = new Date();
        const hh = String(t.getHours()).padStart(2, "0");
        const mm = String(t.getMinutes()).padStart(2, "0");
        const ss = String(t.getSeconds()).padStart(2, "0");
        setAutoSaveNote(`Авто ${hh}:${mm}:${ss}`);
      })();
    }, 900);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [
    draft,
    autoSave,
    variantMode,
    onPackChange,
    persistHistSession,
    voxelScenes,
  ]);

  const applySelectionOp = (op: SelectionEditOp) => {
    const model = draftRef.current;
    const sel = selectionRef.current;
    if (!model || !sel) return;
    const amount =
      op === "shine"
        ? shineRef.current
        : op === "transparency"
          ? transparencyRef.current
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
      model: normalizeVoxelModel(draft),
      selection: cloneVoxelSelectionSet(selectionRef.current),
    });
    setDraft(prev.model);
    setSelection(cloneVoxelSelectionSet(prev.selection));
    apiRef.current?.setSelection(prev.selection);
    setHistTick((n) => n + 1);
    persistHistSession(prev.model);
  };

  const redo = () => {
    const next = redoStackRef.current.pop();
    if (!next || !draft) return;
    undoStackRef.current.push({
      model: normalizeVoxelModel(draft),
      selection: cloneVoxelSelectionSet(selectionRef.current),
    });
    setDraft(next.model);
    setSelection(cloneVoxelSelectionSet(next.selection));
    apiRef.current?.setSelection(next.selection);
    setHistTick((n) => n + 1);
    persistHistSession(next.model);
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
      // Use e.code (physical key) so RU layout still maps X/G/C/…
      const mod = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
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
      if (mod && code === "KeyA") {
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

      // Shift+axis — group select modes (under cursor).
      if (shift && !mod) {
        if (code === "KeyU") {
          e.preventDefault();
          setSelectEmpty((v) => !v);
          setTool("select");
          return;
        }
        if (code === "KeyY") {
          e.preventDefault();
          activateSelectMode("layer");
          return;
        }
        if (code === "KeyX") {
          e.preventDefault();
          activateSelectMode("row");
          return;
        }
        if (code === "KeyZ") {
          e.preventDefault();
          activateSelectMode("col");
          return;
        }
        if (code === "KeyV") {
          e.preventDefault();
          activateSelectMode("stack");
          return;
        }
        if (code === "KeyL") {
          e.preventDefault();
          activateSelectMode("linked");
          return;
        }
        if (code === "KeyB") {
          e.preventDefault();
          activateSelectMode("box");
          return;
        }
      }

      if (code === "Escape") {
        if (hingeActiveRef.current || toolRef.current === "hinge") {
          e.preventDefault();
          cancelHingeRef.current();
          return;
        }
        changeSelection(null);
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

      // Letter tools: with an active selection, C/G/E/X edit the group.
      if (!mod && !shift) {
        if (code === "KeyB" || code === "Digit1" || code === "Numpad1") {
          clearHingeRef.current();
          setTool("add");
          return;
        }
        if (code === "KeyX" || code === "Digit2" || code === "Numpad2") {
          e.preventDefault();
          if (hasSel) applySelectionOp("erase");
          else {
            clearHingeRef.current();
            setTool("erase");
          }
          return;
        }
        if (code === "KeyC" || code === "Digit3" || code === "Numpad3") {
          e.preventDefault();
          if (hasSel) applySelectionOp("paint");
          else {
            clearHingeRef.current();
            setTool("paint");
          }
          return;
        }
        if (code === "KeyG" || code === "Digit4" || code === "Numpad4") {
          e.preventDefault();
          if (hasSel) applySelectionOp("fill");
          else {
            clearHingeRef.current();
            setTool("fill");
          }
          return;
        }
        if (code === "KeyI" || code === "Digit5" || code === "Numpad5") {
          clearHingeRef.current();
          setTool("pick");
          return;
        }
        if (code === "KeyO") {
          clearHingeRef.current();
          setTool("inspect");
          return;
        }
        if (code === "KeyE" || code === "Digit6" || code === "Numpad6") {
          e.preventDefault();
          if (hasSel) applySelectionOp("emit");
          else {
            clearHingeRef.current();
            setTool("emit");
          }
          return;
        }
        if (code === "KeyH" || code === "Digit7" || code === "Numpad7") {
          e.preventDefault();
          if (hasSel) applySelectionOp("shine");
          else {
            clearHingeRef.current();
            setTool("shine");
          }
          return;
        }
        if (code === "KeyT" || code === "Digit9" || code === "Numpad9") {
          e.preventDefault();
          if (hasSel) applySelectionOp("transparency");
          else {
            clearHingeRef.current();
            setTool("transparency");
          }
          return;
        }
        if (
          code === "KeyR" ||
          code === "Digit0" ||
          code === "Numpad0" ||
          code === "Digit8" ||
          code === "Numpad8"
        ) {
          clearHingeRef.current();
          setTool("select");
          return;
        }
        if (code === "KeyM") {
          clearHingeRef.current();
          setTool("move");
          return;
        }
        if (code === "KeyJ") {
          startHingeJoint();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, histTick]);

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
    setActiveId(scene.id);
    setActiveObjectId(scene.objects[0]!.id);
    setLibLoadId(id);
    setDraft(created);
    markEditorOpened("voxel", scene.id);
    onActiveModelChange?.(id);
    resetHistory();
  };

  const commitScene = (nextScene: EmberVoxelScene, modelsExtra?: Record<string, EmberVoxelModel>) => {
    const modelsMap = {
      ...pack.voxelModels,
      ...(modelsExtra ?? {}),
      ...(draft ? { [draft.id]: normalizeVoxelModel(draft) } : {}),
    };
    const scenesMap = { ...voxelScenes, [nextScene.id]: nextScene };
    onPackChange(packWithVoxels(pack, modelsMap, scenesMap));
    void writeVoxelRegistry(modelsMap, scenesMap).then((res) => {
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

  const duplicateSceneObject = (objectId: string) => {
    if (!activeScene) return;
    const src = activeScene.objects.find((o) => o.id === objectId);
    if (!src) return;
    const objId = newVoxelSceneObjectId();
    const next = upsertSceneObject(activeScene, {
      id: objId,
      nameRu: src.nameRu ? `${src.nameRu} копия` : undefined,
      modelId: src.modelId,
      offset: {
        x: src.offset.x + 2,
        y: src.offset.y,
        z: src.offset.z,
      },
      visible: true,
    });
    commitScene(next);
    setActiveObjectId(objId);
    onSaved?.("Объект продублирован");
  };

  const removeObjectFromScene = (objectId: string) => {
    if (!activeScene || activeScene.objects.length < 2) return;
    const next = removeSceneObject(activeScene, objectId);
    commitScene(next);
    if (activeObjectId === objectId) {
      setActiveObjectId(next.objects[0]?.id ?? null);
    }
    if (selectedJointId && !(next.joints ?? []).some((j) => j.id === selectedJointId)) {
      setSelectedJointId(next.joints?.[0]?.id ?? null);
    }
    onSaved?.("Объект убран из сцены");
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
    void writeVoxelRegistry(modelsMap, scenesMap);
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

  const previewPaletteColor = (index: number, hex: string) => {
    apiRef.current?.previewPaletteColor(index, hex);
  };

  const addPaletteColor = () => {
    if (!draft) return;
    const palette = [...draft.palette, "#ffb060"];
    applyEdit({ ...draft, palette });
    setPaletteIndex(palette.length - 1);
    setTool("paint");
  };

  void histTick;
  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

  const save = async () => {
    if (!draft) return;
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
      const res = await writeVoxelRegistry(modelsMap, scenesMap);
      setSaving(false);
      if (!res.ok) {
        onSaved?.(`Воксели: ошибка сохранения — ${res.error}`);
        return;
      }
      onPackChange(packWithVoxels(currentPack, modelsMap, scenesMap));
      onSavedVariant?.({ model: saved, placementId: session.placementId });
      onSaved?.(
        `Вариант «${saved.nameRu ?? saved.id}» сохранён в библиотеку`,
      );
      onClose?.();
      return;
    }

    const normalized = normalizeVoxelModel(draft);
    const modelsMap = {
      ...(currentPack.voxelModels ?? {}),
      [normalized.id]: normalized,
    };
    const scenesMap = { ...voxelScenes };
    const res = await writeVoxelRegistry(modelsMap, scenesMap);
    setSaving(false);
    if (!res.ok) {
      onSaved?.(`Воксели: ошибка сохранения — ${res.error}`);
      return;
    }
    lastSavedJsonRef.current = JSON.stringify(normalized);
    skipPackSyncRef.current = true;
    persistHistSession(normalized);
    onPackChange(packWithVoxels(currentPack, modelsMap, scenesMap));
    setAutoSaveNote("Сохранено");
    onSaved?.(`Воксели «${normalized.nameRu ?? normalized.id}» сохранены`);
  };

  const grid = draft ? voxelGridSize(draft) : null;
  const activeColor = draft?.palette[paletteIndex] || "#888888";

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
                placeholder="Поиск по имени или id…"
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
              className={`ghost ${showPreviewEmissiveLight ? "is-on" : ""}`}
              disabled={!draft?.emissiveCastsLight}
              aria-pressed={showPreviewEmissiveLight}
              title="Превью PointLight от emissive-вокселей в студии (не влияет на карту)"
              onClick={() => setShowPreviewEmissiveLight((v) => !v)}
            >
              Свет
            </button>
          </div>

          <div className="ember-voxel-sculpt__chrome-group">
            <button
              type="button"
              className="ghost"
              disabled={!draft}
              title="Перевернуть модель по X (разово)"
              onClick={() => draft && applyEdit(flipVoxelModel(draft, "x"))}
            >
              ↔ X
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft}
              title="Перевернуть модель по Y (разово)"
              onClick={() => draft && applyEdit(flipVoxelModel(draft, "y"))}
            >
              ↕ Y
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft}
              title="Перевернуть модель по Z (разово)"
              onClick={() => draft && applyEdit(flipVoxelModel(draft, "z"))}
            >
              ↗ Z
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft}
              title="Залить весь объём текущим цветом"
              onClick={() =>
                draft && applyEdit(stampSolidBlock(draft, paletteIndex))
              }
            >
              Куб
            </button>
            <button
              type="button"
              className="ghost ember-danger"
              disabled={!draft}
              title="Очистить все воксели"
              onClick={() => draft && applyEdit(clearVoxelModel(draft))}
            >
              Очистить
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

          {!variantMode ? (
            <div className="ember-voxel-sculpt__chrome-group">
              <button
                type="button"
                className={`ghost ${autoSave ? "is-on" : ""}`}
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
                Авто
              </button>
              {autoSaveNote ? (
                <span
                  className="ember-voxel-sculpt__chrome-label"
                  title="Последнее автосохранение"
                >
                  {autoSaveNote}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="ember-voxel-sculpt__chrome-actions">
            {!variantMode && !onClose && models.length > 0 ? (
              <button
                type="button"
                className="ghost"
                title="Вернуться к меню выбора объекта"
                onClick={() => setBrowsePicker(true)}
              >
                Меню
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
              title="Чужой меш из библиотеки: основа / открыть / + объект"
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
              disabled={
                !libLoadId ||
                !pack.voxelModels[libLoadId] ||
                !draft ||
                libLoadId === draft.id
              }
              title="Скопировать выбранный блок в текущий (id сохранится)"
              onClick={() => applyLibraryAsBase(libLoadId)}
            >
              Основа
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!libLoadId || !pack.voxelModels[libLoadId]}
              title="Открыть выбранный блок в редакторе"
              onClick={() => loadLibraryModel(libLoadId)}
            >
              Открыть
            </button>
            <button
              type="button"
              className="ghost"
              disabled={
                variantMode ||
                !activeScene ||
                !libLoadId ||
                !pack.voxelModels[libLoadId]
              }
              title="Добавить меш из библиотеки как новый объект"
              onClick={addObjectFromLibrary}
            >
              + Объект
            </button>
            <button
              type="button"
              className="ghost"
              onClick={createModel}
              title="Новая модель 1×1×1"
            >
              + 1×1×1
            </button>
          </div>
        </div>
      </div>

      <div className="ember-voxel-sculpt__main">
        <aside
          className="ember-voxel-sculpt__side ember-voxel-sculpt__side--tools"
          aria-label="Инструменты редактирования"
        >
          <p className="ember-voxel-sculpt__side-title">Редактирование</p>
          <p className="muted ember-voxel-sculpt__status">
            {grid
              ? `Сетка ${grid.sx}×${grid.sy}×${grid.sz}`
              : "Выберите или создайте модель"}
            {canUndo || canRedo
              ? ` · история ${undoStackRef.current.length}/${redoStackRef.current.length}`
              : null}
            <span>{hoverLabel}</span>
            {hingeActive ? (
              <span>
                {" "}
                · петля шаг{" "}
                {hingePickStep === "child" ? "2/2" : "1/2"}: клик вершины
              </span>
            ) : null}
          </p>

          <p className="ember-voxel-sculpt__section">Инструменты</p>
          <div className="ember-voxel-sculpt__tools" role="toolbar">
            {TOOL_BUTTONS.map(({ id, label, tip, key }) => (
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
                <em>{key}</em>
                {label}
              </button>
            ))}
          </div>

          {tool === "move" ? (
            <p className="muted ember-hint">
              Стрелки: XZ · Shift+↑↓: Y · или Δ в параметрах объекта
            </p>
          ) : null}

          {tool === "emit" || (tool === "select" && selection) ? (
            <EditableRange
              label="Яркость"
              value={emitAmount}
              min={0}
              max={255}
              onChange={setEmitAmount}
            />
          ) : null}

          {tool === "shine" || (tool === "select" && selection) ? (
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

          {tool === "transparency" || (tool === "select" && selection) ? (
            <EditableRange
              label="Прозрачность"
              value={transparencyAmount}
              min={0}
              max={255}
              title="0 = непрозрачный · 255 = почти стекло (свет проходит)"
              onChange={setTransparencyAmount}
            />
          ) : null}

          {tool !== "erase" &&
          tool !== "emit" &&
          tool !== "shine" &&
          tool !== "transparency" ? (
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
                      title={`#${i}`}
                      onClick={() => {
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
            </>
          ) : null}

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
              <em>⇧U</em>
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
                    : "ЛКМ/drag — группы · Shift+ЛКМ — добавить · ПКМ — снять"
              : "R — группа · Shift+L умный · Shift+Y слой · Esc снять"}
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
              title="Перекрасить только сплошные клетки"
              onClick={() => applySelectionOp("paint")}
            >
              Краска
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
              disabled={!draft || !selection?.length}
              title="Эмиссия на выделении"
              onClick={() => applySelectionOp("emit")}
            >
              Свет
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft || !selection?.length}
              title="Блеск на выделении"
              onClick={() => applySelectionOp("shine")}
            >
              Блеск
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!draft || !selection?.length}
              title="Прозрачность на выделении"
              onClick={() => applySelectionOp("transparency")}
            >
              Прозр.
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
          </div>
        </aside>

        <div className="ember-voxel-sculpt__view-col">
          <div className="ember-voxel-sculpt__view-wrap">
            <div ref={hostRef} className="ember-voxel-sculpt__view" />
            <div
              ref={axesHostRef}
              className="ember-voxel-sculpt__axes"
              title="Клик по концу оси — вид с этой стороны (как в Blender)"
            />
          </div>
          {!variantMode ? (
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
        </div>
        <aside
          className="ember-voxel-sculpt__side ember-voxel-sculpt__side--scene"
          aria-label="Сцена и модификаторы"
        >
          <p className="ember-voxel-sculpt__side-title">Сцена</p>

          {!variantMode ? (
            <VoxelSceneOutliner
              scene={activeScene}
              activeObjectId={activeObject?.id ?? null}
              onSelectObject={(id) => setActiveObjectId(id)}
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
              onSeparate={separateSelection}
              canSeparate={Boolean(draft && selection?.length)}
            />
          ) : null}

          {!variantMode && activeObject ? (
            <VoxelObjectPropsPanel
              object={activeObject}
              model={
                draft && draft.id === activeObject.modelId
                  ? draft
                  : pack.voxelModels[activeObject.modelId] ?? null
              }
              canRemove={(activeScene?.objects.length ?? 0) >= 2}
              onRename={(nameRu) => {
                if (!activeScene) return;
                commitScene(
                  patchSceneObject(activeScene, activeObject.id, { nameRu }),
                );
              }}
              onSetOffset={(offset) => {
                if (!activeScene) return;
                commitScene(
                  patchSceneObject(activeScene, activeObject.id, { offset }),
                );
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
              onDuplicate={() => duplicateSceneObject(activeObject.id)}
              onRemove={() => removeObjectFromScene(activeObject.id)}
              pickingLightOrigin={pickingLightOrigin}
              onStartPickLightOrigin={() => {
                setPickingLightOrigin(true);
                onSaved?.(
                  "Кликните воксель — туда встанет PointLight (центр ячейки)",
                );
              }}
              onClearLightOrigin={() => {
                if (!draft || draft.id !== activeObject.modelId) return;
                beginEditRef.current();
                setDraft({
                  ...draft,
                  emissiveLightOrigin: undefined,
                  emissiveLightOffset: undefined,
                });
                onSaved?.("Источник света: авто (центр emissive)");
              }}
            />
          ) : null}

          <p className="ember-voxel-sculpt__section">Модификаторы</p>

          {tool === "inspect" || inspectTarget ? (
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

          {hingeActive ? (
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
          )}
        </aside>
      </div>
    </div>
  );
}
