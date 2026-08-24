import { describe, expect, it } from "vitest";
import {
  MAX_PIXEL_REFERENCE_BYTES,
  addPixelCanvasGuide,
  clampPixelCanvasGuides,
  clampPixelGuidePosition,
  movePixelCanvasGuide,
  validatePixelReferenceFile,
} from "./pixelCanvasView";

describe("pixel canvas view helpers", () => {
  it("clamps guide positions to integer canvas boundaries", () => {
    expect(clampPixelGuidePosition(-2, 16)).toBe(0);
    expect(clampPixelGuidePosition(7.6, 16)).toBe(8);
    expect(clampPixelGuidePosition(99, 16)).toBe(16);
  });

  it("adds unique guides and moves them safely", () => {
    const first = addPixelCanvasGuide([], "x", 4, 16, "g1");
    expect(addPixelCanvasGuide(first, "x", 4, 16, "g2")).toEqual(first);
    expect(movePixelCanvasGuide(first, "g1", 30, 16)).toEqual([
      { id: "g1", axis: "x", position: 16 },
    ]);
  });

  it("clamps and deduplicates guides when the asset size changes", () => {
    expect(clampPixelCanvasGuides([
      { id: "a", axis: "x", position: 20 },
      { id: "b", axis: "x", position: 12 },
      { id: "c", axis: "y", position: 20 },
    ], 12, 8)).toEqual([
      { id: "a", axis: "x", position: 12 },
      { id: "c", axis: "y", position: 8 },
    ]);
  });

  it("rejects invalid and oversized reference files", () => {
    expect(validatePixelReferenceFile({ type: "text/plain", size: 10 })).toMatch(/изображения/);
    expect(validatePixelReferenceFile({ type: "image/png", size: 0 })).toMatch(/пуст/);
    expect(validatePixelReferenceFile({ type: "image/png", size: MAX_PIXEL_REFERENCE_BYTES + 1 })).toMatch(/20 МБ/);
    expect(validatePixelReferenceFile({ type: "image/webp", size: 1024 })).toBeNull();
  });
});
