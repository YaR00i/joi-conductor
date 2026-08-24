#!/usr/bin/env node
/**
 * Env13 building-entry props for Ember.
 * Scaled for ~32-voxel-tall chibi people (explore camera 45–60°).
 *
 * Run: node scripts/gen-ember-fantasy-env13.mjs
 *
 * Writes only the eight vox_fan_* ids listed below.
 * Does not touch env1–12, kit1, existing vox_fan_*, vox_chr_*, vox_vil_*,
 * registry.json, maps, or src.
 *
 * Door interactivity is map-side (kind:door). This file only draws a voxel prop.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ember = path.join(root, "content", "ember");
const V = 16;

const TAGS = ["fantasy", "outdoor", "town", "building"];
const TAGS_LIGHT = ["fantasy", "outdoor", "town", "building", "light"];

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

function windowLight(range, strength) {
  return {
    emissiveCastsLight: true,
    emissiveLightShadows: false,
    emissiveLightRange: range,
    emissiveStrength: strength,
    emissiveSuppressHostShadow: true,
  };
}

/**
 * Thick wood door in a stone/wood frame. Vertical slab + jambs + handle,
 * not a crate. Front faces +Z. Map binds kind:door separately.
 */
function modelDoor() {
  const h = 24;
  const g = emptyGrid(V, h, V);

  // Threshold / step — reads as an entry, not a box sitting on dirt.
  box(g, 1, 0, 7, 15, 2, 16, 6);
  box(g, 2, 1, 8, 14, 2, 15, 1);
  box(g, 0, 0, 10, 16, 2, 16, 6);

  // Jambs + lintel: chunky doorway silhouette at 45°.
  post(g, 0, 0, 9, 4, 22, 16, 1, 8);
  post(g, 12, 0, 9, 16, 22, 16, 1, 8);
  box(g, 0, 20, 8, 16, 24, 16, 1);
  box(g, 1, 21, 9, 15, 23, 15, 8);
  box(g, 3, 22, 8, 13, 24, 16, 1);
  box(g, 5, 23, 9, 11, 24, 15, 6);

  // Slight arch: cut the inner top corners of the opening.
  box(g, 4, 18, 9, 6, 21, 16, 1);
  box(g, 10, 18, 9, 12, 21, 16, 1);
  box(g, 4, 19, 10, 5, 21, 15, 8);
  box(g, 11, 19, 10, 12, 21, 15, 8);

  // Door leaf: tall thin slab (3 vx), recessed in the frame.
  box(g, 4, 2, 11, 12, 20, 14, 2);
  box(g, 5, 3, 13, 11, 19, 14, 3);

  // Two raised panels with a mid rail — the thing that says "door".
  box(g, 5, 4, 13, 8, 10, 15, 8);
  box(g, 8, 4, 13, 11, 10, 15, 8);
  box(g, 5, 12, 13, 8, 18, 15, 8);
  box(g, 8, 12, 13, 11, 18, 15, 8);
  box(g, 6, 5, 14, 7, 9, 15, 3);
  box(g, 9, 5, 14, 10, 9, 15, 3);
  box(g, 6, 13, 14, 7, 17, 15, 3);
  box(g, 9, 13, 14, 10, 17, 15, 3);
  box(g, 7, 3, 13, 9, 19, 14, 2);
  box(g, 5, 10, 13, 11, 12, 14, 2);

  // Iron hinges on the −X jamb, wrapping the leaf.
  box(g, 3, 5, 10, 6, 8, 15, 4);
  box(g, 3, 14, 10, 6, 17, 15, 4);
  box(g, 4, 6, 14, 6, 7, 16, 5);
  box(g, 4, 15, 14, 6, 16, 16, 5);

  // Brass ring handle + plate at hand height, +X side.
  box(g, 9, 8, 13, 12, 13, 16, 4);
  box(g, 10, 9, 14, 12, 12, 16, 7);
  box(g, 10, 9, 15, 12, 12, 16, 7);
  setV(g, 11, 10, 15, 3);

  return finishModel(g, {
    id: "vox_fan_door",
    nameRu: "Дверь",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2414",
      "#6a4030",
      "#8a5c34",
      "#2a2420",
      "#7a7670",
      "#5a5850",
      "#c4a060",
      "#2a1c10",
    ],
    material: "wood",
    physical: true,
  });
}

/**
 * Shuttered window. Sill at y=0 so it can sit on a wall at elev 1.
 * Warm glass glow, no cube shadows.
 */
function modelWindow() {
  const h = 13;
  const g = emptyGrid(V, h, V);

  // Stone sill, protruding toward +Z.
  box(g, 1, 0, 7, 15, 2, 16, 3);
  box(g, 2, 1, 8, 14, 2, 15, 1);
  box(g, 0, 0, 9, 16, 2, 16, 3);

  // Frame.
  post(g, 1, 1, 9, 4, 12, 15, 1, 2);
  post(g, 12, 1, 9, 15, 12, 15, 1, 2);
  box(g, 1, 10, 9, 15, 13, 15, 1);
  box(g, 2, 11, 10, 14, 12, 14, 2);
  box(g, 1, 1, 9, 15, 3, 15, 1);

  // Glowing panes behind a 2×2 muntin.
  box(g, 4, 3, 11, 12, 10, 14, 6, 170);
  box(g, 5, 4, 12, 7, 6, 14, 7, 240);
  box(g, 9, 4, 12, 11, 6, 14, 7, 230);
  box(g, 5, 7, 12, 7, 9, 14, 7, 210);
  box(g, 9, 7, 12, 11, 9, 14, 7, 200);
  box(g, 7, 3, 11, 9, 10, 13, 8);
  box(g, 4, 6, 11, 12, 7, 13, 8);

  // Open shutters folded out toward +Z — readable wings at 45°.
  box(g, 0, 2, 5, 3, 11, 11, 4);
  box(g, 1, 3, 6, 3, 10, 10, 5);
  box(g, 0, 3, 6, 1, 5, 10, 2);
  box(g, 0, 8, 6, 1, 10, 10, 2);
  box(g, 1, 4, 5, 2, 9, 6, 2);

  box(g, 13, 2, 5, 16, 11, 11, 4);
  box(g, 13, 3, 6, 15, 10, 10, 5);
  box(g, 15, 3, 6, 16, 5, 10, 2);
  box(g, 15, 8, 6, 16, 10, 10, 2);
  box(g, 14, 4, 5, 15, 9, 6, 2);

  return finishModel(g, {
    id: "vox_fan_window",
    nameRu: "Окно",
    tags: TAGS_LIGHT,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#4a3420",
      "#7a5834",
      "#6a665c",
      "#6a3a18",
      "#8a5c34",
      "#d8a040",
      "#fff0c0",
      "#2a2420",
    ],
    material: "wood",
    physical: true,
    ...windowLight(1.7, 0.5),
  });
}

/**
 * 2×1 shallow shop facade: window, counter lip, hanging board.
 * Wall at −Z, street at +Z. Not a house, not the market stall.
 */
function modelShopFront() {
  const h = 20;
  const sx = V * 2;
  const g = emptyGrid(sx, h, V);

  // Back wall mass — plaster with wood bones, only ~5 vx deep.
  box(g, 0, 0, 0, 32, 18, 5, 1);
  box(g, 1, 1, 1, 31, 17, 5, 2);
  box(g, 0, 0, 0, 32, 3, 5, 3);
  box(g, 0, 16, 0, 32, 19, 6, 3);
  box(g, 0, 17, 0, 32, 20, 5, 1);
  box(g, 2, 18, 1, 30, 19, 5, 8);

  // Window opening + glowing shop glass, facing +Z.
  box(g, 3, 6, 3, 18, 16, 6, 4, 120);
  box(g, 4, 7, 4, 10, 11, 6, 5, 220);
  box(g, 11, 7, 4, 17, 11, 6, 5, 210);
  box(g, 4, 12, 4, 10, 15, 6, 5, 200);
  box(g, 11, 12, 4, 17, 15, 6, 5, 190);
  box(g, 10, 6, 3, 12, 16, 5, 3);
  box(g, 3, 11, 3, 18, 12, 5, 3);
  box(g, 3, 6, 3, 18, 7, 5, 3);
  box(g, 3, 15, 3, 18, 16, 5, 3);
  box(g, 3, 6, 3, 4, 16, 5, 3);
  box(g, 17, 6, 3, 18, 16, 5, 3);

  // Counter lip toward +Z — shop shelf, not a tavern bar.
  box(g, 2, 4, 4, 22, 7, 12, 3);
  box(g, 3, 5, 5, 21, 7, 11, 8);
  box(g, 2, 4, 10, 22, 5, 12, 1);
  box(g, 6, 6, 9, 10, 8, 12, 6);
  box(g, 12, 6, 9, 16, 8, 12, 7);

  // Closed service door on the right (short panel, not vox_fan_door).
  box(g, 22, 3, 3, 30, 16, 6, 3);
  box(g, 23, 4, 4, 29, 15, 6, 8);
  box(g, 24, 5, 5, 26, 9, 7, 1);
  box(g, 26, 10, 5, 29, 13, 7, 6);

  // Hanging board on two short chains — attached to the facade, no post.
  box(g, 8, 16, 5, 10, 19, 8, 6);
  box(g, 16, 16, 5, 18, 19, 8, 6);
  box(g, 6, 10, 6, 20, 17, 11, 3);
  box(g, 7, 11, 7, 19, 16, 11, 7);
  box(g, 10, 12, 9, 16, 15, 12, 6);
  box(g, 12, 13, 10, 14, 15, 12, 4);

  return finishModel(g, {
    id: "vox_fan_shop_front",
    nameRu: "Витрина",
    tags: TAGS_LIGHT,
    sizeBlocks: { x: 2, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5a5048",
      "#8a8070",
      "#4a3420",
      "#d8a040",
      "#fff0c0",
      "#c4a060",
      "#6a2430",
      "#7a5834",
    ],
    material: "wood",
    physical: true,
    ...windowLight(1.5, 0.4),
  });
}

/**
 * Striped shop awning only. Teal/cream so it is not the market stall canopy.
 * Wall mounts at −Z, slope down toward +Z. Empty below, physical: false.
 */
function modelAwningStripe() {
  const h = 22;
  const sx = V * 2;
  const g = emptyGrid(sx, h, V);

  // Wall mounts + ridge beam at −Z. Front rail at +Z. No stall posts.
  box(g, 1, 17, 0, 5, 22, 4, 1);
  box(g, 27, 17, 0, 31, 22, 4, 1);
  box(g, 0, 19, 0, 32, 22, 4, 2);
  box(g, 0, 16, 13, 32, 19, 16, 1);
  box(g, 2, 18, 3, 5, 21, 8, 2);
  box(g, 27, 18, 3, 30, 21, 8, 2);

  for (let z = 0; z < V; z++) {
    const y0 = 20 - Math.floor(z / 4);
    const y1 = y0 + 3;
    for (let x = 1; x < sx - 1; x++) {
      const stripe = Math.floor(x / 4) % 2 === 0 ? 3 : 4;
      const edge = Math.floor(x / 4) % 2 === 0 ? 5 : 6;
      box(g, x, y0, z, x + 1, y1, z + 1, z < 2 || z > 13 ? edge : stripe);
    }
  }

  // Scalloped fringe at the street edge.
  for (let x = 1; x < sx - 1; x++) {
    const dip = x % 4 === 1 || x % 4 === 2 ? 2 : 1;
    const pal = Math.floor(x / 4) % 2 === 0 ? 3 : 4;
    box(g, x, 16 - dip, 14, x + 1, 17, 16, pal);
  }
  box(g, 0, 20, 0, 32, 22, 2, 1);
  box(g, 0, 16, 14, 32, 18, 16, 2);

  return finishModel(g, {
    id: "vox_fan_awning_stripe",
    nameRu: "Маркиза",
    tags: TAGS,
    sizeBlocks: { x: 2, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#6a4428",
      "#2a6a78",
      "#e8d8b0",
      "#1a4a58",
      "#c8c0a0",
    ],
    material: "cloth",
    physical: false,
  });
}

/** Brick chimney stub for rooftops. Not the forge hearth. */
function modelChimney() {
  const h = 16;
  const g = emptyGrid(V, h, V);

  function brickPal(x, y, z) {
    if (y % 2 === 0) return 4;
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

  // Roof flashing / base.
  box(g, 2, 0, 2, 14, 2, 14, 5);
  box(g, 3, 1, 3, 13, 3, 13, 4);
  brickBox(4, 2, 4, 12, 13, 12);

  // Hollow flue.
  box(g, 6, 3, 6, 10, 15, 10, 0);
  box(g, 6, 3, 6, 10, 5, 10, 6);

  // Cap with overhang.
  brickBox(3, 12, 3, 13, 14, 13);
  box(g, 5, 13, 5, 11, 15, 11, 5);
  box(g, 6, 14, 6, 10, 16, 10, 0);
  box(g, 7, 13, 7, 9, 15, 9, 6);

  // Soot streaks on +Z.
  box(g, 5, 6, 11, 7, 12, 12, 6);
  box(g, 9, 8, 11, 11, 12, 12, 6);

  return finishModel(g, {
    id: "vox_fan_chimney",
    nameRu: "Труба",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#5a2c1c",
      "#8a4430",
      "#b05a38",
      "#8a8078",
      "#3a3834",
      "#2a221c",
    ],
    material: "stone",
    physical: true,
  });
}

/** Two steps, landing, and posts. 1×1 entry porch, not a hitching post. */
function modelPorch() {
  const h = 16;
  const g = emptyGrid(V, h, V);

  // Lower step toward +Z, then riser, then landing at the back.
  box(g, 1, 0, 9, 15, 2, 16, 1);
  box(g, 2, 1, 10, 14, 2, 15, 2);
  box(g, 2, 2, 5, 14, 4, 16, 2);
  box(g, 3, 3, 6, 13, 4, 15, 3);
  box(g, 1, 4, 1, 15, 6, 12, 1);
  box(g, 2, 5, 2, 14, 6, 11, 3);
  box(g, 1, 0, 14, 15, 2, 16, 6);
  box(g, 1, 2, 14, 3, 4, 16, 6);
  box(g, 13, 2, 14, 15, 4, 16, 6);

  // Posts + beam. Gap between them so it is not a crate wall.
  post(g, 1, 6, 1, 5, 15, 5, 1, 2);
  post(g, 11, 6, 1, 15, 15, 5, 1, 2);
  box(g, 1, 13, 1, 15, 16, 5, 3);
  box(g, 2, 14, 2, 14, 16, 4, 2);
  box(g, 1, 13, 1, 15, 14, 2, 1);

  // Short roof plank for a 45° eave.
  box(g, 0, 15, 0, 16, 16, 6, 3);
  box(g, 0, 14, 5, 16, 16, 7, 2);

  return finishModel(g, {
    id: "vox_fan_porch",
    nameRu: "Крыльцо",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#5c3c22",
      "#8a5c34",
      "#c4a060",
      "#6a665c",
      "#4a4840",
    ],
    material: "wood",
    physical: true,
  });
}

/**
 * Fantasy street post box: wood cabinet on a post, iron bands, peaked roof.
 * Not the US rural mailbox and not vox_vil_mailbox.
 */
function modelMailBox() {
  const h = 18;
  const g = emptyGrid(V, h, V);

  // Post + foot.
  box(g, 5, 0, 5, 11, 2, 11, 1);
  box(g, 6, 1, 6, 10, 2, 10, 6);
  post(g, 6, 2, 6, 10, 9, 10, 2, 1);

  // Cabinet body.
  box(g, 3, 8, 4, 13, 16, 12, 2);
  box(g, 4, 9, 5, 12, 15, 11, 3);
  box(g, 4, 9, 10, 12, 15, 12, 1);

  // Iron bands + slot.
  box(g, 3, 10, 4, 13, 12, 12, 4);
  box(g, 3, 14, 4, 13, 15, 12, 4);
  box(g, 5, 12, 11, 11, 14, 13, 5);
  box(g, 6, 12, 12, 10, 14, 13, 8);
  box(g, 9, 10, 11, 12, 13, 13, 7);
  box(g, 10, 11, 12, 12, 12, 13, 7);

  // Peaked shingle roof — shrine mailbox, not a cylinder.
  box(g, 2, 15, 3, 14, 17, 13, 6);
  box(g, 4, 16, 4, 12, 18, 12, 6);
  box(g, 6, 17, 5, 10, 18, 11, 1);
  box(g, 3, 15, 3, 13, 16, 5, 1);
  box(g, 7, 16, 11, 9, 18, 13, 7);

  return finishModel(g, {
    id: "vox_fan_mail_box",
    nameRu: "Почтовый ящик",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#2e2216",
      "#5c3c22",
      "#8a5c34",
      "#2a2420",
      "#7a7670",
      "#4a3428",
      "#c4a060",
      "#1a1410",
    ],
    material: "wood",
    physical: true,
  });
}

/**
 * Hanging town banner on a wall rod. Cloth + emblem, no ground post.
 * physical: false. Distinct from inn_sign / mage_sign boards.
 */
function modelBanner() {
  const h = 20;
  const g = emptyGrid(V, h, V);

  // Wall brackets + rod at the top.
  box(g, 1, 16, 10, 4, 20, 14, 1);
  box(g, 12, 16, 10, 15, 20, 14, 1);
  box(g, 1, 17, 8, 15, 20, 12, 2);
  box(g, 0, 18, 7, 16, 20, 11, 1);
  box(g, 7, 19, 7, 9, 20, 9, 6);

  // Cloth body, 3 vx thick, swallowtail at the bottom.
  box(g, 3, 5, 6, 13, 18, 9, 3);
  box(g, 4, 6, 5, 12, 17, 8, 4);
  box(g, 5, 4, 6, 8, 7, 9, 3);
  box(g, 8, 3, 6, 11, 6, 9, 3);
  box(g, 4, 5, 5, 7, 7, 8, 4);
  box(g, 9, 4, 5, 12, 6, 8, 4);

  // Cream trim + gold sun emblem (disk + 4 thick rays).
  box(g, 3, 16, 6, 13, 18, 9, 5);
  box(g, 3, 5, 6, 4, 18, 9, 5);
  box(g, 12, 5, 6, 13, 18, 9, 5);
  for (let y = 9; y < 15; y++) {
    for (let x = 5; x < 11; x++) {
      if (inDisk(x, y, 8, 12, 2.35)) setV(g, x, y, 5, 6);
      if (inDisk(x, y, 8, 12, 1.35)) setV(g, x, y, 4, 6);
    }
  }
  box(g, 7, 8, 5, 9, 16, 7, 6);
  box(g, 5, 11, 5, 11, 13, 7, 6);
  box(g, 7, 11, 4, 9, 13, 5, 2);

  return finishModel(g, {
    id: "vox_fan_banner",
    nameRu: "Знамя",
    tags: TAGS,
    sizeBlocks: { x: 1, y: 2, z: 1 },
    heightVoxels: h,
    palette: [
      "",
      "#3a2818",
      "#8a7a50",
      "#6a1830",
      "#a02840",
      "#e8d8b0",
      "#c4a060",
    ],
    material: "cloth",
    physical: false,
  });
}

const models = [
  modelDoor(),
  modelWindow(),
  modelShopFront(),
  modelAwningStripe(),
  modelChimney(),
  modelPorch(),
  modelMailBox(),
  modelBanner(),
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

console.log(`fantasy env13 building kit: ${models.length} models\n${summary}`);
