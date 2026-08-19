import fs from "node:fs";
import path from "node:path";

function readVarint(buf, offset) {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (pos < buf.length) {
    const b = buf[pos++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
    if (shift > 35) throw new Error("varint too long");
  }
  return { value: result >>> 0, pos };
}

function extractUtf16Json(buf, start, maxLen) {
  const endLimit = Math.min(buf.length, start + maxLen);
  let depth = 0,
    inStr = false,
    esc = false;
  for (let j = start; j + 1 < endLimit; j += 2) {
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
      if (depth === 0) return buf.slice(start, j + 2).toString("utf16le");
    }
  }
  // fallback: exact length slice
  if (maxLen > 0 && start + maxLen <= buf.length) {
    return buf.slice(start, start + maxLen).toString("utf16le");
  }
  return null;
}

function score(m) {
  return (m?.voxels || []).reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
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

const ROOT = "C:/Users/novos/Projects/joi-conductor";
const outDir = path.join(ROOT, "scripts/.tmp-voxel-recovery");
fs.mkdirSync(outDir, { recursive: true });
const recovered = new Map();

function keep(m) {
  if (!m?.id || score(m) <= 0) return;
  const prev = recovered.get(m.id);
  if (!prev || score(m) >= score(prev)) {
    recovered.set(m.id, m);
    console.log("KEEP", m.id, "solid", score(m), m.nameRu || "");
  }
}

function harvestLog(file) {
  const buf = fs.readFileSync(file);
  console.log("\nFILE", file, buf.length);
  const prefix = Buffer.from("ember-voxel-hist:");
  let idx = 0;
  let n = 0;
  while ((idx = buf.indexOf(prefix, idx)) >= 0) {
    n++;
    let keyEnd = idx;
    while (keyEnd < buf.length && buf[keyEnd] >= 32 && buf[keyEnd] < 127)
      keyEnd++;
    const key = buf.slice(idx, keyEnd).toString("ascii");
    const { value: len, pos } = readVarint(buf, keyEnd);
    console.log(`  #${n} ${key} len=${len} valueAt=${pos}`);
    if (buf[pos] === 0x7b && buf[pos + 1] === 0x00) {
      const text = extractUtf16Json(buf, pos, len);
      if (!text) {
        console.log("    no text");
      } else {
        console.log("    textLen", text.length, "head", text.slice(0, 80));
        try {
          const obj = JSON.parse(text);
          keep(tryModel(obj));
          if (Array.isArray(obj.undo)) {
            for (const e of obj.undo) keep(e?.model);
          }
          if (obj.draft) keep(obj.draft);
        } catch (e) {
          console.log("    parse fail", e.message.slice(0, 120));
          // try salvage: find first complete model by regex-ish
          const idMatch = text.match(/"id"\s*:\s*"(vox_[^"]+)"/);
          console.log("    salvage id hint", idMatch?.[1]);
        }
      }
    } else {
      console.log("    not utf16 brace", buf.slice(pos, pos + 8).toString("hex"));
    }
    idx = keyEnd;
  }
}

function dumpLocalOverrides() {
  const file =
    "C:/Users/novos/AppData/Roaming/joi-conductor/Local Storage/leveldb/000237.ldb";
  const buf = fs.readFileSync(file);
  const key = Buffer.from("ember-content-overrides-v1");
  let i = buf.indexOf(key);
  console.log("\nLOCAL override key idx", i);
  if (i < 0) {
    // search printable around ember-content
    i = buf.indexOf(Buffer.from("ember-content"));
    console.log("ember-content idx", i);
  }
  if (i >= 0) {
    const slice = buf.slice(Math.max(0, i - 40), Math.min(buf.length, i + 500));
    const printable = [...slice]
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
      .join("");
    console.log(printable);
  }
  // Also try utf16 decode whole and search
  const u16 = buf.toString("utf16le");
  for (const s of [
    "ember-content-overrides-v1",
    "voxels/registry.json",
    "vox_mrxeu3pe",
    '"models"',
  ]) {
    console.log("u16 has", s, u16.includes(s));
  }
  const u8 = buf.toString("latin1");
  for (const s of [
    "ember-content-overrides-v1",
    "voxels/registry.json",
    "vox_mrxeu3pe",
  ]) {
    console.log("latin1 has", s, u8.includes(s));
  }
}

harvestLog(
  "C:/Users/novos/AppData/Roaming/joi-conductor/Session Storage/000931.log",
);
harvestLog(
  "C:/Users/novos/AppData/Roaming/joi-conductor/Session Storage/000933.ldb",
);
dumpLocalOverrides();

console.log("\nRecovered ids", [...recovered.keys()]);
for (const [id, m] of recovered) {
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(m));
}
