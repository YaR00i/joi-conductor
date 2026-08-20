import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_SELECTION_FILTER,
  filterEditorSelectionStack,
  includeRegionInViewportPick,
  normalizeEditorSelectionFilter,
} from "./EditorSelectionFilter";

describe("EditorSelectionFilter", () => {
  it("filters a stable hit stack without changing its front-to-back order", () => {
    const stack = [
      { kind: "voxel" as const, id: "crate" },
      { kind: "region" as const, id: "trigger" },
      { kind: "tile" as const, id: "floor" },
    ];
    expect(
      filterEditorSelectionStack(stack, {
        ...DEFAULT_EDITOR_SELECTION_FILTER,
        region: false,
      }),
    ).toEqual([stack[0], stack[2]]);
  });

  it("skips locked viewport objects while leaving unlocked hits selectable", () => {
    const stack = [
      { kind: "voxel" as const, id: "locked" },
      { kind: "voxel" as const, id: "free" },
    ];
    expect(
      filterEditorSelectionStack(
        stack,
        DEFAULT_EDITOR_SELECTION_FILTER,
        (item) => item.id === "locked",
      ),
    ).toEqual([stack[1]]);
  });

  it("normalizes malformed persisted state and enables newly added kinds", () => {
    expect(
      normalizeEditorSelectionFilter({ voxel: false, sprite: "no" }),
    ).toEqual({
      voxel: false,
      sprite: true,
      light: true,
      region: true,
      tile: true,
    });
  });

  it("keeps camera_bound out of viewport tile picks", () => {
    expect(includeRegionInViewportPick("camera_bound")).toBe(false);
    expect(includeRegionInViewportPick("player_start")).toBe(true);
    expect(includeRegionInViewportPick("spawn")).toBe(true);
  });
});

