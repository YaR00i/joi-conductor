/**
 * Prefer user-dropped PNG over SVG placeholders for mistress assets.
 * Call at pack build time with a base path like `/furina/mood/sweet`.
 */
export function mistressAssetSrc(baseWithoutExt: string): string {
  // Runtime: browsers request URL as given. We point to PNG first; if missing,
  // Vite public folder keeps SVG. Prefer PNG path when the pack is built —
  // packs pass explicit paths. This helper documents the convention and
  // returns PNG when callers want the preferred slot.
  return `${baseWithoutExt}.png`;
}

/** PNG with SVG fallback path for <img onError>. */
export function mistressAssetCandidates(baseWithoutExt: string): {
  primary: string;
  fallback: string;
} {
  return {
    primary: `${baseWithoutExt}.png`,
    fallback: `${baseWithoutExt}.svg`,
  };
}
