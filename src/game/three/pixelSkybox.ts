/**
 * Low-res NearestFilter cube sky for Ember: stars, block clouds, pixel sun.
 * Used as scene.background so planar water mirrors pick it up automatically.
 */
import * as THREE from "three";
import { parseHexRgb } from "../tile/mapUtils";
import { sunDirectionFromAngles } from "./threeLighting";

export type PixelSkyboxParams = {
  /** Night depth 0..1 (from map light ambientAlpha). */
  night: number;
  fog: number;
  fogColor: string;
  cloudShadows: number;
  /** Cloud drift phase in seconds. */
  timeSec: number;
  sunAzimuth: number;
  sunElevation: number;
  sunColor: string;
};

export type PixelSkyboxHandle = {
  texture: THREE.CubeTexture;
  update: (p: PixelSkyboxParams) => void;
  dispose: () => void;
};

const FACE_SIZE = 256;
const FACE_ORDER = ["px", "nx", "py", "ny", "pz", "nz"] as const;
type FaceId = (typeof FACE_ORDER)[number];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function hash2(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function lerpByte(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function skyColors(night: number, fogAmt: number, fogHex: string) {
  const fog = parseHexRgb(fogHex) ?? { r: 12, g: 16, b: 24 };
  const dayZenith = { r: 110, g: 170, b: 230 };
  const dayHorizon = { r: 190, g: 210, b: 235 };
  const nightZenith = { r: 8, g: 10, b: 28 };
  const nightHorizon = { r: 18, g: 22, b: 48 };
  const n = clamp01(night);
  const zenith = {
    r: lerpByte(dayZenith.r, nightZenith.r, n),
    g: lerpByte(dayZenith.g, nightZenith.g, n),
    b: lerpByte(dayZenith.b, nightZenith.b, n),
  };
  const horizon = {
    r: lerpByte(dayHorizon.r, nightHorizon.r, n),
    g: lerpByte(dayHorizon.g, nightHorizon.g, n),
    b: lerpByte(dayHorizon.b, nightHorizon.b, n),
  };
  // Pull toward fog tint when atmosphere is thick.
  const f = clamp01(fogAmt) * 0.55;
  const mixFog = (c: { r: number; g: number; b: number }) => ({
    r: lerpByte(c.r, fog.r, f),
    g: lerpByte(c.g, fog.g, f),
    b: lerpByte(c.b, fog.b, f),
  });
  return {
    zenith: mixFog(zenith),
    horizon: mixFog(horizon),
    ground: {
      r: lerpByte(42, fog.r, f * 0.4 + n * 0.35),
      g: lerpByte(36, fog.g, f * 0.4 + n * 0.35),
      b: lerpByte(48, fog.b, f * 0.4 + n * 0.35),
    },
  };
}

/** Map a world direction to cube face + pixel coords (Three.js cube layout). */
function dirToFaceUv(
  dir: THREE.Vector3,
  size: number,
): { face: FaceId; u: number; v: number } {
  const ax = Math.abs(dir.x);
  const ay = Math.abs(dir.y);
  const az = Math.abs(dir.z);
  let face: FaceId;
  let sc = 0;
  let tc = 0;
  let ma = 1;
  if (ax >= ay && ax >= az) {
    face = dir.x > 0 ? "px" : "nx";
    ma = ax;
    sc = dir.x > 0 ? -dir.z : dir.z;
    tc = dir.y;
  } else if (ay >= ax && ay >= az) {
    face = dir.y > 0 ? "py" : "ny";
    ma = ay;
    sc = dir.x;
    tc = dir.y > 0 ? dir.z : -dir.z;
  } else {
    face = dir.z > 0 ? "pz" : "nz";
    ma = az;
    sc = dir.z > 0 ? dir.x : -dir.x;
    tc = dir.y;
  }
  const u = Math.floor(((sc / ma + 1) * 0.5) * (size - 1));
  const v = Math.floor((1 - (tc / ma + 1) * 0.5) * (size - 1));
  return {
    face,
    u: Math.max(0, Math.min(size - 1, u)),
    v: Math.max(0, Math.min(size - 1, v)),
  };
}

function faceDir(face: FaceId, u: number, v: number, size: number): THREE.Vector3 {
  const s = (2 * (u + 0.5)) / size - 1;
  const t = (2 * (v + 0.5)) / size - 1;
  switch (face) {
    case "px":
      return new THREE.Vector3(1, -t, -s).normalize();
    case "nx":
      return new THREE.Vector3(-1, -t, s).normalize();
    case "py":
      return new THREE.Vector3(s, 1, t).normalize();
    case "ny":
      return new THREE.Vector3(s, -1, -t).normalize();
    case "pz":
      return new THREE.Vector3(s, -t, 1).normalize();
    case "nz":
      return new THREE.Vector3(-s, -t, -1).normalize();
    default: {
      const _exhaustive: never = face;
      return _exhaustive;
    }
  }
}

function setPixelMax(
  data: Uint8ClampedArray,
  size: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
): void {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  data[i] = Math.max(data[i]!, r);
  data[i + 1] = Math.max(data[i + 1]!, g);
  data[i + 2] = Math.max(data[i + 2]!, b);
}

/** Compact 4-point ✦: 1px core + 4 arm tips that slowly fade. */
function stampFourPointStar(
  data: Uint8ClampedArray,
  size: number,
  cx: number,
  cy: number,
  coreBright: number,
  tipFade: number,
): void {
  const tip = clamp01(tipFade);
  const core = Math.min(255, coreBright);
  // Tips never fully vanish — always a hint of the ✦ shape.
  const tipB = Math.floor(core * (0.4 + tip * 0.6));

  setPixelMax(data, size, cx, cy, core, core, Math.min(255, core + 24));
  const tb = Math.min(255, tipB + 10);
  setPixelMax(data, size, cx, cy - 1, tipB, tipB, tb);
  setPixelMax(data, size, cx, cy + 1, tipB, tipB, tb);
  setPixelMax(data, size, cx - 1, cy, tipB, tipB, tb);
  setPixelMax(data, size, cx + 1, cy, tipB, tipB, tb);
}

function setPixelAbs(
  data: Uint8ClampedArray,
  size: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
): void {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
}

/**
 * Pixel moon / sun stamped at sunDir on one cube face.
 * Sized to survive low-res planar reflection RT + UV quantization.
 * Day: hard sun nugget; night: bright moon with crater texture.
 */
function stampCelestial(
  data: Uint8ClampedArray,
  size: number,
  face: FaceId,
  sunDir: THREE.Vector3,
  night: number,
  sunRgb: { r: number; g: number; b: number },
): void {
  const hit = dirToFaceUv(sunDir, size);
  if (hit.face !== face) return;
  const { u: cx, v: cy } = hit;

  if (night > 0.4) {
    // Soft glow halo (so Nearest RT / water quantize still catch the body).
    for (let dy = -7; dy <= 7; dy++) {
      for (let dx = -7; dx <= 7; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > 7.2 || d < 3.2) continue;
        const t = 1 - (d - 3.2) / 4;
        const a = Math.floor(40 + t * 70);
        setPixelMax(
          data,
          size,
          cx + dx,
          cy + dy,
          Math.min(255, 160 + a),
          Math.min(255, 168 + a),
          Math.min(255, 200 + a),
        );
      }
    }
    // 9×9 moon core with craters
    const pat = [
      [0, 0, 1, 1, 1, 1, 1, 0, 0],
      [0, 1, 2, 2, 2, 2, 2, 1, 0],
      [1, 2, 2, 3, 2, 2, 3, 2, 1],
      [1, 2, 2, 2, 2, 3, 2, 2, 1],
      [1, 2, 3, 2, 2, 2, 2, 2, 1],
      [1, 2, 2, 2, 3, 2, 2, 2, 1],
      [1, 2, 3, 2, 2, 2, 2, 2, 1],
      [0, 1, 2, 2, 2, 2, 2, 1, 0],
      [0, 0, 1, 1, 1, 1, 1, 0, 0],
    ];
    const rim = { r: 200, g: 208, b: 230 };
    const fill = { r: 255, g: 255, b: 255 };
    const crater = { r: 150, g: 156, b: 180 };
    for (let dy = 0; dy < 9; dy++) {
      for (let dx = 0; dx < 9; dx++) {
        const cell = pat[dy]![dx]!;
        if (cell === 0) continue;
        const c = cell === 1 ? rim : cell === 3 ? crater : fill;
        setPixelAbs(data, size, cx + dx - 4, cy + dy - 4, c.r, c.g, c.b);
      }
    }
    return;
  }

  // Day sun — 7×7 hard disc + short rays (readable in mirrors).
  const sr = Math.min(255, sunRgb.r);
  const sg = Math.min(255, Math.floor(sunRgb.g * 0.95));
  const sb = Math.min(255, Math.floor(sunRgb.b * 0.55));
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > 4.3) continue;
      const edge = d > 2.6;
      setPixelAbs(
        data,
        size,
        cx + dx,
        cy + dy,
        edge ? Math.floor(sr * 0.7) : sr,
        edge ? Math.floor(sg * 0.7) : sg,
        edge ? Math.floor(sb * 0.7) : sb,
      );
    }
  }
  // Cardinal ray tips
  for (const [dx, dy] of [
    [0, -6],
    [0, 6],
    [-6, 0],
    [6, 0],
  ] as const) {
    setPixelAbs(
      data,
      size,
      cx + dx,
      cy + dy,
      Math.floor(sr * 0.85),
      Math.floor(sg * 0.85),
      Math.floor(sb * 0.85),
    );
  }
}

function paintFace(
  ctx: CanvasRenderingContext2D,
  face: FaceId,
  p: PixelSkyboxParams,
  sunDir: THREE.Vector3,
  sunRgb: { r: number; g: number; b: number },
  colors: ReturnType<typeof skyColors>,
): void {
  const size = FACE_SIZE;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const night = clamp01(p.night);
  const cloudAmt = clamp01(p.cloudShadows);
  // Slow cloud drift — phase advances ~1 face-pixel per few seconds.
  const drift = p.timeSec * (0.004 + cloudAmt * 0.006);

  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      const i = (v * size + u) * 4;
      const dir = faceDir(face, u, v, size);
      const elev = dir.y; // -1..1

      let r: number;
      let g: number;
      let b: number;
      if (face === "ny" || elev < -0.18) {
        r = colors.ground.r;
        g = colors.ground.g;
        b = colors.ground.b;
      } else {
        const h = clamp01((elev + 0.18) / 1.18);
        const band = Math.floor(h * 18) / 18;
        r = lerpByte(colors.horizon.r, colors.zenith.r, band);
        g = lerpByte(colors.horizon.g, colors.zenith.g, band);
        b = lerpByte(colors.horizon.b, colors.zenith.b, band);
      }

      if (cloudAmt > 0.02 && elev > -0.08) {
        const cx = Math.floor(u * 0.5 + drift * size);
        const cy = Math.floor(v * 0.5 + drift * size * 0.28);
        const n0 = hash2(cx, cy, 11);
        const n1 = hash2(cx + 2, cy - 1, 29);
        const n2 = hash2(cx - 1, cy + 3, 47);
        const blob = n0 * 0.5 + n1 * 0.3 + n2 * 0.2;
        const thresh = 0.78 - cloudAmt * 0.32;
        if (blob > thresh) {
          const k = Math.min(1, (blob - thresh) / 0.18);
          const cloudLite = night > 0.55 ? 52 : 232;
          const cloudMid = night > 0.55 ? 40 : 214;
          r = lerpByte(r, cloudLite, k * 0.8);
          g = lerpByte(g, cloudMid, k * 0.8);
          b = lerpByte(b, night > 0.55 ? 62 : 228, k * 0.8);
        }
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  // Stars first, then moon/sun on top so celestial body wins overlaps.
  if (night > 0.12 && face !== "ny") {
    // Higher face res → denser scatter so tiny ✦ still read across the sky.
    const density = 0.028 + night * 0.055;
    const step = 5;
    for (let cy = 1; cy < size - 1; cy += step) {
      for (let cx = 1; cx < size - 1; cx += step) {
        const jitterX = Math.floor(hash2(cx, cy, 5) * step) - Math.floor(step / 2);
        const jitterY = Math.floor(hash2(cx, cy, 9) * step) - Math.floor(step / 2);
        const sx = cx + jitterX;
        const sy = cy + jitterY;
        if (sx < 1 || sy < 1 || sx >= size - 1 || sy >= size - 1) continue;
        if (hash2(sx, sy, 91) >= density) continue;
        const elev = faceDir(face, sx, sy, size).y;
        if (elev < 0.05) continue;

        const phase = hash2(sx, sy, 7) * Math.PI * 2;
        const tipRate = 0.06 + hash2(sx, sy, 3) * 0.08;
        const tipFade =
          0.25 + 0.75 * (0.5 + 0.5 * Math.sin(p.timeSec * tipRate + phase));
        const coreBright = 230 + Math.floor(hash2(sx, sy, 13) * 25);
        stampFourPointStar(data, size, sx, sy, coreBright, tipFade);
      }
    }
  }

  stampCelestial(data, size, face, sunDir, night, sunRgb);

  ctx.putImageData(img, 0, 0);
}

export function createPixelSkybox(): PixelSkyboxHandle {
  const canvases = FACE_ORDER.map(() => {
    const c = document.createElement("canvas");
    c.width = FACE_SIZE;
    c.height = FACE_SIZE;
    return c;
  });
  const texture = new THREE.CubeTexture(canvases);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  const sunDir = new THREE.Vector3();
  let lastKey = "";

  function update(p: PixelSkyboxParams): void {
    // Clouds drift slowly; star tips breathe on a long period — redraw ~1/s.
    const tQ = Math.floor(p.timeSec);
    const key = [
      p.night.toFixed(2),
      p.fog.toFixed(2),
      p.fogColor,
      p.cloudShadows.toFixed(2),
      p.sunAzimuth.toFixed(1),
      p.sunElevation.toFixed(1),
      p.sunColor,
      String(tQ),
    ].join("|");
    if (key === lastKey) return;
    lastKey = key;

    sunDirectionFromAngles(p.sunAzimuth, p.sunElevation, sunDir);
    const sunParsed = parseHexRgb(p.sunColor) ?? { r: 255, g: 220, b: 160 };
    const colors = skyColors(p.night, p.fog, p.fogColor);

    for (let i = 0; i < FACE_ORDER.length; i++) {
      const face = FACE_ORDER[i]!;
      const canvas = canvases[i]!;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      paintFace(ctx, face, { ...p, timeSec: tQ }, sunDir, sunParsed, colors);
    }
    texture.needsUpdate = true;
  }

  return {
    texture,
    update,
    dispose: () => {
      texture.dispose();
    },
  };
}

/** Map sun direction onto a cube face (debug / tests). */
export function pixelSkyboxSunFace(
  azimuth: number,
  elevation: number,
): { face: FaceId; u: number; v: number } {
  const dir = sunDirectionFromAngles(azimuth, elevation);
  return dirToFaceUv(dir, FACE_SIZE);
}
