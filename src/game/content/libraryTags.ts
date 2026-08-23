/**
 * Shared library tags for voxel/sprite assets.
 * Stored lowercase, hyphenated; empty → omitted.
 */
export function normalizeEmberLibraryTags(
  raw: unknown,
): string[] | undefined {
  const src = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[,;]+/)
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of src) {
    if (typeof item !== "string") continue;
    const tag = item
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._-]+/g, "");
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out.length ? out : undefined;
}

export function formatEmberLibraryTags(
  tags: ReadonlyArray<string> | undefined,
): string {
  return (tags ?? []).join(", ");
}

/**
 * Search-only hints from id prefixes. Not written to disk until the author
 * saves an explicit tag list.
 */
export function inferredLibraryTags(id: string): string[] {
  if (id.startsWith("vox_vil_") || id.startsWith("spr_vil_")) {
    return ["village"];
  }
  if (id.startsWith("vox_fan_") || id.startsWith("spr_fan_")) {
    return ["fantasy"];
  }
  if (id.startsWith("vox_chr_")) {
    return ["character", "chibi"];
  }
  return [];
}

export function libraryAssetSearchText(input: {
  id: string;
  nameRu?: string;
  tags?: ReadonlyArray<string>;
}): string {
  const inferred = inferredLibraryTags(input.id);
  return [
    input.id,
    input.nameRu ?? "",
    ...(input.tags ?? []),
    ...inferred,
  ]
    .join(" ")
    .toLowerCase();
}

export function libraryAssetMatchesQuery(
  input: {
    id: string;
    nameRu?: string;
    tags?: ReadonlyArray<string>;
  },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return libraryAssetSearchText(input).includes(q);
}
