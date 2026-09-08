/**
 * Ember voxel prefab ↔ MagicaVoxel .vox
 *
 * MagicaVoxel: X/Y ground, Z up (SIZE.z is gravity).
 * Ember model: X/Z ground, Y up. Mapping: ember(x,y,z) = vox(x,z,y).
 *
 * Shape + palette live in .vox. Collider / light / extra channels stay on the Ember model JSON.
 */
import type { EmberVoxelAssetFile, EmberVoxelModel } from "../content/types";
import {
  DEFAULT_VOXEL_PALETTE,
  NEW_ENVIRONMENT_VOXELS_PER_BLOCK,
  normalizeVoxelsPerBlock,
  VOXELS_PER_BLOCK,
} from "./constants";
import {
  createEmptyVoxelModel,
  getVoxel,
  normalizeVoxelModel,
  voxelGridSize,
} from "./voxelModel";
import {
  defaultVoxPaletteRgba,
  parseVoxFile,
  serializeVoxFile,
  type VoxDocument,
} from "./vox/voxFile";

const GRID_MAX = 8 * NEW_ENVIRONMENT_VOXELS_PER_BLOCK;

export function voxRelForModelId(id: string): string {
  const safe = String(id ?? "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `voxels/models/${safe || "voxel"}.vox`;
}

function hexToRgba(hex: string): [number, number, number, number] {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    const r = parseInt(h[0]! + h[0]!, 16);
    const g = parseInt(h[1]! + h[1]!, 16);
    const b = parseInt(h[2]! + h[2]!, 16);
    return [r, g, b, 255];
  }
  if (h.length >= 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      255,
    ];
  }
  return [128, 128, 128, 255];
}

export function rgbaToHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function emberModelToVoxDocument(model: EmberVoxelModel): VoxDocument {
  const { sx, sy, sz } = voxelGridSize(model);
  const palette = new Uint8Array(256 * 4);
  palette.set(defaultVoxPaletteRgba());
  const indexMap = new Map<number, number>();
  let nextIndex = 1;
  const voxels: VoxDocument["models"][0]["voxels"] = [];

  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const pi = getVoxel(model, x, y, z);
        if (pi <= 0) continue;
        let vi = indexMap.get(pi);
        if (vi == null) {
          if (nextIndex > 255) continue;
          vi = nextIndex++;
          indexMap.set(pi, vi);
          const hex = model.palette[pi] || "#888888";
          const [r, g, b, a] = hexToRgba(hex);
          const o = vi * 4;
          palette[o] = r;
          palette[o + 1] = g;
          palette[o + 2] = b;
          palette[o + 3] = a;
        }
        if (x > 255 || z > 255 || y > 255) continue;
        voxels.push({ x, y: z, z: y, i: vi });
      }
    }
  }

  return {
    version: 150,
    models: [
      {
        size: { x: Math.min(255, sx), y: Math.min(255, sz), z: Math.min(255, sy) },
        voxels,
      },
    ],
    palette,
  };
}

export function encodeEmberModelToVox(model: EmberVoxelModel): Uint8Array {
  return serializeVoxFile(emberModelToVoxDocument(model));
}

export function voxDocumentToEmberModel(
  doc: VoxDocument,
  id: string,
  nameRu?: string,
  voxelsPerBlock: 16 | 32 = VOXELS_PER_BLOCK,
): EmberVoxelModel {
  const density = normalizeVoxelsPerBlock(voxelsPerBlock);
  const src = doc.models[0];
  if (!src) throw new Error("vox: empty document");
  const sx = Math.max(1, Math.min(GRID_MAX, src.size.x));
  const sz = Math.max(1, Math.min(GRID_MAX, src.size.y));
  const sy = Math.max(1, Math.min(GRID_MAX, src.size.z));
  const sizeBlocks = {
    x: Math.max(1, Math.ceil(sx / density)),
    y: Math.max(1, Math.ceil(sy / density)),
    z: Math.max(1, Math.ceil(sz / density)),
  };
  let model = createEmptyVoxelModel(id, sizeBlocks, nameRu, sy, density);
  const used = new Map<number, number>();
  const colors: string[] = [""];

  for (const v of src.voxels) {
    if (v.i <= 0) continue;
    const ex = v.x;
    const ey = v.z;
    const ez = v.y;
    if (ex < 0 || ey < 0 || ez < 0 || ex >= sx || ey >= sy || ez >= sz) continue;
    let pi = used.get(v.i);
    if (pi == null) {
      pi = used.size + 1;
      used.set(v.i, pi);
      const o = v.i * 4;
      colors[pi] = rgbaToHex(
        doc.palette[o] ?? 0,
        doc.palette[o + 1] ?? 0,
        doc.palette[o + 2] ?? 0,
      );
    }
    const i = ex + ez * sx + ey * sx * sz;
    if (i >= 0 && i < model.voxels.length) model.voxels[i] = pi;
  }

  model = {
    ...model,
    palette: colors.length > 1 ? colors : [...DEFAULT_VOXEL_PALETTE],
  };
  return normalizeVoxelModel(model);
}

export function decodeVoxToEmberModel(
  bytes: Uint8Array,
  id: string,
  nameRu?: string,
  voxelsPerBlock: 16 | 32 = VOXELS_PER_BLOCK,
): EmberVoxelModel {
  return voxDocumentToEmberModel(parseVoxFile(bytes), id, nameRu, voxelsPerBlock);
}

function channelHasSignal(arr?: number[]): boolean {
  return Boolean(arr?.some((value) => value > 0));
}

/**
 * Prefab JSON keeps collider/light and extra channels.
 * Occupancy belongs in the sibling `.vox` (palette can come from either).
 */
export function stripVoxelGridForPrefab(model: EmberVoxelModel): EmberVoxelModel {
  const next: EmberVoxelModel = { ...model, voxels: [] };
  if (!channelHasSignal(next.emissive)) delete next.emissive;
  if (!channelHasSignal(next.shine)) delete next.shine;
  if (!channelHasSignal(next.transparency)) delete next.transparency;
  if (!channelHasSignal(next.transmittance)) delete next.transmittance;
  return next;
}

function sameVoxelGrid(a: EmberVoxelModel, b: EmberVoxelModel): boolean {
  const ga = voxelGridSize(a);
  const gb = voxelGridSize(b);
  return ga.sx === gb.sx && ga.sy === gb.sy && ga.sz === gb.sz;
}

export function mergeVoxMeshOntoPrefab(
  prefab: EmberVoxelModel,
  mesh: EmberVoxelModel,
): EmberVoxelModel {
  const keepExtra = sameVoxelGrid(prefab, mesh);
  return normalizeVoxelModel({
    ...prefab,
    sizeBlocks: mesh.sizeBlocks,
    heightVoxels: mesh.heightVoxels,
    palette: mesh.palette,
    voxels: mesh.voxels,
    emissive: keepExtra && prefab.emissive?.length ? prefab.emissive : mesh.emissive,
    shine: keepExtra && prefab.shine?.length ? prefab.shine : mesh.shine,
    transparency:
      keepExtra && prefab.transparency?.length
        ? prefab.transparency
        : mesh.transparency,
    transmittance:
      keepExtra && prefab.transmittance?.length
        ? prefab.transmittance
        : mesh.transmittance,
  });
}

export function voxelOccupancyFingerprint(model: EmberVoxelModel): string {
  return JSON.stringify({
    sizeBlocks: model.sizeBlocks,
    voxelsPerBlock: model.voxelsPerBlock ?? VOXELS_PER_BLOCK,
    heightVoxels: model.heightVoxels ?? null,
    palette: model.palette,
    voxels: model.voxels,
  });
}

/** Replace occupancy/palette from MagicaVoxel; keep Ember id and components. */
export function applyVoxBytesToEmberModel(
  prefab: EmberVoxelModel,
  bytes: Uint8Array,
): EmberVoxelModel {
  const mesh = decodeVoxToEmberModel(
    bytes,
    prefab.id,
    prefab.nameRu,
    normalizeVoxelsPerBlock(prefab.voxelsPerBlock),
  );
  return mergeVoxMeshOntoPrefab(prefab, mesh);
}

export function nameRuFromVoxFileName(fileName: string): string {
  const stem = fileName
    .replace(/^.*[/\\]/, "")
    .replace(/\.vox$/i, "")
    .trim();
  return stem || "Импорт MagicaVoxel";
}

export function voxDocumentExceedsEmberGrid(bytes: Uint8Array): boolean {
  const src = parseVoxFile(bytes).models[0];
  if (!src) return false;
  return src.size.x > GRID_MAX || src.size.y > GRID_MAX || src.size.z > GRID_MAX;
}

export function splitEmberVoxelPrefab(model: EmberVoxelModel): {
  asset: EmberVoxelAssetFile;
  vox: Uint8Array;
} {
  const normalized = normalizeVoxelModel(model);
  const asset: EmberVoxelAssetFile = {
    id: normalized.id,
    nameRu: normalized.nameRu,
    mesh: { kind: "vox", file: voxRelForModelId(normalized.id) },
    model: stripVoxelGridForPrefab(normalized),
  };
  if (normalized.tags?.length) asset.tags = [...normalized.tags];
  return {
    asset,
    vox: encodeEmberModelToVox(normalized),
  };
}

export function joinEmberVoxelPrefab(
  asset: EmberVoxelAssetFile,
  voxBytes: Uint8Array,
): EmberVoxelModel {
  const mesh = decodeVoxToEmberModel(
    voxBytes,
    asset.id,
    asset.nameRu ?? asset.model.nameRu,
    normalizeVoxelsPerBlock(asset.model.voxelsPerBlock),
  );
  return mergeVoxMeshOntoPrefab(
    {
      ...asset.model,
      id: asset.id,
      nameRu: asset.nameRu ?? asset.model.nameRu,
      tags: asset.model.tags ?? asset.tags,
    },
    mesh,
  );
}
