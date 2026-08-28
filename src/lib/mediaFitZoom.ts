export const MEDIA_ZOOM_MIN = 1;
export const MEDIA_ZOOM_MAX = 3;
export const MEDIA_ZOOM_STEP = 0.25;

export function stepMediaZoom(zoom: number, dir: -1 | 1): number {
  const next = zoom + dir * MEDIA_ZOOM_STEP;
  return Math.min(
    MEDIA_ZOOM_MAX,
    Math.max(MEDIA_ZOOM_MIN, Math.round(next * 100) / 100),
  );
}

export function fitMediaScale(
  stageW: number,
  stageH: number,
  naturalW: number,
  naturalH: number,
): number {
  if (stageW <= 0 || stageH <= 0 || naturalW <= 0 || naturalH <= 0) return 0;
  const next = Math.min(stageW / naturalW, stageH / naturalH);
  return Number.isFinite(next) && next > 0 ? next : 0;
}

export function fittedMediaSize(
  naturalW: number,
  naturalH: number,
  fit: number,
  zoom: number,
): { w: number; h: number } | null {
  if (naturalW <= 0 || naturalH <= 0 || fit <= 0) return null;
  return { w: naturalW * fit * zoom, h: naturalH * fit * zoom };
}

export const MEDIA_SIDE_CHROME_MIN_INSET = 8;

export function mediaFitGutter(viewerW: number, fittedW: number): number {
  return Math.max(0, (viewerW - fittedW) / 2);
}

/**
 * How far the fixed prev/next arrows reach into the viewer, plus a gap.
 * Used so the action rail does not share the same strip as ‹ ›.
 */
export function mediaNavReserve(
  viewerLeft: number,
  viewerRight: number,
  navPrevRight: number | null,
  navNextLeft: number | null,
  gap: number,
): { left: number; right: number } {
  return {
    left:
      navPrevRight == null
        ? 0
        : Math.max(0, navPrevRight + gap - viewerLeft),
    right:
      navNextLeft == null
        ? 0
        : Math.max(0, viewerRight - navNextLeft + gap),
  };
}

/** Side chrome sits on the media when leftover gutter cannot fit rails + arrows. */
export function mediaSideChromeOverlays(
  viewerW: number,
  fittedW: number,
  sideNeed: number,
): boolean {
  if (viewerW <= 0 || sideNeed <= 0) return false;
  return mediaFitGutter(viewerW, fittedW) + 1 < sideNeed;
}

/** Overlay inset from the media edge so the rail starts past the nav arrow. */
export function mediaSideChromeOverlayInset(
  gutter: number,
  navReserve: number,
  minInset: number,
): number {
  return Math.max(minInset, navReserve - Math.max(0, gutter));
}

export function mediaZoomLabel(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

export type MediaPan = { x: number; y: number };

/** True when the painted size no longer fits the 100% box. */
export function mediaPaintOverflows(
  box: { w: number; h: number } | null,
  paint: { w: number; h: number } | null,
): boolean {
  if (!box || !paint) return false;
  return paint.w > box.w + 1 || paint.h > box.h + 1;
}

/** Half the extra size so a centered zoom still covers the viewport. */
export function mediaPanExtents(
  viewW: number,
  viewH: number,
  zoom: number,
): MediaPan {
  const z = Math.max(zoom, MEDIA_ZOOM_MIN);
  return {
    x: Math.max(0, (viewW * z - viewW) / 2),
    y: Math.max(0, (viewH * z - viewH) / 2),
  };
}

export function clampMediaPan(
  pan: MediaPan,
  viewW: number,
  viewH: number,
  zoom: number,
): MediaPan {
  const ext = mediaPanExtents(viewW, viewH, zoom);
  return {
    x: Math.min(ext.x, Math.max(-ext.x, pan.x)),
    y: Math.min(ext.y, Math.max(-ext.y, pan.y)),
  };
}

/** Keep the point under the cursor stable when zoom changes. */
export function panAfterZoom(
  pan: MediaPan,
  prevZoom: number,
  nextZoom: number,
  viewW: number,
  viewH: number,
  cursorX: number,
  cursorY: number,
): MediaPan {
  if (nextZoom <= MEDIA_ZOOM_MIN || prevZoom <= 0) return { x: 0, y: 0 };
  const k = nextZoom / prevZoom;
  const cx = cursorX - viewW / 2;
  const cy = cursorY - viewH / 2;
  return clampMediaPan(
    { x: cx - (cx - pan.x) * k, y: cy - (cy - pan.y) * k },
    viewW,
    viewH,
    nextZoom,
  );
}

export function mediaPaintPosition(
  box: { w: number; h: number },
  paint: { w: number; h: number },
  pan: MediaPan,
): { left: number; top: number } {
  return {
    left: (box.w - paint.w) / 2 + pan.x,
    top: (box.h - paint.h) / 2 + pan.y,
  };
}
