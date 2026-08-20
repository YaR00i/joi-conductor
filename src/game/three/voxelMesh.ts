/**
 * Voxel map mesh: textured floors/walls with hard toon shading.
 * Blocks are cubes (storyH = tileSize). Wall UVs keep texel density —
 * shorter walls crop/offset the texture downward instead of squashing.
 *
 * Glow uses Mesh* emissiveMap + UnrealBloom (no extra additive overlay meshes).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { EmberMap, EmberTileset, EmberTilesetTile } from "../content/types";
import { blockStoryHeight, elevStoryWorldSpan } from "../tile/extruded";
import { emissiveAnimNeedsPerCellMaterial } from "../tile/emissivePaint";
import {
  elevationAt,
  elevTileAt,
  elevTileIdAt,
  elevationSteps,
  ensureMapLayers,
  groundTileAt,
  heightVoxelsAt,
  isSolidAt,
} from "../tile/mapUtils";
import {
  emissiveMetaFromTile,
  tagEmissiveMaterial,
} from "./emissiveAnimTick";
import {
  createTileSurfaceMaterial,
  getTileTopEmissiveMap,
  getTileTopShineRoughness,
  getTileTopTexture,
  getTileWallEmissiveMap,
  getTileWallShineRoughness,
  getTileWallTexture,
  tileEmissiveIntensity,
  tileHasEmissive,
  tileHasShine,
  tileUsesTransparency,
} from "./toonMaterials";
import { createWaterMaterial, isWaterTile } from "./waterMaterial";

export type VoxelMeshBuild = {
  group: THREE.Group;
  center: THREE.Vector3;
  bounds: THREE.Box3;
  tileSize: number;
  storyH: number;
};

export type VoxelMeshRegion = Readonly<{
  x0: number;
  y0: number;
  /** Exclusive east/south bounds. */
  x1: number;
  y1: number;
}>;

export type VoxelMeshOptions = Readonly<{
  /** Editor has no player trigger, so identical animated tiles can share a material. */
  perCellEmissiveMaterials?: boolean;
}>;

/**
 * Box with side-face UVs scaled to world height / tileSize (top-aligned).
 * Top/bottom faces keep 0..1 UVs.
 */
function boxAt(
  cx: number,
  cy: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  tileWorld: number,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  if (uv) {
    const vScale = Math.max(0.001, h / Math.max(1, tileWorld));
    const vOffset = 1 - vScale;
    const arr = uv.array as Float32Array;
    for (let face = 0; face < 6; face++) {
      if (face === 2 || face === 3) continue;
      for (let i = 0; i < 4; i++) {
        const vi = face * 4 + i;
        const o = vi * 2 + 1;
        arr[o] = (arr[o] ?? 0) * vScale + vOffset;
      }
    }
    uv.needsUpdate = true;
  }
  g.translate(cx, cy, cz);
  return g;
}

/** Thin horizontal water surface — no side walls that hide neighboring tiles.
 * `shore`: N/E/S/W = neighbor is land.
 * emberShore = 0..1 distance to shore (1 at outer rim) over ~3 segments so
 * the fragment shader can vary foam width without corner triangles.
 * emberWaterDepth = 0 on the surface (walls use 0..1 fade).
 */
function waterSlabAt(
  cx: number,
  cy: number,
  cz: number,
  w: number,
  d: number,
  shore: { n: boolean; e: boolean; s: boolean; w: boolean },
): THREE.BufferGeometry {
  const segs = 12;
  const g = new THREE.PlaneGeometry(w, d, segs, segs);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const shoreAttr = new Float32Array(pos.count);
  const depthAttr = new Float32Array(pos.count);
  const hx = Math.max(1e-4, w * 0.5);
  const hz = Math.max(1e-4, d * 0.5);
  // Foam band covers outer ~3 segments (~4–6 px-ish at typical view).
  const rimStart = 1 - 3 / segs;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / hx;
    const v = pos.getZ(i) / hz;
    let foam = 0;
    const edgeDist = (coord: number) =>
      Math.max(0, Math.min(1, (Math.abs(coord) - rimStart) / (1 - rimStart)));
    if (shore.e && u > rimStart) foam = Math.max(foam, edgeDist(u));
    if (shore.w && u < -rimStart) foam = Math.max(foam, edgeDist(u));
    if (shore.s && v > rimStart) foam = Math.max(foam, edgeDist(v));
    if (shore.n && v < -rimStart) foam = Math.max(foam, edgeDist(v));
    shoreAttr[i] = foam;
    depthAttr[i] = 0;
  }
  g.setAttribute("emberShore", new THREE.BufferAttribute(shoreAttr, 1));
  g.setAttribute("emberWaterDepth", new THREE.BufferAttribute(depthAttr, 1));
  g.translate(cx, cy, cz);
  return g;
}

/**
 * One vertical depth wall on a shore edge: surface → down.
 * emberWaterDepth 0 at top (near surface), 1 at bottom (fades out).
 */
function waterDepthWallAt(
  cx: number,
  topY: number,
  cz: number,
  ts: number,
  side: "n" | "e" | "s" | "w",
  depth: number,
): THREE.BufferGeometry {
  // Exact tile width — abutting water cells must not overlap (bright seams).
  const w = ts;
  const h = Math.max(0.15, depth);
  const g = new THREE.PlaneGeometry(w, h, 1, 4);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const shoreAttr = new Float32Array(pos.count);
  const depthAttr = new Float32Array(pos.count);
  const halfH = h * 0.5;
  for (let i = 0; i < pos.count; i++) {
    // PlaneGeometry: Y from -halfH..+halfH before transforms; +Y = top.
    const yLocal = pos.getY(i);
    depthAttr[i] = Math.max(0, Math.min(1, (halfH - yLocal) / h));
    shoreAttr[i] = 0;
  }
  g.setAttribute("emberShore", new THREE.BufferAttribute(shoreAttr, 1));
  g.setAttribute("emberWaterDepth", new THREE.BufferAttribute(depthAttr, 1));

  // Tiny inset toward water only — just enough to avoid land z-fight, not a gap.
  const inset = Math.max(0.02, ts * 0.0015);
  const midY = topY - halfH;
  switch (side) {
    case "e":
      g.rotateY(-Math.PI / 2);
      g.translate(cx + ts * 0.5 - inset, midY, cz);
      break;
    case "w":
      g.rotateY(Math.PI / 2);
      g.translate(cx - ts * 0.5 + inset, midY, cz);
      break;
    case "n":
      g.rotateY(Math.PI);
      g.translate(cx, midY, cz - ts * 0.5 + inset);
      break;
    case "s":
      g.translate(cx, midY, cz + ts * 0.5 - inset);
      break;
    default: {
      const _exhaustive: never = side;
      void _exhaustive;
      break;
    }
  }
  return g;
}

const WATER_BED_EARTH_NAME_HINTS = [
  "dirt",
  "earth",
  "soil",
  "ground",
  "земля",
  "грязь",
] as const;

const WATER_BED_FALLBACK_COLOR = "#3a2a1a";

function isEmptyTilesetTile(tile: EmberTilesetTile): boolean {
  return (
    tile.id === 0 ||
    tile.name === "empty" ||
    tile.color === "#00000000"
  );
}

/**
 * Prefer a dirt/earth ground tile for water seabed albedo.
 * Name match → first solid-looking floor → undefined (procedural fallback).
 */
function resolveWaterBedEarthTile(
  tileset: EmberTileset,
): EmberTilesetTile | undefined {
  const candidates = tileset.tiles.filter(
    (t) =>
      !isEmptyTilesetTile(t) &&
      !isWaterTile(t) &&
      !tileUsesTransparency(t),
  );
  for (const hint of WATER_BED_EARTH_NAME_HINTS) {
    const hit = candidates.find((t) =>
      t.name.toLowerCase().includes(hint),
    );
    if (hit) return hit;
  }
  return candidates[0];
}

export function buildVoxelMesh(
  mapIn: EmberMap,
  tileset: EmberTileset,
  region?: VoxelMeshRegion,
  options: VoxelMeshOptions = {},
): VoxelMeshBuild {
  const map = ensureMapLayers(mapIn);
  const ts = map.tileSize;
  const storyH = blockStoryHeight(ts);
  const voxUnit = ts / 16;
  const perCellEmissiveMaterials =
    options.perCellEmissiveMaterials !== false;

  const floorMats = new Map<number, THREE.Material>();
  const wallMats = new Map<number, THREE.Material>();
  const waterBedEarth = resolveWaterBedEarthTile(tileset);
  let waterBedMat: THREE.Material | null = null;
  const tileById = new Map(tileset.tiles.map((t) => [t.id, t]));

  const resolveTile = (tile: EmberTilesetTile | undefined): EmberTilesetTile => {
    if (tile && tile.color !== "#00000000" && tile.name !== "empty") return tile;
    return (
      tileById.get(1) ??
      tileset.tiles.find((t) => t.id !== 0 && t.color !== "#00000000") ??
      tileset.tiles[0]!
    );
  };

  const buildFloorMat = (tile: EmberTilesetTile): THREE.Material => {
    const albedo = getTileTopTexture(tile, ts, tile.color);
    if (isWaterTile(tile)) {
      return createWaterMaterial(albedo, tile, {
        voxelSize: voxUnit,
        tileSize: ts,
        stripeAxis: tile.waterStripeAxis === "z" ? "z" : "x",
      });
    }
    const rough = tileHasShine(tile, "top")
      ? getTileTopShineRoughness(tile, ts)
      : null;
    const emMap = tileHasEmissive(tile, "top")
      ? getTileTopEmissiveMap(tile, ts)
      : null;
    return createTileSurfaceMaterial(albedo, tile, {
      shineRoughness: rough,
      emissiveMap: emMap,
      emissiveIntensity: emMap ? tileEmissiveIntensity(tile) : 0,
    });
  };

  const buildWallMat = (tile: EmberTilesetTile): THREE.Material => {
    const tex = getTileWallTexture(tile, ts, tile.color || "#5a4a40");
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    const rough = tileHasShine(tile, "wall")
      ? getTileWallShineRoughness(tile, ts)
      : null;
    const emMap = tileHasEmissive(tile, "wall")
      ? getTileWallEmissiveMap(tile, ts)
      : null;
    if (emMap) {
      emMap.wrapS = THREE.RepeatWrapping;
      emMap.wrapT = THREE.RepeatWrapping;
    }
    if (rough) {
      rough.wrapS = THREE.RepeatWrapping;
      rough.wrapT = THREE.RepeatWrapping;
    }
    return createTileSurfaceMaterial(tex, tile, {
      shineRoughness: rough,
      emissiveMap: emMap,
      emissiveIntensity: emMap ? tileEmissiveIntensity(tile) : 0,
    });
  };

  /**
   * Soft muted seabed under water — readable depth, not a crisp opaque plate.
   * Albedo from dirt/earth tileset tile (not the water top); slight transparency
   * + edge fade + low contrast so it sits quietly under the translucent surface.
   */
  const buildWaterBedMat = (): THREE.Material => {
    const earth = waterBedEarth;
    const albedo = getTileTopTexture(
      earth,
      ts,
      earth?.color || WATER_BED_FALLBACK_COLOR,
    );
    const bedTile: EmberTilesetTile = earth
      ? { ...earth, transparent: true, opacity: 0.78 }
      : {
          id: -1,
          name: "water_bed_earth",
          color: WATER_BED_FALLBACK_COLOR,
          transparent: true,
          opacity: 0.78,
        };
    const mat = createTileSurfaceMaterial(albedo, bedTile, {});
    if ("color" in mat && mat.color instanceof THREE.Color) {
      mat.color.multiplyScalar(0.32);
    }
    mat.depthWrite = false;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = 1;
    mat.polygonOffsetUnits = 1;
    const prevKey =
      typeof mat.customProgramCacheKey === "function"
        ? mat.customProgramCacheKey.bind(mat)
        : () => "ember-water-bed";
    const prevCompile = mat.onBeforeCompile?.bind(mat);
    mat.onBeforeCompile = (shader, renderer) => {
      prevCompile?.(shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
	// Soft seabed: mute contrast, darken, fade toward cell edges (misty plate).
	vec2 _bedUv = vMapUv;
	float _bedEdge = max( abs( _bedUv.x - 0.5 ), abs( _bedUv.y - 0.5 ) ) * 2.0;
	float _bedSoft = 1.0 - smoothstep( 0.42, 1.02, _bedEdge );
	float _bedLuma = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
	vec3 _bedMuted = mix( vec3( _bedLuma ), diffuseColor.rgb, 0.28 ) * 0.42;
	_bedMuted = mix( _bedMuted, vec3( 0.06, 0.04, 0.025 ), 0.55 );
	diffuseColor.rgb = _bedMuted;
	diffuseColor.a *= mix( 0.18, 0.82, _bedSoft );`,
      );
    };
    mat.customProgramCacheKey = () => `${prevKey()}|water-bed-earth-soft-v1`;
    mat.needsUpdate = true;
    return mat;
  };

  const tagIfAnimated = (
    mat: THREE.Material,
    tile: EmberTilesetTile,
    face: "top" | "wall",
    tx?: number,
    ty?: number,
  ) => {
    if (!tileHasEmissive(tile, face)) return;
    tagEmissiveMaterial(
      mat,
      emissiveMetaFromTile(tile, { tx, ty, kind: "emissive" }),
    );
  };

  const getFloorMat = (
    tile: EmberTilesetTile,
    tx?: number,
    ty?: number,
  ): THREE.Material => {
    if (
      perCellEmissiveMaterials &&
      emissiveAnimNeedsPerCellMaterial(tile.emissiveAnim)
    ) {
      const m = buildFloorMat(tile);
      tagIfAnimated(m, tile, "top", tx, ty);
      return m;
    }
    let m = floorMats.get(tile.id);
    if (!m) {
      m = buildFloorMat(tile);
      tagIfAnimated(m, tile, "top");
      floorMats.set(tile.id, m);
    }
    return m;
  };

  const getWallMat = (
    tile: EmberTilesetTile,
    tx?: number,
    ty?: number,
  ): THREE.Material => {
    if (
      perCellEmissiveMaterials &&
      emissiveAnimNeedsPerCellMaterial(tile.emissiveAnim)
    ) {
      const m = buildWallMat(tile);
      tagIfAnimated(m, tile, "wall", tx, ty);
      return m;
    }
    let m = wallMats.get(tile.id);
    if (!m) {
      m = buildWallMat(tile);
      tagIfAnimated(m, tile, "wall");
      wallMats.set(tile.id, m);
    }
    return m;
  };

  const getWaterBedMat = (): THREE.Material => {
    if (!waterBedMat) waterBedMat = buildWaterBedMat();
    return waterBedMat;
  };

  type CellGeom = {
    tile: EmberTilesetTile;
    geom: THREE.BufferGeometry;
    tx: number;
    ty: number;
  };

  const floorBuckets = new Map<number, CellGeom[]>();
  const wallBuckets = new Map<number, CellGeom[]>();
  const waterBedBuckets = new Map<number, CellGeom[]>();
  const transparentFloorBuckets = new Map<number, CellGeom[]>();
  const transparentWallBuckets = new Map<number, CellGeom[]>();
  const floorSolo: CellGeom[] = [];
  const wallSolo: CellGeom[] = [];

  const isTransparentTile = (tile: EmberTilesetTile): boolean =>
    tileUsesTransparency(tile) || isWaterTile(tile);

  const pushWaterBed = (
    tile: EmberTilesetTile,
    geom: THREE.BufferGeometry,
    tx: number,
    ty: number,
  ) => {
    const cell = { tile, geom, tx, ty };
    const list = waterBedBuckets.get(tile.id);
    if (list) list.push(cell);
    else waterBedBuckets.set(tile.id, [cell]);
  };

  const pushFloor = (
    tile: EmberTilesetTile,
    geom: THREE.BufferGeometry,
    tx: number,
    ty: number,
  ) => {
    const cell = { tile, geom, tx, ty };
    if (
      perCellEmissiveMaterials &&
      emissiveAnimNeedsPerCellMaterial(tile.emissiveAnim) &&
      tileHasEmissive(tile, "top")
    ) {
      floorSolo.push(cell);
    } else {
      const buckets = isTransparentTile(tile)
        ? transparentFloorBuckets
        : floorBuckets;
      const list = buckets.get(tile.id);
      if (list) list.push(cell);
      else buckets.set(tile.id, [cell]);
    }
  };

  const pushWall = (
    tile: EmberTilesetTile,
    geom: THREE.BufferGeometry,
    tx: number,
    ty: number,
  ) => {
    const cell = { tile, geom, tx, ty };
    if (
      perCellEmissiveMaterials &&
      emissiveAnimNeedsPerCellMaterial(tile.emissiveAnim) &&
      tileHasEmissive(tile, "wall")
    ) {
      wallSolo.push(cell);
    } else {
      const buckets = isTransparentTile(tile)
        ? transparentWallBuckets
        : wallBuckets;
      const list = buckets.get(tile.id);
      if (list) list.push(cell);
      else buckets.set(tile.id, [cell]);
    }
  };

  const x0 = Math.max(0, Math.min(map.width, region?.x0 ?? 0));
  const y0 = Math.max(0, Math.min(map.height, region?.y0 ?? 0));
  const x1 = Math.max(x0, Math.min(map.width, region?.x1 ?? map.width));
  const y1 = Math.max(y0, Math.min(map.height, region?.y1 ?? map.height));

  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      const cx = (tx + 0.5) * ts;
      const cz = (ty + 0.5) * ts;

      // Minecraft-style: one full story block per occupied elev layer.
      for (const elev of elevationSteps()) {
        const tile = elevTileAt(map, tileset, tx, ty, elev);
        if (!tile || tile.id === 0) continue;
        const resolved = resolveTile(tile);
        const { y0, y1 } = elevStoryWorldSpan(elev, storyH);
        const cy = y0 + storyH * 0.5;

        if (isWaterTile(resolved)) {
          // Water stays near elev*storyH (same plane as props/lights), not a full cube.
          const surfaceY = elev * storyH + 0.55;
          const waterAt = (x: number, y: number, e: number) => {
            if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
            const t = elevTileAt(map, tileset, x, y, e);
            return t ? isWaterTile(resolveTile(t)) : false;
          };
          const shore = {
            n: !waterAt(tx, ty - 1, elev),
            e: !waterAt(tx + 1, ty, elev),
            s: !waterAt(tx, ty + 1, elev),
            w: !waterAt(tx - 1, ty, elev),
          };
          pushFloor(
            resolved,
            waterSlabAt(cx, surfaceY, cz, ts, ts, shore),
            tx,
            ty,
          );
          // Soft bed only when the story below is empty (dirt can be painted at Z-1).
          const belowId = elevTileIdAt(map, tx, ty, elev - 1);
          if (!belowId) {
            const bedY = (elev - 1) * storyH + 0.5;
            pushWaterBed(
              resolved,
              boxAt(cx, bedY, cz, ts * 0.96, 0.55, ts * 0.96, storyH),
              tx,
              ty,
            );
            const depthH = Math.max(0.2, surfaceY - bedY);
            for (const side of (["n", "e", "s", "w"] as const).filter(
              (s) => shore[s],
            )) {
              pushFloor(
                resolved,
                waterDepthWallAt(cx, surfaceY, cz, ts, side, depthH),
                tx,
                ty,
              );
            }
          }
          continue;
        }

        // Solid / floor story cube (full tile height).
        pushWall(
          resolved,
          boxAt(cx, cy, cz, ts, storyH, ts, storyH),
          tx,
          ty,
        );
        // Thin top cap for readable floor texel on the story face.
        pushFloor(
          resolved,
          boxAt(cx, y1 + 0.35, cz, ts * 0.98, 0.7, ts * 0.98, storyH),
          tx,
          ty,
        );
      }

      // Optional wall extrusion (collision height tool) on top of the column.
      const topElev = elevationAt(map, tx, ty);
      const topTile = resolveTile(groundTileAt(map, tileset, tx, ty));
      if (
        topTile &&
        !isWaterTile(topTile) &&
        isSolidAt(map, tileset, tx, ty)
      ) {
        const voxH = Math.max(0, heightVoxelsAt(map, tx, ty));
        if (voxH > 0) {
          const h = Math.max(voxUnit, voxH * voxUnit);
          // Wall extrusion starts on the top of the topmost solid story.
          const baseY = topElev * storyH;
          const cy = baseY + h * 0.5;
          pushWall(topTile, boxAt(cx, cy, cz, ts, h, ts, storyH), tx, ty);
          pushFloor(
            topTile,
            boxAt(cx, baseY + h + 0.4, cz, ts * 0.98, 0.8, ts * 0.98, storyH),
            tx,
            ty,
          );
        }
      }
    }
  }

  const group = new THREE.Group();
  group.name = "voxelMap";

  const flushMerged = (
    buckets: Map<number, CellGeom[]>,
    face: "top" | "wall",
    transparentPass = false,
  ) => {
    for (const [, cells] of buckets) {
      if (!cells.length) continue;
      const tile = cells[0]!.tile;
      const geoms = cells.map((c) => c.geom);
      const merged = mergeGeometries(geoms, false);
      for (const g of geoms) g.dispose();
      if (!merged) continue;
      const mat = face === "top" ? getFloorMat(tile) : getWallMat(tile);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = !(face === "top" && isWaterTile(tile));
      mesh.receiveShadow = true;
      if (transparentPass || isTransparentTile(tile)) {
        mesh.castShadow = false;
        mesh.renderOrder = face === "top" ? 12 : 11;
        mesh.userData.emberTransparentTile = true;
      }
      group.add(mesh);
    }
  };

  flushMerged(floorBuckets, "top");
  flushMerged(wallBuckets, "wall");

  // Opaque water beds before transparent surfaces so depth reads correctly.
  for (const [, cells] of waterBedBuckets) {
    if (!cells.length) continue;
    const geoms = cells.map((c) => c.geom);
    const merged = mergeGeometries(geoms, false);
    for (const g of geoms) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, getWaterBedMat());
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    group.add(mesh);
  }

  // Per-cell flicker/trigger meshes: no cast shadows (many small casters kill FPS).
  for (const cell of floorSolo) {
    const mat = getFloorMat(cell.tile, cell.tx, cell.ty);
    const mesh = new THREE.Mesh(cell.geom, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    if (isTransparentTile(cell.tile)) {
      mesh.renderOrder = 12;
      mesh.userData.emberTransparentTile = true;
    }
    group.add(mesh);
  }

  for (const cell of wallSolo) {
    const mat = getWallMat(cell.tile, cell.tx, cell.ty);
    const mesh = new THREE.Mesh(cell.geom, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    if (isTransparentTile(cell.tile)) {
      mesh.renderOrder = 11;
      mesh.userData.emberTransparentTile = true;
    }
    group.add(mesh);
  }

  // Transparent map surfaces are added after opaque batches. Three still sorts
  // them per object, but this avoids transparent floors writing over solid voxels.
  flushMerged(transparentWallBuckets, "wall", true);
  flushMerged(transparentFloorBuckets, "top", true);

  const bounds = new THREE.Box3().setFromObject(group);
  const maxY = bounds.isEmpty() ? storyH : bounds.max.y;
  const center = new THREE.Vector3(
    (map.width * ts) / 2,
    Math.max(storyH, maxY * 0.35),
    (map.height * ts) / 2,
  );

  return { group, center, bounds, tileSize: ts, storyH };
}

export function disposeVoxelMesh(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  });
}
