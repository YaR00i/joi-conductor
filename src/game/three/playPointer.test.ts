import { describe, expect, it } from "vitest";
import {
  accumulatePlayLookMovement,
  isPlayMenuToggleKey,
  isPlayPointerLockTarget,
  playCameraYawFromMovement,
  playCanvasCursor,
  playLookActive,
  playLookKeepsPointerLock,
  playLookWantsPointerLock,
  playPointerDownShouldLock,
  playPointerLockRelockReady,
  playCursorClipCssRect,
  playCursorClipShouldApply,
  playLookTakeMove,
  playLookWarpSkipCount,
} from "./playPointer";

describe("play pointer look", () => {
  it("yaws the camera opposite mouse X and ignores empty deltas", () => {
    expect(playCameraYawFromMovement(10, 0.01)).toBeCloseTo(-0.1);
    expect(playCameraYawFromMovement(0)).toBe(0);
    expect(playCameraYawFromMovement(Number.NaN)).toBe(0);
  });

  it("coalesces pointer events before the render-frame camera update", () => {
    expect(accumulatePlayLookMovement(7, 5)).toBe(12);
    expect(accumulatePlayLookMovement(12, Number.NaN)).toBe(12);
  });

  it("looks unless pause, loot, or finish", () => {
    const ready = {
      paused: false,
      finished: false,
      awaitingLoot: false,
    };
    expect(playLookWantsPointerLock(ready)).toBe(true);
    expect(playLookActive(ready)).toBe(true);
    expect(playLookKeepsPointerLock(ready)).toBe(true);
    expect(playLookWantsPointerLock({ ...ready, paused: true })).toBe(false);
    expect(playLookActive({ ...ready, paused: true })).toBe(false);
    expect(playLookWantsPointerLock({ ...ready, awaitingLoot: true })).toBe(
      false,
    );
  });

  it("hides the cursor while looking, even without pointer lock", () => {
    expect(playCanvasCursor(true)).toBe("none");
    expect(playCanvasCursor(false)).toBe("default");
  });

  it("skips synthetic moves after recentering the cursor", () => {
    expect(playLookWarpSkipCount(true)).toBe(0);
    expect(playLookWarpSkipCount(false)).toBe(2);
    expect(playLookWarpSkipCount(false, false)).toBe(0);
    expect(playLookTakeMove(2)).toEqual({ apply: false, skipRemaining: 1 });
    expect(playLookTakeMove(1)).toEqual({ apply: false, skipRemaining: 0 });
    expect(playLookTakeMove(0)).toEqual({ apply: true, skipRemaining: 0 });
  });

  it("clips the cursor to the play shell while looking and focused", () => {
    expect(playCursorClipShouldApply(true, true)).toBe(true);
    expect(playCursorClipShouldApply(true, false)).toBe(false);
    expect(playCursorClipShouldApply(false, true)).toBe(false);
    expect(
      playCursorClipCssRect({ left: 10.4, top: 20.6, width: 640, height: 360 }),
    ).toEqual({ left: 12, top: 23, width: 636, height: 356 });
    expect(
      playCursorClipCssRect({ left: 0, top: 0, width: 4, height: 4 }),
    ).toBeNull();
  });

  it("blocks re-lock during the Chromium Esc cooldown", () => {
    expect(playPointerLockRelockReady(1000, 2000, 1500)).toBe(false);
    expect(playPointerLockRelockReady(1000, 2500, 1500)).toBe(true);
  });

  it("opens the pause menu on Escape", () => {
    expect(isPlayMenuToggleKey({ code: "Escape", key: "Escape" })).toBe(true);
    expect(isPlayMenuToggleKey({ code: "KeyA", key: "a" })).toBe(false);
  });

  it("locks from world clicks and ignores HUD / buttons", () => {
    expect(playPointerDownShouldLock(true, false)).toBe(true);
    expect(playPointerDownShouldLock(true, true)).toBe(false);
    expect(playPointerDownShouldLock(false, false)).toBe(false);
  });

  it("counts lock on the canvas, stage, or play shell", () => {
    const canvas = { id: "canvas" };
    const stage = { id: "stage" };
    const shell = { id: "shell" };
    expect(isPlayPointerLockTarget(canvas, canvas, stage, shell)).toBe(true);
    expect(isPlayPointerLockTarget(stage, canvas, stage, shell)).toBe(true);
    expect(isPlayPointerLockTarget(shell, canvas, stage, shell)).toBe(true);
    expect(isPlayPointerLockTarget(null, canvas, stage, shell)).toBe(false);
    expect(isPlayPointerLockTarget({ id: "other" }, canvas, stage, shell)).toBe(
      false,
    );
  });
});
