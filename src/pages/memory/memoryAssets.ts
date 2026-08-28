/**
 * Materialize a memory deck's picture pool: fetch favorite blobs (or take
 * uploaded files), keep only still images that actually decode in the
 * browser, and hand out object URLs the game owns.
 *
 * Videos are excluded on purpose — the game is about matching pictures.
 * GIFs stay: they are pictures, the animation is harmless for pairing.
 */

import { getFavoriteRecord } from "../../lib/mediaFavorites";
import { shuffled, type MemoryPairAsset } from "../../lib/memoryDeck";

export type MemorySource =
  | { kind: "favorites"; ids: string[] }
  | { kind: "files"; files: File[] };

export interface LoadedMemoryAssets {
  assets: MemoryPairAsset[];
  skipped: number;
  /** True when the pool was smaller than requested. */
  short: boolean;
}

function decodeImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

async function tryAsset(
  blob: Blob,
  id: string,
  label: string,
): Promise<MemoryPairAsset | null> {
  if (blob.type && !blob.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(blob);
  if (!(await decodeImage(url))) {
    URL.revokeObjectURL(url);
    return null;
  }
  return { id, url, label };
}

/**
 * Build the pool of `want` pair assets. Candidates are shuffled first so a
 * favorites pool is always a random draw; upload order doesn't matter either.
 */
export async function loadMemoryAssets(
  source: MemorySource,
  want: number,
  onProgress?: (loaded: number, target: number) => void,
): Promise<LoadedMemoryAssets> {
  const assets: MemoryPairAsset[] = [];
  let skipped = 0;

  if (source.kind === "files") {
    const files = shuffled(source.files);
    for (const f of files) {
      if (assets.length >= want) break;
      onProgress?.(assets.length, want);
      const a = await tryAsset(f, `file-${f.name}-${assets.length}`, f.name);
      if (a) assets.push(a);
      else skipped += 1;
    }
  } else {
    const ids = shuffled(source.ids);
    for (const id of ids) {
      if (assets.length >= want) break;
      onProgress?.(assets.length, want);
      const rec = await getFavoriteRecord(id);
      if (!rec) {
        skipped += 1;
        continue;
      }
      const a = await tryAsset(rec.blob, rec.id, rec.fileName || "Избранное");
      if (a) assets.push(a);
      else skipped += 1;
    }
  }
  onProgress?.(assets.length, want);
  return { assets, skipped, short: assets.length < want };
}

/** Revoke every object URL of a torn-down deck. */
export function revokeMemoryAssets(assets: readonly MemoryPairAsset[]): void {
  for (const a of assets) URL.revokeObjectURL(a.url);
}
