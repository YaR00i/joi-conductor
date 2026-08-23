/**
 * Env3 fantasy village-yard / street props for Ember.
 * Run: node scripts/gen-ember-fantasy-env3.mjs
 *
 * Writes only the eight vox_fan_* ids listed below.
 * Does not touch Wave 1 / env2 files, registry.json, maps, or src.
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

function inOval(x, z, cx, cz, rx, rz) {
  const dx = (x + 0.5 - cx) / rx;
  const dz = (z + 0.5 - cz) / rz;
  return dx * dx + dz * dz <= 1;
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

/** Staved barrel with iron hoops — oval bulge, not a perfect cylinder. */
function modelBarrel() {
  const h = 13;
  const g = emptyGrid(V, h, V);
  const cx = 8;
  const cz = 7.6;
  for (let y = 0; y < h; y++) {
    const mid = 1 - Math.abs(y - 6) / 7;
    const rx = 5.0 + mid * 0.9;
    const rz = 4.4 + mid * 0.7;
    const hoop = y === 2 || y === 6 || y === 10;
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        if (!inOval(x, z, cx, cz, rx, rz)) continue;
        const stave = (x + z * 2 + 8) % 5 === 0;
        const n = hash32(x * 17 + y * 9 + z * 5) % 6;
        let pal = hoop ? 5 : stave ? 2 : n === 0 ? 3 : n === 1 ? 4 : 1;
        if (y === 0 || y === 12) pal = hoop ? 5 : 2;
        if (y === 12 && inOval(x, z, cx, cz, 2.4, 2.1)) pal = 6;
        setV(g, x, y, z, pal);
      }
    }
  }
  box(g, 11, 7, 6, 13, 9, 8, 7);

  return finishModel(g, {
    id: "vox_fan_barrel",
    nameRu: "Бочка",
    tags: ["fantasy", "outdoor"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#7a4a22",
      "#5a3418",
      "#9a6838",
      "#3a2a20",
      "#8a7a50",
      "#c4a060",
      "#2a1c10",
    ],
    material: "wood",
    physical: true,
  });
}

/** Yard bench: thick legs, open under the seat, low back. */
function modelBench() {
  const h = 10;
  const g = emptyGrid(V, h, V);
  box(g, 1, 0, 2, 4, 5, 5, 1);
  box(g, 12, 0, 2, 15, 5, 5, 1);
  box(g, 1, 0, 11, 4, 5, 14, 1);
  box(g, 12, 0, 11, 15, 5, 14, 1);
  box(g, 2, 0, 3, 3, 5, 4, 4);
  box(g, 13, 0, 3, 14, 5, 4, 4);
  box(g, 2, 0, 12, 3, 5, 13, 4);
  box(g, 13, 0, 12, 14, 5, 13, 4);

  box(g, 0, 5, 2, 16, 7, 14, 2);
  box(g, 0, 5, 2, 16, 6, 3, 6);
  box(g, 0, 5, 13, 16, 6, 14, 6);
  box(g, 1, 6, 3, 15, 7, 13, 5);
  box(g, 0, 7, 2, 16, 10, 5, 3);
  box(g, 1, 8, 3, 15, 10, 5, 5);

  return finishModel(g, {
    id: "vox_fan_bench",
    nameRu: "Скамейка",
    tags: ["fantasy", "outdoor"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3c2c",
      "#6a5840",
      "#8a7458",
      "#2c2820",
      "#a09070",
      "#3a3024",
    ],
    material: "wood",
    physical: true,
  });
}

/** Post-and-rail fence segment with gaps between rails. */
function modelFence() {
  const h = 13;
  const g = emptyGrid(V, h, V);
  box(g, 0, 0, 5, 4, 13, 11, 1);
  box(g, 12, 0, 5, 16, 13, 11, 1);
  box(g, 1, 0, 6, 3, 13, 10, 2);
  box(g, 13, 0, 6, 15, 13, 10, 2);
  box(g, 0, 0, 5, 4, 2, 11, 5);
  box(g, 12, 0, 5, 16, 2, 11, 5);

  box(g, 0, 3, 6, 16, 5, 10, 3);
  box(g, 0, 7, 6, 16, 9, 10, 3);
  box(g, 0, 11, 6, 16, 13, 10, 4);
  box(g, 4, 3, 7, 12, 5, 9, 6);
  box(g, 4, 7, 7, 12, 9, 9, 6);

  return finishModel(g, {
    id: "vox_fan_fence",
    nameRu: "Забор",
    tags: ["fantasy", "outdoor"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5c4a30",
      "#3e3424",
      "#8a6e48",
      "#b08a58",
      "#6a5a3c",
      "#c4a070",
    ],
    material: "wood",
    physical: true,
  });
}

/** Tied rectangular hay bale. */
function modelHay() {
  const h = 9;
  const g = emptyGrid(V, h, V);
  for (let y = 0; y < h; y++) {
    for (let z = 3; z < 13; z++) {
      for (let x = 2; x < 14; x++) {
        const n = hash32(x * 13 + y * 31 + z * 7) % 7;
        let pal = n === 0 ? 3 : n === 1 ? 2 : n === 2 ? 6 : 1;
        if (y === 0) pal = 6;
        if (n === 3) pal = 4;
        setV(g, x, y, z, pal);
      }
    }
  }
  box(g, 2, 0, 3, 14, 9, 4, 2);
  box(g, 2, 0, 12, 14, 9, 13, 2);
  box(g, 5, 0, 3, 7, 9, 13, 5);
  box(g, 9, 0, 3, 11, 9, 13, 5);
  box(g, 2, 3, 3, 14, 5, 13, 5);

  return finishModel(g, {
    id: "vox_fan_hay",
    nameRu: "Сноп сена",
    tags: ["fantasy", "outdoor"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#c4a040",
      "#a88830",
      "#dcc060",
      "#8a7028",
      "#5a4030",
      "#6a5420",
    ],
    material: "grass",
    physical: true,
  });
}

/** Wooden bucket: staves, hoop, rope handle, water disc. */
function modelBucket() {
  const h = 12;
  const g = emptyGrid(V, h, V);
  const cx = 8;
  const cz = 8;
  for (let y = 0; y < 8; y++) {
    const t = y / 7;
    const rOut = 3.1 + t * 1.3;
    const rIn = y === 0 ? 0 : rOut - 1.5;
    const hoop = y === 2 || y === 6;
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        if (!inDisk(x, z, cx, cz, rOut)) continue;
        const inner = inDisk(x, z, cx, cz, rIn);
        if (inner && y > 0 && y < 5) continue;
        const stave = ((x + 3 * z) % 4) === 0;
        let pal = hoop ? 4 : stave ? 2 : 1;
        if (!hoop && !stave && ((x + y) % 5 === 0)) pal = 3;
        if (y === 0) pal = 2;
        if (inner && y === 5) pal = 7;
        if (inner && y === 6) pal = 6;
        setV(g, x, y, z, pal);
      }
    }
  }
  box(g, 4, 7, 7, 6, 11, 9, 5);
  box(g, 10, 7, 7, 12, 11, 9, 5);
  box(g, 5, 10, 7, 11, 12, 9, 5);
  box(g, 6, 11, 7, 10, 12, 9, 2);

  return finishModel(g, {
    id: "vox_fan_bucket",
    nameRu: "Ведро",
    tags: ["fantasy", "outdoor"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#b88850",
      "#8a6238",
      "#d4a868",
      "#4a3a28",
      "#7a5a38",
      "#3a6a78",
      "#2a4a58",
    ],
    material: "wood",
    physical: true,
  });
}

/** Walk-through flower patch: leaf clumps + 3 bloom colors. */
function modelFlowers() {
  const h = 8;
  const g = emptyGrid(V, h, V);
  const clumps = [
    { cx: 5, cz: 5, r: 3.4, h: 4 },
    { cx: 10, cz: 7, r: 3.0, h: 5 },
    { cx: 7, cz: 11, r: 2.8, h: 4 },
  ];
  for (const c of clumps) {
    for (let y = 0; y < c.h; y++) {
      const r = c.r - y * 0.35;
      for (let z = 0; z < V; z++) {
        for (let x = 0; x < V; x++) {
          if (!inDisk(x, z, c.cx, c.cz, r)) continue;
          const n = hash32(x * 11 + y * 19 + z * 7) % 5;
          setV(g, x, y, z, n === 0 ? 1 : n === 1 ? 3 : 2);
        }
      }
    }
  }
  const blooms = [
    { x: 4, y: 3, z: 4, pal: 4 },
    { x: 6, y: 4, z: 5, pal: 5 },
    { x: 9, y: 4, z: 6, pal: 6 },
    { x: 11, y: 5, z: 8, pal: 4 },
    { x: 8, y: 4, z: 10, pal: 5 },
    { x: 6, y: 3, z: 11, pal: 6 },
    { x: 10, y: 3, z: 11, pal: 4 },
  ];
  for (const b of blooms) {
    box(g, b.x, b.y, b.z, b.x + 2, b.y + 2, b.z + 2, b.pal);
  }

  return finishModel(g, {
    id: "vox_fan_flowers",
    nameRu: "Цветник",
    tags: ["fantasy", "outdoor"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#2a4a24",
      "#3a6a30",
      "#5a8a40",
      "#d05070",
      "#e8c040",
      "#7a50b0",
    ],
    material: "grass",
    physical: false,
  });
}

/** Notice board: two posts, papers, nails. */
function modelNoticeBoard() {
  const h = 16;
  const g = emptyGrid(V, h, V);
  box(g, 1, 0, 11, 4, 16, 15, 1);
  box(g, 12, 0, 11, 15, 16, 15, 1);
  box(g, 2, 0, 12, 3, 16, 14, 2);
  box(g, 13, 0, 12, 14, 16, 14, 2);

  box(g, 1, 4, 10, 15, 15, 14, 3);
  box(g, 2, 5, 10, 14, 14, 11, 2);

  box(g, 3, 7, 8, 7, 12, 11, 4);
  box(g, 8, 6, 8, 13, 10, 11, 5);
  box(g, 6, 11, 8, 12, 14, 11, 6);
  box(g, 3, 12, 8, 5, 14, 11, 4);

  box(g, 3, 7, 8, 4, 8, 9, 7);
  box(g, 11, 6, 8, 12, 7, 9, 7);
  box(g, 8, 11, 8, 9, 12, 9, 7);

  return finishModel(g, {
    id: "vox_fan_notice_board",
    nameRu: "Доска объявлений",
    tags: ["fantasy", "outdoor"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5a4030",
      "#8a6a40",
      "#e8dcc0",
      "#c8b090",
      "#6a3030",
      "#2a2018",
    ],
    material: "wood",
    physical: true,
  });
}

/** Paper lantern on a thick pole; small glow, no cube shadows. */
function modelLanternPaper() {
  const h = 26;
  const g = emptyGrid(V, h, V);
  box(g, 5, 0, 5, 11, 2, 11, 7);
  box(g, 6, 2, 6, 10, 18, 10, 1);
  box(g, 7, 2, 7, 9, 18, 9, 2);

  box(g, 4, 17, 4, 12, 24, 12, 3);
  box(g, 5, 18, 5, 11, 23, 11, 4);
  box(g, 6, 18, 6, 10, 23, 10, 5, 200);
  box(g, 7, 19, 7, 9, 22, 9, 6, 255);
  box(g, 4, 23, 4, 12, 25, 12, 3);
  box(g, 6, 25, 6, 10, 26, 10, 2);
  box(g, 5, 17, 4, 6, 24, 5, 4);
  box(g, 10, 17, 11, 11, 24, 12, 4);

  return finishModel(g, {
    id: "vox_fan_lantern_paper",
    nameRu: "Бумажный фонарь",
    tags: ["fantasy", "outdoor", "light"],
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2a18",
      "#5a4030",
      "#e8d8b0",
      "#c8b080",
      "#d07830",
      "#ffc86a",
      "#8a7a68",
    ],
    material: "wood",
    physical: true,
    emissiveCastsLight: true,
    emissiveLightShadows: false,
    emissiveLightRange: 2.3,
    emissiveStrength: 0.75,
    emissiveTorchFlicker: true,
    emissiveSuppressHostShadow: true,
  });
}

const models = [
  modelBarrel(),
  modelBench(),
  modelFence(),
  modelHay(),
  modelBucket(),
  modelFlowers(),
  modelNoticeBoard(),
  modelLanternPaper(),
];

for (const model of models) writeModel(model);

const summary = models
  .map((m) => {
    const solids = m.voxels.filter((v) => v > 0).length;
    return `${m.id}  ${m.nameRu}  ${m.heightVoxels}h  ${m.sizeBlocks.x}x${m.sizeBlocks.z}  ${solids}vox  tags=${(m.tags ?? []).join(",")}`;
  })
  .join("\n");

console.log(`fantasy env3: ${models.length} models\n${summary}`);
