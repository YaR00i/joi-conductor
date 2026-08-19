import { describe, expect, it, vi } from "vitest";
import { EditorSceneState } from "./EditorSceneState";

describe("EditorSceneState", () => {
  it("tracks hidden and locked objects without touching a document", () => {
    const state = new EditorSceneState();
    const listener = vi.fn();
    state.subscribe(listener);
    expect(state.toggleHidden("voxel:a")).toBe(true);
    expect(state.toggleLocked("light:b")).toBe(true);
    expect(state.getSnapshot()).toMatchObject({
      revision: 2,
      hiddenKeys: ["voxel:a"],
      lockedKeys: ["light:b"],
    });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not publish no-op changes and prunes deleted objects", () => {
    const state = new EditorSceneState();
    const listener = vi.fn();
    state.subscribe(listener);
    state.setHidden("voxel:a", true);
    state.setHidden("voxel:a", true);
    state.setLocked("region:c", true);
    expect(listener).toHaveBeenCalledTimes(2);
    state.prune(["region:c"]);
    expect(state.getSnapshot()).toMatchObject({
      hiddenKeys: [],
      lockedKeys: ["region:c"],
    });
  });

  it("publishes batch states once", () => {
    const state = new EditorSceneState();
    const listener = vi.fn();
    state.subscribe(listener);
    state.setLockedMany(["voxel:a", "light:b"], true);
    expect(listener).toHaveBeenCalledTimes(1);
    state.prune(["voxel:a"]);
    expect(state.getSnapshot()).toMatchObject({
      lockedKeys: ["voxel:a"],
    });
  });
});
