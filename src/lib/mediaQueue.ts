/** Session / mistress auto-queue length. Gelbooru max is 100 per request. */
export const MEDIA_QUEUE_MIN = 80;
export const MEDIA_QUEUE_MAX = 140;
export const MEDIA_QUEUE_STEP = 10;

export const MEDIA_QUEUE_SIZES = [
  80, 90, 100, 110, 120, 130, 140,
] as const;

export type MediaQueueSize = (typeof MEDIA_QUEUE_SIZES)[number];

export function isMediaQueueSize(value: number): value is MediaQueueSize {
  return (MEDIA_QUEUE_SIZES as readonly number[]).includes(value);
}

export function snapMediaQueueSize(n: number): MediaQueueSize {
  if (!Number.isFinite(n)) return MEDIA_QUEUE_MIN;
  let best: MediaQueueSize = MEDIA_QUEUE_MIN;
  let dist = Math.abs(n - best);
  for (const size of MEDIA_QUEUE_SIZES) {
    const next = Math.abs(n - size);
    if (next < dist) {
      best = size;
      dist = next;
    }
  }
  return best;
}
