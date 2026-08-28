/** Start the next page before the lightbox sits on the last buffered item. */
export const LIGHTBOX_PREFETCH_REMAINING = 4;

export function lightboxShouldPrefetch(
  viewerIndex: number,
  itemCount: number,
  hasMore: boolean,
): boolean {
  if (!hasMore || viewerIndex < 0 || itemCount <= 0) return false;
  return viewerIndex >= itemCount - LIGHTBOX_PREFETCH_REMAINING;
}

export function lightboxCanGoNext(
  viewerIndex: number,
  itemCount: number,
  hasMore: boolean,
): boolean {
  if (viewerIndex < 0) return false;
  return viewerIndex < itemCount - 1 || hasMore;
}
