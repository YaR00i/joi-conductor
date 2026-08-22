/**
 * MagicaVoxel .vox (ephtracy): MAIN / SIZE / XYZI / RGBA.
 * MagicaVoxel is Z-up (X/Y ground). Ember models are Y-up (X/Z ground).
 */
export type VoxVoxel = { x: number; y: number; z: number; i: number };

export type VoxModel = {
  size: { x: number; y: number; z: number };
  voxels: VoxVoxel[];
};

export type VoxDocument = {
  version: number;
  models: VoxModel[];
  /** Index 0 unused (air). Indices 1..255 are RGBA. */
  palette: Uint8Array;
};

const VOX_MAGIC = "VOX ";
const VOX_VERSION = 150;

/** Official default palette if RGBA chunk is missing (0xAABBGGRR). */
const DEFAULT_PALETTE_ABGR: readonly number[] = [
  0x00000000, 0xffffffff, 0xffccffff, 0xff99ffff, 0xff66ffff, 0xff33ffff, 0xff00ffff, 0xffffccff,
  0xffccccff, 0xff99ccff, 0xff66ccff, 0xff33ccff, 0xff00ccff, 0xffff99ff, 0xffcc99ff, 0xff9999ff,
  0xff6699ff, 0xff3399ff, 0xff0099ff, 0xffff66ff, 0xffcc66ff, 0xff9966ff, 0xff6666ff, 0xff3366ff,
  0xff0066ff, 0xffff33ff, 0xffcc33ff, 0xff9933ff, 0xff6633ff, 0xff3333ff, 0xff0033ff, 0xffff00ff,
  0xffcc00ff, 0xff9900ff, 0xff6600ff, 0xff3300ff, 0xff0000ff, 0xffffffcc, 0xffccffcc, 0xff99ffcc,
  0xff66ffcc, 0xff33ffcc, 0xff00ffcc, 0xffffcccc, 0xffcccccc, 0xff99cccc, 0xff66cccc, 0xff33cccc,
  0xff00cccc, 0xffff99cc, 0xffcc99cc, 0xff9999cc, 0xff6699cc, 0xff3399cc, 0xff0099cc, 0xffff66cc,
  0xffcc66cc, 0xff9966cc, 0xff6666cc, 0xff3366cc, 0xff0066cc, 0xffff33cc, 0xffcc33cc, 0xff9933cc,
  0xff6633cc, 0xff3333cc, 0xff0033cc, 0xffff00cc, 0xffcc00cc, 0xff9900cc, 0xff6600cc, 0xff3300cc,
  0xff0000cc, 0xffffff99, 0xffccff99, 0xff99ff99, 0xff66ff99, 0xff33ff99, 0xff00ff99, 0xffffcc99,
  0xffcccc99, 0xff99cc99, 0xff66cc99, 0xff33cc99, 0xff00cc99, 0xffff9999, 0xffcc9999, 0xff999999,
  0xff669999, 0xff339999, 0xff009999, 0xffff6699, 0xffcc6699, 0xff996699, 0xff666699, 0xff336699,
  0xff006699, 0xffff3399, 0xffcc3399, 0xff993399, 0xff663399, 0xff333399, 0xff003399, 0xffff0099,
  0xffcc0099, 0xff990099, 0xff660099, 0xff330099, 0xff000099, 0xffffff66, 0xffccff66, 0xff99ff66,
  0xff66ff66, 0xff33ff66, 0xff00ff66, 0xffffcc66, 0xffcccc66, 0xff99cc66, 0xff66cc66, 0xff33cc66,
  0xff00cc66, 0xffff9966, 0xffcc9966, 0xff999966, 0xff669966, 0xff339966, 0xff009966, 0xffff6666,
  0xffcc6666, 0xff996666, 0xff666666, 0xff336666, 0xff006666, 0xffff3366, 0xffcc3366, 0xff993366,
  0xff663366, 0xff333366, 0xff003366, 0xffff0066, 0xffcc0066, 0xff990066, 0xff660066, 0xff330066,
  0xff000066, 0xffffff33, 0xffccff33, 0xff99ff33, 0xff66ff33, 0xff33ff33, 0xff00ff33, 0xffffcc33,
  0xffcccc33, 0xff99cc33, 0xff66cc33, 0xff33cc33, 0xff00cc33, 0xffff9933, 0xffcc9933, 0xff999933,
  0xff669933, 0xff339933, 0xff009933, 0xffff6633, 0xffcc6633, 0xff996633, 0xff666633, 0xff336633,
  0xff006633, 0xffff3333, 0xffcc3333, 0xff993333, 0xff663333, 0xff333333, 0xff003333, 0xffff0033,
  0xffcc0033, 0xff990033, 0xff660033, 0xff330033, 0xff000033, 0xffffff00, 0xffccff00, 0xff99ff00,
  0xff66ff00, 0xff33ff00, 0xff00ff00, 0xffffcc00, 0xffcccc00, 0xff99cc00, 0xff66cc00, 0xff33cc00,
  0xff00cc00, 0xffff9900, 0xffcc9900, 0xff999900, 0xff669900, 0xff339900, 0xff009900, 0xffff6600,
  0xffcc6600, 0xff996600, 0xff666600, 0xff336600, 0xff006600, 0xffff3300, 0xffcc3300, 0xff993300,
  0xff663300, 0xff333300, 0xff003300, 0xffff0000, 0xffcc0000, 0xff990000, 0xff660000, 0xff330000,
  0xff0000ee, 0xff0000dd, 0xff0000bb, 0xff0000aa, 0xff000088, 0xff000077, 0xff000055, 0xff000044,
  0xff000022, 0xff000011, 0xff00ee00, 0xff00dd00, 0xff00bb00, 0xff00aa00, 0xff008800, 0xff007700,
  0xff005500, 0xff004400, 0xff002200, 0xff001100, 0xffee0000, 0xffdd0000, 0xffbb0000, 0xffaa0000,
  0xff880000, 0xff770000, 0xff550000, 0xff440000, 0xff220000, 0xff110000, 0xffeeeeee, 0xffdddddd,
  0xffbbbbbb, 0xffaaaaaa, 0xff888888, 0xff777777, 0xff555555, 0xff444444, 0xff222222, 0xff111111,
];

export function defaultVoxPaletteRgba(): Uint8Array {
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const n = DEFAULT_PALETTE_ABGR[i] ?? 0;
    const o = i * 4;
    out[o] = n & 255;
    out[o + 1] = (n >> 8) & 255;
    out[o + 2] = (n >> 16) & 255;
    out[o + 3] = (n >> 24) & 255;
  }
  return out;
}

function readAscii(view: DataView, offset: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

export function parseVoxFile(bytes: Uint8Array): VoxDocument {
  if (bytes.byteLength < 20) throw new Error("vox: too small");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readAscii(view, 0, 4) !== VOX_MAGIC) throw new Error("vox: missing VOX header");
  const version = view.getInt32(4, true);
  const models: VoxModel[] = [];
  let palette = defaultVoxPaletteRgba();
  let pendingSize: { x: number; y: number; z: number } | null = null;

  const walk = (start: number, end: number) => {
    let offset = start;
    while (offset + 12 <= end) {
      const id = readAscii(view, offset, 4);
      const content = view.getInt32(offset + 4, true);
      const children = view.getInt32(offset + 8, true);
      const contentStart = offset + 12;
      const contentEnd = contentStart + content;
      const childrenEnd = contentEnd + children;
      if (contentEnd > end || childrenEnd > end) break;

      if (id === "SIZE" && content >= 12) {
        pendingSize = {
          x: view.getInt32(contentStart, true),
          y: view.getInt32(contentStart + 4, true),
          z: view.getInt32(contentStart + 8, true),
        };
      } else if (id === "XYZI" && content >= 4 && pendingSize) {
        const n = view.getInt32(contentStart, true);
        const voxels: VoxVoxel[] = [];
        let p = contentStart + 4;
        for (let i = 0; i < n && p + 4 <= contentEnd; i++) {
          voxels.push({
            x: view.getUint8(p),
            y: view.getUint8(p + 1),
            z: view.getUint8(p + 2),
            i: view.getUint8(p + 3),
          });
          p += 4;
        }
        models.push({ size: pendingSize, voxels });
        pendingSize = null;
      } else if (id === "RGBA" && content >= 256 * 4) {
        const next = new Uint8Array(256 * 4);
        // color[0-254] map to palette index [1-255]
        next.set([0, 0, 0, 0], 0);
        for (let i = 0; i <= 254; i++) {
          const src = contentStart + i * 4;
          const dst = (i + 1) * 4;
          next[dst] = view.getUint8(src);
          next[dst + 1] = view.getUint8(src + 1);
          next[dst + 2] = view.getUint8(src + 2);
          next[dst + 3] = view.getUint8(src + 3);
        }
        palette = next;
      }

      if (children > 0) walk(contentEnd, childrenEnd);
      offset = childrenEnd;
    }
  };

  if (readAscii(view, 8, 4) !== "MAIN") throw new Error("vox: missing MAIN");
  const mainContent = view.getInt32(12, true);
  const mainChildren = view.getInt32(16, true);
  walk(20 + mainContent, 20 + mainContent + mainChildren);

  if (models.length === 0) throw new Error("vox: no SIZE/XYZI model");
  return { version, models, palette };
}

function chunkBytes(id: string, content: Uint8Array, children: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + content.byteLength + children.byteLength);
  const view = new DataView(out.buffer);
  writeAscii(view, 0, id);
  view.setInt32(4, content.byteLength, true);
  view.setInt32(8, children.byteLength, true);
  out.set(content, 12);
  out.set(children, 12 + content.byteLength);
  return out;
}

export function serializeVoxFile(doc: VoxDocument): Uint8Array {
  const model = doc.models[0];
  if (!model) throw new Error("vox: nothing to write");
  const size = new Uint8Array(12);
  const sizeView = new DataView(size.buffer);
  sizeView.setInt32(0, Math.max(1, model.size.x), true);
  sizeView.setInt32(4, Math.max(1, model.size.y), true);
  sizeView.setInt32(8, Math.max(1, model.size.z), true);

  const voxels = model.voxels.filter(
    (v) => v.i > 0 && v.x >= 0 && v.y >= 0 && v.z >= 0,
  );
  const xyzi = new Uint8Array(4 + voxels.length * 4);
  const xyziView = new DataView(xyzi.buffer);
  xyziView.setInt32(0, voxels.length, true);
  voxels.forEach((v, n) => {
    const o = 4 + n * 4;
    xyzi[o] = v.x & 255;
    xyzi[o + 1] = v.y & 255;
    xyzi[o + 2] = v.z & 255;
    xyzi[o + 3] = v.i & 255;
  });

  const rgba = new Uint8Array(256 * 4);
  const pal = doc.palette.byteLength >= 256 * 4 ? doc.palette : defaultVoxPaletteRgba();
  for (let i = 0; i <= 254; i++) {
    const src = (i + 1) * 4;
    const dst = i * 4;
    rgba[dst] = pal[src] ?? 0;
    rgba[dst + 1] = pal[src + 1] ?? 0;
    rgba[dst + 2] = pal[src + 2] ?? 0;
    rgba[dst + 3] = pal[src + 3] ?? 255;
  }

  const children = concatBytes([
    chunkBytes("SIZE", size, new Uint8Array(0)),
    chunkBytes("XYZI", xyzi, new Uint8Array(0)),
    chunkBytes("RGBA", rgba, new Uint8Array(0)),
  ]);
  const main = chunkBytes("MAIN", new Uint8Array(0), children);
  const file = new Uint8Array(8 + main.byteLength);
  const fileView = new DataView(file.buffer);
  writeAscii(fileView, 0, VOX_MAGIC);
  fileView.setInt32(4, doc.version || VOX_VERSION, true);
  file.set(main, 8);
  return file;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}
