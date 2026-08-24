/**
 * Env4 fantasy nature props for Ember (trees, plants, rocks, crystals).
 * Run: node scripts/gen-ember-fantasy-env4.mjs
 *
 * Writes only the eight vox_fan_* ids listed below.
 * Does not touch Wave 1 / env2 / env3 files, registry.json, maps, or src.
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

function leafPal(x, y, z, dark, mid, lite) {
  const n = hash32(x * 19 + y * 41 + z * 7) % 8;
  if (n === 0) return dark;
  if (n === 1 || n === 2) return lite;
  return mid;
}

/** Shift the trunk as it rises: lean plus a shallow S-curve (1–2 voxels). */
function trunkBend(y, y0, y1, leanX, leanZ, curveX, curveZ) {
  const t = (y - y0) / Math.max(1, y1 - y0);
  return {
    ox: leanX * t + curveX * Math.sin(t * Math.PI),
    oz: leanZ * t + curveZ * Math.sin(t * Math.PI * 1.7),
  };
}

/**
 * Irregular trunk: slight root flare, missing corners, nubs, optional knot.
 * Mid-trunk reads ~2×2 to 3×3 — thinner than the canopy, not a fat plinth.
 */
function paintTrunk(g, spec) {
  const {
    cx,
    cz,
    y0,
    y1,
    rx,
    rz,
    leanX,
    leanZ,
    curveX,
    curveZ,
    palBark,
    palCore,
    palDark,
    knotY,
    nubs,
    marks,
  } = spec;

  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    const { ox, oz } = trunkBend(y, y0, y1, leanX, leanZ, curveX, curveZ);
    const flare = y <= y0 + 1 ? 1.12 : y <= y0 + 3 ? 1.05 : 1;
    const knot = knotY != null && Math.abs(y - knotY) <= 1 ? 1.12 : 1;
    const sliceRx = rx * flare * knot * (1 - t * 0.12);
    const sliceRz = rz * flare * knot * (1 - t * 0.08);
    const scx = cx + ox;
    const scz = cz + oz;
    const chop = hash32(y * 97 + 3) % 4;

    for (let z = 0; z < g.sz; z++) {
      for (let x = 0; x < g.sx; x++) {
        const dx = x + 0.5 - scx;
        const dz = z + 0.5 - scz;
        if ((dx * dx) / (sliceRx * sliceRx) + (dz * dz) / (sliceRz * sliceRz) > 1) {
          continue;
        }
        if (chop === 0 && dx > sliceRx * 0.35 && dz > sliceRz * 0.35 && y % 3 === 1) {
          continue;
        }
        if (chop === 1 && dx < -sliceRx * 0.4 && y % 4 === 2) continue;
        const n = hash32(x * 13 + y * 29 + z * 11) % 7;
        let pal = n === 0 ? palDark : n === 1 ? palCore : palBark;
        if (marks) {
          const mark = marks(x, y, z, scx, scz);
          if (mark != null) pal = mark;
        }
        setV(g, x, y, z, pal);
      }
    }
  }

  for (const nub of nubs ?? []) {
    const { ox, oz } = trunkBend(nub.y, y0, y1, leanX, leanZ, curveX, curveZ);
    const x = Math.round(cx + ox + nub.dx);
    const z = Math.round(cz + oz + nub.dz);
    box(g, x, nub.y, z, x + 2, nub.y + nub.h, z + 2, nub.pal ?? palBark);
  }

  const { ox: ox0, oz: oz0 } = trunkBend(y0, y0, y1, leanX, leanZ, curveX, curveZ);
  const bx = Math.round(cx + ox0);
  const bz = Math.round(cz + oz0);
  for (const root of spec.roots ?? []) {
    box(
      g,
      bx + root.dx,
      y0,
      bz + root.dz,
      bx + root.dx + root.w,
      y0 + root.h,
      bz + root.dz + root.d,
      root.pal ?? palBark,
    );
  }
}

/** Tall evergreen: irregular leaning trunk, stacked conical shelves. */
function modelPine() {
  const h = 40;
  const g = emptyGrid(V, h, V);
  const cx = 7.5;
  const cz = 8;
  const lean = { leanX: 1.4, leanZ: -0.6, curveX: 0.7, curveZ: 1.1 };

  paintTrunk(g, {
    cx,
    cz,
    y0: 0,
    y1: 18,
    rx: 1.45,
    rz: 1.35,
    ...lean,
    palBark: 1,
    palCore: 2,
    palDark: 1,
    knotY: 8,
    nubs: [
      { y: 6, dx: 1, dz: 0, h: 2, pal: 2 },
      { y: 12, dx: -2, dz: 1, h: 2, pal: 1 },
    ],
    roots: [
      { dx: -2, dz: 0, w: 2, d: 2, h: 2, pal: 1 },
      { dx: 1, dz: 1, w: 2, d: 2, h: 2, pal: 2 },
    ],
  });

  const layers = [
    { y0: 10, y1: 15, r: 7.1, ox: 0, oz: 0.2 },
    { y0: 14, y1: 19, r: 6.3, ox: 0.3, oz: -0.2 },
    { y0: 18, y1: 23, r: 5.5, ox: -0.2, oz: 0.2 },
    { y0: 22, y1: 27, r: 4.6, ox: 0.2, oz: 0 },
    { y0: 26, y1: 31, r: 3.7, ox: 0, oz: -0.2 },
    { y0: 30, y1: 35, r: 2.9, ox: 0.1, oz: 0.1 },
    { y0: 34, y1: 40, r: 2.1, ox: 0, oz: 0 },
  ];
  for (const L of layers) {
    const midY = (L.y0 + L.y1) / 2;
    const bend = trunkBend(midY, 0, 18, lean.leanX, lean.leanZ, lean.curveX, lean.curveZ);
    for (let y = L.y0; y < L.y1; y++) {
      const t = (y - L.y0) / Math.max(1, L.y1 - L.y0 - 1);
      const r = L.r * (1 - t * 0.38);
      const lcx = cx + bend.ox + L.ox;
      const lcz = cz + bend.oz + L.oz;
      for (let z = 0; z < V; z++) {
        for (let x = 0; x < V; x++) {
          if (!inDisk(x, z, lcx, lcz, r)) continue;
          const edge = !inDisk(x, z, lcx, lcz, r - 0.9);
          const n = hash32(x * 13 + y * 29 + z * 11) % 6;
          if (edge && n === 0) continue;
          setV(g, x, y, z, leafPal(x, y, z, 3, 4, 5));
        }
      }
    }
  }
  const tip = trunkBend(18, 0, 18, lean.leanX, lean.leanZ, lean.curveX, lean.curveZ);
  box(g, Math.round(cx + tip.ox), 36, Math.round(cz + tip.oz), Math.round(cx + tip.ox) + 2, 40, Math.round(cz + tip.oz) + 2, 6);

  return finishModel(g, {
    id: "vox_fan_pine",
    nameRu: "Сосна",
    tags: ["fantasy", "outdoor", "forest"],
    sizeBlocks: { x: 1, y: 3, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2814",
      "#5a3c20",
      "#0e2818",
      "#1a4a28",
      "#2e6a38",
      "#4a7a48",
    ],
    material: "wood",
    physical: true,
  });
}

/** Broad oak: 2×2 crown, irregular leaf clumps, thick trunk. */
function modelOak() {
  const h = 42;
  const S = V * 2;
  const g = emptyGrid(S, h, S);
  const cx = 15.5;
  const cz = 16;
  const lean = { leanX: -1.6, leanZ: 1.2, curveX: 1.1, curveZ: -0.8 };

  paintTrunk(g, {
    cx,
    cz,
    y0: 0,
    y1: 20,
    rx: 1.7,
    rz: 1.55,
    ...lean,
    palBark: 1,
    palCore: 2,
    palDark: 3,
    knotY: 11,
    nubs: [
      { y: 7, dx: 2, dz: -1, h: 2, pal: 2 },
      { y: 14, dx: -2, dz: 1, h: 2, pal: 1 },
      { y: 9, dx: 1, dz: 2, h: 2, pal: 3 },
    ],
    roots: [
      { dx: -2, dz: -1, w: 2, d: 2, h: 2, pal: 1 },
      { dx: 2, dz: 1, w: 2, d: 2, h: 2, pal: 2 },
      { dx: 0, dz: -2, w: 2, d: 2, h: 2, pal: 3 },
    ],
  });

  const crown = trunkBend(18, 0, 20, lean.leanX, lean.leanZ, lean.curveX, lean.curveZ);
  const clumps = [
    { cx: 15, cz: 16, y0: 16, y1: 34, r: 10.4 },
    { cx: 21, cz: 13, y0: 18, y1: 33, r: 7.2 },
    { cx: 11, cz: 21, y0: 17, y1: 31, r: 6.8 },
    { cx: 20, cz: 20, y0: 20, y1: 32, r: 6.0 },
    { cx: 12, cz: 12, y0: 19, y1: 30, r: 5.6 },
    { cx: 16, cz: 15, y0: 30, y1: 42, r: 6.4 },
  ];
  for (const c of clumps) {
    for (let y = c.y0; y < c.y1; y++) {
      const mid = 1 - Math.abs((y - (c.y0 + c.y1) / 2) / ((c.y1 - c.y0) / 2));
      const r = c.r * (0.55 + mid * 0.45);
      const lcx = c.cx + crown.ox;
      const lcz = c.cz + crown.oz;
      for (let z = 0; z < S; z++) {
        for (let x = 0; x < S; x++) {
          if (!inDisk(x, z, lcx, lcz, r)) continue;
          const n = hash32(x * 17 + y * 23 + z * 5) % 9;
          if (n === 0 && !inDisk(x, z, lcx, lcz, r - 1.4)) continue;
          setV(g, x, y, z, leafPal(x, y, z, 4, 5, 6));
        }
      }
    }
  }
  box(
    g,
    Math.round(14 + crown.ox),
    18,
    Math.round(14 + crown.oz),
    Math.round(18 + crown.ox),
    24,
    Math.round(18 + crown.oz),
    2,
  );

  return finishModel(g, {
    id: "vox_fan_oak",
    nameRu: "Дуб",
    tags: ["fantasy", "outdoor", "forest"],
    sizeBlocks: { x: 2, y: 3, z: 2 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3018",
      "#6a4424",
      "#2a1c10",
      "#1e3a18",
      "#3a6a28",
      "#5a8a38",
    ],
    material: "wood",
    physical: true,
  });
}

/** Birch: pale bark with dark dashes, tall slim crown. */
function modelBirch() {
  const h = 38;
  const g = emptyGrid(V, h, V);
  const cx = 7.5;
  const cz = 8;
  const lean = { leanX: 1.2, leanZ: 1.5, curveX: -1.0, curveZ: 0.8 };

  paintTrunk(g, {
    cx,
    cz,
    y0: 0,
    y1: 22,
    rx: 1.2,
    rz: 1.15,
    ...lean,
    palBark: 1,
    palCore: 2,
    palDark: 4,
    knotY: 10,
    nubs: [
      { y: 8, dx: 1, dz: 0, h: 2, pal: 2 },
      { y: 15, dx: -2, dz: 1, h: 2, pal: 4 },
    ],
    roots: [
      { dx: -2, dz: 0, w: 2, d: 2, h: 2, pal: 2 },
      { dx: 1, dz: 1, w: 2, d: 2, h: 2, pal: 4 },
    ],
    marks: (x, y, z, scx, scz) => {
      if (y % 3 !== 0 && y % 3 !== 1) return null;
      const side = Math.abs(x - scx) > Math.abs(z - scz);
      if (side && x > scx && (y + z) % 5 === 0) return 3;
      if (!side && z < scz && (y + x) % 6 === 0) return 3;
      return null;
    },
  });

  const crown = trunkBend(20, 0, 22, lean.leanX, lean.leanZ, lean.curveX, lean.curveZ);
  const clumps = [
    { cx: 7.2, cz: 8.0, y0: 16, y1: 28, r: 5.2 },
    { cx: 9.0, cz: 7.0, y0: 20, y1: 32, r: 4.4 },
    { cx: 8.0, cz: 9.2, y0: 24, y1: 36, r: 4.0 },
    { cx: 8.0, cz: 8.0, y0: 32, y1: 38, r: 3.1 },
  ];
  for (const c of clumps) {
    for (let y = c.y0; y < c.y1; y++) {
      const mid = 1 - Math.abs((y - (c.y0 + c.y1) / 2) / ((c.y1 - c.y0) / 2));
      const r = c.r * (0.6 + mid * 0.4);
      const lcx = c.cx + crown.ox;
      const lcz = c.cz + crown.oz;
      for (let z = 0; z < V; z++) {
        for (let x = 0; x < V; x++) {
          if (!inDisk(x, z, lcx, lcz, r)) continue;
          setV(g, x, y, z, leafPal(x, y, z, 5, 6, 7));
        }
      }
    }
  }

  return finishModel(g, {
    id: "vox_fan_birch",
    nameRu: "Берёза",
    tags: ["fantasy", "outdoor", "forest"],
    sizeBlocks: { x: 1, y: 3, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#e8dcc8",
      "#d4c4a8",
      "#2a2420",
      "#5a4a38",
      "#3a6a30",
      "#5a8a40",
      "#7aaa50",
    ],
    material: "wood",
    physical: true,
  });
}

/** Walk-through fern: thick arched fronds. */
function modelFern() {
  const h = 10;
  const g = emptyGrid(V, h, V);
  box(g, 6, 0, 6, 10, 2, 10, 5);
  const fronds = [
    { x: 7, z: 7, dx: -1, dz: 0, len: 6, pal: 2 },
    { x: 8, z: 7, dx: 1, dz: 0, len: 6, pal: 3 },
    { x: 7, z: 8, dx: 0, dz: 1, len: 5, pal: 2 },
    { x: 8, z: 7, dx: 0, dz: -1, len: 5, pal: 1 },
    { x: 7, z: 7, dx: -1, dz: -1, len: 5, pal: 3 },
    { x: 8, z: 8, dx: 1, dz: 1, len: 5, pal: 2 },
    { x: 7, z: 8, dx: -1, dz: 1, len: 4, pal: 4 },
    { x: 8, z: 7, dx: 1, dz: -1, len: 4, pal: 4 },
  ];
  for (const f of fronds) {
    for (let i = 0; i < f.len; i++) {
      const rise = i < 3 ? i + 2 : 5 - (i - 3);
      const x = f.x + f.dx * i;
      const z = f.z + f.dz * i;
      const pal = i >= f.len - 1 ? 6 : f.pal;
      box(g, x, rise, z, x + 2, rise + 2, z + 2, pal);
    }
  }

  return finishModel(g, {
    id: "vox_fan_fern",
    nameRu: "Папоротник",
    tags: ["fantasy", "outdoor", "forest"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#163820",
      "#1e4a28",
      "#2d6a38",
      "#4a8a48",
      "#3a5a28",
      "#6aaa50",
    ],
    material: "grass",
    physical: false,
  });
}

/** Solid berry shrub with 2-voxel fruit accents. */
function modelBushBerry() {
  const h = 12;
  const g = emptyGrid(V, h, V);
  for (let y = 0; y < h; y++) {
    const r = 6.4 - Math.abs(y - 5) * 0.55;
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        const a = inDisk(x, z, 7.4, 8.0, r);
        const b = inDisk(x, z, 9.2, 7.0, r * 0.72);
        if (!a && !b) continue;
        const n = hash32(x * 17 + y * 31 + z * 9) % 7;
        setV(g, x, y, z, n === 0 ? 3 : n === 1 ? 1 : 2);
      }
    }
  }
  box(g, 7, 0, 7, 9, 3, 9, 6);
  const berries = [
    [4, 6, 7],
    [6, 8, 5],
    [10, 7, 6],
    [9, 9, 10],
    [5, 5, 10],
    [11, 6, 9],
    [8, 10, 7],
  ];
  for (const [x, y, z] of berries) {
    box(g, x, y, z, x + 2, y + 2, z + 2, hash32(x + z) % 2 === 0 ? 4 : 5);
  }

  return finishModel(g, {
    id: "vox_fan_bush_berry",
    nameRu: "Ягодный куст",
    tags: ["fantasy", "outdoor", "forest"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#1e3818",
      "#2a4a24",
      "#3a6a30",
      "#a02030",
      "#c04050",
      "#4a3018",
    ],
    material: "grass",
    physical: true,
  });
}

/** Angular ore boulder with gold / copper veins. */
function modelRockOre() {
  const h = 12;
  const g = emptyGrid(V, h, V);
  for (let y = 0; y < h; y++) {
    const rA = 5.6 - Math.abs(y - 4) * 0.4;
    const rB = 4.0 - Math.abs(y - 3) * 0.35;
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        const a = inDisk(x, z, 7.0, 8.4, rA);
        const b = inDisk(x, z, 10.4, 6.4, rB);
        if (!a && !b) continue;
        const n = hash32(x * 19 + y * 41 + z * 7) % 6;
        let pal = n === 0 ? 3 : n === 1 ? 1 : 2;
        const vein = (x + y * 2 + z) % 7 === 0 || (x - z + y) % 8 === 0;
        if (vein && y > 1) pal = n === 2 ? 6 : 4;
        if (vein && y > 6 && n === 3) pal = 5;
        setV(g, x, y, z, pal);
      }
    }
  }
  box(g, 2, 0, 10, 6, 4, 14, 1);
  box(g, 3, 2, 11, 5, 5, 13, 4);

  return finishModel(g, {
    id: "vox_fan_rock_ore",
    nameRu: "Рудный валун",
    tags: ["fantasy", "outdoor", "cave"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a4640",
      "#6a6460",
      "#2e2e32",
      "#c4a040",
      "#e8c060",
      "#b86a30",
    ],
    material: "stone",
    physical: true,
  });
}

function shard(g, x0, y0, z0, dx, dy, dz, steps, w0, pals, em = 0) {
  for (let i = 0; i < steps; i++) {
    const t = i / Math.max(1, steps - 1);
    const w = Math.max(2, Math.round(w0 * (1 - t * 0.55)));
    const x = Math.round(x0 + dx * i);
    const y = Math.round(y0 + dy * i);
    const z = Math.round(z0 + dz * i);
    const pal = pals[i % pals.length];
    box(g, x, y, z, x + w, y + w, z + w, pal, em);
  }
}

/** Faceted amethyst / quartz cluster. */
function modelCrystal() {
  const h = 14;
  const g = emptyGrid(V, h, V);
  box(g, 3, 0, 3, 13, 3, 13, 6);
  box(g, 4, 2, 4, 12, 4, 12, 5);
  shard(g, 6, 2, 6, 0, 1, 0, 10, 4, [1, 2, 3]);
  shard(g, 4, 2, 8, -0.3, 1, 0.2, 8, 3, [2, 1, 3]);
  shard(g, 9, 2, 5, 0.4, 1, -0.2, 8, 3, [1, 3, 2]);
  shard(g, 8, 3, 9, 0.2, 1, 0.3, 7, 3, [3, 2, 4]);
  shard(g, 5, 3, 4, -0.1, 1, -0.3, 6, 3, [4, 3, 2]);
  box(g, 7, 10, 7, 9, 14, 9, 4);

  return finishModel(g, {
    id: "vox_fan_crystal",
    nameRu: "Кристалл",
    tags: ["fantasy", "outdoor", "cave"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5a3a7a",
      "#8a60b0",
      "#c8a0e0",
      "#e8d8f0",
      "#3a2850",
      "#4a4648",
    ],
    material: "stone",
    physical: true,
  });
}

/** Arcane crystal cluster with inner glow, no cube shadows. */
function modelCrystalMagic() {
  const h = 16;
  const g = emptyGrid(V, h, V);
  box(g, 4, 0, 4, 12, 3, 12, 6);
  shard(g, 6, 2, 6, 0, 1, 0, 11, 4, [1, 2, 3], 0);
  shard(g, 4, 2, 7, -0.25, 1, 0.15, 9, 3, [2, 1, 3], 0);
  shard(g, 9, 2, 5, 0.35, 1, -0.2, 9, 3, [1, 3, 2], 0);
  shard(g, 8, 3, 9, 0.15, 1, 0.35, 8, 3, [2, 4, 3], 0);

  box(g, 7, 5, 7, 9, 13, 9, 4, 220);
  box(g, 7, 8, 7, 9, 12, 9, 5, 255);
  box(g, 5, 6, 7, 6, 10, 9, 3, 180);
  box(g, 10, 6, 6, 11, 10, 8, 3, 180);
  box(g, 7, 14, 7, 9, 16, 9, 5, 255);

  return finishModel(g, {
    id: "vox_fan_crystal_magic",
    nameRu: "Магический кристалл",
    tags: ["fantasy", "outdoor", "cave", "light"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#1a2060",
      "#2040a0",
      "#4080e0",
      "#80c8ff",
      "#e0f0ff",
      "#3a3e4a",
    ],
    material: "stone",
    physical: true,
    emissiveCastsLight: true,
    emissiveLightShadows: false,
    emissiveLightRange: 2.6,
    emissiveStrength: 0.95,
    emissiveSuppressHostShadow: true,
  });
}

const models = [
  modelPine(),
  modelOak(),
  modelBirch(),
  modelFern(),
  modelBushBerry(),
  modelRockOre(),
  modelCrystal(),
  modelCrystalMagic(),
];

for (const model of models) writeModel(model);

const summary = models
  .map((m) => {
    const solids = m.voxels.filter((v) => v > 0).length;
    return `${m.id}  ${m.nameRu}  ${m.heightVoxels}h  ${m.sizeBlocks.x}x${m.sizeBlocks.z}  ${solids}vox  tags=${(m.tags ?? []).join(",")}`;
  })
  .join("\n");

console.log(`fantasy env4: ${models.length} models\n${summary}`);
