#!/usr/bin/env node
/**
 * Env7 more interior furniture for Ember.
 * Scaled for ~32-voxel-tall chibi people (explore camera 45–60°).
 *
 * Run: node scripts/gen-ember-fantasy-env7.mjs
 *
 * Writes only the eight vox_fan_* ids listed below.
 * Does not touch env1–6, vox_chr_*, registry.json, maps, or src.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ember = path.join(root, "content", "ember");
const V = 16;

const TAGS = ["fantasy", "indoor", "furniture"];
const TAGS_LIGHT = ["fantasy", "indoor", "furniture", "light"];

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

function lightFlags(range, strength) {
  return {
    emissiveCastsLight: true,
    emissiveLightShadows: false,
    emissiveLightRange: range,
    emissiveStrength: strength,
    emissiveTorchFlicker: true,
    emissiveSuppressHostShadow: true,
  };
}

/** Writing desk, top ~13 vx, knee space, one drawer on +Z. */
function modelDesk() {
  const h = 14;
  const g = emptyGrid(V, h, V);
  post(g, 1, 0, 2, 4, 11, 5, 1, 5);
  post(g, 12, 0, 2, 15, 11, 5, 1, 5);
  post(g, 1, 0, 11, 4, 11, 14, 1, 5);
  post(g, 12, 0, 11, 15, 11, 14, 1, 5);
  box(g, 3, 3, 3, 13, 5, 5, 2);
  box(g, 3, 3, 11, 13, 5, 13, 2);

  box(g, 0, 11, 1, 16, 14, 15, 3);
  for (let x = 0; x < 16; x++) {
    box(g, x, 13, 1, x + 1, 14, 15, x % 3 === 2 ? 6 : 4);
  }
  box(g, 0, 11, 1, 16, 12, 2, 2);
  box(g, 0, 11, 14, 16, 12, 15, 2);

  box(g, 5, 8, 13, 11, 11, 15, 3);
  box(g, 6, 9, 14, 10, 10, 15, 2);
  box(g, 7, 9, 14, 9, 10, 15, 7);

  box(g, 12, 12, 12, 15, 14, 15, 6);
  setV(g, 13, 13, 13, 7);

  return finishModel(g, {
    id: "vox_fan_desk",
    nameRu: "Конторка",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3420",
      "#2e2216",
      "#7a5834",
      "#b88850",
      "#1c1410",
      "#6a4428",
      "#c4a060",
    ],
    material: "wood",
    physical: true,
  });
}

/** Small bedside cabinet with one drawer. */
function modelNightstand() {
  const h = 12;
  const g = emptyGrid(V, h, V);
  box(g, 3, 0, 3, 13, 2, 13, 1);
  post(g, 3, 0, 3, 6, 8, 6, 1, 5);
  post(g, 10, 0, 3, 13, 8, 6, 1, 5);
  post(g, 3, 0, 10, 6, 8, 13, 1, 5);
  post(g, 10, 0, 10, 13, 8, 13, 1, 5);

  box(g, 3, 8, 3, 13, 11, 13, 2);
  box(g, 4, 6, 4, 12, 8, 13, 3);
  box(g, 5, 6, 12, 11, 8, 14, 4);
  box(g, 7, 6, 13, 9, 7, 14, 6);
  box(g, 3, 10, 3, 13, 12, 13, 4);
  box(g, 4, 11, 4, 12, 12, 12, 7);
  box(g, 10, 11, 10, 12, 12, 12, 6);

  return finishModel(g, {
    id: "vox_fan_nightstand",
    nameRu: "Тумбочка",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3e2a18",
      "#5c3c22",
      "#8a5c30",
      "#c08a48",
      "#241810",
      "#d8c070",
      "#6a4a28",
    ],
    material: "wood",
    physical: true,
  });
}

/** Closed travel trunk: rounded lid, straps, lock — not a crate. */
function modelTrunk() {
  const h = 10;
  const g = emptyGrid(V, h, V);
  box(g, 1, 0, 3, 15, 6, 13, 1);
  box(g, 2, 1, 4, 14, 6, 12, 2);
  box(g, 1, 0, 3, 15, 2, 13, 3);

  box(g, 1, 6, 3, 15, 8, 13, 2);
  box(g, 2, 8, 4, 14, 9, 12, 4);
  box(g, 3, 9, 5, 13, 10, 11, 4);

  box(g, 4, 1, 3, 6, 9, 13, 5);
  box(g, 10, 1, 3, 12, 9, 13, 5);
  box(g, 4, 3, 3, 6, 5, 13, 6);
  box(g, 10, 3, 3, 12, 5, 13, 6);

  box(g, 6, 3, 12, 10, 6, 14, 6);
  box(g, 7, 4, 13, 9, 5, 14, 7);
  box(g, 1, 6, 3, 15, 7, 4, 3);
  box(g, 1, 6, 12, 15, 7, 13, 3);

  return finishModel(g, {
    id: "vox_fan_trunk",
    nameRu: "Сундук",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5a3c1c",
      "#7a5428",
      "#3a2814",
      "#9a6a34",
      "#4a4030",
      "#8a7a50",
      "#d8c070",
    ],
    material: "wood",
    physical: true,
  });
}

/** Washbasin on a stand, pitcher in the bowl. */
function modelBasin() {
  const h = 14;
  const g = emptyGrid(V, h, V);
  post(g, 3, 0, 4, 6, 8, 7, 1, 5);
  post(g, 10, 0, 4, 13, 8, 7, 1, 5);
  post(g, 3, 0, 9, 6, 8, 12, 1, 5);
  post(g, 10, 0, 9, 13, 8, 12, 1, 5);
  box(g, 5, 3, 6, 11, 5, 10, 2);
  box(g, 3, 8, 4, 13, 10, 12, 3);

  for (let y = 9; y < 13; y++) {
    const r = y === 9 ? 6.4 : y === 12 ? 5.2 : 6.0;
    const rIn = y >= 11 ? 3.6 : 0;
    for (let z = 2; z < 14; z++) {
      for (let x = 2; x < 14; x++) {
        if (!inDisk(x, z, 8, 8, r)) continue;
        if (rIn && inDisk(x, z, 8, 8, rIn)) {
          setV(g, x, y, z, y === 11 ? 6 : 7);
          continue;
        }
        setV(g, x, y, z, y === 9 ? 4 : 4);
      }
    }
  }

  box(g, 10, 10, 9, 14, 14, 13, 4);
  box(g, 11, 11, 10, 14, 14, 12, 8);
  box(g, 13, 12, 10, 15, 14, 12, 4);
  box(g, 11, 13, 11, 13, 14, 13, 4);

  return finishModel(g, {
    id: "vox_fan_basin",
    nameRu: "Умывальник",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3420",
      "#2e2216",
      "#7a5834",
      "#d8d0c4",
      "#1c1410",
      "#6a90a8",
      "#8ab0c4",
      "#b8b0a4",
    ],
    material: "wood",
    physical: true,
  });
}

/** Iron cook range. Small fire visible from +Z, no cube shadows. */
function modelStove() {
  const h = 14;
  const g = emptyGrid(V, h, V);
  box(g, 2, 0, 2, 14, 2, 14, 1);
  box(g, 2, 2, 2, 14, 10, 13, 2);
  box(g, 3, 2, 3, 13, 10, 12, 1);

  box(g, 4, 3, 10, 8, 8, 14, 0);
  box(g, 4, 3, 4, 8, 8, 6, 3);
  box(g, 5, 3, 6, 8, 6, 12, 5, 180);
  box(g, 5, 4, 8, 7, 7, 12, 6, 230);
  box(g, 6, 5, 9, 7, 8, 12, 7, 255);
  box(g, 4, 3, 10, 8, 4, 14, 1);
  box(g, 4, 7, 10, 8, 8, 14, 4);

  box(g, 9, 3, 11, 13, 8, 14, 4);
  box(g, 10, 4, 12, 12, 7, 14, 3);
  box(g, 10, 5, 13, 12, 6, 14, 8);

  box(g, 2, 10, 2, 14, 12, 14, 3);
  for (const [cx, cz] of [
    [6, 6],
    [10, 6],
    [6, 10],
    [10, 10],
  ]) {
    for (let z = cz - 2; z < cz + 2; z++) {
      for (let x = cx - 2; x < cx + 2; x++) {
        if (!inDisk(x, z, cx, cz, 1.8)) continue;
        setV(g, x, 11, z, inDisk(x, z, cx, cz, 0.8) ? 3 : 4);
      }
    }
  }
  box(g, 11, 12, 3, 14, 14, 6, 1);
  box(g, 12, 12, 4, 13, 14, 5, 3);

  return finishModel(g, {
    id: "vox_fan_stove",
    nameRu: "Плита",
    tags: TAGS_LIGHT,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#2a2a2c",
      "#3a3a40",
      "#1a1a1c",
      "#5a5a60",
      "#c07028",
      "#e89830",
      "#ffe08a",
      "#8a7a50",
    ],
    material: "metal",
    physical: true,
    ...lightFlags(2.2, 0.7),
  });
}

/** Table candelabra: three thick arms, candle flames, no cube shadows. */
function modelCandelabra() {
  const h = 12;
  const g = emptyGrid(V, h, V);
  box(g, 5, 0, 5, 11, 2, 11, 1);
  box(g, 6, 1, 6, 10, 2, 10, 2);
  box(g, 7, 2, 7, 9, 5, 9, 1);

  box(g, 2, 4, 7, 14, 6, 9, 2);
  box(g, 2, 5, 7, 4, 8, 9, 1);
  box(g, 12, 5, 7, 14, 8, 9, 1);
  box(g, 7, 5, 7, 9, 8, 9, 1);

  function candle(x0, z0) {
    box(g, x0, 8, z0, x0 + 2, 10, z0 + 2, 3);
    box(g, x0, 10, z0, x0 + 2, 12, z0 + 2, 4, 200);
    setV(g, x0, 11, z0, 5, 255);
  }
  candle(2, 7);
  candle(7, 7);
  candle(12, 7);

  return finishModel(g, {
    id: "vox_fan_candelabra",
    nameRu: "Канделябр",
    tags: TAGS_LIGHT,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5a5040",
      "#8a7a58",
      "#e8d8b0",
      "#e89830",
      "#ffe08a",
    ],
    material: "metal",
    physical: true,
    ...lightFlags(2.0, 0.65),
  });
}

/** Standing clock ~22 vx, readable +Z face, peaked hood. */
function modelClock() {
  const h = 22;
  const g = emptyGrid(V, h, V);
  box(g, 4, 0, 5, 12, 2, 12, 1);
  box(g, 5, 2, 6, 11, 12, 12, 2);
  box(g, 6, 3, 7, 10, 11, 11, 3);
  box(g, 5, 12, 5, 11, 20, 12, 2);
  box(g, 4, 19, 4, 12, 21, 13, 1);
  box(g, 6, 21, 6, 10, 22, 11, 4);

  const cx = 8;
  const cy = 16;
  for (let y = 13; y < 20; y++) {
    for (let x = 5; x < 11; x++) {
      if (!inDisk(x, y, cx, cy, 3.4)) continue;
      const rim = !inDisk(x, y, cx, cy, 2.6);
      setV(g, x, y, 11, rim ? 1 : 5);
      setV(g, x, y, 12, rim ? 4 : 5);
    }
  }
  setV(g, 8, 18, 12, 6);
  setV(g, 8, 17, 12, 6);
  setV(g, 8, 16, 12, 1);
  setV(g, 9, 16, 12, 6);
  setV(g, 10, 16, 12, 6);
  setV(g, 8, 19, 12, 1);
  setV(g, 5, 16, 12, 1);
  setV(g, 11, 16, 12, 1);
  setV(g, 8, 13, 12, 1);

  box(g, 7, 5, 11, 9, 10, 12, 7);
  box(g, 7, 6, 11, 9, 7, 12, 4);

  return finishModel(g, {
    id: "vox_fan_clock",
    nameRu: "Часы",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5c3c22",
      "#2a1c10",
      "#c4a060",
      "#e8dcc4",
      "#2a2420",
      "#8a7a50",
    ],
    material: "wood",
    physical: true,
  });
}

/** Kitchen counter 2×1, butcher-block top, cabinet doors. */
function modelCounter() {
  const h = 15;
  const sx = V * 2;
  const g = emptyGrid(sx, h, V);
  box(g, 1, 0, 2, 31, 2, 14, 1);
  box(g, 1, 2, 2, 31, 13, 14, 2);
  box(g, 2, 3, 3, 30, 12, 13, 3);

  box(g, 3, 4, 12, 10, 11, 15, 4);
  box(g, 11, 4, 12, 15, 11, 15, 1);
  box(g, 16, 4, 12, 23, 11, 15, 4);
  box(g, 24, 4, 12, 29, 11, 15, 4);
  box(g, 3, 4, 12, 10, 5, 15, 1);
  box(g, 16, 4, 12, 29, 5, 15, 1);
  box(g, 6, 7, 13, 7, 8, 15, 6);
  box(g, 19, 7, 13, 20, 8, 15, 6);
  box(g, 26, 7, 13, 27, 8, 15, 6);

  box(g, 0, 13, 1, 32, 15, 15, 5);
  for (let z = 1; z < 15; z++) {
    for (let x = 0; x < 32; x++) {
      const n = hash32(x * 17 + z * 9) % 4;
      setV(g, x, 14, z, n === 0 ? 7 : n === 1 ? 8 : 5);
    }
  }
  box(g, 0, 13, 1, 32, 14, 2, 3);
  box(g, 0, 13, 14, 32, 14, 15, 3);

  return finishModel(g, {
    id: "vox_fan_counter",
    nameRu: "Столешница",
    tags: TAGS,
    sizeBlocks: { x: 2, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5c3c22",
      "#2a1c10",
      "#8a5c34",
      "#c49a58",
      "#d8c070",
      "#8a6a38",
      "#e0b870",
    ],
    material: "wood",
    physical: true,
  });
}

const models = [
  modelDesk(),
  modelNightstand(),
  modelTrunk(),
  modelBasin(),
  modelStove(),
  modelCandelabra(),
  modelClock(),
  modelCounter(),
];

for (const model of models) writeModel(model);

const summary = models
  .map((m) => {
    const solids = m.voxels.filter((v) => v > 0).length;
    const blocks = `${m.sizeBlocks.x}×${m.sizeBlocks.y}×${m.sizeBlocks.z}`;
    return `${m.id}  ${m.nameRu}  ${m.heightVoxels}h  ${blocks}  ${solids}vox  tags=${(m.tags ?? []).join(",")}`;
  })
  .join("\n");

console.log(`fantasy env7 interior: ${models.length} models\n${summary}`);
