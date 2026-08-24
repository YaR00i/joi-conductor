#!/usr/bin/env node
/**
 * Env12 blacksmith / forge props for Ember.
 * Scaled for ~32-voxel-tall chibi people (explore camera 45–60°).
 *
 * Run: node scripts/gen-ember-fantasy-env12.mjs
 *
 * Writes only the eight vox_fan_* ids listed below.
 * Does not touch env1–10, existing vox_fan_*, vox_chr_*, vox_vil_*,
 * registry.json, maps, or src.
 *
 * Display props only — no characters, no equippable combat weapons.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ember = path.join(root, "content", "ember");
const V = 16;

const TAGS = ["fantasy", "indoor", "shop", "blacksmith"];
const TAGS_FURN = ["fantasy", "indoor", "shop", "blacksmith", "furniture"];
const TAGS_LIGHT = ["fantasy", "indoor", "shop", "blacksmith", "furniture", "light"];

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

function inOval(a, b, ca, cb, ra, rb) {
  const da = (a + 0.5 - ca) / ra;
  const db = (b + 0.5 - cb) / rb;
  return da * da + db * db <= 1;
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

function forgeLight(range, strength) {
  return {
    emissiveCastsLight: true,
    emissiveLightShadows: false,
    emissiveLightRange: range,
    emissiveStrength: strength,
    emissiveTorchFlicker: true,
    emissiveSuppressHostShadow: true,
  };
}

/** Iron anvil on a wood stump. Horn + face read at 45°. */
function modelAnvil() {
  const h = 16;
  const g = emptyGrid(V, h, V);
  const cx = 8;
  const cz = 8;

  for (let y = 0; y < 7; y++) {
    const r = y < 2 ? 5.8 : 5.15;
    for (let z = 2; z < 14; z++) {
      for (let x = 2; x < 14; x++) {
        if (!inDisk(x, z, cx, cz, r)) continue;
        const dx = x + 0.5 - cx;
        const dz = z + 0.5 - cz;
        const rr = Math.sqrt(dx * dx + dz * dz);
        const n = hash32(x * 19 + y * 11 + z * 7) % 6;
        let pal = 1;
        if (y >= 5) pal = rr < 1.7 ? 3 : rr < 3.4 ? 2 : 1;
        else if (rr > 4.2) pal = n === 0 ? 2 : 1;
        else pal = n === 1 ? 3 : 2;
        setV(g, x, y, z, pal);
      }
    }
  }
  box(g, 1, 0, 6, 4, 3, 10, 1);
  box(g, 12, 0, 7, 15, 2, 11, 1);

  // Feet with an arch between — classic anvil silhouette.
  box(g, 3, 6, 5, 7, 9, 11, 4);
  box(g, 9, 6, 5, 13, 9, 11, 4);
  box(g, 4, 7, 6, 12, 9, 10, 5);
  box(g, 5, 8, 6, 11, 11, 10, 5);

  // Waist / body.
  box(g, 5, 9, 6, 11, 12, 10, 4);
  box(g, 6, 10, 7, 10, 12, 9, 5);

  // Face: thick rectangular working surface.
  box(g, 3, 11, 5, 11, 15, 11, 5);
  box(g, 3, 14, 5, 11, 16, 11, 6);
  box(g, 4, 12, 6, 10, 14, 10, 4);
  setV(g, 4, 15, 8, 4);
  setV(g, 5, 15, 8, 4);

  // Heel (square tail, −X).
  box(g, 1, 11, 5, 4, 15, 11, 4);
  box(g, 1, 14, 6, 3, 16, 10, 5);

  // Horn (+X): stepped taper, 3–4 vx thick, long enough to read at 45°.
  for (let x = 10; x < 16; x++) {
    const t = (x - 10) / 5.2;
    const hz = 2.55 - t * 1.35;
    const hy = 1.7 - t * 0.75;
    const pal = t > 0.65 ? 6 : t > 0.3 ? 5 : 4;
    for (let z = 4; z < 13; z++) {
      for (let y = 10; y < 16; y++) {
        const dz = Math.abs(z + 0.5 - 8);
        const dy = Math.abs(y + 0.5 - 13.1);
        if (dz <= hz && dy <= hy) setV(g, x, y, z, pal);
      }
    }
  }
  box(g, 14, 12, 7, 16, 14, 9, 6);
  box(g, 3, 6, 5, 13, 7, 11, 7);

  return finishModel(g, {
    id: "vox_fan_anvil",
    nameRu: "Наковальня",
    tags: TAGS_FURN,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3018",
      "#6a4424",
      "#c8a060",
      "#2a2c32",
      "#5a5e68",
      "#9aa0a8",
      "#3a3228",
    ],
    material: "metal",
    physical: true,
  });
}

/**
 * Brick forge with a coal pit and chimney. Not a kitchen stove, hearth,
 * or open campfire. Ember glow, no cube shadows.
 */
function modelForge() {
  const h = 22;
  const g = emptyGrid(V, h, V);

  function brickPal(x, y, z) {
    const mortar = y % 2 === 0;
    if (mortar) return 5;
    const row = Math.floor(y / 2);
    const ox = (row % 2) * 2;
    const n = hash32(x * 17 + y * 9 + z * 5) % 5;
    if ((x + ox) % 4 === 0) return 1;
    return n === 0 ? 3 : 2;
  }

  function brickBox(x0, y0, z0, x1, y1, z1) {
    for (let y = y0; y < y1; y++) {
      for (let z = z0; z < z1; z++) {
        for (let x = x0; x < x1; x++) setV(g, x, y, z, brickPal(x, y, z));
      }
    }
  }

  brickBox(1, 0, 1, 15, 4, 15);
  box(g, 2, 0, 2, 14, 2, 14, 5);

  // U-shaped hearth: chimney back (−Z), opening +Z.
  brickBox(1, 4, 1, 15, 14, 5);
  brickBox(1, 4, 5, 4, 12, 14);
  brickBox(12, 4, 5, 15, 12, 14);
  brickBox(4, 4, 13, 12, 6, 15);

  // Sooted interior.
  box(g, 4, 4, 4, 12, 12, 5, 4);
  box(g, 4, 4, 5, 5, 11, 13, 4);
  box(g, 11, 4, 5, 12, 11, 13, 4);
  box(g, 4, 11, 4, 12, 12, 13, 4);

  // Coal bed + embers (open to +Z).
  box(g, 5, 4, 5, 11, 6, 13, 4);
  for (let z = 5; z < 13; z++) {
    for (let x = 5; x < 11; x++) {
      const n = hash32(x * 13 + z * 7) % 6;
      const pal = n < 2 ? 6 : n < 4 ? 7 : 8;
      const em = pal === 8 ? 255 : pal === 7 ? 210 : 150;
      setV(g, x, 5, z, pal, em);
      if (n === 0) setV(g, x, 6, z, 7, 230);
    }
  }
  box(g, 7, 6, 8, 9, 9, 12, 8, 255);
  box(g, 6, 5, 9, 10, 8, 12, 7, 220);

  // Chimney stack, hollow.
  brickBox(4, 14, 1, 12, 22, 6);
  box(g, 5, 14, 2, 11, 22, 5, 0);
  box(g, 6, 14, 2, 10, 16, 5, 4);
  box(g, 7, 16, 3, 9, 20, 5, 6, 120);
  box(g, 4, 21, 1, 12, 22, 6, 1);
  box(g, 6, 20, 2, 10, 22, 5, 0);

  // Iron hood lip over the opening.
  box(g, 3, 11, 12, 13, 13, 15, 5);
  box(g, 4, 12, 13, 12, 13, 15, 4);

  return finishModel(g, {
    id: "vox_fan_forge",
    nameRu: "Горн",
    tags: TAGS_LIGHT,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5a2c1c",
      "#8a4430",
      "#b05a38",
      "#2a221c",
      "#3a3834",
      "#c04814",
      "#e87820",
      "#ffe060",
    ],
    material: "stone",
    physical: true,
    ...forgeLight(2.6, 0.85),
  });
}

/** Leather bellows on a wooden frame, nozzle toward +Z. */
function modelBellows() {
  const h = 14;
  const g = emptyGrid(V, h, V);

  post(g, 1, 0, 4, 4, 8, 8, 1, 2);
  post(g, 12, 0, 4, 15, 8, 8, 1, 2);
  box(g, 2, 2, 5, 14, 4, 7, 2);

  // Bottom paddle.
  box(g, 2, 3, 3, 14, 5, 10, 2);
  box(g, 3, 4, 4, 13, 5, 9, 1);

  // Leather bag: diamond in Y/Z, thick in X.
  for (let y = 5; y < 11; y++) {
    const t = (y - 5) / 5;
    const z0 = 3 + Math.floor((1 - Math.abs(t - 0.45)) * 1.2);
    const z1 = 10 + Math.floor(Math.abs(t - 0.15) * 2);
    const x0 = 3;
    const x1 = 13;
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const n = hash32(x * 11 + y * 5 + z * 3) % 5;
        const pal = n === 0 ? 5 : n === 1 ? 3 : 4;
        setV(g, x, y, z, pal);
      }
    }
  }

  // Top paddle + handle.
  box(g, 3, 9, 2, 13, 12, 8, 2);
  box(g, 4, 10, 3, 12, 11, 7, 1);
  box(g, 6, 11, 2, 10, 14, 5, 1);
  box(g, 7, 12, 1, 9, 14, 4, 2);

  // Iron nozzle toward +Z.
  box(g, 6, 4, 9, 10, 8, 13, 6);
  box(g, 7, 5, 12, 9, 7, 16, 6);
  box(g, 7, 5, 14, 9, 7, 16, 7);

  // Leather straps.
  box(g, 2, 5, 5, 3, 10, 8, 3);
  box(g, 13, 5, 5, 14, 10, 8, 3);

  return finishModel(g, {
    id: "vox_fan_bellows",
    nameRu: "Мехи",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#6a4428",
      "#5a3020",
      "#8a4a28",
      "#c07040",
      "#4a4c50",
      "#8a8e94",
    ],
    material: "wood",
    physical: true,
  });
}

/**
 * Open quench trough of water. Not the standing village barrel or tavern keg.
 * Rectangular tub, visible water, dunked iron bar.
 */
function modelQuench() {
  const h = 9;
  const g = emptyGrid(V, h, V);

  // Short legs.
  post(g, 1, 0, 3, 4, 3, 6, 1, 2);
  post(g, 12, 0, 3, 15, 3, 6, 1, 2);
  post(g, 1, 0, 10, 4, 3, 13, 1, 2);
  post(g, 12, 0, 10, 15, 3, 13, 1, 2);

  for (let y = 2; y < 8; y++) {
    for (let z = 2; z < 14; z++) {
      for (let x = 0; x < 16; x++) {
        const wall =
          inOval(x, z, 8, 8, 7.4, 5.6) &&
          (y < 4 || !inOval(x, z, 8, 8, 5.5, 3.7));
        if (!wall) continue;
        const hoop = x === 2 || x === 8 || x === 13;
        const n = hash32(x * 13 + y * 7 + z * 5) % 4;
        let pal = hoop ? 4 : n === 0 ? 2 : 1;
        if (y === 2) pal = 2;
        if (y >= 6 && !hoop) pal = 3;
        setV(g, x, y, z, pal);
      }
    }
  }

  // Open water — the thing that makes this a quench tub, not a barrel.
  for (let z = 4; z < 12; z++) {
    for (let x = 2; x < 14; x++) {
      if (!inOval(x, z, 8, 8, 5.3, 3.5)) continue;
      const bright = inOval(x, z, 9, 7.5, 2.0, 1.3);
      setV(g, x, 4, z, 5);
      setV(g, x, 5, z, bright ? 7 : 6);
    }
  }

  // Dunked workpiece across the rim.
  box(g, 3, 5, 6, 13, 7, 8, 4);
  box(g, 11, 6, 6, 15, 8, 9, 8);
  box(g, 13, 7, 6, 16, 9, 9, 8);
  box(g, 4, 4, 6, 7, 6, 8, 4);

  return finishModel(g, {
    id: "vox_fan_quench",
    nameRu: "Закалка",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5c3c22",
      "#3a2818",
      "#8a5c34",
      "#3a3c40",
      "#1a3a48",
      "#2a6888",
      "#7ab0c8",
      "#8a9098",
    ],
    material: "wood",
    physical: true,
  });
}

/** Floor rack with 3 display blades. Shop props, not loot. */
function modelWeaponRack() {
  const h = 24;
  const g = emptyGrid(V, h, V);

  box(g, 1, 0, 3, 15, 2, 12, 1);
  post(g, 1, 2, 4, 4, 22, 8, 2, 1);
  post(g, 12, 2, 4, 15, 22, 8, 2, 1);
  box(g, 1, 20, 4, 15, 23, 9, 3);
  box(g, 1, 10, 4, 15, 12, 8, 3);
  box(g, 1, 2, 4, 15, 4, 7, 2);

  // Short sword (left), in front of the backboard.
  box(g, 4, 3, 8, 6, 15, 11, 4);
  box(g, 4, 13, 8, 6, 15, 11, 5);
  box(g, 3, 15, 7, 7, 17, 12, 6);
  box(g, 4, 17, 8, 6, 21, 11, 7);
  box(g, 4, 20, 8, 6, 22, 11, 6);

  // Longsword (center).
  box(g, 7, 3, 8, 9, 18, 11, 4);
  box(g, 7, 15, 8, 9, 18, 11, 5);
  box(g, 6, 18, 7, 10, 20, 12, 6);
  box(g, 7, 20, 8, 9, 23, 11, 7);
  box(g, 7, 22, 8, 9, 24, 11, 6);

  // Axe (right): thick wedge head, shop display.
  box(g, 11, 3, 8, 13, 16, 11, 7);
  box(g, 10, 14, 7, 16, 20, 13, 4);
  box(g, 11, 15, 8, 16, 19, 12, 5);
  box(g, 14, 15, 8, 16, 19, 12, 4);
  box(g, 11, 16, 9, 13, 19, 11, 6);

  return finishModel(g, {
    id: "vox_fan_weapon_rack",
    nameRu: "Стойка клинков",
    tags: TAGS_FURN,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5c3c22",
      "#8a5c34",
      "#4a4e54",
      "#8a9098",
      "#c4a060",
      "#5a3c24",
    ],
    material: "wood",
    physical: true,
  });
}

/**
 * Empty display armor on a T-stand. Under 28 vx. Dummy, not a character.
 */
function modelArmorStand() {
  const h = 26;
  const g = emptyGrid(V, h, V);

  for (let z = 3; z < 13; z++) {
    for (let x = 3; x < 13; x++) {
      if (!inDisk(x, z, 8, 8, 5.1)) continue;
      setV(g, x, 0, z, 1);
      setV(g, x, 1, z, inDisk(x, z, 8, 8, 3.4) ? 2 : 1);
    }
  }
  post(g, 7, 2, 7, 10, 18, 10, 2, 1);
  box(g, 2, 16, 6, 14, 19, 10, 2);
  box(g, 3, 17, 7, 13, 18, 9, 1);

  // Hollow breastplate hung on the post — thick shell, dark interior.
  box(g, 4, 7, 5, 12, 17, 11, 3);
  box(g, 5, 8, 6, 11, 16, 10, 4);
  box(g, 6, 9, 5, 10, 15, 6, 5);
  box(g, 6, 10, 10, 10, 14, 12, 3);
  box(g, 7, 8, 7, 9, 16, 9, 0);
  box(g, 6, 9, 7, 10, 15, 9, 6);
  box(g, 6, 16, 6, 10, 18, 10, 4);
  box(g, 7, 12, 5, 9, 14, 6, 7);
  box(g, 7, 16, 7, 9, 18, 9, 6);

  // Pauldrons on the T-bar (no arms).
  box(g, 1, 15, 5, 5, 20, 11, 3);
  box(g, 2, 16, 6, 5, 19, 10, 4);
  box(g, 11, 15, 5, 15, 20, 11, 3);
  box(g, 11, 16, 6, 14, 19, 10, 4);

  // Kettle helm on the post. Visor slit, no face.
  for (let y = 19; y < 26; y++) {
    const t = (y - 19) / 6;
    const r = 3.35 - t * 0.45;
    for (let z = 4; z < 12; z++) {
      for (let x = 4; x < 12; x++) {
        if (!inDisk(x, z, 8, 8, r)) continue;
        const rim = !inDisk(x, z, 8, 8, r - 1.05);
        const visor = y >= 21 && y <= 22 && z >= 9;
        setV(g, x, y, z, visor ? 6 : rim || y === 19 ? 3 : 4);
      }
    }
  }
  box(g, 5, 24, 5, 11, 26, 11, 3);
  box(g, 7, 21, 10, 9, 23, 12, 6);

  return finishModel(g, {
    id: "vox_fan_armor_stand",
    nameRu: "Стойка доспеха",
    tags: TAGS_FURN,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#6a4428",
      "#3a3e44",
      "#6a7078",
      "#b0b6bc",
      "#1a1c20",
      "#c4a060",
    ],
    material: "metal",
    physical: true,
  });
}

/** Post + board with hanging horseshoes. */
function modelHorseshoe() {
  const h = 18;
  const g = emptyGrid(V, h, V);

  post(g, 6, 0, 4, 10, 17, 8, 1, 2);
  box(g, 6, 0, 3, 10, 2, 9, 1);
  box(g, 1, 12, 4, 15, 18, 8, 2);
  box(g, 2, 13, 5, 14, 17, 8, 3);
  box(g, 1, 12, 4, 15, 13, 6, 1);
  box(g, 1, 17, 4, 15, 18, 6, 1);

  function shoe(x0, yTop, z0) {
    const pal = 4;
    const hi = 5;
    box(g, x0, yTop - 6, z0, x0 + 2, yTop, z0 + 3, pal);
    box(g, x0 + 4, yTop - 6, z0, x0 + 6, yTop, z0 + 3, pal);
    box(g, x0, yTop - 1, z0, x0 + 6, yTop + 2, z0 + 3, pal);
    box(g, x0 + 1, yTop, z0 + 1, x0 + 5, yTop + 2, z0 + 3, hi);
    setV(g, x0 + 2, yTop + 1, z0 + 1, 6);
    setV(g, x0, yTop - 6, z0 + 1, hi);
    setV(g, x0 + 5, yTop - 6, z0 + 1, hi);
  }

  shoe(0, 12, 8);
  shoe(5, 11, 9);
  shoe(10, 12, 8);

  return finishModel(g, {
    id: "vox_fan_horseshoe",
    nameRu: "Подковы",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5c3c22",
      "#8a5c34",
      "#5a4840",
      "#8a7a68",
      "#c4a060",
    ],
    material: "wood",
    physical: true,
  });
}

/** Hammer, tongs, and a small work block in one prefab. */
function modelSmithTools() {
  const h = 11;
  const g = emptyGrid(V, h, V);

  for (let z = 2; z < 14; z++) {
    for (let x = 2; x < 14; x++) {
      if (!inDisk(x, z, 8, 8, 6.1)) continue;
      const n = hash32(x * 11 + z * 5) % 4;
      setV(g, x, 0, z, 1);
      setV(g, x, 1, z, n === 0 ? 2 : 1);
      if (inDisk(x, z, 8, 8, 5.3)) {
        setV(g, x, 2, z, 2);
        setV(g, x, 3, z, 2);
        setV(g, x, 4, z, n === 1 ? 3 : 2);
        setV(g, x, 5, z, 3);
      }
    }
  }
  box(g, 4, 0, 4, 12, 2, 12, 1);

  // Hammer: cuboid head on a short handle, readable at 45°.
  box(g, 1, 6, 3, 8, 8, 6, 5);
  box(g, 2, 6, 4, 7, 8, 5, 3);
  box(g, 7, 5, 2, 13, 11, 8, 4);
  box(g, 8, 6, 3, 12, 10, 7, 6);
  box(g, 11, 6, 3, 13, 10, 7, 4);

  // Tongs: two thick arms, pivot, open jaws toward +Z.
  box(g, 2, 6, 9, 10, 8, 11, 4);
  box(g, 3, 7, 11, 10, 9, 14, 6);
  box(g, 8, 6, 9, 11, 9, 13, 4);
  box(g, 10, 6, 8, 14, 8, 11, 6);
  box(g, 10, 7, 12, 14, 9, 15, 4);
  box(g, 13, 6, 7, 16, 8, 10, 4);
  box(g, 13, 7, 13, 16, 9, 16, 6);

  // Iron lump on the block.
  box(g, 6, 6, 6, 9, 8, 9, 4);
  box(g, 7, 7, 7, 9, 9, 9, 6);

  return finishModel(g, {
    id: "vox_fan_smith_tools",
    nameRu: "Инструменты кузницы",
    tags: TAGS_FURN,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5c3c22",
      "#8a5c34",
      "#3a3e44",
      "#6a4428",
      "#8a9098",
    ],
    material: "wood",
    physical: true,
  });
}

const models = [
  modelAnvil(),
  modelForge(),
  modelBellows(),
  modelQuench(),
  modelWeaponRack(),
  modelArmorStand(),
  modelHorseshoe(),
  modelSmithTools(),
];

for (const model of models) writeModel(model);

const summary = models
  .map((m) => {
    const solids = m.voxels.filter((v) => v > 0).length;
    const blocks = `${m.sizeBlocks.x}×${m.sizeBlocks.y}×${m.sizeBlocks.z}`;
    const extra = m.physical === false ? "  nophys" : "";
    const light = m.emissiveCastsLight ? "  light" : "";
    const pal = (m.palette.length - 1).toString();
    return `${m.id}  ${m.nameRu}  ${m.heightVoxels}h  ${blocks}  ${solids}vox  ${pal}col  tags=${(m.tags ?? []).join(",")}${extra}${light}`;
  })
  .join("\n");

console.log(`fantasy env12 blacksmith: ${models.length} models\n${summary}`);
