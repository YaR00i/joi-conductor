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

  it("isolates a selection and restores the previous hide set", () => {
    const state = new EditorSceneState();
    state.setHidden("voxel:keep-hidden", true);
    state.isolate(["voxel:lamp"], ["voxel:lamp", "voxel:house", "voxel:keep-hidden"]);
    expect(state.isIsolated()).toBe(true);
    expect(state.getSnapshot()).toMatchObject({
      isolated: true,
      hiddenKeys: ["voxel:house", "voxel:keep-hidden"],
    });
    state.exitIsolate();
    expect(state.isIsolated()).toBe(false);
    expect(state.getSnapshot().hiddenKeys).toEqual(["voxel:keep-hidden"]);
  });

  it("revealAll leaves isolate and shows every object", () => {
    const state = new EditorSceneState();
    state.isolate(["voxel:a"], ["voxel:a", "voxel:b"]);
    state.revealAll();
    expect(state.isIsolated()).toBe(false);
    expect(state.getSnapshot().hiddenKeys).toEqual([]);
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
