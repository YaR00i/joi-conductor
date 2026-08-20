/**
 * Generate Ember explore-village tileset, voxel props, map, stage, spawn.
 * Run: node scripts/gen-ember-village.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ember = path.join(root, "content", "ember");
const V = 16;

function hash32(n) {
  let x = (n | 0) * 1597334677;
  x = (x ^ (x >>> 16)) >>> 0;
  return x;
}

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s, i) => (s >> (i * 8)) & 255;
  const mix = (i) => Math.round(ch(pa, i) + (ch(pb, i) - ch(pa, i)) * t);
  const r = mix(2);
  const g = mix(1);
  const bl = mix(0);
  return `#${[r, g, bl].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function paintTile(size, fn) {
  const pixels = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) pixels.push(fn(x, y));
  }
  return pixels;
}

function noiseTile(size, base, mid, hi, scale = 3) {
  return paintTile(size, (x, y) => {
    const n = hash32(x * 73 + y * 191 + scale * 13) % 1000;
    if (n < 220) return hi;
    if (n < 540) return mid;
    return base;
  });
}

function sidewalkPixels(size) {
  const grout = "#6a6460";
  const a = "#c4b8a8";
  const b = "#b4a898";
  const c = "#d0c4b4";
  return paintTile(size, (x, y) => {
    if (x === 0 || y === 0 || x === size - 1 || y === size - 1) return grout;
    if (x === 7 || x === 8 || y === 7 || y === 8) return grout;
    const n = hash32(x * 19 + y * 41) % 3;
    return n === 0 ? a : n === 1 ? b : c;
  });
}

function brickPixels(size, dark, mid, hi) {
  return paintTile(size, (x, y) => {
    const row = Math.floor(y / 4);
    const shift = row % 2 === 0 ? 0 : 5;
    const col = Math.floor((x + shift) / 8);
    if (y % 4 === 0 || (x + shift) % 8 === 0) return dark;
    const n = hash32(row * 97 + col * 13 + x) % 5;
    return n === 0 ? hi : n === 1 ? dark : mid;
  });
}

function plankPixels(size, dark, mid, hi, vertical) {
  return paintTile(size, (x, y) => {
    const u = vertical ? x : y;
    const v = vertical ? y : x;
    if (u % 4 === 0) return dark;
    const n = hash32(Math.floor(u / 4) * 31 + v * 7) % 6;
    return n === 0 ? hi : n === 1 ? dark : mid;
  });
}

function creamFloorPixels(size) {
  return paintTile(size, (x, y) => {
    const grout = "#8a7a68";
    if (x === 0 || y === 0) return grout;
    const n = hash32(x * 11 + y * 29) % 8;
    if (n === 0) return "#c9a070";
    if (n === 1) return "#2e6a68";
    if ((x + y) % 15 === 0) return "#b8a090";
    return n === 2 ? "#e8d8c0" : "#ddd0b8";
  });
}

const TS = 16;
const tiles = [
  { id: 0, name: "пусто", color: "#00000000" },
  {
    id: 1,
    name: "трава",
    color: "#3a6a32",
    material: "grass",
    pixels: noiseTile(TS, "#2d5428", "#3a6a32", "#4c7c3c"),
  },
  {
    id: 2,
    name: "земля",
    color: "#6a4a30",
    material: "path",
    pixels: noiseTile(TS, "#5a3c24", "#6a4a30", "#8a6240"),
  },
  {
    id: 3,
    name: "тротуар",
    color: "#c4b8a8",
    material: "stone",
    pixels: sidewalkPixels(TS),
  },
  {
    id: 4,
    name: "мостовая",
    color: "#2a2a2c",
    material: "path",
    pixels: noiseTile(TS, "#222226", "#2e2e32", "#3a3a40", 5),
  },
  {
    id: 5,
    name: "бордюр",
    color: "#5a5854",
    material: "stone",
    pixels: noiseTile(TS, "#4a4844", "#5a5854", "#6e6c66"),
  },
  {
    id: 6,
    name: "доски",
    color: "#6a4a28",
    material: "wood",
    pixels: plankPixels(TS, "#402818", "#6a4a28", "#8a6238", false),
  },
  {
    id: 7,
    name: "плитка лавки",
    color: "#ddd0b8",
    material: "stone",
    pixels: creamFloorPixels(TS),
  },
  {
    id: 8,
    name: "камень пол",
    color: "#6a6460",
    material: "stone",
    pixels: noiseTile(TS, "#4a4640", "#6a6460", "#8a8480"),
  },
  {
    id: 9,
    name: "кирпич",
    color: "#7a3a2a",
    material: "stone",
    solid: true,
    defaultHeight: 1,
    pixels: brickPixels(TS, "#4a2018", "#7a3a2a", "#9a4c34"),
    wallPixels: brickPixels(TS, "#3a1810", "#6a3224", "#8a4430"),
  },
  {
    id: 10,
    name: "сруб",
    color: "#5a3a20",
    material: "wood",
    solid: true,
    defaultHeight: 1,
    pixels: plankPixels(TS, "#301808", "#5a3a20", "#7a522c", false),
    wallPixels: plankPixels(TS, "#281408", "#4a3018", "#6a4828", false),
  },
  {
    id: 11,
    name: "пятно фонаря",
    color: "#c4b8a8",
    material: "stone",
    glow: true,
    pixels: sidewalkPixels(TS),
  },
  {
    id: 12,
    name: "мох",
    color: "#355a32",
    material: "grass",
    pixels: noiseTile(TS, "#2a4828", "#3a5c34", "#5a7a40", 7),
  },
  {
    id: 13,
    name: "крыльцо",
    color: "#7a5630",
    material: "wood",
    pixels: plankPixels(TS, "#4a3018", "#7a5630", "#9a7048", true),
  },
  {
    id: 14,
    name: "крыша",
    color: "#4a2c1c",
    material: "wood",
    solid: true,
    defaultHeight: 1,
    pixels: plankPixels(TS, "#2a1810", "#4a2c1c", "#6a3c28", false),
  },
];

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

function inDisk(x, z, cx, cz, r) {
  const dx = x + 0.5 - cx;
  const dz = z + 0.5 - cz;
  return dx * dx + dz * dz <= r * r;
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

function modelLamp() {
  const g = emptyGrid(V, 32, V);
  box(g, 4, 0, 4, 12, 3, 12, 2);
  box(g, 7, 3, 7, 9, 22, 9, 1);
  box(g, 5, 21, 5, 11, 23, 11, 1);
  box(g, 5, 22, 5, 11, 31, 11, 3);
  box(g, 6, 23, 6, 10, 30, 10, 4, 220);
  box(g, 7, 24, 7, 9, 29, 9, 5, 255);
  return finishModel(g, {
    id: "vox_vil_lamp",
    nameRu: "Уличный фонарь",
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: 32,
    palette: ["", "#2a2420", "#3a342e", "#c07028", "#ffb44a", "#ffe8a0"],
    material: "metal",
    physical: true,
    emissiveCastsLight: false,
    directLightScale: 0.35,
  });
}

function modelFence() {
  const g = emptyGrid(V, 12, V);
  for (const px of [1, 14]) box(g, px, 0, 6, px + 2, 11, 8, 1);
  box(g, 1, 3, 6, 15, 5, 8, 2);
  box(g, 1, 7, 6, 15, 9, 8, 2);
  for (let x = 3; x <= 12; x += 3) {
    box(g, x, 0, 6, x + 1, 10, 8, 1);
    setV(g, x, 10, 6, 1);
    setV(g, x, 10, 7, 1);
  }
  return finishModel(g, {
    id: "vox_vil_fence",
    nameRu: "Штакетник",
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: 12,
    palette: ["", "#d8c8a8", "#c4b090"],
    material: "wood",
    physical: true,
  });
}

function modelHydrant() {
  const g = emptyGrid(V, 14, V);
  box(g, 5, 0, 5, 11, 2, 11, 2);
  box(g, 6, 2, 6, 10, 10, 10, 1);
  box(g, 4, 6, 7, 6, 8, 9, 1);
  box(g, 10, 6, 7, 12, 8, 9, 1);
  box(g, 7, 7, 4, 9, 9, 6, 3);
  box(g, 6, 10, 6, 10, 13, 10, 1);
  box(g, 7, 12, 7, 9, 14, 9, 4);
  return finishModel(g, {
    id: "vox_vil_hydrant",
    nameRu: "Колонка",
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: 14,
    palette: ["", "#b42828", "#5a2018", "#8a3030", "#d8c8a0"],
    material: "metal",
    physical: true,
  });
}

function modelMailbox() {
  const g = emptyGrid(V, 16, V);
  box(g, 7, 0, 7, 9, 10, 9, 1);
  box(g, 4, 10, 5, 12, 16, 11, 2);
  box(g, 5, 11, 6, 11, 15, 10, 3);
  box(g, 11, 12, 7, 13, 14, 9, 4);
  return finishModel(g, {
    id: "vox_vil_mailbox",
    nameRu: "Ящик писем",
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: 16,
    palette: ["", "#4a3018", "#8a3020", "#c04028", "#d8b060"],
    material: "wood",
    physical: true,
  });
}

function modelBush() {
  const g = emptyGrid(V, 12, V);
  for (let y = 0; y < 12; y++) {
    const r = 6.2 - Math.abs(y - 5) * 0.55;
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        if (!inDisk(x, z, 8, 8, r)) continue;
        const n = hash32(x * 17 + y * 31 + z * 9) % 7;
        const pal = n === 0 ? 3 : n === 1 ? 2 : 1;
        setV(g, x, y, z, pal);
        if (n === 4 && y > 6) setV(g, x, y, z, 4);
      }
    }
  }
  return finishModel(g, {
    id: "vox_vil_bush",
    nameRu: "Куст",
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: 12,
    palette: ["", "#2f5a28", "#244820", "#4a7a38", "#c04050"],
    material: "grass",
    physical: true,
  });
}

function modelCrate() {
  const g = emptyGrid(V, 10, V);
  box(g, 2, 0, 2, 14, 10, 14, 1);
  box(g, 2, 0, 2, 14, 10, 4, 2);
  box(g, 2, 0, 12, 14, 10, 14, 2);
  box(g, 2, 0, 2, 4, 10, 14, 2);
  box(g, 12, 0, 2, 14, 10, 14, 2);
  box(g, 2, 8, 2, 14, 10, 14, 3);
  return finishModel(g, {
    id: "vox_vil_crate",
    nameRu: "Ящик",
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: 10,
    palette: ["", "#8a6238", "#5d4122", "#c8a060"],
    material: "wood",
    physical: true,
  });
}

function modelBarrel() {
  const g = emptyGrid(V, 14, V);
  for (let y = 0; y < 14; y++) {
    const r = y < 2 || y > 11 ? 5.2 : 6.1;
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        if (!inDisk(x, z, 8, 8, r)) continue;
        const ring = y === 2 || y === 7 || y === 11;
        setV(g, x, y, z, ring ? 2 : 1);
      }
    }
  }
  box(g, 5, 13, 5, 11, 14, 11, 3);
  return finishModel(g, {
    id: "vox_vil_barrel",
    nameRu: "Бочка",
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: 14,
    palette: ["", "#6a4424", "#3a2818", "#8a6240"],
    material: "wood",
    physical: true,
  });
}

function modelBench() {
  const g = emptyGrid(V, 8, V);
  box(g, 1, 0, 3, 3, 4, 5, 1);
  box(g, 13, 0, 3, 15, 4, 5, 1);
  box(g, 1, 0, 11, 3, 4, 13, 1);
  box(g, 13, 0, 11, 15, 4, 13, 1);
  box(g, 1, 4, 3, 15, 6, 13, 2);
  box(g, 1, 6, 3, 15, 8, 5, 2);
  return finishModel(g, {
    id: "vox_vil_bench",
    nameRu: "Скамейка",
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: 8,
    palette: ["", "#4a3018", "#7a5630"],
    material: "wood",
    physical: true,
  });
}

function modelPlanter() {
  const g = emptyGrid(V, 10, V);
  box(g, 1, 0, 4, 15, 4, 12, 1);
  box(g, 2, 3, 5, 14, 5, 11, 2);
  for (let x = 3; x <= 13; x += 2) {
    const pal = x % 4 === 1 ? 4 : 3;
    box(g, x, 5, 6, x + 1, 9 + (x % 3), 10, pal);
  }
  return finishModel(g, {
    id: "vox_vil_planter",
    nameRu: "Ящик с цветами",
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: 10,
    palette: ["", "#5a3a20", "#3a2818", "#3a6a32", "#c04058"],
    material: "wood",
    physical: true,
  });
}

function modelAwning() {
  const g = emptyGrid(V * 2, 8, V);
  for (let x = 0; x < 32; x++) {
    const stripe = Math.floor(x / 4) % 2 === 0 ? 1 : 2;
    box(g, x, 4, 2, x + 1, 8, 14, stripe);
  }
  box(g, 1, 0, 2, 3, 5, 4, 3);
  box(g, 29, 0, 2, 31, 5, 4, 3);
  return finishModel(g, {
    id: "vox_vil_awning",
    nameRu: "Навес",
    sizeBlocks: { x: 2, y: 1, z: 1 },
    heightVoxels: 8,
    palette: ["", "#e8d070", "#f4f0e0", "#4a3018"],
    material: "cloth",
    physical: false,
  });
}

function modelCounter() {
  const g = emptyGrid(V * 2, 12, V);
  box(g, 1, 0, 3, 31, 10, 13, 1);
  box(g, 1, 10, 2, 31, 12, 14, 2);
  for (let x = 3; x < 30; x += 3) box(g, x, 1, 3, x + 1, 10, 4, 3);
  return finishModel(g, {
    id: "vox_vil_counter",
    nameRu: "Прилавок",
    sizeBlocks: { x: 2, y: 1, z: 1 },
    heightVoxels: 12,
    palette: ["", "#6a4428", "#8a6238", "#4a3018"],
    material: "wood",
    physical: true,
  });
}

function modelShelf() {
  const g = emptyGrid(V, 28, V);
  box(g, 1, 0, 4, 15, 28, 6, 1);
  box(g, 1, 0, 4, 3, 28, 14, 1);
  box(g, 13, 0, 4, 15, 28, 14, 1);
  for (const y of [4, 10, 16, 22]) box(g, 1, y, 4, 15, y + 2, 14, 2);
  for (let y = 6; y <= 24; y += 6) {
    for (let x = 4; x <= 11; x += 3) {
      const pal = 3 + ((x + y) % 3);
      box(g, x, y, 7, x + 2, y + 4, 12, pal);
    }
  }
  return finishModel(g, {
    id: "vox_vil_shelf",
    nameRu: "Полка",
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: 28,
    palette: ["", "#4a3018", "#6a4828", "#8a3028", "#d8c060", "#3a6a68"],
    material: "wood",
    physical: true,
  });
}

function modelTable() {
  const g = emptyGrid(V, 10, V);
  box(g, 2, 0, 2, 4, 7, 4, 1);
  box(g, 12, 0, 2, 14, 7, 4, 1);
  box(g, 2, 0, 12, 4, 7, 14, 1);
  box(g, 12, 0, 12, 14, 7, 14, 1);
  box(g, 1, 7, 1, 15, 10, 15, 2);
  return finishModel(g, {
    id: "vox_vil_table",
    nameRu: "Стол",
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: 10,
    palette: ["", "#4a3018", "#8a6238"],
    material: "wood",
    physical: true,
  });
}

function modelBed() {
  const g = emptyGrid(V * 2, 8, V);
  box(g, 1, 0, 2, 31, 3, 14, 1);
  box(g, 2, 3, 3, 24, 6, 13, 2);
  box(g, 24, 3, 3, 30, 8, 13, 3);
  return finishModel(g, {
    id: "vox_vil_bed",
    nameRu: "Кровать",
    sizeBlocks: { x: 2, y: 1, z: 1 },
    heightVoxels: 8,
    palette: ["", "#4a3018", "#c8b090", "#8a3a28"],
    material: "cloth",
    physical: true,
  });
}

function modelWindow() {
  const g = emptyGrid(V, 16, V);
  box(g, 2, 2, 13, 14, 14, 16, 1);
  box(g, 3, 3, 14, 13, 13, 16, 2, 200);
  box(g, 7, 2, 13, 9, 14, 16, 1);
  box(g, 2, 7, 13, 14, 9, 16, 1);
  box(g, 4, 4, 15, 6, 6, 16, 3, 255);
  return finishModel(g, {
    id: "vox_vil_window",
    nameRu: "Окно",
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: 16,
    palette: ["", "#3a2818", "#ffc060", "#ffe8a8"],
    material: "wood",
    physical: false,
    emissiveCastsLight: true,
    emissiveLightShadows: false,
    emissiveLightRange: 2.4,
    emissiveStrength: 0.85,
    emissiveTorchFlicker: true,
    emissiveSuppressHostShadow: true,
    directLightScale: 0.2,
  });
}

function modelPorchLamp() {
  const g = emptyGrid(V, 16, V);
  box(g, 7, 10, 7, 9, 16, 9, 1);
  box(g, 5, 4, 5, 11, 11, 11, 2);
  box(g, 6, 5, 6, 10, 10, 10, 3, 210);
  box(g, 7, 6, 7, 9, 9, 9, 4, 255);
  return finishModel(g, {
    id: "vox_vil_porch_lamp",
    nameRu: "Фонарь крыльца",
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: 16,
    palette: ["", "#2a2018", "#c07028", "#ffb44a", "#ffe8a0"],
    material: "metal",
    physical: false,
    emissiveCastsLight: true,
    emissiveLightShadows: true,
    emissiveLightRange: 3.2,
    emissiveStrength: 1.1,
    emissiveTorchFlicker: true,
    emissiveSuppressHostShadow: true,
  });
}

function modelSign() {
  const g = emptyGrid(V, 14, V);
  box(g, 2, 4, 12, 14, 13, 16, 1);
  box(g, 3, 5, 13, 13, 12, 16, 2);
  box(g, 7, 0, 13, 9, 5, 15, 3);
  return finishModel(g, {
    id: "vox_vil_sign",
    nameRu: "Вывеска",
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: 14,
    palette: ["", "#5a2018", "#c8a050", "#4a3018"],
    material: "wood",
    physical: false,
  });
}

function modelSack() {
  const g = emptyGrid(V, 8, V);
  for (let y = 0; y < 8; y++) {
    const r = 4.2 + (y < 6 ? 0.8 : -0.6);
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        if (inDisk(x, z, 8, 8, r)) setV(g, x, y, z, y > 5 ? 2 : 1);
      }
    }
  }
  return finishModel(g, {
    id: "vox_vil_sack",
    nameRu: "Мешок",
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: 8,
    palette: ["", "#8a7048", "#5a4830"],
    material: "cloth",
    physical: true,
  });
}

const models = [
  modelLamp(),
  modelFence(),
  modelHydrant(),
  modelMailbox(),
  modelBush(),
  modelCrate(),
  modelBarrel(),
  modelBench(),
  modelPlanter(),
  modelAwning(),
  modelCounter(),
  modelShelf(),
  modelTable(),
  modelBed(),
  modelWindow(),
  modelPorchLamp(),
  modelSign(),
  modelSack(),
];

const W = 36;
const H = 32;
const N = W * H;
const T = {
  empty: 0,
  grass: 1,
  dirt: 2,
  sidewalk: 3,
  road: 4,
  curb: 5,
  wood: 6,
  cream: 7,
  stone: 8,
  brick: 9,
  log: 10,
  lampPad: 11,
  moss: 12,
  porch: 13,
  roof: 14,
};

function zeros() {
  return new Array(N).fill(0);
}

function at(x, y) {
  return y * W + x;
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < W && y < H;
}

function paint(layer, x, y, id) {
  if (inBounds(x, y)) layer[at(x, y)] = id;
}

function fill(layer, x0, y0, x1, y1, id) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) paint(layer, x, y, id);
  }
}

const z0 = zeros();
const z1 = zeros();
const z2 = zeros();
const zm1 = zeros();
const collision = zeros();
const heightL = zeros();
const elevationL = zeros();
const ground = zeros();

fill(z0, 0, 0, W - 1, H - 1, T.grass);

fill(z0, 1, 15, W - 2, 16, T.sidewalk);
fill(z0, 1, 21, W - 2, 22, T.sidewalk);
fill(z0, 1, 17, W - 2, 17, T.curb);
fill(z0, 1, 20, W - 2, 20, T.curb);
fill(z0, 1, 18, W - 2, 19, T.road);

fill(z0, 4, 2, 22, 14, T.grass);
fill(z0, 8, 2, 18, 8, T.log);
fill(z0, 9, 3, 17, 7, T.wood);
fill(z0, 11, 9, 15, 9, T.porch);
paint(z0, 12, 8, T.wood);
paint(z0, 13, 8, T.wood);
for (const [x, y] of [
  [12, 10],
  [13, 10],
  [13, 11],
  [12, 12],
  [13, 12],
  [13, 13],
  [12, 14],
  [13, 14],
]) {
  paint(z0, x, y, T.dirt);
}

fill(z0, 2, 23, 13, 30, T.brick);
fill(z0, 3, 24, 12, 29, T.cream);
paint(z0, 7, 23, T.cream);
paint(z0, 8, 23, T.cream);

fill(z0, 21, 23, 33, 30, T.log);
fill(z0, 22, 24, 32, 29, T.wood);
paint(z0, 26, 23, T.wood);
paint(z0, 27, 23, T.wood);

fill(z0, 14, 23, 20, 30, T.moss);
fill(z0, 15, 24, 19, 28, T.dirt);

function wallCol(x, y, tile, stories = 2) {
  paint(z0, x, y, tile);
  if (stories >= 2) paint(z1, x, y, tile);
  collision[at(x, y)] = 1;
  heightL[at(x, y)] = stories * 16;
}

function buildingShell(x0, y0, x1, y1, wallTile, doors, roof = true) {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      if (!edge) {
        if (roof) paint(z2, x, y, T.roof);
        continue;
      }
      if (doors.some((d) => d.x === x && d.y === y)) continue;
      wallCol(x, y, wallTile, 2);
    }
  }
}

buildingShell(8, 2, 18, 8, T.log, [
  { x: 12, y: 8 },
  { x: 13, y: 8 },
]);
buildingShell(2, 23, 13, 30, T.brick, [
  { x: 7, y: 23 },
  { x: 8, y: 23 },
]);
buildingShell(21, 23, 33, 30, T.log, [
  { x: 26, y: 23 },
  { x: 27, y: 23 },
]);

for (let x = 0; x < W; x++) {
  wallCol(x, 0, T.brick, 2);
  wallCol(x, H - 1, T.brick, 2);
}
for (let y = 0; y < H; y++) {
  wallCol(0, y, T.brick, 2);
  wallCol(W - 1, y, T.brick, 2);
}

const lampPads = [
  [5, 16],
  [17, 16],
  [29, 16],
  [5, 22],
  [17, 22],
  [29, 22],
];
for (const [x, y] of lampPads) paint(z0, x, y, T.lampPad);

for (let i = 0; i < N; i++) {
  ground[i] = z1[i] || z0[i];
  const gx = i % W;
  const gy = Math.floor(i / W);
  if (z2[at(gx, gy)]) elevationL[i] = 2;
  else if (z1[i]) elevationL[i] = 1;
  else elevationL[i] = 0;
}

let vx = 0;
function prop(modelId, x, y, extra = {}) {
  vx += 1;
  return {
    id: `vil_${modelId}_${x}_${y}_${vx}`,
    modelId,
    x,
    y,
    elev: extra.elev ?? 0,
    ...extra,
  };
}

const voxelProps = [];

for (let x = 4; x <= 22; x++) {
  if (x === 12 || x === 13 || x === 15) continue;
  voxelProps.push(prop("vox_vil_fence", x, 14));
}
for (let y = 3; y <= 13; y++) {
  voxelProps.push(prop("vox_vil_fence", 4, y, { rot: 1 }));
  voxelProps.push(prop("vox_vil_fence", 22, y, { rot: 1 }));
}

for (const [x, y] of lampPads) {
  voxelProps.push(prop("vox_vil_lamp", x, y));
}

voxelProps.push(
  prop("vox_vil_mailbox", 15, 14),
  prop("vox_vil_hydrant", 8, 22),
  prop("vox_vil_bush", 6, 6),
  prop("vox_vil_bush", 7, 11),
  prop("vox_vil_bush", 19, 5),
  prop("vox_vil_bush", 20, 12),
  prop("vox_vil_bush", 3, 21),
  prop("vox_vil_bush", 32, 21),
  prop("vox_vil_planter", 11, 9),
  prop("vox_vil_planter", 15, 9),
  prop("vox_vil_porch_lamp", 14, 9, {
    elev: 1,
    emissiveCastsLight: true,
    emissiveLightShadows: true,
    emissiveLightRange: 3.2,
  }),
  prop("vox_vil_crate", 16, 6),
  prop("vox_vil_table", 10, 5),
  prop("vox_vil_bed", 14, 4, { rot: 1 }),
  prop("vox_vil_shelf", 17, 4),
  prop("vox_vil_window", 10, 8, { rot: 0 }),
  prop("vox_vil_window", 16, 8, { rot: 0 }),
  prop("vox_vil_window", 5, 23, { rot: 2 }),
  prop("vox_vil_window", 10, 23, { rot: 2 }),
  prop("vox_vil_window", 24, 23, { rot: 2 }),
  prop("vox_vil_window", 30, 23, { rot: 2 }),
  prop("vox_vil_awning", 6, 22),
  prop("vox_vil_awning", 25, 22),
  prop("vox_vil_sign", 9, 22, { elev: 1 }),
  prop("vox_vil_sign", 28, 22, { elev: 1 }),
  prop("vox_vil_bench", 12, 22),
  prop("vox_vil_bench", 20, 16, { rot: 1 }),
  prop("vox_vil_counter", 4, 27, { rot: 1 }),
  prop("vox_vil_shelf", 3, 25),
  prop("vox_vil_shelf", 12, 25),
  prop("vox_vil_crate", 4, 25),
  prop("vox_vil_crate", 5, 25),
  prop("vox_vil_barrel", 11, 28),
  prop("vox_vil_sack", 6, 29),
  prop("vox_vil_sack", 7, 29),
  prop("vox_vil_planter", 12, 28),
  prop("vox_vil_table", 9, 26),
  prop("vox_vil_counter", 22, 27),
  prop("vox_vil_shelf", 32, 25),
  prop("vox_vil_shelf", 22, 25),
  prop("vox_vil_crate", 31, 28),
  prop("vox_vil_crate", 30, 29),
  prop("vox_vil_barrel", 23, 29),
  prop("vox_vil_barrel", 16, 26),
  prop("vox_vil_crate", 15, 27),
  prop("vox_vil_crate", 17, 28),
  prop("vox_vil_sack", 18, 25),
  prop("vox_vil_bush", 14, 29),
  prop("vox_vil_bush", 19, 29),
  prop("vox_vil_planter", 31, 24),
);

const lights = lampPads.map(([x, y], i) => ({
  id: `vil_lamp_${i}_${x}_${y}`,
  x,
  y,
  enabled: true,
  lampColor: "#ffb056",
  lampFaceColor: "#ff9030",
  lampRange: 7,
  lampDiscCore: 2,
  lampDiscMid: 4,
  lampHeight: 1.7,
  lampShowCore: true,
  lampStrength0: 0.72,
  lampStrengthFalloff: 0.42,
  lampTorchFlicker: true,
}));

lights.push(
  {
    id: "vil_shop_brick",
    x: 8,
    y: 26,
    enabled: true,
    lampColor: "#ffc070",
    lampFaceColor: "#ffaa48",
    lampRange: 5,
    lampDiscCore: 2,
    lampDiscMid: 3,
    lampHeight: 1.35,
    lampShowCore: true,
    lampStrength0: 0.58,
    lampStrengthFalloff: 0.4,
    lampTorchFlicker: true,
  },
  {
    id: "vil_shop_wood",
    x: 27,
    y: 26,
    enabled: true,
    lampColor: "#ffb060",
    lampFaceColor: "#ff9030",
    lampRange: 5,
    lampDiscCore: 2,
    lampDiscMid: 3,
    lampHeight: 1.35,
    lampShowCore: true,
    lampStrength0: 0.55,
    lampStrengthFalloff: 0.4,
    lampTorchFlicker: true,
  },
  {
    id: "vil_house",
    x: 13,
    y: 5,
    enabled: true,
    lampColor: "#ffc878",
    lampFaceColor: "#ffaa48",
    lampRange: 4,
    lampDiscCore: 1,
    lampDiscMid: 2,
    lampHeight: 1.2,
    lampShowCore: true,
    lampStrength0: 0.5,
    lampStrengthFalloff: 0.4,
    lampTorchFlicker: true,
  },
);

const map = {
  id: "hu_tao_village",
  nameRu: "Деревня Ху Тао",
  playProfile: "explore",
  tileSize: 16,
  width: W,
  height: H,
  tilesetId: "village_16",
  worldPhysicsVersion: 2,
  terrainHeightUnit: "voxels",
  layers: [
    { name: "ground", type: "tile", data: ground },
    { name: "decor", type: "tile", data: zeros() },
    { name: "collision", type: "tile", data: collision },
    { name: "height", type: "tile", data: heightL },
    { name: "elevation", type: "tile", data: elevationL },
    { name: "ground_z-1", type: "tile", data: zm1 },
    { name: "ground_z0", type: "tile", data: z0 },
    { name: "ground_z1", type: "tile", data: z1 },
    { name: "ground_z2", type: "tile", data: z2 },
    { name: "ground_z3", type: "tile", data: zeros() },
  ],
  regions: [
    { id: "start", kind: "player_start", x: 16, y: 18, w: 3, h: 2 },
    { id: "camera", kind: "camera_bound", x: 1, y: 1, w: W - 2, h: H - 2 },
  ],
  sprites: [],
  lights,
  light: {
    ambientColor: "#2a140c",
    ambientAlpha: 0.28,
    fillIntensity: 1.08,
    lampColor: "#ffb056",
    lampFaceColor: "#ff9030",
    lampRange: 7,
    lampDiscCore: 2,
    lampDiscMid: 4,
    lampHeight: 1.55,
    lampShowCore: true,
    lampStrength0: 0.62,
    lampStrengthFalloff: 0.42,
    lampPower: 1.45,
    floorGlowBase: 0.08,
    floorGlowScale: 0.28,
    faceGlowBase: 0.06,
    faceGlowScale: 0.34,
    bloomStrength: 0.38,
    bloomThreshold: 0.68,
    bloomRadius: 0.32,
    sunAzimuth: 214,
    sunElevation: 18,
    sunColor: "#ff9a4a",
    sunIntensity: 1.22,
    torchFlicker: 0.32,
    torchFlickerSpeed: 0.9,
    voxelSnapLight: true,
    lampTorchFlicker: true,
    grade: {
      tone: 0.26,
      brightness: 1.12,
      saturation: 1.18,
    },
    atmosphere: {
      fog: 0.035,
      fogColor: "#c89068",
      rain: 0,
      wind: 0.18,
      cloudShadows: 0.2,
      cloudSpeed: 0.16,
      dust: 0.42,
      fireflies: 0.12,
      vignette: 0.26,
      haze: 0.22,
      sunGlare: 0.55,
    },
  },
  voxelProps,
};

const tileset = {
  id: "village_16",
  tileSize: 16,
  columns: 4,
  tileCount: tiles.length,
  procedural: true,
  tiles,
};

const stage = {
  id: "village_stroll",
  nameRu: "Вечерняя деревня",
  playerMistressId: "hu_tao",
  mapId: "hu_tao_village",
  spawnTableId: "village_stroll",
  weaponPoolId: "p1_weapons",
  chestPoolId: "p1_chests",
  starterWeaponId: "butterfly_fan",
  durationSec: 600,
  bossAtSec: 9999,
  playerHp: 100,
  moveSpeed: 110,
  playerBody: {
    radiusVoxels: 2.5,
    heightVoxels: 12,
    stepHeightVoxels: 4,
    skinVoxels: 0.15,
    layer: "actor",
    mask: ["world"],
  },
  cindersClear: 0,
  cindersFail: 0,
  xpGemValue: 1,
  baseXpToLevel: 12,
};

const spawn = { id: "village_stroll", entries: [] };

writeJson("tilesets/village_16.json", tileset);
writeJson("voxels/village.json", { models });
writeJson("maps/hu_tao_village.json", map);
writeJson("stages/village_stroll.json", stage);
writeJson("spawns/village_stroll.json", spawn);

console.log(
  `village: map ${W}x${H}, tiles ${tiles.length}, voxels ${models.length}, props ${voxelProps.length}, lights ${lights.length}`,
);
