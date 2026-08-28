export function pageIndexFromScrub(
  clientX: number,
  trackLeft: number,
  trackWidth: number,
  total: number,
): number {
  const n = Math.max(1, Math.floor(total));
  if (!(trackWidth > 0)) return 0;
  const t = (clientX - trackLeft) / trackWidth;
  return Math.min(n - 1, Math.max(0, Math.floor(t * n)));
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
