import { describe, expect, it } from "vitest";
import {
  fitPixelCanvasScale,
  pixelNavigatorViewport,
  stepPixelCanvasScale,
} from "./pixelCanvasNavigation";

describe("pixel canvas navigation", () => {
  it("uses progressively larger integer zoom steps", () => {
    expect(stepPixelCanvasScale(8, 1)).toBe(9);
    expect(stepPixelCanvasScale(16, 1)).toBe(18);
    expect(stepPixelCanvasScale(28, -1)).toBe(24);
    expect(stepPixelCanvasScale(48, 1)).toBe(48);
  });

  it("fits a pixel canvas into the available viewport", () => {
    expect(fitPixelCanvasScale(400, 300, 16, 16, 32, 32)).toBe(16);
    expect(fitPixelCanvasScale(100, 80, 32, 16, 20, 20)).toBe(4);
  });

  it("maps the visible canvas intersection into navigator coordinates", () => {
    expect(pixelNavigatorViewport(
      { left: -50, top: -20, width: 200, height: 100 },
      { left: 0, top: 0, width: 100, height: 60 },
      120,
      60,
    )).toEqual({ left: 30, top: 12, width: 60, height: 36 });
  });

  it("returns an empty navigator viewport when the canvas is off-screen", () => {
    expect(pixelNavigatorViewport(
      { left: 200, top: 200, width: 100, height: 100 },
      { left: 0, top: 0, width: 80, height: 80 },
      60,
      60,
    )).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });
});
