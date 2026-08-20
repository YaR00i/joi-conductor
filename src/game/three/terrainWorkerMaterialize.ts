import * as THREE from "three";
import type { EmberMap, EmberTileset, EmberTilesetTile } from "../content/types";
import { emissiveMetaFromTile, tagEmissiveMaterial } from "./emissiveAnimTick";
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
} from "./toonMaterials";
import type { TerrainWorkerChunkResult } from "./terrainWorkerProtocol";

function terrainMaterial(
  tile: EmberTilesetTile,
  face: "top" | "wall",
  tileSize: number,
  tx?: number,
  ty?: number,
): THREE.Material {
  const top = face === "top";
  const albedo = top
    ? getTileTopTexture(tile, tileSize, tile.color)
    : getTileWallTexture(tile, tileSize, tile.color || "#5a4a40");
  if (!top) {
    albedo.wrapS = THREE.RepeatWrapping;
    albedo.wrapT = THREE.RepeatWrapping;
  }
  const roughness = tileHasShine(tile, face)
    ? top
      ? getTileTopShineRoughness(tile, tileSize)
      : getTileWallShineRoughness(tile, tileSize)
    : null;
  const emissive = tileHasEmissive(tile, face)
    ? top
      ? getTileTopEmissiveMap(tile, tileSize)
      : getTileWallEmissiveMap(tile, tileSize)
    : null;
  if (!top) {
    if (roughness) {
      roughness.wrapS = THREE.RepeatWrapping;
      roughness.wrapT = THREE.RepeatWrapping;
    }
    if (emissive) {
      emissive.wrapS = THREE.RepeatWrapping;
      emissive.wrapT = THREE.RepeatWrapping;
    }
  }
  const material = createTileSurfaceMaterial(albedo, tile, {
    shineRoughness: roughness,
    emissiveMap: emissive,
    emissiveIntensity: emissive ? tileEmissiveIntensity(tile) : 0,
  });
  if (emissive) {
    tagEmissiveMaterial(
      material,
      emissiveMetaFromTile(tile, { tx, ty, kind: "emissive" }),
    );
  }
  return material;
}

/** Rehydrate transferred arrays into renderable GPU objects on the main thread. */
export function materializeTerrainWorkerChunk(
  result: TerrainWorkerChunkResult,
  map: EmberMap,
  tileset: EmberTileset,
): THREE.Group | null {
  if (result.requiresSync) return null;
  const tileById = new Map(tileset.tiles.map((tile) => [tile.id, tile]));
  const materials = new Map<string, THREE.Material>();
  const group = new THREE.Group();
  group.name = `terrainChunk:${result.key}`;
  for (const batch of result.batches) {
    const tile = tileById.get(batch.tileId);
    if (!tile) continue;
    const materialKey = `${batch.face}:${batch.tileId}:${batch.tx ?? ""}:${batch.ty ?? ""}`;
    let material = materials.get(materialKey);
    if (!material) {
      material = terrainMaterial(
        tile,
        batch.face,
        map.tileSize,
        batch.tx,
        batch.ty,
      );
      materials.set(materialKey, material);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(batch.positions), 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.BufferAttribute(new Float32Array(batch.normals), 3),
    );
    geometry.setAttribute(
      "uv",
      new THREE.BufferAttribute(new Float32Array(batch.uvs), 2),
    );
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (batch.transparent) {
      mesh.castShadow = false;
      mesh.renderOrder = batch.face === "top" ? 12 : 11;
      mesh.userData.emberTransparentTile = true;
    }
    group.add(mesh);
  }
  return group;
}
