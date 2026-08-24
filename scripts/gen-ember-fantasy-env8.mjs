#!/usr/bin/env node
/**
 * Env8 tavern props for Ember.
 * Scaled for ~32-voxel-tall chibi people (explore camera 45–60°).
 *
 * Run: node scripts/gen-ember-fantasy-env8.mjs
 *
 * Writes only the eight vox_fan_* ids listed below.
 * Does not touch env1–7, existing vox_fan_*, vox_chr_*, registry.json, maps, or src.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ember = path.join(root, "content", "ember");
const V = 16;

const TAGS = ["fantasy", "indoor", "tavern"];
const TAGS_FURN = ["fantasy", "indoor", "tavern", "furniture"];
const TAGS_LIGHT = ["fantasy", "indoor", "tavern", "light"];

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

/** Tavern bar 2×1. Top at waist (~14) with a tap lump. */
function modelBar() {
  const h = 16;
  const sx = V * 2;
  const g = emptyGrid(sx, h, V);
  box(g, 1, 0, 3, 31, 13, 14, 1);
  box(g, 2, 1, 4, 30, 13, 13, 2);
  box(g, 1, 0, 3, 31, 2, 14, 3);

  for (let x = 2; x < 30; x++) {
    if (x % 4 === 0) box(g, x, 3, 13, x + 1, 12, 14, 3);
  }
  box(g, 4, 5, 13, 10, 10, 15, 4);
  box(g, 12, 5, 13, 20, 10, 15, 4);
  box(g, 22, 5, 13, 28, 10, 15, 4);

  box(g, 0, 13, 2, 32, 16, 15, 5);
  for (let x = 0; x < 32; x++) {
    box(g, x, 15, 2, x + 1, 16, 15, x % 3 === 2 ? 6 : 5);
  }
  box(g, 0, 13, 2, 32, 14, 3, 2);
  box(g, 0, 13, 14, 32, 14, 15, 2);

  box(g, 24, 14, 10, 29, 16, 14, 7);
  box(g, 26, 15, 13, 28, 16, 15, 8);
  box(g, 27, 14, 14, 28, 15, 16, 8);

  return finishModel(g, {
    id: "vox_fan_bar",
    nameRu: "Бар",
    tags: TAGS_FURN,
    sizeBlocks: { x: 2, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5c3c22",
      "#2a1c10",
      "#4a3420",
      "#8a5c30",
      "#c08a48",
      "#6a6a70",
      "#8a7a50",
    ],
    material: "wood",
    physical: true,
  });
}

/** Ale keg on its side in a cradle — not the standing vox_fan_barrel. */
function modelKeg() {
  const h = 12;
  const g = emptyGrid(V, h, V);
  post(g, 1, 0, 3, 4, 4, 6, 1, 6);
  post(g, 12, 0, 3, 15, 4, 6, 1, 6);
  post(g, 1, 0, 10, 4, 4, 13, 1, 6);
  post(g, 12, 0, 10, 15, 4, 13, 1, 6);
  box(g, 2, 2, 4, 14, 4, 6, 2);
  box(g, 2, 2, 10, 14, 4, 12, 2);
  box(g, 2, 1, 5, 4, 5, 11, 1);
  box(g, 12, 1, 5, 14, 5, 11, 1);

  for (let x = 2; x < 14; x++) {
    const t = 1 - Math.abs(x - 8) / 7;
    const r = 3.6 + t * 1.1;
    const hoop = x === 4 || x === 8 || x === 11;
    const cap = x === 2 || x === 13;
    for (let y = 2; y < 12; y++) {
      for (let z = 3; z < 13; z++) {
        if (!inDisk(y, z, 6.5, 8, r)) continue;
        const n = hash32(x * 13 + y * 7 + z * 5) % 5;
        let pal = hoop ? 5 : cap ? 3 : n === 0 ? 4 : 3;
        if (cap && inDisk(y, z, 6.5, 8, 1.6)) pal = 2;
        setV(g, x, y, z, pal);
      }
    }
  }
  box(g, 13, 6, 10, 16, 8, 12, 5);
  box(g, 14, 6, 11, 16, 7, 13, 7);
  box(g, 15, 6, 12, 16, 7, 14, 7);

  return finishModel(g, {
    id: "vox_fan_keg",
    nameRu: "Бочонок",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3420",
      "#2e2216",
      "#7a4a22",
      "#9a6838",
      "#8a7a50",
      "#1c1410",
      "#c4a060",
    ],
    material: "wood",
    physical: true,
  });
}

/** Oversized-readable stein: thick body, 3-wide handle, foam cap. */
function modelTankard() {
  const h = 10;
  const g = emptyGrid(V, h, V);
  for (let y = 0; y < 8; y++) {
    const r = y < 2 ? 5.2 : 4.8;
    const rIn = y >= 2 ? 3.2 : 0;
    for (let z = 2; z < 14; z++) {
      for (let x = 1; x < 12; x++) {
        if (!inDisk(x, z, 6, 8, r)) continue;
        if (rIn && inDisk(x, z, 6, 8, rIn) && y >= 3) {
          setV(g, x, y, z, 4);
          continue;
        }
        const n = hash32(x * 11 + y * 5 + z) % 4;
        setV(g, x, y, z, n === 0 ? 2 : 1);
      }
    }
  }
  for (let z = 3; z < 13; z++) {
    for (let x = 2; x < 11; x++) {
      if (!inDisk(x, z, 6, 8, 4.4)) continue;
      setV(g, x, 8, z, 5);
      if (inDisk(x, z, 6, 8, 3.2)) setV(g, x, 9, z, 6);
    }
  }
  box(g, 10, 2, 6, 14, 4, 10, 3);
  box(g, 12, 3, 6, 15, 7, 10, 3);
  box(g, 10, 6, 6, 14, 8, 10, 3);
  box(g, 13, 4, 7, 15, 6, 9, 2);

  return finishModel(g, {
    id: "vox_fan_tankard",
    nameRu: "Кружка",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#6a5440",
      "#3a3024",
      "#8a7a58",
      "#8a5a18",
      "#e8d8b0",
      "#f4eee0",
    ],
    material: "metal",
    physical: true,
  });
}

/**
 * Hanging chandelier. physical: false — if dropped on a floor tile as
 * a solid it would block walking; this is a ceiling fixture.
 */
function modelChandelier() {
  const h = 16;
  const g = emptyGrid(V, h, V);
  box(g, 7, 13, 7, 9, 16, 9, 1);
  box(g, 6, 12, 6, 10, 14, 10, 2);
  box(g, 3, 9, 3, 13, 11, 13, 1);
  box(g, 4, 9, 4, 12, 11, 12, 2);

  const arms = [
    [3, 3],
    [11, 3],
    [3, 11],
    [11, 11],
    [7, 2],
    [7, 12],
  ];
  for (const [x, z] of arms) {
    box(g, x, 8, z, x + 2, 10, z + 2, 2);
    box(g, x, 10, z, x + 2, 12, z + 2, 3);
    box(g, x, 12, z, x + 2, 14, z + 2, 4, 200);
    setV(g, x, 13, z, 5, 255);
  }
  box(g, 7, 10, 7, 9, 12, 9, 3);
  box(g, 7, 12, 7, 9, 14, 9, 4, 180);

  return finishModel(g, {
    id: "vox_fan_chandelier",
    nameRu: "Люстра",
    tags: TAGS_LIGHT,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a4030",
      "#8a7a50",
      "#e8d8b0",
      "#e89830",
      "#ffe08a",
    ],
    material: "metal",
    physical: false,
    ...lightFlags(2.6, 0.85),
  });
}

/** Iron cauldron on a 3×3 tripod; warm stew glow, no cube shadows. */
function modelStewpot() {
  const h = 12;
  const g = emptyGrid(V, h, V);
  post(g, 2, 0, 3, 5, 6, 6, 1, 6);
  post(g, 11, 0, 3, 14, 6, 6, 1, 6);
  post(g, 6, 0, 10, 9, 6, 13, 1, 6);
  box(g, 3, 4, 4, 13, 6, 12, 2);

  for (let y = 4; y < 11; y++) {
    const t = (y - 4) / 6;
    const r = 5.6 - Math.abs(t - 0.45) * 1.4;
    const rIn = y >= 8 ? 3.8 : 0;
    for (let z = 2; z < 14; z++) {
      for (let x = 2; x < 14; x++) {
        if (!inDisk(x, z, 8, 8, r)) continue;
        if (rIn && inDisk(x, z, 8, 8, rIn)) {
          setV(g, x, y, z, y === 8 ? 4 : 5, y === 8 ? 160 : 0);
          continue;
        }
        setV(g, x, y, z, y < 6 ? 2 : 3);
      }
    }
  }
  box(g, 4, 10, 4, 6, 12, 6, 1);
  box(g, 10, 10, 4, 12, 12, 6, 1);
  box(g, 7, 8, 7, 9, 9, 9, 7, 220);

  return finishModel(g, {
    id: "vox_fan_stewpot",
    nameRu: "Котёл",
    tags: TAGS_LIGHT,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a3a40",
      "#2a2a2c",
      "#5a5a60",
      "#6a3a18",
      "#8a5420",
      "#1a1a1c",
      "#c07028",
    ],
    material: "metal",
    physical: true,
    ...lightFlags(1.8, 0.45),
  });
}

/** Hanging ham / roast on a hook. physical: false (ceiling/wall food). */
function modelHam() {
  const h = 14;
  const g = emptyGrid(V, h, V);
  box(g, 7, 12, 7, 9, 14, 9, 1);
  box(g, 6, 11, 7, 8, 13, 9, 1);
  box(g, 5, 10, 7, 7, 12, 9, 6);

  for (let y = 2; y < 11; y++) {
    const t = (y - 2) / 8;
    const rx = 4.2 - t * 0.8;
    const rz = 3.4 - t * 0.4;
    for (let z = 3; z < 13; z++) {
      for (let x = 3; x < 14; x++) {
        const nx = (x + 0.5 - 8.2) / rx;
        const nz = (z + 0.5 - 8) / rz;
        if (nx * nx + nz * nz > 1.02) continue;
        const n = hash32(x * 9 + y * 13 + z * 3) % 6;
        let pal = n === 0 ? 3 : 2;
        if (t > 0.75) pal = 4;
        if (x >= 11 && y <= 5) pal = 5;
        setV(g, x, y, z, pal);
      }
    }
  }
  box(g, 11, 2, 7, 14, 5, 10, 5);
  box(g, 12, 3, 8, 14, 4, 9, 6);

  return finishModel(g, {
    id: "vox_fan_ham",
    nameRu: "Окорок",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5a5040",
      "#8a3a30",
      "#c06040",
      "#5a2418",
      "#e8d0a0",
      "#8a7a58",
    ],
    material: "cloth",
    physical: false,
  });
}

/** Bottle rack — necks and glass, not a book shelf. */
function modelBottles() {
  const h = 14;
  const g = emptyGrid(V, h, V);
  box(g, 1, 0, 5, 15, 2, 13, 1);
  box(g, 1, 0, 5, 3, 14, 13, 1);
  box(g, 13, 0, 5, 15, 14, 13, 1);
  box(g, 1, 0, 5, 15, 14, 7, 2);
  box(g, 1, 12, 5, 15, 14, 13, 3);
  box(g, 3, 2, 7, 13, 4, 13, 4);
  box(g, 3, 7, 7, 13, 9, 13, 4);

  function bottle(x, y0, body, neck, cork) {
    box(g, x, y0, 8, x + 3, y0 + 4, 12, body);
    box(g, x + 1, y0 + 4, 9, x + 2, y0 + 6, 11, neck);
    setV(g, x + 1, y0 + 6, 9, cork);
  }
  bottle(3, 4, 5, 5, 8);
  bottle(7, 4, 6, 6, 8);
  bottle(11, 3, 7, 7, 8);
  bottle(4, 9, 6, 6, 8);
  bottle(9, 9, 5, 5, 8);

  return finishModel(g, {
    id: "vox_fan_bottles",
    nameRu: "Бутылки",
    tags: TAGS_FURN,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3420",
      "#322418",
      "#7a5840",
      "#c4a070",
      "#2a4a38",
      "#6a2430",
      "#3a5080",
      "#c4a060",
    ],
    material: "wood",
    physical: true,
  });
}

/** Inn sign: post + arm, two chains, mug pictogram on the board. */
function modelInnSign() {
  const h = 22;
  const g = emptyGrid(V, h, V);
  post(g, 1, 0, 6, 5, 20, 10, 1, 6);
  box(g, 1, 0, 6, 5, 2, 10, 2);
  box(g, 3, 18, 6, 15, 20, 10, 3);
  box(g, 13, 18, 6, 15, 20, 10, 2);

  box(g, 6, 16, 7, 8, 19, 9, 4);
  box(g, 11, 16, 7, 13, 19, 9, 4);

  box(g, 4, 8, 4, 15, 16, 12, 5);
  box(g, 5, 9, 5, 14, 15, 12, 7);
  box(g, 7, 10, 11, 11, 14, 13, 8);
  box(g, 8, 11, 11, 10, 13, 13, 5);
  box(g, 11, 11, 11, 13, 13, 13, 8);
  box(g, 5, 9, 5, 14, 10, 6, 2);
  box(g, 5, 14, 5, 14, 15, 6, 2);

  return finishModel(g, {
    id: "vox_fan_inn_sign",
    nameRu: "Вывеска",
    tags: ["fantasy", "indoor", "outdoor", "tavern"],
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3420",
      "#2e2216",
      "#7a5834",
      "#8a7a50",
      "#6a3a18",
      "#1c1410",
      "#c08a40",
      "#e8d8b0",
    ],
    material: "wood",
    physical: true,
  });
}

const models = [
  modelBar(),
  modelKeg(),
  modelTankard(),
  modelChandelier(),
  modelStewpot(),
  modelHam(),
  modelBottles(),
  modelInnSign(),
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

console.log(`fantasy env8 tavern: ${models.length} models\n${summary}`);
