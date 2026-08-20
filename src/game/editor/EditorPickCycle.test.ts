import { describe, expect, it } from "vitest";
import { advanceEditorPickCycle } from "./EditorPickCycle";

describe("advanceEditorPickCycle", () => {
  it("cycles a stable overlapping hit stack", () => {
    const first = advanceEditorPickCycle(null, "voxel:a|sprite:b|tile", 10, 20, 3);
    const second = advanceEditorPickCycle(first.state, "voxel:a|sprite:b|tile", 12, 18, 3);
    const third = advanceEditorPickCycle(second.state, "voxel:a|sprite:b|tile", 12, 18, 3);
    const wrapped = advanceEditorPickCycle(third.state, "voxel:a|sprite:b|tile", 12, 18, 3);
    expect([first.index, second.index, third.index, wrapped.index]).toEqual([
      0, 1, 2, 0,
    ]);
  });

  it("resets when the pointer or hit stack changes", () => {
    const first = advanceEditorPickCycle(null, "a|b", 10, 20, 2);
    expect(advanceEditorPickCycle(first.state, "a|b", 30, 20, 2).index).toBe(0);
    expect(advanceEditorPickCycle(first.state, "b|a", 10, 20, 2).index).toBe(0);
  });
});
