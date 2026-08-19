import fs from "node:fs";
import path from "node:path";

const dirs = [
  "C:/Users/novos/AppData/Roaming/joi-conductor/Local Storage/leveldb",
  "C:/Users/novos/AppData/Roaming/joi-conductor/Session Storage",
];

const keys = [
  "ember-content-overrides",
  "voxels/registry.json",
  '"models":[',
  "vox_mrxeu3pe",
  "vox_mrxs0vmi",
  "stampSolid",
];

for (const dir of dirs) {
  for (const n of fs.readdirSync(dir)) {
    if (!/\.(ldb|log)$/.test(n)) continue;
    const buf = fs.readFileSync(path.join(dir, n));
    const t = buf.toString("utf8");
    const c = t.replace(/\0/g, "");
    for (const key of keys) {
      if (t.includes(key) || c.includes(key)) {
        console.log(n, "has", key);
      }
    }
    const idx = c.indexOf("voxels/registry");
    if (idx >= 0) {
      console.log(
        n,
        "registry ctx",
        c.slice(idx, idx + 240).replace(/[^\x20-\x7E]/g, "."),
      );
    }
  }
}
