/**
 * Env5 more-nature fantasy props for Ember.
 * Run: node scripts/gen-ember-fantasy-env5.mjs
 *
 * Writes only the eight vox_fan_* ids listed below.
 * Does not touch Wave 1 / env2 / env3 / env4 files, registry.json, maps, or src.
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

function trunkBend(y, y0, y1, leanX, leanZ, curveX, curveZ) {
  const t = (y - y0) / Math.max(1, y1 - y0);
  return {
    ox: leanX * t + curveX * Math.sin(t * Math.PI),
    oz: leanZ * t + curveZ * Math.sin(t * Math.PI * 1.7),
  };
}

/** Slim irregular trunk: ~2×2–3×3 mid, modest flare, lean, nubs. */
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
  } = spec;

  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    const { ox, oz } = trunkBend(y, y0, y1, leanX, leanZ, curveX, curveZ);
    const flare = y <= y0 + 1 ? 1.12 : y <= y0 + 3 ? 1.05 : 1;
    const knot = knotY != null && Math.abs(y - knotY) <= 1 ? 1.12 : 1;
    const sliceRx = rx * flare * knot * (1 - t * 0.1);
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
        setV(g, x, y, z, n === 0 ? palDark : n === 1 ? palCore : palBark);
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

function shard(g, x0, y0, z0, dx, dy, dz, steps, w0, pals, em = 0) {
  for (let i = 0; i < steps; i++) {
    const t = i / Math.max(1, steps - 1);
    const w = Math.max(2, Math.round(w0 * (1 - t * 0.55)));
    const x = Math.round(x0 + dx * i);
    const y = Math.round(y0 + dy * i);
    const z = Math.round(z0 + dz * i);
    box(g, x, y, z, x + w, y + w, z + w, pals[i % pals.length], em);
  }
}

/** Weeping willow: slim trunk, 2×2, hanging leaf clumps. */
function modelWillow() {
  const h = 38;
  const S = V * 2;
  const g = emptyGrid(S, h, S);
  const cx = 15.5;
  const cz = 16;
  const lean = { leanX: 1.3, leanZ: -0.8, curveX: 0.8, curveZ: 0.9 };

  paintTrunk(g, {
    cx,
    cz,
    y0: 0,
    y1: 22,
    rx: 1.55,
    rz: 1.4,
    ...lean,
    palBark: 1,
    palCore: 2,
    palDark: 3,
    knotY: 10,
    nubs: [
      { y: 8, dx: 2, dz: 0, h: 2, pal: 2 },
      { y: 14, dx: -2, dz: 1, h: 2, pal: 1 },
    ],
    roots: [
      { dx: -2, dz: 0, w: 2, d: 2, h: 2, pal: 1 },
      { dx: 1, dz: 1, w: 2, d: 2, h: 2, pal: 2 },
    ],
  });

  const crown = trunkBend(20, 0, 22, lean.leanX, lean.leanZ, lean.curveX, lean.curveZ);
  const tcx = cx + crown.ox;
  const tcz = cz + crown.oz;

  for (let y = 24; y < 36; y++) {
    const mid = 1 - Math.abs((y - 30) / 8);
    const r = 11.2 * (0.55 + mid * 0.45);
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        if (!inDisk(x, z, tcx, tcz, r)) continue;
        const n = hash32(x * 11 + y * 19 + z * 7) % 8;
        if (n === 0 && !inDisk(x, z, tcx, tcz, r - 1.6)) continue;
        setV(g, x, y, z, leafPal(x, y, z, 4, 5, 6));
      }
    }
  }

  const hang = [
    { x: -8, z: -2, top: 30, bot: 12 },
    { x: -6, z: 4, top: 31, bot: 14 },
    { x: 7, z: -3, top: 29, bot: 13 },
    { x: 8, z: 3, top: 32, bot: 15 },
    { x: -3, z: -8, top: 28, bot: 11 },
    { x: 2, z: 8, top: 30, bot: 12 },
    { x: -8, z: 6, top: 27, bot: 16 },
    { x: 6, z: -7, top: 31, bot: 14 },
    { x: 0, z: -9, top: 26, bot: 13 },
    { x: -4, z: 8, top: 29, bot: 15 },
  ];
  for (const s of hang) {
    const hx = Math.round(tcx + s.x);
    const hz = Math.round(tcz + s.z);
    for (let y = s.bot; y < s.top; y++) {
      const wobble = ((y + s.x) % 3) - 1;
      box(g, hx + wobble, y, hz, hx + wobble + 3, y + 1, hz + 3, leafPal(hx, y, hz, 4, 5, 6));
    }
  }

  return finishModel(g, {
    id: "vox_fan_willow",
    nameRu: "Ива",
    tags: ["fantasy", "outdoor", "forest"],
    sizeBlocks: { x: 2, y: 3, z: 2 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3a28",
      "#6a5840",
      "#2e2418",
      "#3a5a28",
      "#6a8a38",
      "#8aaa48",
    ],
    material: "wood",
    physical: true,
  });
}

/** Dead snag: slim irregular trunk, broken top, thick bare limbs, moss. */
function modelTreeDead() {
  const h = 36;
  const g = emptyGrid(V, h, V);
  const cx = 7.5;
  const cz = 8;
  const lean = { leanX: -1.2, leanZ: 1.0, curveX: 0.9, curveZ: -0.7 };

  paintTrunk(g, {
    cx,
    cz,
    y0: 0,
    y1: 24,
    rx: 1.5,
    rz: 1.35,
    ...lean,
    palBark: 1,
    palCore: 2,
    palDark: 3,
    knotY: 9,
    nubs: [
      { y: 7, dx: 1, dz: 0, h: 2, pal: 2 },
      { y: 16, dx: -2, dz: 1, h: 2, pal: 1 },
    ],
    roots: [
      { dx: -2, dz: 0, w: 2, d: 2, h: 2, pal: 1 },
      { dx: 1, dz: 1, w: 2, d: 2, h: 2, pal: 3 },
    ],
  });

  const top = trunkBend(23, 0, 24, lean.leanX, lean.leanZ, lean.curveX, lean.curveZ);
  const tx = Math.round(cx + top.ox);
  const tz = Math.round(cz + top.oz);
  box(g, tx - 1, 22, tz - 1, tx + 2, 26, tz + 2, 2);
  box(g, tx, 25, tz, tx + 1, 28, tz + 2, 1);
  setV(g, tx + 1, 27, tz, 3);
  setV(g, tx - 1, 24, tz + 1, 0);

  box(g, tx, 18, tz, tx + 6, 20, tz + 2, 2);
  box(g, tx + 4, 19, tz, tx + 7, 21, tz + 2, 1);
  box(g, tx - 5, 14, tz, tx, 16, tz + 2, 1);
  box(g, tx - 6, 15, tz + 1, tx - 3, 17, tz + 3, 2);
  box(g, tx, 12, tz + 2, tx + 2, 14, tz + 6, 1);

  box(g, tx - 1, 4, tz + 1, tx + 2, 8, tz + 3, 4);
  box(g, tx, 20, tz - 1, tx + 2, 22, tz + 1, 4);
  box(g, 4, 0, 10, 7, 2, 13, 4);

  return finishModel(g, {
    id: "vox_fan_tree_dead",
    nameRu: "Сухостой",
    tags: ["fantasy", "outdoor", "forest"],
    sizeBlocks: { x: 1, y: 3, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5a5248",
      "#7a7268",
      "#3a342e",
      "#3a5a32",
      "#8a8278",
      "#2a2620",
    ],
    material: "wood",
    physical: true,
  });
}

/** Young tree: short, 2×2 trunk, small crown. */
function modelSapling() {
  const h = 20;
  const g = emptyGrid(V, h, V);
  const cx = 8;
  const cz = 8;
  const lean = { leanX: 0.8, leanZ: 0.5, curveX: 0.4, curveZ: -0.4 };

  paintTrunk(g, {
    cx,
    cz,
    y0: 0,
    y1: 12,
    rx: 1.15,
    rz: 1.1,
    ...lean,
    palBark: 1,
    palCore: 2,
    palDark: 1,
    nubs: [{ y: 6, dx: 1, dz: 0, h: 2, pal: 2 }],
    roots: [{ dx: -1, dz: 0, w: 2, d: 2, h: 2, pal: 1 }],
  });

  const tip = trunkBend(11, 0, 12, lean.leanX, lean.leanZ, lean.curveX, lean.curveZ);
  const clumps = [
    { cx: 7.5, cz: 8, y0: 10, y1: 18, r: 4.2 },
    { cx: 9.2, cz: 7.2, y0: 12, y1: 19, r: 3.2 },
    { cx: 8.0, cz: 9.2, y0: 14, y1: 20, r: 2.8 },
  ];
  for (const c of clumps) {
    for (let y = c.y0; y < c.y1; y++) {
      const mid = 1 - Math.abs((y - (c.y0 + c.y1) / 2) / ((c.y1 - c.y0) / 2));
      const r = c.r * (0.6 + mid * 0.4);
      for (let z = 0; z < V; z++) {
        for (let x = 0; x < V; x++) {
          if (!inDisk(x, z, c.cx + tip.ox, c.cz + tip.oz, r)) continue;
          setV(g, x, y, z, leafPal(x, y, z, 3, 4, 5));
        }
      }
    }
  }

  return finishModel(g, {
    id: "vox_fan_sapling",
    nameRu: "Саженец",
    tags: ["fantasy", "outdoor", "forest"],
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5a3c20",
      "#7a5830",
      "#2a5420",
      "#3e7a30",
      "#5a9a40",
      "#1e3818",
    ],
    material: "wood",
    physical: true,
  });
}

/** Boulder with ivy draping one face. */
function modelIvyRock() {
  const h = 12;
  const g = emptyGrid(V, h, V);
  for (let y = 0; y < h; y++) {
    const rA = 5.4 - Math.abs(y - 4) * 0.38;
    const rB = 3.8 - Math.abs(y - 3) * 0.32;
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        const a = inDisk(x, z, 7.4, 8.0, rA);
        const b = inDisk(x, z, 10.0, 6.6, rB);
        if (!a && !b) continue;
        const n = hash32(x * 17 + y * 31 + z * 9) % 5;
        setV(g, x, y, z, n === 0 ? 3 : n === 1 ? 1 : 2);
      }
    }
  }
  for (let y = 2; y < 12; y++) {
    for (let z = 9; z < 14; z++) {
      for (let x = 4; x < 13; x++) {
        if (g.voxels[vi(g, x, y, z)] === 0) continue;
        const drape = z >= 10 || hash32(x * 7 + y * 13 + z) % 3 === 0;
        if (!drape) continue;
        const n = hash32(x * 11 + y * 5 + z) % 4;
        setV(g, x, y, z, n === 0 ? 6 : n === 1 ? 4 : 5);
        if (y > 3 && hash32(x + y * 3) % 4 === 0) setV(g, x, y - 2, z + 1, 5);
      }
    }
  }
  box(g, 5, 8, 11, 8, 11, 14, 4);
  box(g, 9, 6, 12, 12, 10, 15, 5);

  return finishModel(g, {
    id: "vox_fan_ivy_rock",
    nameRu: "Камень в плюще",
    tags: ["fantasy", "outdoor", "forest"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4e4a46",
      "#6e6a64",
      "#2e2c2a",
      "#1e4a24",
      "#2e6a30",
      "#4a8a3a",
    ],
    material: "stone",
    physical: true,
  });
}

/** Walk-through water lilies: thick pads + blooms. */
function modelLilies() {
  const h = 6;
  const g = emptyGrid(V, h, V);
  const pads = [
    { cx: 5, cz: 5, r: 3.2 },
    { cx: 11, cz: 7, r: 2.8 },
    { cx: 7, cz: 11, r: 3.0 },
    { cx: 12, cz: 12, r: 2.4 },
  ];
  for (const p of pads) {
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        if (!inDisk(x, z, p.cx, p.cz, p.r)) continue;
        const n = hash32(x * 9 + z * 17) % 4;
        setV(g, x, 0, z, n === 0 ? 2 : 1);
        if (inDisk(x, z, p.cx, p.cz, p.r - 0.8)) setV(g, x, 1, z, 3);
      }
    }
  }
  box(g, 4, 2, 4, 7, 5, 7, 4);
  box(g, 5, 4, 5, 6, 6, 6, 6);
  box(g, 10, 2, 10, 13, 5, 13, 5);
  box(g, 11, 4, 11, 12, 6, 12, 6);

  return finishModel(g, {
    id: "vox_fan_lilies",
    nameRu: "Кувшинки",
    tags: ["fantasy", "outdoor", "water"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#2a5a28",
      "#1e4820",
      "#3a7a38",
      "#e07090",
      "#f0e8d8",
      "#e8c040",
    ],
    material: "grass",
    physical: false,
  });
}

/** Walk-through clover patch: low thick clumps. */
function modelClover() {
  const h = 5;
  const g = emptyGrid(V, h, V);
  const clumps = [
    { cx: 5, cz: 5, r: 3.4 },
    { cx: 10, cz: 6, r: 3.0 },
    { cx: 7, cz: 11, r: 3.2 },
    { cx: 12, cz: 11, r: 2.6 },
    { cx: 4, cz: 10, r: 2.4 },
  ];
  for (const c of clumps) {
    for (let y = 0; y < 3; y++) {
      const r = c.r - y * 0.45;
      for (let z = 0; z < V; z++) {
        for (let x = 0; x < V; x++) {
          if (!inDisk(x, z, c.cx, c.cz, r)) continue;
          setV(g, x, y, z, leafPal(x, y, z, 1, 2, 3));
        }
      }
    }
  }
  const flowers = [
    [5, 3, 5],
    [10, 3, 6],
    [7, 3, 11],
    [12, 2, 10],
    [4, 3, 9],
  ];
  for (const [x, y, z] of flowers) {
    box(g, x, y, z, x + 2, y + 2, z + 2, 4);
  }

  return finishModel(g, {
    id: "vox_fan_clover",
    nameRu: "Клевер",
    tags: ["fantasy", "outdoor", "forest"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#1e4a20",
      "#2e6a2c",
      "#4a8a3a",
      "#f0f0e4",
      "#6aaa48",
      "#163818",
    ],
    material: "grass",
    physical: false,
  });
}

/** Angular boulder with chunky gold nuggets — not the ore/copper mix. */
function modelRockGold() {
  const h = 11;
  const g = emptyGrid(V, h, V);
  for (let y = 0; y < h; y++) {
    const rA = 5.2 - Math.abs(y - 3) * 0.36;
    const rB = 3.6 - Math.abs(y - 4) * 0.3;
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        const a = inDisk(x, z, 6.6, 7.2, rA);
        const b = inDisk(x, z, 10.2, 9.0, rB);
        if (!a && !b) continue;
        const n = hash32(x * 23 + y * 11 + z * 5) % 5;
        let pal = n === 0 ? 3 : n === 1 ? 1 : 2;
        if (y === 0 && n === 2) pal = 3;
        setV(g, x, y, z, pal);
      }
    }
  }
  box(g, 8, 3, 6, 11, 7, 9, 4);
  box(g, 9, 4, 7, 12, 8, 10, 5);
  box(g, 4, 2, 8, 7, 5, 11, 4);
  box(g, 5, 5, 9, 7, 7, 11, 6);
  box(g, 10, 1, 10, 13, 4, 13, 5);
  box(g, 3, 6, 5, 6, 9, 8, 4);

  return finishModel(g, {
    id: "vox_fan_rock_gold",
    nameRu: "Золотой валун",
    tags: ["fantasy", "outdoor", "cave"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a3834",
      "#5a564e",
      "#242220",
      "#d4a018",
      "#f0d050",
      "#a87810",
    ],
    material: "stone",
    physical: true,
  });
}

/** Warm ember crystal cluster with inner glow, no cube shadows. */
function modelCrystalEmber() {
  const h = 15;
  const g = emptyGrid(V, h, V);
  box(g, 4, 0, 4, 12, 3, 12, 6);
  shard(g, 6, 2, 6, 0, 1, 0, 10, 4, [1, 2, 3], 0);
  shard(g, 4, 2, 7, -0.2, 1, 0.2, 8, 3, [2, 1, 3], 0);
  shard(g, 9, 2, 5, 0.3, 1, -0.15, 8, 3, [1, 3, 2], 0);
  shard(g, 8, 3, 9, 0.15, 1, 0.3, 7, 3, [2, 4, 3], 0);

  box(g, 7, 5, 7, 9, 12, 9, 4, 220);
  box(g, 7, 8, 7, 9, 13, 9, 5, 255);
  box(g, 5, 6, 7, 6, 10, 9, 3, 170);
  box(g, 10, 5, 6, 11, 9, 8, 3, 170);
  box(g, 7, 13, 7, 9, 15, 9, 5, 255);

  return finishModel(g, {
    id: "vox_fan_crystal_ember",
    nameRu: "Огненный кристалл",
    tags: ["fantasy", "outdoor", "cave", "light"],
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5a180c",
      "#a02810",
      "#d04818",
      "#ff7a28",
      "#ffd070",
      "#3a342e",
    ],
    material: "stone",
    physical: true,
    emissiveCastsLight: true,
    emissiveLightShadows: false,
    emissiveLightRange: 2.5,
    emissiveStrength: 1.0,
    emissiveSuppressHostShadow: true,
  });
}

const models = [
  modelWillow(),
  modelTreeDead(),
  modelSapling(),
  modelIvyRock(),
  modelLilies(),
  modelClover(),
  modelRockGold(),
  modelCrystalEmber(),
];

for (const model of models) writeModel(model);

const summary = models
  .map((m) => {
    const solids = m.voxels.filter((v) => v > 0).length;
    return `${m.id}  ${m.nameRu}  ${m.heightVoxels}h  ${m.sizeBlocks.x}x${m.sizeBlocks.z}  ${solids}vox  tags=${(m.tags ?? []).join(",")}`;
  })
  .join("\n");

console.log(`fantasy env5: ${models.length} models\n${summary}`);
