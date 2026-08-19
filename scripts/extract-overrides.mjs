import fs from "node:fs";
import path from "node:path";

const f =
  "C:/Users/novos/AppData/Roaming/joi-conductor/Local Storage/leveldb/000237.ldb";
const buf = fs.readFileSync(f);
const cleaned = buf.toString("utf8").replace(/\0/g, "");
const marker = "ember-content-overrides";
const idx = cleaned.indexOf(marker);
console.log("marker idx", idx);
console.log(
  "context",
  cleaned.slice(Math.max(0, idx - 40), idx + 200).replace(/[^\x20-\x7E]/g, "."),
);

// Try to find a JSON object after the key that contains voxels/registry
const reg = cleaned.indexOf("voxels/registry.json");
console.log("voxels/registry idx", reg);
if (reg >= 0) {
  console.log(
    cleaned.slice(reg, reg + 400).replace(/[^\x20-\x7E]/g, "."),
  );
}

// Dump all ascii strings longer than 40 chars containing vox_ or models
const re = /[\x20-\x7E]{40,}/g;
let m;
const hits = [];
while ((m = re.exec(cleaned))) {
  const s = m[0];
  if (
    s.includes("vox_") ||
    s.includes("models") ||
    s.includes("overrides") ||
    s.includes("registry")
  ) {
    hits.push(s.slice(0, 300));
  }
}
console.log("hits", hits.length);
for (const h of hits.slice(0, 40)) console.log("---\n" + h);
