/**
 * Restore Ember's voxel registry after a truncated/empty registry file.
 *
 * Exact models are read from scripts/.tmp-voxel-recovery (created by
 * recover-ember-voxel-sst.mjs). Referenced models that are no longer present
 * in any local history are replaced with conspicuous, editable recovery
 * proxies so maps do not silently lose geometry and lights.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const registryPath = path.join(root, "content/ember/voxels/registry.json");
const mapPath = path.join(root, "content/ember/maps/hu_tao_yard.json");
const recoveryDir = path.join(root, "scripts/.tmp-voxel-recovery");
const backupPath = path.join(recoveryDir, "registry-before-restore.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function hashId(id) {
  let hash = 2166136261;
  for (const char of id) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function recoveryProxy(id, placements) {
  const size = 16;
  const count = size * size * size;
  const voxels = new Array(count).fill(0);
  const emissive = new Array(count).fill(0);
  const shine = new Array(count).fill(0);
  const transparency = new Array(count).fill(0);
  const index = (x, y, z) => x + z * size + y * size * size;
  const seed = hashId(id);
  const hue = seed % 360;
  const castsLight = placements.some((item) => item.emissiveCastsLight === true);

  // A low plinth plus a hollow marker is easy to see/select while staying
  // distinct from authored art. The model can be replaced in the editor.
  for (let y = 0; y < 3; y += 1) {
    for (let z = 2; z < 14; z += 1) {
      for (let x = 2; x < 14; x += 1) voxels[index(x, y, z)] = 1;
    }
  }
  const top = 8 + (seed % 6);
  for (let y = 3; y <= top; y += 1) {
    for (let z = 4; z < 12; z += 1) {
      for (let x = 4; x < 12; x += 1) {
        const edge = x === 4 || x === 11 || z === 4 || z === 11;
        if (edge || y === top) voxels[index(x, y, z)] = 2;
      }
    }
  }
  if (castsLight) {
    for (let y = Math.max(4, top - 3); y <= top; y += 1) {
      for (let z = 6; z < 10; z += 1) {
        for (let x = 6; x < 10; x += 1) {
          const i = index(x, y, z);
          voxels[i] = 3;
          emissive[i] = 255;
        }
      }
    }
  }

  return {
    id,
    nameRu: `ВОССТАНОВИТЬ: ${id}`,
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: 16,
    palette: ["", `hsl(${hue} 32% 28%)`, "#ff3d8d", "#ffd166"],
    voxels,
    emissive,
    shine,
    transparency,
    material: castsLight ? "metal" : "stone",
    emissiveCastsLight: castsLight || undefined,
    emissiveLightRange: castsLight ? 2.5 : undefined,
    emissiveStrength: castsLight ? 2.5 : undefined,
    physical: true,
  };
}

fs.mkdirSync(recoveryDir, { recursive: true });
if (!fs.existsSync(backupPath) && fs.existsSync(registryPath)) {
  fs.copyFileSync(registryPath, backupPath);
}

const recovered = fs
  .readdirSync(recoveryDir)
  .filter((name) => /^vox_.+\.json$/i.test(name))
  .map((name) => readJson(path.join(recoveryDir, name)))
  .filter((model) => model?.id && Array.isArray(model.voxels));
const byId = new Map(recovered.map((model) => [model.id, model]));
const map = readJson(mapPath);
const placementsByModel = new Map();
for (const placement of map.voxelProps ?? []) {
  const list = placementsByModel.get(placement.modelId) ?? [];
  list.push(placement);
  placementsByModel.set(placement.modelId, list);
}

const proxies = [];
for (const [id, placements] of placementsByModel) {
  if (byId.has(id)) continue;
  const proxy = recoveryProxy(id, placements);
  byId.set(id, proxy);
  proxies.push(proxy);
}

const models = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(
  registryPath,
  `${JSON.stringify({ models, scenes: [] }, null, 2)}\n`,
  "utf8",
);

console.log(
  `Restored ${models.length} voxel models: ${recovered.length} exact, ${proxies.length} recovery proxies.`,
);
for (const proxy of proxies) console.log(`  proxy ${proxy.id}`);
