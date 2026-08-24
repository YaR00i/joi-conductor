#!/usr/bin/env node
/**
 * Kit1 bakery/shop counter goods for Ember.
 * Scaled for ~32-voxel-tall chibi people (explore camera 45–60°).
 * Counter wares sit ON a counter: short chunky masses, not furniture or buildings.
 *
 * Run: node scripts/gen-ember-fantasy-kit1.mjs
 *
 * Writes only the eight vox_fan_* ids listed below.
 * Does not touch env1–12, existing vox_fan_*, vox_chr_*, vox_vil_*,
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

function board(g, x0, y0, z0, x1, y1, z1, dark, light) {
  box(g, x0, y0, z0, x1, y1, z1, dark);
  box(g, x0 + 1, y0 + 1, z0 + 1, x1 - 1, y1, z1 - 1, light);
  for (let x = x0 + 1; x < x1 - 1; x++) {
    if (x % 3 === 0) box(g, x, y0 + 1, z0 + 1, x + 1, y1, z1 - 1, dark);
  }
}

/** Flattened bakery loaf: disk stacks, crust shell, optional top scores. */
function loaf(g, cx, y0, cz, rx, h, rz, crust, crustDark, crumb) {
  for (let y = y0; y < y0 + h; y++) {
    const t = (y - y0) / Math.max(1, h - 1);
    const s = Math.sin(Math.max(0.12, t) * Math.PI);
    const rScale = 0.62 + 0.38 * s;
    for (let z = Math.floor(cz - rz) - 1; z <= Math.ceil(cz + rz) + 1; z++) {
      for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx) + 1; x++) {
        if (!inEllipse(x, z, cx, cz, rx * rScale, rz * rScale)) continue;
        const edge =
          !inEllipse(x, z, cx, cz, rx * rScale - 1.05, rz * rScale - 1.05);
        let pal = crust;
        if (t < 0.18 || t > 0.78 || edge) pal = crustDark;
        else if (t > 0.35 && t < 0.7 && inEllipse(x, z, cx, cz, rx * 0.45, rz * 0.45)) {
          pal = crumb;
        }
        if (x >= cx + 1 && y >= y0 + Math.floor(h * 0.45) && pal === crust) pal = crumb;
        setV(g, x, y, z, pal);
      }
    }
  }
}

/** Round loaf stacked with a bun, plus a side roll on a cutting board. */
function modelBread() {
  const h = 10;
  const g = emptyGrid(V, h, V);
  board(g, 1, 0, 2, 15, 2, 14, 1, 2);

  loaf(g, 5.4, 2, 8.0, 3.95, 6, 4.1, 3, 4, 5);
  box(g, 3, 7, 7, 8, 8, 10, 4);
  box(g, 4, 6, 8, 7, 8, 9, 4);
  loaf(g, 5.6, 6, 8.0, 2.55, 4, 2.45, 3, 4, 5);

  loaf(g, 12.4, 2, 6.2, 2.45, 4, 2.3, 6, 4, 5);
  loaf(g, 12.2, 2, 11.5, 2.2, 3, 2.05, 3, 4, 5);

  return finishModel(g, {
    id: "vox_fan_bread",
    nameRu: "Каравай",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3420",
      "#8a5c34",
      "#c07838",
      "#8a4a20",
      "#e8c888",
      "#d09048",
    ],
    material: "cloth",
    physical: true,
  });
}

/** Cheese wheel on a board, one wedge cut and set aside. */
function modelCheese() {
  const h = 8;
  const g = emptyGrid(V, h, V);
  board(g, 1, 0, 2, 15, 2, 14, 1, 2);

  const cx = 7.2;
  const cz = 8;
  const y0 = 2;
  const rindH = 5;
  for (let y = y0; y < y0 + rindH; y++) {
    const t = (y - y0) / (rindH - 1);
    const r = 5.35 - Math.abs(t - 0.4) * 0.45;
    for (let z = 1; z < 15; z++) {
      for (let x = 1; x < 14; x++) {
        if (!inDisk(x, z, cx, cz, r)) continue;
        const ang = Math.atan2(z + 0.5 - cz, x + 0.5 - cx);
        const inWedge = ang > -0.52 && ang < 0.52;
        const onFace = Math.abs(ang + 0.52) < 0.2 || Math.abs(ang - 0.52) < 0.2;
        if (inWedge && !onFace) continue;
        const edge = !inDisk(x, z, cx, cz, r - 1.05);
        let pal = 5;
        if (y === y0 || y === y0 + rindH - 1 || edge) pal = 4;
        if (y === y0 + rindH - 1 && edge) pal = 3;
        if (onFace) pal = 6;
        if (x >= 8 && y >= 4 && pal === 5) pal = 6;
        const hole =
          y >= 5 &&
          (inDisk(x, z, 6.2, 6.4, 1.05) || inDisk(x, z, 5.6, 9.4, 0.95));
        if (hole && !inWedge) pal = 6;
        setV(g, x, y, z, pal);
      }
    }
  }

  for (let y = 2; y < 6; y++) {
    const t = (y - 2) / 3;
    const r = 2.55 - t * 0.15;
    for (let z = 3; z < 10; z++) {
      for (let x = 10; x < 16; x++) {
        const ang = Math.atan2(z + 0.5 - 6.4, x + 0.5 - 11.2);
        if (ang < -0.15 || ang > 1.15) continue;
        if (!inDisk(x, z, 11.2, 6.4, r)) continue;
        const edge = !inDisk(x, z, 11.2, 6.4, r - 0.95);
        let pal = 5;
        if (y === 2 || y === 5 || edge) pal = 4;
        if (ang < 0.12 || ang > 0.95) pal = 6;
        setV(g, x, y, z, pal);
      }
    }
  }

  return finishModel(g, {
    id: "vox_fan_cheese",
    nameRu: "Сыр",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3420",
      "#8a5c34",
      "#b07018",
      "#d09028",
      "#f0c848",
      "#fff0b0",
    ],
    material: "cloth",
    physical: true,
  });
}

/** Fat fish ellipsoid with a 2-voxel tail, packed in the crate. */
function fish(g, cx, cy, cz, rx, ry, rz, palBody, palBack, palBelly, palTail) {
  for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry) + 1; y++) {
    for (let z = Math.floor(cz - rz) - 1; z <= Math.ceil(cz + rz) + 1; z++) {
      for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx) + 2; x++) {
        if (!inEllipsoid(x, y, z, cx, cy, cz, rx, ry, rz)) continue;
        let pal = palBody;
        if (y >= cy + ry * 0.15) pal = palBack;
        if (y <= cy - ry * 0.25) pal = palBelly;
        if (x >= cx + rx * 0.45 && y >= cy) pal = palBack;
        setV(g, x, y, z, pal);
      }
    }
  }
  const tx = Math.max(3, Math.round(cx - rx));
  const ty = Math.round(cy);
  const tz = Math.round(cz);
  box(g, tx - 1, ty - 1, tz - 1, tx + 1, ty + 2, tz + 2, palTail);
  box(g, tx - 1, ty, tz - 2, tx + 1, ty + 1, tz + 3, palTail);
  setV(g, Math.round(cx + rx - 0.6), Math.round(cy + 0.2), Math.round(cz), palBack);
}

/** Open slat crate packed with fish — not the closed vox_fan_crate_old. */
function modelFishCrate() {
  const h = 12;
  const g = emptyGrid(V, h, V);

  box(g, 1, 0, 1, 15, 2, 15, 1);
  box(g, 2, 1, 2, 14, 2, 14, 2);
  box(g, 1, 0, 1, 15, 9, 3, 1);
  box(g, 1, 0, 13, 15, 9, 15, 1);
  box(g, 1, 0, 1, 3, 9, 15, 1);
  box(g, 13, 0, 1, 15, 9, 15, 1);
  box(g, 1, 0, 1, 15, 2, 15, 2);

  for (let y = 2; y < 9; y++) {
    if (y % 2 === 0) {
      box(g, 1, y, 1, 15, y + 1, 3, 3);
      box(g, 1, y, 13, 15, y + 1, 15, 3);
      box(g, 1, y, 1, 3, y + 1, 15, 3);
      box(g, 13, y, 1, 15, y + 1, 15, 3);
    }
  }
  box(g, 1, 8, 1, 15, 9, 15, 3);
  box(g, 3, 8, 3, 13, 9, 13, 0);

  box(g, 3, 2, 3, 13, 4, 13, 8);
  box(g, 4, 3, 4, 12, 4, 12, 8);

  fish(g, 7.6, 5.8, 6.4, 3.6, 1.65, 1.8, 4, 5, 6, 5);
  fish(g, 8.0, 5.4, 10.2, 3.4, 1.5, 1.65, 4, 5, 6, 5);
  fish(g, 6.8, 7.4, 8.4, 3.3, 1.45, 1.55, 4, 5, 6, 5);
  fish(g, 10.0, 6.8, 7.8, 2.9, 1.35, 1.4, 4, 5, 6, 7);
  fish(g, 8.2, 9.4, 8.6, 3.5, 1.55, 1.6, 4, 5, 6, 5);

  box(g, 1, 0, 1, 15, 9, 3, 1);
  box(g, 1, 0, 13, 15, 9, 15, 1);
  box(g, 1, 0, 1, 3, 9, 15, 1);
  box(g, 13, 0, 1, 15, 9, 15, 1);
  for (let y = 2; y < 9; y++) {
    if (y % 2 === 0) {
      box(g, 1, y, 1, 15, y + 1, 3, 3);
      box(g, 1, y, 13, 15, y + 1, 15, 3);
      box(g, 1, y, 1, 3, y + 1, 15, 3);
      box(g, 13, y, 1, 15, y + 1, 15, 3);
    }
  }
  box(g, 1, 8, 1, 15, 9, 3, 3);
  box(g, 1, 8, 13, 15, 9, 15, 3);
  box(g, 1, 8, 1, 3, 9, 15, 3);
  box(g, 13, 8, 1, 15, 9, 15, 3);

  return finishModel(g, {
    id: "vox_fan_fish_crate",
    nameRu: "Ящик с рыбой",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5c3c22",
      "#3a2818",
      "#8a5c34",
      "#8aa0a8",
      "#4a6070",
      "#e8d4c0",
      "#6a7880",
      "#c8d8e0",
    ],
    material: "wood",
    physical: true,
  });
}

/** Slumped tied sack — ellipsoid body, gathered neck, not a cube. */
function sack(g, cx, y0, cz, rx, h, rz, pal, palShade, palLight, palTie) {
  const cy = y0 + h * 0.38;
  for (let y = y0; y < y0 + h - 1; y++) {
    const t = (y - y0) / Math.max(1, h - 2);
    const wr = 1.08 - t * 0.32;
    const hr = h * 0.5;
    for (let z = Math.floor(cz - rz) - 1; z <= Math.ceil(cz + rz) + 1; z++) {
      for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx) + 1; x++) {
        if (!inEllipsoid(x, y, z, cx, cy, cz, rx * wr, hr, rz * wr)) continue;
        let palI = pal;
        if (x + z < cx + cz - 1) palI = palShade;
        if (x >= cx + 1 && y >= cy) palI = palLight;
        setV(g, x, y, z, palI);
      }
    }
  }
  const neckY = y0 + h - 3;
  for (let y = neckY; y < y0 + h; y++) {
    const r = y === y0 + h - 1 ? 1.35 : 1.85;
    for (let z = Math.floor(cz) - 3; z <= Math.floor(cz) + 3; z++) {
      for (let x = Math.floor(cx) - 3; x <= Math.floor(cx) + 3; x++) {
        if (!inDisk(x, z, cx, cz, r)) continue;
        setV(g, x, y, z, palShade);
      }
    }
  }
  box(
    g,
    Math.floor(cx) - 2,
    neckY,
    Math.floor(cz) - 1,
    Math.floor(cx) + 2,
    neckY + 1,
    Math.floor(cz) + 2,
    palTie,
  );
  setV(g, Math.floor(cx), neckY, Math.floor(cz), 6);
  setV(g, Math.floor(cx) - 1, neckY, Math.floor(cz) + 1, 6);
}

/** 2–3 tied flour/grain sacks, slumped on the counter. */
function modelSackFlour() {
  const h = 13;
  const g = emptyGrid(V, h, V);
  sack(g, 6.2, 0, 7.6, 4.6, 12, 4.2, 1, 2, 3, 4);
  sack(g, 11.0, 0, 6.2, 3.7, 10, 3.5, 2, 1, 3, 4);
  sack(g, 10.2, 0, 11.0, 3.4, 9, 3.2, 1, 2, 5, 4);
  box(g, 8, 1, 9, 11, 3, 12, 5);
  box(g, 9, 2, 10, 11, 3, 12, 3);

  return finishModel(g, {
    id: "vox_fan_sack_flour",
    nameRu: "Мешки муки",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#c8b070",
      "#8a7848",
      "#e8d8a0",
      "#5c3c22",
      "#f4ead0",
      "#3a2818",
    ],
    material: "cloth",
    physical: true,
  });
}

/** Pie on a short stand: gold crust rim, dark filling, one slice gone. */
function modelPie() {
  const h = 8;
  const g = emptyGrid(V, h, V);

  for (let z = 4; z < 12; z++) {
    for (let x = 4; x < 12; x++) {
      if (inDisk(x, z, 8, 8, 3.2)) setV(g, x, 0, z, 1);
    }
  }
  box(g, 6, 1, 6, 10, 2, 10, 1);
  for (let z = 2; z < 14; z++) {
    for (let x = 2; x < 14; x++) {
      if (!inDisk(x, z, 8, 8, 6.1)) continue;
      setV(g, x, 2, z, 2);
      if (inDisk(x, z, 8, 8, 5.1)) setV(g, x, 2, z, 1);
    }
  }

  const cx = 8;
  const cz = 8;
  for (let y = 3; y < 7; y++) {
    const t = (y - 3) / 3;
    const r = 5.5 - t * 0.25;
    for (let z = 1; z < 15; z++) {
      for (let x = 1; x < 15; x++) {
        if (!inDisk(x, z, cx, cz, r)) continue;
        const ang = Math.atan2(z + 0.5 - cz, x + 0.5 - cx);
        const inSlice = ang > -0.35 && ang < 0.55;
        const onFace = Math.abs(ang + 0.35) < 0.18 || Math.abs(ang - 0.55) < 0.18;
        if (inSlice && !onFace) continue;
        const rim = !inDisk(x, z, cx, cz, r - 1.35);
        let pal = 5;
        if (rim || y === 3) pal = 3;
        if (y === 6 && rim) pal = 4;
        if (onFace) pal = y >= 5 ? 6 : 5;
        if (!rim && y === 6) pal = 6;
        setV(g, x, y, z, pal);
      }
    }
  }
  box(g, 6, 6, 6, 8, 7, 8, 4);
  box(g, 9, 6, 9, 11, 7, 11, 4);
  box(g, 7, 6, 10, 9, 7, 12, 4);

  for (let y = 3; y < 6; y++) {
    for (let z = 4; z < 10; z++) {
      for (let x = 11; x < 16; x++) {
        const ang = Math.atan2(z + 0.5 - 6.8, x + 0.5 - 12.2);
        if (ang < -0.2 || ang > 1.05) continue;
        if (!inDisk(x, z, 12.2, 6.8, 2.35)) continue;
        const rim = !inDisk(x, z, 12.2, 6.8, 1.4);
        setV(g, x, y, z, rim || y === 3 ? 3 : 5);
        if (y === 5 && !rim) setV(g, x, y, z, 6);
      }
    }
  }

  return finishModel(g, {
    id: "vox_fan_pie",
    nameRu: "Пирог",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5c3c22",
      "#c4a070",
      "#d09038",
      "#e8c070",
      "#8a1c28",
      "#c04040",
    ],
    material: "cloth",
    physical: true,
  });
}

/** Cloth roll: fat cylinder along X, darker core on the cut end. */
function clothRoll(g, x0, x1, cy, cz, r, pal, palShade, palCore) {
  for (let x = x0; x < x1; x++) {
    for (let z = Math.floor(cz - r) - 1; z <= Math.ceil(cz + r) + 1; z++) {
      for (let y = Math.floor(cy - r) - 1; y <= Math.ceil(cy + r) + 1; y++) {
        if (!inDisk(y, z, cy, cz, r)) continue;
        let palI = pal;
        if (y < cy - 0.3) palI = palShade;
        if (x === x0 || x === x1 - 1) {
          palI = inDisk(y, z, cy, cz, r * 0.45) ? palCore : palShade;
        }
        setV(g, x, y, z, palI);
      }
    }
  }
}

/** 2–3 cloth bolts in different colors, on a board. */
function modelClothBolt() {
  const h = 10;
  const g = emptyGrid(V, h, V);
  board(g, 1, 0, 2, 15, 2, 14, 1, 2);

  clothRoll(g, 1, 15, 4.4, 6.2, 2.55, 3, 4, 1);
  clothRoll(g, 2, 14, 4.2, 11.0, 2.35, 5, 6, 1);
  clothRoll(g, 3, 13, 7.6, 8.4, 2.15, 7, 8, 2);

  return finishModel(g, {
    id: "vox_fan_cloth_bolt",
    nameRu: "Рулоны ткани",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3420",
      "#8a5c34",
      "#a02830",
      "#6a181c",
      "#2a6a48",
      "#1a4a30",
      "#2a4a98",
      "#1a2a68",
    ],
    material: "cloth",
    physical: true,
  });
}

/** Chunky gem blob with a small emissive core — sparkle, not a lantern. */
function gem(g, cx, cy, cz, r, pal, palHi, em) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (!inBall(x, y, z, cx, cy, cz, r)) continue;
        const core = inBall(x, y, z, cx, cy, cz, r * 0.45);
        const hi = x >= cx && y >= cy && z >= cz - 0.4;
        setV(g, x, y, z, hi ? palHi : pal, core ? em : Math.floor(em * 0.35));
      }
    }
  }
}

/** Shallow tray of mixed gems. Glow stays on the stones, not a scry bowl / orb. */
function modelJewelTray() {
  const h = 6;
  const g = emptyGrid(V, h, V);

  box(g, 2, 0, 2, 14, 2, 14, 1);
  box(g, 3, 1, 3, 13, 2, 13, 2);
  box(g, 2, 1, 2, 14, 3, 4, 1);
  box(g, 2, 1, 12, 14, 3, 14, 1);
  box(g, 2, 1, 2, 4, 3, 14, 1);
  box(g, 12, 1, 2, 14, 3, 14, 1);
  box(g, 2, 2, 2, 14, 3, 14, 3);
  box(g, 4, 2, 4, 12, 3, 12, 0);
  box(g, 4, 1, 4, 12, 2, 12, 2);

  gem(g, 6.2, 3.2, 6.4, 2.05, 4, 8, 160);
  gem(g, 10.2, 3.1, 6.0, 1.85, 5, 8, 140);
  gem(g, 8.0, 3.0, 10.2, 1.95, 6, 8, 150);
  gem(g, 5.4, 2.9, 10.0, 1.65, 7, 8, 120);
  gem(g, 11.0, 2.9, 9.8, 1.55, 4, 8, 110);
  gem(g, 8.8, 3.3, 7.6, 1.45, 6, 8, 130);

  return finishModel(g, {
    id: "vox_fan_jewel_tray",
    nameRu: "Поднос с камнями",
    tags: TAGS_LIGHT,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a342c",
      "#6a5a48",
      "#c4a060",
      "#b02838",
      "#2a8a48",
      "#2a5aa0",
      "#d09028",
      "#fff4d0",
    ],
    material: "wood",
    physical: true,
    emissiveCastsLight: false,
    emissiveSuppressHostShadow: true,
  });
}

/** Fat parchment cylinder. Axis 0 = X, 1 = Z. Ends read as a roll, not a loaf. */
function scroll(g, cx, cy, cz, len, r, axis, pal, palShade, palEnd, palRibbon, palSeal) {
  const hlen = len / 2;
  for (let i = -Math.ceil(hlen) - 1; i <= Math.ceil(hlen) + 1; i++) {
    for (let a = -Math.ceil(r) - 1; a <= Math.ceil(r) + 1; a++) {
      for (let b = -Math.ceil(r) - 1; b <= Math.ceil(r) + 1; b++) {
        const x = axis === 0 ? cx + i : cx + a;
        const y = cy + b;
        const z = axis === 0 ? cz + a : cz + i;
        const along = axis === 0 ? x + 0.5 - cx : z + 0.5 - cz;
        const da = axis === 0 ? z + 0.5 - cz : x + 0.5 - cx;
        const db = y + 0.5 - cy;
        if (Math.abs(along) > hlen) continue;
        if (da * da + db * db > r * r) continue;
        const end = Math.abs(along) > hlen - 0.85;
        const core = da * da + db * db <= (r * 0.42) * (r * 0.42);
        let palI = pal;
        if (db < -0.35) palI = palShade;
        if (end) palI = core ? palEnd : palShade;
        setV(g, Math.round(x), Math.round(y), Math.round(z), palI);
      }
    }
  }
  if (!palRibbon) return;
  for (let a = -Math.ceil(r) - 1; a <= Math.ceil(r) + 1; a++) {
    for (let b = -Math.ceil(r) - 1; b <= Math.ceil(r) + 1; b++) {
      const da = a + 0.5;
      const db = b + 0.5;
      const d2 = da * da + db * db;
      if (d2 > r * r || d2 < (r - 1.15) * (r - 1.15)) continue;
      if (axis === 0) {
        box(
          g,
          Math.round(cx) - 1,
          Math.round(cy + b),
          Math.round(cz + a),
          Math.round(cx) + 2,
          Math.round(cy + b) + 1,
          Math.round(cz + a) + 1,
          palRibbon,
        );
      } else {
        box(
          g,
          Math.round(cx + a),
          Math.round(cy + b),
          Math.round(cz) - 1,
          Math.round(cx + a) + 1,
          Math.round(cy + b) + 1,
          Math.round(cz) + 2,
          palRibbon,
        );
      }
    }
  }
  if (!palSeal) return;
  setV(g, Math.round(cx), Math.round(cy + r - 0.3), Math.round(cz), palSeal);
  setV(
    g,
    Math.round(cx) + (axis === 0 ? 1 : 0),
    Math.round(cy + r - 0.3),
    Math.round(cz) + (axis === 1 ? 1 : 0),
    palSeal,
  );
  setV(g, Math.round(cx), Math.round(cy + r - 1.1), Math.round(cz), palSeal);
}

/** Messy pile of rolled parchment. Not a lectern grimoire. */
function modelScrollPile() {
  const h = 10;
  const g = emptyGrid(V, h, V);

  scroll(g, 8.0, 2.2, 5.2, 12, 2.15, 0, 1, 2, 6, 5, 4);
  scroll(g, 7.5, 2.1, 10.8, 11, 2.05, 0, 3, 1, 6, 0, 0);
  scroll(g, 4.4, 2.2, 8.0, 10, 2.0, 1, 1, 2, 6, 5, 4);
  scroll(g, 12.0, 2.3, 8.4, 9, 1.9, 1, 2, 3, 6, 0, 0);
  scroll(g, 8.2, 5.4, 7.4, 10, 2.0, 0, 3, 2, 6, 5, 4);
  scroll(g, 10.4, 5.0, 11.0, 8, 1.8, 1, 1, 6, 6, 0, 0);
  scroll(g, 5.6, 6.8, 6.2, 8, 1.75, 0, 2, 1, 6, 5, 4);

  return finishModel(g, {
    id: "vox_fan_scroll_pile",
    nameRu: "Свитки",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#e8d4a8",
      "#c4a878",
      "#f4ead0",
      "#a02830",
      "#6a4a88",
      "#6a5030",
    ],
    material: "cloth",
    physical: true,
  });
}

const models = [
  modelBread(),
  modelCheese(),
  modelFishCrate(),
  modelSackFlour(),
  modelPie(),
  modelClothBolt(),
  modelJewelTray(),
  modelScrollPile(),
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

console.log(`fantasy kit1 shop wares: ${models.length} models\n${summary}`);
