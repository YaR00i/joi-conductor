export const PIXEL_CANVAS_SCALE_MIN = 4;
export const PIXEL_CANVAS_SCALE_MAX = 48;
export const PIXEL_CANVAS_SCALE_100 = 16;

export type PixelCanvasRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function clampPixelCanvasScale(
  value: number,
  min = PIXEL_CANVAS_SCALE_MIN,
  max = PIXEL_CANVAS_SCALE_MAX,
): number {
  const safe = Number.isFinite(value) ? Math.round(value) : PIXEL_CANVAS_SCALE_100;
  return Math.max(min, Math.min(max, safe));
}

export function stepPixelCanvasScale(
  current: number,
  direction: 1 | -1,
  min = PIXEL_CANVAS_SCALE_MIN,
  max = PIXEL_CANVAS_SCALE_MAX,
): number {
  const step = current < 12 ? 1 : current < 24 ? 2 : 4;
  return clampPixelCanvasScale(current + direction * step, min, max);
}

export function fitPixelCanvasScale(
  viewportWidth: number,
  viewportHeight: number,
  pixelWidth: number,
  pixelHeight: number,
  paddingX = 32,
  paddingY = 32,
  min = PIXEL_CANVAS_SCALE_MIN,
  max = PIXEL_CANVAS_SCALE_MAX,
): number {
  const sx = Math.floor((Math.max(0, viewportWidth) - paddingX) / Math.max(1, pixelWidth));
  const sy = Math.floor((Math.max(0, viewportHeight) - paddingY) / Math.max(1, pixelHeight));
  return clampPixelCanvasScale(Math.min(sx, sy), min, max);
}

export function pixelNavigatorViewport(
  canvas: PixelCanvasRect,
  viewport: PixelCanvasRect,
  drawWidth: number,
  drawHeight: number,
): PixelCanvasRect {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const left = Math.max(canvas.left, Math.min(canvas.left + canvas.width, viewport.left));
  const top = Math.max(canvas.top, Math.min(canvas.top + canvas.height, viewport.top));
  const right = Math.max(left, Math.min(canvas.left + canvas.width, viewport.left + viewport.width));
  const bottom = Math.max(top, Math.min(canvas.top + canvas.height, viewport.top + viewport.height));
  return {
    left: Math.max(0, ((left - canvas.left) / canvas.width) * drawWidth),
    top: Math.max(0, ((top - canvas.top) / canvas.height) * drawHeight),
    width: Math.max(0, ((right - left) / canvas.width) * drawWidth),
    height: Math.max(0, ((bottom - top) / canvas.height) * drawHeight),
  };
}
