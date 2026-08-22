/**
 * MagicaVoxel often saves via temp + rename. Watch the directory and match basename.
 * Keep this module dependency-free so vitest can import it.
 */

export function emberWatchBasename(relPath) {
  const rel = String(relPath ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const parts = rel.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

export function emberWatchEventMatches(watchedRel, filename) {
  const want = emberWatchBasename(watchedRel).toLowerCase();
  if (!want) return false;
  const got = emberWatchBasename(filename).toLowerCase();
  return Boolean(got) && got === want;
}
