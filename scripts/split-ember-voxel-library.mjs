/**
 * Split leftover voxel catalog shards into Unity-like prefab files.
 * Run: node scripts/split-ember-voxel-library.mjs
 *
 * Writes content/ember/voxels/models/<id>.json then moves the old
 * registry/village JSON into voxels/_legacy/ (gitignored local backup).
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const voxelsDir = path.join(root, "content", "ember", "voxels");
const modelsDir = path.join(voxelsDir, "models");
const scenesDir = path.join(voxelsDir, "scenes");
const legacyDir = path.join(voxelsDir, "_legacy");

const SHARDS = ["village.json", "registry.json", "user.json", "fantasy.json"];

function readJson(abs) {
  return JSON.parse(readFileSync(abs, "utf8"));
}

function writeJson(abs, data) {
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function fileName(id) {
  const safe = String(id)
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${safe || "voxel"}.json`;
}

function isTrivialScene(scene, modelId) {
  if (!scene || scene.id !== modelId) return false;
  if ((scene.joints?.length ?? 0) > 0) return false;
  if ((scene.animations?.length ?? 0) > 0) return false;
  const objects = scene.objects ?? [];
  if (objects.length !== 1) return false;
  return objects[0]?.modelId === modelId;
}

function loadShard(name) {
  const abs = path.join(voxelsDir, name);
  const fromLegacy = path.join(legacyDir, name);
  const file = existsSync(abs) ? abs : existsSync(fromLegacy) ? fromLegacy : null;
  if (!file) return { models: [], scenes: [] };
  const raw = readJson(file);
  return {
    models: Array.isArray(raw.models) ? raw.models : [],
    scenes: Array.isArray(raw.scenes) ? raw.scenes : [],
  };
}

const models = new Map();
const scenes = new Map();
const fromShard = new Map();

for (const name of SHARDS) {
  const shard = loadShard(name);
  for (const model of shard.models) {
    if (!model?.id || models.has(model.id)) continue;
    models.set(model.id, model);
    fromShard.set(model.id, name);
  }
  for (const scene of shard.scenes) {
    if (!scene?.id || scenes.has(scene.id)) continue;
    scenes.set(scene.id, scene);
  }
}

if (models.size === 0) {
  const existing = existsSync(modelsDir)
    ? readdirSync(modelsDir).filter((n) => n.endsWith(".json"))
    : [];
  console.log(
    existing.length > 0
      ? `already split: ${existing.length} files in voxels/models`
      : "no voxel models found in leftover shards",
  );
  process.exit(0);
}

mkdirSync(modelsDir, { recursive: true });
const usedScenes = new Set();
let wrote = 0;

for (const [id, model] of models) {
  const scene = scenes.get(id);
  const payload = {
    id,
    nameRu: model.nameRu,
    model,
  };
  if (scene && !isTrivialScene(scene, id)) {
    payload.scene = scene;
    usedScenes.add(id);
  } else if (scene) {
    usedScenes.add(id);
  }
  writeJson(path.join(modelsDir, fileName(id)), payload);
  wrote += 1;
}

let extraScenes = 0;
for (const [id, scene] of scenes) {
  if (usedScenes.has(id)) continue;
  mkdirSync(scenesDir, { recursive: true });
  writeJson(path.join(scenesDir, fileName(id)), { id, scene });
  extraScenes += 1;
}

const writtenIds = new Set(
  readdirSync(modelsDir)
    .filter((n) => n.endsWith(".json"))
    .map((n) => {
      const raw = readJson(path.join(modelsDir, n));
      return raw.model?.id || raw.id;
    }),
);
for (const id of models.keys()) {
  if (!writtenIds.has(id)) {
    console.error(`missing prefab after split: ${id}`);
    process.exit(1);
  }
}

mkdirSync(legacyDir, { recursive: true });
for (const name of SHARDS) {
  const abs = path.join(voxelsDir, name);
  if (!existsSync(abs)) continue;
  renameSync(abs, path.join(legacyDir, name));
  const bak = `${abs}.bak`;
  if (existsSync(bak)) {
    renameSync(bak, path.join(legacyDir, `${name}.bak`));
  }
}

const byShard = {};
for (const shard of fromShard.values()) {
  byShard[shard] = (byShard[shard] ?? 0) + 1;
}

console.log(
  `split ${wrote} prefabs into voxels/models` +
    (extraScenes ? `, ${extraScenes} extra scenes` : "") +
    `; leftover shards → voxels/_legacy (${JSON.stringify(byShard)})`,
);
