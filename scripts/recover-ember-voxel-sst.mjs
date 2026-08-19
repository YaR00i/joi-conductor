/**
 * Read-only best-effort recovery of Ember voxel history from Chromium LevelDB
 * SST files. Writes recovered model JSON only to scripts/.tmp-voxel-recovery.
 */
import fs from "node:fs";
import path from "node:path";
const roots = [
  "C:/Users/novos/AppData/Roaming/joi-conductor/Session Storage",
  "C:/Users/novos/AppData/Roaming/joi-conductor/Local Storage/leveldb",
  path.resolve("scripts/.tmp-session-storage"),
];
const outDir = path.resolve("scripts/.tmp-voxel-recovery");
fs.mkdirSync(outDir, { recursive: true });

function varint(buf, start) {
  let value = 0;
  let mul = 1;
  let i = start;
  while (i < buf.length && i - start < 10) {
    const b = buf[i++];
    value += (b & 0x7f) * mul;
    if ((b & 0x80) === 0) return { value, next: i };
    mul *= 128;
  }
  return null;
}

/** Raw Snappy block decoder used by LevelDB table blocks. */
function unsnappy(input) {
  const size = varint(input, 0);
  if (!size || size.value < 0 || size.value > 256 * 1024 * 1024) {
    throw new Error("invalid snappy size");
  }
  const out = Buffer.allocUnsafe(size.value);
  let ip = size.next;
  let op = 0;
  const copy = (offset, length) => {
    if (offset < 1 || offset > op || op + length > out.length) {
      throw new Error("invalid snappy copy");
    }
    for (let i = 0; i < length; i++) {
      out[op] = out[op - offset];
      op += 1;
    }
  };
  while (ip < input.length && op < out.length) {
    const tag = input[ip++];
    const type = tag & 3;
    if (type === 0) {
      let length = tag >>> 2;
      if (length < 60) length += 1;
      else {
        const bytes = length - 59;
        length = 0;
        for (let i = 0; i < bytes; i++) length += input[ip++] * 2 ** (8 * i);
        length += 1;
      }
      if (ip + length > input.length || op + length > out.length) {
        throw new Error("invalid snappy literal");
      }
      input.copy(out, op, ip, ip + length);
      ip += length;
      op += length;
    } else if (type === 1) {
      const length = 4 + ((tag >>> 2) & 7);
      const offset = ((tag & 0xe0) << 3) | input[ip++];
      copy(offset, length);
    } else if (type === 2) {
      const length = 1 + (tag >>> 2);
      const offset = input[ip] | (input[ip + 1] << 8);
      ip += 2;
      copy(offset, length);
    } else {
      const length = 1 + (tag >>> 2);
      const offset = input.readUInt32LE(ip);
      ip += 4;
      copy(offset, length);
    }
  }
  if (op !== out.length) throw new Error("truncated snappy block");
  return out;
}

function blockHandle(buf, start = 0) {
  const off = varint(buf, start);
  if (!off) return null;
  const size = varint(buf, off.next);
  return size
    ? { offset: off.value, size: size.value, next: size.next }
    : null;
}

function readBlock(file, handle) {
  const end = handle.offset + handle.size;
  if (handle.offset < 0 || end + 5 > file.length) return null;
  const payload = file.subarray(handle.offset, end);
  const compression = file[end];
  try {
    if (compression === 0) return Buffer.from(payload);
    if (compression === 1) return unsnappy(payload);
  } catch {
    return null;
  }
  return null;
}

function blockEntries(block) {
  if (!block || block.length < 8) return [];
  const restartCount = block.readUInt32LE(block.length - 4);
  const restartStart = block.length - 4 - restartCount * 4;
  if (restartCount < 1 || restartStart < 0) return [];
  const out = [];
  let prevKey = Buffer.alloc(0);
  let i = 0;
  while (i < restartStart) {
    const shared = varint(block, i);
    if (!shared) break;
    const suffix = varint(block, shared.next);
    if (!suffix) break;
    const valueLen = varint(block, suffix.next);
    if (!valueLen) break;
    i = valueLen.next;
    if (
      shared.value > prevKey.length ||
      i + suffix.value + valueLen.value > restartStart
    ) {
      break;
    }
    const key = Buffer.concat([
      prevKey.subarray(0, shared.value),
      block.subarray(i, i + suffix.value),
    ]);
    i += suffix.value;
    const value = Buffer.from(block.subarray(i, i + valueLen.value));
    i += valueLen.value;
    out.push({ key, value });
    prevKey = key;
  }
  return out;
}

function sstEntries(file) {
  if (file.length < 48) return [];
  const footer = file.subarray(file.length - 48);
  const metaHandle = blockHandle(footer, 0);
  const indexHandle = metaHandle ? blockHandle(footer, metaHandle.next) : null;
  if (!indexHandle) return [];
  const index = readBlock(file, indexHandle);
  const out = [];
  for (const entry of blockEntries(index)) {
    const handle = blockHandle(entry.value);
    if (!handle) continue;
    out.push(...blockEntries(readBlock(file, handle)));
  }
  return out;
}

function solidCount(model) {
  return Array.isArray(model?.voxels)
    ? model.voxels.reduce((n, v) => n + (Number(v) > 0 ? 1 : 0), 0)
    : 0;
}

const recovered = new Map();
function keep(model, source) {
  if (!model?.id?.startsWith("vox_") || !Array.isArray(model.voxels)) return;
  if (solidCount(model) < 1) return;
  const prev = recovered.get(model.id);
  if (!prev || solidCount(model) >= solidCount(prev.model)) {
    recovered.set(model.id, { model, source });
  }
}

function inspectObject(obj, source, seen = new Set()) {
  if (!obj || typeof obj !== "object" || seen.has(obj)) return;
  seen.add(obj);
  keep(obj, source);
  if (Array.isArray(obj)) {
    for (const value of obj) inspectObject(value, source, seen);
    return;
  }
  for (const value of Object.values(obj)) inspectObject(value, source, seen);
}

function parseJsonCandidates(text, source) {
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf("{", cursor);
    if (start < 0) break;
    let depth = 0;
    let string = false;
    let escape = false;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (string) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') string = false;
        continue;
      }
      if (ch === '"') string = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (end < 0) break;
    const json = text.slice(start, end);
    if (json.includes("vox_") && json.includes("voxels")) {
      try {
        inspectObject(JSON.parse(json), source);
      } catch {
        /* keep scanning */
      }
    }
    cursor = start + 1;
  }
}

function inspectBytes(buf, source) {
  // Chromium values can be pickle-prefixed UTF-8, UTF-16LE, or nested JSON.
  parseJsonCandidates(buf.toString("utf8"), `${source}:utf8`);
  parseJsonCandidates(buf.toString("utf16le"), `${source}:utf16`);
  parseJsonCandidates(buf.toString("latin1").replaceAll("\0", ""), `${source}:nul`);
}

for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith(".ldb")) continue;
    const full = path.join(root, name);
    let file;
    try {
      file = fs.readFileSync(full);
    } catch {
      continue;
    }
    const entries = sstEntries(file);
    console.log(`${full}: ${entries.length} entries`);
    for (let i = 0; i < entries.length; i++) {
      const { key, value } = entries[i];
      const keyText = key.toString("latin1").replaceAll("\0", "");
      const valueText = value.toString("latin1").replaceAll("\0", "");
      if (/ember|vox_/i.test(keyText) || /ember|vox_/i.test(valueText)) {
        console.log(
          `  hit ${name}:${i} key=${JSON.stringify(keyText.slice(0, 160))} valueBytes=${value.length} head=${value.subarray(0, 24).toString("hex")}`,
        );
        if (value.length > 1000) {
          console.log(
            `    utf16=${JSON.stringify(value.toString("utf16le").slice(0, 180))}`,
          );
        }
      }
      inspectBytes(key, `${name}:key:${i}`);
      inspectBytes(value, `${name}:value:${i}`);
    }
  }
}

console.log("\nRecovered:");
for (const [id, { model, source }] of [...recovered].sort()) {
  const out = path.join(outDir, `${id}.json`);
  fs.writeFileSync(out, JSON.stringify(model, null, 2) + "\n");
  console.log(`  ${id} solid=${solidCount(model)} ${source}`);
}
