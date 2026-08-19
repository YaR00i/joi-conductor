/**
 * Recover voxel models from a copied LevelDB Session Storage LOG
 * with correct 32KiB block framing.
 */
import fs from "node:fs";
import path from "node:path";

const logPath = path.resolve("scripts/.tmp-session-storage/000931.log");
const ldbPath = path.resolve("scripts/.tmp-session-storage/000933.ldb");
const registryPath = path.resolve("content/ember/voxels/registry.json");
const mapPath = path.resolve("content/ember/maps/hu_tao_yard.json");
const outDir = path.resolve("scripts/.tmp-voxel-recovery");
fs.mkdirSync(outDir, { recursive: true });

const BLOCK = 32768;
const recovered = new Map();

function score(m) {
  if (!m?.voxels?.length) return -1;
  return m.voxels.filter((v) => v > 0).length;
}

function keep(model) {
  if (!model?.id || !Array.isArray(model.voxels) || score(model) <= 0) return;
  const prev = recovered.get(model.id);
  if (!prev || score(model) >= score(prev)) recovered.set(model.id, model);
}

function tryModel(obj) {
  if (!obj) return null;
  if (typeof obj.id === "string" && Array.isArray(obj.voxels)) return obj;
  if (obj.draft?.voxels) return obj.draft;
  if (obj.model?.voxels) return obj.model;
  if (Array.isArray(obj.undo)) {
    for (let i = obj.undo.length - 1; i >= 0; i--) {
      if (obj.undo[i]?.model?.voxels) return obj.undo[i].model;
    }
  }
  return null;
}

function parseValue(buf) {
  // UTF-16LE JSON
  if (buf.length >= 4 && buf[0] === 0x7b && buf[1] === 0x00) {
    try {
      return JSON.parse(buf.toString("utf16le"));
    } catch {
      /* ignore */
    }
  }
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
}

function readVarint(buf, i) {
  let n = 0;
  let shift = 0;
  while (i < buf.length) {
    const b = buf[i++];
    n |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { n, i };
    shift += 7;
    if (shift > 35) return null;
  }
  return null;
}

function parseWriteBatch(data) {
  if (data.length < 12) return [];
  let i = 12;
  const count = data.readUInt32LE(8);
  const entries = [];
  for (let c = 0; c < count && i < data.length; c++) {
    const tag = data[i++];
    const k = readVarint(data, i);
    if (!k) break;
    i = k.i;
    if (i + k.n > data.length) break;
    const key = data.subarray(i, i + k.n);
    i += k.n;
    if (tag === 1) {
      const v = readVarint(data, i);
      if (!v) break;
      i = v.i;
      if (i + v.n > data.length) break;
      const value = data.subarray(i, i + v.n);
      i += v.n;
      entries.push({ key: Buffer.from(key), value: Buffer.from(value) });
    } else if (tag === 2) {
      // deletion
    } else break;
  }
  return entries;
}

function harvestEntries(entries) {
  let n = 0;
  for (const e of entries) {
    const key = e.key.toString("latin1");
    if (!key.includes("ember-voxel-hist:")) continue;
    n++;
    const obj = parseValue(e.value);
    const model = tryModel(obj);
    if (model) keep(model);
    else {
      // debug first failures
      if (n <= 3) {
        console.log(
          "  unparsed",
          key.slice(-40),
          "val[0..8]",
          [...e.value.subarray(0, 8)],
          "len",
          e.value.length,
        );
      }
    }
  }
  return n;
}

function parseLog(buf) {
  let hist = 0;
  let parts = [];
  for (let blockStart = 0; blockStart < buf.length; blockStart += BLOCK) {
    const blockEnd = Math.min(buf.length, blockStart + BLOCK);
    let offset = blockStart;
    while (offset + 7 <= blockEnd) {
      const length = buf.readUInt16LE(offset + 4);
      const type = buf[offset + 6];
      if (length === 0 && type === 0) {
        // trailer padding
        break;
      }
      const dataStart = offset + 7;
      const dataEnd = dataStart + length;
      if (dataEnd > blockEnd) break;
      const data = buf.subarray(dataStart, dataEnd);
      if (type === 1) {
        hist += harvestEntries(parseWriteBatch(data));
      } else if (type === 2) {
        parts = [Buffer.from(data)];
      } else if (type === 3) {
        parts.push(Buffer.from(data));
      } else if (type === 4) {
        parts.push(Buffer.from(data));
        const merged = Buffer.concat(parts);
        parts = [];
        hist += harvestEntries(parseWriteBatch(merged));
      }
      offset = dataEnd;
    }
  }
  return hist;
}

const logBuf = fs.readFileSync(logPath);
console.log("log bytes", logBuf.length);
console.log("hist keys seen", parseLog(logBuf));
console.log("recovered from log", recovered.size);

// Brute UTF-16 on log as well (contiguous values)
function brute(buf, label) {
  let found = 0;
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] !== 0x7b || buf[i + 1] !== 0 || buf[i + 2] !== 0x22 || buf[i + 3] !== 0)
      continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let j = i; j + 1 < buf.length && j - i < 3_000_000; j += 2) {
      const code = buf[j] | (buf[j + 1] << 8);
      const ch = String.fromCharCode(code);
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = j + 2;
          break;
        }
      }
    }
    if (end < 0) continue;
    const text = buf.subarray(i, end).toString("utf16le");
    if (!text.includes('"voxels"')) continue;
    try {
      const obj = JSON.parse(text);
      const model = tryModel(obj);
      if (model) {
        keep(model);
        found++;
      }
    } catch {
      /* ignore */
    }
  }
  console.log(label, "brute", found);
}

brute(logBuf, "log");
brute(fs.readFileSync(ldbPath), "ldb");

console.log("\nModels:");
for (const m of [...recovered.values()].sort((a, b) => a.id.localeCompare(b.id))) {
  fs.writeFileSync(path.join(outDir, `${m.id}.json`), JSON.stringify(m, null, 2));
  console.log(`  ${m.id} solid=${score(m)} ${m.nameRu ?? ""}`);
}

let registry = { models: [], scenes: [] };
try {
  const cur = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  registry.models = Array.isArray(cur.models) ? cur.models : [];
  registry.scenes = Array.isArray(cur.scenes) ? cur.scenes : [];
} catch {
  /* empty */
}
const byId = new Map(registry.models.map((m) => [m.id, m]));
for (const m of recovered.values()) byId.set(m.id, m);
registry.models = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");

const mapIds = [
  ...fs.readFileSync(mapPath, "utf8").matchAll(/"modelId"\s*:\s*"([^"]+)"/g),
].map((m) => m[1]);
const missing = [...new Set(mapIds)].filter((id) => !byId.has(id));
console.log("registry models", registry.models.length);
console.log("missing", missing.join(", ") || "(none)");
