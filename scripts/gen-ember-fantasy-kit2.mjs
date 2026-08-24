#!/usr/bin/env node
/**
 * Kit2 display weapons + counter smallwares for Ember.
 * Scaled for ~32-voxel-tall chibi people (explore camera 45–60°).
 * Shop display: hung shield, helm-on-barrel, bow in a fork, quiver,
 * and counter goods (daggers, ring casket, coin purse, scales).
 * Not street props, full furniture, weapon racks, or armor mannequins.
 *
 * Run: node scripts/gen-ember-fantasy-kit2.mjs
 *
 * Writes only the eight vox_fan_* ids listed below.
 * Does not touch env1–12, kit1, existing vox_fan_*, vox_chr_*, vox_vil_*,
 * maps, registry.json, or src.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ember = path.join(root, "content", "ember");
const V = 16;

const TAGS = ["fantasy", "indoor", "shop", "goods"];
const TAGS_LIGHT = ["fantasy", "indoor", "shop", "goods", "light"];

function writeJson(rel, data) {
  const full = path.join(ember, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function emptyGrid(sx, sy, sz) {
  return {
    sx,
    sy,
    sz,
    voxels: new Array(sx * sy * sz).fill(0),
    emissive: new Array(sx * sy * sz).fill(0),
  };
}

function vi(g, x, y, z) {
  return x + z * g.sx + y * g.sx * g.sz;
}

function setV(g, x, y, z, pal, em = 0) {
  if (x < 0 || y < 0 || z < 0 || x >= g.sx || y >= g.sy || z >= g.sz) return;
  const i = vi(g, x, y, z);
  g.voxels[i] = pal;
  g.emissive[i] = em;
}

function box(g, x0, y0, z0, x1, y1, z1, pal, em = 0) {
  for (let y = y0; y < y1; y++) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) setV(g, x, y, z, pal, em);
    }
  }
}

function inDisk(a, b, ca, cb, r) {
  const da = a + 0.5 - ca;
  const db = b + 0.5 - cb;
  return da * da + db * db <= r * r;
}

function inEllipse(a, b, ca, cb, ra, rb) {
  const da = (a + 0.5 - ca) / ra;
  const db = (b + 0.5 - cb) / rb;
  return da * da + db * db <= 1;
}

function inBall(x, y, z, cx, cy, cz, r) {
  const dx = x + 0.5 - cx;
  const dy = y + 0.5 - cy;
  const dz = z + 0.5 - cz;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

function inEllipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
  const dx = (x + 0.5 - cx) / rx;
  const dy = (y + 0.5 - cy) / ry;
  const dz = (z + 0.5 - cz) / rz;
  return dx * dx + dy * dy + dz * dz <= 1;
}

/** Heater silhouette in the X/Y plane: round top, pointed bottom. */
function inHeater(x, y, cx, cy, rx, ry) {
  const dx = x + 0.5 - cx;
  const dy = y + 0.5 - cy;
  const ny = dy / ry;
  const taper = ny < 0 ? 1 + ny * 0.72 : 1;
  if (taper <= 0.12) return false;
  const nx = dx / (rx * taper);
  return nx * nx + ny * ny <= 1;
}

function finishModel(g, spec) {
  const hasEm = g.emissive.some((v) => v > 0);
  const model = {
    id: spec.id,
    nameRu: spec.nameRu,
    sizeBlocks: spec.sizeBlocks,
    heightVoxels: spec.heightVoxels,
    palette: spec.palette,
    voxels: g.voxels,
    material: spec.material,
    physical: spec.physical ?? true,
  };
  if (spec.tags) model.tags = spec.tags;
  if (hasEm) model.emissive = g.emissive;
  if (spec.emissiveCastsLight != null) {
    model.emissiveCastsLight = spec.emissiveCastsLight;
  }
  if (spec.emissiveLightShadows != null) {
    model.emissiveLightShadows = spec.emissiveLightShadows;
  }
  if (spec.emissiveLightRange != null) {
    model.emissiveLightRange = spec.emissiveLightRange;
  }
  if (spec.emissiveStrength != null) model.emissiveStrength = spec.emissiveStrength;
  if (spec.emissiveTorchFlicker) model.emissiveTorchFlicker = true;
  if (spec.emissiveSuppressHostShadow) model.emissiveSuppressHostShadow = true;
  if (spec.directLightScale != null) model.directLightScale = spec.directLightScale;
  return model;
}

function writeModel(model) {
  writeJson(`voxels/models/${model.id}.json`, {
    id: model.id,
    nameRu: model.nameRu,
    tags: model.tags,
    model,
  });
}

function metalTone(x, y, z, cx, cy, cz, palDark, palMid, palHi) {
  if (x + 0.5 >= cx + 0.6 && y + 0.5 >= cy + 0.2 && z + 0.5 >= cz - 0.2) return palHi;
  if (x + 0.5 < cx - 0.8 || y + 0.5 < cy - 0.6) return palDark;
  return palMid;
}

/** Thick capsule along XZ at a given Y band (counter-laid blades). */
function capsuleXZ(g, x0, z0, x1, z1, y0, y1, r, palFn) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const px = -uz;
  const pz = ux;
  const xMin = Math.floor(Math.min(x0, x1) - r) - 1;
  const xMax = Math.ceil(Math.max(x0, x1) + r) + 1;
  const zMin = Math.floor(Math.min(z0, z1) - r) - 1;
  const zMax = Math.ceil(Math.max(z0, z1) + r) + 1;
  for (let y = y0; y < y1; y++) {
    for (let z = zMin; z <= zMax; z++) {
      for (let x = xMin; x <= xMax; x++) {
        const vx = x + 0.5 - x0;
        const vz = z + 0.5 - z0;
        const t = vx * ux + vz * uz;
        if (t < -0.4 || t > len + 0.4) continue;
        const qx = vx - ux * Math.max(0, Math.min(len, t));
        const qz = vz - uz * Math.max(0, Math.min(len, t));
        if (qx * qx + qz * qz > r * r) continue;
        const across = vx * px + vz * pz;
        palFn(g, x, y, z, t / len, across, r);
      }
    }
  }
}

function thickBall(g, cx, cy, cz, r, pal, palHi) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (!inBall(x, y, z, cx, cy, cz, r)) continue;
        const hi = x >= cx && y >= cy;
        setV(g, x, y, z, hi ? palHi : pal);
      }
    }
  }
}

function gem(g, cx, cy, cz, r, pal, palHi, em) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (!inBall(x, y, z, cx, cy, cz, r)) continue;
        const core = inBall(x, y, z, cx, cy, cz, r * 0.45);
        const hi = x + 0.5 >= cx && z + 0.5 >= cz;
        setV(g, x, y, z, hi ? palHi : pal, core ? em : Math.floor(em * 0.35));
      }
    }
  }
}

/**
 * Heater/round shield hung on a small wall plaque.
 * physical: false — hanging mount, like env10 mage_sign.
 */
function modelShieldWall() {
  const h = 16;
  const g = emptyGrid(V, h, V);

  box(g, 3, 14, 6, 6, 16, 9, 1);
  box(g, 10, 14, 6, 13, 16, 9, 1);
  box(g, 4, 12, 6, 6, 15, 9, 8);
  box(g, 10, 12, 6, 12, 15, 9, 8);

  box(g, 1, 1, 4, 15, 15, 8, 1);
  box(g, 2, 2, 5, 14, 14, 8, 2);
  box(g, 2, 2, 5, 14, 3, 6, 1);
  box(g, 2, 13, 5, 14, 14, 6, 1);

  const cx = 8;
  const cy = 8.1;
  for (let y = 1; y < 16; y++) {
    for (let x = 1; x < 15; x++) {
      if (!inHeater(x, y, cx, cy, 5.45, 6.15)) continue;
      const rim = !inHeater(x, y, cx, cy, 4.35, 5.05);
      const boss = inDisk(x, y, cx, cy, 1.65);
      for (let z = 7; z < 13; z++) {
        if (z === 7 && !rim) continue;
        let pal = 4;
        if (rim) pal = z >= 10 ? 5 : 3;
        else pal = metalTone(x, y, z, cx, cy, 10, 3, 4, 5);
        if (boss && z >= 9) pal = z >= 11 ? 5 : 8;
        setV(g, x, y, z, pal);
      }
    }
  }

  for (let y = 6; y < 11; y++) {
    for (let x = 5; x < 12; x++) {
      const sun = inDisk(x, y, 8, 8.2, 1.55);
      const ray =
        (Math.abs(x - 8) <= 1 && Math.abs(y - 8) <= 3) ||
        (Math.abs(y - 8) <= 1 && Math.abs(x - 8) <= 3);
      if (sun || ray) box(g, x, y, 11, x + 1, y + 1, 13, sun ? 7 : 6);
    }
  }
  setV(g, 8, 8, 12, 5);

  return finishModel(g, {
    id: "vox_fan_shield_wall",
    nameRu: "Щит на стене",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2414",
      "#6a3a18",
      "#2a2a34",
      "#6a6a78",
      "#d0d0dc",
      "#b02838",
      "#e8c060",
      "#4a4038",
    ],
    material: "metal",
    physical: false,
  });
}

/**
 * One closed helmet on a short barrel stump (display pedestal).
 * Not vox_fan_keg / vox_fan_barrel as a standalone, not an armor dummy.
 */
function modelHelmBarrel() {
  const h = 16;
  const g = emptyGrid(V, h, V);
  const cx = 8;
  const cz = 8;

  for (let y = 0; y < 8; y++) {
    const mid = 1 - Math.abs(y - 3.5) / 4.2;
    const r = 4.15 + mid * 0.85;
    const hoop = y === 1 || y === 4 || y === 6;
    for (let z = 2; z < 14; z++) {
      for (let x = 2; x < 14; x++) {
        if (!inDisk(x, z, cx, cz, r)) continue;
        const cap = y === 0 || y === 7;
        const stave = ((x + 8) % 4 === 0 || (z + 8) % 4 === 0) && !hoop && !cap;
        let pal = 3;
        if (stave) pal = 4;
        else if (hoop) pal = 5;
        else if (cap) pal = 2;
        else if (x + z < cx + cz - 1) pal = 1;
        if (y === 7 && inDisk(x, z, cx, cz, r - 1.2)) pal = 2;
        setV(g, x, y, z, pal);
      }
    }
  }

  const hcx = 8;
  const hcy = 11.6;
  const hcz = 7.8;
  for (let y = 8; y < 16; y++) {
    for (let z = 2; z < 14; z++) {
      for (let x = 2; x < 14; x++) {
        const dome = inEllipsoid(x, y, z, hcx, hcy, hcz, 4.15, 3.35, 3.95);
        const neck = y <= 9 && inDisk(x, z, hcx, hcz, 3.45);
        if (!dome && !neck) continue;
        let pal = metalTone(x, y, z, hcx, hcy, hcz, 6, 7, 8);
        if (neck) pal = y === 8 ? 5 : 6;
        if (y === 8 && inDisk(x, z, hcx, hcz, 2.4)) pal = 4;
        setV(g, x, y, z, pal);
      }
    }
  }
  box(g, 5, 11, 10, 11, 13, 12, 7);
  box(g, 6, 11, 11, 10, 12, 13, 6);
  box(g, 7, 11, 12, 9, 12, 13, 6);
  box(g, 7, 14, 6, 9, 16, 8, 8);
  box(g, 4, 8, 5, 12, 9, 11, 5);

  return finishModel(g, {
    id: "vox_fan_helm_barrel",
    nameRu: "Шлем на бочке",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3018",
      "#7a4a22",
      "#9a6838",
      "#3a2a20",
      "#5a5848",
      "#2a2a34",
      "#6a6a78",
      "#d0d0dc",
    ],
    material: "metal",
    physical: true,
  });
}

/** 2–3 chunky daggers laid on a cloth. Thick blades, not 1-voxel needles. */
function modelDaggers() {
  const h = 8;
  const g = emptyGrid(V, h, V);

  for (let z = 1; z < 15; z++) {
    for (let x = 1; x < 15; x++) {
      if (!inEllipse(x, z, 8, 8, 6.8, 6.2)) continue;
      const fold = (x + z) % 7 === 0;
      const edge = !inEllipse(x, z, 8, 8, 5.6, 5.1);
      setV(g, x, 0, z, edge || fold ? 1 : 2);
      if (!edge) setV(g, x, 1, z, fold ? 1 : 2);
    }
  }
  box(g, 3, 1, 2, 13, 3, 5, 1);
  box(g, 2, 1, 11, 8, 3, 14, 1);

  function dagger(x0, z0, x1, z1, y0) {
    capsuleXZ(g, x0, z0, x1, z1, y0, y0 + 3, 1.65, (grid, x, y, z, t) => {
      let pal = 6;
      if (t < 0.3) pal = y >= y0 + 1 ? 4 : 3;
      else if (t < 0.42) pal = 8;
      else if (y >= y0 + 2) pal = 7;
      else if (y >= y0 + 1) pal = 6;
      else pal = 5;
      if (t > 0.88) pal = 7;
      setV(grid, x, y, z, pal);
    });
    const gx = x0 + (x1 - x0) * 0.36;
    const gz = z0 + (z1 - z0) * 0.36;
    box(
      g,
      Math.round(gx) - 1,
      y0,
      Math.round(gz) - 1,
      Math.round(gx) + 2,
      y0 + 3,
      Math.round(gz) + 2,
      8,
    );
    box(
      g,
      Math.round(x0) - 1,
      y0,
      Math.round(z0) - 1,
      Math.round(x0) + 2,
      y0 + 3,
      Math.round(z0) + 2,
      4,
    );
  }

  dagger(1.6, 4.2, 14.2, 6.0, 2);
  dagger(1.8, 10.2, 14.0, 12.4, 2);
  dagger(3.4, 6.6, 13.2, 9.2, 3);

  return finishModel(g, {
    id: "vox_fan_daggers",
    nameRu: "Кинжалы",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a1830",
      "#7a2c50",
      "#5c3c22",
      "#8a5c34",
      "#2a2a34",
      "#6a6a78",
      "#d0d0dc",
      "#8a7a50",
    ],
    material: "metal",
    physical: true,
  });
}

/**
 * Open wooden jewelry casket with rings/gems on a pad.
 * Shop sparkle on gems; not kit1 jewel_tray.
 */
function modelRingBox() {
  const h = 10;
  const g = emptyGrid(V, h, V);

  box(g, 2, 0, 3, 14, 3, 14, 1);
  box(g, 3, 1, 4, 13, 3, 13, 2);
  box(g, 2, 0, 3, 14, 4, 5, 1);
  box(g, 2, 0, 12, 14, 4, 14, 1);
  box(g, 2, 0, 3, 4, 4, 14, 1);
  box(g, 12, 0, 3, 14, 4, 14, 1);
  box(g, 3, 3, 5, 13, 4, 12, 3);

  box(g, 3, 3, 4, 13, 5, 12, 4);
  box(g, 4, 4, 5, 12, 6, 11, 5);
  box(g, 5, 5, 6, 11, 6, 10, 4);

  box(g, 2, 3, 2, 14, 5, 5, 2);
  box(g, 3, 4, 1, 13, 7, 4, 2);
  box(g, 3, 6, 0, 13, 9, 3, 1);
  box(g, 4, 7, 0, 12, 9, 2, 3);
  box(g, 5, 4, 1, 11, 6, 3, 3);
  box(g, 2, 3, 2, 4, 8, 4, 1);
  box(g, 12, 3, 2, 14, 8, 4, 1);

  function ring(cx, cy, cz) {
    for (let y = Math.floor(cy) - 1; y <= Math.ceil(cy) + 1; y++) {
      for (let z = Math.floor(cz) - 3; z <= Math.ceil(cz) + 3; z++) {
        for (let x = Math.floor(cx) - 3; x <= Math.ceil(cx) + 3; x++) {
          if (!inDisk(x, z, cx, cz, 1.95)) continue;
          if (inDisk(x, z, cx, cz, 0.85)) continue;
          if (Math.abs(y + 0.5 - cy) > 1.2) continue;
          const hi = x + 0.5 >= cx;
          setV(g, x, y, z, hi ? 7 : 6);
        }
      }
    }
  }

  ring(6.0, 6.2, 7.2);
  ring(9.8, 6.1, 6.8);
  ring(8.0, 6.3, 9.8);
  gem(g, 5.2, 6.5, 10.0, 1.55, 8, 9, 160);
  gem(g, 10.8, 6.4, 9.6, 1.45, 8, 9, 140);
  setV(g, 6, 7, 10, 9, 220);
  setV(g, 11, 7, 10, 9, 200);

  return finishModel(g, {
    id: "vox_fan_ring_box",
    nameRu: "Шкатулка с кольцами",
    tags: TAGS_LIGHT,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#6a4424",
      "#8a5c34",
      "#5a1830",
      "#8a2848",
      "#c4a060",
      "#f0e0a0",
      "#2a6a98",
      "#d8f0ff",
    ],
    material: "wood",
    physical: true,
    emissiveCastsLight: false,
    emissiveSuppressHostShadow: true,
  });
}

/** One bow leaning in a simple forked stand. Not a staff/weapon rack. */
function modelBowStand() {
  const h = 18;
  const g = emptyGrid(V, h, V);

  box(g, 3, 0, 4, 13, 2, 12, 1);
  box(g, 4, 1, 5, 12, 2, 11, 2);
  box(g, 5, 2, 6, 8, 12, 10, 1);
  box(g, 6, 2, 7, 8, 12, 9, 2);
  box(g, 4, 10, 6, 6, 14, 10, 2);
  box(g, 8, 9, 6, 11, 13, 10, 2);
  box(g, 4, 12, 7, 6, 15, 9, 1);
  box(g, 9, 11, 7, 11, 14, 9, 1);
  box(g, 5, 12, 7, 10, 14, 9, 3);

  function bowPoint(t) {
    const x = 3.2 + t * 10.4;
    const y = 1.8 + Math.sin(t * Math.PI) * 14.4;
    const z = 9.2 + t * 1.4;
    return { x, y, z };
  }
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const p = bowPoint(t);
    const r = t > 0.38 && t < 0.62 ? 2.05 : 1.65;
    const pal = t > 0.38 && t < 0.62 ? 6 : t < 0.12 || t > 0.88 ? 5 : 4;
    thickBall(g, p.x, p.y, p.z, r, pal, pal === 4 ? 5 : pal);
  }

  const nock0 = bowPoint(0.06);
  const nock1 = bowPoint(0.94);
  const dx = nock1.x - nock0.x;
  const dy = nock1.y - nock0.y;
  const dz = nock1.z - nock0.z;
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    thickBall(
      g,
      nock0.x + dx * t,
      nock0.y + dy * t,
      nock0.z + dz * t - 0.4,
      1.05,
      7,
      7,
    );
    if (i === 0 || i === 18) {
      thickBall(
        g,
        nock0.x + dx * t,
        nock0.y + dy * t,
        nock0.z + dz * t,
        1.2,
        5,
        5,
      );
    }
  }

  return finishModel(g, {
    id: "vox_fan_bow_stand",
    nameRu: "Лук на стойке",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5c3c22",
      "#8a5c34",
      "#6a3a18",
      "#8a5420",
      "#4a3020",
      "#d8c8a0",
    ],
    material: "wood",
    physical: true,
  });
}

/** Standing leather quiver packed with arrows. Fletching readable. */
function modelQuiver() {
  const h = 16;
  const g = emptyGrid(V, h, V);
  const cx = 8;
  const cz = 8;

  for (let y = 0; y < 12; y++) {
    const t = y / 11;
    const rx = 3.55 + t * 0.55;
    const rz = 3.15 + t * 0.35;
    for (let z = 2; z < 14; z++) {
      for (let x = 2; x < 14; x++) {
        if (!inEllipse(x, z, cx, cz, rx, rz)) continue;
        const inner = y >= 2 && inEllipse(x, z, cx, cz, rx - 1.35, rz - 1.25);
        if (inner) {
          if (y === 2) setV(g, x, y, z, 4);
          continue;
        }
        let pal = 2;
        if (x + z < cx + cz - 1) pal = 1;
        if (x >= cx + 1 && y >= 6) pal = 3;
        if (y === 0 || y === 11) pal = 1;
        setV(g, x, y, z, pal);
      }
    }
  }
  box(g, 4, 4, 10, 12, 7, 12, 4);
  box(g, 5, 5, 11, 11, 6, 13, 1);
  box(g, 7, 3, 3, 9, 10, 5, 4);

  const shafts = [
    [6.0, 7.0, 15],
    [8.0, 6.4, 16],
    [9.8, 7.2, 15],
    [7.0, 8.8, 16],
    [9.2, 8.8, 14],
  ];
  for (const [sx, sz, top] of shafts) {
    const ix = Math.round(sx);
    const iz = Math.round(sz);
    box(g, ix, 3, iz, ix + 2, Math.min(top - 2, 14), iz + 2, 5);
    box(g, ix, top - 3, iz - 1, ix + 2, top, iz + 3, 6);
    box(g, ix - 1, top - 3, iz, ix + 3, top, iz + 2, 6);
    setV(g, ix, top - 1, iz, 7);
    setV(g, ix + 1, top - 1, iz + 1, 7);
    setV(g, ix, top - 2, iz - 1, 7);
    setV(g, ix + 1, top - 2, iz + 2, 7);
  }

  return finishModel(g, {
    id: "vox_fan_quiver",
    nameRu: "Колчан",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2418",
      "#6a3a24",
      "#8a5840",
      "#c4a060",
      "#8a6a40",
      "#e8dcc4",
      "#b02838",
    ],
    material: "cloth",
    physical: true,
  });
}

/** Slumped leather coin purse with a few spilled coins. Not flour sacks. */
function modelCoinPouch() {
  const h = 9;
  const g = emptyGrid(V, h, V);
  const cx = 6.4;
  const cz = 7.6;
  const y0 = 0;
  const ph = 8;
  const cy = y0 + ph * 0.36;

  for (let y = y0; y < y0 + ph - 1; y++) {
    const t = (y - y0) / Math.max(1, ph - 2);
    const wr = 1.14 - t * 0.36;
    for (let z = 1; z < 15; z++) {
      for (let x = 0; x < 13; x++) {
        if (!inEllipsoid(x, y, z, cx, cy, cz, 4.85 * wr, ph * 0.5, 4.35 * wr)) continue;
        let pal = 2;
        if (x + z < cx + cz - 1) pal = 1;
        if (x >= cx + 1 && y >= cy) pal = 3;
        setV(g, x, y, z, pal);
      }
    }
  }
  for (let y = 5; y < 9; y++) {
    const r = y >= 7 ? 1.55 : 2.15;
    for (let z = 4; z < 12; z++) {
      for (let x = 3; x < 10; x++) {
        if (!inDisk(x, z, cx, cz, r)) continue;
        setV(g, x, y, z, 1);
      }
    }
  }
  box(g, 4, 5, 6, 9, 7, 10, 4);
  box(g, 5, 6, 7, 8, 8, 9, 8);

  function coin(cx0, cz0, y, r) {
    for (let z = Math.floor(cz0 - r) - 1; z <= Math.ceil(cz0 + r) + 1; z++) {
      for (let x = Math.floor(cx0 - r) - 1; x <= Math.ceil(cx0 + r) + 1; x++) {
        if (!inDisk(x, z, cx0, cz0, r)) continue;
        const edge = !inDisk(x, z, cx0, cz0, r - 0.75);
        let pal = edge ? 5 : 6;
        if (!edge && x >= cx0 && z >= cz0) pal = 7;
        setV(g, x, y, z, pal);
        if (y === 0 && !edge) setV(g, x, 1, z, pal === 7 ? 7 : 6);
      }
    }
  }
  coin(12.4, 4.8, 0, 1.7);
  coin(11.2, 7.6, 0, 1.55);
  coin(13.2, 9.6, 0, 1.5);
  coin(10.4, 11.0, 0, 1.45);
  coin(12.6, 12.0, 0, 1.35);
  box(g, 11, 0, 5, 15, 2, 8, 5);
  box(g, 12, 1, 6, 14, 2, 8, 7);

  return finishModel(g, {
    id: "vox_fan_coin_pouch",
    nameRu: "Мешок с монетами",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a4a28",
      "#5a6a38",
      "#8a9a58",
      "#8a6a30",
      "#8a6818",
      "#d4a430",
      "#f8e070",
      "#4a4030",
    ],
    material: "cloth",
    physical: true,
  });
}

/** Merchant balance scales: chunky post, beam, two pans. */
function modelScales() {
  const h = 12;
  const g = emptyGrid(V, h, V);

  box(g, 3, 0, 3, 13, 2, 13, 1);
  box(g, 4, 1, 4, 12, 2, 12, 2);
  box(g, 6, 2, 6, 10, 8, 10, 6);
  box(g, 7, 2, 7, 9, 8, 9, 4);
  box(g, 6, 7, 6, 10, 9, 10, 5);

  box(g, 1, 8, 6, 15, 10, 10, 4);
  box(g, 2, 9, 7, 14, 10, 9, 5);
  box(g, 1, 8, 6, 3, 10, 10, 5);
  box(g, 13, 8, 6, 15, 10, 10, 5);
  box(g, 7, 9, 6, 9, 11, 10, 5);

  box(g, 2, 5, 7, 4, 8, 9, 6);
  box(g, 12, 5, 7, 14, 8, 9, 6);

  function pan(cx, cz, y0) {
    for (let y = y0; y < y0 + 2; y++) {
      for (let z = Math.floor(cz) - 4; z <= Math.floor(cz) + 4; z++) {
        for (let x = Math.floor(cx) - 4; x <= Math.floor(cx) + 4; x++) {
          if (!inDisk(x, z, cx, cz, 2.85)) continue;
          const rim = !inDisk(x, z, cx, cz, 1.85);
          let pal = rim || y === y0 ? 3 : 4;
          if (x >= cx && y >= y0 + 1 && !rim) pal = 5;
          setV(g, x, y, z, pal);
        }
      }
    }
  }
  pan(3.2, 8, 4);
  pan(12.8, 8, 4);
  box(g, 2, 5, 7, 5, 6, 10, 4);
  box(g, 11, 5, 7, 14, 6, 10, 4);
  box(g, 2, 5, 7, 4, 6, 9, 8);
  box(g, 11, 6, 8, 13, 7, 10, 7);

  return finishModel(g, {
    id: "vox_fan_scales",
    nameRu: "Весы",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#6a4424",
      "#3a3428",
      "#8a7a40",
      "#e8d490",
      "#5a4a20",
      "#6a6860",
      "#c4a060",
    ],
    material: "metal",
    physical: true,
  });
}

const models = [
  modelShieldWall(),
  modelHelmBarrel(),
  modelDaggers(),
  modelRingBox(),
  modelBowStand(),
  modelQuiver(),
  modelCoinPouch(),
  modelScales(),
];

for (const model of models) writeModel(model);

const summary = models
  .map((m) => {
    const solids = m.voxels.filter((v) => v > 0).length;
    const blocks = `${m.sizeBlocks.x}×${m.sizeBlocks.y}×${m.sizeBlocks.z}`;
    const extra = m.physical === false ? "  nophys" : "";
    const light = m.emissiveCastsLight ? "  light" : "";
    const glow = m.emissive ? "  emissive" : "";
    return `${m.id}  ${m.nameRu}  ${m.heightVoxels}h  ${blocks}  ${solids}vox  tags=${(m.tags ?? []).join(",")}${extra}${light}${glow}`;
  })
  .join("\n");

console.log(`fantasy kit2 display wares: ${models.length} models\n${summary}`);
