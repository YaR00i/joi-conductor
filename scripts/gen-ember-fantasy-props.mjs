/**
 * Wave 1 fantasy voxel props for Ember (docs/EMBER_VOXEL_BOT.md §8–9).
 * Run: node scripts/gen-ember-fantasy-props.mjs
 *
 * Writes only content/ember/voxels/models/vox_fan_*.json.
 * Does not touch registry.json, maps, or src.
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

function inDisk(x, z, cx, cz, r) {
  const dx = x + 0.5 - cx;
  const dz = z + 0.5 - cz;
  return dx * dx + dz * dz <= r * r;
}

function ring(g, y0, y1, cx, cz, rOut, rIn, pal) {
  for (let y = y0; y < y1; y++) {
    for (let z = 0; z < g.sz; z++) {
      for (let x = 0; x < g.sx; x++) {
        if (inDisk(x, z, cx, cz, rOut) && !inDisk(x, z, cx, cz, rIn)) {
          setV(g, x, y, z, pal);
        }
      }
    }
  }
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

/** Wooden way-marker: thick post, two boards pointing opposite ways. */
function modelSignpost() {
  const h = 28;
  const g = emptyGrid(V, h, V);
  box(g, 5, 0, 5, 11, 2, 11, 4);
  box(g, 6, 2, 6, 10, 26, 10, 1);
  box(g, 7, 2, 7, 9, 26, 9, 5);
  box(g, 6, 26, 6, 10, 28, 10, 2);

  box(g, 8, 14, 6, 15, 19, 10, 2);
  box(g, 9, 15, 7, 14, 18, 9, 3);
  box(g, 14, 15, 6, 16, 18, 10, 2);
  box(g, 15, 16, 7, 16, 17, 9, 2);

  box(g, 1, 19, 6, 9, 24, 10, 2);
  box(g, 2, 20, 7, 8, 23, 9, 3);
  box(g, 0, 20, 6, 2, 23, 10, 2);
  box(g, 0, 21, 7, 1, 22, 9, 2);

  box(g, 7, 16, 6, 9, 18, 7, 6);
  box(g, 7, 21, 9, 9, 23, 10, 6);

  return finishModel(g, {
    id: "vox_fan_signpost",
    nameRu: "Указатель",
    tags: ["fantasy", "outdoor"],
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3018",
      "#7a522c",
      "#c8a060",
      "#5a5448",
      "#3a2010",
      "#6a2018",
    ],
    material: "wood",
    physical: true,
  });
}

/** Village well: stone ring, posts, beam, bucket, small gable. */
function modelWell() {
  const h = 20;
  const g = emptyGrid(V, h, V);
  const cx = 8;
  const cz = 8;

  for (let y = 0; y < 8; y++) {
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        if (!inDisk(x, z, cx, cz, 6.4) || inDisk(x, z, cx, cz, 3.6)) continue;
        const n = hash32(x * 13 + y * 29 + z * 17) % 8;
        const pal = n === 0 ? 3 : n === 1 ? 2 : 1;
        setV(g, x, y, z, pal);
        if (n === 4 && y > 4) setV(g, x, y, z, 6);
      }
    }
  }

  ring(g, 8, 10, cx, cz, 7.1, 3.2, 2);
  ring(g, 9, 10, cx, cz, 7.1, 3.2, 3);
  for (let z = 0; z < V; z++) {
    for (let x = 0; x < V; x++) {
      if (!inDisk(x, z, cx, cz, 7.1) || inDisk(x, z, cx, cz, 3.2)) continue;
      if (hash32(x * 11 + z * 23) % 9 === 0) setV(g, x, 9, z, 6);
    }
  }

  box(g, 2, 10, 6, 5, 17, 10, 4);
  box(g, 11, 10, 6, 14, 17, 10, 4);
  box(g, 2, 16, 6, 14, 18, 10, 5);
  box(g, 7, 14, 7, 9, 16, 9, 8);

  for (let y = 11; y < 15; y++) {
    const r = y === 11 || y === 14 ? 1.7 : 2.1;
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        if (inDisk(x, z, cx, cz, r)) setV(g, x, y, z, 7);
      }
    }
  }

  box(g, 1, 16, 5, 15, 18, 11, 5);
  box(g, 3, 18, 5, 13, 20, 11, 4);
  box(g, 6, 18, 5, 10, 20, 11, 5);

  return finishModel(g, {
    id: "vox_fan_well",
    nameRu: "Колодец",
    tags: ["fantasy", "outdoor"],
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5a4a40",
      "#8a7a68",
      "#6a5a48",
      "#4a3018",
      "#7a5630",
      "#3a6a32",
      "#8a6240",
      "#2a2018",
    ],
    material: "stone",
    physical: true,
  });
}

/** Floor torch: plinth, thick stave, iron bowl, three-tone flame. */
function modelTorch() {
  const h = 28;
  const g = emptyGrid(V, h, V);
  box(g, 5, 0, 5, 11, 3, 11, 4);
  box(g, 6, 3, 6, 10, 20, 10, 1);
  box(g, 7, 3, 7, 9, 20, 9, 2);
  box(g, 5, 8, 5, 11, 10, 11, 3);
  box(g, 5, 16, 5, 11, 18, 11, 3);
  box(g, 5, 19, 5, 11, 22, 11, 3);
  box(g, 6, 21, 6, 10, 23, 10, 5, 180);
  box(g, 6, 22, 6, 10, 27, 10, 6, 230);
  box(g, 7, 23, 7, 9, 28, 9, 7, 255);
  setV(g, 6, 26, 7, 6, 210);
  setV(g, 9, 26, 8, 6, 210);

  return finishModel(g, {
    id: "vox_fan_torch",
    nameRu: "Напольный факел",
    tags: ["fantasy", "outdoor", "light"],
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#6a4424",
      "#2a2420",
      "#8a7a68",
      "#c07028",
      "#ffb44a",
      "#ffe8a0",
    ],
    material: "wood",
    physical: true,
    emissiveCastsLight: true,
    emissiveLightShadows: true,
    emissiveLightRange: 3.2,
    emissiveStrength: 1.05,
    emissiveTorchFlicker: true,
    emissiveSuppressHostShadow: true,
  });
}

/** Worn crate: darker planks, iron straps, moss, one broken face. */
function modelCrateOld() {
  const h = 10;
  const g = emptyGrid(V, h, V);
  box(g, 3, 0, 3, 13, 10, 13, 1);
  box(g, 3, 0, 3, 13, 10, 5, 2);
  box(g, 3, 0, 11, 13, 10, 13, 2);
  box(g, 3, 0, 3, 5, 10, 13, 2);
  box(g, 11, 0, 3, 13, 10, 13, 2);
  box(g, 3, 0, 3, 13, 2, 13, 2);
  box(g, 3, 8, 3, 13, 10, 13, 3);

  box(g, 3, 4, 3, 13, 6, 13, 5);
  box(g, 7, 2, 3, 9, 8, 13, 5);

  box(g, 5, 2, 3, 11, 8, 5, 1);
  box(g, 6, 3, 3, 8, 7, 4, 0);

  box(g, 10, 8, 10, 13, 10, 13, 6);
  box(g, 11, 6, 11, 13, 8, 13, 6);
  setV(g, 4, 9, 4, 4);
  setV(g, 5, 9, 12, 4);

  return finishModel(g, {
    id: "vox_fan_crate_old",
    nameRu: "Потёртый ящик",
    tags: ["fantasy", "outdoor"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5a3c20",
      "#3a2814",
      "#7a5830",
      "#8a6a40",
      "#4a4840",
      "#3a5a30",
    ],
    material: "wood",
    physical: true,
  });
}

/** Boulder: two offset lobes, flat top, moss, not a sphere. */
function modelRock() {
  const h = 12;
  const g = emptyGrid(V, h, V);
  for (let y = 0; y < h; y++) {
    const rA = 5.8 - Math.abs(y - 4) * 0.42;
    const rB = 4.2 - Math.abs(y - 3) * 0.38;
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        const a = inDisk(x, z, 7.2, 8.2, rA);
        const b = inDisk(x, z, 10.2, 6.6, rB);
        if (!a && !b) continue;
        const n = hash32(x * 19 + y * 41 + z * 7) % 6;
        let pal = n === 0 ? 3 : n === 1 ? 1 : 2;
        if (n === 5 && y < 4) pal = 6;
        if (y >= 8 && n !== 1) pal = 4;
        if (y >= 10) pal = 4;
        if (y === 0 && n === 2) pal = 5;
        setV(g, x, y, z, pal);
      }
    }
  }
  box(g, 3, 0, 10, 6, 3, 13, 1);
  box(g, 3, 3, 10, 5, 4, 12, 4);

  return finishModel(g, {
    id: "vox_fan_rock",
    nameRu: "Валун",
    tags: ["fantasy", "outdoor"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a4640",
      "#6a6460",
      "#8a8480",
      "#3a5a32",
      "#5a4a38",
      "#2e2e32",
    ],
    material: "stone",
    physical: true,
  });
}

/** Walk-through grass tuft: thick blades, a couple of flowers. */
function modelGrass() {
  const h = 8;
  const g = emptyGrid(V, h, V);
  const blades = [
    { x: 3, z: 5, h: 6, pal: 1, lean: 0 },
    { x: 5, z: 4, h: 8, pal: 2, lean: 1 },
    { x: 6, z: 6, h: 7, pal: 3, lean: 0 },
    { x: 8, z: 8, h: 8, pal: 2, lean: -1 },
    { x: 10, z: 5, h: 6, pal: 1, lean: 1 },
    { x: 9, z: 3, h: 5, pal: 3, lean: 0 },
    { x: 4, z: 8, h: 7, pal: 1, lean: 0 },
    { x: 11, z: 9, h: 6, pal: 2, lean: -1 },
    { x: 7, z: 10, h: 5, pal: 3, lean: 0 },
  ];
  for (const b of blades) {
    for (let y = 0; y < b.h; y++) {
      const lean = y >= 4 ? b.lean : 0;
      const pal = y < 2 && b.pal === 1 ? 6 : b.pal;
      box(g, b.x + lean, y, b.z, b.x + lean + 2, y + 1, b.z + 2, pal);
    }
  }
  box(g, 5, 6, 4, 7, 8, 6, 4);
  box(g, 9, 5, 8, 11, 7, 10, 4);
  box(g, 4, 0, 7, 6, 1, 9, 5);

  return finishModel(g, {
    id: "vox_fan_grass",
    nameRu: "Пучок травы",
    tags: ["fantasy", "outdoor"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#2d5428",
      "#3a6a32",
      "#4c7c3c",
      "#c8a040",
      "#6a3a20",
      "#244820",
    ],
    material: "grass",
    physical: false,
  });
}

/** Small roadside altar: steps, moss, gold bowl, candle flame. */
function modelShrine() {
  const h = 16;
  const g = emptyGrid(V, h, V);
  box(g, 2, 0, 2, 14, 2, 14, 1);
  box(g, 3, 2, 3, 13, 4, 13, 2);
  box(g, 5, 4, 5, 11, 8, 11, 1);
  box(g, 6, 7, 6, 10, 8, 10, 5);

  box(g, 2, 4, 6, 5, 14, 10, 1);
  box(g, 11, 4, 6, 14, 14, 10, 1);
  box(g, 2, 12, 6, 14, 14, 10, 2);
  box(g, 6, 13, 6, 10, 15, 10, 5);

  for (let z = 2; z < 14; z++) {
    for (let x = 2; x < 14; x++) {
      if (hash32(x * 17 + z * 9) % 11 === 0) setV(g, x, 1, z, 3);
    }
  }
  box(g, 3, 4, 11, 5, 6, 13, 3);
  box(g, 11, 4, 3, 13, 6, 5, 3);

  box(g, 6, 8, 6, 10, 10, 10, 6, 160);
  box(g, 6, 10, 6, 10, 14, 10, 7, 230);
  box(g, 7, 11, 7, 9, 16, 9, 8, 255);

  return finishModel(g, {
    id: "vox_fan_shrine",
    nameRu: "Алтарь",
    tags: ["fantasy", "outdoor", "light"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5a5448",
      "#8a8480",
      "#3a5a32",
      "#4a3018",
      "#c8a050",
      "#c07028",
      "#ffb44a",
      "#ffe8a0",
    ],
    material: "stone",
    physical: true,
    emissiveCastsLight: true,
    emissiveLightShadows: false,
    emissiveLightRange: 2.4,
    emissiveStrength: 0.85,
    emissiveTorchFlicker: true,
  });
}

/** Cut stump: bark, rings, roots, moss, a mushroom cluster. */
function modelStump() {
  const h = 10;
  const g = emptyGrid(V, h, V);
  const cx = 8;
  const cz = 8;
  for (let y = 0; y < 8; y++) {
    const r = y < 2 ? 6.4 : 5.6;
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        if (!inDisk(x, z, cx, cz, r)) continue;
        const dx = x + 0.5 - cx;
        const dz = z + 0.5 - cz;
        const rr = Math.sqrt(dx * dx + dz * dz);
        const n = hash32(x * 23 + y * 11 + z * 5) % 7;
        let pal = 1;
        if (y >= 6) {
          pal = rr < 1.6 ? 4 : rr < 3.2 ? 3 : 2;
        } else if (rr > 4.4) {
          pal = n === 0 ? 2 : 1;
        } else {
          pal = 2;
        }
        if (y > 4 && n === 3 && rr > 3.8) pal = 5;
        setV(g, x, y, z, pal);
      }
    }
  }
  box(g, 1, 0, 6, 4, 3, 10, 1);
  box(g, 12, 0, 7, 15, 2, 11, 1);
  box(g, 6, 0, 1, 10, 2, 4, 1);
  box(g, 10, 6, 11, 13, 8, 14, 5);
  box(g, 11, 7, 12, 14, 10, 15, 6);
  box(g, 12, 7, 13, 13, 8, 14, 7);

  return finishModel(g, {
    id: "vox_fan_tree_stump",
    nameRu: "Пень",
    tags: ["fantasy", "outdoor"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3018",
      "#6a4424",
      "#8a6238",
      "#c8a060",
      "#3a5a32",
      "#c04050",
      "#d8c8a0",
    ],
    material: "wood",
    physical: true,
  });
}

const builders = [
  modelSignpost,
  modelWell,
  modelTorch,
  modelCrateOld,
  modelRock,
  modelGrass,
  modelShrine,
  modelStump,
];

const models = builders.map((fn) => fn());
for (const model of models) writeModel(model);

const summary = models
  .map((m) => {
    const solids = m.voxels.filter((v) => v > 0).length;
    return `${m.id}  ${m.nameRu}  ${m.heightVoxels}h  ${solids}vox  tags=${(m.tags ?? []).join(",")}`;
  })
  .join("\n");

console.log(`fantasy props: ${models.length} models\n${summary}`);
