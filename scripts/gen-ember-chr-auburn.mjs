#!/usr/bin/env node
/**
 * First Ember voxel character — chibi_32 volume, id vox_chr_auburn.
 *
 * Skeleton (offsets / joints / idle+walk) matches createChibi32Character
 * in src/game/voxel/voxelCharacter.ts. Paint is an original JRPG-chibi
 * interpretation — not a copy of any game files.
 *
 * Front is +Z. Hair is the thickest volume. Vest one voxel proud of shirt.
 *
 * Run: node scripts/gen-ember-chr-auburn.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modelsDir = join(root, "content/ember/voxels/models");
const scenesDir = join(root, "content/ember/voxels/scenes");

const ID = "vox_chr_auburn";
const NAME_RU = "Рыжая";

const SKIN = 1;
const HAIR_D = 2;
const HAIR_M = 3;
const GINGER = 4;
const EYE = 5;
const SHIRT = 6;
const VEST = 7;
const VEST_H = 8;
const BOOT = 9;

const PALETTE = [
  "",
  "#fcd2b4",
  "#6b1b1b",
  "#8f2e2e",
  "#d66233",
  "#d67e33",
  "#d3d3d3",
  "#2b2d2f",
  "#3f4448",
  "#1a1a1c",
];

const SLOT_LABEL = {
  pelvis: "Таз",
  torso: "Торс",
  head: "Голова",
  arm_l: "Рука Л",
  arm_r: "Рука П",
  leg_l: "Нога Л",
  leg_r: "Нога П",
  hair: "Волосы",
  twin_l: "Хвост Л",
  twin_r: "Хвост П",
  ears: "Ушки",
};

const JOINT_LABEL = {
  jnt_torso: "Пояс",
  jnt_head: "Шея",
  jnt_arm_l: "Плечо Л",
  jnt_arm_r: "Плечо П",
  jnt_leg_l: "Бедро Л",
  jnt_leg_r: "Бедро П",
  jnt_hair: "Волосы",
  jnt_twin_l: "Хвост Л",
  jnt_twin_r: "Хвост П",
  jnt_ears: "Ушки",
};

const SLOT_HEIGHT = {
  pelvis: 4,
  torso: 8,
  head: 12,
  arm_l: 10,
  arm_r: 10,
  leg_l: 12,
  leg_r: 12,
  hair: 6,
  twin_l: 18,
  twin_r: 18,
  ears: 4,
};

const SLOT_OFFSET = {
  pelvis: { x: 0, y: 12, z: 0 },
  torso: { x: 0, y: 16, z: 0 },
  head: { x: 0, y: 20, z: 0 },
  arm_l: { x: 0, y: 14, z: 0 },
  arm_r: { x: 0, y: 14, z: 0 },
  leg_l: { x: 0, y: 0, z: 0 },
  leg_r: { x: 0, y: 0, z: 0 },
  hair: { x: 0, y: 28, z: 0 },
  twin_l: { x: 0, y: 10, z: 0 },
  twin_r: { x: 0, y: 10, z: 0 },
  ears: { x: 0, y: 31, z: 0 },
};

const PHYSICAL = {
  pelvis: true,
  torso: true,
  head: true,
  arm_l: true,
  arm_r: true,
  leg_l: true,
  leg_r: true,
  hair: false,
  twin_l: false,
  twin_r: false,
  ears: false,
};

function emptyGrid(sx, sy, sz) {
  return { sx, sy, sz, data: new Uint8Array(sx * sy * sz) };
}

function idx(g, x, y, z) {
  return x + z * g.sx + y * g.sx * g.sz;
}

function inBounds(g, x, y, z) {
  return x >= 0 && y >= 0 && z >= 0 && x < g.sx && y < g.sy && z < g.sz;
}

function setV(g, x, y, z, c) {
  if (!inBounds(g, x, y, z) || c <= 0) return;
  g.data[idx(g, x, y, z)] = c;
}

function getV(g, x, y, z) {
  if (!inBounds(g, x, y, z)) return 0;
  return g.data[idx(g, x, y, z)];
}

function box(g, x0, y0, z0, x1, y1, z1, c) {
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);
  const za = Math.min(z0, z1);
  const zb = Math.max(z0, z1);
  for (let y = ya; y <= yb; y++) {
    for (let z = za; z <= zb; z++) {
      for (let x = xa; x <= xb; x++) setV(g, x, y, z, c);
    }
  }
}

function ellipsoid(g, cx, cy, cz, rx, ry, rz, c) {
  const x0 = Math.floor(cx - rx);
  const x1 = Math.ceil(cx + rx);
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  const z0 = Math.floor(cz - rz);
  const z1 = Math.ceil(cz + rz);
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        const nz = (z + 0.5 - cz) / rz;
        if (nx * nx + ny * ny + nz * nz <= 1.02) setV(g, x, y, z, c);
      }
    }
  }
}

function finishModel(g) {
  return Array.from(g.data);
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function writePart(slot, voxels) {
  const heightVoxels = SLOT_HEIGHT[slot];
  const partId = `${ID}_${slot}`;
  const nameRu = `${NAME_RU} — ${SLOT_LABEL[slot]}`;
  const payload = {
    id: partId,
    nameRu,
    tags: ["character", "chibi"],
    model: {
      id: partId,
      nameRu,
      tags: ["character", "chibi"],
      sizeBlocks: { x: 1, y: 1, z: 1 },
      heightVoxels,
      palette: PALETTE,
      voxels,
      material: "cloth",
      physical: PHYSICAL[slot],
    },
  };
  writeJson(join(modelsDir, `${partId}.json`), payload);
}

function hingePivots(parentSlot, childSlot, childPivot) {
  const parentOff = SLOT_OFFSET[parentSlot];
  const childOff = SLOT_OFFSET[childSlot];
  return {
    childPivot,
    parentPivot: {
      x: childOff.x - parentOff.x + childPivot.x,
      y: childOff.y - parentOff.y + childPivot.y,
      z: childOff.z - parentOff.z + childPivot.z,
    },
  };
}

function paintHead() {
  const g = emptyGrid(16, 12, 16);
  ellipsoid(g, 8, 5.4, 7.6, 5.6, 5.4, 5.3, SKIN);

  ellipsoid(g, 8, 8.0, 6.8, 5.8, 3.8, 5.6, HAIR_D);
  ellipsoid(g, 8, 8.6, 6.2, 5.0, 2.8, 4.8, HAIR_M);

  box(g, 3, 7, 10, 12, 11, 13, HAIR_D);
  box(g, 4, 8, 11, 11, 11, 13, HAIR_M);
  box(g, 5, 9, 12, 6, 11, 13, GINGER);
  box(g, 9, 9, 12, 10, 11, 13, GINGER);
  box(g, 7, 10, 12, 8, 11, 13, HAIR_M);
  setV(g, 4, 7, 13, HAIR_M);
  setV(g, 11, 7, 13, HAIR_M);
  setV(g, 6, 8, 13, GINGER);
  setV(g, 9, 8, 13, GINGER);

  for (let x = 3; x <= 12; x++) {
    setV(g, x, 8, 9, BOOT);
    setV(g, x, 8, 10, BOOT);
  }
  box(g, 4, 8, 11, 11, 8, 11, HAIR_D);

  box(g, 5, 1, 11, 10, 6, 12, SKIN);
  box(g, 4, 4, 12, 5, 5, 12, EYE);
  box(g, 10, 4, 12, 11, 5, 12, EYE);
  setV(g, 4, 5, 12, BOOT);
  setV(g, 10, 5, 12, BOOT);
  setV(g, 7, 2, 12, VEST);

  box(g, 1, 3, 5, 3, 9, 10, HAIR_D);
  box(g, 12, 3, 5, 14, 9, 10, HAIR_D);
  box(g, 1, 5, 6, 2, 8, 9, HAIR_M);
  box(g, 13, 5, 6, 14, 8, 9, HAIR_M);
  box(g, 1, 6, 8, 2, 8, 10, GINGER);
  box(g, 13, 6, 8, 14, 8, 10, GINGER);

  box(g, 3, 2, 1, 12, 9, 4, HAIR_D);
  box(g, 4, 3, 1, 11, 8, 3, HAIR_M);
  box(g, 5, 4, 1, 6, 7, 2, GINGER);
  box(g, 9, 4, 1, 10, 7, 2, GINGER);

  box(g, 6, 0, 6, 9, 2, 9, SKIN);
  return finishModel(g);
}

function paintHair() {
  const g = emptyGrid(16, 6, 16);
  ellipsoid(g, 8, 2.2, 6.2, 6.4, 3.2, 6.0, HAIR_D);
  box(g, 2, 0, 0, 13, 4, 5, HAIR_D);
  box(g, 3, 0, 0, 12, 3, 3, HAIR_M);
  box(g, 4, 1, 0, 5, 3, 2, GINGER);
  box(g, 10, 1, 0, 11, 3, 2, GINGER);
  box(g, 3, 1, 5, 12, 4, 12, HAIR_D);
  box(g, 4, 2, 7, 11, 4, 12, HAIR_M);
  box(g, 5, 3, 10, 6, 4, 12, GINGER);
  box(g, 9, 3, 10, 10, 4, 12, GINGER);

  // Hooked ahoge curling right — 2 vx thick, above the cap so +Z reads it.
  box(g, 7, 4, 6, 8, 5, 8, HAIR_M);
  box(g, 8, 5, 7, 9, 5, 8, GINGER);
  box(g, 9, 5, 8, 11, 5, 10, GINGER);
  box(g, 10, 5, 9, 12, 5, 11, HAIR_M);
  box(g, 11, 4, 9, 13, 5, 12, HAIR_D);
  box(g, 12, 3, 10, 14, 4, 12, HAIR_D);
  box(g, 13, 2, 9, 14, 3, 11, HAIR_D);
  box(g, 13, 1, 7, 14, 2, 9, HAIR_M);
  box(g, 13, 0, 6, 14, 1, 7, GINGER);
  box(g, 12, 4, 11, 13, 5, 12, GINGER);
  return finishModel(g);
}

function paintTwin(side) {
  const g = emptyGrid(16, 18, 16);
  const left = side === "l";
  const x0 = left ? 0 : 10;
  const x1 = left ? 5 : 15;
  const mid = left ? 2 : 13;
  const outer = left ? 0 : 15;
  const inner = left ? 5 : 10;
  const outerIn = left ? 1 : 14;

  box(g, x0, 10, 1, x1, 17, 8, HAIR_D);
  box(g, x0 + (left ? 0 : 1), 12, 2, x1 - (left ? 1 : 0), 17, 7, HAIR_M);
  box(g, mid - 1, 16, 2, mid + 1, 17, 4, HAIR_M);

  box(g, outer, 9, 6, outerIn, 16, 10, HAIR_D);
  box(g, outer, 11, 7, outerIn, 15, 10, HAIR_M);

  box(g, x0, 4, 1, x1 - (left ? 0 : 1), 10, 7, HAIR_D);
  box(g, x0 + (left ? 0 : 1), 5, 2, x1 - (left ? 1 : 0), 9, 6, HAIR_M);

  box(g, x0 + (left ? 0 : 2), 0, 2, x1 - (left ? 2 : 0), 4, 7, HAIR_D);
  box(g, x0 + (left ? 1 : 2), 0, 2, x1 - (left ? 2 : 1), 2, 6, HAIR_M);

  box(g, outer, 8, 2, outer, 16, 6, GINGER);
  box(g, outer, 2, 3, outerIn, 7, 5, GINGER);
  box(g, inner, 12, 2, inner, 16, 4, HAIR_M);
  box(g, mid, 0, 3, mid, 1, 5, GINGER);
  return finishModel(g);
}

function paintEars() {
  const g = emptyGrid(16, 4, 16);
  box(g, 1, 0, 6, 3, 1, 8, SKIN);
  box(g, 1, 1, 6, 2, 2, 7, SKIN);
  setV(g, 1, 3, 6, SKIN);
  setV(g, 2, 2, 6, SKIN);

  box(g, 12, 0, 6, 14, 1, 8, SKIN);
  box(g, 13, 1, 6, 14, 2, 7, SKIN);
  setV(g, 14, 3, 6, SKIN);
  setV(g, 13, 2, 6, SKIN);
  return finishModel(g);
}

function paintTorso() {
  const g = emptyGrid(16, 8, 16);
  box(g, 4, 0, 5, 11, 7, 10, SHIRT);
  box(g, 5, 6, 6, 10, 7, 9, SKIN);
  box(g, 6, 7, 7, 9, 7, 8, SKIN);

  box(g, 5, 0, 6, 10, 6, 11, VEST);
  box(g, 6, 1, 11, 9, 5, 11, VEST_H);
  box(g, 5, 0, 6, 5, 6, 10, VEST_H);
  box(g, 10, 0, 6, 10, 6, 10, VEST_H);
  box(g, 6, 0, 6, 9, 0, 7, VEST);
  return finishModel(g);
}

function paintPelvis() {
  const g = emptyGrid(16, 4, 16);
  box(g, 3, 1, 4, 12, 3, 11, VEST);
  box(g, 2, 0, 4, 13, 1, 12, VEST);
  box(g, 3, 0, 5, 12, 0, 11, VEST_H);
  box(g, 4, 2, 5, 11, 3, 10, VEST);
  box(g, 5, 3, 6, 10, 3, 9, SHIRT);
  return finishModel(g);
}

function paintArm(side) {
  const g = emptyGrid(16, 10, 16);
  const left = side === "l";
  const x0 = left ? 1 : 12;
  const x1 = left ? 3 : 14;
  const shoulder = left ? 4 : 11;

  box(g, x0, 6, 6, x1, 9, 8, SHIRT);
  if (left) box(g, 1, 8, 5, shoulder, 9, 8, SHIRT);
  else box(g, shoulder, 8, 5, 14, 9, 8, SHIRT);

  box(g, x0, 4, 6, x1, 5, 8, SKIN);
  box(g, x0, 1, 6, x1, 3, 8, BOOT);
  box(g, x0, 0, 6, x1, 0, 8, SKIN);
  return finishModel(g);
}

function paintLeg(side) {
  const g = emptyGrid(16, 12, 16);
  const left = side === "l";
  const x0 = left ? 4 : 8;
  const x1 = left ? 7 : 11;

  box(g, x0, 8, 6, x1, 11, 9, SKIN);
  box(g, x0, 3, 6, x1, 7, 9, VEST);
  box(g, x0, 7, 6, x1, 7, 9, VEST_H);

  box(g, x0 - 1, 0, 5, x1 + 1, 2, 10, BOOT);
  box(g, x0, 0, 6, x1, 2, 10, BOOT);
  box(g, x0, 1, 10, x1, 1, 10, VEST_H);
  return finishModel(g);
}

const PAINTERS = {
  head: paintHead,
  hair: paintHair,
  twin_l: () => paintTwin("l"),
  twin_r: () => paintTwin("r"),
  ears: paintEars,
  torso: paintTorso,
  pelvis: paintPelvis,
  arm_l: () => paintArm("l"),
  arm_r: () => paintArm("r"),
  leg_l: () => paintLeg("l"),
  leg_r: () => paintLeg("r"),
};

function writeScene() {
  const objects = [];
  const slots = {};
  for (const slot of Object.keys(SLOT_HEIGHT)) {
    const objId = `obj_${slot}`;
    objects.push({
      id: objId,
      nameRu: SLOT_LABEL[slot],
      modelId: `${ID}_${slot}`,
      offset: { ...SLOT_OFFSET[slot] },
      rot: 0,
      visible: true,
    });
    slots[slot] = objId;
  }

  const joint = (id, parentSlot, childSlot, axis, childPivot) => {
    const pivots = hingePivots(parentSlot, childSlot, childPivot);
    return {
      id,
      nameRu: JOINT_LABEL[id],
      parentObjectId: `obj_${parentSlot}`,
      childObjectId: `obj_${childSlot}`,
      parentPivot: pivots.parentPivot,
      childPivot: pivots.childPivot,
      axis,
    };
  };

  const swing = (jointId, sign) => ({
    jointId,
    keys: [
      { t: 0, angleDeg: 0 },
      { t: 0.25, angleDeg: 18 * sign },
      { t: 0.5, angleDeg: 0 },
      { t: 0.75, angleDeg: -18 * sign },
      { t: 1, angleDeg: 0 },
    ],
  });

  const scene = {
    id: ID,
    scene: {
      id: ID,
      nameRu: NAME_RU,
      objects,
      joints: [
        joint("jnt_torso", "pelvis", "torso", "x", { x: 8, y: 0, z: 8 }),
        joint("jnt_head", "torso", "head", "y", { x: 8, y: 0, z: 8 }),
        joint("jnt_arm_l", "torso", "arm_l", "x", { x: 4, y: 10, z: 7 }),
        joint("jnt_arm_r", "torso", "arm_r", "x", { x: 12, y: 10, z: 7 }),
        joint("jnt_leg_l", "pelvis", "leg_l", "x", { x: 6, y: 12, z: 8 }),
        joint("jnt_leg_r", "pelvis", "leg_r", "x", { x: 10, y: 12, z: 8 }),
        joint("jnt_hair", "head", "hair", "y", { x: 8, y: 0, z: 8 }),
        joint("jnt_twin_l", "hair", "twin_l", "x", { x: 2, y: 18, z: 3 }),
        joint("jnt_twin_r", "hair", "twin_r", "x", { x: 13, y: 18, z: 3 }),
        joint("jnt_ears", "head", "ears", "y", { x: 8, y: 0, z: 8 }),
      ],
      animations: [
        { id: "clip_idle", nameRu: "Стойка", durationSec: 1.2, tracks: [] },
        {
          id: "clip_walk",
          nameRu: "Ходьба",
          durationSec: 0.8,
          tracks: [
            swing("jnt_leg_l", 1),
            swing("jnt_leg_r", -1),
            swing("jnt_arm_l", -1),
            swing("jnt_arm_r", 1),
          ],
        },
      ],
      role: "character",
      character: {
        templateId: "chibi_32",
        bodyHeightVoxels: 22,
        bodyRadiusVoxels: 4.5,
        slots,
        clips: { idle: "clip_idle", walk: "clip_walk" },
      },
    },
  };
  writeJson(join(scenesDir, `${ID}.json`), scene);
}

function hexToRgb(hex) {
  const n = hex.replace("#", "");
  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16),
  ];
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function writePng(path, width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 4, "ascii");
    data.copy(out, 8);
    const crc = crc32(out.subarray(4, 8 + data.length));
    out.writeUInt32BE(crc, 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

function compositeWorld(parts) {
  const sy = 36;
  const world = emptyGrid(16, sy, 16);
  const order = [
    "leg_l",
    "leg_r",
    "pelvis",
    "torso",
    "arm_l",
    "arm_r",
    "twin_l",
    "twin_r",
    "head",
    "hair",
    "ears",
  ];
  for (const slot of order) {
    const voxels = parts[slot];
    const h = SLOT_HEIGHT[slot];
    const off = SLOT_OFFSET[slot];
    const g = { sx: 16, sy: h, sz: 16, data: Uint8Array.from(voxels) };
    for (let y = 0; y < h; y++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const c = getV(g, x, y, z);
          if (c) setV(world, x + off.x, y + off.y, z + off.z, c);
        }
      }
    }
  }
  return world;
}

function shade(rgb, factor) {
  return rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * factor))));
}

function renderViews(world, scale) {
  const colors = PALETTE.map((hex) => (hex ? hexToRgb(hex) : [0, 0, 0]));
  const views = [
    {
      name: "front",
      w: 16,
      h: world.sy,
      sample(sx, sy) {
        const y = world.sy - 1 - sy;
        for (let z = 15; z >= 0; z--) {
          const c = getV(world, sx, y, z);
          if (c) return { c, depth: z / 15 };
        }
        return null;
      },
    },
    {
      name: "side",
      w: 16,
      h: world.sy,
      sample(sx, sy) {
        const y = world.sy - 1 - sy;
        const z = sx;
        for (let x = 15; x >= 0; x--) {
          const c = getV(world, x, y, z);
          if (c) return { c, depth: x / 15 };
        }
        return null;
      },
    },
    {
      name: "three_quarter",
      w: 22,
      h: world.sy + 6,
      sample(sx, sy) {
        const y = world.sy + 5 - sy;
        for (let d = 0; d < 28; d++) {
          const x = sx - 4 + Math.floor(d * 0.35);
          const z = 18 - d;
          const c = getV(world, x, y, z);
          if (c) return { c, depth: 1 - d / 28 };
        }
        return null;
      },
    },
  ];

  const gap = 4;
  const panelW = views.map((v) => v.w * scale);
  const panelH = views.map((v) => v.h * scale);
  const width = panelW.reduce((a, b) => a + b, 0) + gap * (views.length + 1);
  const height = Math.max(...panelH) + gap * 2;
  const rgba = Buffer.alloc(width * height * 4, 0);
  const bg = [26, 20, 16];
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = bg[0];
    rgba[i * 4 + 1] = bg[1];
    rgba[i * 4 + 2] = bg[2];
    rgba[i * 4 + 3] = 255;
  }

  let ox = gap;
  for (let vi = 0; vi < views.length; vi++) {
    const view = views[vi];
    const oy = gap + (Math.max(...panelH) - panelH[vi]);
    for (let sy = 0; sy < view.h; sy++) {
      for (let sx = 0; sx < view.w; sx++) {
        const hit = view.sample(sx, sy);
        if (!hit) continue;
        const rgb = shade(colors[hit.c], 0.72 + hit.depth * 0.4);
        for (let py = 0; py < scale; py++) {
          for (let px = 0; px < scale; px++) {
            const x = ox + sx * scale + px;
            const y = oy + sy * scale + py;
            const i = (y * width + x) * 4;
            rgba[i] = rgb[0];
            rgba[i + 1] = rgb[1];
            rgba[i + 2] = rgb[2];
            rgba[i + 3] = 255;
          }
        }
      }
    }
    ox += panelW[vi] + gap;
  }
  return { width, height, rgba };
}

mkdirSync(modelsDir, { recursive: true });
mkdirSync(scenesDir, { recursive: true });

const parts = {};
const counts = {};
for (const slot of Object.keys(SLOT_HEIGHT)) {
  const voxels = PAINTERS[slot]();
  parts[slot] = voxels;
  counts[slot] = voxels.filter((v) => v > 0).length;
  writePart(slot, voxels);
}
writeScene();

const world = compositeWorld(parts);
const preview = renderViews(world, 10);
const previewPath = "/tmp/chr-auburn-preview.png";
writePng(previewPath, preview.width, preview.height, preview.rgba);

console.log(`wrote ${ID} scene + ${Object.keys(SLOT_HEIGHT).length} parts`);
console.log(counts);
console.log(`preview ${previewPath} ${preview.width}x${preview.height}`);
