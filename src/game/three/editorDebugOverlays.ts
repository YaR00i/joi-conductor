/**
 * Map-editor debug overlays for the Three viewport:
 * collision walls (height labels), floor elevation tint, semantic tiles, all regions.
 */
import * as THREE from "three";
import type {
  EmberMap,
  EmberMapRegion,
  EmberTileset,
  EmberTilesetTile,
} from "../content/types";
import { blockStoryHeight } from "../tile/extruded";
import {
  elevationAt,
  heightAt,
  heightVoxelsAt,
  layerData,
  tileSurfaceElev,
} from "../tile/mapUtils";

export type EditorDebugOverlayFlags = {
  showCollision: boolean;
  showElevation: boolean;
  showRegions: boolean;
  showSemantics: boolean;
};

const REGION_COLOR: Record<string, number> = {
  player_start: 0x66ff66,
  spawn: 0xff8866,
  chest: 0xffcc66,
  teleport: 0xe0a0ff,
  camera_bound: 0x88c8ff,
  trigger: 0x88aaff,
};

/** Shared sprite materials for wall-height digits (not disposed per rebuild). */
const heightLabelMatCache = new Map<string, THREE.SpriteMaterial>();

function regionColor(kind: string): number {
  return REGION_COLOR[kind] ?? 0x88aaff;
}

function disposeTree(o: THREE.Object3D): void {
  o.traverse((child) => {
    if (child instanceof THREE.Sprite) {
      // Height labels reuse cached materials — never dispose those here.
      const mat = child.material;
      if (mat.userData?.emberSharedLabel) return;
      mat.map?.dispose();
      mat.dispose();
      return;
    }
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

export function createDebugOverlayRoot(): THREE.Group {
  const g = new THREE.Group();
  g.name = "editorDebugOverlays";
  g.renderOrder = 15;
  return g;
}

export function clearDebugOverlayRoot(root: THREE.Object3D): void {
  while (root.children.length) {
    const c = root.children[0]!;
    root.remove(c);
    disposeTree(c);
  }
}

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

/** Top-face rectangle only — no vertical cage clutter. */
function pushTopRectEdges(
  out: number[],
  minX: number,
  y: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): void {
  out.push(
    minX,
    y,
    minZ,
    maxX,
    y,
    minZ,
    maxX,
    y,
    minZ,
    maxX,
    y,
    maxZ,
    maxX,
    y,
    maxZ,
    minX,
    y,
    maxZ,
    minX,
    y,
    maxZ,
    minX,
    y,
    minZ,
  );
}

function cellBox(
  map: EmberMap,
  tx: number,
  ty: number,
  inflate: number,
): {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
} {
  const ts = map.tileSize;
  const storyH = blockStoryHeight(ts);
  const voxUnit = ts / 16;
  const elev = elevationAt(map, tx, ty);
  const voxH = heightVoxelsAt(map, tx, ty);
  const baseY = elev * storyH;
  const minX = tx * ts - inflate;
  const maxX = (tx + 1) * ts + inflate;
  const minZ = ty * ts - inflate;
  const maxZ = (ty + 1) * ts + inflate;
  if (voxH > 0) {
    const h = Math.max(voxUnit, voxH * voxUnit);
    return {
      minX,
      minY: baseY - inflate,
      minZ,
      maxX,
      maxY: baseY + h + inflate,
      maxZ,
    };
  }
  const y = baseY + 1.1;
  return {
    minX,
    minY: y,
    minZ,
    maxX,
    maxY: y + 1.4 + inflate,
    maxZ,
  };
}

function addLineBatch(
  root: THREE.Object3D,
  positions: number[],
  color: number,
  opacity: number,
): void {
  if (positions.length < 6) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      // Editor UI: always draw over the map (close zoom used to z-fight away).
      depthTest: false,
      toneMapped: false,
    }),
  );
  lines.renderOrder = 25;
  lines.frustumCulled = false;
  root.add(lines);
}

function addFloorPads(
  root: THREE.Object3D,
  map: EmberMap,
  cells: ReadonlyArray<{
    tx: number;
    ty: number;
    color: number;
    opacity: number;
  }>,
): void {
  if (cells.length === 0) return;
  const ts = map.tileSize;
  const storyH = blockStoryHeight(ts);
  const buckets = new Map<
    string,
    {
      color: number;
      opacity: number;
      positions: number[];
      indices: number[];
      vBase: number;
    }
  >();
  for (const c of cells) {
    const key = `${c.color}_${c.opacity.toFixed(3)}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        color: c.color,
        opacity: c.opacity,
        positions: [],
        indices: [],
        vBase: 0,
      };
      buckets.set(key, b);
    }
    const elev = tileSurfaceElev(map, c.tx, c.ty);
    // Sit clearly above the floor / wall top so near-camera depth precision can't hide pads.
    const y = elev * storyH + 1.25;
    const cx = (c.tx + 0.5) * ts;
    const cz = (c.ty + 0.5) * ts;
    const h = ts * 0.46;
    const corners: [number, number, number][] = [
      [cx - h, y, cz - h],
      [cx + h, y, cz - h],
      [cx + h, y, cz + h],
      [cx - h, y, cz + h],
    ];
    for (const p of corners) b.positions.push(p[0], p[1], p[2]);
    const v = b.vBase;
    b.indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
    b.vBase += 4;
  }
  for (const b of buckets.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(b.positions, 3),
    );
    geo.setIndex(b.indices);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: b.color,
        transparent: true,
        opacity: b.opacity,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.renderOrder = 18;
    mesh.frustumCulled = false;
    root.add(mesh);
  }
}

function isWallCell(
  map: EmberMap,
  tx: number,
  ty: number,
  col: number[] | null,
): boolean {
  const gi = ty * map.width + tx;
  return heightAt(map, tx, ty) >= 1 || (col?.[gi] ?? 0) > 0;
}

/** Wall-height label: always voxels (same unit as the wall brush). */
function wallHeightLabelText(voxH: number): string {
  if (voxH <= 0) return "·";
  return String(voxH);
}

function getHeightLabelMaterial(text: string): THREE.SpriteMaterial {
  const cached = heightLabelMatCache.get(text);
  if (cached) return cached;

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const fallback = new THREE.SpriteMaterial({
      color: 0xffe8d0,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    fallback.userData.emberSharedLabel = true;
    heightLabelMatCache.set(text, fallback);
    return fallback;
  }

  ctx.clearRect(0, 0, size, size);
  // Soft plate so digits read on both dark water and bright tops.
  ctx.fillStyle = "rgba(20, 10, 12, 0.55)";
  const pad = 4;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, 10);
    ctx.fill();
  } else {
    ctx.fillRect(pad, pad, size - pad * 2, size - pad * 2);
  }

  ctx.font =
    text.length > 2
      ? "700 28px ui-sans-serif, system-ui, sans-serif"
      : "700 36px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(12, 6, 8, 0.85)";
  ctx.strokeText(text, size / 2, size / 2 + 1);
  ctx.fillStyle = "#ffe0c8";
  ctx.fillText(text, size / 2, size / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  mat.userData.emberSharedLabel = true;
  heightLabelMatCache.set(text, mat);
  return mat;
}

function addWallHeightLabels(
  root: THREE.Object3D,
  map: EmberMap,
  cells: ReadonlyArray<{ tx: number; ty: number; voxH: number }>,
): void {
  if (cells.length === 0) return;
  const ts = map.tileSize;
  const storyH = blockStoryHeight(ts);
  const labels = new THREE.Group();
  labels.name = "wallHeightLabels";
  labels.renderOrder = 28;

  for (const c of cells) {
    const text = wallHeightLabelText(c.voxH);
    const mat = getHeightLabelMaterial(text);
    const sprite = new THREE.Sprite(mat);
    const topY = tileSurfaceElev(map, c.tx, c.ty) * storyH + 2.2;
    // Center of the top face — one digit per cell, no corner pile-up.
    sprite.position.set(
      (c.tx + 0.5) * ts,
      topY,
      (c.ty + 0.5) * ts,
    );
    const s = ts * (text.length > 2 ? 0.48 : 0.42);
    sprite.scale.set(s, s, 1);
    sprite.frustumCulled = false;
    sprite.renderOrder = 28;
    labels.add(sprite);
  }
  root.add(labels);
}

type SemanticMarker = {
  tx: number;
  ty: number;
  color: number;
  opacity: number;
  label: string;
};

function semanticMarkerForTile(
  tx: number,
  ty: number,
  tile: EmberTilesetTile | undefined,
): SemanticMarker | null {
  if (!tile) return null;
  if (tile.hazard) {
    return { tx, ty, color: 0xff5636, opacity: 0.28, label: "!" };
  }
  if (tile.portal && tile.trigger) {
    return { tx, ty, color: 0x58b7ff, opacity: 0.26, label: "PT" };
  }
  if (tile.portal) {
    return { tx, ty, color: 0xa066ff, opacity: 0.24, label: "P" };
  }
  if (tile.trigger) {
    return { tx, ty, color: 0xffcc55, opacity: 0.24, label: "T" };
  }
  if (tile.slow && tile.stain) {
    return { tx, ty, color: 0x58b85f, opacity: 0.23, label: "SF" };
  }
  if (tile.stain) {
    return { tx, ty, color: 0x76b044, opacity: 0.22, label: "F" };
  }
  if (tile.slow) {
    return { tx, ty, color: 0x8a6a42, opacity: 0.22, label: "S" };
  }
  return null;
}

function addSemanticLabels(
  root: THREE.Object3D,
  map: EmberMap,
  markers: ReadonlyArray<SemanticMarker>,
): void {
  if (markers.length === 0) return;
  const ts = map.tileSize;
  const storyH = blockStoryHeight(ts);
  const labels = new THREE.Group();
  labels.name = "semanticTileLabels";
  labels.renderOrder = 29;

  for (const marker of markers) {
    const mat = getHeightLabelMaterial(marker.label);
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(
      (marker.tx + 0.5) * ts,
      tileSurfaceElev(map, marker.tx, marker.ty) * storyH + 2.65,
      (marker.ty + 0.5) * ts,
    );
    const s = ts * (marker.label.length > 1 ? 0.5 : 0.42);
    sprite.scale.set(s, s, 1);
    sprite.frustumCulled = false;
    sprite.renderOrder = 29;
    labels.add(sprite);
  }
  root.add(labels);
}

function addRegionRectEdges(
  root: THREE.Object3D,
  map: EmberMap,
  r: EmberMapRegion,
  color: number,
): void {
  const ts = map.tileSize;
  const storyH = blockStoryHeight(ts);
  const elev = tileSurfaceElev(
    map,
    Math.floor(r.x + r.w * 0.5),
    Math.floor(r.y + r.h * 0.5),
  );
  const y = elev * storyH + 1.2;
  const minX = r.x * ts;
  const maxX = (r.x + r.w) * ts;
  const minZ = r.y * ts;
  const maxZ = (r.y + r.h) * ts;
  const positions: number[] = [];
  pushBoxEdges(positions, minX, y, minZ, maxX, y + 0.8, maxZ);
  addLineBatch(root, positions, color, 0.9);
}

export function rebuildEditorDebugOverlays(
  root: THREE.Object3D,
  map: EmberMap,
  flags: EditorDebugOverlayFlags,
  tileset?: EmberTileset | null,
): void {
  clearDebugOverlayRoot(root);
  if (
    !flags.showCollision &&
    !flags.showElevation &&
    !flags.showRegions &&
    !flags.showSemantics
  ) {
    return;
  }

  const col = layerData(map, "collision");

  if (flags.showCollision) {
    const pads: { tx: number; ty: number; color: number; opacity: number }[] =
      [];
    const topEdges: number[] = [];
    const labels: { tx: number; ty: number; voxH: number }[] = [];
    const ts = map.tileSize;
    const storyH = blockStoryHeight(ts);
    const inflate = 0.12;

    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (!isWallCell(map, tx, ty, col)) continue;
        const voxH = heightVoxelsAt(map, tx, ty);
        labels.push({ tx, ty, voxH });
        pads.push({
          tx,
          ty,
          color: 0xff6a7a,
          opacity: 0.14 + Math.min(0.22, (voxH / Math.max(1, storyH)) * 0.06),
        });
        const topY = tileSurfaceElev(map, tx, ty) * storyH + 1.35;
        pushTopRectEdges(
          topEdges,
          tx * ts - inflate,
          topY,
          ty * ts - inflate,
          (tx + 1) * ts + inflate,
          (ty + 1) * ts + inflate,
        );
      }
    }
    addFloorPads(root, map, pads);
    addLineBatch(root, topEdges, 0xff8a9a, 0.55);
    addWallHeightLabels(root, map, labels);
  }

  if (flags.showElevation) {
    const pads: { tx: number; ty: number; color: number; opacity: number }[] =
      [];
    const positions: number[] = [];
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (isWallCell(map, tx, ty, col)) continue;
        const elev = elevationAt(map, tx, ty);
        if (elev <= 0) continue;
        pads.push({
          tx,
          ty,
          color: 0x50a0ff,
          opacity: 0.12 + elev * 0.1,
        });
        const b = cellBox(map, tx, ty, 0.08);
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
    }
    addFloorPads(root, map, pads);
    addLineBatch(root, positions, 0x9ec8ff, 0.75);
  }

  if (flags.showSemantics && tileset) {
    const tileById = new Map(tileset.tiles.map((t) => [t.id, t]));
    const markers: SemanticMarker[] = [];
    const seen = new Set<string>();
    for (const layerName of ["decor", "ground"] as const) {
      const data = layerData(map, layerName);
      if (!data) continue;
      for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
          const key = `${tx},${ty}`;
          if (seen.has(key)) continue;
          const tile = tileById.get(data[ty * map.width + tx] ?? 0);
          const marker = semanticMarkerForTile(tx, ty, tile);
          if (!marker) continue;
          seen.add(key);
          markers.push(marker);
        }
      }
    }
    addFloorPads(root, map, markers);
    addSemanticLabels(root, map, markers);
  }

  if (flags.showRegions) {
    const pads: { tx: number; ty: number; color: number; opacity: number }[] =
      [];
    const edgeBuckets = new Map<number, number[]>();
    for (const r of map.regions) {
      const color = regionColor(r.kind);
      if (r.kind === "camera_bound") {
        addRegionRectEdges(root, map, r, color);
        continue;
      }
      let edges = edgeBuckets.get(color);
      if (!edges) {
        edges = [];
        edgeBuckets.set(color, edges);
      }
      for (let j = 0; j < r.h; j++) {
        for (let i = 0; i < r.w; i++) {
          const tx = r.x + i;
          const ty = r.y + j;
          if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
          pads.push({ tx, ty, color, opacity: 0.22 });
          const ts = map.tileSize;
          const storyH = blockStoryHeight(ts);
          const topY = tileSurfaceElev(map, tx, ty) * storyH;
          const inflate = 0.1;
          pushBoxEdges(
            edges,
            tx * ts - inflate,
            topY + 0.05,
            ty * ts - inflate,
            (tx + 1) * ts + inflate,
            topY + 1.45,
            (ty + 1) * ts + inflate,
          );
        }
      }
    }
    addFloorPads(root, map, pads);
    for (const [color, positions] of edgeBuckets) {
      addLineBatch(root, positions, color, 0.8);
    }
  }
}
