/**
 * Recover Ember voxels from Electron LevelDB (Session/Local Storage).
 * Keys are ASCII; sessionStorage values are often UTF-16LE JSON.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let snappy = null;
try {
  snappy = require("snappyjs");
} catch {
  try {
    snappy = require("./snappyjs.cjs");
  } catch {
    /* optional */
  }
}

const ROOT = path.resolve("C:/Users/novos/Projects/joi-conductor");
const need = [
  "vox_crate_1",
  "vox_mrxeu3pe",
  "vox_mrxs0vmi",
  "vox_ms26wymg",
  "vox_ms7rrw9b",
  "vox_ms7uklhf",
  "vox_ms7uuoza",
  "vox_ms7uz99w",
  "vox_ms8um8df",
];

const dirs = [
  "C:/Users/novos/AppData/Roaming/joi-conductor/Session Storage",
  "C:/Users/novos/AppData/Roaming/joi-conductor/Local Storage/leveldb",
  path.join(ROOT, "scripts/.tmp-session-storage"),
];

const outDir = path.join(ROOT, "scripts/.tmp-voxel-recovery");
fs.mkdirSync(outDir, { recursive: true });

const recovered = new Map();
const overrideHits = [];

function score(m) {
  if (!m?.voxels?.length) return -1;
  return m.voxels.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
}

function keep(model) {
  if (!model?.id || !Array.isArray(model.voxels) || score(model) <= 0) return;
  const prev = recovered.get(model.id);
  if (!prev || score(model) >= score(prev)) recovered.set(model.id, model);
}

function tryModel(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (typeof obj.id === "string" && Array.isArray(obj.voxels)) return obj;
  if (obj.draft && typeof obj.draft.id === "string" && Array.isArray(obj.draft.voxels))
    return obj.draft;
  if (obj.model && typeof obj.model.id === "string" && Array.isArray(obj.model.voxels))
    return obj.model;
  if (Array.isArray(obj.undo)) {
    for (let i = obj.undo.length - 1; i >= 0; i--) {
      const m = obj.undo[i]?.model;
      if (m && typeof m.id === "string" && Array.isArray(m.voxels)) return m;
    }
  }
  // registry file shape
  if (Array.isArray(obj.models)) {
    for (const m of obj.models) keep(m);
    return null;
  }
  return null;
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractUtf16Object(buf, start) {
  if (start < 0 || start + 2 > buf.length) return null;
  if (buf[start] !== 0x7b || buf[start + 1] !== 0x00) return null; // {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = start; j + 1 < buf.length && j - start < 5_000_000; j += 2) {
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
        const text = buf.slice(start, j + 2).toString("utf16le");
        return parseJsonText(text);
      }
    }
  }
  return null;
}

function harvestBuffer(buf, label) {
  // 1) ASCII keys ember-voxel-hist:vox_* then UTF-16 value
  const prefix = Buffer.from("ember-voxel-hist:");
  let idx = 0;
  while (true) {
    idx = buf.indexOf(prefix, idx);
    if (idx < 0) break;
    const keyStart = idx;
    let keyEnd = keyStart;
    while (keyEnd < buf.length && buf[keyEnd] >= 32 && buf[keyEnd] < 127) keyEnd++;
    const key = buf.slice(keyStart, keyEnd).toString("ascii");
    const id = key.slice("ember-voxel-hist:".length);
    // skip possible length prefix bytes (varint), find {\\0
    let p = keyEnd;
    for (let look = 0; look < 16 && p + 2 < buf.length; look++, p++) {
      if (buf[p] === 0x7b && buf[p + 1] === 0x00) {
        const obj = extractUtf16Object(buf, p);
        const model = tryModel(obj);
        if (model) {
          keep(model);
          console.log(`  hist ${id} -> ${model.id} solid=${score(model)} (${label})`);
        } else if (obj) {
          console.log(`  hist ${id} parsed but no model (${label}) keys=${Object.keys(obj)}`);
        }
        break;
      }
    }
    idx = keyEnd;
  }

  // 2) overrides key
  const ov = Buffer.from("ember-content-overrides-v1");
  let o = buf.indexOf(ov);
  while (o >= 0) {
    // find nearest {\\0 after key
    let p = o + ov.length;
    for (let look = 0; look < 32 && p + 2 < buf.length; look++, p++) {
      if (buf[p] === 0x7b && buf[p + 1] === 0x00) {
        const obj = extractUtf16Object(buf, p);
        if (obj) {
          overrideHits.push({ label, keys: Object.keys(obj).slice(0, 30) });
          const reg = obj["voxels/registry.json"];
          if (reg) {
            console.log(`  OVERRIDE voxels/registry.json from ${label}`);
            tryModel(typeof reg === "string" ? parseJsonText(reg) : reg);
            if (reg.models) for (const m of reg.models) keep(m);
          }
          // also scan all override values for models
          for (const [k, v] of Object.entries(obj)) {
            if (k.includes("voxel") || k.includes("registry")) {
              console.log(`  override key ${k} type=${typeof v}`);
            }
            if (v && typeof v === "object") tryModel(v);
          }
        }
        break;
      }
      // also UTF-8 JSON
      if (buf[p] === 0x7b) {
        // try utf8 brace extract briefly
        const text = buf.slice(p, Math.min(buf.length, p + 2_000_000)).toString("utf8");
        const end = findBraceEnd(text, 0);
        if (end > 0) {
          const obj = parseJsonText(text.slice(0, end));
          if (obj && obj["voxels/registry.json"]) {
            console.log(`  OVERRIDE utf8 voxels/registry.json from ${label}`);
            const reg = obj["voxels/registry.json"];
            if (reg?.models) for (const m of reg.models) keep(m);
          }
        }
        break;
      }
    }
    o = buf.indexOf(ov, o + 1);
  }

  // 3) UTF-16 id occurrences inside models
  for (const id of need) {
    const needle = Buffer.from(id, "utf16le");
    let i = 0;
    let hits = 0;
    while (hits < 20) {
      i = buf.indexOf(needle, i);
      if (i < 0) break;
      hits++;
      // walk back to {\\0
      for (let k = i; k >= 2 && i - k < 80000; k -= 2) {
        if (buf[k - 2] === 0x7b && buf[k - 1] === 0x00) {
          const obj = extractUtf16Object(buf, k - 2);
          const model = tryModel(obj);
          if (model?.id === id) {
            keep(model);
            break;
          }
        }
      }
      i += needle.length;
    }
  }

  // 4) snappy decompress blocks if available
  if (snappy) {
    for (let off = 0; off + 100 < buf.length; off += 4096) {
      const slice = buf.subarray(off, Math.min(buf.length, off + 65536));
      try {
        const dec = Buffer.from(snappy.uncompress(slice));
        if (dec.length > 50) harvestBuffer(dec, `${label}+snappy@${off}`);
      } catch {
        /* ignore */
      }
    }
  }
}

function findBraceEnd(text, at) {
  let depth = 0,
    inStr = false,
    esc = false;
  for (let i = at; i < text.length; i++) {
    const ch = text[i];
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
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    if (!/\.(ldb|log)$/i.test(name)) continue;
    const full = path.join(dir, name);
    const buf = fs.readFileSync(full);
    console.log(`\n== ${full} (${buf.length}) ==`);
    for (const id of need) {
      const a = buf.includes(Buffer.from(id));
      const u = buf.includes(Buffer.from(id, "utf16le"));
      if (a || u) console.log(`  contains ${id} ascii=${a} utf16=${u}`);
    }
    harvestBuffer(buf, name);
  }
}

console.log("\n=== RECOVERED ===");
for (const [id, m] of [...recovered.entries()].sort()) {
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(m));
  console.log(`${id} solid=${score(m)} name=${m.nameRu || ""}`);
}
console.log("overrideHits", overrideHits.length);
console.log(
  "missing",
  need.filter((id) => !recovered.has(id)),
);
