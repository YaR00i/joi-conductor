/**
 * Upright (Y-axis) billboards — face the camera in yaw only, never tip/pitch.
 * World up is +Y (user "vertical"); horizontal orbit spins them around that axis.
 */
import * as THREE from "three";
import {
  normalizePixelSprite,
  spriteHasVisual,
  spriteTotalHeight,
} from "../content/pixelSprite";
import type { EmberPixelSprite } from "../content/types";
import {
  hasEmissiveInk,
  resolveEmissiveBloomRgb,
  resolveEmissiveGlowStrength,
} from "../tile/emissivePaint";
import { parseHexRgb } from "../tile/mapUtils";

const texCache = new Map<string, THREE.CanvasTexture>();
const _faceDir = new THREE.Vector3();

function makeCircleTexture(
  color: string,
  size = 32,
  outline?: string,
): THREE.CanvasTexture {
  const key = `c:${color}:${outline ?? ""}:${size}`;
  const hit = texCache.get(key);
  if (hit) return hit;
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
  texCache.set(key, tex);
  return tex;
}

function channelFingerprint(pixels: string[] | undefined): string {
  if (!pixels?.length) return "0";
  let n = 0;
  let acc = 0;
  for (let i = 0; i < pixels.length; i++) {
    const c = pixels[i];
    if (!c || c === "#00000000") continue;
    n++;
    acc = (acc * 33 + c.charCodeAt(1)! + i) | 0;
  }
  return `${n}:${acc}`;
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
  const key = `px:${n.id}:${n.width}x${h}:p${channelFingerprint(n.pixels)}:em${hasEm ? `${emStr.toFixed(2)}:${channelFingerprint(em)}:${bloomKey}` : "0"}`;
  const hit = texCache.get(key);
  if (hit) return hit;
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
  texCache.set(key, tex);
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
  return makeYawBillboard(tex, worldW, worldW * aspect);
}

/** Keep upright: only yaw toward camera on the horizontal plane. */
export function faceCameraYawOnly(
  obj: THREE.Object3D,
  camera: THREE.Camera,
): void {
  _faceDir.set(
    camera.position.x - obj.position.x,
    0,
    camera.position.z - obj.position.z,
  );
  if (_faceDir.lengthSq() < 1e-8) return;
  obj.rotation.set(0, Math.atan2(_faceDir.x, _faceDir.z), 0);
}

/** Update every marked yaw-billboard under a root (or the object itself). */
export function updateYawBillboards(
  root: THREE.Object3D,
  camera: THREE.Camera,
): void {
  root.traverse((o) => {
    if (o.userData.yawBillboard) faceCameraYawOnly(o, camera);
  });
}

export function hexColorOr(hex: string | undefined, fallback: string): string {
  if (!hex || hex === "#00000000") return fallback;
  return hex;
}
