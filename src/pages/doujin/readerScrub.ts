export function pageIndexFromScrub(
  clientX: number,
  trackLeft: number,
  trackWidth: number,
  total: number,
): number {
  const n = Math.max(1, Math.floor(total));
  if (n <= 1) return 0;
  if (!(trackWidth > 0)) return 0;
  const t = Math.min(1, Math.max(0, (clientX - trackLeft) / trackWidth));
  return Math.min(n - 1, Math.max(0, Math.round(t * (n - 1))));
}

/** 0 on page 1, 1 on the last page. 0-based `index`. */
export function scrubThumbRatio(index: number, total: number): number {
  const n = Math.max(1, Math.floor(total));
  const i = Math.min(n - 1, Math.max(0, index));
  if (n <= 1) return 0;
  return i / (n - 1);
}

export function clampScrubPreviewLeft(
  clientX: number,
  trackLeft: number,
  trackWidth: number,
  previewWidth: number,
): number {
  const half = Math.max(0, previewWidth / 2);
  const x = clientX - trackLeft;
  if (!(trackWidth > 0)) return half;
  return Math.min(trackWidth - half, Math.max(half, x));
}
