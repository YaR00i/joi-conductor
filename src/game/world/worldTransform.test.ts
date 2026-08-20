import { describe, expect, it } from "vitest";
import {
  compactEmberTransformScale,
  resolveEmberTransformScale,
} from "./worldTransform";

describe("world Transform scale", () => {
  it("normalizes unsafe authored values and compacts identity", () => {
    expect(
      resolveEmberTransformScale({ x: -2, y: Number.NaN, z: 99 }),
    ).toEqual({ x: 0.125, y: 1, z: 8 });
    expect(compactEmberTransformScale({ x: 1, y: 1, z: 1 })).toBeUndefined();
    expect(compactEmberTransformScale({ x: 2, y: 1, z: 1 })).toEqual({
      x: 2,
      y: 1,
      z: 1,
    });
  });
});
