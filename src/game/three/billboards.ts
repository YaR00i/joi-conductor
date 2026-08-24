/**
 * Upright (Y-axis) billboards — face the camera in yaw only, never tip/pitch.
 * World up is +Y (user "vertical"); horizontal orbit spins them around that axis.
 */
import * as THREE from "three";
import {
  composeSpriteForFrame,
  composeSpriteForView,
  normalizePixelSprite,
  resolveSpriteWorldOffsetVoxels,
  spriteHasAnimFrames,
  spriteHasExtraCardViews,
  spriteHasVisual,
  spriteTotalHeight,
} from "../content/pixelSprite";
import {
  clampSpriteFrameDuration,
  spriteFrameIndexAt,
} from "../content/spriteAnimFrames";
import type {
  EmberCharacterCardView,
  EmberPixelSprite,
  EmberTransformScale,
} from "../content/types";
import { EMBER_CHARACTER_CARD_VIEWS } from "../content/types";
import { VOXELS_PER_BLOCK } from "../voxel/constants";
import {
  characterCardViewSticky,
  lookYawToward,
  type CharacterCardViewState,
} from "../voxel/characterView";
import {
  hasEmissiveInk,
  resolveEmissiveBloomRgb,
  resolveEmissiveGlowStrength,
} from "../tile/emissivePaint";
import { parseHexRgb } from "../tile/mapUtils";
import { resolveEmberTransformScale } from "../world/worldTransform";

type CachedBillboardTexture = {
  key: string;
  texture: THREE.CanvasTexture;
  refs: number;
};

type BillboardTextureLease = {
  texture: THREE.Texture;
  release: () => void;
};

const texCache = new Map<string, CachedBillboardTexture>();
const texCacheByTexture = new WeakMap<THREE.Texture, CachedBillboardTexture>();
const _faceDir = new THREE.Vector3();

/**
 * Tie a cached texture to the lifetime of one billboard mesh. A texture is
 * retained once per mesh even when main/depth/distance materials share it.
 */
export function trackBillboardTexture(
  mesh: THREE.Mesh,
  texture: THREE.Texture,
  release: () => void,
): boolean {
  const leases = (mesh.userData.emberTextureLeases ??= []) as BillboardTextureLease[];
  if (leases.some((lease) => lease.texture === texture)) return false;
  leases.push({ texture, release });
  mesh.userData.emberReleaseTrackedTextures = () => releaseBillboardTextures(mesh);
  return true;
}

/** Move cache ownership when a template mesh becomes an InstancedMesh. */
export function transferBillboardTextureLeases(
  from: THREE.Mesh,
  to: THREE.Mesh,
): void {
  const leases = from.userData.emberTextureLeases as
    | BillboardTextureLease[]
    | undefined;
  if (!leases?.length) return;
  from.userData.emberTextureLeases = undefined;
  from.userData.emberReleaseTrackedTextures = undefined;
  to.userData.emberTextureLeases = leases;
  to.userData.emberReleaseTrackedTextures = () => releaseBillboardTextures(to);
}

function retainCachedTexture(mesh: THREE.Mesh, texture: THREE.Texture): void {
  const entry = texCacheByTexture.get(texture);
  if (!entry) return;
  const tracked = trackBillboardTexture(mesh, texture, () => {
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs > 0 || texCache.get(entry.key) !== entry) return;
    texCache.delete(entry.key);
    texCacheByTexture.delete(entry.texture);
    entry.texture.dispose();
  });
  if (tracked) entry.refs += 1;
}

function releaseBillboardTextures(mesh: THREE.Mesh): void {
  const leases = mesh.userData.emberTextureLeases as
    | BillboardTextureLease[]
    | undefined;
  if (!leases) return;
  mesh.userData.emberTextureLeases = undefined;
  mesh.userData.emberReleaseTrackedTextures = undefined;
  for (const lease of leases) lease.release();
}

function makeCircleTexture(
  color: string,
  size = 32,
  outline?: string,
): THREE.CanvasTexture {
  const key = `c:${color}:${outline ?? ""}:${size}`;
  const hit = texCache.get(key);
  if (hit) return hit.texture;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  const entry = { key, texture: tex, refs: 0 } satisfies CachedBillboardTexture;
  texCache.set(key, entry);
  texCacheByTexture.set(tex, entry);
  return tex;
}

export function billboardChannelFingerprint(
  pixels: string[] | undefined,
): string {
  if (!pixels?.length) return "0";
  let n = 0;
  let acc = 0x811c9dc5;
  for (let i = 0; i < pixels.length; i++) {
    const c = pixels[i];
    if (!c || c === "#00000000") continue;
    n++;
    acc = Math.imul(acc ^ i, 0x01000193);
    for (let j = 0; j < c.length; j++) {
      acc = Math.imul(acc ^ c.charCodeAt(j), 0x01000193);
    }
  }
  return `${n}:${acc >>> 0}`;
}

function makePixelSpriteTexture(spr: EmberPixelSprite): THREE.CanvasTexture | null {
  const n = normalizePixelSprite(spr);
  if (!spriteHasVisual(n) || !n.pixels?.length) return null;
  const h = spriteTotalHeight(n);
  const em = n.emissivePixels;
  const hasEm = !!em && hasEmissiveInk(em);
  const emStr = hasEm ? resolveEmissiveGlowStrength(n.emissiveStrength) : 0;
  const bloomRgb = hasEm
    ? resolveEmissiveBloomRgb(n.emissiveBloomColor)
    : null;
  const bloomKey = bloomRgb
    ? `b${bloomRgb.r.toString(16)}${bloomRgb.g.toString(16)}${bloomRgb.b.toString(16)}`
    : "0";
  const key = `px:${n.id}:${n.width}x${h}:p${billboardChannelFingerprint(n.pixels)}:em${hasEm ? `${emStr.toFixed(2)}:${billboardChannelFingerprint(em)}:${bloomKey}` : "0"}`;
  const hit = texCache.get(key);
  if (hit) return hit.texture;
  const c = document.createElement("canvas");
  c.width = n.width;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(n.width, h);
  const lit = new Uint8Array(n.width * h);
  if (hasEm && em) {
    for (let i = 0; i < em.length && i < lit.length; i++) {
      const ink = em[i];
      if (ink && ink !== "#00000000" && parseHexRgb(ink)) lit[i] = 1;
    }
  }
  for (let i = 0; i < n.pixels.length; i++) {
    const hex = n.pixels[i] ?? "";
    const o = i * 4;
    if (!hex || hex === "#00000000") {
      img.data[o + 3] = 0;
      continue;
    }
    const rgb = parseHexRgb(hex) ?? { r: 200, g: 176, b: 144 };
    let r = rgb.r;
    let g = rgb.g;
    let b = rgb.b;
    if (hasEm && em && lit[i]) {
      const er = parseHexRgb(em[i]!);
      if (er) {
        // Bake self-glow ink into albedo so MeshBasic billboards still bloom.
        const k = 0.55 + emStr * 0.9;
        r = Math.min(255, Math.round(r * (1 - k * 0.35) + er.r * k));
        g = Math.min(255, Math.round(g * (1 - k * 0.35) + er.g * k));
        b = Math.min(255, Math.round(b * (1 - k * 0.35) + er.b * k));
      }
    } else if (hasEm && bloomRgb && !lit[i]) {
      // Soft bloom-tint fringe on neighbors of lit pixels.
      const x = i % n.width;
      const y = (i / n.width) | 0;
      let near = 0;
      for (const [dx, dy, w] of [
        [1, 0, 0.5],
        [-1, 0, 0.5],
        [0, 1, 0.5],
        [0, -1, 0.5],
        [1, 1, 0.28],
        [1, -1, 0.28],
        [-1, 1, 0.28],
        [-1, -1, 0.28],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= n.width || ny >= h) continue;
        if (lit[ny * n.width + nx]) near = Math.max(near, w);
      }
      if (near > 0) {
        const k = (0.35 + emStr * 0.45) * near;
        r = Math.min(255, Math.round(r * (1 - k) + bloomRgb.r * k));
        g = Math.min(255, Math.round(g * (1 - k) + bloomRgb.g * k));
        b = Math.min(255, Math.round(b * (1 - k) + bloomRgb.b * k));
      }
    }
    img.data[o] = r;
    img.data[o + 1] = g;
    img.data[o + 2] = b;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const entry = { key, texture: tex, refs: 0 } satisfies CachedBillboardTexture;
  texCache.set(key, entry);
  texCacheByTexture.set(tex, entry);
  return tex;
}

/** Discard empty texels so shadow maps follow pixel ink, not the plane rect. */
const BILLBOARD_ALPHA_TEST = 0.5;

function makeYawBillboard(
  map: THREE.Texture,
  worldW: number,
  worldH: number,
): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    alphaTest: BILLBOARD_ALPHA_TEST,
    // Cutout sprites write depth so they occlude and cast shaped shadows.
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  retainCachedTexture(mesh, map);
  mesh.scale.set(worldW, worldH, 1);
  mesh.userData.yawBillboard = true;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  // Directional / spot shadow pass — sample map alpha.
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
    map,
    alphaTest: BILLBOARD_ALPHA_TEST,
    depthPacking: THREE.RGBADepthPacking,
    side: THREE.DoubleSide,
  });
  // PointLight cube shadows need distance materials with the same cutout.
  mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial({
    map,
    alphaTest: BILLBOARD_ALPHA_TEST,
    side: THREE.DoubleSide,
  });
  return mesh;
}

/** Dispose billboard materials (keeps shared cached textures). */
export function disposeYawBillboard(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const mat = mesh.material;
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
  else mat.dispose();
  mesh.customDepthMaterial?.dispose();
  mesh.customDistanceMaterial?.dispose();
  mesh.customDepthMaterial = undefined;
  mesh.customDistanceMaterial = undefined;
  releaseBillboardTextures(mesh);
}

export function createColorBillboard(
  color: string,
  worldSize: number,
  outline?: string,
): THREE.Mesh {
  return makeYawBillboard(
    makeCircleTexture(color, 32, outline),
    worldSize,
    worldSize,
  );
}

export function createPixelBillboard(
  spr: EmberPixelSprite,
  fallbackColor: string,
  worldW: number,
): THREE.Mesh {
  const tex = makePixelSpriteTexture(spr);
  if (!tex) return createColorBillboard(fallbackColor, worldW);
  const n = normalizePixelSprite(spr);
  const h = Math.max(1, spriteTotalHeight(n));
  const aspect = h / Math.max(1, n.width);
  const mesh = makeYawBillboard(tex, worldW, worldW * aspect);
  attachSpriteCardMaps(mesh, n, tex);
  return mesh;
}

function applyBillboardMap(mesh: THREE.Mesh, tex: THREE.Texture): void {
  const mat = mesh.material;
  if (!Array.isArray(mat) && "map" in mat) {
    mat.map = tex;
    mat.needsUpdate = true;
  }
  if (mesh.customDepthMaterial && "map" in mesh.customDepthMaterial) {
    mesh.customDepthMaterial.map = tex;
    mesh.customDepthMaterial.needsUpdate = true;
  }
  if (mesh.customDistanceMaterial && "map" in mesh.customDistanceMaterial) {
    mesh.customDistanceMaterial.map = tex;
    mesh.customDistanceMaterial.needsUpdate = true;
  }
}

function attachSpriteCardMaps(
  mesh: THREE.Mesh,
  spr: EmberPixelSprite,
  frontTex: THREE.Texture,
): void {
  const hasAnim = spriteHasAnimFrames(spr);
  const hasExtras = spriteHasExtraCardViews(spr);
  if (!hasAnim && !hasExtras) return;

  const mapsForSprite = (
    cel: EmberPixelSprite,
    reuseFront?: THREE.Texture,
  ): Partial<Record<EmberCharacterCardView, THREE.Texture>> => {
    const maps: Partial<Record<EmberCharacterCardView, THREE.Texture>> = {};
    if (reuseFront) maps.front = reuseFront;
    else {
      const tex = makePixelSpriteTexture(cel);
      if (tex) {
        maps.front = tex;
        retainCachedTexture(mesh, tex);
      }
    }
    for (const view of EMBER_CHARACTER_CARD_VIEWS) {
      if (view === "front") continue;
      const composed = composeSpriteForView(cel, view);
      if (composed === cel) continue;
      const tex = makePixelSpriteTexture(composed);
      if (tex) {
        maps[view] = tex;
        retainCachedTexture(mesh, tex);
      }
    }
    return maps;
  };

  if (hasAnim) {
    const frames = spr.frames ?? [];
    const maps = frames.map((_, i) =>
      mapsForSprite(
        composeSpriteForFrame(spr, i),
        i === 0 ? frontTex : undefined,
      ),
    );
    mesh.userData.spriteAnim = {
      startedAt: performance.now(),
      index: 0,
      durations: frames.map((frame) =>
        clampSpriteFrameDuration(frame.durationMs),
      ),
      maps,
    };
    mesh.userData.spriteCardMaps = maps[0];
  } else {
    mesh.userData.spriteCardMaps = mapsForSprite(spr, frontTex);
  }
  mesh.userData.spriteCardState = {
    view: "front",
  } satisfies CharacterCardViewState;
  mesh.userData.spriteCharYaw = 0;
}

function syncSpriteCardView(
  obj: THREE.Object3D,
  camera: THREE.Camera,
  force = false,
): boolean {
  const maps = obj.userData.spriteCardMaps as
    | Partial<Record<EmberCharacterCardView, THREE.Texture>>
    | undefined;
  if (!maps || !(obj instanceof THREE.Mesh)) return false;
  const state = (obj.userData.spriteCardState ?? {
    view: "front",
  }) as CharacterCardViewState;
  const charYaw =
    typeof obj.userData.spriteCharYaw === "number"
      ? obj.userData.spriteCharYaw
      : 0;
  const look = lookYawToward(
    { x: camera.position.x, z: camera.position.z },
    { x: obj.position.x, z: obj.position.z },
  );
  const prev = state.view;
  const view = characterCardViewSticky(look, state, charYaw);
  obj.userData.spriteCardState = state;
  if (view === prev && !force) return false;
  const tex = maps[view] ?? maps.front;
  if (!tex) return false;
  applyBillboardMap(obj, tex);
  return true;
}

function syncSpriteAnim(
  obj: THREE.Object3D,
  camera: THREE.Camera,
): boolean {
  const anim = obj.userData.spriteAnim as
    | {
        startedAt: number;
        index: number;
        durations: number[];
        maps: Array<Partial<Record<EmberCharacterCardView, THREE.Texture>>>;
      }
    | undefined;
  if (!anim) return syncSpriteCardView(obj, camera);
  const idx = spriteFrameIndexAt(
    anim.durations,
    performance.now() - anim.startedAt,
  );
  const force = idx !== anim.index;
  if (force) {
    anim.index = idx;
    obj.userData.spriteCardMaps = anim.maps[idx];
  }
  return syncSpriteCardView(obj, camera, force);
}

/** Apply authored Ember X/Y-ground + Z-up scale without compounding updates. */
export function applySpritePlacementScale(
  obj: THREE.Object3D,
  authoredScale: Partial<EmberTransformScale> | undefined,
): void {
  const stored = obj.userData.emberBillboardBaseScale as
    | { x: number; y: number; z: number }
    | undefined;
  const base = stored ?? { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z };
  if (!stored) obj.userData.emberBillboardBaseScale = { ...base };
  const scale = resolveEmberTransformScale(authoredScale);
  obj.scale.set(base.x * scale.x, base.y * scale.z, base.z * scale.y);
}

/** Apply an asset's visual pivot without moving its map cell or collider. */
export function applySpriteWorldPosition(
  obj: THREE.Object3D,
  sprite: Pick<EmberPixelSprite, "worldOffsetVoxels">,
  tileSize: number,
  worldX: number,
  worldY: number,
  worldZ: number,
): void {
  const offset = resolveSpriteWorldOffsetVoxels(sprite);
  const voxelWorld = tileSize / VOXELS_PER_BLOCK;
  obj.position.set(
    worldX + offset.x * voxelWorld,
    worldY + offset.z * voxelWorld,
    worldZ + offset.y * voxelWorld,
  );
}

/** Keep upright: only yaw toward camera on the horizontal plane. */
export function faceCameraYawOnly(
  obj: THREE.Object3D,
  camera: THREE.Camera,
): boolean {
  _faceDir.set(
    camera.position.x - obj.position.x,
    0,
    camera.position.z - obj.position.z,
  );
  if (_faceDir.lengthSq() < 1e-8) return false;
  const yaw = Math.atan2(_faceDir.x, _faceDir.z);
  const delta = Math.atan2(
    Math.sin(yaw - obj.rotation.y),
    Math.cos(yaw - obj.rotation.y),
  );
  if (Math.abs(delta) < 1e-6) return false;
  obj.rotation.set(0, yaw, 0);
  return true;
}

/** Update every marked yaw-billboard. Returns true when a pose changed. */
export function updateYawBillboards(
  root: THREE.Object3D,
  camera: THREE.Camera,
): boolean {
  let changed = false;
  root.traverse((o) => {
    if (!o.userData.yawBillboard) return;
    if (faceCameraYawOnly(o, camera)) changed = true;
    if (syncSpriteAnim(o, camera)) changed = true;
  });
  return changed;
}

export function hexColorOr(hex: string | undefined, fallback: string): string {
  if (!hex || hex === "#00000000") return fallback;
  return hex;
}
