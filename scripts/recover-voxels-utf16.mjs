/**
 * Recover Ember voxel models from Electron Session Storage LevelDB/LOG.
 * Values are UTF-16LE JSON after the hist key.
 */
import fs from "node:fs";
import path from "node:path";

const sessionDir =
  "C:/Users/novos/AppData/Roaming/joi-conductor/Session Storage";
const registryPath = path.resolve("content/ember/voxels/registry.json");
const outDir = path.resolve("scripts/.tmp-voxel-recovery");
fs.mkdirSync(outDir, { recursive: true });

const mapPath = path.resolve("content/ember/maps/hu_tao_yard.json");
const mapRaw = fs.readFileSync(mapPath, "utf8");
const mapIds = new Set(
  [...mapRaw.matchAll(/"modelId"\s*:\s*"([^"]+)"/g)].map((m) => m[1]),
);

const recovered = new Map();

function score(m) {
  if (!m?.voxels?.length) return -1;
  return m.voxels.filter((v) => v > 0).length;
}

function tryModel(obj) {
  if (!obj) return null;
  if (typeof obj.id === "string" && Array.isArray(obj.voxels)) return obj;
  if (obj.draft && Array.isArray(obj.draft?.voxels)) return obj.draft;
  if (obj.model && Array.isArray(obj.model?.voxels)) return obj.model;
  if (Array.isArray(obj.undo)) {
    for (let i = obj.undo.length - 1; i >= 0; i--) {
      if (obj.undo[i]?.model?.voxels) return obj.undo[i].model;
    }
  }
  if (Array.isArray(obj.redo)) {
    for (let i = obj.redo.length - 1; i >= 0; i--) {
      if (obj.redo[i]?.model?.voxels) return obj.redo[i].model;
    }
  }
  return null;
}

function extractBalancedJson(str, from = 0) {
  const start = str.indexOf("{", from);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
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
      if (depth === 0) return str.slice(start, i + 1);
    }
  }
  return null;
}

function keepModel(model) {
  if (!model?.id || !Array.isArray(model.voxels)) return;
  if (score(model) <= 0) return;
  const prev = recovered.get(model.id);
  if (!prev || score(model) >= score(prev)) {
    recovered.set(model.id, model);
  }
}

function harvestBuffer(buf, label) {
  const ascii = buf.toString("latin1");
  const marker = "ember-voxel-hist:";
  let idx = 0;
  let found = 0;
  while (true) {
    idx = ascii.indexOf(marker, idx);
    if (idx < 0) break;
    // Find UTF-16 `{` = 7b 00 after the key
    let brace = -1;
    for (let i = idx; i < Math.min(buf.length - 1, idx + 120); i++) {
      if (buf[i] === 0x7b && buf[i + 1] === 0x00) {
        brace = i;
        break;
      }
    }
    if (brace >= 0) {
      // Decode a large UTF-16LE window; stop early via balanced JSON.
      const maxBytes = Math.min(buf.length - brace, 4_000_000);
      // Ensure even length for utf16le
      const even = maxBytes - (maxBytes % 2);
      const text = buf.subarray(brace, brace + even).toString("utf16le");
      const json = extractBalancedJson(text, 0);
      if (json) {
        try {
          const obj = JSON.parse(json);
          const model = tryModel(obj);
          if (model) {
            const before = recovered.has(model.id);
            keepModel(model);
            if (!before || recovered.get(model.id) === model) found++;
          }
        } catch {
          /* ignore */
        }
      }
    }
    idx += marker.length;
  }
  console.log(label, "parsed+", found, "unique", recovered.size);
}

for (const n of fs.readdirSync(sessionDir)) {
  if (!/\.(ldb|log)$/.test(n)) continue;
  const p = path.join(sessionDir, n);
  const buf = fs.readFileSync(p);
  harvestBuffer(buf, n);
}

console.log("\nRecovered models:");
for (const m of [...recovered.values()].sort((a, b) =>
  a.id.localeCompare(b.id),
)) {
  fs.writeFileSync(path.join(outDir, `${m.id}.json`), JSON.stringify(m, null, 2));
  console.log(
    `  ${m.id}  solid=${m.voxels.filter((v) => v > 0).length}/${m.voxels.length}  ${m.nameRu ?? ""}`,
  );
}

const missingOnMap = [...mapIds].filter((id) => !recovered.has(id));
console.log("\nMap modelIds:", [...mapIds].join(", "));
console.log("Still missing for map:", missingOnMap.join(", ") || "(none)");

// Merge into registry.json
let registry = { models: [], scenes: [] };
try {
  const cur = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  registry.models = Array.isArray(cur.models) ? cur.models : [];
  registry.scenes = Array.isArray(cur.scenes) ? cur.scenes : [];
} catch {
  /* fresh */
}
const byId = new Map(registry.models.map((m) => [m.id, m]));
for (const m of recovered.values()) byId.set(m.id, m);
registry.models = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");
console.log("\nWrote", registryPath, "models:", registry.models.length);
