import { describe, expect, it } from "vitest";
import {
  clampMediaPan,
  fitMediaScale,
  fittedMediaSize,
  mediaFitGutter,
  mediaNavReserve,
  mediaSideChromeOverlayInset,
  mediaSideChromeOverlays,
  mediaPaintOverflows,
  mediaPaintPosition,
  mediaPanExtents,
  mediaZoomLabel,
  MEDIA_ZOOM_MAX,
  MEDIA_ZOOM_MIN,
  panAfterZoom,
  stepMediaZoom,
} from "./mediaFitZoom";

describe("mediaFitZoom", () => {
  it("fits a tall image to the shorter stage side", () => {
    expect(fitMediaScale(800, 400, 400, 1200)).toBeCloseTo(400 / 1200);
  });

  it("steps zoom like the doujin reader", () => {
    expect(stepMediaZoom(MEDIA_ZOOM_MIN, -1)).toBe(MEDIA_ZOOM_MIN);
    expect(stepMediaZoom(1, 1)).toBe(1.25);
    expect(stepMediaZoom(MEDIA_ZOOM_MAX, 1)).toBe(MEDIA_ZOOM_MAX);
    expect(mediaZoomLabel(1.25)).toBe("125%");
  });

  it("overlays side chrome when a wide fit leaves no gutter", () => {
    expect(mediaSideChromeOverlays(800, 780, 48)).toBe(true);
    expect(mediaSideChromeOverlays(800, 704, 48)).toBe(false);
    expect(mediaSideChromeOverlays(800, 400, 48)).toBe(false);
    expect(mediaSideChromeOverlays(800, 800, 0)).toBe(false);
  });

  it("counts prev/next arrows that sit inside the viewer", () => {
    expect(mediaNavReserve(100, 900, 148, 852, 8)).toEqual({
      left: 56,
      right: 56,
    });
    expect(mediaNavReserve(100, 900, 80, 920, 8)).toEqual({
      left: 0,
      right: 0,
    });
    expect(mediaFitGutter(800, 720)).toBe(40);
  });

  it("insets overlay chrome past the nav arrows", () => {
    expect(mediaSideChromeOverlayInset(0, 56, 8)).toBe(56);
    expect(mediaSideChromeOverlayInset(40, 56, 8)).toBe(16);
    expect(mediaSideChromeOverlayInset(80, 56, 8)).toBe(8);
  });

  it("sizes the painted image from fit × zoom", () => {
    expect(fittedMediaSize(400, 1200, 0.5, 2)).toEqual({ w: 400, h: 1200 });
    expect(fittedMediaSize(0, 10, 1, 1)).toBeNull();
  });

  it("scrolls only when paint is larger than the 100% box", () => {
    const box = fittedMediaSize(400, 1200, 0.5, 1);
    const same = fittedMediaSize(400, 1200, 0.5, 1);
    const bigger = fittedMediaSize(400, 1200, 0.5, 1.25);
    expect(mediaPaintOverflows(box, same)).toBe(false);
    expect(mediaPaintOverflows(box, bigger)).toBe(true);
  });

  it("centers a zoomed image and clamps grab pan to the viewport", () => {
    expect(mediaPanExtents(200, 100, 1)).toEqual({ x: 0, y: 0 });
    expect(mediaPanExtents(200, 100, 2)).toEqual({ x: 100, y: 50 });
    expect(clampMediaPan({ x: 400, y: -80 }, 200, 100, 2)).toEqual({
      x: 100,
      y: -50,
    });
    expect(mediaPaintPosition({ w: 200, h: 100 }, { w: 400, h: 200 }, { x: 0, y: 0 })).toEqual({
      left: -100,
      top: -50,
    });
  });

  it("keeps the cursor point stable when zooming", () => {
    expect(panAfterZoom({ x: 0, y: 0 }, 1, 2, 200, 200, 100, 100)).toEqual({
      x: 0,
      y: 0,
    });
    expect(panAfterZoom({ x: 0, y: 0 }, 1, 2, 200, 200, 200, 100)).toEqual({
      x: -100,
      y: 0,
    });
    expect(panAfterZoom({ x: 40, y: 10 }, 2, 1, 200, 200, 100, 100)).toEqual({
      x: 0,
      y: 0,
    });
  });
});
