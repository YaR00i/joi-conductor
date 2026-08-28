/**
 * Sample-sized stills for the local favorites wall. Lightbox keeps the
 * original blob; the masonry must not decode it at card size.
 */

export const FAVORITE_WALL_THUMB_MAX_EDGE = 900;
const WALL_THUMB_JPEG_QUALITY = 0.82;
const WALL_THUMB_CONCURRENCY = 3;

export function wallThumbTargetSize(
  width: number,
  height: number,
  maxEdge = FAVORITE_WALL_THUMB_MAX_EDGE,
): { width: number; height: number } | null {
  if (width <= 0 || height <= 0) return null;
  const edge = Math.max(width, height);
  if (edge <= maxEdge) return null;
  const scale = maxEdge / edge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length;
  if (n === 0) return [];
  const out = new Array<R>(n);
  let next = 0;
  const workers = Math.max(1, Math.min(limit, n));
  async function worker() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= n) return;
      out[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: workers }, worker));
  return out;
}

export function favoriteWallThumbConcurrency(): number {
  return WALL_THUMB_CONCURRENCY;
}

function isStillImageBlob(blob: Blob): boolean {
  const type = (blob.type || "").toLowerCase();
  return type.startsWith("image/") && type !== "image/gif";
}

/**
 * Downsample a still to ~sample size. Null when the blob is already small,
 * animated, or not an image — caller should keep using the original.
 */
export async function stillBlobToWallThumb(blob: Blob): Promise<Blob | null> {
  if (!isStillImageBlob(blob)) return null;
  if (typeof createImageBitmap !== "function") return null;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    return null;
  }
  try {
    const target = wallThumbTargetSize(bmp.width, bmp.height);
    if (!target) return null;
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, target.width, target.height);
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (out) => resolve(out),
        "image/jpeg",
        WALL_THUMB_JPEG_QUALITY,
      );
    });
  } finally {
    bmp.close();
  }
}
