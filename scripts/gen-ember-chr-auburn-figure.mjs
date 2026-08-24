#!/usr/bin/env node
/**
 * Single MagicaVoxel-style statue of the auburn JRPG chibi.
 * One id, one grid — not a slotted voxelCharacter / chibi_32 rig.
 *
 * Proportions follow the 2D refs (~45 px tall, head ~1/3). Front is +Z.
 * Run: node scripts/gen-ember-chr-auburn-figure.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ember = path.join(root, "content", "ember");

const ID = "vox_chr_auburn_fig";
const NAME_RU = "Рыжая";
const H = 46;
const SX = 16;
const SZ = 16;

const SKIN = 1;
const HAIR_D = 2;
const HAIR_M = 3;
const GINGER = 4;
const EYE = 5;
const SHIRT = 6;
const VEST = 7;
const VEST_H = 8;
const BOOT = 9;
const SKIN_S = 10;
const EYE_D = 11;

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
  "#e8a88c",
  "#a34e1c",
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

function getV(g, x, y, z) {
  if (x < 0 || y < 0 || z < 0 || x >= g.sx || y >= g.sy || z >= g.sz) return 0;
  return g.voxels[vi(g, x, y, z)];
}

/** Half-open box [x0,x1) × [y0,y1) × [z0,z1), same as gen-ember-fantasy-props. */
function box(g, x0, y0, z0, x1, y1, z1, pal) {
  for (let y = y0; y < y1; y++) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) setV(g, x, y, z, pal);
    }
  }
}

function ellipsoid(g, cx, cy, cz, rx, ry, rz, pal) {
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
        if (nx * nx + ny * ny + nz * nz <= 1.02) setV(g, x, y, z, pal);
      }
    }
  }
}

function finishModel(g, spec) {
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

function carve(g, x, y, z) {
  setV(g, x, y, z, 0);
}

function paintFigure() {
  const g = emptyGrid(SX, H, SZ);

  // --- Head: ~16 vx, ~1/3 of 46. Rounded, face on +Z. ---
  ellipsoid(g, 8, 36.2, 7.6, 5.8, 7.8, 5.5, SKIN);
  ellipsoid(g, 8, 33.4, 8.4, 4.8, 5.4, 4.6, SKIN);
  box(g, 6, 28, 6, 10, 30, 10, SKIN_S);

  // Hair cap + back of skull (thickest volume), then round the box corners.
  ellipsoid(g, 8, 39.4, 7.0, 6.2, 5.2, 5.8, HAIR_D);
  ellipsoid(g, 8, 40.6, 6.2, 5.2, 3.8, 5.0, HAIR_M);
  box(g, 3, 30, 1, 13, 43, 6, HAIR_D);
  box(g, 4, 32, 1, 12, 42, 4, HAIR_M);
  box(g, 4, 34, 1, 6, 40, 3, GINGER);
  box(g, 10, 34, 1, 12, 40, 3, GINGER);

  // Side masses — long, past waist toward mid-thigh (~y 11), tapered.
  box(g, 0, 18, 3, 4, 40, 10, HAIR_D);
  box(g, 12, 18, 3, 16, 40, 10, HAIR_D);
  box(g, 0, 20, 4, 3, 37, 9, HAIR_M);
  box(g, 13, 20, 4, 16, 37, 9, HAIR_M);
  box(g, 0, 11, 4, 3, 20, 9, HAIR_D);
  box(g, 13, 11, 4, 16, 20, 9, HAIR_D);
  box(g, 1, 11, 5, 3, 15, 8, HAIR_M);
  box(g, 13, 11, 5, 15, 15, 8, HAIR_M);
  box(g, 0, 22, 5, 2, 36, 9, GINGER);
  box(g, 14, 22, 5, 16, 36, 9, GINGER);
  box(g, 1, 11, 5, 2, 14, 7, GINGER);
  box(g, 14, 11, 5, 15, 14, 7, GINGER);

  // Back sheet hanging behind the body, narrower toward the hem.
  box(g, 3, 16, 1, 13, 32, 6, HAIR_D);
  box(g, 4, 16, 1, 12, 28, 4, HAIR_M);
  box(g, 4, 11, 2, 12, 16, 6, HAIR_D);
  box(g, 5, 11, 2, 11, 16, 4, HAIR_M);
  box(g, 5, 11, 1, 7, 18, 3, GINGER);
  box(g, 9, 11, 1, 11, 18, 3, GINGER);

  // Thin bangs — forehead only, do not cover the eyes.
  box(g, 4, 38, 11, 12, 42, 14, HAIR_D);
  box(g, 5, 39, 12, 11, 42, 14, HAIR_M);
  box(g, 5, 40, 13, 7, 42, 14, GINGER);
  box(g, 9, 40, 13, 11, 42, 14, GINGER);
  setV(g, 6, 38, 13, HAIR_M);
  setV(g, 9, 38, 13, HAIR_M);

  // Round the crown so the head is not a 16-wide brick.
  for (const [x, y] of [
    [0, 39],
    [0, 40],
    [1, 41],
    [2, 42],
    [3, 43],
    [15, 39],
    [15, 40],
    [14, 41],
    [13, 42],
    [12, 43],
    [0, 18],
    [15, 18],
    [0, 17],
    [15, 17],
  ]) {
    for (let z = 0; z < SZ; z++) carve(g, x, y, z);
  }

  // Black headband behind the bangs (reads on 3/4).
  box(g, 3, 37, 8, 13, 39, 12, BOOT);

  // Open the face: pale field, two 2×3 amber eyes that dominate it.
  box(g, 3, 29, 11, 13, 38, 14, SKIN);
  box(g, 4, 29, 12, 12, 37, 14, SKIN);
  box(g, 4, 33, 13, 6, 36, 14, EYE);
  box(g, 10, 33, 13, 12, 36, 14, EYE);
  setV(g, 4, 35, 13, EYE_D);
  setV(g, 10, 35, 13, EYE_D);
  setV(g, 8, 30, 13, SKIN_S);

  // Pointed flesh ear tufts — poke through / above the side hair.
  box(g, 1, 36, 7, 3, 39, 9, SKIN);
  setV(g, 1, 39, 7, SKIN);
  setV(g, 1, 40, 6, SKIN);
  box(g, 13, 36, 7, 15, 39, 9, SKIN);
  setV(g, 14, 39, 7, SKIN);
  setV(g, 14, 40, 6, SKIN);

  // Hooked ahoge curling right, 2 vx thick, above the crown.
  box(g, 7, 42, 6, 9, 46, 9, HAIR_M);
  box(g, 8, 44, 7, 10, 46, 9, GINGER);
  box(g, 9, 44, 8, 12, 46, 11, GINGER);
  box(g, 11, 43, 9, 14, 45, 12, HAIR_M);
  box(g, 12, 41, 10, 15, 44, 13, HAIR_D);
  box(g, 13, 39, 9, 15, 42, 12, HAIR_D);
  box(g, 13, 39, 8, 15, 41, 10, GINGER);

  // --- Small body ---
  box(g, 6, 26, 6, 10, 29, 10, SKIN);
  box(g, 5, 19, 6, 11, 27, 11, SHIRT);
  box(g, 6, 19, 7, 10, 26, 12, VEST);
  box(g, 6, 20, 11, 10, 25, 12, VEST_H);
  box(g, 6, 19, 7, 7, 26, 11, VEST_H);
  box(g, 9, 19, 7, 10, 26, 11, VEST_H);

  // Short sleeves on 3×3 arms (outside the vest so they read from +Z).
  box(g, 2, 22, 6, 5, 27, 9, SHIRT);
  box(g, 11, 22, 6, 14, 27, 9, SHIRT);
  box(g, 2, 19, 6, 5, 22, 9, SKIN);
  box(g, 11, 19, 6, 14, 22, 9, SKIN);
  box(g, 2, 16, 6, 5, 20, 9, BOOT);
  box(g, 11, 16, 6, 14, 20, 9, BOOT);
  box(g, 2, 15, 6, 5, 16, 9, SKIN);
  box(g, 11, 15, 6, 14, 16, 9, SKIN);

  // Short charcoal skirt, slightly wider than the vest.
  box(g, 4, 15, 5, 12, 19, 12, VEST);
  box(g, 3, 15, 5, 13, 17, 12, VEST);
  box(g, 4, 15, 6, 12, 16, 11, VEST_H);

  // Pale thigh gap, charcoal thigh-highs, blocky black boots. 4×4 legs.
  box(g, 4, 12, 6, 8, 16, 10, SKIN);
  box(g, 8, 12, 6, 12, 16, 10, SKIN);
  box(g, 4, 5, 6, 8, 12, 10, VEST);
  box(g, 8, 5, 6, 12, 12, 10, VEST);
  box(g, 4, 11, 6, 8, 12, 10, VEST_H);
  box(g, 8, 11, 6, 12, 12, 10, VEST_H);
  box(g, 3, 0, 5, 8, 5, 11, BOOT);
  box(g, 8, 0, 5, 13, 5, 11, BOOT);
  box(g, 4, 2, 10, 8, 3, 11, VEST_H);
  box(g, 8, 2, 10, 12, 3, 11, VEST_H);

  return finishModel(g, {
    id: ID,
    nameRu: NAME_RU,
    tags: ["character", "chibi", "fantasy"],
    sizeBlocks: { x: 1, y: 3, z: 1 },
    heightVoxels: H,
    palette: PALETTE,
    material: "cloth",
    physical: true,
  });
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

function writePng(filePath, width, height, rgba) {
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
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  writeFileSync(
    filePath,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

function renderViews(g, scale) {
  const colors = PALETTE.map((hex) => (hex ? hexToRgb(hex) : [0, 0, 0]));
  const views = [
    {
      w: SX,
      h: H,
      sample(sx, sy) {
        const y = H - 1 - sy;
        for (let z = SZ - 1; z >= 0; z--) {
          const c = getV(g, sx, y, z);
          if (c) return { c, depth: z / (SZ - 1) };
        }
        return null;
      },
    },
    {
      w: SZ,
      h: H,
      sample(sx, sy) {
        const y = H - 1 - sy;
        const z = sx;
        for (let x = SX - 1; x >= 0; x--) {
          const c = getV(g, x, y, z);
          if (c) return { c, depth: x / (SX - 1) };
        }
        return null;
      },
    },
    {
      w: 22,
      h: H + 8,
      sample(sx, sy) {
        const y = H + 7 - sy;
        for (let d = 0; d < 30; d++) {
          const x = sx - 3 + Math.floor(d * 0.4);
          const z = 20 - d;
          const c = getV(g, x, y, z);
          if (c) return { c, depth: 1 - d / 30 };
        }
        return null;
      },
    },
  ];

  const gap = 6;
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
        const t = 0.7 + hit.depth * 0.42;
        const rgb = colors[hit.c].map((v) =>
          Math.max(0, Math.min(255, Math.round(v * t))),
        );
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

function frontLegend(g) {
  const names = [
    ".",
    "s",
    "H",
    "h",
    "g",
    "E",
    "w",
    "V",
    "v",
    "B",
    "d",
    "e",
  ];
  const lines = [];
  for (let y = H - 1; y >= 0; y--) {
    let row = String(y).padStart(2, "0") + " ";
    for (let x = 0; x < SX; x++) {
      let c = 0;
      for (let z = SZ - 1; z >= 0; z--) {
        c = getV(g, x, y, z);
        if (c) break;
      }
      row += names[c] ?? "?";
    }
    lines.push(row);
  }
  return lines.join("\n");
}

const model = paintFigure();
writeModel(model);

const g = {
  sx: SX,
  sy: H,
  sz: SZ,
  voxels: model.voxels,
};
const solids = model.voxels.filter((v) => v > 0).length;
const preview = renderViews(g, 8);
writePng("/tmp/chr-auburn-fig.png", preview.width, preview.height, preview.rgba);
writeFileSync("/tmp/chr-auburn-fig-front.txt", `${frontLegend(g)}\n`);

console.log(
  `${model.id}  ${model.nameRu}  ${model.heightVoxels}h  ${solids}vox  tags=${model.tags.join(",")}`,
);
console.log(`preview /tmp/chr-auburn-fig.png ${preview.width}x${preview.height}`);
console.log(frontLegend(g));
