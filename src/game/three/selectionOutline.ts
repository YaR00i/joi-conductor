/**
 * Editor hover / selection outlines in world space (edge glow).
 * Replaces the old 2D canvas rect overlays for 3D orbit view.
 */
import * as THREE from "three";
import type { EmberMap } from "../content/types";
import {
  bottomOccupiedElevAt,
  elevTileIdAt,
  topOccupiedElevAt,
} from "../tile/elevGroundLayers";
import { blockStoryHeight, elevStoryWorldSpan } from "../tile/extruded";
import { elevationAt, heightVoxelsAt, tileSurfaceElev } from "../tile/mapUtils";
export type EditorPick =
  | { kind: "sprite"; id: string }
  | { kind: "voxel"; id: string }
  /** `elev` = occupied story under the cursor (Minecraft column). */
  | { kind: "tile"; tx: number; ty: number; elev?: number };

/** Ground rings showing a lamp's core / mid / rim disc radii. */
export type LampRangeMark = {
  tx: number;
  ty: number;
  rangeTiles: number;
  coreTiles?: number;
  midTiles?: number;
  colorHex?: string;
};

export type OutlineTone = "hover" | "select" | "lib" | "region";

const TONE_COLOR: Record<OutlineTone, number> = {
  hover: 0xffe2a8,
  select: 0xffc878,
  lib: 0xff9a40,
  region: 0xffd878,
};

const TONE_OPACITY: Record<OutlineTone, number> = {
  hover: 0.98,
  select: 0.92,
  lib: 0.95,
  region: 0.88,
};

const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _box = new THREE.Box3();

export function createOutlineRoot(): THREE.Group {
  const g = new THREE.Group();
  g.name = "selectionOutlines";
  g.renderOrder = 20;
  return g;
}

export function clearOutlineRoot(root: THREE.Object3D): void {
  while (root.children.length) {
    const c = root.children[0]!;
    root.remove(c);
    disposeOutlineTree(c);
  }
}

function disposeOutlineTree(o: THREE.Object3D): void {
  o.traverse((child) => {
    if (
      child instanceof THREE.LineSegments ||
      child instanceof THREE.Line ||
      child instanceof THREE.Mesh
    ) {
      child.geometry.dispose();
      const m = child.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m.dispose();
    }
  });
}

function lineMat(
  tone: OutlineTone,
  opacityMul = 1,
): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: TONE_COLOR[tone],
    transparent: true,
    opacity: Math.max(0, Math.min(1, TONE_OPACITY[tone] * opacityMul)),
    // Keep selection/hover visible when zoomed in (avoid floor z-fight).
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

/** Push 12 edges of an AABB into a flat position buffer. */
function pushBoxEdges(
  out: number[],
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): void {
  const corners: [number, number, number][] = [
    [minX, minY, minZ],
    [maxX, minY, minZ],
    [maxX, minY, maxZ],
    [minX, minY, maxZ],
    [minX, maxY, minZ],
    [maxX, maxY, minZ],
    [maxX, maxY, maxZ],
    [minX, maxY, maxZ],
  ];
  const edges: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  for (const [a, b] of edges) {
    const ca = corners[a]!;
    const cb = corners[b]!;
    out.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2]);
  }
}

/** Live Shift+LMB group frame on one work-plane story (not terrain-following). */
export type PlanarMarqueeMark = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  elev: number;
};

export function addPlanarMarqueeOutline(
  root: THREE.Object3D,
  map: EmberMap,
  mark: PlanarMarqueeMark,
): void {
  if (mark.x1 < mark.x0 || mark.y1 < mark.y0) return;
  const ts = map.tileSize;
  const storyH = blockStoryHeight(ts);
  const { y0, y1 } = elevStoryWorldSpan(mark.elev, storyH);
  const pad = 0.22;
  const minX = mark.x0 * ts - pad;
  const maxX = (mark.x1 + 1) * ts + pad;
  const minZ = mark.y0 * ts - pad;
  const maxZ = (mark.y1 + 1) * ts + pad;
  const y = y1 + 0.18;
  const positions: number[] = [];
  const corners: [number, number][] = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ];
  for (let i = 0; i < 4; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % 4]!;
    positions.push(a[0], y, a[1], b[0], y, b[1]);
  }
  const post = Math.max(2.4, storyH * 0.4);
  for (const [x, z] of corners) {
    positions.push(x, y0 - 0.1, z, x, y, z);
    positions.push(x, y, z, x, y + post * 0.15, z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color: 0x7ec8ff,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  lines.renderOrder = 34;
  lines.frustumCulled = false;
  root.add(lines);

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
    new THREE.MeshBasicMaterial({
      color: 0x5aa8e8,
      transparent: true,
      opacity: 0.16,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.set((minX + maxX) * 0.5, y, (minZ + maxZ) * 0.5);
  fill.renderOrder = 33;
  fill.frustumCulled = false;
  root.add(fill);
}

/** Single AABB outline for a region rect (camera_bound / large zones). */
export function addRegionBoundsOutline(
  root: THREE.Object3D,
  map: EmberMap,
  bounds: { x: number; y: number; w: number; h: number; elev?: number },
  tone: OutlineTone,
  opacityMul = 1,
): void {
  if (bounds.w <= 0 || bounds.h <= 0) return;
  const ts = map.tileSize;
  const storyH = blockStoryHeight(ts);
  const cx = Math.floor(bounds.x + bounds.w * 0.5);
  const cy = Math.floor(bounds.y + bounds.h * 0.5);
  const elev =
    bounds.elev ?? tileSurfaceElev(map, cx, cy);
  const y = elev * storyH + 1.2;
  const positions: number[] = [];
  pushBoxEdges(
    positions,
    bounds.x * ts,
    y,
    bounds.y * ts,
    (bounds.x + bounds.w) * ts,
    y + 1.2,
    (bounds.y + bounds.h) * ts,
  );
  const px = (bounds.x + bounds.w * 0.5) * ts;
  const pz = (bounds.y + bounds.h * 0.5) * ts;
  const arm = Math.min(ts * 0.4, 6);
  positions.push(
    px - arm,
    y + 0.6,
    pz,
    px + arm,
    y + 0.6,
    pz,
    px,
    y + 0.6,
    pz - arm,
    px,
    y + 0.6,
    pz + arm,
  );
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(geo, lineMat(tone, opacityMul));
  lines.renderOrder = 30;
  lines.frustumCulled = false;
  root.add(lines);
}

function cellWorldBox(
  map: EmberMap,
  tx: number,
  ty: number,
  inflate: number,
  /** When set, frame only this story cube (not the whole column). */
  elev?: number,
): {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
} | null {
  const ts = map.tileSize;
  const storyH = blockStoryHeight(ts);
  const voxUnit = ts / 16;
  const minX = tx * ts - inflate;
  const maxX = (tx + 1) * ts + inflate;
  const minZ = ty * ts - inflate;
  const maxZ = (ty + 1) * ts + inflate;

  const top = topOccupiedElevAt(map, tx, ty) ?? elevationAt(map, tx, ty);
  const voxH = heightVoxelsAt(map, tx, ty);

  // Explicit story: a 1-high pad at that floor, even in empty air
  // (indoor zones sit under a ceiling without occupying that cell).
  if (elev != null) {
    const { y0, y1 } = elevStoryWorldSpan(elev, storyH);
    let maxY = y1 + 0.9 + inflate;
    if (elevTileIdAt(map, tx, ty, elev) && voxH > 0 && elev === top) {
      maxY = Math.max(
        maxY,
        top * storyH + Math.max(voxUnit, voxH * voxUnit) + inflate,
      );
    }
    return {
      minX,
      minY: y0 - inflate,
      minZ,
      maxX,
      maxY,
      maxZ,
    };
  }

  // No elev: top occupied story, or flat pad on empty cells.
  if (bottomOccupiedElevAt(map, tx, ty) == null && voxH <= 0) {
    const y = top * storyH + 1.05;
    return {
      minX,
      minY: y,
      minZ,
      maxX,
      maxY: y + 1.35 + inflate,
      maxZ,
    };
  }

  const story = topOccupiedElevAt(map, tx, ty) ?? elevationAt(map, tx, ty);
  const { y0, y1 } = elevStoryWorldSpan(story, storyH);
  let maxY = y1 + 0.9 + inflate;
  if (voxH > 0) {
    maxY = Math.max(
      maxY,
      top * storyH + Math.max(voxUnit, voxH * voxUnit) + inflate,
    );
  }
  return {
    minX,
    minY: y0 - inflate,
    minZ,
    maxX,
    maxY,
    maxZ,
  };
}

/** One merged LineSegments for many map cells (drag / region / lib). */
export function addTileCellOutlines(
  root: THREE.Object3D,
  map: EmberMap,
  cells: ReadonlyArray<{ tx: number; ty: number; elev?: number }>,
  tone: OutlineTone,
  opacityMul = 1,
): void {
  if (cells.length === 0) return;
  const positions: number[] = [];
  const inflate = tone === "hover" ? 0.2 : 0.12;
  for (const { tx, ty, elev } of cells) {
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
    const b = cellWorldBox(map, tx, ty, inflate, elev);
    if (!b) continue;
    pushBoxEdges(
      positions,
      b.minX,
      b.minY,
      b.minZ,
      b.maxX,
      b.maxY,
      b.maxZ,
    );
  }
  if (positions.length === 0) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(geo, lineMat(tone, opacityMul));
  lines.renderOrder = 30;
  lines.frustumCulled = false;
  root.add(lines);
}

/**
 * AABB edge glow for props (sprites / voxels).
 * Prefer a full selection box over mesh EdgesGeometry — partial voxel shells
 * looked like the highlight didn't wrap the whole object.
 */
export function addObjectBoundaryOutline(
  root: THREE.Object3D,
  obj: THREE.Object3D,
  tone: OutlineTone,
  opacityMul = 1,
): void {
  const mat = lineMat(tone, opacityMul);

  const authoredWorldBounds = obj.userData.editorWorldBounds;
  if (authoredWorldBounds instanceof THREE.Box3) {
    _box.copy(authoredWorldBounds);
  } else {
    obj.updateWorldMatrix(true, true);
    _box.setFromObject(obj);
  }
  if (_box.isEmpty()) {
    mat.dispose();
    return;
  }
  _box.getSize(_size);
  _box.getCenter(_center);
  const pad = 0.35;
  _size.x = Math.max(0.5, _size.x) + pad * 2;
  _size.y = Math.max(0.5, _size.y) + pad * 2;
  _size.z = Math.max(0.5, _size.z) + pad * 2;
  const boxGeo = new THREE.BoxGeometry(_size.x, _size.y, _size.z);
  const edges = new THREE.EdgesGeometry(boxGeo);
  boxGeo.dispose();
  const lines = new THREE.LineSegments(edges, mat);
  lines.position.copy(_center);
  lines.renderOrder = 40;
  lines.frustumCulled = false;
  root.add(lines);
}

/** Live Minecraft-style place / erase ghost at a story elev. */
export type PlacePreviewMark = {
  tx: number;
  ty: number;
  elev: number;
  /** Erase ghost is reddish; place stays cool blue. */
  mode?: "place" | "erase";
};

export function addPlacePreviewOutline(
  root: THREE.Object3D,
  map: EmberMap,
  preview: PlacePreviewMark,
): void {
  if (
    preview.tx < 0 ||
    preview.ty < 0 ||
    preview.tx >= map.width ||
    preview.ty >= map.height
  ) {
    return;
  }
  const erase = preview.mode === "erase";
  const lineColor = erase ? 0xff8a7a : 0x7ec8ff;
  const fillColor = erase ? 0xe06050 : 0x5aa8e8;
  const ts = map.tileSize;
  const storyH = blockStoryHeight(ts);
  const { y0, y1 } = elevStoryWorldSpan(preview.elev, storyH);
  const pad = 0.18;
  const positions: number[] = [];
  pushBoxEdges(
    positions,
    preview.tx * ts - pad,
    y0 - pad,
    preview.ty * ts - pad,
    (preview.tx + 1) * ts + pad,
    y1 + pad,
    (preview.ty + 1) * ts + pad,
  );
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color: lineColor,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  lines.renderOrder = 35;
  lines.frustumCulled = false;
  root.add(lines);

  // Soft fill so the target cell reads clearly while hovering.
  const fillGeo = new THREE.BoxGeometry(
    ts * 0.92,
    storyH * 0.92,
    ts * 0.92,
  );
  const fill = new THREE.Mesh(
    fillGeo,
    new THREE.MeshBasicMaterial({
      color: fillColor,
      transparent: true,
      opacity: erase ? 0.28 : 0.22,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  fill.position.set(
    (preview.tx + 0.5) * ts,
    y0 + storyH * 0.5,
    (preview.ty + 0.5) * ts,
  );
  fill.renderOrder = 34;
  fill.frustumCulled = false;
  root.add(fill);
}

/** Concentric disc edges at authorable core / mid / rim tile radii. */
export function addLampRangeRing(
  root: THREE.Object3D,
  map: EmberMap,
  mark: LampRangeMark,
): void {
  const ts = map.tileSize;
  const elev = tileSurfaceElev(map, mark.tx, mark.ty);
  const y = elev * blockStoryHeight(ts) + 1.35;
  const rimTiles = Math.max(1, mark.rangeTiles);
  const coreTiles = Math.max(1, Math.min(rimTiles, mark.coreTiles ?? Math.round(rimTiles * 0.4)));
  const midTiles = Math.max(
    coreTiles,
    Math.min(rimTiles, mark.midTiles ?? Math.round(rimTiles * 0.7)),
  );
  const rgb = mark.colorHex?.startsWith("#")
    ? mark.colorHex
    : "#ffb060";
  const cx = (mark.tx + 0.5) * ts;
  const cz = (mark.ty + 0.5) * ts;
  const steps = [
    { tiles: coreTiles, opacity: 0.55 },
    { tiles: midTiles, opacity: 0.7 },
    { tiles: rimTiles, opacity: 0.85 },
  ] as const;
  for (const step of steps) {
    const r = Math.max(ts * 0.35, step.tiles * ts);
    // Thin line loops (not filled discs) so they read as UI, not leaked light.
    const pts: THREE.Vector3[] = [];
    const segments = 96;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    const ring = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color: rgb,
        transparent: true,
        opacity: step.opacity,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
    );
    ring.position.set(cx, y, cz);
    ring.renderOrder = 28;
    ring.frustumCulled = false;
    root.add(ring);
  }
}

export function findPickRoot(
  hitObject: THREE.Object3D,
  instanceId?: number,
): EditorPick | null {
  if (instanceId != null && instanceId >= 0) {
    const picks = hitObject.userData.editorInstancePicks as
      | EditorPick[]
      | undefined;
    const pick = picks?.[instanceId];
    if (pick?.kind === "voxel") return pick;
  }
  let o: THREE.Object3D | null = hitObject;
  while (o) {
    const pick = o.userData.editorPick as EditorPick | undefined;
    if (pick && (pick.kind === "sprite" || pick.kind === "voxel")) {
      return pick;
    }
    o = o.parent;
  }
  return null;
}

export function findPropByPick(
  propRoot: THREE.Object3D,
  pick: EditorPick,
): THREE.Object3D | null {
  if (pick.kind !== "sprite" && pick.kind !== "voxel") return null;
  let found: THREE.Object3D | null = null;
  propRoot.traverse((o) => {
    if (found) return;
    const boundsById = o.userData.editorInstanceBoundsById as
      | Map<string, THREE.Box3>
      | undefined;
    const bounds = boundsById?.get(pick.id);
    if (pick.kind === "voxel" && bounds) {
      const proxy = new THREE.Object3D();
      proxy.userData.editorPick = pick;
      proxy.userData.editorWorldBounds = bounds;
      found = proxy;
      return;
    }
    const p = o.userData.editorPick as EditorPick | undefined;
    if (p && p.kind === pick.kind && p.id === pick.id) found = o;
  });
  return found;
}
