import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { EmberMap, EmberTileset, EmberTilesetTile } from "../content/types";
import { elevationSteps } from "../content/types";
import { emissiveAnimNeedsPerCellMaterial } from "../tile/emissivePaint";
import { elevStoryWorldSpan, blockStoryHeight } from "../tile/extruded";
import {
  elevationAt,
  elevTileAt,
  ensureMapLayers,
  groundTileAt,
  heightVoxelsAt,
  isSolidAt,
} from "../tile/mapUtils";
import { isWaterTile } from "./waterMaterial";
import { tileHasEmissive, tileUsesTransparency } from "./toonMaterials";
import type { TerrainWorkerBatch, TerrainWorkerChunkResult } from "./terrainWorkerProtocol";
import type { VoxelMeshRegion } from "./voxelMesh";

type GeometryBucket = {
  tile: EmberTilesetTile;
  face: "top" | "wall";
  tx?: number;
  ty?: number;
  geoms: THREE.BufferGeometry[];
};

function boxAt(
  cx: number,
  cy: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  tileWorld: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const uv = geometry.attributes.uv;
  if (uv) {
    const scale = Math.max(0.001, h / Math.max(1, tileWorld));
    const offset = 1 - scale;
    const values = uv.array as Float32Array;
    for (let face = 0; face < 6; face++) {
      if (face === 2 || face === 3) continue;
      for (let vertex = 0; vertex < 4; vertex++) {
        const index = (face * 4 + vertex) * 2 + 1;
        values[index] = (values[index] ?? 0) * scale + offset;
      }
    }
  }
  geometry.translate(cx, cy, cz);
  return geometry;
}

function attributeBuffer(
  geometry: THREE.BufferGeometry,
  name: "position" | "normal" | "uv",
): ArrayBuffer {
  const attribute = geometry.getAttribute(name);
  return new Float32Array(attribute.array as ArrayLike<number>).buffer;
}

/** Geometry-only solid chunk build. Returns requiresSync for water chunks. */
export function buildSolidTerrainGeometry(
  mapIn: EmberMap,
  tileset: EmberTileset,
  region: VoxelMeshRegion,
  key = "chunk",
  perCellEmissiveMaterials = true,
): TerrainWorkerChunkResult {
  const map = ensureMapLayers(mapIn);
  const ts = map.tileSize;
  const storyH = blockStoryHeight(ts);
  const voxUnit = ts / 16;
  const tileById = new Map(tileset.tiles.map((tile) => [tile.id, tile]));
  const resolveTile = (tile: EmberTilesetTile | undefined) =>
    tile && tile.color !== "#00000000" && tile.name !== "empty"
      ? tile
      : tileById.get(1) ??
        tileset.tiles.find(
          (candidate) => candidate.id !== 0 && candidate.color !== "#00000000",
        ) ??
        tileset.tiles[0]!;

  const buckets = new Map<string, GeometryBucket>();
  const push = (
    tile: EmberTilesetTile,
    face: "top" | "wall",
    geometry: THREE.BufferGeometry,
    tx: number,
    ty: number,
  ) => {
    const perCell =
      perCellEmissiveMaterials &&
      emissiveAnimNeedsPerCellMaterial(tile.emissiveAnim) &&
      tileHasEmissive(tile, face);
    const bucketKey = `${face}:${tile.id}:${perCell ? `${tx}:${ty}` : "shared"}`;
    const bucket = buckets.get(bucketKey);
    if (bucket) bucket.geoms.push(geometry);
    else {
      buckets.set(bucketKey, {
        tile,
        face,
        tx: perCell ? tx : undefined,
        ty: perCell ? ty : undefined,
        geoms: [geometry],
      });
    }
  };

  for (let ty = region.y0; ty < region.y1; ty++) {
    for (let tx = region.x0; tx < region.x1; tx++) {
      const cx = (tx + 0.5) * ts;
      const cz = (ty + 0.5) * ts;
      for (const elev of elevationSteps()) {
        const source = elevTileAt(map, tileset, tx, ty, elev);
        if (!source || source.id === 0) continue;
        const tile = resolveTile(source);
        if (isWaterTile(tile)) {
          for (const bucket of buckets.values()) {
            bucket.geoms.forEach((geometry) => geometry.dispose());
          }
          return { key, requiresSync: true, batches: [] };
        }
        const { y0, y1 } = elevStoryWorldSpan(elev, storyH);
        push(
          tile,
          "wall",
          boxAt(cx, y0 + storyH * 0.5, cz, ts, storyH, ts, storyH),
          tx,
          ty,
        );
        push(
          tile,
          "top",
          boxAt(cx, y1 + 0.35, cz, ts * 0.98, 0.7, ts * 0.98, storyH),
          tx,
          ty,
        );
      }
      const topElev = elevationAt(map, tx, ty);
      const topTile = resolveTile(groundTileAt(map, tileset, tx, ty));
      if (topTile && !isWaterTile(topTile) && isSolidAt(map, tileset, tx, ty)) {
        const voxels = Math.max(0, heightVoxelsAt(map, tx, ty));
        if (voxels > 0) {
          const height = Math.max(voxUnit, voxels * voxUnit);
          const baseY = topElev * storyH;
          push(
            topTile,
            "wall",
            boxAt(cx, baseY + height * 0.5, cz, ts, height, ts, storyH),
            tx,
            ty,
          );
          push(
            topTile,
            "top",
            boxAt(cx, baseY + height + 0.4, cz, ts * 0.98, 0.8, ts * 0.98, storyH),
            tx,
            ty,
          );
        }
      }
    }
  }

  const batches: TerrainWorkerBatch[] = [];
  for (const bucket of buckets.values()) {
    const merged = mergeGeometries(bucket.geoms, false);
    bucket.geoms.forEach((geometry) => geometry.dispose());
    if (!merged) continue;
    const renderGeometry = merged.index ? merged.toNonIndexed() : merged;
    batches.push({
      tileId: bucket.tile.id,
      face: bucket.face,
      tx: bucket.tx,
      ty: bucket.ty,
      transparent: tileUsesTransparency(bucket.tile),
      positions: attributeBuffer(renderGeometry, "position"),
      normals: attributeBuffer(renderGeometry, "normal"),
      uvs: attributeBuffer(renderGeometry, "uv"),
    });
    if (renderGeometry !== merged) renderGeometry.dispose();
    merged.dispose();
  }
  return { key, requiresSync: false, batches };
}
