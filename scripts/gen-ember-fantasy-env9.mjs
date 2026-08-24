#!/usr/bin/env node
/**
 * Env9 bedroom props for Ember.
 * Scaled for ~32-voxel-tall chibi people (explore camera 45–60°).
 *
 * Run: node scripts/gen-ember-fantasy-env9.mjs
 *
 * Writes only the eight vox_fan_* ids listed below.
 * Does not touch env1–8, existing vox_fan_*, vox_chr_*, registry.json, maps, or src.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ember = path.join(root, "content", "ember");
const V = 16;

const TAGS = ["fantasy", "indoor", "bedroom"];
const TAGS_FURN = ["fantasy", "indoor", "bedroom", "furniture"];
const TAGS_LIGHT = ["fantasy", "indoor", "bedroom", "light"];

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

/** Tall armoire, still under a 32 vx crown. Full doors + knobs. */
function modelWardrobe() {
  const h = 28;
  const g = emptyGrid(V, h, V);
  box(g, 1, 0, 3, 15, 2, 14, 1);
  box(g, 2, 2, 3, 14, 25, 14, 2);
  box(g, 3, 3, 4, 13, 24, 14, 3);
  box(g, 1, 25, 2, 15, 27, 15, 4);
  box(g, 3, 27, 4, 13, 28, 13, 1);

  box(g, 3, 4, 13, 8, 23, 15, 5);
  box(g, 8, 4, 13, 13, 23, 15, 5);
  box(g, 7, 4, 13, 9, 23, 14, 2);
  box(g, 3, 4, 13, 13, 5, 15, 1);
  box(g, 3, 22, 13, 13, 23, 15, 1);
  box(g, 6, 12, 14, 7, 14, 15, 6);
  box(g, 9, 12, 14, 10, 14, 15, 6);
  box(g, 4, 8, 14, 6, 10, 15, 7);
  box(g, 10, 8, 14, 12, 10, 15, 7);

  return finishModel(g, {
    id: "vox_fan_wardrobe",
    nameRu: "Гардероб",
    tags: TAGS_FURN,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5c3c22",
      "#8a5c34",
      "#c49a58",
      "#6a4a28",
      "#d8c070",
      "#2a1c10",
    ],
    material: "wood",
    physical: true,
  });
}

/** Dressing table, knee space ~stool height, standing mirror. */
function modelVanity() {
  const h = 20;
  const g = emptyGrid(V, h, V);
  post(g, 1, 0, 3, 4, 9, 6, 1, 6);
  post(g, 12, 0, 3, 15, 9, 6, 1, 6);
  post(g, 1, 0, 10, 4, 9, 13, 1, 6);
  post(g, 12, 0, 10, 15, 9, 13, 1, 6);
  box(g, 3, 3, 4, 13, 5, 6, 2);
  box(g, 3, 3, 10, 13, 5, 12, 2);

  box(g, 0, 9, 2, 16, 12, 14, 3);
  for (let x = 0; x < 16; x++) {
    box(g, x, 11, 2, x + 1, 12, 14, x % 3 === 2 ? 7 : 4);
  }
  box(g, 5, 6, 12, 11, 9, 14, 3);
  box(g, 7, 7, 13, 9, 8, 14, 6);

  box(g, 4, 12, 4, 12, 20, 8, 1);
  box(g, 5, 13, 5, 11, 19, 8, 5);
  box(g, 5, 13, 7, 11, 19, 9, 5);
  box(g, 6, 14, 8, 10, 18, 9, 8);
  box(g, 4, 12, 4, 12, 13, 8, 4);
  box(g, 4, 19, 4, 12, 20, 8, 4);

  return finishModel(g, {
    id: "vox_fan_vanity",
    nameRu: "Трюмо",
    tags: TAGS_FURN,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3420",
      "#2e2216",
      "#7a5834",
      "#c08a48",
      "#8ab0c4",
      "#d8c070",
      "#6a4428",
      "#d8e8f0",
    ],
    material: "wood",
    physical: true,
  });
}

/** Standing coat rack, 3×3 post, one or two cloak lumps. */
function modelCoatrack() {
  const h = 22;
  const g = emptyGrid(V, h, V);
  box(g, 5, 0, 5, 11, 2, 11, 1);
  post(g, 6, 2, 6, 10, 20, 10, 2, 6);
  box(g, 2, 18, 7, 14, 20, 9, 3);
  box(g, 7, 18, 2, 9, 20, 14, 3);
  box(g, 2, 18, 7, 4, 20, 9, 4);
  box(g, 12, 18, 7, 14, 20, 9, 4);
  box(g, 7, 18, 2, 9, 20, 4, 4);
  box(g, 7, 18, 12, 9, 20, 14, 4);

  box(g, 1, 8, 8, 6, 18, 13, 5);
  box(g, 2, 9, 9, 6, 17, 13, 7);
  box(g, 1, 16, 9, 4, 18, 12, 5);
  box(g, 10, 10, 4, 15, 18, 9, 8);
  box(g, 11, 11, 4, 15, 17, 8, 5);

  return finishModel(g, {
    id: "vox_fan_coatrack",
    nameRu: "Вешалка",
    tags: TAGS_FURN,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5c3c22",
      "#8a5c34",
      "#c4a060",
      "#4a2a58",
      "#1c1410",
      "#6a3a70",
      "#2a3a58",
    ],
    material: "wood",
    physical: true,
  });
}

/** Folding privacy screen, 2×1, three hinged panels. */
function modelScreen() {
  const h = 18;
  const sx = V * 2;
  const g = emptyGrid(sx, h, V);
  const panels = [
    { x0: 1, z0: 3, x1: 11, z1: 7 },
    { x0: 10, z0: 6, x1: 21, z1: 11 },
    { x0: 20, z0: 9, x1: 31, z1: 13 },
  ];
  for (const p of panels) {
    box(g, p.x0, 0, p.z0, p.x1, 2, p.z1, 1);
    box(g, p.x0, 2, p.z0, p.x0 + 2, 18, p.z1, 2);
    box(g, p.x1 - 2, 2, p.z0, p.x1, 18, p.z1, 2);
    box(g, p.x0, 16, p.z0, p.x1, 18, p.z1, 3);
    box(g, p.x0 + 2, 3, p.z0 + 1, p.x1 - 2, 16, p.z1 - 1, 4);
    for (let y = 4; y < 15; y += 4) {
      box(g, p.x0 + 3, y, p.z0 + 1, p.x1 - 3, y + 2, p.z1 - 1, 5);
    }
  }

  return finishModel(g, {
    id: "vox_fan_screen",
    nameRu: "Ширма",
    tags: TAGS_FURN,
    sizeBlocks: { x: 2, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5c3c22",
      "#8a5c34",
      "#6a2438",
      "#c07040",
      "#2a1c10",
    ],
    material: "wood",
    physical: true,
  });
}

/** Folded blankets on a low open crate — not a travel trunk. */
function modelLinens() {
  const h = 10;
  const g = emptyGrid(V, h, V);
  box(g, 2, 0, 3, 14, 4, 13, 1);
  box(g, 3, 1, 4, 13, 4, 12, 0);
  box(g, 2, 0, 3, 14, 1, 13, 2);
  box(g, 2, 0, 3, 4, 4, 13, 2);
  box(g, 12, 0, 3, 14, 4, 13, 2);
  box(g, 6, 1, 3, 8, 4, 13, 5);

  box(g, 3, 4, 4, 13, 6, 12, 3);
  box(g, 4, 6, 5, 12, 8, 11, 4);
  box(g, 5, 8, 6, 11, 10, 10, 6);
  box(g, 3, 5, 4, 13, 6, 5, 7);
  box(g, 4, 7, 5, 12, 8, 6, 7);

  return finishModel(g, {
    id: "vox_fan_linens",
    nameRu: "Бельё",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5c3c22",
      "#3a2818",
      "#e8dcc4",
      "#6a3a58",
      "#8a7a50",
      "#8ab0a0",
      "#c4a070",
    ],
    material: "cloth",
    physical: true,
  });
}

/** Wall tapestry. Taller than a rug. physical: false. */
function modelTapestry() {
  const h = 20;
  const g = emptyGrid(V, h, V);
  box(g, 1, 18, 6, 15, 20, 10, 1);
  box(g, 2, 2, 7, 14, 19, 10, 2);
  box(g, 3, 3, 8, 13, 18, 10, 3);
  for (let y = 4; y < 17; y++) {
    for (let x = 4; x < 12; x++) {
      const med = inDisk(x, y, 8, 10, 3.2);
      const stripe = (x + Math.floor(y / 3)) % 3 === 0;
      setV(g, x, y, 9, med ? 4 : stripe ? 5 : 3);
    }
  }
  box(g, 2, 2, 7, 4, 4, 10, 6);
  box(g, 12, 2, 7, 14, 4, 10, 6);
  box(g, 6, 2, 7, 10, 3, 10, 6);

  return finishModel(g, {
    id: "vox_fan_tapestry",
    nameRu: "Гобелен",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a4030",
      "#6a2430",
      "#8a3a48",
      "#c4a050",
      "#4a5080",
      "#241018",
    ],
    material: "cloth",
    physical: false,
  });
}

/** Bedside oil lamp: font + glass chimney, small glow, no cube shadows. */
function modelLampBed() {
  const h = 10;
  const g = emptyGrid(V, h, V);
  box(g, 5, 0, 5, 11, 2, 11, 1);
  box(g, 6, 2, 6, 10, 4, 10, 2);
  box(g, 6, 3, 6, 10, 5, 10, 3);
  box(g, 7, 4, 7, 9, 8, 9, 4);
  box(g, 6, 5, 6, 10, 8, 10, 5);
  box(g, 7, 5, 7, 9, 8, 9, 6, 180);
  box(g, 7, 8, 7, 9, 10, 9, 7, 240);
  setV(g, 7, 9, 7, 8, 255);
  box(g, 6, 4, 6, 10, 5, 10, 2);

  return finishModel(g, {
    id: "vox_fan_lamp_bed",
    nameRu: "Лампа",
    tags: TAGS_LIGHT,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a3024",
      "#6a5a40",
      "#8a3a18",
      "#c8d0c8",
      "#8ab0a0",
      "#e89830",
      "#ffe08a",
      "#fff6c8",
    ],
    material: "metal",
    physical: true,
    ...lightFlags(2.0, 0.6),
  });
}

/** Window curtains: rod + two hangs. physical: false. */
function modelCurtains() {
  const h = 22;
  const g = emptyGrid(V, h, V);
  box(g, 0, 20, 6, 16, 22, 10, 1);
  box(g, 0, 20, 7, 2, 22, 9, 2);
  box(g, 14, 20, 7, 16, 22, 9, 2);

  box(g, 0, 2, 5, 6, 21, 11, 3);
  box(g, 1, 3, 6, 6, 20, 11, 4);
  box(g, 0, 4, 5, 3, 18, 8, 5);
  box(g, 10, 2, 5, 16, 21, 11, 3);
  box(g, 10, 3, 6, 15, 20, 11, 4);
  box(g, 13, 4, 5, 16, 18, 8, 5);
  box(g, 0, 2, 5, 6, 4, 11, 6);
  box(g, 10, 2, 5, 16, 4, 11, 6);

  return finishModel(g, {
    id: "vox_fan_curtains",
    nameRu: "Шторы",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5a5040",
      "#8a7a58",
      "#4a2a58",
      "#6a3a70",
      "#2a1840",
      "#c4a070",
    ],
    material: "cloth",
    physical: false,
  });
}

const models = [
  modelWardrobe(),
  modelVanity(),
  modelCoatrack(),
  modelScreen(),
  modelLinens(),
  modelTapestry(),
  modelLampBed(),
  modelCurtains(),
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

console.log(`fantasy env9 bedroom: ${models.length} models\n${summary}`);
