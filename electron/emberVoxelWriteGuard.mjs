/**
 * Last-line guards so an empty voxel JSON cannot replace a prefab or catalog.
 * Keep this module dependency-free so vitest can import it.
 */

function normalizeRel(relPath) {
  return String(relPath ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

export function isVoxelLibraryRel(relPath) {
  const rel = normalizeRel(relPath);
  if (!rel.startsWith("voxels/") || !rel.toLowerCase().endsWith(".json")) {
    return false;
  }
  if (rel.toLowerCase().endsWith(".bak")) return false;
  const rest = rel.slice("voxels/".length);
  const parts = rest.split("/");
  if (parts.some((part) => !part)) return false;
  if (parts.length === 1) return true;
  return parts.length === 2 && (parts[0] === "models" || parts[0] === "scenes");
}

function isVoxelAssetRel(relPath) {
  const rel = normalizeRel(relPath);
  return (
    rel.startsWith("voxels/models/") || rel.startsWith("voxels/scenes/")
  );
}

export function countVoxelModelsInText(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object") return null;
    if (Array.isArray(data.models)) return data.models.length;
    if (typeof data.mesh?.file === "string" && data.mesh.file) return 1;
    if (data.model && typeof data.model === "object") {
      return data.model.id || data.id ? 1 : 0;
    }
    if (typeof data.id === "string" && Array.isArray(data.voxels)) return 1;
    if (typeof data.id === "string") return 0;
    if (data.scene && typeof data.scene === "object") return 0;
    return null;
  } catch {
    return null;
  }
}

/**
 * Refuse wiping a prefab or halving a leftover catalog shard.
 */
export function voxelLibraryWriteGuard(relPath, nextText, prevText) {
  if (!isVoxelLibraryRel(relPath)) return { ok: true };
  if (typeof nextText !== "string") return { ok: true };
  const nextCount = countVoxelModelsInText(nextText);
  if (nextCount == null) return { ok: true };
  const prevCount = countVoxelModelsInText(prevText ?? "");
  if (prevCount == null) return { ok: true };
  if (isVoxelAssetRel(relPath) && nextCount === 0 && prevCount > 0) {
    return {
      ok: false,
      detail: `refusing to wipe voxel prefab ${relPath}`,
    };
  }
  if (nextCount === 0 && prevCount >= 8) {
    return {
      ok: false,
      detail: `refusing to wipe voxel library ${relPath} (${prevCount} → 0)`,
    };
  }
  if (prevCount >= 8 && nextCount < prevCount * 0.5) {
    return {
      ok: false,
      detail: `refusing to shrink voxel library ${relPath} (${prevCount} → ${nextCount})`,
    };
  }
  return { ok: true };
}

/**
 * Do not replace a known-good .bak with an empty or much smaller voxel file.
 */
export function shouldRefreshJsonBak(relPath, currentText, bakText) {
  if (!isVoxelLibraryRel(relPath)) return true;
  const currentCount = countVoxelModelsInText(currentText ?? "");
  if (currentCount == null) return false;
  if (currentCount === 0) return false;
  const bakCount = countVoxelModelsInText(bakText ?? "");
  if (bakCount != null && bakCount >= 8 && currentCount < bakCount * 0.5) {
    return false;
  }
  return true;
}
