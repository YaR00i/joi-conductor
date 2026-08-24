/**
 * Billboard above quest_marker objects. Play + editor share one helper.
 * Icons follow available / active / done (item-icon 16×16), not one yellow disc.
 */
import * as THREE from "three";
import { isQuestMarkerKind, parseInteractivity } from "../content/interactivity";
import {
  resolveQuestMarkerIconId,
  resolveQuestMarkerStatus,
} from "../content/emberScript";
import type {
  EmberFlagValue,
  EmberItemIcon,
  EmberMap,
  EmberVoxelModel,
} from "../content/types";
import { tileSurfaceElev } from "../tile/mapUtils";
import { VOXELS_PER_BLOCK } from "../voxel/constants";
import { createColorBillboard, trackBillboardTexture } from "./billboards";
import { logicToThree } from "./voxelCollision";

type CachedQuestIconTexture = {
  key: string;
  texture: THREE.CanvasTexture;
  refs: number;
};

const iconTexCache = new Map<string, CachedQuestIconTexture>();
const iconTexCacheByTexture = new WeakMap<THREE.Texture, CachedQuestIconTexture>();

const FALLBACK_BY_STATUS = {
  available: { fill: "#ffd45a", outline: "#3a2208" },
  active: { fill: "#f0c020", outline: "#3a2208" },
  done: { fill: "#9aa0a6", outline: "#2a2a2a" },
} as const;

function itemIconTexture(icon: EmberItemIcon): THREE.CanvasTexture {
  const key = `qi:${icon.id}:${icon.size}:${icon.pixels.join("")}`;
  const hit = iconTexCache.get(key);
  if (hit) return hit.texture;
  const size = icon.size;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < icon.pixels.length; i++) {
    const hex = icon.pixels[i];
    if (!hex || hex.length < 7) continue;
    const o = i * 4;
    img.data[o] = Number.parseInt(hex.slice(1, 3), 16);
    img.data[o + 1] = Number.parseInt(hex.slice(3, 5), 16);
    img.data[o + 2] = Number.parseInt(hex.slice(5, 7), 16);
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const entry = { key, texture: tex, refs: 0 } satisfies CachedQuestIconTexture;
  iconTexCache.set(key, entry);
  iconTexCacheByTexture.set(tex, entry);
  return tex;
}

function retainQuestIconTexture(mesh: THREE.Mesh, texture: THREE.Texture): void {
  const entry = iconTexCacheByTexture.get(texture);
  if (!entry) return;
  const tracked = trackBillboardTexture(mesh, texture, () => {
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs > 0 || iconTexCache.get(entry.key) !== entry) return;
    iconTexCache.delete(entry.key);
    iconTexCacheByTexture.delete(entry.texture);
    entry.texture.dispose();
  });
  if (tracked) entry.refs += 1;
}

function createQuestIconBillboard(
  icon: EmberItemIcon | undefined,
  status: keyof typeof FALLBACK_BY_STATUS,
): THREE.Mesh {
  if (icon?.pixels.some((p) => p)) {
    const tex = itemIconTexture(icon);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    retainQuestIconTexture(mesh, tex);
    mesh.scale.set(10, 10, 1);
    mesh.userData.yawBillboard = true;
    mesh.castShadow = false;
    return mesh;
  }
  const tone = FALLBACK_BY_STATUS[status];
  return createColorBillboard(tone.fill, 8, tone.outline);
}

export function addQuestMarkerOverlays(
  root: THREE.Object3D,
  map: EmberMap,
  voxelModels?: Record<string, EmberVoxelModel | undefined>,
  contains?: (x: number, y: number) => boolean,
  opts?: {
    itemIcons?: Record<string, EmberItemIcon>;
    flags?: Record<string, EmberFlagValue>;
  },
): void {
  const ts = map.tileSize;
  const icons = opts?.itemIcons;
  const flags = opts?.flags;
  for (const place of map.voxelProps ?? []) {
    if (contains && !contains(place.x, place.y)) continue;
    const interactivity = parseInteractivity(place.interactivity);
    if (!interactivity || !isQuestMarkerKind(interactivity.kind)) continue;
    const model = voxelModels?.[place.modelId];
    const elev = place.elev ?? tileSurfaceElev(map, place.x, place.y);
    const height =
      ((model?.heightVoxels ?? VOXELS_PER_BLOCK) / VOXELS_PER_BLOCK) * ts + 8;
    const pos = logicToThree(
      (place.x + 0.5) * ts,
      (place.y + 0.5) * ts,
      elev,
      height,
      ts,
    );
    const status = resolveQuestMarkerStatus(interactivity, flags);
    const iconId = resolveQuestMarkerIconId(interactivity, icons, flags);
    const marker = createQuestIconBillboard(icons?.[iconId], status);
    marker.name = `questMarker:${place.id}`;
    marker.userData.questIconId = iconId;
    marker.userData.questStatus = status;
    marker.position.set(pos.x, pos.y, pos.z);
    root.add(marker);
  }
  for (const place of map.sprites ?? []) {
    if (contains && !contains(place.x, place.y)) continue;
    const interactivity = parseInteractivity(place.interactivity);
    if (!interactivity || !isQuestMarkerKind(interactivity.kind)) continue;
    const elev = place.elev ?? tileSurfaceElev(map, place.x, place.y);
    const pos = logicToThree(
      (place.x + 0.5) * ts,
      (place.y + 0.5) * ts,
      elev,
      ts + 8,
      ts,
    );
    const status = resolveQuestMarkerStatus(interactivity, flags);
    const iconId = resolveQuestMarkerIconId(interactivity, icons, flags);
    const marker = createQuestIconBillboard(icons?.[iconId], status);
    marker.name = `questMarker:${place.id}`;
    marker.userData.questIconId = iconId;
    marker.userData.questStatus = status;
    marker.position.set(pos.x, pos.y, pos.z);
    root.add(marker);
  }
}
