/**
 * Wave 2 fantasy environment props for Ember (docs/EMBER_VOXEL_BOT.md).
 * Run: node scripts/gen-ember-fantasy-env2.mjs
 *
 * Writes only the eight vox_fan_* ids listed below.
 * Does not touch Wave 1 files, registry.json, maps, or src.
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

/** Hateno-style stone lantern: pedestal, chamber, pagoda cap. */
function modelLanternStone() {
  const h = 24;
  const g = emptyGrid(V, h, V);

  box(g, 3, 0, 3, 13, 3, 13, 1);
  box(g, 4, 2, 4, 12, 4, 12, 2);
  for (let z = 3; z < 13; z++) {
    for (let x = 3; x < 13; x++) {
      if (hash32(x * 19 + z * 11) % 8 === 0) setV(g, x, 2, z, 4);
    }
  }

  box(g, 5, 4, 5, 11, 9, 11, 1);
  box(g, 6, 4, 6, 10, 9, 10, 2);
  box(g, 3, 9, 3, 13, 11, 13, 2);
  box(g, 4, 10, 4, 12, 11, 12, 3);

  box(g, 5, 11, 5, 11, 17, 11, 2);
  box(g, 6, 12, 6, 10, 16, 10, 5);
  box(g, 7, 12, 5, 9, 16, 6, 0);
  box(g, 7, 12, 10, 9, 16, 11, 0);
  box(g, 5, 12, 7, 6, 16, 9, 0);
  box(g, 10, 12, 7, 11, 16, 9, 0);

  box(g, 7, 12, 7, 9, 16, 9, 6, 200);
  box(g, 7, 13, 7, 9, 15, 9, 7, 255);

  box(g, 2, 16, 2, 14, 18, 14, 3);
  box(g, 4, 18, 4, 12, 20, 12, 2);
  box(g, 6, 20, 6, 10, 22, 10, 1);
  box(g, 7, 22, 7, 9, 24, 9, 3);
  box(g, 3, 16, 3, 5, 17, 5, 4);
  box(g, 11, 16, 11, 13, 17, 13, 4);

  return finishModel(g, {
    id: "vox_fan_lantern_stone",
    nameRu: "Каменный фонарь",
    tags: ["fantasy", "outdoor", "light"],
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3d3a38",
      "#6e6a62",
      "#a09a8e",
      "#4a5c3a",
      "#1e1c1a",
      "#d07830",
      "#ffc86a",
    ],
    material: "stone",
    physical: true,
    emissiveCastsLight: true,
    emissiveLightShadows: false,
    emissiveLightRange: 2.2,
    emissiveStrength: 0.8,
    emissiveTorchFlicker: true,
    emissiveSuppressHostShadow: true,
  });
}

/** Chunky two-wheel cart with a crate in the bed. 2×1 so wheels read. */
function modelCart() {
  const h = 12;
  const sx = V * 2;
  const g = emptyGrid(sx, h, V);

  function wheel(cx, cy, z0, z1) {
    for (let z = z0; z < z1; z++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < sx; x++) {
          if (!inDisk(x, y, cx, cy, 4.2)) continue;
          const hub = inDisk(x, y, cx, cy, 1.6);
          const rim = !inDisk(x, y, cx, cy, 3.3);
          setV(g, x, y, z, hub ? 4 : rim ? 4 : 2);
        }
      }
    }
  }
  wheel(21, 4, 2, 5);
  wheel(21, 4, 11, 14);
  box(g, 18, 3, 5, 24, 5, 11, 4);

  box(g, 4, 6, 3, 29, 8, 13, 1);
  box(g, 4, 8, 3, 29, 11, 5, 2);
  box(g, 4, 8, 11, 29, 11, 13, 2);
  box(g, 4, 6, 3, 6, 11, 13, 2);
  box(g, 27, 6, 3, 29, 11, 13, 2);
  box(g, 5, 7, 4, 28, 8, 12, 3);

  box(g, 0, 6, 6, 5, 8, 10, 1);
  box(g, 0, 7, 7, 2, 9, 9, 2);

  box(g, 12, 8, 5, 20, 12, 11, 5);
  box(g, 12, 8, 5, 20, 12, 7, 6);
  box(g, 12, 8, 9, 20, 12, 11, 6);
  box(g, 18, 11, 6, 20, 12, 8, 3);

  return finishModel(g, {
    id: "vox_fan_cart",
    nameRu: "Телега",
    tags: ["fantasy", "outdoor"],
    sizeBlocks: { x: 2, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#8b5a2b",
      "#5c3a18",
      "#c4924a",
      "#2c2a28",
      "#9a6a38",
      "#d4b070",
    ],
    material: "wood",
    physical: true,
  });
}

/** One heavy gate pillar with a short cross-arm (pair later). */
function modelGatePost() {
  const h = 28;
  const g = emptyGrid(V, h, V);

  box(g, 3, 0, 3, 13, 4, 13, 4);
  box(g, 4, 3, 4, 12, 5, 12, 5);
  box(g, 5, 4, 5, 11, 26, 11, 1);
  box(g, 6, 4, 6, 10, 26, 10, 2);
  box(g, 4, 8, 4, 12, 10, 12, 6);
  box(g, 4, 16, 4, 12, 18, 12, 6);
  box(g, 5, 22, 5, 11, 24, 11, 6);

  box(g, 10, 20, 6, 16, 24, 10, 2);
  box(g, 11, 21, 7, 16, 23, 9, 3);
  box(g, 14, 21, 6, 16, 23, 10, 6);

  box(g, 4, 26, 4, 12, 28, 12, 5);
  box(g, 6, 27, 6, 10, 28, 10, 4);

  return finishModel(g, {
    id: "vox_fan_gate_post",
    nameRu: "Столб ворот",
    tags: ["fantasy", "outdoor"],
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#2c1c10",
      "#4a3220",
      "#6a4a2c",
      "#3c3e42",
      "#8a8e92",
      "#1a1816",
    ],
    material: "wood",
    physical: true,
  });
}

/** Fallen forest log: bark, pale cut face, moss, a mushroom. */
function modelLog() {
  const h = 8;
  const g = emptyGrid(V, h, V);
  const cy = 3.2;
  const cz = 8;

  for (let x = 1; x < 15; x++) {
    const r = x <= 2 || x >= 13 ? 3.0 : 3.4;
    for (let y = 0; y < h; y++) {
      for (let z = 0; z < V; z++) {
        if (!inDisk(y, z, cy, cz, r)) continue;
        const dy = y + 0.5 - cy;
        const dz = z + 0.5 - cz;
        const rr = Math.sqrt(dy * dy + dz * dz);
        const n = hash32(x * 17 + y * 29 + z * 7) % 8;
        const cut = x <= 2 || x >= 13;
        let pal = 1;
        if (cut) {
          pal = rr < 1.1 ? 4 : rr < 2.1 ? 3 : 2;
        } else if (y >= 4 && n !== 1) {
          pal = 5;
        } else {
          pal = n === 0 ? 2 : 1;
        }
        setV(g, x, y, z, pal);
      }
    }
  }

  box(g, 13, 4, 10, 16, 6, 13, 5);
  box(g, 13, 5, 11, 16, 8, 14, 6);
  box(g, 14, 5, 12, 15, 6, 13, 7);
  box(g, 0, 0, 6, 2, 2, 9, 1);

  return finishModel(g, {
    id: "vox_fan_log",
    nameRu: "Упавшее бревно",
    tags: ["fantasy", "outdoor"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3d2a1c",
      "#5a4030",
      "#d2b48c",
      "#c4a070",
      "#2f5a28",
      "#b85c38",
      "#e8d0a8",
    ],
    material: "wood",
    physical: true,
  });
}

/** Water-edge reed clumps — thick stalks, walk-through. */
function modelReeds() {
  const h = 14;
  const g = emptyGrid(V, h, V);
  const stalks = [
    { x: 2, z: 4, h: 11, lean: 0 },
    { x: 4, z: 3, h: 13, lean: 1 },
    { x: 3, z: 6, h: 12, lean: 0 },
    { x: 6, z: 5, h: 14, lean: 1 },
    { x: 5, z: 7, h: 10, lean: 0 },
    { x: 8, z: 9, h: 13, lean: -1 },
    { x: 10, z: 8, h: 12, lean: 0 },
    { x: 9, z: 11, h: 11, lean: 1 },
    { x: 11, z: 10, h: 14, lean: 0 },
    { x: 7, z: 2, h: 9, lean: 0 },
    { x: 12, z: 5, h: 10, lean: -1 },
  ];
  for (const s of stalks) {
    for (let y = 0; y < s.h; y++) {
      const lean = y >= 6 ? s.lean : 0;
      let pal = 2;
      if (y < 3) pal = 5;
      else if (y < 5) pal = 6;
      else if (y >= s.h - 2) pal = 4;
      else if (y >= s.h - 4) pal = 3;
      else if ((s.x + s.z) % 3 === 0) pal = 1;
      box(g, s.x + lean, y, s.z, s.x + lean + 2, y + 1, s.z + 2, pal);
    }
  }
  box(g, 3, 0, 3, 7, 1, 8, 5);
  box(g, 8, 0, 8, 13, 1, 13, 5);

  return finishModel(g, {
    id: "vox_fan_reeds",
    nameRu: "Камыш",
    tags: ["fantasy", "outdoor", "water"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3d4a20",
      "#5a7a30",
      "#8aaa40",
      "#c4c060",
      "#4a3818",
      "#2a3818",
    ],
    material: "grass",
    physical: false,
  });
}

/** Cave spike: wet stone taper + a small crystal cluster. */
function modelStalagmite() {
  const h = 18;
  const g = emptyGrid(V, h, V);
  const cx = 8;
  const cz = 8;
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const r = 6.2 * (1 - t * 0.82);
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        if (!inDisk(x, z, cx, cz, r)) continue;
        const n = hash32(x * 13 + y * 37 + z * 19) % 7;
        let pal = n === 0 ? 3 : n === 1 ? 1 : 2;
        if ((x + z + y) % 5 === 0) pal = 4;
        if (y < 3 && n === 2) pal = 4;
        setV(g, x, y, z, pal);
      }
    }
  }
  box(g, 10, 3, 9, 13, 7, 12, 5);
  box(g, 11, 5, 10, 14, 9, 13, 6);
  box(g, 11, 6, 10, 13, 8, 12, 5);

  return finishModel(g, {
    id: "vox_fan_stalagmite",
    nameRu: "Сталагмит",
    tags: ["fantasy", "outdoor", "cave"],
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a3e44",
      "#5a626c",
      "#7a848e",
      "#242830",
      "#6a3a8a",
      "#c8a0e0",
    ],
    material: "stone",
    physical: true,
  });
}

/** Campfire: stone ring, crossed logs, tapered 3-tone flame. */
function modelCampfire() {
  const h = 12;
  const g = emptyGrid(V, h, V);
  const cx = 8;
  const cz = 8;

  for (let y = 0; y < 3; y++) {
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        if (!inDisk(x, z, cx, cz, 6.6) || inDisk(x, z, cx, cz, 4.2)) continue;
        const n = hash32(x * 11 + z * 23 + y) % 4;
        setV(g, x, y, z, n === 0 ? 2 : 1);
      }
    }
  }

  for (let x = 3; x < 13; x++) {
    box(g, x, 2, 6, x + 1, 4, 10, x % 3 === 0 ? 3 : 4);
  }
  for (let z = 4; z < 12; z++) {
    box(g, 6, 3, z, 10, 5, z + 1, z % 3 === 0 ? 3 : 4);
  }

  for (let y = 4; y < 12; y++) {
    const t = (y - 4) / 7;
    const r = 3.4 * (1 - t * 0.72);
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        if (!inDisk(x, z, cx, cz, r)) continue;
        let pal = 5;
        let em = 180;
        if (t > 0.35) {
          pal = 6;
          em = 230;
        }
        if (t > 0.65 || inDisk(x, z, cx, cz, r * 0.45)) {
          pal = 7;
          em = 255;
        }
        setV(g, x, y, z, pal, em);
      }
    }
  }

  return finishModel(g, {
    id: "vox_fan_campfire",
    nameRu: "Костёр",
    tags: ["fantasy", "outdoor", "light"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a4038",
      "#7a7060",
      "#2a1c10",
      "#5a3a20",
      "#d06820",
      "#ffb040",
      "#fff0b0",
    ],
    material: "stone",
    physical: true,
    emissiveCastsLight: true,
    emissiveLightShadows: true,
    emissiveLightRange: 3.4,
    emissiveStrength: 1.15,
    emissiveTorchFlicker: true,
  });
}

/** Forest-floor mushroom cluster: three thick caps. */
function modelMushrooms() {
  const h = 10;
  const g = emptyGrid(V, h, V);

  function mushroom(cx, cz, stemH, stemR, capR, capH, stemPal, capPal) {
    for (let y = 0; y < stemH; y++) {
      for (let z = 0; z < V; z++) {
        for (let x = 0; x < V; x++) {
          if (inDisk(x, z, cx, cz, stemR)) setV(g, x, y, z, stemPal);
        }
      }
    }
    for (let y = stemH; y < stemH + capH; y++) {
      const t = (y - stemH) / Math.max(1, capH - 1);
      const r = capR * (1 - t * 0.28);
      for (let z = 0; z < V; z++) {
        for (let x = 0; x < V; x++) {
          if (!inDisk(x, z, cx, cz, r)) continue;
          const n = hash32(x * 9 + y * 13 + z * 5) % 9;
          setV(g, x, y, z, n === 0 ? 6 : capPal);
        }
      }
    }
  }

  box(g, 2, 0, 2, 14, 1, 14, 5);
  mushroom(6, 6, 4, 1.7, 3.6, 3, 7, 2);
  mushroom(11, 9, 3, 1.5, 2.8, 3, 1, 3);
  mushroom(8, 12, 2, 1.4, 2.4, 3, 1, 4);

  return finishModel(g, {
    id: "vox_fan_mushrooms",
    nameRu: "Грибы",
    tags: ["fantasy", "outdoor"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#e8d8b0",
      "#c42828",
      "#8a5020",
      "#d8a040",
      "#2a4818",
      "#f0e8c8",
      "#6a4428",
    ],
    material: "grass",
    physical: true,
  });
}

const models = [
  modelLanternStone(),
  modelCart(),
  modelGatePost(),
  modelLog(),
  modelReeds(),
  modelStalagmite(),
  modelCampfire(),
  modelMushrooms(),
];

for (const model of models) writeModel(model);

const summary = models
  .map((m) => {
    const solids = m.voxels.filter((v) => v > 0).length;
    return `${m.id}  ${m.nameRu}  ${m.heightVoxels}h  ${m.sizeBlocks.x}x${m.sizeBlocks.z}  ${solids}vox  tags=${(m.tags ?? []).join(",")}`;
  })
  .join("\n");

console.log(`fantasy env2: ${models.length} models\n${summary}`);
