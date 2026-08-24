#!/usr/bin/env node
/**
 * Env6 fantasy interior furniture for Ember.
 * Scaled for ~32-voxel-tall chibi people (explore camera 45–60°).
 *
 * Run: node scripts/gen-ember-fantasy-env6.mjs
 *
 * Writes only the eight vox_fan_* ids listed below.
 * Does not touch Wave 1 / env2–5, vox_chr_*, registry.json, maps, or src.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ember = path.join(root, "content", "ember");
const V = 16;

const TAGS = ["fantasy", "indoor", "outdoor", "furniture"];

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

/** Wooden dining table. Top at waist (~14 vx) for a 32 vx chibi. */
function modelTable() {
  const h = 16;
  const g = emptyGrid(V, h, V);
  post(g, 1, 0, 1, 4, 13, 4, 1, 4);
  post(g, 12, 0, 1, 15, 13, 4, 1, 4);
  post(g, 1, 0, 12, 4, 13, 15, 1, 4);
  post(g, 12, 0, 12, 15, 13, 15, 1, 4);
  box(g, 3, 4, 2, 13, 6, 4, 2);
  box(g, 3, 4, 12, 13, 6, 14, 2);
  box(g, 2, 4, 3, 4, 6, 13, 2);
  box(g, 12, 4, 3, 14, 6, 13, 2);

  box(g, 0, 13, 0, 16, 16, 16, 3);
  for (let x = 0; x < 16; x++) {
    const plank = x % 4 === 3 ? 6 : x % 2 === 0 ? 5 : 3;
    box(g, x, 15, 0, x + 1, 16, 16, plank);
  }
  box(g, 0, 13, 0, 16, 14, 1, 2);
  box(g, 0, 13, 15, 16, 14, 16, 2);
  box(g, 0, 13, 0, 1, 14, 16, 2);
  box(g, 15, 13, 0, 16, 14, 16, 2);

  return finishModel(g, {
    id: "vox_fan_table",
    nameRu: "Стол",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5a3c20",
      "#3e2a18",
      "#8a5c30",
      "#2a1c10",
      "#c08a48",
      "#6a4424",
    ],
    material: "wood",
    physical: true,
  });
}

/** Chair: seat ~10 vx, back ~21, open under the seat, 3×3 legs. */
function modelChair() {
  const h = 21;
  const g = emptyGrid(V, h, V);
  post(g, 2, 0, 3, 5, 9, 6, 1, 5);
  post(g, 11, 0, 3, 14, 9, 6, 1, 5);
  post(g, 2, 0, 10, 5, 9, 13, 1, 5);
  post(g, 11, 0, 10, 14, 9, 13, 1, 5);
  box(g, 4, 3, 4, 12, 5, 6, 2);
  box(g, 4, 3, 10, 12, 5, 12, 2);

  box(g, 2, 9, 3, 14, 11, 13, 3);
  box(g, 3, 10, 4, 13, 11, 12, 4);
  box(g, 2, 9, 3, 14, 10, 4, 2);
  box(g, 2, 9, 12, 14, 10, 13, 2);

  box(g, 2, 11, 2, 14, 21, 5, 1);
  box(g, 3, 12, 3, 13, 20, 5, 3);
  box(g, 5, 13, 2, 7, 19, 5, 0);
  box(g, 9, 13, 2, 11, 19, 5, 0);
  box(g, 2, 19, 2, 14, 21, 5, 4);
  box(g, 7, 12, 2, 9, 13, 3, 6);

  return finishModel(g, {
    id: "vox_fan_chair",
    nameRu: "Стул",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3420",
      "#2e2216",
      "#7a5834",
      "#b08850",
      "#1c1410",
      "#c4a060",
    ],
    material: "wood",
    physical: true,
  });
}

/** Backless stool, seat ~10 vx. */
function modelStool() {
  const h = 11;
  const g = emptyGrid(V, h, V);
  post(g, 3, 0, 3, 6, 8, 6, 1, 5);
  post(g, 10, 0, 3, 13, 8, 6, 1, 5);
  post(g, 3, 0, 10, 6, 8, 13, 1, 5);
  post(g, 10, 0, 10, 13, 8, 13, 1, 5);
  box(g, 5, 3, 4, 11, 5, 6, 2);
  box(g, 5, 3, 10, 11, 5, 12, 2);
  box(g, 4, 3, 5, 6, 5, 11, 2);
  box(g, 10, 3, 5, 12, 5, 11, 2);

  for (let z = 2; z < 14; z++) {
    for (let x = 2; x < 14; x++) {
      if (!inDisk(x, z, 8, 8, 6.2)) continue;
      const ring = !inDisk(x, z, 8, 8, 5.1);
      const n = hash32(x * 13 + z * 7) % 5;
      setV(g, x, 8, z, ring ? 2 : n === 0 ? 4 : 3);
      setV(g, x, 9, z, ring ? 2 : 4);
      if (inDisk(x, z, 8, 8, 5.4)) setV(g, x, 10, z, n === 1 ? 6 : 4);
    }
  }

  return finishModel(g, {
    id: "vox_fan_stool",
    nameRu: "Табурет",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5c4024",
      "#3a2818",
      "#8a6238",
      "#c49a58",
      "#241810",
      "#6a4a28",
    ],
    material: "wood",
    physical: true,
  });
}

/** Dresser-height bookshelf with a couple of book blocks. */
function modelShelf() {
  const h = 18;
  const g = emptyGrid(V, h, V);
  box(g, 1, 0, 3, 15, 2, 14, 1);
  box(g, 1, 0, 3, 3, 18, 14, 1);
  box(g, 13, 0, 3, 15, 18, 14, 1);
  box(g, 1, 0, 3, 15, 18, 5, 2);
  box(g, 1, 16, 3, 15, 18, 14, 3);

  box(g, 3, 2, 5, 13, 4, 14, 4);
  box(g, 3, 8, 5, 13, 10, 14, 4);
  box(g, 3, 14, 5, 13, 16, 14, 4);

  box(g, 3, 4, 6, 6, 8, 12, 5);
  box(g, 6, 4, 7, 8, 8, 13, 6);
  box(g, 9, 4, 6, 12, 8, 11, 7);
  box(g, 4, 10, 6, 7, 14, 12, 6);
  box(g, 8, 10, 7, 12, 14, 13, 5);
  box(g, 3, 4, 6, 6, 5, 12, 8);
  box(g, 8, 10, 7, 12, 11, 13, 8);

  return finishModel(g, {
    id: "vox_fan_shelf",
    nameRu: "Полка",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3424",
      "#322418",
      "#7a5840",
      "#c4a070",
      "#6a2430",
      "#2a4070",
      "#c07028",
      "#e8d0a0",
    ],
    material: "wood",
    physical: true,
  });
}

/** Closed short cupboard / wardrobe — below chibi crown height. */
function modelCabinet() {
  const h = 24;
  const g = emptyGrid(V, h, V);
  box(g, 2, 0, 3, 14, 2, 14, 1);
  box(g, 2, 2, 3, 14, 22, 14, 2);
  box(g, 3, 3, 4, 13, 21, 14, 3);
  box(g, 2, 22, 3, 14, 24, 14, 4);
  box(g, 1, 21, 2, 15, 23, 15, 1);

  box(g, 3, 4, 13, 8, 20, 15, 5);
  box(g, 8, 4, 13, 13, 20, 15, 5);
  box(g, 7, 4, 13, 9, 20, 14, 2);
  box(g, 3, 4, 13, 13, 5, 15, 6);
  box(g, 3, 19, 13, 13, 20, 15, 6);
  box(g, 6, 11, 14, 7, 13, 15, 7);
  box(g, 9, 11, 14, 10, 13, 15, 7);

  box(g, 2, 2, 3, 14, 3, 4, 1);
  box(g, 2, 2, 13, 14, 3, 14, 1);

  return finishModel(g, {
    id: "vox_fan_cabinet",
    nameRu: "Шкаф",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5a3c24",
      "#8a5c34",
      "#c49a58",
      "#6a4a28",
      "#2a1c10",
      "#d8c070",
    ],
    material: "wood",
    physical: true,
  });
}

/** Simple 2×1 bed: posts, mattress, rumpled blanket, pillow. */
function modelBed() {
  const h = 12;
  const sx = V * 2;
  const g = emptyGrid(sx, h, V);
  post(g, 1, 0, 1, 4, 11, 4, 1, 6);
  post(g, 28, 0, 1, 31, 11, 4, 1, 6);
  post(g, 1, 0, 12, 4, 11, 15, 1, 6);
  post(g, 28, 0, 12, 31, 11, 15, 1, 6);
  box(g, 1, 9, 1, 4, 12, 4, 5);
  box(g, 28, 9, 1, 31, 12, 4, 5);
  box(g, 1, 9, 12, 4, 12, 15, 5);
  box(g, 28, 9, 12, 31, 12, 15, 5);

  box(g, 2, 4, 2, 30, 6, 14, 2);
  box(g, 3, 5, 3, 29, 8, 13, 3);
  box(g, 3, 6, 3, 29, 8, 13, 7);

  box(g, 8, 7, 3, 29, 10, 13, 4);
  box(g, 10, 8, 4, 27, 10, 12, 8);
  box(g, 18, 9, 5, 24, 10, 11, 4);
  box(g, 22, 7, 3, 26, 9, 6, 8);

  box(g, 3, 7, 4, 8, 10, 12, 7);
  box(g, 4, 8, 5, 8, 10, 11, 3);

  box(g, 1, 4, 1, 31, 6, 3, 2);
  box(g, 1, 4, 13, 31, 6, 15, 2);

  return finishModel(g, {
    id: "vox_fan_bed",
    nameRu: "Кровать",
    tags: TAGS,
    sizeBlocks: { x: 2, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3420",
      "#322418",
      "#e8dcc4",
      "#6a3a58",
      "#c4a060",
      "#1c1410",
      "#f4eee0",
      "#8a5070",
    ],
    material: "wood",
    physical: true,
  });
}

/** Stone fireplace. Small fire glow, no cube shadows. */
function modelHearth() {
  const h = 20;
  const g = emptyGrid(V, h, V);
  box(g, 1, 0, 2, 15, 3, 14, 1);
  box(g, 2, 0, 3, 14, 2, 13, 2);
  box(g, 2, 3, 3, 14, 16, 13, 1);
  box(g, 3, 3, 4, 13, 15, 13, 2);

  box(g, 4, 3, 8, 12, 12, 14, 0);
  box(g, 4, 3, 4, 12, 12, 6, 4);
  box(g, 5, 3, 6, 11, 5, 12, 3);
  box(g, 6, 3, 7, 10, 7, 12, 5, 190);
  box(g, 7, 4, 8, 9, 9, 12, 6, 240);
  box(g, 7, 6, 9, 9, 10, 12, 7, 255);

  box(g, 1, 15, 2, 15, 17, 14, 2);
  box(g, 0, 16, 1, 16, 18, 15, 1);
  box(g, 3, 17, 4, 13, 18, 13, 8);
  box(g, 5, 17, 12, 7, 18, 14, 3);
  box(g, 6, 18, 3, 10, 20, 8, 1);
  box(g, 7, 18, 4, 9, 20, 7, 2);

  for (let z = 2; z < 14; z++) {
    for (let x = 1; x < 15; x++) {
      if (hash32(x * 19 + z * 11) % 9 === 0) setV(g, x, 1, z, 8);
    }
  }

  return finishModel(g, {
    id: "vox_fan_hearth",
    nameRu: "Очаг",
    tags: [...TAGS, "light"],
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5a5448",
      "#8a8480",
      "#3a342c",
      "#2a2420",
      "#c07028",
      "#e89830",
      "#ffe08a",
      "#6a6048",
    ],
    material: "stone",
    physical: true,
    emissiveCastsLight: true,
    emissiveLightShadows: false,
    emissiveLightRange: 2.4,
    emissiveStrength: 0.8,
    emissiveTorchFlicker: true,
    emissiveSuppressHostShadow: true,
  });
}

/** Low patterned floor rug. Walk-through. */
function modelRug() {
  const h = 2;
  const g = emptyGrid(V, h, V);
  for (let z = 1; z < 15; z++) {
    for (let x = 1; x < 15; x++) {
      const edge = x === 1 || x === 14 || z === 1 || z === 14;
      const stripe = (x + z) % 4 === 0;
      const medallion = inDisk(x, z, 8, 8, 3.2);
      let pal = 1;
      if (edge) pal = 2;
      else if (medallion) pal = 3;
      else if (stripe) pal = 4;
      setV(g, x, 0, z, pal);
      if (!edge) setV(g, x, 1, z, medallion ? 5 : pal === 4 ? 1 : 4);
    }
  }
  box(g, 1, 0, 1, 15, 1, 2, 6);
  box(g, 1, 0, 14, 15, 1, 15, 6);
  box(g, 1, 0, 1, 2, 1, 15, 6);
  box(g, 14, 0, 1, 15, 1, 15, 6);

  return finishModel(g, {
    id: "vox_fan_rug",
    nameRu: "Ковёр",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#6a2430",
      "#3a1420",
      "#c4a050",
      "#8a3a48",
      "#e8d080",
      "#241018",
    ],
    material: "cloth",
    physical: false,
  });
}

const models = [
  modelTable(),
  modelChair(),
  modelStool(),
  modelShelf(),
  modelCabinet(),
  modelBed(),
  modelHearth(),
  modelRug(),
];

for (const model of models) writeModel(model);

const summary = models
  .map((m) => {
    const solids = m.voxels.filter((v) => v > 0).length;
    const blocks = `${m.sizeBlocks.x}×${m.sizeBlocks.y}×${m.sizeBlocks.z}`;
    return `${m.id}  ${m.nameRu}  ${m.heightVoxels}h  ${blocks}  ${solids}vox  tags=${(m.tags ?? []).join(",")}${m.physical === false ? "  nophys" : ""}`;
  })
  .join("\n");

console.log(`fantasy env6 furniture: ${models.length} models\n${summary}`);
