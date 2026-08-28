/**
 * Map-wide atmosphere: fog, rain, drifting cloud shadows, dust, fireflies,
 * sun sparkle, warm haze, and horizon sun glare.
 * Driven by `map.light.atmosphere` (see resolveMapAtmosphere).
 */
import * as THREE from "three";
import type { ResolvedMapAtmosphere } from "../tile/mapUtils";
import { parseHexRgb } from "../tile/mapUtils";
import { FOG_EXP2_MIN_DENSITY, fogExp2Density } from "./fogDensity";
import { createPixelSkybox } from "./pixelSkybox";
import { sunDirectionFromAngles } from "./threeLighting";

export type AtmosphereSunOpts = {
  azimuth: number;
  elevation: number;
  color: string;
  /** Night depth 0..1 (map light ambientAlpha) — drives stars / sky grade. */
  night?: number;
};

export type MapAtmosphereHandle = {
  root: THREE.Group;
  apply: (
    atm: ResolvedMapAtmosphere,
    mapW: number,
    mapD: number,
    sun?: AtmosphereSunOpts,
  ) => void;
  /** Optional camera: parks sun/moon disc at infinity (cam + dir × far). */
  tick: (dt: number, time: number, camera?: THREE.Camera) => void;
  /** Snap celestial disc to the active camera (main or planar-reflect virtual). */
  syncCelestial: (camera: THREE.Camera) => void;
  dispose: () => void;
};

/** World distance for the hard sun/moon sprite (camera-locked → no parallax). */
const CELESTIAL_DIST = 8000;
/** Angular size ≈ scale / dist (radians-ish). */
const CELESTIAL_ANG = 0.032;

function hexToColor(hex: string, fallback = 0x0c1018): THREE.Color {
  const rgb = parseHexRgb(hex);
  if (!rgb) return new THREE.Color(fallback);
  return new THREE.Color(rgb.r / 255, rgb.g / 255, rgb.b / 255);
}

/**
 * Tileable soft cloud field for MultiplyBlending (white = no shadow).
 * Blobs are stamped with toroidal wraps so scroll seams disappear.
 */
function makeCloudTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  const stamp = (
    cx: number,
    cy: number,
    r: number,
    core: number,
    mid: number,
  ) => {
    // 3×3 wrap stamps → seamless under RepeatWrapping.
    for (let ox = -size; ox <= size; ox += size) {
      for (let oy = -size; oy <= size; oy += size) {
        const x = cx + ox;
        const y = cy + oy;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${core},${core + 6},${core + 14},1)`);
        g.addColorStop(0.35, `rgba(${mid},${mid + 4},${mid + 10},1)`);
        g.addColorStop(0.75, "rgba(245,246,248,1)");
        g.addColorStop(1, "rgba(255,255,255,1)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  // Large soft masses.
  for (let i = 0; i < 10; i++) {
    stamp(
      Math.random() * size,
      Math.random() * size,
      90 + Math.random() * 130,
      168 + Math.floor(Math.random() * 28),
      210 + Math.floor(Math.random() * 20),
    );
  }
  // Smaller wisps for variety (still mild).
  for (let i = 0; i < 14; i++) {
    stamp(
      Math.random() * size,
      Math.random() * size,
      40 + Math.random() * 70,
      190 + Math.floor(Math.random() * 25),
      225 + Math.floor(Math.random() * 15),
    );
  }

  // Soft box-blur pass — kills any remaining hard edges.
  const src = ctx.getImageData(0, 0, size, size);
  const blur = ctx.createImageData(size, size);
  const r = 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const sx = (x + dx + size) % size;
          const sy = (y + dy + size) % size;
          acc += src.data[(sy * size + sx) * 4]!;
          n += 1;
        }
      }
      const v = (acc / n) | 0;
      const i = (y * size + x) * 4;
      blur.data[i] = v;
      blur.data[i + 1] = v;
      blur.data[i + 2] = Math.min(255, v + 4);
      blur.data[i + 3] = 255;
    }
  }
  ctx.putImageData(blur, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeRainGeo(count: number, mapW: number, mapD: number, height: number) {
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * mapW;
    positions[i * 3 + 1] = Math.random() * height;
    positions[i * 3 + 2] = (Math.random() - 0.5) * mapD;
    speeds[i] = 18 + Math.random() * 28;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("speed", new THREE.BufferAttribute(speeds, 1));
  return geo;
}

function makeMotesGeo(count: number, mapW: number, mapD: number, height: number) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * mapW;
    positions[i * 3 + 1] = 2 + Math.random() * height;
    positions[i * 3 + 2] = (Math.random() - 0.5) * mapD;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
  return geo;
}

function makeSparkleTexture(): THREE.CanvasTexture {
  const size = 32;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const cx = size * 0.5;
  const cy = size * 0.5;
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.48);
  g.addColorStop(0, "rgba(255,255,240,1)");
  g.addColorStop(0.22, "rgba(255,236,180,0.85)");
  g.addColorStop(0.55, "rgba(255,210,120,0.2)");
  g.addColorStop(1, "rgba(255,200,80,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillRect(cx - 1, 2, 2, size - 4);
  ctx.fillRect(2, cy - 1, size - 4, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createMapAtmosphere(scene: THREE.Scene): MapAtmosphereHandle {
  const root = new THREE.Group();
  root.name = "map-atmosphere";
  scene.add(root);

  let mapW = 64;
  let mapD = 64;
  let atm: ResolvedMapAtmosphere | null = null;
  const skybox = createPixelSkybox();
  let skyTime = 0;

  const cloudTex = makeCloudTexture();
  const cloudMat = new THREE.MeshBasicMaterial({
    map: cloudTex,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    // Multiply darkens the scene under soft grey blobs. fog:false is required —
    // FogExp2 otherwise paints the whole plane the fog color (muddy slab).
    blending: THREE.MultiplyBlending,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const cloudMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    cloudMat,
  );
  cloudMesh.rotation.x = -Math.PI / 2;
  cloudMesh.position.y = 18;
  cloudMesh.visible = false;
  cloudMesh.renderOrder = 8;
  cloudMesh.frustumCulled = false;
  cloudMesh.userData.emberSkipWaterReflect = true;
  root.add(cloudMesh);

  const rainMat = new THREE.PointsMaterial({
    color: 0xa8c4e0,
    size: 1.35,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  });
  let rain: THREE.Points | null = null;

  const dustMat = new THREE.PointsMaterial({
    color: 0xc8b090,
    size: 1.1,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  });
  let dust: THREE.Points | null = null;

  const fireMat = new THREE.PointsMaterial({
    color: 0xffe08a,
    size: 1.8,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
  });
  let fireflies: THREE.Points | null = null;

  const sparkleTex = makeSparkleTexture();
  const sparkleMat = new THREE.PointsMaterial({
    map: sparkleTex,
    color: 0xffffff,
    size: 2.6,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    fog: false,
    toneMapped: false,
  });
  let sparkles: THREE.Points | null = null;

  const glareTex = (() => {
    const size = 128;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(
      size * 0.5,
      size * 0.5,
      0,
      size * 0.5,
      size * 0.5,
      size * 0.5,
    );
    g.addColorStop(0, "rgba(255,245,220,1)");
    g.addColorStop(0.25, "rgba(255,180,90,0.75)");
    g.addColorStop(0.55, "rgba(255,120,40,0.28)");
    g.addColorStop(1, "rgba(255,80,20,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const glareMat = new THREE.SpriteMaterial({
    map: glareTex,
    color: 0xffb060,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
  const glareSprite = new THREE.Sprite(glareMat);
  glareSprite.visible = false;
  glareSprite.renderOrder = 20;
  glareSprite.frustumCulled = false;
  glareSprite.userData.emberSkipWaterReflect = true;
  root.add(glareSprite);

  // Hard pixel sun/moon — camera-locked at CELESTIAL_DIST so mirrors match the
  // key-light direction with no parallax (skybox stamp alone is easy to miss
  // after planar RT quantize).
  const celestialTex = (() => {
    const size = 16;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(size * 0.5, size * 0.5, size * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a8b0c4";
    ctx.fillRect(5, 5, 2, 2);
    ctx.fillRect(9, 8, 2, 2);
    ctx.fillRect(6, 10, 1, 1);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const celestialMat = new THREE.SpriteMaterial({
    map: celestialTex,
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    fog: false,
    sizeAttenuation: true,
  });
  const celestialSprite = new THREE.Sprite(celestialMat);
  celestialSprite.visible = false;
  celestialSprite.renderOrder = 19;
  celestialSprite.frustumCulled = false;
  // Scene-root (not atmosphere root) so position is true world space.
  celestialSprite.userData.emberInfinitySky = true;
  scene.add(celestialSprite);

  let sunOpts: AtmosphereSunOpts | null = null;
  const sunDir = new THREE.Vector3();
  const _celCamPos = new THREE.Vector3();
  let celestialAng = CELESTIAL_ANG;

  const syncCelestial = (camera: THREE.Camera) => {
    if (!celestialSprite.visible) return;
    camera.getWorldPosition(_celCamPos);
    celestialSprite.position
      .copy(_celCamPos)
      .addScaledVector(sunDir, CELESTIAL_DIST);
    const s = CELESTIAL_DIST * celestialAng;
    celestialSprite.scale.set(s, s, 1);
  };

  const refreshSkybox = (timeSec = skyTime) => {
    if (!atm) return;
    const night = Math.max(0, Math.min(1, sunOpts?.night ?? 0.35));
    skybox.update({
      night,
      fog: atm.fog,
      fogColor: atm.fogColor,
      cloudShadows: atm.cloudShadows,
      timeSec,
      sunAzimuth: sunOpts?.azimuth ?? 40,
      sunElevation: sunOpts?.elevation ?? 45,
      sunColor: sunOpts?.color ?? "#ffe4c8",
    });
    scene.background = skybox.texture;
  };

  const rebuildParticles = () => {
    if (rain) {
      root.remove(rain);
      rain.geometry.dispose();
      rain = null;
    }
    if (dust) {
      root.remove(dust);
      dust.geometry.dispose();
      dust = null;
    }
    if (fireflies) {
      root.remove(fireflies);
      fireflies.geometry.dispose();
      fireflies = null;
    }
    if (sparkles) {
      root.remove(sparkles);
      sparkles.geometry.dispose();
      sparkles = null;
    }
    if (!atm) return;
    const rainCount = Math.round(atm.rain * 900);
    if (rainCount > 0) {
      rain = new THREE.Points(
        makeRainGeo(rainCount, mapW * 1.2, mapD * 1.2, 48),
        rainMat,
      );
      rain.frustumCulled = false;
      root.add(rain);
    }
    const dustCount = Math.round(atm.dust * 220);
    if (dustCount > 0) {
      dust = new THREE.Points(
        makeMotesGeo(dustCount, mapW, mapD, 22),
        dustMat,
      );
      dust.frustumCulled = false;
      root.add(dust);
    }
    const flyCount = Math.round(atm.fireflies * 80);
    if (flyCount > 0) {
      fireflies = new THREE.Points(
        makeMotesGeo(flyCount, mapW * 0.9, mapD * 0.9, 18),
        fireMat,
      );
      fireflies.frustumCulled = false;
      root.add(fireflies);
    }
    const sparkleCount = Math.round(atm.sparkle * 160);
    if (sparkleCount > 0) {
      const geo = makeMotesGeo(sparkleCount, mapW * 0.95, mapD * 0.95, 16);
      const colors = new Float32Array(sparkleCount * 3);
      colors.fill(1);
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      sparkles = new THREE.Points(geo, sparkleMat);
      sparkles.frustumCulled = false;
      sparkles.renderOrder = 12;
      sparkles.userData.emberSkipWaterReflect = true;
      root.add(sparkles);
    }
  };

  return {
    root,
    apply(next, w, d, sun) {
      atm = next;
      sunOpts = sun ?? null;
      mapW = Math.max(32, w);
      mapD = Math.max(32, d);

      const haze = next.haze;
      const fogCol = hexToColor(next.fogColor);
      if (haze > 0.01) {
        fogCol.lerp(new THREE.Color(0xd4a070), Math.min(0.65, haze * 0.85));
      }
      const density = fogExp2Density(next.fog, haze);
      if (density > FOG_EXP2_MIN_DENSITY) {
        scene.fog = new THREE.FogExp2(fogCol.getHex(), density);
      } else if (scene.fog) {
        scene.fog = null;
      }
      // Pixel cube sky (stars / clouds / sun) — also mirrored by water planar RT.
      refreshSkybox(skyTime);

      // Particles are authored around local 0; park the whole stack on map center.
      root.position.set(mapW * 0.5, 0, mapD * 0.5);
      // Oversize plane a bit so map edges never show the mesh silhouette.
      cloudMesh.scale.set(mapW * 2.2, mapD * 2.2, 1);
      cloudMesh.position.set(0, 18, 0);
      // Opacity here is blend strength; pull back under heavy fog.
      // Cap hard — multiply clouds over a night grade can crush terrain to void
      // while MeshBasic lamp cores / water mirrors still pop.
      const fogAmt = Math.min(1, next.fog + haze * 0.28);
      const fogSoft = 1 - Math.min(0.55, fogAmt * 0.7);
      const cloudOp = Math.min(0.38, next.cloudShadows * 0.55 * fogSoft);
      cloudMat.opacity = cloudOp;
      cloudMesh.visible = next.cloudShadows > 0.02;
      // ~1 tile of noise across a medium map — seamless, no giant squares.
      const tile = Math.max(1.6, Math.min(3.2, Math.max(mapW, mapD) / 220));
      cloudTex.repeat.set(tile, tile);

      rainMat.opacity = Math.min(0.85, next.rain * 0.75);
      const dustWarm = 0.5 + haze * 0.35;
      dustMat.color.setRGB(0.78 * dustWarm, 0.69 * (0.85 + haze * 0.1), 0.56);
      dustMat.opacity = Math.min(0.65, next.dust * 0.5 + haze * 0.12);
      fireMat.opacity = Math.min(0.9, next.fireflies * 0.85);
      sparkleMat.opacity = Math.min(0.95, next.sparkle * 0.9);
      sparkleMat.size = 2.2 + next.sparkle * 1.1;

      if (sunOpts) {
        const night = Math.max(0, Math.min(1, sunOpts.night ?? 0.35));
        const sunRgb = parseHexRgb(sunOpts.color) ?? { r: 255, g: 220, b: 160 };
        sunDirectionFromAngles(sunOpts.azimuth, sunOpts.elevation, sunDir);
        celestialAng = CELESTIAL_ANG * (night > 0.4 ? 1.2 : 1);
        if (night > 0.4) {
          celestialMat.color.setRGB(0.95, 0.97, 1);
        } else {
          celestialMat.color.setRGB(
            sunRgb.r / 255,
            sunRgb.g / 255,
            Math.min(1, (sunRgb.b / 255) * 0.7 + 0.15),
          );
        }
        // Park relative to map center until the first camera sync.
        celestialSprite.position
          .copy(sunDir)
          .multiplyScalar(CELESTIAL_DIST)
          .add(root.position);
        celestialSprite.scale.set(
          CELESTIAL_DIST * celestialAng,
          CELESTIAL_DIST * celestialAng,
          1,
        );
        celestialSprite.visible = true;
        celestialMat.opacity = night > 0.4 ? 1 : 0.95;
        celestialSprite.userData.emberInfinityDir = sunDir;
        celestialSprite.userData.emberInfinityDist = CELESTIAL_DIST;
        celestialSprite.userData.emberInfinityAng = celestialAng;
      } else {
        celestialSprite.visible = false;
      }

      if (sunOpts && next.sunGlare > 0.02) {
        const sunRgb = parseHexRgb(sunOpts.color) ?? { r: 255, g: 176, b: 96 };
        glareMat.color.setRGB(sunRgb.r / 255, sunRgb.g / 255, sunRgb.b / 255);
        glareMat.opacity = Math.min(0.95, next.sunGlare * 0.85);
        const span = Math.max(mapW, mapD);
        const glareDist = Math.max(90, span * 0.85);
        const scale = Math.max(40, span * 0.28) * (0.7 + next.sunGlare * 0.6);
        sunDirectionFromAngles(sunOpts.azimuth, sunOpts.elevation, sunDir);
        glareSprite.position.copy(sunDir).multiplyScalar(glareDist);
        glareSprite.scale.set(scale, scale, 1);
        glareSprite.visible = true;
      } else {
        glareSprite.visible = false;
        glareMat.opacity = 0;
      }

      rebuildParticles();
    },
    syncCelestial,
    tick(dt, time, camera) {
      if (!atm) return;
      skyTime = time;
      if (camera) syncCelestial(camera);
      // Drift pixel sky clouds / twinkle stars (throttled inside skybox.update).
      if (
        atm.cloudShadows > 0.02 ||
        (sunOpts?.night ?? 0) > 0.25
      ) {
        refreshSkybox(time);
      }

      if (cloudMesh.visible) {
        // Drift mostly on one axis so motion reads as wind, not a sliding stamp.
        const s = 0.006 + atm.cloudSpeed * 0.016;
        cloudTex.offset.x = (cloudTex.offset.x + dt * s) % 1;
        cloudTex.offset.y = (cloudTex.offset.y + dt * s * 0.22) % 1;
      }

      if (glareSprite.visible) {
        glareMat.opacity =
          Math.min(0.95, atm.sunGlare * 0.85) *
          (0.88 + 0.12 * Math.sin(time * 0.7));
      }

      const windX = (atm.wind - 0.5) * 22;
      if (rain) {
        const pos = rain.geometry.getAttribute("position") as THREE.BufferAttribute;
        const spd = rain.geometry.getAttribute("speed") as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        const sarr = spd.array as Float32Array;
        const n = pos.count;
        const halfW = mapW * 0.6;
        const halfD = mapD * 0.6;
        for (let i = 0; i < n; i++) {
          const i3 = i * 3;
          arr[i3]! += windX * dt;
          arr[i3 + 1]! -= sarr[i]! * dt * (0.7 + atm.rain);
          arr[i3 + 2]! += windX * 0.25 * dt;
          if (arr[i3 + 1]! < 0) {
            arr[i3]! = (Math.random() - 0.5) * mapW * 1.2;
            arr[i3 + 1]! = 30 + Math.random() * 20;
            arr[i3 + 2]! = (Math.random() - 0.5) * mapD * 1.2;
          }
          if (arr[i3]! < -halfW) arr[i3]! += mapW * 1.2;
          if (arr[i3]! > halfW) arr[i3]! -= mapW * 1.2;
          if (arr[i3 + 2]! < -halfD) arr[i3 + 2]! += mapD * 1.2;
          if (arr[i3 + 2]! > halfD) arr[i3 + 2]! -= mapD * 1.2;
        }
        pos.needsUpdate = true;
      }

      const driftMotes = (
        pts: THREE.Points | null,
        yAmp: number,
        speed: number,
      ) => {
        if (!pts) return;
        const pos = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
        const phase = pts.geometry.getAttribute("phase") as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        const parr = phase.array as Float32Array;
        for (let i = 0; i < pos.count; i++) {
          const i3 = i * 3;
          const ph = parr[i]! + time * speed;
          arr[i3]! += Math.sin(ph) * dt * 1.2;
          arr[i3 + 1]! += Math.sin(ph * 1.7) * dt * yAmp;
          arr[i3 + 2]! += Math.cos(ph * 0.9) * dt * 1.1;
        }
        pos.needsUpdate = true;
      };
      driftMotes(dust, 0.6, 0.7);
      driftMotes(fireflies, 0.9, 1.1);
      driftMotes(sparkles, 0.35, 0.45);
      if (fireflies) {
        fireMat.opacity =
          Math.min(0.95, atm.fireflies * 0.85) *
          (0.55 + 0.45 * Math.sin(time * 3.1));
      }
      if (sparkles) {
        const col = sparkles.geometry.getAttribute("color") as THREE.BufferAttribute;
        const phase = sparkles.geometry.getAttribute("phase") as THREE.BufferAttribute;
        const carr = col.array as Float32Array;
        const parr = phase.array as Float32Array;
        for (let i = 0; i < col.count; i++) {
          const tw = Math.max(0, Math.sin(parr[i]! + time * 7.2));
          const flash = tw * tw * tw * tw;
          const v = 0.12 + flash * 0.88;
          const i3 = i * 3;
          carr[i3] = v;
          carr[i3 + 1] = v * 0.94;
          carr[i3 + 2] = v * 0.72;
        }
        col.needsUpdate = true;
        sparkleMat.opacity = Math.min(0.95, atm.sparkle * 0.9);
      }
    },
    dispose() {
      scene.remove(root);
      skybox.dispose();
      cloudMat.dispose();
      cloudTex.dispose();
      cloudMesh.geometry.dispose();
      rainMat.dispose();
      dustMat.dispose();
      fireMat.dispose();
      sparkleMat.dispose();
      sparkleTex.dispose();
      glareMat.dispose();
      glareTex.dispose();
      scene.remove(celestialSprite);
      celestialMat.dispose();
      celestialTex.dispose();
      if (rain) rain.geometry.dispose();
      if (dust) dust.geometry.dispose();
      if (fireflies) fireflies.geometry.dispose();
      if (sparkles) sparkles.geometry.dispose();
      if (scene.background === skybox.texture) {
        scene.background = new THREE.Color(0x0a0810);
      }
      if (scene.fog) scene.fog = null;
    },
  };
}
