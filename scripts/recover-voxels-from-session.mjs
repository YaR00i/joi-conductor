/**
 * Recover Ember voxel models from Electron Session Storage (UTF-16 pickles in LevelDB).
 */
import fs from "node:fs";
import path from "node:path";

const need = new Set([
  "vox_mrxeu3pe",
  "vox_mrxs0vmi",
  "vox_ms26wymg",
  "vox_ms7rrw9b",
  "vox_ms7uz99w",
  "vox_ms7uklhf",
  "vox_ms7uuoza",
  "vox_crate_1",
]);

const sessionDir =
  "C:/Users/novos/AppData/Roaming/joi-conductor/Session Storage";
const localDb =
  "C:/Users/novos/AppData/Roaming/joi-conductor/Local Storage/leveldb";

const files = [
  ...fs
    .readdirSync(sessionDir)
    .filter((n) => /\.(ldb|log)$/.test(n))
    .map((n) => path.join(sessionDir, n)),
  ...fs
    .readdirSync(localDb)
    .filter((n) => /\.(ldb|log)$/.test(n))
    .map((n) => path.join(localDb, n)),
];

const outDir = path.resolve("scripts/.tmp-voxel-recovery");
fs.mkdirSync(outDir, { recursive: true });

const recovered = {};

function scoreModel(m) {
  if (!m?.voxels?.length) return -1;
  const solid = m.voxels.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  return solid * 10 + m.voxels.length + (m.emissive?.length || 0);
}

function tryParseModel(slice) {
  try {
    const obj = JSON.parse(slice);
    if (obj && typeof obj.id === "string" && Array.isArray(obj.voxels)) {
      return obj;
    }
    if (
      obj?.draft &&
      typeof obj.draft.id === "string" &&
      Array.isArray(obj.draft.voxels)
    ) {
      return obj.draft;
    }
    if (
      obj?.model &&
      typeof obj.model.id === "string" &&
      Array.isArray(obj.model.voxels)
    ) {
      return obj.model;
    }
    if (Array.isArray(obj?.undo) && obj.undo[0]?.model?.voxels) {
      return obj.undo[0].model;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function extractBraceObject(text, at) {
  if (text[at] !== "{") return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = at; i < Math.min(text.length, at + 4_000_000); i++) {
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
      if (depth === 0) return text.slice(at, i + 1);
    }
  }
  return null;
}

function harvest(text, label) {
  let found = 0;
  // Prefer draft/model objects containing known ids.
  for (const id of need) {
    const keys = [`"id":"${id}"`, `"id": "${id}"`];
    for (const key of keys) {
      let idx = 0;
      while (true) {
        idx = text.indexOf(key, idx);
        if (idx < 0) break;
        // Walk back to object start
        let start = -1;
        for (let i = idx; i >= Math.max(0, idx - 200); i--) {
          if (text[i] === "{") {
            start = i;
            break;
          }
        }
        if (start >= 0) {
          // Also try a bit further back for hist wrappers
          for (const back of [0, 40, 80, 120, 200, 400]) {
            const s2 = start - back;
            if (s2 < 0) continue;
            const brace = text.lastIndexOf("{", start);
            const from = back === 0 ? start : text.lastIndexOf("{", s2 + 20);
            if (from < 0) continue;
            const slice = extractBraceObject(text, from);
            if (!slice) continue;
            const model = tryParseModel(slice);
            if (model && need.has(model.id)) {
              const sc = scoreModel(model);
              if (sc > scoreModel(recovered[model.id])) {
                recovered[model.id] = model;
                found++;
              }
            }
          }
        }
        idx += key.length;
      }
    }
  }
  console.log(label, "hits+", found, "unique", Object.keys(recovered).length);
}

for (const f of files) {
  const buf = fs.readFileSync(f);
  // Chromium session values are often UTF-16LE — strip NULs to recover ASCII JSON.
  const cleaned = buf.toString("utf8").replace(/\0/g, "");
  harvest(cleaned, path.basename(f));
}

console.log("recovered ids:", Object.keys(recovered));
const models = Object.values(recovered);
for (const m of models) {
  fs.writeFileSync(path.join(outDir, `${m.id}.json`), JSON.stringify(m, null, 2));
  const solid = m.voxels.filter((v) => v > 0).length;
  console.log(
    m.id,
    "solid",
    solid,
    "/",
    m.voxels.length,
    "blocks",
    JSON.stringify(m.sizeBlocks),
    "hv",
    m.heightVoxels,
    "name",
    m.nameRu ?? "",
  );
}

// Merge into registry: keep restored crate + recovered models
const registryPath = path.resolve("content/ember/voxels/registry.json");
let registry = { models: [] };
try {
  registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  if (!Array.isArray(registry.models)) registry.models = [];
} catch {
  registry = { models: [] };
}
const byId = new Map(registry.models.map((m) => [m.id, m]));
for (const m of models) byId.set(m.id, m);
registry.models = [...byId.values()];
if (!registry.scenes) registry.scenes = registry.scenes ?? [];
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");
console.log("wrote registry models:", registry.models.length);
