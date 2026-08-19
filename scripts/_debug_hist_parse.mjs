import fs from "node:fs";

const buf = fs.readFileSync(
  "C:/Users/novos/AppData/Roaming/joi-conductor/Session Storage/000931.log",
);
const prefix = Buffer.from("ember-voxel-hist:");
let idx = buf.indexOf(prefix);
console.log("hist idx", idx);
const keyStart = idx;
let keyEnd = keyStart;
while (keyEnd < buf.length && buf[keyEnd] >= 32 && buf[keyEnd] < 127) keyEnd++;
console.log("key", buf.slice(keyStart, keyEnd).toString("ascii"));
console.log(
  "after key hex",
  buf.slice(keyEnd, keyEnd + 20).toString("hex"),
);
let p = keyEnd;
let found = -1;
for (let look = 0; look < 32 && p + 2 < buf.length; look++, p++) {
  if (buf[p] === 0x7b && buf[p + 1] === 0x00) {
    found = p;
    break;
  }
}
console.log("brace at", found);
if (found >= 0) {
  // measure object size roughly
  let depth = 0,
    inStr = false,
    esc = false,
    end = -1;
  for (let j = found; j + 1 < buf.length; j += 2) {
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
  console.log("end", end, "bytes", end - found);
  if (end > found) {
    const text = buf.slice(found, end).toString("utf16le");
    console.log("text head", text.slice(0, 120));
    try {
      const obj = JSON.parse(text);
      console.log("keys", Object.keys(obj));
      console.log("undo len", obj.undo?.length);
      const m = obj.undo?.[obj.undo.length - 1]?.model;
      console.log("model id", m?.id, "voxels", m?.voxels?.length);
      let solid = 0;
      for (const v of m?.voxels || []) if (v > 0) solid++;
      console.log("solid", solid);
    } catch (e) {
      console.log("parse err", e.message);
    }
  }
}

// Local storage: what strings exist?
const local = fs.readFileSync(
  "C:/Users/novos/AppData/Roaming/joi-conductor/Local Storage/leveldb/000237.ldb",
);
const samples = [
  "ember-content",
  "override",
  "voxels",
  "registry",
  "file://",
  "localStorage",
  "vox_",
];
for (const s of samples) {
  console.log("local", s, local.indexOf(Buffer.from(s)), local.indexOf(Buffer.from(s, "utf16le")));
}
