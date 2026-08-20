import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createEditorReflectionScheduler } from "./editorReflectionScheduler";

describe("editor reflection scheduler", () => {
  it("updates edits immediately and throttles animation-only frames", () => {
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 1000);
    camera.position.set(10, 20, 30);
    camera.updateMatrixWorld(true);
    const scheduler = createEditorReflectionScheduler(100);

    scheduler.beginFrame();
    expect(scheduler.trackCamera(camera)).toBe(true);
    expect(scheduler.shouldRender(0)).toBe(true);
    scheduler.markRendered(0);
    expect(scheduler.snapshot(0).updatedThisFrame).toBe(true);

    scheduler.beginFrame();
    expect(scheduler.trackCamera(camera)).toBe(false);
    scheduler.markAnimationDirty();
    expect(scheduler.shouldRender(50)).toBe(false);
    expect(scheduler.shouldRender(100)).toBe(true);
    scheduler.markRendered(100);

    scheduler.beginFrame();
    camera.position.x += 1;
    camera.updateMatrixWorld(true);
    expect(scheduler.trackCamera(camera)).toBe(true);
    expect(scheduler.shouldRender(101)).toBe(true);
  });

  it("invalidates explicitly after a scene edit", () => {
    const scheduler = createEditorReflectionScheduler();
    scheduler.markRendered(10);
    scheduler.beginFrame();
    expect(scheduler.shouldRender(11)).toBe(false);
    scheduler.markSceneDirty();
    expect(scheduler.shouldRender(11)).toBe(true);
  });
});
