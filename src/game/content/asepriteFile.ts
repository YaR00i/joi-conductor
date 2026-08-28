/**
 * Aseprite .ase / .aseprite reader (and a small RGBA writer for tests).
 * Spec: https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md
 * MagicaVoxel analog: parse the authored file; pack JSON stays EmberPixelSprite.
 */

const ASE_MAGIC = 0xa5e0;
const FRAME_MAGIC = 0xf1fa;
const CHUNK_LAYER = 0x2004;
const CHUNK_CEL = 0x2005;
const CHUNK_TAGS = 0x2018;
const CHUNK_PALETTE = 0x2019;
const CHUNK_OLD_PALETTE = 0x0004;

export const ASEPRITE_SOURCE_DIR = "sprites/source";

export function asepriteSourceRel(id: string): string {
  return `${ASEPRITE_SOURCE_DIR}/${id}.aseprite`;
}

export type AseColorDepth = 8 | 16 | 32;

export type AseLayer = {
  name: string;
  type: number;
  childLevel: number;
  visible: boolean;
  background: boolean;
  reference: boolean;
  blend: number;
  opacity: number;
};

export type AseCel = {
  layerIndex: number;
  x: number;
  y: number;
  opacity: number;
  linkedFrame?: number;
  width: number;
  height: number;
  /** Decompressed PIXEL[] for the cel rect (color-depth bytes). */
  pixels: Uint8Array;
};

export type AseFrame = {
  durationMs: number;
  cels: AseCel[];
};

export type AseDocument = {
  width: number;
  height: number;
  colorDepth: AseColorDepth;
  transparentIndex: number;
  palette: Uint8Array;
  layers: AseLayer[];
  frames: AseFrame[];
};

export type EncodeAseLayer = {
  name: string;
  visible?: boolean;
  blend?: number;
  opacity?: number;
  childLevel?: number;
};

export type EncodeAseCel = {
  layerIndex: number;
  x?: number;
  y?: number;
  opacity?: number;
  width: number;
  height: number;
  /** RGBA bytes, row-major. */
  rgba: Uint8Array;
};

export type EncodeAseFrame = {
  durationMs?: number;
  cels: EncodeAseCel[];
};

async function zlibInflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream is required to read .aseprite");
  }
  const copy = Uint8Array.from(data);
  const stream = new Blob([copy]).stream().pipeThrough(
    new DecompressionStream("deflate"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function zlibDeflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") {
    throw new Error("CompressionStream is required to write .aseprite");
  }
  const copy = Uint8Array.from(data);
  const stream = new Blob([copy]).stream().pipeThrough(
    new CompressionStream("deflate"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

class AseReader {
  private readonly view: DataView;
  offset = 0;

  constructor(bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length(): number {
    return this.view.byteLength;
  }

  remain(n: number): boolean {
    return this.offset + n <= this.view.byteLength;
  }

  u8(): number {
    const v = this.view.getUint8(this.offset);
    this.offset += 1;
    return v;
  }

  u16(): number {
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  i16(): number {
    const v = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }

  u32(): number {
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  skip(n: number): void {
    this.offset += n;
  }

  bytes(n: number): Uint8Array {
    const start = this.view.byteOffset + this.offset;
    this.offset += n;
    return new Uint8Array(this.view.buffer, start, n);
  }

  string(): string {
    const len = this.u16();
    if (len <= 0) return "";
    const raw = this.bytes(len);
    return new TextDecoder("utf-8").decode(raw);
  }
}

function emptyPalette(): Uint8Array {
  return new Uint8Array(256 * 4);
}

function applyOldPalette(reader: AseReader, palette: Uint8Array): void {
  const packets = reader.u16();
  let index = 0;
  for (let p = 0; p < packets; p++) {
    index += reader.u8();
    let count = reader.u8();
    if (count === 0) count = 256;
    for (let i = 0; i < count; i++) {
      const o = ((index + i) & 255) * 4;
      palette[o] = reader.u8();
      palette[o + 1] = reader.u8();
      palette[o + 2] = reader.u8();
      palette[o + 3] = 255;
    }
    index += count;
  }
}

function applyNewPalette(reader: AseReader, palette: Uint8Array): void {
  const size = reader.u32();
  const from = reader.u32();
  const to = reader.u32();
  reader.skip(8);
  const count = Math.max(0, to - from + 1);
  for (let i = 0; i < count; i++) {
    const flags = reader.u16();
    const o = ((from + i) & 255) * 4;
    palette[o] = reader.u8();
    palette[o + 1] = reader.u8();
    palette[o + 2] = reader.u8();
    palette[o + 3] = reader.u8();
    if (flags & 1) reader.string();
  }
  void size;
}

async function readCel(
  reader: AseReader,
  chunkEnd: number,
): Promise<AseCel | null> {
  const layerIndex = reader.u16();
  const x = reader.i16();
  const y = reader.i16();
  const opacity = reader.u8();
  const celType = reader.u16();
  reader.skip(2); // z-index
  reader.skip(5);
  if (celType === 1) {
    const linkedFrame = reader.u16();
    return {
      layerIndex,
      x,
      y,
      opacity,
      linkedFrame,
      width: 0,
      height: 0,
      pixels: new Uint8Array(0),
    };
  }
  if (celType === 0 || celType === 2) {
    const width = reader.u16();
    const height = reader.u16();
    const raw = reader.bytes(Math.max(0, chunkEnd - reader.offset));
    const pixels = celType === 2 ? await zlibInflate(raw) : Uint8Array.from(raw);
    return { layerIndex, x, y, opacity, width, height, pixels };
  }
  // Tilemap and unknown cels are skipped.
  return null;
}

export async function parseAseprite(bytes: Uint8Array): Promise<AseDocument> {
  if (bytes.byteLength < 128) {
    throw new Error("Aseprite file is too small");
  }
  const reader = new AseReader(bytes);
  reader.u32();
  const magic = reader.u16();
  if (magic !== ASE_MAGIC) {
    throw new Error("Not an Aseprite file");
  }
  const frameCount = reader.u16();
  const width = reader.u16();
  const height = reader.u16();
  const depthRaw = reader.u16();
  const colorDepth: AseColorDepth =
    depthRaw === 8 || depthRaw === 16 || depthRaw === 32 ? depthRaw : 32;
  reader.u32(); // flags
  reader.u16(); // deprecated speed
  reader.skip(8);
  const transparentIndex = reader.u8();
  reader.skip(3);
  reader.u16(); // colors
  reader.skip(128 - reader.offset);

  const palette = emptyPalette();
  const layers: AseLayer[] = [];
  const frames: AseFrame[] = [];
  let sawNewPalette = false;

  for (let f = 0; f < frameCount; f++) {
    if (!reader.remain(16)) break;
    const frameStart = reader.offset;
    const frameBytes = reader.u32();
    const frameMagic = reader.u16();
    if (frameMagic !== FRAME_MAGIC) {
      throw new Error(`Bad Aseprite frame header at ${frameStart}`);
    }
    const oldChunks = reader.u16();
    const durationMs = reader.u16();
    reader.skip(2);
    const newChunks = reader.u32();
    const chunkCount = newChunks || oldChunks;
    const frameEnd = frameStart + frameBytes;
    const cels: AseCel[] = [];

    for (let c = 0; c < chunkCount && reader.offset + 6 <= frameEnd; c++) {
      const chunkStart = reader.offset;
      const chunkSize = reader.u32();
      const chunkType = reader.u16();
      const chunkEnd = chunkStart + chunkSize;
      if (chunkType === CHUNK_LAYER) {
        const flags = reader.u16();
        const type = reader.u16();
        const childLevel = reader.u16();
        reader.skip(4);
        const blend = reader.u16();
        const opacity = reader.u8();
        reader.skip(3);
        const name = reader.string();
        layers.push({
          name,
          type,
          childLevel,
          visible: (flags & 1) !== 0,
          background: (flags & 8) !== 0,
          reference: (flags & 64) !== 0,
          blend,
          opacity,
        });
      } else if (chunkType === CHUNK_CEL) {
        const cel = await readCel(reader, chunkEnd);
        if (cel) cels.push(cel);
      } else if (chunkType === CHUNK_PALETTE) {
        applyNewPalette(reader, palette);
        sawNewPalette = true;
      } else if (chunkType === CHUNK_OLD_PALETTE && !sawNewPalette) {
        applyOldPalette(reader, palette);
      } else if (chunkType === CHUNK_TAGS) {
        // Tags are naming hints only; skip by chunk size.
      }
      reader.offset = chunkEnd;
    }
    reader.offset = frameEnd;
    frames.push({ durationMs: durationMs || 100, cels });
  }

  resolveLinkedCels(frames);
  return {
    width,
    height,
    colorDepth,
    transparentIndex,
    palette,
    layers,
    frames,
  };
}

function resolveLinkedCels(frames: AseFrame[]): void {
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    frame.cels = frame.cels.map((cel) => {
      if (cel.linkedFrame == null) return cel;
      const seen = new Set<number>();
      let target = cel.linkedFrame;
      let hops = 0;
      while (hops++ < frames.length) {
        if (seen.has(target) || target < 0 || target >= frames.length) break;
        seen.add(target);
        const match = frames[target]!.cels.find(
          (other) =>
            other.layerIndex === cel.layerIndex && other.linkedFrame == null,
        );
        if (match) {
          return {
            ...match,
            layerIndex: cel.layerIndex,
            opacity: cel.opacity,
          };
        }
        const link = frames[target]!.cels.find(
          (other) =>
            other.layerIndex === cel.layerIndex && other.linkedFrame != null,
        );
        if (!link || link.linkedFrame == null) break;
        target = link.linkedFrame;
      }
      return cel;
    });
  }
}

class AseWriter {
  private buf = new Uint8Array(256);
  private view = new DataView(this.buf.buffer);
  offset = 0;

  private grow(need: number): void {
    if (this.offset + need <= this.buf.length) return;
    let next = this.buf.length;
    while (next < this.offset + need) next *= 2;
    const copy = new Uint8Array(next);
    copy.set(this.buf);
    this.buf = copy;
    this.view = new DataView(this.buf.buffer);
  }

  u8(v: number): void {
    this.grow(1);
    this.view.setUint8(this.offset, v);
    this.offset += 1;
  }

  u16(v: number): void {
    this.grow(2);
    this.view.setUint16(this.offset, v, true);
    this.offset += 2;
  }

  i16(v: number): void {
    this.grow(2);
    this.view.setInt16(this.offset, v, true);
    this.offset += 2;
  }

  u32(v: number): void {
    this.grow(4);
    this.view.setUint32(this.offset, v, true);
    this.offset += 4;
  }

  zeros(n: number): void {
    this.grow(n);
    this.offset += n;
  }

  bytes(data: Uint8Array): void {
    this.grow(data.length);
    this.buf.set(data, this.offset);
    this.offset += data.length;
  }

  string(text: string): void {
    const raw = new TextEncoder().encode(text);
    this.u16(raw.length);
    this.bytes(raw);
  }

  patchU16(at: number, v: number): void {
    this.view.setUint16(at, v, true);
  }

  patchU32(at: number, v: number): void {
    this.view.setUint32(at, v, true);
  }

  toBytes(): Uint8Array {
    return this.buf.slice(0, this.offset);
  }
}

/** RGBA-only writer used by tests and round-trips. */
export async function encodeAseprite(input: {
  width: number;
  height: number;
  layers: EncodeAseLayer[];
  frames: EncodeAseFrame[];
}): Promise<Uint8Array> {
  const out = new AseWriter();
  out.u32(0);
  out.u16(ASE_MAGIC);
  out.u16(input.frames.length);
  out.u16(input.width);
  out.u16(input.height);
  out.u16(32);
  out.u32(1); // layer opacity valid
  out.u16(100);
  out.zeros(8);
  out.u8(0);
  out.zeros(3);
  out.u16(0);
  out.zeros(128 - out.offset);

  for (let f = 0; f < input.frames.length; f++) {
    const frame = input.frames[f]!;
    const frameStart = out.offset;
    out.u32(0);
    out.u16(FRAME_MAGIC);
    const oldCountAt = out.offset;
    out.u16(0);
    out.u16(frame.durationMs ?? 120);
    out.zeros(2);
    const newCountAt = out.offset;
    out.u32(0);
    let chunks = 0;
    if (f === 0) {
      for (const layer of input.layers) {
        const chunkStart = out.offset;
        out.u32(0);
        out.u16(CHUNK_LAYER);
        let flags = 2; // editable
        if (layer.visible !== false) flags |= 1;
        out.u16(flags);
        out.u16(0);
        out.u16(layer.childLevel ?? 0);
        out.u16(0);
        out.u16(0);
        out.u16(layer.blend ?? 0);
        out.u8(layer.opacity ?? 255);
        out.zeros(3);
        out.string(layer.name);
        out.patchU32(chunkStart, out.offset - chunkStart);
        chunks += 1;
      }
    }
    for (const cel of frame.cels) {
      const packed = await zlibDeflate(cel.rgba);
      const chunkStart = out.offset;
      out.u32(0);
      out.u16(CHUNK_CEL);
      out.u16(cel.layerIndex);
      out.i16(cel.x ?? 0);
      out.i16(cel.y ?? 0);
      out.u8(cel.opacity ?? 255);
      out.u16(2);
      out.i16(0);
      out.zeros(5);
      out.u16(cel.width);
      out.u16(cel.height);
      out.bytes(packed);
      out.patchU32(chunkStart, out.offset - chunkStart);
      chunks += 1;
    }
    out.patchU32(frameStart, out.offset - frameStart);
    out.patchU16(oldCountAt, chunks);
    out.patchU32(newCountAt, chunks);
  }
  out.patchU32(0, out.offset);
  return out.toBytes();
}
