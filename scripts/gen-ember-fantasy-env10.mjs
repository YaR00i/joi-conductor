#!/usr/bin/env node
/**
 * Env10 mage-shop props for Ember.
 * Scaled for ~32-voxel-tall chibi people (explore camera 45–60°).
 *
 * Run: node scripts/gen-ember-fantasy-env10.mjs
 *
 * Writes only the eight vox_fan_* ids listed below.
 * Does not touch env1–9, existing vox_fan_*, vox_chr_*, vox_vil_*,
 * registry.json, maps, or src.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ember = path.join(root, "content", "ember");
const V = 16;

const TAGS = ["fantasy", "indoor", "shop", "mage"];
const TAGS_FURN = ["fantasy", "indoor", "shop", "mage", "furniture"];
const TAGS_LIGHT = ["fantasy", "indoor", "shop", "mage", "light"];

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

function magicLight(range, strength) {
  return {
    emissiveCastsLight: true,
    emissiveLightShadows: false,
    emissiveLightRange: range,
    emissiveStrength: strength,
    emissiveSuppressHostShadow: true,
  };
}

/** Fat round potion flask: bulb body, short neck, cork. Not a wine bottle. */
function flask(g, cx, y0, cz, body, glass, cork, bodyH = 5) {
  for (let y = y0; y < y0 + bodyH; y++) {
    const t = (y - y0) / Math.max(1, bodyH - 1);
    const r = 1.95 + Math.sin(t * Math.PI) * 0.9;
    for (let z = Math.floor(cz) - 4; z <= Math.ceil(cz) + 4; z++) {
      for (let x = Math.floor(cx) - 4; x <= Math.ceil(cx) + 4; x++) {
        if (!inDisk(x, z, cx, cz, r)) continue;
        const inner =
          y > y0 &&
          y < y0 + bodyH - 1 &&
          inDisk(x, z, cx, cz, Math.max(0.95, r - 1.1));
        setV(g, x, y, z, inner ? glass : body);
      }
    }
  }
  const neck0 = y0 + bodyH;
  box(g, Math.floor(cx) - 1, neck0, Math.floor(cz) - 1, Math.floor(cx) + 1, neck0 + 2, Math.floor(cz) + 1, body);
  box(g, Math.floor(cx) - 1, neck0 + 2, Math.floor(cz) - 1, Math.floor(cx) + 1, neck0 + 3, Math.floor(cz) + 1, cork);
}

/** Tall open wooden rack of fat colored potion flasks. Under a 32 vx crown. */
function modelPotionRack() {
  const h = 27;
  const g = emptyGrid(V, h, V);
  box(g, 1, 0, 3, 15, 2, 14, 1);
  post(g, 1, 2, 3, 4, 26, 6, 2, 1);
  post(g, 12, 2, 3, 15, 26, 6, 2, 1);
  post(g, 1, 2, 11, 4, 8, 14, 2, 1);
  post(g, 12, 2, 11, 15, 8, 14, 2, 1);
  box(g, 1, 2, 3, 15, 26, 5, 2);
  box(g, 1, 25, 3, 15, 27, 8, 3);

  function shelf(y0) {
    box(g, 2, y0, 5, 14, y0 + 2, 13, 3);
    box(g, 2, y0, 5, 14, y0 + 1, 13, 1);
    box(g, 2, y0, 12, 14, y0 + 2, 13, 1);
  }
  shelf(2);
  shelf(11);
  shelf(19);

  flask(g, 4, 4, 10.5, 4, 4, 8, 5);
  flask(g, 8, 4, 11, 5, 5, 8, 5);
  flask(g, 12, 4, 10.5, 6, 6, 8, 5);
  flask(g, 5, 13, 11, 7, 7, 8, 5);
  flask(g, 11, 13, 11, 4, 4, 8, 5);
  flask(g, 4, 20, 11, 5, 5, 8, 4);
  flask(g, 12, 20, 11, 6, 6, 8, 4);

  return finishModel(g, {
    id: "vox_fan_potion_rack",
    nameRu: "Стойка зелий",
    tags: TAGS_FURN,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5c3c22",
      "#8a5c34",
      "#b02838",
      "#2a5a98",
      "#2a7a48",
      "#6a2a88",
      "#c4a060",
    ],
    material: "wood",
    physical: true,
  });
}

/** Crystal ball on a short carved pedestal. Slight glow, no cube shadows. */
function modelOrb() {
  const h = 14;
  const g = emptyGrid(V, h, V);
  box(g, 4, 0, 4, 12, 2, 12, 1);
  box(g, 5, 2, 5, 11, 5, 11, 2);
  box(g, 4, 3, 4, 12, 4, 12, 3);
  box(g, 6, 5, 6, 10, 6, 10, 3);
  box(g, 7, 2, 10, 9, 5, 12, 3);

  const cx = 8;
  const cy = 9.4;
  const cz = 8;
  for (let y = 6; y < 14; y++) {
    for (let z = 3; z < 13; z++) {
      for (let x = 3; x < 13; x++) {
        if (!inBall(x, y, z, cx, cy, cz, 3.85)) continue;
        const core = inBall(x, y, z, cx, cy, cz, 1.55);
        const mid = inBall(x, y, z, cx, cy, cz, 2.55);
        const highlight = x >= 9 && y >= 10 && z >= 8;
        if (core) setV(g, x, y, z, 6, 230);
        else if (mid) setV(g, x, y, z, highlight ? 5 : 4, 140);
        else setV(g, x, y, z, highlight ? 5 : 4, 70);
      }
    }
  }
  setV(g, 9, 11, 9, 7, 255);

  return finishModel(g, {
    id: "vox_fan_orb",
    nameRu: "Сфера",
    tags: TAGS_LIGHT,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a342c",
      "#6a6258",
      "#c4a060",
      "#4a88b0",
      "#8ad0e8",
      "#d8f4ff",
      "#fff6e0",
    ],
    material: "stone",
    physical: true,
    ...magicLight(2.0, 0.6),
  });
}

/** Lectern + open book. Readable sloped silhouette, not a writing desk. */
function modelGrimoire() {
  const h = 18;
  const g = emptyGrid(V, h, V);
  box(g, 3, 0, 3, 13, 3, 13, 1);
  box(g, 4, 1, 4, 12, 3, 12, 2);
  post(g, 5, 3, 5, 11, 12, 11, 2, 1);
  box(g, 6, 4, 10, 10, 11, 12, 3);

  box(g, 2, 11, 3, 14, 13, 7, 2);
  box(g, 2, 12, 6, 14, 15, 10, 2);
  box(g, 2, 14, 9, 14, 16, 13, 3);
  box(g, 2, 15, 11, 14, 17, 14, 1);

  box(g, 1, 12, 4, 7, 15, 10, 5);
  box(g, 9, 13, 5, 15, 16, 12, 5);
  box(g, 2, 13, 6, 7, 16, 11, 8);
  box(g, 9, 14, 7, 14, 17, 12, 8);
  box(g, 6, 14, 6, 10, 18, 12, 4);
  box(g, 3, 13, 9, 6, 15, 12, 6);
  box(g, 10, 14, 10, 13, 16, 13, 6);
  box(g, 4, 13, 10, 5, 14, 12, 7);
  box(g, 11, 14, 11, 12, 15, 13, 7);

  return finishModel(g, {
    id: "vox_fan_grimoire",
    nameRu: "Гримуар",
    tags: TAGS_FURN,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5c3c22",
      "#8a5c34",
      "#4a1c28",
      "#e8dcc4",
      "#2a1c18",
      "#c4a060",
      "#c8b898",
    ],
    material: "wood",
    physical: true,
  });
}

/** Stone mortar and pestle on a small board, plus reagent lumps. */
function modelMortar() {
  const h = 8;
  const g = emptyGrid(V, h, V);
  box(g, 2, 0, 3, 14, 2, 13, 1);
  for (let x = 2; x < 14; x++) {
    box(g, x, 1, 3, x + 1, 2, 13, x % 3 === 1 ? 2 : 1);
  }

  for (let y = 2; y < 7; y++) {
    const t = (y - 2) / 4;
    const r = 3.5 - Math.abs(t - 0.35) * 0.7;
    const rIn = y >= 4 ? 2.15 : 0;
    for (let z = 3; z < 13; z++) {
      for (let x = 1; x < 11; x++) {
        if (!inDisk(x, z, 6, 8, r)) continue;
        if (rIn && inDisk(x, z, 6, 8, rIn)) {
          setV(g, x, y, z, y === 4 ? 4 : 0);
          continue;
        }
        setV(g, x, y, z, y < 4 ? 3 : 4);
      }
    }
  }

  box(g, 7, 3, 5, 10, 4, 8, 5);
  box(g, 9, 3, 4, 12, 5, 7, 5);
  box(g, 10, 4, 3, 13, 7, 6, 5);
  box(g, 12, 6, 3, 14, 8, 5, 4);

  box(g, 11, 2, 9, 14, 4, 12, 6);
  box(g, 12, 3, 10, 14, 5, 12, 6);
  box(g, 2, 2, 10, 5, 4, 13, 7);
  box(g, 10, 2, 11, 13, 3, 14, 8);

  return finishModel(g, {
    id: "vox_fan_mortar",
    nameRu: "Ступка",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5c3c22",
      "#8a5c34",
      "#4a4640",
      "#7a7670",
      "#8a7a58",
      "#3a7a40",
      "#6a2a78",
      "#c06028",
    ],
    material: "stone",
    physical: true,
  });
}

/** Standing display rack holding 2–3 shop staves. Not equippable weapons. */
function modelStaffRack() {
  const h = 26;
  const g = emptyGrid(V, h, V);
  box(g, 1, 0, 4, 15, 2, 13, 1);
  post(g, 1, 2, 5, 4, 24, 9, 2, 1);
  post(g, 12, 2, 5, 15, 24, 9, 2, 1);
  box(g, 1, 22, 5, 15, 25, 10, 3);
  box(g, 1, 10, 5, 15, 12, 9, 3);
  box(g, 2, 11, 8, 5, 13, 11, 2);
  box(g, 6, 11, 8, 10, 13, 11, 2);
  box(g, 11, 11, 8, 14, 13, 11, 2);

  box(g, 2, 2, 9, 4, 20, 11, 4);
  box(g, 2, 20, 8, 5, 23, 12, 5);
  for (let y = 21; y < 25; y++) {
    for (let z = 7; z < 13; z++) {
      for (let x = 1; x < 6; x++) {
        if (!inBall(x, y, z, 3.5, 22.6, 10, 2.15)) continue;
        const core = inBall(x, y, z, 3.5, 22.6, 10, 0.95);
        setV(g, x, y, z, core ? 8 : 6);
      }
    }
  }

  box(g, 7, 2, 8, 9, 22, 10, 4);
  box(g, 6, 21, 7, 10, 23, 11, 5);
  for (let y = 22; y < 26; y++) {
    for (let z = 6; z < 12; z++) {
      for (let x = 5; x < 12; x++) {
        const moon = inDisk(x, y, 8.2, 24.1, 2.35) && !inDisk(x, y, 9.5, 24.5, 1.7);
        if (moon && z >= 7 && z < 11) setV(g, x, y, z, 8);
      }
    }
  }

  box(g, 12, 2, 9, 14, 18, 11, 4);
  box(g, 11, 17, 8, 15, 20, 12, 5);
  box(g, 12, 19, 8, 14, 23, 12, 7);
  box(g, 12, 21, 9, 14, 23, 11, 8);

  return finishModel(g, {
    id: "vox_fan_staff_rack",
    nameRu: "Стойка посохов",
    tags: TAGS_FURN,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5c3c22",
      "#8a5c34",
      "#6a5440",
      "#c4a060",
      "#4a88b0",
      "#b02838",
      "#e8dcc4",
    ],
    material: "wood",
    physical: true,
  });
}

/** Bunches of herbs on a ceiling rail. physical: false. */
function modelHerbHang() {
  const h = 16;
  const g = emptyGrid(V, h, V);
  box(g, 1, 14, 6, 15, 16, 10, 1);
  box(g, 1, 14, 7, 3, 16, 9, 2);
  box(g, 7, 14, 7, 9, 16, 9, 2);
  box(g, 13, 14, 7, 15, 16, 9, 2);

  function bunch(x0, x1, yBot, z0, leaf, flower) {
    box(g, x0 + 1, 12, 7, x1 - 1, 15, 9, 2);
    for (let y = yBot; y < 14; y++) {
      const t = (y - yBot) / Math.max(1, 13 - yBot);
      const widen = 0.4 + t * 0.7;
      for (let z = z0; z < z0 + 6; z++) {
        for (let x = x0; x < x1; x++) {
          const cx = (x0 + x1) / 2;
          const cz = z0 + 2.6;
          const rx = ((x1 - x0) / 2) * widen + 0.4;
          const rz = 2.1 * widen + 0.3;
          const nx = (x + 0.5 - cx) / rx;
          const nz = (z + 0.5 - cz) / rz;
          if (nx * nx + nz * nz > 1.05) continue;
          const n = hash32(x * 11 + y * 7 + z * 3) % 7;
          let pal = n === 0 ? 5 : n === 1 ? 7 : leaf;
          if (flower && n === 2 && y > yBot + 2) pal = 6;
          setV(g, x, y, z, pal);
        }
      }
    }
  }

  bunch(1, 6, 4, 5, 3, false);
  bunch(6, 11, 3, 4, 4, true);
  bunch(10, 15, 5, 5, 3, false);

  return finishModel(g, {
    id: "vox_fan_herb_hang",
    nameRu: "Связки трав",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3420",
      "#8a7a50",
      "#2a5a28",
      "#3a7a38",
      "#6a9a40",
      "#7a3a78",
      "#3a2a18",
    ],
    material: "cloth",
    physical: false,
  });
}

/** Low stone bowl of glowing water. Light, no cube / host shadows. */
function modelScryBowl() {
  const h = 6;
  const g = emptyGrid(V, h, V);
  box(g, 3, 0, 3, 13, 2, 13, 1);
  for (let y = 1; y < 5; y++) {
    const t = (y - 1) / 3;
    const r = 5.7 - t * 0.35;
    const rIn = y >= 2 ? 3.9 : 0;
    for (let z = 1; z < 15; z++) {
      for (let x = 1; x < 15; x++) {
        if (!inDisk(x, z, 8, 8, r)) continue;
        if (rIn && inDisk(x, z, 8, 8, rIn)) {
          if (y === 3) {
            const bright = inDisk(x, z, 8, 8, 1.6);
            setV(g, x, y, z, bright ? 6 : 5, bright ? 240 : 170);
          } else if (y === 2) {
            setV(g, x, y, z, 4, 90);
          }
          continue;
        }
        setV(g, x, y, z, y < 2 ? 1 : 2);
      }
    }
  }
  for (let z = 2; z < 14; z++) {
    for (let x = 2; x < 14; x++) {
      if (!inDisk(x, z, 8, 8, 5.5) || inDisk(x, z, 8, 8, 4.1)) continue;
      setV(g, x, 4, z, 3);
    }
  }
  box(g, 7, 3, 7, 9, 4, 9, 6, 255);

  return finishModel(g, {
    id: "vox_fan_scry_bowl",
    nameRu: "Чаша прорицания",
    tags: TAGS_LIGHT,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a3834",
      "#6a665c",
      "#8a8480",
      "#2a4a68",
      "#3a88b8",
      "#a8e8ff",
    ],
    material: "stone",
    physical: true,
    ...magicLight(1.8, 0.55),
  });
}

/** Hanging shop sign: moon / star on a board. physical: false. */
function modelMageSign() {
  const h = 16;
  const g = emptyGrid(V, h, V);
  box(g, 3, 14, 7, 5, 16, 9, 1);
  box(g, 11, 14, 7, 13, 16, 9, 1);
  box(g, 3, 12, 7, 5, 15, 9, 1);
  box(g, 11, 12, 7, 13, 15, 9, 1);

  box(g, 1, 3, 5, 15, 13, 12, 2);
  box(g, 2, 4, 6, 14, 12, 12, 3);
  box(g, 2, 4, 6, 14, 5, 7, 7);
  box(g, 2, 11, 6, 14, 12, 7, 7);

  for (let y = 4; y < 12; y++) {
    for (let x = 2; x < 10; x++) {
      const moon = inDisk(x, y, 5.8, 8, 3.15) && !inDisk(x, y, 7.5, 8.7, 2.25);
      if (moon) box(g, x, y, 10, x + 1, y + 1, 13, 5);
    }
  }
  const star = [
    [11, 9],
    [10, 9],
    [12, 9],
    [11, 8],
    [11, 10],
    [10, 8],
    [12, 10],
    [10, 10],
    [12, 8],
  ];
  for (const [x, y] of star) box(g, x, y, 10, x + 1, y + 1, 13, 6);
  setV(g, 11, 9, 12, 4);

  return finishModel(g, {
    id: "vox_fan_mage_sign",
    nameRu: "Вывеска мага",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5a5040",
      "#3a2414",
      "#6a3a18",
      "#c4a060",
      "#e8d8b0",
      "#d8c070",
      "#2a1c10",
    ],
    material: "wood",
    physical: false,
  });
}

const models = [
  modelPotionRack(),
  modelOrb(),
  modelGrimoire(),
  modelMortar(),
  modelStaffRack(),
  modelHerbHang(),
  modelScryBowl(),
  modelMageSign(),
];

for (const model of models) writeModel(model);

const summary = models
  .map((m) => {
    const solids = m.voxels.filter((v) => v > 0).length;
    const blocks = `${m.sizeBlocks.x}×${m.sizeBlocks.y}×${m.sizeBlocks.z}`;
    const extra = m.physical === false ? "  nophys" : "";
    const light = m.emissiveCastsLight ? "  light" : "";
    return `${m.id}  ${m.nameRu}  ${m.heightVoxels}h  ${blocks}  ${solids}vox  tags=${(m.tags ?? []).join(",")}${extra}${light}`;
  })
  .join("\n");

console.log(`fantasy env10 mage shop: ${models.length} models\n${summary}`);
