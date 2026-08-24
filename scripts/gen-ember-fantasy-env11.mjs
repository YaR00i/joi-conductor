#!/usr/bin/env node
/**
 * Env11 market / plaza street dressing for Ember.
 * Scaled for ~32-voxel-tall chibi people (explore camera 45–60°).
 *
 * Run: node scripts/gen-ember-fantasy-env11.mjs
 *
 * Writes only the eight vox_fan_* ids listed below.
 * Does not touch env1–10, existing vox_fan_*, vox_chr_*, vox_vil_*,
 * registry.json, maps, or src.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ember = path.join(root, "content", "ember");
const V = 16;

const TAGS = ["fantasy", "outdoor", "town", "market"];
const TAGS_WATER = ["fantasy", "outdoor", "town", "market", "water"];

function hash32(n) {
  let x = (n | 0) * 1597334677;
  x = (x ^ (x >>> 16)) >>> 0;
  return x;
}

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

function inBall(x, y, z, cx, cy, cz, r) {
  const dx = x + 0.5 - cx;
  const dy = y + 0.5 - cy;
  const dz = z + 0.5 - cz;
  return dx * dx + dy * dy + dz * dz <= r * r;
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

function post(g, x0, y0, z0, x1, y1, z1, pal, core) {
  box(g, x0, y0, z0, x1, y1, z1, pal);
  if (core) box(g, x0 + 1, y0, z0 + 1, x1 - 1, y1, z1 - 1, core);
}

/**
 * Open market stall 2×1: four posts, front counter, striped awning.
 * Interior stays empty so it reads as a stall, not a house or bar.
 */
function modelStall() {
  const h = 26;
  const sx = V * 2;
  const g = emptyGrid(sx, h, V);

  post(g, 1, 0, 1, 4, 22, 4, 1, 2);
  post(g, 28, 0, 1, 31, 22, 4, 1, 2);
  post(g, 1, 0, 12, 4, 21, 15, 1, 2);
  post(g, 28, 0, 12, 31, 21, 15, 1, 2);

  box(g, 1, 20, 1, 31, 22, 4, 2);
  box(g, 1, 19, 12, 31, 21, 15, 2);
  box(g, 1, 20, 3, 4, 22, 13, 1);
  box(g, 28, 20, 3, 31, 22, 13, 1);

  box(g, 3, 0, 1, 8, 6, 3, 2);
  box(g, 3, 5, 1, 10, 7, 4, 3);
  box(g, 24, 0, 1, 29, 5, 3, 1);

  post(g, 5, 0, 11, 8, 10, 14, 1, 2);
  post(g, 24, 0, 11, 27, 10, 14, 1, 2);
  box(g, 4, 9, 10, 28, 11, 15, 2);
  box(g, 3, 11, 10, 29, 14, 15, 3);
  for (let x = 3; x < 29; x++) {
    box(g, x, 13, 10, x + 1, 14, 15, x % 3 === 1 ? 2 : 3);
  }
  box(g, 3, 11, 10, 29, 12, 11, 1);
  box(g, 3, 11, 14, 29, 12, 15, 1);

  box(g, 8, 14, 11, 13, 17, 14, 8);
  box(g, 9, 15, 12, 12, 17, 14, 7);
  box(g, 20, 14, 11, 24, 16, 14, 2);

  for (let z = 0; z < V; z++) {
    const y0 = 22 - Math.floor(z / 5);
    const y1 = y0 + 3;
    for (let x = 0; x < sx; x++) {
      if (z < 1 && (x < 1 || x > 30)) continue;
      const stripe = Math.floor((x + (z < 12 ? 0 : 1)) / 4) % 2 === 0 ? 4 : 5;
      const under = y0;
      box(g, x, under, z, x + 1, y1, z + 1, stripe);
      if (z >= 13 && (x + z) % 4 === 0) {
        box(g, x, y0 - 2, z, x + 1, y0, z + 1, stripe);
      }
    }
  }
  box(g, 0, 21, 0, 32, 23, 2, 6);
  box(g, 0, 19, 14, 32, 21, 16, 6);

  return finishModel(g, {
    id: "vox_fan_stall",
    nameRu: "Прилавок",
    tags: TAGS,
    sizeBlocks: { x: 2, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5c3c22",
      "#8a5c34",
      "#b02838",
      "#e8d8b0",
      "#7a1c28",
      "#c04038",
      "#2a7a38",
    ],
    material: "wood",
    physical: true,
  });
}

/** Woven baskets of fruit and veg on a low market board. Not a trunk, not ham. */
function modelProduce() {
  const h = 10;
  const g = emptyGrid(V, h, V);
  box(g, 1, 0, 3, 15, 2, 13, 1);
  for (let x = 1; x < 15; x++) {
    box(g, x, 1, 3, x + 1, 2, 13, x % 3 === 1 ? 2 : 1);
  }
  box(g, 1, 0, 3, 15, 1, 4, 2);
  box(g, 1, 0, 12, 15, 1, 13, 2);

  function basket(cx, cz, fruit, leaf, moundH) {
    for (let y = 2; y < 6; y++) {
      const t = (y - 2) / 3;
      const r = 2.85 + t * 0.15;
      const rIn = y >= 3 ? 1.85 : 0;
      for (let z = 1; z < 15; z++) {
        for (let x = 0; x < 16; x++) {
          if (!inDisk(x, z, cx, cz, r)) continue;
          if (rIn && inDisk(x, z, cx, cz, rIn)) {
            if (y === 3) setV(g, x, y, z, 4);
            continue;
          }
          setV(g, x, y, z, y === 2 || (x + z) % 2 === 0 ? 3 : 4);
        }
      }
    }
    for (let y = 4; y < 4 + moundH; y++) {
      const t = (y - 4) / Math.max(1, moundH - 1);
      const r = 2.15 - t * 0.85;
      for (let z = 1; z < 15; z++) {
        for (let x = 0; x < 16; x++) {
          if (!inDisk(x, z, cx, cz, r)) continue;
          const n = hash32(x * 13 + y * 9 + z * 5 + fruit * 3) % 5;
          setV(g, x, y, z, n === 0 ? leaf : fruit);
        }
      }
    }
  }

  basket(4.2, 7.5, 5, 8, 5);
  basket(8.2, 8.2, 6, 8, 4);
  basket(12.0, 7.2, 7, 8, 5);
  box(g, 7, 6, 6, 10, 9, 8, 6);
  box(g, 8, 8, 6, 9, 10, 7, 8);
  box(g, 3, 7, 9, 6, 9, 11, 5);
  box(g, 11, 7, 9, 14, 8, 12, 7);

  return finishModel(g, {
    id: "vox_fan_produce",
    nameRu: "Корзины",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5c3c22",
      "#3a2818",
      "#c4a060",
      "#8a6a38",
      "#c02830",
      "#e07028",
      "#d8b040",
      "#2a7a38",
    ],
    material: "wood",
    physical: true,
  });
}

/** Plaza fountain: stone basin, central spout, small water. Not the well. */
function modelFountain() {
  const h = 18;
  const g = emptyGrid(V, h, V);
  const cx = 8;
  const cz = 8;

  box(g, 3, 0, 3, 13, 2, 13, 1);
  box(g, 4, 0, 4, 12, 1, 12, 4);
  for (let y = 1; y < 6; y++) {
    const r = y < 2 ? 7.3 : 6.85;
    const rIn = y >= 3 ? 5.15 : 0;
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        if (!inDisk(x, z, cx, cz, r)) continue;
        if (rIn && inDisk(x, z, cx, cz, rIn)) {
          if (y === 3) setV(g, x, y, z, 5);
          else if (y === 4) {
            const foam = inDisk(x, z, cx, cz, 2.2);
            setV(g, x, y, z, foam ? 7 : 6);
          }
          continue;
        }
        const n = hash32(x * 11 + y * 7 + z * 3) % 6;
        setV(g, x, y, z, n === 0 ? 3 : n === 1 ? 1 : 2);
      }
    }
  }
  for (let z = 1; z < 15; z++) {
    for (let x = 1; x < 15; x++) {
      if (!inDisk(x, z, cx, cz, 7.0) || inDisk(x, z, cx, cz, 5.6)) continue;
      setV(g, x, 5, z, 3);
    }
  }

  for (let y = 2; y < 12; y++) {
    const r = y < 4 ? 2.35 : 1.85;
    for (let z = 5; z < 12; z++) {
      for (let x = 5; x < 12; x++) {
        if (!inDisk(x, z, cx, cz, r)) continue;
        setV(g, x, y, z, y % 4 === 0 ? 3 : 2);
      }
    }
  }
  box(g, 6, 8, 6, 10, 9, 10, 3);
  for (let y = 11; y < 14; y++) {
    const r = y === 11 ? 2.6 : 2.2;
    const rIn = y >= 12 ? 1.15 : 0;
    for (let z = 5; z < 12; z++) {
      for (let x = 5; x < 12; x++) {
        if (!inDisk(x, z, cx, cz, r)) continue;
        if (rIn && inDisk(x, z, cx, cz, rIn)) {
          setV(g, x, y, z, 6);
          continue;
        }
        setV(g, x, y, z, 3);
      }
    }
  }

  box(g, 7, 13, 7, 9, 17, 9, 7);
  box(g, 7, 16, 7, 9, 18, 9, 6);
  for (let y = 6; y < 14; y++) {
    if (y % 2 === 0) {
      box(g, 6, y, 7, 7, y + 2, 9, 6);
      box(g, 9, y, 7, 10, y + 2, 9, 6);
    }
  }
  box(g, 4, 4, 7, 5, 6, 9, 7);
  box(g, 11, 4, 7, 12, 6, 9, 7);
  box(g, 7, 4, 4, 9, 6, 5, 7);
  box(g, 7, 4, 11, 9, 6, 12, 7);

  return finishModel(g, {
    id: "vox_fan_fountain",
    nameRu: "Фонтан",
    tags: TAGS_WATER,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a4640",
      "#7a7670",
      "#b0aaa0",
      "#3a3834",
      "#2a5a78",
      "#4a98b8",
      "#d0ecf4",
    ],
    material: "stone",
    physical: true,
  });
}

/** Sitting stone lion on a stepped plinth. Not the shrine, not a character. */
function modelStatue() {
  const h = 26;
  const g = emptyGrid(V, h, V);

  box(g, 2, 0, 2, 14, 3, 14, 1);
  box(g, 3, 3, 3, 13, 6, 13, 2);
  box(g, 4, 6, 4, 12, 8, 14, 3);
  box(g, 5, 3, 12, 11, 5, 14, 5);
  box(g, 6, 4, 13, 10, 5, 14, 5);
  box(g, 3, 0, 3, 13, 1, 13, 6);

  for (let y = 8; y < 18; y++) {
    const t = (y - 8) / 9;
    const rx = 4.3 - t * 0.4;
    const rz = 4.0 - t * 0.15;
    for (let z = 2; z < 13; z++) {
      for (let x = 3; x < 13; x++) {
        const nx = (x + 0.5 - 8) / rx;
        const nz = (z + 0.5 - 7.2) / rz;
        if (nx * nx + nz * nz > 1.02) continue;
        const n = hash32(x * 9 + y * 5 + z * 3) % 5;
        setV(g, x, y, z, n === 0 ? 2 : 4);
      }
    }
  }

  post(g, 4, 8, 10, 7, 16, 15, 4, 2);
  post(g, 9, 8, 10, 12, 16, 15, 4, 2);
  box(g, 5, 14, 9, 11, 18, 14, 4);
  box(g, 6, 16, 10, 10, 19, 14, 3);

  for (let y = 16; y < 24; y++) {
    for (let z = 8; z < 16; z++) {
      for (let x = 3; x < 13; x++) {
        if (!inBall(x, y, z, 8, 19.2, 11.6, 3.55)) continue;
        const mane = !inBall(x, y, z, 8, 19.4, 12.1, 2.45);
        const n = hash32(x * 7 + y * 11 + z) % 4;
        setV(g, x, y, z, mane ? (n === 0 ? 2 : 4) : 3);
      }
    }
  }
  box(g, 6, 18, 13, 10, 22, 16, 3);
  box(g, 7, 19, 14, 9, 21, 16, 3);
  box(g, 6, 19, 13, 7, 21, 15, 6);
  box(g, 9, 19, 13, 10, 21, 15, 6);
  box(g, 5, 22, 10, 7, 26, 13, 4);
  box(g, 9, 22, 10, 11, 26, 13, 4);
  box(g, 7, 17, 12, 9, 19, 15, 1);

  for (let i = 0; i < 7; i++) {
    const x0 = 11 + Math.min(i, 3);
    const y0 = 11 + i;
    const z0 = 2 + Math.floor(i / 2);
    box(g, x0, y0, z0, x0 + 2, y0 + 2, z0 + 2, i > 3 ? 3 : 4);
  }

  return finishModel(g, {
    id: "vox_fan_statue",
    nameRu: "Статуя",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a3834",
      "#6a665c",
      "#c4bca8",
      "#8a8478",
      "#c4a060",
      "#2a2824",
    ],
    material: "stone",
    physical: true,
  });
}

/** Hitching post with a thick rope loop. 1×1, not a fence segment. */
function modelHitch() {
  const h = 16;
  const g = emptyGrid(V, h, V);
  box(g, 2, 0, 4, 14, 2, 12, 1);
  box(g, 3, 1, 5, 13, 2, 11, 7);

  post(g, 3, 2, 6, 6, 15, 10, 2, 3);
  post(g, 10, 2, 6, 13, 15, 10, 2, 3);
  box(g, 3, 13, 6, 13, 16, 10, 3);
  box(g, 3, 14, 7, 13, 16, 9, 2);
  box(g, 2, 13, 6, 4, 16, 10, 2);
  box(g, 12, 13, 6, 14, 16, 10, 2);

  box(g, 6, 4, 7, 10, 6, 9, 4);
  box(g, 5, 6, 7, 7, 13, 9, 4);
  box(g, 9, 6, 7, 11, 13, 9, 4);
  box(g, 6, 4, 7, 7, 6, 9, 5);
  box(g, 9, 4, 7, 10, 6, 9, 5);
  box(g, 7, 5, 8, 9, 6, 10, 5);

  box(g, 12, 8, 8, 15, 11, 11, 6);
  box(g, 13, 9, 9, 15, 10, 11, 0);
  box(g, 4, 8, 9, 6, 10, 12, 6);

  return finishModel(g, {
    id: "vox_fan_hitch",
    nameRu: "Коновязь",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a4038",
      "#3a2818",
      "#6a4428",
      "#c4a060",
      "#8a6a38",
      "#6a6a70",
      "#5a5448",
    ],
    material: "wood",
    physical: true,
  });
}

/** Clothes on a line between two posts. Not folded linens, not herb bunches. */
function modelLaundry() {
  const h = 22;
  const g = emptyGrid(V, h, V);
  post(g, 0, 0, 6, 3, 21, 10, 1, 2);
  post(g, 13, 0, 6, 16, 21, 10, 1, 2);
  box(g, 0, 0, 6, 3, 2, 10, 2);
  box(g, 13, 0, 6, 16, 2, 10, 2);

  box(g, 1, 19, 7, 15, 21, 9, 3);
  box(g, 2, 20, 7, 14, 21, 9, 1);

  box(g, 2, 18, 7, 4, 20, 9, 3);
  box(g, 7, 18, 7, 9, 20, 9, 3);
  box(g, 12, 18, 7, 14, 20, 9, 3);

  box(g, 2, 9, 5, 6, 19, 11, 4);
  box(g, 1, 16, 5, 7, 19, 11, 4);
  box(g, 3, 10, 5, 5, 17, 6, 8);
  box(g, 3, 10, 10, 5, 17, 11, 8);

  box(g, 7, 8, 6, 10, 18, 10, 5);
  box(g, 7, 8, 6, 8, 14, 10, 5);
  box(g, 9, 8, 6, 10, 14, 10, 5);
  box(g, 8, 14, 6, 9, 18, 10, 8);
  box(g, 7, 8, 6, 10, 9, 7, 8);

  box(g, 11, 11, 5, 15, 19, 11, 6);
  box(g, 12, 12, 5, 14, 18, 6, 7);
  box(g, 11, 11, 9, 15, 13, 11, 7);
  box(g, 13, 15, 5, 15, 19, 7, 6);

  return finishModel(g, {
    id: "vox_fan_laundry",
    nameRu: "Сушка",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5c3c22",
      "#8a7a50",
      "#e8e0d0",
      "#3a5a98",
      "#c05070",
      "#8a3a50",
      "#c4b8a0",
    ],
    material: "cloth",
    physical: false,
  });
}

/** Two–three slatted market crates, stacked and offset. Not crate_old. */
function modelCrateStack() {
  const h = 15;
  const g = emptyGrid(V, h, V);

  function crate(x0, y0, z0, x1, y1, z1, openTop) {
    box(g, x0, y0, z0, x1, y0 + 1, z1, 2);
    box(g, x0, y0, z0, x0 + 2, y1, z0 + 2, 1);
    box(g, x1 - 2, y0, z0, x1, y1, z0 + 2, 1);
    box(g, x0, y0, z1 - 2, x0 + 2, y1, z1, 1);
    box(g, x1 - 2, y0, z1 - 2, x1, y1, z1, 1);
    const slatTop = openTop ? y1 : y1 - 1;
    for (let y = y0 + 2; y < slatTop; y += 2) {
      box(g, x0, y, z0, x1, y + 1, z0 + 2, 3);
      box(g, x0, y, z1 - 2, x1, y + 1, z1, 3);
      box(g, x0, y, z0, x0 + 2, y + 1, z1, 3);
      box(g, x1 - 2, y, z0, x1, y + 1, z1, 3);
    }
    if (!openTop) box(g, x0, y1 - 1, z0, x1, y1, z1, 1);
    const midY = y0 + Math.floor((y1 - y0) / 2);
    box(g, x0 - 1, midY, z0 + 2, x0, midY + 2, z1 - 2, 4);
    box(g, x1, midY, z0 + 2, x1 + 1, midY + 2, z1 - 2, 4);
  }

  crate(1, 0, 3, 12, 6, 14, false);
  crate(4, 6, 2, 15, 11, 12, false);
  crate(2, 11, 4, 12, 15, 14, true);
  box(g, 4, 13, 6, 10, 15, 12, 5);
  box(g, 5, 14, 7, 8, 15, 10, 6);
  box(g, 8, 14, 8, 11, 15, 12, 5);

  return finishModel(g, {
    id: "vox_fan_crate_stack",
    nameRu: "Стопка ящиков",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#c49a58",
      "#8a6a38",
      "#5c4420",
      "#8a7a50",
      "#e07028",
      "#2a7a38",
    ],
    material: "wood",
    physical: true,
  });
}

/** Street / window flower box. Rectangular planter, not a ground clump. */
function modelFlowerbox() {
  const h = 10;
  const g = emptyGrid(V, h, V);

  box(g, 1, 0, 5, 15, 5, 12, 1);
  box(g, 2, 1, 6, 14, 5, 11, 2);
  box(g, 2, 3, 6, 14, 5, 11, 3);
  box(g, 1, 0, 5, 15, 1, 12, 2);
  box(g, 4, 1, 4, 6, 4, 6, 1);
  box(g, 10, 1, 4, 12, 4, 6, 1);

  for (let z = 6; z < 11; z++) {
    for (let x = 2; x < 14; x++) {
      const n = hash32(x * 11 + z * 5) % 4;
      setV(g, x, 4, z, n === 0 ? 5 : 3);
    }
  }

  const clumps = [
    { cx: 4.2, cz: 8.2, r: 2.6, h: 5, bloom: 6 },
    { cx: 8.0, cz: 8.6, r: 2.8, h: 6, bloom: 7 },
    { cx: 12.0, cz: 8.0, r: 2.5, h: 5, bloom: 8 },
  ];
  for (const c of clumps) {
    for (let y = 4; y < 4 + c.h; y++) {
      const t = (y - 4) / c.h;
      const r = c.r * (1 - t * 0.45);
      for (let z = 4; z < 14; z++) {
        for (let x = 1; x < 15; x++) {
          if (!inDisk(x, z, c.cx, c.cz, r)) continue;
          const n = hash32(x * 9 + y * 13 + z * 3 + c.bloom) % 6;
          let pal = n === 0 ? 5 : 4;
          if (t > 0.45 && n === 1) pal = c.bloom;
          if (t > 0.65 && n === 2) pal = c.bloom;
          setV(g, x, y, z, pal);
        }
      }
    }
  }
  box(g, 3, 2, 11, 6, 5, 14, 4);
  box(g, 9, 2, 11, 13, 4, 14, 5);
  box(g, 4, 7, 7, 6, 9, 9, 6);
  box(g, 7, 8, 8, 10, 10, 10, 7);
  box(g, 11, 7, 7, 13, 9, 9, 8);

  return finishModel(g, {
    id: "vox_fan_flowerbox",
    nameRu: "Цветочный ящик",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5c3c22",
      "#3a2818",
      "#4a3420",
      "#2a6a30",
      "#1c4a20",
      "#c02838",
      "#e8c040",
      "#7a50b0",
    ],
    material: "wood",
    physical: false,
  });
}

const models = [
  modelStall(),
  modelProduce(),
  modelFountain(),
  modelStatue(),
  modelHitch(),
  modelLaundry(),
  modelCrateStack(),
  modelFlowerbox(),
];

for (const model of models) writeModel(model);

const summary = models
  .map((m) => {
    const solids = m.voxels.filter((v) => v > 0).length;
    const blocks = `${m.sizeBlocks.x}×${m.sizeBlocks.y}×${m.sizeBlocks.z}`;
    const extra = m.physical === false ? "  nophys" : "";
    return `${m.id}  ${m.nameRu}  ${m.heightVoxels}h  ${blocks}  ${solids}vox  tags=${(m.tags ?? []).join(",")}${extra}`;
  })
  .join("\n");

console.log(`fantasy env11 market plaza: ${models.length} models\n${summary}`);
