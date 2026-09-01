import { describe, expect, it } from "vitest";
import {
  PENIS_AXIS_THIN,
  penisHoleEllipse,
  penisHoleOrientationRad,
} from "./mediaCensorPenisAxis";

function rgbaFill(
  w: number,
  h: number,
  paint: (x: number, y: number) => [number, number, number],
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b] = paint(x, y);
      const o = (y * w + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
    }
  }
  return out;
}

function acuteDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

describe("mediaCensorPenisAxis", () => {
  it("reads a diagonal stripe as ~45°", () => {
    const w = 32;
    const h = 32;
    const rgba = rgbaFill(w, h, (x, y) =>
      Math.abs(x - y) <= 2 ? [220, 160, 150] : [20, 18, 22],
    );
    const rad = penisHoleOrientationRad(rgba, w, h);
    expect(rad).not.toBeNull();
    expect(acuteDelta(rad!, Math.PI / 4)).toBeLessThan(0.28);
  });

  it("reads a tall vertical shaft as ~90°", () => {
    const w = 10;
    const h = 32;
    const rgba = rgbaFill(w, h, (x) =>
      x >= 3 && x <= 6 ? [210, 150, 140] : [18, 16, 20],
    );
    const rad = penisHoleOrientationRad(rgba, w, h);
    expect(rad).not.toBeNull();
    expect(acuteDelta(rad!, Math.PI / 2)).toBeLessThan(0.3);
  });

  it("returns null on flat luma", () => {
    const rgba = rgbaFill(24, 24, () => [80, 80, 80]);
    expect(penisHoleOrientationRad(rgba, 24, 24)).toBeNull();
  });

  it("uses AABB radii when there is no axis", () => {
    const aligned = penisHoleEllipse(40, 80, null);
    expect(aligned.rx).toBeCloseTo(20);
    expect(aligned.ry).toBeCloseTo(40);
    expect(aligned.rotation).toBe(0);
    const tilted = penisHoleEllipse(40, 40, Math.PI / 4);
    expect(tilted.rx).toBeCloseTo(Math.hypot(40, 40) / 2);
    expect(tilted.ry).toBeCloseTo(40 * PENIS_AXIS_THIN);
    expect(tilted.rotation).toBeCloseTo(Math.PI / 4);
  });

  it("ignores a bright corner blob on a diagonal shaft", () => {
    const w = 32;
    const h = 32;
    const rgba = rgbaFill(w, h, (x, y) => {
      if (x >= 18 && y < 14) return [240, 220, 80];
      if (Math.abs(x - y) <= 2) return [220, 160, 150];
      return [20, 18, 22];
    });
    const rad = penisHoleOrientationRad(rgba, w, h);
    expect(rad).not.toBeNull();
    expect(acuteDelta(rad!, Math.PI / 4)).toBeLessThan(0.32);
  });
});
